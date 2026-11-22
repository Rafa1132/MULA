"use client";

import { useEffect, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, ProjectSwitcher, Sidebar } from "@/common/components";
import { useProjectId } from "@/common/hooks/useProjectId";
import { projectPath } from "@/common/services/project";
import type { EntryDraft, KnowledgeEntry, KnowledgeKind } from "../types";
import { addEntry, changeEntry, draftOf, emptyDraft, groupByKind, KIND_HINTS, listEntries, removeEntry } from "../services/knowledge";
import EntryForm from "./EntryForm";
import "../knowledge.css";

type Account = { username: string };
// Which form is open: none, a new entry of a kind, or an entry being edited.
type Editing = null | { mode: "add"; kind: KnowledgeKind } | { mode: "edit"; id: string };

export default function KnowledgePage() {
  const projectId = useProjectId();
  const [account, setAccount] = useState<Account | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Editing>(null);

  async function load(signal?: AbortSignal) {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store", signal });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not open the knowledge base. Please retry.");
    const user = await response.json();
    setEntries(await listEntries(signal));
    setAccount(user);
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // Loads once per project; load() itself only reads projectId through projectFetch.
  }, [projectId]);

  async function signOut() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { setError("Could not sign out. Please retry."); return; }
    window.location.assign("/login");
  }

  async function add(draft: EntryDraft) {
    const entry = await addEntry(draft);
    setEntries((current) => [...current, entry]);
    setEditing(null);
    setMessage(`Added ${entry.title}.`);
  }

  async function save(id: string, draft: EntryDraft) {
    const entry = await changeEntry(id, draft);
    setEntries((current) => current.map((item) => {
      if (item.id === id) return entry;
      return item;
    }));
    setEditing(null);
    setMessage(`Saved ${entry.title}.`);
  }

  async function remove(entry: KnowledgeEntry) {
    if (!window.confirm(`Delete ${entry.title}? Customer Service stops using it right away.`)) return;
    try {
      await removeEntry(entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setMessage(`Deleted ${entry.title}.`);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening the knowledge base…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button className="account-submit" onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={() => load()} />;

  return <div className="knowledge-shell">
    <Sidebar active="inventory" username={account.username} onSignOut={signOut} />
    <main className="knowledge-main">
      <header className="topbar"><ProjectSwitcher section="/knowledge" /><div className="topbar-actions"><a className="text-button" href={projectPath(projectId, "/inbox")}>Inbox</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut}><Icon name="exit" /></button></div></header>
      <div className="knowledge-content">
        <div className="knowledge-intro">
          <h1>Knowledge base</h1>
          <p>What Customer Service may tell your customers. It answers only from these entries and hands anything else to you in the Inbox, so keep prices and hours up to date.</p>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="knowledge-message" role="status" aria-live="polite">{message}</p>
        {entries.length === 0 && <p className="knowledge-empty-note">The knowledge base is empty. Until you add an entry, Customer Service hands every customer message to you.</p>}
        {groupByKind(entries).map((group) => <section key={group.kind} className="knowledge-group" aria-labelledby={`kind-${group.kind}`}>
          <header className="knowledge-group-head">
            <div><h2 id={`kind-${group.kind}`}>{group.label} <span className="knowledge-count">{group.entries.length}</span></h2><p>{KIND_HINTS[group.kind]}</p></div>
            <button type="button" className="map-reset" aria-label={`Add to ${group.label}`} onClick={() => setEditing({ mode: "add", kind: group.kind })} disabled={editing !== null}><Icon name="plus" />Add</button>
          </header>
          {editing && editing.mode === "add" && editing.kind === group.kind &&
            <EntryForm initial={emptyDraft(group.kind)} submitLabel="Add entry" onSubmit={add} onCancel={() => setEditing(null)} />}
          {group.entries.length > 0 && <ul className="knowledge-list">
            {group.entries.map((entry) => <li key={entry.id} className="knowledge-entry">
              {editing && editing.mode === "edit" && editing.id === entry.id && <EntryForm initial={draftOf(entry)} submitLabel="Save entry" onSubmit={(draft) => save(entry.id, draft)} onCancel={() => setEditing(null)} />}
              {!(editing && editing.mode === "edit" && editing.id === entry.id) && <>
                <div className="knowledge-entry-text">
                  <h3>{entry.title}{entry.price && <span className="knowledge-price">{entry.price}</span>}</h3>
                  <p>{entry.body}</p>
                </div>
                <div className="knowledge-entry-actions">
                  <button type="button" className="icon-button" aria-label={`Edit ${entry.title}`} onClick={() => setEditing({ mode: "edit", id: entry.id })} disabled={editing !== null}><Icon name="edit" /></button>
                  <button type="button" className="icon-button" aria-label={`Delete ${entry.title}`} onClick={() => void remove(entry)} disabled={editing !== null}><Icon name="trash" /></button>
                </div>
              </>}
            </li>)}
          </ul>}
        </section>)}
      </div>
    </main>
  </div>;
}
