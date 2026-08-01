async (page) => {
  const base = "http://127.0.0.1:4175/";
  const plantedAt = Date.now();
  let revision = 1;
  let cloudSave = {
    version: 1,
    savedAt: plantedAt,
    player: {
      name: "Time Warp Test",
      gold: 1_000,
      brains: 10,
      xp: 0,
      zombieMax: 16,
      zombieCount: 0,
    },
    farm: {
      fieldId: "default",
      w: 30,
      h: 30,
      climate: "grass",
      plots: [{
        oc: 4,
        or: 4,
        state: "planted",
        crop: {
          key: "ZombieActorRegularTier1",
          isZombie: true,
          plantedAt,
          growMs: 24 * 60 * 60 * 1_000,
        },
      }],
    },
    tutorial: { done: true, step: 999 },
  };

  await page.route("**/api/personal-cloud", async (route) => {
    const body = route.request().postDataJSON();
    const now = Date.now();
    if (body.action === "open") {
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
          writerToken: "test-writer-token",
          leaseUntil: now + 10 * 60 * 1_000,
        }),
      });
      return;
    }
    if (body.action === "save") {
      cloudSave = body.save;
      revision += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, revision, updatedAt: now, leaseUntil: now + 10 * 60 * 1_000 }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, revision, leaseUntil: now + 10 * 60 * 1_000 }),
    });
  });

  const token = `zfpc_${"a".repeat(43)}`;
  await page.goto(`${base}#personal-cloud=${token}`, { waitUntil: "domcontentloaded" });
  const dismissBoot = async () => {
    const boot = page.locator("#boot");
    if (!await boot.isVisible()) return;
    const start = page.getByText("Click to Start", { exact: true });
    await start.waitFor({ state: "visible" });
    await start.click({ force: true });
    await boot.waitFor({ state: "hidden" });
  };
  await dismissBoot();
  await page.locator("button.gear").waitFor({ state: "visible" });
  await page.locator("button.gear").click();
  await page.waitForTimeout(300);

  await page.evaluate(() => { window.timeWarpPageBeforeReload = true; });
  const warp = page.getByRole("button", { name: "+1 day", exact: true });
  await warp.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.timeWarpPageBeforeReload !== true);

  const expectReady = async () => {
    await dismissBoot();
    await page.waitForFunction(() => Boolean(window.ZF));
    await page.evaluate(() => {
      window.ZF.hud.openCropInfo(() => window.ZF.field.cropInfoAt(4, 4));
    });
    const status = page.locator(".crop-time");
    await status.waitFor({ state: "visible" });
    if (await status.textContent() !== "Ready to harvest!") {
      throw new Error(`Expected the planted zombie to be ready, got: ${await status.textContent()}`);
    }
    await page.locator(".panelclose").click();
  };

  await expectReady();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectReady();
}
