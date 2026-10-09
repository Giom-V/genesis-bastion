/**
 * @file src/utils/math.js
 * @description Deterministic PRNG, 2D Simplex/Perlin gradient noise, Fractal Brownian
 * Motion (FBM), and spatial math utilities for Genesis Bastion.
 *
 * Used by:
 * - `src/world/Terrain.js` for island elevation, volcanic caldera shaping, and biome masks
 * - `src/ecosystem/*` for reproducible genetic drift, crossover, and spatial distance queries
 * - `src/entities/*` for steering vectors, patrol rings, and combat hit arcs
 */

/**
 * Deterministic Mulberry32-based Seeded Random Number Generator.
 * Supports uniform floats, ranges, integers, Gaussian (Box-Muller) sampling,
 * and weighted selection for Darwinian fitness-proportional reproduction.
 */
export class SeededRNG {
  /**
   * @param {number} [seed=133742] - Initial integer seed.
   */
  constructor(seed = 133742) {
    this.seed = (seed >>> 0) || 133742;
  }

  /**
   * Returns a pseudo-random float in [0, 1).
   * @returns {number}
   */
  next() {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a float in [min, max).
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /**
   * Returns an integer in [min, max] inclusive.
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Returns true with probability `p` in [0, 1].
   * @param {number} p
   * @returns {boolean}
   */
  chance(p) {
    return this.next() < p;
  }

  /**
   * Picks a random element from a non-empty array.
   * @template T
   * @param {T[]} arr
   * @returns {T}
   */
  pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * Returns a standard normal (Gaussian) random variable with mean 0 and stdDev 1,
   * scaled by `stdDev` and shifted by `mean`.
   * @param {number} [mean=0]
   * @param {number} [stdDev=1]
   * @returns {number}
   */
  gaussian(mean = 0, stdDev = 1) {
    const u1 = Math.max(1e-7, this.next());
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  /**
   * Creates a bound function `() => rng.next()` compatible with `Math.random` signature.
   * @returns {() => number}
   */
  asFunction() {
    return () => this.next();
  }
}

// Precomputed permutation table for fast, deterministic 2D gradient noise
const PERM = new Uint8Array(512);
const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

(function initNoiseTable() {
  const rng = new SeededRNG(987654321);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
  }
})();

/**
 * Quintic fade curve 6t^5 - 15t^4 + 10t^3 for smooth C2 continuous noise derivatives.
 * @param {number} t
 * @returns {number}
 */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Computes deterministic 2D Perlin gradient noise in the range [-1, 1].
 * @param {number} x - X coordinate.
 * @param {number} z - Z coordinate.
 * @returns {number} Noise value in [-1, 1].
 */
export function noise2D(x, z) {
  const X = Math.floor(x) & 255;
  const Z = Math.floor(z) & 255;

  const xf = x - Math.floor(x);
  const zf = z - Math.floor(z);

  const u = fade(xf);
  const v = fade(zf);

  const aa = PERM[PERM[X] + Z] & 7;
  const ab = PERM[PERM[X] + Z + 1] & 7;
  const ba = PERM[PERM[X + 1] + Z] & 7;
  const bb = PERM[PERM[X + 1] + Z + 1] & 7;

  const gAA = GRAD2[aa][0] * xf + GRAD2[aa][1] * zf;
  const gBA = GRAD2[ba][0] * (xf - 1) + GRAD2[ba][1] * zf;
  const gAB = GRAD2[ab][0] * xf + GRAD2[ab][1] * (zf - 1);
  const gBB = GRAD2[bb][0] * (xf - 1) + GRAD2[bb][1] * (zf - 1);

  const x1 = lerp(gAA, gBA, u);
  const x2 = lerp(gAB, gBB, u);

  return clamp(lerp(x1, x2, v) * 1.414, -1, 1);
}

/**
 * Computes multi-octave Fractal Brownian Motion (FBM) 2D noise in [-1, 1].
 * @param {number} x - Sample X coordinate.
 * @param {number} z - Sample Z coordinate.
 * @param {number} [octaves=4] - Number of noise octaves.
 * @param {number} [persistence=0.5] - Amplitude multiplier per octave.
 * @param {number} [lacunarity=2.0] - Frequency multiplier per octave.
 * @returns {number} Normalized FBM noise value in [-1, 1].
 */
export function fbm2D(x, z, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
  let total = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += noise2D(x * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return maxValue > 0 ? total / maxValue : 0;
}

/**
 * Clamps a numeric value `v` to the inclusive range `[min, max]`.
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Linearly interpolates between `a` and `b` by factor `t`.
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Computes the 2D Euclidean distance on the XZ ground plane between `(x1, z1)` and `(x2, z2)`.
 * @param {number} x1
 * @param {number} z1
 * @param {number} x2
 * @param {number} z2
 * @returns {number}
 */
export function dist2D(x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.hypot(dx, dz);
}

/**
 * Computes the planar angle `atan2(z2 - z1, x2 - x1)` in radians from `(x1, z1)` to `(x2, z2)`.
 * @param {number} x1
 * @param {number} z1
 * @param {number} x2
 * @param {number} z2
 * @returns {number} Angle in radians in [-PI, PI].
 */
export function angleBetween(x1, z1, x2, z2) {
  return Math.atan2(z2 - z1, x2 - x1);
}

/**
 * Converts a compass angle `(dx, dz)` into a French cardinal direction label (e.g. 'Nord-Est').
 * @param {number} dx - Delta X from reference point (usually Bastion at 0,0).
 * @param {number} dz - Delta Z from reference point (negative Z is North).
 * @returns {string} Cardinal sector name in French.
 */
export function getCardinalLabelFR(dx, dz) {
  const angle = Math.atan2(-dz, dx); // +X = Est, -Z = Nord
  const deg = ((angle * 180) / Math.PI + 360) % 360;
  if (deg >= 337.5 || deg < 22.5) return 'Est';
  if (deg >= 22.5 && deg < 67.5) return 'Nord-Est';
  if (deg >= 67.5 && deg < 112.5) return 'Nord';
  if (deg >= 112.5 && deg < 157.5) return 'Nord-Ouest';
  if (deg >= 157.5 && deg < 202.5) return 'Ouest';
  if (deg >= 202.5 && deg < 247.5) return 'Sud-Ouest';
  if (deg >= 247.5 && deg < 292.5) return 'Sud';
  return 'Sud-Est';
}
