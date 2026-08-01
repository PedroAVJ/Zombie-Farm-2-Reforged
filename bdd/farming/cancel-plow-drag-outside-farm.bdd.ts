async (page) => {
  const base = "http://127.0.0.1:4175/";
  await page.setViewportSize({ width: 1600, height: 1000 });
  let revision = 1;
  const cloudSave = {
    version: 1,
    savedAt: Date.now(),
    player: {
      name: "Plow Cancel Test",
      gold: 100_000,
      brains: 10,
      xp: 0,
      zombieMax: 16,
      zombieCount: 0,
    },
    farm: { fieldId: "default", w: 30, h: 30, climate: "grass", plots: [] },
    tutorial: { done: true, step: 999 },
  };

  await page.route("**/api/personal-cloud", async (route) => {
    const now = Date.now();
    revision += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "writer",
        revision,
        updatedAt: now,
        save: cloudSave,
        generation: 1,
        writerToken: "plow-cancel-writer",
        leaseUntil: now + 10 * 60 * 1_000,
      }),
    });
  });

  const token = `zfpc_${"p".repeat(43)}`;
  await page.goto(`${base}#personal-cloud=${token}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZF));
  const boot = page.locator("#boot");
  if (await boot.isVisible()) {
    await page.getByText("Click to Start", { exact: true }).click({ force: true });
    await boot.waitFor({ state: "hidden" });
  }

  const points = await page.evaluate(() => {
    const z = window.ZF;
    z.hud.setMode("till");
    z.jobs.update = () => {};
    return [
      z.world.toGlobal(z.field.plotCenterOf(4, 4)),
      z.world.toGlobal(z.field.plotCenterOf(20, 20)),
    ];
  });
  const controlsBox = await page.locator(".topbar").boundingBox();
  if (!controlsBox) throw new Error("Farm controls are not visible");

  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y, { steps: 12 });
  await page.mouse.move(controlsBox.x + controlsBox.width / 2, controlsBox.y + controlsBox.height / 2);
  await page.mouse.up();
  await page.keyboard.press("1");

  const result = await page.evaluate(() => ({
    mode: window.ZF.hud.mode,
    queuedPlots: window.ZF.jobs.queue.filter((job) => job.kind === "till").length,
    previewVisible: window.ZF.field.tillSelectionLayer.visible,
  }));
  if (result.mode !== "walk") throw new Error(`Expected Select mode, received: ${result.mode}`);
  if (result.queuedPlots !== 0) {
    throw new Error(`Expected the outside release to cancel Plow, queued: ${result.queuedPlots}`);
  }
  if (result.previewVisible) throw new Error("Plow preview remained visible after switching to Select");
}
