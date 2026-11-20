"use client";

// The shared composer: one pill with the message field, the mic (dictation), live conversation,
// voice options (spoken replies on or off, speech language) and Send, which turns into Stop while
// a reply is on its way. Enter sends, Shift+Enter adds a line. Errors and hints sit above it.
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { Icon } from "@/common/components";
import type { ChatComposerState } from "../hooks/useChatComposer";

type Props = {
  composer: ChatComposerState;
  inputId: string;
  label: string;
  placeholder: string;
  maxLength: number;
  onSend: () => void;
  /** Extra reasons sending is not possible yet (e.g. a CSV still being read). */
  blocked?: boolean;
  /** Whether a message can go with an empty field (e.g. a CSV is attached). */
  sendsEmpty?: boolean;
  /** Live conversation needs a chat that can take spoken turns; onboarding answers can't. */
  liveAvailable?: boolean;
  /** While loading the conversation the field is off. */
  disabled?: boolean;
  /** Wraps the form, e.g. in the CSV drop zone (which is then the pill). */
  wrap?: (form: ReactNode) => ReactNode;
  /** Shown above the pill (a skip button, a request error). */
  above?: ReactNode;
};

export default function ChatComposer({ composer, inputId, label, placeholder, maxLength, onSend, blocked = false, sendsEmpty = false, liveAvailable = true, disabled = false, wrap, above }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const { dictation, live, busy } = composer;
  const dictating = dictation.state !== "idle";
  const liveActive = live.state !== "off";

  // The voice options menu closes on a click elsewhere or Escape, like a native menu.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menu.current && !menu.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (live.isActive()) return;
    onSend();
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  let micLabel = "Start dictation";
  if (!dictation.supported) micLabel = "Speech input unavailable in this browser";
  else if (dictation.state === "listening") micLabel = "Stop dictation";
  else if (dictating) micLabel = "Cancel dictation";
  if (live.state === "responding") micLabel = "Interrupt and speak";
  else if (live.state === "listening") micLabel = "Finish spoken turn";
  else if (live.state === "starting") micLabel = "Starting live conversation";
  let micClass = "dictation-button icon-button";
  if (dictating || live.state === "listening") micClass += " recording";
  let liveLabel = "Start live conversation";
  if (liveActive) liveLabel = "End live conversation";
  const hasText = composer.draft.trim().length > 0;
  const canSend = !blocked && !dictating && !liveActive && !disabled && (hasText || sendsEmpty);

  const form = <form className="composer" onSubmit={submit}>
    <label htmlFor={inputId} className="sr-only">{label}</label>
    <textarea id={inputId} value={composer.draft} onChange={(event) => composer.setDraft(event.target.value)} onKeyDown={onKey}
      maxLength={maxLength} rows={1} placeholder={placeholder} disabled={busy || disabled} readOnly={liveActive} autoComplete="off" />
    <button type="button" className={micClass} aria-label={micLabel} title={micLabel} aria-pressed={dictating || live.state === "listening"}
      disabled={(busy && !liveActive) || !dictation.supported || live.state === "starting" || disabled} onClick={composer.microphone}><Icon name="microphone" /></button>
    {liveAvailable && <button type="button" className="live-button icon-button" aria-label={liveLabel} title={liveLabel} aria-pressed={liveActive}
      onClick={composer.toggleLive} disabled={!dictation.supported || disabled || (!liveActive && (busy || blocked))}><Icon name="live" /></button>}
    <div className="composer-menu" ref={menu}>
      <button type="button" className="icon-button" aria-label="Voice options" aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name="options" /></button>
      {menuOpen && <div className="composer-menu-panel" role="group" aria-label="Voice options">
        <div className="menu-row"><span>Replies</span>
          <div className="mode-switch" role="group" aria-label="AI response mode">
            <button type="button" aria-pressed={composer.muted} onClick={() => composer.setMuted(true)}>Chat</button>
            <button type="button" aria-pressed={!composer.muted} onClick={() => composer.setMuted(false)}>Voice</button>
          </div>
        </div>
        {dictation.supported && <div className="menu-row"><label htmlFor={`${inputId}-language`}>Speech language</label>
          <select id={`${inputId}-language`} value={dictation.language} onChange={(event) => dictation.changeLanguage(event.target.value)} disabled={busy || dictating || liveActive}>
            <option value="en-US">English</option><option value="id-ID">Bahasa Indonesia</option>
          </select></div>}
        <p>Voice replies are read aloud. Browser speech service may process audio online.</p>
      </div>}
    </div>
    {busy && <button type="button" className="send-button stop-button" aria-label="Stop reply" onClick={composer.stopAll}><Icon name="stop" /></button>}
    {!busy && <button type="submit" className="send-button" disabled={!canSend} aria-label="Send message"><Icon name="send" /></button>}
  </form>;

  let pill = <div className="composer-pill">{form}</div>;
  if (wrap) pill = <>{wrap(form)}</>;

  return <div className="chat-composer">
    {above}
    {composer.voiceError && <div className="error" role="status">{composer.voiceError} <button type="button" className="text-button" onClick={() => composer.setVoiceError("")}>Dismiss</button></div>}
    {live.error && <div className="error" role="alert">{live.error} <button type="button" className="text-button" onClick={live.dismissError}>Dismiss</button></div>}
    {dictation.error && <div className="error" role="alert">{dictation.error} <button type="button" className="text-button" onClick={dictation.dismissError}>Dismiss</button></div>}
    {composer.dictationLimit && <p className="composer-hint" role="status">The message reached 8,000 characters. Dictation stopped; review the captured text.</p>}
    {!dictation.supported && <p className="composer-hint">Speech input needs a supported browser on localhost or HTTPS. You can still type.</p>}
    {liveActive && <p className="composer-hint" role="status">Live · pause to send · microphone to interrupt{live.interim && <span className="interim-transcript">{live.interim}</span>}</p>}
    {dictating && <p className="composer-hint" role="status"><span className="presence-dot" data-live={composer.audioLive} />{composer.presence}{dictation.interim && <span className="interim-transcript">{dictation.interim}</span>}</p>}
    {pill}
    {composer.voiceState !== "idle" && <div className="composer-foot"><button type="button" className="text-button" onClick={() => { live.stop(); composer.stopAudio(); }}>Stop audio</button></div>}
  </div>;
}
