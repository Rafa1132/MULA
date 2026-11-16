"use client";

import type { CatalogueEntry } from "../data.ts";
import { pluginsOf } from "../services/plugins.ts";
import CatalogueImage from "./CatalogueImage";

type Props = {
  parent: CatalogueEntry;
  /** Whether the parent app is added; plugins can't be added before it. */
  parentAdded: boolean;
  addedApps: readonly string[];
  onAdd: (plugin: CatalogueEntry) => void;
};

/** A plugin card's one action. Disabled states stay readable because they explain why. */
function PluginAction({ plugin, parent, parentAdded, added, onAdd }: { plugin: CatalogueEntry; parent: CatalogueEntry; parentAdded: boolean; added: boolean; onAdd: (plugin: CatalogueEntry) => void }) {
  if (added) return <button type="button" className="catalogue-action" disabled aria-label={`${plugin.name} added`}>Added</button>;
  if (plugin.status === "coming_soon") return <button type="button" className="catalogue-action" disabled aria-label={`${plugin.name} coming soon`}>Coming soon</button>;
  if (!parentAdded) return <button type="button" className="catalogue-action" disabled aria-label={`Add ${parent.name} first to add ${plugin.name}`}>Add {parent.name} first</button>;
  return <button type="button" className="catalogue-action catalogue-action-primary" aria-label={`Add ${plugin.name}`} onClick={() => onAdd(plugin)}>Add</button>;
}

/**
 * "Plugins for <app>": the plugins whose parentId is this app, as small cards, or
 * "No plugins yet." Its id is the target of /catalogue/<plugin-id> redirects.
 */
export default function PluginsSection({ parent, parentAdded, addedApps, onAdd }: Props) {
  const plugins = pluginsOf(parent.id);

  let content;
  if (plugins.length === 0) {
    content = <p className="detail-empty">No plugins yet.</p>;
  } else {
    content = (
      <ul className="plugin-grid">
        {plugins.map((plugin) => {
          const headingId = `plugin-${plugin.id}`;
          return (
            <li key={plugin.id} className="plugin-card">
              <article aria-labelledby={headingId}>
                <CatalogueImage src={plugin.image} alt={plugin.imageAlt} name={plugin.name} type="app" />
                <div className="plugin-body">
                  {/* No link: a plugin has no page of its own; this section is its page. */}
                  <h3 id={headingId}>{plugin.name}</h3>
                  <p className="plugin-description" title={plugin.description}>{plugin.description}</p>
                </div>
                <PluginAction plugin={plugin} parent={parent} parentAdded={parentAdded} added={addedApps.includes(plugin.id)} onAdd={onAdd} />
              </article>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section id="plugins" className="detail-plugins" aria-labelledby="detail-plugins-heading">
      <h2 id="detail-plugins-heading" tabIndex={-1}>Plugins for {parent.name}</h2>
      {content}
    </section>
  );
}
