"use client";

import { Icon } from "@/common/components";
import { agentLinks } from "../services/map";
import type { Agent, Delegation } from "../services/team";
import { toolInfo } from "../services/tools";
import CardPicker from "./CardPicker";
import PixelAgent from "./PixelAgent";

export const INSTRUCTIONS_LIMIT = 4000;
// The server accepts at most this many enabled tools per agent (SettingsInput.tools).
export const TOOL_LIMIT = 10;

const DELEGATION_OPTIONS: { id: Delegation; name: string; description: string }[] = [
  { id: "ask", name: "Ask me first", description: "Each question for another agent waits in your chat until you approve it." },
  { id: "auto", name: "Go ahead", description: "Questions run as soon as the reply ends. You still see each question and the answer." },
  { id: "off", name: "Don’t ask other agents", description: "The agent answers on its own and tells you which agent could help." },
];

type Props = {
  agent: Agent;
  agents: Agent[];
  // Ids of the agents this one may hand work to, from the agent store.
  connections: string[];
  prompt: string;
  onPrompt: (value: string) => void;
  tools: string[];
  onTools: (tools: string[]) => void;
  delegation: Delegation | null;
  onDelegation: (mode: Delegation) => void;
  busy: boolean;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
};

// After a change the card that had focus may be gone; move focus somewhere sensible once React has rendered.
function focusLater(selector: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
}

function ToolVisual({ id }: { id: string }) {
  return <span className="panel-card-icon" aria-hidden="true"><Icon name={toolInfo(id).icon} /></span>;
}

function AgentVisual({ agent }: { agent: Agent }) {
  return <span className="pixel-tile tiny" aria-hidden="true"><PixelAgent id={agent.id} name={agent.name} size={28} /></span>;
}

/** The Simple layer: instructions, tools and connections. */
export default function SimpleSettings({ agent, agents, connections, prompt, onPrompt, tools, onTools, delegation, onDelegation, busy, onConnect, onDisconnect }: Props) {
  const toolName = (id: string) => agent.available_tools[id] ?? id;
  const missingTools = Object.keys(agent.available_tools).filter((id) => !tools.includes(id));
  const others = agents.filter((other) => other.id !== agent.id);
  const connected = others.filter((other) => connections.includes(other.id));
  const unconnected = others.filter((other) => !connections.includes(other.id));
  // Connections the runtime can't use yet: anything beyond the server's delegates_to.
  const prototypeOnly = connected.some((other) => !agent.delegates_to.includes(other.id));
  // The same status the map shows in each line's tooltip, from the saved approval setting.
  const links = new Map(agentLinks(agents, { [agent.id]: connections }).map((link) => [link.to, link]));

  function addTool(id: string) {
    onTools([...tools, id]);
    focusLater(`#tool-card-${id}`);
  }

  function removeTool(id: string) {
    onTools(tools.filter((tool) => tool !== id));
    focusLater(".tools-section .panel-add-card");
  }

  function connect(id: string) {
    onConnect(id);
    focusLater(`#connection-card-${id}`);
  }

  function disconnect(id: string) {
    onDisconnect(id);
    focusLater(".connections-section .panel-add-card");
  }

  return <>
    <section className="panel-section">
      <label id="simple-instructions" htmlFor="agent-prompt" className="panel-section-title">Instructions</label>
      <p className="settings-help">What this agent should do and how it should behave. These extend its built-in role.</p>
      <textarea id="agent-prompt" value={prompt} onChange={(event) => onPrompt(event.target.value)} maxLength={INSTRUCTIONS_LIMIT} disabled={busy} rows={8}
        aria-describedby="agent-prompt-count" placeholder="For example: Reply in Indonesian. Keep explanations practical and highlight assumptions." />
      <div id="agent-prompt-count" className="field-caption">{prompt.length.toLocaleString()} / {INSTRUCTIONS_LIMIT.toLocaleString()} characters</div>
    </section>

    <section className="panel-section tools-section" aria-labelledby="simple-tools">
      <h3 id="simple-tools" className="panel-section-title">Tools</h3>
      <p className="settings-help">What this agent can use. The server enforces this list once you save.</p>
      {tools.length === 0 && <p className="settings-help">No tools yet.</p>}
      <ul className="panel-card-list">{tools.map((id) =>
        <li key={id} id={`tool-card-${id}`} className="panel-card" tabIndex={-1}>
          <ToolVisual id={id} />
          <span className="panel-card-text"><strong>{toolName(id)}</strong><span>{toolInfo(id).description}</span></span>
          <button type="button" className="icon-button panel-remove" aria-label={`Remove ${toolName(id)} tool`} disabled={busy} onClick={() => removeTool(id)}><span aria-hidden="true">×</span></button>
        </li>)}</ul>
      <CardPicker label="Add tool" pickerLabel="Tools you can add" emptyText="This agent already has every tool available to it."
        items={missingTools.map((id) => ({ id, title: toolName(id), description: toolInfo(id).description, visual: <ToolVisual id={id} /> }))}
        addLabel={(item) => `Add ${item.title} tool`} onAdd={addTool}
        disabled={busy || tools.length >= TOOL_LIMIT} disabledReason={`An agent can have up to ${TOOL_LIMIT} tools.`} />
    </section>

    <section className="panel-section connections-section" aria-labelledby="simple-connections">
      <h3 id="simple-connections" className="panel-section-title">Connections</h3>
      <p className="settings-help">Agents {agent.name} can hand work to. Each connection is a line on your map.</p>
      {connected.length === 0 && <p className="settings-help">No connections yet.</p>}
      <ul className="panel-card-list">{connected.map((other) =>
        <li key={other.id} id={`connection-card-${other.id}`} className="panel-card" tabIndex={-1}>
          <AgentVisual agent={other} />
          <span className="panel-card-text"><strong>{other.name}</strong><span>{other.description}</span>
            {links.get(other.id) && <span className="connection-status" data-planned={links.get(other.id)?.planned}>{links.get(other.id)?.label}</span>}</span>
          <button type="button" className="icon-button panel-remove" aria-label={`Remove connection to ${other.name}`} onClick={() => disconnect(other.id)}><span aria-hidden="true">×</span></button>
        </li>)}</ul>
      <CardPicker label="Add connection" pickerLabel="Agents you can connect" emptyText="Every other agent is already connected."
        items={unconnected.map((other) => ({ id: other.id, title: other.name, description: other.description, visual: <AgentVisual agent={other} /> }))}
        addLabel={(item) => `Connect ${item.title}`} onAdd={connect} />
      {prototypeOnly && <p className="settings-help">Prototype: dashed “planned” connections are saved in this browser only. Mula doesn’t hand work along them yet.</p>}
      {delegation !== null && <fieldset className="panel-delegation">
        <legend className="panel-subtitle">When {agent.name} needs another agent</legend>
        <div className="agent-brains" role="radiogroup" aria-label="When this agent needs another agent">{DELEGATION_OPTIONS.map((option) =>
          <label className="agent-brain" key={option.id}>
            <input type="radio" name="agent-delegation" value={option.id} checked={delegation === option.id} disabled={busy} onChange={() => onDelegation(option.id)} />
            <span className="agent-brain-text"><strong>{option.name}</strong><span>{option.description}</span></span>
          </label>)}</div>
      </fieldset>}
    </section>
  </>;
}
