async (page) => {
  const base = "http://127.0.0.1:4175/";
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZF));
  await page.locator("#boot").click({ force: true });
  await page.waitForFunction(() => document.querySelector("#boot")?.classList.contains("hidden"));
  await page.locator(".tut-layer").evaluate((element) => element.remove());
  await page.evaluate(async () => {
    const game = window.ZF;
    await game.place("mausoleum3", 20, 20);
    game.state.zombieMax = 1;
    game.zombies.restore([
      {
        id: "garden-crew",
        key: "ZombieActorGardenTier1",
        name: "Garden Crew",
        pos: { col: 8, row: 11 },
      },
      {
        id: "invasion-army",
        key: "ZombieActorRegularTier1",
        name: "Invasion Army",
        pos: { col: 2, row: 3 },
        stored: true,
      },
    ]);
    game.hud.openMausoleum();
  });

  const swap = page.getByRole("button", { name: /^Swap Zombies/ });
  if (await swap.isEnabled()) throw new Error("Swap should require one zombie from each roster");

  await page.getByRole("button", { name: /Garden Crew, Garden Zombie/ }).click();
  const details = page.getByRole("button", { name: /Selected on the farm: Garden Crew/ });
  await details.click();
  await page.locator(".zpanel").waitFor({ state: "visible" });
  await page.locator(".zpanel .panelclose").click();

  await page.getByRole("button", { name: /Invasion Army, Zombie/ }).click();
  if (!await swap.isEnabled()) throw new Error("Swap should be enabled after selecting both sides");
  const outgoingPosition = await page.evaluate(() =>
    window.ZF.zombies.serialize().find((z) => z.id === "garden-crew")?.pos
  );
  await swap.click();

  const afterSwap = await page.evaluate(() => window.ZF.zombies.serialize());
  const army = afterSwap.find((z) => z.id === "invasion-army");
  const garden = afterSwap.find((z) => z.id === "garden-crew");
  if (army?.stored || army?.pos?.col !== outgoingPosition?.col || army?.pos?.row !== outgoingPosition?.row) {
    throw new Error("The incoming army zombie did not take the outgoing farm position");
  }
  if (!garden?.stored) throw new Error("The outgoing garden zombie was not stored");
  if (afterSwap.filter((z) => !z.stored).length !== 1 || afterSwap.filter((z) => z.stored).length !== 1) {
    throw new Error("Swap changed the deployed or stored roster count");
  }

  await page.evaluate(() => { window.ZF.state.zombieMax = 2; });
  await page.getByRole("button", { name: /Invasion Army, Zombie/ }).click();
  await page.getByRole("button", { name: /^Store:/ }).click();
  const afterStore = await page.evaluate(() => window.ZF.zombies.serialize());
  if (afterStore.some((z) => !z.stored)) throw new Error("Store did not move the selected zombie into the Mausoleum");

  await page.getByRole("button", { name: /Invasion Army, Zombie/ }).click();
  await page.getByRole("button", { name: /^Deploy:/ }).click();
  const afterDeploy = await page.evaluate(() => window.ZF.zombies.serialize());
  if (afterDeploy.filter((z) => !z.stored).length !== 1) throw new Error("Deploy did not return the selected zombie to the farm");

  await page.locator(".msw-panel .panelclose").click();
  await page.locator(".msw-panel").waitFor({ state: "detached" });
}
