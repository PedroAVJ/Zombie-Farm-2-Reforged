import { GameState } from "../GameState";
import { CropConfig, Field } from "../Field";
import { PlaceableDef } from "../assets";
import { WalkController } from "../WalkController";
import { ZombieField } from "../zombie/ZombieField";
import { QuestSystem } from "../quest/QuestSystem";
import {
  SaveGame, SAVE_VERSION, ONLINE_PRESENTATION_PREFIX, ONLINE_SNAPSHOT_PREFIX,
} from "./schema";
import { activeSaveKey, migrateLegacyProfileSaves } from "./profiles";
import * as api from "../net/api";
import { getFarmBackground } from "../prefs";
import { epicBossById } from "../epicBoss/catalog";
import { GAMEPLAY_PROTOCOL } from "../net/protocol";
import { reconcileTutorialCompletion } from "../tutorial/steps";
import type { PlayMode } from "../playMode";
import type { JobSystem } from "../JobSystem";

export type FarmLoadResult =
  | { kind: "local-existing" }
  | { kind: "local-new" }
  | { kind: "local-unavailable"; reason: "storage_unavailable" | "save_unreadable" }
  | { kind: "online-authoritative"; restored: boolean }
  | { kind: "online-cached"; savedAt: number }
  | { kind: "online-unavailable"; reason: string };

type PresentationData = {
  player?: { name?: string; farmer?: { col: number; row: number }; farmerAppearance?: SaveGame["player"]["farmerAppearance"] };
  farm?: {
    climate?: string;
    background?: SaveGame["farm"]["background"];
    zombiePatchGathered?: boolean;
  };
  objectLayout?: { id: string; key?: string; oc: number; or: number; rotation?: number }[];
  rosterLayout?: { id: string; name?: string; pos?: { col: number; row: number }; stored?: boolean; color?: [number, number, number] }[];
  zombiePot?: SaveGame["zombiePot"];
  zombiePots?: SaveGame["zombiePots"];
  tutorial?: SaveGame["tutorial"];
  ui?: { attackOrder?: string[] };
};

/** Offline builds retain a local full save. Signed-in v3 builds persist only visual
 * presentation; authoritative gameplay is hydrated from the shared bootstrap call. */
export class SaveManager {
  /** Background from the latest hydrated save. Main applies this only for the
   * player's own farm, so visiting never overwrites device preferences. */
  loadedFarmBackground: SaveGame["farm"]["background"];
  private presentationVersion = 0;
  private lastPresentation = "";
  private presentationDirty = false;
  private pushing = false;
  private pendingPresentation: Record<string, unknown> | null = null;
  private pendingPresentationImmediate = false;
  private autoFlush: (() => void) | null = null;
  private scheduleSave: (() => void) | null = null;
  private lastPresentationCallAt = 0;
  private suspended = false;
  private onlineWritable = false;
  private readonly localKey: string | null;
  onStorageError: ((message: string) => void) | null = null;

  constructor(
    private state: GameState,
    private field: Field,
    private walk: WalkController,
    private zombies: ZombieField,
    private quests: QuestSystem,
    private catalog: Map<string, CropConfig>,
    private placeCatalog: Map<string, PlaceableDef>,
    private preload: (sprite: string) => Promise<unknown>,
    private readonly mode: PlayMode = "local",
    private readonly jobs?: JobSystem,
  ) {
    if (mode === "local") {
      migrateLegacyProfileSaves();
      this.localKey = activeSaveKey();
    } else {
      this.localKey = null;
    }
  }

  private isOnline(): boolean { return this.mode === "online" && api.isConfigured() && !!api.getSession(); }
  private cacheKey(): string {
    const session = api.getSession();
    if (this.mode === "local") return this.localKey!;
    return `${ONLINE_PRESENTATION_PREFIX}::${session?.accountId ?? "unavailable"}`;
  }
  private snapshotKey(): string | null {
    const session = api.getSession();
    return this.mode === "online" && session
      ? `${ONLINE_SNAPSHOT_PREFIX}::${session.accountId}`
      : null;
  }

  hasSave(): boolean {
    try { return localStorage.getItem(this.cacheKey()) !== null; } catch { return false; }
  }

  serialize(): SaveGame {
    const farmJobs = this.mode === "local" ? this.jobs?.serializePending() : undefined;
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      player: {
        name: this.state.name,
        gold: this.state.gold,
        brains: this.state.brains,
        xp: this.state.xp,
        zombieMax: this.state.zombieMax,
        zombieCount: this.state.zombieCount,
        farmer: this.walk.tile,
        unlockedAbilities: this.state.unlockedAbilities,
        zombiePotBought: this.state.zombiePotBought,
        farmerAppearance: {
          ownedHeads: this.state.ownedFarmerHeads,
          ownedBodies: this.state.ownedFarmerBodies,
          headId: this.state.farmerHeadId,
          bodyId: this.state.farmerBodyId,
        },
        petCollection: { owned: this.state.ownedPets, active: this.state.activePet, pen: this.state.penPets },
      },
      farm: {
        fieldId: "default",
        w: this.field.w,
        h: this.field.h,
        climate: this.field.climate,
        background: getFarmBackground(),
        ownedClimates: this.state.ownedClimates,
        plots: this.field.serialize(),
        zombiePatchGathered: this.zombies.isGathered,
      },
      objects: this.field.serializeObjects(),
      ownedZombies: this.zombies.serialize(),
      zombiePots: this.zombies.serializePots(),
      storage: { itemCap: this.state.storageItemCap, items: this.state.storedItems, received: this.state.received },
      boosts: this.state.boostInv,
      quests: this.quests.serialize(),
      raids: { completed: this.state.raidsCompleted, lastRaidAt: this.state.lastRaidAt, attackOrder: this.state.raidAttackOrder },
      epicBoss: this.state.epicBossRun ?? undefined,
      social: { friends: this.state.friends },
      tutorial: this.state.tutorial,
      ...(farmJobs ? { farmJobs } : {}),
    };
  }

  private presentation(blob = this.serialize()): Record<string, unknown> {
    return {
      player: {
        name: blob.player.name,
        farmer: blob.player.farmer,
        farmerAppearance: {
          headId: blob.player.farmerAppearance?.headId,
          bodyId: blob.player.farmerAppearance?.bodyId,
        },
      },
      farm: {
        climate: blob.farm.climate,
        background: blob.farm.background,
        zombiePatchGathered: blob.farm.zombiePatchGathered,
      },
      // The free starter shed is presentation-only, so its key must travel with
      // its layout or it cannot be reconstructed after a signed-in refresh.
      objectLayout: (blob.objects ?? []).map((o) => ({ id: o.id,
        ...(o.key === "storage01" ? { key: o.key } : {}),
        oc: o.oc, or: o.or, rotation: o.rotation })),
      rosterLayout: (blob.ownedZombies ?? []).map((u) => ({ id: u.id, name: u.name, pos: u.pos, stored: u.stored, color: u.color })),
      zombiePots: blob.zombiePots,
      tutorial: blob.tutorial,
      ui: { attackOrder: blob.raids?.attackOrder ?? [] },
    };
  }

  flush(): void { this.autoFlush ? this.autoFlush() : this.save(); }
  /** Persist state that must survive an immediate reload (currently Zombie Pot jobs). */
  flushCritical(): void {
    if (this.suspended) return;
    const blob = this.serialize();
    if (this.mode === "local") { this.writeLocal(blob); return; }
    if (!this.isOnline()) return;
    const data = this.presentation(blob);
    try { localStorage.setItem(this.cacheKey(), JSON.stringify(data)); } catch { /* ignore */ }
    if (this.pushing) this.pendingPresentationImmediate = true;
    void this.push(data);
  }
  suspend(): void { this.suspended = true; }
  setOnlineWritable(value: boolean): void {
    this.onlineWritable = value;
    if (value && this.presentationDirty) void this.push(this.presentation());
  }
  syncRev(_rev: number): void {}

  save(): void {
    if (this.suspended) return;
    const blob = this.serialize();
    if (this.mode === "local") {
      this.writeLocal(blob);
      return;
    }
    if (!this.isOnline()) return;
    // Gameplay code calls save() at many semantic boundaries. In v3 those calls only
    // mark presentation dirty; they must not bypass the fixed one-minute deadline.
    if (this.scheduleSave) {
      this.scheduleSave();
      return;
    }
    this.commitPresentation(blob);
  }

  private commitPresentation(blob = this.serialize()): void {
    if (this.suspended || !this.isOnline()) return;
    const data = this.presentation(blob);
    const encoded = JSON.stringify(data);
    if (encoded === this.lastPresentation && !this.presentationDirty) return;
    this.presentationDirty = true;
    try { localStorage.setItem(this.cacheKey(), encoded); } catch { /* ignore */ }
    void this.push(data);
  }

  private writeLocal(blob: SaveGame): void {
    const key = this.cacheKey();
    const temporary = `${key}.tmp`;
    const backup = `${key}.backup`;
    try {
      const encoded = JSON.stringify(blob);
      localStorage.setItem(temporary, encoded);
      JSON.parse(localStorage.getItem(temporary) ?? "");
      const current = localStorage.getItem(key);
      if (current !== null) localStorage.setItem(backup, current);
      localStorage.setItem(key, encoded);
      localStorage.removeItem(temporary);
    } catch (error) {
      console.warn("[save] local write failed", error);
      this.onStorageError?.("Local Farm could not be saved. Check browser storage or export a backup.");
    }
  }

  private async push(data: Record<string, unknown>): Promise<void> {
    if (this.isOnline() && !this.onlineWritable) {
      this.presentationDirty = true;
      this.pendingPresentation = data;
      return;
    }
    if (this.pushing) { this.pendingPresentation = data; return; }
    this.pushing = true;
    this.lastPresentationCallAt = Date.now();
    const encoded = JSON.stringify(data);
    try {
      const saved = await api.putPresentationV3({ protocolVersion: GAMEPLAY_PROTOCOL, expectedVersion: this.presentationVersion, data });
      this.presentationVersion = saved.version;
      this.lastPresentation = encoded;
      this.presentationDirty = false;
    } catch (error) {
      this.presentationDirty = true;
      if (error instanceof api.ApiError && error.status === 409) {
        console.warn("[presentation] conflict; reconciling with server");
        try {
          const boot = await api.bootstrap(true);
          this.presentationVersion = boot.presentation.version;
          const authoritative = JSON.stringify(boot.presentation.data);
          if (authoritative === encoded) {
            // The original PUT committed but its response was lost. Adopt the version
            // returned by bootstrap instead of retrying the already-saved projection.
            this.lastPresentation = encoded;
            this.presentationDirty = false;
          } else {
            // A genuinely newer projection won the CAS. Rebase this write onto its
            // version; preserve any newer local presentation queued while we fetched.
            this.pendingPresentation ??= data;
            this.pendingPresentationImmediate = true;
          }
        } catch (recoveryError) {
          console.warn("[presentation] conflict recovery failed", recoveryError);
        }
      }
    } finally {
      this.pushing = false;
      const next = this.pendingPresentation;
      this.pendingPresentation = null;
      if (next) {
        this.presentationDirty = true;
        if (this.pendingPresentationImmediate) {
          this.pendingPresentationImmediate = false;
          void this.push(next);
        } else this.scheduleSave?.();
      }
    }
  }

  async load(): Promise<FarmLoadResult> {
    if (this.mode === "online") {
      if (!this.isOnline()) return { kind: "online-unavailable", reason: "not_configured" };
      try {
        const boot = await api.bootstrap();
        this.presentationVersion = boot.presentation.version;
        this.lastPresentation = JSON.stringify(boot.presentation.data);
        const snapshot = this.fromBootstrap(boot);
        await this.applySave(snapshot);
        try { localStorage.setItem(this.cacheKey(), this.lastPresentation); } catch { /* ignore */ }
        this.writeOnlineSnapshot(snapshot);
        const restored = Object.keys(boot.gameplay.farm.plots).length > 0 ||
          boot.gameplay.objects.objects.length > 0 || boot.gameplay.roster.length > 0;
        return { kind: "online-authoritative", restored };
      } catch (error) {
        console.warn("[bootstrap] authoritative load failed; trying cached snapshot", error);
        const cached = await this.loadOnlineSnapshot();
        return cached ?? {
          kind: "online-unavailable",
          reason: error instanceof api.ApiError ? error.code : "error",
        };
      }
    }
    return this.loadLocal();
  }

  private writeOnlineSnapshot(snapshot: SaveGame): void {
    const key = this.snapshotKey();
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(snapshot)); } catch { /* read-only cache is optional */ }
  }

  /** Refresh the disconnected-view snapshot only after the economy client confirms
   * there are no optimistic commands layered over the authoritative projection. */
  cacheAuthoritativeSnapshot(serverTime = Date.now()): void {
    if (this.mode !== "online" || !this.isOnline()) return;
    const snapshot = this.serialize();
    snapshot.savedAt = serverTime;
    this.writeOnlineSnapshot(snapshot);
  }

  private async loadOnlineSnapshot(): Promise<FarmLoadResult | null> {
    const key = this.snapshotKey();
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const snapshot = JSON.parse(raw) as SaveGame;
      if (snapshot.version !== SAVE_VERSION) return null;
      await this.applySave(snapshot);
      return { kind: "online-cached", savedAt: snapshot.savedAt };
    } catch {
      return null;
    }
  }

  private fromBootstrap(boot: Awaited<ReturnType<typeof api.bootstrap>>): SaveGame {
    const p = boot.presentation.data as PresentationData;
    const objectLayout = new Map((p.objectLayout ?? []).map((o) => [o.id, o]));
    const rosterLayout = new Map((p.rosterLayout ?? []).map((u) => [u.id, u]));
    const plots = Object.entries(boot.gameplay.farm.plots).map(([key, plot]) => {
      const [oc, or] = key.split(":").map(Number);
      if (plot.state === "plowed") return { oc, or, state: "plowed" as const };
      if (plot.state === "spent") return { oc, or, state: plot.zombie ? "hole" as const : "dirt" as const };
      return { oc, or, state: "planted" as const, crop: {
        key: plot.cropKey, isZombie: plot.zombie, plantedAt: plot.plantedAt,
        growMs: plot.growMs, fertilized: plot.fertilized,
      } };
    });
    const objects = boot.gameplay.objects.objects.flatMap((obj) => {
      if (obj.status !== "placed") return [];
      const layout = objectLayout.get(obj.instanceId);
      return [{ id: obj.instanceId, key: obj.catalogKey, oc: layout?.oc ?? 0, or: layout?.or ?? 0,
        rotation: layout?.rotation, readyAt: obj.readyAt }];
    });
    for (const layout of objectLayout.values()) {
      if (layout.key === "storage01" && !objects.some((object) => object.id === layout.id)) {
        objects.push({ id: layout.id, key: layout.key, oc: layout.oc, or: layout.or,
          rotation: layout.rotation, readyAt: undefined });
      }
    }
    const pots = Object.fromEntries(Object.entries(p.zombiePots ?? {}).filter(([, pot]) =>
      !!pot?.parentAId && !!pot.parentBId
    ));
    const pot = p.zombiePot?.parentAId && p.zombiePot.parentBId ? p.zombiePot : undefined;
    const hiddenPotParents = new Set(
      [...Object.values(pots), ...(pot ? [pot] : [])].flatMap((job) =>
        job.parentAId && job.parentBId ? [job.parentAId, job.parentBId] : []
      )
    );
    const roster = boot.gameplay.roster.filter((unit) => !hiddenPotParents.has(unit.id)).map((unit) => {
      const layout = rosterLayout.get(unit.id);
      return { id: unit.id, key: unit.key, name: layout?.name, mutation: unit.mutation, invasions: unit.invasions,
        stored: unit.stored, pos: layout?.pos, color: layout?.color };
    });
    return {
      version: SAVE_VERSION,
      savedAt: boot.serverTime,
      player: {
        name: p.player?.name ?? "Zombie Farmer",
        ...boot.gameplay.balance,
        zombieMax: boot.gameplay.zombieMax,
        zombieCount: roster.filter((u) => !u.stored).length,
        zombiePotBought: boot.gameplay.zombiePotBought,
        farmer: p.player?.farmer,
        farmerAppearance: {
          ...p.player?.farmerAppearance,
          ownedHeads: boot.gameplay.farmerHeads,
          headId: boot.gameplay.farmerHeadId,
        },
        petCollection: { owned: boot.gameplay.ownedPets, active: boot.gameplay.activePet, pen: boot.gameplay.penPets },
      },
      farm: { fieldId: "default", w: boot.gameplay.farmSize, h: boot.gameplay.farmSize,
        climate: p.farm?.climate ?? "grass", background: p.farm?.background,
        ownedClimates: boot.gameplay.climates, plots,
        zombiePatchGathered: p.farm?.zombiePatchGathered },
      objects,
      ownedZombies: roster,
      zombiePots: Object.keys(pots).length ? pots : undefined,
      zombiePot: Object.keys(pots).length ? undefined : pot,
      storage: {
        itemCap: 8,
        items: Object.entries(boot.gameplay.storage.stored).map(([key, count]) => ({ key, count })),
        received: Object.entries(boot.gameplay.storage.received).flatMap(([key, count]) => Array(count).fill(key)),
      },
      boosts: Object.entries(boot.gameplay.inventory).map(([key, count]) => ({ key, count })),
      quests: { active: boot.gameplay.quests.progress.map((q) => ({ id: q.questId, counts: q.counts })), completed: boot.gameplay.quests.completed },
      raids: { completed: boot.gameplay.raids.progress, lastRaidAt: boot.gameplay.raids.lastRaidAt, attackOrder: p.ui?.attackOrder ?? [] },
      epicBoss: boot.gameplay.epicBoss ?? undefined,
      social: { friends: boot.social.friends.map((friend) => ({ id: friend.accountId, name: friend.name, addedAt: boot.serverTime, giftsSent: 0 })) },
      tutorial: reconcileTutorialCompletion(p.tutorial, boot.gameplay.tutorialRewarded),
    };
  }

  private async loadLocal(): Promise<FarmLoadResult> {
    const key = this.cacheKey();
    let values: (string | null)[];
    try { values = [localStorage.getItem(key), localStorage.getItem(`${key}.backup`)]; }
    catch { return { kind: "local-unavailable", reason: "storage_unavailable" }; }
    if (!values.some((value) => value !== null)) return { kind: "local-new" };
    for (let index = 0; index < values.length; index++) {
      const raw = values[index];
      if (!raw) continue;
      try {
        const data = JSON.parse(raw) as SaveGame;
        if (data.version !== SAVE_VERSION || !data.player || !data.farm) continue;
        await this.applySave(data);
        if (index === 1) {
          try { localStorage.removeItem(key); } catch { /* keep backup usable */ }
          this.writeLocal(data);
          this.onStorageError?.("The latest Local Farm save was damaged. The previous backup was restored.");
        }
        return { kind: "local-existing" };
      } catch (error) {
        console.warn(`[save] could not restore Local Farm ${index === 0 ? "primary" : "backup"}`, error);
        // Stored bytes are not the same as a new farm. Keep both copies intact
        // and let startup offer recovery instead of overwriting them.
      }
    }
    return { kind: "local-unavailable", reason: "save_unreadable" };
  }

  private async applySave(data: SaveGame): Promise<void> {
    this.loadedFarmBackground = data.farm.background;
    const player = data.player;
    this.state.apply({ name: player.name, gold: player.gold, brains: player.brains, xp: player.xp,
      zombieCount: player.zombieCount, zombieMax: Math.max(16, player.zombieMax || 16) });
    this.state.unlockedAbilities = player.unlockedAbilities ?? [];
    this.state.zombiePotBought = player.zombiePotBought ?? false;
    this.state.ownedFarmerHeads = player.farmerAppearance?.ownedHeads ?? [];
    this.state.ownedFarmerBodies = player.farmerAppearance?.ownedBodies ?? [];
    this.state.farmerHeadId = player.farmerAppearance?.headId ?? 1;
    this.state.farmerBodyId = player.farmerAppearance?.bodyId ?? 0;
    const legacyPets = data.storage?.pets ?? [];
    this.state.syncPetOwnership(
      player.petCollection?.owned ?? legacyPets,
      player.petCollection?.active ?? legacyPets[0] ?? null,
      player.petCollection?.pen ?? [],
    );
    if (data.storage) {
      this.state.storageItemCap = data.storage.itemCap ?? 8;
      this.state.storedItems = data.storage.items ?? [];
      this.state.received = data.storage.received ?? [];
    }
    this.state.boostInv = data.boosts ?? [];
    this.state.raidsCompleted = data.raids?.completed ?? {};
    this.state.lastRaidAt = data.raids?.lastRaidAt ?? 0;
    this.state.raidAttackOrder = data.raids?.attackOrder ?? [];
    this.state.epicBossRun = data.epicBoss ? { ...data.epicBoss, attackOrder: [...data.epicBoss.attackOrder] } : null;
    this.state.friends = (data.social?.friends ?? []).map((friend) => ({ ...friend, giftsSent: friend.giftsSent ?? 0 }));
    this.state.tutorial = data.tutorial;
    if (data.farm.w && data.farm.h) this.field.resize(data.farm.w, data.farm.h);
    this.state.ownedClimates = data.farm.ownedClimates ?? ["grass"];
    if (!this.state.ownedClimates.includes("grass")) this.state.ownedClimates.unshift("grass");
    this.field.setClimate(data.farm.climate ?? "grass");
    this.field.restore(data.farm.plots, (key) => this.catalog.get(key));
    const objects = data.objects ?? [];
    await Promise.all(objects.flatMap((object) => {
      const def = this.placeCatalog.get(object.key);
      if (!def) return [];
      return [this.preload(def.sprite), ...(def.growingSprite ? [this.preload(def.growingSprite)] : [])];
    }));
    this.field.restoreObjects(objects, (key) => this.placeCatalog.get(key));
    this.zombies.restore(data.ownedZombies ?? []);
    this.zombies.restoreGathered(data.farm.zombiePatchGathered, this.field.patchRestTiles());
    this.zombies.restorePots(data.zombiePots, data.zombiePot);
    const epicRun = this.state.epicBossRun;
    const epicDef = epicBossById(epicRun?.bossId);
    const epicActive = !!epicRun && !epicRun.completedAt && Date.now() < epicRun.expiresAt;
    this.quests.setEpicBossActive(epicActive, epicActive ? epicDef?.questIds ?? [] : []);
    this.quests.restore(data.quests);
    if (this.mode === "local") this.jobs?.restorePending(data.farmJobs, (key) => this.catalog.get(key));
    if (player.farmer) this.walk.teleport(player.farmer.col, player.farmer.row);
  }

  async hydrateReadOnly(save: SaveGame): Promise<void> { await this.applySave(save); }
  exportLocal(): string | null {
    if (this.mode !== "local") return null;
    try { return localStorage.getItem(this.cacheKey()); } catch { return null; }
  }

  importLocal(raw: string): boolean {
    if (this.mode !== "local") return false;
    try {
      const data = JSON.parse(raw) as SaveGame;
      if (data.version !== SAVE_VERSION || !data.player || !data.farm) return false;
      this.writeLocal(data);
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    const key = this.cacheKey();
    try {
      localStorage.removeItem(key);
      if (this.mode === "local") {
        localStorage.removeItem(`${key}.backup`);
        localStorage.removeItem(`${key}.tmp`);
      }
    } catch { /* ignore */ }
  }

  enableAutosave(localMs = 250, remoteMs = 60_000): void {
    let localTimer = 0;
    let remoteTimer = 0;
    let dirtySince = 0;
    const flushLocal = () => {
      if (this.suspended) return;
      if (this.mode === "online") {
        if (!this.isOnline()) return;
        try { localStorage.setItem(this.cacheKey(), JSON.stringify(this.presentation())); } catch { /* ignore */ }
      } else this.writeLocal(this.serialize());
    };
    const fireRemote = () => { remoteTimer = 0; dirtySince = 0; this.commitPresentation(); };
    const schedule = () => {
      const encoded = JSON.stringify(this.presentation());
      if (this.mode === "online" && encoded === this.lastPresentation) return;
      clearTimeout(localTimer);
      localTimer = window.setTimeout(flushLocal, localMs);
      if (this.mode !== "online" || !this.isOnline()) return;
      if (!dirtySince) dirtySince = Date.now();
      if (!remoteTimer) {
        const sinceDirty = remoteMs - (Date.now() - dirtySince);
        const sinceCall = remoteMs - (Date.now() - this.lastPresentationCallAt);
        remoteTimer = window.setTimeout(fireRemote, Math.max(0, sinceDirty, sinceCall));
      }
    };
    this.scheduleSave = schedule;
    this.autoFlush = () => {
      clearTimeout(localTimer);
      clearTimeout(remoteTimer);
      remoteTimer = 0;
      flushLocal();
      const remaining = remoteMs - (Date.now() - this.lastPresentationCallAt);
      if (remaining <= 0) {
        dirtySince = 0;
        this.commitPresentation();
      } else {
        if (!dirtySince) dirtySince = Date.now();
        remoteTimer = window.setTimeout(fireRemote, remaining);
      }
    };
    this.state.onChange(schedule);
    window.addEventListener("beforeunload", () => this.autoFlush?.());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") this.autoFlush?.(); });
    window.addEventListener("online", () => { if (this.presentationDirty) void this.push(this.presentation()); });
  }
}
