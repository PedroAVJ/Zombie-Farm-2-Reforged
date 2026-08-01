async (page) => {
  await page.goto("http://127.0.0.1:4175/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZF));

  const launched = await page.evaluate(async () => {
    const z = window.ZF;
    z.state.lastRaidAt = 0;
    if (z.zombies.roster().length === 0) {
      z.spawnMutant("ZombieActorRegularTier1", 0);
    }
    return z.hud.onLaunchRaid(
      1,
      [z.zombies.roster()[0].id],
      { useVoucher: false, concentration: false, dice: 0 },
    );
  });
  if (!launched) throw new Error("Could not launch the keyboard-focus invasion");
  await page.waitForFunction(() => Boolean(window.ZF?.raidScene));

  await page.evaluate(() => {
    const scene = window.ZF.raidScene;
    const zombie = scene.sim.units.find((unit) => unit.team === "player");
    scene.phase = "done"; // freeze the deterministic keyboard presentation fixture
    zombie.state = "charging";
    zombie.charge = 0.25;
    zombie.distracted = true;
    zombie.awaitRelease = false;
    zombie.bubbleMs = 10_000;
  });
  await page.waitForFunction(() => window.ZF.raidScene.bubble.visible === true);

  await page.keyboard.press("Space");
  const butterfly = await page.evaluate(() => {
    const scene = window.ZF.raidScene;
    const zombie = scene.sim.units.find((unit) => unit.team === "player");
    return {
      bubble: scene.sim.chargingBubble(),
      state: zombie.state,
      distracted: zombie.distracted,
      replayType: scene.replayInputs.at(-1)?.type,
    };
  });
  if (butterfly.bubble !== null || butterfly.distracted || butterfly.state !== "charging") {
    throw new Error("Space did not clear the butterfly while leaving the zombie charging");
  }
  if (butterfly.replayType !== "bubble") {
    throw new Error("The keyboard bubble action was not recorded for replay");
  }

  await page.evaluate(() => {
    const scene = window.ZF.raidScene;
    const zombie = scene.sim.units.find((unit) => unit.team === "player");
    zombie.state = "charging";
    zombie.distracted = false;
    zombie.awaitRelease = true;
    zombie.bubbleMs = 10_000;
  });
  await page.waitForFunction(() => window.ZF.raidScene.bubble.visible === true);

  await page.keyboard.press("Space");
  const brain = await page.evaluate(() => {
    const scene = window.ZF.raidScene;
    const zombie = scene.sim.units.find((unit) => unit.team === "player");
    return { bubble: scene.sim.chargingBubble(), state: zombie.state };
  });
  if (brain.bubble !== null || brain.state !== "advance") {
    throw new Error("Space did not release the zombie from the full-brain bubble");
  }
}
