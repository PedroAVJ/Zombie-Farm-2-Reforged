async (page) => {
  await page.goto("http://127.0.0.1:4175/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZF));

  await page.evaluate(() => {
    const z = window.ZF;
    z.state.xp = 3_300; // level 13: the user's reported invasion range
    z.state.lastRaidAt = 0;
    while (z.zombies.roster().length < 16) {
      if (!z.spawnMutant("ZombieActorRegularTier1", 0)) break;
    }
    // Keep the presentation scenario alive; these test-only stats never enter a save.
    for (const unit of z.zombies.units) {
      unit.data.str = 6;
      unit.data.dex = 2;
      unit.data.con = 100;
      unit.data.focus = 100;
    }
    z.giveBoost("concentration", 1);

    const originalFarmUpdate = z.field.update.bind(z.field);
    window.raidFarmVisualUpdates = 0;
    z.field.update = (...args) => {
      window.raidFarmVisualUpdates += 1;
      return originalFarmUpdate(...args);
    };
  });

  const launched = await page.evaluate(() => {
    const z = window.ZF;
    return z.hud.onLaunchRaid(
      1,
      z.zombies.roster().map((unit) => unit.id),
      { useVoucher: false, concentration: true, dice: 0 },
    );
  });
  if (!launched) throw new Error("Could not launch the performance invasion");
  await page.waitForFunction(() => Boolean(window.ZF?.raidScene));

  await page.evaluate(() => {
    const sim = window.ZF.raidScene.sim;
    for (const enemy of sim.units.filter((unit) => unit.team === "enemy")) {
      if (enemy.isBoss) {
        enemy.hp = enemy.maxHp = 100_000;
        enemy.state = "hold";
        enemy.x = 915;
        enemy.y = 360;
      } else {
        enemy.hp = 0;
        enemy.alive = false;
        enemy.state = "dead";
      }
    }
    for (const player of sim.units.filter((unit) => unit.team === "player")) {
      player.state = "advance";
      player.charge = 1;
      player.x = sim.frontX;
      player.y = 360;
    }
  });
  await page.waitForFunction(() =>
    window.ZF.raidScene.sim.units.filter(
      (unit) => unit.team === "player" && unit.alive && unit.state === "fight",
    ).length === 16,
  );

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  const frames = await page.evaluate(() => new Promise((resolve) => {
    const durations = [];
    let last = performance.now();
    const end = last + 5_000;
    const sample = (now) => {
      durations.push(now - last);
      last = now;
      if (now < end) return requestAnimationFrame(sample);
      resolve({
        max: Math.max(...durations),
        over100: durations.filter((duration) => duration > 100).length,
      });
    };
    requestAnimationFrame(sample);
  }));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await cdp.detach();

  const farmUpdates = await page.evaluate(() => window.raidFarmVisualUpdates);
  if (farmUpdates !== 0) {
    throw new Error(`The hidden farm rendered ${farmUpdates} times during the invasion`);
  }
  if (frames.over100 !== 0) {
    throw new Error(`The bite phase visibly froze: worst frame ${frames.max.toFixed(1)} ms`);
  }
}
