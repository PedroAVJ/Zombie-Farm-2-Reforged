async (page) => {
  await page.goto("http://127.0.0.1:4175/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZF));

  const launched = await page.evaluate(async () => {
    const z = window.ZF;
    z.state.lastRaidAt = 0;
    if (z.zombies.roster().length === 0) z.spawnMutant("ZombieActorRegularTier1", 0);
    return z.hud.onLaunchRaid(1, [z.zombies.roster()[0].id], {
      useVoucher: false, concentration: false, dice: 0,
    });
  });
  if (!launched) throw new Error("Could not launch the keyboard-obstacle invasion");
  await page.waitForFunction(() => Boolean(window.ZF?.raidScene));

  await page.evaluate(() => {
    const scene = window.ZF.raidScene;
    scene.phase = "done";
    const zombie = scene.sim.units.find((unit) => unit.team === "player");
    zombie.state = "advance";
    zombie.distracted = false;
    zombie.awaitRelease = false;
    scene.keyboardWallHits = 0;
    scene.sim.activeWall = () => ({ id: "keyboard-wall", isWall: true, alive: true });
    scene.sim.tapWall = (id) => {
      if (id !== "keyboard-wall") return false;
      scene.keyboardWallHits += 1;
      return true;
    };
  });

  const scrollBefore = await page.evaluate(() => scrollY);
  await page.keyboard.press("Space");
  const wallOnly = await page.evaluate(() => ({
    hits: window.ZF.raidScene.keyboardWallHits,
    scrollY,
  }));
  if (wallOnly.hits !== 1) throw new Error("Space did not hit the active wall");
  if (wallOnly.scrollY !== scrollBefore) throw new Error("Space scrolled the page during battle input");

  await page.evaluate(() => {
    const scene = window.ZF.raidScene;
    const zombie = scene.sim.units.find((unit) => unit.team === "player");
    zombie.state = "charging";
    zombie.charge = 0.25;
    zombie.distracted = true;
    zombie.awaitRelease = false;
    zombie.bubbleMs = 10_000;
  });
  await page.keyboard.press("Space");
  const prioritized = await page.evaluate(() => ({
    hits: window.ZF.raidScene.keyboardWallHits,
    bubble: window.ZF.raidScene.sim.chargingBubble(),
  }));
  if (prioritized.hits !== 1 || prioritized.bubble !== null) {
    throw new Error("Space did not prioritize the concentration bubble over the wall");
  }
}
