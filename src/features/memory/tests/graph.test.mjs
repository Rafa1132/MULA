import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FILTER, MAP_WORLD, NO_FOLDER, describeGraph, filterGraph, folderStyles, layoutGraph, listGraph, localIds, mapViewKey, nodeRadius, shapePath, topFolder } from "../services/graph.ts";

function note(id, title, folder, tags = []) {
  return { id: `note:${id}`, kind: "note", note_id: id, title, folder, tags, essential: false, updated_at: null, links: 0 };
}
function ghost(title) {
  return { id: `ghost:${title.toLowerCase()}`, kind: "ghost", title, folder: null, tags: [], essential: false, updated_at: null, links: 0 };
}
const edge = (source, target) => ({ source, target, count: 1 });

// A chain a → b → c → d, a link from a to a missing note, a lone note and a facts note.
const GRAPH = {
  nodes: [
    note(1, "Aroma", "suppliers/coffee", ["supplier"]),
    note(2, "Budi", "people"),
    note(3, "Contract", "suppliers", ["Supplier"]),
    note(4, "Deadline", "decisions/2026"),
    note(5, "Loose idea", ""),
    { id: "facts:business", kind: "facts", target: "business", title: "About the business", folder: "Facts", tags: [], essential: false, updated_at: null, links: 0 },
    ghost("Invoice"),
  ],
  edges: [edge("note:1", "note:2"), edge("note:2", "note:3"), edge("note:3", "note:4"), edge("note:1", "ghost:invoice"), edge("facts:business", "note:1")],
  tags: [],
};
const ids = (result) => result.nodes.map((node) => node.id).sort();

test("nodes group by their top-level folder, Facts first, with distinct shapes", () => {
  assert.equal(topFolder(GRAPH.nodes[0]), "suppliers");
  assert.equal(topFolder(GRAPH.nodes[4]), NO_FOLDER);
  assert.equal(topFolder(GRAPH.nodes[6]), null);
  const styles = folderStyles(GRAPH.nodes);
  assert.deepEqual(styles.map((style) => [style.folder, style.count]), [["Facts", 1], ["decisions", 1], ["No folder", 1], ["people", 1], ["suppliers", 2]]);
  assert.equal(new Set(styles.map((style) => `${style.colour}/${style.shape}`)).size, styles.length);
});

test("the default filter shows everything", () => {
  const result = filterGraph(GRAPH, DEFAULT_FILTER, null);
  assert.equal(result.nodes.length, GRAPH.nodes.length);
  assert.equal(result.edges.length, GRAPH.edges.length);
});

test("folder, tag, ghost and orphan filters", () => {
  // Hiding suppliers hides Aroma, so the ghost only Aroma linked to goes too.
  assert.deepEqual(ids(filterGraph(GRAPH, { ...DEFAULT_FILTER, hiddenFolders: ["suppliers"] }, null)), ["facts:business", "note:2", "note:4", "note:5"]);
  // Tags match without regard to case; ghosts stay while a shown note links to them.
  assert.deepEqual(ids(filterGraph(GRAPH, { ...DEFAULT_FILTER, tag: "supplier" }, null)), ["ghost:invoice", "note:1", "note:3"]);
  assert.ok(!ids(filterGraph(GRAPH, { ...DEFAULT_FILTER, ghosts: false }, null)).includes("ghost:invoice"));
  // Orphans are judged on the whole graph: Deadline keeps its place though its partner is hidden.
  const noOrphans = filterGraph(GRAPH, { ...DEFAULT_FILTER, orphans: false, hiddenFolders: ["suppliers"] }, null);
  assert.deepEqual(ids(noOrphans), ["facts:business", "note:2", "note:4"]);
  assert.deepEqual(noOrphans.edges, []);
});

test("the local graph reaches one or two links in either direction and keeps its focus", () => {
  assert.deepEqual([...localIds(GRAPH.edges, "note:2", 1)].sort(), ["note:1", "note:2", "note:3"]);
  assert.deepEqual([...localIds(GRAPH.edges, "note:2", 2)].sort(), ["facts:business", "ghost:invoice", "note:1", "note:2", "note:3", "note:4"]);
  const local = filterGraph(GRAPH, { ...DEFAULT_FILTER, local: true, depth: 1, hiddenFolders: ["people"] }, "note:2");
  assert.deepEqual(ids(local), ["note:1", "note:2", "note:3"]);
  // Without a focus (or an unknown one) the local filter does nothing.
  assert.equal(filterGraph(GRAPH, { ...DEFAULT_FILTER, local: true }, null).nodes.length, GRAPH.nodes.length);
  assert.equal(filterGraph(GRAPH, { ...DEFAULT_FILTER, local: true }, "note:99").nodes.length, GRAPH.nodes.length);
});

test("node size grows with links up to a cap, and every shape is a closed path", () => {
  assert.ok(nodeRadius(0) < nodeRadius(1) && nodeRadius(1) < nodeRadius(9));
  assert.equal(nodeRadius(10_000), 20);
  for (const shape of ["circle", "square", "diamond", "triangle", "hexagon"]) assert.match(shapePath(shape, 8), /^M.*Z$/);
});

test("the layout is deterministic, stays in the world, and pulls linked notes together", () => {
  const first = layoutGraph(GRAPH.nodes, GRAPH.edges);
  const second = layoutGraph(GRAPH.nodes, GRAPH.edges);
  assert.deepEqual([...first], [...second]);
  for (const { x, y } of first.values()) {
    assert.ok(x >= 0 && x <= MAP_WORLD.width && y >= 0 && y <= MAP_WORLD.height);
  }
  const distance = (a, b) => Math.hypot(first.get(a).x - first.get(b).x, first.get(a).y - first.get(b).y);
  assert.ok(distance("note:1", "note:2") < distance("note:1", "note:4"));
  // A warm start keeps nodes near where they were.
  const again = layoutGraph(GRAPH.nodes.slice(0, 4), GRAPH.edges.slice(0, 3), first);
  assert.ok(Math.hypot(again.get("note:2").x - first.get("note:2").x, again.get("note:2").y - first.get("note:2").y) < 150);
  // Its pan and zoom are remembered apart from the agent map's.
  assert.equal(mapViewKey("rafa"), "mula.memory.view.rafa");
});

test("the text version sums up the map and lists every link both ways", () => {
  const all = filterGraph(GRAPH, DEFAULT_FILTER, null);
  assert.equal(describeGraph(all.nodes, all.edges),
    "Showing 6 notes and 1 note not created yet, with 5 links. Most linked: Aroma (3 links), Budi (2 links), Contract (2 links). 1 note links to nothing shown here.");
  assert.equal(describeGraph([], []), "Nothing matches these filters.");
  const budi = listGraph(all.nodes, all.edges).find((entry) => entry.node.title === "Budi");
  assert.deepEqual(budi.linksTo.map((node) => node.title), ["Contract"]);
  assert.deepEqual(budi.linkedFrom.map((node) => node.title), ["Aroma"]);
});
