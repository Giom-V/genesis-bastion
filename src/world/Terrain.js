/**
 * @file src/world/Terrain.js
 * @description Procedural 3D island heightmap terrain, multi-biome vertex & shader material
 * system, Tidewater-inspired animated Gerstner/Tessendorf ocean shader with depth-based
 * shoreline foam & seabed caustics, and wind-animated InstancedMesh foliage/props for
 * Genesis Bastion.
 *
 * Key responsibilities:
 * - Exact analytical `getHeightAt(x, z)` used by both mesh vertex generation and 3D entity
 *   grounding so creatures, Scouts, and the Player never float or sink.
 * - Deterministic `getBiomeAt(x, z)` returning `'beach' | 'plains' | 'forest' | 'highlands' | 'volcanic'`.
 * - Multi-wave animated Ocean Water Plane with baked heightmap depth texture for realistic
 *   coastal foam bands, shallow turquoise water absorption, Fresnel sky reflection, and caustics.
 * - GPU-instanced environmental props (`THREE.InstancedMesh`): wind-swaying grass clumps,
 *   pine & broadleaf trees, boulders, and glowing crystal resource nodes.
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { fbm2D, noise2D, clamp, lerp, dist2D, SeededRNG } from '../utils/math.js';
import { logger } from '../utils/logger.js';

/**
 * Vertex shader for the Tidewater-inspired stylized Ocean Water Plane.
 * Sums 4 Gerstner-style directional waves for organic surface displacement and normals.
 */
const WATER_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;

  vec3 gerstnerWave(vec2 pos, float steepness, float wavelength, vec2 dir, float time, inout vec3 tangent, inout vec3 binormal) {
    float k = 6.2831853 / wavelength;
    float c = sqrt(9.8 / k);
    vec2 d = normalize(dir);
    float f = k * (dot(d, pos) - c * time);
    float a = steepness / k;

    tangent += vec3(
      -d.x * d.x * (steepness * sin(f)),
       d.x * (steepness * cos(f)),
      -d.x * d.y * (steepness * sin(f))
    );
    binormal += vec3(
      -d.x * d.y * (steepness * sin(f)),
       d.y * (steepness * cos(f)),
      -d.y * d.y * (steepness * sin(f))
    );

    return vec3(
      d.x * (a * cos(f)),
      a * sin(f),
      d.y * (a * cos(f))
    );
  }

  void main() {
    vUv = uv;
    vec4 baseWorld = modelMatrix * vec4(position, 1.0);
    vec2 xz = baseWorld.xz;

    vec3 tangent = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    vec3 offset = vec3(0.0);

    offset += gerstnerWave(xz, 0.14, 18.0, vec2(1.0, 0.35), uTime * 1.05, tangent, binormal);
    offset += gerstnerWave(xz, 0.10, 11.5, vec2(0.45, 0.9), uTime * 1.25, tangent, binormal);

    vec3 displacedWorld = baseWorld.xyz + offset;
    vWorldPos = displacedWorld;
    vNormal = normalize(cross(binormal, tangent));

    gl_Position = projectionMatrix * viewMatrix * vec4(displacedWorld, 1.0);
  }
`;

/**
 * Fragment shader for the Ocean Water Plane:
 * - Reads exact terrain elevation from `uHeightTex` to compute water depth
 * - Renders multi-band animated shoreline foam where waves lap the beach
 * - Projects procedural Voronoi/ripple seabed caustics in shallow coastal waters
 * - Computes Schlick Fresnel sky reflection and solar glitter specular highlights
 */
const WATER_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform sampler2D uHeightTex;
  uniform sampler2D uCausticsTex;
  uniform float uWorldSize;
  uniform float uWaterLevel;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float vNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Procedural + textured dual-layer aquatic caustics pattern
  float causticsPattern(vec2 xz, float time) {
    vec2 uv1 = xz * 0.065 + vec2(time * 0.025, -time * 0.018);
    vec2 uv2 = xz * 0.082 + vec2(-time * 0.021, time * 0.028);
    float t1 = texture2D(uCausticsTex, uv1).r;
    float t2 = texture2D(uCausticsTex, uv2).g;
    float n1 = abs(vNoise(xz * 0.32 + vec2(time * 0.16, -time * 0.12)) - 0.5) * 2.0;
    float n2 = abs(vNoise(xz * 0.39 + vec2(-time * 0.14, time * 0.19)) - 0.5) * 2.0;
    float procC = pow(1.0 - min(n1, n2), 3.0);
    return clamp(procC * 0.65 + (t1 * t2) * 0.85, 0.0, 1.0);
  }

  void main() {
    // Map world XZ to normalized [0..1] heightmap UV
    vec2 islandUv = (vWorldPos.xz / uWorldSize) + 0.5;
    float inBounds = step(0.0, islandUv.x) * step(islandUv.x, 1.0) * step(0.0, islandUv.y) * step(islandUv.y, 1.0);

    // Decode terrain height in [-8..24] stored in R channel
    float encodedH = texture2D(uHeightTex, clamp(islandUv, 0.0, 1.0)).r;
    float terrainH = mix(-5.5, encodedH * 32.0 - 8.0, inBounds);

    // Water depth above seabed
    float depth = max(0.0, vWorldPos.y - terrainH);

    // Fine normal perturbation for capillary surface ripples
    float r1 = vNoise(vWorldPos.xz * 0.85 + vec2(uTime * 0.7, uTime * 0.5));
    float r2 = vNoise(vWorldPos.xz * 1.90 - vec2(uTime * 0.9, -uTime * 0.6));
    vec3 N = normalize(vNormal + vec3((r1 - 0.5) * 0.12, 0.0, (r2 - 0.5) * 0.12));

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunDir);

    // Stylized Crystal Lagoon palette (Tunic / Link's Awakening tropical turquoise -> sapphire)
    vec3 crystalLagoon = vec3(0.24, 0.86, 0.88); // #3ddbd9 shallow turquoise halo
    vec3 midLagoon = vec3(0.086, 0.54, 0.678);   // #168aad tropical lagoon
    vec3 deepSapphire = vec3(0.04, 0.24, 0.44);  // #0a3d70 deep ocean

    float shallowFactor = exp(-depth * 0.62);
    float deepFactor = clamp(depth / 4.8, 0.0, 1.0);
    vec3 waterCol = mix(midLagoon, crystalLagoon, shallowFactor);
    waterCol = mix(waterCol, deepSapphire, deepFactor);

    // Bright stylized caustics network in shallow & mid lagoon waters
    float caustics = causticsPattern(vWorldPos.xz, uTime);
    float causticsMask = (0.35 + 0.65 * shallowFactor) * (1.0 - smoothstep(3.8, 6.2, depth));
    waterCol += vec3(0.45, 0.95, 1.0) * caustics * causticsMask * 0.62;

    // Warm Golden-Hour Fresnel sky reflection
    float NoV = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = 0.06 + 0.94 * pow(1.0 - NoV, 3.8);
    vec3 skyReflect = mix(vec3(0.18, 0.48, 0.72), vec3(0.88, 0.94, 0.99), clamp(L.y + 0.35, 0.0, 1.0));
    waterCol = mix(waterCol, skyReflect, fresnel * 0.42);

    // Golden-Hour sun specular sparkles on wave crests
    vec3 H = normalize(L + V);
    float spec = pow(max(0.0, dot(N, H)), 120.0) * max(0.15, L.y);
    waterCol += vec3(1.0, 0.95, 0.82) * spec * 0.95;

    // Stylized multi-ring shoreline white foam where waves lap the coral beach
    float foamNoise = vNoise(vWorldPos.xz * 0.55 + vec2(uTime * 0.35, -uTime * 0.28));
    float shoreWave = sin(depth * 6.4 - uTime * 3.4 + foamNoise * 2.2);
    float primaryShoreFoam = smoothstep(0.68, 0.0, depth) * 0.98;
    float secondaryBandFoam = smoothstep(2.1, 0.22, depth) * smoothstep(0.28, 0.78, shoreWave) * 0.82;
    float crestFoam = smoothstep(0.20, 0.34, vWorldPos.y - uWaterLevel) * smoothstep(0.45, 0.8, foamNoise) * 0.45;
    float totalFoam = clamp(max(primaryShoreFoam, secondaryBandFoam) + crestFoam, 0.0, 1.0);

    vec3 foamColor = vec3(0.98, 0.99, 1.0);
    waterCol = mix(waterCol, foamColor, totalFoam);

    // Crisp shoreline alpha feathering onto warm beach sand
    float alpha = clamp(smoothstep(0.0, 0.10, depth) * 0.94 + totalFoam * 0.65, 0.0, 0.97);

    gl_FragColor = vec4(waterCol, alpha);
  }
`;

export class Terrain {
  /**
   * Constructs the 3D island heightmap mesh, multi-biome coloring, animated ocean plane,
   * and instanced environmental props.
   *
   * @param {THREE.Scene} scene - The Three.js scene to attach terrain, ocean, and props to.
   */
  constructor(scene) {
    /** @type {THREE.Scene} */
    this.scene = scene;
    /** @type {number} */
    this.size = CONFIG?.WORLD?.SIZE ?? 240;
    /** @type {number} */
    this.segments = 96;
    /** @type {number} */
    this.waterLevel = CONFIG?.WORLD?.WATER_LEVEL ?? -1.2;
    /** @type {number} */
    this.bastionRadius = CONFIG?.BASTION?.RADIUS ?? 14;

    /** @type {Array<{id: string, type: 'wood'|'crystal', x: number, y: number, z: number, radius: number, amount: number, maxAmount: number, depleted: boolean, instanceIndex: number}>} */
    this.resourceNodes = [];

    /** @type {Array<{uTime: {value: number}}>} Shared wind shader uniforms for foliage */
    this._windUniformsList = [];

    // Precompute O(1) bilinear heightmap (257x257) and biome lookup grid (129x129)
    this._buildLookupCaches();

    this._buildIslandMesh();
    this._buildOceanPlane();
    this._populateInstancedProps();

    logger.info('WORLD', 'Terrain & Ocean generated (O(1) height/biome cache enabled)', {
      size: `${this.size}x${this.size}`,
      segments: `${this.segments}x${this.segments}`,
      resourceNodes: this.resourceNodes.length,
    });
  }

  /**
   * Precomputes `this._heightGrid` (`257x257` Float32Array) and `this._biomeGrid` (`129x129` Array)
   * covering `[-this.size * 0.5, +this.size * 0.5]` so runtime `getHeightAt` and `getBiomeAt`
   * execute in O(1) without evaluating 12 octaves of Perlin/FBM noise on every entity frame.
   * @private
   */
  _buildLookupCaches() {
    this._heightRes = 257;
    this._heightGrid = new Float32Array(this._heightRes * this._heightRes);
    const half = this.size * 0.5;
    const stepH = this.size / (this._heightRes - 1);

    for (let iz = 0; iz < this._heightRes; iz++) {
      const wz = -half + iz * stepH;
      const rowOffset = iz * this._heightRes;
      for (let ix = 0; ix < this._heightRes; ix++) {
        const wx = -half + ix * stepH;
        this._heightGrid[rowOffset + ix] = this._computeAnalyticalHeightAt(wx, wz);
      }
    }

    this._biomeRes = 129;
    this._biomeGrid = new Array(this._biomeRes * this._biomeRes);
    const stepB = this.size / (this._biomeRes - 1);

    for (let iz = 0; iz < this._biomeRes; iz++) {
      const wz = -half + iz * stepB;
      const rowOffset = iz * this._biomeRes;
      for (let ix = 0; ix < this._biomeRes; ix++) {
        const wx = -half + ix * stepB;
        this._biomeGrid[rowOffset + ix] = this._computeAnalyticalBiomeAt(wx, wz);
      }
    }
  }

  /**
   * Computes a smooth Hermite interpolation step in [0, 1].
   *
   * @param {number} edge0 - Lower threshold.
   * @param {number} edge1 - Upper threshold.
   * @param {number} x - Input value.
   * @returns {number} Smoothed value in [0, 1].
   * @private
   */
  _smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  /**
   * Computes the volcanic caldera influence factor in [0, 1] at `(x, z)`.
   * Strongest in the North-East (`x > 18, z < -18`) and North-West (`x < -20, z < -22`) sectors.
   *
   * @param {number} x - World X coordinate.
   * @param {number} z - World Z coordinate.
   * @returns {{ mask: number, rimBoost: number }}
   * @private
   */
  _getVolcanicField(x, z) {
    // Primary iconic caldera in the North-East (for Fire Troll / Dragon territory)
    const distNE = Math.hypot(x - 52, z + 52);
    // Secondary volcanic ridge in the North-West
    const warp = fbm2D(x * 0.03, z * 0.03, 3, 0.5, 2.0) * 9.0;
    const distNW = Math.hypot(x + 48, z + 54) + warp * 0.6;

    const dNE = distNE + warp;
    const maskNE = 1.0 - this._smoothstep(18, 42, dNE);
    const maskNW = (1.0 - this._smoothstep(14, 34, distNW)) * 0.85;
    const mask = clamp(Math.max(maskNE, maskNW), 0.0, 1.0);

    // Crater rim profile: rises steeply up to radius ~16, then dips slightly in the inner lava caldera
    const craterRingNE = Math.exp(-Math.pow((dNE - 16.5) / 9.5, 2.0)) * 6.4 - Math.exp(-Math.pow(dNE / 10.0, 2.0)) * 2.8;
    const craterRingNW = Math.exp(-Math.pow((distNW - 14.0) / 8.5, 2.0)) * 4.5;

    return {
      mask,
      rimBoost: Math.max(0, craterRingNE) * maskNE + Math.max(0, craterRingNW) * maskNW,
    };
  }

  /**
   * Fast O(1) bilinear terrain elevation lookup at world coordinates `(x, z)`.
   * Falls back to `_computeAnalyticalHeightAt(x, z)` only outside `[-size/2, +size/2]`.
   *
   * @param {number} x - World X coordinate.
   * @param {number} z - World Z coordinate.
   * @returns {number} Terrain height Y in world units.
   */
  getHeightAt(x, z) {
    if (this._heightGrid) {
      const half = this.size * 0.5;
      if (x >= -half && x <= half && z >= -half && z <= half) {
        const resMinus1 = this._heightRes - 1;
        const fx = ((x + half) / this.size) * resMinus1;
        const fz = ((z + half) / this.size) * resMinus1;
        const ix = Math.min(resMinus1 - 1, Math.max(0, fx | 0));
        const iz = Math.min(resMinus1 - 1, Math.max(0, fz | 0));
        const tx = fx - ix;
        const tz = fz - iz;
        const row0 = iz * this._heightRes + ix;
        const row1 = row0 + this._heightRes;
        const h00 = this._heightGrid[row0];
        const h10 = this._heightGrid[row0 + 1];
        const h01 = this._heightGrid[row1];
        const h11 = this._heightGrid[row1 + 1];
        const h0 = h00 + (h10 - h00) * tx;
        const h1 = h01 + (h11 - h01) * tx;
        return h0 + (h1 - h0) * tz;
      }
    }
    return this._computeAnalyticalHeightAt(x, z);
  }

  /**
   * Exact analytical terrain elevation function at world coordinates `(x, z)`.
   *
   * @param {number} x - World X coordinate.
   * @param {number} z - World Z coordinate.
   * @returns {number} Terrain height Y in world units.
   * @private
   */
  _computeAnalyticalHeightAt(x, z) {
    const r = Math.hypot(x, z);
    const angle = Math.atan2(z, x);

    // Organic island coastline radius modulation (bays, peninsulas, capes)
    const coastWarp =
      fbm2D(x * 0.014 + 3.1, z * 0.014 - 2.4, 3, 0.5, 2.0) * 14.5 +
      Math.sin(angle * 3.0 + 0.7) * 5.0 +
      Math.cos(angle * 5.0 - 1.2) * 3.2;

    const effectiveRadius = r + coastWarp;
    const islandEdge = this.size * 0.43; // ~103.2 units

    // Smooth island continental shelf falloff into the ocean
    const shelfMask = 1.0 - this._smoothstep(islandEdge - 28.0, islandEdge + 10.0, effectiveRadius);

    // Multi-octave terrain hills & ridges
    const baseHills = (fbm2D(x * 0.016, z * 0.016, 4, 0.52, 2.05) + 0.22) * 6.2;
    const ridgedMountains = Math.pow(1.0 - Math.abs(noise2D(x * 0.024 + 7.3, z * 0.024 - 4.1)), 2.2) * 4.8;
    const radialMountainBelt = this._smoothstep(30.0, 68.0, r) * (1.0 - this._smoothstep(74.0, 102.0, effectiveRadius));

    const { rimBoost } = this._getVolcanicField(x, z);

    let rawLandHeight =
      0.85 +
      baseHills * this._smoothstep(18.0, 48.0, r) +
      ridgedMountains * radialMountainBelt +
      rimBoost;

    // Blend with seabed outside coastline
    const seabedDepth = -4.6 + fbm2D(x * 0.03, z * 0.03, 2, 0.5, 2.0) * 0.8;
    let height = lerp(seabedDepth, rawLandHeight, shelfMask);

    // Flatten central Bastion Sanctuary plateau around (0, 0) at y = 2.20
    const plateauHeight = 2.2;
    const bastionFlatMask = 1.0 - this._smoothstep(this.bastionRadius + 1.0, this.bastionRadius + 14.0, r);
    height = lerp(height, plateauHeight, bastionFlatMask);

    return height;
  }

  /**
   * Computes the surface normal vector at `(x, z)` via central finite differences on `getHeightAt`.
   *
   * @param {number} x - World X coordinate.
   * @param {number} z - World Z coordinate.
   * @returns {THREE.Vector3} Normalized surface normal vector.
   */
  getNormalAt(x, z) {
    const eps = 0.6;
    const hL = this.getHeightAt(x - eps, z);
    const hR = this.getHeightAt(x + eps, z);
    const hD = this.getHeightAt(x, z - eps);
    const hU = this.getHeightAt(x, z + eps);
    return new THREE.Vector3(hL - hR, 2.0 * eps, hD - hU).normalize();
  }

  /**
   * Returns true if the terrain at `(x, z)` is submerged below `WATER_LEVEL`.
   *
   * @param {number} x - World X coordinate.
   * @param {number} z - World Z coordinate.
   * @returns {boolean}
   */
  isWater(x, z) {
    return this.getHeightAt(x, z) <= this.waterLevel + 0.05;
  }

  /**
   * Fast O(1) ecological biome classification at world coordinates `(x, z)`.
   *
   * @param {number} x - World X coordinate.
   * @param {number} z - World Z coordinate.
   * @returns {'beach' | 'plains' | 'forest' | 'highlands' | 'volcanic'} Biome identifier.
   */
  getBiomeAt(x, z) {
    if (this._biomeGrid) {
      const half = this.size * 0.5;
      if (x >= -half && x <= half && z >= -half && z <= half) {
        const resMinus1 = this._biomeRes - 1;
        const ix = Math.min(resMinus1, Math.max(0, Math.round(((x + half) / this.size) * resMinus1)));
        const iz = Math.min(resMinus1, Math.max(0, Math.round(((z + half) / this.size) * resMinus1)));
        return this._biomeGrid[iz * this._biomeRes + ix] || 'plains';
      }
    }
    return this._computeAnalyticalBiomeAt(x, z);
  }

  /**
   * Analytical ecological biome classification at world coordinates `(x, z)`.
   *
   * @param {number} x - World X coordinate.
   * @param {number} z - World Z coordinate.
   * @returns {'beach' | 'plains' | 'forest' | 'highlands' | 'volcanic'} Biome identifier.
   * @private
   */
  _computeAnalyticalBiomeAt(x, z) {
    const h = this.getHeightAt(x, z);
    const r = Math.hypot(x, z);

    // Central Bastion Sanctuary & inner ring are always fertile plains
    if (r <= this.bastionRadius + 10) {
      return 'plains';
    }

    // Coastal beaches & shallow sandbars
    if (h < 0.75) {
      return 'beach';
    }

    // Volcanic caldera in the North-East & North-West sectors
    const { mask: volcanicMask } = this._getVolcanicField(x, z);
    if (volcanicMask > 0.38) {
      return 'volcanic';
    }

    // High-altitude rocky crags & mountain ridges
    const highlandNoise = fbm2D(x * 0.022 - 5.2, z * 0.022 + 8.4, 3, 0.5, 2.0);
    if (h >= 6.4 || (r > 48 && h >= 4.6 && highlandNoise > 0.22)) {
      return 'highlands';
    }

    // Moisture noise separates dense forest groves from open emerald plains
    const moisture = fbm2D(x * (CONFIG?.WORLD?.BIOME_SCALE || 0.015) + 11.4, z * (CONFIG?.WORLD?.BIOME_SCALE || 0.015) - 7.9, 3, 0.55, 2.0);
    if (moisture > -0.04) {
      return 'forest';
    }

    return 'plains';
  }

  /**
   * Generates seamless `512x512` tileable procedural ground detail (`map`) and relief (`bumpMap`)
   * textures (`RepeatWrapping` `32x32`, `anisotropy = 4`) so the terrain surface has crisp
   * stylized grass blades, clover/wildflower flecks, fine sand ripples, and carved stone relief
   * instead of flat Gouraud-shaded polygons. Falls back to `DataTexture` in headless Node.js.
   *
   * @returns {{ detailMap: THREE.Texture, bumpMap: THREE.Texture }}
   * @private
   */
  _createStylizedGroundTextures() {
    const size = 512;
    const hasCanvas = typeof document !== 'undefined' && typeof document.createElement === 'function';

    if (hasCanvas) {
      const detailCanvas = document.createElement('canvas');
      detailCanvas.width = size;
      detailCanvas.height = size;
      const dCtx = detailCanvas.getContext('2d');

      const bumpCanvas = document.createElement('canvas');
      bumpCanvas.width = size;
      bumpCanvas.height = size;
      const bCtx = bumpCanvas.getContext('2d');

      if (dCtx && bCtx) {
        // Warm high-key neutral base so vertex colors stay bright & luminous
        dCtx.fillStyle = '#f3f5ec';
        dCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        const rng = new SeededRNG(1502026);

        // 1. Soft organic dapple patches (sunlit turf & soil warmth)
        for (let i = 0; i < 420; i++) {
          const x = rng.range(0, size);
          const y = rng.range(0, size);
          const r = rng.range(10, 32);
          const isLight = rng.chance(0.55);
          dCtx.fillStyle = isLight ? 'rgba(255, 254, 240, 0.14)' : 'rgba(210, 224, 200, 0.14)';
          bCtx.fillStyle = isLight ? 'rgba(165, 165, 165, 0.12)' : 'rgba(105, 105, 105, 0.12)';
          // Tile-wrap across edges for seamless repetition
          for (const ox of [-size, 0, size]) {
            for (const oy of [-size, 0, size]) {
              if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
              dCtx.beginPath();
              dCtx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
              dCtx.fill();
              bCtx.beginPath();
              bCtx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
              bCtx.fill();
            }
          }
        }

        // 2. Stylized hand-painted grass blade strokes & pebble micro-relief
        for (let i = 0; i < 2400; i++) {
          const x = rng.range(0, size);
          const y = rng.range(0, size);
          const w = rng.range(2.0, 4.5);
          const h = rng.range(5.0, 11.5);
          const bright = rng.chance(0.58);
          dCtx.fillStyle = bright ? 'rgba(255, 255, 245, 0.24)' : 'rgba(195, 212, 188, 0.22)';
          bCtx.fillStyle = bright ? 'rgba(215, 215, 215, 0.26)' : 'rgba(65, 65, 65, 0.22)';
          dCtx.fillRect(x, y, w, h);
          bCtx.fillRect(x, y, w, h);
          if (x + w > size) {
            dCtx.fillRect(x - size, y, w, h);
            bCtx.fillRect(x - size, y, w, h);
          }
          if (y + h > size) {
            dCtx.fillRect(x, y - size, w, h);
            bCtx.fillRect(x, y - size, w, h);
          }
        }

        // 3. Subtle sunlit clover / pebble highlights
        for (let i = 0; i < 650; i++) {
          const x = rng.range(0, size);
          const y = rng.range(0, size);
          const rad = rng.range(1.5, 3.6);
          dCtx.fillStyle = rng.chance(0.7) ? 'rgba(255, 252, 232, 0.32)' : 'rgba(182, 196, 176, 0.28)';
          bCtx.fillStyle = 'rgba(235, 235, 235, 0.35)';
          dCtx.beginPath();
          dCtx.arc(x, y, rad, 0, Math.PI * 2);
          dCtx.fill();
          bCtx.beginPath();
          bCtx.arc(x, y, rad, 0, Math.PI * 2);
          bCtx.fill();
        }

        const detailMap = new THREE.CanvasTexture(detailCanvas);
        detailMap.wrapS = THREE.RepeatWrapping;
        detailMap.wrapT = THREE.RepeatWrapping;
        detailMap.repeat.set(32, 32);
        detailMap.anisotropy = 4;
        detailMap.colorSpace = THREE.SRGBColorSpace;
        detailMap.needsUpdate = true;

        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        bumpMap.wrapS = THREE.RepeatWrapping;
        bumpMap.wrapT = THREE.RepeatWrapping;
        bumpMap.repeat.set(32, 32);
        bumpMap.anisotropy = 4;
        bumpMap.needsUpdate = true;

        return { detailMap, bumpMap };
      }
    }

    // Headless Node.js fallback (64x64 DataTexture)
    const fallbackRes = 64;
    const dData = new Uint8Array(fallbackRes * fallbackRes * 4);
    const bData = new Uint8Array(fallbackRes * fallbackRes * 4);
    for (let i = 0; i < fallbackRes * fallbackRes; i++) {
      const v = 238 + ((i * 17) % 16);
      dData[i * 4] = v;
      dData[i * 4 + 1] = v;
      dData[i * 4 + 2] = v - 4;
      dData[i * 4 + 3] = 255;

      const bv = 120 + ((i * 29) % 32);
      bData[i * 4] = bv;
      bData[i * 4 + 1] = bv;
      bData[i * 4 + 2] = bv;
      bData[i * 4 + 3] = 255;
    }
    const detailMap = new THREE.DataTexture(dData, fallbackRes, fallbackRes, THREE.RGBAFormat);
    detailMap.wrapS = THREE.RepeatWrapping;
    detailMap.wrapT = THREE.RepeatWrapping;
    detailMap.repeat.set(32, 32);
    detailMap.needsUpdate = true;

    const bumpMap = new THREE.DataTexture(bData, fallbackRes, fallbackRes, THREE.RGBAFormat);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(32, 32);
    bumpMap.needsUpdate = true;

    return { detailMap, bumpMap };
  }

  /**
   * Generates the `240x240` (`96x96` segments) island terrain mesh with a luminous
   * Stylized Fantasy palette (`Tunic` / `Zelda: Link's Awakening` / `Death's Door`),
   * `512x512` tileable detail & bump textures (`RepeatWrapping` `32x32`), and a carved
   * golden-limestone Sanctuary courtyard (`r < 22m`) with concentric cobblestone rings.
   * @private
   */
  _buildIslandMesh() {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position;
    const vertexCount = posAttr.count;
    const colors = new Float32Array(vertexCount * 3);

    // First pass: set exact analytical Y coordinates
    for (let i = 0; i < vertexCount; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const vy = this.getHeightAt(vx, vz);
      posAttr.setY(i, vy);
    }

    geo.computeVertexNormals();
    const normAttr = geo.attributes.normal;

    // Stylized Fantasy Biome Palette (Tunic / Link's Awakening / Death's Door)
    const colWetSand = new THREE.Color(0xd8bf8c);         // Warm golden wet sand
    const colDrySand = new THREE.Color(0xf4e2b8);         // Sunlit coral-cream beach sand (#f4e2b8)
    const colMeadowBright = new THREE.Color(0x58b868);    // Vibrant sunlit meadow grass (#58b868)
    const colMeadowRich = new THREE.Color(0x3e9654);      // Rich emerald meadow grass (#3e9654)
    const colForest = new THREE.Color(0x2b6e4e);          // Deep emerald-teal ancient forest (#2b6e4e)
    const colHighlands = new THREE.Color(0x73645e);       // Warm volcanic slate-terracotta (#73645e)
    const colCliffRock = new THREE.Color(0x635550);       // Warm sculpted cliff stone
    const colVolcanicRock = new THREE.Color(0x3d3235);    // Dark caldera basalt
    const colMagmaVein = new THREE.Color(0xff5e1a);       // Glowing magma veins
    const colSanctuaryStone = new THREE.Color(0xe8d8b4);  // Carved golden-limestone courtyard
    const colSanctuaryRing = new THREE.Color(0xc4b086);   // Concentric cobblestone mortar ring
    const colSanctuaryRune = new THREE.Color(0x64d8cb);   // Subtle runic turquoise inlay

    const tempColor = new THREE.Color();

    // Second pass: compute harmonious stylized vertex colors
    for (let i = 0; i < vertexCount; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      const ny = normAttr.getY(i);
      const slope = 1.0 - clamp(ny, 0.0, 1.0);
      const r = Math.hypot(vx, vz);

      const micro = noise2D(vx * 0.11, vz * 0.11) * 0.08;
      const biome = this.getBiomeAt(vx, vz);
      const { mask: volcanicMask } = this._getVolcanicField(vx, vz);

      if (vy < 0.82) {
        const wetFactor = this._smoothstep(this.waterLevel - 0.35, 0.72, vy);
        tempColor.copy(colWetSand).lerp(colDrySand, wetFactor);
      } else if (biome === 'forest') {
        tempColor.copy(colForest).lerp(colMeadowRich, clamp(0.32 + micro * 2.5, 0.0, 0.58));
      } else if (biome === 'highlands') {
        tempColor.copy(colMeadowRich).lerp(colHighlands, this._smoothstep(3.8, 7.0, vy));
      } else {
        tempColor.copy(colMeadowRich).lerp(colMeadowBright, clamp(0.55 + micro * 3.8, 0.0, 1.0));
      }

      // Smooth sunlit beach-to-meadow transition
      if (vy >= 0.62 && vy < 1.55) {
        const grassBlend = this._smoothstep(0.62, 1.55, vy);
        tempColor.lerp(colDrySand, 1.0 - grassBlend);
      }

      // Sculpted warm cliff strata on steeper slopes
      const cliffBlend = this._smoothstep(0.22, 0.48, slope);
      tempColor.lerp(colCliffRock, cliffBlend);

      // Volcanic slate-terracotta & warm magma veins in NE/NW caldera
      if (volcanicMask > 0.05) {
        tempColor.lerp(colVolcanicRock, clamp(volcanicMask * 0.92, 0.0, 0.88));
        const fissureNoise = Math.abs(noise2D(vx * 0.18, vz * 0.18));
        if (volcanicMask > 0.42 && fissureNoise < 0.11 && vy > 1.2) {
          const glowStrength = (1.0 - fissureNoise / 0.11) * volcanicMask;
          tempColor.lerp(colMagmaVein, glowStrength * 0.88);
        }
      }

      // Carved Golden-Limestone Sanctuary Courtyard at the center (r < 22m) with concentric cobblestone rings
      if (r < 22.0) {
        const sanctuaryBlend = 1.0 - this._smoothstep(15.5, 22.0, r);
        const cobbleWave = 0.5 + 0.5 * Math.cos(r * 2.15);
        const stoneCol = colSanctuaryStone.clone().lerp(colSanctuaryRing, cobbleWave * 0.38);
        if (Math.abs(r - 13.8) < 1.1 || Math.abs(r - 7.2) < 0.85) {
          stoneCol.lerp(colSanctuaryRune, 0.35);
        }
        tempColor.lerp(stoneCol, sanctuaryBlend * 0.88);
      }

      tempColor.offsetHSL(0, 0, micro * 0.22);
      colors[i * 3] = clamp(tempColor.r, 0, 1);
      colors[i * 3 + 1] = clamp(tempColor.g, 0, 1);
      colors[i * 3 + 2] = clamp(tempColor.b, 0, 1);
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const { detailMap, bumpMap } = this._createStylizedGroundTextures();
    this.groundDetailMap = detailMap;
    this.groundBumpMap = bumpMap;

    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detailMap,
      bumpMap: bumpMap,
      bumpScale: 0.28,
      roughness: 0.78,
      metalness: 0.04,
      flatShading: false,
    });

    this.mesh = new THREE.Mesh(geo, this.terrainMaterial);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.scene.add(this.mesh);
  }

  /**
   * Builds a `256x256` RGBA DataTexture encoding `getHeightAt(x, z)` so the ocean
   * fragment shader can compute exact shoreline water depth without an extra render pass.
   *
   * @returns {THREE.DataTexture}
   * @private
   */
  _createHeightDataTexture() {
    const res = 256;
    const data = new Uint8Array(res * res * 4);

    for (let iz = 0; iz < res; iz++) {
      const wz = ((iz / (res - 1)) - 0.5) * this.size;
      for (let ix = 0; ix < res; ix++) {
        const wx = ((ix / (res - 1)) - 0.5) * this.size;
        const h = this.getHeightAt(wx, wz);
        // Normalize h in [-8..24] -> [0..255]
        const norm = clamp((h + 8.0) / 32.0, 0.0, 1.0);
        const byteVal = Math.round(norm * 255);
        const idx = (iz * res + ix) * 4;
        data[idx] = byteVal;
        data[idx + 1] = byteVal;
        data[idx + 2] = byteVal;
        data[idx + 3] = 255;
      }
    }

    const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Creates a tileable `256x256` Water Caustics & Specular Ripples texture (`RepeatWrapping` `24x24`).
   *
   * @returns {THREE.Texture}
   * @private
   */
  _createWaterCausticsTexture() {
    const size = 256;
    const hasCanvas = typeof document !== 'undefined' && typeof document.createElement === 'function';
    if (hasCanvas) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#168aad';
        ctx.fillRect(0, 0, size, size);
        const rng = new SeededRNG(8882026);
        ctx.strokeStyle = 'rgba(215, 252, 255, 0.34)';
        ctx.lineWidth = 2.2;
        for (let i = 0; i < 95; i++) {
          const x = rng.range(0, size);
          const y = rng.range(0, size);
          const r = rng.range(14, 38);
          for (const ox of [-size, 0, size]) {
            for (const oy of [-size, 0, size]) {
              ctx.beginPath();
              ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(24, 24);
        tex.needsUpdate = true;
        return tex;
      }
    }
    const data = new Uint8Array(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) {
      const c = 140 + ((i * 37) % 110);
      data[i * 4] = c;
      data[i * 4 + 1] = c;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, 64, 64, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(24, 24);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Builds the animated Ocean Water Plane (`THREE.ShaderMaterial`) with Gerstner waves,
   * tileable caustics texture, and a Shoreline White Foam Ring & Shallow Turquoise Lagoon Halo.
   * @private
   */
  _buildOceanPlane() {
    const heightTex = this._createHeightDataTexture();
    this.waterCausticsTex = this._createWaterCausticsTexture();
    const waterGeo = new THREE.PlaneGeometry(680, 680, 56, 56);
    waterGeo.rotateX(-Math.PI / 2);

    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: WATER_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.45, 0.72, 0.52).normalize() },
        uHeightTex: { value: heightTex },
        uCausticsTex: { value: this.waterCausticsTex },
        uWorldSize: { value: this.size },
        uWaterLevel: { value: this.waterLevel },
      },
      transparent: true,
      depthWrite: false,
    });

    this.waterMesh = new THREE.Mesh(waterGeo, this.waterMaterial);
    this.waterMesh.position.y = this.waterLevel;
    this.waterMesh.renderOrder = 1;
    this.scene.add(this.waterMesh);

    // Shoreline Shallow Turquoise Lagoon Halo & White Foam Ring around the island coast
    const haloGeo = new THREE.RingGeometry(this.size * 0.35, this.size * 0.49, 64, 2);
    haloGeo.rotateX(-Math.PI / 2);
    this.shorelineHaloMat = new THREE.MeshBasicMaterial({
      color: 0x64f0f5,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.shorelineLagoonHalo = new THREE.Mesh(haloGeo, this.shorelineHaloMat);
    this.shorelineLagoonHalo.position.y = this.waterLevel + 0.08;
    this.shorelineLagoonHalo.renderOrder = 0;
    this.scene.add(this.shorelineLagoonHalo);
  }

  /**
   * Injects a wind-sway vertex shader hook (`onBeforeCompile`) into a `MeshStandardMaterial`
   * for instanced grass and tree canopies.
   *
   * @param {THREE.MeshStandardMaterial} material - Target foliage material.
   * @param {number} swayAmplitude - Wind displacement strength.
   * @param {number} minHeightThreshold - Local Y threshold above which vertices sway.
   * @private
   */
  _applyWindShader(material, swayAmplitude = 0.22, minHeightThreshold = 0.1) {
    const windUniform = { value: 0 };
    this._windUniformsList.push({ uTime: windUniform });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = windUniform;
      shader.vertexShader =
        `uniform float uWindTime;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float heightFactor = max(0.0, position.y - ${minHeightThreshold.toFixed(2)});
          #ifdef USE_INSTANCING
            vec3 instWorldPos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #else
            vec3 instWorldPos = vec3(0.0);
          #endif
          float windWave = sin(uWindTime * 2.3 + instWorldPos.x * 0.18 + instWorldPos.z * 0.14)
                         + 0.45 * cos(uWindTime * 3.7 + instWorldPos.x * 0.31);
          transformed.x += windWave * heightFactor * ${swayAmplitude.toFixed(3)};
          transformed.z += windWave * heightFactor * ${(swayAmplitude * 0.6).toFixed(3)};
          `
        );
    };
  }

  /**
   * Populates GPU-instanced environmental props (`THREE.InstancedMesh`) across the island
   * outside the central Bastion sanctuary:
   * 1. Wind-swaying grass clumps (`260` instances)
   * 2. Stylized low-poly pine & broadleaf trees (`110` instances, registered as wood nodes)
   * 3. Rugged boulders & volcanic crags (`70` instances)
   * 4. Glowing arcane crystal clusters (`48` instances, registered as crystal nodes)
   * @private
   */
  _populateInstancedProps() {
    const rng = new SeededRNG(4202026);
    const dummy = new THREE.Object3D();
    const colorHelper = new THREE.Color();

    // -------------------------------------------------------------------------
    // 1. Wind-Swaying Grass Clumps (InstancedMesh)
    // -------------------------------------------------------------------------
    const grassCount = 260;
    const grassGeo = new THREE.ConeGeometry(0.28, 0.95, 4);
    grassGeo.translate(0, 0.45, 0);
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02,
    });
    this._applyWindShader(grassMat, 0.26, 0.05);

    this.grassInstanced = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    this.grassInstanced.receiveShadow = false;
    this.grassInstanced.castShadow = false;

    let placedGrass = 0;
    let attempts = 0;
    while (placedGrass < grassCount && attempts < grassCount * 6) {
      attempts++;
      const gx = rng.range(-this.size * 0.41, this.size * 0.41);
      const gz = rng.range(-this.size * 0.41, this.size * 0.41);
      const r = Math.hypot(gx, gz);
      if (r < this.bastionRadius + 3.0) continue;

      const gh = this.getHeightAt(gx, gz);
      const biome = this.getBiomeAt(gx, gz);
      if (gh < 0.75 || biome === 'volcanic' || biome === 'beach') continue;

      dummy.position.set(gx, gh - 0.05, gz);
      dummy.rotation.set(rng.range(-0.12, 0.12), rng.range(0, Math.PI * 2), rng.range(-0.12, 0.12));
      const scale = rng.range(0.65, 1.45);
      dummy.scale.set(scale, scale * rng.range(0.85, 1.35), scale);
      dummy.updateMatrix();
      this.grassInstanced.setMatrixAt(placedGrass, dummy.matrix);

      if (biome === 'forest') {
        colorHelper.setHex(0x2b7a52).offsetHSL(rng.range(-0.03, 0.03), 0.05, rng.range(-0.04, 0.06));
      } else {
        colorHelper.setHex(0x58b868).offsetHSL(rng.range(-0.04, 0.05), 0.06, rng.range(-0.04, 0.08));
      }
      this.grassInstanced.setColorAt(placedGrass, colorHelper);
      placedGrass++;
    }
    this.grassInstanced.count = placedGrass;
    this.grassInstanced.instanceMatrix.needsUpdate = true;
    if (this.grassInstanced.instanceColor) this.grassInstanced.instanceColor.needsUpdate = true;
    this.scene.add(this.grassInstanced);

    // -------------------------------------------------------------------------
    // 2. Stylized Low-Poly Trees (Trunks + Multi-Tier Wind-Animated Canopies)
    // -------------------------------------------------------------------------
    const maxTrees = 110;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.36, 1.8, 6);
    trunkGeo.translate(0, 0.9, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x6b482e,
      roughness: 0.85,
    });

    const canopyGeo = new THREE.ConeGeometry(1.45, 3.4, 7);
    canopyGeo.translate(0, 3.0, 0);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
    });
    this._applyWindShader(canopyMat, 0.16, 1.4);

    this.treeTrunkInstanced = new THREE.InstancedMesh(trunkGeo, trunkMat, maxTrees);
    this.treeCanopyInstanced = new THREE.InstancedMesh(canopyGeo, canopyMat, maxTrees);
    this.treeTrunkInstanced.castShadow = false;
    this.treeTrunkInstanced.receiveShadow = false;
    this.treeCanopyInstanced.castShadow = true;
    this.treeCanopyInstanced.receiveShadow = true;

    let placedTrees = 0;
    attempts = 0;
    while (placedTrees < maxTrees && attempts < maxTrees * 8) {
      attempts++;
      const tx = rng.range(-this.size * 0.39, this.size * 0.39);
      const tz = rng.range(-this.size * 0.39, this.size * 0.39);
      const r = Math.hypot(tx, tz);
      if (r < this.bastionRadius + 5.5) continue;

      const th = this.getHeightAt(tx, tz);
      const biome = this.getBiomeAt(tx, tz);
      if (th < 1.05 || th > 7.8 || biome === 'beach' || biome === 'volcanic') continue;
      if (biome === 'plains' && !rng.chance(0.32)) continue;
      if (biome === 'highlands' && !rng.chance(0.25)) continue;

      const s = rng.range(0.82, 1.48);
      dummy.position.set(tx, th - 0.1, tz);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.scale.set(s, s * rng.range(0.9, 1.25), s);
      dummy.updateMatrix();

      this.treeTrunkInstanced.setMatrixAt(placedTrees, dummy.matrix);
      this.treeCanopyInstanced.setMatrixAt(placedTrees, dummy.matrix);

      if (biome === 'forest') {
        colorHelper.setHex(0x2b7552).offsetHSL(rng.range(-0.03, 0.04), 0.06, rng.range(-0.04, 0.06));
      } else if (biome === 'highlands') {
        colorHelper.setHex(0x3a6e5c).offsetHSL(rng.range(-0.02, 0.02), 0.04, rng.range(-0.04, 0.04));
      } else {
        colorHelper.setHex(0x4aa85b).offsetHSL(rng.range(-0.04, 0.06), 0.05, rng.range(-0.03, 0.06));
      }
      this.treeCanopyInstanced.setColorAt(placedTrees, colorHelper);

      this.resourceNodes.push({
        id: `wood_${placedTrees}`,
        type: 'wood',
        x: tx,
        y: th,
        z: tz,
        radius: 1.8 * s,
        amount: 15,
        maxAmount: 15,
        depleted: false,
        instanceIndex: placedTrees,
      });

      placedTrees++;
    }
    this.treeTrunkInstanced.count = placedTrees;
    this.treeCanopyInstanced.count = placedTrees;
    this.treeTrunkInstanced.instanceMatrix.needsUpdate = true;
    this.treeCanopyInstanced.instanceMatrix.needsUpdate = true;
    if (this.treeCanopyInstanced.instanceColor) this.treeCanopyInstanced.instanceColor.needsUpdate = true;
    this.scene.add(this.treeTrunkInstanced);
    this.scene.add(this.treeCanopyInstanced);

    // -------------------------------------------------------------------------
    // 3. Rugged Boulders & Volcanic Crags (InstancedMesh)
    // -------------------------------------------------------------------------
    const maxRocks = 70;
    const rockGeo = new THREE.DodecahedronGeometry(0.95, 1);
    rockGeo.translate(0, 0.45, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.08,
      flatShading: true,
    });

    this.rockInstanced = new THREE.InstancedMesh(rockGeo, rockMat, maxRocks);
    this.rockInstanced.castShadow = false;
    this.rockInstanced.receiveShadow = true;

    let placedRocks = 0;
    attempts = 0;
    while (placedRocks < maxRocks && attempts < maxRocks * 6) {
      attempts++;
      const rx = rng.range(-this.size * 0.41, this.size * 0.41);
      const rz = rng.range(-this.size * 0.41, this.size * 0.41);
      const r = Math.hypot(rx, rz);
      if (r < this.bastionRadius + 4.5) continue;

      const rh = this.getHeightAt(rx, rz);
      if (rh < 0.2) continue;

      const biome = this.getBiomeAt(rx, rz);
      const sx = rng.range(0.65, 1.95);
      const sy = rng.range(0.55, 1.65);
      const sz = rng.range(0.65, 1.95);

      dummy.position.set(rx, rh - 0.15, rz);
      dummy.rotation.set(rng.range(-0.3, 0.3), rng.range(0, Math.PI * 2), rng.range(-0.3, 0.3));
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      this.rockInstanced.setMatrixAt(placedRocks, dummy.matrix);

      if (biome === 'volcanic') {
        colorHelper.setHex(0x45383c).offsetHSL(0, 0, rng.range(-0.04, 0.04));
      } else {
        colorHelper.setHex(0x8c8178).offsetHSL(0, 0, rng.range(-0.06, 0.06));
      }
      this.rockInstanced.setColorAt(placedRocks, colorHelper);
      placedRocks++;
    }
    this.rockInstanced.count = placedRocks;
    this.rockInstanced.instanceMatrix.needsUpdate = true;
    if (this.rockInstanced.instanceColor) this.rockInstanced.instanceColor.needsUpdate = true;
    this.scene.add(this.rockInstanced);

    // -------------------------------------------------------------------------
    // 4. Glowing Crystal Resource Nodes (InstancedMesh)
    // -------------------------------------------------------------------------
    const maxCrystals = 48;
    const crystalGeo = new THREE.OctahedronGeometry(0.68, 0);
    crystalGeo.scale(0.75, 1.65, 0.75);
    crystalGeo.translate(0, 0.9, 0);

    this.crystalMaterial = new THREE.MeshStandardMaterial({
      color: 0x38e8ff,
      emissive: 0x00a8e8,
      emissiveIntensity: 1.25,
      roughness: 0.18,
      metalness: 0.65,
      flatShading: true,
    });

    this.crystalInstanced = new THREE.InstancedMesh(crystalGeo, this.crystalMaterial, maxCrystals);
    this.crystalInstanced.castShadow = false;

    let placedCrystals = 0;
    attempts = 0;
    while (placedCrystals < maxCrystals && attempts < maxCrystals * 8) {
      attempts++;
      const cx = rng.range(-this.size * 0.38, this.size * 0.38);
      const cz = rng.range(-this.size * 0.38, this.size * 0.38);
      const r = Math.hypot(cx, cz);
      if (r < this.bastionRadius + 6.5) continue;

      const ch = this.getHeightAt(cx, cz);
      if (ch < 0.9) continue;

      const biome = this.getBiomeAt(cx, cz);
      const scale = rng.range(0.85, 1.45);
      dummy.position.set(cx, ch - 0.1, cz);
      dummy.rotation.set(rng.range(-0.18, 0.18), rng.range(0, Math.PI * 2), rng.range(-0.18, 0.18));
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.crystalInstanced.setMatrixAt(placedCrystals, dummy.matrix);

      if (biome === 'volcanic') {
        colorHelper.setHex(0xff6b2b);
      } else {
        colorHelper.setHex(0x2ee6ff);
      }
      this.crystalInstanced.setColorAt(placedCrystals, colorHelper);

      this.resourceNodes.push({
        id: `crystal_${placedCrystals}`,
        type: 'crystal',
        x: cx,
        y: ch,
        z: cz,
        radius: 1.6 * scale,
        amount: 12,
        maxAmount: 12,
        depleted: false,
        instanceIndex: placedCrystals,
      });

      placedCrystals++;
    }
    this.crystalInstanced.count = placedCrystals;
    this.crystalInstanced.instanceMatrix.needsUpdate = true;
    if (this.crystalInstanced.instanceColor) this.crystalInstanced.instanceColor.needsUpdate = true;
    this.scene.add(this.crystalInstanced);
  }

  /**
   * Returns all harvestable resource nodes (`wood` and `crystal`) scattered across the island.
   *
   * @returns {Array<Object>}
   */
  getResourceNodes() {
    return this.resourceNodes;
  }

  /**
   * Finds the nearest non-depleted resource node within `maxDist` of `(x, z)`.
   *
   * @param {number} x - World X coordinate.
   * @param {number} z - World Z coordinate.
   * @param {number} [maxDist=5.5] - Maximum search distance.
   * @param {'wood'|'crystal'|null} [filterType=null] - Optional resource type filter.
   * @returns {Object|null} Nearest active resource node or null.
   */
  getNearestResourceNode(x, z, maxDist = 5.5, filterType = null) {
    let bestNode = null;
    let bestDist = maxDist;

    for (let i = 0; i < this.resourceNodes.length; i++) {
      const node = this.resourceNodes[i];
      if (node.depleted || node.amount <= 0) continue;
      if (filterType && node.type !== filterType) continue;

      const d = dist2D(x, z, node.x, node.z);
      if (d < bestDist) {
        bestDist = d;
        bestNode = node;
      }
    }

    return bestNode;
  }

  /**
   * Per-frame update for animated Ocean Gerstner waves, shoreline foam, foliage wind sway,
   * and crystal node luminescence.
   *
   * @param {number} dt - Frame delta time in seconds.
   * @param {number} elapsedTime - Total elapsed time in seconds.
   * @param {THREE.Vector3} [sunDirection] - Normalized sun direction vector from SceneManager.
   */
  update(dt, elapsedTime, sunDirection) {
    const t = elapsedTime || 0;

    if (this.waterMaterial) {
      this.waterMaterial.uniforms.uTime.value = t;
      if (sunDirection) {
        this.waterMaterial.uniforms.uSunDir.value.copy(sunDirection);
      }
    }

    if (this.waterCausticsTex) {
      this.waterCausticsTex.offset.x = (t * 0.018) % 1.0;
      this.waterCausticsTex.offset.y = (t * 0.014) % 1.0;
    }

    if (this.shorelineLagoonHalo && this.shorelineHaloMat) {
      const wavePulse = 1.0 + Math.sin(t * 2.1) * 0.015;
      this.shorelineLagoonHalo.scale.set(wavePulse, wavePulse, 1.0);
      this.shorelineHaloMat.opacity = 0.22 + Math.sin(t * 2.1) * 0.06;
    }

    for (let i = 0; i < this._windUniformsList.length; i++) {
      this._windUniformsList[i].uTime.value = t;
    }

    if (this.crystalMaterial) {
      this.crystalMaterial.emissiveIntensity = 1.15 + Math.sin(t * 3.2) * 0.35;
    }
  }
}

export default Terrain;
