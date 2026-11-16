// Plugins belong to a parent app. The only record of that is each plugin's `parentId`
// in data.ts; everything here derives from it.
import { CATALOGUE_ENTRIES } from "../data.ts";
import type { CatalogueEntry } from "../data.ts";
import { matchesQuery } from "./search.ts";

export function isPlugin(entry: CatalogueEntry) {
  return entry.type === "app" && entry.kind === "plugin";
}

/** The plugins whose parent is `parentId`, in data order. Pass `entries` to use page-specific copies. */
export function pluginsOf(parentId: string, entries: CatalogueEntry[] = CATALOGUE_ENTRIES) {
  return entries.filter((entry) => isPlugin(entry) && entry.parentId === parentId);
}

/** A plugin's parent app, or undefined for anything that is not a plugin (or a broken parentId). */
export function parentOf(entry: CatalogueEntry) {
  if (!isPlugin(entry)) return undefined;
  return CATALOGUE_ENTRIES.find((candidate) => candidate.id === entry.parentId && !isPlugin(candidate));
}

/** A grid result: a listed entry, and the plugins that made it match the search, if any. */
export type CatalogueMatch = { entry: CatalogueEntry; matchedPlugins: CatalogueEntry[] };

/**
 * What the Catalogue grid shows for `query`: agents and apps only, never plugins. A
 * parent is shown when it matches itself or when one of its plugins matches; those
 * plugins are returned so the card can say "Includes Store monitor".
 */
export function searchCatalogue(entries: CatalogueEntry[], query: string): CatalogueMatch[] {
  const searching = query.trim().length > 0;
  const results: CatalogueMatch[] = [];
  for (const entry of entries) {
    if (isPlugin(entry)) continue;
    let matchedPlugins: CatalogueEntry[] = [];
    if (searching) matchedPlugins = pluginsOf(entry.id, entries).filter((plugin) => matchesQuery(plugin, query));
    if (matchesQuery(entry, query) || matchedPlugins.length > 0) results.push({ entry, matchedPlugins });
  }
  return results;
}

/** "Includes Store monitor", "Includes Store monitor and Store admin", "Includes A, B and C". */
export function includesHint(plugins: CatalogueEntry[]) {
  const names = plugins.map((plugin) => plugin.name);
  if (names.length === 0) return "";
  if (names.length === 1) return `Includes ${names[0]}`;
  return `Includes ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "This also removes 1 plugin." / "This also removes 2 plugins." / "" for none. */
export function alsoRemovesLabel(count: number) {
  if (count === 0) return "";
  if (count === 1) return "This also removes 1 plugin.";
  return `This also removes ${count} plugins.`;
}
