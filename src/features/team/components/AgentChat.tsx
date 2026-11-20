"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import Markdown from "react-markdown";
import { CsvAttachment, readChatStream } from "@/features/operator";
import type { AgentRequest, CsvFile } from "@/features/operator";
import { AgentRequestCard, attachRequests, placeRequest } from "@/features/project";
import { Agent, teamRequest } from "../services/team";
import { projectFetch } from "@/common/services/project";

type Message = { id: string; role: "user" | "assistant"; text: string; note?: string; requests?: AgentRequest[] };

async function failureDetail(response: Response, fallback: string) {
  const failure = await response.json().catch(() => ({}));
  if (typeof failure.detail === "string") return failure.detail;
  return fallback;
}

// A direct conversation with one agent, kept apart from the Operator's conversation. When the agent
// asks another one (A2A, e.g. Forecasting asking the Operator), the request shows as a card under
// its reply; approving it runs the other agent, then this agent relays the answer here.
export default function AgentChat({ agent }: { agent: Agent }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<CsvFile | null>(null);
  const [readingCsv, setReadingCsv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    teamRequest(`/api/agents/${agent.id}/conversation`, { signal: abort.signal })
      .then((saved) => {
        const loaded = saved.messages.map((message: Message) => ({ ...message, id: String(message.id) }));
        setMessages(attachRequests(loaded, saved.requests ?? []));
      })
      .catch((failure) => { if (!abort.signal.aborted && failure instanceof Error) setError(failure.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    // Closing the panel stops a reply in progress; the server keeps what arrived.
    return () => { abort.abort(); controller.current?.abort(); };
  }, [agent.id]);

  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages]);

  function updateMessage(id: string, text: string, note?: string) {
    setMessages((previous) => previous.map((message) => {
      if (message.id === id) return { ...message, text, note };
      return message;
    }));
  }

  function showRequest(messageId: string, request: AgentRequest) {
    setMessages((previous) => placeRequest(previous, messageId, request));
  }

  async function declineRequest(requestId: string) {
    if (controller.current) return;
    setError("");
    try {
      const response = await projectFetch(`/api/agents/requests/${requestId}/decline`, { method: "POST" });
      if (!response.ok) {
        setError(await failureDetail(response, "Could not update this request. Please retry."));
        return;
      }
      const saved = await response.json();
      setMessages((previous) => attachRequests(previous, [saved.request]));
    } catch {
      setError("Could not reach Mula to update this request. Check your connection and retry.");
    }
  }

  // Runs the other agent, then streams this agent's relay of its answer as a new reply.
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
    setBusy(true);
    try {
      const response = await projectFetch(`/api/agents/requests/${requestId}/approve`, { method: "POST", signal: abort.signal });
      if (!response.ok) throw new Error(await failureDetail(response, "Could not start this request. Please retry."));
      if (!response.body) throw new Error("Streaming is unavailable in this browser.");
      await readChatStream(response.body, (chunk) => {
        if (chunk.type === "request" && chunk.request) {
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
          updateMessage(relayId, relay);
        }
        if (chunk.type === "done") {
          let note = relayNote;
          if (chunk.truncated) note += " · Reply reached its length limit.";
          updateMessage(relayId, relay, note);
        }
      });
    } catch (failure) {
      // The server marks an unfinished request as failed; mirror that without reloading.
      if (current?.status === "running") showRequest(relayId, { ...current, status: "failed" });
      if (abort.signal.aborted) {
        if (relayShown) updateMessage(relayId, relay, "Stopped by you.");
      } else {
        let detail = "Could not complete the request. Check your connection and try again.";
        if (failure instanceof Error) detail = failure.message;
        setError(detail);
        if (relayShown) updateMessage(relayId, relay, "Reply incomplete.");
      }
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    let text = draft.trim();
    if (controller.current || readingCsv || (!text && !attachment)) return;
    if (!text) text = "Look at this CSV and tell me what you can forecast from it.";
    const attached = attachment;
    let userNote: string | undefined;
    if (attached) userNote = `CSV: ${attached.name}`;
    const abort = new AbortController();
    controller.current = abort;
    const userId = crypto.randomUUID();
    const replyId = crypto.randomUUID();
    setMessages((previous) => [...previous, { id: userId, role: "user", text, note: userNote }, { id: replyId, role: "assistant", text: "" }]);
    setDraft("");
    setAttachment(null);
    setError("");
    setBusy(true);
    let reply = "";
    let completed = false;
    // "Go ahead" requests run as soon as this reply ends.
    const approvedInAdvance: string[] = [];
    try {
      const response = await projectFetch(`/api/agents/${agent.id}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, csv_file: attached }), signal: abort.signal,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        if (typeof failure.detail === "string") throw new Error(failure.detail);
        throw new Error("Please send a message of 1–8,000 characters and try again.");
      }
      if (!response.body) throw new Error("Streaming is unavailable in this browser.");
      await readChatStream(response.body, (chunk) => {
        if (chunk.type === "attachment" && typeof chunk.note === "string") updateMessage(userId, text, chunk.note);
        if (chunk.type === "token" && typeof chunk.content === "string") {
          reply += chunk.content;
          updateMessage(replyId, reply);
        }
        if (chunk.type === "request" && chunk.request) {
          showRequest(replyId, chunk.request);
          if (chunk.request.approved_in_advance && chunk.request.status === "pending") approvedInAdvance.push(chunk.request.id);
        }
        if (chunk.type === "done" && chunk.truncated) updateMessage(replyId, reply, "Reply reached its length limit.");
      });
      completed = !abort.signal.aborted;
    } catch (failure) {
      if (abort.signal.aborted) {
        updateMessage(replyId, reply, "Stopped by you.");
      } else {
        let detail = "Could not complete the reply. Check your connection and try again.";
        if (failure instanceof Error) detail = failure.message;
        setError(detail);
        updateMessage(replyId, reply, "Reply incomplete.");
        // Restore the question and file so a failed request can be sent again.
        setDraft(text);
        setAttachment(attached);
      }
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
    const next = approvedInAdvance[0];
    if (completed && next) void approveRequest(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      form.current?.requestSubmit();
    }
  }

  return <div className="agent-chat">
    <p className="settings-help">Talk with {agent.name} directly. This chat is separate from your Operator conversation and uses {agent.name}’s saved settings.</p>
    <div className="agent-chat-log" ref={log}>
      {loading && <p role="status" className="settings-help"><span className="shimmer">Loading your chat…</span></p>}
      {!loading && messages.length === 0 && <p className="agent-chat-empty">Ask {agent.name} anything about your sales. Attach a CSV to get a forecast.</p>}
      <section className="messages" role="log" aria-label={`Chat with ${agent.name}`} aria-live="polite" aria-relevant="additions text">
        {messages.map((message) => <article key={message.id} className={`message ${message.role}`}>
          <div className="message-label">{message.role === "assistant" && agent.name}{message.role === "user" && "You"}</div>
          <div className="message-body">
            {message.text && <div className="message-text">
              {message.role === "assistant" && <Markdown skipHtml components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" /> }}>{message.text}</Markdown>}
              {message.role === "user" && message.text}
            </div>}
            {!message.text && !message.note && <div className="waiting"><span /><span /><span /><span className="waiting-label">Preparing the reply</span></div>}
            {message.note && <p className="message-note">{message.note}</p>}
            {(message.requests ?? []).map((request) => <AgentRequestCard key={request.id} request={request} disabled={busy}
              onApprove={(id) => void approveRequest(id)} onDecline={(id) => void declineRequest(id)} />)}
          </div>
        </article>)}
      </section>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <CsvAttachment value={attachment} onChange={setAttachment} onError={setError} onReading={setReadingCsv} disabled={busy || loading}>
      <form ref={form} className="agent-chat-form" onSubmit={send}>
        <label htmlFor="agent-chat-message" className="sr-only">Message {agent.name}</label>
        <textarea id="agent-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} maxLength={8000} rows={2} placeholder={`Message ${agent.name}…`} disabled={busy || loading} />
        {busy && <button type="button" className="account-submit" onClick={() => controller.current?.abort()}>Stop</button>}
        {!busy && <button type="submit" className="account-submit" disabled={loading || readingCsv || (!draft.trim() && !attachment)}>Send</button>}
      </form>
    </CsvAttachment>
  </div>;
}
