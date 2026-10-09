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
    /** @type {Array<Object>} Active 3D lightning & siphon tether beams */
    this.activeBeams = [];
    /** @type {Array<Object>} Active 3D spell projectiles (frost spears, venom daggers, meteors, soul orbs) */
    this.activeProjectiles = [];
    /** @type {Map<string|number, Object>} Active Patient Zero beacons keyed by enemyId */
    this.patientZeroBeacons = new Map();

    // Shared reusable geometries (never disposed until shutdown)
    this._sparkGeo = new THREE.OctahedronGeometry(0.18, 0);
    this._helixNodeGeo = new THREE.SphereGeometry(0.15, 6, 6);
    this._ringGeo = new THREE.RingGeometry(0.55, 0.85, 28);
    this._ringGeo.rotateX(-Math.PI / 2);

    // Shared 3D geometries for the 8 Roguelike Abilities
    this._spearGeo = new THREE.ConeGeometry(0.24, 1.9, 6);
    this._spearGeo.rotateX(Math.PI / 2);
    this._daggerGeo = new THREE.ConeGeometry(0.15, 0.95, 4);
    this._daggerGeo.rotateX(Math.PI / 2);
    this._meteorGeo = new THREE.DodecahedronGeometry(1.15, 1);
    this._spikeGeo = new THREE.ConeGeometry(0.36, 1.65, 5);
    this._spikeGeo.translate(0, 0.8, 0);
    this._domeGeo = new THREE.SphereGeometry(1.0, 20, 14);

    this._beamHeight = 52;
    this._beamGeo = new THREE.CylinderGeometry(0.65, 1.35, this._beamHeight, 20, 1, true);
    this._beamGeo.translate(0, this._beamHeight * 0.5, 0);

    this._outerBeamGeo = new THREE.CylinderGeometry(1.4, 2.2, this._beamHeight * 0.75, 20, 1, true);
    this._outerBeamGeo.translate(0, this._beamHeight * 0.375, 0);

    this._crestGeo = new THREE.OctahedronGeometry(0.75, 0);

    logger.info('WORLD', 'VFXManager initialized (3D particles, DNA helices, Patient Zero beacons & 8 Roguelike Ability VFX)');
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
   * Creates, moves, or hides a golden 3D tutorial objective beacon (used in Onboarding Acts 1–6).
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}|null} pos - Target world position.
   * @param {boolean} [active=true] - Whether the tutorial waypoint should be visible.
   * @param {number|string} [colorHex=0xffd166] - Waypoint glow color.
   */
  setTutorialWaypoint(pos, active = true, colorHex = 0xffd166) {
    this.setPatientZeroBeacon('__tutorial_waypoint__', pos, colorHex, active);
  }

  /**
   * Creates, updates, or removes a golden 3D sky beacon on a Prisoner Cage discovered by a Scout
   * during the `'find_cages'` mission.
   *
   * @param {string|number} cageId - Unique cage identifier.
   * @param {THREE.Vector3|{x: number, y?: number, z: number}|null} pos - World position of the cage.
   * @param {boolean} [active=true] - True while the cage is discovered and not yet rescued.
   * @param {number|string} [colorHex=0xffd166] - Golden rescue beacon color.
   */
  setCageBeacon(cageId, pos, active = true, colorHex = 0xffd166) {
    this.setPatientZeroBeacon(`cage_${cageId}`, pos, colorHex, active);
  }

  /**
   * Spawns a golden construction shockwave & rising spark column when a Bastion building
   * is constructed or upgraded (`Niv. 0 -> 1 -> 2 -> 3`).
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} pos - Building pad world position.
   * @param {number|string} [colorHex=0xe6a145] - Construction highlight color.
   */
  spawnBuildEffect(pos, colorHex = 0xe6a145) {
    const p = this._resolvePos(pos, 2.2);
    this._spawnShockRing(p, colorHex, 0.8, 5.2, 0.55);
    this._spawnShockRing({ x: p.x, y: p.y + 0.6, z: p.z }, 0xffd700, 0.5, 4.0, 0.65);
    this.spawnBirthEffect(p, true, false, colorHex);
  }

  /**
   * Alias for `spawnBuildEffect(pos, colorHex)` when upgrading a Bastion structure.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} pos - Building pad world position.
   * @param {number|string} [colorHex=0xffd700] - Upgrade highlight color.
   */
  spawnUpgradeEffect(pos, colorHex = 0xffd700) {
    this.spawnBuildEffect(pos, colorHex);
  }

  /**
   * Normalizes `targetsOrTargetPos` into an array of `{x, y, z}` positions.
   *
   * @param {Array<Object>|Object|null} targetsOrTargetPos - Single target or array of targets/positions.
   * @param {number} [defaultY=1.8] - Fallback Y coordinate.
   * @returns {Array<{x: number, y: number, z: number}>}
   * @private
   */
  _resolveTargetsList(targetsOrTargetPos, defaultY = 1.8) {
    if (!targetsOrTargetPos) return [];
    if (Array.isArray(targetsOrTargetPos)) {
      const list = [];
      for (let i = 0; i < targetsOrTargetPos.length; i++) {
        const item = targetsOrTargetPos[i];
        if (item) list.push(this._resolvePos(item, defaultY));
      }
      return list;
    }
    if (typeof targetsOrTargetPos === 'object') {
      return [this._resolvePos(targetsOrTargetPos, defaultY)];
    }
    return [];
  }

  /**
   * Spawns a jagged 3D lightning or siphon energy beam between `startPos` and `endPos`.
   *
   * @param {{x: number, y: number, z: number}} startPos - Origin 3D point.
   * @param {{x: number, y: number, z: number}} endPos - Destination 3D point.
   * @param {number|string} colorHex - Beam color.
   * @param {number} [jitterAmp=0.55] - Perpendicular lightning jitter amplitude.
   * @param {number} [duration=0.30] - Lifetime in seconds.
   * @private
   */
  _spawnEnergyBeam(startPos, endPos, colorHex = 0x55eeff, jitterAmp = 0.55, duration = 0.30) {
    const segments = 9;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const jitter = i === 0 || i === segments ? 0 : Math.sin(t * Math.PI) * jitterAmp;
      points.push(
        new THREE.Vector3(
          lerp(startPos.x, endPos.x, t) + (Math.random() - 0.5) * jitter * 2.0,
          lerp(startPos.y, endPos.y, t) + (Math.random() - 0.5) * jitter * 1.4,
          lerp(startPos.z, endPos.z, t) + (Math.random() - 0.5) * jitter * 2.0
        )
      );
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.vfxGroup.add(line);

    this.activeBeams.push({
      line,
      geo,
      mat,
      startPos: { ...startPos },
      endPos: { ...endPos },
      segments,
      jitterAmp,
      age: 0,
      duration,
    });
  }

  /**
   * Unified dispatcher for all 8 Roguelike 3D Abilities & Adaptive Mastery rank-ups.
   *
   * Supported `abilityId` values:
   * - `'pyro_nova'` (Nova Pyroclastique)
   * - `'chain_lightning'` (Arc Foudroyant)
   * - `'frost_spear'` (Javelot Cryogénique)
   * - `'venom_volley'` (Salve Venimeuse)
   * - `'meteor_strike'` (Météore d'Ambre)
   * - `'soul_siphon'` (Siphon Vampirique)
   * - `'seismic_slam'` (Onde Sismique)
   * - `'spinning_blades'` (Lames Orbitales)
   * - `'mastery_rank_up'` (Évolution Adaptative du Héros)
   *
   * @param {string} abilityId - Identifier of the cast ability.
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} originPos - Caster world position.
   * @param {Array<Object>|Object|null} [targetsOrTargetPos=null] - Target entity/position or array of targets.
   * @param {Object} [options={}] - Optional parameters (`radius`, `colorHex`, `angle`, `yaw`, `level`, `count`).
   */
  spawnAbilityVFX(abilityId, originPos, targetsOrTargetPos = null, options = {}) {
    const id = String(abilityId || '').toLowerCase();

    switch (id) {
      case 'pyro_nova':
        this.spawnPyroNova(originPos, options);
        break;
      case 'chain_lightning':
        this.spawnChainLightning(originPos, targetsOrTargetPos, options);
        break;
      case 'frost_spear':
        this.spawnFrostSpear(originPos, targetsOrTargetPos, options);
        break;
      case 'venom_volley':
        this.spawnVenomVolley(originPos, targetsOrTargetPos, options);
        break;
      case 'meteor_strike':
        this.spawnMeteorStrike(originPos, targetsOrTargetPos, options);
        break;
      case 'soul_siphon':
        this.spawnSoulSiphon(originPos, targetsOrTargetPos, options);
        break;
      case 'seismic_slam':
        this.spawnSeismicSlam(originPos, targetsOrTargetPos, options);
        break;
      case 'spinning_blades':
        this.spawnSpinningBladesPulse(originPos, targetsOrTargetPos, options);
        break;
      case 'mastery_rank_up':
        this.spawnMasteryEffect(originPos, options?.colorHex || 0xffd700);
        break;
      default:
        this.spawnHitEffect(originPos, options?.colorHex || 0x44ddff);
        break;
    }
  }

  /**
   * 1. `pyro_nova` (Nova Pyroclastique):
   * Expanding 3D fire dome + dual concentric magma rings + radial eruption of 22 flame embers.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} originPos - Caster world position.
   * @param {Object} [options={}] - Optional `{ radius, colorHex }`.
   */
  spawnPyroNova(originPos, options = {}) {
    const p = this._resolvePos(originPos, 1.8);
    const radius = options?.radius || 8.5;

    this._spawnShockRing(p, 0xff4500, 0.6, radius, 0.48);
    this._spawnShockRing({ x: p.x, y: p.y + 0.25, z: p.z }, 0xffaa00, 0.4, radius * 0.82, 0.42);
    this._spawnShockRing({ x: p.x, y: p.y + 0.5, z: p.z }, 0xff2200, 0.3, radius * 1.08, 0.55);

    // Expanding translucent 3D fire dome
    const domeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff5500),
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const domeMesh = new THREE.Mesh(this._domeGeo, domeMat);
    domeMesh.position.set(p.x, p.y + 0.2, p.z);
    domeMesh.scale.setScalar(0.5);
    this.vfxGroup.add(domeMesh);

    this.activeRings.push({
      mesh: domeMesh,
      mat: domeMat,
      age: 0,
      duration: 0.40,
      startScale: 0.5,
      endScale: radius * 0.72,
    });

    // Radial ring of 22 erupting magma sparks
    const count = 22;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const speed = radius * (1.55 + Math.random() * 0.7);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(i % 2 === 0 ? 0xff4500 : 0xffbb22),
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this._sparkGeo, mat);
      mesh.position.set(p.x, p.y + 0.45, p.z);
      this.vfxGroup.add(mesh);

      this.activeParticles.push({
        mesh,
        mat,
        vx: Math.cos(angle) * speed,
        vy: 1.8 + Math.random() * 3.8,
        vz: Math.sin(angle) * speed,
        gravity: -8.5,
        drag: 2.2,
        age: 0,
        duration: 0.42 + Math.random() * 0.2,
        initialScale: 1.15 + Math.random() * 0.55,
      });
    }
  }

  /**
   * 2. `chain_lightning` (Arc Foudroyant):
   * Jagged 3D electric arcs bouncing sequentially from `originPos` across all chained targets.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} originPos - Caster position.
   * @param {Array<Object>|Object|null} targetsOrTargetPos - Chained target entities or positions.
   * @param {Object} [options={}] - Optional `{ colorHex }`.
   */
  spawnChainLightning(originPos, targetsOrTargetPos = null, options = {}) {
    const start = this._resolvePos(originPos, 1.8);
    let targets = this._resolveTargetsList(targetsOrTargetPos, start.y);

    if (targets.length === 0) {
      // Fallback visual lightning arcs around caster if triggered without targets
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.random();
        targets.push({
          x: start.x + Math.cos(a) * 6.5,
          y: start.y,
          z: start.z + Math.sin(a) * 6.5,
        });
      }
    }

    let prev = { x: start.x, y: start.y + 0.8, z: start.z };
    const boltColor = options?.colorHex || 0x55eeff;

    for (let i = 0; i < targets.length; i++) {
      const next = { x: targets[i].x, y: targets[i].y + 0.8, z: targets[i].z };
      this._spawnEnergyBeam(prev, next, boltColor, 0.65, 0.34);
      this._spawnEnergyBeam(prev, next, 0xffffff, 0.28, 0.26);
      this.spawnHitEffect(next, boltColor);
      prev = next;
    }
  }

  /**
   * 3. `frost_spear` (Javelot Cryogénique):
   * Launches a piercing 3D crystalline ice spear leaving a trail of frost shards and freezing rings.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} originPos - Caster position.
   * @param {Array<Object>|Object|null} targetsOrTargetPos - Pierced target(s) or destination point.
   * @param {Object} [options={}] - Optional `{ angle, yaw, range }`.
   */
  spawnFrostSpear(originPos, targetsOrTargetPos = null, options = {}) {
    const start = this._resolvePos(originPos, 1.8);
    const targets = this._resolveTargetsList(targetsOrTargetPos, start.y);
    const range = options?.range || 15.0;

    let endPos;
    if (targets.length > 0) {
      const lastTarget = targets[targets.length - 1];
      const dx = lastTarget.x - start.x;
      const dz = lastTarget.z - start.z;
      const len = Math.hypot(dx, dz) || 1;
      const dist = Math.max(len, range * 0.85);
      endPos = {
        x: start.x + (dx / len) * dist,
        y: lastTarget.y + 0.6,
        z: start.z + (dz / len) * dist,
      };
    } else {
      const angle = options?.angle ?? options?.yaw ?? 0;
      endPos = {
        x: start.x + Math.sin(angle) * range,
        y: start.y + 0.6,
        z: start.z + Math.cos(angle) * range,
      };
    }

    const spearMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x00e5ff),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const spearMesh = new THREE.Mesh(this._spearGeo, spearMat);
    spearMesh.position.set(start.x, start.y + 0.7, start.z);
    spearMesh.lookAt(endPos.x, endPos.y, endPos.z);
    spearMesh.scale.set(1.2, 1.2, 1.5);
    this.vfxGroup.add(spearMesh);

    this.activeProjectiles.push({
      mesh: spearMesh,
      mat: spearMat,
      startPos: { x: start.x, y: start.y + 0.7, z: start.z },
      endPos,
      arcHeight: 0,
      trailColor: 0x80f4ff,
      impactColor: 0x00e5ff,
      impactScale: 3.4,
      age: 0,
      duration: 0.25,
    });

    for (let i = 0; i < targets.length; i++) {
      this._spawnShockRing(targets[i], 0x00e5ff, 0.4, 2.8, 0.45);
    }
  }

  /**
   * 4. `venom_volley` (Salve Venimeuse):
   * Fires a fan of 5 toxic green daggers across a wide cone, leaving spore trails and acid rings.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} originPos - Caster position.
   * @param {Array<Object>|Object|null} targetsOrTargetPos - Target position(s) to orient the cone.
   * @param {Object} [options={}] - Optional `{ count, angle, yaw, range }`.
   */
  spawnVenomVolley(originPos, targetsOrTargetPos = null, options = {}) {
    const start = this._resolvePos(originPos, 1.8);
    const targets = this._resolveTargetsList(targetsOrTargetPos, start.y);
    const count = options?.count || 5;
    const range = options?.range || 12.5;

    let baseAngle = options?.angle ?? options?.yaw ?? 0;
    if (targets.length > 0) {
      baseAngle = Math.atan2(targets[0].x - start.x, targets[0].z - start.z);
    }

    const spreadArc = 0.95; // ~54 degrees total fan spread
    for (let i = 0; i < count; i++) {
      const frac = count > 1 ? i / (count - 1) - 0.5 : 0;
      const angle = baseAngle + frac * spreadArc;
      const endPos = {
        x: start.x + Math.sin(angle) * range,
        y: start.y + 0.5,
        z: start.z + Math.cos(angle) * range,
      };

      const daggerMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x39ff14),
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const daggerMesh = new THREE.Mesh(this._daggerGeo, daggerMat);
      daggerMesh.position.set(start.x, start.y + 0.65, start.z);
      daggerMesh.lookAt(endPos.x, endPos.y, endPos.z);
      this.vfxGroup.add(daggerMesh);

      this.activeProjectiles.push({
        mesh: daggerMesh,
        mat: daggerMat,
        startPos: { x: start.x, y: start.y + 0.65, z: start.z },
        endPos,
        arcHeight: 0.35,
        trailColor: 0x39ff14,
        impactColor: 0x1ec800,
        impactScale: 2.1,
        age: 0,
        duration: 0.28 + Math.random() * 0.05,
      });
    }

    for (let i = 0; i < targets.length; i++) {
      this._spawnShockRing(targets[i], 0x39ff14, 0.3, 2.4, 0.4);
    }
  }

  /**
   * 5. `meteor_strike` (Météore d'Ambre):
   * Calls down a blazing molten amber meteor from the sky onto the highest-fitness target,
   * creating a target reticle followed by a massive crater shockwave and volcanic debris.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} originPos - Caster position.
   * @param {Array<Object>|Object|null} targetsOrTargetPos - Target impact coordinate.
   * @param {Object} [options={}] - Optional `{ radius }`.
   */
  spawnMeteorStrike(originPos, targetsOrTargetPos = null, options = {}) {
    const start = this._resolvePos(originPos, 1.8);
    const targets = this._resolveTargetsList(targetsOrTargetPos, start.y);
    const impactPos = targets.length > 0 ? targets[0] : start;
    const blastRadius = options?.radius || 7.2;

    // Ground target reticle rings
    this._spawnShockRing(impactPos, 0xffaa00, 0.5, blastRadius, 0.55);
    this._spawnShockRing(impactPos, 0xff3300, blastRadius * 0.75, 0.6, 0.26);

    // Descending molten amber meteor from high altitude
    const skyStart = {
      x: impactPos.x - 4.5,
      y: impactPos.y + 22.0,
      z: impactPos.z - 3.5,
    };

    const meteorMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff9911),
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const meteorMesh = new THREE.Mesh(this._meteorGeo, meteorMat);
    meteorMesh.position.set(skyStart.x, skyStart.y, skyStart.z);
    meteorMesh.scale.setScalar(1.35);
    this.vfxGroup.add(meteorMesh);

    this.activeProjectiles.push({
      mesh: meteorMesh,
      mat: meteorMat,
      startPos: skyStart,
      endPos: { x: impactPos.x, y: impactPos.y + 0.3, z: impactPos.z },
      arcHeight: 0,
      trailColor: 0xff5500,
      impactColor: 0xff8800,
      impactScale: blastRadius,
      isMeteor: true,
      age: 0,
      duration: 0.26,
    });
  }

  /**
   * 6. `soul_siphon` (Siphon Vampirique):
   * Connects crimson-violet life-drain beams from nearby enemies to the Hero and pulls
   * glowing blood-soul orbs into the Hero while emitting a vampiric heal ring.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} originPos - Hero world position.
   * @param {Array<Object>|Object|null} targetsOrTargetPos - Drained enemy target(s).
   * @param {Object} [options={}] - Optional settings.
   */
  spawnSoulSiphon(originPos, targetsOrTargetPos = null, options = {}) {
    const heroPos = this._resolvePos(originPos, 1.8);
    let targets = this._resolveTargetsList(targetsOrTargetPos, heroPos.y);

    if (targets.length === 0) {
      targets = [{ x: heroPos.x + 4.0, y: heroPos.y, z: heroPos.z + 4.0 }];
    }

    // Vampiric heal rings around Hero
    this._spawnShockRing(heroPos, 0xdc143c, 0.4, 3.2, 0.5);
    this._spawnShockRing({ x: heroPos.x, y: heroPos.y + 0.3, z: heroPos.z }, 0x38ff88, 0.3, 2.4, 0.55);

    for (let i = 0; i < targets.length; i++) {
      const tPos = targets[i];
      const beamStart = { x: tPos.x, y: tPos.y + 0.85, z: tPos.z };
      const beamEnd = { x: heroPos.x, y: heroPos.y + 0.95, z: heroPos.z };

      this._spawnEnergyBeam(beamStart, beamEnd, 0xdc143c, 0.32, 0.42);
      this._spawnEnergyBeam(beamStart, beamEnd, 0xff4488, 0.15, 0.38);

      // Spawn 4 blood-soul orbs flying from target into the Hero
      for (let k = 0; k < 4; k++) {
        const orbMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(k % 2 === 0 ? 0xff1e56 : 0x38ff88),
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const orbMesh = new THREE.Mesh(this._helixNodeGeo, orbMat);
        orbMesh.position.set(beamStart.x, beamStart.y, beamStart.z);
        orbMesh.scale.setScalar(1.35);
        this.vfxGroup.add(orbMesh);

        this.activeProjectiles.push({
          mesh: orbMesh,
          mat: orbMat,
          startPos: { ...beamStart },
          endPos: { ...beamEnd },
          arcHeight: 1.2 + k * 0.35,
          trailColor: 0xdc143c,
          impactColor: 0x38ff88,
          impactScale: 1.5,
          age: -k * 0.04,
          duration: 0.34,
        });
      }
    }
  }

  /**
   * 7. `seismic_slam` (Onde Sismique):
   * Tectonic ground shockwaves + 12 erupting 3D stone spikes bursting around the Hero.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} originPos - Hero world position.
   * @param {Array<Object>|Object|null} [targetsOrTargetPos=null] - Hit enemies.
   * @param {Object} [options={}] - Optional `{ radius }`.
   */
  spawnSeismicSlam(originPos, targetsOrTargetPos = null, options = {}) {
    const p = this._resolvePos(originPos, 1.8);
    const radius = options?.radius || 7.2;

    this._spawnShockRing(p, 0xe6a145, 0.5, radius, 0.48);
    this._spawnShockRing({ x: p.x, y: p.y + 0.15, z: p.z }, 0xc97a3e, 0.8, radius * 0.85, 0.54);
    this._spawnShockRing({ x: p.x, y: p.y + 0.25, z: p.z }, 0xffd166, 0.3, radius * 1.12, 0.42);

    const spikeCount = 12;
    for (let i = 0; i < spikeCount; i++) {
      const angle = (i / spikeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const dist = radius * (0.42 + Math.random() * 0.48);
      const sx = p.x + Math.cos(angle) * dist;
      const sz = p.z + Math.sin(angle) * dist;

      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(i % 2 === 0 ? 0xd99b38 : 0x8c7656),
        transparent: true,
        opacity: 0.95,
      });
      const spike = new THREE.Mesh(this._spikeGeo, mat);
      spike.position.set(sx, p.y - 0.8, sz);
      spike.rotation.set((Math.random() - 0.5) * 0.35, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.35);
      this.vfxGroup.add(spike);

      this.activeParticles.push({
        mesh: spike,
        mat,
        vx: Math.cos(angle) * 1.2,
        vy: 5.2,
        vz: Math.sin(angle) * 1.2,
        gravity: -14.0,
        drag: 3.0,
        age: 0,
        duration: 0.52,
        initialScale: 0.9 + Math.random() * 0.45,
      });
    }
  }

  /**
   * 8. `spinning_blades` (Lames Orbitales):
   * Spawns a metallic cyan whirlwind ring and hit sparks on sliced targets.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} originPos - Hero position.
   * @param {Array<Object>|Object|null} [targetsOrTargetPos=null] - Sliced targets.
   * @param {Object} [options={}] - Optional `{ radius }`.
   */
  spawnSpinningBladesPulse(originPos, targetsOrTargetPos = null, options = {}) {
    const p = this._resolvePos(originPos, 1.8);
    const radius = options?.radius || 4.2;
    this._spawnShockRing({ x: p.x, y: p.y + 0.65, z: p.z }, 0x70f5ff, radius * 0.75, radius * 1.15, 0.28);

    const targets = this._resolveTargetsList(targetsOrTargetPos, p.y);
    for (let i = 0; i < targets.length; i++) {
      this.spawnHitEffect(targets[i], 0x70f5ff);
    }
  }

  /**
   * Spawns a golden evolutionary ascension effect when the Hero gains a rank in
   * `AdaptiveMasterySystem` (e.g. Slayer Mastery vs a species/mutation or Adaptive Resistance).
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} pos - Hero position.
   * @param {number|string} [colorHex=0xffd700] - Mastery highlight color.
   */
  spawnMasteryEffect(pos, colorHex = 0xffd700) {
    this.spawnBirthEffect(pos, true, false, colorHex);
  }

  /**
   * Per-frame update for all active particle bursts, shock rings, DNA double-helices,
   * 3D lightning/siphon beams, spell projectiles, and Patient Zero sky beacons.
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

    // 4. Update 3D lightning & siphon tether beams
    for (let i = this.activeBeams.length - 1; i >= 0; i--) {
      const b = this.activeBeams[i];
      b.age += safeDt;
      if (b.age >= b.duration) {
        this.vfxGroup.remove(b.line);
        b.geo.dispose();
        b.mat.dispose();
        this.activeBeams.splice(i, 1);
        continue;
      }

      const progress = b.age / b.duration;
      b.mat.opacity = (1.0 - progress) * 0.95;

      // Live crackle jitter on intermediate vertices
      const posAttr = b.geo.attributes.position;
      if (posAttr && b.jitterAmp > 0.1) {
        for (let idx = 1; idx < b.segments; idx++) {
          const frac = idx / b.segments;
          const amp = Math.sin(frac * Math.PI) * b.jitterAmp * (1.0 - progress * 0.5);
          posAttr.setXYZ(
            idx,
            lerp(b.startPos.x, b.endPos.x, frac) + (Math.random() - 0.5) * amp * 2.0,
            lerp(b.startPos.y, b.endPos.y, frac) + (Math.random() - 0.5) * amp * 1.4,
            lerp(b.startPos.z, b.endPos.z, frac) + (Math.random() - 0.5) * amp * 2.0
          );
        }
        posAttr.needsUpdate = true;
      }
    }

    // 5. Update 3D spell projectiles (frost spears, venom daggers, meteors, soul orbs)
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const proj = this.activeProjectiles[i];
      proj.age += safeDt;
      if (proj.age < 0) continue;

      if (proj.age >= proj.duration) {
        this._spawnShockRing(proj.endPos, proj.impactColor, 0.4, proj.impactScale, 0.38);
        if (proj.isMeteor) {
          this.spawnPyroNova(proj.endPos, { radius: proj.impactScale });
        }
        this.vfxGroup.remove(proj.mesh);
        proj.mat.dispose();
        this.activeProjectiles.splice(i, 1);
        continue;
      }

      const progress = clamp(proj.age / proj.duration, 0, 1);
      const px = lerp(proj.startPos.x, proj.endPos.x, progress);
      const pz = lerp(proj.startPos.z, proj.endPos.z, progress);
      const py =
        lerp(proj.startPos.y, proj.endPos.y, progress) +
        Math.sin(progress * Math.PI) * (proj.arcHeight || 0);

      proj.mesh.position.set(px, py, pz);
      if (proj.isMeteor) {
        proj.mesh.rotation.x += 9.0 * safeDt;
        proj.mesh.rotation.z += 7.0 * safeDt;
      }
    }

    // 6. Update active Patient Zero sky beacons
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
