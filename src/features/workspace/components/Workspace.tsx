"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { AccountForm } from "@/features/auth";
import Markdown from "react-markdown";
import { Icon, Sidebar } from "@/common/components";
import { OperatorCore, CsvAttachment } from "@/features/operator";
import type { AgentRequest, CsvFile } from "@/features/operator";
import { SpeechPlayer, useDictation, appendDictation, useLiveConversation } from "@/features/voice";
import type { VoiceState } from "@/features/voice";
import { readChatStream } from "@/features/operator";
import AgentRequestCard from "./AgentRequestCard";
import { attachRequests, placeRequest } from "../services/requests";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  note?: string;
  requests?: AgentRequest[];
};

const suggestions = [
  { title: "Find my next step", text: "Help me choose the next practical step for my business. Ask me what you need to know." },
  { title: "Plan my day", text: "Help me create a daily operations checklist for my business." },
  { title: "Think through an idea", text: "I have a business idea. Help me think it through and decide where to begin." },
];

export default function Workspace() {
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountError, setAccountError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraftValue] = useState("");
  const draftValue = useRef("");
  const [attachment, setAttachment] = useState<CsvFile | null>(null);
  const [readingCsv, setReadingCsv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Ready when you are");
  const controller = useRef<AbortController | null>(null);
  const sessionId = useRef<string | null>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const voice = useRef<SpeechPlayer | null>(null);
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [dictationLimit, setDictationLimit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
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
    voice.current?.stop();
    setVoiceError("");
    setDictationLimit(false);
  });
  const dictating = dictation.state !== "idle";
  const live = useLiveConversation({
    player: () => voice.current,
    send: (text, onToken) => sendTurn(text, onToken),
    abort: () => controller.current?.abort(),
    transcript: (text) => setDraft(text),
  });
  const liveActive = live.state !== "off";

  function toggleLive() {
    if (live.isActive()) { live.stop(); return; }
    dictation.cancel();
    voice.current?.stop();
    setChatMode(false);
    live.start(dictation.language, draftValue.current);
  }

  function microphone() {
    if (live.isActive()) {
      if (live.state === "responding") live.interrupt();
      else live.finishTurn();
    } else dictation.toggle();
  }

  useEffect(() => {
    if ((dictationLimit || draft.length >= 8000) && dictation.isActive()) {
      dictation.cancel();
      setDictationLimit(true);
    }
  }, [draft, dictating, dictationLimit]);

  useEffect(() => {
    const element = conversation.current;
    if (element && followMessages.current) element.scrollTop = element.scrollHeight;
  }, [messages, expanded, account]);

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

  useEffect(() => {
    const player = new SpeechPlayer(setVoiceState, setAnalyser);
    voice.current = player;
    try {
      const saved = localStorage.getItem("mula.voice-muted") === "true";
      mutedRef.current = saved;
      setMuted(saved);
    } catch {
      setVoiceError("Your browser cannot remember voice preferences. You can still mute this session.");
    }
    function onVisibility() {
      if (document.hidden) player.stop();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.current?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      void player.dispose();
      voice.current = null;
    };
  }, []);

  function reportVoiceError(failure: unknown) {
    if (failure instanceof Error) setVoiceError(failure.message);
    else setVoiceError("AI voice is unavailable. You can still use chat.");
  }

  function setChatMode(chatOnly: boolean) {
    if (chatOnly) live.stop();
    else if (live.isActive()) return;
    mutedRef.current = chatOnly;
    setMuted(chatOnly);
    setVoiceError("");
    voice.current?.stop();
    if (!chatOnly) void voice.current?.unlock().catch(reportVoiceError);
    try {
      localStorage.setItem("mula.voice-muted", String(chatOnly));
    } catch {
      setVoiceError("Voice preference applies for this session; your browser could not save it.");
    }
  }

  function playReply(text: string) {
    if (mutedRef.current || document.hidden || dictation.isActive() || live.isActive()) return;
    setVoiceError("");
    void voice.current?.speak(text).catch(reportVoiceError);
  }

  function updateReply(id: string, text: string, note?: string) {
    setMessages((previous) =>
      previous.map((message) => {
        if (message.id === id) return { ...message, text, note };
        return message;
      }),
    );
  }

  function showRequest(messageId: string, request: AgentRequest) {
    setMessages((previous) => placeRequest(previous, messageId, request));
  }

  async function responseError(response: Response, fallback: string) {
    const failure = await response.json().catch(() => ({}));
    if (typeof failure.detail === "string") return new Error(failure.detail);
    return new Error(fallback);
  }

  // Requests change on the server too (another tab, expiry), so re-read them after a refusal.
  async function refreshRequests() {
    const response = await fetch("/api/conversation", { cache: "no-store" });
    if (!response.ok) return;
    const saved = await response.json();
    setMessages((previous) => attachRequests(previous, saved.requests));
  }

  async function declineRequest(requestId: string) {
    setError("");
    try {
      const response = await fetch(`/api/agents/requests/${requestId}/decline`, { method: "POST" });
      if (!response.ok) {
        setError((await responseError(response, "Could not update this request. Please retry.")).message);
        await refreshRequests();
        return;
      }
      const saved = await response.json();
      setMessages((previous) => attachRequests(previous, [saved.request]));
    } catch {
      setError("Could not reach Mula to update this request. Check your connection and retry.");
    }
  }

  // Runs the other agent, then streams the Operator's relay of its answer as a new reply.
  async function approveRequest(requestId: string) {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    followMessages.current = true;
    const relayId = crypto.randomUUID();
    let relayShown = false;
    let relay = "";
    let relayNote = "Answer from another agent";
    let current: AgentRequest | undefined;
    setError("");
    setBusy(true);
    setStatus("Asking another agent…");
    try {
      const response = await fetch(`/api/agents/requests/${requestId}/approve`, { method: "POST", signal: abort.signal });
      if (!response.ok) {
        await refreshRequests();
        throw await responseError(response, "Could not start this request. Please retry.");
      }
      if (!response.body) throw new Error("Streaming is unavailable in this browser.");
      await readChatStream(response.body, (chunk) => {
        if (chunk.type === "request" && chunk.request) {
          // Requests the Operator makes while relaying belong under the relay.
          if (chunk.request.id === requestId) current = chunk.request;
          showRequest(relayId, chunk.request);
          if (chunk.request.id === requestId && chunk.request.status === "answered" && !relayShown) {
            relayShown = true;
            relayNote = `Answer from ${chunk.request.to_name}`;
            setMessages((previous) => [...previous, { id: relayId, role: "assistant", text: "" }]);
          }
        }
        if (chunk.type === "token" && typeof chunk.content === "string") {
          relay += chunk.content;
          updateReply(relayId, relay);
        }
        if (chunk.type === "done") {
          let note = relayNote;
          if (chunk.truncated) note += " · Reply reached its length limit.";
          updateReply(relayId, relay, note);
        }
      });
      if (abort.signal.aborted) return;
      playReply(relay);
      setStatus("Ready when you are");
    } catch (failure) {
      // The server marks an unfinished request as failed; mirror that without reloading.
      if (current?.status === "running") showRequest(relayId, { ...current, status: "failed" });
      if (abort.signal.aborted) {
        if (relayShown) updateReply(relayId, relay, "Stopped by you.");
        setStatus("Reply stopped");
      } else {
        let detail = "Could not complete the request. Check your connection and try again.";
        if (failure instanceof Error) detail = failure.message;
        setError(detail);
        if (relayShown) updateReply(relayId, relay, "Reply incomplete.");
        setStatus("Could not complete request");
      }
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (live.isActive()) return;
    await sendTurn(draftValue.current);
  }

  async function sendTurn(rawText: string, onToken?: (token: string) => void): Promise<boolean> {
    let text = rawText.trim();
    if (controller.current || readingCsv || dictation.isActive() || (!text && !attachment)) return false;
    if (!text) text = "Summarize this CSV and highlight useful findings.";
    const attachedCsv = attachment;
    let attachmentNote: string | undefined;
    if (attachedCsv) attachmentNote = `CSV: ${attachedCsv.name}`;

    voice.current?.stop();
    setVoiceError("");
    // Unlock audio during the user's gesture, before waiting for the LLM.
    if (!mutedRef.current) void voice.current?.unlock().catch(reportVoiceError);
    followMessages.current = true;
    const abort = new AbortController();
    controller.current = abort;
    const replyId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    setMessages((previous) => [
      ...previous,
      { id: userId, role: "user", text, note: attachmentNote },
      { id: replyId, role: "assistant", text: "" },
    ]);
    setDraft("");
    setAttachment(null);
    setError("");
    setBusy(true);
    setStatus("Connecting to Operator…");
    let reply = "";
    let firstToken = true;
    let completed = false;
    // "Go ahead" requests run as soon as the Operator's reply ends.
    const approvedInAdvance: string[] = [];
    const start = performance.now();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          stream: true,
          session_id: sessionId.current,
          csv_file: attachedCsv,
        }),
        signal: abort.signal,
      });
      if (!response.ok) {
        const failure = await response.json();
        if (typeof failure.detail === "string") throw new Error(failure.detail);
        throw new Error(
          "Please send a message of 1–8,000 characters and try again.",
        );
      }
      if (!response.body)
        throw new Error("Streaming is unavailable in this browser.");

      await readChatStream(response.body, (chunk) => {
        if (chunk.type === "memory") {
          const notes: string[] = [];
          if (chunk.note) notes.push(chunk.note);
          if (chunk.paths?.length) notes.push("Memory used: " + chunk.paths.join(", "));
          updateReply(userId, text, [attachmentNote, ...notes].filter(Boolean).join(" · "));
        }
        if (chunk.type === "attachment" && typeof chunk.note === "string") {
          updateReply(userId, text, chunk.note);
        }
        if (chunk.type === "token" && typeof chunk.content === "string") {
          if (firstToken) {
            setStatus(
              `Reply started in ${((performance.now() - start) / 1000).toFixed(1)}s`,
            );
            firstToken = false;
          }
          reply += chunk.content;
          updateReply(replyId, reply);
          if (!abort.signal.aborted) onToken?.(chunk.content);
        }
        if (chunk.type === "request" && chunk.request) {
          showRequest(replyId, chunk.request);
          if (chunk.request.approved_in_advance && chunk.request.status === "pending") approvedInAdvance.push(chunk.request.id);
        }
        if (chunk.type === "done" && chunk.truncated) {
          updateReply(
            replyId,
            reply,
            "Reply reached its length limit. Ask for a shorter answer or a specific section.",
          );
        }
      });
      if (abort.signal.aborted) return false;
      if (!onToken) playReply(reply);
      setStatus("Ready when you are");
      completed = true;
      return true;
    } catch (failure) {
      if (!onToken || !abort.signal.aborted) setAttachment(attachedCsv);
      if (abort.signal.aborted) {
        let note = "Stopped by you.";
        if (onToken) note = "Voice reply interrupted.";
        updateReply(replyId, reply, note);
        setStatus("Reply stopped");
      } else {
        let detail =
          "Could not complete the reply. Check your connection and try again.";
        if (failure instanceof Error) detail = failure.message;
        setError(detail);
        updateReply(replyId, reply, "Reply incomplete.");
        // Restore the question so a failed request can be edited and sent again.
        setDraft(text);
        setStatus("Could not complete reply");
      }
      return false;
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
        if (!onToken) input.current?.focus();
        const next = approvedInAdvance[0];
        if (completed && next) void approveRequest(next);
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      form.current?.requestSubmit();
    }
  }

  async function loadAccount() {
    setAccountError("");
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (response.status === 401) {
      setAccount(null);
      return;
    }
    if (!response.ok) throw new Error("Could not load your account. Check the backend and retry.");
    const user = await response.json();
    const conversation = await fetch("/api/conversation", { cache: "no-store" });
    if (!conversation.ok) throw new Error("Could not load your conversation. Please retry.");
    const saved = await conversation.json();
    sessionId.current = saved.session_id;
    const messages = saved.messages.map((message: Message) => ({ ...message, id: String(message.id) }));
    setMessages(attachRequests(messages, saved.requests ?? []));
    setAccount(user);
  }

  useEffect(() => {
    loadAccount().catch((failure: Error) => setAccountError(failure.message)).finally(() => setLoading(false));
  }, []);

  async function signOut() {
    live.stop();
    dictation.cancel();
    voice.current?.stop();
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { setError("Could not sign out. Please retry."); return; }
    // Also stop work started while the sign-out request was in flight.
    controller.current?.abort();
    dictation.cancel();
    voice.current?.stop();
    sessionId.current = null;
    setMessages([]);
    setDraft("");
    setAttachment(null);
    setError("");
    setAccount(null);
    setVoiceError("");
    setStatus("Ready when you are");
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening your chat…</span></p></main>;
  if (accountError) return <main className="account-screen"><div><p role="alert">{accountError}</p><button onClick={() => { setLoading(true); loadAccount().catch((failure: Error) => setAccountError(failure.message)).finally(() => setLoading(false)); }}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={loadAccount} />;

  let presence = "Ready when you are";
  if (busy) presence = "Thinking with you…";
  if (voiceState === "preparing") presence = "Preparing voice…";
  if (voiceState === "speaking") presence = "Speaking…";
  if (dictation.state === "starting") presence = "Allow microphone access to begin…";
  if (dictation.state === "listening") presence = "Listening…";
  if (dictation.state === "stopping") presence = "Finishing dictation…";
  if (live.state === "starting") presence = "Starting live conversation…";
  if (live.state === "listening") presence = "Listening · pause to send";
  // The status line shimmers while Mula is preparing something and pulses while audio is live.
  const preparing = busy || voiceState === "preparing" || dictation.state === "starting" || dictation.state === "stopping" || live.state === "starting";
  const audioLive = voiceState === "speaking" || dictation.state === "listening" || live.state === "listening";
  let presenceClass = "";
  if (preparing) presenceClass = "shimmer";
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
  let mainClass = "main-panel";
  if (expanded) mainClass += " conversation-expanded";

  function suggest(text: string) {
    setDraft(text);
    input.current?.focus();
  }

  return (
    <div className="app-shell">
      <Sidebar active="workspace" username={account.username} onSignOut={signOut} busy={busy} />

      <main className={mainClass}>
        <header className="topbar">
          <a className="mobile-brand" href="/"><span className="brand-word">WORKSPACE</span></a>
          <div className="topbar-actions"><a className="mobile-team-link" href="/agents">My agents</a><a className="mobile-team-link" href="/memory">Memory</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut} disabled={busy}><Icon name="exit" /></button></div>
        </header>

        <section className="operator-stage" aria-label="Your Operator">
          <OperatorCore analyser={analyser} />
          <h1>I’m here. What are we building today?</h1>
          <div className="presence" role="status"><span className="presence-dot" data-live={audioLive} /><span className={presenceClass}>{presence}</span></div>
        </section>

        <div className="conversation-heading">
          <button className="text-button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
            {!expanded && "Expand chat"}{expanded && "Show Operator"}
          </button>
        </div>
        <div className="conversation" ref={conversation} onScroll={() => {
          const element = conversation.current;
          if (element) followMessages.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}>
          {messages.length === 0 && <div className="empty-conversation">
            <p>Every beginning starts with a conversation.</p>
            <div className="suggestions">{suggestions.map((suggestion) => <button key={suggestion.title} type="button" className="suggestion" onClick={() => suggest(suggestion.text)} disabled={busy}>{suggestion.title}</button>)}</div>
          </div>}
          <section className="messages" role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions text">
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <div className="message-label">{message.role === "assistant" && "Mula"}{message.role === "user" && "You"}</div>
                <div className="message-body">
                  {message.text && <div className="message-text">
                    {message.role === "assistant" && <Markdown skipHtml components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" /> }}>{message.text}</Markdown>}
                    {message.role === "user" && message.text}
                  </div>}
                  {!message.text && !message.note && <div className="waiting"><span /><span /><span /><span className="waiting-label">Preparing your reply</span></div>}
                  {message.note && <p className="message-note">{message.note}</p>}
                  {message.requests?.map((request) => <AgentRequestCard key={request.id} request={request} disabled={busy} onApprove={(id) => void approveRequest(id)} onDecline={(id) => void declineRequest(id)} />)}
                  {message.role === "assistant" && message.text && !busy && !muted && !dictating && !liveActive && <button className="play-reply text-button" onClick={() => playReply(message.text)}><Icon name="voice" />Play reply</button>}
                </div>
              </article>
            ))}
          </section>
        </div>

        <div className="composer-wrap">
          {error && <div className="error" role="alert">{error}</div>}
          {voiceError && <div className="error" role="status">{voiceError} <button type="button" className="text-button" onClick={() => setVoiceError("")}>Dismiss</button></div>}
          {live.error && <div className="error" role="alert">{live.error} <button className="text-button" onClick={live.dismissError}>Dismiss</button></div>}
          {dictation.error && <div className="error" role="alert">{dictation.error} <button className="text-button" onClick={dictation.dismissError}>Dismiss</button></div>}
          {dictationLimit && <p className="composer-hint" role="status">The message reached 8,000 characters. Dictation stopped; review the captured text.</p>}
          {!dictation.supported && <p className="composer-hint">Speech input needs a supported browser on localhost or HTTPS. You can still type.</p>}
          {liveActive && <p className="composer-hint" role="status">Live · pause to send · microphone to interrupt{live.interim && <span className="interim-transcript">{live.interim}</span>}</p>}
          {dictating && <p className="composer-hint" role="status"><span className="presence-dot" data-live={audioLive} />{presence}{dictation.interim && <span className="interim-transcript">{dictation.interim}</span>}</p>}
          <CsvAttachment value={attachment} onChange={setAttachment} onError={setError} onReading={setReadingCsv} disabled={busy || liveActive}>
          <form ref={form} className="composer" onSubmit={sendMessage}>
            <label htmlFor="message" className="sr-only">Message Mula</label>
            <textarea ref={input} id="message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} maxLength={8000} rows={1} placeholder="Ask Mula anything…" disabled={busy} readOnly={liveActive} />
            <button type="button" className={micClass} aria-label={micLabel} title={micLabel} aria-pressed={dictating || live.state === "listening"} disabled={(busy && !liveActive) || !dictation.supported || live.state === "starting"} onClick={microphone}><Icon name="microphone" /></button>
            <button type="button" className="live-button icon-button" aria-label={liveLabel} title={liveLabel} aria-pressed={liveActive} onClick={toggleLive} disabled={!dictation.supported || (!liveActive && (busy || readingCsv))}><Icon name="live" /></button>
            <div className="composer-menu" ref={menu}>
              <button type="button" className="icon-button" aria-label="Voice options" aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name="options" /></button>
              {menuOpen && <div className="composer-menu-panel" role="group" aria-label="Voice options">
                <div className="menu-row"><span>Replies</span>
                  <div className="mode-switch" role="group" aria-label="AI response mode">
                    <button type="button" aria-pressed={muted} onClick={() => setChatMode(true)}>Chat</button>
                    <button type="button" aria-pressed={!muted} onClick={() => setChatMode(false)}>Voice</button>
                  </div>
                </div>
                {dictation.supported && <div className="menu-row"><label htmlFor="dictation-language">Speech language</label><select id="dictation-language" value={dictation.language} onChange={(event) => dictation.changeLanguage(event.target.value)} disabled={busy || dictating || liveActive}><option value="en-US">English</option><option value="id-ID">Bahasa Indonesia</option></select></div>}
                <p>Voice replies are read aloud. Browser speech service may process audio online.</p>
              </div>}
            </div>
            {busy && <button type="button" className="send-button stop-button" aria-label="Stop reply" onClick={() => { live.stop(); controller.current?.abort(); voice.current?.stop(); }}><Icon name="stop" /></button>}
            {!busy && <button type="submit" className="send-button" disabled={readingCsv || dictating || liveActive || (!draft.trim() && !attachment)} aria-label="Send message"><Icon name="send" /></button>}
          </form>
          </CsvAttachment>
          {voiceState !== "idle" && <div className="composer-foot"><button className="text-button" onClick={() => { live.stop(); voice.current?.stop(); }}>Stop audio</button></div>}
          <span className="sr-only" role="status">{status}</span>
        </div>
      </main>
    </div>
  );
}
