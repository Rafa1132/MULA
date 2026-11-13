export type DictationState = "idle" | "starting" | "listening" | "stopping";
export type RecognitionResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
export type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
export type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
export type RecognitionConstructor = new () => RecognitionLike;

export function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const browser = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
}

export function appendDictation(draft: string, transcript: string) {
  const text = transcript.trim();
  if (!text) return { text: draft, truncated: false };
  let combined = text;
  if (draft) {
    let separator = " ";
    if (/\s$/.test(draft)) separator = "";
    combined = draft + separator + text;
  }
  let end = Math.min(combined.length, 8000);
  const last = combined.charCodeAt(end - 1);
  if (end < combined.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
  return { text: combined.slice(0, end), truncated: combined.length > end };
}

const errorMessages: Record<string, string> = {
  "not-allowed": "Microphone permission was denied. Allow microphone access in your browser settings and try again.",
  "service-not-allowed": "Your browser has disabled speech recognition. You can still type your message.",
  "audio-capture": "No microphone is available. Connect a microphone and check your browser permissions.",
  "no-speech": "No speech was detected. Try the microphone again and speak clearly.",
  network: "The browser’s speech service could not connect. Check your connection or type your message.",
  "language-not-supported": "The speech service does not support this language. Choose another language or type your message.",
};

type Callbacks = {
  state: (state: DictationState) => void;
  text: (text: string) => void;
  interim: (text: string) => void;
  error: (message: string) => void;
};

export class Dictation {
  private engine: RecognitionLike | null = null;
  private callbacks: Callbacks;
  private factory: RecognitionConstructor;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(factory: RecognitionConstructor, callbacks: Callbacks) {
    this.factory = factory;
    this.callbacks = callbacks;
  }

  start(language: string) {
    if (this.engine) return;
    this.callbacks.error("");
    this.callbacks.interim("");
    let engine: RecognitionLike;
    try {
      engine = new this.factory();
      engine.lang = language;
      engine.continuous = true;
      engine.interimResults = true;
    } catch {
      this.callbacks.error("Could not start speech recognition in this browser. You can still type.");
      return;
    }
    this.engine = engine;
    const committed = new Set<number>();
    engine.onstart = () => {
      if (this.engine === engine) this.callbacks.state("listening");
    };
    engine.onresult = (event) => {
      if (this.engine !== engine) return;
      const final: string[] = [];
      const interim: string[] = [];
      // Results are cumulative and interim entries may change. Commit each
      // finalized result once rather than repeatedly appending the whole list.
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) {
          if (!committed.has(index)) { final.push(transcript); committed.add(index); }
        } else interim.push(transcript);
      }
      if (final.length) this.callbacks.text(final.join(" "));
      this.callbacks.interim(interim.join(" "));
    };
    engine.onerror = (event) => {
      if (this.engine !== engine) return;
      if (event.error !== "aborted") {
        this.callbacks.error(errorMessages[event.error] || "Speech recognition stopped unexpectedly. You can still type your message.");
      }
      this.cancel();
    };
    engine.onend = () => {
      if (this.engine !== engine) return;
      this.detach(engine);
    };
    this.callbacks.state("starting");
    try { engine.start(); }
    catch {
      this.detach(engine);
      this.callbacks.error("Could not access speech recognition. Check microphone permission and try again.");
    }
  }

  stop() {
    const engine = this.engine;
    if (!engine) return;
    this.callbacks.state("stopping");
    try {
      // Allow the engine to deliver its last finalized text before ending.
      engine.stop();
      if (this.engine !== engine) return;
      this.finishTimer = setTimeout(() => {
        this.cancel();
        this.callbacks.error("Dictation stopped waiting for the speech service. Review the text already captured.");
      }, 5000);
    } catch { this.cancel(); }
  }

  cancel() {
    const engine = this.engine;
    if (!engine) return;
    this.detach(engine);
    // Ignore late results from an aborted session (hide tab, sign out, unmount).
    // A delayed permission grant can still produce onstart in some engines;
    // abort it again so recording cannot silently resume after cancellation.
    engine.onstart = () => {
      engine.onstart = null;
      try { engine.abort(); }
      catch { /* The permission request may already have been cancelled. */ }
    };
    try { engine.abort(); }
    catch { /* Some engines throw if they have already ended. */ }
  }

  private detach(engine: RecognitionLike) {
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;
    this.engine = null;
    engine.onstart = null;
    engine.onend = null;
    engine.onresult = null;
    engine.onerror = null;
    this.callbacks.state("idle");
    this.callbacks.interim("");
  }
}
