async (page) => {
  const base = "http://127.0.0.1:4175/";
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZF));
  await page.locator("#boot").click({ force: true });
  await page.waitForFunction(() => document.querySelector("#boot")?.classList.contains("hidden"));
  await page.locator(".tut-layer").evaluate((element) => element.remove());

  await page.evaluate(() => {
    window.ZF.tutorial.active = false;
    window.ZF.hud.setTutorialGating(false);
    window.ZF.state.setBrains(8);
    window.ZF.state.setLevel(30);
    window.ZF.hud.update();
  });

  const displayedBalance = await page.locator(".chips .chip").nth(1).locator("span").textContent();
  if (displayedBalance !== "80") throw new Error(`Expected classic balance 80, got ${displayedBalance}`);

  await page.evaluate(() => window.ZF.hud.openMarket("Boosts"));
  const instaGrow = page.locator(".mkt-card").filter({ hasText: "Insta-Grow" });
  if (!await instaGrow.locator(".mkt-cost").getByText("10", { exact: true }).count()) {
    throw new Error("A one-unit brain price was not shown as 10");
  }

  await instaGrow.click();
  const balanceAfterPick = await page.evaluate(() => window.ZF.state.brains);
  if (balanceAfterPick !== 7) throw new Error(`Expected internal balance 7, got ${balanceAfterPick}`);
}
