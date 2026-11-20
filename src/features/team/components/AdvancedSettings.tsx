"use client";

import type { Agent, Brain } from "../services/team";
import ClientAccess from "./ClientAccess";
import { INSTRUCTIONS_LIMIT, TOOL_LIMIT } from "./SimpleSettings";

export const REFERENCE_LIMIT = 8000;

type Props = {
  agent: Agent;
  // The runtime profile this agent runs in, or null when the project id isn't known.
  profile: string | null;
  tools: string[];
  brain: string;
  onBrain: (id: string) => void;
  data: string;
  onData: (value: string) => void;
  busy: boolean;
};

function brainOption(brain: Brain) {
  let place = brain.host;
  if (brain.location === "local") place = `on ${brain.host}`;
  let text = `${brain.name} (${place})`;
  if (brain.status === "needs_setup") text += " · needs setup";
  return text;
}

/** One setup line per script, for the brains that still need setup. Several Claude brains share one script. */
function setupSteps(brains: Brain[]) {
  const steps = new Map<string, Brain>();
  for (const brain of brains) {
    if (brain.status === "needs_setup" && brain.setup_script && brain.setup_key) steps.set(brain.setup_script, brain);
  }
  return [...steps.entries()];
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div className="config-row"><dt>{label}</dt><dd><code>{value}</code><span className="config-tag">Set in config</span></dd></div>;
}

/** The Advanced layer: brain, reference data, client access, and technical values that can't be changed here yet. */
export default function AdvancedSettings({ agent, profile, tools, brain, onBrain, data, onData, busy }: Props) {
  const brains = agent.available_brains;
  const chosen = brains[brain];
  const setup = setupSteps(Object.values(brains));
  let profileText = "Assigned by the Mula runtime";
  if (profile) profileText = profile;
  const list = (ids: string[]) => {
    if (ids.length === 0) return "none";
    return ids.join(", ");
  };

  return <>
    <section className="panel-section">
      <label id="advanced-brain" htmlFor="agent-brain" className="panel-section-title">Brain</label>
      <p className="settings-help">The language model this agent thinks with. Applies to your next message.</p>
      <select id="agent-brain" className="panel-select" value={brain} disabled={busy} onChange={(event) => onBrain(event.target.value)}>
        {Object.entries(brains).map(([id, option]) =>
          // A brain that lost its setup stays selectable while it is the saved choice, so it still shows as chosen.
          <option key={id} value={id} disabled={option.status === "needs_setup" && id !== agent.brain}>{brainOption(option)}</option>)}
      </select>
      {chosen && chosen.location === "cloud" && <p className="settings-help">{chosen.name} sends each message, with retrieved memory, your instructions, reference data and attached CSVs, to {chosen.host}. Usage is billed per token to the API key set up on the Mula runtime.</p>}
      {chosen && chosen.status === "needs_setup" && <p className="error" role="alert">{chosen.name} is not set up on the Mula runtime, so chats will fail. Choose another brain or finish its setup.</p>}
      {setup.map(([script, option]) =>
        <p key={script} className="settings-help">To add the {option.host} brains, run <code>server/.venv/bin/python server/scripts/{script}</code> with {option.setup_key}, then restart Mula.</p>)}
    </section>

    <section className="panel-section">
      <label id="advanced-data" htmlFor="agent-data" className="panel-section-title">Reference data</label>
      <p className="settings-help">Business details this agent should know. Included in each model request and treated as untrusted context.</p>
      <textarea id="agent-data" value={data} onChange={(event) => onData(event.target.value)} maxLength={REFERENCE_LIMIT} disabled={busy} rows={5}
        aria-describedby="agent-data-count" placeholder="For example: We sell coffee. Sales are recorded in IDR. A trading week is seven days." />
      <div id="agent-data-count" className="field-caption">{data.length.toLocaleString()} / {REFERENCE_LIMIT.toLocaleString()} characters · Saved only to your account</div>
    </section>

    <ClientAccess agent={agent} busy={busy} />

    <section className="panel-section" aria-labelledby="advanced-config">
      <h3 id="advanced-config" className="panel-section-title">Technical details</h3>
      <p className="settings-help">These come from the agent’s files and the Mula runtime and can’t be changed here yet.</p>
      <dl className="config-list">
        <ReadOnly label="Agent id" value={agent.id} />
        <ReadOnly label="Runtime profile" value={profileText} />
        <ReadOnly label="Enabled tool ids" value={list(tools)} />
        <ReadOnly label="Available tool ids" value={list(Object.keys(agent.available_tools))} />
        <ReadOnly label="Agents it may ask (A2A)" value={list(agent.delegates_to)} />
        <ReadOnly label="Runtime toolsets offered" value={list(agent.available_toolsets)} />
        <ReadOnly label="Limits" value={`instructions ${INSTRUCTIONS_LIMIT.toLocaleString()} · reference data ${REFERENCE_LIMIT.toLocaleString()} · up to ${TOOL_LIMIT} tools`} />
        <ReadOnly label="Settings revision" value={String(agent.revision)} />
      </dl>
    </section>
  </>;
}
