"use client";

import { useEffect, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, ProjectSwitcher, Sidebar } from "@/common/components";
import { useProjectId } from "@/common/hooks/useProjectId";
import { projectPath } from "@/common/services/project";
import type { InventoryFilter, InventoryItem } from "../types";
import { EMPTY_FILTER, filterInventory, groupByType, itemAnchor, listInventory } from "../services/inventory";
import InventoryFilters from "./InventoryFilters";
import InventoryItemCard from "./InventoryItemCard";
import "../inventory.css";

type Account = { username: string };

/** The item a "Set up" link asked for (?item=<id>), or null. */
function requestedItem() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("item");
}

function EmptyInventory({ projectId }: { projectId: string }) {
  return <div className="inventory-empty">
    <h2>Nothing installed yet</h2>
    <p>Tools, skills, connectors and models your agents can use will appear here.</p>
    <a className="account-submit" href={projectPath(projectId, "/catalogue")}>Browse the catalogue</a>
  </div>;
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return <div className="inventory-empty">
    <h2>Nothing matches these filters</h2>
    <p>Try another word, or show every type and status.</p>
    <button type="button" className="account-submit" onClick={onClear}>Clear filters</button>
  </div>;
}

export default function InventoryPage() {
  const projectId = useProjectId();
  const [account, setAccount] = useState<Account | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filter, setFilter] = useState<InventoryFilter>(EMPTY_FILTER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [highlighted, setHighlighted] = useState<string | null>(null);

  async function load(signal?: AbortSignal) {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store", signal });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not open the inventory. Please retry.");
    const user = await response.json();
    setItems(await listInventory(projectId, signal));
    setAccount(user);
    setHighlighted(requestedItem());
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // Loads once per project; load() itself only reads projectId.
  }, [projectId]);

  async function reload() {
    try {
      setItems(await listInventory(projectId));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  // A "Set up" link from the Add agent form brings the owner to one item: scroll to it and focus it.
  useEffect(() => {
    if (!highlighted || loading) return;
    const card = document.getElementById(itemAnchor(highlighted));
    if (!card) return;
    card.scrollIntoView({ block: "center" });
    card.focus({ preventScroll: true });
  }, [highlighted, loading]);

  async function signOut() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { setError("Could not sign out. Please retry."); return; }
    window.location.assign("/login");
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening your inventory…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button className="account-submit" onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={() => load()} />;

  const shown = filterInventory(items, filter);
  const groups = groupByType(shown);
  return <div className="inventory-shell">
    <Sidebar active="inventory" username={account.username} onSignOut={signOut} />
    <main className="inventory-main">
      <header className="topbar"><ProjectSwitcher section="/inventory" /><div className="topbar-actions"><a className="text-button" href={projectPath(projectId, "/agents")}>My agents</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut}><Icon name="exit" /></button></div></header>
      <div className="inventory-content">
        <div className="inventory-intro">
          <h1>Inventory</h1>
          <p>Everything this project has installed or connected. Agents can only use what is listed here.</p>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {items.length === 0 && <EmptyInventory projectId={projectId} />}
        {items.length > 0 && <>
          <InventoryFilters filter={filter} onChange={setFilter} shown={shown.length} total={items.length} />
          {groups.length === 0 && <NoMatches onClear={() => setFilter(EMPTY_FILTER)} />}
          {groups.map((group) => <section key={group.type} className="inventory-group" aria-labelledby={`group-${group.type}`}>
            <h2 id={`group-${group.type}`}>{group.label} <span className="inventory-group-count">{group.items.length}</span></h2>
            <div className="inventory-grid">
              {group.items.map((entry) => <InventoryItemCard key={entry.id} item={entry} highlighted={entry.id === highlighted}
                knowledgeHref={projectPath(projectId, "/knowledge")} onChanged={() => { void reload(); }} />)}
            </div>
          </section>)}
        </>}
      </div>
    </main>
  </div>;
}
