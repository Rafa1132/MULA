import assert from "node:assert/strict";
import test from "node:test";
import { CATALOGUE_ENTRIES } from "../data.ts";
import { findEntry } from "../services/details.ts";
import { launchUrl } from "../services/launch.ts";

// Paths inside Mula open inside the project.
const PROJECT = "11111111-2222-4333-8444-555555555555";

test("To-do launches at its own page; apps without a launchUrl have nothing to open", () => {
  assert.equal(launchUrl(findEntry("todo"), PROJECT), `/projects/${PROJECT}/apps/todo`);
  assert.equal(launchUrl(findEntry("stock-sheet"), PROJECT), undefined);
  // Only apps carry a launchUrl.
  for (const entry of CATALOGUE_ENTRIES) if (entry.type !== "app") assert.equal(entry.launchUrl, undefined, entry.id);
});

test("a Mula path or an https URL is accepted; anything else is refused with a warning", () => {
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  const withUrl = (url) => ({ ...findEntry("todo"), launchUrl: url });
  assert.equal(launchUrl(withUrl("https://shop.example.com/admin"), PROJECT), "https://shop.example.com/admin");
  for (const bad of ["javascript:alert(1)", "http://shop.example.com", "//evil.example.com", "apps/todo", ""]) {
    assert.equal(launchUrl(withUrl(bad), PROJECT), undefined, bad);
  }
  assert.equal(warnings.length, 5);
  assert.match(warnings[0], /todo has a launchUrl that is not a Mula path or an https URL/);
});
