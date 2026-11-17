"use client";

import { useEffect, useRef, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, Sidebar } from "@/common/components";
import { SearchField } from "@/features/catalogue";
import { resultCount } from "../../catalogue/services/search.ts";
import { removeApp, useAddedApps } from "../services/addedApps.ts";
import { appCount, appsFromIds, attentionCount, filterApps, sortApps } from "../services/myApps.ts";
import type { MyApp } from "../services/myApps.ts";
import AppCard from "./AppCard";
import "../apps.css";

function attentionLabel(count: number) {
  if (count === 1) return "1 needs attention";
  return `${count} need attention`;
}

export default function AppsPage() {
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  // Fixed for the visit, so "Last synced" labels don't shift while reading.
  const [now] = useState(() => Date.now());
  const searchField = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // The added apps come from the store the Catalogue writes to (services/addedApps.ts).
  const addedIds = useAddedApps();

  // Only the account check reaches the backend, as on every signed-in page.
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

  const apps = sortApps(appsFromIds(addedIds));
  const matches = filterApps(apps, query);
  const attention = attentionCount(apps);

  // Apps with a launchUrl open through a link on their card. The others, like Settings,
  // explain that they have no page yet in this prototype.
  function open(app: MyApp) {
    setNotice(`${app.name} has no page yet in this prototype.`);
  }

  function settings(app: MyApp) {
    setNotice(`Settings for ${app.name} aren't built yet in this prototype.`);
  }

  function remove(app: MyApp) {
    removeApp(app.id);
    let notice = `${app.name} removed. It's back in the Catalogue as Available.`;
    // "This also removes 2 plugins." becomes "Its 2 plugins were removed too."
    if (app.plugins.length === 1) notice += " Its plugin was removed too.";
    if (app.plugins.length > 1) notice += ` Its ${app.plugins.length} plugins were removed too.`;
    setNotice(notice);
    // The card and its buttons are gone, so put focus somewhere predictable.
    heading.current?.focus();
  }

  function clearSearch() {
    setQuery("");
    searchField.current?.focus();
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening your apps…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={load} />;

  let content;
  if (apps.length === 0) {
    content = (
      <div className="apps-empty">
        <h2>No apps yet</h2>
        <p>My apps is where the apps and websites you add from the Catalogue live. Each one shows whether it is connected, when it last synced and which agents use it, so you can spot problems early.</p>
        <a className="apps-button apps-button-primary" href="/catalogue">Browse the Catalogue</a>
      </div>
    );
  } else {
    let results;
    if (matches.length === 0) {
      results = (
        <div className="apps-empty">
          <h2>Nothing matches “{query.trim()}”</h2>
          <p>Search looks at each app's name and description.</p>
          <button type="button" className="apps-button" onClick={clearSearch}>Clear search</button>
        </div>
      );
    } else {
      results = (
        <ul className="apps-grid">
          {matches.map((app) => <AppCard key={app.id} app={app} now={now} onOpen={open} onSettings={settings} onRemove={remove} />)}
        </ul>
      );
    }
    let attentionItem = <li className="apps-summary-item"><Icon name="connected" />Nothing needs attention</li>;
    if (attention > 0) attentionItem = <li className="apps-summary-item apps-summary-attention"><Icon name="attention" />{attentionLabel(attention)}</li>;
    content = (
      <>
        <ul className="apps-summary" aria-label="Summary">
          <li className="apps-summary-item"><Icon name="app" />{appCount(apps.length)}</li>
          {attentionItem}
        </ul>
        <SearchField id="apps-search" label="Search my apps" placeholder="Name or description"
          query={query} onQueryChange={setQuery} resultText={resultCount(matches.length)} inputRef={searchField} />
        {results}
      </>
    );
  }

  return <div className="apps-shell">
    <Sidebar active="apps" username={account.username} onSignOut={signOut} busy={busy} />
    <main className="apps-main">
      <header className="topbar"><a className="mobile-brand" href="/"><span className="brand-word">WORKSPACE</span></a><div className="topbar-actions"><a className="mobile-team-link" href="/">Chat</a><a className="mobile-team-link" href="/catalogue">Catalogue</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut} disabled={busy}><Icon name="exit" /></button></div></header>
      <div className="apps-heading">
        <div className="eyebrow">MY APPS</div>
        <h1 ref={heading} tabIndex={-1}>Your apps and websites.</h1>
        <p>A prototype with sample data. Apps you add in the Catalogue appear here and are remembered in this browser.</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="apps-notice" role="status">{notice}</p>}
      {content}
    </main>
  </div>;
}
