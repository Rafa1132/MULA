import assert from "node:assert/strict";
import test from "node:test";
import { INSPECT_ID, buildTree, childPath, completeLink, folderPaths, linkQuery, matchTitles, nameProblem, splitInline, untitledName, visibleRows } from "../services/notes.ts";

function note(id, title, folder, tags = []) {
  return { id: `note:${id}`, kind: "note", note_id: id, title, folder, tags, essential: false, updated_at: null, links: 0 };
}
const NODES = [
  note(1, "Aroma Coffee", "suppliers", ["supplier"]),
  note(2, "budi", "people"),
  note(3, "Q4 pricing", "decisions/2026"),
  note(4, "Loose idea", ""),
  { id: "facts:business", kind: "facts", target: "business", title: "About the business", folder: "Facts", tags: [], essential: false, updated_at: null, links: 0 },
  { id: "facts:owner", kind: "facts", target: "owner", title: "About the owner", folder: "Facts", tags: [], essential: false, updated_at: null, links: 0 },
  { id: "ghost:invoice", kind: "ghost", title: "Invoice", folder: null, tags: [], essential: false, updated_at: null, links: 1 },
];

test("the tree puts Facts first, sorts folders, counts notes and leaves ghosts out", () => {
  const root = buildTree(NODES);
  assert.deepEqual(root.folders.map((folder) => [folder.path, folder.count]), [["Facts", 2], ["decisions", 1], ["people", 1], ["suppliers", 1]]);
  assert.deepEqual(root.folders[0].notes.map((node) => node.id), ["facts:business", "facts:owner", INSPECT_ID]);
  assert.deepEqual(root.folders[1].folders.map((folder) => folder.path), ["decisions/2026"]);
  assert.deepEqual(root.notes.map((node) => node.title), ["Loose idea"]);
  assert.equal(root.count, 6);
});

test("visible rows follow expansion, carry levels and positions, and a tag filter opens matches", () => {
  const root = buildTree(NODES);
  let rows = visibleRows(root, new Set());
  assert.deepEqual(rows.map((row) => [row.id, row.level, row.position, row.size]), [
    ["folder:Facts", 1, 1, 5], ["folder:decisions", 1, 2, 5], ["folder:people", 1, 3, 5], ["folder:suppliers", 1, 4, 5], ["note:4", 1, 5, 5],
  ]);
  rows = visibleRows(root, new Set(["decisions", "decisions/2026"]));
  assert.deepEqual(rows.slice(1, 4).map((row) => [row.id, row.level, row.parent]), [
    ["folder:decisions", 1, null], ["folder:decisions/2026", 2, "folder:decisions"], ["note:3", 3, "folder:decisions/2026"],
  ]);
  rows = visibleRows(root, new Set(), "SUPPLIER");
  assert.deepEqual(rows.map((row) => row.id), ["folder:suppliers", "note:1"]);
});

test("folder suggestions include parents and skip Facts", () => {
  assert.deepEqual(folderPaths(NODES), ["decisions", "decisions/2026", "people", "suppliers"]);
});

test("[[ completion finds the open link and closes it", () => {
  assert.deepEqual(linkQuery("See [[Aro", 9), { start: 6, query: "Aro" });
  assert.equal(linkQuery("See [[Aroma]] now", 17), null);
  assert.equal(linkQuery("See [[Aroma|al", 14), null);
  assert.equal(linkQuery("See [[\nAro", 10), null);
  assert.deepEqual(completeLink("See [[Aro and", 6, 9, "Aroma Coffee"), { text: "See [[Aroma Coffee]] and", caret: 20 });
  assert.deepEqual(completeLink("See [[Aro]] and", 6, 9, "Aroma Coffee"), { text: "See [[Aroma Coffee]] and", caret: 20 });
  assert.deepEqual(matchTitles(NODES, "bu"), ["budi", "About the business"]);
  assert.deepEqual(matchTitles(NODES, "inv"), []);
});

test("rendered text splits into links with labels and tags, like the server's parser", () => {
  assert.deepEqual(splitInline("Ask [[Budi|our buyer]] about ![[Price list.md#2026]] #beans and #2026 or a#b"), [
    { text: "Ask " }, { link: "Budi", label: "our buyer" }, { text: " about " }, { link: "Price list", label: "Price list.md#2026" },
    { text: " " }, { tag: "beans" }, { text: " and #2026 or a#b" },
  ]);
  assert.deepEqual(splitInline("#start of line"), [{ tag: "start" }, { text: " of line" }]);
});

test("empty folders made in the browser join the tree, and a draft row comes first in its folder", () => {
  const root = buildTree(NODES, ["recipes/cold", "suppliers/new"]);
  const recipes = root.folders.find((folder) => folder.path === "recipes");
  assert.deepEqual(recipes.folders.map((folder) => folder.path), ["recipes/cold"]);
  assert.equal(recipes.count, 0);
  // A path that already holds notes isn't duplicated.
  assert.equal(root.folders.filter((folder) => folder.path === "suppliers").length, 1);
  const rows = visibleRows(root, new Set(["recipes", "suppliers"]), null, { kind: "note", folder: "suppliers" });
  const index = rows.findIndex((row) => row.id === "folder:suppliers");
  assert.equal(rows[index + 1].kind, "draft");
  assert.equal(rows[index + 1].level, 2);
  assert.equal(rows[index + 1].position, 1);
  assert.equal(rows[index + 2].size, rows[index + 1].size);
  // A top-level draft opens the list.
  assert.equal(visibleRows(root, new Set(), null, { kind: "folder", folder: "" })[0].kind, "draft");
});

test("new names: Untitled, then Untitled 1, and the server's naming rules", () => {
  assert.equal(untitledName([]), "Untitled");
  assert.equal(untitledName(["untitled", "Untitled 1"]), "Untitled 2");
  assert.equal(nameProblem("  Cold   brew ", "title"), null);
  assert.equal(nameProblem("   ", "folder name"), "Give it a folder name.");
  assert.match(nameProblem("a/b", "title"), /can't contain \//);
  assert.match(nameProblem("[[x]]", "title"), /can't contain \[/);
  assert.match(nameProblem(".hidden", "folder name"), /dot/);
  assert.match(nameProblem("x".repeat(121), "title"), /120/);
  assert.equal(childPath("", "recipes"), "recipes");
  assert.equal(childPath("recipes", "cold"), "recipes/cold");
});
