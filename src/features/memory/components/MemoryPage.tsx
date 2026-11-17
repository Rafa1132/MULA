"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, Sidebar } from "@/common/components";
import { Overview, fetchOverview } from "../services/facts";
import { Graph, fetchGraph } from "../services/notes";
import { DEFAULT_FILTER, MapFilter } from "../services/graph";
import FoldersView from "./FoldersView";
import MemoryMap from "./MemoryMap";
import "../memory.css";

type Mode = "folders" | "map";
const MODES: { id: Mode; label: string }[] = [{ id: "folders", label: "Folders" }, { id: "map", label: "Map" }];

export default function MemoryPage() {
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<Mode>("folders");
  // Kept here so the map's filters survive a trip to Folders and back.
  const [mapFilter, setMapFilter] = useState<MapFilter>(DEFAULT_FILTER);
  const tabs = useRef(new Map<Mode, HTMLButtonElement>());

  async function refresh() {
    const [nextOverview, nextGraph] = await Promise.all([fetchOverview(), fetchGraph()]);
    setOverview(nextOverview);
    setGraph(nextGraph);
  }

  async function load() {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not load your account. Please retry.");
    const user = await response.json();
    await refresh();
    setAccount(user);
  }

  useEffect(() => {
    load().catch((failure: Error) => setError(failure.message)).finally(() => setLoading(false));
  }, []);

  /** Run a change, then reload the facts and the graph so every view shows the same state. */
  function run(action: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice("");
    action()
      .then(async (message) => {
        await refresh();
        setNotice(message);
      })
      .catch((failure: unknown) => {
        if (failure instanceof Error) setError(failure.message);
      })
      .finally(() => setBusy(false));
  }

  function showError(message: string) {
    setNotice("");
    setError(message);
  }

  function showMode(next: Mode, focusTab: boolean) {
    setMode(next);
    if (focusTab) tabs.current.get(next)?.focus();
  }

  // The tabs pattern: Left and Right (and Home, End) move between tabs and show them.
  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = MODES.findIndex((entry) => entry.id === mode);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % MODES.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + MODES.length) % MODES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = MODES.length - 1;
    else return;
    event.preventDefault();
    showMode(MODES[next].id, true);
  }

  /** A note chosen on the map opens in Folders; focus goes to the Folders tab so it isn't lost with the map. */
  function openFromMap(nodeId: string) {
    setSelected(nodeId);
    showMode("folders", true);
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

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening your memory…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={load} />;

  return <div className="memory-shell">
    <Sidebar active="memory" username={account.username} onSignOut={signOut} busy={busy} />
    <main className="memory-main">
      <header className="topbar"><span className="mobile-brand"><span className="brand-word">WORKSPACE</span></span><div className="topbar-actions"><a className="text-button" href="/">Back to Operator</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut} disabled={busy}><Icon name="exit" /></button></div></header>
      <div className="memory-heading">
        <div className="eyebrow">WHAT MULA REMEMBERS</div>
        <h1>Memory</h1>
        <p>Your notes, in folders, linked with [[Title]]. The Facts folder holds the one-line facts the Operator reads on every request.</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="memory-notice" role="status">{notice}</p>}
      <div className="memory-tabs" role="tablist" aria-label="Memory views" onKeyDown={onTabKey}>
        {MODES.map((entry) => <button key={entry.id} type="button" role="tab" id={`memory-tab-${entry.id}`} aria-controls={`memory-panel-${entry.id}`}
          aria-selected={mode === entry.id} tabIndex={tabStop(mode === entry.id)} onClick={() => showMode(entry.id, false)}
          ref={(element) => { if (element) tabs.current.set(entry.id, element); }}>{entry.label}</button>)}
      </div>
      {/* Folders stays mounted while the map is open, so open folders and filters are kept. */}
      <div id="memory-panel-folders" role="tabpanel" aria-labelledby="memory-tab-folders" hidden={mode !== "folders"}>
        {graph && overview && <FoldersView graph={graph} overview={overview} selected={selected} onSelect={setSelected} busy={busy} run={run} onError={showError} />}
      </div>
      <div id="memory-panel-map" role="tabpanel" aria-labelledby="memory-tab-map" hidden={mode !== "map"}>
        {graph && mode === "map" && <MemoryMap graph={graph} filter={mapFilter} onFilter={setMapFilter} focus={selected} username={account.username} onOpen={openFromMap} />}
      </div>
    </main>
  </div>;
}

// Only the shown tab is in the tab order; the arrow keys reach the other.
function tabStop(isCurrent: boolean) {
  if (isCurrent) return 0;
  return -1;
}
