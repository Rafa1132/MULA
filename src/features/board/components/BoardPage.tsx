"use client";

import { useEffect, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, ProjectSwitcher, Sidebar } from "@/common/components";
import { useProjectId } from "@/common/hooks/useProjectId";
import type { Board, Card, CardDetails, CardDraft } from "../types";
import { addCard, loadBoard } from "../services/board";
import { COLUMN_EMPTY, groupByColumn, needsPolling } from "../services/columns";
import CardPanel from "./CardPanel";
import CardTile from "./CardTile";
import NewCardDialog from "./NewCardDialog";
import "../board.css";

type Account = { username: string };

// While a card is in Working, the page reloads the board this often to show the agent's progress.
const POLL_MS = 10_000;

export default function BoardPage() {
  const projectId = useProjectId();
  const [account, setAccount] = useState<Account | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load(signal?: AbortSignal) {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store", signal });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not open the Board. Please retry.");
    const user = await response.json();
    setBoard(await loadBoard(signal));
    setAccount(user);
  }

  async function refresh() {
    try {
      setBoard(await loadBoard());
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

  let polling = false;
  if (board !== null) polling = needsPolling(board.cards);
  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => { refresh(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [polling]);

  async function signOut() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { setError("Could not sign out. Please retry."); return; }
    window.location.assign("/login");
  }

  async function create(draft: CardDraft) {
    await addCard(draft);
    setMessage("Card added to To do.");
    await refresh();
  }

  function changed(_card: CardDetails | null, text: string) {
    setMessage(text);
    refresh();
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening the Board…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button className="account-submit" onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={() => load()} />;

  let cards: Card[] = [];
  let agents: Board["agents"] = [];
  if (board !== null) { cards = board.cards; agents = board.agents; }
  const open = cards.find((card) => card.id === openId);

  return <div className="board-shell">
    <Sidebar active="board" username={account.username} onSignOut={signOut} />
    <main className="board-main">
      <header className="topbar"><ProjectSwitcher section="/board" /><div className="topbar-actions"><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut}><Icon name="exit" /></button></div></header>
      <div className="board-content">
        <div className="board-intro">
          <div>
            <h1>Board</h1>
            <p>Cards for your agents. A card waits in To do until you press Start; agents can add cards from chat, but never start them.</p>
          </div>
          <button type="button" className="account-submit" onClick={() => setAdding(true)} disabled={board === null}>New card</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="board-message" role="status" aria-live="polite">{message}</p>
        {board !== null && <div className="board-columns">
          {groupByColumn(cards).map((group) => <section key={group.column} className="board-column" aria-labelledby={`column-${group.column}`}>
            <h2 id={`column-${group.column}`}>{group.label} <span className="board-count">{group.cards.length}</span></h2>
            {group.cards.length === 0 && <p className="board-empty">{COLUMN_EMPTY[group.column]}</p>}
            {group.cards.length > 0 && <ul className="board-list">
              {group.cards.map((card) => <CardTile key={card.id} card={card} onOpen={(chosen) => setOpenId(chosen.id)} />)}
            </ul>}
          </section>)}
        </div>}
      </div>
    </main>
    {adding && <NewCardDialog agents={agents} onSubmit={create} onClosed={() => setAdding(false)} />}
    {open && <CardPanel key={open.id} card={open} agents={agents} onChanged={changed} onClosed={() => setOpenId(null)} />}
  </div>;
}
