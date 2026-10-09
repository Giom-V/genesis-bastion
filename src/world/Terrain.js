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
    offset += gerstnerWave(xz, 0.07, 6.4, vec2(-0.7, 0.65), uTime * 1.55, tangent, binormal);
    offset += gerstnerWave(xz, 0.04, 3.3, vec2(0.85, -0.5), uTime * 1.90, tangent, binormal);

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

  // Procedural dual-layer aquatic caustics pattern
  float causticsPattern(vec2 xz, float time) {
    vec2 uv1 = xz * 0.34 + vec2(time * 0.18, -time * 0.14);
    vec2 uv2 = xz * 0.41 + vec2(-time * 0.15, time * 0.21);
    float n1 = abs(vNoise(uv1) - 0.5) * 2.0;
    float n2 = abs(vNoise(uv2) - 0.5) * 2.0;
    float c = pow(1.0 - min(n1, n2), 3.5);
    return c;
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
    vec3 N = normalize(vNormal + vec3((r1 - 0.5) * 0.14, 0.0, (r2 - 0.5) * 0.14));

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunDir);

    // Depth-based water color absorption (Tidewater turquoise shallows -> deep sapphire abyss)
    vec3 shallowColor = vec3(0.14, 0.68, 0.72);
    vec3 midColor = vec3(0.05, 0.34, 0.54);
    vec3 deepColor = vec3(0.02, 0.12, 0.25);

    float shallowFactor = exp(-depth * 0.55);
    float deepFactor = clamp(depth / 5.2, 0.0, 1.0);
    vec3 waterCol = mix(midColor, shallowColor, shallowFactor);
    waterCol = mix(waterCol, deepColor, deepFactor);

    // Seabed caustics shimmer in shallow water
    float caustics = causticsPattern(vWorldPos.xz, uTime);
    float causticsMask = shallowFactor * (1.0 - smoothstep(3.2, 5.0, depth)) * max(0.15, L.y);
    waterCol += vec3(0.32, 0.85, 0.92) * caustics * causticsMask * 0.55;

    // Fresnel sky reflection
    float NoV = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - NoV, 4.2);
    vec3 skyReflect = mix(vec3(0.06, 0.14, 0.26), vec3(0.48, 0.74, 0.94), clamp(L.y + 0.25, 0.0, 1.0));
    waterCol = mix(waterCol, skyReflect, fresnel * 0.58);

    // Sun specular glitter on wave crests
    vec3 H = normalize(L + V);
    float spec = pow(max(0.0, dot(N, H)), 140.0) * max(0.0, L.y);
    waterCol += vec3(1.5, 1.35, 1.05) * spec * 0.85;

    // Animated shoreline foam bands where depth is small
    float foamNoise = vNoise(vWorldPos.xz * 0.65 + vec2(uTime * 0.4, -uTime * 0.3));
    float shoreWave = sin(depth * 5.8 - uTime * 3.2 + foamNoise * 2.5);
    float primaryShoreFoam = smoothstep(0.55, 0.0, depth) * 0.95;
    float secondaryBandFoam = smoothstep(1.65, 0.25, depth) * smoothstep(0.35, 0.85, shoreWave) * 0.72;
    float crestFoam = smoothstep(0.22, 0.36, vWorldPos.y - uWaterLevel) * foamNoise * 0.45;
    float totalFoam = clamp(max(primaryShoreFoam, secondaryBandFoam) + crestFoam, 0.0, 1.0);

    vec3 foamColor = vec3(0.92, 0.97, 1.0) * max(0.35, clamp(L.y + 0.45, 0.35, 1.1));
    waterCol = mix(waterCol, foamColor, totalFoam);

    // Soft alpha feathering at the very edge of wet sand
    float alpha = clamp(smoothstep(0.0, 0.14, depth) * 0.92 + totalFoam * 0.5, 0.0, 0.96);

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
    this.segments = 160;
    /** @type {number} */
    this.waterLevel = CONFIG?.WORLD?.WATER_LEVEL ?? -1.2;
    /** @type {number} */
    this.bastionRadius = CONFIG?.BASTION?.RADIUS ?? 14;

    /** @type {Array<{id: string, type: 'wood'|'crystal', x: number, y: number, z: number, radius: number, amount: number, maxAmount: number, depleted: boolean, instanceIndex: number}>} */
    this.resourceNodes = [];

    /** @type {Array<{uTime: {value: number}}>} Shared wind shader uniforms for foliage */
    this._windUniformsList = [];

    this._buildIslandMesh();
    this._buildOceanPlane();
    this._populateInstancedProps();

    logger.info('WORLD', 'Terrain & Ocean generated', {
      size: `${this.size}x${this.size}`,
      segments: `${this.segments}x${this.segments}`,
      resourceNodes: this.resourceNodes.length,
    });
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
   * Exact analytical terrain elevation function at world coordinates `(x, z)`.
   * Used both during vertex buffer construction and runtime entity grounding so
   * creatures, NPCs, structures, and the Player never float or sink.
   *
   * @param {number} x - World X coordinate.
   * @param {number} z - World Z coordinate.
   * @returns {number} Terrain height Y in world units.
   */
  getHeightAt(x, z) {
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
   * Determines the ecological biome classification at world coordinates `(x, z)`.
   *
   * @param {number} x - World X coordinate.
   * @param {number} z - World Z coordinate.
   * @returns {'beach' | 'plains' | 'forest' | 'highlands' | 'volcanic'} Biome identifier.
   */
  getBiomeAt(x, z) {
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
   * Generates the `240x240` (`160x160` segments) island terrain mesh with multi-biome
   * vertex colors, cliff slope shading, Bastion stone cobble sanctuary ring, and
   * volcanic ember veins.
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

    // Biome palette colors
    const colWetSand = new THREE.Color(0x8c7656);
    const colDrySand = new THREE.Color(0xdcc694);
    const colPlains = new THREE.Color(0x4f8f43);
    const colLushGrass = new THREE.Color(0x63a64b);
    const colForest = new THREE.Color(0x285c34);
    const colHighlands = new THREE.Color(0x676b70);
    const colCliffRock = new THREE.Color(0x4b4e54);
    const colVolcanicRock = new THREE.Color(0x231f24);
    const colMagmaVein = new THREE.Color(0xd93814);
    const colBastionStone = new THREE.Color(0x7c786e);

    const tempColor = new THREE.Color();

    // Second pass: compute rich vertex colors blending biome, elevation, slope, and micro-noise
    for (let i = 0; i < vertexCount; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      const ny = normAttr.getY(i);
      const slope = 1.0 - clamp(ny, 0.0, 1.0);
      const r = Math.hypot(vx, vz);

      const micro = noise2D(vx * 0.14, vz * 0.14) * 0.08;
      const biome = this.getBiomeAt(vx, vz);
      const { mask: volcanicMask } = this._getVolcanicField(vx, vz);

      if (vy < 0.75) {
        const wetFactor = this._smoothstep(this.waterLevel - 0.5, 0.65, vy);
        tempColor.copy(colWetSand).lerp(colDrySand, wetFactor);
      } else if (biome === 'forest') {
        tempColor.copy(colForest).lerp(colPlains, clamp(micro * 2.5 + 0.2, 0.0, 0.5));
      } else if (biome === 'highlands') {
        tempColor.copy(colPlains).lerp(colHighlands, this._smoothstep(4.0, 7.2, vy));
      } else {
        tempColor.copy(colPlains).lerp(colLushGrass, clamp(0.5 + micro * 4.0, 0.0, 1.0));
      }

      // Smooth coastal beach-to-grass transition
      if (vy >= 0.55 && vy < 1.35) {
        const grassBlend = this._smoothstep(0.55, 1.35, vy);
        tempColor.lerp(colDrySand, 1.0 - grassBlend);
      }

      // Steep slopes expose rocky cliff strata
      const cliffBlend = this._smoothstep(0.20, 0.46, slope);
      tempColor.lerp(colCliffRock, cliffBlend);

      // Volcanic basalt & glowing magma fissures in NE/NW caldera
      if (volcanicMask > 0.05) {
        tempColor.lerp(colVolcanicRock, clamp(volcanicMask * 1.15, 0.0, 1.0));
        const fissureNoise = Math.abs(noise2D(vx * 0.18, vz * 0.18));
        if (volcanicMask > 0.45 && fissureNoise < 0.11 && vy > 1.2) {
          const glowStrength = (1.0 - fissureNoise / 0.11) * volcanicMask;
          tempColor.lerp(colMagmaVein, glowStrength * 0.85);
        }
      }

      // Central Bastion Sanctuary stone courtyard & golden ring path
      if (r < this.bastionRadius + 2.5) {
        const sanctuaryBlend = 1.0 - this._smoothstep(this.bastionRadius - 2.5, this.bastionRadius + 2.5, r);
        tempColor.lerp(colBastionStone, sanctuaryBlend * 0.72);
      }

      tempColor.offsetHSL(0, 0, micro * 0.35);
      colors[i * 3] = clamp(tempColor.r, 0, 1);
      colors[i * 3 + 1] = clamp(tempColor.g, 0, 1);
      colors[i * 3 + 2] = clamp(tempColor.b, 0, 1);
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: false,
    });

    this.mesh = new THREE.Mesh(geo, this.terrainMaterial);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
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
   * Builds the animated Ocean Water Plane (`THREE.ShaderMaterial`) with Gerstner waves,
   * shoreline foam, Fresnel sky reflections, and shallow seabed caustics.
   * @private
   */
  _buildOceanPlane() {
    const heightTex = this._createHeightDataTexture();
    const waterGeo = new THREE.PlaneGeometry(820, 820, 180, 180);
    waterGeo.rotateX(-Math.PI / 2);

    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: WATER_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.45, 0.72, 0.52).normalize() },
        uHeightTex: { value: heightTex },
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
   * 1. Wind-swaying grass clumps (`750` instances)
   * 2. Stylized low-poly pine & broadleaf trees (`170` instances, registered as wood nodes)
   * 3. Rugged boulders & volcanic crags (`110` instances)
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
    const grassCount = 750;
    const grassGeo = new THREE.ConeGeometry(0.28, 0.95, 4);
    grassGeo.translate(0, 0.45, 0);
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02,
    });
    this._applyWindShader(grassMat, 0.26, 0.05);

    this.grassInstanced = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    this.grassInstanced.receiveShadow = true;

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
        colorHelper.setHex(0x2e6e38).offsetHSL(rng.range(-0.03, 0.03), 0, rng.range(-0.05, 0.06));
      } else {
        colorHelper.setHex(0x5da146).offsetHSL(rng.range(-0.04, 0.05), 0, rng.range(-0.05, 0.08));
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
    const maxTrees = 175;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.36, 1.8, 6);
    trunkGeo.translate(0, 0.9, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c3e26,
      roughness: 0.9,
    });

    const canopyGeo = new THREE.ConeGeometry(1.45, 3.4, 7);
    canopyGeo.translate(0, 3.0, 0);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.76,
    });
    this._applyWindShader(canopyMat, 0.16, 1.4);

    this.treeTrunkInstanced = new THREE.InstancedMesh(trunkGeo, trunkMat, maxTrees);
    this.treeCanopyInstanced = new THREE.InstancedMesh(canopyGeo, canopyMat, maxTrees);
    this.treeTrunkInstanced.castShadow = true;
    this.treeTrunkInstanced.receiveShadow = true;
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
        colorHelper.setHex(0x235932).offsetHSL(rng.range(-0.03, 0.04), 0.05, rng.range(-0.04, 0.06));
      } else if (biome === 'highlands') {
        colorHelper.setHex(0x2f5446).offsetHSL(rng.range(-0.02, 0.02), 0, rng.range(-0.04, 0.04));
      } else {
        colorHelper.setHex(0x417d38).offsetHSL(rng.range(-0.04, 0.06), 0, rng.range(-0.03, 0.06));
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
    const maxRocks = 115;
    const rockGeo = new THREE.DodecahedronGeometry(0.95, 1);
    rockGeo.translate(0, 0.45, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.12,
      flatShading: true,
    });

    this.rockInstanced = new THREE.InstancedMesh(rockGeo, rockMat, maxRocks);
    this.rockInstanced.castShadow = true;
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
        colorHelper.setHex(0x2b2429).offsetHSL(0, 0, rng.range(-0.04, 0.04));
      } else {
        colorHelper.setHex(0x6e737b).offsetHSL(0, 0, rng.range(-0.08, 0.08));
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
    this.crystalInstanced.castShadow = true;

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

    for (let i = 0; i < this._windUniformsList.length; i++) {
      this._windUniformsList[i].uTime.value = t;
    }

    if (this.crystalMaterial) {
      this.crystalMaterial.emissiveIntensity = 1.15 + Math.sin(t * 3.2) * 0.35;
    }
  }
}

export default Terrain;
