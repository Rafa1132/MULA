import { Dictation, appendDictation } from "./dictation.ts";
import type { RecognitionConstructor } from "./dictation.ts";
import { StreamingSpeech } from "./streamingSpeech.ts";

export type LiveState = "off" | "starting" | "listening" | "responding";
type Options = {
  player: { unlock: () => Promise<void>; speak: (text: string) => Promise<void>; stop: () => void };
  send: (text: string, onToken: (token: string) => void) => Promise<boolean>;
  abort: () => void;
  state: (state: LiveState) => void;
  transcript: (final: string, interim: string) => void;
  error: (message: string) => void;
  pauseMs?: number;
};

export class LiveConversation {
  private recognition: Dictation;
  private options: Options;
  private active = false;
  private state: LiveState = "off";
  private generation = 0;
  private text = "";
  private interim = "";
  private language = "en-US";
  private heardSpeech = false;
  private finishing = false;
  private silence: ReturnType<typeof setTimeout> | null = null;
  private noSpeech: ReturnType<typeof setTimeout> | null = null;
  private speech: StreamingSpeech | null = null;

  constructor(factory: RecognitionConstructor, options: Options) {
    this.options = options;
    this.recognition = new Dictation(factory, {
      text: (value) => {
        if (!this.active || this.state !== "listening") return;
        this.heardSpeech = true;
        this.text = appendDictation(this.text, value).text;
        this.options.transcript(this.text, this.interim);
        this.armPause();
      },
      interim: (value) => {
        if (!this.active || this.state !== "listening") return;
        if (value.trim()) this.heardSpeech = true;
        this.interim = value;
        this.options.transcript(this.text, value);
        if (this.heardSpeech) this.armPause();
      },
      state: (value) => {
        if (!this.active) return;
        if (this.state === "listening" && value === "starting") this.options.state("starting");
        if (this.state === "listening" && value === "listening") this.options.state("listening");
        if (value === "idle" && this.state === "listening") {
          this.clearTimers();
          if (this.heardSpeech && this.text.trim()) void this.reply();
          else this.stop("No speech was captured. Start live conversation again when you’re ready.");
        }
      },
      error: (message) => { if (message) this.stop(message); },
    });
  }

  isActive() { return this.active; }

  async start(language: string, initialText = "") {
    if (this.active) return;
    const generation = ++this.generation;
    this.active = true;
    this.setState("starting");
    this.language = language;
    this.options.error("");
    try {
      await this.options.player.unlock();
      if (!this.active || generation !== this.generation) return;
      this.listen(initialText);
    } catch (error) {
      if (generation === this.generation) this.stop(this.errorText(error));
    }
  }

  private listen(initialText = "") {
    if (!this.active) return;
    this.heardSpeech = false;
    this.finishing = false;
    this.text = initialText;
    this.interim = "";
    this.setState("listening");
    this.options.transcript(this.text, "");
    this.recognition.start(this.language);
    if (this.active) this.noSpeech = setTimeout(() => this.stop("Live conversation paused after no speech. Start it again when you’re ready."), 20000);
  }

  private armPause() {
    if (!this.active || this.state !== "listening") return;
    if (this.silence) clearTimeout(this.silence);
    if (this.noSpeech) clearTimeout(this.noSpeech);
    this.noSpeech = null;
    this.silence = setTimeout(() => this.finishTurn(), this.options.pauseMs || 1400);
  }

  finishTurn() {
    if (!this.active || this.state !== "listening" || this.finishing) return;
    this.finishing = true;
    this.clearTimers();
    this.recognition.stop();
  }

  private async reply() {
    if (!this.active || this.state !== "listening") return;
    const generation = this.generation;
    const text = this.text.trim();
    this.setState("responding");
    const speech = new StreamingSpeech(this.options.player, (error) => {
      if (this.active && generation === this.generation) this.stop(this.errorText(error));
    });
    this.speech = speech;
    try {
      const success = await this.options.send(text, (token) => speech.push(token));
      if (!this.active || generation !== this.generation) return;
      if (!success) { this.stop("Live conversation paused. Review the message and start again."); return; }
      await speech.finish();
      if (!this.active || generation !== this.generation) return;
      this.speech = null;
      this.listen();
    } catch (error) {
      if (this.active && generation === this.generation) this.stop(this.errorText(error));
    }
  }

  interrupt() {
    if (!this.active) return;
    this.generation += 1;
    this.setState("responding");
    this.clearTimers();
    this.recognition.cancel();
    this.speech?.cancel();
    this.speech = null;
    this.options.player.stop();
    this.options.abort();
    this.listen();
  }

  stop(message = "") {
    if (!this.active) return;
    // Set off before cancellation callbacks so they cannot submit another turn.
    this.active = false;
    this.generation += 1;
    this.setState("off");
    this.clearTimers();
    this.recognition.cancel();
    this.speech?.cancel();
    this.speech = null;
    this.options.player.stop();
    this.options.abort();
    if (message) this.options.error(message);
  }

  private setState(state: LiveState) {
    this.state = state;
    this.options.state(state);
  }

  private clearTimers() {
    if (this.silence) clearTimeout(this.silence);
    if (this.noSpeech) clearTimeout(this.noSpeech);
    this.silence = null;
    this.noSpeech = null;
  }

  private errorText(error: unknown) {
    if (error instanceof Error) return error.message;
    return "Live voice is unavailable. You can still use chat.";
  }
}
