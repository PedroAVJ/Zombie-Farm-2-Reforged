/** Old McZombie is a separate roster reward, not part of the ordinary item-loot roll. */
export const OLD_MC_ZOMBIE_KEY = "ZombieActorOldMcZombie";
export const OLD_MC_ZOMBIE_NAME = "Old McZombie";
export const OLD_MC_ZOMBIE_RAID_ID = 1;
export const OLD_MC_ZOMBIE_DROP_RATE = 1 / 100;

/** A successful Old McDonnell invasion has an independent 1% chance to award the zombie. */
export function dropsOldMcZombie(raidId: number, won: boolean, roll: number): boolean {
  return won &&
    raidId === OLD_MC_ZOMBIE_RAID_ID &&
    Number.isFinite(roll) &&
    roll >= 0 &&
    roll < OLD_MC_ZOMBIE_DROP_RATE;
}
