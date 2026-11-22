"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { Conversation, Ticket } from "../types";
import { AUTHOR_LABELS, contactLabel, hoursLeft, messageStatus, REPLY_MAX, replyState, resolveTicket, sendReply, sendTemplate } from "../services/inbox";

type Props = {
  conversation: Conversation;
  onChanged: (conversation: Conversation, message: string) => void;
};

function time(seconds: number) {
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** One customer conversation: why it was handed off, the messages, and the owner's reply. */
export default function ConversationPanel({ conversation, onChanged }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const state = replyState(conversation);
  const open: Ticket | undefined = conversation.tickets.find((ticket) => ticket.status === "open");
  const left = hoursLeft(conversation, Date.now() / 1000);

  async function act(run: () => Promise<Conversation>, message: string) {
    setBusy(true);
    setError("");
    try {
      onChanged(await run(), message);
      return true;
    } catch (failure) {
      setError((failure as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function reply(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) { setError("Write a reply."); return; }
    if (await act(() => sendReply(conversation.id, text), "Reply sent on WhatsApp.")) setText("");
  }

  let modeText = "Customer Service is answering this customer.";
  if (conversation.mode === "human") modeText = "You're handling this customer; Customer Service stays quiet until you resolve the ticket.";

  return <section className="inbox-panel" aria-labelledby="inbox-panel-title">
    <header className="inbox-panel-head">
      <div><p className="inbox-eyebrow">WhatsApp</p><h2 id="inbox-panel-title">{contactLabel(conversation)}</h2><p className="inbox-mode">{modeText}</p></div>
      {open && <button type="button" className="map-reset" disabled={busy} onClick={() => void act(() => resolveTicket(open.id), "Resolved. Customer Service answers this customer again.")}>Resolve</button>}
    </header>
    {open && <div className="inbox-reason"><h3>{open.reason}</h3>{open.summary && <p>{open.summary}</p>}</div>}
    {conversation.summary && <details className="inbox-summary"><summary>Earlier in this conversation</summary><p>{conversation.summary}</p></details>}
    <ol className="inbox-thread" aria-label="Messages">
      {conversation.messages.map((message) => <li key={message.id} className="inbox-message" data-direction={message.direction}>
        <p className="inbox-message-meta"><strong>{AUTHOR_LABELS[message.author]}</strong> · {time(message.created_at)}{messageStatus(message) && <> · <span data-failed={message.status === "failed"}>{messageStatus(message)}</span></>}</p>
        <p className="inbox-message-body">{message.body}</p>
      </li>)}
    </ol>
    {error && <p className="error" role="alert">{error}</p>}
    {state.kind === "reply" && <form className="inbox-reply" onSubmit={reply}>
      <label htmlFor="inbox-reply-text">Reply on WhatsApp</label>
      <textarea id="inbox-reply-text" rows={3} maxLength={REPLY_MAX} value={text} onChange={(event) => { setText(event.target.value); setError(""); }} />
      <div className="inbox-reply-actions">
        {left !== null && <span className="inbox-hint">WhatsApp allows free replies for about {left} more {left === 1 && "hour"}{left !== 1 && "hours"}.</span>}
        <button type="submit" className="account-submit" disabled={busy}>{busy && "Sending…"}{!busy && "Send reply"}</button>
      </div>
    </form>}
    {state.kind === "template" && <div className="inbox-reply">
      <p className="inbox-hint">{state.reason}</p>
      <div className="inbox-reply-actions"><button type="button" className="account-submit" disabled={busy}
        onClick={() => void act(() => sendTemplate(conversation.id), "Template sent on WhatsApp.")}>Send template</button></div>
    </div>}
    {state.kind === "blocked" && <p className="inbox-hint inbox-blocked">{state.reason}</p>}
  </section>;
}
