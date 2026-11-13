import { speechChunks } from "./speech.ts";

type Player = { speak: (text: string) => Promise<void>; stop: () => void };

// Locate a stable sentence/phrase outside code and inline Markdown constructs.
// Keep unfinished text buffered rather than repeatedly speaking a growing reply.
function boundary(text: string) {
  let fence = "";
  let inline = false;
  let brackets = 0;
  let parentheses = 0;
  for (let index = 0; index < text.length; index += 1) {
    const marker = text.slice(index, index + 3);
    if (marker === "```" || marker === "~~~") {
      if (!fence) fence = marker;
      else if (fence === marker) fence = "";
      index += 2;
      continue;
    }
    if (fence) continue;
    const character = text[index];
    if (character === "`") { inline = !inline; continue; }
    if (inline) continue;
    if (character === "[") brackets += 1;
    if (character === "]") brackets = Math.max(0, brackets - 1);
    if (character === "(") parentheses += 1;
    if (character === ")") parentheses = Math.max(0, parentheses - 1);
    if (brackets || parentheses) continue;
    if (/[.!?。！？]/.test(character) && /\s/.test(text[index + 1] || "")) return index + 1;
    if (index >= 240 && /\s/.test(character)) return index + 1;
  }
  return 0;
}

export class StreamingSpeech {
  private pending = "";
  private items: string[] = [];
  private running = false;
  private cancelled = false;
  private failure: unknown = null;
  private waiters: (() => void)[] = [];
  private player: Player;
  private onError: (error: unknown) => void;

  constructor(player: Player, onError: (error: unknown) => void) {
    this.player = player;
    this.onError = onError;
  }

  push(token: string) {
    if (this.cancelled || this.failure) return;
    this.pending += token;
    let end = boundary(this.pending);
    while (end) {
      this.enqueue(this.pending.slice(0, end));
      this.pending = this.pending.slice(end);
      end = boundary(this.pending);
    }
  }

  private enqueue(raw: string) {
    this.items.push(...speechChunks(raw));
    void this.pump();
  }

  private async pump() {
    if (this.running || this.cancelled) return;
    this.running = true;
    try {
      while (this.items.length && !this.cancelled) {
        await this.player.speak(this.items.shift()!);
      }
    } catch (error) {
      if (!this.cancelled) {
        this.failure = error;
        this.items = [];
        this.onError(error);
      }
    } finally {
      this.running = false;
      for (const resolve of this.waiters.splice(0)) resolve();
    }
  }

  async finish() {
    if (this.cancelled) return;
    this.enqueue(this.pending);
    this.pending = "";
    if (this.running) await new Promise<void>((resolve) => this.waiters.push(resolve));
    if (this.failure) throw this.failure;
  }

  cancel() {
    this.cancelled = true;
    this.pending = "";
    this.items = [];
    this.player.stop();
    for (const resolve of this.waiters.splice(0)) resolve();
  }
}
