/**
 * @fileoverview Central Bastion Sanctuary, 5 Interactive 3D Building Pads (Levels 0 -> 3),
 * Prisoner Cage Rescues, Assignable Scout Missions (`track_lineage`, `find_cages`,
 * `scout_volcano`, `perimeter_alert`), and Allied NPC AI for **Genesis Bastion**.
 *
 * Key Phase 4 Features:
 * 1. **5 Upgradable 3D Bastion Buildings on Physical Pads (`[E]` in 3D or `[H]` HUD Modal)**:
 *    - `sanctuary_hearth` (`(0, 0)`, Lv 1 -> 3): Bastion Max HP, Hero hearth healing (`15 -> 45 HP/s`),
 *      movement speed aura, and Lv 3 solar burn aura (`12 DPS`).
 *    - `watchtower` (`(8.5, -7.5)`, Lv 0 -> 3): Auto-firing turret scaling from Archer Tower (Lv 1)
 *      to Double Cryo-Ballista with 35% Slow (Lv 2) to Pyrophage Anti-Mutant Spire with 2x mutant damage (Lv 3).
 *    - `scout_guild` (`(-8.5, -7.5)`, Lv 0 -> 3): Boosts Scout vision (`+30%..+95%`) & speed (`+25%..+70%`),
 *      spawns a bonus Scout on Lv 1, deploys Slowing Beacons on Patient Zeroes at Lv 2, and auto-spots
 *      newborn mutants at Lv 3.
 *    - `lumber_forge` (alias `palisade`, `(8.5, 7.5)`, Lv 0 -> 3): Generates passive Wood/Crystal/Biomass
 *      every `5s` (boosted by Harvesters) and erects spiked perimeter Palisades (`+180..+650 HP`, `10..38` thorns).
 *    - `biolab` (`(-8.5, 7.5)`, Lv 0 -> 3): Grants `+15%..+50%` Hero damage vs Mutants/Hybrids, slows
 *      Mutant Baby maturation across the island (`20%..60%`), and boosts Mutant XP/Biomass rewards at Lv 3.
 * 2. **Assignable Scout Missions (`setScoutMission(missionType, targetMutationId)`)**:
 *    - `'track_lineage'`: Scouts hunt down every unspotted carrier (Adult & Baby) of the target mutant
 *      lineage (`Repérés : X / Y`), lighting up their 3D sky beacons.
 *    - `'find_cages'`: Scouts locate unrescued Prisoner Cages and light golden 3D beacons on them.
 *    - `'scout_volcano'`: Deep-wilderness patrol across high-mutagenicity caldera zones.
 *    - `'perimeter_alert'`: Frontier vigilance patrol around the Bastion perimeter.
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { buildCreatureMesh, animateCreatureMesh } from './CreatureMeshBuilder.js';
import { blenderModelManager } from './BlenderModelManager.js';
import {
  pickScoutExpeditionWaypoint,
  computeScoutEvasionVector,
} from '../ecosystem/BalanceAndPacing.js';
import {
  BASTION_BUILDINGS_CATALOG,
  BASTION_BUILDINGS_BY_ID,
  getBuildingUpgradeSpec,
  canAffordBuildingUpgrade,
  SCOUT_MISSIONS_CATALOG,
  getScoutMissionSpec,
  ELEMENTAL_WEAPONS_CATALOG,
  getElementalWeaponSpec,
  RELIC_FRAGMENTS_SPEC,
  getIslandTierSpec,
} from '../ecosystem/BaseAndQuestsDesign.js';
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
    this.baseMaxHp = CONFIG.BASTION?.MAX_HP || 500;
    /** @type {number} */
    this.maxHp = this.baseMaxHp;
    /** @type {number} */
    this.hp = CONFIG.BASTION?.INITIAL_HP || 500;
    /** @type {number} */
    this.thornsDamage = 0;

    // Modifiers from buildings & roguelike upgrades
    /** @type {number} */
    this.scoutVisionBonus = 0;
    /** @type {number} */
    this.scoutVisionMultiplier = 1.0;
    /** @type {number} */
    this.scoutSpeedMultiplier = 1.0;
    /** @type {number} */
    this.guildVisionMult = 1.0;
    /** @type {number} */
    this.guildSpeedMult = 1.0;
    /** @type {number} */
    this.turretDamageMultiplier = 1.0;
    /** @type {number} Bonus Hero damage vs mutants/hybrids from Bio-Lab (`0.15` -> `0.30` -> `0.50`) */
    this.heroMutantDamageBonus = 0;
    /** @type {number} Multiplier (`<= 1.0`) applied to mutant baby aging rate from Bio-Lab (`0.8` -> `0.6` -> `0.4`) */
    this.mutantMaturationSlowFactor = 1.0;
    /** @type {number} Bonus XP & Biomass multiplier on mutant kills from Bio-Lab Lv3 */
    this.bonusMutantXpMult = 1.0;
    /** @type {boolean} Whether Scouts deploy slowing beacons on spotted Patient Zeroes (Scout Guild Lv2+) */
    this.slowBeaconOnPatientZero = false;
    /** @type {number} Slow factor applied by Scout Guild beacon (`0.65` at Lv2, `0.50` at Lv3) */
    this.slowBeaconFactor = 0.65;
    /** @type {boolean} Whether newborn mutants are automatically spotted at birth (Scout Guild Lv3) */
    this.autoSpotNewbornMutants = false;
    /** @type {number} Hero HP/s regeneration inside Bastion aura (`15` -> `28` -> `45`) */
    this.heroHealRate = 15;
    /** @type {number} Bastion sanctuary aura radius (`14` -> `18` -> `22`) */
    this.passiveAuraRange = 14;
    /** @type {number} Solar burn DPS inflicted on enemies inside Bastion aura at Sanctuary Hearth Lv3 */
    this.auraBurnDps = 0;
    /** @type {number} Timer for passive Lumber Forge 5-second resource production */
    this.passiveProductionTimer = 0;
    /** @type {number} Timer for Sanctuary Hearth Lv3 solar burn aura ticks */
    this.hearthAuraTickTimer = 0;

    /** @type {boolean} Whether the 7-Act Guided Onboarding tutorial mode is active */
    this.tutorialMode = Boolean(options?.tutorialMode);

    /**
     * Building levels (`0..3`) for all 5 Bastion structures + legacy `palisade` alias.
     * @type {{ sanctuary_hearth: number, watchtower: number, scout_guild: number, lumber_forge: number, palisade: number, biolab: number }}
     */
    this.structures = {
      sanctuary_hearth: 1,
      watchtower: this.tutorialMode ? 0 : 1,
      scout_guild: 0,
      lumber_forge: 0,
      palisade: 0,
      biolab: 0,
    };

    /** @type {Map<string, { id: string, x: number, z: number, y: number, group: THREE.Group|null, ringMesh: THREE.Mesh|null, modelGroup: THREE.Group|null }>} */
    this.buildingPads = new Map();

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

    /**
     * Phase 8 — 4 Elemental Weapon Shrines (`fire_greatsword`, `ice_greatsword`, `lightning_greatsword`, `venom_greatsword`).
     * @type {Array<Object>}
     */
    this.weaponShrines = [];

    /**
     * Phase 8 — 3 Ancient Relic Monoliths (`relic_dawn_north`, `relic_breakers_southeast`, `relic_caldera_southwest`)
     * that power the Planetary Island Shield Dome (`0 / 3` -> `3 / 3`).
     * @type {Array<Object>}
     */
    this.relicShrines = [];
    /** @type {number} Number of Ancient Relic Fragments collected on the current island (`0..3`) */
    this.collectedRelicFragments = 0;
    /** @type {number} Required Relic Fragments to deploy the Planetary Island Shield (`3`) */
    this.maxRelicFragments = RELIC_FRAGMENTS_SPEC?.requiredCount || 3;
    /** @type {boolean} Whether the Planetary Island Shield Dome is currently deployed */
    this.islandShieldActive = false;
    /** @type {number} Current campaign island number (`1, 2, 3...`) */
    this.islandNumber = 1;

    /**
     * Current assignable Scout Mission order (`'track_lineage' | 'find_cages' | 'scout_volcano' | 'perimeter_alert'`).
     * Defaults to tracking `'pyro_gland'` (Fire Trolls / Glande Pyroclastique).
     * @type {Object}
     */
    this.activeScoutMission = getScoutMissionSpec('track_lineage', 'pyro_gland');

    /** @type {Function|null} Optional callback when a Scout discovers a mutant/hybrid */
    this.onScoutDiscovery = null;
    /** @type {Function|null} Optional callback `(type, level, spec)` when a structure is built/upgraded */
    this.onStructureBuilt = null;
    /** @type {Function|null} Optional callback `(role, counts)` when an NPC role is assigned/recruited */
    this.onRoleAssigned = null;
    /** @type {Function|null} Optional callback `(npc, cage)` when a cage is rescued */
    this.onCageRescued = null;
    /** @type {Function|null} Optional callback `(missionSpec)` when Scout Mission order changes */
    this.onScoutMissionChanged = null;
    /** @type {Function|null} Optional callback `(relic, collectedCount, maxCount)` when a Relic Fragment is collected */
    this.onRelicCollected = null;
    /** @type {Function|null} Optional callback `(shrine, weaponSpec)` when an Elemental Weapon Shrine is interacted with */
    this.onWeaponShrineInteracted = null;
    /** @type {Function|null} Optional callback `(islandNumber)` when the Planetary Island Shield is activated */
    this.onIslandShieldActivated = null;
    /** @type {Function|null} Optional callback `(relic, scout)` when a Scout spots a Relic Monolith */
    this.onRelicSpottedByScout = null;
    /** @type {Function|null} Optional callback `(deathInfo)` when the Bastion Sanctuary HP reaches 0 */
    this.onBastionDestroyed = null;
    /** @type {Function|null} Optional callback `(npc, attackerEnemy, direction, messageFR, messageEN)` when an allied NPC is under attack */
    this.onNpcUnderAttack = null;
    /** @type {Function|null} Optional callback `(npc, attackerEnemy, direction, messageFR, messageEN)` when an allied NPC is killed */
    this.onNpcKilled = null;

    /** @type {THREE.Group|null} Root 3D group for the Bastion Sanctuary */
    this.bastionGroup = null;
    /** @type {THREE.Mesh|null} Animated campfire flame mesh */
    this.campfireFlame = null;

    this._buildBastionSanctuary();
    this._recomputeBuildingStats();
    this._spawnWeaponShrines();

    if (this.tutorialMode) {
      this.setTutorialMode(true);
    } else {
      this._spawnPrisonerCages();
      this._spawnRelicMonoliths(this.islandNumber);
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
   * - Resets Watchtower to Level 0 (`Chantier Vierge`) until the player builds one in Act 4
   *
   * @param {boolean} [enabled=true]
   */
  setTutorialMode(enabled = true) {
    this.tutorialMode = Boolean(enabled);
    if (this.tutorialMode) {
      this.clearAllNpcs();
      this.clearAllCages();
      this.watchtowers = [];
      this.structures.sanctuary_hearth = 1;
      this.structures.watchtower = 0;
      this.structures.scout_guild = 0;
      this.structures.lumber_forge = 0;
      this.structures.palisade = 0;
      this.structures.biolab = 0;
      this.rescuedCount = 0;
      this._recomputeBuildingStats();
      this._refreshAllBuildingPadMeshes();
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
   * Removes all Prisoner Cages and their 3D meshes/beacons from the scene.
   */
  clearAllCages() {
    for (const cage of this.cages) {
      if (this.vfx && typeof this.vfx.setCageBeacon === 'function') {
        this.vfx.setCageBeacon(cage.id, null, false);
      }
      if (cage.mesh && this.scene) {
        this.scene.remove(cage.mesh);
      }
    }
    this.cages = [];
  }

  /**
   * Builds the central 3D Bastion Sanctuary at `(0, 0)` along with the **5 Interactive 3D Building Pads**:
   * - `sanctuary_hearth` at `(0, 0)`
   * - `watchtower` at `(8.5, -7.5)`
   * - `scout_guild` at `(-8.5, -7.5)`
   * - `lumber_forge` at `(8.5, 7.5)`
   * - `biolab` at `(-8.5, 7.5)`
   */
  _buildBastionSanctuary() {
    const centerY = this.terrain ? this.terrain.getHeightAt(0, 0) : 2.2;
    if (this.structures.watchtower >= 1) {
      this.watchtowers.push({ x: 8.5, y: centerY, z: -7.5, cooldown: 0 });
    }

    // Register all 5 building pad coordinates even in headless mode
    for (const bDef of BASTION_BUILDINGS_CATALOG) {
      const px = bDef.padPos.x;
      const pz = bDef.padPos.z;
      const py = this.terrain ? this.terrain.getHeightAt(px, pz) : centerY;
      this.buildingPads.set(bDef.id, {
        id: bDef.id,
        x: px,
        z: pz,
        y: py,
        group: null,
        ringMesh: null,
        modelGroup: null,
      });
    }

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

    // 1. Stone Sanctuary Plinth & Hearth Ring at (0, 0)
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

    // 4. Defensive Sanctuary Perimeter Ring
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

    // 5. Create 3D Building Pad Groups for all 5 buildings
    for (const bDef of BASTION_BUILDINGS_CATALOG) {
      const padEntry = this.buildingPads.get(bDef.id);
      if (!padEntry) continue;

      const padGroup = new THREE.Group();
      padGroup.name = `Pad_${bDef.id}`;
      const relY = padEntry.y - centerY;
      padGroup.position.set(bDef.padPos.x, relY, bDef.padPos.z);

      // Foundation stone disc for non-center pads
      if (bDef.id !== 'sanctuary_hearth') {
        const foundation = new THREE.Mesh(
          new THREE.CylinderGeometry(2.55, 2.85, 0.28, 12),
          stoneMat
        );
        foundation.position.y = 0.14;
        foundation.receiveShadow = true;
        padGroup.add(foundation);
      }

      // Glowing interactive construction / upgrade ring on the ground
      const padRingRadius = bDef.id === 'sanctuary_hearth' ? 3.6 : 2.75;
      const padRingGeo = new THREE.RingGeometry(padRingRadius - 0.22, padRingRadius, 32);
      padRingGeo.rotateX(-Math.PI / 2);
      const padRingMat = new THREE.MeshBasicMaterial({
        color: bDef.colorHex || 0xe6a145,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.58,
      });
      const ringMesh = new THREE.Mesh(padRingGeo, padRingMat);
      ringMesh.position.y = 0.3;
      padGroup.add(ringMesh);

      const modelGroup = new THREE.Group();
      padGroup.add(modelGroup);

      this.bastionGroup.add(padGroup);
      padEntry.group = padGroup;
      padEntry.ringMesh = ringMesh;
      padEntry.modelGroup = modelGroup;
    }

    this._refreshAllBuildingPadMeshes();
  }

  /**
   * Rebuilds the 3D meshes on all 5 Bastion building pads to match their current level (`0..3`).
   */
  _refreshAllBuildingPadMeshes() {
    if (!this.bastionGroup) return;
    this.watchtowerMeshes = [];
    for (const bDef of BASTION_BUILDINGS_CATALOG) {
      this._rebuildSingleBuildingPadMesh(bDef.id);
    }
  }

  /**
   * Rebuilds the 3D architectural model for a single Bastion building pad at its current level (`0..3`).
   * @param {string} buildingId
   */
  _rebuildSingleBuildingPadMesh(buildingId) {
    const padEntry = this.buildingPads.get(buildingId);
    if (!padEntry || !padEntry.modelGroup) return;

    const modelGroup = padEntry.modelGroup;
    while (modelGroup.children.length > 0) {
      modelGroup.remove(modelGroup.children[0]);
    }

    const level = this.getBuildingLevel(buildingId);
    const bDef = BASTION_BUILDINGS_BY_ID[buildingId];
    if (padEntry.ringMesh) {
      padEntry.ringMesh.visible = level < (bDef?.maxLevel || 3);
    }

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.75 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.7 });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0xe6a145,
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.75,
    });

    // Level 0: Unbuilt Construction Site Stakes & Glowing Blueprint Beacon
    if (level === 0) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), woodMat);
        stake.position.set(Math.cos(a) * 1.7, 0.65, Math.sin(a) * 1.7);
        modelGroup.add(stake);
      }
      const holoOrb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38, 0),
        new THREE.MeshStandardMaterial({
          color: bDef?.colorHex || 0xffd166,
          emissive: bDef?.colorHex || 0xffd166,
          emissiveIntensity: 1.4,
          wireframe: true,
        })
      );
      holoOrb.position.y = 1.35;
      modelGroup.userData.floatingCrystal = holoOrb;
      modelGroup.add(holoOrb);
      return;
    }

    if (buildingId === 'sanctuary_hearth') {
      if (level >= 2) {
        // Level 2: 4 Amber Runic Obelisks around the central hearth
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
          const obelisk = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.6, 0.45), goldMat);
          obelisk.position.set(Math.cos(a) * 3.2, 1.3, Math.sin(a) * 3.2);
          obelisk.castShadow = true;
          modelGroup.add(obelisk);
        }
      }
      if (level >= 3) {
        // Level 3: Floating Solar Crown Ring above the hearth
        const crown = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.14, 10, 32), goldMat);
        crown.rotation.x = Math.PI / 2;
        crown.position.y = 3.6;
        modelGroup.userData.floatingCrystal = crown;
        modelGroup.add(crown);
      }
      return;
    }

    if (buildingId === 'watchtower') {
      const roofMat = new THREE.MeshStandardMaterial({
        color: level >= 3 ? 0x8b1e1e : 0x2b3d4f,
        roughness: 0.55,
      });
      const crystalColor = level >= 3 ? 0xff4500 : level === 2 ? 0x00e5ff : 0x48dbfb;
      const crystalMat = new THREE.MeshStandardMaterial({
        color: crystalColor,
        emissive: crystalColor,
        emissiveIntensity: 1.7,
      });

      const heightScale = 1 + (level - 1) * 0.22;
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 4.2 * heightScale, 2.1),
        level >= 2 ? stoneMat : woodMat
      );
      base.position.y = 2.1 * heightScale;
      base.castShadow = true;
      base.receiveShadow = true;

      const platform = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.45, 2.8), woodMat);
      platform.position.y = 4.3 * heightScale;
      platform.castShadow = true;

      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.9, 4), roofMat);
      roof.position.y = 4.3 * heightScale + 1.85;
      roof.rotation.y = Math.PI * 0.25;
      roof.castShadow = true;

      const beacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38 + level * 0.08, 0),
        crystalMat
      );
      beacon.position.y = 4.3 * heightScale + 0.65;
      modelGroup.userData.floatingCrystal = beacon;

      modelGroup.add(base, platform, roof, beacon);

      if (level >= 2) {
        // Twin Ballista Arms
        const arm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 0.28), goldMat);
        arm.position.y = 4.3 * heightScale + 0.35;
        modelGroup.add(arm);
      }
      if (level >= 3) {
        // Pyrophage Halo Ring
        const halo = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.1, 8, 24), crystalMat);
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 4.3 * heightScale + 0.65;
        modelGroup.add(halo);
      }
      this.watchtowerMeshes.push(modelGroup);
      return;
    }

    if (buildingId === 'scout_guild') {
      const azureMat = new THREE.MeshStandardMaterial({
        color: 0x1e90ff,
        emissive: 0x0984e3,
        emissiveIntensity: 1.3,
      });
      // Command Pavilion Pillars & Map Table
      const table = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 1.0, 8), woodMat);
      table.position.y = 0.6;
      modelGroup.add(table);

      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.2, 6), woodMat);
        pillar.position.set(Math.cos(a) * 1.75, 1.7, Math.sin(a) * 1.75);
        pillar.castShadow = true;
        modelGroup.add(pillar);
      }

      const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.4, 4), azureMat);
      canopy.position.y = 3.8;
      canopy.rotation.y = Math.PI * 0.25;
      modelGroup.add(canopy);

      if (level >= 2) {
        // Observatory Telescope & Signal Beacon
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.8, 8), goldMat);
        scope.position.set(0, 4.6, 0);
        scope.rotation.z = 0.55;
        modelGroup.add(scope);
      }
      if (level >= 3) {
        // Omniscient Astrolabe Ring
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.1, 8, 24), azureMat);
        ring.position.y = 5.1;
        modelGroup.userData.floatingCrystal = ring;
        modelGroup.add(ring);
      }
      return;
    }

    if (buildingId === 'lumber_forge') {
      const emeraldMat = new THREE.MeshStandardMaterial({
        color: 0x38c172,
        emissive: 0x10ac84,
        emissiveIntensity: 1.2,
      });
      // Sawmill & Forge Furnace on Pad
      const furnace = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.2 + level * 0.4, 2.0), stoneMat);
      furnace.position.y = 1.2 + level * 0.2;
      furnace.castShadow = true;
      modelGroup.add(furnace);

      const coreCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), emeraldMat);
      coreCrystal.position.y = 2.8 + level * 0.4;
      modelGroup.userData.floatingCrystal = coreCrystal;
      modelGroup.add(coreCrystal);

      // Perimeter Spiked Palisade stakes around the Bastion ring
      const stakeCount = 14 + level * 6;
      for (let i = 0; i < stakeCount; i++) {
        const a = (i / stakeCount) * Math.PI * 2;
        const wx = Math.cos(a) * (this.radius - 0.7) - padEntry.x;
        const wz = Math.sin(a) * (this.radius - 0.7) - padEntry.z;
        const stake = new THREE.Mesh(
          new THREE.ConeGeometry(0.28 + level * 0.05, 1.9 + level * 0.35, 5),
          level >= 2 ? stoneMat : woodMat
        );
        stake.position.set(wx, 0.95 + level * 0.15, wz);
        stake.castShadow = true;
        modelGroup.add(stake);
      }
      return;
    }

    if (buildingId === 'biolab') {
      const bioMat = new THREE.MeshStandardMaterial({
        color: 0x00d2d3,
        emissive: 0x01a3a4,
        emissiveIntensity: 1.35,
        transparent: true,
        opacity: 0.82,
      });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.9, 1.2, 12), stoneMat);
      base.position.y = 0.65;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.45 + (level - 1) * 0.2, 14, 12),
        bioMat
      );
      dome.position.y = 1.65;
      modelGroup.add(base, dome);

      const dnaCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), goldMat);
      dnaCrystal.position.y = 3.4 + level * 0.25;
      modelGroup.userData.floatingCrystal = dnaCrystal;
      modelGroup.add(dnaCrystal);
    }
  }

  /**
   * Recomputes all Bastion & Hero mechanical bonuses from the current levels (`0..3`) of all 5 buildings.
   */
  _recomputeBuildingStats() {
    // 1. Sanctuary Hearth (Lv 1..3)
    const hearthSpec = getBuildingUpgradeSpec('sanctuary_hearth', this.structures.sanctuary_hearth || 1);
    const hearthStats = hearthSpec.statsAtCurrent || {
      bastionMaxHp: 500,
      heroHealRate: 15,
      passiveAuraRange: 14,
      auraBurnDps: 0,
    };

    // 2. Lumber Forge / Palisade (Lv 0..3)
    const forgeLvl = Math.max(this.structures.lumber_forge || 0, this.structures.palisade || 0);
    this.structures.lumber_forge = forgeLvl;
    this.structures.palisade = forgeLvl;
    const forgeSpec = getBuildingUpgradeSpec('lumber_forge', forgeLvl);
    const forgeStats = forgeSpec.statsAtCurrent || {
      hpBonus: 0,
      thornsDamage: 0,
      woodPer5Sec: 0,
      crystalPer5Sec: 0,
      biomassPer5Sec: 0,
    };

    const prevMaxHp = this.maxHp || 500;
    this.maxHp = (hearthStats.bastionMaxHp || 500) + (forgeStats.hpBonus || 0);
    if (this.maxHp > prevMaxHp) {
      this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - prevMaxHp));
    }
    this.thornsDamage = forgeStats.thornsDamage || 0;
    this.heroHealRate = hearthStats.heroHealRate || 15;
    this.passiveAuraRange = hearthStats.passiveAuraRange || hearthStats.passiveauraRange || 14;
    this.auraBurnDps = hearthStats.auraBurnDps || 0;

    // 3. Scout Guild (Lv 0..3)
    const guildSpec = getBuildingUpgradeSpec('scout_guild', this.structures.scout_guild || 0);
    const guildStats = guildSpec.statsAtCurrent || {
      visionMult: 1.0,
      speedMult: 1.0,
      slowBeaconOnPatientZero: false,
      slowBeaconFactor: 0.65,
      autoSpotNewbornMutants: false,
    };
    this.guildVisionMult = guildStats.visionMult || 1.0;
    this.guildSpeedMult = guildStats.speedMult || 1.0;
    this.slowBeaconOnPatientZero = Boolean(guildStats.slowBeaconOnPatientZero);
    this.slowBeaconFactor = guildStats.slowBeaconFactor || 0.65;
    this.autoSpotNewbornMutants = Boolean(guildStats.autoSpotNewbornMutants);

    // 4. Bio-Lab (Lv 0..3)
    const biolabSpec = getBuildingUpgradeSpec('biolab', this.structures.biolab || 0);
    const biolabStats = biolabSpec.statsAtCurrent || {
      heroMutantDamageBonus: 0,
      babyMaturationSlowMult: 1.0,
      scoutVisionBonus: 0,
      bonusMutantXpMult: 1.0,
    };
    this.heroMutantDamageBonus = biolabStats.heroMutantDamageBonus || 0;
    this.scoutVisionBonus = biolabStats.scoutVisionBonus || 0;
    const slowMult = biolabStats.babyMaturationSlowMult || 1.0;
    this.mutantMaturationSlowFactor = Number((1 / Math.max(1.0, slowMult)).toFixed(3));
    this.bonusMutantXpMult = biolabStats.bonusMutantXpMult || 1.0;

    // 5. Watchtower (Lv 0..3)
    const towerLvl = this.structures.watchtower || 0;
    const centerY = this.terrain ? this.terrain.getHeightAt(8.5, -7.5) : 2.2;
    if (towerLvl > 0 && this.watchtowers.length === 0) {
      this.watchtowers.push({ x: 8.5, y: centerY, z: -7.5, cooldown: 0 });
    } else if (towerLvl === 0) {
      this.watchtowers = [];
    }
  }

  /**
   * Returns the current level (`0..3`) of a Bastion building.
   * @param {string} buildingId
   * @returns {number}
   */
  getBuildingLevel(buildingId) {
    const def = BASTION_BUILDINGS_BY_ID[buildingId];
    const canonicalId = def ? def.id : buildingId;
    if (canonicalId === 'lumber_forge') {
      return Math.max(this.structures.lumber_forge || 0, this.structures.palisade || 0);
    }
    return this.structures[canonicalId] ?? (def?.initialLevel || 0);
  }

  /**
   * Returns the full state of all 5 Bastion buildings for the HUD / Architect Modal (`[H]`).
   * @param {{ wood?: number, crystal?: number, biomass?: number }} [playerResources={}]
   * @returns {Array<Object>}
   */
  getBuildingsState(playerResources = {}) {
    return BASTION_BUILDINGS_CATALOG.map((bDef) => {
      const lvl = this.getBuildingLevel(bDef.id);
      const spec = getBuildingUpgradeSpec(bDef.id, lvl);
      const canAfford = canAffordBuildingUpgrade(bDef.id, lvl, playerResources);
      const pad = this.buildingPads.get(bDef.id);
      return {
        ...spec,
        level: lvl,
        canAfford,
        x: pad ? pad.x : bDef.padPos.x,
        z: pad ? pad.z : bDef.padPos.z,
        y: pad ? pad.y : 2.2,
      };
    });
  }

  /**
   * Finds the nearest interactive 3D Bastion Building Pad within `maxDist` of `(px, pz)`.
   *
   * @param {number} px - Player X coordinate.
   * @param {number} pz - Player Z coordinate.
   * @param {number} [maxDist=4.8] - Interaction radius.
   * @param {Object|null} [playerResources=null] - Player resources to evaluate `canAfford`.
   * @returns {Object|null} Closest building pad spec or null.
   */
  getNearestBuildingPad(px, pz, maxDist = 4.8, playerResources = null) {
    let bestPad = null;
    let bestDist = maxDist;

    for (const bDef of BASTION_BUILDINGS_CATALOG) {
      const pad = this.buildingPads.get(bDef.id);
      const bx = pad ? pad.x : bDef.padPos.x;
      const bz = pad ? pad.z : bDef.padPos.z;
      const d = dist2D(px, pz, bx, bz);
      const radius = Math.min(maxDist, bDef.interactRadius || 4.5);

      if (d <= radius && d < bestDist) {
        const lvl = this.getBuildingLevel(bDef.id);
        const spec = getBuildingUpgradeSpec(bDef.id, lvl);
        if (spec.isMaxed) continue;
        bestDist = d;
        bestPad = {
          ...spec,
          x: bx,
          z: bz,
          y: pad ? pad.y : 2.2,
          dist: d,
          canAfford: playerResources
            ? canAffordBuildingUpgrade(bDef.id, lvl, playerResources)
            : true,
        };
      }
    }

    return bestPad;
  }

  /**
   * Constructs (Level 0 -> 1) or upgrades (Level 1 -> 2 -> 3) one of the 5 Bastion buildings
   * (`'watchtower' | 'scout_guild' | 'lumber_forge' | 'palisade' | 'biolab' | 'sanctuary_hearth'`).
   *
   * @param {string} type - Building ID.
   * @param {Object} [playerResources] - Player resource pool (`{ wood, crystal, biomass }`).
   * @returns {boolean} True if constructed or upgraded.
   */
  buildStructure(type, playerResources) {
    const def = BASTION_BUILDINGS_BY_ID[type];
    if (!def) return false;

    const canonicalId = def.id;
    const currentLevel = this.getBuildingLevel(canonicalId);
    const spec = getBuildingUpgradeSpec(canonicalId, currentLevel);

    if (spec.isMaxed) {
      logger.info('BASTION', `[${spec.name}] a déjà atteint le Niveau Maximum (${spec.maxLevel}).`);
      return false;
    }

    // In Act 4A tutorial mode, allow building the first watchtower with legacy or current cost
    const cost = spec.cost || { wood: 20, crystal: 10, biomass: 0 };
    if (playerResources) {
      const hasEnough =
        (playerResources.wood || 0) >= cost.wood &&
        (playerResources.crystal || 0) >= cost.crystal &&
        (playerResources.biomass || 0) >= cost.biomass;

      if (!hasEnough && !this.tutorialMode) {
        logger.warn(
          'BASTION',
          `Ressources insuffisantes pour [${spec.actionVerb} : ${spec.name}] (Requis : ${spec.costText}).`,
          { required: cost, current: { ...playerResources } }
        );
        return false;
      }
      playerResources.wood = Math.max(0, (playerResources.wood || 0) - cost.wood);
      playerResources.crystal = Math.max(0, (playerResources.crystal || 0) - cost.crystal);
      playerResources.biomass = Math.max(0, (playerResources.biomass || 0) - cost.biomass);
    }

    const newLevel = currentLevel + 1;
    this.structures[canonicalId] = newLevel;
    if (canonicalId === 'lumber_forge') {
      this.structures.palisade = newLevel;
    }

    this._recomputeBuildingStats();
    this._rebuildSingleBuildingPadMesh(canonicalId);

    // If Scout Guild Lv1 was just built, recruit 1 bonus Scout automatically!
    if (canonicalId === 'scout_guild' && newLevel === 1) {
      this.spawnNpc('scout', -6.5, -5.5);
    }

    // Play 3D construction / upgrade celebration VFX on the building pad
    const pad = this.buildingPads.get(canonicalId);
    const padPos = new THREE.Vector3(
      pad ? pad.x : def.padPos.x,
      (pad ? pad.y : 2.2) + 1.0,
      pad ? pad.z : def.padPos.z
    );
    if (this.vfx) {
      if (newLevel === 1 && typeof this.vfx.spawnBuildEffect === 'function') {
        this.vfx.spawnBuildEffect(padPos, def.colorHex || 0xe6a145);
      } else if (typeof this.vfx.spawnUpgradeEffect === 'function') {
        this.vfx.spawnUpgradeEffect(padPos, def.colorHex || 0xffd700);
      } else if (typeof this.vfx.spawnBirthEffect === 'function') {
        this.vfx.spawnBirthEffect(padPos, false, true, def.colorHex || 0xe6a145);
      }
    }

    const updatedSpec = getBuildingUpgradeSpec(canonicalId, newLevel);
    logger.info(
      'BASTION',
      `🏰 ${newLevel === 1 ? 'Construction achevée' : 'Amélioration achevée'} : ${def.icon} [${def.name}] -> Niv. ${newLevel}/${def.maxLevel} (${updatedSpec.currentTierName}) !`,
      {
        buildingId: canonicalId,
        level: newLevel,
        effect: updatedSpec.currentEffectDesc,
        structures: { ...this.structures },
      }
    );

    if (typeof this.onStructureBuilt === 'function') {
      this.onStructureBuilt(canonicalId, newLevel, updatedSpec);
    }
    if (canonicalId === 'lumber_forge' && type === 'palisade' && typeof this.onStructureBuilt === 'function') {
      this.onStructureBuilt('palisade', newLevel, updatedSpec);
    }

    return true;
  }

  /**
   * Alias for `buildStructure(buildingId, playerResources)` to upgrade a Bastion building (`Niv. 0 -> 1 -> 2 -> 3`).
   * @param {string} buildingId
   * @param {Object} [playerResources]
   * @returns {boolean}
   */
  upgradeBuilding(buildingId, playerResources) {
    return this.buildStructure(buildingId, playerResources);
  }

  /**
   * Sets the active Scout Mission order (`'track_lineage' | 'find_cages' | 'scout_volcano' | 'perimeter_alert'`)
   * and immediately redirects all deployed Éclaireurs toward the new mission objective!
   *
   * @param {string} [missionType='track_lineage']
   * @param {string|null} [targetMutationId='pyro_gland']
   * @returns {Object} Updated `activeScoutMission` specification.
   */
  setScoutMission(missionType = 'track_lineage', targetMutationId = 'pyro_gland') {
    const resolvedMutId =
      missionType === 'track_lineage'
        ? targetMutationId || this.activeScoutMission?.targetMutationId || 'pyro_gland'
        : null;

    this.activeScoutMission = getScoutMissionSpec(missionType, resolvedMutId);

    // Reset scout waypoint timers so they immediately re-orient on the next frame
    for (const npc of this.npcs) {
      if (npc.role === 'scout') {
        npc.waypointTimer = 0;
      }
    }

    logger.alert(`🦅 ${this.activeScoutMission.fullTitle} — Vos Éclaireurs se déploient immédiatement !`, {
      missionType: this.activeScoutMission.type,
      targetMutationId: this.activeScoutMission.targetMutationId,
      scoutsCount: this.getScouts().length,
    });

    if (typeof this.onScoutMissionChanged === 'function') {
      this.onScoutMissionChanged(this.activeScoutMission);
    }

    return this.activeScoutMission;
  }

  /**
   * Returns the currently active Scout Mission specification.
   * @returns {Object}
   */
  getScoutMission() {
    return this.activeScoutMission;
  }

  /**
   * Computes live tracking progress (`Repérés : X / Y`, babies vs adults) for a target mutant lineage.
   *
   * @param {Array<Object>} [enemies=[]] - Array of live enemies from `enemyManager.getEnemies()`.
   * @param {string|null} [targetMutationId=null] - Mutation ID (defaults to `activeScoutMission.targetMutationId` or `'pyro_gland'`).
   * @returns {{
   *   mutationId: string,
   *   targetLabel: string,
   *   totalCarriers: number,
   *   spottedCarriers: number,
   *   unspottedCarriers: number,
   *   babyCarriers: number,
   *   adultCarriers: number,
   *   allSpotted: boolean,
   *   carriers: Array<Object>
   * }}
   */
  getLineageTrackingProgress(enemies = [], targetMutationId = null) {
    const mutId =
      targetMutationId || this.activeScoutMission?.targetMutationId || 'pyro_gland';
    const mutDef = CONFIG.MUTATIONS?.[mutId];
    const targetLabel = mutDef?.shortLabel || mutDef?.name || mutId;

    const safeEnemies = Array.isArray(enemies) ? enemies : [];
    const carriers = safeEnemies.filter((e) => {
      if (!e || e.hp <= 0) return false;
      const muts = Array.isArray(e.genome?.mutations) ? e.genome.mutations : [];
      return muts.includes(mutId) || e.genome?.speciesId === mutId;
    });

    const totalCarriers = carriers.length;
    const spottedCarriers = carriers.filter((e) => e.spottedByScout).length;
    const unspottedCarriers = Math.max(0, totalCarriers - spottedCarriers);
    const babyCarriers = carriers.filter((e) => !e.isAdult || e.lifeStage === 'baby').length;
    const adultCarriers = Math.max(0, totalCarriers - babyCarriers);

    return {
      mutationId: mutId,
      targetLabel,
      totalCarriers,
      spottedCarriers,
      unspottedCarriers,
      babyCarriers,
      adultCarriers,
      allSpotted: totalCarriers > 0 && spottedCarriers >= totalCarriers,
      carriers,
    };
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
      spottedByScout: false,
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
   * ensuring at least 1 Harvester, 1 Scout, 1 Watchtower, remaining Prisoner Cages,
   * 4 Elemental Weapon Shrines, and 3 Ancient Relic Monoliths exist.
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
    if ((this.structures.watchtower || 0) === 0) {
      this.structures.watchtower = 1;
      this._recomputeBuildingStats();
      this._rebuildSingleBuildingPadMesh('watchtower');
    }
    const activeUnrescued = this.cages.filter((c) => !c.rescued).length;
    if (activeUnrescued < 4) {
      this._spawnPrisonerCages();
    }
    if (this.weaponShrines.length === 0) {
      this._spawnWeaponShrines();
    }
    if (this.relicShrines.length === 0) {
      this._spawnRelicMonoliths(this.islandNumber);
    }
  }

  /**
   * Phase 8 — Spawns the 4 Legendary Elemental Weapon Shrines (`fire_greatsword`, `ice_greatsword`,
   * `lightning_greatsword`, `venom_greatsword`) across the island biomes so the Hero can discover
   * and forge/equip elemental weapons with `[E]`.
   */
  _spawnWeaponShrines() {
    for (const shrine of this.weaponShrines) {
      if (shrine.mesh && this.scene) {
        this.scene.remove(shrine.mesh);
      }
    }
    this.weaponShrines = [];

    const elementalList = ELEMENTAL_WEAPONS_CATALOG.filter((w) => w.id !== 'runic_steel');
    for (const wSpec of elementalList) {
      const x = wSpec.shrinePos?.x ?? 30;
      const z = wSpec.shrinePos?.z ?? -26;
      const rawY = this.terrain ? this.terrain.getHeightAt(x, z) : 2.0;
      const y = Math.max(rawY, (CONFIG.WORLD?.WATER_LEVEL || 0) + 0.35);

      let mesh = null;
      if (this.scene) {
        mesh = new THREE.Group();
        mesh.position.set(x, y, z);

        // Obsidian runic pedestal
        const pedestal = new THREE.Mesh(
          new THREE.CylinderGeometry(1.15, 1.45, 0.9, 8),
          new THREE.MeshStandardMaterial({
            color: 0x2b2d38,
            roughness: 0.65,
            metalness: 0.35,
          })
        );
        pedestal.position.y = 0.45;
        pedestal.castShadow = true;
        pedestal.receiveShadow = true;
        mesh.add(pedestal);

        // Glowing ground ring
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.5, 2.1, 24),
          new THREE.MeshBasicMaterial({
            color: wSpec.colorHex || 0xff5252,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.08;
        mesh.add(ring);

        // Levitating elemental greatsword artifact above pedestal
        const bladeGroup = new THREE.Group();
        bladeGroup.position.y = 2.15;

        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 1.55, 0.32),
          new THREE.MeshStandardMaterial({
            color: wSpec.colorHex || 0xff5252,
            emissive: wSpec.emissiveHex || wSpec.colorHex || 0xff3838,
            emissiveIntensity: 1.35,
            metalness: 0.78,
            roughness: 0.18,
          })
        );
        bladeGroup.add(blade);

        const crossguard = new THREE.Mesh(
          new THREE.BoxGeometry(0.58, 0.12, 0.18),
          new THREE.MeshStandardMaterial({
            color: 0xffd166,
            emissive: wSpec.emissiveHex || 0xb8860b,
            emissiveIntensity: 0.6,
            metalness: 0.75,
          })
        );
        crossguard.position.y = -0.68;
        bladeGroup.add(crossguard);

        mesh.add(bladeGroup);
        mesh.userData = { floatingBlade: bladeGroup, ring };
        this.scene.add(mesh);
      }

      this.weaponShrines.push({
        id: `shrine_${wSpec.id}`,
        weaponId: wSpec.id,
        name: `Autel : ${wSpec.name}`,
        icon: wSpec.icon,
        element: wSpec.element,
        colorHex: wSpec.colorHex,
        colorCss: wSpec.colorCss,
        x,
        y,
        z,
        discovered: true,
        unlocked: false,
        mesh,
      });
    }
  }

  /**
   * Removes all 3D Relic Monoliths and their sky beacons from the scene.
   */
  clearAllRelicShrines() {
    for (const relic of this.relicShrines) {
      if (this.vfx && typeof this.vfx.setRelicBeacon === 'function') {
        this.vfx.setRelicBeacon(relic.id, null, relic.colorHex, false);
      }
      if (relic.mesh && this.scene) {
        this.scene.remove(relic.mesh);
      }
    }
    this.relicShrines = [];
  }

  /**
   * Phase 8 — Spawns the 3 Ancient Relic Monoliths (`relic_dawn_north`, `relic_breakers_southeast`,
   * `relic_caldera_southwest`) across the island. Collecting all 3 (`[E]`) powers the Planetary
   * Island Shield Dome (`[B]`).
   *
   * @param {number} [islandNumber=1] - Current island tier (`1, 2, 3...`), slightly rotating monolith positions on new islands.
   */
  _spawnRelicMonoliths(islandNumber = 1) {
    this.clearAllRelicShrines();
    this.collectedRelicFragments = 0;

    const baseShrines = RELIC_FRAGMENTS_SPEC?.shrines || [];
    const rotOffset = ((Math.max(1, islandNumber) - 1) * 0.65) % (Math.PI * 2);

    for (let i = 0; i < baseShrines.length; i++) {
      const def = baseShrines[i];
      const bx = def.pos?.x ?? 0;
      const bz = def.pos?.z ?? -64;
      const cosR = Math.cos(rotOffset);
      const sinR = Math.sin(rotOffset);
      const x = Math.round((bx * cosR - bz * sinR) * 10) / 10;
      const z = Math.round((bx * sinR + bz * cosR) * 10) / 10;
      const rawY = this.terrain ? this.terrain.getHeightAt(x, z) : 2.5;
      const y = Math.max(rawY, (CONFIG.WORLD?.WATER_LEVEL || 0) + 0.45);
      const colorHex = def.colorHex || 0x00e5ff;

      let mesh = null;
      if (this.scene) {
        mesh = new THREE.Group();
        mesh.position.set(x, y, z);

        // Ancient stepped stone plinth (with Blender 5.0 bastion_monolith.glb decoration)
        const plinthGroup = new THREE.Group();
        const plinth = new THREE.Mesh(
          new THREE.CylinderGeometry(1.55, 2.05, 1.1, 6),
          new THREE.MeshStandardMaterial({
            color: 0x1e272e,
            roughness: 0.55,
            metalness: 0.4,
          })
        );
        plinth.position.y = 0.55;
        plinth.castShadow = true;
        plinth.receiveShadow = true;
        plinthGroup.add(plinth);
        blenderModelManager.decorateMonolithGroup(plinthGroup);
        mesh.add(plinthGroup);

        // Levitating octahedral Relic Core crystal
        const crystal = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.95, 0),
          new THREE.MeshStandardMaterial({
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: 1.65,
            roughness: 0.12,
            metalness: 0.85,
          })
        );
        crystal.position.y = 2.85;
        mesh.add(crystal);

        // Orbiting golden-cyan runic ring
        const orbitRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.45, 0.07, 10, 28),
          new THREE.MeshBasicMaterial({
            color: 0xffd32a,
            transparent: true,
            opacity: 0.85,
          })
        );
        orbitRing.position.y = 2.85;
        orbitRing.rotation.x = Math.PI / 3;
        mesh.add(orbitRing);

        // Base beacon circle
        const baseRing = new THREE.Mesh(
          new THREE.RingGeometry(2.1, 2.75, 28),
          new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
          })
        );
        baseRing.rotation.x = -Math.PI / 2;
        baseRing.position.y = 0.08;
        mesh.add(baseRing);

        mesh.userData = { crystal, orbitRing, baseRing };
        this.scene.add(mesh);
      }

      const relicObj = {
        id: def.id || `relic_${i + 1}`,
        index: def.index || i + 1,
        name: def.name || `Fragment de Relique #${i + 1}`,
        sectorLabel: def.sectorLabel || getCardinalLabelFR(x, z),
        x,
        y,
        z,
        colorHex,
        colorCss: def.colorCss || '#00e5ff',
        collected: false,
        spottedByScout: false,
        mesh,
      };

      this.relicShrines.push(relicObj);

      if (this.vfx && typeof this.vfx.setRelicBeacon === 'function') {
        this.vfx.setRelicBeacon(
          relicObj.id,
          new THREE.Vector3(x, y + 1.5, z),
          colorHex,
          true
        );
      }
    }
  }

  /**
   * Returns the nearest Elemental Weapon Shrine within `maxDist` of `(px, pz)`.
   *
   * @param {number} px - Player X coordinate.
   * @param {number} pz - Player Z coordinate.
   * @param {number} [maxDist=7.0] - Interaction radius.
   * @returns {Object|null}
   */
  getNearestWeaponShrine(px, pz, maxDist = 7.0) {
    let best = null;
    let bestDist = maxDist;
    for (const shrine of this.weaponShrines) {
      const d = dist2D(px, pz, shrine.x, shrine.z);
      if (d <= bestDist) {
        bestDist = d;
        best = shrine;
      }
    }
    return best;
  }

  /**
   * Interacts with the nearest Elemental Weapon Shrine within `maxDist` of `(px, pz)`,
   * unlocking the weapon artifact and returning `{ shrine, weaponSpec }`.
   *
   * @param {number} px - Player X coordinate.
   * @param {number} pz - Player Z coordinate.
   * @param {number} [maxDist=7.0] - Interaction radius.
   * @returns {{ shrine: Object, weaponSpec: Object }|null}
   */
  interactNearestWeaponShrine(px, pz, maxDist = 7.0) {
    const shrine = this.getNearestWeaponShrine(px, pz, maxDist);
    if (!shrine) return null;
    shrine.unlocked = true;
    shrine.discovered = true;
    const weaponSpec = getElementalWeaponSpec(shrine.weaponId);

    if (this.vfx && typeof this.vfx.spawnWeaponShrineBurst === 'function') {
      this.vfx.spawnWeaponShrineBurst(
        new THREE.Vector3(shrine.x, shrine.y + 1.6, shrine.z),
        shrine.colorHex || 0xff5252
      );
    }

    if (typeof this.onWeaponShrineInteracted === 'function') {
      this.onWeaponShrineInteracted(shrine, weaponSpec);
    }
    return { shrine, weaponSpec };
  }

  /**
   * Returns the nearest uncollected Ancient Relic Monolith within `maxDist` of `(px, pz)`.
   *
   * @param {number} px - Player X coordinate.
   * @param {number} pz - Player Z coordinate.
   * @param {number} [maxDist=7.5] - Interaction radius.
   * @returns {Object|null}
   */
  getNearestRelicShrine(px, pz, maxDist = 7.5) {
    let best = null;
    let bestDist = maxDist;
    for (const relic of this.relicShrines) {
      if (relic.collected) continue;
      const d = dist2D(px, pz, relic.x, relic.z);
      if (d <= bestDist) {
        bestDist = d;
        best = relic;
      }
    }
    return best;
  }

  /**
   * Collects a specific Ancient Relic Fragment (`shrineOrId`), increments `this.collectedRelicFragments`
   * (`0 -> 1 -> 2 -> 3`), grants `+15 Cristal` to `playerResources`, removes the 3D monolith crystal & beacon,
   * and fires `this.onRelicCollected`.
   *
   * @param {Object|string} shrineOrId - Relic shrine object or ID (`'relic_dawn_north'`, etc.).
   * @param {Object|null} [playerResources=null] - Player resource dictionary to credit crystal reward.
   * @returns {Object|null} Collected relic object or null if already collected.
   */
  collectRelicFragment(shrineOrId, playerResources = null) {
    const relic =
      typeof shrineOrId === 'string'
        ? this.relicShrines.find((r) => r.id === shrineOrId)
        : shrineOrId || this.relicShrines.find((r) => !r.collected);

    if (!relic || relic.collected) return null;

    relic.collected = true;
    relic.spottedByScout = true;
    this.collectedRelicFragments = this.relicShrines.filter((r) => r.collected).length;

    if (this.vfx && typeof this.vfx.setRelicBeacon === 'function') {
      this.vfx.setRelicBeacon(relic.id, null, relic.colorHex, false);
    }
    if (this.vfx && typeof this.vfx.spawnBirthEffect === 'function') {
      this.vfx.spawnBirthEffect(
        new THREE.Vector3(relic.x, relic.y + 1.8, relic.z),
        true,
        false,
        relic.colorHex || 0xffd32a
      );
    }
    if (relic.mesh?.userData?.crystal) {
      relic.mesh.userData.crystal.visible = false;
    }
    if (relic.mesh?.userData?.orbitRing) {
      relic.mesh.userData.orbitRing.visible = false;
    }

    const crystalReward = RELIC_FRAGMENTS_SPEC?.fragmentRewardCrystal || 15;
    if (playerResources) {
      playerResources.crystal = (playerResources.crystal || 0) + crystalReward;
    }

    logger.evolution(
      `🏛️ RELIQUE D'ÉDEN COLLECTÉE (${this.collectedRelicFragments}/${this.maxRelicFragments}) : ${relic.name} ! (+${crystalReward} 💎 Cristal)`,
      {
        relicId: relic.id,
        collectedRelicFragments: this.collectedRelicFragments,
        maxRelicFragments: this.maxRelicFragments,
      }
    );

    if (typeof this.onRelicCollected === 'function') {
      this.onRelicCollected(relic, this.collectedRelicFragments, this.maxRelicFragments);
    }

    return relic;
  }

  /**
   * Attempts to collect the nearest uncollected Ancient Relic Monolith within `maxDist` of `(px, pz)`.
   *
   * @param {number} px - Player X coordinate.
   * @param {number} pz - Player Z coordinate.
   * @param {Object|null} [playerResources=null] - Player resource dictionary.
   * @param {number} [maxDist=7.5] - Interaction radius.
   * @returns {Object|null} Collected relic object or null.
   */
  tryCollectNearestRelic(px, pz, playerResources = null, maxDist = 7.5) {
    const relic = this.getNearestRelicShrine(px, pz, maxDist);
    if (!relic) return null;
    return this.collectRelicFragment(relic, playerResources);
  }

  /**
   * Phase 8 — Activates the Planetary Island Shield Dome over the entire island once all 3 Relic
   * Fragments are collected (`this.collectedRelicFragments >= this.maxRelicFragments`), locking
   * Bastion HP at `100%` invulnerability and triggering `vfx.spawnIslandShieldDome`.
   *
   * @param {boolean} [forceEvenIfIncomplete=false] - Allow forced activation for testing/verification.
   * @returns {boolean} True if the Planetary Island Shield was activated.
   */
  activateIslandShield(forceEvenIfIncomplete = false) {
    if (this.islandShieldActive) return true;
    if (!forceEvenIfIncomplete && this.collectedRelicFragments < this.maxRelicFragments) {
      return false;
    }

    this.islandShieldActive = true;
    this.hp = this.maxHp;

    const domeRadius = RELIC_FRAGMENTS_SPEC?.shieldDomeRadius || 115;
    if (this.vfx && typeof this.vfx.spawnIslandShieldDome === 'function') {
      this.vfx.spawnIslandShieldDome(new THREE.Vector3(this.pos.x, 0, this.pos.z), domeRadius);
    }

    logger.evolution(
      `🛡️ BOUCLIER PLANÉTAIRE D'ÉDEN ACTIVÉ (Île #${this.islandNumber}) ! Le Dôme Runique protège l'île entière — Prêt pour l'Expédition vers l'Île #${this.islandNumber + 1} !`,
      {
        islandNumber: this.islandNumber,
        collectedRelicFragments: this.collectedRelicFragments,
        domeRadius,
      }
    );

    if (typeof this.onIslandShieldActivated === 'function') {
      this.onIslandShieldActivated(this.islandNumber);
    }

    return {
      activated: true,
      success: true,
      islandShieldActive: true,
      islandNumber: this.islandNumber,
      collectedRelicFragments: this.collectedRelicFragments,
    };
  }

  /**
   * Phase 8 — Resets the Bastion's island-specific objectives (Relic Monoliths `0 / 3`, Prisoner Cages,
   * and Planetary Shield Dome) to transition the Hero to the next Island Tier (`islandNumber = 2, 3, ...`)
   * while preserving Bastion upgrades and allied NPCs.
   *
   * @param {number} [islandNumber=2] - Next campaign island number (`2+`).
   * @returns {Object} Resolved island tier specification (`getIslandTierSpec(islandNumber)`).
   */
  resetForNextIsland(islandNumber = 2) {
    this.islandNumber = Math.max(1, Math.floor(Number(islandNumber) || 2));
    this.islandShieldActive = false;
    this.collectedRelicFragments = 0;
    this.hp = this.maxHp;

    if (this.vfx && typeof this.vfx.clearIslandShieldDome === 'function') {
      this.vfx.clearIslandShieldDome();
    }

    this.clearAllCages();
    this.rescuedCount = 0;
    this._spawnPrisonerCages();
    this._spawnRelicMonoliths(this.islandNumber);
    this._spawnWeaponShrines();

    // Reposition existing allied NPCs around the Sanctuary Hearth on the new island
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      const angle = (i / Math.max(1, this.npcs.length)) * Math.PI * 2;
      npc.x = Math.cos(angle) * 4.5;
      npc.z = Math.sin(angle) * 4.5;
      npc.hp = npc.maxHp;
      if (npc.role === 'scout') {
        this._assignNewWildernessWaypoint(npc, []);
      }
    }

    const tierSpec = getIslandTierSpec(this.islandNumber);
    logger.evolution(
      `⛵ EXPÉDITION VERS ${tierSpec.name.toUpperCase()} : 3 Nouveaux Monolithes de Relique d'Éden détectés !`,
      tierSpec
    );
    return tierSpec;
  }

  /**
   * Phase 9 — Completely resets the Bastion Sanctuary, buildings, allied NPCs, Prisoner Cages,
   * Elemental Weapon Shrines, and Relic Monoliths back to Island #1 for a fresh Roguelike Run.
   *
   * @returns {Object} Summary of reset Bastion state.
   */
  resetForNewRoguelikeRun() {
    this.tutorialMode = false;
    this.islandNumber = 1;
    this.islandShieldActive = false;
    this.collectedRelicFragments = 0;

    if (this.vfx && typeof this.vfx.clearIslandShieldDome === 'function') {
      this.vfx.clearIslandShieldDome();
    }

    this.structures = {
      watchtower: 1,
      scout_guild: 0,
      lumber_forge: 0,
      palisade: 0,
      biolab: 0,
      sanctuary_hearth: 1,
    };
    this._recomputeBuildingStats();
    for (const id of this.buildingPads.keys()) {
      this._rebuildSingleBuildingPadMesh(id);
    }
    this.hp = this.maxHp;

    // Reset Allied NPCs (1 Harvester, 1 Scout, 1 Guard)
    this.clearAllNpcs();
    this.spawnNpc('harvester', -4.5, 3.5);
    this.spawnNpc('scout', 4.5, 3.5);
    this.spawnNpc('guard', 0, -5.0);

    // Reset Prisoner Cages, Elemental Weapon Shrines & Island #1 Relic Monoliths
    this.clearAllCages();
    this.rescuedCount = 0;
    this._spawnPrisonerCages();
    this._spawnWeaponShrines();
    this._spawnRelicMonoliths(1);

    logger.info(
      'BASTION',
      '🔄 Bastion réinitialisé pour une Nouvelle Run Roguelike sur l’Île #1 (PV: 100%, 3 Alliés, 3 Monolithes).',
      { islandNumber: this.islandNumber, hp: this.hp, maxHp: this.maxHp }
    );

    return {
      islandNumber: this.islandNumber,
      hp: this.hp,
      maxHp: this.maxHp,
      npcsCount: this.npcs.length,
    };
  }

  /**
   * Returns current Relic Fragment progress and Planetary Island Shield state for the HUD.
   * @returns {Object}
   */
  getRelicStatus() {
    const ready =
      this.collectedRelicFragments >= this.maxRelicFragments && !this.islandShieldActive;
    return {
      collected: this.collectedRelicFragments,
      collectedRelicFragments: this.collectedRelicFragments,
      required: this.maxRelicFragments,
      maxRelicFragments: this.maxRelicFragments,
      shieldReady: ready,
      canActivateShield: ready,
      shieldActive: this.islandShieldActive,
      islandShieldActive: this.islandShieldActive,
      islandNumber: this.islandNumber,
      shrines: this.relicShrines,
      relicShrines: this.relicShrines,
    };
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

        if (this.vfx && typeof this.vfx.setCageBeacon === 'function') {
          this.vfx.setCageBeacon(cage.id, null, false);
        }
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

    const baseSpeed =
      role === 'scout'
        ? CONFIG.SCOUT?.SPEED || 6.8
        : role === 'guard'
          ? 6.0
          : 5.5;
    const maxHp = CONFIG.SCOUT?.HP || 90;

    const npc = {
      id,
      name,
      role,
      x,
      z,
      y,
      vx: 0,
      vz: 0,
      hp: maxHp,
      maxHp,
      speed: baseSpeed,
      visionRadius: CONFIG.SCOUT?.VISION_RADIUS || 34,
      fleeRadius: CONFIG.SCOUT?.FLEE_RADIUS || 16,
      state: role === 'scout' ? 'expedition' : 'patrol',
      missionLabel: role === 'scout' ? this.activeScoutMission?.shortLabel || '🔍 Traquer Lignée' : '',
      targetX: x,
      targetZ: z,
      sectorName: 'Nord-Est',
      visitedSectors: [],
      actionTimer: 0,
      waypointTimer: 0,
      distressAlertCooldown: 0,
      sosBeaconTimer: 0,
      _sosBeaconActive: false,
      harvestTimer: 0,
      harvestJob: null,
      targetNode: null,
      targetPrey: null,
      carryingType: null,
      carryingAmount: 0,
      completedTrips: 0,
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
    if (this.activeScoutMission?.type === 'perimeter_alert') {
      const a = Math.random() * Math.PI * 2;
      const r = 38 + Math.random() * 18;
      scout.targetX = Math.cos(a) * r;
      scout.targetZ = Math.sin(a) * r;
      scout.sectorName = getCardinalLabelFR(scout.targetX, scout.targetZ);
      scout.waypointTimer = 8 + Math.random() * 5;
      return;
    }

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
    npc.speed =
      targetRole === 'scout'
        ? CONFIG.SCOUT?.SPEED || 6.8
        : targetRole === 'guard'
          ? 6.0
          : 5.5;
    npc.state = targetRole === 'scout' ? 'expedition' : 'patrol';
    npc.harvestJob = null;
    npc.targetNode = null;
    npc.targetPrey = null;

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
      const hasEnough =
        (playerResources.wood || 0) >= woodCost && (playerResources.biomass || 0) >= biomassCost;
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
   * When the Planetary Island Shield Dome (`this.islandShieldActive`) is active, Bastion HP is locked at `100%`.
   * @param {number} amount
   * @returns {number} Reflected thorns damage.
   */
  damageBastion(amount) {
    if (this.islandShieldActive) {
      this.hp = this.maxHp;
      return this.thornsDamage;
    }
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      if (typeof this.onBastionDestroyed === 'function') {
        this.hp = 0;
        logger.alert('💀 GAME OVER : Le Cœur du Sanctuaire a été détruit par la horde !');
        this.onBastionDestroyed({
          reason: 'bastion_fallen',
          killerName: 'Siège contre le Cœur du Sanctuaire',
          bastion: this,
        });
      } else {
        this.hp = Math.round(this.maxHp * 0.4);
        logger.warn('BASTION', 'Les défenses du Bastion ont vacillé ! Réparation d’urgence engagée.');
      }
    }
    return this.thornsDamage;
  }

  /**
   * Applies damage to an allied NPC (`maxHp = 90`).
   * - When `npc.hp > 0` and `npc.distressAlertCooldown <= 0`, triggers an urgent `"🆘 À L'AIDE !"` /
   *   `"🆘 HELP!"` distress alert, lights a pulsing red SOS beacon on the NPC, and invokes `this.onNpcUnderAttack`.
   * - When `npc.hp <= 0`, the NPC **dies permanently** (`this.scene.remove(npc.mesh)`, removed from `this.npcs`,
   *   death explosion VFX, and `this.onNpcKilled` alert).
   * - Exception: During Tutorial Acts 1–5 only (`this.tutorialMode && (!this.tutorialAct || this.tutorialAct <= 5)`),
   *   clamps NPC HP at `15` so the tutorial script cannot softlock before Act 6.
   *
   * @param {string|Object} npcIdOrObj
   * @param {number} amount
   * @param {Object|null} [attackerEnemy=null]
   * @returns {{ alive: boolean, killed: boolean, npc: Object|null }}
   */
  damageNpc(npcIdOrObj, amount, attackerEnemy = null) {
    const targetId = typeof npcIdOrObj === 'object' ? npcIdOrObj?.id : npcIdOrObj;
    const idx = this.npcs.findIndex((n) => n.id === targetId);
    if (idx === -1) return { alive: false, killed: false, npc: null };
    const npc = this.npcs[idx];

    const effectiveAmount =
      npc.role === 'scout' && (this.structures.scout_guild || 0) >= 3
        ? amount * 0.45
        : amount;
    npc.hp = Math.max(0, npc.hp - effectiveAmount);

    // During Tutorial Acts 1–5 only, clamp NPC HP at 15 so the tutorial script cannot softlock before Act 6
    const isEarlyTutorial =
      this.tutorialMode &&
      (!attackerEnemy || attackerEnemy.tutorialTag !== 'act6_baby_fire_troll') &&
      typeof this.tutorialAct === 'number' &&
      this.tutorialAct >= 1 &&
      this.tutorialAct <= 5;
    if (isEarlyTutorial && npc.hp < 15) {
      npc.hp = 15;
    }

    const roleLabel = this._roleLabelFR(npc.role);
    const roleLabelEN =
      npc.role === 'scout' ? 'Scout' : npc.role === 'guard' ? 'Guard' : 'Harvester';
    const enemyName =
      attackerEnemy?.genome?.speciesName ||
      attackerEnemy?.speciesName ||
      CONFIG.SPECIES?.[attackerEnemy?.genome?.speciesId]?.name ||
      'Monstre Sauvage';
    const enemyNameEN =
      CONFIG.SPECIES?.[attackerEnemy?.genome?.speciesId]?.nameEN ||
      attackerEnemy?.genome?.speciesName ||
      'Wild Monster';
    const direction = getCardinalLabelFR(npc.x, npc.z);

    if (this.vfx && typeof this.vfx.spawnHitEffect === 'function') {
      this.vfx.spawnHitEffect(new THREE.Vector3(npc.x, (npc.y || 1) + 1.0, npc.z), 0xff2222);
    }

    if (npc.hp > 0) {
      if ((npc.distressAlertCooldown || 0) <= 0) {
        npc.distressAlertCooldown = 9.0;
        npc.sosBeaconTimer = 6.5;
        npc._sosBeaconActive = true;

        if (this.vfx && typeof this.vfx.setPatientZeroBeacon === 'function') {
          this.vfx.setPatientZeroBeacon(
            npc.id,
            npc.mesh ? npc.mesh.position : npc.position,
            0xff2222,
            true
          );
        }

        const msgFR = `🆘 À L'AIDE ! ${npc.name} (${roleLabel}) est attaqué par [${enemyName}] au ${direction} (${Math.round(npc.hp)}/${npc.maxHp} PV) ! Vite, venez le sauver !`;
        const msgEN = `🆘 HELP! ${npc.name} (${roleLabelEN}) is under attack by [${enemyNameEN}] in the ${direction} (${Math.round(npc.hp)}/${npc.maxHp} HP)! Hurry to save them!`;

        logger.alert(msgFR, {
          npcId: npc.id,
          npcName: npc.name,
          role: npc.role,
          hp: Math.round(npc.hp),
          maxHp: npc.maxHp,
          attacker: enemyName,
          direction,
        });

        if (typeof this.onNpcUnderAttack === 'function') {
          this.onNpcUnderAttack(npc, attackerEnemy, direction, msgFR, msgEN);
        }
      }
      return { alive: true, killed: false, npc };
    }

    // NPC HP <= 0 -> Permanent Death!
    npc.hp = 0;
    if (this.vfx) {
      if (typeof this.vfx.setPatientZeroBeacon === 'function') {
        this.vfx.setPatientZeroBeacon(
          npc.id,
          npc.mesh ? npc.mesh.position : new THREE.Vector3(npc.x, npc.y, npc.z),
          0xff2222,
          false
        );
      }
      if (typeof this.vfx.spawnDeathExplosion === 'function') {
        this.vfx.spawnDeathExplosion(new THREE.Vector3(npc.x, (npc.y || 1) + 0.8, npc.z), 0xff2222, 12);
      } else if (typeof this.vfx.spawnDeathEffect === 'function') {
        this.vfx.spawnDeathEffect(new THREE.Vector3(npc.x, (npc.y || 1) + 0.8, npc.z), 0xff2222);
      }
    }

    if (npc.mesh && this.scene) {
      this.scene.remove(npc.mesh);
    }
    this.npcs.splice(idx, 1);

    const deathFR = `💀 ${npc.name} (${roleLabel}) a été tué par [${enemyName}] au ${direction} !`;
    const deathEN = `💀 ${npc.name} (${roleLabelEN}) was slain by [${enemyNameEN}] in the ${direction}!`;

    logger.alert(deathFR, {
      npcId: npc.id,
      npcName: npc.name,
      role: npc.role,
      attacker: enemyName,
      direction,
    });

    if (typeof this.onNpcKilled === 'function') {
      this.onNpcKilled(npc, attackerEnemy, direction, deathFR, deathEN);
    }
    if (typeof this.onRoleAssigned === 'function') {
      this.onRoleAssigned(npc.role, this.getRoleCounts());
    }

    return { alive: false, killed: true, npc };
  }

  /**
   * Updates the Bastion campfire animation, 3D building pad crystals, passive Lumber Forge
   * resource production, Sanctuary Hearth Lv3 solar aura, Watchtower auto-turrets, Prisoner Cages,
   * Elemental Weapon Shrines, Ancient Relic Monoliths, and all Allied NPCs.
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

    if (this.islandShieldActive) {
      this.hp = this.maxHp;
    }

    // 1. Animate Bastion Roaring Campfire, Building Pad Crystals, Cage Crystals, Weapon Shrines & Relic Monoliths
    if (this.campfireFlame) {
      const hearthScale = 1 + ((this.structures.sanctuary_hearth || 1) - 1) * 0.25;
      const flicker =
        (1 + Math.sin(elapsedTime * 11.5) * 0.12 + Math.cos(elapsedTime * 17.0) * 0.08) *
        hearthScale;
      this.campfireFlame.scale.set(flicker, (0.92 + flicker * 0.15) * hearthScale, flicker);
      this.campfireFlame.rotation.y = elapsedTime * 1.5;
    }

    for (const pad of this.buildingPads.values()) {
      const floatObj = pad.modelGroup?.userData?.floatingCrystal;
      if (floatObj) {
        floatObj.rotation.y = elapsedTime * 2.0;
      }
      if (pad.ringMesh && pad.ringMesh.visible) {
        pad.ringMesh.material.opacity = 0.42 + 0.22 * Math.sin(elapsedTime * 4.2);
      }
    }

    for (const cage of this.cages) {
      if (!cage.rescued && cage.mesh?.userData?.crystal) {
        cage.mesh.userData.crystal.rotation.y = elapsedTime * 2.5;
        cage.mesh.userData.crystal.position.y = 3.1 + Math.sin(elapsedTime * 3.5) * 0.18;
      }
    }

    for (const shrine of this.weaponShrines) {
      const bladeGroup = shrine.mesh?.userData?.floatingBlade;
      if (bladeGroup) {
        bladeGroup.rotation.y = elapsedTime * 1.85;
        bladeGroup.position.y = 2.15 + Math.sin(elapsedTime * 2.8) * 0.22;
      }
    }

    for (const relic of this.relicShrines) {
      if (!relic.collected && relic.mesh?.userData) {
        const { crystal, orbitRing } = relic.mesh.userData;
        if (crystal) {
          crystal.rotation.y = elapsedTime * 2.2;
          crystal.position.y = 2.85 + Math.sin(elapsedTime * 3.2) * 0.24;
        }
        if (orbitRing) {
          orbitRing.rotation.z = elapsedTime * 1.6;
          orbitRing.position.y = 2.85 + Math.sin(elapsedTime * 3.2) * 0.24;
        }
      }
    }

    const enemies =
      enemyManager && typeof enemyManager.getEnemies === 'function' ? enemyManager.getEnemies() : [];
    const worldSize = CONFIG.WORLD?.SIZE || 240;
    const worldHalf = worldSize * 0.45;

    // 2. Passive Resource Production from Lumber Forge (`lumber_forge` Lv 1..3)
    const forgeLvl = this.getBuildingLevel('lumber_forge');
    if (forgeLvl > 0 && player && player.resources) {
      this.passiveProductionTimer += dt;
      if (this.passiveProductionTimer >= 5.0) {
        this.passiveProductionTimer -= 5.0;
        const forgeSpec = getBuildingUpgradeSpec('lumber_forge', forgeLvl);
        const fStats = forgeSpec.statsAtCurrent || {};
        const harvesterMult = 1 + this.getRoleCounts().harvester * 0.25;
        const woodGain = Math.round((fStats.woodPer5Sec || 2) * harvesterMult);
        const crystalGain = Math.round((fStats.crystalPer5Sec || 1) * harvesterMult);
        const biomassGain = fStats.biomassPer5Sec || 0;

        player.resources.wood = (player.resources.wood || 0) + woodGain;
        player.resources.crystal = (player.resources.crystal || 0) + crystalGain;
        if (biomassGain > 0) {
          player.resources.biomass = (player.resources.biomass || 0) + biomassGain;
        }
      }
    }

    // 3. Sanctuary Hearth Lv3 Solar Burn Aura against hostile enemies inside `passiveAuraRange`
    if (this.auraBurnDps > 0 && enemies.length > 0) {
      this.hearthAuraTickTimer += dt;
      if (this.hearthAuraTickTimer >= 1.0) {
        this.hearthAuraTickTimer -= 1.0;
        for (const e of enemies) {
          if (!e || e.hp <= 0) continue;
          if (this._isNonHostileToDefenses(e)) continue;
          if (dist2D(0, 0, e.x, e.z) <= this.passiveAuraRange) {
            if (typeof e.applyBurn === 'function') {
              e.applyBurn(this.auraBurnDps, 2.0);
            }
          }
        }
      }
    }

    // 4. Update Watchtower Auto-Turrets (scaling with `watchtower` Lv 1..3)
    const towerLvl = this.getBuildingLevel('watchtower');
    if (towerLvl > 0 && this.watchtowers.length > 0) {
      const towerUpgradeSpec = getBuildingUpgradeSpec('watchtower', towerLvl);
      const tStats = towerUpgradeSpec.statsAtCurrent || {
        damage: 18,
        fireInterval: 1.35,
        range: 34,
        boltsCount: 1,
        mutantDamageMult: 1.0,
        slowOnHit: 0,
      };

      for (const tower of this.watchtowers) {
        tower.cooldown = Math.max(0, tower.cooldown - dt);
        if (tower.cooldown <= 0 && enemies.length > 0) {
          const inRange = enemies
            .filter(
              (e) =>
                e &&
                e.hp > 0 &&
                !this._isNonHostileToDefenses(e) &&
                dist2D(tower.x, tower.z, e.x, e.z) <= tStats.range
            )
            .sort(
              (a, b) =>
                dist2D(tower.x, tower.z, a.x, a.z) - dist2D(tower.x, tower.z, b.x, b.z)
            );

          if (inRange.length > 0) {
            tower.cooldown = tStats.fireInterval;
            const boltsToFire = Math.min(inRange.length, tStats.boltsCount || 1);
            for (let bIdx = 0; bIdx < boltsToFire; bIdx++) {
              const target = inRange[bIdx];
              const isMutant =
                Boolean(target.genome?.isHybrid) ||
                (Array.isArray(target.genome?.mutations) && target.genome.mutations.length > 0);
              const mutMult = isMutant ? tStats.mutantDamageMult || 1.0 : 1.0;
              const boltDamage = Math.round(tStats.damage * this.turretDamageMultiplier * mutMult);
              const boltColor = towerLvl >= 3 ? 0xff4500 : towerLvl === 2 ? 0x00e5ff : 0x48dbfb;

              this._spawnBolt(
                tower.x,
                tower.y + 4.8,
                tower.z,
                target,
                boltDamage,
                boltColor,
                tStats.slowOnHit || 0,
                towerLvl >= 3
              );
            }
          }
        }
      }
    }

    // 5. Update Allied NPCs by Role
    for (const npc of this.npcs) {
      npc.actionTimer = Math.max(0, npc.actionTimer - dt);
      npc.distressAlertCooldown = Math.max(0, (npc.distressAlertCooldown || 0) - dt);

      if ((npc.sosBeaconTimer || 0) > 0) {
        npc.sosBeaconTimer -= dt;
        if (npc.sosBeaconTimer <= 0 && npc._sosBeaconActive) {
          npc._sosBeaconActive = false;
          if (this.vfx && typeof this.vfx.setPatientZeroBeacon === 'function') {
            this.vfx.setPatientZeroBeacon(npc.id, null, 0xff2222, false);
          }
        }
      }

      if (npc.role === 'harvester') {
        this._updateHarvesterAI(npc, dt, player, enemies, enemyManager);
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
            isAttacking:
              npc.state === 'attack' ||
              npc.state === 'chopping' ||
              npc.state === 'hunting_strike',
          },
          elapsedTime,
          dt
        );
      } else {
        npc.position.set(npc.x, npc.y, npc.z);
      }
    }

    // 6. Update Guard & Watchtower Bolts
    this._updateBolts(dt, enemyManager);
  }

  /**
   * Returns true if an entity is a peaceful herbivore (`deer`/`rabbit`, `prey_pacifist`),
   * an unprovoked peaceful apex sovereign (`dragon`), or an offshore ocean shark (`isAquatic === true`),
   * meaning Bastion Watchtowers, Guards, Hearth auras, and Scout threat checks should ignore it.
   *
   * @param {Object} e
   * @returns {boolean}
   * @private
   */
  _isNonHostileToDefenses(e) {
    if (!e) return true;
    if (e.aggroStance === 'prey_pacifist') return true;
    const spId = e.genome?.speciesId;
    if (spId === 'deer' || spId === 'rabbit' || e.genome?.clade === 'herbivore') return true;
    if (e.aggroStance === 'pacifist_apex' && !e.enraged) return true;
    if (e.isAquatic) return true;
    return false;
  }

  /**
   * Harvester AI (Phase 16):
   * - **Job A (Chopping Trees / Mining Crystals)**: Finds the nearest non-depleted `resourceNode`
   *   via `this.terrain.getNearestResourceNode(npc.x, npc.z, 95)`, walks to it (`d <= 2.2m`),
   *   chops/mines for `2.2s` (`npc.harvestTimer`), calls `this.terrain.harvestResourceNode(node, node.type === 'crystal' ? 1 : 2)`
   *   (physically depleting and destroying the 3D tree/crystal when `node.amount <= 0`), and walks back to
   *   the Bastion (`r < 8m`) to deposit `+2 Wood` or `+1 Crystal`.
   * - **Job B (Hunting Rabbits & Deer for Food)**: When `(player?.resources?.food ?? 50) < 95` or every 3rd trip
   *   (if living `rabbit` or `deer` exist), enters `state = 'hunting_prey'`, stalks the nearest `rabbit` or `deer`,
   *   strikes it (`16 damage` every `1.0s` with VFX), and when the prey dies, collects `+20 Food Rations` (`🍖`)
   *   and brings it back to the Bastion.
   */
  _updateHarvesterAI(npc, dt, player, enemies = [], enemyManager = null) {
    const moveSpeed = npc.speed || CONFIG.SCOUT?.HARVESTER_SPEED || 5.5;

    // 1. Returning to the Bastion with gathered resources or hunted game meat
    if (npc.carryingType && npc.carryingAmount > 0) {
      npc.state = 'returning';
      const distCenter = Math.hypot(npc.x, npc.z);
      if (distCenter < 8.0) {
        if (player && player.resources) {
          if (npc.carryingType === 'wood') {
            player.resources.wood = (player.resources.wood || 0) + npc.carryingAmount;
          } else if (npc.carryingType === 'crystal') {
            player.resources.crystal = (player.resources.crystal || 0) + npc.carryingAmount;
          } else if (npc.carryingType === 'food') {
            player.resources.food = Math.min(
              200,
              (player.resources.food || 0) + npc.carryingAmount
            );
            logger.info(
              'HARVESTER',
              `🍖 ${npc.name} rapporte +${npc.carryingAmount} Rations de Gibier au Bastion !`,
              { npcId: npc.id, food: Math.round(player.resources.food) }
            );
          }
        }
        this.hp = Math.min(this.maxHp, this.hp + 6);
        npc.carryingType = null;
        npc.carryingAmount = 0;
        npc.harvestJob = null;
        npc.targetNode = null;
        npc.targetPrey = null;
        npc.completedTrips = (npc.completedTrips || 0) + 1;
        npc.vx = 0;
        npc.vz = 0;
        return;
      }

      const angleToBase = Math.atan2(-npc.z, -npc.x);
      npc.vx = Math.cos(angleToBase) * moveSpeed;
      npc.vz = Math.sin(angleToBase) * moveSpeed;
      return;
    }

    // 2. Decide Job if idle (Job B: Hunt Rabbits/Deer vs Job A: Chop Tree / Mine Crystal)
    if (!npc.harvestJob) {
      const currentFood = player?.resources?.food ?? 50;
      const shouldHunt = currentFood < 95 || (npc.completedTrips || 0) % 3 === 2;

      if (shouldHunt && Array.isArray(enemies) && enemies.length > 0) {
        let nearestPrey = null;
        let minPreyDist = 110;
        for (const e of enemies) {
          if (!e || e.hp <= 0) continue;
          const spId = e.genome?.speciesId;
          if (spId === 'rabbit' || spId === 'deer') {
            const d = dist2D(npc.x, npc.z, e.x, e.z);
            if (d < minPreyDist) {
              minPreyDist = d;
              nearestPrey = e;
            }
          }
        }
        if (nearestPrey) {
          npc.harvestJob = 'hunt_prey';
          npc.targetPrey = nearestPrey;
          npc.state = 'hunting_prey';
        }
      }

      if (!npc.harvestJob) {
        const node =
          this.terrain && typeof this.terrain.getNearestResourceNode === 'function'
            ? this.terrain.getNearestResourceNode(npc.x, npc.z, 95)
            : null;
        if (node) {
          npc.harvestJob = 'gather_node';
          npc.targetNode = node;
          npc.targetX = node.x;
          npc.targetZ = node.z;
          npc.state = 'harvesting';
        } else {
          npc.harvestJob = 'fallback_gather';
          const a = Math.random() * Math.PI * 2;
          const r = 15 + Math.random() * 14;
          npc.targetX = Math.cos(a) * r;
          npc.targetZ = Math.sin(a) * r;
          npc.state = 'harvesting';
        }
      }
    }

    // 3. Execute Job B: Hunting Rabbits & Deer for Food Rations
    if (npc.harvestJob === 'hunt_prey') {
      const prey = npc.targetPrey;
      if (!prey || prey.hp <= 0) {
        // Prey died or vanished -> if we were close to it, collect +20 Food Rations!
        if (prey && dist2D(npc.x, npc.z, prey.x, prey.z) <= 8.0) {
          npc.carryingType = 'food';
          npc.carryingAmount = 20;
          npc.harvestJob = null;
          npc.targetPrey = null;
          npc.state = 'returning';
          return;
        }
        npc.harvestJob = null;
        npc.targetPrey = null;
        return;
      }

      npc.targetX = prey.x;
      npc.targetZ = prey.z;
      const dPrey = dist2D(npc.x, npc.z, prey.x, prey.z);

      if (dPrey <= 2.4) {
        npc.state = 'hunting_strike';
        npc.vx = 0;
        npc.vz = 0;
        if (npc.actionTimer <= 0) {
          npc.actionTimer = 1.0;
          if (this.vfx && typeof this.vfx.spawnImpactBurst === 'function') {
            this.vfx.spawnImpactBurst(
              new THREE.Vector3(prey.x, (prey.y || 1) + 0.6, prey.z),
              0xff7744,
              7
            );
          }
          if (enemyManager && typeof enemyManager.damageEnemy === 'function') {
            enemyManager.damageEnemy(prey.id, 16, 'npc_hunt');
          } else {
            prey.hp -= 16;
          }
          if (prey.hp <= 0) {
            npc.carryingType = 'food';
            npc.carryingAmount = 20;
            npc.harvestJob = null;
            npc.targetPrey = null;
            npc.state = 'returning';
            return;
          }
        }
        return;
      }

      npc.state = 'hunting_prey';
      const angle = Math.atan2(prey.z - npc.z, prey.x - npc.x);
      // Slight sprint when stalking fast rabbits/deer
      npc.vx = Math.cos(angle) * (moveSpeed * 1.12);
      npc.vz = Math.sin(angle) * (moveSpeed * 1.12);
      return;
    }

    // 4. Execute Job A: Chopping Trees / Mining Crystals (`gather_node` or `fallback_gather`)
    const node = npc.targetNode;
    if (npc.harvestJob === 'gather_node' && (!node || node.depleted || node.amount <= 0)) {
      npc.harvestJob = null;
      npc.targetNode = null;
      npc.harvestTimer = 0;
      return;
    }

    const targetX = node ? node.x : npc.targetX;
    const targetZ = node ? node.z : npc.targetZ;
    const dNode = dist2D(npc.x, npc.z, targetX, targetZ);

    if (dNode <= 2.2) {
      npc.state = 'chopping';
      npc.vx = 0;
      npc.vz = 0;
      npc.harvestTimer = (npc.harvestTimer || 0) + dt;

      if (npc.actionTimer <= 0) {
        npc.actionTimer = 0.85;
        if (this.vfx && typeof this.vfx.spawnImpactBurst === 'function') {
          const chipColor = node?.type === 'crystal' ? 0x00e5ff : 0xc89b6e;
          this.vfx.spawnImpactBurst(
            new THREE.Vector3(targetX, (npc.y || 1) + 0.9, targetZ),
            chipColor,
            5
          );
        }
      }

      if (npc.harvestTimer >= 2.2) {
        npc.harvestTimer = 0;
        let resourceType = 'wood';
        let harvestedAmt = 2;

        if (
          node &&
          this.terrain &&
          typeof this.terrain.harvestResourceNode === 'function'
        ) {
          resourceType = node.type === 'crystal' ? 'crystal' : 'wood';
          const reqAmt = resourceType === 'crystal' ? 1 : 2;
          const actual = this.terrain.harvestResourceNode(node, reqAmt);
          harvestedAmt = actual > 0 ? actual : reqAmt;
        }

        npc.carryingType = resourceType;
        npc.carryingAmount = harvestedAmt;
        npc.harvestJob = null;
        npc.targetNode = null;
        npc.state = 'returning';
      }
      return;
    }

    npc.state = 'harvesting';
    const angle = Math.atan2(targetZ - npc.z, targetX - npc.x);
    npc.vx = Math.cos(angle) * moveSpeed;
    npc.vz = Math.sin(angle) * moveSpeed;
  }

  /**
   * Guard AI: patrols the Bastion perimeter (`12..22` units) and fires bolts at approaching hostile enemies.
   */
  _updateGuardAI(npc, dt, enemies) {
    let nearestEnemy = null;
    let nearestDist = 30;
    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      if (this._isNonHostileToDefenses(e)) continue;
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
   * Scout (Éclaireur) AI with Assignable Mission Orders (`activeScoutMission`):
   * 1. Scans all enemies within `effectiveVision` and triggers a Priority Alert + 3D Sky Beacon
   *    whenever an unspotted Mutant (`mutations.length > 0`) or Hybrid (`isHybrid`) is discovered!
   *    Also deploys a **Slowing Beacon** (`slowBeaconOnPatientZero`) when Scout Guild is Level 2+.
   * 2. Scans unrescued Prisoner Cages and Ancient Relic Monoliths (`relicShrines`) within `effectiveVision`,
   *    lighting 3D sky beacons on them.
   * 3. Executes the player's active Scout Mission order:
   *    - `'track_lineage'`: Hunts down every unspotted carrier of `activeScoutMission.targetMutationId`
   *      at `1.12x` speed until 100% of carriers are revealed!
   *    - `'find_cages'`: Heads directly toward unspotted/unrescued Prisoner Cages or Relic Monoliths.
   *    - `'scout_volcano'`: Deep-wilderness caldera exploration.
   *    - `'perimeter_alert'`: Frontier vigilance patrol.
   */
  _updateScoutAI(scout, dt, enemies, onScoutDiscovery) {
    const missionMult = Math.min(1.12, this.activeScoutMission?.speedBonusMult || 1.12);
    const effectiveVision =
      ((CONFIG.SCOUT?.VISION_RADIUS || 34) + this.scoutVisionBonus) *
      this.scoutVisionMultiplier *
      this.guildVisionMult;
    const effectiveSpeed =
      (CONFIG.SCOUT?.SPEED || 6.8) * this.scoutSpeedMultiplier * this.guildSpeedMult;
    const fleeRadius = CONFIG.SCOUT?.FLEE_RADIUS || 16;

    scout.visionRadius = effectiveVision;
    scout.missionLabel = this.activeScoutMission?.shortLabel || '🔍 Traquer Lignée';

    // 1. Scan for Prisoner Cages within Vision Radius
    for (const cage of this.cages) {
      if (cage.rescued || cage.spottedByScout) continue;
      const dCage = dist2D(scout.x, scout.z, cage.x, cage.z);
      if (dCage <= effectiveVision) {
        cage.spottedByScout = true;
        if (this.vfx && typeof this.vfx.setCageBeacon === 'function') {
          this.vfx.setCageBeacon(
            cage.id,
            cage.mesh ? cage.mesh.position : new THREE.Vector3(cage.x, cage.y || 2, cage.z),
            true,
            0xffd166
          );
        }
        const cageDir = getCardinalLabelFR(cage.x, cage.z);
        logger.alert(
          `⛓️ ÉCLAIREUR (${scout.name}) : Cage de Survivant [${this._roleLabelFR(cage.role)}] localisée au ${cageDir} !`,
          { scoutId: scout.id, cageId: cage.id, role: cage.role, direction: cageDir }
        );
      }
    }

    // 1b. Scan for Ancient Relic Monoliths (`relicShrines`) & Elemental Weapon Shrines within Vision Radius
    for (const relic of this.relicShrines) {
      if (relic.collected || relic.spottedByScout) continue;
      const dRelic = dist2D(scout.x, scout.z, relic.x, relic.z);
      if (dRelic <= effectiveVision) {
        relic.spottedByScout = true;
        if (this.vfx && typeof this.vfx.setRelicBeacon === 'function') {
          this.vfx.setRelicBeacon(
            relic.id,
            relic.mesh ? relic.mesh.position : new THREE.Vector3(relic.x, relic.y + 1.5, relic.z),
            relic.colorHex || 0x00e5ff,
            true
          );
        }
        const relicDir = getCardinalLabelFR(relic.x, relic.z);
        logger.alert(
          `🏛️ ÉCLAIREUR (${scout.name}) : Monolithe de Relique [${relic.name}] localisé au ${relicDir} !`,
          { scoutId: scout.id, relicId: relic.id, direction: relicDir }
        );
        if (typeof this.onRelicSpottedByScout === 'function') {
          this.onRelicSpottedByScout(relic, scout);
        }
      }
    }

    for (const shrine of this.weaponShrines) {
      if (!shrine.discovered && dist2D(scout.x, scout.z, shrine.x, shrine.z) <= effectiveVision) {
        shrine.discovered = true;
      }
    }

    // 2. Scan for Mutations & Hybrids within Vision Radius
    const nearbyThreats = [];
    for (const enemy of enemies) {
      if (!enemy || enemy.hp <= 0) continue;
      const d = dist2D(scout.x, scout.z, enemy.x, enemy.z);

      // Scouts only flee from hostile/territorial enemies or enraged Dragons (never from peaceful herbivores or offshore sharks)
      if (d <= fleeRadius && !this._isNonHostileToDefenses(enemy)) {
        nearbyThreats.push(enemy);
      }

      const mutations = Array.isArray(enemy.genome?.mutations) ? enemy.genome.mutations : [];
      const isHybrid = Boolean(enemy.genome?.isHybrid);

      // Scout Guild Lv2+ Slowing Beacon on spotted mutants within vision
      if (
        this.slowBeaconOnPatientZero &&
        d <= effectiveVision &&
        (mutations.length > 0 || isHybrid) &&
        typeof enemy.applySlow === 'function'
      ) {
        enemy.applySlow(this.slowBeaconFactor || 0.65, 2.5);
      }

      if (d <= effectiveVision && !enemy.spottedByScout) {
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

          if (this.slowBeaconOnPatientZero && typeof enemy.applySlow === 'function') {
            enemy.applySlow(this.slowBeaconFactor || 0.65, 5.0);
          }

          const direction = getCardinalLabelFR(enemy.x, enemy.z);
          const mutLabels = mutations
            .map((m) => CONFIG.MUTATIONS?.[m]?.name || m)
            .join(', ');
          const stageTag =
            enemy.lifeStage === 'baby' || enemy.isAdult === false ? ' [BÉBÉ JUVÉNILE]' : '';
          const descLabel =
            mutations.length > 0
              ? `${enemy.genome.speciesName} — ${mutLabels}`
              : `Hybride ${enemy.genome.speciesName}`;

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

    // 3. Flee Behavior vs Mission-Driven Expedition Movement
    if (nearbyThreats.length > 0) {
      scout.state = 'fleeing';
      const evasion = computeScoutEvasionVector(
        scout,
        nearbyThreats,
        this.pos,
        CONFIG.WORLD?.SIZE || 240
      );
      scout.vx = evasion.vx * this.scoutSpeedMultiplier * this.guildSpeedMult;
      scout.vz = evasion.vz * this.scoutSpeedMultiplier * this.guildSpeedMult;
      return;
    }

    scout.state = 'expedition';

    // Priority 0: Guided Tutorial Act 6 Baby Fire Troll target (natural trek at capped 1.12x speed)
    const priorityTutorialTarget = enemies.find(
      (e) =>
        e &&
        e.hp > 0 &&
        !e.spottedByScout &&
        (e.tutorialTag === 'act6_baby_fire_troll' || (this.tutorialMode && e.isPatientZero))
    );

    if (priorityTutorialTarget) {
      scout.targetX = priorityTutorialTarget.x;
      scout.targetZ = priorityTutorialTarget.z;
      scout.sectorName = getCardinalLabelFR(priorityTutorialTarget.x, priorityTutorialTarget.z);
      const angle = Math.atan2(scout.targetZ - scout.z, scout.targetX - scout.x);
      scout.vx = Math.cos(angle) * effectiveSpeed * missionMult;
      scout.vz = Math.sin(angle) * effectiveSpeed * missionMult;
      return;
    }

    // Mission Mode A: 'track_lineage' -> Seek out every unspotted carrier of `targetMutationId`!
    if (this.activeScoutMission?.type === 'track_lineage') {
      const targetMutId = this.activeScoutMission.targetMutationId;
      let unspottedTarget = null;
      let minDist = Infinity;

      for (const e of enemies) {
        if (!e || e.hp <= 0 || e.spottedByScout) continue;
        const muts = Array.isArray(e.genome?.mutations) ? e.genome.mutations : [];
        const matchesLineage = targetMutId
          ? muts.includes(targetMutId) || e.genome?.speciesId === targetMutId
          : muts.length > 0 || Boolean(e.genome?.isHybrid);

        if (matchesLineage) {
          const d = dist2D(scout.x, scout.z, e.x, e.z);
          if (d < minDist) {
            minDist = d;
            unspottedTarget = e;
          }
        }
      }

      // Fallback: if all carriers of targetMutId are already spotted, seek any other unspotted mutant/hybrid
      if (!unspottedTarget) {
        for (const e of enemies) {
          if (!e || e.hp <= 0 || e.spottedByScout) continue;
          const muts = Array.isArray(e.genome?.mutations) ? e.genome.mutations : [];
          if (muts.length > 0 || e.genome?.isHybrid) {
            const d = dist2D(scout.x, scout.z, e.x, e.z);
            if (d < minDist) {
              minDist = d;
              unspottedTarget = e;
            }
          }
        }
      }

      if (unspottedTarget) {
        scout.targetX = unspottedTarget.x;
        scout.targetZ = unspottedTarget.z;
        scout.sectorName = getCardinalLabelFR(unspottedTarget.x, unspottedTarget.z);
        const angle = Math.atan2(scout.targetZ - scout.z, scout.targetX - scout.x);
        scout.vx = Math.cos(angle) * effectiveSpeed * missionMult;
        scout.vz = Math.sin(angle) * effectiveSpeed * missionMult;
        return;
      }
    }

    // Mission Mode B: 'find_cages' -> Seek out unrescued Prisoner Cages or uncollected Relic Monoliths
    if (this.activeScoutMission?.type === 'find_cages') {
      const unspottedCage =
        this.cages.find((c) => !c.rescued && !c.spottedByScout) ||
        this.relicShrines.find((r) => !r.collected && !r.spottedByScout) ||
        this.cages.find((c) => !c.rescued);
      if (unspottedCage) {
        scout.targetX = unspottedCage.x;
        scout.targetZ = unspottedCage.z;
        scout.sectorName = getCardinalLabelFR(unspottedCage.x, unspottedCage.z);
        const angle = Math.atan2(scout.targetZ - scout.z, scout.targetX - scout.x);
        scout.vx = Math.cos(angle) * effectiveSpeed * missionMult;
        scout.vz = Math.sin(angle) * effectiveSpeed * missionMult;
        return;
      }
    }

    // Standard / 'scout_volcano' / 'perimeter_alert' waypoint navigation
    scout.waypointTimer -= dt;
    const dWaypoint = dist2D(scout.x, scout.z, scout.targetX, scout.targetZ);

    if (dWaypoint < 5.0 || scout.waypointTimer <= 0) {
      this._assignNewWildernessWaypoint(scout, enemies);
    }

    const angle = Math.atan2(scout.targetZ - scout.z, scout.targetX - scout.x);
    scout.vx = Math.cos(angle) * effectiveSpeed;
    scout.vz = Math.sin(angle) * effectiveSpeed;
  }

  /**
   * Spawns a ranged bolt projectile from a Watchtower or Guard toward a target enemy.
   */
  _spawnBolt(x, y, z, targetEnemy, damage, colorHex = 0x48dbfb, slowOnHit = 0, burnOnHit = false) {
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
      slowOnHit,
      burnOnHit,
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
          if (b.slowOnHit > 0 && typeof target.applySlow === 'function') {
            target.applySlow(1 - b.slowOnHit, 2.5);
          }
          if (b.burnOnHit && typeof target.applyBurn === 'function') {
            target.applyBurn(12, 3.0);
          }
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
