"use client";

// Client access: keys that let an Agent Client Protocol client, such as the Zed, VS Code or JetBrains
// agent panel, talk to this agent through server/scripts/mula_acp.py. A key is shown once, right
// after it is made; the server keeps only its hash. Keys act at once and don't wait for Save settings.
import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Agent, ClientKey } from "../services/team";
import { zedSettings } from "../services/clientAccess";
import { teamRequest } from "../services/team";

const LABEL_LIMIT = 60;

function when(seconds: number | null) {
  if (seconds === null) return "never";
  return new Date(seconds * 1000).toLocaleString();
}

export default function ClientAccess({ agent, busy }: { agent: Agent; busy: boolean }) {
  const [keys, setKeys] = useState<ClientKey[] | null>(null);
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const active = (keys ?? []).filter((key) => key.revoked_at === null);
  const disabled = busy || working;

  useEffect(() => {
    const abort = new AbortController();
    teamRequest(`/api/team/${agent.id}/client-keys`, { signal: abort.signal })
      .then((result) => setKeys(result.keys))
      .catch((failure) => { if (!abort.signal.aborted && failure instanceof Error) setError(failure.message); });
    return () => abort.abort();
  }, [agent.id]);

  async function create() {
    if (!label.trim() || disabled) return;
    setWorking(true); setError(""); setCopied(false);
    try {
      const result = await teamRequest(`/api/team/${agent.id}/client-keys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
      setKeys((previous) => [result.key, ...(previous ?? [])]);
      setSecret({ id: result.key.id, value: result.secret });
      setLabel("");
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setWorking(false); }
  }

  async function revoke(key: ClientKey) {
    if (!window.confirm(`Revoke “${key.label}”? Clients using it stop working at once.`)) return;
    setWorking(true); setError("");
    try {
      const result = await teamRequest(`/api/team/${agent.id}/client-keys/${key.id}`, { method: "DELETE" });
      setKeys((previous) => (previous ?? []).map((item) => {
        if (item.id === key.id) return result.key;
        return item;
      }));
      if (secret?.id === key.id) setSecret(null);
    } catch (failure) { if (failure instanceof Error) setError(failure.message); }
    finally { setWorking(false); }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("Couldn’t copy. Select the text and copy it yourself.");
    }
  }

  // The label field sits inside the settings form; Enter makes a key rather than saving settings.
  function onLabelKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void create();
  }

  return <section className="panel-section client-access-section" aria-labelledby="advanced-client-access">
    <h3 id="advanced-client-access" className="panel-section-title">Client access</h3>
    <p className="settings-help">Talk to {agent.name} from an editor or app that speaks the Agent Client Protocol, such as Zed, VS Code or JetBrains. It answers with the same instructions, tools and memory as here, in a conversation of its own, and can’t ask other agents from there. Keys take effect at once.</p>
    {keys === null && !error && <p className="settings-help" role="status"><span className="shimmer">Loading keys…</span></p>}
    {keys !== null && keys.length === 0 && <p className="settings-help">No keys yet, so no client can connect.</p>}
    {keys !== null && keys.length > 0 && <ul className="panel-card-list">{keys.map((key) =>
      <li key={key.id} className="panel-card client-key" data-revoked={key.revoked_at !== null}>
        <span className="panel-card-text"><strong>{key.label}</strong>
          <span>Made {when(key.created)} · last used {when(key.last_used)}{key.revoked_at !== null && ` · revoked ${when(key.revoked_at)}`}</span></span>
        {key.revoked_at === null && <button type="button" className="text-button" disabled={disabled} onClick={() => void revoke(key)}>Revoke</button>}
        {key.revoked_at !== null && <span className="config-tag">Revoked</span>}
      </li>)}</ul>}
    {secret && <div className="client-secret" role="status">
      <p className="panel-subtitle">Your new key. Copy it now: it won’t be shown again.</p>
      <code className="client-secret-value">{secret.value}</code>
      <p className="settings-help">In Zed, add this to your settings (replace <code>/path/to/LARAS</code> with where Mula is). Other clients take the same command, arguments and environment.</p>
      <pre className="client-snippet"><code>{zedSettings(agent.name, secret.value)}</code></pre>
      <div className="settings-actions">
        <button type="button" className="map-reset" onClick={() => void copy(zedSettings(agent.name, secret.value))}>{copied && "Copied"}{!copied && "Copy settings"}</button>
        <button type="button" className="text-button" onClick={() => setSecret(null)}>Done</button>
      </div>
    </div>}
    <div className="client-key-form">
      <label htmlFor="client-key-label" className="panel-subtitle">New key</label>
      <input id="client-key-label" value={label} maxLength={LABEL_LIMIT} disabled={disabled || active.length >= 10} onChange={(event) => setLabel(event.target.value)}
        onKeyDown={onLabelKey} placeholder="For example: Zed on my laptop" />
      <button type="button" className="map-reset" disabled={disabled || !label.trim() || active.length >= 10} onClick={() => void create()}>{working && "Working…"}{!working && "Create key"}</button>
    </div>
    {active.length >= 10 && <p className="settings-help">This agent has 10 keys. Revoke one to make another.</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
