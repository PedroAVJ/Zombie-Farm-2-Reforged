import type { BoostDef } from "../assets";

export interface StorageBoostRow {
  def: BoostDef;
  count: number;
}

/** Storage is a catalog browser as well as an inventory view: retain catalog
 * order and fill absent inventory entries with a visible zero count. */
export function storageBoostRows(
  catalog: readonly BoostDef[],
  inventory: readonly { key: string; count: number }[],
): StorageBoostRow[] {
  const counts = new Map(inventory.map((entry) => [entry.key, Math.max(0, entry.count)]));
  return catalog.map((def) => ({ def, count: counts.get(def.key) ?? 0 }));
}
