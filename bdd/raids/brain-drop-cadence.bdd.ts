async (page) => {
  await page.goto("http://127.0.0.1:4175/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const { brainDropOddsMultiplier, rollEscalatingBrainDrop } = await import("/src/raid/brainDrops.ts");
    const alwaysMiss = () => 1;
    const drought = [0, 1, 2, 3].map((priorWins) =>
      rollEscalatingBrainDrop(20, priorWins, alwaysMiss),
    );
    return {
      drought,
      multipliers: [0, 1, 2, 3, 9].map(brainDropOddsMultiplier),
      eventualJackpot: rollEscalatingBrainDrop(20, 49, () => 1 - Number.EPSILON),
    };
  });

  if (result.drought.join(",") !== "0,0,0,0") {
    throw new Error(`Expected no forced fourth-win award, received ${result.drought.join(",")}`);
  }
  if (result.multipliers.join(",") !== "1,2,3,4,10") {
    throw new Error(`Expected steadily growing odds, received ${result.multipliers.join(",")}`);
  }
  if (result.eventualJackpot !== 5) {
    throw new Error(`Expected the five-brain tier to become naturally guaranteed, received ${result.eventualJackpot}`);
  }
}
