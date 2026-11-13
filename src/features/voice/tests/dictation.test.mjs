import assert from "node:assert/strict";
import test from "node:test";
import { Dictation, appendDictation } from "../services/dictation.ts";

function setup() {
  const engines = [];
  class FakeRecognition {
    onstart = null; onend = null; onresult = null; onerror = null;
    start() { engines.push(this); }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
  }
  const events = { states: [], text: [], interim: [], errors: [] };
  const dictation = new Dictation(FakeRecognition, {
    state: value => events.states.push(value), text: value => events.text.push(value),
    interim: value => events.interim.push(value), error: value => events.errors.push(value),
  });
  return { dictation, engines, events };
}
const result = (text, final) => Object.assign([{ transcript: text }], { isFinal: final });

test("cumulative final results are committed once; interim revisions stay separate", () => {
  const { dictation, engines, events } = setup();
  dictation.start("id-ID");
  const engine = engines[0];
  assert.equal(engine.lang, "id-ID");
  engine.onstart();
  engine.onresult({ results: [result("Halo", true), result("kedai", false)] });
  engine.onresult({ results: [result("Halo", true), result("kedai kopi", false)] });
  engine.onresult({ results: [result("Halo", true), result("kedai kopi", true)] });
  assert.deepEqual(events.text, ["Halo", "kedai kopi"]);
  assert.equal(events.interim.at(-1), "");
  dictation.cancel();
});

test("stopping allows the final result, then ends without restarting", () => {
  const { dictation, engines, events } = setup();
  dictation.start("en-US");
  const engine = engines[0];engine.onstart();
  dictation.stop();
  assert.equal(events.states.at(-1), "stopping");
  engine.onresult({ results: [result("A final thought", true)] });
  engine.onend();
  assert.deepEqual(events.text, ["A final thought"]);
  assert.equal(events.states.at(-1), "idle");
  assert.equal(engines.length, 1);
});

test("cancel ignores late results and keeps sessions isolated", () => {
  const { dictation, engines, events } = setup();
  dictation.start("en-US");
  const late = engines[0].onresult;
  dictation.cancel();
  assert.equal(engines[0].aborted, true);
  dictation.start("id-ID");
  late({ results: [result("Do not add this", true)] });
  engines[1].onresult({ results: [result("New session", true)] });
  assert.deepEqual(events.text, ["New session"]);
  dictation.cancel();
});

test("microphone permission and service errors are actionable and end recording", () => {
  for (const error of ["not-allowed", "audio-capture", "network", "no-speech"]) {
    const { dictation, engines, events } = setup();
    dictation.start("en-US");
    engines[0].onerror({ error });
    assert.equal(events.states.at(-1), "idle");
    assert.ok(events.errors.at(-1).length > 20);
    assert.equal(engines[0].aborted, true);
  }
});

test("a delayed permission grant after cancellation aborts the old microphone", () => {
  const { dictation, engines, events } = setup();
  dictation.start("en-US");
  const engine = engines[0];
  dictation.cancel();
  engine.aborted = false;
  engine.onstart();
  assert.equal(engine.aborted, true);
  assert.equal(events.states.at(-1), "idle");
});

test("speech appends to the latest edited draft and bounds Unicode text", () => {
  assert.equal(appendDictation("My edited idea:", "open a cafe").text, "My edited idea: open a cafe");
  assert.equal(appendDictation("Hello\n", "there").text, "Hello\nthere");
  const capped = appendDictation("a".repeat(7998), "😀 more");
  assert.equal(capped.text.isWellFormed(), true);
  assert.equal(capped.truncated, true);
  assert.ok(capped.text.length <= 8000);
});

test("synchronous startup failures do not leave a stuck microphone", () => {
  const events = [];
  class Broken {
    start() { throw new Error("Permission"); }
    abort() {}
  }
  const dictation = new Dictation(Broken, { state: value => events.push(value), text() {}, interim() {}, error() {} });
  dictation.start("en-US");
  assert.equal(events.at(-1), "idle");
});
