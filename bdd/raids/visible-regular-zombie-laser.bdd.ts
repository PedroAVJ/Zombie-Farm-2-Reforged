async (page) => {
  await page.goto("http://127.0.0.1:4175/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZF));

  const launched = await page.evaluate(() => {
    const z = window.ZF;
    z.state.xp = 20_000;
    z.state.lastRaidAt = 0;
    z.winRaid(3); // the first Pirates clear unlocks Laser Beam
    const regular = z.spawnMutant("ZombieActorRegularTier3", 0);
    if (!regular) return false;
    regular.data.focus = 100;
    z.giveBoost("concentration", 1);
    return z.hud.onLaunchRaid(
      1,
      [regular.data.id],
      { useVoucher: false, concentration: true, dice: 0 },
    );
  });
  if (!launched) throw new Error("Could not launch the Laser Beam invasion");
  await page.waitForFunction(() => Boolean(window.ZF?.raidScene));

  const before = await page.evaluate(() => {
    const scene = window.ZF.raidScene;
    const player = scene.sim.units.find((unit) => unit.team === "player");
    const enemy = scene.sim.units.find((unit) => unit.team === "enemy" && unit.isBoss)
      ?? scene.sim.units.find((unit) => unit.team === "enemy");
    if (!player || !enemy || !player.abilities.includes("laserBeam")) return null;

    for (const other of scene.sim.units.filter((unit) => unit.team === "enemy" && unit !== enemy)) {
      other.hp = 0;
      other.alive = false;
      other.state = "dead";
    }
    enemy.hp = enemy.maxHp = 100_000;
    enemy.state = "hold";
    enemy.x = 915;
    enemy.y = 360;
    player.state = "advance";
    player.x = 300;
    player.y = 360;
    player.charge = 1;
    player.laserTimerMs = 1;

    window.regularLaserBeamSpawns = 0;
    const spawn = scene.spawnLaserBeam.bind(scene);
    scene.spawnLaserBeam = (...args) => {
      window.regularLaserBeamSpawns += 1;
      return spawn(...args);
    };
    return { enemyId: enemy.id, hp: enemy.hp };
  });
  if (!before) throw new Error("The test Regular zombie did not receive Laser Beam");

  await page.waitForFunction(() => window.regularLaserBeamSpawns > 0);
  const result = await page.evaluate((enemyId) => {
    const scene = window.ZF.raidScene;
    const enemy = scene.sim.units.find((unit) => unit.id === enemyId);
    const beam = scene.laserFx.at(-1)?.g;
    return {
      hp: enemy?.hp,
      visibleBeam: Boolean(beam?.parent && beam.alpha > 0 && beam.getBounds().width > 0),
    };
  }, before.enemyId);
  if (result.hp == null || result.hp >= before.hp) {
    throw new Error(`Laser Beam did not damage the enemy: ${before.hp} -> ${result.hp}`);
  }
  if (!result.visibleBeam) throw new Error("Laser Beam damage landed without a visible beam");
}
