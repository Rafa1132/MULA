"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, Sidebar } from "@/common/components";
import { CATALOGUE_ENTRIES } from "../data.ts";
import type { CatalogueEntry, CatalogueStatus, CatalogueType } from "../data.ts";
import { filterEntries, resultCount } from "../services/search.ts";
import CatalogueCard from "./CatalogueCard";
import "../catalogue.css";

const SECTIONS: { type: CatalogueType; title: string }[] = [{ type: "agent", title: "Agents" }, { type: "app", title: "Apps" }];

function initialStatuses() {
  const statuses: Record<string, CatalogueStatus> = {};
  for (const entry of CATALOGUE_ENTRIES) statuses[entry.id] = entry.status;
  return statuses;
}

export default function CataloguePage() {
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  // Prototype only: "Add" changes the card for this visit and is not saved.
  const [statuses, setStatuses] = useState(initialStatuses);
  const searchField = useRef<HTMLInputElement>(null);

  // Only the account check reaches the backend, as on every signed-in page.
  // The catalogue itself is the mock data in data.ts.
  async function load() {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not load your account. Please retry.");
    setAccount(await response.json());
  }

  useEffect(() => {
    load().catch((failure: Error) => setError(failure.message)).finally(() => setLoading(false));
  }, []);

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

  const entries = useMemo(() => CATALOGUE_ENTRIES.map((entry) => ({ ...entry, status: statuses[entry.id] })), [statuses]);
  const matches = filterEntries(entries, query);

  function add(entry: CatalogueEntry) {
    setStatuses({ ...statuses, [entry.id]: "added" });
    setNotice(`${entry.name} added for this visit. This prototype does not save it yet.`);
  }

  function openWithoutPage(entry: CatalogueEntry) {
    setNotice(`${entry.name} is a placeholder, so it has no page yet.`);
  }

  function clearSearch() {
    setQuery("");
    searchField.current?.focus();
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening the catalogue…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={load} />;

  let results;
  if (matches.length === 0) {
    results = (
      <div className="catalogue-empty">
        <h2>Nothing matches “{query.trim()}”</h2>
        <p>Try a shorter word, or search for a type of work such as “stock” or “forecast”.</p>
        <button type="button" className="catalogue-action" onClick={clearSearch}>Clear search</button>
      </div>
    );
  } else {
    // Agents are portraits and apps are landscape tiles, so each type gets its own
    // grid and rows stay even. A type with no matches is left out.
    results = SECTIONS.map((section) => {
      const sectionMatches = matches.filter((entry) => entry.type === section.type);
      if (sectionMatches.length === 0) return null;
      const headingId = `catalogue-section-${section.type}`;
      return (
        <section key={section.type} className="catalogue-section" aria-labelledby={headingId}>
          <h2 id={headingId}>{section.title}</h2>
          <ul className={`catalogue-grid catalogue-grid-${section.type}`}>
            {sectionMatches.map((entry) => <CatalogueCard key={entry.id} entry={entry} onAdd={add} onOpenWithoutPage={openWithoutPage} />)}
          </ul>
        </section>
      );
    });
  }

  return <div className="catalogue-shell">
    <Sidebar active="catalogue" username={account.username} onSignOut={signOut} busy={busy} />
    <main className="catalogue-main">
      <header className="topbar"><a className="mobile-brand" href="/"><span className="brand-word">WORKSPACE</span></a><div className="topbar-actions"><a className="mobile-team-link" href="/">Chat</a><a className="mobile-team-link" href="/agents">My agents</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut} disabled={busy}><Icon name="exit" /></button></div></header>
      <div className="catalogue-heading">
        <div className="eyebrow">CATALOGUE</div>
        <h1>Agents and apps for your business.</h1>
        <p>A prototype with sample entries. Adding something here lasts only for this visit and is not saved.</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="catalogue-search">
        <label htmlFor="catalogue-search">Search the catalogue</label>
        <div className="catalogue-search-field">
          <input
            ref={searchField}
            id="catalogue-search"
            type="search"
            value={query}
            placeholder="Name, task or tag, such as “stock”"
            autoComplete="off"
            aria-describedby="catalogue-count"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }}
          />
        </div>
        <p id="catalogue-count" className="catalogue-count" role="status">{resultCount(matches.length)}</p>
      </div>
      {notice && <p className="catalogue-notice" role="status">{notice}</p>}
      {results}
    </main>
  </div>;
}
