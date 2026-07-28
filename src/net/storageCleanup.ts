// Browser-storage cleanup must be deliberately narrow. Local Farm, profiles,
// preferences, and the online command queue all share the `zf2r.*` namespace, so
// treating every unknown key as obsolete can erase unrelated live data at import
// time before its owner has a chance to migrate or read it.
export const RETIRED_ONLINE_PREFIXES = [
  "zf2r.session.v1",
  "zf2r.econ.outbox.v1",
  "zf2r.farm.outbox.v1",
  "zf2r.inv.outbox.v1",
  "zf2r.object.outbox.v1",
  "zf2r.quest.outbox.v1",
  "zf2r.raid.outbox.v1",
  "zf2r.roster.outbox.v1",
  "zf2r.shop.outbox.v1",
] as const;

export function purgeRetiredOnlineStorage(storage?: Storage): void {
  try {
    const target = storage ?? localStorage;
    for (let index = target.length - 1; index >= 0; index--) {
      const key = target.key(index);
      if (key && RETIRED_ONLINE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        target.removeItem(key);
      }
    }
  } catch {
    /* storage may be unavailable in privacy mode */
  }
}
