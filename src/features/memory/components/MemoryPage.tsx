"use client";

import { useEffect, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, Sidebar } from "@/common/components";
import "../memory.css";

type Target = "business" | "owner";
type Entry = {
  id: number; target: Target; fact: string; actor: string; created_at: string;
  superseded: boolean; superseded_by: number | null; superseded_at: string | null; superseded_reason: string | null;
  related: number[];
};
type Audit = { id: number; action: string; entry_id: number | null; actor: string; occurred_at: string };
type Overview = {
  summary: string;
  entries: Entry[];
  audit: Audit[];
  last_retrieval: { question: string; occurred_at: string; entries: Entry[] } | null;
  relative_root: string;
};
type SearchResult = { id: number; target: Target; fact: string; created_at: string };
const sections: { target: Target; title: string }[] = [{ target: "business", title: "About the business" }, { target: "owner", title: "About the owner" }];
const actors: Record<string, string> = { operator: "Saved by the Operator", owner: "Saved by you", migration: "Imported" };

function supersededLabel(entry: Entry) {
  if (entry.superseded_reason === "replaced") return `Replaced by [${entry.superseded_by}]`;
  return "Retired";
}

function plural(count: number, noun: string) {
  if (count === 1) return `${count} ${noun}`;
  return `${count} ${noun}s`;
}

async function readJson(response: Response, fallback: string) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || fallback);
  return body;
}

export default function MemoryPage() {
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newTarget, setNewTarget] = useState<Target>("business");
  const [newFact, setNewFact] = useState("");
  const [correcting, setCorrecting] = useState<number | null>(null);
  const [correction, setCorrection] = useState("");
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function fetchOverview() {
    return await readJson(await fetch("/api/memory", { cache: "no-store" }), "Could not open memory.") as Overview;
  }

  async function load() {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not load your account. Please retry.");
    const user = await response.json();
    setData(await fetchOverview());
    setAccount(user);
  }

  useEffect(() => {
    load().catch((failure: Error) => setError(failure.message)).finally(() => setLoading(false));
  }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const message = await action();
      setData(await fetchOverview());
      setResults(null);
      setNotice(message);
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setBusy(false); }
  }

  function add() {
    const fact = newFact.trim();
    if (!fact) return;
    void run(async () => {
      const body = await readJson(await fetch("/api/memory/entries", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: newTarget, fact }) }), "Could not save the memory.");
      setNewFact("");
      if (body.outcome === "duplicate") return `Already in memory as [${body.entry.id}].`;
      return `Saved as [${body.entry.id}]. The Operator uses it from the next request.`;
    });
  }

  function correct(entry: Entry) {
    const fact = correction.trim();
    if (!fact) return;
    void run(async () => {
      const body = await readJson(await fetch(`/api/memory/entries/${entry.id}/supersede`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact }) }), "Could not correct the memory.");
      setCorrecting(null);
      setCorrection("");
      return `Saved as [${body.entry.id}], replacing [${entry.id}]. The old version stays in the history.`;
    });
  }

  function retire(entry: Entry) {
    if (!window.confirm("Retire this memory? It leaves the summary and retrieval, and stays in the history.")) return;
    void run(async () => {
      await readJson(await fetch(`/api/memory/entries/${entry.id}/retire`, { method: "POST" }), "Could not retire the memory.");
      return `Retired [${entry.id}].`;
    });
  }

  async function search() {
    if (!question.trim()) return;
    setSearching(true);
    setError("");
    try {
      const body = await readJson(await fetch("/api/memory/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }), "Search failed.");
      setResults(body.results);
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setSearching(false); }
  }

  async function signOut() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out.");
      window.location.assign("/");
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setBusy(false); }
  }

  function when(iso: string) {
    return new Date(iso).toLocaleString();
  }

  function renderEntry(entry: Entry) {
    const editing = correcting === entry.id;
    return <li key={entry.id} className="memory-entry" data-superseded={entry.superseded}>
      <div className="memory-entry-head"><code>[{entry.id}]</code><small>{actors[entry.actor] || entry.actor} · {when(entry.created_at)}</small></div>
      <p>{entry.fact}</p>
      {entry.related.length > 0 && <small className="memory-flag">May overlap with {entry.related.map((id) => `[${id}]`).join(", ")}. Correct or retire the one that no longer holds.</small>}
      {entry.superseded && <small>{supersededLabel(entry)} · {entry.superseded_at && when(entry.superseded_at)}</small>}
      {!entry.superseded && !editing && <div className="memory-entry-actions"><button className="text-button" onClick={() => { setCorrecting(entry.id); setCorrection(entry.fact); }} disabled={busy}>Correct</button><button className="text-button" onClick={() => retire(entry)} disabled={busy}>Retire</button></div>}
      {editing && <form className="memory-correction" onSubmit={(event) => { event.preventDefault(); correct(entry); }}>
        <label className="sr-only" htmlFor={`correction-${entry.id}`}>New version of memory {entry.id}</label>
        <textarea id={`correction-${entry.id}`} value={correction} maxLength={500} onChange={(event) => setCorrection(event.target.value)} disabled={busy} />
        <div><button type="button" className="account-toggle" onClick={() => setCorrecting(null)} disabled={busy}>Cancel</button><button className="account-submit" disabled={busy || !correction.trim() || correction.trim() === entry.fact}>Save correction</button></div>
      </form>}
    </li>;
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening your memory…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={load} />;

  return <div className="memory-shell">
    <Sidebar active="memory" username={account.username} onSignOut={signOut} busy={busy} />
    <main className="memory-main">
      <header className="topbar"><span className="mobile-brand"><span className="brand-word">WORKSPACE</span></span><div className="topbar-actions"><a className="text-button" href="/">Back to Operator</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut} disabled={busy}><Icon name="exit" /></button></div></header>
      <div className="memory-heading"><div className="eyebrow">WHAT MULA REMEMBERS</div><h1>Your memory, one fact at a time.</h1><p>The Operator saves facts you state or confirm, and you can add, correct or retire any of them. Nothing is ever rewritten: a correction keeps the old version in the history.</p><code>{data?.relative_root}/</code></div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="memory-notice" role="status">{notice}</p>}
      <form className="memory-add" onSubmit={(event) => { event.preventDefault(); add(); }}>
        <label className="sr-only" htmlFor="memory-target">About</label>
        <select id="memory-target" value={newTarget} onChange={(event) => setNewTarget(event.target.value as Target)} disabled={busy}><option value="business">About the business</option><option value="owner">About the owner</option></select>
        <label className="sr-only" htmlFor="memory-fact">New memory</label>
        <input id="memory-fact" value={newFact} maxLength={500} onChange={(event) => setNewFact(event.target.value)} placeholder="Our coffee supplier is Aroma. Deliveries arrive on Tuesdays." disabled={busy} />
        <button className="account-submit" disabled={busy || !newFact.trim()}>Add memory</button>
      </form>
      <div className="memory-sections">
        {sections.map(({ target, title }) => {
          const active = (data?.entries || []).filter((entry) => entry.target === target && !entry.superseded);
          const history = (data?.entries || []).filter((entry) => entry.target === target && entry.superseded);
          return <section key={target} className="memory-section" aria-label={title}>
            <h2>{title}</h2>
            {active.length === 0 && <p className="memory-help">Nothing saved yet. Tell the Operator something worth keeping, or add it here.</p>}
            <ul className="memory-list">{active.map(renderEntry)}</ul>
            {history.length > 0 && <details className="memory-history"><summary>History · {plural(history.length, "earlier version")}</summary><ul className="memory-list">{history.map(renderEntry)}</ul></details>}
          </section>;
        })}
      </div>
      <section className="memory-summary" aria-label="Summary"><h2>The summary the Operator reads</h2><p className="memory-help">Mula writes <code>MEMORY.md</code> from the facts above after every change. Only current facts appear, newest first, within the same limits as a built-in memory.</p><pre>{data?.summary}</pre></section>
      <section className="memory-inspection"><div><h2>Try retrieval</h2><p>See which facts match a question. This uses the search index without asking the model.</p><form className="memory-search" onSubmit={(event) => { event.preventDefault(); void search(); }}><label className="sr-only" htmlFor="memory-question">Search memory</label><input id="memory-question" value={question} maxLength={1000} onChange={(event) => setQuestion(event.target.value)} placeholder="Who supplies our coffee?" /><button className="account-submit" disabled={searching || !question.trim()}>Search</button></form>
        {results && results.length === 0 && <p>No matching facts. Try a name or another keyword.</p>}
        {results?.map((result) => <article key={result.id} className="memory-result"><code>[{result.id}]</code><p>{result.fact}</p></article>)}
      </div><div><h2>Memory used for the last request</h2><p>The facts that matched the Operator&apos;s last request, besides the summary it always gets.</p>
        {!data?.last_retrieval && <p>No requests have used this memory yet.</p>}
        {data?.last_retrieval && <><small>{when(data.last_retrieval.occurred_at)}</small><p className="memory-question">{data.last_retrieval.question}</p>{data.last_retrieval.entries.length === 0 && <p>No saved facts matched.</p>}{data.last_retrieval.entries.map((entry) => <article key={entry.id} className="memory-result"><code>[{entry.id}]</code><p>{entry.fact}</p></article>)}</>}
      </div></section>
      <section className="memory-changes"><h2>Recent changes</h2>{data?.audit.length === 0 && <p>No changes yet.</p>}{data?.audit.map((row) => <p key={row.id}>{row.action}{row.entry_id !== null && <> <code>[{row.entry_id}]</code></>} · {actors[row.actor] || row.actor} · {when(row.occurred_at)}</p>)}<p>Every save, correction, retirement and refusal is logged with ids and hashes, never with the fact text.</p></section>
    </main>
  </div>;
}
