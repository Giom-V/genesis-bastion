/**
 * @file src/world/VFXManager.js
 * @description 3D particle effects, DNA double-helix birth spirals, combat shockwaves,
 * juvenile-to-adult maturation rings, and Scout-triggered "Patient Zero" vertical sky-beam
 * beacons for Genesis Bastion.
 *
 * Key responsibilities:
 * - `spawnHitEffect(pos, colorHex)`: 3D spark burst + expanding planar shock ring.
 * - `spawnBirthEffect(pos, isMutant, isHybrid, colorHex)`: Rising intertwined DNA double-helix
 *   particle strands + ground bio-ring when newborn juvenile creatures (`lifeStage: 'baby'`) spawn.
 * - `spawnMaturationEffect(pos, colorHex)`: Ascending growth rings when a baby matures into an adult.
 * - `spawnDeathEffect(pos, colorHex)`: Shatter burst + rising ash/ember particles + dissipation ring.
 * - `setPatientZeroBeacon(enemyId, pos, colorHex, active)`: Vertical sky-beam column + pulsing
 *   concentric ground radar rings + rotating overhead diamond crest when a Scout spots a mutant
 *   or hybrid Patient Zero in the wilderness.
 */

import * as THREE from 'three';
import { clamp, lerp } from '../utils/math.js';
import { logger } from '../utils/logger.js';

/**
 * Vertex shader for the vertical Patient Zero Sky-Beam cylinder.
 */
const BEACON_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Fragment shader for the Patient Zero Sky-Beam cylinder:
 * - Soft edge Fresnel attenuation so the beam looks volumetric from any camera angle
 * - Vertical exponential fade toward the sky
 * - Upward-scrolling arcane/genetic scan bands
 */
const BEACON_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPulseBoost;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 V = normalize(vViewPosition);
    vec3 N = normalize(vNormal);

    // Core volumetric rim softness
    float viewDot = abs(dot(N, V));
    float core = pow(viewDot, 1.35);

    // Vertical fade from ground (vUv.y = 0) up into the sky (vUv.y = 1)
    float verticalFade = (1.0 - smoothstep(0.15, 0.98, vUv.y)) * smoothstep(0.0, 0.06, vUv.y);

    // Upward scrolling energy pulses
    float wave1 = 0.5 + 0.5 * sin(vUv.y * 28.0 - uTime * 5.5);
    float wave2 = 0.5 + 0.5 * sin(vUv.y * 11.0 - uTime * 2.4 + 1.7);
    float energy = 0.55 + 0.45 * (wave1 * 0.65 + wave2 * 0.35);

    float alpha = core * verticalFade * energy * (0.48 + uPulseBoost * 0.38);
    vec3 finalColor = uColor * (1.65 + uPulseBoost * 1.1 + wave1 * 0.5);

    gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 0.92));
  }
`;

export class VFXManager {
  /**
   * Initializes shared geometries and active VFX pools on the given Three.js scene.
   *
   * @param {THREE.Scene} scene - The Three.js scene to attach particles and beacons to.
   */
  constructor(scene) {
    /** @type {THREE.Scene} */
    this.scene = scene;

    /** @type {THREE.Group} Root container for transient particle effects */
    this.vfxGroup = new THREE.Group();
    this.vfxGroup.name = 'VFXContainer';
    this.scene.add(this.vfxGroup);

    /** @type {THREE.Group} Root container for persistent Patient Zero sky beacons */
    this.beaconGroup = new THREE.Group();
    this.beaconGroup.name = 'PatientZeroBeacons';
    this.scene.add(this.beaconGroup);

    /** @type {Array<Object>} Active burst particle systems */
    this.activeParticles = [];
    /** @type {Array<Object>} Active expanding ground/shock rings */
    this.activeRings = [];
    /** @type {Array<Object>} Active rising DNA double-helix birth spirals */
    this.activeHelices = [];
    /** @type {Map<string|number, Object>} Active Patient Zero beacons keyed by enemyId */
    this.patientZeroBeacons = new Map();

    // Shared reusable geometries (never disposed until shutdown)
    this._sparkGeo = new THREE.OctahedronGeometry(0.18, 0);
    this._helixNodeGeo = new THREE.SphereGeometry(0.15, 6, 6);
    this._ringGeo = new THREE.RingGeometry(0.55, 0.85, 28);
    this._ringGeo.rotateX(-Math.PI / 2);

    this._beamHeight = 52;
    this._beamGeo = new THREE.CylinderGeometry(0.65, 1.35, this._beamHeight, 20, 1, true);
    this._beamGeo.translate(0, this._beamHeight * 0.5, 0);

    this._outerBeamGeo = new THREE.CylinderGeometry(1.4, 2.2, this._beamHeight * 0.75, 20, 1, true);
    this._outerBeamGeo.translate(0, this._beamHeight * 0.375, 0);

    this._crestGeo = new THREE.OctahedronGeometry(0.75, 0);

    logger.info('WORLD', 'VFXManager initialized (3D particles, DNA birth helices & Patient Zero beacons)');
  }

  /**
   * Normalizes any position input (`THREE.Vector3`, `{x, y, z}`, or `{x, z}`) into `{x, y, z}`.
   *
   * @param {Object} pos - Input coordinate object.
   * @param {number} [defaultY=1.5] - Fallback Y coordinate if omitted.
   * @returns {{x: number, y: number, z: number}}
   * @private
   */
  _resolvePos(pos, defaultY = 1.5) {
    if (!pos) return { x: 0, y: defaultY, z: 0 };
    const x = typeof pos.x === 'number' ? pos.x : (pos.position?.x ?? 0);
    const z = typeof pos.z === 'number' ? pos.z : (pos.position?.z ?? 0);
    const y = typeof pos.y === 'number' ? pos.y : (pos.position?.y ?? defaultY);
    return { x, y, z };
  }

  /**
   * Spawns an expanding ground/planar shockwave ring at `pos`.
   *
   * @param {{x: number, y: number, z: number}} pos - World position.
   * @param {number|string} colorHex - Ring color.
   * @param {number} [startScale=0.5] - Initial scale.
   * @param {number} [endScale=3.2] - Final scale.
   * @param {number} [duration=0.45] - Lifetime in seconds.
   * @private
   */
  _spawnShockRing(pos, colorHex, startScale = 0.5, endScale = 3.2, duration = 0.45) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(this._ringGeo, mat);
    mesh.position.set(pos.x, pos.y + 0.12, pos.z);
    mesh.scale.setScalar(startScale);
    this.vfxGroup.add(mesh);

    this.activeRings.push({
      mesh,
      mat,
      age: 0,
      duration,
      startScale,
      endScale,
    });
  }

  /**
   * Spawns a burst of 3D emissive sparks + a planar shock ring on combat hit.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} pos - Impact world position.
   * @param {number|string} [colorHex=0xffaa33] - Effect color hex or CSS color.
   */
  spawnHitEffect(pos, colorHex = 0xffaa33) {
    const p = this._resolvePos(pos, 1.8);
    const baseColor = new THREE.Color(colorHex);

    this._spawnShockRing({ x: p.x, y: p.y - 0.5, z: p.z }, baseColor, 0.4, 2.6, 0.32);

    const count = 12;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: baseColor.clone().offsetHSL((Math.random() - 0.5) * 0.06, 0, Math.random() * 0.2),
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(this._sparkGeo, mat);
      mesh.position.set(p.x, p.y + 0.4, p.z);

      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 4.5 + Math.random() * 6.5;
      const vy = 2.5 + Math.random() * 5.0;

      this.vfxGroup.add(mesh);
      this.activeParticles.push({
        mesh,
        mat,
        vx: Math.cos(angle) * speed,
        vy,
        vz: Math.sin(angle) * speed,
        gravity: -15.0,
        drag: 2.5,
        age: 0,
        duration: 0.35 + Math.random() * 0.22,
        initialScale: 0.8 + Math.random() * 0.6,
      });
    }
  }

  /**
   * Spawns a rising DNA double-helix particle spiral + evolutionary ground ring
   * when two parent creatures reproduce and spawn a Baby offspring.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} pos - Birth world position.
   * @param {boolean} [isMutant=false] - True if the newborn carries a dominant mutation.
   * @param {boolean} [isHybrid=false] - True if the newborn is an inter-species hybrid.
   * @param {number|string} [colorHex=0x44ff88] - Primary lineage color.
   */
  spawnBirthEffect(pos, isMutant = false, isHybrid = false, colorHex = 0x44ff88) {
    const p = this._resolvePos(pos, 1.8);
    const primaryCol = new THREE.Color(colorHex);
    const secondaryCol = isMutant
      ? new THREE.Color(0xff4500)
      : isHybrid
        ? new THREE.Color(0x00e5ff)
        : primaryCol.clone().offsetHSL(0.12, 0, 0.15);

    const ringScale = isMutant || isHybrid ? 4.8 : 3.1;
    const duration = isMutant || isHybrid ? 1.35 : 0.95;

    this._spawnShockRing(p, primaryCol, 0.35, ringScale, duration * 0.75);
    if (isMutant || isHybrid) {
      this._spawnShockRing({ x: p.x, y: p.y + 0.3, z: p.z }, secondaryCol, 0.2, ringScale * 1.25, duration);
    }

    // Build a double-helix group of rising nucleotide nodes
    const helixGroup = new THREE.Group();
    helixGroup.position.set(p.x, p.y, p.z);

    const pairsCount = isMutant || isHybrid ? 10 : 7;
    const nodes = [];
    const radius = isMutant || isHybrid ? 1.15 : 0.82;

    for (let i = 0; i < pairsCount; i++) {
      const frac = i / pairsCount;
      const phase = frac * Math.PI * 3.0;

      for (let strand = 0; strand < 2; strand++) {
        const strandAngle = phase + strand * Math.PI;
        const mat = new THREE.MeshBasicMaterial({
          color: strand === 0 ? primaryCol : secondaryCol,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const nodeMesh = new THREE.Mesh(this._helixNodeGeo, mat);
        nodeMesh.position.set(
          Math.cos(strandAngle) * radius,
          frac * 3.2,
          Math.sin(strandAngle) * radius
        );
        const s = isMutant || isHybrid ? 1.25 : 0.95;
        nodeMesh.scale.setScalar(s);
        helixGroup.add(nodeMesh);
        nodes.push({ mesh: nodeMesh, mat, baseAngle: strandAngle, baseFrac: frac });
      }
    }

    this.vfxGroup.add(helixGroup);
    this.activeHelices.push({
      group: helixGroup,
      nodes,
      radius,
      age: 0,
      duration,
      riseSpeed: isMutant || isHybrid ? 3.8 : 2.6,
      spinSpeed: isMutant || isHybrid ? 6.2 : 4.4,
    });
  }

  /**
   * Spawns an ascending golden maturation halo when a Juvenile (Baby) monster
   * reaches adulthood (`lifeStage: 'adult'`) and becomes capable of reproduction.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} pos - Monster world position.
   * @param {number|string} [colorHex=0xffcc44] - Aura color.
   */
  spawnMaturationEffect(pos, colorHex = 0xffcc44) {
    const p = this._resolvePos(pos, 1.8);
    this._spawnShockRing(p, colorHex, 0.5, 3.6, 0.65);
    this._spawnShockRing({ x: p.x, y: p.y + 0.9, z: p.z }, colorHex, 0.35, 2.8, 0.75);
  }

  /**
   * Spawns a shatter burst + rising ember/ash particles + ground dissipation ring upon creature death.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} pos - Death world position.
   * @param {number|string} [colorHex=0xaa2222] - Primary burst color.
   */
  spawnDeathEffect(pos, colorHex = 0xaa2222) {
    const p = this._resolvePos(pos, 1.8);
    const baseColor = new THREE.Color(colorHex);
    const emberColor = new THREE.Color(0xff7722);

    this._spawnShockRing(p, baseColor, 0.5, 3.8, 0.55);

    const count = 18;
    for (let i = 0; i < count; i++) {
      const isEmber = i % 3 === 0;
      const mat = new THREE.MeshBasicMaterial({
        color: isEmber ? emberColor : baseColor.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.15),
        transparent: true,
        opacity: 0.95,
        blending: isEmber ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(this._sparkGeo, mat);
      mesh.position.set(
        p.x + (Math.random() - 0.5) * 0.8,
        p.y + 0.5 + Math.random() * 0.8,
        p.z + (Math.random() - 0.5) * 0.8
      );

      const angle = Math.random() * Math.PI * 2;
      const horizSpeed = isEmber ? 1.2 + Math.random() * 2.5 : 3.5 + Math.random() * 6.0;
      const vy = isEmber ? 3.5 + Math.random() * 4.5 : 2.0 + Math.random() * 4.5;

      this.vfxGroup.add(mesh);
      this.activeParticles.push({
        mesh,
        mat,
        vx: Math.cos(angle) * horizSpeed,
        vy,
        vz: Math.sin(angle) * horizSpeed,
        gravity: isEmber ? 1.5 : -12.0, // Embers float upward!
        drag: 1.8,
        age: 0,
        duration: 0.55 + Math.random() * 0.45,
        initialScale: isEmber ? 0.75 : 1.15,
      });
    }
  }

  /**
   * Optional helper for harvesting wood/crystal nodes or healing at the Bastion.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} pos - World position.
   * @param {number|string} [colorHex=0x38ff88] - Burst color.
   */
  spawnHealEffect(pos, colorHex = 0x38ff88) {
    this.spawnBirthEffect(pos, false, false, colorHex);
  }

  /**
   * Creates, updates, or removes a dramatic vertical 3D Sky-Beam Beacon + pulsing ground
   * radar target ring when a Scout spots a mutant or hybrid "Patient Zero" in the wilderness.
   *
   * @param {string|number} enemyId - Unique identifier of the Patient Zero enemy.
   * @param {THREE.Vector3|{x: number, y?: number, z: number}|null} pos - World position of the enemy.
   * @param {number|string} [colorHex=0xff3300] - Threat beacon color (e.g. `0xff4500` for Fire Troll).
   * @param {boolean} [active=true] - Whether the beacon should be active or removed.
   */
  setPatientZeroBeacon(enemyId, pos, colorHex = 0xff3300, active = true) {
    if (enemyId === undefined || enemyId === null) return;

    if (!active || !pos) {
      this.removePatientZeroBeacon(enemyId);
      return;
    }

    const p = this._resolvePos(pos, 1.8);
    const beaconColor = new THREE.Color(colorHex || 0xff3300);

    let beacon = this.patientZeroBeacons.get(enemyId);
    if (!beacon) {
      const root = new THREE.Group();
      root.position.set(p.x, p.y, p.z);

      // 1. Primary volumetric vertical sky-beam cylinder
      const beamMat = new THREE.ShaderMaterial({
        vertexShader: BEACON_VERTEX_SHADER,
        fragmentShader: BEACON_FRAGMENT_SHADER,
        uniforms: {
          uColor: { value: beaconColor.clone() },
          uTime: { value: 0 },
          uPulseBoost: { value: 1.0 }, // High initial discovery flash
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const beamMesh = new THREE.Mesh(this._beamGeo, beamMat);

      // 2. Secondary wider aura column
      const outerMat = new THREE.ShaderMaterial({
        vertexShader: BEACON_VERTEX_SHADER,
        fragmentShader: BEACON_FRAGMENT_SHADER,
        uniforms: {
          uColor: { value: beaconColor.clone().offsetHSL(0.03, 0, 0.1) },
          uTime: { value: 1.5 },
          uPulseBoost: { value: 0.6 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const outerMesh = new THREE.Mesh(this._outerBeamGeo, outerMat);

      // 3. Concentric ground radar target rings
      const innerRingMat = new THREE.MeshBasicMaterial({
        color: beaconColor.clone(),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const innerRing = new THREE.Mesh(this._ringGeo, innerRingMat);
      innerRing.position.y = 0.16;
      innerRing.scale.setScalar(2.6);

      const outerRingMat = new THREE.MeshBasicMaterial({
        color: beaconColor.clone(),
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const outerRing = new THREE.Mesh(this._ringGeo, outerRingMat);
      outerRing.position.y = 0.18;
      outerRing.scale.setScalar(4.2);

      // 4. Floating overhead rotating diamond threat crest
      const crestMat = new THREE.MeshBasicMaterial({
        color: beaconColor.clone().lerp(new THREE.Color(0xffffff), 0.35),
        wireframe: false,
        transparent: true,
        opacity: 0.95,
      });
      const crestMesh = new THREE.Mesh(this._crestGeo, crestMat);
      crestMesh.position.y = 5.6;
      crestMesh.scale.set(0.85, 1.45, 0.85);

      root.add(beamMesh);
      root.add(outerMesh);
      root.add(innerRing);
      root.add(outerRing);
      root.add(crestMesh);

      this.beaconGroup.add(root);

      beacon = {
        enemyId,
        root,
        beamMat,
        outerMat,
        innerRing,
        innerRingMat,
        outerRing,
        outerRingMat,
        crestMesh,
        crestMat,
        color: beaconColor,
        highlightTimer: 1.5, // Starts with a 1.5s discovery pulse
      };
      this.patientZeroBeacons.set(enemyId, beacon);

      // Spawn an immediate ground radar burst on initial discovery
      this._spawnShockRing(p, beaconColor, 0.8, 8.5, 0.85);

      logger.info('WORLD', `Patient Zero 3D Sky Beacon activated for entity ${enemyId}`, {
        enemyId,
        x: Math.round(p.x),
        z: Math.round(p.z),
      });
    } else {
      beacon.root.position.set(p.x, p.y, p.z);
      beacon.color.copy(beaconColor);
      beacon.beamMat.uniforms.uColor.value.copy(beaconColor);
      beacon.outerMat.uniforms.uColor.value.copy(beaconColor);
      beacon.innerRingMat.color.copy(beaconColor);
      beacon.outerRingMat.color.copy(beaconColor);
    }
  }

  /**
   * Removes and disposes a specific Patient Zero sky beacon by `enemyId`.
   *
   * @param {string|number} enemyId - Identifier of the enemy whose beacon should be removed.
   */
  removePatientZeroBeacon(enemyId) {
    const beacon = this.patientZeroBeacons.get(enemyId);
    if (!beacon) return;

    this.beaconGroup.remove(beacon.root);
    beacon.beamMat.dispose();
    beacon.outerMat.dispose();
    beacon.innerRingMat.dispose();
    beacon.outerRingMat.dispose();
    beacon.crestMat.dispose();
    this.patientZeroBeacons.delete(enemyId);
  }

  /**
   * Triggers a high-intensity radar pulse on an existing Patient Zero beacon
   * (e.g. when the user clicks a mutant lineage in the HUD).
   *
   * @param {string|number} enemyId - Target enemy identifier.
   */
  highlightBeacon(enemyId) {
    const beacon = this.patientZeroBeacons.get(enemyId);
    if (!beacon) return;
    beacon.highlightTimer = 2.0;
    this._spawnShockRing(beacon.root.position, beacon.color, 1.0, 10.0, 0.9);
  }

  /**
   * Removes all active Patient Zero beacons.
   */
  clearAllBeacons() {
    for (const enemyId of Array.from(this.patientZeroBeacons.keys())) {
      this.removePatientZeroBeacon(enemyId);
    }
  }

  /**
   * Per-frame update for all active particle bursts, shock rings, DNA double-helices,
   * and Patient Zero sky beacons.
   *
   * @param {number} dt - Frame delta time in seconds.
   * @param {number} elapsedTime - Total elapsed time in seconds.
   */
  update(dt, elapsedTime) {
    const safeDt = clamp(dt || 0.016, 0.001, 0.1);
    const t = elapsedTime || 0;

    // 1. Update burst particles
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.age += safeDt;
      if (p.age >= p.duration) {
        this.vfxGroup.remove(p.mesh);
        p.mat.dispose();
        this.activeParticles.splice(i, 1);
        continue;
      }

      const progress = p.age / p.duration;
      const damp = Math.max(0, 1.0 - p.drag * safeDt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy += p.gravity * safeDt;

      p.mesh.position.x += p.vx * safeDt;
      p.mesh.position.y += p.vy * safeDt;
      p.mesh.position.z += p.vz * safeDt;
      p.mesh.rotation.x += 6.0 * safeDt;
      p.mesh.rotation.y += 5.0 * safeDt;

      const scale = p.initialScale * (1.0 - progress * 0.75);
      p.mesh.scale.setScalar(Math.max(0.05, scale));
      p.mat.opacity = 1.0 - progress * progress;
    }

    // 2. Update expanding shock & ground rings
    for (let i = this.activeRings.length - 1; i >= 0; i--) {
      const r = this.activeRings[i];
      r.age += safeDt;
      if (r.age >= r.duration) {
        this.vfxGroup.remove(r.mesh);
        r.mat.dispose();
        this.activeRings.splice(i, 1);
        continue;
      }

      const progress = r.age / r.duration;
      const eased = 1.0 - Math.pow(1.0 - progress, 2.2);
      const currentScale = lerp(r.startScale, r.endScale, eased);
      r.mesh.scale.setScalar(currentScale);
      r.mat.opacity = (1.0 - progress) * 0.85;
    }

    // 3. Update rising DNA double-helix birth spirals
    for (let i = this.activeHelices.length - 1; i >= 0; i--) {
      const h = this.activeHelices[i];
      h.age += safeDt;
      if (h.age >= h.duration) {
        this.vfxGroup.remove(h.group);
        for (let j = 0; j < h.nodes.length; j++) {
          h.nodes[j].mat.dispose();
        }
        this.activeHelices.splice(i, 1);
        continue;
      }

      const progress = h.age / h.duration;
      h.group.position.y += h.riseSpeed * safeDt;
      h.group.rotation.y += h.spinSpeed * safeDt;

      const fade = 1.0 - Math.pow(progress, 1.8);
      for (let j = 0; j < h.nodes.length; j++) {
        h.nodes[j].mat.opacity = fade;
      }
    }

    // 4. Update active Patient Zero sky beacons
    for (const beacon of this.patientZeroBeacons.values()) {
      beacon.highlightTimer = Math.max(0, beacon.highlightTimer - safeDt);
      const pulseBoost = beacon.highlightTimer > 0 ? beacon.highlightTimer * 0.65 : 0.15 * (0.5 + 0.5 * Math.sin(t * 4.0));

      beacon.beamMat.uniforms.uTime.value = t;
      beacon.beamMat.uniforms.uPulseBoost.value = pulseBoost;
      beacon.outerMat.uniforms.uTime.value = -t * 0.75;
      beacon.outerMat.uniforms.uPulseBoost.value = pulseBoost * 0.7;

      // Expanding radar waves on the ground
      const radarCycle1 = (t * 0.95) % 1.0;
      const radarCycle2 = (t * 0.95 + 0.5) % 1.0;
      beacon.innerRing.scale.setScalar(lerp(1.4, 5.8, radarCycle1));
      beacon.innerRingMat.opacity = (1.0 - radarCycle1) * 0.82;

      beacon.outerRing.scale.setScalar(lerp(1.4, 5.8, radarCycle2));
      beacon.outerRingMat.opacity = (1.0 - radarCycle2) * 0.82;

      // Floating diamond threat crest rotation & bobbing
      beacon.crestMesh.rotation.y = t * 2.8;
      beacon.crestMesh.position.y = 5.5 + Math.sin(t * 3.6) * 0.45;
    }
  }
}

export default VFXManager;
