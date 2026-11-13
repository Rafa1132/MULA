import assert from "node:assert/strict";
import test from "node:test";
import { LiveConversation } from "../services/liveConversation.ts";
import { StreamingSpeech } from "../services/streamingSpeech.ts";

const tick = () => new Promise(resolve => setImmediate(resolve));
const pause = () => new Promise(resolve => setTimeout(resolve, 15));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function setup(send, playerOverrides = {}) {
  const engines = [];
  const states = [];
  const errors = [];
  const spoken = [];
  let aborts = 0;
  class Recognition {
    start() { engines.push(this); this.onstart?.(); }
    stop() { this.onend?.(); }
    abort() { this.aborted = true; this.onend?.(); }
  }
  const player = { async unlock() {}, async speak(text) { spoken.push(text); }, stop() {}, ...playerOverrides };
  const live = new LiveConversation(Recognition, {
    player, send, abort: () => { aborts += 1; }, state: value => states.push(value), transcript() {},
    error: value => errors.push(value), pauseMs: 5,
  });
  function say(text) {
    engines.at(-1).onresult({ results: [Object.assign([{ transcript: text }], { isFinal: true })] });
  }
  return { live, engines, states, errors, spoken, say, aborts: () => aborts };
}

test("speech starts before model completion, and listening resumes only after output drains", async () => {
  const model = deferred();
  const playback = deferred();
  const spoken = [];
  const harness = setup(async (text, token) => {
    assert.equal(text, "Help my cafe");
    token("Here is a plan. ");
    return model.promise;
  }, { speak: async text => { spoken.push(text); await playback.promise; }, stop: () => playback.resolve() });
  await harness.live.start("en-US");
  harness.say("Help my cafe");
  await pause();
  assert.deepEqual(spoken, ["Here is a plan."]);
  assert.equal(harness.engines.length, 1);
  model.resolve(true);
  await tick();
  assert.equal(harness.engines.length, 1, "do not listen to the AI's audio");
  playback.resolve();
  await tick();await tick();
  assert.equal(harness.engines.length, 2);
  assert.equal(harness.states.at(-1), "listening");
  harness.live.stop();
});

test("interrupt aborts a turn and late model completion cannot restart or end the new listener", async () => {
  const model = deferred();
  let lateToken;
  const harness = setup(async (_text, token) => { lateToken = token; return model.promise; });
  await harness.live.start("id-ID");
  harness.say("Halo");await pause();
  harness.live.interrupt();
  assert.equal(harness.aborts(), 1);
  assert.equal(harness.engines.length, 2);
  lateToken("This must not be spoken. ");
  model.resolve(true);
  await tick();await tick();
  assert.deepEqual(harness.spoken, []);
  assert.equal(harness.engines.length, 2);
  assert.equal(harness.states.at(-1), "listening");
  harness.live.stop();
});

test("ending a session cancels pending automatic submission", async () => {
  let sends = 0;
  const harness = setup(async () => { sends += 1; return true; });
  await harness.live.start("en-US");
  harness.say("Wait, let me think");
  harness.live.stop();
  await pause();
  assert.equal(sends, 0);
  assert.equal(harness.states.at(-1), "off");
});

test("existing typed text is not submitted without hearing speech", async () => {
  let sends = 0;
  const harness = setup(async () => { sends += 1; return true; });
  await harness.live.start("en-US", "Private unsent draft");
  await pause();
  assert.equal(sends, 0);
  harness.engines[0].onend();
  assert.equal(sends, 0);
  assert.equal(harness.live.isActive(), false);
});

test("permission and TTS failures end live mode instead of looping", async () => {
  const harness = setup(async (_text, token) => { token("Hello. "); return true; }, {
    async speak() { throw new Error("Speech backend is unavailable"); },
  });
  await harness.live.start("en-US");
  harness.say("Hello");await pause();await tick();
  assert.equal(harness.live.isActive(), false);
  assert.match(harness.errors.at(-1), /backend is unavailable/);
  assert.equal(harness.engines.length, 1);
  await harness.live.start("en-US");
  harness.engines.at(-1).onerror({ error: "not-allowed" });
  assert.equal(harness.live.isActive(), false);
  assert.match(harness.errors.at(-1), /permission was denied/);
});

test("streamed speech skips fenced code, handles split tokens and flushes the final sentence", async () => {
  const spoken = [];
  const queue = new StreamingSpeech({ speak: async text => spoken.push(text), stop() {} }, error => { throw error; });
  for (const token of ["The total is ", "30.", " ", "```python\nprint('Do not speak. ')\n", "```\n", "Next step: review it"]) queue.push(token);
  await queue.finish();
  assert.deepEqual(spoken, ["The total is 30.", "Next step: review it"]);
});

test("cancelling speech drops queued and future segments", async () => {
  const playing = deferred();
  const spoken = [];
  const queue = new StreamingSpeech({ speak: async text => { spoken.push(text); await playing.promise; }, stop: () => playing.resolve() }, () => {});
  queue.push("First sentence. Second sentence. ");
  queue.cancel();
  queue.push("Late sentence. ");
  await queue.finish();await tick();
  assert.deepEqual(spoken, ["First sentence."]);
});
