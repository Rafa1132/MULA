import assert from "node:assert/strict";
import test from "node:test";
import { currentProjectId, isProjectId, projectFetch, projectIdFrom, projectPath } from "../services/project.ts";

const PROJECT = "11111111-2222-4333-8444-555555555555";

test("the project comes from the page URL, and only a well-formed id counts", () => {
  assert.equal(projectIdFrom(`/projects/${PROJECT}`), PROJECT);
  assert.equal(projectIdFrom(`/projects/${PROJECT}/memory`), PROJECT);
  assert.equal(projectIdFrom("/projects/not-an-id/memory"), null);
  assert.equal(projectIdFrom("/memory"), null);
  assert.equal(isProjectId(PROJECT), true);
  assert.equal(isProjectId(""), false);
});

test("links inside a project keep the project", () => {
  assert.equal(projectPath(PROJECT), `/projects/${PROJECT}`);
  assert.equal(projectPath(PROJECT, "/"), `/projects/${PROJECT}`);
  assert.equal(projectPath(PROJECT, "/catalogue/todo#plugins"), `/projects/${PROJECT}/catalogue/todo#plugins`);
});

test("project calls carry the page's project, and keep their own headers", async (context) => {
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url, options) => { calls.push([url, options]); return Response.json({}); });
  globalThis.window = { location: { pathname: `/projects/${PROJECT}/memory` } };
  try {
    assert.equal(currentProjectId(), PROJECT);
    await projectFetch("/api/memory/notes", { method: "POST", headers: { "Content-Type": "application/json" } });
    assert.equal(calls[0][1].headers.get("X-Mula-Project"), PROJECT);
    assert.equal(calls[0][1].headers.get("Content-Type"), "application/json");
    assert.equal(calls[0][1].method, "POST");
    // Outside a project page nothing is added; the server then says to open a project.
    globalThis.window = { location: { pathname: "/workspace" } };
    await projectFetch("/api/memory");
    assert.equal(calls[1][1].headers.get("X-Mula-Project"), null);
  } finally {
    delete globalThis.window;
  }
});
