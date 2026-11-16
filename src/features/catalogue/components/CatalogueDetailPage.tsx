"use client";

import { useEffect, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, Sidebar } from "@/common/components";
import { addApp, useAddedApps } from "../../apps/services/addedApps.ts";
import type { CatalogueEntry } from "../data.ts";
import { findEntry, formatPrice } from "../services/details.ts";
import { parentOf } from "../services/plugins.ts";
import { publisherFor } from "../services/publishers.ts";
import Carousel from "./Carousel";
import PluginsSection from "./PluginsSection";
import PublisherAvatar from "./PublisherAvatar";
import "../catalogue.css";
import "../detail.css";

const STATUS_LABELS = { available: "Available", added: "Added", coming_soon: "Coming soon" };

/** Whether an entry counts as added: apps from the shared store, agents from the data. */
function isAdded(entry: CatalogueEntry, addedApps: readonly string[]) {
  if (entry.type === "app") return addedApps.includes(entry.id);
  return entry.status === "added";
}

function PrimaryAction({ entry, added, onAdd }: { entry: CatalogueEntry; added: boolean; onAdd: (entry: CatalogueEntry) => void }) {
  if (added && entry.type === "app") return <a className="catalogue-action catalogue-action-primary detail-action" href="/apps">Open in My apps</a>;
  if (added && entry.href) return <a className="catalogue-action catalogue-action-primary detail-action" href={entry.href}>Open</a>;
  if (entry.status === "coming_soon") return <button type="button" className="catalogue-action detail-action" disabled aria-label={`Add ${entry.name} (coming soon)`}>Add</button>;
  if (entry.type === "app") return <button type="button" className="catalogue-action catalogue-action-primary detail-action" onClick={() => onAdd(entry)}>Add</button>;
  // Agents are not added from here yet; My agents manages the real ones.
  return <a className="catalogue-action detail-action" href="/agents">Open My agents</a>;
}

export default function CatalogueDetailPage({ id }: { id: string }) {
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const addedApps = useAddedApps();
  const entry = findEntry(id);

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

  useEffect(() => {
    // /catalogue/<plugin-id> redirects here with #plugins. The section only exists once
    // the account has loaded, so scroll (and move focus) after that render.
    if (account === null || window.location.hash !== "#plugins") return;
    const heading = document.getElementById("detail-plugins-heading");
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  }, [account]);

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

  function add(app: CatalogueEntry) {
    addApp(app.id);
    setNotice(`${app.name} added. Find it in My apps.`);
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening the catalogue…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={load} />;
  // The route checks the id before rendering, so this only guards against stale data.
  if (entry === undefined) return <main className="account-screen"><p role="alert">This entry is not in the catalogue. <a href="/catalogue">Back to Catalogue</a></p></main>;
  // The route redirects plugins to their parent; this covers a stale client link.
  const parent = parentOf(entry);
  if (parent !== undefined) return <main className="account-screen"><p role="alert">{entry.name} is a plugin. <a href={`/catalogue/${parent.id}#plugins`}>See it in {parent.name}</a></p></main>;

  const added = isAdded(entry, addedApps);
  const publisher = publisherFor(entry);
  let typeLabel = "App";
  if (entry.type === "agent") typeLabel = "Agent";
  let status: keyof typeof STATUS_LABELS = entry.status;
  if (added) status = "added";
  if (!added && entry.status === "added") status = "available";

  return <div className="catalogue-shell">
    <Sidebar active="catalogue" username={account.username} onSignOut={signOut} busy={busy} />
    <main className="catalogue-main detail-main">
      <header className="topbar"><a className="mobile-brand" href="/"><span className="brand-word">WORKSPACE</span></a><div className="topbar-actions"><a className="mobile-team-link" href="/apps">My apps</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut} disabled={busy}><Icon name="exit" /></button></div></header>
      <a className="detail-back" href="/catalogue"><Icon name="arrow" />Back to Catalogue</a>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="catalogue-notice detail-notice" role="status">{notice}</p>}
      <div className="detail-layout">
        <Carousel name={entry.name} type={entry.type} screenshots={entry.screenshots} />
        <div className="detail-info">
          <span className={`catalogue-type catalogue-type-${entry.type}`}><Icon name={entry.type} />{typeLabel}</span>
          <h1>{entry.name}</h1>
          {/* The name is plain text: there is no publisher profile page yet. */}
          <div className="detail-publisher">
            <PublisherAvatar publisher={publisher} size={32} />
            <span className="detail-publisher-name">{publisher.name}</span>
            {/* Icon plus the word "Official", announced as "Verified publisher". */}
            {publisher.verified && <span className="publisher-official" role="img" aria-label="Verified publisher"><Icon name="verified" />Official</span>}
          </div>
          <p className="detail-summary">{entry.description}</p>
          <dl className="detail-facts">
            <div><dt>Price</dt><dd className="detail-price">{formatPrice(entry.price)}</dd></div>
            <div><dt>Status</dt><dd>{STATUS_LABELS[status]}</dd></div>
          </dl>
          <PrimaryAction entry={entry} added={added} onAdd={add} />
          <p className="detail-description">{entry.longDescription}</p>
          {entry.placeholder && <p className="detail-mock">Sample entry for this prototype.</p>}
        </div>
      </div>
      {/* Only apps have plugins; agents have no plugins section. */}
      {entry.type === "app" && <PluginsSection parent={entry} parentAdded={added} addedApps={addedApps} onAdd={add} />}
    </main>
  </div>;
}
