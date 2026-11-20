"use client";

// Everything the shared composer and stage need, for both the workspace assistant and a project's
// Operator: the draft, dictation, live conversation, spoken replies, mute and whether a reply is
// on its way. The chat that owns the messages connects its own send and stop with `connect`, so
// live conversation and the mic behave the same on both pages.
import { useEffect, useRef, useState } from "react";
import { SpeechPlayer, appendDictation, useDictation, useLiveConversation } from "@/features/voice";
import type { VoiceState } from "@/features/voice";
import { isPreparing, orbStateFor, presenceFor, readMuted, writeMuted } from "../services/chat";
import type { Activity } from "../services/chat";

/** One turn: send `text`; a live conversation passes `onToken` to hear the reply as it arrives. */
export type SendTurn = (text: string, onToken?: (token: string) => void) => Promise<boolean>;
type Connection = { send: SendTurn; abort: () => void };

export const MAX_MESSAGE = 8000;

function localStorageOrNull() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useChatComposer() {
  const [draft, setDraftValue] = useState("");
  const draftValue = useRef("");
  const [dictationLimit, setDictationLimit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMutedValue] = useState(false);
  const mutedRef = useRef(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const player = useRef<SpeechPlayer | null>(null);
  const connection = useRef<Connection | null>(null);

  function setDraft(value: string) {
    draftValue.current = value;
    setDraftValue(value);
    setDictationLimit(false);
  }

  const dictation = useDictation((transcript) => {
    const result = appendDictation(draftValue.current, transcript);
    setDraft(result.text);
    if (result.truncated) setDictationLimit(true);
  }, () => {
    player.current?.stop();
    setVoiceError("");
    setDictationLimit(false);
  });

  const live = useLiveConversation({
    player: () => player.current,
    send: (text, onToken) => {
      if (connection.current === null) return Promise.resolve(false);
      return connection.current.send(text, onToken);
    },
    abort: () => connection.current?.abort(),
    transcript: (text) => setDraft(text),
  });

  // Dictation stops at the message limit rather than cutting words off silently.
  const dictating = dictation.state !== "idle";
  useEffect(() => {
    if ((dictationLimit || draft.length >= MAX_MESSAGE) && dictation.isActive()) {
      dictation.cancel();
      setDictationLimit(true);
    }
  }, [draft, dictating, dictationLimit]);

  useEffect(() => {
    const speech = new SpeechPlayer(setVoiceState, setAnalyser);
    player.current = speech;
    const saved = readMuted(localStorageOrNull());
    mutedRef.current = saved;
    setMutedValue(saved);
    function onVisibility() {
      if (document.hidden) speech.stop();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void speech.dispose();
      player.current = null;
    };
  }, []);

  function reportVoiceError(failure: unknown) {
    if (failure instanceof Error) setVoiceError(failure.message);
    else setVoiceError("AI voice is unavailable. You can still use chat.");
  }

  /** Muted means chat only: replies are not read aloud. Live conversation needs the voice, so muting ends it. */
  function setMuted(next: boolean) {
    if (next) live.stop();
    else if (live.isActive()) return;
    mutedRef.current = next;
    setMutedValue(next);
    setVoiceError("");
    player.current?.stop();
    if (!next) void player.current?.unlock().catch(reportVoiceError);
    if (!writeMuted(localStorageOrNull(), next)) setVoiceError("Voice preference applies for this visit; your browser could not save it.");
  }

  /** Reads a reply aloud unless muted, hidden, or the owner is speaking. */
  function playReply(text: string) {
    if (mutedRef.current || document.hidden || dictation.isActive() || live.isActive()) return;
    setVoiceError("");
    void player.current?.speak(text).catch(reportVoiceError);
  }

  /** Plays a recording made ahead of time (the spoken welcome). Errors are the caller's to show. */
  async function playRecording(url: string) {
    if (mutedRef.current || player.current === null) return;
    await player.current.play(url);
  }

  /** Call during the owner's gesture (send, tap), before waiting for a reply, so audio may start later. */
  function unlockAudio() {
    player.current?.stop();
    setVoiceError("");
    if (!mutedRef.current) void player.current?.unlock().catch(reportVoiceError);
  }

  function microphone() {
    if (live.isActive()) {
      if (live.state === "responding") live.interrupt();
      else live.finishTurn();
      return;
    }
    dictation.toggle();
  }

  function toggleLive() {
    if (live.isActive()) {
      live.stop();
      return;
    }
    dictation.cancel();
    player.current?.stop();
    setMuted(false);
    live.start(dictation.language, draftValue.current);
  }

  /** Stops the reply, live conversation and any audio. */
  function stopAll() {
    live.stop();
    connection.current?.abort();
    player.current?.stop();
  }

  const activity: Activity = { busy, voice: voiceState, dictation: dictation.state, live: live.state };
  return {
    draft, draftValue, setDraft, dictationLimit,
    busy, setBusy,
    muted, setMuted,
    voiceState, voiceError, setVoiceError, analyser,
    dictation, live,
    /** The chat that owns the messages registers its send and stop here (in an effect). */
    connect: (next: Connection | null) => { connection.current = next; },
    playReply, playRecording, unlockAudio, microphone, toggleLive, stopAll,
    stopAudio: () => player.current?.stop(),
    presence: presenceFor(activity),
    preparing: isPreparing(activity),
    orbState: orbStateFor(activity),
    /** "Play reply" is offered only when nothing else is talking or on its way, as in the project chat before. */
    canPlay: !busy && !muted && dictation.state === "idle" && live.state === "off",
    audioLive: voiceState === "speaking" || dictation.state === "listening" || live.state === "listening",
  };
}

export type ChatComposerState = ReturnType<typeof useChatComposer>;
