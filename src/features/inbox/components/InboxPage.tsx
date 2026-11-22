"use client";

import { useEffect, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, ProjectSwitcher, Sidebar } from "@/common/components";
import { useProjectId } from "@/common/hooks/useProjectId";
import { projectPath } from "@/common/services/project";
import type { Conversation, Ticket, TicketStatus } from "../types";
import { contactLabel, listTickets, loadConversation } from "../services/inbox";
import ConversationPanel from "./ConversationPanel";
import "../inbox.css";

type Account = { username: string };

// While the page is open it looks for new handoffs and messages this often. No model is called.
const POLL_MS = 20_000;

export default function InboxPage() {
  const projectId = useProjectId();
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<TicketStatus>("open");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load(signal?: AbortSignal) {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store", signal });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not open the inbox. Please retry.");
    const user = await response.json();
    setTickets(await listTickets("open", signal));
    setAccount(user);
  }

  async function refresh(chosen: TicketStatus = status) {
    try {
      setTickets(await listTickets(chosen));
      if (conversation) setConversation(await loadConversation(conversation.id));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // Loads once per project; load() itself only reads projectId through projectFetch.
  }, [projectId]);

  const signedIn = account !== null;
  const openId = conversation?.id;
  useEffect(() => {
    if (!signedIn) return;
    const timer = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => window.clearInterval(timer);
    // refresh() reads the shown status and conversation; restart the timer when either changes.
  }, [signedIn, status, openId]);

  async function open(ticket: Ticket) {
    setError("");
    try {
      setConversation(await loadConversation(ticket.conversation_id));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  function changed(next: Conversation, text: string) {
    setConversation(next);
    setMessage(text);
    void refresh();
  }

  function show(next: TicketStatus) {
    setStatus(next);
    setConversation(null);
    void refresh(next);
  }

  async function signOut() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { setError("Could not sign out. Please retry."); return; }
    window.location.assign("/login");
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening the inbox…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button className="account-submit" onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={() => load()} />;

  let emptyText = "No customer is waiting for you. When Customer Service can't answer from the knowledge base, the conversation lands here.";
  if (status === "resolved") emptyText = "No resolved tickets yet.";

  return <div className="inbox-shell">
    <Sidebar active="inbox" username={account.username} onSignOut={signOut} />
    <main className="inbox-main">
      <header className="topbar"><ProjectSwitcher section="/inbox" /><div className="topbar-actions"><a className="text-button" href={projectPath(projectId, "/knowledge")}>Knowledge base</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut}><Icon name="exit" /></button></div></header>
      <div className="inbox-content">
        <div className="inbox-intro">
          <h1>Inbox</h1>
          <p>Customers that Customer Service handed to you. Reply here and it goes to them on WhatsApp; resolve the ticket to let the agent answer again.</p>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="inbox-message-line" role="status" aria-live="polite">{message}</p>
        <div className="inbox-layout">
          <section className="inbox-list" aria-label="Tickets">
            <div className="agents-view-switch" role="group" aria-label="Show">
              <button type="button" aria-pressed={status === "open"} onClick={() => show("open")}>Open</button>
              <button type="button" aria-pressed={status === "resolved"} onClick={() => show("resolved")}>Resolved</button>
            </div>
            {tickets.length === 0 && <p className="inbox-empty">{emptyText}</p>}
            {tickets.length > 0 && <ul>
              {tickets.map((ticket) => <li key={ticket.id}>
                <button type="button" className="inbox-ticket" aria-current={conversation?.id === ticket.conversation_id} onClick={() => void open(ticket)}>
                  <strong>{contactLabel(ticket)}</strong>
                  <span>{ticket.reason}</span>
                  <time dateTime={new Date(ticket.created_at * 1000).toISOString()}>{new Date(ticket.created_at * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
                </button>
              </li>)}
            </ul>}
          </section>
          {conversation && <ConversationPanel key={conversation.id} conversation={conversation} onChanged={changed} />}
          {!conversation && tickets.length > 0 && <p className="inbox-pick">Choose a ticket to see the conversation.</p>}
        </div>
      </div>
    </main>
  </div>;
}
