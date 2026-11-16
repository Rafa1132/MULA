import assert from "node:assert/strict";
import test from "node:test";
import { CATALOGUE_ENTRIES, PUBLISHERS } from "../data.ts";
import { publisherFor } from "../services/publishers.ts";
import { filterEntries } from "../services/search.ts";

test("every entry names a publisher from the list, and all are Mula for now", () => {
  const ids = new Set(PUBLISHERS.map((publisher) => publisher.id));
  for (const entry of CATALOGUE_ENTRIES) {
    assert.ok(ids.has(entry.publisher), `${entry.id} names an unknown publisher`);
    assert.deepEqual(publisherFor(entry), { id: "mula", name: "Mula", avatar: "/catalogue/publishers/mula.png", verified: true });
  }
});

test("an unknown publisher shows as an unverified name instead of failing", () => {
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  const publisher = publisherFor({ ...CATALOGUE_ENTRIES[0], publisher: "acme" });
  assert.deepEqual(publisher, { id: "acme", name: "acme", avatar: "", verified: false });
  assert.match(warnings[0], /unknown publisher, acme/);
});

test("search matches the publisher name", () => {
  // "mula" appears in no entry's name or tags, and in only one description.
  const byDescription = CATALOGUE_ENTRIES.filter((entry) => entry.description.toLowerCase().includes("mula"));
  assert.ok(byDescription.length < CATALOGUE_ENTRIES.length);
  assert.equal(filterEntries(CATALOGUE_ENTRIES, "MULA").length, CATALOGUE_ENTRIES.length);
  assert.deepEqual(filterEntries(CATALOGUE_ENTRIES, "mula invoices").map((entry) => entry.name), ["Invoice maker"]);
});
