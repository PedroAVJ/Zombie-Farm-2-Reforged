async (page) => {
  await page.goto("http://127.0.0.1:4175/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const { rollProtectedBrainDrop } = await import("/src/raid/brainDrops.ts");
    const alwaysMiss = () => 1;
    const drought = [0, 1, 2, 3].map((priorWins) =>
      rollProtectedBrainDrop(20, priorWins, alwaysMiss),
    );

    const threeRolls = [1, 0];
    const oneRolls = [1, 1, 0];
    return {
      drought,
      awards: [
        rollProtectedBrainDrop(20, 0, () => 0),
        rollProtectedBrainDrop(20, 0, () => threeRolls.shift() ?? 1),
        rollProtectedBrainDrop(20, 0, () => oneRolls.shift() ?? 1),
      ],
    };
  });

  if (result.drought.join(",") !== "0,0,0,1") {
    throw new Error(`Expected fourth-win protection, received ${result.drought.join(",")}`);
  }
  if (result.awards.join(",") !== "5,3,1") {
    throw new Error(`Expected the original brain stack sizes, received ${result.awards.join(",")}`);
  }
}
