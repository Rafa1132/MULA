import { projectFetch } from "../../../common/services/project.ts";

export type VoiceState = "idle" | "preparing" | "speaking";

export function speechChunks(markdown: string): string[] {
  // Speak prose, not fenced code, HTML, markdown syntax or raw destinations.
  const text = markdown
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^[\s]*[>#*\-]+\s*/gm, "")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let end = Math.min(1000, remaining.length);
    if (end < remaining.length) {
      const sentence = remaining.slice(0, end).search(/[.!?]\s+[^.!?]*$/);
      if (sentence >= 200) end = sentence + 1;
      else {
        const space = remaining.lastIndexOf(" ", end);
        if (space > 0) end = space;
      }
      // Do not cut a surrogate pair in the rare case of a long unbroken token.
      const code = remaining.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    }
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  return chunks;
}

export class SpeechPlayer {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private request: AbortController | null = null;
  private generation = 0;
  private finishPlayback: (() => void) | null = null;
  private onState: (state: VoiceState) => void;
  private onAnalyser: (analyser: AnalyserNode) => void;

  constructor(onState: (state: VoiceState) => void, onAnalyser: (analyser: AnalyserNode) => void) {
    this.onState = onState;
    this.onAnalyser = onAnalyser;
  }

  async unlock() {
    if (!this.context) {
      if (typeof AudioContext === "undefined") throw new Error("AI voice is not supported in this browser. Chat still works.");
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.connect(this.context.destination);
      this.onAnalyser(this.analyser);
    }
    await this.context.resume();
    if (this.context.state !== "running") throw new Error("Select Play reply to allow audio in your browser.");
  }

  stop() {
    // Invalidates synthesis and decoding too, preventing late audio after mute.
    this.generation += 1;
    this.request?.abort();
    this.request = null;
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
    this.finishPlayback?.();
    this.finishPlayback = null;
    this.onState("idle");
  }

  async speak(text: string) {
    this.stop();
    const generation = this.generation;
    const chunks = speechChunks(text);
    if (!chunks.length) return;
    await this.run(generation, async () => {
      for (const chunk of chunks) {
        if (generation !== this.generation) return;
        const bytes = await this.download(() => projectFetch("/api/speech", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk }), signal: this.request!.signal,
        }));
        if (generation !== this.generation) return;
        await this.playBytes(bytes, generation);
      }
    });
  }

  /** One recording made ahead of time (the spoken welcome), through the same path, so the orb reacts and mute works. */
  async play(url: string) {
    this.stop();
    const generation = this.generation;
    await this.run(generation, async () => {
      const bytes = await this.download(() => fetch(url, { signal: this.request!.signal }));
      if (generation !== this.generation) return;
      await this.playBytes(bytes, generation);
    });
  }

  /** Shared by speak and play: unlock audio, run the work, and turn failures into readable errors. */
  private async run(generation: number, work: () => Promise<void>) {
    try {
      await this.unlock();
      if (generation !== this.generation) return;
      await work();
    } catch (failure) {
      if (generation !== this.generation) return;
      this.stop();
      if (failure instanceof Error && failure.name === "AbortError") {
        throw new Error("Voice generation timed out. You can still read the reply.");
      }
      throw failure;
    } finally {
      if (generation === this.generation) {
        this.request = null;
        this.onState("idle");
      }
    }
  }

  /** The audio bytes from one request, with a timeout, and the backend's message when it refuses. */
  private async download(send: () => Promise<Response>) {
    this.onState("preparing");
    const request = new AbortController();
    this.request = request;
    const timeout = setTimeout(() => request.abort(), 35000);
    try {
      const response = await send();
      if (!response.ok) {
        const failure = await response.json();
        if (typeof failure.detail === "string") throw new Error(failure.detail);
        throw new Error("Could not create AI voice. Chat still works.");
      }
      return await response.arrayBuffer();
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Decode and play, resolving when playback ends or is stopped. Does nothing once a newer call has started. */
  private async playBytes(bytes: ArrayBuffer, generation: number) {
    const context = this.context!;
    const buffer = await context.decodeAudioData(bytes);
    if (generation !== this.generation) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser!);
    this.source = source;
    await new Promise<void>((resolve) => {
      this.finishPlayback = resolve;
      source.onended = () => {
        source.disconnect();
        this.source = null;
        this.finishPlayback = null;
        resolve();
      };
      source.start();
      this.onState("speaking");
    });
  }

  async dispose() {
    this.stop();
    if (this.context) await this.context.close();
    this.context = null;
  }
}
