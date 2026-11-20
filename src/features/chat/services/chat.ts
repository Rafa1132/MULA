// The shared chat's rules, as pure functions: what the status line says, which state the orb shows,
// how big the orb is, and the remembered voice preference. Tested in tests/chat.test.mjs; used by
// hooks/useChatComposer.ts and components/ChatStage.tsx on the workspace and in every project.
import type { OrbState } from "../../orb/services/orb.ts";

export type Activity = {
  busy: boolean;
  voice: "idle" | "preparing" | "speaking";
  dictation: "idle" | "starting" | "listening" | "stopping";
  live: "off" | "starting" | "listening" | "responding";
};

/** The status line under the orb. Later checks win, so live audio outranks "thinking". */
export function presenceFor(activity: Activity) {
  let text = "Ready when you are";
  if (activity.busy) text = "Thinking…";
  if (activity.voice === "preparing") text = "Preparing voice…";
  if (activity.voice === "speaking") text = "Speaking…";
  if (activity.dictation === "starting") text = "Allow microphone access to begin…";
  if (activity.dictation === "listening") text = "Listening…";
  if (activity.dictation === "stopping") text = "Finishing dictation…";
  if (activity.live === "starting") text = "Starting live conversation…";
  if (activity.live === "listening") text = "Listening · pause to send";
  return text;
}

/** The orb follows the same order: its voice, then the owner's voice, then a reply on its way. */
export function orbStateFor(activity: Activity): OrbState {
  if (activity.voice === "speaking") return "speaking";
  if (activity.dictation === "listening" || activity.live === "listening") return "listening";
  if (activity.busy || activity.voice === "preparing" || activity.live === "responding") return "thinking";
  return "idle";
}

/** True while something is being prepared, so the status line shimmers. */
export function isPreparing(activity: Activity) {
  return activity.busy || activity.voice === "preparing" || activity.dictation === "starting" || activity.dictation === "stopping" || activity.live === "starting";
}

// Everything on the chat screen except the orb, in px: the top bar, the name and status line, Expand
// chat, the chat log's 96 px minimum, the composer pill (with room for an error line) and the gaps.
const CHAT_CHROME_HEIGHT = 380;
// The smallest orb, the same as the expanded badge.
const MIN_ORB = 64;

/**
 * The orb's size: about half the width on a phone, between 160 and 300 px, and never more than
 * 30% of the height so the conversation keeps room under it. The screen is one window tall (the log
 * scrolls, not the page), so on a short window (under ~540 px: a laptop with devtools open, a
 * phone held sideways) the orb also gives up whatever the rest of the screen needs, down to 64 px,
 * rather than pushing the composer off the bottom. Compact (chat expanded) is 64 px.
 */
export function orbSizeFor(width: number, height: number, compact = false) {
  if (compact) return MIN_ORB;
  if (!Number.isFinite(width) || width <= 0) return 220;
  let size = Math.min(300, Math.max(160, width * 0.52));
  if (Number.isFinite(height) && height > 0) {
    const room = Math.min(height * 0.3, height - CHAT_CHROME_HEIGHT);
    size = Math.min(size, Math.max(MIN_ORB, room));
  }
  return Math.round(size);
}

// The same key the project chat has always used, so an owner's choice carries over.
const MUTE_KEY = "mula.voice-muted";

/** Browser storage can be missing or blocked (private windows); every read and write is guarded. */
export function readMuted(storage: Pick<Storage, "getItem"> | null) {
  try {
    return storage?.getItem(MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Returns false when the choice could not be saved, so the caller can say it lasts this visit only. */
export function writeMuted(storage: Pick<Storage, "setItem"> | null, muted: boolean) {
  try {
    if (storage === null) return false;
    storage.setItem(MUTE_KEY, String(muted));
    return true;
  } catch {
    return false;
  }
}
