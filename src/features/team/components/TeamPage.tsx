"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AccountForm } from "@/features/auth";
import { Icon, Sidebar, ProjectSwitcher } from "@/common/components";
import { ForecastPanel } from "@/features/forecasting";
import { listInventory } from "@/features/inventory";
import type { InventoryItem } from "@/features/inventory";
import { agentCards } from "../services/agentCards";
import type { AgentCardData } from "../services/agentCards";
import { draftOf, emptyDraft } from "../services/agentForm";
import type { AgentSummary } from "../services/agentForm";
import { browserStorage, createWorkspaceAgent, deleteWorkspaceAgent, listWorkspaceAgents, updateWorkspaceAgent } from "../services/workspaceAgents";
import type { AgentDraft, WorkspaceAgent } from "../services/workspaceAgents";
import AgentFormDialog from "./agentForm/AgentFormDialog";
import type { TemplateChoice } from "./agentForm/AgentFormDialog";
import CustomerServiceSettings from "./CustomerServiceSettings";
import { addTemplateAgent, channelOptions } from "../services/templates";
import type { AgentTemplate, ChannelOption, TemplateDraft } from "../services/templates";
import AgentList from "./AgentList";
import Toast from "./Toast";
import { Agent, resetLayout, teamRequest } from "../services/team";
import { loadAgents, readPanelTab, replaceAgent, savePanelTab, useAgentStore } from "../services/agentStore";
import type { Layout } from "../services/map";
import AdvancedSettings from "./AdvancedSettings";
import AgentChat from "./AgentChat";
import AgentPanelTabs, { PanelTabItem, tabId, tabPanelId } from "./AgentPanelTabs";
import { STAMINA_EXPLANATION, staminaOf, staminaView } from "../services/stamina";
import AgentMap from "./AgentMap";
import AgentAvatar from "./AgentAvatar";
import SimpleSettings from "./SimpleSettings";
import StaminaBar from "./StaminaBar";
import "../team.css";
import "../agent-form.css";
import { useProjectId } from "@/common/hooks/useProjectId";
import { projectPath } from "@/common/services/project";

const BASE_TABS: PanelTabItem[] = [{ id: "simple", label: "Simple" }, { id: "advanced", label: "Advanced" }];

type SettingsProps = {
  agent: Agent;
  agents: Agent[];
  username: string;
  // Where a template agent may answer (its Customer service tab).
  channels: ChannelOption[];
  onSaved: (agent: Agent) => void;
  onRemoved: () => void;
  onClose: () => void;
};

// Mirrors server/src/common/profiles.py profile_name(): "mula-" plus the project UUID without dashes,
// and the agent id for every agent but the Operator, which uses the project's own profile.
function runtimeProfile(projectId: string | undefined, agentId: string) {
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const project = "mula-" + projectId.replace(/-/g, "").toLowerCase();
  if (agentId === "operator") return project;
  return `${project}-${agentId}`;
}

function AgentSettings({ agent, agents, username, channels, onSaved, onRemoved, onClose }: SettingsProps) {
  const projectId = useProjectId();
  const [prompt, setPrompt] = useState(agent.prompt);
  const [data, setData] = useState(agent.data);
  const [tools, setTools] = useState(agent.tools);
  const [brain, setBrain] = useState(agent.brain);
  const [links, setLinks] = useState(agent.links);
  const [toolsets, setToolsets] = useState(agent.runtime_toolsets);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<string>(() => readPanelTab(username));
  const dirty = prompt !== agent.prompt || data !== agent.data || JSON.stringify(tools) !== JSON.stringify(agent.tools) || brain !== agent.brain
    || JSON.stringify(links) !== JSON.stringify(agent.links) || JSON.stringify(toolsets) !== JSON.stringify(agent.runtime_toolsets);
  const stamina = staminaView(staminaOf(agent.stamina));
  const tabs = [...BASE_TABS];
  if (agent.id !== "operator") tabs.push({ id: "chat", label: "Chat" });
  if (agent.id === "forecasting") tabs.push({ id: "forecast", label: "Run a forecast" });
  const support = agent.support;
  if (support) tabs.push({ id: "support", label: "Customer service" });

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
    setPrompt(agent.prompt); setData(agent.data); setTools(agent.tools); setBrain(agent.brain); setLinks(agent.links); setToolsets(agent.runtime_toolsets);
    setError(""); setNotice("Changes discarded.");
  }

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await teamRequest(`/api/team/${agent.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, data, tools, revision: agent.revision, brain, links, runtime_toolsets: toolsets }) });
      setPrompt(saved.prompt); setData(saved.data); setTools(saved.tools); setBrain(saved.brain); setLinks(saved.links); setToolsets(saved.runtime_toolsets); onSaved(saved);
      setNotice("Saved for your account. Applies to the next request.");
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setBusy(false); }
  }

  const layer = tab === "simple" || tab === "advanced";
  return <section className="agent-inspector" aria-label={`${agent.name} configuration`} data-dirty={dirty}>
    <header className="inspector-heading"><span className="agent-tile small"><AgentAvatar id={agent.id} name={agent.name} size={44} /></span><div><div className="eyebrow">YOUR AGENT</div><h2>{agent.name}</h2></div><span className="agent-badge">Available</span><button type="button" className="icon-button dialog-close" aria-label="Close settings" onClick={onClose}><span aria-hidden="true">×</span></button></header>
    <p className="agent-description">{agent.description}</p>
    <div className="agent-stamina"><StaminaBar view={stamina} standalone /><p className="settings-help">{STAMINA_EXPLANATION}{stamina.unlimited && " No limit is set for this agent."}</p></div>
    <div className="agent-tab-bar">
      <AgentPanelTabs tabs={tabs} selected={tab} onSelect={chooseTab} label="Agent views" />
      {agent.id === "operator" && <a className="agent-tab-link" href={projectPath(projectId)}>Open conversation ↗</a>}
    </div>
    {layer && <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="agent-settings" role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabId(tab)}>
      {tab === "simple" && <SimpleSettings agent={agent} agents={agents} busy={busy}
        prompt={prompt} onPrompt={changed(setPrompt)} tools={tools} onTools={changed(setTools)}
        links={links} onLinks={changed(setLinks)} toolsets={toolsets} onToolsets={changed(setToolsets)} />}
      {tab === "advanced" && <AdvancedSettings agent={agent} profile={runtimeProfile(projectId, agent.id)} tools={tools} busy={busy}
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
    {tab === "support" && support && <div role="tabpanel" id={tabPanelId("support")} aria-labelledby={tabId("support")}>
      <CustomerServiceSettings agent={{ ...agent, support }} channels={channels} onSaved={onSaved} onRemoved={onRemoved} />
    </div>}
    {tab === "forecast" && <div role="tabpanel" id={tabPanelId("forecast")} aria-labelledby={tabId("forecast")}>{dirty && <p className="team-notice">Save your configuration changes before running a forecast.</p>}<ForecastPanel agent={agent} disabled={dirty} /></div>}
  </section>;
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
  const projectId = useProjectId();
  const [account, setAccount] = useState<{ id?: string; username: string } | null>(null);
  // The map and the panel share one agent store, filled from the server.
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
  // The workspace inventory (features/inventory) and the agents added with the Add agent form.
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [added, setAdded] = useState<WorkspaceAgent[]>([]);
  const [view, setView] = useState<"map" | "list">("map");
  const [form, setForm] = useState<FormTarget>(null);
  const [toast, setToast] = useState("");
  const clearToast = useCallback(() => setToast(""), []);
  // Server templates (Customer Service) this project hasn't added yet.
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);

  async function load(signal?: AbortSignal) {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store", signal });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not open your agents. Please retry.");
    const user = await response.json();
    const [result, items, saved] = await Promise.all([
      teamRequest("/api/team", { signal }),
      listInventory(projectId, signal),
      listWorkspaceAgents(projectId, browserStorage()),
    ]);
    loadAgents(user.username, result.agents); setLayout(result.layout ?? {}); setInventory(items); setAdded(saved); setAccount(user);
    setTemplates(result.templates ?? []);
  }

  /** After a template agent was added or removed: the server's agent list and templates again. */
  async function reloadTeam(username: string) {
    const [result, items] = await Promise.all([teamRequest("/api/team"), listInventory(projectId)]);
    loadAgents(username, result.agents); setLayout(result.layout ?? {}); setInventory(items);
    setTemplates(result.templates ?? []);
  }

  async function addTemplate(templateId: string, draft: TemplateDraft) {
    const agent = await addTemplateAgent(templateId, draft);
    if (account) await reloadTeam(account.username);
    setToast(`${agent.name} was added. It answers customers from your knowledge base.`);
  }

  async function templateRemoved(agent: Agent) {
    setSelectedId(null);
    try {
      if (account) await reloadTeam(account.username);
      setToast(`${agent.name} was removed. Its knowledge base and inbox stay.`);
    } catch (failure) {
      if (failure instanceof Error) setError(failure.message);
    }
  }

  /** What the Add agent form needs to offer the server templates. */
  function templateChoice(): TemplateChoice | undefined {
    const operator = agents.find((agent) => agent.id === "operator") ?? agents[0];
    if (templates.length === 0 || !operator) return undefined;
    return {
      templates, brains: operator.available_brains, defaultBrain: operator.brain, channels: channelOptions(inventory, projectId),
      inventoryHref: projectPath(projectId, "/inventory"), onAdd: addTemplate,
    };
  }

  /** Every agent in the workspace except `exceptId`, for name checks and hand-offs. */
  function otherAgents(exceptId?: string): AgentSummary[] {
    return [
      ...agents.map((agent) => ({ id: agent.id, name: agent.name })),
      ...added.filter((agent) => agent.id !== exceptId).map((agent) => ({ id: agent.id, name: agent.name })),
    ];
  }

  async function createAgent(draft: AgentDraft) {
    const agent = await createWorkspaceAgent(projectId, draft, agents.map((entry) => entry.id), browserStorage());
    setAdded((current) => [...current, agent]);
    setView("list");
    setToast(`${agent.name} was added to My agents.`);
  }

  async function saveAgent(id: string, draft: AgentDraft) {
    const agent = await updateWorkspaceAgent(projectId, id, draft, browserStorage());
    setAdded((current) => current.map((entry) => {
      if (entry.id === id) return agent;
      return entry;
    }));
    setToast(`Changes to ${agent.name} were saved.`);
  }

  async function deleteAgent(agent: WorkspaceAgent) {
    setAdded(await deleteWorkspaceAgent(projectId, agent.id, browserStorage()));
    setToast(`${agent.name} was deleted. Its tools and skills stay in the inventory.`);
  }

  function openCard(card: AgentCardData) {
    if (card.kind === "server") setSelectedId(card.id);
    else setForm({ mode: "edit", id: card.id });
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
      window.location.assign("/login");
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setSigningOut(false); }
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening your agents…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button className="account-submit" onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={() => load()} />;

  return <div className="team-shell">
    <Sidebar active="team" username={account.username} onSignOut={signOut} busy={signingOut} />
    <main className="team-main">
      <header className="topbar"><ProjectSwitcher section="/agents" /><div className="topbar-actions"><a className="text-button" href={projectPath(projectId, "/memory")}>Memory</a><a className="text-button" href={projectPath(projectId)}>Back to Operator</a><button className="mobile-signout icon-button" aria-label="Sign out" onClick={signOut} disabled={signingOut}><Icon name="exit" /></button></div></header>
      <div className="team-content">
        {error && <p className="error" role="alert">{error}</p>}
        <div className="agents-intro">
          <div><h1>My agents</h1><p>Meet the agents working for your business.{view === "map" && <span className="map-hint"> Drag a card to arrange your map, or focus it and use the arrow keys. Drag empty space to pan; pinch or Ctrl/⌘ + scroll to zoom.</span>}</p></div>
          <button type="button" className="account-submit agents-add" onClick={() => setForm({ mode: "create" })}><Icon name="plus" />Add agent</button>
        </div>
        <div className="agents-toolbar">
          <div className="agents-view-switch" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>Map</button>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
          </div>
          {view === "map" && <button type="button" className="map-reset" onClick={reset} disabled={resetting}>{resetting && "Resetting…"}{!resetting && "Reset layout"}</button>}
        </div>
        {view === "map" && <>
          {mapError && <p className="error" role="alert">{mapError}</p>}
          {added.length > 0 && <p className="team-notice">{addedNotice(added.length)}</p>}
          <AgentMap key={mapVersion} agents={agents} connections={connections} saved={layout} selectedId={selectedId} username={account.username} onOpen={setSelectedId} onError={setMapError} />
        </>}
        {view === "list" && <AgentList cards={agentCards(agents, added, inventory, projectId)} onOpen={openCard} />}
      </div>
    </main>
    {selected && <AgentDialog key={selected.id} agent={selected} agents={agents} username={account.username} channels={channelOptions(inventory, projectId)}
      onClosed={() => setSelectedId(null)} onSaved={replaceAgent} onRemoved={() => void templateRemoved(selected)} />}
    {form && form.mode === "create" && <AgentFormDialog key="create" mode="create" title="Add agent" subtitle="NEW AGENT"
      initial={emptyDraft(inventory, projectId)} context={{ workspaceId: projectId, inventory, otherAgents: otherAgents() }} projectId={projectId}
      onSubmit={createAgent} onClosed={() => setForm(null)} templateChoice={templateChoice()} />}
    {form && form.mode === "edit" && <EditAgentDialog agent={added.find((entry) => entry.id === form.id)} inventory={inventory} projectId={projectId}
      otherAgents={otherAgents(form.id)} onSave={saveAgent} onDelete={deleteAgent} onClosed={() => setForm(null)} />}
    <Toast message={toast} onDone={clearToast} />
  </div>;
}

// Which form is open: none, Add agent, or an added agent's detail.
type FormTarget = null | { mode: "create" } | { mode: "edit"; id: string };

function addedNotice(count: number) {
  let agentsText = `${count} agents`;
  if (count === 1) agentsText = "1 agent";
  return `You added ${agentsText} in this browser. Switch to List to see them; they join the map once Mula runs them.`;
}

type EditProps = {
  agent: WorkspaceAgent | undefined;
  inventory: InventoryItem[];
  projectId: string;
  otherAgents: AgentSummary[];
  onSave: (id: string, draft: AgentDraft) => Promise<void>;
  onDelete: (agent: WorkspaceAgent) => Promise<void>;
  onClosed: () => void;
};

/** An added agent's detail: the Add agent form with its saved values, plus Delete. */
function EditAgentDialog({ agent, inventory, projectId, otherAgents, onSave, onDelete, onClosed }: EditProps) {
  if (!agent) return null;
  return <AgentFormDialog key={agent.id} mode="edit" title={agent.name} subtitle="YOUR AGENT"
    initial={draftOf(agent)} context={{ workspaceId: projectId, inventory, otherAgents }} projectId={projectId}
    onSubmit={(draft) => onSave(agent.id, draft)} onDelete={() => onDelete(agent)} onClosed={onClosed} />;
}
