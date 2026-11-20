import assert from "node:assert/strict";
import test from "node:test";
import { voiceOrbState } from "../services/voiceOrb.ts";
import { ORB_PALETTES, paletteStops } from "../voice/params.ts";
import { AnalyserLevels, SimulatedVoice } from "../voice/audio.ts";
import { cssColor, resolveColor } from "../voice/renderer.ts";

test("Mula's four orb states map onto the voice orb's", () => {
  assert.equal(voiceOrbState("idle"), "ready");
  assert.equal(voiceOrbState("listening"), "listening");
  assert.equal(voiceOrbState("thinking"), "connecting");
  assert.equal(voiceOrbState("speaking"), "talking");
  assert.equal(voiceOrbState("unknown"), "ready");
});

test("the orchestrator's mint palette comes from the agent art tokens", () => {
  assert.deepEqual(paletteStops("mint"), ["#2fa878", "#7ae8b4", "#d5fbe9", "#c4fff1"]);
  assert.deepEqual(paletteStops("nope"), ORB_PALETTES[0].stops);
  for (const palette of ORB_PALETTES) assert.equal(palette.stops.length, 4);
});

test("colours resolve to 0–1 components", () => {
  assert.deepEqual(resolveColor("#ffffff"), [1, 1, 1]);
  assert.deepEqual(resolveColor("#000"), [0, 0, 0]);
  assert.deepEqual(resolveColor("rgb(255, 0, 0)"), [1, 0, 0]);
  assert.equal(cssColor("--mint"), "var(--mint)");
  assert.equal(cssColor("#7ae8b4"), "#7ae8b4");
});

test("a simulated voice stays in range and moves", () => {
  const voice = new SimulatedVoice(1, 0.8);
  const levels = [];
  for (let i = 0; i < 240; i++) {
    const read = voice.read(1 / 60);
    for (const band of read.bands) assert.ok(band >= 0 && band <= 1, `band ${band}`);
    levels.push(read.level);
  }
  assert.ok(Math.max(...levels) > 0.1);
  assert.ok(Math.max(...levels) - Math.min(...levels) > 0.1);
});

/** A stand-in AnalyserNode whose spectrum is silent, or loud in one band. */
function fakeAnalyser(loudFrom, loudTo) {
  const fftSize = 1024;
  const sampleRate = 48_000;
  let loud = false;
  return {
    analyser: {
      fftSize, frequencyBinCount: fftSize / 2, context: { sampleRate },
      getFloatFrequencyData(data) {
        const hzPerBin = sampleRate / fftSize;
        for (let i = 0; i < data.length; i++) {
          const hz = i * hzPerBin;
          let db = -110;
          if (loud && hz >= loudFrom && hz < loudTo) db = -30;
          data[i] = db;
        }
      },
    },
    setLoud(value) { loud = value; },
  };
}

test("analyser levels calibrate to the voice: silence reads low, a loud low mid rises", () => {
  const fake = fakeAnalyser(400, 1000);
  const levels = new AnalyserLevels(fake.analyser);
  let read;
  for (let i = 0; i < 30; i++) read = levels.read(1 / 60);
  assert.ok(read.level < 0.05, `silent level ${read.level}`);
  fake.setLoud(true);
  for (let i = 0; i < 30; i++) read = levels.read(1 / 60);
  assert.ok(read.bands[1] > 0.8, `low mid ${read.bands[1]}`);
  assert.ok(read.bands[1] > read.bands[3]);
});
