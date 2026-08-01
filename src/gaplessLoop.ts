export interface LoopingMusicTrack {
  readonly paused: boolean;
  volume: number;
  src?: string;
  play(): Promise<void>;
  pause(): void;
  dispose?(): void;
}

type AudioContextConstructor = new () => AudioContext;
type WebkitAudioGlobal = typeof globalThis & { webkitAudioContext?: AudioContextConstructor };

function contextConstructor(): AudioContextConstructor | null {
  if (typeof globalThis.AudioContext === "function") return globalThis.AudioContext;
  const webkit = (globalThis as WebkitAudioGlobal).webkitAudioContext;
  return typeof webkit === "function" ? webkit : null;
}

export function supportsSampleAccurateLooping(): boolean {
  return contextConstructor() !== null;
}

/** A decoded AudioBufferSourceNode loops inside the browser's audio render graph.
 * Unlike HTMLAudioElement.loop, it does not stop the decoder/media element and
 * ask Safari to restart it at each boundary, so no scheduling gap can be inserted. */
export class SampleAccurateLoop implements LoopingMusicTrack {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private bufferPromise: Promise<AudioBuffer> | null = null;
  private source: AudioBufferSourceNode | null = null;
  private wantedPlaying = false;
  private disposed = false;
  private generation = 0;
  private startedAt = 0;
  private startedOffset = 0;
  private offset = 0;
  private currentVolume = 1;

  constructor(
    private readonly url: string,
    private readonly createContext: () => AudioContext = () => {
      const Context = contextConstructor();
      if (!Context) throw new Error("Web Audio is unavailable");
      return new Context();
    },
  ) {}

  get paused(): boolean {
    return this.source === null;
  }

  get volume(): number {
    return this.currentVolume;
  }

  set volume(value: number) {
    this.currentVolume = value;
    if (this.context && this.gain) {
      this.gain.gain.setValueAtTime(value, this.context.currentTime);
    }
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const context = this.createContext();
    const gain = context.createGain();
    gain.gain.value = this.currentVolume;
    gain.connect(context.destination);
    this.context = context;
    this.gain = gain;
    return context;
  }

  private load(context: AudioContext): Promise<AudioBuffer> {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (!this.bufferPromise) {
      this.bufferPromise = fetch(this.url, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`Could not load loop (${response.status})`);
          return response.arrayBuffer();
        })
        .then((bytes) => context.decodeAudioData(bytes))
        .then((buffer) => {
          if (!(buffer.duration > 0)) throw new Error("Decoded loop is empty");
          this.buffer = buffer;
          return buffer;
        })
        .catch((error) => {
          this.bufferPromise = null;
          throw error;
        });
    }
    return this.bufferPromise;
  }

  async play(): Promise<void> {
    if (this.disposed || this.source) return;
    this.wantedPlaying = true;
    const generation = ++this.generation;
    try {
      const context = this.ensureContext();
      // Do this before the fetch/decode await so a play call made by a user
      // gesture grants Web Audio permission on iOS while that gesture is live.
      if (context.state !== "running") await context.resume();
      const buffer = await this.load(context);
      if (this.disposed || !this.wantedPlaying || generation !== this.generation || this.source) return;

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.gain!);
      this.startedOffset = this.offset % buffer.duration;
      this.startedAt = context.currentTime;
      source.start(0, this.startedOffset);
      this.source = source;
    } catch (error) {
      if (generation === this.generation) this.wantedPlaying = false;
      throw error;
    }
  }

  pause(): void {
    this.wantedPlaying = false;
    this.generation++;
    const context = this.context;
    const source = this.source;
    if (context && source) {
      if (this.buffer) {
        const elapsed = Math.max(0, context.currentTime - this.startedAt);
        this.offset = (this.startedOffset + elapsed) % this.buffer.duration;
      }
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
      this.source = null;
    }
    if (context && context.state !== "closed") void context.suspend().catch(() => undefined);
  }

  dispose(): void {
    this.pause();
    this.disposed = true;
    this.buffer = null;
    this.bufferPromise = null;
    const context = this.context;
    this.context = null;
    this.gain = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }
}
