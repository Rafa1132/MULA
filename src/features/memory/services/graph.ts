// The Memory map: which nodes and links to show for the chosen filters, the local graph around a
// note, a colour and shape per top-level folder, node sizes, the force layout, and the text
// version of the map. Pure functions, so the map and its tests agree on every rule.
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";
import { FACTS_FOLDER, sameTag } from "./notes.ts";
import type { Graph, GraphEdge, GraphNode } from "./notes.ts";

export type MapFilter = {
  hiddenFolders: string[];
  tag: string | null;
  ghosts: boolean;
  orphans: boolean;
  // Local graph: only the open note and what lies within `depth` links of it.
  local: boolean;
  depth: 1 | 2;
};

export const DEFAULT_FILTER: MapFilter = { hiddenFolders: [], tag: null, ghosts: true, orphans: true, local: false, depth: 1 };

// Notes saved without a folder are grouped under this name on the map and in its legend.
export const NO_FOLDER = "No folder";

export type Shape = "circle" | "square" | "diamond" | "triangle" | "hexagon";
const SHAPES: Shape[] = ["circle", "square", "diamond", "triangle", "hexagon"];
// Colours are CSS variables (memory.css) so each theme can keep them at 3:1 against the map.
const COLOURS = 6;

export type FolderStyle = { folder: string; colour: number; shape: Shape; count: number };
export type Point = { x: number; y: number };

/** The folder a node is grouped under on the map; null for links to notes that don't exist yet. */
export function topFolder(node: GraphNode): string | null {
  if (node.kind === "ghost" || node.folder === null) return null;
  const top = node.folder.split("/")[0];
  if (top) return top;
  return NO_FOLDER;
}

/**
 * A colour and shape per top-level folder: Facts first, then alphabetical. Colours and shapes
 * cycle at different lengths, so the first 30 folders all look different even without colour.
 */
export function folderStyles(nodes: GraphNode[]): FolderStyle[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const folder = topFolder(node);
    if (folder !== null) counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  const names = [...counts.keys()].sort((left, right) => {
    if (left === FACTS_FOLDER) return -1;
    if (right === FACTS_FOLDER) return 1;
    return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
  });
  return names.map((folder, index) => ({ folder, colour: index % COLOURS, shape: SHAPES[index % SHAPES.length], count: counts.get(folder) ?? 0 }));
}

/** Each node's neighbours, ignoring link direction. */
export function neighbours(edges: GraphEdge[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  function add(from: string, to: string) {
    let set = result.get(from);
    if (!set) {
      set = new Set();
      result.set(from, set);
    }
    set.add(to);
  }
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    add(edge.source, edge.target);
    add(edge.target, edge.source);
  }
  return result;
}

/** The focus node and everything within `depth` links of it, in either direction. */
export function localIds(edges: GraphEdge[], focus: string, depth: number): Set<string> {
  const around = neighbours(edges);
  const found = new Set([focus]);
  let frontier = [focus];
  for (let step = 0; step < depth; step += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of around.get(id) ?? []) {
        if (found.has(neighbour)) continue;
        found.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return found;
}

function edgesWithin(edges: GraphEdge[], ids: Set<string>) {
  return edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
}

/**
 * The nodes and links the map shows. "Orphans" are notes with no links at all in the whole graph,
 * so turning them off doesn't make notes vanish just because a folder filter hid their partners.
 * A ghost exists only because something links to it, so it goes when every note linking to it is
 * hidden. The local graph's focus is always kept, whatever the other filters say.
 */
export function filterGraph(graph: Graph, filter: MapFilter, focus: string | null): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const linked = neighbours(graph.edges);
  let nodes = graph.nodes;
  let localFocus: string | null = null;
  if (filter.local && focus !== null && nodes.some((node) => node.id === focus)) {
    localFocus = focus;
    const near = localIds(graph.edges, focus, filter.depth);
    nodes = nodes.filter((node) => near.has(node.id));
  }
  const hidden = new Set(filter.hiddenFolders);
  nodes = nodes.filter((node) => {
    if (node.id === localFocus) return true;
    if (node.kind === "ghost") return filter.ghosts;
    const folder = topFolder(node);
    if (folder !== null && hidden.has(folder)) return false;
    if (filter.tag !== null && !node.tags.some((tag) => sameTag(tag, filter.tag ?? ""))) return false;
    if (!filter.orphans && !linked.has(node.id)) return false;
    return true;
  });
  let ids = new Set(nodes.map((node) => node.id));
  let edges = edgesWithin(graph.edges, ids);
  const stillLinked = neighbours(edges);
  nodes = nodes.filter((node) => node.kind !== "ghost" || node.id === localFocus || stillLinked.has(node.id));
  ids = new Set(nodes.map((node) => node.id));
  edges = edgesWithin(edges, ids);
  return { nodes, edges };
}

/** Node radius in world pixels: grows with the number of linked notes, gently, up to a cap. */
export function nodeRadius(links: number) {
  return Math.min(6 + 2.5 * Math.sqrt(links), 20);
}

/** An SVG path for a shape of roughly equal visual weight, centred on 0,0. */
export function shapePath(shape: Shape, radius: number) {
  const r = radius;
  if (shape === "square") {
    const half = r * 0.88;
    return `M${-half},${-half}H${half}V${half}H${-half}Z`;
  }
  if (shape === "diamond") {
    const reach = r * 1.2;
    return `M0,${-reach}L${reach},0L0,${reach}L${-reach},0Z`;
  }
  if (shape === "triangle") {
    const reach = r * 1.3;
    return `M0,${-reach}L${reach * 0.87},${reach * 0.5}L${-reach * 0.87},${reach * 0.5}Z`;
  }
  if (shape === "hexagon") {
    const corners = [0, 1, 2, 3, 4, 5].map((index) => {
      const angle = Math.PI / 3 * index;
      return `${(r * 1.05 * Math.cos(angle)).toFixed(2)},${(r * 1.05 * Math.sin(angle)).toFixed(2)}`;
    });
    return `M${corners.join("L")}Z`;
  }
  return `M${-r},0A${r},${r} 0 1,0 ${r},0A${r},${r} 0 1,0 ${-r},0Z`;
}

// ---- Layout ----

// The world the map is drawn in. Nodes stay inside it, so panning can never lose the graph.
export const MAP_WORLD = { width: 2400, height: 1600 };
const WORLD_MARGIN = 60;
// Enough steps for d3's default cooling schedule to settle (alpha decays to its minimum in ~300).
export const LAYOUT_TICKS = 300;
const LINK_DISTANCE = 80;
const CHARGE = -220;
const CENTRE_PULL = 0.05;
// Room for the label under each node.
const LABEL_GAP = 10;

type LayoutNode = SimulationNodeDatum & { id: string; radius: number };

/**
 * Settles the force layout and returns each node's centre. Fully deterministic: new nodes start on
 * a spiral round the centre (d3's own start pattern) and d3-force's jitter is seeded, so the same
 * graph always lands the same way and a remembered view still points at the same place. Positions
 * from the previous layout are kept as the starting point, so changing a filter moves nodes a
 * little instead of reshuffling the whole map.
 */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], previous: Map<string, Point> = new Map()): Map<string, Point> {
  const around = neighbours(edges);
  const centre = { x: MAP_WORLD.width / 2, y: MAP_WORLD.height / 2 };
  const layoutNodes: LayoutNode[] = nodes.map((node, index) => {
    const radius = nodeRadius(around.get(node.id)?.size ?? 0);
    const kept = previous.get(node.id);
    if (kept) return { id: node.id, radius, x: kept.x, y: kept.y };
    const distance = 10 * Math.sqrt(0.5 + index);
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    return { id: node.id, radius, x: centre.x + distance * Math.cos(angle), y: centre.y + distance * Math.sin(angle) };
  });
  const links: SimulationLinkDatum<LayoutNode>[] = edges.map((edge) => ({ source: edge.source, target: edge.target }));
  const simulation = forceSimulation(layoutNodes)
    .force("link", forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(links).id((node) => node.id).distance(LINK_DISTANCE))
    .force("charge", forceManyBody().strength(CHARGE))
    .force("collide", forceCollide<LayoutNode>((node) => node.radius + LABEL_GAP))
    .force("x", forceX(centre.x).strength(CENTRE_PULL))
    .force("y", forceY(centre.y).strength(CENTRE_PULL))
    .force("inside", () => {
      for (const node of layoutNodes) {
        node.x = clamp(node.x ?? centre.x, WORLD_MARGIN, MAP_WORLD.width - WORLD_MARGIN);
        node.y = clamp(node.y ?? centre.y, WORLD_MARGIN, MAP_WORLD.height - WORLD_MARGIN);
      }
    })
    .stop();
  // A warm start needs less heating, so kept nodes move a little rather than fly about.
  if (previous.size > 0 && layoutNodes.some((node) => previous.has(node.id))) simulation.alpha(0.3);
  simulation.tick(LAYOUT_TICKS);
  const positions = new Map<string, Point>();
  for (const node of layoutNodes) positions.set(node.id, { x: node.x ?? centre.x, y: node.y ?? centre.y });
  return positions;
}

// The Memory map remembers its own pan and zoom, per user and separately from the agent map.
export function mapViewKey(username: string) {
  return `mula.memory.view.${username}`;
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

// ---- The text version ----

function plural(count: number, one: string, many: string) {
  if (count === 1) return `1 ${one}`;
  return `${count} ${many}`;
}

/** One or two sentences that say what the map shows, for screen readers and anyone skimming. */
export function describeGraph(nodes: GraphNode[], edges: GraphEdge[]): string {
  const notes = nodes.filter((node) => node.kind !== "ghost");
  const ghosts = nodes.length - notes.length;
  if (nodes.length === 0) return "Nothing matches these filters.";
  let text = `Showing ${plural(notes.length, "note", "notes")}`;
  if (ghosts > 0) text += ` and ${plural(ghosts, "note not created yet", "notes not created yet")}`;
  text += `, with ${plural(edges.length, "link", "links")}.`;
  const around = neighbours(edges);
  const ranked = notes
    .map((node) => ({ title: node.title, links: around.get(node.id)?.size ?? 0 }))
    .filter((entry) => entry.links > 0)
    .sort((left, right) => right.links - left.links || left.title.localeCompare(right.title))
    .slice(0, 3);
  if (ranked.length > 0) text += ` Most linked: ${ranked.map((entry) => `${entry.title} (${plural(entry.links, "link", "links")})`).join(", ")}.`;
  const alone = notes.filter((node) => !around.has(node.id)).length;
  if (alone > 0) text += ` ${plural(alone, "note links", "notes link")} to nothing shown here.`;
  return text;
}

export type ListedNode = { node: GraphNode; linksTo: GraphNode[]; linkedFrom: GraphNode[] };

/** The map as a list: every node, alphabetical, with what it links to and what links to it. */
export function listGraph(nodes: GraphNode[], edges: GraphEdge[]): ListedNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const listed = new Map(nodes.map((node) => [node.id, { node, linksTo: [] as GraphNode[], linkedFrom: [] as GraphNode[] }]));
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target || source === target) continue;
    listed.get(source.id)?.linksTo.push(target);
    listed.get(target.id)?.linkedFrom.push(source);
  }
  const byTitle = (left: { title: string }, right: { title: string }) => left.title.localeCompare(right.title, undefined, { sensitivity: "base", numeric: true });
  const entries = [...listed.values()];
  for (const entry of entries) {
    entry.linksTo.sort(byTitle);
    entry.linkedFrom.sort(byTitle);
  }
  return entries.sort((left, right) => byTitle(left.node, right.node));
}
