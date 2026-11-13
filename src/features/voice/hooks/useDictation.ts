"use client";

import { useEffect, useRef, useState } from "react";
import { Dictation, recognitionConstructor } from "../services/dictation";
import type { DictationState } from "../services/dictation";

export function useDictation(onText: (text: string) => void, beforeStart: () => void) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<DictationState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("en-US");
  const engine = useRef<Dictation | null>(null);
  const currentState = useRef<DictationState>("idle");
  const onTextRef = useRef(onText);
  const beforeStartRef = useRef(beforeStart);
  onTextRef.current = onText;
  beforeStartRef.current = beforeStart;

  useEffect(() => {
    let initialLanguage = "en-US";
    if (navigator.language.toLowerCase().startsWith("id")) initialLanguage = "id-ID";
    try {
      const saved = localStorage.getItem("mula.dictation-language");
      if (saved === "id-ID" || saved === "en-US") initialLanguage = saved;
    } catch { /* A blocked preference store does not prevent dictation. */ }
    setLanguage(initialLanguage);
    const factory = recognitionConstructor();
    setSupported(Boolean(factory) && window.isSecureContext);
    if (!factory || !window.isSecureContext) return;
    let disposed = false;
    const dictation = new Dictation(factory, {
      state: (value) => { currentState.current = value; if (!disposed) setState(value); },
      interim: (value) => { if (!disposed) setInterim(value); },
      error: (value) => { if (!disposed) setError(value); },
      text: (value) => { if (!disposed) onTextRef.current(value); },
    });
    engine.current = dictation;
    function hide() { if (document.hidden) dictation.cancel(); }
    document.addEventListener("visibilitychange", hide);
    return () => {
      disposed = true;
      dictation.cancel();
      engine.current = null;
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  function toggle() {
    if (!engine.current) return;
    if (currentState.current === "starting" || currentState.current === "stopping") engine.current.cancel();
    else if (currentState.current === "listening") engine.current.stop();
    else { beforeStartRef.current(); engine.current.start(language); }
  }

  function changeLanguage(value: string) {
    if (value !== "en-US" && value !== "id-ID") return;
    setLanguage(value);
    try { localStorage.setItem("mula.dictation-language", value); }
    catch { setError("Your language selection applies to this session; the browser could not save it."); }
  }

  return { supported, state, interim, error, language, toggle, changeLanguage,
    cancel: () => engine.current?.cancel(), dismissError: () => setError(""),
    isActive: () => currentState.current !== "idle" };
}
