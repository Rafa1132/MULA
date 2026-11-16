import { CATALOGUE_ENTRIES } from "../../catalogue/data.ts";
import type { AppConnection, AppDetails, CatalogueEntry } from "../../catalogue/data.ts";

/** An added app with the details My apps needs, and its added plugins (shown inside its card). */
export type MyApp = CatalogueEntry & { app: AppDetails; plugins: CatalogueEntry[] };

// Problems first, so they are seen before anything else.
const CONNECTION_ORDER: Record<AppConnection, number> = { needs_attention: 0, not_connected: 1, connected: 2 };
const NO_DETAILS: AppDetails = { connection: "not_connected", lastSynced: null, usedBy: [] };

/**
 * The added apps, in Catalogue data, from their ids. Unknown ids and agents are skipped.
 * Plugins are not apps of their own here: each is attached to its parent's `plugins`.
 */
export function appsFromIds(ids: readonly string[]): MyApp[] {
  const apps: MyApp[] = [];
  for (const id of ids) {
    const entry = CATALOGUE_ENTRIES.find((candidate) => candidate.id === id);
    if (entry === undefined || entry.type !== "app" || entry.kind === "plugin") continue;
    // An app without mock details shows as not connected rather than failing.
    let details = NO_DETAILS;
    if (entry.app !== undefined) details = entry.app;
    const plugins = CATALOGUE_ENTRIES.filter((plugin) => plugin.kind === "plugin" && plugin.parentId === entry.id && ids.includes(plugin.id));
    apps.push({ ...entry, app: details, plugins });
  }
  return apps;
}

/** Needs attention first, then not connected, then connected; by name within each. */
export function sortApps(apps: MyApp[]) {
  return [...apps].sort((first, second) => {
    const byConnection = CONNECTION_ORDER[first.app.connection] - CONNECTION_ORDER[second.app.connection];
    if (byConnection !== 0) return byConnection;
    return first.name.localeCompare(second.name);
  });
}

/** Apps whose name or description holds every word of `query`, ignoring case. */
export function filterApps(apps: MyApp[], query: string) {
  const words = query.toLocaleLowerCase().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return apps;
  return apps.filter((app) => {
    const text = `${app.name} ${app.description}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function attentionCount(apps: MyApp[]) {
  return apps.filter((app) => app.app.connection === "needs_attention").length;
}

/** "2 apps", "1 app". */
export function appCount(count: number) {
  if (count === 1) return "1 app";
  return `${count} apps`;
}

/** "Never", "Just now", "12 minutes ago", "3 hours ago", "2 days ago". */
export function lastSyncedLabel(lastSynced: string | null, now: number) {
  if (lastSynced === null) return "Never";
  const minutes = Math.floor((now - Date.parse(lastSynced)) / 60_000);
  if (Number.isNaN(minutes)) return "Unknown";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return plural(minutes, "minute") + " ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "hour") + " ago";
  return plural(Math.floor(hours / 24), "day") + " ago";
}

function plural(count: number, unit: string) {
  if (count === 1) return `1 ${unit}`;
  return `${count} ${unit}s`;
}

/** The names of the agents using an app, or "No agents yet". */
export function usedByLabel(agentIds: string[]) {
  const names = agentIds
    .map((id) => CATALOGUE_ENTRIES.find((entry) => entry.id === id && entry.type === "agent"))
    .filter((entry): entry is CatalogueEntry => entry !== undefined)
    .map((entry) => entry.name);
  if (names.length === 0) return "No agents yet";
  return names.join(", ");
}
