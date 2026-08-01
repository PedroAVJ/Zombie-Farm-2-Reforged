import { Firestore } from "@google-cloud/firestore";
import { createHash, randomBytes } from "node:crypto";

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(body: unknown): void;
};

const STATE_COLLECTION = "personal-cloud";
const STATE_DOCUMENT = "farm";
const LEASE_MS = 10 * 60 * 1000;
// Firestore documents are limited to 1 MiB. Leave room for the writer, access
// keys, and Firestore's field/index overhead around the serialized game save.
const MAX_BODY_BYTES = 900_000;
const MAX_RETRIES = 6;
const INSTALL_TICKET_MS = 30 * 60 * 1000;
const MAX_ACCESS_KEYS = 12;

type CloudWriter = {
  clientId: string;
  sessionId: string;
  label: string;
  generation: number;
  tokenHash: string;
  lastActivityAt: number;
  leaseUntil: number;
};

type CloudState = {
  version: 1;
  revision: number;
  updatedAt: number;
  save: unknown | null;
  writer: CloudWriter | null;
  accessKeys?: { hash: string; createdAt: number; label: string }[];
  installTicket?: { hash: string; expiresAt: number } | null;
};

type ReadState = { state: CloudState; revision: number };

class StateConflictError extends Error {
  constructor() {
    super("Personal Cloud state changed concurrently");
    this.name = "StateConflictError";
  }
}

let firestoreClient: Firestore | null = null;

function firestore(): Firestore {
  if (firestoreClient) return firestoreClient;
  const projectId = process.env.GCP_PROJECT_ID?.trim();
  const encodedCredentials = process.env.GCP_SERVICE_ACCOUNT_B64?.trim();
  if (!projectId || !encodedCredentials) throw new Error("Google Cloud storage is not configured");

  let credentials: { client_email?: unknown; private_key?: unknown };
  try {
    credentials = JSON.parse(Buffer.from(encodedCredentials, "base64").toString("utf8")) as typeof credentials;
  } catch {
    throw new Error("Google Cloud credentials are invalid");
  }
  if (typeof credentials.client_email !== "string" || typeof credentials.private_key !== "string") {
    throw new Error("Google Cloud credentials are incomplete");
  }

  firestoreClient = new Firestore({
    projectId,
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    ignoreUndefinedProperties: true,
  });
  return firestoreClient;
}

function stateDocument() {
  return firestore().collection(STATE_COLLECTION).doc(STATE_DOCUMENT);
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function bearerToken(req: VercelRequest): string | null {
  const header = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  return header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

async function authorized(req: VercelRequest): Promise<boolean> {
  const expected = process.env.PERSONAL_CLOUD_KEY_HASH?.trim();
  const token = bearerToken(req);
  if (!expected || !token) return false;
  const hash = sha256(token);
  if (secureEqual(hash, expected)) return true;
  const current = await readState();
  return current?.state.accessKeys?.some((key) => secureEqual(key.hash, hash)) ?? false;
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validSave(value: unknown): boolean {
  if (!object(value) || value.version !== 1 || !object(value.player) || !object(value.farm)) return false;
  try { return Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_BODY_BYTES; }
  catch { return false; }
}

function validState(value: unknown): value is CloudState {
  if (!object(value) || value.version !== 1 || !Number.isSafeInteger(value.revision)) return false;
  if (typeof value.updatedAt !== "number" || (value.save !== null && !validSave(value.save))) return false;
  const writer = value.writer;
  const writerValid = writer === null || (object(writer) &&
    typeof writer.clientId === "string" && typeof writer.sessionId === "string" &&
    typeof writer.label === "string" && Number.isSafeInteger(writer.generation) &&
    typeof writer.tokenHash === "string" && typeof writer.lastActivityAt === "number" &&
    typeof writer.leaseUntil === "number");
  const accessValid = value.accessKeys === undefined || (Array.isArray(value.accessKeys) && value.accessKeys.every((key) =>
    object(key) && typeof key.hash === "string" && typeof key.createdAt === "number" && typeof key.label === "string"
  ));
  const ticket = value.installTicket;
  const ticketValid = ticket === undefined || ticket === null ||
    (object(ticket) && typeof ticket.hash === "string" && typeof ticket.expiresAt === "number");
  return writerValid && accessValid && ticketValid;
}

async function readState(): Promise<ReadState | null> {
  const snapshot = await stateDocument().get();
  if (!snapshot.exists) return null;
  const decoded = snapshot.data() as unknown;
  if (!validState(decoded)) throw new Error("Personal Cloud state is invalid");
  return { state: decoded, revision: decoded.revision };
}

async function writeState(state: CloudState, expectedRevision: number | null): Promise<void> {
  const document = stateDocument();
  await firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(document);
    if (expectedRevision === null) {
      if (snapshot.exists) throw new StateConflictError();
    } else {
      const current = snapshot.data() as unknown;
      if (!snapshot.exists || !validState(current) || current.revision !== expectedRevision) {
        throw new StateConflictError();
      }
    }
    transaction.set(document, state);
  });
}

function freshState(): CloudState {
  return {
    version: 1,
    revision: 0,
    updatedAt: Date.now(),
    save: null,
    writer: null,
    accessKeys: [],
    installTicket: null,
  };
}

function text(value: unknown, max = 128): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

function publicWriter(writer: CloudWriter | null, now = Date.now()) {
  if (!writer || writer.leaseUntil <= now) return null;
  return { label: writer.label, lastActivityAt: writer.lastActivityAt, leaseUntil: writer.leaseUntil };
}

function writerMatches(writer: CloudWriter | null, body: Record<string, unknown>): boolean {
  const clientId = text(body.clientId);
  const sessionId = text(body.sessionId);
  const token = text(body.writerToken, 256);
  const generation = body.generation;
  return !!writer && !!clientId && !!sessionId && !!token &&
    writer.clientId === clientId && writer.sessionId === sessionId &&
    writer.generation === generation && secureEqual(writer.tokenHash, sha256(token));
}

function json(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).json(body);
}

function retryable(error: unknown): boolean {
  if (error instanceof StateConflictError) return true;
  if (!object(error)) return false;
  return error.code === 4 || error.code === 10 || error.code === 14 ||
    error.code === "deadline-exceeded" || error.code === "aborted" || error.code === "unavailable";
}

async function retryDelay(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.min(800, 50 * 2 ** attempt)));
}

async function openFarm(body: Record<string, unknown>, res: VercelResponse): Promise<void> {
  const clientId = text(body.clientId);
  const sessionId = text(body.sessionId);
  const label = text(body.label, 80);
  if (!clientId || !sessionId || !label) return json(res, 400, { code: "bad_device" });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await readState();
    const state = current?.state ?? freshState();
    const now = Date.now();
    const activeOther = state.writer && state.writer.leaseUntil > now &&
      state.writer.clientId !== clientId;
    if (activeOther && body.takeover !== true) {
      return json(res, 423, {
        code: "writer_active",
        revision: state.revision,
        updatedAt: state.updatedAt,
        save: state.save,
        writer: publicWriter(state.writer, now),
      });
    }

    const writerToken = randomBytes(32).toString("base64url");
    const writer: CloudWriter = {
      clientId,
      sessionId,
      label,
      generation: (state.writer?.generation ?? 0) + 1,
      tokenHash: sha256(writerToken),
      lastActivityAt: now,
      leaseUntil: now + LEASE_MS,
    };
    const next: CloudState = {
      ...state,
      revision: state.revision + 1,
      updatedAt: now,
      writer,
    };
    try {
      await writeState(next, current?.revision ?? null);
      return json(res, 200, {
        status: "writer",
        revision: next.revision,
        updatedAt: next.updatedAt,
        save: next.save,
        generation: writer.generation,
        writerToken,
        leaseUntil: writer.leaseUntil,
      });
    } catch (error) {
      if (!retryable(error) || attempt === MAX_RETRIES - 1) throw error;
      await retryDelay(attempt);
    }
  }
}

async function saveFarm(body: Record<string, unknown>, res: VercelResponse): Promise<void> {
  if (!validSave(body.save)) return json(res, 422, { code: "bad_save" });
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await readState();
    if (!current) return json(res, 409, { code: "cloud_uninitialized" });
    const now = Date.now();
    if (!writerMatches(current.state.writer, body) || current.state.writer!.leaseUntil <= now) {
      return json(res, 423, {
        code: "writer_replaced",
        revision: current.state.revision,
        updatedAt: current.state.updatedAt,
        writer: publicWriter(current.state.writer, now),
      });
    }
    const writer = { ...current.state.writer!, lastActivityAt: now, leaseUntil: now + LEASE_MS };
    const next: CloudState = {
      ...current.state,
      revision: current.state.revision + 1,
      updatedAt: now,
      save: body.save,
      writer,
    };
    try {
      await writeState(next, current.revision);
      return json(res, 200, {
        ok: true,
        revision: next.revision,
        updatedAt: next.updatedAt,
        leaseUntil: writer.leaseUntil,
      });
    } catch (error) {
      if (!retryable(error) || attempt === MAX_RETRIES - 1) throw error;
      await retryDelay(attempt);
    }
  }
}

async function heartbeat(body: Record<string, unknown>, res: VercelResponse): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await readState();
    if (!current) return json(res, 409, { code: "cloud_uninitialized" });
    const now = Date.now();
    if (!writerMatches(current.state.writer, body) || current.state.writer!.leaseUntil <= now) {
      return json(res, 423, { code: "writer_replaced", writer: publicWriter(current.state.writer, now) });
    }
    const writer = { ...current.state.writer!, lastActivityAt: now, leaseUntil: now + LEASE_MS };
    const next = { ...current.state, revision: current.state.revision + 1, updatedAt: now, writer };
    try {
      await writeState(next, current.revision);
      return json(res, 200, { ok: true, revision: next.revision, leaseUntil: writer.leaseUntil });
    } catch (error) {
      if (!retryable(error) || attempt === MAX_RETRIES - 1) throw error;
      await retryDelay(attempt);
    }
  }
}

async function status(body: Record<string, unknown>, res: VercelResponse): Promise<void> {
  const current = await readState();
  if (!current) return json(res, 200, { status: "none", revision: 0, updatedAt: 0 });
  const now = Date.now();
  const mine = writerMatches(current.state.writer, body) && current.state.writer!.leaseUntil > now;
  return json(res, 200, {
    status: mine ? "mine" : publicWriter(current.state.writer, now) ? "other" : "none",
    revision: current.state.revision,
    updatedAt: current.state.updatedAt,
    writer: mine ? null : publicWriter(current.state.writer, now),
  });
}

async function release(body: Record<string, unknown>, res: VercelResponse): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await readState();
    if (!current || !writerMatches(current.state.writer, body)) return json(res, 200, { ok: true });
    const now = Date.now();
    const next: CloudState = {
      ...current.state,
      revision: current.state.revision + 1,
      updatedAt: now,
      writer: null,
    };
    try {
      await writeState(next, current.revision);
      return json(res, 200, { ok: true, revision: next.revision });
    } catch (error) {
      if (!retryable(error) || attempt === MAX_RETRIES - 1) throw error;
      await retryDelay(attempt);
    }
  }
}

async function issueInstallTicket(res: VercelResponse): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await readState();
    const state = current?.state ?? freshState();
    const now = Date.now();
    const ticket = `zfpi_${randomBytes(32).toString("base64url")}`;
    const next: CloudState = {
      ...state,
      revision: state.revision + 1,
      updatedAt: now,
      installTicket: { hash: sha256(ticket), expiresAt: now + INSTALL_TICKET_MS },
    };
    try {
      await writeState(next, current?.revision ?? null);
      return json(res, 200, { ok: true, ticket, expiresAt: now + INSTALL_TICKET_MS });
    } catch (error) {
      if (!retryable(error) || attempt === MAX_RETRIES - 1) throw error;
      await retryDelay(attempt);
    }
  }
}

async function exchangeInstallTicket(body: Record<string, unknown>, res: VercelResponse): Promise<void> {
  const ticket = text(body.ticket, 256);
  const label = text(body.label, 80) ?? "iPhone Home Screen app";
  if (!ticket || !/^zfpi_[A-Za-z0-9_-]{32,128}$/.test(ticket)) {
    return json(res, 401, { code: "bad_install_ticket" });
  }
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await readState();
    const now = Date.now();
    const stored = current?.state.installTicket;
    if (!current || !stored || stored.expiresAt <= now || !secureEqual(stored.hash, sha256(ticket))) {
      return json(res, 401, { code: "bad_install_ticket" });
    }
    const accessToken = `zfpc_${randomBytes(32).toString("base64url")}`;
    const accessKeys = [
      ...(current.state.accessKeys ?? []).slice(-(MAX_ACCESS_KEYS - 1)),
      { hash: sha256(accessToken), createdAt: now, label },
    ];
    const next: CloudState = {
      ...current.state,
      revision: current.state.revision + 1,
      updatedAt: now,
      accessKeys,
      installTicket: null,
    };
    try {
      await writeState(next, current.revision);
      return json(res, 200, { ok: true, accessToken });
    } catch (error) {
      if (!retryable(error) || attempt === MAX_RETRIES - 1) throw error;
      await retryDelay(attempt);
    }
  }
}

async function revokeAccess(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = bearerToken(req);
  if (!token) return json(res, 200, { ok: true });
  const tokenHash = sha256(token);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await readState();
    if (!current) return json(res, 200, { ok: true });
    const accessKeys = (current.state.accessKeys ?? []).filter((key) => !secureEqual(key.hash, tokenHash));
    if (accessKeys.length === (current.state.accessKeys ?? []).length) return json(res, 200, { ok: true });
    const next: CloudState = {
      ...current.state,
      revision: current.state.revision + 1,
      updatedAt: Date.now(),
      accessKeys,
    };
    try {
      await writeState(next, current.revision);
      return json(res, 200, { ok: true });
    } catch (error) {
      if (!retryable(error) || attempt === MAX_RETRIES - 1) throw error;
      await retryDelay(attempt);
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed" });
  if (!process.env.GCP_PROJECT_ID || !process.env.GCP_SERVICE_ACCOUNT_B64) {
    return json(res, 503, { code: "cloud_not_configured" });
  }
  if (!process.env.PERSONAL_CLOUD_KEY_HASH) return json(res, 503, { code: "cloud_auth_not_configured" });
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json(res, 413, { code: "save_too_large" });
  const body = object(req.body) ? req.body : {};
  try {
    if (body.action === "exchange-install-ticket") return await exchangeInstallTicket(body, res);
    if (!await authorized(req)) return json(res, 401, { code: "bad_cloud_key" });
    if (body.action === "open") return await openFarm(body, res);
    if (body.action === "save") return await saveFarm(body, res);
    if (body.action === "heartbeat") return await heartbeat(body, res);
    if (body.action === "status") return await status(body, res);
    if (body.action === "release") return await release(body, res);
    if (body.action === "issue-install-ticket") return await issueInstallTicket(res);
    if (body.action === "revoke-access") return await revokeAccess(req, res);
    return json(res, 400, { code: "bad_action" });
  } catch (error) {
    console.error("[personal-cloud] request failed", error instanceof Error ? error.message : error);
    return json(res, 503, { code: "cloud_unavailable" });
  }
}
