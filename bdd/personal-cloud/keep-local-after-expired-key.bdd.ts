async (page) => {
  const base = "http://127.0.0.1:4175/";
  const expiredToken = `zfpc_${"x".repeat(43)}`;
  await page.route("**/api/personal-cloud", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "bad_cloud_key" }),
    });
  });

  await page.goto(`${base}#personal-cloud=${expiredToken}`, { waitUntil: "domcontentloaded" });
  const reconnectGate = page.locator(".personal-cloud-reconnect-gate");
  await reconnectGate.waitFor({ state: "visible" });
  await page.getByLabel("Private Personal Cloud link").fill("not a private link");
  await page.getByRole("button", { name: "Reconnect This Device" }).click();
  await page.getByText("That isn't a valid private Personal Cloud link", { exact: false }).waitFor();
  if (!await reconnectGate.isVisible()) throw new Error("An invalid link dismissed the reconnect screen");

  await page.getByRole("button", { name: "Keep This Device Local" }).click();
  await page.waitForFunction(() => Boolean(window.ZF));
  const connection = await page.evaluate(() => localStorage.getItem("zf2r.personal-cloud.connection.v1"));
  if (connection !== null) throw new Error("The expired Personal Cloud connection remained on the phone");
}
