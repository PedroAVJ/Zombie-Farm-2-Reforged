async (page) => {
  const base = "http://127.0.0.1:4175/";
  await page.setViewportSize({ width: 1600, height: 1000 });
  let revision = 1;
  const queuedOrigins = [{ oc: 4, or: 8 }, { oc: 8, or: 8 }];
  const cloudSave = {
    version: 1,
    savedAt: Date.now(),
    player: {
      name: "Plow Reload Test",
      gold: 100_000,
      brains: 10,
      xp: 0,
      zombieMax: 16,
      zombieCount: 0,
    },
    farm: { fieldId: "default", w: 30, h: 30, climate: "grass", plots: [] },
    farmJobs: {
      savedAt: Date.now(),
      jobs: queuedOrigins.map(({ oc, or }) => ({
        kind: "till",
        oc,
        or,
        cx: 0,
        cy: 0,
        queuedAt: Date.now(),
      })),
    },
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
        writerToken: "plow-reload-writer",
        leaseUntil: now + 10 * 60 * 1_000,
      }),
    });
  });

  const token = `zfpc_${"r".repeat(43)}`;
  await page.goto(`${base}#personal-cloud=${token}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZF));
  const boot = page.locator("#boot");
  if (await boot.isVisible()) {
    await page.getByText("Click to Start", { exact: true }).click({ force: true });
    await boot.waitFor({ state: "hidden" });
  }

  const actualOrigins = await page.evaluate((expected) => expected.map(({ oc, or }) =>
    window.ZF.field.plotOriginAt(oc, or)), queuedOrigins);
  const actual = actualOrigins.map((origin) => origin ? `${origin.oc},${origin.or}` : "missing");
  const expected = queuedOrigins.map(({ oc, or }) => `${oc},${or}`);
  if (actual.join("|") !== expected.join("|")) {
    throw new Error(`Expected queued Plow origins ${expected.join("|")}, received ${actual.join("|")}`);
  }
}
