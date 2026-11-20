// Which character an agent is drawn as, in the art direction in docs/design/agent-art/. The
// orchestrator (the Operator) is the animated orb; the others are "bubble bots": the four in the
// brief by their own ids, and Forecasting, which works with numbers, as the Finance bot. A new
// agent needs a new bot (new shape, new hue, no satellite; never mint), so until it has one it
// shows its initial. Tested in tests/avatar.test.mjs.
export type Character = { kind: "orb" } | { kind: "bot"; src: string } | { kind: "initial"; letter: string };

const BOTS: Record<string, string> = {
  forecasting: "finance",
  finance: "finance",
  sales: "sales",
  inventory: "inventory",
  support: "support",
};

export function characterFor(id: string, name: string): Character {
  if (id === "operator") return { kind: "orb" };
  // Own keys only, so an id such as "__proto__" can't read the object's prototype.
  if (Object.hasOwn(BOTS, id)) return { kind: "bot", src: `/agents/${BOTS[id]}.svg` };
  let letter = "?";
  if (name.trim()) letter = name.trim().slice(0, 1).toUpperCase();
  return { kind: "initial", letter };
}
