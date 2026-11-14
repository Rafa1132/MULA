import type { CatalogueEntry } from "../data.ts";

/** The text a search looks through: name, description and tags. */
function searchableText(entry: CatalogueEntry) {
  return [entry.name, entry.description, ...entry.tags].join(" ").toLocaleLowerCase();
}

/**
 * Entries matching every word of `query`, case-insensitive, in their original order.
 * An empty or blank query matches everything. Each word may match any field, so
 * "tokopedia stock" finds the store sync app even though no single field holds both.
 */
export function filterEntries(entries: CatalogueEntry[], query: string) {
  const words = query.toLocaleLowerCase().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return entries;
  return entries.filter((entry) => {
    const text = searchableText(entry);
    return words.every((word) => text.includes(word));
  });
}

/** "1 result" or "3 results", for the live count under the search field. */
export function resultCount(count: number) {
  if (count === 1) return "1 result";
  return `${count} results`;
}
