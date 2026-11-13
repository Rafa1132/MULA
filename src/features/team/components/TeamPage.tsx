"use client";

import { useEffect, useRef, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, MulaLogo, Sidebar } from "@/common/components";
import { ForecastPanel } from "@/features/forecasting";
import { Agent, teamRequest } from "../services/team";
import "../team.css";

function AgentSettings({ agent, onSaved }: { agent: Agent; onSaved: (agent: Agent) => void }) {
  const [prompt, setPrompt] = useState(agent.prompt);
  const [data, setData] = useState(agent.data);
  const [tools, setTools] = useState(agent.tools);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("settings");
  const dirty = prompt !== agent.prompt || data !== agent.data || JSON.stringify(tools) !== JSON.stringify(agent.tools);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await teamRequest(`/api/team/${agent.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, data, tools, revision: agent.revision }) });
      setPrompt(saved.prompt); setData(saved.data); setTools(saved.tools); onSaved(saved);
      setNotice("Saved for your account. Applies to the next request.");
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setBusy(false); }
  }

  return <section className="agent-inspector" aria-label={`${agent.name} configuration`} data-dirty={dirty}>
    <header className="inspector-heading"><div className="agent-glyph" aria-hidden="true">{agent.name[0]}</div><div><div className="eyebrow">YOUR TEAMMATE</div><h2>{agent.name}</h2></div><span className="agent-badge">Available</span></header>
    <p className="agent-description">{agent.description}</p>
    <div className="agent-tabs" aria-label="Agent views"><button aria-pressed={tab === "settings"} onClick={() => setTab("settings")}>Configuration{dirty && " •"}</button>{agent.id === "forecasting" && <button aria-pressed={tab === "forecast"} onClick={() => setTab("forecast")}>Run a forecast</button>}{agent.id === "operator" && <a href="/">Open conversation ↗</a>}</div>
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
      {agent.id === "forecasting" && <p className="settings-help">Statistical tools calculate the forecast. Instructions and reference data guide the optional Qwen explanation; they do not change the numbers. Run parameters are set in “Run a forecast”.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="team-notice" role="status">{notice}</p>}
      <footer className="settings-footer"><span>{dirty && "Unsaved changes"}{!dirty && "Settings up to date"}</span><button className="account-submit" disabled={busy || !dirty}>{busy && "Saving…"}{!busy && "Save settings"}</button></footer>
    </form>}
    {tab === "forecast" && <>{dirty && <p className="team-notice">Save your configuration changes before running a forecast.</p>}<ForecastPanel agent={agent} disabled={dirty} /></>}
  </section>;
}

export default function TeamPage() {
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [selectedId, setSelectedId] = useState("operator");
  const detail = useRef<HTMLDivElement>(null);
  const selected = agents.find((agent) => agent.id === selectedId);

  async function load(signal?: AbortSignal) {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store", signal });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not open your team. Please retry.");
    const user = await response.json();
    const result = await teamRequest("/api/team", { signal });
    setAgents(result.agents); setAccount(user);
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  function selectAgent(id: string) {
    if (id === selectedId) return;
    if (detail.current?.querySelector('[data-dirty="true"]') && !window.confirm("Discard unsaved agent settings?")) return;
    setSelectedId(id);
    if (window.matchMedia("(max-width: 1000px)").matches) detail.current?.scrollIntoView({ block: "start" });
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await teamRequest("/api/auth/logout", { method: "POST" });
      window.location.assign("/");
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setSigningOut(false); }
  }

  if (loading) return <main className="account-screen"><p role="status">Opening your team…</p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button className="account-submit" onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={() => load()} />;

  return <div className="team-shell">
    <Sidebar active="team" username={account.username} onSignOut={signOut} busy={signingOut} />
    <main className="team-main">
      <header className="topbar"><span className="desktop-title">Your workspace <span className="header-divider">/</span> <strong>My team</strong></span><span className="mobile-brand"><MulaLogo /></span><div className="topbar-actions"><a className="text-button" href="/memory">Memory</a><a className="text-button" href="/">Back to Operator</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut} disabled={signingOut}><Icon name="exit" /></button></div></header>
      <div className="team-content">
        {error && <p className="error" role="alert">{error}</p>}
        <div className="team-intro"><div><div className="eyebrow">SMALL TEAM. REAL SUPPORT.</div><h1>Your people, powered by Mula.</h1><p>A place for every agent. A clear role for each one.</p></div><span className="team-count">{agents.length} agents available</span></div>
        <div className="team-layout"><nav className="team-roster" aria-label="Available agents">{agents.map((agent) => <button key={agent.id} className="agent-card" aria-pressed={selectedId === agent.id} aria-controls="agent-detail" aria-label={`Configure ${agent.name}`} onClick={() => selectAgent(agent.id)}><span className="agent-card-top"><span className="agent-glyph" aria-hidden="true">{agent.name[0]}</span><span className="agent-badge">Available</span></span><strong>{agent.name}</strong><span className="agent-card-description">{agent.description}</span><span className="agent-card-footer">{agent.tools.length} tools enabled <span aria-hidden="true">↗</span></span></button>)}<p className="roster-note">Only agents ready to use appear here. You decide how they work.</p></nav>
          <div ref={detail} id="agent-detail">{selected && <AgentSettings key={selected.id} agent={selected} onSaved={(saved) => setAgents((previous) => previous.map((agent) => { if (agent.id === saved.id) return saved; return agent; }))} />}</div>
        </div>
      </div>
    </main>
  </div>;
}
