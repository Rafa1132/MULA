// Small SVG drawing kit for the Catalogue proof-of-concept images: palette, text,
// shapes and a few mock-UI pieces (frame, cards, tables, charts, chips, fields).
// Everything returns SVG markup as a string.

export const PALETTE = {
  night: "#0B0B0D",
  bone: "#F4F1EA",
  ember: "#FF7A3D",
  gold: "#FFC56B",
  // Supporting tints for mock UI, mixed from the four brand colours.
  paper: "#FBF9F4",
  white: "#FFFFFF",
  line: "#E4DED2",
  quiet: "#6B655B",
  emberText: "#C2501C",
  emberSoft: "#FFE4D6",
  goldSoft: "#FFF1D6",
  nightSoft: "#2A2A2E",
  green: "#2F7D4F",
  greenSoft: "#DDF0E3",
};

export const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Choose between two values. The project avoids the ternary operator, so drawing code uses this. */
export function pick(condition, whenTrue, whenFalse) {
  if (condition) return whenTrue;
  return whenFalse;
}

/** Escape text for SVG. All mock text passes through here. */
export function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "Rp 18.000": Indonesian Rupiah with dot thousands, no decimals. */
export function rupiah(amount) {
  return `Rp ${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export function svg(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

export function rect(x, y, width, height, fill, { r = 0, stroke = "none", strokeWidth = 0, opacity = 1 } = {}) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
}

export function circle(cx, cy, r, fill, { stroke = "none", strokeWidth = 0, opacity = 1 } = {}) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
}

export function line(x1, y1, x2, y2, stroke, width = 2, { dash = "", cap = "round" } = {}) {
  let dashAttr = "";
  if (dash) dashAttr = ` stroke-dasharray="${dash}"`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="${cap}"${dashAttr}/>`;
}

export function path(d, { fill = "none", stroke = "none", width = 0, cap = "round", join = "round", opacity = 1 } = {}) {
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="${join}" opacity="${opacity}"/>`;
}

export function text(x, y, value, { size = 20, weight = 400, fill = PALETTE.night, anchor = "start", family = FONT, spacing = 0 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}">${esc(value)}</text>`;
}

/** A rounded pill with centred text, such as a filter or a status chip. Returns its markup and width. */
export function chip(x, y, label, { fill = PALETTE.bone, color = PALETTE.night, size = 18, height = 38, stroke = "none", weight = 500 } = {}) {
  const width = Math.round(label.length * size * 0.56 + 32);
  const markup = rect(x, y, width, height, fill, { r: height / 2, stroke, strokeWidth: 1.5 })
    + text(x + width / 2, y + height / 2 + size * 0.36, label, { size, weight, fill: color, anchor: "middle" });
  return { markup, width };
}

export function button(x, y, label, { primary = true, size = 19, height = 46 } = {}) {
  let fill = PALETTE.white;
  let color = PALETTE.night;
  let stroke = PALETTE.line;
  if (primary) { fill = PALETTE.night; color = PALETTE.bone; stroke = PALETTE.night; }
  return chip(x, y, label, { fill, color, size, height, stroke, weight: 600 });
}

/** A white card with a soft edge. */
export function card(x, y, width, height, { fill = PALETTE.white, r = 18 } = {}) {
  return rect(x, y + 3, width, height, PALETTE.line, { r, opacity: 0.6 }) + rect(x, y, width, height, fill, { r, stroke: PALETTE.line, strokeWidth: 1.5 });
}

/** A labelled text field showing a value. */
export function field(x, y, width, label, value, { focused = false, height = 54 } = {}) {
  let stroke = PALETTE.line;
  let strokeWidth = 1.5;
  if (focused) { stroke = PALETTE.ember; strokeWidth = 3; }
  return text(x, y, label, { size: 16, weight: 600, fill: PALETTE.quiet })
    + rect(x, y + 12, width, height, PALETTE.white, { r: 12, stroke, strokeWidth })
    + text(x + 18, y + 12 + height / 2 + 7, value, { size: 20 });
}

/** A simple table: column x positions, a header row and body rows. */
export function table(x, y, width, columns, header, rows, { rowHeight = 58, highlight = () => null } = {}) {
  let out = text(x + columns[0], y, header[0], { size: 15, weight: 700, fill: PALETTE.quiet, spacing: 1 });
  header.slice(1).forEach((label, index) => { out += text(x + columns[index + 1], y, label, { size: 15, weight: 700, fill: PALETTE.quiet, spacing: 1 }); });
  out += line(x, y + 18, x + width, y + 18, PALETTE.line, 1.5);
  rows.forEach((row, rowIndex) => {
    const top = y + 18 + rowIndex * rowHeight;
    const mark = highlight(row, rowIndex);
    if (mark) out += rect(x - 8, top + 6, width + 16, rowHeight - 12, mark, { r: 10 });
    row.forEach((cell, index) => {
      if (cell && typeof cell === "object") { out += cell.draw(x + columns[index], top + rowHeight / 2); return; }
      let weight = 400;
      if (index === 0) weight = 500;
      out += text(x + columns[index], top + rowHeight / 2 + 7, cell, { size: 19, weight });
    });
    out += line(x, top + rowHeight, x + width, top + rowHeight, PALETTE.line, 1);
  });
  return out;
}

/** A status chip usable as a table cell: { draw(x, centreY) }. */
export function statusCell(label, tone) {
  const tones = {
    ok: [PALETTE.greenSoft, PALETTE.green],
    warn: [PALETTE.emberSoft, PALETTE.emberText],
    gold: [PALETTE.goldSoft, "#8A5A00"],
    quiet: [PALETTE.bone, PALETTE.quiet],
  };
  const [fill, color] = tones[tone];
  return { draw: (x, centreY) => chip(x, centreY - 16, label, { fill, color, size: 15, height: 32, weight: 600 }).markup };
}

/** Bars from `values`, scaled to the box, with optional labels under each bar. */
export function barChart(x, y, width, height, values, { color = PALETTE.ember, labels = [], highlightFrom = Infinity, ghost = PALETTE.gold } = {}) {
  const max = Math.max(...values) * 1.1;
  const gap = width / values.length;
  const barWidth = gap * 0.58;
  let out = "";
  for (let step = 0; step <= 4; step += 1) out += line(x, y + (height * step) / 4, x + width, y + (height * step) / 4, PALETTE.line, 1, { dash: "4 6" });
  values.forEach((value, index) => {
    const barHeight = (value / max) * height;
    let fill = color;
    if (index >= highlightFrom) fill = ghost;
    out += rect(x + index * gap + (gap - barWidth) / 2, y + height - barHeight, barWidth, barHeight, fill, { r: 6 });
    if (labels[index]) out += text(x + index * gap + gap / 2, y + height + 30, labels[index], { size: 15, fill: PALETTE.quiet, anchor: "middle" });
  });
  return out;
}

/** A line through `values`; points from `dashFrom` on are drawn dashed (a forecast). */
export function lineChart(x, y, width, height, values, { color = PALETTE.night, forecastColor = PALETTE.ember, dashFrom = Infinity, band = false } = {}) {
  const max = Math.max(...values) * 1.15;
  const min = Math.min(...values) * 0.7;
  const point = (value, index) => [x + (index / (values.length - 1)) * width, y + height - ((value - min) / (max - min)) * height];
  let out = "";
  for (let step = 0; step <= 4; step += 1) out += line(x, y + (height * step) / 4, x + width, y + (height * step) / 4, PALETTE.line, 1, { dash: "4 6" });
  const points = values.map(point);
  const history = points.slice(0, Math.min(dashFrom + 1, points.length));
  out += path("M" + history.map((p) => p.join(" ")).join(" L"), { stroke: color, width: 4 });
  if (dashFrom < points.length) {
    const future = points.slice(dashFrom);
    if (band) {
      const upper = future.map(([px, py], index) => [px, py - 14 - index * 6]);
      const lower = future.map(([px, py], index) => [px, py + 14 + index * 6]).reverse();
      out += path("M" + upper.concat(lower).map((p) => p.join(" ")).join(" L") + "Z", { fill: PALETTE.goldSoft, opacity: 0.95 });
    }
    out += `<path d="M${future.map((p) => p.join(" ")).join(" L")}" fill="none" stroke="${forecastColor}" stroke-width="4" stroke-dasharray="10 9" stroke-linecap="round"/>`;
    out += line(points[dashFrom][0], y, points[dashFrom][0], y + height, PALETTE.quiet, 1.5, { dash: "3 5" });
  }
  return out;
}

/** A tiny icon drawn with strokes, from a 24×24 path, at (x, y) and `size`. */
export function icon(x, y, size, d, color = PALETTE.night, width = 2) {
  const scale = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="${d}" fill="none" stroke="${color}" stroke-width="${width / scale}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

export const ICONS = {
  check: "M5 12l4 4 10-10",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4ZM10 20a2 2 0 0 0 4 0",
  warn: "M12 3 2 20h20ZM12 10v4M12 17h.01",
  box: "M3 7l9-4 9 4v10l-9 4-9-4ZM3 7l9 4 9-4M12 11v10",
  truck: "M2 6h12v10H2ZM14 10h4l3 3v3h-7ZM6 19a2 2 0 1 0 0-.1M17 19a2 2 0 1 0 0-.1",
  tag: "M3 12V3h9l9 9-9 9ZM7.5 7.5h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-5-5",
  file: "M6 3h8l4 4v14H6ZM14 3v4h4",
  pause: "M9 5v14M15 5v14",
  pin: "M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12ZM12 11a2 2 0 1 0 0-.1",
  send: "M4 4l17 8-17 8 3-8ZM7 12h14",
  plus: "M12 5v14M5 12h14",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
};

/**
 * The shared frame for every preview: a desktop window on a Bone backdrop, with the
 * app's name, a fictional shop and a "Contoh data" (sample data) tag. Content goes in
 * the returned box: { x, y, width, height }.
 */
export function appFrame(appName, accent, body, { shop = "Toko Sinar Pagi", nav = [] } = {}) {
  const W = 1600;
  const H = 1000;
  const x = 60;
  const y = 50;
  const width = W - 120;
  const height = H - 100;
  let out = rect(0, 0, W, H, PALETTE.bone);
  out += rect(x, y + 10, width, height, "#D9D2C4", { r: 26 });
  out += rect(x, y, width, height, PALETTE.paper, { r: 26, stroke: PALETTE.line, strokeWidth: 2 });
  // Title bar
  out += `<path d="M${x} ${y + 26}a26 26 0 0 1 26-26h${width - 52}a26 26 0 0 1 26 26v54H${x}Z" fill="${PALETTE.white}"/>`;
  out += line(x, y + 80, x + width, y + 80, PALETTE.line, 1.5);
  [PALETTE.ember, PALETTE.gold, PALETTE.line].forEach((fill, index) => { out += circle(x + 34 + index * 26, y + 40, 8, fill); });
  out += rect(x + 130, y + 22, 36, 36, accent, { r: 10 });
  out += text(x + 180, y + 48, appName, { size: 22, weight: 700 });
  let navX = x + 200 + appName.length * 12 + 30;
  nav.forEach((label, index) => {
    let color = PALETTE.quiet;
    let weight = 500;
    if (index === 0) { color = PALETTE.night; weight = 700; }
    out += text(navX, y + 48, label, { size: 18, weight, fill: color });
    if (index === 0) out += rect(navX, y + 72, label.length * 10, 4, accent, { r: 2 });
    navX += label.length * 10 + 46;
  });
  const tag = chip(x + width - 190, y + 22, "Contoh data", { fill: PALETTE.goldSoft, color: "#8A5A00", size: 15, height: 34, weight: 700 });
  out += tag.markup;
  out += text(x + width - 210, y + 46, shop, { size: 18, weight: 600, fill: PALETTE.quiet, anchor: "end" });
  out += body({ x: x + 40, y: y + 120, width: width - 80, height: height - 160 });
  return svg(W, H, out);
}
