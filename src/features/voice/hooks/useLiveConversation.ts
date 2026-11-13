"use client";

import { useEffect, useRef, useState } from "react";
import { recognitionConstructor } from "../services/dictation";
import { LiveConversation } from "../services/liveConversation";
import type { LiveState } from "../services/liveConversation";
import type { SpeechPlayer } from "../services/speech";

type Options = {
  player: () => SpeechPlayer | null;
  send: (text: string, onToken: (token: string) => void) => Promise<boolean>;
  abort: () => void;
  transcript: (final: string) => void;
};

export function useLiveConversation(options: Options) {
  const [state, setState] = useState<LiveState>("off");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const latest = useRef(options);
  latest.current = options;
  const controller = useRef<LiveConversation | null>(null);

  useEffect(() => {
    const factory = recognitionConstructor();
    if (!factory || !window.isSecureContext) return;
    let disposed = false;
    function player() {
      const current = latest.current.player();
      if (!current) throw new Error("Voice output is not ready. Try starting live conversation again.");
      return current;
    }
    const conversation = new LiveConversation(factory, {
      player: {
        unlock: () => player().unlock(), speak: (text) => player().speak(text),
        stop: () => latest.current.player()?.stop(),
      },
      send: (text, onToken) => latest.current.send(text, onToken),
      abort: () => latest.current.abort(),
      transcript: (final, preview) => {
        if (!disposed) { latest.current.transcript(final); setInterim(preview); }
      },
      state: (value) => { if (!disposed) setState(value); },
      error: (value) => { if (!disposed) setError(value); },
    });
    controller.current = conversation;
    function hide() { if (document.hidden) conversation.stop("Live conversation ended when you left the tab."); }
    document.addEventListener("visibilitychange", hide);
    return () => {
      disposed = true;
      conversation.stop();
      controller.current = null;
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  return {
    state, interim, error,
    start: (language: string, initialText: string) => { void controller.current?.start(language, initialText); },
    stop: () => controller.current?.stop(),
    interrupt: () => controller.current?.interrupt(),
    finishTurn: () => controller.current?.finishTurn(),
    isActive: () => controller.current?.isActive() || false,
    dismissError: () => setError(""),
  };
}
