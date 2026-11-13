"use client";

import { useEffect, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, Sidebar, MulaLogo } from "@/common/components";
import "../memory.css";

type Document = { path: string; title: string; content: string; revision: string; source: string; updated_at: string | null };
type Source = { path: string; content: string; reason: string };
type Overview = {
  files: Document[];
  categories: string[];
  relative_root: string;
  last_retrieval: { question: string; occurred_at: string; sources: Source[] } | null;
  changes: { path: string; action: string; source: string; occurred_at: string }[];
};
const labels: Record<string, string> = {
  "important-facts": "Important facts", "business-knowledge": "Business knowledge", preferences: "Preferences",
  "fun-facts": "Fun facts", "random-facts": "Random facts", decisions: "Decisions",
};

export default function MemoryPage() {
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [path, setPath] = useState("important-facts/business-identity.md");
  const [content, setContent] = useState("");
  const [filter, setFilter] = useState("");
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<Source[] | null>(null);
  const [searching, setSearching] = useState(false);
  const selected = data?.files.find((file) => file.path === path);
  const dirty = Boolean(selected && selected.content !== content);
  let maxLength = 8000;
  if (path.startsWith("important-facts/") || path === "preferences/communication.md") maxLength = 1500;

  async function fetchOverview() {
    const response = await fetch("/api/memory", { cache: "no-store" });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.detail || "Could not open memory.");
    }
    return await response.json() as Overview;
  }

  async function load() {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not load your account. Please retry.");
    const user = await response.json();
    const overview = await fetchOverview();
    setData(overview);
    setContent(overview.files.find((file) => file.path === path)?.content || "");
    setAccount(user);
  }

  useEffect(() => {
    load().catch((failure: Error) => setError(failure.message)).finally(() => setLoading(false));
  }, []);

  function select(file: Document) {
    if (dirty && !window.confirm("Discard your unsaved memory edits?")) return;
    setPath(file.path);
    setContent(file.content);
    setNotice("");
    setError("");
  }

  async function refresh() {
    if (dirty && !window.confirm("Reload the file and discard unsaved edits?")) return;
    setBusy(true);
    setError("");
    try {
      const overview = await fetchOverview();
      setData(overview);
      setContent(overview.files.find((file) => file.path === path)?.content || "");
      setResults(null);
      setNotice("Reloaded from your memory files.");
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setBusy(false); }
  }

  async function save(clear = false) {
    if (!selected) return;
    if (clear && !window.confirm("Clear this memory file? Past conversations may still contain these facts.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    let body = content;
    if (clear) body = "";
    try {
      const response = await fetch("/api/memory/document", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: body, revision: selected.revision }) });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.detail || "Could not save memory.");
      // A successful disk save is reflected immediately, even if the subsequent
      // overview refresh fails. Do not pretend the user's old revision is current.
      setData((previous) => {
        if (!previous) return previous;
        return { ...previous, files: previous.files.map((file) => { if (file.path === path) return saved; return file; }) };
      });
      setContent(saved.content);
      setResults(null);
      setNotice("Saved. Future requests will use the updated memory.");
      setData(await fetchOverview());
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setBusy(false); }
  }

  async function search() {
    if (!question.trim()) return;
    setSearching(true);
    setError("");
    try {
      const response = await fetch("/api/memory/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Search failed.");
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

  if (loading) return <main className="account-screen"><p role="status">Opening your memory…</p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={load} />;

  return <div className="memory-shell">
    <Sidebar active="memory" username={account.username} onSignOut={signOut} busy={busy} />
    <main className="memory-main">
      <header className="topbar"><span className="desktop-title">Your workspace <span className="header-divider">/</span> <strong>Memory</strong></span><span className="mobile-brand"><MulaLogo /></span><div className="topbar-actions"><a className="text-button" href="/">Back to Operator</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut} disabled={busy}><Icon name="exit" /></button></div></header>
      <div className="memory-heading"><div className="eyebrow">A NOTEBOOK YOU CAN OPEN</div><h1>What Mula remembers.</h1><p>Read, correct, or clear the notes your Operator can use. These are saved memories, alongside your separate conversation history.</p><code>{data?.relative_root}/</code></div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="memory-notice" role="status">{notice}</p>}
      <div className="memory-layout">
        <nav className="memory-tree" aria-label="Memory files"><label htmlFor="memory-filter">Your files</label><input id="memory-filter" placeholder="Filter files…" value={filter} onChange={(event) => setFilter(event.target.value)} />
          {data?.categories.map((category) => {
            const files = data.files.filter((file) => file.path.startsWith(category + "/") && (file.title + " " + file.content).toLowerCase().includes(filter.toLowerCase()));
            if (!files.length) return null;
            return <details key={category} open><summary>{labels[category]} <span>{files.filter((file) => file.content).length}/{files.length}</span></summary>
              {files.map((file) => <button key={file.path} className="memory-file" aria-current={file.path === path} onClick={() => select(file)} disabled={busy}><span>{file.title}.md</span>{!file.content && <small>Empty</small>}</button>)}
            </details>;
          })}
        </nav>
        <section className="memory-editor" aria-label="Memory editor"><div className="memory-editor-title"><div><h2>{selected?.title}</h2><code>{path}</code></div><button className="text-button" onClick={refresh} disabled={busy}>Reload files</button></div>
          <p className="memory-file-meta">{selected?.source} {selected?.updated_at && <>· {new Date(selected.updated_at).toLocaleString()}</>}{dirty && " · Unsaved changes"}</p>
          <label className="sr-only" htmlFor="memory-content">Memory content</label><textarea id="memory-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={maxLength} disabled={busy} placeholder="Add confirmed facts here. For example: Our coffee supplier is Aroma. Deliveries arrive on Tuesdays." />
          <div className="memory-editor-actions"><span>{content.length}/{maxLength} characters</span><div><button className="account-toggle" onClick={() => save(true)} disabled={busy || !selected?.content}>Clear file</button><button className="account-submit" onClick={() => save()} disabled={busy || !dirty}>Save memory</button></div></div>
          <p className="memory-help">Important facts and communication preferences are included consistently. Other files are retrieved by relevant keywords. Superseded decisions are kept for reference and excluded from automatic retrieval.</p>
          <p className="memory-help">You can also type <code>/remember Your fact</code> in chat. It saves to Random facts. To choose a file: <code>/remember business-knowledge/suppliers.md | Our supplier is Aroma.</code></p>
        </section>
      </div>
      <section className="memory-inspection"><div><h2>Try retrieval</h2><p>See which notes match a question. This uses the search index without asking the model.</p><form className="memory-search" onSubmit={(event) => { event.preventDefault(); void search(); }}><label className="sr-only" htmlFor="memory-question">Search memory</label><input id="memory-question" value={question} maxLength={1000} onChange={(event) => setQuestion(event.target.value)} placeholder="Who supplies our coffee?" /><button className="account-submit" disabled={searching || !question.trim()}>Search</button></form>
        {results && results.length === 0 && <p>No matching notes. Try a name or another keyword.</p>}
        {results?.map((result, index) => <article key={index} className="memory-result"><button className="text-button" onClick={() => { const file = data?.files.find((item) => item.path === result.path); if (file) select(file); }}>{result.path}</button><p>{result.content}</p></article>)}
      </div><div><h2>Memory used for the last request</h2><p>This snapshot shows supplied memories, not the full prompt. It may differ from files edited afterward.</p>
        {!data?.last_retrieval && <p>No requests have used this memory system yet.</p>}
        {data?.last_retrieval && <><small>{new Date(data.last_retrieval.occurred_at).toLocaleString()}</small><p className="memory-question">{data.last_retrieval.question}</p>{data.last_retrieval.sources.length === 0 && <p>No saved memories were supplied.</p>}{data.last_retrieval.sources.map((source, index) => <details key={index} className="memory-result"><summary>{source.path} · {source.reason}</summary><p>{source.content}</p></details>)}</>}
      </div></section>
      <section className="memory-changes"><h2>Recent changes</h2>{data?.changes.length === 0 && <p>No saved changes yet.</p>}{data?.changes.map((change, index) => <p key={index}><code>{change.path}</code> · {change.action} · {change.source} · {new Date(change.occurred_at).toLocaleString()}</p>)}<p>Clearing a file removes it from future retrieval. It does not erase previous conversations or past retrieval snapshots.</p></section>
    </main>
  </div>;
}
