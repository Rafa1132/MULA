import assert from "node:assert/strict";
import test from "node:test";
import { BACKEND_URL, zedSettings } from "../services/clientAccess.ts";

test("the editor settings name the bridge and pass the key only in the environment", () => {
  const settings = JSON.parse(zedSettings("Operator", "mula_acp_secret"));
  const server = settings.agent_servers["Mula Operator"];
  assert.equal(server.command, "/path/to/LARAS/server/.venv/bin/python");
  assert.deepEqual(server.args, ["/path/to/LARAS/server/scripts/mula_acp.py"]);
  assert.deepEqual(server.env, { MULA_URL: BACKEND_URL, MULA_CLIENT_KEY: "mula_acp_secret" });
  assert.ok(!server.args.join(" ").includes("mula_acp_secret"));
});
