import assert from "node:assert/strict";
import test from "node:test";
import { isPreparing, orbSizeFor, orbStateFor, presenceFor, readMuted, writeMuted } from "../services/chat.ts";

const QUIET = { busy: false, voice: "idle", dictation: "idle", live: "off" };

test("the status line says what is happening, with live audio outranking a reply on its way", () => {
  assert.equal(presenceFor(QUIET), "Ready when you are");
  assert.equal(presenceFor({ ...QUIET, busy: true }), "Thinking…");
  assert.equal(presenceFor({ ...QUIET, busy: true, voice: "speaking" }), "Speaking…");
  assert.equal(presenceFor({ ...QUIET, dictation: "listening" }), "Listening…");
  assert.equal(presenceFor({ ...QUIET, busy: true, live: "listening" }), "Listening · pause to send");
});

test("the orb speaks with its voice, listens to the owner, and thinks while a reply is coming", () => {
  assert.equal(orbStateFor(QUIET), "idle");
  assert.equal(orbStateFor({ ...QUIET, busy: true }), "thinking");
  assert.equal(orbStateFor({ ...QUIET, voice: "preparing" }), "thinking");
  assert.equal(orbStateFor({ ...QUIET, live: "responding" }), "thinking");
  assert.equal(orbStateFor({ ...QUIET, dictation: "listening" }), "listening");
  assert.equal(orbStateFor({ ...QUIET, live: "listening", busy: true }), "listening");
  assert.equal(orbStateFor({ ...QUIET, voice: "speaking", busy: true, dictation: "listening" }), "speaking");
});

test("the status line shimmers only while something is being prepared", () => {
  assert.equal(isPreparing(QUIET), false);
  assert.equal(isPreparing({ ...QUIET, voice: "speaking" }), false);
  assert.equal(isPreparing({ ...QUIET, busy: true }), true);
  assert.equal(isPreparing({ ...QUIET, dictation: "starting" }), true);
});

test("the orb is about half a phone's width, at most 30% of the height, between 160 and 300 px", () => {
  assert.equal(orbSizeFor(375, 2000), 195);
  assert.equal(orbSizeFor(200, 2000), 160);
  assert.equal(orbSizeFor(1440, 2000), 300);
  assert.equal(orbSizeFor(1440, 700), 210);
  assert.equal(orbSizeFor(1440, 600), 180, "a common short laptop window keeps the 30% rule");
  assert.equal(orbSizeFor(1440, 530), 150, "under ~540 px the orb gives up the room the composer needs");
  assert.equal(orbSizeFor(1440, 480), 100);
  assert.equal(orbSizeFor(812, 375), 64, "a phone held sideways gets the badge size");
  assert.equal(orbSizeFor(1440, 300), 64, "never smaller than the 64 px badge");
  assert.equal(orbSizeFor(0, 900), 220);
  assert.equal(orbSizeFor(Number.NaN, 900), 220);
  assert.equal(orbSizeFor(1440, 900, true), 64, "a compact badge when the chat is expanded");
});

test("the voice preference uses the project chat's key and survives missing or blocked storage", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readMuted(storage), false);
  assert.equal(writeMuted(storage, true), true);
  assert.equal(values.get("mula.voice-muted"), "true");
  assert.equal(readMuted(storage), true);
  const blocked = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } };
  assert.equal(readMuted(blocked), false);
  assert.equal(writeMuted(blocked, true), false);
  assert.equal(readMuted(null), false);
  assert.equal(writeMuted(null, true), false);
});
