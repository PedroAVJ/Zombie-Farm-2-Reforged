async (page) => {
  const base = "http://127.0.0.1:4175/";
  const expiredToken = `zfpc_${"e".repeat(43)}`;
  const currentToken = `zfpc_${"c".repeat(43)}`;
  const cloudSave = {
    version: 1,
    savedAt: Date.now(),
    player: {
      name: "Cloud Farm Test",
      gold: 7_777,
      brains: 10,
      xp: 0,
      zombieMax: 16,
      zombieCount: 0,
    },
    farm: { fieldId: "default", w: 30, h: 30, climate: "grass", plots: [] },
    tutorial: { done: true, step: 999 },
  };

  await page.route("**/api/personal-cloud", async (route) => {
    const request = route.request();
    const authorization = request.headers().authorization ?? "";
    const body = request.postDataJSON();
    const now = Date.now();
    if (authorization === `Bearer ${expiredToken}`) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: "bad_cloud_key" }),
      });
      return;
    }
    if (body.action === "open" && body.takeover !== true) {
      await route.fulfill({
        status: 423,
        contentType: "application/json",
        body: JSON.stringify({
          code: "writer_active",
          revision: 4,
          updatedAt: now,
          save: cloudSave,
          writer: { label: "Mac", lastActivityAt: now, leaseUntil: now + 600_000 },
        }),
      });
      return;
    }
    if (body.action === "open") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "writer",
          revision: 5,
          updatedAt: now,
          save: cloudSave,
          generation: 2,
          writerToken: "reconnected-writer-token",
          leaseUntil: now + 600_000,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, revision: 6, updatedAt: now, leaseUntil: now + 600_000 }),
    });
  });

  await page.goto(`${base}#personal-cloud=${expiredToken}`, { waitUntil: "domcontentloaded" });
  const reconnectGate = page.locator(".personal-cloud-reconnect-gate");
  await reconnectGate.waitFor({ state: "visible" });
  if (await page.evaluate(() => Boolean(window.ZF))) {
    throw new Error("The phone's separate Local Farm loaded behind the reconnect gate");
  }
  await page.getByRole("heading", { name: "Personal Cloud needs to reconnect" }).waitFor();

  await page.getByLabel("Private Personal Cloud link").fill(`${base}#personal-cloud=${currentToken}`);
  await page.getByRole("button", { name: "Reconnect This Device" }).click();

  await page.getByRole("heading", { name: "Personal Cloud Farm active elsewhere" }).waitFor();
  await page.getByText("currently controlled by Mac", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Take Over Here" }).click();
  await page.waitForFunction(() => Boolean(window.ZF));
  const gold = await page.evaluate(() => window.ZF.state.gold);
  if (gold !== 7_777) throw new Error(`Expected the cloud farm after takeover, received ${gold} gold`);
}
