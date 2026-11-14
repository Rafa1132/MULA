"use client";

import { useEffect, useRef, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, Sidebar } from "@/common/components";
import { ForecastPanel } from "@/features/forecasting";
import { Agent, Brain, Delegation, resetLayout, teamRequest } from "../services/team";
import type { Layout } from "../services/map";
import AgentChat from "./AgentChat";
import AgentMap from "./AgentMap";
import PixelAgent from "./PixelAgent";
import "../team.css";

const LOCATION_LABELS: Record<Brain["location"], string> = { local: "On this computer", cloud: "Anthropic cloud" };
const STATUS_LABELS: Record<Brain["status"], string> = { ready: "", needs_setup: "Needs setup", unchecked: "Not checked" };
const DELEGATION_OPTIONS: { id: Delegation; name: string; description: string }[] = [
  { id: "ask", name: "Ask me first", description: "Each question for another agent waits in your chat until you approve it." },
  { id: "auto", name: "Go ahead", description: "Questions run as soon as the reply ends. You still see each question and the answer." },
  { id: "off", name: "Don’t ask other agents", description: "The agent answers on its own and tells you which agent could help." },
];

function BrainOptions({ brains, value, busy, onChange }: { brains: Record<string, Brain>; value: string | null; busy: boolean; onChange: (id: string) => void }) {
  return <div className="agent-brains" role="radiogroup" aria-label="Brain">{Object.entries(brains).map(([id, brain]) => {
    // Keep the saved choice selectable so a brain that lost its setup still shows as chosen.
    const unavailable = brain.status === "needs_setup" && id !== value;
    return <label className="agent-brain" key={id} data-unavailable={unavailable}>
      <input type="radio" name="agent-brain" value={id} checked={value === id} disabled={busy || unavailable} onChange={() => onChange(id)} />
      <span className="agent-brain-text"><strong>{brain.name}</strong><span>{brain.description}</span></span>
      <span className="agent-brain-tags"><span className="brain-tag" data-location={brain.location}>{LOCATION_LABELS[brain.location]}</span>{STATUS_LABELS[brain.status] && <span className="brain-status">{STATUS_LABELS[brain.status]}</span>}</span>
    </label>;
  })}</div>;
}

function DelegationOptions({ value, busy, onChange }: { value: Delegation | null; busy: boolean; onChange: (mode: Delegation) => void }) {
  return <div className="agent-brains" role="radiogroup" aria-label="When this agent needs another agent">{DELEGATION_OPTIONS.map((option) =>
    <label className="agent-brain" key={option.id}>
      <input type="radio" name="agent-delegation" value={option.id} checked={value === option.id} disabled={busy} onChange={() => onChange(option.id)} />
      <span className="agent-brain-text"><strong>{option.name}</strong><span>{option.description}</span></span>
    </label>)}</div>;
}

function AgentSettings({ agent, names, onSaved, onClose }: { agent: Agent; names: Record<string, string>; onSaved: (agent: Agent) => void; onClose: () => void }) {
  const [prompt, setPrompt] = useState(agent.prompt);
  const [data, setData] = useState(agent.data);
  const [tools, setTools] = useState(agent.tools);
  const [brain, setBrain] = useState(agent.brain);
  const [delegation, setDelegation] = useState(agent.delegation);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("settings");
  const dirty = prompt !== agent.prompt || data !== agent.data || JSON.stringify(tools) !== JSON.stringify(agent.tools) || brain !== agent.brain || delegation !== agent.delegation;
  const brains = agent.available_brains;
  const chosenBrain = brains[brain];
  const setupNeeded = Object.values(brains).some((option) => option.status === "needs_setup");
  const askedAgents = agent.delegates_to.map((id) => names[id] ?? id).join(" and ");

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await teamRequest(`/api/team/${agent.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, data, tools, revision: agent.revision, brain, delegation }) });
      setPrompt(saved.prompt); setData(saved.data); setTools(saved.tools); setBrain(saved.brain); setDelegation(saved.delegation); onSaved(saved);
      setNotice("Saved for your account. Applies to the next request.");
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setBusy(false); }
  }

  return <section className="agent-inspector" aria-label={`${agent.name} configuration`} data-dirty={dirty}>
    <header className="inspector-heading"><span className="pixel-tile small"><PixelAgent id={agent.id} name={agent.name} size={40} /></span><div><div className="eyebrow">YOUR AGENT</div><h2>{agent.name}</h2></div><span className="agent-badge">Available</span><button type="button" className="icon-button dialog-close" aria-label="Close settings" onClick={onClose}><span aria-hidden="true">×</span></button></header>
    <p className="agent-description">{agent.description}</p>
    <div className="agent-tabs" aria-label="Agent views"><button aria-pressed={tab === "settings"} onClick={() => setTab("settings")}>Configuration{dirty && " •"}</button>{agent.id !== "operator" && <button aria-pressed={tab === "chat"} onClick={() => setTab("chat")}>Chat</button>}{agent.id === "forecasting" && <button aria-pressed={tab === "forecast"} onClick={() => setTab("forecast")}>Run a forecast</button>}{agent.id === "operator" && <a href="/">Open conversation ↗</a>}</div>
    {tab === "settings" && <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="agent-settings">
      <div className="settings-section"><div className="section-number">01</div><div><label htmlFor="agent-prompt">Instructions</label><p>Tell this agent how to work with you. These instructions extend its built-in role.</p></div></div>
      <textarea id="agent-prompt" value={prompt} onChange={(event) => { setPrompt(event.target.value); setNotice(""); }} maxLength={4000} disabled={busy} placeholder="For example: Reply in Indonesian. Keep explanations practical and highlight assumptions." rows={5} />
      <div className="field-caption">{prompt.length.toLocaleString()} / 4,000 characters</div>
      <div className="settings-section"><div className="section-number">02</div><div><label htmlFor="agent-data">Reference data</label><p>Business details this agent should know. Included in each model request for this agent.</p></div></div>
      <textarea id="agent-data" value={data} onChange={(event) => { setData(event.target.value); setNotice(""); }} maxLength={8000} disabled={busy} placeholder="For example: We sell coffee. Sales are recorded in IDR. A trading week is seven days." rows={4} />
      <div className="field-caption">{data.length.toLocaleString()} / 8,000 characters · Saved only to your account</div>
      <div className="settings-section"><div className="section-number">03</div><div><h3>Tools</h3><p>Choose the capabilities this agent can use. Changes are enforced by the server.</p></div></div>
      <div className="agent-tools">{Object.entries(agent.available_tools).map(([id, label]) => <label className="agent-tool" key={id}><span>{label}</span><input type="checkbox" checked={tools.includes(id)} disabled={busy} onChange={(event) => { setNotice(""); if (event.target.checked) setTools([...tools, id]); else setTools(tools.filter((tool) => tool !== id)); }} /></label>)}</div>
      {agent.id === "operator" && <p className="settings-help">Turning off a tool stops future uses; it does not erase earlier chat content. Manage saved facts in <a href="/memory">Memory</a>.</p>}
      <div className="settings-section"><div className="section-number">04</div><div><h3>Brain</h3><p>Choose the language model this agent thinks with. Applies to your next message.</p></div></div>
      <BrainOptions brains={brains} value={brain} busy={busy} onChange={(id) => { setBrain(id); setNotice(""); }} />
      {chosenBrain && chosenBrain.location === "cloud" && <p className="settings-help">{chosenBrain.name} sends each message, with retrieved memory, your instructions, reference data and attached CSVs, to Anthropic. Usage is billed to the Anthropic API key set up on the Mula runtime.</p>}
      {chosenBrain && chosenBrain.status === "needs_setup" && <p className="error" role="alert">{chosenBrain.name} is not set up on the Mula runtime, so chats will fail. Choose another brain or finish its setup.</p>}
      {setupNeeded && <p className="settings-help">To add the Claude brains, run <code>server/.venv/bin/python server/scripts/enable_claude.py</code> with a Claude Console API key, then restart Mula.</p>}
      {agent.delegates_to.length > 0 && <>
        <div className="settings-section"><div className="section-number">05</div><div><h3>When {agent.name} needs another agent</h3><p>{agent.name} can ask {askedAgents} for help. Choose whether you approve each request.</p></div></div>
        <DelegationOptions value={delegation} busy={busy} onChange={(mode) => { setDelegation(mode); setNotice(""); }} />
      </>}
      {agent.id === "forecasting" && <p className="settings-help">The numbers always come from the statistical methods above; the brain, instructions and reference data shape how {agent.name} talks and explains them. Run parameters are set in “Run a forecast”.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="team-notice" role="status">{notice}</p>}
      <footer className="settings-footer"><span>{dirty && "Unsaved changes"}{!dirty && "Settings up to date"}</span><button className="account-submit" disabled={busy || !dirty}>{busy && "Saving…"}{!busy && "Save settings"}</button></footer>
    </form>}
    {tab === "chat" && <>{dirty && <p className="team-notice">Unsaved configuration changes don’t apply to this chat until you save them.</p>}<AgentChat agent={agent} /></>}
    {tab === "forecast" && <>{dirty && <p className="team-notice">Save your configuration changes before running a forecast.</p>}<ForecastPanel agent={agent} disabled={dirty} /></>}
  </section>;
}

function AgentDialog({ agent, names, onSaved, onClosed }: { agent: Agent; names: Record<string, string>; onSaved: (agent: Agent) => void; onClosed: () => void }) {
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
  return <dialog ref={dialog} className="agent-dialog" aria-label={`${agent.name} settings`} onClose={onClosed}
    onCancel={(event) => { event.preventDefault(); requestClose(); }}
    onClick={(event) => { if (event.target === dialog.current) requestClose(); }}>
    <AgentSettings agent={agent} names={names} onSaved={onSaved} onClose={requestClose} />
  </dialog>;
}

export default function TeamPage() {
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
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
    setAgents(result.agents); setLayout(result.layout ?? {}); setAccount(user);
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
        <div className="agents-intro"><div><h1>My agents</h1><p>Meet the agents working for your business. <span className="map-hint">Drag a card to arrange your map, or focus it and use the arrow keys.</span></p></div><button type="button" className="map-reset" onClick={reset} disabled={resetting}>{resetting && "Resetting…"}{!resetting && "Reset layout"}</button></div>
        {mapError && <p className="error" role="alert">{mapError}</p>}
        <AgentMap key={mapVersion} agents={agents} saved={layout} selectedId={selectedId} onOpen={setSelectedId} onError={setMapError} />
      </div>
    </main>
    {selected && <AgentDialog key={selected.id} agent={selected} names={Object.fromEntries(agents.map((agent) => [agent.id, agent.name]))} onClosed={() => setSelectedId(null)} onSaved={(saved) => setAgents((previous) => previous.map((agent) => { if (agent.id === saved.id) return saved; return agent; }))} />}
  </div>;
}
