/**
 * @fileoverview Central Bastion Sanctuary, Buildable Structures, Prisoner Cage Rescues,
 * and Allied NPC AI — featuring the **Scout (Éclaireur)** Deep-Wilderness Expedition,
 * Evasion Steering, and Mutant/Hybrid Patient Zero Discovery System.
 *
 * Usage:
 *   const bastionAndNpcs = new BastionAndNPCs(scene, terrain, vfx, ecoSim);
 *   bastionAndNpcs.update(dt, elapsedTime, enemyManager, player, onScoutDiscovery);
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { buildCreatureMesh, animateCreatureMesh } from './CreatureMeshBuilder.js';
import {
  pickScoutExpeditionWaypoint,
  computeScoutEvasionVector,
} from '../ecosystem/BalanceAndPacing.js';
import { dist2D, clamp, getCardinalLabelFR } from '../utils/math.js';
import { logger } from '../utils/logger.js';

const NPC_NAMES = [
  'Kaelen',
  'Lyra',
  'Vaelis',
  'Soren',
  'Elowen',
  'Draven',
  'Nyx',
  'Theron',
  'Isolde',
  'Bram',
  'Orin',
  'Sylvi',
];

export class BastionAndNPCs {
  /**
   * @param {THREE.Scene} scene - Three.js scene.
   * @param {Object} terrain - Terrain instance.
   * @param {Object} vfx - VFXManager instance.
   * @param {Object} ecoSim - EcosystemSimulator instance.
   * @param {Object} [options={}] - Optional configuration (`{ tutorialMode: boolean }`).
   */
  constructor(scene, terrain, vfx, ecoSim, options = {}) {
    /** @type {THREE.Scene} */
    this.scene = scene;
    /** @type {Object} */
    this.terrain = terrain;
    /** @type {Object} */
    this.vfx = vfx;
    /** @type {Object} */
    this.ecoSim = ecoSim;

    /** @type {{ x: number, z: number }} */
    this.pos = { x: CONFIG.BASTION?.POS?.x || 0, z: CONFIG.BASTION?.POS?.z || 0 };
    /** @type {number} */
    this.radius = CONFIG.BASTION?.RADIUS || 14;
    /** @type {number} */
    this.maxHp = CONFIG.BASTION?.MAX_HP || 500;
    /** @type {number} */
    this.hp = CONFIG.BASTION?.INITIAL_HP || 500;
    /** @type {number} */
    this.thornsDamage = 0;

    // Modifiers from structures & roguelike upgrades
    /** @type {number} */
    this.scoutVisionBonus = 0;
    /** @type {number} */
    this.scoutVisionMultiplier = 1.0;
    /** @type {number} */
    this.scoutSpeedMultiplier = 1.0;
    /** @type {number} */
    this.turretDamageMultiplier = 1.0;

    /** @type {{ watchtower: number, palisade: number, biolab: number }} */
    this.structures = {
      watchtower: 1,
      palisade: 0,
      biolab: 0,
    };
    /** @type {Array<Object>} Active watchtower turrets */
    this.watchtowers = [];
    /** @type {Array<THREE.Object3D>} 3D meshes for watchtowers */
    this.watchtowerMeshes = [];
    /** @type {Array<Object>} Active bolts fired by Guards and Watchtowers */
    this.bolts = [];

    /** @type {Array<Object>} Rescued & active allied NPCs */
    this.npcs = [];
    /** @type {number} */
    this.nextNpcId = 1;

    /** @type {Array<Object>} Prisoner cages scattered across the island */
    this.cages = [];
    /** @type {number} */
    this.totalCages = 6;
    /** @type {number} */
    this.rescuedCount = 0;

    /** @type {boolean} Whether the 7-Act Guided Onboarding tutorial mode is active */
    this.tutorialMode = Boolean(options?.tutorialMode);

    /** @type {Function|null} Optional callback when a Scout discovers a mutant/hybrid */
    this.onScoutDiscovery = null;
    /** @type {Function|null} Optional callback `(type, level)` when a structure is built */
    this.onStructureBuilt = null;
    /** @type {Function|null} Optional callback `(role, counts)` when an NPC role is assigned/recruited */
    this.onRoleAssigned = null;
    /** @type {Function|null} Optional callback `(npc, cage)` when a cage is rescued */
    this.onCageRescued = null;

    /** @type {THREE.Group|null} Root 3D group for the Bastion Sanctuary */
    this.bastionGroup = null;
    /** @type {THREE.Mesh|null} Animated campfire flame mesh */
    this.campfireFlame = null;

    this._buildBastionSanctuary();

    if (this.tutorialMode) {
      this.setTutorialMode(true);
    } else {
      this._spawnPrisonerCages();
      // Start the player with 2 initial NPCs at the Bastion (1 harvester, 1 scout)
      // so the Scout deep-wilderness exploration mechanic is immediately active in standard mode!
      this.spawnNpc('harvester', -3.5, -2.5);
      this.spawnNpc('scout', 4.0, -3.0);
    }
  }

  /**
   * Enables or disables the 7-Act Guided Tutorial starting state:
   * - Clears initial NPCs (`0` NPCs at start of Act 1)
   * - Clears initial Prisoner Cages (`0` cages until Act 3 & Act 5)
   * - Clears the initial Watchtower (`0` watchtowers until the player builds one in Act 4)
   *
   * @param {boolean} [enabled=true]
   */
  setTutorialMode(enabled = true) {
    this.tutorialMode = Boolean(enabled);
    if (this.tutorialMode) {
      this.clearAllNpcs();
      this.clearAllCages();
      this.watchtowers = [];
      this.structures.watchtower = 0;
      if (this.bastionGroup && this.watchtowerMeshes.length > 0) {
        for (const m of this.watchtowerMeshes) {
          this.bastionGroup.remove(m);
        }
      }
      this.watchtowerMeshes = [];
      this.rescuedCount = 0;
    }
  }

  /**
   * Alias for `setTutorialMode(true)`.
   */
  enterTutorialMode() {
    this.setTutorialMode(true);
  }

  /**
   * Alias for `setTutorialMode(true)`.
   */
  enableTutorialStart() {
    this.setTutorialMode(true);
  }

  /**
   * Removes all allied NPCs and their 3D meshes from the scene.
   */
  clearAllNpcs() {
    for (const npc of this.npcs) {
      if (npc.mesh && this.scene) {
        this.scene.remove(npc.mesh);
      }
    }
    this.npcs = [];
  }

  /**
   * Removes all Prisoner Cages and their 3D meshes from the scene.
   */
  clearAllCages() {
    for (const cage of this.cages) {
      if (cage.mesh && this.scene) {
        this.scene.remove(cage.mesh);
      }
    }
    this.cages = [];
  }

  /**
   * Builds the central 3D Bastion Sanctuary at `(0, 0)` with stone hearth, animated campfire,
   * initial wooden watchtower, banner flags, and glowing defensive perimeter ring.
   */
  _buildBastionSanctuary() {
    const centerY = this.terrain ? this.terrain.getHeightAt(0, 0) : 2.2;
    this.watchtowers.push({ x: -8.5, y: centerY, z: -7.5, cooldown: 0 });

    if (!this.scene) return;

    this.bastionGroup = new THREE.Group();
    this.bastionGroup.name = 'BastionSanctuary';
    this.bastionGroup.position.set(0, centerY, 0);
    this.scene.add(this.bastionGroup);

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      roughness: 0.8,
      metalness: 0.15,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x6b4423,
      roughness: 0.75,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe6a145,
      emissive: 0xb36b00,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.7,
    });
    const fireMat = new THREE.MeshStandardMaterial({
      color: 0xff6b00,
      emissive: 0xff4500,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });

    // 1. Stone Sanctuary Plinth & Hearth Ring
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 0.45, 16), stoneMat);
    plinth.position.y = 0.22;
    plinth.receiveShadow = true;
    this.bastionGroup.add(plinth);

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), stoneMat);
      stone.position.set(Math.cos(a) * 1.65, 0.55, Math.sin(a) * 1.65);
      stone.castShadow = true;
      this.bastionGroup.add(stone);
    }

    // 2. Roaring Campfire Logs & Animated Flame Cone
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.9, 6), woodMat);
      log.position.y = 0.55;
      log.rotation.z = Math.PI * 0.42;
      log.rotation.y = (i / 4) * Math.PI;
      this.bastionGroup.add(log);
    }

    this.campfireFlame = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.1, 7), fireMat);
    this.campfireFlame.position.y = 1.45;
    this.bastionGroup.add(this.campfireFlame);

    // 3. Banner Flags around Hearth
    const bannerAngles = [0.6, 2.5, 4.2, 5.6];
    for (const a of bannerAngles) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6), woodMat);
      pole.position.set(Math.cos(a) * 5.8, 2.1, Math.sin(a) * 5.8);
      pole.castShadow = true;
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.85), goldMat);
      cloth.position.set(0, 1.2, 0.45);
      pole.add(cloth);
      this.bastionGroup.add(pole);
    }

    // 4. Initial Watchtower Mesh at (-8.5, -7.5)
    this._addWatchtowerMesh(-8.5, -7.5);

    // 5. Defensive Sanctuary Perimeter Ring
    const ringGeo = new THREE.RingGeometry(this.radius - 0.25, this.radius, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const perimeterRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xe6a145,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.38,
      })
    );
    perimeterRing.position.y = 0.12;
    this.bastionGroup.add(perimeterRing);
  }

  /**
   * Adds a 3D wooden Watchtower with glowing crystal ballista top to the Bastion.
   */
  _addWatchtowerMesh(rx, rz) {
    if (!this.bastionGroup) return;
    const tower = new THREE.Group();
    tower.position.set(rx, 0, rz);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.75 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2b3d4f, roughness: 0.6 });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x48dbfb,
      emissive: 0x0abde3,
      emissiveIntensity: 1.5,
    });

    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 4.2, 2.1), woodMat);
    base.position.y = 2.1;
    base.castShadow = true;
    base.receiveShadow = true;

    const platform = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.4, 2.7), woodMat);
    platform.position.y = 4.3;
    platform.castShadow = true;

    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.8, 4), roofMat);
    roof.position.y = 6.1;
    roof.rotation.y = Math.PI * 0.25;
    roof.castShadow = true;

    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), crystalMat);
    beacon.position.y = 4.95;

    tower.add(base, platform, roof, beacon);
    this.bastionGroup.add(tower);
    this.watchtowerMeshes.push(tower);
  }

  /**
   * Spawns a single Prisoner Cage at `(x, z)` holding a captive survivor NPC.
   * @param {number} x - World X position.
   * @param {number} z - World Z position.
   * @param {'scout'|'guard'|'harvester'} [role='harvester'] - Captive NPC role.
   * @param {string|null} [id=null] - Optional custom cage ID.
   * @returns {Object} Spawned cage object.
   */
  spawnSingleCage(x, z, role = 'harvester', id = null) {
    const y = this.terrain ? this.terrain.getHeightAt(x, z) : 0;
    let mesh = null;
    if (this.scene) {
      mesh = new THREE.Group();
      mesh.position.set(x, Math.max(y, CONFIG.WORLD.WATER_LEVEL + 0.2), z);

      const ironMat = new THREE.MeshStandardMaterial({
        color: 0x2f3640,
        roughness: 0.4,
        metalness: 0.8,
      });
      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0x00d8ff,
        emissive: 0x00a8ff,
        emissiveIntensity: 1.8,
      });

      const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 2.2), ironMat);
      basePlinth.position.y = 0.12;
      const topFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 2.2), ironMat);
      topFrame.position.y = 2.35;
      mesh.add(basePlinth, topFrame);

      // Cage vertical bars
      for (let b = 0; b < 8; b++) {
        const ba = (b / 8) * Math.PI * 2;
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), ironMat);
        bar.position.set(Math.cos(ba) * 0.95, 1.25, Math.sin(ba) * 0.95);
        bar.castShadow = true;
        mesh.add(bar);
      }

      // Captive NPC inside cage
      const captiveMesh = buildCreatureMesh({ type: 'npc', role });
      captiveMesh.scale.setScalar(0.85);
      mesh.add(captiveMesh);

      // Floating cyan rescue crystal above cage
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), beaconMat);
      crystal.position.y = 3.1;
      mesh.userData.crystal = crystal;
      mesh.add(crystal);

      this.scene.add(mesh);
    }

    const cage = {
      id: id || `cage_${this.cages.length + 1}`,
      x,
      z,
      y,
      role,
      rescued: false,
      mesh,
    };
    this.cages.push(cage);
    return cage;
  }

  /**
   * Alias for `spawnSingleCage(x, z, role, id)` used by tutorial step orchestrators.
   * @param {number} x
   * @param {number} z
   * @param {'scout'|'guard'|'harvester'} [role='harvester']
   * @param {string|null} [id=null]
   * @returns {Object}
   */
  spawnCageAt(x, z, role = 'harvester', id = null) {
    return this.spawnSingleCage(x, z, role, id);
  }

  /**
   * Spawns 6 Prisoner Cages scattered across the island (`38..92` units from center)
   * holding survivor NPCs waiting to be rescued by the player.
   */
  _spawnPrisonerCages() {
    const cageLocations = [
      { angle: 0.45, dist: 38, role: 'scout' },
      { angle: 1.35, dist: 52, role: 'guard' },
      { angle: 2.4, dist: 46, role: 'scout' },
      { angle: 3.3, dist: 64, role: 'harvester' },
      { angle: 4.5, dist: 58, role: 'scout' },
      { angle: 5.4, dist: 78, role: 'guard' },
    ];

    for (let i = 0; i < cageLocations.length; i++) {
      const loc = cageLocations[i];
      const x = Math.cos(loc.angle) * loc.dist;
      const z = Math.sin(loc.angle) * loc.dist;
      this.spawnSingleCage(x, z, loc.role, `cage_${i + 1}`);
    }
  }

  /**
   * Act 3 Tutorial Spawner: Spawns Cage #1 at `{ x: 20, z: 20 }` holding the 1st survivor (`'harvester'`)
   * and optionally spawns 1 guarding Wolf nearby.
   * @param {number} [x=20]
   * @param {number} [z=20]
   * @param {Object|null} [enemyManager=null]
   * @returns {Object} Spawned Cage #1.
   */
  spawnTutorialCage1(x = 20, z = 20, enemyManager = null) {
    const cage = this.spawnSingleCage(x, z, 'harvester', 'tutorial_cage_1');
    if (enemyManager && typeof enemyManager.spawnEnemy === 'function') {
      const wolfGenome = enemyManager._createSafeGenome
        ? enemyManager._createSafeGenome('wolf')
        : { speciesId: 'wolf', speciesName: 'Loup Gardien', genes: {}, mutations: [] };
      wolfGenome.speciesName = 'Loup Gardien';
      enemyManager.spawnEnemy(x - 3.5, z - 3.0, wolfGenome, [], {
        hpOverride: 40,
        damageOverride: 5,
        speedOverride: 5.5,
        tutorialTag: 'act3_wolf',
      });
    }
    logger.info('BASTION', `Acte 3 : Cage de Survivant #1 apparue en (${Math.round(x)}, ${Math.round(z)}).`);
    return cage;
  }

  /**
   * Act 5 Tutorial Spawner: Spawns Cage #2 at `{ x: 0, z: -38 }` holding the 2nd survivor
   * so the player can rescue them and assign them to the **Éclaireur (`'scout'`)** role in Step 10!
   * @param {number} [x=0]
   * @param {number} [z=-38]
   * @returns {Object} Spawned Cage #2.
   */
  spawnTutorialCage2(x = 0, z = -38) {
    const cage = this.spawnSingleCage(x, z, 'harvester', 'tutorial_cage_2');
    logger.info('BASTION', `Acte 5 : Cage de Survivant #2 apparue en (${Math.round(x)}, ${Math.round(z)}).`);
    return cage;
  }

  /**
   * Act 7 / Skip Tutorial (`[P]`): Transitions the Bastion into full Open Survival Mode,
   * ensuring at least 1 Harvester, 1 Scout, 1 Watchtower, and remaining Prisoner Cages exist.
   */
  startOpenSurvivalMode() {
    this.tutorialMode = false;
    const counts = this.getRoleCounts();
    if (counts.harvester === 0) {
      this.spawnNpc('harvester', -3.5, -2.5);
    }
    if (counts.scout === 0) {
      this.spawnNpc('scout', 4.0, -3.0);
    }
    if (this.watchtowers.length === 0) {
      const centerY = this.terrain ? this.terrain.getHeightAt(0, 0) : 2.2;
      this.watchtowers.push({ x: -8.5, y: centerY, z: -7.5, cooldown: 0 });
      this.structures.watchtower = Math.max(1, this.structures.watchtower);
      this._addWatchtowerMesh(-8.5, -7.5);
    }
    const activeUnrescued = this.cages.filter((c) => !c.rescued).length;
    if (activeUnrescued < 4) {
      this._spawnPrisonerCages();
    }
  }

  /**
   * Attempts to rescue the nearest locked Prisoner Cage within `maxDist` of `(px, pz)`.
   * Frees the survivor NPC, adds them to the Bastion workforce, and grants bonus resources.
   *
   * @param {number} px - Player X coordinate.
   * @param {number} pz - Player Z coordinate.
   * @param {Object} [playerResources] - Player resource dictionary to credit bonus loot.
   * @param {number} [maxDist=5.5] - Rescue interaction radius.
   * @returns {Object|null} Newly rescued NPC or null.
   */
  tryRescueNearestCage(px, pz, playerResources = null, maxDist = 5.5) {
    for (const cage of this.cages) {
      if (cage.rescued) continue;
      const d = dist2D(px, pz, cage.x, cage.z);
      if (d <= maxDist) {
        cage.rescued = true;
        this.rescuedCount++;

        if (cage.mesh && this.scene) {
          this.scene.remove(cage.mesh);
        }

        if (this.vfx && typeof this.vfx.spawnBirthEffect === 'function') {
          this.vfx.spawnBirthEffect(new THREE.Vector3(cage.x, cage.y + 0.8, cage.z), false, true, 0x00d8ff);
        }

        if (playerResources) {
          playerResources.wood = (playerResources.wood || 0) + 12;
          playerResources.crystal = (playerResources.crystal || 0) + 8;
        }

        const rescuedNpc = this.spawnNpc(cage.role, cage.x, cage.z);
        logger.alert(
          `Survivant libéré ! ${rescuedNpc.name} rejoint le Bastion comme [${this._roleLabelFR(cage.role)}] (${this.rescuedCount}/${this.totalCages} cages).`,
          { npcId: rescuedNpc.id, role: cage.role, rescuedCount: this.rescuedCount }
        );
        if (typeof this.onCageRescued === 'function') {
          this.onCageRescued(rescuedNpc, cage);
        }
        return rescuedNpc;
      }
    }
    return null;
  }

  /**
   * Returns a readable French label for an NPC role.
   */
  _roleLabelFR(role) {
    if (role === 'scout') return 'Éclaireur';
    if (role === 'guard') return 'Garde';
    return 'Récolteur';
  }

  /**
   * Spawns an allied NPC with the specified role (`'scout' | 'guard' | 'harvester'`).
   *
   * @param {'scout'|'guard'|'harvester'} [role='scout'] - Assigned role.
   * @param {number} [x=0] - Initial X position.
   * @param {number} [z=0] - Initial Z position.
   * @returns {Object} Spawned NPC object.
   */
  spawnNpc(role = 'scout', x = 0, z = 0) {
    const id = `npc_${this.nextNpcId++}`;
    const name = NPC_NAMES[(this.nextNpcId - 2) % NPC_NAMES.length];
    const y = this.terrain ? this.terrain.getHeightAt(x, z) : 0;

    let mesh = null;
    if (this.scene) {
      mesh = buildCreatureMesh({ type: 'npc', role });
      mesh.position.set(x, Math.max(y, CONFIG.WORLD.WATER_LEVEL + 0.2), z);
      this.scene.add(mesh);
    }

    const npc = {
      id,
      name,
      role,
      x,
      z,
      y,
      vx: 0,
      vz: 0,
      hp: CONFIG.SCOUT?.HP || 60,
      maxHp: CONFIG.SCOUT?.HP || 60,
      speed: role === 'scout' ? CONFIG.SCOUT?.SPEED || 13 : 8.5,
      visionRadius: CONFIG.SCOUT?.VISION_RADIUS || 34,
      fleeRadius: CONFIG.SCOUT?.FLEE_RADIUS || 16,
      state: role === 'scout' ? 'expedition' : 'patrol',
      targetX: x,
      targetZ: z,
      sectorName: 'Nord-Est',
      visitedSectors: [],
      actionTimer: 0,
      waypointTimer: 0,
      mesh,
      position: mesh ? mesh.position : new THREE.Vector3(x, y, z),
    };

    if (role === 'scout') {
      this._assignNewWildernessWaypoint(npc, []);
    }

    this.npcs.push(npc);
    return npc;
  }

  /**
   * Assigns a Deep-Wilderness expedition waypoint far beyond the Bastion frontier
   * (`50..108` units from center) using `pickScoutExpeditionWaypoint` so Scouts explore
   * distant biomes where mutant lineages emerge.
   */
  _assignNewWildernessWaypoint(scout, enemies = []) {
    const wp = pickScoutExpeditionWaypoint(
      scout,
      this.pos,
      CONFIG.WORLD?.SIZE || 240,
      enemies
    );
    scout.targetX = wp.x;
    scout.targetZ = wp.z;
    scout.sectorName = wp.sectorName || getCardinalLabelFR(wp.x, wp.z);
    scout.waypointTimer = 14 + Math.random() * 8;
  }

  /**
   * Reassigns an NPC from one role to another (or promotes an available NPC to `toRole`
   * if called with a single argument).
   *
   * @param {string} fromRoleOrTarget - Source role (or target role if `toRole` omitted).
   * @param {string} [toRole] - Target role (`'scout' | 'guard' | 'harvester'`).
   * @returns {boolean} True if an NPC role was changed.
   */
  assignNpcRole(fromRoleOrTarget, toRole) {
    let sourceRole = fromRoleOrTarget;
    let targetRole = toRole;

    // Support 1-argument call `assignNpcRole('scout')` by picking a non-target NPC
    if (!targetRole) {
      targetRole = fromRoleOrTarget;
      const candidate =
        this.npcs.find((n) => n.role !== targetRole && n.role === 'harvester') ||
        this.npcs.find((n) => n.role !== targetRole);
      if (!candidate) return false;
      sourceRole = candidate.role;
    }

    if (sourceRole === targetRole) return false;
    const npc = this.npcs.find((n) => n.role === sourceRole);
    if (!npc) return false;

    npc.role = targetRole;
    npc.speed = targetRole === 'scout' ? CONFIG.SCOUT?.SPEED || 13 : 8.5;
    npc.state = targetRole === 'scout' ? 'expedition' : 'patrol';

    if (targetRole === 'scout') {
      this._assignNewWildernessWaypoint(npc, []);
    }

    // Rebuild 3D mesh for the new role
    if (this.scene && npc.mesh) {
      this.scene.remove(npc.mesh);
      npc.mesh = buildCreatureMesh({ type: 'npc', role: targetRole });
      npc.mesh.position.set(npc.x, npc.y, npc.z);
      npc.position = npc.mesh.position;
      this.scene.add(npc.mesh);
    }

    logger.info(
      'BASTION',
      `${npc.name} réaffecté au rôle : [${this._roleLabelFR(targetRole)}].`,
      this.getRoleCounts()
    );
    if (typeof this.onRoleAssigned === 'function') {
      this.onRoleAssigned(targetRole, this.getRoleCounts());
    }
    return true;
  }

  /**
   * Recruits a brand-new allied NPC at the Bastion using gathered resources.
   *
   * @param {'scout'|'guard'|'harvester'} [role='scout'] - Desired NPC role.
   * @param {Object} playerResources - Player resource pool (`{ wood, crystal, biomass }`).
   * @returns {Object|null} Spawned NPC or null if insufficient resources.
   */
  recruitNpcWithResources(role = 'scout', playerResources) {
    const woodCost = 15;
    const biomassCost = 8;
    if (playerResources) {
      const hasEnough = (playerResources.wood || 0) >= woodCost && (playerResources.biomass || 0) >= biomassCost;
      if (!hasEnough && !this.tutorialMode) {
        logger.warn(
          'BASTION',
          `Ressources insuffisantes pour recruter un ${this._roleLabelFR(role)} (Requis: ${woodCost} Bois, ${biomassCost} Biomasse).`
        );
        return null;
      }
      playerResources.wood = Math.max(0, (playerResources.wood || 0) - woodCost);
      playerResources.biomass = Math.max(0, (playerResources.biomass || 0) - biomassCost);
    }

    const angle = Math.random() * Math.PI * 2;
    const npc = this.spawnNpc(role, Math.cos(angle) * 4.5, Math.sin(angle) * 4.5);
    logger.info(
      'BASTION',
      `Nouveau [${this._roleLabelFR(role)}] recruté au Bastion : ${npc.name} !`,
      this.getRoleCounts()
    );
    if (typeof this.onRoleAssigned === 'function') {
      this.onRoleAssigned(role, this.getRoleCounts());
    }
    return npc;
  }

  /**
   * Builds a defensive or scientific Bastion structure (`'watchtower' | 'palisade' | 'biolab'`).
   *
   * @param {'watchtower'|'palisade'|'biolab'} type - Structure key.
   * @param {Object} playerResources - Player resource pool (`{ wood, crystal, biomass }`).
   * @returns {boolean} True if constructed.
   */
  buildStructure(type, playerResources) {
    const structDef = CONFIG.BASTION?.STRUCTURES?.[type];
    if (!structDef) return false;

    const woodCost = structDef.woodCost || 20;
    const crystalCost = structDef.crystalCost || 10;

    if (playerResources) {
      const hasEnough = (playerResources.wood || 0) >= woodCost && (playerResources.crystal || 0) >= crystalCost;
      if (!hasEnough && !this.tutorialMode) {
        logger.warn(
          'BASTION',
          `Ressources insuffisantes pour bâtir [${structDef.name}] (Requis: ${woodCost} Bois, ${crystalCost} Cristal).`
        );
        return false;
      }
      playerResources.wood = Math.max(0, (playerResources.wood || 0) - woodCost);
      playerResources.crystal = Math.max(0, (playerResources.crystal || 0) - crystalCost);
    }

    this.structures[type] = (this.structures[type] || 0) + 1;
    const count = this.structures[type];
    let rx;
    let rz;
    if (type === 'watchtower' && this.watchtowers.length === 0) {
      rx = -8.5;
      rz = -7.5;
    } else {
      const angle = count * 1.65 + (type === 'watchtower' ? 0.5 : type === 'palisade' ? 2.1 : 3.9);
      rx = Math.cos(angle) * (this.radius - 2.2);
      rz = Math.sin(angle) * (this.radius - 2.2);
    }
    const centerY = this.terrain ? this.terrain.getHeightAt(rx, rz) : 2.2;

    if (type === 'watchtower') {
      this.watchtowers.push({ x: rx, y: centerY, z: rz, cooldown: 0 });
      this._addWatchtowerMesh(rx, rz);
    } else if (type === 'palisade') {
      this.maxHp += structDef.hpBonus || 180;
      this.hp = Math.min(this.maxHp, this.hp + (structDef.hpBonus || 180));
      this.thornsDamage += structDef.thornsDamage || 8;
      this._addPalisadeMesh();
    } else if (type === 'biolab') {
      this.scoutVisionBonus += structDef.scoutVisionBonus || 12;
      this._addBiolabMesh(rx, rz);
    }

    logger.info('BASTION', `Construction achevée : [${structDef.name}] (Niveau ${count}) !`, {
      type,
      structures: { ...this.structures },
    });
    if (typeof this.onStructureBuilt === 'function') {
      this.onStructureBuilt(type, count);
    }
    return true;
  }

  /**
   * Adds wooden spiked Palisade walls around the Bastion perimeter.
   */
  _addPalisadeMesh() {
    if (!this.bastionGroup) return;
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x543822, roughness: 0.8 });
    const count = 18;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.structures.palisade * 0.15;
      const stake = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.2, 5), woodMat);
      stake.position.set(Math.cos(a) * (this.radius - 0.8), 1.0, Math.sin(a) * (this.radius - 0.8));
      stake.castShadow = true;
      this.bastionGroup.add(stake);
    }
  }

  /**
   * Adds a glowing arcane Bio-Laboratory dome to the Bastion.
   */
  _addBiolabMesh(rx, rz) {
    if (!this.bastionGroup) return;
    const labGroup = new THREE.Group();
    labGroup.position.set(rx, 0, rz);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3b4d61, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x2ed573,
      emissive: 0x10ac84,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.78,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 1.2, 10), stoneMat);
    base.position.y = 0.6;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.35, 12, 10), glassMat);
    dome.position.y = 1.5;
    labGroup.add(base, dome);
    this.bastionGroup.add(labGroup);
  }

  /**
   * Returns current NPC counts by role and rescue status.
   * @returns {{ total: number, harvester: number, guard: number, scout: number, rescued: number, totalCages: number }}
   */
  getRoleCounts() {
    let harvester = 0;
    let guard = 0;
    let scout = 0;
    for (const npc of this.npcs) {
      if (npc.role === 'harvester') harvester++;
      else if (npc.role === 'guard') guard++;
      else if (npc.role === 'scout') scout++;
    }
    return {
      total: this.npcs.length,
      harvester,
      guard,
      scout,
      rescued: this.rescuedCount,
      totalCages: this.totalCages,
    };
  }

  /**
   * Returns all active Scout NPCs.
   * @returns {Array<Object>}
   */
  getScouts() {
    return this.npcs.filter((n) => n.role === 'scout');
  }

  /**
   * Applies damage to the Bastion Sanctuary and returns thorns damage reflected to the attacker.
   * @param {number} amount
   * @returns {number} Reflected thorns damage.
   */
  damageBastion(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.hp = Math.round(this.maxHp * 0.4);
      logger.warn('BASTION', 'Les défenses du Bastion ont vacillé ! Réparation d’urgence engagée.');
    }
    return this.thornsDamage;
  }

  /**
   * Applies damage to an allied NPC. If a Scout's HP drops low, it teleports/retreats safely
   * to the Bastion hearth to recover.
   */
  damageNpc(npcId, amount) {
    const npc = this.npcs.find((n) => n.id === npcId);
    if (!npc) return;
    npc.hp -= amount;
    if (npc.hp <= 0) {
      npc.hp = npc.maxHp;
      npc.x = (Math.random() - 0.5) * 5;
      npc.z = (Math.random() - 0.5) * 5;
      if (npc.role === 'scout') {
        this._assignNewWildernessWaypoint(npc, []);
      }
      logger.info('BASTION', `${npc.name} (${this._roleLabelFR(npc.role)}) s'est replié au Bastion pour récupérer.`);
    }
  }

  /**
   * Updates the Bastion campfire animation, Watchtower auto-turrets, Prisoner Cages,
   * and all Allied NPCs (Harvesters, Guards, and Deep-Wilderness Scouts).
   *
   * @param {number} dt - Frame delta time in seconds.
   * @param {number} elapsedTime - Total elapsed game time in seconds.
   * @param {Object} enemyManager - EnemyManager instance.
   * @param {Object} player - PlayerController instance.
   * @param {Function} [onScoutDiscovery] - Callback invoked when a Scout discovers a mutant/hybrid.
   */
  update(dt, elapsedTime, enemyManager, player, onScoutDiscovery) {
    if (typeof onScoutDiscovery === 'function') {
      this.onScoutDiscovery = onScoutDiscovery;
    }

    // 1. Animate Bastion Roaring Campfire & Cage Crystals
    if (this.campfireFlame) {
      const flicker = 1 + Math.sin(elapsedTime * 11.5) * 0.12 + Math.cos(elapsedTime * 17.0) * 0.08;
      this.campfireFlame.scale.set(flicker, 0.92 + flicker * 0.15, flicker);
      this.campfireFlame.rotation.y = elapsedTime * 1.5;
    }

    for (const cage of this.cages) {
      if (!cage.rescued && cage.mesh?.userData?.crystal) {
        cage.mesh.userData.crystal.rotation.y = elapsedTime * 2.5;
        cage.mesh.userData.crystal.position.y = 3.1 + Math.sin(elapsedTime * 3.5) * 0.18;
      }
    }

    const enemies = enemyManager && typeof enemyManager.getEnemies === 'function' ? enemyManager.getEnemies() : [];
    const worldSize = CONFIG.WORLD?.SIZE || 240;
    const worldHalf = worldSize * 0.45;

    // 2. Update Watchtower Auto-Turrets
    const towerSpec = CONFIG.BASTION?.STRUCTURES?.watchtower || { range: 34, damage: 16, fireInterval: 1.4 };
    for (const tower of this.watchtowers) {
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      if (tower.cooldown <= 0 && enemies.length > 0) {
        let nearest = null;
        let minDist = towerSpec.range;
        for (const e of enemies) {
          const d = dist2D(tower.x, tower.z, e.x, e.z);
          if (d < minDist) {
            minDist = d;
            nearest = e;
          }
        }
        if (nearest) {
          tower.cooldown = towerSpec.fireInterval;
          this._spawnBolt(
            tower.x,
            tower.y + 4.8,
            tower.z,
            nearest,
            Math.round(towerSpec.damage * this.turretDamageMultiplier),
            0x48dbfb
          );
        }
      }
    }

    // 3. Update Allied NPCs by Role
    for (const npc of this.npcs) {
      npc.actionTimer = Math.max(0, npc.actionTimer - dt);

      if (npc.role === 'harvester') {
        this._updateHarvesterAI(npc, dt, player);
      } else if (npc.role === 'guard') {
        this._updateGuardAI(npc, dt, enemies);
      } else if (npc.role === 'scout') {
        this._updateScoutAI(npc, dt, enemies, this.onScoutDiscovery);
      }

      // Clamp to island & ground on terrain
      npc.x = clamp(npc.x + npc.vx * dt, -worldHalf, worldHalf);
      npc.z = clamp(npc.z + npc.vz * dt, -worldHalf, worldHalf);
      npc.y = this.terrain ? this.terrain.getHeightAt(npc.x, npc.z) : 0;

      if (npc.y < CONFIG.WORLD.WATER_LEVEL + 0.1) {
        const toCenter = Math.atan2(-npc.z, -npc.x);
        npc.x += Math.cos(toCenter) * 10 * dt;
        npc.z += Math.sin(toCenter) * 10 * dt;
        npc.y = this.terrain ? this.terrain.getHeightAt(npc.x, npc.z) : 0;
        if (npc.role === 'scout') {
          this._assignNewWildernessWaypoint(npc, enemies);
        }
      }

      if (npc.mesh) {
        npc.mesh.position.set(npc.x, Math.max(npc.y, CONFIG.WORLD.WATER_LEVEL + 0.15), npc.z);
        const speedMag = Math.hypot(npc.vx, npc.vz);
        if (speedMag > 0.15) {
          npc.mesh.rotation.y = Math.atan2(npc.vx, npc.vz);
        }
        animateCreatureMesh(
          npc.mesh,
          {
            isMoving: speedMag > 0.2,
            speed: speedMag,
            isAttacking: npc.state === 'attack',
          },
          elapsedTime,
          dt
        );
      } else {
        npc.position.set(npc.x, npc.y, npc.z);
      }
    }

    // 4. Update Guard & Watchtower Bolts
    this._updateBolts(dt, enemyManager);
  }

  /**
   * Harvester AI: gathers wood/crystal around the Bastion (`10..28` units) and repairs Bastion HP.
   */
  _updateHarvesterAI(npc, dt, player) {
    npc.state = 'harvesting';
    const dTarget = dist2D(npc.x, npc.z, npc.targetX, npc.targetZ);
    if (dTarget < 2.0) {
      const distCenter = Math.hypot(npc.x, npc.z);
      if (distCenter > 10) {
        // Return to Bastion hearth with gathered resources
        npc.targetX = (Math.random() - 0.5) * 6;
        npc.targetZ = (Math.random() - 0.5) * 6;
        if (player && player.resources) {
          player.resources.wood += 2;
          if (Math.random() < 0.45) player.resources.crystal += 1;
        }
        this.hp = Math.min(this.maxHp, this.hp + 8);
      } else {
        // Head out to a nearby resource ring around the Bastion
        const a = Math.random() * Math.PI * 2;
        const r = 14 + Math.random() * 14;
        npc.targetX = Math.cos(a) * r;
        npc.targetZ = Math.sin(a) * r;
      }
    }

    const angle = Math.atan2(npc.targetZ - npc.z, npc.targetX - npc.x);
    npc.vx = Math.cos(angle) * npc.speed * 0.7;
    npc.vz = Math.sin(angle) * npc.speed * 0.7;
  }

  /**
   * Guard AI: patrols the Bastion perimeter (`12..22` units) and fires bolts at approaching enemies.
   */
  _updateGuardAI(npc, dt, enemies) {
    let nearestEnemy = null;
    let nearestDist = 30;
    for (const e of enemies) {
      const d = dist2D(npc.x, npc.z, e.x, e.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = e;
      }
    }

    if (nearestEnemy && npc.actionTimer <= 0) {
      npc.state = 'attack';
      npc.actionTimer = 1.25;
      this._spawnBolt(
        npc.x,
        npc.y + 1.2,
        npc.z,
        nearestEnemy,
        Math.round(14 * this.turretDamageMultiplier),
        0xe6a145
      );
    } else {
      npc.state = 'patrol';
    }

    const dTarget = dist2D(npc.x, npc.z, npc.targetX, npc.targetZ);
    if (dTarget < 2.2) {
      const a = Math.random() * Math.PI * 2;
      const r = this.radius + 2 + Math.random() * 7;
      npc.targetX = Math.cos(a) * r;
      npc.targetZ = Math.sin(a) * r;
    }

    const angle = Math.atan2(npc.targetZ - npc.z, npc.targetX - npc.x);
    npc.vx = Math.cos(angle) * npc.speed * 0.8;
    npc.vz = Math.sin(angle) * npc.speed * 0.8;
  }

  /**
   * Scout (Éclaireur) AI:
   * 1. Ventures into the Deep Wilderness (`45..105` units from Bastion) to patrol distant biomes.
   * 2. Immediately switches to `'fleeing'` state when any enemy is within `FLEE_RADIUS` (`16` units),
   *    steering away from threats with tangential evasion.
   * 3. Scans all enemies within `VISION_RADIUS` (`34+` units) and triggers a Priority Alert +
   *    3D Sky Beacon whenever an unspotted Mutant (`mutations.length > 0`) or Hybrid (`isHybrid`) is discovered!
   */
  _updateScoutAI(scout, dt, enemies, onScoutDiscovery) {
    const effectiveVision =
      ((CONFIG.SCOUT?.VISION_RADIUS || 34) + this.scoutVisionBonus) * this.scoutVisionMultiplier;
    const effectiveSpeed = (CONFIG.SCOUT?.SPEED || 13) * this.scoutSpeedMultiplier;
    const fleeRadius = CONFIG.SCOUT?.FLEE_RADIUS || 16;

    scout.visionRadius = effectiveVision;

    // 1. Scan for Mutations & Hybrids within Vision Radius
    const nearbyThreats = [];
    for (const enemy of enemies) {
      const d = dist2D(scout.x, scout.z, enemy.x, enemy.z);

      if (d <= fleeRadius) {
        nearbyThreats.push(enemy);
      }

      if (d <= effectiveVision && !enemy.spottedByScout) {
        const mutations = Array.isArray(enemy.genome?.mutations) ? enemy.genome.mutations : [];
        const isHybrid = Boolean(enemy.genome?.isHybrid);

        if (mutations.length > 0 || isHybrid) {
          enemy.spottedByScout = true;

          // Register discovery in EcosystemSimulator
          if (this.ecoSim && typeof this.ecoSim.markMutationDiscovered === 'function') {
            for (const mutId of mutations) {
              this.ecoSim.markMutationDiscovered(mutId, enemy.id);
            }
            if (isHybrid) {
              this.ecoSim.markMutationDiscovered(
                enemy.genome.lineageId || enemy.genome.speciesName,
                enemy.id
              );
            }
          }

          // Activate dramatic 3D vertical sky-beam beacon on the Patient Zero / Mutant
          const primaryMutId = mutations[0];
          const beaconColor = primaryMutId
            ? CONFIG.MUTATIONS?.[primaryMutId]?.colorHex || 0xff3300
            : 0x48dbfb;

          if (this.vfx && typeof this.vfx.setPatientZeroBeacon === 'function') {
            this.vfx.setPatientZeroBeacon(
              enemy.id,
              enemy.mesh ? enemy.mesh.position : enemy.position,
              beaconColor,
              true
            );
          }

          const direction = getCardinalLabelFR(enemy.x, enemy.z);
          const mutLabels = mutations
            .map((m) => CONFIG.MUTATIONS?.[m]?.name || m)
            .join(', ');
          const stageTag = enemy.lifeStage === 'baby' || enemy.isAdult === false ? ' [BÉBÉ JUVÉNILE]' : '';
          const descLabel = mutations.length > 0 ? `${enemy.genome.speciesName} — ${mutLabels}` : `Hybride ${enemy.genome.speciesName}`;

          logger.alert(
            `🦅 ALERTE ÉCLAIREUR (${scout.name}) : Nouveau [${descLabel}]${stageTag} repéré au ${direction} ! Éliminez-le avant sa reproduction !`,
            {
              scoutId: scout.id,
              scoutName: scout.name,
              enemyId: enemy.id,
              speciesName: enemy.genome.speciesName,
              mutations,
              isHybrid,
              lifeStage: enemy.lifeStage,
              isAdult: enemy.isAdult,
              direction,
              x: Math.round(enemy.x),
              z: Math.round(enemy.z),
            }
          );

          if (typeof onScoutDiscovery === 'function') {
            onScoutDiscovery({
              scout,
              enemy,
              mutations,
              isHybrid,
              speciesName: enemy.genome.speciesName,
              lifeStage: enemy.lifeStage,
              isAdult: enemy.isAdult,
              direction,
            });
          }
        }
      }
    }

    // 2. Flee Behavior vs Deep-Wilderness Expedition Movement
    if (nearbyThreats.length > 0) {
      scout.state = 'fleeing';
      const evasion = computeScoutEvasionVector(
        scout,
        nearbyThreats,
        this.pos,
        CONFIG.WORLD?.SIZE || 240
      );
      scout.vx = evasion.vx * this.scoutSpeedMultiplier;
      scout.vz = evasion.vz * this.scoutSpeedMultiplier;
    } else {
      scout.state = 'expedition';
      const priorityTutorialTarget = enemies.find(
        (e) =>
          !e.spottedByScout &&
          (e.tutorialTag === 'act6_baby_fire_troll' || (this.tutorialMode && e.isPatientZero))
      );

      if (priorityTutorialTarget) {
        scout.targetX = priorityTutorialTarget.x;
        scout.targetZ = priorityTutorialTarget.z;
        scout.sectorName = getCardinalLabelFR(priorityTutorialTarget.x, priorityTutorialTarget.z);
        const angle = Math.atan2(scout.targetZ - scout.z, scout.targetX - scout.x);
        scout.vx = Math.cos(angle) * effectiveSpeed * 1.45;
        scout.vz = Math.sin(angle) * effectiveSpeed * 1.45;
      } else {
        scout.waypointTimer -= dt;
        const dWaypoint = dist2D(scout.x, scout.z, scout.targetX, scout.targetZ);

        if (dWaypoint < 5.0 || scout.waypointTimer <= 0) {
          this._assignNewWildernessWaypoint(scout, enemies);
        }

        const angle = Math.atan2(scout.targetZ - scout.z, scout.targetX - scout.x);
        scout.vx = Math.cos(angle) * effectiveSpeed;
        scout.vz = Math.sin(angle) * effectiveSpeed;
      }
    }
  }

  /**
   * Spawns a ranged bolt projectile from a Watchtower or Guard toward a target enemy.
   */
  _spawnBolt(x, y, z, targetEnemy, damage, colorHex = 0x48dbfb) {
    let mesh = null;
    if (this.scene) {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 6, 6),
        new THREE.MeshStandardMaterial({
          color: colorHex,
          emissive: colorHex,
          emissiveIntensity: 1.8,
        })
      );
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
    }

    this.bolts.push({
      x,
      y,
      z,
      targetId: targetEnemy.id,
      targetX: targetEnemy.x,
      targetZ: targetEnemy.z,
      speed: 32,
      damage,
      ttl: 1.4,
      mesh,
    });
  }

  /**
   * Updates active Guard and Watchtower bolt projectiles.
   */
  _updateBolts(dt, enemyManager) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.ttl -= dt;

      const enemies = enemyManager ? enemyManager.getEnemies() : [];
      const target = enemies.find((e) => e.id === b.targetId);
      if (target) {
        b.targetX = target.x;
        b.targetZ = target.z;
      }

      const angle = Math.atan2(b.targetZ - b.z, b.targetX - b.x);
      b.x += Math.cos(angle) * b.speed * dt;
      b.z += Math.sin(angle) * b.speed * dt;
      if (b.mesh) {
        b.mesh.position.set(b.x, b.y, b.z);
      }

      const d = dist2D(b.x, b.z, b.targetX, b.targetZ);
      if (d < 1.4 || b.ttl <= 0) {
        if (d < 1.4 && target && enemyManager) {
          enemyManager.damageEnemy(target.id, b.damage);
        }
        if (b.mesh && this.scene) {
          this.scene.remove(b.mesh);
        }
        this.bolts.splice(i, 1);
      }
    }
  }
}

export default BastionAndNPCs;
