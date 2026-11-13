// 16×16 pixel characters, one character per pixel; "." is transparent.
const PALETTE: Record<string, string> = {
  k: "#2b2019", // outline and features
  y: "#f9c74f", // antenna light and chart bars
  o: "#f26b1d", // Operator face
  d: "#d9541a", // Operator shading
  b: "#5bb5d8", // Forecasting face
  c: "#3d93b5", // Forecasting shading
  g: "#c9c3d6", // fallback face
  h: "#a8a1b8", // fallback shading
};

const ART: Record<string, string[]> = {
  // A speech-bubble robot with an antenna light: the one you talk to.
  operator: [
    ".......yy.......",
    ".......yy.......",
    ".......kk.......",
    "..kkkkkkkkkkkk..",
    ".kooooooooooook.",
    ".kooooooooooook.",
    ".kookkooookkook.",
    ".kookkooookkook.",
    ".kooooooooooook.",
    ".koookooookoook.",
    ".kooookkkkooook.",
    ".kddddddddddddk.",
    ".kddddddddddddk.",
    "..kkkkkkkkkkkk..",
    "...kd...........",
    "...k............",
  ],
  // Rising bars on its head: the one that projects numbers forward.
  forecasting: [
    "...........yy...",
    ".......yy..yy...",
    "...yy..yy..yy...",
    "..kkkkkkkkkkkk..",
    ".kbbbbbbbbbbbbk.",
    ".kbbbbbbbbbbbbk.",
    ".kbbkkbbbbkkbbk.",
    ".kbbkkbbbbkkbbk.",
    ".kbbbbbbbbbbbbk.",
    ".kbbbkbbbbkbbbk.",
    ".kbbbbkkkkbbbbk.",
    ".kcccccccccccck.",
    ".kcccccccccccck.",
    "..kkkkkkkkkkkk..",
    "................",
    "................",
  ],
};

// Agents added on the server before they get their own art still render.
const FALLBACK = [
  "................",
  ".......kk.......",
  ".......kk.......",
  "..kkkkkkkkkkkk..",
  ".kggggggggggggk.",
  ".kggggggggggggk.",
  ".kggkkggggkkggk.",
  ".kggkkggggkkggk.",
  ".kggggggggggggk.",
  ".kgggkggggkgggk.",
  ".kggggkkkkggggk.",
  ".khhhhhhhhhhhhk.",
  ".khhhhhhhhhhhhk.",
  "..kkkkkkkkkkkk..",
  "................",
  "................",
];

/** One rect per run of same-coloured pixels, which also avoids seams between pixels. */
function pixelRuns(rows: string[]) {
  const runs: { x: number; y: number; width: number; color: string }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = PALETTE[row[x]];
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end += 1;
      if (color) runs.push({ x, y, width: end - x, color });
      x = end;
    }
  });
  return runs;
}

export default function PixelAgent({ id, name, size = 88 }: { id: string; name: string; size?: number }) {
  let rows = FALLBACK;
  if (ART[id]) rows = ART[id];
  return <svg className="pixel-agent" viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={`${name} character`}>
    {pixelRuns(rows).map((run) => <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.width} height={1} fill={run.color} />)}
  </svg>;
}
