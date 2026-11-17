// Optional Playwright check of the Memory page. The API is faked in the browser
// (like the agent panel check), so it creates no accounts and needs no test database; the
// server's own rules are covered by server/src/features/memory/tests.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });
const NOW = "2026-11-17T10:00:00+00:00";

/** A small in-memory stand-in for /api/memory: notes with versions, links resolved by title, facts. */
function fakeMemory() {
  const notes = new Map([
    [1, { id: 1, folder: "suppliers", title: "Aroma Coffee", body: "Delivers on Tuesdays. Ask [[Budi|our buyer]] about the [[Invoice]]. #supplier", version: 1 }],
    [2, { id: 2, folder: "people", title: "Budi", body: "Our buyer.\n\n```\n[[Not a link]]\n```", version: 1 }],
    [3, { id: 3, folder: "decisions/2026", title: "Q4 pricing", body: "Prices rise 5%.", version: 1, warning: "The frontmatter is not valid YAML. Check the lines between the --- markers." }],
  ]);
  const facts = [{ id: 1, target: "business", fact: "We roast on Mondays.", actor: "owner", created_at: NOW, superseded: false, superseded_by: null, superseded_at: null, superseded_reason: null, related: [] }];
  const calls = [];
  // Folders in the fake vault besides those holding notes (made with New folder).
  const folders = new Set();
  const key = (text) => text.trim().toLowerCase();
  const linksOf = (body) => [...body.replace(/```[\s\S]*?```/g, "").matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g)].map((m) => ({ target: m[1].trim(), alias: m[2] ?? null }));
  const tagsOf = (body) => [...body.matchAll(/(?:^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)/gu)].map((m) => m[1]);
  const byTitle = (title) => [...notes.values()].find((note) => key(note.title) === key(title));
  const nodeOf = (target) => { const found = byTitle(target); return found ? `note:${found.id}` : null; };
  function graph() {
    const nodes = [...notes.values()].map((note) => ({ id: `note:${note.id}`, kind: "note", note_id: note.id, title: note.title, folder: note.folder, tags: tagsOf(note.body), essential: false, updated_at: NOW, links: 0 }));
    nodes.push({ id: "facts:business", kind: "facts", target: "business", title: "About the business", folder: "Facts", tags: [], essential: false, updated_at: null, links: 0 });
    nodes.push({ id: "facts:owner", kind: "facts", target: "owner", title: "About the owner", folder: "Facts", tags: [], essential: false, updated_at: null, links: 0 });
    const edges = [];
    for (const note of notes.values()) {
      for (const link of linksOf(note.body)) {
        let target = nodeOf(link.target);
        if (!target) {
          target = `ghost:${key(link.target)}`;
          if (!nodes.some((node) => node.id === target)) nodes.push({ id: target, kind: "ghost", title: link.target, folder: null, tags: [], essential: false, updated_at: null, links: 0 });
        }
        edges.push({ source: `note:${note.id}`, target, count: 1 });
      }
    }
    const paths = new Set(folders);
    for (const note of notes.values()) {
      const parts = note.folder.split("/").filter(Boolean);
      parts.forEach((_, index) => paths.add(parts.slice(0, index + 1).join("/")));
    }
    return { nodes, edges, tags: [{ tag: "supplier", count: 1 }], folders: [...paths].sort(), skipped: [{ path: "Big export.md", reason: "Larger than 400 KB." }] };
  }
  function detail(note) {
    const mentions = [];
    for (const other of notes.values()) {
      if (other.id === note.id) continue;
      if (linksOf(other.body).some((link) => nodeOf(link.target) === `note:${note.id}`)) mentions.push({ note_id: other.id, title: other.title, folder: other.folder, context: other.body.split("\n")[0] });
    }
    return { id: note.id, version: note.version, versions: note.version, folder: note.folder, title: note.title, text: note.body, body: note.body, frontmatter: {},
      tags: tagsOf(note.body), links: linksOf(note.body).map((link) => ({ ...link, resolves_to: nodeOf(link.target) })), mentions, created_at: NOW, updated_at: NOW, archived: false,
      warning: note.warning ?? null };
  }
  async function handle(route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const body = request.postDataJSON();
    calls.push({ method: request.method(), path, body });
    if (path === "/api/auth/me") return route.fulfill({ json: { id: "acc", username: "memorycheck" } });
    if (path === "/api/memory") return route.fulfill({ json: { summary: "# Mula memory\n\n## About the business\n\n- [1] We roast on Mondays.", entries: facts, audit: [{ id: 1, action: "note_saved", entry_id: null, actor: "owner", occurred_at: NOW, detail: { note_id: 1 } }], last_retrieval: null, relative_root: ".runtime/workspaces/acc/memory" } });
    if (path === "/api/memory/graph") return route.fulfill({ json: graph() });
    if (path === "/api/memory/search") return route.fulfill({ json: { results: [{ kind: "fact", id: 1, target: "business", fact: "We roast on Mondays.", created_at: NOW }, { kind: "note", note_id: 3, title: "Q4 pricing", folder: "decisions/2026", snippet: "Prices rise 5%." }] } });
    if (path === "/api/memory/entries") {
      const entry = { ...facts[0], id: facts.length + 1, target: body.target, fact: body.fact };
      facts.push(entry);
      return route.fulfill({ json: { outcome: "saved", entry } });
    }
    if (path === "/api/memory/folders") {
      if ([...graph().folders].some((folder) => key(folder) === key(body.folder))) return route.fulfill({ status: 409, json: { detail: "A folder called that is already here." } });
      folders.add(body.folder);
      return route.fulfill({ status: 201, json: { folder: body.folder } });
    }
    const relink = path.match(/^\/api\/memory\/notes\/(\d+)\/relink$/);
    if (relink) return route.fulfill({ json: { updated: 2, stale_facts: 0 } });
    if (path === "/api/memory/notes" && request.method() === "POST") {
      // A title may repeat in another folder, but not in the same one (it would be the same file).
      if ([...notes.values()].some((note) => key(note.title) === key(body.title) && key(note.folder) === key(body.folder))) {
        return route.fulfill({ status: 409, json: { detail: `A note called “${body.title}” is already in this folder. Choose another title, or open that note.` } });
      }
      const note = { id: notes.size + 1, folder: body.folder, title: body.title, body: body.text, version: 1 };
      notes.set(note.id, note);
      return route.fulfill({ status: 201, json: { outcome: "saved", renamed_from: null, stale_links: 0, stale_facts: 0, note: detail(note) } });
    }
    const one = path.match(/^\/api\/memory\/notes\/(\d+)$/);
    if (one) {
      const note = notes.get(Number(one[1]));
      if (request.method() === "GET") return route.fulfill({ json: detail(note) });
      if (body.base_version !== note.version) return route.fulfill({ status: 409, json: { detail: "This note changed since you opened it. Reload it to see the newer version before saving." } });
      const renamed = key(body.title) !== key(note.title);
      const from = { folder: note.folder, title: note.title };
      Object.assign(note, { folder: body.folder, title: body.title, body: body.text, version: note.version + 1 });
      let stale = 0;
      if (renamed) stale = [...notes.values()].filter((other) => linksOf(other.body).some((link) => key(link.target) === key(from.title))).length;
      return route.fulfill({ json: { outcome: "saved", renamed_from: renamed ? from : null, stale_links: stale, stale_facts: 0, note: detail(note) } });
    }
    return route.fulfill({ status: 404, json: { detail: "Not faked." } });
  }
  return { notes, calls, handle };
}

function contrast(foreground, background) {
  const luminance = (colour) => {
    // rgb() reports 0–255 channels; color-mix() results come back as color(srgb …) with 0–1 channels.
    let scale = 255;
    if (colour.startsWith("color(")) scale = 1;
    const [r, g, b] = colour.match(/\d*\.?\d+/g).slice(0, 3).map(Number).map((value) => {
      const channel = value / scale;
      if (channel <= 0.03928) return channel / 12.92;
      return ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** Text colour against the first opaque background behind it. */
async function colours(locator) {
  return locator.evaluate((element) => {
    let node = element;
    let background = "rgba(0, 0, 0, 0)";
    while (node && /rgba\(.*, 0\)$|transparent/.test(background)) {
      background = getComputedStyle(node).backgroundColor;
      node = node.parentElement;
    }
    return [getComputedStyle(element).color, background];
  });
}

async function openMemory(contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const memory = fakeMemory();
  await page.route(/\/api\/(auth\/me|memory)/, memory.handle);
  await page.goto(baseURL + "/memory");
  // Attached, not visible: on a phone the tree waits in the closed drawer.
  await page.locator('[role="tree"]').waitFor({ state: "attached" });
  return { context, page, errors, memory };
}

try {
  const { context, page, errors, memory } = await openMemory({ viewport: { width: 1440, height: 1000 } });
  const tree = page.getByRole("tree", { name: "Notes by folder" });

  // The tree: Facts first, folders with counts, nested folders, and the tree pattern's keys.
  const items = tree.getByRole("treeitem");
  assert.deepEqual((await items.allInnerTexts()).slice(0, 4).map((text) => text.split("\n")[0]), ["Facts", "About the business", "About the owner", "What the Operator reads"]);
  await tree.getByRole("treeitem", { name: /^suppliers/ }).waitFor();
  assert.equal(await tree.getByRole("treeitem", { name: /^suppliers/ }).getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator('[role="treeitem"][tabindex="0"]').count(), 1);
  await items.first().focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await items.first().getAttribute("aria-expanded"), "false");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "About the business");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.evaluate(() => document.activeElement.textContent.split(",")[0]), "Facts2");
  await page.keyboard.press("s");
  assert.match(await page.evaluate(() => document.activeElement.textContent), /^suppliers/);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  // Reading: rendered Markdown, a resolved link, a ghost link, a tag chip, and code left alone.
  const note = page.getByRole("article", { name: "Aroma Coffee" });
  await note.waitFor();
  const buyer = note.getByRole("button", { name: "our buyer" });
  assert.equal(await buyer.getAttribute("data-ghost"), null);
  assert.equal(await note.getByRole("button", { name: "Invoice" }).getAttribute("data-ghost"), "true");
  await note.locator(".note-markdown .tag-chip", { hasText: "#supplier" }).waitFor();
  await buyer.click();
  const budi = page.getByRole("article", { name: "Budi" });
  await budi.getByText("[[Not a link]]").waitFor();
  assert.equal(await budi.locator(".note-markdown .wikilink").count(), 0);
  // Linked mentions: Aroma links to Budi.
  await budi.getByRole("region", { name: /Linked mentions/ }).getByRole("button", { name: "Aroma Coffee" }).click();
  await note.waitFor();
  await page.screenshot({ path: `${screenshots}/memory-folders.png` });

  // A ghost link opens "not created yet", which offers to create it.
  await note.getByRole("button", { name: "Invoice" }).click();
  const ghost = page.getByRole("article", { name: "Invoice" });
  await ghost.getByText("Not created yet").waitFor();
  await ghost.getByRole("button", { name: "Aroma Coffee" }).waitFor();
  await ghost.getByRole("button", { name: "Create this note" }).click();
  assert.equal(await page.getByLabel("Title", { exact: true }).inputValue(), "Invoice");
  await page.getByRole("button", { name: "Cancel" }).click();

  // Editing: [[ lists titles; Enter inserts the link; Save sends the base version.
  await tree.getByRole("treeitem", { name: "Q4 pricing" }).click();
  await page.getByRole("article", { name: "Q4 pricing" }).getByRole("button", { name: "Edit" }).click();
  const text = page.getByLabel("Text", { exact: true });
  await text.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Approved by [[Bu");
  const suggestions = page.getByRole("listbox", { name: "Notes to link" });
  await suggestions.getByRole("option", { name: "Budi" }).waitFor();
  assert.equal(await text.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Enter");
  assert.equal(await text.inputValue(), "Prices rise 5%. Approved by [[Budi]]");
  await page.getByRole("button", { name: "Save note" }).click();
  await page.getByRole("status").filter({ hasText: "Saved “Q4 pricing”." }).waitFor();
  const put = memory.calls.filter((call) => call.method === "PUT").at(-1);
  assert.deepEqual(put.body, { folder: "decisions/2026", title: "Q4 pricing", text: "Prices rise 5%. Approved by [[Budi]]", base_version: 1 });

  // A stale editor is refused and offers the newer version instead of overwriting it.
  await page.getByRole("article", { name: "Q4 pricing" }).getByRole("button", { name: "Edit" }).click();
  memory.notes.get(3).version = 5;
  await page.getByRole("button", { name: "Save note" }).click();
  await page.getByRole("alert").filter({ hasText: "changed in another tab" }).waitFor();
  await page.getByRole("button", { name: "Load the newer version" }).click();
  await page.getByRole("status").filter({ hasText: "Loaded the newer version" }).waitFor();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Renaming a linked note offers to update the notes that link to it.
  await tree.getByRole("treeitem", { name: "Budi" }).click();
  await page.getByRole("article", { name: "Budi" }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Budi Santoso");
  await page.getByRole("button", { name: "Save note" }).click();
  // Aroma Coffee and Q4 pricing (edited above) both link to Budi.
  await page.getByText("2 notes still link to “Budi”.").waitFor();
  await page.getByRole("button", { name: "Update 2 notes" }).click();
  await page.getByRole("status").filter({ hasText: "Updated the links in 2 notes" }).waitFor();
  assert.deepEqual(memory.calls.find((call) => call.path.endsWith("/relink")).body, { from_folder: "people", from_title: "Budi" });

  // Facts live in the Facts folder with their own add form.
  await tree.getByRole("treeitem", { name: "About the business" }).click();
  const facts = page.getByRole("article", { name: "About the business" });
  await facts.getByText("We roast on Mondays.").waitFor();
  await facts.getByLabel("New fact about the business").fill("Deliveries arrive on Tuesdays.");
  await facts.getByRole("button", { name: "Add fact" }).click();
  await facts.getByText("Deliveries arrive on Tuesdays.").waitFor();
  assert.deepEqual(memory.calls.filter((call) => call.path === "/api/memory/entries").at(-1).body, { target: "business", fact: "Deliveries arrive on Tuesdays." });
  await tree.getByRole("treeitem", { name: "What the Operator reads" }).click();
  await page.getByText("Note saved (note 1)").waitFor();

  // Search covers facts and notes; a tag chip filters the tree.
  await page.getByLabel("Search memory").fill("prices");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const results = page.getByRole("region", { name: "Search results" });
  await results.getByText("Fact [1]").waitFor();
  await results.getByRole("button", { name: /Q4 pricing/ }).click();
  await page.getByRole("article", { name: "Q4 pricing" }).waitFor();
  await results.getByRole("button", { name: "Back to folders" }).click();
  await tree.getByRole("treeitem", { name: "Aroma Coffee" }).click();
  await page.getByRole("article", { name: "Aroma Coffee" }).getByRole("button", { name: "Show notes tagged supplier" }).first().click();
  assert.deepEqual((await tree.getByRole("treeitem").allInnerTexts()).map((t) => t.split("\n")[0]), ["suppliers", "Aroma Coffee"]);
  await page.getByRole("button", { name: "Show all notes" }).click();

  // Obsidian-style creation. New folder types a name straight into the tree, inside the open
  // note's folder (Aroma Coffee is open, so: suppliers).
  await page.getByRole("button", { name: "New folder" }).click();
  const folderName = tree.getByRole("textbox", { name: "Name for the new folder" });
  assert.equal(await folderName.inputValue(), "Untitled");
  assert.equal(await folderName.evaluate((input) => input.selectionEnd - input.selectionStart), "Untitled".length);
  await page.keyboard.type("Recipes");
  await page.keyboard.press("Enter");
  await page.getByRole("status").filter({ hasText: "Created the folder “Recipes”." }).waitFor();
  const recipes = tree.getByRole("treeitem", { name: /^Recipes/ });
  assert.equal(await recipes.getAttribute("aria-selected"), "true");
  assert.equal(await recipes.getAttribute("aria-level"), "2");
  // New note goes into the folder last clicked, and starts as "Untitled" too.
  await page.getByRole("button", { name: "New note" }).click();
  const noteName = tree.getByRole("textbox", { name: "Name for the new note" });
  assert.equal(await noteName.inputValue(), "Untitled");
  assert.equal(await noteName.evaluate((input) => input.closest("li").getAttribute("aria-level")), "3");
  // A refused name stays open with the reason, and nothing is sent.
  const posts = () => memory.calls.filter((call) => call.method === "POST" && call.path === "/api/memory/notes").length;
  const before = posts();
  await noteName.fill("Cold/brew");
  await noteName.press("Enter");
  await tree.getByRole("alert").filter({ hasText: "can't contain /" }).waitFor();
  assert.equal(posts(), before);
  await noteName.fill("Cold brew");
  await noteName.press("Enter");
  await page.getByRole("status").filter({ hasText: "Created “Cold brew”." }).waitFor();
  assert.deepEqual(memory.calls.filter((call) => call.method === "POST" && call.path === "/api/memory/notes").at(-1).body, { folder: "suppliers/Recipes", title: "Cold brew", text: "" });
  // The new note opens in the editor with the caret in its text, ready to write.
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label") ?? document.activeElement.id), await page.getByLabel("Text", { exact: true }).evaluate((element) => element.getAttribute("aria-label") ?? element.id));
  await page.getByRole("button", { name: "Cancel" }).click();
  await tree.getByRole("treeitem", { name: "Cold brew" }).waitFor();
  assert.deepEqual(memory.calls.find((call) => call.path === "/api/memory/folders").body, { folder: "suppliers/Recipes" });
  // A title taken in the same folder comes back from the server and is shown under the name.
  await page.getByRole("button", { name: "New note" }).click();
  await tree.getByRole("textbox", { name: "Name for the new note" }).fill("cold brew");
  await page.keyboard.press("Enter");
  await tree.getByRole("alert").filter({ hasText: "already in this folder" }).waitFor();
  await page.keyboard.press("Escape");

  // Right-click on a folder (or Shift+F10 on its row) offers New note and New folder there.
  await tree.getByRole("treeitem", { name: /^people/ }).click({ button: "right" });
  const menu = page.getByRole("menu", { name: "New in people" });
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "New note");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await menu.count(), 0);
  const nested = tree.getByRole("textbox", { name: "Name for the new folder" });
  assert.equal(await nested.evaluate((input) => input.closest("li").getAttribute("aria-level")), "2");
  await page.keyboard.press("Escape");
  assert.equal(await nested.count(), 0);
  await tree.getByRole("treeitem", { name: /^suppliers/ }).focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menu", { name: "New in suppliers" }).waitFor();
  await page.keyboard.press("Escape");
  assert.match(await page.evaluate(() => document.activeElement.textContent), /^suppliers/);
  // The Facts folder is made from facts, so it has no menu.
  await tree.getByRole("treeitem", { name: /^Facts/ }).click({ button: "right" });
  assert.equal(await page.getByRole("menu").count(), 0);
  // Right-click on the empty space below the rows makes things at the top level. New folders are
  // real folders in the vault, so an empty one is still there after a reload.
  const area = page.locator(".folder-tree-area");
  const box = await area.boundingBox();
  await area.click({ button: "right", position: { x: 20, y: box.height - 10 } });
  await page.getByRole("menu", { name: "New in the top level" }).waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await tree.getByRole("textbox", { name: "Name for the new folder" }).evaluate((input) => input.closest("li").getAttribute("aria-level")), "1");
  await page.keyboard.type("Ideas");
  await page.keyboard.press("Enter");
  await page.getByRole("status").filter({ hasText: "Created the folder “Ideas”." }).waitFor();
  assert.deepEqual(memory.calls.filter((call) => call.path === "/api/memory/folders").at(-1).body, { folder: "Ideas" });
  await page.getByRole("button", { name: "Collapse all" }).click();
  assert.equal(await tree.getByRole("treeitem", { name: "Cold brew" }).count(), 0);
  await page.reload();
  await tree.getByRole("treeitem", { name: /^Ideas/ }).waitFor();
  // Files the server couldn't show are listed, with the reason.
  await page.getByText("1 file in the vault not shown").click();
  await page.getByText("Larger than 400 KB.").waitFor();
  // A note whose file has a problem shows it, rather than being hidden.
  await tree.getByRole("treeitem", { name: "Q4 pricing" }).click();
  await page.getByRole("note").filter({ hasText: "not valid YAML" }).waitFor();
  await page.screenshot({ path: `${screenshots}/memory-explorer.png` });

  // Contrast of the small and muted text, in light and dark.
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    // Buttons animate their colours; measure once the theme change has finished.
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null))));
    await page.mouse.move(0, 0);
    for (const selector of [".tree-folder", ".tree-count", ".tree-row:hover .tree-count", ".note-path", ".note-meta", '.wikilink[data-ghost="true"]', ".note-markdown .wikilink:not([data-ghost])", ".note-markdown .tag-chip", ".note-mentions p"]) {
      const target = page.locator(selector).first();
      if (await target.count() === 0) continue;
      const value = contrast(...(await colours(target)));
      assert.ok(value >= 4.5, `${scheme} ${selector} contrast ${value.toFixed(2)}`);
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  assert.deepEqual(errors, []);
  await context.close();

  // Map: a fresh page, so the edits above don't change the graph.
  const map = await openMemory({ viewport: { width: 1440, height: 1000 } });
  const tabs = map.page.getByRole("tablist", { name: "Memory views" });
  await tabs.getByRole("tab", { name: "Folders" }).focus();
  await map.page.keyboard.press("ArrowRight");
  assert.equal(await tabs.getByRole("tab", { name: "Map" }).getAttribute("aria-selected"), "true");
  assert.equal(await map.page.evaluate(() => document.activeElement.textContent), "Map");
  await map.page.locator('.memory-map .map-world[data-ready="true"]').waitFor();
  const node = (id) => map.page.locator(`.graph-node[data-node="${id}"]`);
  const shownNodes = async () => (await map.page.locator(".graph-node").evaluateAll((nodes) => nodes.map((each) => each.dataset.node))).sort();
  const summary = map.page.locator("#memory-map-summary");
  assert.deepEqual(await shownNodes(), ["facts:business", "facts:owner", "ghost:invoice", "note:1", "note:2", "note:3"]);
  assert.equal(await summary.textContent(), "Showing 5 notes and 1 note not created yet, with 2 links. Most linked: Aroma Coffee (2 links), Budi (1 link). 3 notes link to nothing shown here.");
  assert.deepEqual(await map.page.getByRole("list", { name: "Legend" }).getByRole("listitem").allInnerTexts(),
    ["Facts", "decisions", "people", "suppliers", "Not created yet", "Bigger shapes have more links"]);
  // Size follows links; folders differ in shape as well as colour; ghosts are dashed.
  const width = async (id) => (await node(id).locator(".graph-shape").boundingBox()).width;
  assert.ok(await width("note:1") > await width("note:3"));
  const shapes = await map.page.locator(".graph-node:not([data-kind=ghost]) .graph-shape").evaluateAll((paths) => paths.map((path) => path.getAttribute("d").replace(/[-\d.,\s]/g, "")));
  assert.ok(new Set(shapes).size >= 3, "folders use different shapes");
  assert.notEqual(await node("ghost:invoice").locator(".graph-shape").evaluate((path) => getComputedStyle(path).strokeDasharray), "none");

  // Hover lights a note and its neighbours and dims the rest.
  await node("note:1").locator(".graph-shape").hover();
  assert.equal(await node("note:2").getAttribute("data-state"), "lit");
  assert.equal(await node("note:3").getAttribute("data-state"), "dim");
  await map.page.mouse.move(5, 5);
  assert.equal(await node("note:3").getAttribute("data-state"), null);

  // Filters: links to missing notes, notes with no links, a tag, a folder.
  const filters = map.page.getByRole("complementary", { name: "Map filters" });
  await filters.getByLabel("Links to notes not created yet").uncheck();
  assert.ok(!(await shownNodes()).includes("ghost:invoice"));
  await filters.getByLabel("Notes with no links").uncheck();
  assert.deepEqual(await shownNodes(), ["note:1", "note:2"]);
  await filters.getByRole("button", { name: "Reset filters" }).click();
  await filters.getByLabel("Tag").selectOption("supplier");
  assert.deepEqual(await shownNodes(), ["ghost:invoice", "note:1"]);
  await filters.getByLabel("Tag").selectOption("");
  await filters.getByRole("checkbox", { name: /^suppliers/ }).uncheck();
  assert.deepEqual(await shownNodes(), ["facts:business", "facts:owner", "note:2", "note:3"]);
  assert.ok(!(await map.page.getByRole("list", { name: "Legend" }).innerText()).includes("suppliers"));
  await filters.getByRole("button", { name: "Reset filters" }).click();
  assert.equal(await filters.getByLabel("Only notes near the open note").isDisabled(), true);

  // Pan and zoom like the agent map, remembered under the Memory map's own key.
  // A small graph fits at the 200% maximum, so zoom out to change the view.
  assert.equal(await map.page.getByRole("button", { name: "Zoom in" }).isDisabled(), true);
  await map.page.getByRole("button", { name: "Zoom out" }).click();
  await map.page.waitForFunction(() => Object.keys(localStorage).includes("mula.memory.view.memorycheck"));
  assert.ok(!(await map.page.evaluate(() => Object.keys(localStorage))).some((key) => key.startsWith("mula.team.view")));
  await map.page.getByRole("button", { name: "Fit to screen" }).click();
  await map.page.screenshot({ path: `${screenshots}/memory-map.png` });

  // Selecting a note opens it in Folders, with focus on the Folders tab.
  await node("note:2").locator(".graph-shape").click();
  await map.page.getByRole("article", { name: "Budi" }).waitFor();
  assert.equal(await map.page.evaluate(() => document.activeElement.textContent), "Folders");
  // The local graph centres on it: 1 link reaches Aroma, 2 reach Aroma's missing Invoice too.
  await tabs.getByRole("tab", { name: "Map" }).click();
  await filters.getByText("Centred on Budi.").waitFor();
  assert.equal(await node("note:2").getAttribute("data-focus"), "true");
  await filters.getByLabel("Only notes near the open note").check();
  assert.deepEqual(await shownNodes(), ["note:1", "note:2"]);
  await filters.getByLabel("Reach").selectOption("2");
  assert.deepEqual(await shownNodes(), ["ghost:invoice", "note:1", "note:2"]);
  // The filters are kept across a trip to Folders and back.
  await tabs.getByRole("tab", { name: "Folders" }).click();
  await tabs.getByRole("tab", { name: "Map" }).click();
  assert.deepEqual(await shownNodes(), ["ghost:invoice", "note:1", "note:2"]);
  await filters.getByRole("button", { name: "Reset filters" }).click();

  // The text version: every note with its links both ways, and a keyboard route to open each one.
  await map.page.getByText("The map as a list", { exact: true }).click();
  const list = map.page.locator(".graph-text li", { has: map.page.getByRole("button", { name: "Budi", exact: true }) });
  assert.match(await list.innerText(), /people[\s\S]*Linked from Aroma Coffee/);
  await list.getByRole("button", { name: "Budi", exact: true }).focus();
  assert.equal(await node("note:1").getAttribute("data-state"), "lit");
  await map.page.keyboard.press("Enter");
  await map.page.getByRole("article", { name: "Budi" }).waitFor();
  await tabs.getByRole("tab", { name: "Map" }).click();

  // Contrast: shapes 3:1 and labels 4.5:1 against the map, in both themes.
  for (const scheme of ["light", "dark"]) {
    await map.page.emulateMedia({ colorScheme: scheme });
    await map.page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null))));
    const surface = await map.page.locator(".memory-map").evaluate((element) => getComputedStyle(element).backgroundColor);
    const fills = await map.page.locator(".graph-node:not([data-kind=ghost]) .graph-shape").evaluateAll((paths) => paths.map((path) => getComputedStyle(path).fill));
    for (const fill of new Set(fills)) assert.ok(contrast(fill, surface) >= 3, `${scheme} shape ${fill} contrast ${contrast(fill, surface).toFixed(2)}`);
    for (const label of [".graph-node:not([data-kind=ghost]) .graph-label", ".graph-node[data-kind=ghost] .graph-label"]) {
      const fill = await map.page.locator(label).first().evaluate((element) => getComputedStyle(element).fill);
      assert.ok(contrast(fill, surface) >= 4.5, `${scheme} ${label} contrast ${contrast(fill, surface).toFixed(2)}`);
    }
  }
  await map.page.emulateMedia({ colorScheme: "light" });
  assert.deepEqual(map.errors, []);
  await map.context.close();

  // Phone: the folders are a drawer; picking a note closes it; nothing scrolls sideways.
  const phone = await openMemory({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const drawerButton = phone.page.getByRole("button", { name: "Folders", exact: true });
  assert.equal(await phone.page.getByRole("tree").isVisible(), false);
  await drawerButton.click();
  assert.equal(await drawerButton.getAttribute("aria-expanded"), "true");
  assert.equal(await phone.page.evaluate(() => document.activeElement.id), "memory-question");
  await phone.page.getByRole("treeitem", { name: "Aroma Coffee" }).click();
  await phone.page.getByRole("article", { name: "Aroma Coffee" }).waitFor();
  assert.equal(await drawerButton.getAttribute("aria-expanded"), "false");
  await drawerButton.click();
  await phone.page.keyboard.press("Escape");
  assert.equal(await phone.page.evaluate(() => document.activeElement.textContent), "Folders");
  assert.ok((await phone.page.evaluate(() => document.documentElement.scrollWidth)) <= 390, "no horizontal overflow");
  await phone.page.screenshot({ path: `${screenshots}/memory-phone.png`, fullPage: true });
  // On a phone the map only pans and zooms; its filters are a sheet that Escape closes.
  await phone.page.getByRole("tab", { name: "Map" }).click();
  await phone.page.locator('.memory-map .map-world[data-ready="true"]').waitFor();
  const filtersButton = phone.page.getByRole("button", { name: "Filters", exact: true });
  assert.equal(await phone.page.getByLabel("Notes with no links").isVisible(), false);
  await filtersButton.click();
  assert.equal(await phone.page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Close filters");
  await phone.page.getByLabel("Notes with no links").uncheck();
  await phone.page.keyboard.press("Escape");
  assert.equal(await filtersButton.getAttribute("aria-expanded"), "false");
  assert.equal(await phone.page.evaluate(() => document.activeElement.textContent), "Filters");
  // A tap doesn't hover; it opens the note.
  await phone.page.locator('.graph-node[data-node="note:1"] .graph-shape').tap();
  await phone.page.getByRole("article", { name: "Aroma Coffee" }).waitFor();
  await phone.page.getByRole("tab", { name: "Map" }).click();
  assert.ok((await phone.page.evaluate(() => document.documentElement.scrollWidth)) <= 390, "no horizontal overflow on the map");
  await phone.page.screenshot({ path: `${screenshots}/memory-map-phone.png` });
  assert.deepEqual(phone.errors, []);
  await phone.context.close();
  console.log("Memory page browser check passed: tree and keys, reading, links and ghosts, mentions, editor and [[ completion, stale save, rename and relink, facts, search, tags, new notes and folders (inline names, right-click menu, real folders), skipped files and warnings, map (shapes, hover, filters, local graph, saved view, text version), contrast and phone drawer and sheet.");
} finally {
  await browser.close();
}
