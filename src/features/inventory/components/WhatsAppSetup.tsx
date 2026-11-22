"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { CheckResult, ConnectDraft, WhatsAppStatus } from "../services/whatsapp";
import { checkWhatsApp, connectErrors, connectWhatsApp, disconnectWhatsApp, emptyConnectDraft, META_CHECKLIST, whatsappStatus } from "../services/whatsapp";

type Props = { onChanged: () => void };

function when(seconds: number | null | undefined) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard access can be refused (permissions, an insecure page); the value stays selectable.
    return false;
  }
}

const FIELDS: { key: keyof ConnectDraft; label: string; secret: boolean; optional: boolean; placeholder?: string }[] = [
  { key: "phone_number_id", label: "Phone Number ID", secret: false, optional: false },
  { key: "waba_id", label: "WhatsApp Business Account ID", secret: false, optional: false },
  { key: "access_token", label: "Permanent access token", secret: true, optional: false },
  { key: "app_secret", label: "App secret", secret: true, optional: false },
  { key: "reopen_template", label: "Approved template name", secret: false, optional: true, placeholder: "hello_again" },
  { key: "reopen_language", label: "Template language", secret: false, optional: true, placeholder: "en_US" },
];

/** Connect, check and disconnect the project's WhatsApp number, inside its Inventory card. */
export default function WhatsAppSetup({ onChanged }: Props) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ConnectDraft>(emptyConnectDraft);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const errors = connectErrors(draft);

  useEffect(() => {
    const controller = new AbortController();
    whatsappStatus(controller.signal).then(setStatus).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, []);

  function startEditing() {
    const next = emptyConnectDraft();
    // Ids and the template are safe to prefill; the token and secret are never sent back to the browser.
    if (status && status.connected) {
      next.phone_number_id = status.phone_number_id ?? "";
      next.waba_id = status.waba_id ?? "";
      next.reopen_template = status.reopen_template ?? "";
      next.reopen_language = status.reopen_language ?? "";
    }
    setDraft(next);
    setSubmitted(false);
    setEditing(true);
    setError("");
    setNotice("");
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    await run(async () => {
      setStatus(await connectWhatsApp(draft));
      // Secrets leave the browser's memory as soon as the server has them.
      setDraft(emptyConnectDraft());
      setEditing(false);
      setNotice("Connected. Now paste the webhook URL and verify token into Meta.");
      onChanged();
    });
  }

  async function check() {
    await run(async () => {
      const result: CheckResult = await checkWhatsApp();
      if (result.ok) setNotice(`Meta accepts the token for ${result.display_phone_number} (${result.verified_name}). No message was sent.`);
      else setError(result.message ?? "Meta refused the token.");
    });
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this WhatsApp number? Customers' messages stop reaching Mula. The inbox and its conversations stay.")) return;
    await run(async () => {
      await disconnectWhatsApp();
      setStatus(await whatsappStatus());
      setNotice("Disconnected.");
      onChanged();
    });
  }

  async function copyValue(label: string, text: string) {
    if (await copy(text)) setNotice(`${label} copied.`);
    else setError(`Couldn't copy the ${label.toLowerCase()}. Select it and copy it by hand.`);
  }

  if (status === null) return <div className="whatsapp-setup">{error && <p className="error" role="alert">{error}</p>}</div>;

  return <div className="whatsapp-setup">
    {!status.secrets_ready && <p className="inventory-setup">The server needs MULA_SECRET_KEY before secrets can be stored (see docker/README.md).</p>}
    {!status.public_url_set && <p className="inventory-setup">The server has no MULA_PUBLIC_URL, so the webhook URL below is only a path. Meta needs a public https address.</p>}
    {status.connected && !editing && <>
      <dl className="whatsapp-values">
        <div><dt>Phone Number ID</dt><dd>{status.phone_number_id}</dd></div>
        <div><dt>Access token, App secret</dt><dd>Stored encrypted; never shown</dd></div>
        <div><dt>Webhook URL</dt><dd><code>{status.webhook_url}</code> <button type="button" className="text-button" onClick={() => void copyValue("Webhook URL", status.webhook_url ?? "")}>Copy</button></dd></div>
        <div><dt>Verify token</dt><dd><code>{status.verify_token}</code> <button type="button" className="text-button" onClick={() => void copyValue("Verify token", status.verify_token ?? "")}>Copy</button></dd></div>
        <div><dt>Webhook</dt><dd>{status.verified_at && `Verified by Meta ${when(status.verified_at)}`}{!status.verified_at && "Not verified yet"}</dd></div>
        <div><dt>Last event</dt><dd>{when(status.last_event_at) || "None yet"}</dd></div>
        <div><dt>Template after 24 hours</dt><dd>{status.reopen_template && `${status.reopen_template} (${status.reopen_language})`}{!status.reopen_template && "None"}</dd></div>
      </dl>
      <div className="whatsapp-actions">
        <button type="button" className="map-reset" onClick={() => void check()} disabled={busy}>Check</button>
        <button type="button" className="map-reset" onClick={startEditing} disabled={busy}>Replace values</button>
        <button type="button" className="map-reset" onClick={() => void disconnect()} disabled={busy}>Disconnect</button>
      </div>
    </>}
    {!status.connected && !editing && <div className="whatsapp-actions">
      <button type="button" className="account-submit" onClick={startEditing} disabled={!status.secrets_ready}>Connect WhatsApp</button>
    </div>}
    {editing && <form className="whatsapp-form" onSubmit={submit} noValidate>
      <details open={!status.connected}>
        <summary>What to do in Meta's dashboard</summary>
        <ol className="whatsapp-checklist">{META_CHECKLIST.map((step) => <li key={step}>{step}</li>)}</ol>
      </details>
      {FIELDS.map((field) => {
        let message: string | undefined;
        if (submitted) message = errors[field.key];
        const id = `whatsapp-${field.key}`;
        let type = "text";
        if (field.secret) type = "password";
        // The error sits outside the label, so the field's name stays just its label.
        return <div key={field.key} className="inventory-field">
          <label htmlFor={id}>{field.label}{field.optional && <span className="whatsapp-optional"> optional</span>}</label>
          <input id={id} type={type} value={draft[field.key]} placeholder={field.placeholder} autoComplete="off" spellCheck={false}
            aria-invalid={message !== undefined} aria-describedby={`${id}-error`}
            onChange={(event) => { const value = event.target.value; setDraft((current) => ({ ...current, [field.key]: value })); }} />
          {message && <span className="whatsapp-error" id={`${id}-error`}>{message}</span>}
        </div>;
      })}
      {status.connected && <p className="inventory-setup">Replacing keeps the same webhook URL and verify token. Paste the token and secret again.</p>}
      <div className="whatsapp-actions">
        <button type="button" className="map-reset" onClick={() => { setEditing(false); setDraft(emptyConnectDraft()); }} disabled={busy}>Cancel</button>
        <button type="submit" className="account-submit" disabled={busy}>{busy && "Connecting…"}{!busy && "Connect"}</button>
      </div>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="team-notice" role="status">{notice}</p>}
  </div>;
}
