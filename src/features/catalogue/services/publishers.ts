import { PUBLISHERS } from "../data.ts";
import type { CatalogueEntry, Publisher } from "../data.ts";

/** The entry's publisher. An id missing from PUBLISHERS shows as an unverified name, not a crash. */
export function publisherFor(entry: CatalogueEntry): Publisher {
  const publisher = PUBLISHERS.find((candidate) => candidate.id === entry.publisher);
  if (publisher !== undefined) return publisher;
  console.warn(`Catalogue entry ${entry.id} names an unknown publisher, ${entry.publisher}.`);
  return { id: entry.publisher, name: entry.publisher, avatar: "", verified: false };
}
