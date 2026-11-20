"use client";

// A project's chat with its Operator, in the shared chat screen (features/chat), so it looks and
// behaves like the workspace assistant. What only a project has stays here: replies streamed as
// they are written, a CSV attachment, and requests to other agents (with the relayed answer).
import { useEffect, useRef, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, Sidebar, ProjectSwitcher } from "@/common/components";
import { CsvAttachment, readChatStream } from "@/features/operator";
import type { AgentRequest, CsvFile } from "@/features/operator";
import { ChatComposer, ChatMessages, ChatStage, ChatSuggestions, MAX_MESSAGE, useChatComposer } from "@/features/chat";
import type { ChatLine } from "@/features/chat";
import AgentRequestCard from "./AgentRequestCard";
import { attachRequests, placeRequest } from "../services/requests";
import { projectFetch } from "@/common/services/project";
import { useProjectId } from "@/common/hooks/useProjectId";
import { projectPath } from "@/common/services/project";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  note?: string;
  requests?: AgentRequest[];
};

// The project's orchestrating agent, as it is named in server/agents/operator.md.
const AGENT_NAME = "Operator";

const suggestions = [
  { title: "Find my next step", text: "Help me choose the next practical step for my business. Ask me what you need to know." },
  { title: "Plan my day", text: "Help me create a daily operations checklist for my business." },
  { title: "Think through an idea", text: "I have a business idea. Help me think it through and decide where to begin." },
];

export default function ProjectChat() {
  const projectId = useProjectId();
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountError, setAccountError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachment, setAttachment] = useState<CsvFile | null>(null);
  const [readingCsv, setReadingCsv] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Ready when you are");
  const controller = useRef<AbortController | null>(null);
  const sessionId = useRef<string | null>(null);
  const composer = useChatComposer();
  const busy = composer.busy;

  // The composer's mic, live conversation and Stop act on this chat. Registered after every render
  // so they always see the latest state.
  useEffect(() => {
    composer.connect({ send: sendTurn, abort: () => controller.current?.abort() });
  });
  useEffect(() => () => {
    controller.current?.abort();
    composer.connect(null);
  }, []);

  function focusInput() {
    document.getElementById("message")?.focus();
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
    const response = await projectFetch("/api/conversation", { cache: "no-store" });
    if (!response.ok) return;
    const saved = await response.json();
    setMessages((previous) => attachRequests(previous, saved.requests));
  }

  async function declineRequest(requestId: string) {
    setError("");
    try {
      const response = await projectFetch(`/api/agents/requests/${requestId}/decline`, { method: "POST" });
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
    const relayId = crypto.randomUUID();
    let relayShown = false;
    let relay = "";
    let relayNote = "Answer from another agent";
    let current: AgentRequest | undefined;
    setError("");
    composer.setBusy(true);
    setStatus("Asking another agent…");
    try {
      const response = await projectFetch(`/api/agents/requests/${requestId}/approve`, { method: "POST", signal: abort.signal });
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
      composer.playReply(relay);
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
        composer.setBusy(false);
      }
    }
  }

  async function sendTurn(rawText: string, onToken?: (token: string) => void): Promise<boolean> {
    let text = rawText.trim();
    if (controller.current || readingCsv || composer.dictation.isActive() || (!text && !attachment)) return false;
    if (!text) text = "Summarize this CSV and highlight useful findings.";
    const attachedCsv = attachment;
    let attachmentNote: string | undefined;
    if (attachedCsv) attachmentNote = `CSV: ${attachedCsv.name}`;

    // Unlock audio during the user's gesture, before waiting for the LLM.
    composer.unlockAudio();
    const abort = new AbortController();
    controller.current = abort;
    const replyId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    setMessages((previous) => [
      ...previous,
      { id: userId, role: "user", text, note: attachmentNote },
      { id: replyId, role: "assistant", text: "" },
    ]);
    composer.setDraft("");
    setAttachment(null);
    setError("");
    composer.setBusy(true);
    setStatus(`Connecting to ${AGENT_NAME}…`);
    let reply = "";
    let firstToken = true;
    let completed = false;
    // "Go ahead" requests run as soon as the Operator's reply ends.
    const approvedInAdvance: string[] = [];
    const start = performance.now();

    try {
      const response = await projectFetch("/api/chat", {
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
      if (!response.ok) throw await responseError(response, "Please send a message of 1–8,000 characters and try again.");
      if (!response.body) throw new Error("Streaming is unavailable in this browser.");

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
            setStatus(`Reply started in ${((performance.now() - start) / 1000).toFixed(1)}s`);
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
          updateReply(replyId, reply, "Reply reached its length limit. Ask for a shorter answer or a specific section.");
        }
      });
      if (abort.signal.aborted) return false;
      if (!onToken) composer.playReply(reply);
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
        let detail = "Could not complete the reply. Check your connection and try again.";
        if (failure instanceof Error) detail = failure.message;
        setError(detail);
        updateReply(replyId, reply, "Reply incomplete.");
        // Restore the question so a failed request can be edited and sent again.
        composer.setDraft(text);
        setStatus("Could not complete reply");
      }
      return false;
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        composer.setBusy(false);
        if (!onToken) requestAnimationFrame(focusInput);
        const next = approvedInAdvance[0];
        if (completed && next) void approveRequest(next);
      }
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
    const conversation = await projectFetch("/api/conversation", { cache: "no-store" });
    if (!conversation.ok) throw new Error("Could not load your conversation. Please retry.");
    const saved = await conversation.json();
    sessionId.current = saved.session_id;
    const loaded = saved.messages.map((message: Message) => ({ ...message, id: String(message.id) }));
    setMessages(attachRequests(loaded, saved.requests ?? []));
    setAccount(user);
  }

  useEffect(() => {
    loadAccount().catch((failure: Error) => setAccountError(failure.message)).finally(() => setLoading(false));
  }, []);

  async function signOut() {
    composer.stopAll();
    composer.dictation.cancel();
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { setError("Could not sign out. Please retry."); return; }
    // Also stop work started while the sign-out request was in flight.
    controller.current?.abort();
    composer.stopAll();
    composer.dictation.cancel();
    sessionId.current = null;
    setMessages([]);
    composer.setDraft("");
    setAttachment(null);
    setError("");
    setAccount(null);
    composer.setVoiceError("");
    setStatus("Ready when you are");
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening your chat…</span></p></main>;
  if (accountError) return <main className="account-screen"><div><p role="alert">{accountError}</p><button onClick={() => { setLoading(true); loadAccount().catch((failure: Error) => setAccountError(failure.message)).finally(() => setLoading(false)); }}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={loadAccount} />;

  function suggest(text: string) {
    composer.setDraft(text);
    focusInput();
  }

  const lines: ChatLine[] = messages.map((message) => ({ id: message.id, role: message.role, text: message.text, note: message.note }));
  const requestsById = new Map(messages.map((message) => [message.id, message.requests ?? []]));

  return (
    <div className="app-shell">
      <Sidebar active="workspace" username={account.username} onSignOut={signOut} busy={busy} />

      <main className="main-panel">
        <ChatStage composer={composer} name={AGENT_NAME} title={`Chat with ${AGENT_NAME}`}
          start={<div className="chat-phone-only"><ProjectSwitcher /></div>}
          end={<div className="chat-phone-only">
            <a className="mobile-team-link" href={projectPath(projectId, "/agents")}>My agents</a>
            <a className="mobile-team-link" href={projectPath(projectId, "/memory")}>Memory</a>
            <button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut} disabled={busy}><Icon name="exit" /></button>
          </div>}>
          <ChatMessages lines={lines} speaker={AGENT_NAME} onPlay={composer.playReply} playable={composer.canPlay}
            empty={<ChatSuggestions intro="Every beginning starts with a conversation." items={suggestions} onPick={suggest} disabled={busy} />}
            extra={(line) => (requestsById.get(line.id) ?? []).map((request) => <AgentRequestCard key={request.id} request={request} disabled={busy}
              onApprove={(id) => void approveRequest(id)} onDecline={(id) => void declineRequest(id)} />)} />
          <ChatComposer composer={composer} inputId="message" label={`Message ${AGENT_NAME}`} placeholder={`Message ${AGENT_NAME}`} maxLength={MAX_MESSAGE}
            blocked={readingCsv} sendsEmpty={attachment !== null} onSend={() => { void sendTurn(composer.draftValue.current); }}
            above={error && <div className="error" role="alert">{error}</div>}
            wrap={(form) => <CsvAttachment value={attachment} onChange={setAttachment} onError={setError} onReading={setReadingCsv} disabled={busy || composer.live.state !== "off"}>{form}</CsvAttachment>} />
          <span className="sr-only" role="status">{status}</span>
        </ChatStage>
      </main>
    </div>
  );
}
