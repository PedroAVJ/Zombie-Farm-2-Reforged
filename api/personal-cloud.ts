import {
  BlobError,
  BlobPreconditionFailedError,
  get,
  put,
} from "@vercel/blob";
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

const STATE_PATH = "personal-cloud/farm.json";
const LEASE_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 1_500_000;
const MAX_RETRIES = 6;

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
};

type ReadState = { state: CloudState; etag: string };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function authorized(req: VercelRequest): boolean {
  const expected = process.env.PERSONAL_CLOUD_KEY_HASH?.trim();
  const header = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return !!expected && !!token && secureEqual(sha256(token), expected);
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
  if (value.writer === null) return true;
  if (!object(value.writer)) return false;
  const writer = value.writer;
  return typeof writer.clientId === "string" && typeof writer.sessionId === "string" &&
    typeof writer.label === "string" && Number.isSafeInteger(writer.generation) &&
    typeof writer.tokenHash === "string" && typeof writer.lastActivityAt === "number" &&
    typeof writer.leaseUntil === "number";
}

async function readState(): Promise<ReadState | null> {
  const result = await get(STATE_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const decoded = await new Response(result.stream).json() as unknown;
  if (!validState(decoded)) throw new Error("Personal Cloud state is invalid");
  // Private origin reads currently expose the same entity tag as a weak HTTP
  // validator (`W/"..."`), while Blob's conditional write endpoint expects the
  // underlying strong tag (`"..."`). They identify the same stored revision.
  return { state: decoded, etag: result.blob.etag.replace(/^W\//, "") };
}

async function writeState(state: CloudState, etag: string | null): Promise<void> {
  const body = JSON.stringify(state);
  if (etag) {
    await put(STATE_PATH, body, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
      contentType: "application/json",
      ifMatch: etag,
    });
    return;
  }
  await put(STATE_PATH, body, {
    access: "private",
    allowOverwrite: false,
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
    contentType: "application/json",
  });
}

function freshState(): CloudState {
  return { version: 1, revision: 0, updatedAt: Date.now(), save: null, writer: null };
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
  return error instanceof BlobPreconditionFailedError || error instanceof BlobError;
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
      await writeState(next, current?.etag ?? null);
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
      await writeState(next, current.etag);
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
      await writeState(next, current.etag);
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
      await writeState(next, current.etag);
      return json(res, 200, { ok: true, revision: next.revision });
    } catch (error) {
      if (!retryable(error) || attempt === MAX_RETRIES - 1) throw error;
      await retryDelay(attempt);
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed" });
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
    return json(res, 503, { code: "cloud_not_configured" });
  }
  if (!process.env.PERSONAL_CLOUD_KEY_HASH) return json(res, 503, { code: "cloud_auth_not_configured" });
  if (!authorized(req)) return json(res, 401, { code: "bad_cloud_key" });

  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json(res, 413, { code: "save_too_large" });
  const body = object(req.body) ? req.body : {};
  try {
    if (body.action === "open") return await openFarm(body, res);
    if (body.action === "save") return await saveFarm(body, res);
    if (body.action === "heartbeat") return await heartbeat(body, res);
    if (body.action === "status") return await status(body, res);
    if (body.action === "release") return await release(body, res);
    return json(res, 400, { code: "bad_action" });
  } catch (error) {
    console.error("[personal-cloud] request failed", error instanceof Error ? error.message : error);
    return json(res, 503, { code: "cloud_unavailable" });
  }
}
