async (page) => {
  // Replace the live audio destination before the game boots. The production
  // path still fetches and decodes the real Pirates WAV, but this test remains
  // completely silent while recording how the loop source is configured.
  await page.addInitScript(() => {
    window.pirateLoopSources = [];
    class SilentBufferSource {
      buffer = null;
      loop = false;
      startCalls = [];
      connect() {}
      disconnect() {}
      stop() {}
      start(when = 0, offset = 0) { this.startCalls.push([when, offset]); }
    }
    class SilentAudioContext {
      state = "suspended";
      currentTime = 0;
      destination = {};
      createGain() {
        return { gain: { value: 1, setValueAtTime() {} }, connect() {} };
      }
      createBufferSource() {
        const source = new SilentBufferSource();
        window.pirateLoopSources.push(source);
        return source;
      }
      async decodeAudioData(bytes) {
        const decoder = new OfflineAudioContext(2, 1, 44_100);
        return decoder.decodeAudioData(bytes);
      }
      async resume() { this.state = "running"; }
      async suspend() { this.state = "suspended"; }
      async close() { this.state = "closed"; }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: SilentAudioContext,
    });
  });

  await page.goto("http://127.0.0.1:4175/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZF));

  const result = await page.evaluate(async () => {
    const raids = await fetch("/assets/raids/raids.json").then((response) => response.json());
    const pirates = raids.find((raid) => raid.id === 3);
    if (!pirates) return { error: "Pirates invasion is missing" };

    window.ZF.audio.enterRaid(pirates.music);
    const started = performance.now();
    while (!window.pirateLoopSources.length && performance.now() - started < 5_000) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const runtimeSource = window.pirateLoopSources[0];

    // Render two passes offline and inspect the exact join. OfflineAudioContext
    // cannot reach the speakers, but it uses the same AudioBuffer loop semantics.
    const response = await fetch(`/assets/${pirates.music}`);
    const bytes = await response.arrayBuffer();
    const decoder = new OfflineAudioContext(2, 1, 44_100);
    const buffer = await decoder.decodeAudioData(bytes.slice(0));
    const renderer = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length * 2,
      buffer.sampleRate,
    );
    const source = renderer.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(renderer.destination);
    source.start(0);
    const rendered = await renderer.startRendering();

    const seam = buffer.length;
    const radius = Math.round(buffer.sampleRate * 0.02);
    let sum = 0;
    let count = 0;
    let silentRun = 0;
    let longestSilentRun = 0;
    for (let i = seam - radius; i < seam + radius; i++) {
      let framePeak = 0;
      for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
        const sample = rendered.getChannelData(channel)[i];
        sum += sample * sample;
        count += 1;
        framePeak = Math.max(framePeak, Math.abs(sample));
      }
      if (framePeak < 1 / 65_536) {
        silentRun += 1;
        longestSilentRun = Math.max(longestSilentRun, silentRun);
      } else silentRun = 0;
    }

    return {
      music: pirates.music,
      runtimeLoop: runtimeSource?.loop ?? false,
      runtimeStarts: runtimeSource?.startCalls.length ?? 0,
      seamRms: Math.sqrt(sum / Math.max(1, count)),
      longestSilentMs: longestSilentRun / buffer.sampleRate * 1_000,
    };
  });

  if (result.error) throw new Error(result.error);
  if (result.music !== "audio/pirateStageBGM.wav") {
    throw new Error(`Pirates still uses a padded loop source: ${result.music}`);
  }
  if (!result.runtimeLoop || result.runtimeStarts !== 1) {
    throw new Error("Pirates is not using one continuously looping decoded source");
  }
  if (result.seamRms < 0.001 || result.longestSilentMs > 1) {
    throw new Error(
      `Pirates rendered a silent loop boundary: RMS ${result.seamRms}, silence ${result.longestSilentMs}ms`,
    );
  }
}
