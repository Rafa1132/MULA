/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 * Adapted for Mula: conditional expressions written as if/else; the element, microphone and tab-audio helpers are left out (Mula's chat passes its own AnalyserNode); constructor parameter properties as plain fields.
 */

"use client";

/**
 * Where an orb hears a voice: four bands and an overall level, read once per
 * frame by the orb.
 *
 * Bands, by frequency: bass (90-350 Hz), low mid (350 Hz-1.1 kHz), high mid
 * (1.1-2.8 kHz) and treble (2.8-7 kHz). The edges sit where a call carries
 * speech: telephone audio has little below 300 Hz, so a classic 80-250 Hz bass
 * band would mostly measure line hum. Each follows the voice with a fast attack
 * and a slow release, so a syllable lands at once and its tail fades rather
 * than flickering.
 *
 * Levels calibrate themselves. A recording, a microphone and a live call all
 * arrive at different loudness, and a fixed scale either pins loud speech at
 * the top or leaves quiet speech at the bottom. So each band reads the
 * spectrum in decibels over a wide range (nothing clips), then scales between
 * its own recent quiet floor and loud peak: the floor drops at once to any
 * silence and creeps up slowly, the peak jumps to any loud moment and sinks
 * slowly. What reaches the orb is the voice's rise and fall at any level.
 *
 * Sources:
 *   AnalyserLevels   any Web Audio AnalyserNode (in Mula, the chat's speech
 *                    playback analyser)
 *   SimulatedVoice   a synthetic speech envelope, for an orb that is talking
 *                    with no analyser to read
 */

export type Bands = [number, number, number, number];

export interface OrbLevels {
  bands: Bands;
  level: number;
}

export interface LevelSource {
  read(dt: number): OrbLevels;
  /**
   * A second reader of the same voice. A source keeps its own envelope and
   * clock, so two orbs reading one source would each advance it; give the
   * second orb a twin instead.
   */
  twin?(): LevelSource;
}

const EDGES = [90, 350, 1100, 2800, 7000];
/* The decibel window a band is read in before calibration: wide enough that
   speech never clips at the top. */
const DB_LOW = -95;
const DB_HIGH = -20;
/* How fast the calibration moves, per second: the peak sinks, the floor rises.
   The floor drops at once in every gap between syllables, so rising fairly
   quickly the rest of the time makes it track the background, not the voice. */
const PEAK_FALL = 0.05;
const FLOOR_RISE = 0.15;
/* The smallest span between floor and peak: below it, room tone would be
   stretched into a voice. */
const MIN_SPAN = 0.14;

const ATTACK = 28;
const RELEASE = 8;

function follow(current: number, target: number, dt: number) {
  let rate = RELEASE;
  if (target > current) rate = ATTACK;
  return current + (target - current) * (1 - Math.exp(-dt * rate));
}

const levelOf = (b: Bands) => Math.min(1, b[0] * 0.32 + b[1] * 0.36 + b[2] * 0.22 + b[3] * 0.1);

export class AnalyserLevels implements LevelSource {
  private data: Float32Array<ArrayBuffer> | null = null;
  private env: Bands = [0, 0, 0, 0];
  private floor: Bands = [1, 1, 1, 1];
  private peak: Bands = [0, 0, 0, 0];
  private analyser: AnalyserNode;

  constructor(analyser: AnalyserNode) {
    this.analyser = analyser;
  }

  twin(): LevelSource {
    return new AnalyserLevels(this.analyser);
  }

  read(dt: number): OrbLevels {
    const a = this.analyser;
    const step = dt || 1 / 60;
    if (!this.data || this.data.length !== a.frequencyBinCount) {
      this.data = new Float32Array(a.frequencyBinCount);
    }
    a.getFloatFrequencyData(this.data);
    const hzPerBin = a.context.sampleRate / a.fftSize;
    for (let band = 0; band < 4; band++) {
      const from = Math.max(1, Math.floor(EDGES[band] / hzPerBin));
      const to = Math.min(this.data.length, Math.ceil(EDGES[band + 1] / hzPerBin));
      // Average the band's power, not its decibels, then back to decibels.
      let power = 0;
      for (let i = from; i < to; i++) {
        const db = this.data[i];
        if (Number.isFinite(db)) power += Math.pow(10, db / 10);
      }
      let db = DB_LOW;
      if (to > from && power > 0) db = 10 * Math.log10(power / (to - from));
      const raw = Math.min(1, Math.max(0, (db - DB_LOW) / (DB_HIGH - DB_LOW)));

      this.floor[band] = Math.min(raw, this.floor[band] + FLOOR_RISE * step);
      this.peak[band] = Math.max(raw, this.peak[band] - PEAK_FALL * step);
      const span = Math.max(this.peak[band] - this.floor[band], MIN_SPAN);
      const value = Math.pow(Math.min(1, Math.max(0, (raw - this.floor[band]) / span)), 1.8);
      this.env[band] = follow(this.env[band], value, step);
    }
    return { bands: [...this.env] as Bands, level: levelOf(this.env) };
  }
}

/* ---------- a synthetic voice ---------- */

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1D noise, 0..1. */
function noise(t: number) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

/**
 * Speech, roughly: syllables at four to six a second, grouped into phrases of
 * one and a half to three seconds with short pauses between, louder at the
 * start of a phrase. The bands take the envelope at different weights, with
 * treble only on some syllables (the sibilants). Deterministic per seed, so
 * the board's cards each speak their own way, the same way on every visit.
 */
export class SimulatedVoice implements LevelSource {
  private t: number;
  private env: Bands = [0, 0, 0, 0];
  private seed: number;
  private loudness: number;

  constructor(seed = 1, loudness = 1) {
    this.seed = seed;
    this.loudness = loudness;
    this.t = seed * 7.31;
  }

  /** The same voice from the same moment, so the two stay in step. */
  twin(): LevelSource {
    const copy = new SimulatedVoice(this.seed, this.loudness);
    copy.t = this.t;
    copy.env = [...this.env] as Bands;
    return copy;
  }

  read(dt: number): OrbLevels {
    this.t += dt || 1 / 60;
    const t = this.t;
    const s = this.seed * 19.7;
    // Phrase gate: on for most of each ~2.6s cycle, with a varying pause.
    const cycle = 2.6 + noise(Math.floor(t / 2.6) + s) * 0.8;
    const phase = (t % cycle) / cycle;
    const gate = smooth(0.0, 0.06, phase) * (1 - smooth(0.68 + noise(t * 0.3 + s) * 0.18, 0.86, phase));
    // Syllables.
    const rate = 4.6 + noise(t * 0.5 + s) * 1.6;
    const syllable = Math.pow(Math.max(0, Math.sin(t * rate * Math.PI * 2 + noise(t + s) * 2)), 1.6);
    const stress = 0.65 + 0.35 * noise(t * 2.2 + s * 2) * (1.2 - phase);
    const envelope = Math.min(1, gate * syllable * stress * this.loudness * 2.0);
    let sibilant = 0.25;
    if (noise(t * 6 + s * 3) > 0.62) sibilant = 1;
    const target: Bands = [
      envelope * (0.75 + 0.25 * noise(t * 3 + s)),
      envelope * (0.8 + 0.2 * noise(t * 5 + s + 4)),
      envelope * (0.45 + 0.35 * noise(t * 7 + s + 9)),
      envelope * 0.9 * sibilant,
    ];
    for (let band = 0; band < 4; band++) this.env[band] = follow(this.env[band], target[band], dt || 1 / 60);
    return { bands: [...this.env] as Bands, level: levelOf(this.env) };
  }
}

function smooth(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
