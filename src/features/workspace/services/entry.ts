// The workspace's first screen: how the orb enters and where keyboard focus goes. Pure functions,
// tested in tests/entry.test.mjs; EntryStage uses them. The orb's size and state, and the mute
// preference, are the shared chat's (features/chat/services/chat.ts).

/**
 * full: the first visit in this browser session. The screen is black, the orb fades and grows in
 * over about 2 seconds, then the chat appears.
 * short: a reload in the same session, so a returning owner isn't kept waiting every time.
 * none: prefers-reduced-motion, so everything is there at once.
 */
export type Entrance = "full" | "short" | "none";

export function entranceFor(reducedMotion: boolean, seenThisSession: boolean): Entrance {
  if (reducedMotion) return "none";
  if (seenThisSession) return "short";
  return "full";
}

/** When the chat has finished appearing, in ms. Matches the delays and durations in workspace.css. */
export function entranceMs(entrance: Entrance) {
  if (entrance === "full") return 2700;
  if (entrance === "short") return 500;
  return 0;
}

/**
 * Whether focus may move into the chat input on its own. On a touch screen that would open the
 * on-screen keyboard over the orb, so there the owner taps the input themselves.
 */
export function mayFocusInput(coarsePointer: boolean) {
  return !coarsePointer;
}

const ENTRANCE_KEY = "mula.workspace.entered";

/** Reads whether the full entrance already played in this session, and records that it has. */
export function takeEntranceSeen(storage: Pick<Storage, "getItem" | "setItem"> | null) {
  try {
    const seen = storage?.getItem(ENTRANCE_KEY) === "true";
    storage?.setItem(ENTRANCE_KEY, "true");
    return seen;
  } catch {
    return false;
  }
}
