import assert from "node:assert/strict";
import test from "node:test";
import { cleanDraft, emptyDraft, groupByKind, validateEntry, BODY_MAX } from "../services/knowledge.ts";

test("a new entry needs a title and text", () => {
  assert.deepEqual(Object.keys(validateEntry(emptyDraft())).sort(), ["body", "title"]);
  assert.deepEqual(validateEntry({ kind: "faq", title: " Delivery ", body: "Within Jakarta, next day.", price: "" }), {});
  assert.ok(validateEntry({ kind: "faq", title: "t", body: "x".repeat(BODY_MAX + 1), price: "" }).body);
  assert.ok(validateEntry({ kind: "menu", title: "t", body: "b", price: "" }).kind);
});

test("only products keep a price, and fields are trimmed", () => {
  assert.deepEqual(cleanDraft({ kind: "product", title: " Nasi goreng ", body: " Fried rice. ", price: " Rp 25.000 " }),
    { kind: "product", title: "Nasi goreng", body: "Fried rice.", price: "Rp 25.000" });
  assert.equal(cleanDraft({ kind: "hours", title: "Hours", body: "08:00 to 17:00", price: "Rp 1" }).price, "");
});

test("every kind is listed, empty ones too, so the page shows where to add", () => {
  const groups = groupByKind([{ id: "a".repeat(32), kind: "faq", title: "Q", body: "A", price: "", updated_at: 1 }]);
  assert.deepEqual(groups.map((group) => [group.kind, group.entries.length]), [["product", 0], ["faq", 1], ["hours", 0], ["policy", 0]]);
});
