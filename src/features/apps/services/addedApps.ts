// PROTOTYPE STORE for the apps an owner has added from the Catalogue.
//
// This module is the only place that knows where the list lives. Today that is
// this browser's localStorage; replacing it with a backend call means changing
// this file and nothing else. The Catalogue and My apps both read it through
// useAddedApps() and change it through addApp() and removeApp().
//
// Only App entries that can be added (not "coming soon") are accepted. Agents
// belong on My agents and are never stored here. A plugin can be added only after
// its parent app, and removing a parent removes its plugins too.
import { useSyncExternalStore } from "react";
import { CATALOGUE_ENTRIES } from "../../catalogue/data.ts";

const STORAGE_KEY = "mula.prototype.added-apps";
const NO_APPS: readonly string[] = [];

// The current list, read from storage on first use. Writes update it first, so the
// list keeps working for this visit even when storage is blocked.
let current: readonly string[] | null = null;
const listeners = new Set<() => void>();

function findApp(id: string) {
  const entry = CATALOGUE_ENTRIES.find((candidate) => candidate.id === id);
  if (entry === undefined || entry.type !== "app") return undefined;
  return entry;
}

/** Whether `id` may join `ids`: a known app that is not coming soon, and for a plugin, its parent is in `ids`. */
function canBeAdded(id: string, ids: readonly string[]) {
  const entry = findApp(id);
  if (entry === undefined || entry.status === "coming_soon") return false;
  if (entry.kind === "plugin") return entry.parentId !== undefined && ids.includes(entry.parentId);
  return true;
}

/** Keep only ids that can be added, each once; plugins whose parent is missing are dropped. */
function cleaned(ids: string[]): readonly string[] {
  const kept: string[] = [];
  // Parents first, so a plugin saved before its parent is still recognised.
  for (const id of ids) if (findApp(id)?.kind !== "plugin" && !kept.includes(id) && canBeAdded(id, kept)) kept.push(id);
  for (const id of ids) if (findApp(id)?.kind === "plugin" && !kept.includes(id) && canBeAdded(id, kept)) kept.push(id);
  return kept;
}

function browserStorage(): Storage | null {
  // Accessing localStorage throws in some private modes and when site data is blocked.
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch (error) {
    console.warn("Mula could not open browser storage; added apps last only for this visit.", error);
    return null;
  }
}

/** The stored list, cleaned: only known, addable app ids, each once, in stored order. */
function readStored(): readonly string[] {
  const storage = browserStorage();
  if (storage === null) return NO_APPS;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return NO_APPS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return NO_APPS;
    return cleaned(parsed.filter((id): id is string => typeof id === "string"));
  } catch (error) {
    console.warn("Mula could not read the added apps; starting with none.", error);
    return NO_APPS;
  }
}

function writeStored(ids: readonly string[]) {
  const storage = browserStorage();
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch (error) {
    console.warn("Mula could not save the added apps; the change lasts only for this visit.", error);
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function update(ids: readonly string[]) {
  current = ids;
  writeStored(ids);
  notify();
}

/** The ids of the added apps, in the order they were added. */
export function getAddedAppIds(): readonly string[] {
  if (current === null) current = readStored();
  return current;
}

/**
 * Add an app or plugin. Returns false, changing nothing, for agents, unknown ids,
 * coming-soon apps and plugins whose parent is not added. Adding a parent never adds
 * its plugins.
 */
export function addApp(id: string) {
  const ids = getAddedAppIds();
  if (ids.includes(id)) return true;
  if (!canBeAdded(id, ids)) return false;
  update([...ids, id]);
  return true;
}

/** Remove an app (and, for a parent, its plugins), sending them back to Available in the Catalogue. */
export function removeApp(id: string) {
  const ids = getAddedAppIds();
  if (!ids.includes(id)) return;
  update(ids.filter((candidate) => candidate !== id && findApp(candidate)?.parentId !== id));
}

/** Re-read storage, for a change made in another tab (and for tests). */
export function reloadAddedApps() {
  current = readStored();
  notify();
}

function onStorageEvent(event: StorageEvent) {
  if (event.key === STORAGE_KEY || event.key === null) reloadAddedApps();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorageEvent);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorageEvent);
  };
}

function serverSnapshot() {
  // The server cannot see this browser's storage, so it renders with no apps added.
  return NO_APPS;
}

/** The added app ids, re-rendering when they change here or in another tab. */
export function useAddedApps() {
  return useSyncExternalStore(subscribe, getAddedAppIds, serverSnapshot);
}
