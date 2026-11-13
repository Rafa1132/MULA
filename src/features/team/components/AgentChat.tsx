"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import Markdown from "react-markdown";
import { CsvAttachment, readChatStream } from "@/features/operator";
import type { CsvFile } from "@/features/operator";
import { Agent, teamRequest } from "../services/team";

type Message = { id: string; role: "user" | "assistant"; text: string; note?: string };

// A direct conversation with one agent, kept apart from the Operator's conversation.
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
      .then((saved) => setMessages(saved.messages.map((message: Message) => ({ ...message, id: String(message.id) }))))
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
    try {
      const response = await fetch(`/api/agents/${agent.id}/chat`, {
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
        if (chunk.type === "done" && chunk.truncated) updateMessage(replyId, reply, "Reply reached its length limit.");
      });
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
      {loading && <p role="status" className="settings-help">Loading your chat…</p>}
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
