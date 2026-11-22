"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { projectPath } from "@/common/services/project";
import { useProjectId } from "@/common/hooks/useProjectId";
import type { Agent } from "../services/team";
import type { ChannelOption, SupportSettings, Tone } from "../services/templates";
import { ALLOWLIST_MAX, parseAllowlist, removeTemplateAgent, saveSupport, TONE_LABELS, TONES } from "../services/templates";

type Props = {
  agent: Agent & { support: SupportSettings };
  channels: ChannelOption[];
  onSaved: (agent: Agent) => void;
  onRemoved: () => void;
};

/** The Customer service tab: how the agent sounds, where it answers, and who it may answer. */
export default function CustomerServiceSettings({ agent, channels, onSaved, onRemoved }: Props) {
  const projectId = useProjectId();
  const saved = agent.support;
  const [tone, setTone] = useState<Tone>(saved.tone);
  const [whatsapp, setWhatsapp] = useState(saved.whatsapp_enabled);
  const [allowlistOn, setAllowlistOn] = useState(saved.allowlist_enabled);
  const [allowlistText, setAllowlistText] = useState(saved.allowlist.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const whatsappChannel = channels.find((channel) => channel.id === "whatsapp");
  const whatsappAvailable = whatsappChannel !== undefined && whatsappChannel.available;
  const parsed = parseAllowlist(allowlistText);
  const dirty = tone !== saved.tone || whatsapp !== saved.whatsapp_enabled || allowlistOn !== saved.allowlist_enabled
    || JSON.stringify(parsed.numbers) !== JSON.stringify(saved.allowlist);

  function validationError() {
    if (parsed.invalid.length > 0) return `These aren't phone numbers in international form: ${parsed.invalid.slice(0, 3).join(", ")}.`;
    if (parsed.numbers.length > ALLOWLIST_MAX) return `List at most ${ALLOWLIST_MAX} numbers.`;
    if (allowlistOn && parsed.numbers.length === 0) return "Add at least one number, or switch the allowlist off.";
    return "";
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const problem = validationError();
    if (problem) { setError(problem); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const support = await saveSupport(agent.id, { tone, whatsapp_enabled: whatsapp, allowlist_enabled: allowlistOn, allowlist: parsed.numbers });
      setAllowlistText(support.allowlist.join("\n"));
      onSaved({ ...agent, support });
      setNotice("Saved. Applies to the next customer message.");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${agent.name} from this project? Customers' messages are still stored but no longer answered. The knowledge base and inbox stay, and you can add it again later.`)) return;
    setBusy(true); setError("");
    try {
      await removeTemplateAgent(agent.id);
      onRemoved();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  return <form className="agent-settings support-settings" onSubmit={save} data-dirty={dirty}>
    <div className="agent-form-field">
      <label htmlFor="support-tone">Tone</label>
      <select id="support-tone" value={tone} onChange={(event) => { setTone(event.target.value as Tone); setNotice(""); }}>
        {TONES.map((entry) => <option key={entry} value={entry}>{TONE_LABELS[entry]}</option>)}
      </select>
    </div>
    <fieldset className="agent-form-group agent-template-group">
      <legend>Channels</legend>
      <label className="agent-check">
        <input type="checkbox" checked={whatsapp} disabled={!whatsappAvailable && !whatsapp} onChange={(event) => { setWhatsapp(event.target.checked); setNotice(""); }} />
        <span>Answer on WhatsApp<span className="settings-help"> · {whatsappChannel?.hint}</span></span>
      </label>
      {!whatsappAvailable && <a className="text-button" href={projectPath(projectId, "/inventory")}>Connect in Inventory</a>}
    </fieldset>
    <fieldset className="agent-form-group agent-template-group">
      <legend>Who it answers</legend>
      <label className="agent-check">
        <input type="checkbox" checked={allowlistOn} onChange={(event) => { setAllowlistOn(event.target.checked); setNotice(""); }} />
        <span>Only these numbers<span className="settings-help"> · Useful while you test. Other customers' messages are stored but not answered.</span></span>
      </label>
      {allowlistOn && <label className="agent-form-field" htmlFor="support-allowlist">
        <span className="settings-help">One number per line, in international form, for example +62 812 3456 7890.</span>
        <textarea id="support-allowlist" value={allowlistText} onChange={(event) => { setAllowlistText(event.target.value); setNotice(""); }} />
      </label>}
    </fieldset>
    <div className="support-links">
      <a className="text-button" href={projectPath(projectId, "/knowledge")}>Edit the knowledge base</a>
      <a className="text-button" href={projectPath(projectId, "/inbox")}>Open the inbox</a>
    </div>
    <p className="settings-help">Customers who write STOP are never messaged again until they write START. More than six messages in ten minutes from one customer are stored without a reply, so a flood can't spend your brain's budget.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="team-notice" role="status">{notice}</p>}
    <footer className="settings-footer">
      <button type="button" className="map-reset agent-delete" onClick={() => void remove()} disabled={busy}>Remove agent</button>
      <div className="settings-actions">
        <button className="account-submit" disabled={busy || !dirty}>{busy && "Saving…"}{!busy && "Save"}</button>
      </div>
    </footer>
  </form>;
}
