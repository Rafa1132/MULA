"use client";

// Runtime tools: the Mula runtime's own tools this agent may use, each switched on here and saved with
// the rest of the panel. The server writes exactly the switched-on ones into the agent's runtime
// profile, so a tool that is off is never offered to the model. Only tools that can't reach this
// computer's files, terminal, browser or desktop are listed at all.
import { Icon } from "@/common/components";
import type { Agent } from "../services/team";
import { toolsetInfo } from "../services/tools";

type Props = {
  agent: Agent;
  toolsets: string[];
  onToolsets: (toolsets: string[]) => void;
  busy: boolean;
};

export default function RuntimeTools({ agent, toolsets, onToolsets, busy }: Props) {
  function toggle(id: string, on: boolean) {
    if (on) {
      onToolsets([...toolsets, id]);
      return;
    }
    onToolsets(toolsets.filter((toolset) => toolset !== id));
  }

  if (agent.available_toolsets.length === 0) return null;
  return <section className="panel-section runtime-tools-section" aria-labelledby="simple-runtime-tools">
    <h3 id="simple-runtime-tools" className="panel-section-title">Runtime tools</h3>
    <p className="settings-help">Extra tools from the Mula runtime. Everything starts off; switch on what {agent.name} needs. None of them can read your files or run commands on this computer.</p>
    <ul className="panel-card-list">{agent.available_toolsets.map((id) => {
      const info = toolsetInfo(id);
      const status = agent.toolset_status[id];
      const unavailable = status?.status === "needs_setup";
      const on = toolsets.includes(id);
      return <li key={id} className="panel-card runtime-tool" data-unavailable={unavailable}>
        <span className="panel-card-icon" aria-hidden="true"><Icon name={info.icon} /></span>
        <span className="panel-card-text">
          <strong id={`toolset-${id}`}>{info.name}</strong>
          <span id={`toolset-${id}-note`}>{status?.note}</span>
          <span className="runtime-tool-names"><code>{(agent.toolset_tools[id] ?? []).join(", ")}</code></span>
          {status?.status === "paid" && <span className="runtime-tool-warning">May use paid credits</span>}
          {unavailable && <span className="runtime-tool-warning">Needs setup</span>}
        </span>
        <input type="checkbox" role="switch" className="runtime-tool-switch" checked={on} disabled={busy || (unavailable && !on)}
          aria-labelledby={`toolset-${id}`} aria-describedby={`toolset-${id}-note`} onChange={(event) => toggle(id, event.target.checked)} />
      </li>;
    })}</ul>
  </section>;
}
