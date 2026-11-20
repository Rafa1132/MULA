"use client";

// The workspace's first screen: the shared chat screen (features/chat) with the owner's assistant,
// plus what only the workspace has: the entrance, "Tap to begin" with the spoken welcome, and a cue
// down to the projects. Browsers block audio until the owner interacts, so the welcome starts on
// that tap (or a tap on the orb), with the same words shown as the first chat line. Returning
// owners get a silent orb and their chat.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChatStage, useChatComposer } from "@/features/chat";
import { AssistantPanel } from "@/features/orchestrator";
import { fetchOnboarding, markWelcomeHeard } from "@/features/orchestrator/services/orchestrator";
import type { CreatedProject, OnboardingState } from "@/features/orchestrator/services/orchestrator";
import { entranceFor, entranceMs, mayFocusInput, takeEntranceSeen } from "../services/entry";
import type { Entrance } from "../services/entry";

type Props = {
  brand: ReactNode;
  account: ReactNode;
  onProjectCreated: (project: CreatedProject) => void;
};

const WELCOME_AUDIO = "/api/speech/welcome";
const CHAT_INPUTS = "#assistant #onboarding-answer, #assistant #assistant-message";

function sessionStorageOrNull() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function matches(query: string) {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** Decided once, on the first render: the stage never re-plays its entrance during a visit. */
function initialEntrance(): Entrance {
  return entranceFor(matches("(prefers-reduced-motion: reduce)"), takeEntranceSeen(sessionStorageOrNull()));
}

/**
 * Nothing has the focus yet. "Tap to begin" counts as free too: it is about to disappear, and the
 * welcome it starts hands the focus on to the chat.
 */
function focusIsFree() {
  const active = document.activeElement;
  if (active === null || active === document.body) return true;
  return active.classList.contains("entry-begin-button");
}

export default function EntryStage({ brand, account, onProjectCreated }: Props) {
  const [entrance] = useState(initialEntrance);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [begun, setBegun] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const [entered, setEntered] = useState(entrance === "none");
  const beginButton = useRef<HTMLButtonElement>(null);
  const composer = useChatComposer();

  const waiting = onboarding !== null && onboarding.welcome_pending && !begun;

  useEffect(() => {
    fetchOnboarding()
      .then(setOnboarding)
      .catch((failure) => { if (failure instanceof Error) setLoadError(failure.message); });
  }, []);

  // The chat is ready once the entrance has played (at once under reduced motion).
  useEffect(() => {
    if (entered) return;
    const timer = window.setTimeout(() => setEntered(true), entranceMs(entrance));
    return () => window.clearTimeout(timer);
  }, [entered, entrance]);

  // Focus lands on "Tap to begin" for a new account, otherwise in the chat input. It moves only
  // when the stage becomes ready and when the welcome starts, and only if the owner hasn't already
  // put it somewhere (e.g. tabbed to a project during the entrance), so it is never pulled away.
  const ready = entered && onboarding !== null;
  useEffect(() => {
    if (!ready || !focusIsFree()) return;
    if (waiting) {
      beginButton.current?.focus();
      return;
    }
    focusChatInput();
  }, [ready, waiting]);

  function focusChatInput() {
    if (!mayFocusInput(matches("(pointer: coarse)"))) return;
    // The input renders with the chat; wait a frame for it.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(CHAT_INPUTS)?.focus());
  }

  async function begin(withSound: boolean) {
    if (!waiting) return;
    setBegun(true);
    setVoiceNote("");
    // Marked first, so the welcome never plays twice, even if the audio fails.
    markWelcomeHeard().then(setOnboarding).catch(() => undefined);
    if (!withSound) return;
    try {
      await composer.playRecording(WELCOME_AUDIO);
    } catch (failure) {
      // The words are already in the chat, so nothing is lost; say why there is no sound.
      let message = "The welcome couldn't play, so it's shown as text.";
      if (failure instanceof Error && failure.message) message = `${failure.message} The welcome is shown as text.`;
      setVoiceNote(message);
    }
  }

  let assistantName = "Operator";
  if (onboarding) assistantName = onboarding.assistant_name;
  // The orb is a pointer shortcut for "Tap to begin" only while the welcome is waiting.
  let onOrbClick: (() => void) | undefined;
  if (waiting) onOrbClick = () => { void begin(true); };

  return <ChatStage id="assistant" className="entry-stage" entrance={entrance} composer={composer} name={assistantName} title="Your workspace"
    start={brand} end={account} onOrbClick={onOrbClick}
    footer={<a className="entry-cue" href="#projects">Your projects <span aria-hidden="true">↓</span></a>}>
    {loadError && <p className="error" role="alert">{loadError}</p>}
    {!loadError && onboarding === null && <p role="status"><span className="shimmer">Opening your assistant…</span></p>}
    {waiting && <div className="entry-begin">
      <button ref={beginButton} type="button" className="account-submit entry-begin-button" onClick={() => { void begin(true); }}>Tap to begin</button>
      <button type="button" className="entry-quiet" onClick={() => { void begin(false); }}>Start without sound</button>
    </div>}
    {voiceNote && <p className="entry-voice-note" role="status">{voiceNote}</p>}
    {onboarding !== null && !waiting && <AssistantPanel state={onboarding} onChange={setOnboarding} composer={composer} onProjectCreated={onProjectCreated} />}
  </ChatStage>;
}
