"use client";

import { Icon } from "@/common/components";
import type { Agent, LinkMode } from "../services/team";
import { toolInfo } from "../services/tools";
import CardPicker from "./CardPicker";
import ConnectionsSettings from "./ConnectionsSettings";
import RuntimeTools from "./RuntimeTools";

export const INSTRUCTIONS_LIMIT = 4000;
// The server accepts at most this many enabled tools per agent (SettingsInput.tools).
export const TOOL_LIMIT = 10;

type Props = {
  agent: Agent;
  agents: Agent[];
  prompt: string;
  onPrompt: (value: string) => void;
  tools: string[];
  onTools: (tools: string[]) => void;
  links: Record<string, LinkMode>;
  onLinks: (links: Record<string, LinkMode>) => void;
  toolsets: string[];
  onToolsets: (toolsets: string[]) => void;
  busy: boolean;
};

// After a change the card that had focus may be gone; move focus somewhere sensible once React has rendered.
function focusLater(selector: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
}

function ToolVisual({ id }: { id: string }) {
  return <span className="panel-card-icon" aria-hidden="true"><Icon name={toolInfo(id).icon} /></span>;
}

/** The Simple layer: instructions, tools, runtime tools and connections. */
export default function SimpleSettings({ agent, agents, prompt, onPrompt, tools, onTools, links, onLinks, toolsets, onToolsets, busy }: Props) {
  const toolName = (id: string) => agent.available_tools[id] ?? id;
  const missingTools = Object.keys(agent.available_tools).filter((id) => !tools.includes(id));

  function addTool(id: string) {
    onTools([...tools, id]);
    focusLater(`#tool-card-${id}`);
  }

  function removeTool(id: string) {
    onTools(tools.filter((tool) => tool !== id));
    focusLater(".tools-section .panel-add-card");
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

    <RuntimeTools agent={agent} toolsets={toolsets} onToolsets={onToolsets} busy={busy} />

    <ConnectionsSettings agent={agent} agents={agents} links={links} onLinks={onLinks} busy={busy} />
  </>;
}
