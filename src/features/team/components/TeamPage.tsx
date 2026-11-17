"use client";

import { useEffect, useRef, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, Sidebar } from "@/common/components";
import { ForecastPanel } from "@/features/forecasting";
import { Agent, resetLayout, teamRequest } from "../services/team";
import { Connections, addConnection, loadAgents, readPanelTab, removeConnection, replaceAgent, savePanelTab, useAgentStore } from "../services/agentStore";
import type { Layout } from "../services/map";
import AdvancedSettings from "./AdvancedSettings";
import AgentChat from "./AgentChat";
import AgentPanelTabs, { PanelTabItem, tabId, tabPanelId } from "./AgentPanelTabs";
import { STAMINA_EXPLANATION, staminaOf, staminaView } from "../services/stamina";
import AgentMap from "./AgentMap";
import PixelAgent from "./PixelAgent";
import SimpleSettings from "./SimpleSettings";
import StaminaBar from "./StaminaBar";
import "../team.css";

const BASE_TABS: PanelTabItem[] = [{ id: "simple", label: "Simple" }, { id: "advanced", label: "Advanced" }];

type SettingsProps = {
  agent: Agent;
  agents: Agent[];
  connections: Connections;
  username: string;
  profile: string | null;
  onSaved: (agent: Agent) => void;
  onClose: () => void;
};

function AgentSettings({ agent, agents, connections, username, profile, onSaved, onClose }: SettingsProps) {
  const [prompt, setPrompt] = useState(agent.prompt);
  const [data, setData] = useState(agent.data);
  const [tools, setTools] = useState(agent.tools);
  const [brain, setBrain] = useState(agent.brain);
  const [delegation, setDelegation] = useState(agent.delegation);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<string>(() => readPanelTab(username));
  const dirty = prompt !== agent.prompt || data !== agent.data || JSON.stringify(tools) !== JSON.stringify(agent.tools) || brain !== agent.brain || delegation !== agent.delegation;
  const stamina = staminaView(staminaOf(agent.stamina));
  const ownConnections = connections[agent.id] ?? [];
  const tabs = [...BASE_TABS];
  if (agent.id !== "operator") tabs.push({ id: "chat", label: "Chat" });
  if (agent.id === "forecasting") tabs.push({ id: "forecast", label: "Run a forecast" });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function changed<T>(setter: (value: T) => void) {
    return (value: T) => { setter(value); setNotice(""); };
  }

  function chooseTab(id: string) {
    setTab(id);
    // Only the two layers are remembered; Chat and forecasts exist for some agents only.
    if (id === "simple" || id === "advanced") savePanelTab(username, id);
  }

  function cancel() {
    setPrompt(agent.prompt); setData(agent.data); setTools(agent.tools); setBrain(agent.brain); setDelegation(agent.delegation);
    setError(""); setNotice("Changes discarded.");
  }

  function connect(id: string) {
    try {
      addConnection(agent.id, id);
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
  }

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await teamRequest(`/api/team/${agent.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, data, tools, revision: agent.revision, brain, delegation }) });
      setPrompt(saved.prompt); setData(saved.data); setTools(saved.tools); setBrain(saved.brain); setDelegation(saved.delegation); onSaved(saved);
      setNotice("Saved for your account. Applies to the next request.");
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setBusy(false); }
  }

  const layer = tab === "simple" || tab === "advanced";
  return <section className="agent-inspector" aria-label={`${agent.name} configuration`} data-dirty={dirty}>
    <header className="inspector-heading"><span className="pixel-tile small"><PixelAgent id={agent.id} name={agent.name} size={40} /></span><div><div className="eyebrow">YOUR AGENT</div><h2>{agent.name}</h2></div><span className="agent-badge">Available</span><button type="button" className="icon-button dialog-close" aria-label="Close settings" onClick={onClose}><span aria-hidden="true">×</span></button></header>
    <p className="agent-description">{agent.description}</p>
    <div className="agent-stamina"><StaminaBar view={stamina} standalone /><p className="settings-help">{STAMINA_EXPLANATION}{stamina.unlimited && " No limit is set for this agent."}</p></div>
    <div className="agent-tab-bar">
      <AgentPanelTabs tabs={tabs} selected={tab} onSelect={chooseTab} label="Agent views" />
      {agent.id === "operator" && <a className="agent-tab-link" href="/">Open conversation ↗</a>}
    </div>
    {layer && <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="agent-settings" role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabId(tab)}>
      {tab === "simple" && <SimpleSettings agent={agent} agents={agents} connections={ownConnections} busy={busy}
        prompt={prompt} onPrompt={changed(setPrompt)} tools={tools} onTools={changed(setTools)} delegation={delegation} onDelegation={changed(setDelegation)}
        onConnect={connect} onDisconnect={(id) => removeConnection(agent.id, id)} />}
      {tab === "advanced" && <AdvancedSettings agent={agent} profile={profile} tools={tools} busy={busy}
        brain={brain} onBrain={changed(setBrain)} data={data} onData={changed(setData)} />}
      {agent.id === "forecasting" && tab === "simple" && <p className="settings-help">The numbers always come from the statistical methods in Tools; the brain, instructions and reference data shape how {agent.name} talks and explains them.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="team-notice" role="status">{notice}</p>}
      <footer className="settings-footer">
        <span className="settings-state" data-dirty={dirty}>{dirty && <><span className="dirty-dot" aria-hidden="true" />Unsaved changes</>}{!dirty && "Settings up to date"}</span>
        <div className="settings-actions">
          <button type="button" className="map-reset" onClick={cancel} disabled={busy || !dirty}>Cancel</button>
          <button className="account-submit" disabled={busy || !dirty}>{busy && "Saving…"}{!busy && "Save settings"}</button>
        </div>
      </footer>
    </form>}
    {tab === "chat" && <div role="tabpanel" id={tabPanelId("chat")} aria-labelledby={tabId("chat")}>{dirty && <p className="team-notice">Unsaved configuration changes don’t apply to this chat until you save them.</p>}<AgentChat agent={agent} /></div>}
    {tab === "forecast" && <div role="tabpanel" id={tabPanelId("forecast")} aria-labelledby={tabId("forecast")}>{dirty && <p className="team-notice">Save your configuration changes before running a forecast.</p>}<ForecastPanel agent={agent} disabled={dirty} /></div>}
  </section>;
}

// Mirrors server/src/common/profiles.py profile_name(): "mula-" plus the account UUID without dashes.
function runtimeProfile(accountId: string | undefined) {
  if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId)) return null;
  return "mula-" + accountId.replace(/-/g, "").toLowerCase();
}

type DialogProps = Omit<SettingsProps, "onClose"> & { onClosed: () => void };

function AgentDialog({ onClosed, ...settings }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // A modal dialog brings focus trapping, Esc and a backdrop; closing returns focus to the card.
    dialog.current?.showModal();
  }, []);

  function requestClose() {
    const current = dialog.current;
    if (!current) return;
    if (current.querySelector('[data-dirty="true"]') && !window.confirm("Discard unsaved agent settings?")) return;
    current.close();
  }

  // Every way of closing ends in the dialog's close event, including a browser-forced close.
  return <dialog ref={dialog} className="agent-dialog" aria-label={`${settings.agent.name} settings`} onClose={onClosed}
    onCancel={(event) => { event.preventDefault(); requestClose(); }}
    onClick={(event) => { if (event.target === dialog.current) requestClose(); }}>
    <AgentSettings {...settings} onClose={requestClose} />
  </dialog>;
}

export default function TeamPage() {
  const [account, setAccount] = useState<{ id?: string; username: string } | null>(null);
  // The map and the panel share one agent store (instructions, tools, brain from the server; connections local).
  const { agents, connections } = useAgentStore();
  const [layout, setLayout] = useState<Layout>({});
  // Bumped by Reset layout to remount the map with the defaults.
  const [mapVersion, setMapVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = agents.find((agent) => agent.id === selectedId);

  async function load(signal?: AbortSignal) {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store", signal });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not open your agents. Please retry.");
    const user = await response.json();
    const result = await teamRequest("/api/team", { signal });
    loadAgents(user.username, result.agents); setLayout(result.layout ?? {}); setAccount(user);
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function reset() {
    setResetting(true); setMapError("");
    try {
      setLayout(await resetLayout());
      setMapVersion((version) => version + 1);
    } catch (failure) { if (failure instanceof Error) setMapError(failure.message); }
    finally { setResetting(false); }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await teamRequest("/api/auth/logout", { method: "POST" });
      window.location.assign("/");
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setSigningOut(false); }
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening your agents…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button className="account-submit" onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={() => load()} />;

  return <div className="team-shell">
    <Sidebar active="team" username={account.username} onSignOut={signOut} busy={signingOut} />
    <main className="team-main">
      <header className="topbar"><span className="mobile-brand"><span className="brand-word">WORKSPACE</span></span><div className="topbar-actions"><a className="text-button" href="/memory">Memory</a><a className="text-button" href="/">Back to Operator</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut} disabled={signingOut}><Icon name="exit" /></button></div></header>
      <div className="team-content">
        {error && <p className="error" role="alert">{error}</p>}
        <div className="agents-intro"><div><h1>My agents</h1><p>Meet the agents working for your business. <span className="map-hint">Drag a card to arrange your map, or focus it and use the arrow keys. Drag empty space to pan; pinch or Ctrl/⌘ + scroll to zoom.</span></p></div><button type="button" className="map-reset" onClick={reset} disabled={resetting}>{resetting && "Resetting…"}{!resetting && "Reset layout"}</button></div>
        {mapError && <p className="error" role="alert">{mapError}</p>}
        <AgentMap key={mapVersion} agents={agents} connections={connections} saved={layout} selectedId={selectedId} username={account.username} onOpen={setSelectedId} onError={setMapError} />
      </div>
    </main>
    {selected && <AgentDialog key={selected.id} agent={selected} agents={agents} connections={connections} username={account.username} profile={runtimeProfile(account.id)}
      onClosed={() => setSelectedId(null)} onSaved={replaceAgent} />}
  </div>;
}
