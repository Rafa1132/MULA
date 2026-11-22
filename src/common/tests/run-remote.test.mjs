import assert from "node:assert/strict";
import test from "node:test";
import { checkRemoteUrl, DEFAULT_REMOTE_URL, parseArgs } from "../../../scripts/run-remote.mjs";

test("the backend must be HTTPS, except this computer", () => {
  assert.equal(checkRemoteUrl(DEFAULT_REMOTE_URL), DEFAULT_REMOTE_URL);
  assert.equal(checkRemoteUrl(" https://mula.example.com/ "), "https://mula.example.com");
  assert.equal(checkRemoteUrl("https://mula.example.com:8443"), "https://mula.example.com:8443");
  assert.equal(checkRemoteUrl("http://127.0.0.1:8000"), "http://127.0.0.1:8000");
  for (const bad of ["http://mula.example.com", "https://mula.example.com/api", "https://user@host", "ftp://x", "https://", "mula.example.com"]) {
    assert.throws(() => checkRemoteUrl(bad), /must be https/, bad);
  }
});

test("only --no-open and --help are accepted", () => {
  assert.deepEqual(parseArgs([]), { open: true, help: false });
  assert.deepEqual(parseArgs(["--no-open"]), { open: false, help: false });
  assert.equal(parseArgs(["-h"]).help, true);
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
});
