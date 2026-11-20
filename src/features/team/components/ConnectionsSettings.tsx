"use client";

// Connections: the other agents this one may ask (A2A), each with how it asks. Only the agents its
// file allows (delegates_to) can be connected; the server refuses any other. Changes save with the
// rest of the panel.
import { useState } from "react";
import { LINK_LABELS } from "../services/map";
import type { Agent, AgentCard, LinkMode } from "../services/team";
import { teamRequest } from "../services/team";
import AgentAvatar from "./AgentAvatar";
import CardPicker from "./CardPicker";

type ConnectedMode = Exclude<LinkMode, "none">;

const MODE_OPTIONS: { id: ConnectedMode; name: string; description: string }[] = [
  { id: "ask", name: "Ask me first", description: "Each question waits in the chat until you approve it." },
  { id: "auto", name: "Go ahead", description: "Questions run as soon as the reply ends. You still see each question and the answer." },
  { id: "off", name: "Off", description: "Stays connected, but never asks. The agent tells you who could help." },
];

type Props = {
  agent: Agent;
  agents: Agent[];
  links: Record<string, LinkMode>;
  onLinks: (links: Record<string, LinkMode>) => void;
  busy: boolean;
};

// After a change the card that had focus may be gone; move focus somewhere sensible once React has rendered.
function focusLater(selector: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
}

function AgentVisual({ agent }: { agent: Agent }) {
  return <span className="agent-tile tiny" aria-hidden="true"><AgentAvatar id={agent.id} name={agent.name} size={32} /></span>;
}

/** The other agent's A2A card, read from the server when first opened. */
function CardDetails({ agent }: { agent: Agent }) {
  const [card, setCard] = useState<AgentCard | null>(null);
  const [error, setError] = useState("");

  async function load(open: boolean) {
    if (!open || card) return;
    setError("");
    try {
      setCard(await teamRequest(`/api/team/${agent.id}/card`));
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
  }

  return <details className="agent-card-details" onToggle={(event) => void load(event.currentTarget.open)}>
    <summary>{agent.name}’s card</summary>
    {!card && !error && <p className="settings-help" role="status"><span className="shimmer">Loading the card…</span></p>}
    {error && <p className="error" role="alert">{error}</p>}
    {card && <dl className="agent-card-fields">
      <dt>Protocol</dt><dd>A2A {card.protocolVersion}</dd>
      <dt>Address</dt><dd><code>{card.url}</code></dd>
      <dt>Version</dt><dd><code>{card.version}</code></dd>
      <dt>Accepts</dt><dd>{card.defaultInputModes.join(", ")}</dd>
      <dt>Skills</dt><dd>{card.skills.map((skill) => skill.name).join(", ")}</dd>
    </dl>}
  </details>;
}

export default function ConnectionsSettings({ agent, agents, links, onLinks, busy }: Props) {
  const byId = new Map(agents.map((other) => [other.id, other]));
  const allowed = agent.delegates_to.map((id) => byId.get(id)).filter((other): other is Agent => other !== undefined);
  const connected = allowed.filter((other) => links[other.id] && links[other.id] !== "none");
  const unconnected = allowed.filter((other) => !links[other.id] || links[other.id] === "none");

  function setMode(id: string, mode: LinkMode) {
    onLinks({ ...links, [id]: mode });
  }

  function connect(id: string) {
    setMode(id, "ask");
    focusLater(`#connection-card-${id}`);
  }

  function disconnect(id: string) {
    setMode(id, "none");
    focusLater(".connections-section .panel-add-card");
  }

  return <section className="panel-section connections-section" aria-labelledby="simple-connections">
    <h3 id="simple-connections" className="panel-section-title">Connections</h3>
    <p className="settings-help">Agents {agent.name} can ask for help, and how. Each connection is a line on your map. Requests follow the A2A protocol: a message, a task you can approve, and the answer.</p>
    {allowed.length === 0 && <p className="settings-help">{agent.name} works on its own and doesn’t ask other agents.</p>}
    {allowed.length > 0 && connected.length === 0 && <p className="settings-help">No connections yet.</p>}
    <ul className="panel-card-list">{connected.map((other) => {
      const mode = links[other.id] as ConnectedMode;
      const option = MODE_OPTIONS.find((item) => item.id === mode);
      return <li key={other.id} id={`connection-card-${other.id}`} className="panel-card connection-card" tabIndex={-1}>
        <AgentVisual agent={other} />
        <span className="panel-card-text"><strong>{other.name}</strong><span>{other.description}</span>
          <span className="connection-status" data-planned={mode === "off"}>{LINK_LABELS[mode]}</span></span>
        <button type="button" className="icon-button panel-remove" aria-label={`Remove connection to ${other.name}`} disabled={busy} onClick={() => disconnect(other.id)}><span aria-hidden="true">×</span></button>
        <label className="connection-mode">
          <span>When {agent.name} needs {other.name}</span>
          <select value={mode} disabled={busy} onChange={(event) => setMode(other.id, event.target.value as LinkMode)} aria-describedby={`connection-mode-${other.id}`}>
            {MODE_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <p id={`connection-mode-${other.id}`} className="settings-help connection-mode-help">{option?.description}</p>
        <CardDetails agent={other} />
      </li>;
    })}</ul>
    {allowed.length > 0 && <CardPicker label="Add connection" pickerLabel="Agents you can connect" emptyText={`${agent.name} is connected to every agent it can ask.`}
      items={unconnected.map((other) => ({ id: other.id, title: other.name, description: other.description, visual: <AgentVisual agent={other} /> }))}
      addLabel={(item) => `Connect ${item.title}`} onAdd={connect} disabled={busy} disabledReason="Wait for the save to finish." />}
  </section>;
}
