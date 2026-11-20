"use client";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { fetchAssistantSettings, saveAssistantSettings } from "../services/orchestrator";
import type { AssistantSettings } from "../services/orchestrator";

/** Settings: what the owner calls their assistant, and whether it may propose new projects. */
export default function AssistantSettingsForm() {
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [name, setName] = useState("");
  const [proposeProjects, setProposeProjects] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ message: "", failed: false });

  useEffect(() => {
    fetchAssistantSettings()
      .then((loaded) => {
        setSettings(loaded);
        if (loaded.name_given) setName(loaded.name);
        setProposeProjects(loaded.tools.includes("project_create"));
      })
      .catch((failure) => { if (failure instanceof Error) setStatus({ message: failure.message, failed: true }); });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus({ message: "", failed: false });
    try {
      const saved = await saveAssistantSettings(name, proposeProjects);
      setSettings(saved);
      if (saved.name_given) setName(saved.name);
      else setName("");
      setStatus({ message: `Saved. Your assistant is called ${saved.name}.`, failed: false });
    } catch (failure) {
      if (failure instanceof Error) setStatus({ message: failure.message, failed: true });
    } finally {
      setBusy(false);
    }
  }

  if (settings === null && !status.failed) return <p role="status"><span className="shimmer">Loading…</span></p>;
  let defaultName = "Operator";
  if (settings) defaultName = settings.default_name;

  return <form className="about-form" onSubmit={save}>
    <div className="about-field">
      <label htmlFor="settings-assistant-name">Assistant's name</label>
      <input id="settings-assistant-name" value={name} maxLength={40} placeholder={defaultName} autoComplete="off"
        aria-describedby="settings-assistant-name-hint" onChange={(event) => setName(event.target.value)} disabled={busy} />
      <p id="settings-assistant-name-hint" className="about-hint">Letters, numbers and spaces. Leave it empty to use “{defaultName}”.</p>
    </div>
    <label className="settings-check">
      <input type="checkbox" checked={proposeProjects} onChange={(event) => setProposeProjects(event.target.checked)} disabled={busy} />
      <span>Let your assistant propose new projects. You still confirm each one with a button.</span>
    </label>
    <div className="assistant-actions">
      <button type="submit" className="account-submit" disabled={busy}>Save</button>
    </div>
    {status.message && status.failed && <p className="error" role="alert">{status.message}</p>}
    {status.message && !status.failed && <p className="settings-saved" role="status">{status.message}</p>}
  </form>;
}
