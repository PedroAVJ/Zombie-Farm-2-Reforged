import type { SaveGame } from "../save/schema";
import { listProfiles } from "../save/profiles";

const CONNECTION_KEY = "zf2r.personal-cloud.connection.v1";
const DEVICE_KEY = "zf2r.personal-cloud.device.v1";
const SESSION_KEY = "zf2r.personal-cloud.session.v1";
const WRITER_KEY = "zf2r.personal-cloud.writer.v1";
const PAIRING_PARAM = "personal-cloud";
const SAVE_DELAY_MS = 750;
const RETRY_MS = 10_000;
const HEARTBEAT_MS = 60_000;
const INSTALL_COOKIE = "zf2r_personal_cloud_install";

type Connection = { token: string; profileId: string };
type WriterCredential = { token: string; generation: number; leaseUntil: number };

type ApiPayload = Record<string, unknown>;

export type PersonalCloudOpen = {
  status: "writer";
  save: SaveGame | null;
  revision: number;
  updatedAt: number;
};

export type PersonalCloudBlocked = {
  status: "other";
  save: SaveGame | null;
  revision: number;
  updatedAt: number;
  writerLabel: string;
};

export type PersonalCloudUiStatus = {
  linked: boolean;
  active: boolean;
  profileName?: string;
  lastSyncedAt?: number;
  message?: string;
};

export class PersonalCloudError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "PersonalCloudError";
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function storageGet<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}

function storageSet(storage: Storage, key: string, value: unknown): void {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* device storage is optional */ }
}

function connection(): Connection | null {
  const value = storageGet<Connection>(localStorage, CONNECTION_KEY);
  return value && validPairingToken(value.token) && typeof value.profileId === "string" ? value : null;
}

function activeProfile() {
  const index = listProfiles();
  return index.profiles.find((profile) => profile.id === index.activeId) ?? index.profiles[0];
}

function stableId(storage: Storage, key: string): string {
  let value: string | null = null;
  try { value = storage.getItem(key); } catch { /* create an in-memory id below */ }
  if (value) return value;
  value = randomId();
  try { storage.setItem(key, value); } catch { /* the current page can still use it */ }
  return value;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/i.test(ua)) return "Android device";
  if (/Mac/i.test(navigator.platform)) return "Mac";
  if (/Win/i.test(navigator.platform)) return "Windows PC";
  return "Web browser";
}

function endpoint(): string {
  return new URL("api/personal-cloud", new URL(import.meta.env.BASE_URL, location.href)).toString();
}

function standaloneApp(): boolean {
  return matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function appleMobileBrowser(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function installCookie(value: string, maxAge: number): void {
  const path = new URL(import.meta.env.BASE_URL, location.href).pathname;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${INSTALL_COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=${path}; SameSite=Strict${secure}`;
}

function readInstallCookie(): string | null {
  const prefix = `${INSTALL_COOKIE}=`;
  const pair = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  return pair ? decodeURIComponent(pair.slice(prefix.length)) : null;
}

async function readJson(response: Response): Promise<ApiPayload> {
  try { return await response.json() as ApiPayload; }
  catch { return {}; }
}

export function validPairingToken(value: string): boolean {
  return /^zfpc_[A-Za-z0-9_-]{32,128}$/.test(value);
}

export function personalCloudTokenFromText(value: string, base = location.href): string | null {
  const trimmed = value.trim();
  if (validPairingToken(trimmed)) return trimmed;
  try {
    const link = new URL(trimmed, base);
    const params = new URLSearchParams(link.hash.replace(/^#/, ""));
    const token = params.get(PAIRING_PARAM) ?? "";
    return validPairingToken(token) ? token : null;
  } catch { return null; }
}

export function reconnectPersonalCloudFromText(value: string): boolean {
  const token = personalCloudTokenFromText(value);
  if (!token) return false;
  const profile = activeProfile();
  storageSet(localStorage, CONNECTION_KEY, { token, profileId: profile.id } satisfies Connection);
  try { sessionStorage.removeItem(WRITER_KEY); } catch { /* ignore */ }
  return true;
}

/** A fragment is never sent in the HTTP request. Capture it locally, bind this
 * device's currently-active profile, then erase it from the address bar. */
export function capturePersonalCloudPairingLink(): boolean {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const token = params.get(PAIRING_PARAM) ?? "";
  if (!validPairingToken(token)) return false;
  const profile = activeProfile();
  storageSet(localStorage, CONNECTION_KEY, { token, profileId: profile.id } satisfies Connection);
  try { sessionStorage.removeItem(WRITER_KEY); } catch { /* ignore */ }
  params.delete(PAIRING_PARAM);
  const suffix = params.toString();
  history.replaceState(history.state, "", `${location.pathname}${location.search}${suffix ? `#${suffix}` : ""}`);
  return true;
}

/** iOS intentionally gives an installed Home Screen web app fresh local storage.
 * Safari does copy first-party cookies at install time, so exchange a short-lived,
 * single-use ticket for a device access key on the standalone app's first launch. */
export async function capturePersonalCloudHomeScreenTicket(): Promise<boolean> {
  if (!standaloneApp() || connection()) return false;
  const ticket = readInstallCookie();
  if (!ticket || !/^zfpi_[A-Za-z0-9_-]{32,128}$/.test(ticket)) return false;
  try {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "exchange-install-ticket", ticket, label: deviceLabel() }),
      cache: "no-store",
      credentials: "omit",
    });
    const data = await readJson(response);
    const token = typeof data.accessToken === "string" ? data.accessToken : "";
    if (!response.ok || !validPairingToken(token)) return false;
    const profile = activeProfile();
    storageSet(localStorage, CONNECTION_KEY, { token, profileId: profile.id } satisfies Connection);
    installCookie("", 0);
    return true;
  } catch { return false; }
}

export function personalCloudConnectionStatus(): PersonalCloudUiStatus {
  const linked = connection();
  if (!linked) return { linked: false, active: false };
  const index = listProfiles();
  const profile = index.profiles.find((item) => item.id === linked.profileId);
  return {
    linked: true,
    active: linked.profileId === index.activeId,
    profileName: profile?.name ?? "a deleted Local Farm profile",
    ...(!profile ? { message: "The linked Local Farm profile no longer exists on this device." } : {}),
  };
}

export function personalCloudForActiveProfile(): PersonalCloudClient | null {
  const linked = connection();
  if (!linked || linked.profileId !== listProfiles().activeId) return null;
  return new PersonalCloudClient(linked);
}

export function disconnectPersonalCloudLocally(): void {
  try {
    localStorage.removeItem(CONNECTION_KEY);
    sessionStorage.removeItem(WRITER_KEY);
  } catch { /* ignore */ }
}

export function personalCloudPairingUrl(): string | null {
  const linked = connection();
  if (!linked) return null;
  const base = new URL(import.meta.env.BASE_URL, location.href);
  base.hash = `${PAIRING_PARAM}=${encodeURIComponent(linked.token)}`;
  return base.toString();
}

export class PersonalCloudClient {
  private readonly clientId = stableId(localStorage, DEVICE_KEY);
  private readonly sessionId = stableId(sessionStorage, SESSION_KEY);
  private credential: WriterCredential | null = storageGet(sessionStorage, WRITER_KEY);
  private saveTimer = 0;
  private retryTimer = 0;
  private heartbeatTimer = 0;
  private pendingSave: SaveGame | null = null;
  private saving = false;
  private stopped = false;
  private revision = 0;
  private active = false;
  private lastSyncedAt = 0;
  private message = "";
  onWriterLost: ((writerLabel?: string) => void) | null = null;

  constructor(private readonly linked: Connection) {}

  private requestBody(extra: ApiPayload): ApiPayload {
    return {
      clientId: this.clientId,
      sessionId: this.sessionId,
      label: deviceLabel(),
      ...(this.credential ? {
        writerToken: this.credential.token,
        generation: this.credential.generation,
      } : {}),
      ...extra,
    };
  }

  private async request(extra: ApiPayload, keepalive = false): Promise<{ response: Response; data: ApiPayload }> {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.linked.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(this.requestBody(extra)),
      cache: "no-store",
      credentials: "omit",
      keepalive,
    });
    return { response, data: await readJson(response) };
  }

  private rememberWriter(data: ApiPayload): void {
    const token = typeof data.writerToken === "string" ? data.writerToken : "";
    const generation = typeof data.generation === "number" ? data.generation : 0;
    const leaseUntil = typeof data.leaseUntil === "number" ? data.leaseUntil : 0;
    if (!token || !generation) throw new PersonalCloudError("bad_cloud_response", 502);
    this.credential = { token, generation, leaseUntil };
    storageSet(sessionStorage, WRITER_KEY, this.credential);
    this.active = true;
    this.stopped = false;
    this.message = "";
  }

  async open(takeover = false): Promise<PersonalCloudOpen | PersonalCloudBlocked> {
    const { response, data } = await this.request({ action: "open", takeover });
    const save = data.save && typeof data.save === "object" ? data.save as SaveGame : null;
    const revision = typeof data.revision === "number" ? data.revision : 0;
    const updatedAt = typeof data.updatedAt === "number" ? data.updatedAt : 0;
    if (response.status === 423 && data.code === "writer_active") {
      const writer = data.writer && typeof data.writer === "object" ? data.writer as ApiPayload : {};
      return {
        status: "other",
        save,
        revision,
        updatedAt,
        writerLabel: typeof writer.label === "string" ? writer.label : "another device",
      };
    }
    if (!response.ok) throw new PersonalCloudError(String(data.code ?? "cloud_unavailable"), response.status);
    this.rememberWriter(data);
    this.revision = revision;
    return { status: "writer", save, revision, updatedAt };
  }

  uiStatus(): PersonalCloudUiStatus {
    const base = personalCloudConnectionStatus();
    return {
      ...base,
      active: base.active && this.active && !this.stopped,
      ...(this.lastSyncedAt ? { lastSyncedAt: this.lastSyncedAt } : {}),
      ...(this.message ? { message: this.message } : {}),
    };
  }

  pairingUrl(): string {
    return personalCloudPairingUrl()!;
  }

  async prepareHomeScreenInstall(): Promise<boolean> {
    if (!appleMobileBrowser() || standaloneApp()) return false;
    try {
      const { response, data } = await this.request({ action: "issue-install-ticket" });
      const ticket = typeof data.ticket === "string" ? data.ticket : "";
      const expiresAt = typeof data.expiresAt === "number" ? data.expiresAt : 0;
      if (!response.ok || !/^zfpi_[A-Za-z0-9_-]{32,128}$/.test(ticket) || expiresAt <= Date.now()) return false;
      installCookie(ticket, Math.max(1, Math.floor((expiresAt - Date.now()) / 1000)));
      return true;
    } catch { return false; }
  }

  private loseWriter(data: ApiPayload): void {
    if (!this.active) return;
    this.active = false;
    this.credential = null;
    this.message = "This device no longer controls the cloud farm.";
    try { sessionStorage.removeItem(WRITER_KEY); } catch { /* ignore */ }
    const writer = data.writer && typeof data.writer === "object" ? data.writer as ApiPayload : {};
    this.onWriterLost?.(typeof writer.label === "string" ? writer.label : undefined);
  }

  private async sendSave(save: SaveGame, keepalive = false): Promise<void> {
    if (!this.active || !this.credential || this.stopped) throw new PersonalCloudError("not_writer", 423);
    const { response, data } = await this.request({ action: "save", revision: this.revision, save }, keepalive);
    if (response.status === 423) this.loseWriter(data);
    if (!response.ok) throw new PersonalCloudError(String(data.code ?? "cloud_unavailable"), response.status);
    this.revision = typeof data.revision === "number" ? data.revision : this.revision;
    this.lastSyncedAt = typeof data.updatedAt === "number" ? data.updatedAt : Date.now();
    this.message = "";
    if (this.credential && typeof data.leaseUntil === "number") {
      this.credential.leaseUntil = data.leaseUntil;
      storageSet(sessionStorage, WRITER_KEY, this.credential);
    }
  }

  async saveNow(save: SaveGame): Promise<void> {
    await this.sendSave(save);
  }

  queueSave(save: SaveGame): void {
    if (!this.active || this.stopped) return;
    this.pendingSave = save;
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = 0;
      void this.pump();
    }, SAVE_DELAY_MS);
  }

  private async pump(): Promise<void> {
    if (this.saving || !this.pendingSave || !this.active || this.stopped) return;
    const save = this.pendingSave;
    this.pendingSave = null;
    this.saving = true;
    try {
      await this.sendSave(save, document.visibilityState === "hidden");
    } catch (error) {
      if (error instanceof PersonalCloudError && error.status === 423) return;
      this.pendingSave ??= save;
      this.message = "Cloud save is waiting for a connection.";
      clearTimeout(this.retryTimer);
      this.retryTimer = window.setTimeout(() => {
        this.retryTimer = 0;
        void this.pump();
      }, RETRY_MS);
    } finally {
      this.saving = false;
      if (this.pendingSave && !this.retryTimer) {
        this.saveTimer = window.setTimeout(() => {
          this.saveTimer = 0;
          void this.pump();
        }, 0);
      }
    }
  }

  async heartbeat(): Promise<void> {
    if (!this.active || !this.credential || this.stopped || document.visibilityState === "hidden") return;
    try {
      const { response, data } = await this.request({ action: "heartbeat" });
      if (response.status === 423) this.loseWriter(data);
      if (!response.ok) throw new PersonalCloudError(String(data.code ?? "cloud_unavailable"), response.status);
      this.revision = typeof data.revision === "number" ? data.revision : this.revision;
      if (this.credential && typeof data.leaseUntil === "number") {
        this.credential.leaseUntil = data.leaseUntil;
        storageSet(sessionStorage, WRITER_KEY, this.credential);
      }
      this.message = "";
    } catch (error) {
      if (!(error instanceof PersonalCloudError) || error.status !== 423) {
        this.message = "Cloud connection is temporarily unavailable.";
      }
    }
  }

  start(): void {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = window.setInterval(() => void this.heartbeat(), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private readonly onVisibility = () => {
    if (document.visibilityState === "visible") void this.heartbeat();
    else void this.pump();
  };

  pause(): void {
    this.stopped = true;
    this.active = false;
    clearTimeout(this.saveTimer);
    clearTimeout(this.retryTimer);
    clearInterval(this.heartbeatTimer);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  async disconnect(): Promise<void> {
    try {
      if (this.credential) await this.request({ action: "release" });
    } catch { /* the local unlink must still succeed while offline */ }
    try { await this.request({ action: "revoke-access" }); }
    catch { /* a leaked/offline server cannot block unlinking this device */ }
    this.pause();
    disconnectPersonalCloudLocally();
  }
}

/** Mandatory writer gate used before the farm becomes interactive and whenever
 * a later heartbeat discovers a takeover. */
export function showPersonalCloudWriterGate(
  writerLabel: string,
  takeOver: () => Promise<boolean>,
): Promise<"taken" | "local"> {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "personal-cloud-gate";
    const panel = document.createElement("div");
    panel.className = "personal-cloud-gate-panel";
    const title = document.createElement("h2");
    title.textContent = "Personal Cloud Farm active elsewhere";
    const copy = document.createElement("p");
    copy.textContent = `This cloud farm is currently controlled by ${writerLabel}. Only one device can save it at a time.`;
    const status = document.createElement("p");
    status.className = "personal-cloud-gate-status";
    const buttons = document.createElement("div");
    buttons.className = "personal-cloud-gate-buttons";
    const local = document.createElement("button");
    local.textContent = "Keep This Device Local";
    local.onclick = () => { bg.remove(); resolve("local"); };
    const take = document.createElement("button");
    take.textContent = "Take Over Here";
    take.onclick = async () => {
      local.disabled = true;
      take.disabled = true;
      take.textContent = "Taking over…";
      status.textContent = "";
      if (await takeOver().catch(() => false)) {
        bg.remove();
        resolve("taken");
        return;
      }
      local.disabled = false;
      take.disabled = false;
      take.textContent = "Try Again";
      status.textContent = "Couldn't reach the cloud. Your farm has not been changed.";
    };
    buttons.append(local, take);
    panel.append(title, copy, status, buttons);
    bg.append(panel);
    document.body.append(bg);
  });
}

/** An install-only access key can become invalid after server-side credential
 * migration. Never silently open an unrelated Local Farm in that case: stop
 * boot and let the player deliberately reconnect or deliberately go local. */
export function showPersonalCloudReconnectGate(
  reconnect: (value: string) => Promise<boolean> | boolean,
): Promise<"reconnected" | "local"> {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "personal-cloud-gate personal-cloud-reconnect-gate";
    const panel = document.createElement("div");
    panel.className = "personal-cloud-gate-panel";
    const title = document.createElement("h2");
    title.textContent = "Personal Cloud needs to reconnect";
    const copy = document.createElement("p");
    copy.textContent = "Your phone's old device key expired when Personal Cloud storage was migrated. Your cloud farm and this phone's Local Farm are both still safe.";
    const instructions = document.createElement("p");
    instructions.textContent = "On your Mac, open Settings, choose Copy iPhone Link, then paste that private link below.";
    const label = document.createElement("label");
    label.className = "personal-cloud-reconnect-label";
    label.htmlFor = "personal-cloud-reconnect-input";
    label.textContent = "Private Personal Cloud link";
    const input = document.createElement("input");
    input.id = "personal-cloud-reconnect-input";
    input.className = "personal-cloud-reconnect-input";
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.placeholder = "Paste the private link here";
    const status = document.createElement("p");
    status.className = "personal-cloud-gate-status";
    const buttons = document.createElement("div");
    buttons.className = "personal-cloud-gate-buttons";
    const local = document.createElement("button");
    local.textContent = "Keep This Device Local";
    local.onclick = () => { bg.remove(); resolve("local"); };
    const repair = document.createElement("button");
    repair.textContent = "Reconnect This Device";
    const submit = async () => {
      local.disabled = true;
      repair.disabled = true;
      repair.textContent = "Reconnecting…";
      status.textContent = "";
      if (await Promise.resolve(reconnect(input.value)).catch(() => false)) {
        bg.remove();
        resolve("reconnected");
        return;
      }
      local.disabled = false;
      repair.disabled = false;
      repair.textContent = "Reconnect This Device";
      status.textContent = "That isn't a valid private Personal Cloud link. Copy it again from Settings on your Mac.";
      input.focus();
      input.select();
    };
    repair.onclick = () => void submit();
    input.onkeydown = (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void submit();
    };
    buttons.append(local, repair);
    panel.append(title, copy, instructions, label, input, status, buttons);
    bg.append(panel);
    document.body.append(bg);
    input.focus();
  });
}
