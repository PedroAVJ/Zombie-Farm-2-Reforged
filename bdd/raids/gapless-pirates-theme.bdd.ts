async (page) => {
  await page.goto("http://127.0.0.1:4175/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const raids = await fetch("/assets/raids/raids.json").then((response) => response.json());
    const pirates = raids.find((raid) => raid.id === 3);
    if (!pirates) return { error: "Pirates invasion is missing" };

    const response = await fetch(`/assets/${pirates.music}`);
    const bytes = await response.arrayBuffer();
    const context = new AudioContext();
    const buffer = await context.decodeAudioData(bytes.slice(0));
    await context.close();

    const edgeRms = (from: number, to: number) => {
      let sum = 0;
      let count = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let i = from; i < to; i++) {
          sum += samples[i] * samples[i];
          count += 1;
        }
      }
      return Math.sqrt(sum / Math.max(1, count));
    };
    const edgeSamples = Math.round(buffer.sampleRate * 0.02);
    return {
      music: pirates.music,
      codec: response.headers.get("content-type") ?? "",
      firstEdgeRms: edgeRms(0, edgeSamples),
      lastEdgeRms: edgeRms(buffer.length - edgeSamples, buffer.length),
    };
  });

  if (result.error) throw new Error(result.error);
  if (result.music !== "audio/pirateStageBGM.wav") {
    throw new Error(`Pirates still uses a padded loop source: ${result.music}`);
  }
  if (result.firstEdgeRms < 0.001 || result.lastEdgeRms < 0.001) {
    throw new Error(
      `Pirates loop contains a silent edge: ${result.firstEdgeRms} -> ${result.lastEdgeRms}`,
    );
  }
}
