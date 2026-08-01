async (page) => {
  const base = "http://127.0.0.1:4175/";
  const plantedAt = Date.now() - 60_000;
  let revision = 1;
  const plots = [4, 8, 12].map((oc) => ({
    oc,
    or: 4,
    state: "planted",
    crop: { key: "carrot", isZombie: false, plantedAt, growMs: 15_000 },
  }));
  const cloudSave = {
    version: 1,
    savedAt: Date.now(),
    player: {
      name: "Harvest Drag Test",
      gold: 1_000,
      brains: 10,
      xp: 0,
      zombieMax: 16,
      zombieCount: 0,
    },
    farm: { fieldId: "default", w: 30, h: 30, climate: "grass", plots },
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
        writerToken: "harvest-drag-writer",
        leaseUntil: now + 10 * 60 * 1_000,
      }),
    });
  });

  const token = `zfpc_${"h".repeat(43)}`;
  await page.goto(`${base}#personal-cloud=${token}`, { waitUntil: "domcontentloaded" });
  const boot = page.locator("#boot");
  if (await boot.isVisible()) {
    await page.getByText("Click to Start", { exact: true }).click({ force: true });
    await boot.waitFor({ state: "hidden" });
  }
  await page.waitForFunction(() => Boolean(window.ZF));

  const centers = await page.evaluate(() => {
    const z = window.ZF;
    z.hud.setMode("walk");
    // Keep the user-visible queued diamonds in place while the gesture is checked.
    z.jobs.update = () => {};
    return [4, 8, 12].map((oc) => {
      const center = z.field.plotCenterOf(oc, 4);
      const global = z.world.toGlobal(center);
      return { x: global.x, y: global.y };
    });
  });

  await page.mouse.move(centers[0].x, centers[0].y);
  await page.mouse.down();
  await page.mouse.move(centers[1].x, centers[1].y, { steps: 8 });
  await page.mouse.move(centers[2].x, centers[2].y, { steps: 8 });
  await page.mouse.move(centers[1].x, centers[1].y, { steps: 8 });
  await page.mouse.up();

  const queued = await page.evaluate(() => window.ZF.jobs.queue
    .filter((job) => job.kind === "harvest")
    .map((job) => `${job.oc},${job.or}`));
  if (queued.join("|") !== "4,4|8,4|12,4") {
    throw new Error(`Expected one harvest per crossed plot, received: ${queued.join("|")}`);
  }
}
