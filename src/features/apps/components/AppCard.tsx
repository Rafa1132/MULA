"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/common/components";
import { CatalogueImage, LaunchLink, launchUrl } from "@/features/catalogue";
import type { AppConnection } from "../../catalogue/data.ts";
import { alsoRemovesLabel } from "../../catalogue/services/plugins.ts";
import { lastSyncedLabel, usedByLabel } from "../services/myApps.ts";
import type { MyApp } from "../services/myApps.ts";
import { useProjectId } from "@/common/hooks/useProjectId";

// Each state has its own icon and words, so it never depends on colour.
const CONNECTIONS: Record<AppConnection, { label: string; icon: "connected" | "attention" | "unlinked" }> = {
  connected: { label: "Connected", icon: "connected" },
  needs_attention: { label: "Needs attention", icon: "attention" },
  not_connected: { label: "Not connected", icon: "unlinked" },
};

type Props = {
  app: MyApp;
  now: number;
  onOpen: (app: MyApp) => void;
  onSettings: (app: MyApp) => void;
  onRemove: (app: MyApp) => void;
};

export default function AppCard({ app, now, onOpen, onSettings, onRemove }: Props) {
  const [confirming, setConfirming] = useState(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const headingId = `app-${app.id}`;
  const confirmId = `app-${app.id}-confirm`;
  const connection = CONNECTIONS[app.app.connection];

  useEffect(() => {
    // Opening the confirmation puts focus on the safe choice; closing it returns
    // focus to Remove, so keyboard users never lose their place.
    if (confirming) cancelButton.current?.focus();
    if (!confirming && wasConfirming.current) removeButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  // A real link to the app in a new tab when it has a launchUrl; otherwise a notice.
  const launch = launchUrl(app, useProjectId());
  let openAction = <button type="button" className="apps-button apps-button-primary" aria-label={`Open ${app.name}`} onClick={() => onOpen(app)}>Open</button>;
  if (launch !== undefined) openAction = <LaunchLink className="apps-button apps-button-primary" href={launch} label="Open" hiddenContext={app.name} />;

  let actions;
  if (confirming) {
    actions = (
      <div className="apps-confirm" role="group" aria-labelledby={confirmId}
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setConfirming(false); } }}>
        <p id={confirmId}>Remove {app.name}? It goes back to the Catalogue. {alsoRemovesLabel(app.plugins.length)}</p>
        <div className="apps-actions">
          <button type="button" className="apps-button apps-button-danger" onClick={() => onRemove(app)}>Yes, remove</button>
          <button type="button" ref={cancelButton} className="apps-button" onClick={() => setConfirming(false)}>Keep it</button>
        </div>
      </div>
    );
  } else {
    // The visible verbs repeat on every card, so each accessible name includes the app.
    actions = (
      <div className="apps-actions">
        {openAction}
        <button type="button" className="apps-button" aria-label={`Settings for ${app.name}`} onClick={() => onSettings(app)}>Settings</button>
        <button type="button" ref={removeButton} className="apps-button apps-button-quiet" aria-label={`Remove ${app.name}`} onClick={() => setConfirming(true)}>Remove</button>
      </div>
    );
  }

  return (
    <li className="apps-card" data-connection={app.app.connection}>
      <article aria-labelledby={headingId}>
        <CatalogueImage src={app.image} alt={app.imageAlt} name={app.name} type="app" />
        <div className="apps-card-body">
          <h2 id={headingId}>{app.name}</h2>
          <p className="apps-description" title={app.description}>{app.description}</p>
          <p className="apps-connection" data-connection={app.app.connection}><Icon name={connection.icon} />{connection.label}</p>
          {app.app.connection === "needs_attention" && app.app.attentionNote && <p className="apps-attention-note">{app.app.attentionNote}</p>}
          <dl className="apps-meta">
            <div><dt>Last synced</dt><dd>{lastSyncedLabel(app.app.lastSynced, now)}</dd></div>
            <div><dt>Used by</dt><dd>{usedByLabel(app.app.usedBy)}</dd></div>
          </dl>
          {/* Added plugins live inside their parent's card, never as cards of their own. */}
          {app.plugins.length > 0 && (
            <div className="apps-plugins">
              <h3 id={`${headingId}-plugins`}>Plugins</h3>
              <ul aria-labelledby={`${headingId}-plugins`}>
                {app.plugins.map((plugin) => <li key={plugin.id}><Icon name="app" />{plugin.name}</li>)}
              </ul>
            </div>
          )}
          {actions}
        </div>
      </article>
    </li>
  );
}
