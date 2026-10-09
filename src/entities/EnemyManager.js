/**
 * @fileoverview Enemy Population, Pack/Territory AI, Combat & Eco-Tick Lifecycle Manager.
 * Manages all wild creatures across the 3D island, including pack cohesion (maintaining
 * Conway's Game of Life optimal density windows), famine migration waves, aggro & melee/fireball
 * attacks against the Player, Scouts, and Bastion, and mutant lineage eradication tracking.
 *
 * Usage:
 *   const enemyManager = new EnemyManager(scene, terrain, vfx, ecoSim);
 *   enemyManager.spawnInitialPopulation();
 *   enemyManager.update(dt, elapsedTime, player, bastionAndNpcs, onLineageEradicated);
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Genome } from '../ecosystem/Genome.js';
import { createHybridSpec } from '../ecosystem/Phylogeny.js';
import { getIslandTierSpec } from '../ecosystem/BaseAndQuestsDesign.js';
import {
  buildCreatureMesh,
  animateCreatureMesh,
  updateCreatureOverlay,
  setSharkAmphibiousMode,
} from './CreatureMeshBuilder.js';
import { dist2D, clamp } from '../utils/math.js';
import { logger } from '../utils/logger.js';

export class EnemyManager {
  /**
   * @param {THREE.Scene} scene - Three.js scene for enemy meshes.
   * @param {Object} terrain - Terrain instance providing `getHeightAt(x, z)` and `getBiomeAt(x, z)`.
   * @param {Object} vfx - VFXManager instance for birth/hit/death particles and Patient Zero sky beacons.
   * @param {Object} ecoSim - EcosystemSimulator instance running Conway's Game of Life + genetics.
   */
  constructor(scene, terrain, vfx, ecoSim) {
    /** @type {THREE.Scene} */
    this.scene = scene;
    /** @type {Object} */
    this.terrain = terrain;
    /** @type {Object} */
    this.vfx = vfx;
    /** @type {Object} */
    this.ecoSim = ecoSim;

    /** @type {Array<Object>} Active enemy entities in the world */
    this.enemies = [];
    /** @type {Array<Object>} Active enemy projectiles (e.g. Pyro/Dragon fireballs) */
    this.projectiles = [];
    /** @type {number} Monotonic entity ID counter */
    this.nextEnemyId = 1;

    /** @type {number} Seconds elapsed since last genetic Eco-Tick */
    this.ecoTickTimer = 0;
    /** @type {number} Interval in seconds between Eco-Ticks */
    this.ecoTickInterval = CONFIG.ECO?.TICK_INTERVAL || 12;
    /** @type {number} Seconds remaining until next Eco-Tick */
    this.timeUntilNextTick = this.ecoTickInterval;
    /** @type {number} Normalized [0..1] progress toward next Eco-Tick */
    this.ecoTickProgress = 0;

    /** @type {Set<string>} Tracks mutations that have existed so we can detect complete eradication */
    this.seenMutations = new Set();
    /** @type {Function|null} Optional stored callback when a mutant lineage is eradicated */
    this.onLineageEradicated = null;
    /** @type {Function|null} Optional callback `(enemy, xpGained)` when any enemy is killed */
    this.onEnemyKilled = null;
    /** @type {Function|null} Optional callback `(speciesId, triggerEnemy, enragedMembers)` when a peaceful apex species is provoked */
    this.onSpeciesWrathTriggered = null;
    /** @type {Function|null} Optional callback `(speciesId, spawnedPair, messageFR)` when a depleted base species repopulates */
    this.onSpeciesRepopulated = null;
    /** @type {Function|null} Optional callback `(landedSharks)` when Ocean Sharks evolve legs and storm the beach */
    this.onSharkBeachLanding = null;
    /** @type {Function|null} Optional callback `(spawnedMoles)` when Giant Moles erupt from subterranean burrows */
    this.onMoleSubterraneanEruption = null;
    /** @type {Function|null} Optional callback `(enemy, summary, isSpellDamage)` when a `deer` or `rabbit` is killed */
    this.onPreyKilled = null;
    /** @type {Function|null} Optional callback `(summary, lastKilledPrey, isSpellDamage)` when prey herds become endangered or extinct */
    this.onPreyEcologicalCrisis = null;
    /** @type {Function|null} Optional callback `(tierSpec, enemyManager)` when transitioning to a new Island Tier */
    this.onIslandTransitioned = null;

    /** @type {number} Current campaign island number (`1, 2, 3...`) */
    this.islandNumber = 1;
    /** @type {number} Enemy HP/damage difficulty multiplier for the current island (`1.0`, `1.35`, `1.75`, ...) */
    this.islandDifficultyMult = 1.0;
    /** @type {boolean} Whether the Planetary Island Shield Dome is currently active */
    this.islandShieldActive = false;

    /** @type {number} Seconds elapsed in open survival mode for progressive species emergence */
    this.survivalElapsedTime = 0;
    /** @type {boolean} Whether Ocean Sharks have evolved amphibious legs and stormed the beaches */
    this.sharksLanded = false;
    /** @type {number} Timer for periodic amphibious shark beach landings after initial emergence */
    this.sharkReinforceTimer = 0;
    /** @type {boolean} Whether Giant Burrowing Moles have erupted from underground */
    this.molesErupted = false;
    /** @type {number} Timer for periodic subterranean mole eruptions after initial emergence */
    this.moleReinforceTimer = 0;

    /**
     * Tracks collective species wrath state (e.g. `'dragon'` when a peaceful Sovereign Dragon is attacked).
     * @type {Map<string, { active: boolean, timer: number, duration: number }>}
     */
    this.speciesWrath = new Map();

    /**
     * Per-species repopulation timers in seconds when a foundational species drops below `< 2` individuals.
     * Note: `deer` and `rabbit` have `autoRepopulate: false` and NEVER repopulate automatically!
     * @type {Record<string, number>}
     */
    this.repopulationTimers = {
      goblin: 0,
      orc: 0,
      troll: 0,
      wolf: 0,
      lion: 0,
      vulture: 0,
      dragon: 0,
      shark: 0,
      giant_mole: 0,
      deer: 0,
      rabbit: 0,
    };

    /** @type {boolean} Whether the 7-Act Guided Onboarding tutorial mode is active */
    this.tutorialMode = false;
    /** @type {boolean} When true, automatic background Eco-Ticks are paused (Acts 1–6) */
    this.ecoPaused = false;
  }

  /**
   * Pauses or resumes background Conway Eco-Ticks (used during Acts 1–6 of the guided tutorial).
   * @param {boolean} paused
   */
  setEcoPaused(paused = true) {
    this.ecoPaused = Boolean(paused);
    logger.info('ECO', this.ecoPaused ? 'Cycles Éco-Tick mis en pause (Mode Tutoriel).' : 'Cycles Éco-Tick réactivés !');
  }

  /**
   * Enables or disables Guided Tutorial mode. When enabled, clears existing wild packs and pauses Eco-Ticks.
   * @param {boolean} enabled
   */
  setTutorialMode(enabled = true) {
    this.tutorialMode = Boolean(enabled);
    this.ecoPaused = Boolean(enabled);
    if (this.tutorialMode) {
      this.clearAllEnemies();
    }
  }

  /**
   * Removes all active enemies and projectiles from the 3D scene and resets beacons.
   */
  clearAllEnemies() {
    for (const enemy of this.enemies) {
      if (this.vfx && typeof this.vfx.setPatientZeroBeacon === 'function') {
        this.vfx.setPatientZeroBeacon(
          enemy.id,
          enemy.mesh ? enemy.mesh.position : new THREE.Vector3(enemy.x, enemy.y, enemy.z),
          0xff3300,
          false
        );
      }
      if (enemy.mesh && this.scene) {
        this.scene.remove(enemy.mesh);
      }
    }
    this.enemies = [];

    for (const p of this.projectiles) {
      if (p.mesh && this.scene) {
        this.scene.remove(p.mesh);
      }
    }
    this.projectiles = [];
    this.speciesWrath.clear();
  }

  /**
   * Returns true if a given species (such as `'dragon'`) is currently in collective wrath state.
   * @param {string} [speciesId='dragon']
   * @returns {boolean}
   */
  isSpeciesProvoked(speciesId = 'dragon') {
    const entry = this.speciesWrath.get(speciesId);
    return Boolean(entry && entry.active && entry.timer > 0);
  }

  /**
   * Returns true if an entity is non-hostile toward the player and Bastion defenses:
   * - Unprovoked peaceful Sovereign Dragon (`'pacifist_apex'`)
   * - Herbivore prey (`'prey_pacifist'` / `deer` / `rabbit`)
   * - Offshore Ocean Shark (`isAquatic === true` before beach landing)
   * @param {Object} enemy
   * @returns {boolean}
   */
  isPeacefulTowardsPlayer(enemy) {
    if (!enemy) return false;
    if (enemy.isAquatic) return true;
    const spId = enemy.genome?.speciesId || 'goblin';
    if (
      enemy.aggroStance === 'prey_pacifist' ||
      enemy.genome?.clade === 'herbivore' ||
      spId === 'deer' ||
      spId === 'rabbit'
    ) {
      return true;
    }
    if (this.isSpeciesProvoked(spId)) return false;
    return enemy.aggroStance === 'pacifist_apex' && !enemy.enraged;
  }

  /**
   * Triggers Collective Species Wrath (`COURROUX DRACONIQUE !`) when the player attacks an
   * unprovoked peaceful Sovereign Dragon (`'pacifist_apex'`). Every living member of that species
   * across the island transitions to `enraged = true`, `aggressiveness = 1.0`, `aggroStance = 'hostile'`,
   * `state = 'wrath_raid'`, gains a `1.25x` speed boost, and charges to raze the Player and Bastion!
   *
   * @param {string} [speciesId='dragon']
   * @param {Object|null} [triggerEnemy=null]
   * @returns {Array<Object>} Array of enraged species members.
   */
  provokeSpecies(speciesId = 'dragon', triggerEnemy = null) {
    const duration = CONFIG.ECO?.SPECIES_WRATH_DURATION || 90;
    const alreadyActive = this.isSpeciesProvoked(speciesId);
    this.speciesWrath.set(speciesId, {
      active: true,
      timer: duration,
      duration,
    });

    // Ensure at least 2 living members of the species exist so the collective wrath wave is felt!
    const existingMembers = this.enemies.filter(
      (e) =>
        e &&
        e.hp > 0 &&
        (e.genome?.speciesId === speciesId ||
          (Array.isArray(e.genome?.hybridParents) && e.genome.hybridParents.includes(speciesId)))
    );

    if (existingMembers.length < 2 && speciesId === 'dragon') {
      const needed = 2 - existingMembers.length;
      for (let i = 0; i < needed; i++) {
        const angle = 1.45 + i * 0.28;
        const dist = 82 + i * 6;
        const rx = Math.cos(angle) * dist;
        const rz = Math.sin(angle) * dist;
        const gen = this._createSafeGenome('dragon');
        const reinf = this.spawnEnemy(rx, rz, gen, [], {
          lifeStage: 'adult',
          isAdult: true,
        });
        existingMembers.push(reinf);
      }
    }

    const enragedMembers = [];
    for (const member of this.enemies) {
      if (!member || member.hp <= 0) continue;
      const matchesSpecies =
        member.genome?.speciesId === speciesId ||
        (Array.isArray(member.genome?.hybridParents) &&
          member.genome.hybridParents.includes(speciesId));
      if (!matchesSpecies) continue;

      member.enraged = true;
      member.aggressiveness = 1.0;
      member.aggroStance = 'hostile';
      member.state = 'wrath_raid';
      member.aggroBastionForced = true;
      if (!member._wrathSpeedApplied) {
        member._wrathSpeedApplied = true;
        member.speed = Number((member.speed * 1.25).toFixed(2));
      }
      enragedMembers.push(member);
    }

    if (!alreadyActive) {
      const spName = CONFIG.SPECIES?.[speciesId]?.name || speciesId;
      logger.alert(
        `🐉 COURROUX DRACONIQUE ! Vous avez attaqué un ${spName} Souverain : toute l'espèce (${enragedMembers.length}x ${spName}s) converge pour raser votre Bastion !`,
        {
          speciesId,
          enragedCount: enragedMembers.length,
          triggerEnemyId: triggerEnemy?.id || null,
          duration,
        }
      );

      if (typeof this.onSpeciesWrathTriggered === 'function') {
        this.onSpeciesWrathTriggered(speciesId, triggerEnemy, enragedMembers);
      }
    }

    return enragedMembers;
  }

  /**
   * Returns a dictionary of living counts for all 11 species (`goblin`, `orc`, `troll`, `wolf`,
   * `lion`, `vulture`, `dragon`, `shark`, `giant_mole`, `deer`, `rabbit`).
   * @returns {Record<string, number>}
   */
  getSpeciesLivingCounts() {
    const counts = {
      goblin: 0,
      orc: 0,
      troll: 0,
      wolf: 0,
      lion: 0,
      vulture: 0,
      dragon: 0,
      shark: 0,
      giant_mole: 0,
      deer: 0,
      rabbit: 0,
    };
    for (const e of this.enemies) {
      if (!e || e.hp <= 0) continue;
      const spId = e.genome?.speciesId;
      if (spId && Object.prototype.hasOwnProperty.call(counts, spId) && !e.genome?.isHybrid) {
        counts[spId] += 1;
      }
    }
    return counts;
  }

  /**
   * Returns a real-time summary of the Herbivore Prey (`deer` & `rabbit`) and Emergent Species
   * (`shark` & `giant_mole`) populations for HUD indicators and ecological crisis alerts.
   *
   * @returns {{
   *   deer: number,
   *   rabbit: number,
   *   totalPrey: number,
   *   sharkOcean: number,
   *   sharkLanded: number,
   *   giantMole: number,
   *   isExtinct: boolean,
   *   isEndangered: boolean
   * }}
   */
  getPreyPopulationSummary() {
    let deer = 0;
    let rabbit = 0;
    let sharkOcean = 0;
    let sharkLanded = 0;
    let giantMole = 0;

    for (const e of this.enemies) {
      if (!e || e.hp <= 0) continue;
      const spId = e.genome?.speciesId;
      if (spId === 'deer') {
        deer++;
      } else if (spId === 'rabbit') {
        rabbit++;
      } else if (spId === 'shark') {
        if (e.isAquatic) sharkOcean++;
        else sharkLanded++;
      } else if (spId === 'giant_mole') {
        giantMole++;
      }
    }

    const totalPrey = deer + rabbit;
    return {
      deer,
      rabbit,
      totalPrey,
      sharkOcean,
      sharkLanded,
      giantMole,
      isExtinct: totalPrey === 0 || (deer === 0 && rabbit === 0),
      isEndangered: totalPrey > 0 && (deer < 2 || rabbit < 2 || totalPrey <= 3),
    };
  }

  /**
   * Checks foundational hostile species counts (`goblin`, `orc`, `troll`, `wolf`, `lion`, `vulture`, `dragon`,
   * plus `shark` after beach landing and `giant_mole` after burrow eruption) and repopulates any
   * species with `autoRepopulate !== false` whose living count drops below `< 2`.
   * CRITICAL: Herbivore prey (`deer` and `rabbit`) have `autoRepopulate: false` and NEVER repopulate
   * automatically if overhunted below `< 2`!
   *
   * @param {number} [dt=0] - Elapsed seconds to advance repopulation timers.
   * @param {boolean} [forceImmediate=false] - When true, bypasses the cooldown timer and repopulates immediately.
   * @returns {Array<Object>} Newly spawned wild Gen-1 creatures across all repopulated species.
   */
  checkAndRepopulateSpecies(dt = 0, forceImmediate = false) {
    if ((this.tutorialMode || this.ecoPaused) && !forceImmediate) {
      return [];
    }

    const minThreshold = CONFIG.ECO?.REPOPULATION_MIN_THRESHOLD || 2;
    const maxWorldPop = CONFIG.ECO?.MAX_WORLD_POPULATION || 130;
    const counts = this.getSpeciesLivingCounts();
    const baseSpeciesIds = ['goblin', 'orc', 'troll', 'wolf', 'lion', 'vulture', 'dragon'];
    if (this.sharksLanded) baseSpeciesIds.push('shark');
    if (this.molesErupted) baseSpeciesIds.push('giant_mole');

    // Preferred biome angles & radial distances (> 52m from Bastion at (0,0))
    const habitatAnchors = {
      goblin: { angle: 0.4, dist: 58 },
      orc: { angle: 1.0, dist: 64 },
      troll: { angle: 0.75, dist: 74 },
      wolf: { angle: 2.15, dist: 60 },
      lion: { angle: 2.8, dist: 68 },
      vulture: { angle: 4.85, dist: 76 },
      dragon: { angle: 1.55, dist: 86 },
      shark: { angle: 3.85, dist: 75 },
      giant_mole: { angle: 5.2, dist: 62 },
    };

    const allSpawned = [];

    for (const spId of baseSpeciesIds) {
      const spDef = CONFIG.SPECIES?.[spId] || CONFIG.SPECIES.goblin;
      if (spDef.autoRepopulate === false || spId === 'deer' || spId === 'rabbit') {
        continue;
      }

      const living = counts[spId] || 0;
      if (living >= minThreshold) {
        this.repopulationTimers[spId] = 0;
        continue;
      }

      const cooldown = spDef.repopulationCooldown || (spId === 'dragon' ? 28 : 14);
      this.repopulationTimers[spId] = (this.repopulationTimers[spId] || 0) + dt;

      if (!forceImmediate && this.repopulationTimers[spId] < cooldown) {
        continue;
      }

      if (this.enemies.length >= maxWorldPop) {
        continue;
      }

      this.repopulationTimers[spId] = 0;
      const anchor = habitatAnchors[spId] || { angle: Math.random() * Math.PI * 2, dist: 64 };
      const baseAngle = anchor.angle + (Math.random() - 0.5) * 0.45;
      const baseDist = Math.max(54, anchor.dist + (Math.random() - 0.5) * 8);
      const cx = Math.cos(baseAngle) * baseDist;
      const cz = Math.sin(baseAngle) * baseDist;

      const pair = [];
      for (let i = 0; i < 2; i++) {
        const a = i * Math.PI + (Math.random() - 0.5) * 0.5;
        const r = 3.2 + Math.random() * 2.5;
        const sx = cx + Math.cos(a) * r;
        const sz = cz + Math.sin(a) * r;
        const wildGenome = this._createSafeGenome(spId);
        wildGenome.mutations = [];
        if (spId === 'shark') {
          this._applyMutationToGenome(wildGenome, 'amphibious_lungs');
        } else if (typeof wildGenome.syncMutations === 'function') {
          wildGenome.syncMutations();
        }
        const spawned = this.spawnEnemy(sx, sz, wildGenome, [], {
          lifeStage: 'adult',
          isAdult: true,
          isPatientZero: false,
          isAquatic: false,
          hasLandLegs: true,
          isAmphibiousLanded: spId === 'shark',
        });
        if (spId === 'shark' && this.vfx?.spawnBeachLandingSplash) {
          this.vfx.spawnBeachLandingSplash(new THREE.Vector3(spawned.x, spawned.y + 0.3, spawned.z));
        } else if (spId === 'giant_mole' && this.vfx?.spawnBurrowEruption) {
          this.vfx.spawnBurrowEruption(new THREE.Vector3(spawned.x, spawned.y + 0.2, spawned.z));
        }
        pair.push(spawned);
        allSpawned.push(spawned);
      }

      const msgFR =
        spDef.repopulationMessageFR ||
        `Repeuplement sauvage : 2x ${spDef.name}s émergent de ${spDef.repopulationHabitatLabel || 'leurs repaires sauvages'} !`;
      logger.evolution(`🌿 ${msgFR}`, {
        speciesId: spId,
        spawnedCount: pair.length,
        x: Math.round(cx),
        z: Math.round(cz),
      });

      if (typeof this.onSpeciesRepopulated === 'function') {
        this.onSpeciesRepopulated(spId, pair, msgFR);
      }
    }

    return allSpawned;
  }

  /**
   * Triggers Progressive Emergence Event 1: **Amphibious Land-Shark Beach Landing** (`shark`).
   * Offshore Ocean Sharks (`isAquatic === true`) evolve muscular amphibious legs (`amphibious_lungs`),
   * leap out of the ocean surf onto the beaches (`radius ~ 74m`) with water splash VFX, and begin
   * hunting on land and hybridizing with terrestrial predators (`Squale-Garou`, `Léviathan des Brisants`)!
   *
   * @returns {Array<Object>} Array of landed amphibious Shark entities.
   */
  triggerSharkBeachLanding() {
    this.sharksLanded = true;
    if (this.ecoSim && typeof this.ecoSim.recordSharkLanding === 'function') {
      this.ecoSim.recordSharkLanding();
    }

    const landedSharks = [];

    // 1. Transition any currently swimming offshore ocean sharks onto the shoreline
    for (const enemy of this.enemies) {
      if (!enemy || enemy.hp <= 0 || enemy.genome?.speciesId !== 'shark' || !enemy.isAquatic) {
        continue;
      }
      enemy.isAquatic = false;
      enemy.hasLandLegs = true;
      enemy.isAmphibiousLanded = true;
      this._applyMutationToGenome(enemy.genome, 'amphibious_lungs');
      enemy.maxHp = Math.round(enemy.genome?.genes?.maxHp || enemy.maxHp);
      enemy.hp = enemy.maxHp;
      enemy.damage = +(enemy.genome?.genes?.strength || enemy.damage).toFixed(1);
      enemy.speed = +(enemy.genome?.genes?.speed || enemy.speed).toFixed(2);

      const angle = Math.atan2(enemy.z, enemy.x);
      const shoreDist = 72 + (Math.random() - 0.5) * 5;
      enemy.x = Math.cos(angle) * shoreDist;
      enemy.z = Math.sin(angle) * shoreDist;
      enemy.homeX = enemy.x;
      enemy.homeZ = enemy.z;
      enemy.y = this.terrain ? this.terrain.getHeightAt(enemy.x, enemy.z) : 1.0;

      if (enemy.mesh) {
        setSharkAmphibiousMode(enemy.mesh, true);
        enemy.mesh.position.set(enemy.x, Math.max(enemy.y, CONFIG.WORLD.WATER_LEVEL + 0.15), enemy.z);
      }
      if (this.vfx && typeof this.vfx.spawnBeachLandingSplash === 'function') {
        this.vfx.spawnBeachLandingSplash(new THREE.Vector3(enemy.x, enemy.y + 0.3, enemy.z));
      }
      landedSharks.push(enemy);
    }

    // 2. Ensure at least 3 Amphibious Land-Sharks storm the beach (clustered so they can reproduce)
    if (landedSharks.length < 3) {
      const needed = 3 - landedSharks.length;
      const baseAngle = 3.85 + (Math.random() - 0.5) * 0.4;
      const baseDist = 73;
      const cx = Math.cos(baseAngle) * baseDist;
      const cz = Math.sin(baseAngle) * baseDist;

      for (let i = 0; i < needed; i++) {
        const a = (i / needed) * Math.PI * 2;
        const sx = cx + Math.cos(a) * 5.0;
        const sz = cz + Math.sin(a) * 5.0;
        const genome = this._createSafeGenome('shark');
        this._applyMutationToGenome(genome, 'amphibious_lungs');
        const shark = this.spawnEnemy(sx, sz, genome, [], {
          lifeStage: 'adult',
          isAdult: true,
          isAquatic: false,
          hasLandLegs: true,
          isAmphibiousLanded: true,
        });
        if (this.vfx && typeof this.vfx.spawnBeachLandingSplash === 'function') {
          this.vfx.spawnBeachLandingSplash(new THREE.Vector3(shark.x, shark.y + 0.3, shark.z));
        }
        landedSharks.push(shark);
      }
    }

    logger.evolution(
      `🦈 ÉMERGENCE ABYSSALE : ${landedSharks.length}x Requins Marcheurs des Abysses ont développé des pattes amphibies [Poumons Amphibies] et débarquent sur les plages !`,
      { count: landedSharks.length }
    );

    if (typeof this.onSharkBeachLanding === 'function') {
      this.onSharkBeachLanding(landedSharks);
    }

    return landedSharks;
  }

  /**
   * Triggers Progressive Emergence Event 2: **Subterranean Giant Mole Eruption** (`giant_mole`).
   * Armored Giant Moles (`Taupe Géante Fouisseuse`) burst from underground burrows (`54..72m` from
   * the Bastion) with flying dirt/rock eruption VFX and begin patrolling and hybridizing (`Taupe-Colosse`, `Sapeur Taupe-Orc`).
   *
   * @param {number} [count=3]
   * @returns {Array<Object>} Array of spawned Giant Mole entities.
   */
  triggerMoleSubterraneanEruption(count = 3) {
    this.molesErupted = true;
    if (this.ecoSim && typeof this.ecoSim.recordMoleEruption === 'function') {
      this.ecoSim.recordMoleEruption();
    }

    const baseAngle = 5.15 + (Math.random() - 0.5) * 0.6;
    const baseDist = 60 + Math.random() * 8;
    const cx = Math.cos(baseAngle) * baseDist;
    const cz = Math.sin(baseAngle) * baseDist;
    const spawnedMoles = [];

    for (let i = 0; i < Math.max(1, count); i++) {
      const a = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.35;
      const r = i === 0 ? 0 : 4.5 + Math.random() * 4.0;
      const sx = cx + Math.cos(a) * r;
      const sz = cz + Math.sin(a) * r;
      const genome = this._createSafeGenome('giant_mole');
      const mole = this.spawnEnemy(sx, sz, genome, [], {
        lifeStage: 'adult',
        isAdult: true,
      });
      if (this.vfx && typeof this.vfx.spawnBurrowEruption === 'function') {
        this.vfx.spawnBurrowEruption(new THREE.Vector3(mole.x, mole.y + 0.2, mole.z));
      }
      spawnedMoles.push(mole);
    }

    logger.evolution(
      `⛏️ ÉRUPTION SOUTERRAINE : ${spawnedMoles.length}x Taupes Géantes Fouisseuses percent la croûte terrestre et surgissent des galeries profondes !`,
      { count: spawnedMoles.length, x: Math.round(cx), z: Math.round(cz) }
    );

    if (typeof this.onMoleSubterraneanEruption === 'function') {
      this.onMoleSubterraneanEruption(spawnedMoles);
    }

    return spawnedMoles;
  }

  /**
   * Bio-Lab / Sanctuary Ecological Restoration Action: spends `25 Biomasse` (`playerResources.biomass`)
   * to reintroduce breeding herds of Sylvestrian Deer (`3` adults) and Plains Rabbits (`4` adults)
   * when overhunting or collateral AoE spell damage has decimated the island's herbivore prey!
   *
   * @param {Object} [playerResources=null] - Player resource bag `{ biomass, wood, crystal, food }`.
   * @returns {{ success: boolean, cost: number, deerSpawned: number, rabbitsSpawned: number, spawned: Array<Object> }}
   */
  reintroducePreyHerds(playerResources = null) {
    const cost = CONFIG.ECO?.PREY_REINTRODUCE_BIOMASS_COST || 25;
    if (playerResources && typeof playerResources.biomass === 'number') {
      if (playerResources.biomass < cost) {
        return { success: false, cost, deerSpawned: 0, rabbitsSpawned: 0, spawned: [] };
      }
      playerResources.biomass -= cost;
    }

    const spawned = [];
    const deerAnchor = { angle: 1.85, dist: 50 };
    const rabbitAnchor = { angle: 4.45, dist: 46 };

    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const sx = Math.cos(deerAnchor.angle) * deerAnchor.dist + Math.cos(a) * 4.5;
      const sz = Math.sin(deerAnchor.angle) * deerAnchor.dist + Math.sin(a) * 4.5;
      const genome = this._createSafeGenome('deer');
      const d = this.spawnEnemy(sx, sz, genome, [], { lifeStage: 'adult', isAdult: true });
      if (this.vfx && typeof this.vfx.spawnBirthEffect === 'function') {
        this.vfx.spawnBirthEffect(new THREE.Vector3(d.x, d.y + 0.5, d.z), false, false, 0x38c172);
      }
      spawned.push(d);
    }

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const sx = Math.cos(rabbitAnchor.angle) * rabbitAnchor.dist + Math.cos(a) * 4.0;
      const sz = Math.sin(rabbitAnchor.angle) * rabbitAnchor.dist + Math.sin(a) * 4.0;
      const genome = this._createSafeGenome('rabbit');
      const r = this.spawnEnemy(sx, sz, genome, [], { lifeStage: 'adult', isAdult: true });
      if (this.vfx && typeof this.vfx.spawnBirthEffect === 'function') {
        this.vfx.spawnBirthEffect(new THREE.Vector3(r.x, r.y + 0.4, r.z), false, false, 0x38c172);
      }
      spawned.push(r);
    }

    // Relieve predator famine pressure now that prey herds are restored
    for (const e of this.enemies) {
      if (e && e.starving) {
        e.starving = false;
      }
    }

    logger.evolution(
      '🦌 Réintroduction Écologique réussie (-25 Biomasse) : 3x Biches Sylvestres et 4x Lapins des Plaines relâchés dans les clairières !',
      { deerSpawned: 3, rabbitsSpawned: 4 }
    );

    return {
      success: true,
      cost,
      deerSpawned: 3,
      rabbitsSpawned: 4,
      spawned,
    };
  }

  /**
   * Creates a fallback Genome object if `Genome.createInitial` is unavailable or returns partial data.
   * @param {string} speciesId - Base species ID.
   * @returns {Object} Genome instance.
   */
  _createSafeGenome(speciesId = 'goblin') {
    const sp = CONFIG.SPECIES[speciesId] || CONFIG.SPECIES.goblin;
    const isPrey = sp.id === 'deer' || sp.id === 'rabbit' || sp.clade === 'herbivore';
    const statMult = isPrey ? 1.0 : this.islandDifficultyMult || 1.0;
    const gen = Math.max(1, this.islandNumber || 1);

    if (Genome && typeof Genome.createInitial === 'function') {
      return Genome.createInitial(speciesId, Math.random, [], {
        generation: gen,
        statMultiplier: statMult,
      });
    }
    return {
      speciesId: sp.id,
      speciesName: sp.name,
      clade: sp.clade || (isPrey ? 'herbivore' : 'beast'),
      isHybrid: false,
      hybridParents: [sp.id, sp.id],
      generation: gen,
      lineageId: `${sp.id}_gen${gen}`,
      aggroStance:
        sp.aggroStance ||
        (isPrey ? 'prey_pacifist' : sp.id === 'dragon' ? 'pacifist_apex' : 'hostile'),
      genes: {
        size: sp.baseSize,
        speed: sp.baseSpeed,
        strength: isPrey ? 0 : +(sp.baseDamage * statMult).toFixed(1),
        maxHp: Math.round(sp.baseHp * statMult),
        gestationTime: sp.baseGestationTime || 18,
        aggressiveness: isPrey ? 0 : (sp.baseAggressiveness ?? 0.7),
        fertility: sp.fertility || 1.0,
        metabolism: sp.metabolism || 4.0,
        aggroRadius: sp.aggroRadius || 18,
      },
      mutations: [],
      fitnessScore: +(1.0 * statMult).toFixed(2),
    };
  }

  /**
   * Injects a dominant mutation into a genome and recalculates its combat/morphological genes.
   * @param {Object} genome - Target genome.
   * @param {string} mutationId - Key from `CONFIG.MUTATIONS`.
   */
  _applyMutationToGenome(genome, mutationId) {
    const mutDef = CONFIG.MUTATIONS?.[mutationId];
    if (!mutDef || !genome) return;

    if (typeof genome.addMutation === 'function') {
      genome.addMutation(mutationId);
      return;
    }

    if (!Array.isArray(genome.mutations)) {
      genome.mutations = [];
    }
    if (!genome.mutations.includes(mutationId)) {
      genome.mutations.push(mutationId);
    }

    if (typeof genome.syncMutations === 'function') {
      genome.syncMutations();
      return;
    }

    const mults = mutDef.statMultipliers || {};
    if (genome.genes) {
      if (mults.maxHp) genome.genes.maxHp = Math.round(genome.genes.maxHp * mults.maxHp);
      if (mults.strength) genome.genes.strength = +(genome.genes.strength * mults.strength).toFixed(1);
      if (mults.speed) genome.genes.speed = +(genome.genes.speed * mults.speed).toFixed(2);
      if (mults.size) genome.genes.size = +(genome.genes.size * mults.size).toFixed(2);
    }
    genome.fitnessScore = (genome.fitnessScore || 1.0) + (mutDef.fitnessBonus || 0.4);
  }

  /**
   * Spawns the initial tribal packs and beast prides across their preferred biomes
   * outside the Bastion safe radius (`42` units), seeds an innate "Patient Zero"
   * Fire Troll (`troll` with `pyro_gland`), spawns breeding herds of Herbivore Prey
   * (`5` `deer` and `6` `rabbit`), and spawns `4` offshore Ocean Sharks (`shark`, `isAquatic: true`)
   * circling in the coastal ocean ring before their beach landing!
   *
   * @param {number} [count=CONFIG.ECO.INITIAL_POPULATION] - Total initial hostile creatures to spawn.
   * @returns {Array<Object>} Spawned enemies.
   */
  spawnInitialPopulation(count = CONFIG.ECO?.INITIAL_POPULATION || 42) {
    const safeRadius = CONFIG.WORLD?.SAFE_SPAWN_RADIUS || 42;
    const maxRadius = (CONFIG.WORLD?.SIZE || 240) * 0.43;

    // 1. Define biome-aligned hostile pack centers around the island
    const packDefinitions = [
      { speciesId: 'goblin', angle: 0.35, dist: 52, size: 5 },
      { speciesId: 'orc', angle: 0.95, dist: 62, size: 5 },
      { speciesId: 'troll', angle: 0.72, dist: 72, size: 4, seedMutant: 'pyro_gland' }, // NE Fire Troll pack!
      { speciesId: 'wolf', angle: 2.1, dist: 55, size: 5 },
      { speciesId: 'lion', angle: 2.75, dist: 66, size: 4 },
      { speciesId: 'goblin', angle: 3.55, dist: 50, size: 5 },
      { speciesId: 'orc', angle: 4.15, dist: 64, size: 4 },
      { speciesId: 'vulture', angle: 4.85, dist: 74, size: 4 },
      { speciesId: 'wolf', angle: 5.5, dist: 58, size: 4 },
      { speciesId: 'dragon', angle: 1.55, dist: 86, size: 2 },
    ];

    let spawnedCount = 0;
    let patientZeroSeeded = false;

    for (const pack of packDefinitions) {
      if (spawnedCount >= count) break;
      const centerDist = clamp(pack.dist, safeRadius + 6, maxRadius);
      const cx = Math.cos(pack.angle) * centerDist;
      const cz = Math.sin(pack.angle) * centerDist;

      for (let i = 0; i < pack.size && spawnedCount < count; i++) {
        const offsetAngle = (i / pack.size) * Math.PI * 2 + Math.random() * 0.4;
        const offsetDist = 4 + Math.random() * 6.5;
        const x = clamp(cx + Math.cos(offsetAngle) * offsetDist, -maxRadius, maxRadius);
        const z = clamp(cz + Math.sin(offsetAngle) * offsetDist, -maxRadius, maxRadius);

        const genome = this._createSafeGenome(pack.speciesId);
        let isPatientZero = false;
        let spawnLifeStage = 'adult';
        let spawnIsAdult = true;

        if (pack.seedMutant && i === 0 && !patientZeroSeeded) {
          this._applyMutationToGenome(genome, pack.seedMutant);
          isPatientZero = true;
          patientZeroSeeded = true;
          genome.isPatientZero = true;
        } else if (pack.seedMutant && i === 1) {
          this._applyMutationToGenome(genome, pack.seedMutant);
          spawnLifeStage = 'baby';
          spawnIsAdult = false;
        }

        const enemy = this.spawnEnemy(x, z, genome, [], {
          isPatientZero,
          lifeStage: spawnLifeStage,
          isAdult: spawnIsAdult,
        });
        if (isPatientZero) {
          logger.evolution(
            `Patient Zéro initial détecté dans l'écosystème : ${genome.speciesName} porteur de [${CONFIG.MUTATIONS[pack.seedMutant]?.name || pack.seedMutant}]`,
            { enemyId: enemy.id, speciesId: genome.speciesId, mutationId: pack.seedMutant, x: Math.round(x), z: Math.round(z) }
          );
        }
        spawnedCount++;
      }
    }

    // Fill any remaining hostile count with small sister-species pairs
    const fallbackSpecies = ['goblin', 'orc', 'wolf', 'lion', 'vulture', 'troll'];
    while (spawnedCount < count) {
      const spId = fallbackSpecies[spawnedCount % fallbackSpecies.length];
      const angle = Math.random() * Math.PI * 2;
      const dist = safeRadius + 8 + Math.random() * (maxRadius - safeRadius - 12);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const genome = this._createSafeGenome(spId);
      this.spawnEnemy(x, z, genome, []);
      spawnedCount++;
    }

    // 2. Spawn Herbivore Prey Herds (`5` Sylvestrian Deer & `6` Plains Rabbits) in forest/meadow clearings
    const preyHerds = [
      { speciesId: 'deer', angle: 1.82, dist: 49, size: 3 },
      { speciesId: 'deer', angle: 5.85, dist: 54, size: 2 },
      { speciesId: 'rabbit', angle: 3.12, dist: 46, size: 3 },
      { speciesId: 'rabbit', angle: 4.52, dist: 48, size: 3 },
    ];
    for (const herd of preyHerds) {
      const hcx = Math.cos(herd.angle) * herd.dist;
      const hcz = Math.sin(herd.angle) * herd.dist;
      for (let i = 0; i < herd.size; i++) {
        const a = (i / herd.size) * Math.PI * 2 + Math.random() * 0.35;
        const r = 3.2 + Math.random() * 3.5;
        const px = hcx + Math.cos(a) * r;
        const pz = hcz + Math.sin(a) * r;
        const preyGenome = this._createSafeGenome(herd.speciesId);
        this.spawnEnemy(px, pz, preyGenome, [], {
          lifeStage: 'adult',
          isAdult: true,
        });
      }
    }

    // 3. Spawn 4 Offshore Ocean Sharks (`isAquatic: true`, `hasLandLegs: false`) swimming around the island coast
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      const oceanDist = 92 + (i % 2) * 5;
      const sx = Math.cos(angle) * oceanDist;
      const sz = Math.sin(angle) * oceanDist;
      const sharkGenome = this._createSafeGenome('shark');
      this.spawnEnemy(sx, sz, sharkGenome, [], {
        lifeStage: 'adult',
        isAdult: true,
        isAquatic: true,
        hasLandLegs: false,
      });
    }

    logger.info('ECO', `Population initiale générée : ${this.enemies.length} créatures (meutes + troupeaux de Biches/Lapins + Requins au large).`, {
      count: this.enemies.length,
    });

    return this.enemies;
  }

  /**
   * Computes species-tuned maturation duration in seconds for a juvenile creature.
   * @param {string} speciesId
   * @returns {number}
   */
  _getMaturationTime(speciesId) {
    const spDef = CONFIG.SPECIES?.[speciesId];
    if (spDef && typeof spDef.baseMaturationTime === 'number') {
      return spDef.baseMaturationTime;
    }
    const speciesTimes = {
      rabbit: 8,
      goblin: 12,
      deer: 14,
      wolf: 15,
      vulture: 17,
      giant_mole: 19,
      shark: 20,
      orc: 22,
      lion: 26,
      troll: 34,
      dragon: 50,
    };
    return speciesTimes[speciesId] || CONFIG.ECO?.MATURATION_TIME || 20;
  }

  /**
   * Computes species-tuned adult gestation duration in seconds between reproductions.
   * @param {string} speciesId
   * @returns {number}
   */
  _getGestationTime(speciesId) {
    const spDef = CONFIG.SPECIES?.[speciesId];
    if (spDef && typeof spDef.baseGestationTime === 'number') {
      return spDef.baseGestationTime;
    }
    const gestationTimes = {
      rabbit: 8,
      goblin: 9,
      wolf: 13,
      deer: 14,
      vulture: 15,
      orc: 18,
      giant_mole: 19,
      shark: 20,
      lion: 24,
      troll: 30,
      dragon: 65,
    };
    return gestationTimes[speciesId] || 18;
  }

  /**
   * Spawns a single enemy creature in the world with articulated genome-driven 3D morphology.
   * Supports both Adult (`lifeStage: 'adult'`, `isAdult: true`) and Juvenile Baby
   * (`lifeStage: 'baby'`, `isAdult: false`, `0.5x` 3D scale, `0.55x` HP/damage, cannot reproduce),
   * individual `gestationTime` & `reproTimer`, species `aggressiveness` & `aggroStance`,
   * offshore Ocean vs Amphibious Land-Shark modes (`isAquatic`, `hasLandLegs`), and Herbivore Prey (`prey_pacifist`).
   *
   * @param {number} x - World X position.
   * @param {number} z - World Z position.
   * @param {Object} genome - Creature Genome object.
   * @param {Array<string|number>} [parentIds=[]] - Parent IDs if born from crossover.
   * @param {Object} [options={}] - Additional spawn flags (`isPatientZero`, `spottedByScout`, `lifeStage`, `isAdult`, `age`, `gestationTime`, `reproTimer`, `aggressiveness`, `aggroStance`, `isAquatic`, `hasLandLegs`, `isAmphibiousLanded`).
   * @returns {Object} Spawned enemy entity.
   */
  spawnEnemy(x, z, genome, parentIds = [], options = {}) {
    const safeGenome = genome || this._createSafeGenome('goblin');
    const spDef = CONFIG.SPECIES[safeGenome.speciesId] || CONFIG.SPECIES.goblin;
    const genes = safeGenome.genes || {};

    if (!safeGenome.generation || safeGenome.generation < (this.islandNumber || 1)) {
      safeGenome.generation = Math.max(safeGenome.generation || 1, this.islandNumber || 1);
    }

    // Ensure hybrid metadata is populated if hybrid
    if (safeGenome.isHybrid && Array.isArray(safeGenome.hybridParents) && safeGenome.hybridParents.length >= 2) {
      const hybridSpec = createHybridSpec(safeGenome.hybridParents[0], safeGenome.hybridParents[1]);
      if (hybridSpec && !safeGenome.speciesName) {
        safeGenome.speciesName = hybridSpec.name;
      }
    }
    if (!safeGenome.speciesName) {
      safeGenome.speciesName = spDef.name || safeGenome.speciesId;
    }

    const mutations = Array.isArray(safeGenome.mutations) ? safeGenome.mutations : [];
    const isPatientZero = Boolean(
      options.isPatientZero ||
        safeGenome.isPatientZero ||
        (mutations.length > 0 && mutations.some((m) => !this.seenMutations.has(m)))
    );

    for (const mutId of mutations) {
      this.seenMutations.add(mutId);
    }

    const isPrey =
      safeGenome.speciesId === 'deer' ||
      safeGenome.speciesId === 'rabbit' ||
      safeGenome.clade === 'herbivore' ||
      spDef.clade === 'herbivore' ||
      safeGenome.aggroStance === 'prey_pacifist' ||
      spDef.aggroStance === 'prey_pacifist';

    const isAquatic = Boolean(options.isAquatic);
    const hasLandLegs =
      options.hasLandLegs !== undefined
        ? Boolean(options.hasLandLegs)
        : safeGenome.speciesId === 'shark'
          ? !isAquatic
          : true;
    const isAmphibiousLanded = Boolean(
      options.isAmphibiousLanded || (safeGenome.speciesId === 'shark' && hasLandLegs && !isAquatic)
    );

    const id = `enemy_${this.nextEnemyId++}`;
    const waterLevel = CONFIG.WORLD?.WATER_LEVEL ?? -0.5;
    const y = isAquatic
      ? waterLevel - 0.15
      : this.terrain
        ? this.terrain.getHeightAt(x, z)
        : 0;

    // Determine juvenile ('baby') vs 'adult' lifecycle stage
    const isNewborn = parentIds && parentIds.length > 0;
    const lifeStage =
      options.lifeStage || (options.isAdult === false || isNewborn ? 'baby' : 'adult');
    const isAdult = lifeStage === 'adult';
    const maturationTime = options.maturationTime || this._getMaturationTime(safeGenome.speciesId);
    const age = typeof options.age === 'number' ? options.age : isAdult ? maturationTime : 0;

    // Individual gestation duration & reproduction timer
    const gestationTime = Number(
      (
        options.gestationTime ||
        genes.gestationTime ||
        this._getGestationTime(safeGenome.speciesId)
      ).toFixed(2)
    );
    const reproTimer =
      typeof options.reproTimer === 'number'
        ? options.reproTimer
        : isAdult
          ? Number((gestationTime * (0.25 + Math.random() * 0.45)).toFixed(2))
          : 0;

    // Aggressiveness gene & stance ('hostile' | 'territorial' | 'pacifist_apex' | 'prey_pacifist')
    const speciesWrathActive = !isPrey && this.isSpeciesProvoked(safeGenome.speciesId);
    const enraged = Boolean(!isPrey && (options.enraged || speciesWrathActive));
    const aggressiveness = isPrey
      ? 0.0
      : enraged
        ? 1.0
        : typeof options.aggressiveness === 'number'
          ? options.aggressiveness
          : Number((genes.aggressiveness ?? spDef.baseAggressiveness ?? 0.7).toFixed(3));
    const aggroStance = isPrey
      ? 'prey_pacifist'
      : enraged
        ? 'hostile'
        : options.aggroStance ||
          safeGenome.aggroStance ||
          spDef.aggroStance ||
          (safeGenome.speciesId === 'dragon' ? 'pacifist_apex' : 'hostile');

    const adultMaxHp = Math.round(genes.maxHp || spDef.baseHp || 60);
    const adultDamage = isPrey ? 0 : +(genes.strength ?? spDef.baseDamage ?? 10).toFixed(1);
    const babyStatMult = CONFIG.ECO?.BABY_STAT_MULT || 0.55;

    const baseCalculatedMaxHp = isAdult ? adultMaxHp : Math.max(12, Math.round(adultMaxHp * babyStatMult));
    const baseCalculatedDamage = isPrey
      ? 0
      : isAdult
        ? adultDamage
        : +(adultDamage * babyStatMult).toFixed(1);
    const baseCalculatedSpeed = +(genes.speed || spDef.baseSpeed || 6.5).toFixed(2);

    const maxHp = typeof options.hpOverride === 'number' ? options.hpOverride : baseCalculatedMaxHp;
    const damage = typeof options.damageOverride === 'number' ? options.damageOverride : baseCalculatedDamage;
    const speed = typeof options.speedOverride === 'number'
      ? options.speedOverride
      : enraged
        ? +(baseCalculatedSpeed * 1.25).toFixed(2)
        : baseCalculatedSpeed;

    let mesh = null;
    if (this.scene) {
      mesh = buildCreatureMesh({
        type: 'enemy',
        speciesId: safeGenome.speciesId,
        genome: safeGenome,
        isPatientZero,
        lifeStage,
        isAdult,
        hasLandLegs,
        isAquatic,
      });
      if (safeGenome.speciesId === 'shark') {
        setSharkAmphibiousMode(mesh, hasLandLegs);
      }
      mesh.position.set(x, isAquatic ? waterLevel - 0.15 : Math.max(y, waterLevel + 0.2), z);
      mesh.userData.enemyId = id;
      this.scene.add(mesh);
    }

    const enemy = {
      id,
      x,
      z,
      y,
      vx: 0,
      vz: 0,
      hp: maxHp,
      maxHp,
      adultMaxHp,
      damage,
      adultDamage,
      speed,
      genome: safeGenome,
      parentIds,
      lifeStage,
      isAdult,
      age,
      maturationTime,
      gestationTime,
      reproTimer,
      aggressiveness,
      aggroStance,
      enraged,
      isAquatic,
      hasLandLegs,
      isAmphibiousLanded,
      isPrey,
      _wrathSpeedApplied: enraged,
      starving: false,
      lonely: false,
      spottedByScout: Boolean(options.spottedByScout),
      isPatientZero,
      tutorialTag: options.tutorialTag || null,
      xpRewardOverride: typeof options.xpRewardOverride === 'number' ? options.xpRewardOverride : null,
      aggroBastionForced: Boolean(options.aggroBastionForced || enraged),
      freezeMaturationAt80: Boolean(options.freezeMaturationAt80),
      mesh,
      position: mesh ? mesh.position : new THREE.Vector3(x, y, z),
      state: isPrey ? 'graze' : isAquatic ? 'swim' : enraged ? 'wrath_raid' : 'patrol',
      targetId: null,
      attackCooldown: 0,
      hitFlash: 0,
      burnTimer: 0,
      burnDps: 0,
      poisonTimer: 0,
      poisonDps: 0,
      slowTimer: 0,
      slowFactor: 1.0,
      stunTimer: 0,
      dotTickTimer: 0,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 1.5 + Math.random() * 3.0,
      homeX: x,
      homeZ: z,
    };

    enemy.applyBurn = (dps = 8, duration = 4.0) => {
      enemy.burnDps = Math.max(enemy.burnDps || 0, dps);
      enemy.burnTimer = Math.max(enemy.burnTimer || 0, duration);
    };
    enemy.applyPoison = (dps = 7, duration = 5.0) => {
      enemy.poisonDps = Math.max(enemy.poisonDps || 0, dps);
      enemy.poisonTimer = Math.max(enemy.poisonTimer || 0, duration);
    };
    enemy.applySlow = (factor = 0.5, duration = 4.5) => {
      enemy.slowFactor = Math.min(enemy.slowFactor || 1.0, clamp(factor, 0.2, 0.9));
      enemy.slowTimer = Math.max(enemy.slowTimer || 0, duration);
    };
    enemy.applyStun = (duration = 1.6) => {
      enemy.stunTimer = Math.max(enemy.stunTimer || 0, duration);
    };

    this.enemies.push(enemy);
    return enemy;
  }

  /**
   * Applies elemental/crowd-control status effects (Burn DoT, Poison DoT, Cryo Slow, Stun)
   * to an enemy from hero roguelike abilities (`pyro_nova`, `frost_spear`, `venom_volley`, `seismic_slam`, `meteor_strike`).
   *
   * @param {string|Object} enemyIdOrObj - Enemy ID or enemy object.
   * @param {Object} [statusSpec={}] - `{ burnDps, burnDuration, poisonDps, poisonDuration, slowFactor, slowDuration, stunDuration }`.
   * @returns {boolean} True if applied.
   */
  applyEnemyStatus(enemyIdOrObj, statusSpec = {}) {
    const targetId = typeof enemyIdOrObj === 'object' ? enemyIdOrObj?.id : enemyIdOrObj;
    const enemy = this.enemies.find((e) => e.id === targetId);
    if (!enemy || enemy.hp <= 0) return false;

    if (statusSpec.burnDuration > 0 && statusSpec.burnDps > 0) {
      enemy.applyBurn(statusSpec.burnDps, statusSpec.burnDuration);
    }
    if (statusSpec.poisonDuration > 0 && statusSpec.poisonDps > 0) {
      enemy.applyPoison(statusSpec.poisonDps, statusSpec.poisonDuration);
    }
    if (statusSpec.slowDuration > 0) {
      enemy.applySlow(statusSpec.slowFactor ?? 0.5, statusSpec.slowDuration);
    }
    if (statusSpec.stunDuration > 0) {
      enemy.applyStun(statusSpec.stunDuration);
    }
    return true;
  }

  /**
   * Act 2A Tutorial Spawner: Spawns a single slow, low-HP "Gobelin Égaré" near the Bastion
   * so the player can practice the melee Cleave Attack (`Clic Gauche` / `[Espace]`).
   * @param {number} [x=12]
   * @param {number} [z=8]
   * @returns {Object} Spawned Goblin entity.
   */
  spawnTutorialGoblin(x = 12, z = 8) {
    const genome = this._createSafeGenome('goblin');
    genome.speciesName = 'Gobelin Égaré';
    const goblin = this.spawnEnemy(x, z, genome, [], {
      hpOverride: 34,
      damageOverride: 3.5,
      speedOverride: 4.0,
      xpRewardOverride: 25,
      tutorialTag: 'act2_goblin',
    });
    logger.info('COMBAT', `Acte 2A : [Gobelin Égaré] apparu en (${Math.round(x)}, ${Math.round(z)}).`);
    return goblin;
  }

  /**
   * Act 2B Tutorial Spawner: Spawns an "Orc Maraudeur" whose defeat awards enough XP (`105 XP`)
   * to trigger Level 2 and open the Roguelike Upgrade Modal in Act 2C.
   * @param {number} [x=-14]
   * @param {number} [z=10]
   * @returns {Object} Spawned Orc entity.
   */
  spawnTutorialOrc(x = -14, z = 10) {
    const genome = this._createSafeGenome('orc');
    genome.speciesName = 'Orc Maraudeur';
    const orc = this.spawnEnemy(x, z, genome, [], {
      hpOverride: 72,
      damageOverride: 7.0,
      speedOverride: 5.2,
      xpRewardOverride: 105,
      tutorialTag: 'act2_orc',
    });
    logger.info('COMBAT', `Acte 2B : [Orc Maraudeur] apparu en (${Math.round(x)}, ${Math.round(z)}).`);
    return orc;
  }

  /**
   * Act 4 Tutorial Spawner: Spawns 2 Goblin Raiders charging directly toward the Bastion
   * so the newly built Watchtower (`Tour de Guet`) shoots them down automatically.
   * @returns {Array<Object>} The 2 spawned Raider entities.
   */
  spawnTutorialRaiders() {
    const coords = [
      { x: -25, z: -20 },
      { x: -21, z: -24 },
    ];
    const raiders = [];
    for (const c of coords) {
      const genome = this._createSafeGenome('goblin');
      genome.speciesName = 'Pillard Gobelin';
      const raider = this.spawnEnemy(c.x, c.z, genome, [], {
        hpOverride: 30,
        damageOverride: 4.0,
        speedOverride: 5.5,
        aggroBastionForced: true,
        tutorialTag: 'act4_raider',
      });
      raiders.push(raider);
    }
    logger.alert('⚠️ Acte 4 : 2 Pillards Gobelins chargent le Bastion ! La Tour de Guet engage le feu !');
    return raiders;
  }

  /**
   * Act 6 Tutorial Spawner: Spawns the Juvenile Baby Fire Troll (`Patient Zéro Juvénile`,
   * `pyro_gland`, `lifeStage: 'baby'`, `isAdult: false`) at `{ x: 46, z: -46 }` with maturation
   * frozen at 80% until the player approaches within 14m, guaranteeing the player experiences
   * hunting a juvenile Patient Zero before adulthood!
   * @param {number} [x=46]
   * @param {number} [z=-46]
   * @returns {Object} Spawned Juvenile Patient Zero entity.
   */
  spawnTutorialBabyFireTroll(x = 46, z = -46) {
    const genome = this._createSafeGenome('troll');
    this._applyMutationToGenome(genome, 'pyro_gland');
    genome.isPatientZero = true;

    const babyTroll = this.spawnEnemy(x, z, genome, ['wild_parent_a', 'wild_parent_b'], {
      isPatientZero: true,
      lifeStage: 'baby',
      isAdult: false,
      age: 4,
      maturationTime: 36,
      freezeMaturationAt80: true,
      xpRewardOverride: 120,
      tutorialTag: 'act6_baby_fire_troll',
    });

    if (this.vfx && typeof this.vfx.spawnBirthEffect === 'function') {
      this.vfx.spawnBirthEffect(
        new THREE.Vector3(babyTroll.x, babyTroll.y + 0.5, babyTroll.z),
        true,
        false,
        0xff4500
      );
    }

    logger.evolution(
      `Acte 6 : Apparition d'un Patient Zéro Juvénile [Troll — Glande Pyroclastique] (Stade: BÉBÉ) en (${Math.round(x)}, ${Math.round(z)}) !`,
      { enemyId: babyTroll.id, lifeStage: babyTroll.lifeStage, x: Math.round(x), z: Math.round(z) }
    );
    return babyTroll;
  }

  /**
   * Act 7 / Skip Tutorial (`[P]`): Unpauses background Conway Eco-Ticks and populates the island
   * with full wild packs if not already populated.
   * @param {number} [count=CONFIG.ECO.INITIAL_POPULATION]
   */
  startOpenSurvivalMode(count = CONFIG.ECO?.INITIAL_POPULATION || 42) {
    this.tutorialMode = false;
    this.ecoPaused = false;
    if (this.enemies.length < 12) {
      this.spawnInitialPopulation(count);
    }
    logger.alert('🌍 Mode Survie Ouvert activé : Cycles Éco-Tick en temps réel et meutes sauvages déployées !');
  }

  /**
   * Pacifies or purges hostile creatures when the Planetary Island Shield Dome is activated (`activateIslandShield`),
   * leaving peaceful Herbivore Prey (`deer`/`rabbit`) and calmed Dragons in the sanctuary.
   *
   * @returns {{ purgedHostiles: number, survivingPeaceful: number }}
   */
  pacifyAllEnemiesWithIslandShield() {
    this.islandShieldActive = true;
    this.ecoPaused = true;
    this.speciesWrath.clear();

    let purgedHostiles = 0;
    let survivingPeaceful = 0;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e) continue;
      if (e.isPrey || e.genome?.speciesId === 'dragon') {
        e.enraged = false;
        e.aggroBastionForced = false;
        e.aggroStance = e.isPrey ? 'prey_pacifist' : 'pacifist_apex';
        e.aggressiveness = 0;
        e.state = e.isPrey ? 'graze' : 'patrol';
        survivingPeaceful++;
      } else {
        if (this.vfx && typeof this.vfx.setPatientZeroBeacon === 'function' && e.mesh) {
          this.vfx.setPatientZeroBeacon(e.id, e.mesh.position, 0x000000, false);
        }
        if (this.vfx && typeof this.vfx.spawnDeathExplosion === 'function') {
          this.vfx.spawnDeathExplosion(new THREE.Vector3(e.x, e.y + 0.6, e.z), 0x38bdf8, 8);
        }
        if (e.mesh && this.scene) {
          this.scene.remove(e.mesh);
        }
        this.enemies.splice(i, 1);
        purgedHostiles++;
      }
    }

    logger.alert(
      `🛡️ Dôme Planétaire : ${purgedHostiles} prédateurs/mutants hostiles purgés par l'onde de choc sacrée (${survivingPeaceful} créatures pacifiques préservées).`,
      { purgedHostiles, survivingPeaceful }
    );

    return { purgedHostiles, survivingPeaceful };
  }

  /**
   * Resets and repopulates the island ecosystem for the Next Island (`islandNumber >= 2`),
   * scaling enemy difficulty, mutation rate, and initial Patient Zero carriers according to `getIslandTierSpec(islandNumber)`.
   *
   * @param {number} [islandNumber=2]
   * @param {number} [count=CONFIG.ECO.INITIAL_POPULATION]
   * @returns {{ islandNumber: number, tierSpec: Object, enemiesSpawned: number, patientZerosSpawned: number }}
   */
  startNextIslandEcosystem(islandNumber = 2, count = CONFIG.ECO?.INITIAL_POPULATION || 42) {
    this.islandNumber = Math.max(1, Math.floor(islandNumber));
    const tierSpec = getIslandTierSpec(this.islandNumber);
    this.islandDifficultyMult = tierSpec.enemyStatMultiplier || 1 + (this.islandNumber - 1) * 0.35;
    this.islandShieldActive = false;
    this.tutorialMode = false;
    this.ecoPaused = false;

    this.clearAllEnemies();
    this.seenMutations.clear();
    this.survivalElapsedTime = 0;
    this.sharksLanded = false;
    this.molesErupted = false;
    this.sharkReinforceTimer = 0;
    this.moleReinforceTimer = 0;
    if (this.repopulationTimers && typeof this.repopulationTimers === 'object') {
      for (const k of Object.keys(this.repopulationTimers)) {
        this.repopulationTimers[k] = 0;
      }
    }

    if (this.ecoSim && typeof this.ecoSim.resetForNextIsland === 'function') {
      this.ecoSim.resetForNextIsland(this.islandNumber, tierSpec);
    }

    const scaledCount = Math.min(
      CONFIG.ECO?.MAX_WORLD_POPULATION || 130,
      Math.round(count * (1 + Math.min(0.45, (this.islandNumber - 1) * 0.12)))
    );
    this.spawnInitialPopulation(scaledCount);

    // Spawn additional innate Patient Zeros for higher island tiers (Island 2 => 3 Patient Zeros, Island 3+ => 4 Patient Zeros)
    const targetPZ = Math.max(1, tierSpec.initialMutantCount || tierSpec.initialPatientZeroCount || 2);
    const extraPZCount = Math.max(0, targetPZ - 1);
    const mutPool = ['venom_sacs', 'osteo_plating', 'cryo_blood', 'vampiric_maw', 'titan_growth', 'winged_leap'];
    const spPool = ['orc', 'lion', 'wolf', 'troll', 'vulture'];
    let extraSpawned = 0;

    for (let i = 0; i < extraPZCount; i++) {
      const mutId = mutPool[(this.islandNumber + i) % mutPool.length];
      const spId = spPool[(this.islandNumber + i) % spPool.length];
      this.forceSpawnMutant(mutId, spId);
      extraSpawned++;
    }

    logger.alert(
      `⛵ Expédition vers l'Île #${this.islandNumber} (${tierSpec.name}) : Écosystème de génération ${this.islandNumber} déployé (Difficulté x${this.islandDifficultyMult.toFixed(2)}, ${1 + extraSpawned} Patients Zéro initiaux) !`,
      {
        islandNumber: this.islandNumber,
        tierName: tierSpec.name,
        difficultyMult: this.islandDifficultyMult,
        enemiesSpawned: this.enemies.length,
        patientZerosSpawned: 1 + extraSpawned,
      }
    );

    if (typeof this.onIslandTransitioned === 'function') {
      this.onIslandTransitioned(tierSpec, this);
    }

    return {
      islandNumber: this.islandNumber,
      tierSpec,
      enemiesSpawned: this.enemies.length,
      patientZerosSpawned: 1 + extraSpawned,
    };
  }

  /**
   * Transitions a juvenile ('baby') creature into a reproductive 'adult'.
   * Restores full adult maxHp, damage, and 1.0x 3D scale.
   * @param {Object} enemy
   */
  _matureEnemyToAdult(enemy) {
    if (!enemy || enemy.isAdult) return;
    const hpRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
    enemy.lifeStage = 'adult';
    enemy.isAdult = true;
    enemy.maxHp = enemy.adultMaxHp || enemy.maxHp;
    enemy.hp = Math.max(1, Math.round(enemy.maxHp * hpRatio));
    enemy.damage = enemy.adultDamage || enemy.damage;

    if (enemy.mesh) {
      updateCreatureOverlay(
        enemy.mesh,
        enemy.hp,
        enemy.maxHp,
        enemy.isPatientZero,
        enemy.spottedByScout,
        false,
        1.0
      );
    }

    if (Array.isArray(enemy.genome?.mutations) && enemy.genome.mutations.length > 0) {
      const mutName = CONFIG.MUTATIONS?.[enemy.genome.mutations[0]]?.name || enemy.genome.mutations[0];
      logger.evolution(
        `Maturation : Le juvénile ${enemy.genome.speciesName} [${mutName}] est devenu ADULTE et peut désormais se reproduire !`,
        { enemyId: enemy.id, speciesName: enemy.genome.speciesName, mutations: enemy.genome.mutations }
      );
    }
  }

  /**
   * Forces the immediate spawn of a mutant Patient Zero (e.g. a Fire Troll with `pyro_gland`)
   * along with 2 packmates so the user or `--dry-run` can test Scout discovery and dominant
   * mutation inheritance on demand.
   *
   * @param {string} [mutationId='pyro_gland'] - Mutation ID from `CONFIG.MUTATIONS`.
   * @param {string} [speciesId='troll'] - Base species ID from `CONFIG.SPECIES`.
   * @param {{x: number, z: number}|null} [nearPos=null] - Optional custom coordinates.
   * @returns {Object} The spawned Patient Zero enemy entity.
   */
  forceSpawnMutant(mutationId = 'pyro_gland', speciesId = 'troll', nearPos = null) {
    let x;
    let z;
    if (nearPos && typeof nearPos.x === 'number' && typeof nearPos.z === 'number') {
      x = nearPos.x;
      z = nearPos.z;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const dist = 58 + Math.random() * 24;
      x = Math.cos(angle) * dist;
      z = Math.sin(angle) * dist;
    }

    const genome = this._createSafeGenome(speciesId);
    this._applyMutationToGenome(genome, mutationId);
    genome.isPatientZero = true;

    const mutantEnemy = this.spawnEnemy(x, z, genome, [], {
      isPatientZero: true,
      lifeStage: 'adult',
      isAdult: true,
    });

    // Ensure at least 2 same-species adult neighbors are nearby so Conway's optimal density (2..5) is met
    const nearbyCount = this.enemies.filter(
      (e) => e.id !== mutantEnemy.id && dist2D(e.x, e.z, x, z) <= (CONFIG.ECO?.NEIGHBOR_RADIUS || 22)
    ).length;

    if (nearbyCount < 2) {
      for (let i = 0; i < 2 - nearbyCount; i++) {
        const mateGenome = this._createSafeGenome(speciesId);
        const a = Math.random() * Math.PI * 2;
        const mx = x + Math.cos(a) * 7;
        const mz = z + Math.sin(a) * 7;
        this.spawnEnemy(mx, mz, mateGenome, [], { lifeStage: 'adult', isAdult: true });
      }
    }

    const mutName = CONFIG.MUTATIONS?.[mutationId]?.name || mutationId;
    if (this.vfx && typeof this.vfx.spawnBirthEffect === 'function') {
      this.vfx.spawnBirthEffect(
        new THREE.Vector3(mutantEnemy.x, mutantEnemy.y + 0.5, mutantEnemy.z),
        true,
        false,
        CONFIG.MUTATIONS?.[mutationId]?.colorHex || 0xff4500
      );
    }

    logger.evolution(
      `Apparition de Patient Zéro : ${mutantEnemy.genome.speciesName} [${mutName}] en (${Math.round(x)}, ${Math.round(z)}) !`,
      { enemyId: mutantEnemy.id, speciesId, mutationId, x: Math.round(x), z: Math.round(z) }
    );

    return mutantEnemy;
  }

  /**
   * Spawns a dedicated pack of mutant carriers (`carrierCount` creatures: 1 Adult Patient Zero +
   * `carrierCount - 1` Juvenile Babies/Adults) in the wilderness (`58..86` units from center,
   * initially `spottedByScout: false`) for Dynamic Lineage Eradication Quests!
   *
   * @param {string} [mutationId='pyro_gland']
   * @param {string} [speciesId='troll']
   * @param {number} [carrierCount=3]
   * @returns {Array<Object>} Array of spawned mutant carrier entities.
   */
  spawnQuestLineagePack(mutationId = 'pyro_gland', speciesId = 'troll', carrierCount = 3) {
    const baseAngle = Math.random() * Math.PI * 2;
    const baseDist = 62 + Math.random() * 20;
    const cx = Math.cos(baseAngle) * baseDist;
    const cz = Math.sin(baseAngle) * baseDist;
    const spawned = [];

    for (let i = 0; i < Math.max(1, carrierCount); i++) {
      const a = (i / Math.max(1, carrierCount)) * Math.PI * 2 + Math.random() * 0.4;
      const r = i === 0 ? 0 : 5 + Math.random() * 7;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;

      const genome = this._createSafeGenome(speciesId);
      this._applyMutationToGenome(genome, mutationId);
      const isPZ = i === 0;
      if (isPZ) {
        genome.isPatientZero = true;
      }

      const isBaby = i > 0;
      const carrier = this.spawnEnemy(x, z, genome, [], {
        isPatientZero: isPZ,
        spottedByScout: Boolean(this.bastionRef?.autoSpotNewbornMutants),
        lifeStage: isBaby ? 'baby' : 'adult',
        isAdult: !isBaby,
      });
      spawned.push(carrier);
    }

    const mutName = CONFIG.MUTATIONS?.[mutationId]?.name || mutationId;
    logger.evolution(
      `Nouvelle meute mutante détectée pour Quête d'Éradication : ${spawned.length}x ${CONFIG.SPECIES?.[speciesId]?.name || speciesId} [${mutName}] !`,
      { mutationId, speciesId, count: spawned.length }
    );
    return spawned;
  }

  /**
   * Computes live tracking progress for a target mutant lineage across all living enemies.
   *
   * @param {string|null} [targetMutationId='pyro_gland']
   * @returns {{
   *   mutationId: string|null,
   *   totalCarriers: number,
   *   spottedCarriers: number,
   *   unspottedCarriers: number,
   *   babyCarriers: number,
   *   adultCarriers: number,
   *   allSpotted: boolean,
   *   carriers: Array<Object>
   * }}
   */
  getLineageTrackingProgress(targetMutationId = 'pyro_gland') {
    const carriers = this.enemies.filter((e) => {
      if (!e || e.hp <= 0) return false;
      const muts = Array.isArray(e.genome?.mutations) ? e.genome.mutations : [];
      if (!targetMutationId) {
        return muts.length > 0 || Boolean(e.genome?.isHybrid);
      }
      return muts.includes(targetMutationId) || e.genome?.speciesId === targetMutationId;
    });

    const totalCarriers = carriers.length;
    const spottedCarriers = carriers.filter((e) => e.spottedByScout).length;
    const unspottedCarriers = Math.max(0, totalCarriers - spottedCarriers);
    const babyCarriers = carriers.filter((e) => !e.isAdult || e.lifeStage === 'baby').length;
    const adultCarriers = Math.max(0, totalCarriers - babyCarriers);

    return {
      mutationId: targetMutationId,
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
   * Executes one Conway's Game of Life + Darwinian genetic reproduction cycle across the island.
   * All newborn offspring start as Juvenile Babies (`lifeStage: 'baby'`, `isAdult: false`, `age: 0`)
   * and cannot reproduce until they mature into Adults!
   *
   * @returns {Object} Summary of the Eco-Tick result.
   */
  triggerEcoTick() {
    // If triggerEcoTick was called manually (button / dry-run) before a full timer elapsed,
    // advance juvenile ages by the remaining tick interval so babies mature across manual ticks.
    const unelapsed = Math.max(0, this.ecoTickInterval - this.ecoTickTimer);
    if (unelapsed > 1.0) {
      for (const e of this.enemies) {
        e.age = (e.age || 0) + unelapsed;
        if (!e.isAdult && e.age >= (e.maturationTime || 20)) {
          this._matureEnemyToAdult(e);
        }
      }
    }

    // Check wild species repopulation across manual / periodic Eco-Ticks
    if (!this.tutorialMode) {
      this.checkAndRepopulateSpecies(unelapsed > 1.0 ? unelapsed : this.ecoTickInterval, false);
    }

    this.ecoTickTimer = 0;
    this.timeUntilNextTick = this.ecoTickInterval;
    this.ecoTickProgress = 0;

    if (!this.ecoSim || typeof this.ecoSim.stepEcoTick !== 'function') {
      return { tickNumber: 0, births: [], starvingIds: [], lonelyIds: [] };
    }

    const result = this.ecoSim.stepEcoTick(this.enemies, (x, z) =>
      this.terrain ? this.terrain.getBiomeAt(x, z) : 'plains'
    );

    // Synchronize starving & lonely sets if returned as ID collections
    if (result.starvingIds) {
      const starvingSet =
        result.starvingIds instanceof Set ? result.starvingIds : new Set(result.starvingIds);
      for (const e of this.enemies) {
        e.starving = e.isPrey || e.isAquatic ? false : starvingSet.has(e.id);
      }
    }
    if (result.lonelyIds) {
      const lonelySet = result.lonelyIds instanceof Set ? result.lonelyIds : new Set(result.lonelyIds);
      for (const e of this.enemies) {
        e.lonely = lonelySet.has(e.id);
      }
    }

    // Spawn newborn offspring as Juvenile Babies ('baby') up to world population cap
    const maxPop = CONFIG.ECO?.MAX_WORLD_POPULATION || 130;
    const births = Array.isArray(result.births) ? result.births : [];
    const spawnedOffspring = [];

    for (const birth of births) {
      if (this.enemies.length >= maxPop) break;
      const bx = typeof birth.x === 'number' ? birth.x : 0;
      const bz = typeof birth.z === 'number' ? birth.z : 0;
      const childGenome = birth.genome || this._createSafeGenome(birth.speciesId || 'goblin');
      const parentIds = birth.parentIds || ['parent_a', 'parent_b'];

      const hasMut = Array.isArray(childGenome.mutations) && childGenome.mutations.length > 0;
      const isHyb = Boolean(childGenome.isHybrid);

      // Inherit Scout-spotted status if a parent was already tracked OR if Scout Guild Lv3 auto-spots newborn mutants
      const parentSpotted =
        Boolean(this.bastionRef?.autoSpotNewbornMutants && (hasMut || isHyb)) ||
        this.enemies.some((e) => parentIds.includes(e.id) && e.spottedByScout);

      const child = this.spawnEnemy(bx, bz, childGenome, parentIds, {
        isPatientZero: Boolean(birth.isPatientZero),
        spottedByScout: parentSpotted,
        lifeStage: 'baby',
        isAdult: false,
        age: 0,
        isAquatic: false,
        hasLandLegs: true,
      });
      spawnedOffspring.push(child);

      const mutHex = hasMut
        ? CONFIG.MUTATIONS?.[childGenome.mutations[0]]?.colorHex || 0xff4500
        : isHyb
          ? 0x48dbfb
          : 0x44ff88;

      if (this.vfx && typeof this.vfx.spawnBirthEffect === 'function') {
        this.vfx.spawnBirthEffect(
          new THREE.Vector3(child.x, child.y + 0.5, child.z),
          hasMut,
          isHyb,
          mutHex
        );
      }

      if (child.spottedByScout && (hasMut || isHyb) && this.vfx?.setPatientZeroBeacon) {
        this.vfx.setPatientZeroBeacon(child.id, child.mesh ? child.mesh.position : child.position, mutHex, true);
      }
    }

    // Refresh beacons for all spotted mutants/hybrids
    for (const enemy of this.enemies) {
      const hasMut = Array.isArray(enemy.genome?.mutations) && enemy.genome.mutations.length > 0;
      if (enemy.spottedByScout && (hasMut || enemy.genome?.isHybrid || enemy.isPatientZero)) {
        const mutId = hasMut ? enemy.genome.mutations[0] : null;
        const colorHex = mutId ? CONFIG.MUTATIONS?.[mutId]?.colorHex || 0xff3300 : 0xff3300;
        if (this.vfx && typeof this.vfx.setPatientZeroBeacon === 'function' && enemy.mesh) {
          this.vfx.setPatientZeroBeacon(enemy.id, enemy.mesh.position, colorHex, true);
        }
      }
    }

    return {
      ...result,
      spawnedOffspring,
    };
  }

  /**
   * Attempts an immediate individual gestation birth for fast-breeding species (e.g. Goblins at `9s`
   * or Rabbits at `8s` gestation) when `parentA.reproTimer >= parentA.gestationTime` in real time and a compatible
   * adult mate in Conway's optimal density window (`2..6` neighbors) is nearby.
   *
   * @param {Object} parentA
   * @returns {Object|null} Spawned baby entity or `null`.
   * @private
   */
  _tryIndividualGestationBirth(parentA) {
    if (!parentA || !parentA.isAdult || parentA.starving || parentA.lonely || parentA.isAquatic) return null;
    const maxPop = CONFIG.ECO?.MAX_WORLD_POPULATION || 130;
    if (this.enemies.length >= maxPop) return null;

    const neighborRadius = CONFIG.ECO?.NEIGHBOR_RADIUS || 22;
    const minDensity = CONFIG.ECO?.MIN_DENSITY || 2;
    const maxDensity = CONFIG.ECO?.MAX_DENSITY || 6;

    let neighborCount = 0;
    let bestMate = null;
    let bestFitness = -Infinity;

    for (const other of this.enemies) {
      if (!other || other.id === parentA.id || other.hp <= 0 || other.isAquatic) continue;
      const d = dist2D(parentA.x, parentA.z, other.x, other.z);
      if (d <= neighborRadius) {
        neighborCount++;
        const otherReady =
          other.isAdult &&
          !other.starving &&
          (other.reproTimer || 0) >= (other.gestationTime || 18) * 0.82;
        const sameOrSister =
          other.genome?.speciesId === parentA.genome?.speciesId ||
          (CONFIG.PHYLOGENY_DIST?.[parentA.genome?.speciesId]?.[other.genome?.speciesId] ?? 1) <=
            (CONFIG.ECO?.HYBRID_MAX_DIST || 0.45);
        if (otherReady && sameOrSister) {
          const fit = other.genome?.fitnessScore || 1.0;
          if (fit > bestFitness) {
            bestFitness = fit;
            bestMate = other;
          }
        }
      }
    }

    if (neighborCount < minDensity || neighborCount > maxDensity || !bestMate) {
      return null;
    }

    // Check cell biomass if ecoSim grid is available (herbivore births cost less biomass)
    if (this.ecoSim && typeof this.ecoSim.getCellAt === 'function') {
      const cell = this.ecoSim.getCellAt(parentA.x, parentA.z);
      if (!parentA.isPrey && cell && cell.biomass < 18) return null;
      if (cell && !parentA.isPrey) {
        cell.biomass = Math.max(10, cell.biomass - (CONFIG.ECO?.BIRTH_BIOMASS_COST || 22));
      }
    }

    parentA.reproTimer = 0;
    parentA._reproTimerAtLastEcoTick = 0;
    bestMate.reproTimer = 0;
    bestMate._reproTimerAtLastEcoTick = 0;

    let childGenome;
    let isPZ = false;
    if (Genome && typeof Genome.crossover === 'function') {
      const cross = Genome.crossover(parentA.genome, bestMate.genome);
      childGenome = cross.genome;
      isPZ = Boolean(cross.newMutationId && !this.seenMutations.has(cross.newMutationId));
    } else {
      childGenome = this._createSafeGenome(parentA.genome?.speciesId || 'goblin');
    }

    const angle = Math.random() * Math.PI * 2;
    const dist = 2.5 + Math.random() * 2.5;
    const bx = (parentA.x + bestMate.x) * 0.5 + Math.cos(angle) * dist;
    const bz = (parentA.z + bestMate.z) * 0.5 + Math.sin(angle) * dist;

    const hasMut = Array.isArray(childGenome.mutations) && childGenome.mutations.length > 0;
    const isHyb = Boolean(childGenome.isHybrid);
    const parentSpotted =
      Boolean(this.bastionRef?.autoSpotNewbornMutants && (hasMut || isHyb)) ||
      parentA.spottedByScout ||
      bestMate.spottedByScout;

    const child = this.spawnEnemy(bx, bz, childGenome, [parentA.id, bestMate.id], {
      isPatientZero: isPZ,
      spottedByScout: parentSpotted,
      lifeStage: 'baby',
      isAdult: false,
      age: 0,
      isAquatic: false,
      hasLandLegs: true,
    });

    if (this.vfx && typeof this.vfx.spawnBirthEffect === 'function') {
      const mutHex = hasMut
        ? CONFIG.MUTATIONS?.[childGenome.mutations[0]]?.colorHex || 0xff4500
        : isHyb
          ? 0x48dbfb
          : 0x44ff88;
      this.vfx.spawnBirthEffect(
        new THREE.Vector3(child.x, child.y + 0.5, child.z),
        hasMut,
        isHyb,
        mutHex
      );
    }

    return child;
  }

  /**
   * Updates all enemies, progressive species emergence timers (Land-Sharks & Giant Moles),
   * eco-tick timers, individual gestation timers, wild species repopulation, juvenile-to-adult maturation,
   * starvation damage, peaceful/enraged Dragon AI, herbivore grazing/fleeing AI, pack movement,
   * combat attacks, and projectiles every frame.
   *
   * @param {number} dt - Frame delta time in seconds.
   * @param {number} elapsedTime - Total elapsed game time in seconds.
   * @param {Object} player - PlayerController instance.
   * @param {Object} bastionAndNpcs - BastionAndNPCs instance.
   * @param {Function} [onLineageEradicated] - Callback `(mutationId, enemy)` when a mutant lineage hits 0 carriers.
   */
  update(dt, elapsedTime, player, bastionAndNpcs, onLineageEradicated) {
    if (typeof onLineageEradicated === 'function') {
      this.onLineageEradicated = onLineageEradicated;
    }
    if (player) {
      this.playerRef = player;
    }
    if (bastionAndNpcs) {
      this.bastionRef = bastionAndNpcs;
    }

    // 0. Tick Collective Species Wrath Timers (e.g. 'dragon')
    for (const [spId, wrathState] of this.speciesWrath.entries()) {
      if (wrathState && wrathState.active) {
        wrathState.timer = Math.max(0, wrathState.timer - dt);
        if (wrathState.timer <= 0) {
          wrathState.active = false;
          for (const e of this.enemies) {
            if (e && e.genome?.speciesId === spId) {
              e.enraged = false;
              e.aggroBastionForced = false;
              e.aggroStance = CONFIG.SPECIES?.[spId]?.aggroStance || 'pacifist_apex';
              e.aggressiveness =
                e.genome?.genes?.aggressiveness ??
                CONFIG.SPECIES?.[spId]?.baseAggressiveness ??
                0.08;
              e.state = 'patrol';
            }
          }
          logger.info(
            'ECO',
            `Le Courroux Draconique s'apaise : les ${CONFIG.SPECIES?.[spId]?.name || spId}s survivants regagnent la caldeira.`
          );
        }
      }
    }

    // 1. Automatic Genetic Eco-Tick Timer, Progressive Species Emergence & Wild Species Repopulation
    if (!this.ecoPaused) {
      this.ecoTickTimer += dt;
      this.timeUntilNextTick = Math.max(0, this.ecoTickInterval - this.ecoTickTimer);
      this.ecoTickProgress = clamp(this.ecoTickTimer / this.ecoTickInterval, 0, 1);

      if (!this.tutorialMode) {
        this.survivalElapsedTime += dt;
        const tierSpec = getIslandTierSpec(this.islandNumber || 1);

        // Progressive Emergence Event 1: Amphibious Land-Sharks at tier sharkLandingTimeSec (40s on Island 1)
        const sharkTime = tierSpec?.sharkLandingTimeSec || CONFIG.ECO?.SHARK_EMERGENCE_TIME || 40;
        if (!this.sharksLanded && this.survivalElapsedTime >= sharkTime) {
          this.triggerSharkBeachLanding();
        } else if (this.sharksLanded) {
          this.sharkReinforceTimer += dt;
          if (this.sharkReinforceTimer >= (CONFIG.ECO?.SHARK_REINFORCE_INTERVAL || 35)) {
            this.sharkReinforceTimer = 0;
            const summary = this.getPreyPopulationSummary();
            if (summary.sharkLanded < 4 && this.enemies.length < (CONFIG.ECO?.MAX_WORLD_POPULATION || 130) - 2) {
              this.triggerSharkBeachLanding();
            }
          }
        }

        // Progressive Emergence Event 2: Subterranean Giant Moles at tier moleEruptionTimeSec (65s on Island 1)
        const moleTime = tierSpec?.moleEruptionTimeSec || CONFIG.ECO?.MOLE_EMERGENCE_TIME || 65;
        if (!this.molesErupted && this.survivalElapsedTime >= moleTime) {
          this.triggerMoleSubterraneanEruption(3);
        } else if (this.molesErupted) {
          this.moleReinforceTimer += dt;
          if (this.moleReinforceTimer >= (CONFIG.ECO?.MOLE_REINFORCE_INTERVAL || 42)) {
            this.moleReinforceTimer = 0;
            const summary = this.getPreyPopulationSummary();
            if (summary.giantMole < 4 && this.enemies.length < (CONFIG.ECO?.MAX_WORLD_POPULATION || 130) - 2) {
              this.triggerMoleSubterraneanEruption(2);
            }
          }
        }
      }

      // Continuous Wild Species Repopulation when any base hostile species drops < 2 (never deer/rabbit!)
      this.checkAndRepopulateSpecies(dt, false);

      if (this.ecoTickTimer >= this.ecoTickInterval) {
        this.triggerEcoTick();
      }
    }

    const worldHalf = (CONFIG.WORLD?.SIZE || 240) * 0.45;
    const bastionRadius = CONFIG.BASTION?.RADIUS || 14;
    const starvationDps = CONFIG.ECO?.STARVATION_DPS || 4.5;
    const waterLevel = CONFIG.WORLD?.WATER_LEVEL ?? -0.5;

    // 2. Update Each Enemy Entity
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);

      const spId = enemy.genome?.speciesId || 'goblin';
      const isPrey =
        Boolean(enemy.isPrey) ||
        enemy.aggroStance === 'prey_pacifist' ||
        enemy.genome?.clade === 'herbivore' ||
        spId === 'deer' ||
        spId === 'rabbit';

      // Offshore Ocean Sharks (`isAquatic === true`): swim in the coastal ocean ring (`radius: 88..104m`)
      if (enemy.isAquatic) {
        enemy.state = 'swim';
        const radialAngle = Math.atan2(enemy.z, enemy.x);
        const targetRadius = 94 + Math.sin(elapsedTime * 0.7 + i) * 4;
        const nextAngle = radialAngle + (enemy.speed * 0.011) * dt;
        const targetX = Math.cos(nextAngle) * targetRadius;
        const targetZ = Math.sin(nextAngle) * targetRadius;
        enemy.vx = (targetX - enemy.x) / Math.max(dt, 0.016);
        enemy.vz = (targetZ - enemy.z) / Math.max(dt, 0.016);
        enemy.x = targetX;
        enemy.z = targetZ;
        enemy.y = waterLevel - 0.15;

        if (enemy.mesh) {
          enemy.mesh.position.set(enemy.x, enemy.y, enemy.z);
          const speedMag = Math.hypot(enemy.vx, enemy.vz);
          if (speedMag > 0.1) {
            enemy.mesh.rotation.y = Math.atan2(enemy.vx, enemy.vz);
          }
          animateCreatureMesh(
            enemy.mesh,
            {
              isMoving: true,
              speed: enemy.speed,
              isAttacking: false,
              hitFlash: enemy.hitFlash,
              hasLandLegs: false,
              isAquatic: true,
            },
            elapsedTime,
            dt
          );
        } else {
          enemy.position.set(enemy.x, enemy.y, enemy.z);
        }
        continue;
      }

      // Advance age & check Baby -> Adult maturation (slowed by Bastion Bio-Lab for mutant babies!)
      const isMutantBaby =
        !enemy.isAdult &&
        Array.isArray(enemy.genome?.mutations) &&
        enemy.genome.mutations.length > 0;
      const matSlowFactor =
        isMutantBaby && bastionAndNpcs?.mutantMaturationSlowFactor
          ? bastionAndNpcs.mutantMaturationSlowFactor
          : 1.0;
      enemy.age = (enemy.age || 0) + dt * matSlowFactor;
      const matTime = enemy.maturationTime || 20;
      if (!enemy.isAdult && enemy.freezeMaturationAt80) {
        const dPlayerToBaby = player ? dist2D(enemy.x, enemy.z, player.x, player.z) : Infinity;
        if (dPlayerToBaby <= 14) {
          enemy.freezeMaturationAt80 = false;
          enemy.age = Math.min(enemy.age, matTime * 0.75);
        } else {
          enemy.age = Math.min(enemy.age, matTime * 0.80);
        }
      }
      if (!enemy.isAdult && enemy.age >= matTime) {
        this._matureEnemyToAdult(enemy);
      }

      // Advance individual adult gestation timer (`reproTimer`)
      if (enemy.isAdult && !enemy.starving) {
        enemy.reproTimer = (enemy.reproTimer || 0) + dt;
        const gestReq = enemy.gestationTime || 18;
        if (!this.ecoPaused && gestReq < this.ecoTickInterval && enemy.reproTimer >= gestReq) {
          this._tryIndividualGestationBirth(enemy);
        }
      }

      // Tick Burn & Poison DoT status effects
      const hadBurn = (enemy.burnTimer || 0) > 0;
      const hadPoison = (enemy.poisonTimer || 0) > 0;
      if (hadBurn || hadPoison) {
        enemy.burnTimer = Math.max(0, (enemy.burnTimer || 0) - dt);
        enemy.poisonTimer = Math.max(0, (enemy.poisonTimer || 0) - dt);
        if (enemy.poisonTimer <= 0) {
          enemy.venomWeakened = false;
        }
        enemy.dotTickTimer = (enemy.dotTickTimer || 0) + dt;
        if (enemy.dotTickTimer >= 0.5) {
          const tickSpan = enemy.dotTickTimer;
          enemy.dotTickTimer = 0;
          const activeDps = (hadBurn ? enemy.burnDps || 0 : 0) + (hadPoison ? enemy.poisonDps || 0 : 0);
          if (activeDps > 0) {
            const dotRes = this.damageEnemy(
              enemy.id,
              Math.max(1, Math.round(activeDps * tickSpan)),
              null,
              this.onLineageEradicated,
              { isSpellDamage: true }
            );
            if (dotRes.killed) {
              continue;
            }
          }
        }
      } else {
        enemy.dotTickTimer = 0;
        enemy.venomWeakened = false;
      }

      // Tick Slow & Stun timers
      if ((enemy.slowTimer || 0) > 0) {
        enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
        if (enemy.slowTimer <= 0) {
          enemy.slowFactor = 1.0;
        }
      }
      if ((enemy.stunTimer || 0) > 0) {
        enemy.stunTimer = Math.max(0, enemy.stunTimer - dt);
      }

      // Starvation HP drain & migration pressure (unprovoked peaceful Dragons & Herbivore Prey don't starve)
      const isPeacefulApex = this.isPeacefulTowardsPlayer(enemy);
      if (enemy.starving && !isPeacefulApex && !isPrey) {
        const hasCryo = Array.isArray(enemy.genome?.mutations) && enemy.genome.mutations.includes('cryo_blood');
        const drain = starvationDps * (hasCryo ? 0.55 : 1.0) * dt;
        enemy.hp -= drain;
        if (enemy.hp <= 0) {
          this._removeEnemyAtIndex(i, false, this.onLineageEradicated);
          continue;
        }
      }

      // Passive vampiric regeneration if mutated
      if (
        Array.isArray(enemy.genome?.mutations) &&
        enemy.genome.mutations.includes('vampiric_maw') &&
        enemy.hp < enemy.maxHp
      ) {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + 1.5 * dt);
      }

      const rawAggroRadius = enemy.genome?.genes?.aggroRadius || 19;
      const isTerritorialUnprovoked =
        enemy.aggroStance === 'territorial' &&
        !enemy.provokedByAttack &&
        !enemy.aggroBastionForced &&
        !enemy.enraged;
      const effectiveAggroRadius =
        isPeacefulApex || isPrey
          ? 0
          : isTerritorialUnprovoked
            ? rawAggroRadius * (0.52 + 0.45 * (enemy.aggressiveness ?? 0.48))
            : rawAggroRadius * (0.85 + 0.3 * (enemy.aggressiveness ?? 0.75));

      let targetX = null;
      let targetZ = null;
      let targetType = null;
      let targetEntity = null;
      let nearestDist = Infinity;

      if (!isPeacefulApex && !isPrey) {
        // Enraged Wrath Raid (e.g. provoked Sovereign Dragons): charge Player if within 36m, otherwise raze the Bastion ("notre villa")!
        if (enemy.enraged || enemy.state === 'wrath_raid') {
          const dPlayer = player && player.hp > 0 ? dist2D(enemy.x, enemy.z, player.x, player.z) : Infinity;
          const distToBastion = Math.hypot(enemy.x, enemy.z);
          if (dPlayer <= 36 && dPlayer <= distToBastion + 8) {
            nearestDist = dPlayer;
            targetX = player.x;
            targetZ = player.z;
            targetType = 'player';
            targetEntity = player;
          } else {
            targetX = 0;
            targetZ = 0;
            targetType = 'bastion';
            nearestDist = Math.max(0, distToBastion - bastionRadius);
          }
        } else {
          // Normal Hostile / Territorial Aggro Check against Player
          if (player && player.hp > 0) {
            const dPlayer = dist2D(enemy.x, enemy.z, player.x, player.z);
            if (dPlayer <= effectiveAggroRadius) {
              nearestDist = dPlayer;
              targetX = player.x;
              targetZ = player.z;
              targetType = 'player';
              targetEntity = player;
            }
          }

          // Check nearby NPCs (Guards / Harvesters / Scouts)
          if (bastionAndNpcs && Array.isArray(bastionAndNpcs.npcs)) {
            for (const npc of bastionAndNpcs.npcs) {
              if (npc.hp <= 0) continue;
              const dNpc = dist2D(enemy.x, enemy.z, npc.x, npc.z);
              if (dNpc <= effectiveAggroRadius * 0.85 && dNpc < nearestDist) {
                nearestDist = dNpc;
                targetX = npc.x;
                targetZ = npc.z;
                targetType = 'npc';
                targetEntity = npc;
              }
            }
          }

          // Starving enemies or forced Act 4 Raiders migrate/charge toward the Bastion
          const distToBastion = Math.hypot(enemy.x, enemy.z);
          if (
            !targetType &&
            (enemy.aggroBastionForced ||
              (!isTerritorialUnprovoked && enemy.starving) ||
              distToBastion < effectiveAggroRadius + bastionRadius)
          ) {
            if (enemy.aggroBastionForced || distToBastion < effectiveAggroRadius + bastionRadius) {
              targetX = 0;
              targetZ = 0;
              targetType = 'bastion';
              nearestDist = Math.max(0, distToBastion - bastionRadius);
            }
          }
        }
      }

      const distToBastion = Math.hypot(enemy.x, enemy.z);
      const slowMult = (enemy.slowTimer || 0) > 0 ? clamp(enemy.slowFactor || 0.5, 0.2, 1.0) : 1.0;
      let moveSpeed = enemy.speed * slowMult;
      let isAttacking = false;

      if ((enemy.stunTimer || 0) > 0) {
        enemy.state = 'stunned';
        enemy.vx *= 0.25;
        enemy.vz *= 0.25;
      } else if (isPrey) {
        // Herbivore Prey (`deer` / `rabbit`): graze peacefully in meadows/forests, or flee from nearby Player / Carnivores!
        let threatX = 0;
        let threatZ = 0;
        let threatCount = 0;

        if (player && player.hp > 0) {
          const dp = dist2D(enemy.x, enemy.z, player.x, player.z);
          if (dp <= 10.5) {
            const w = (11.5 - dp) / 11.5;
            threatX += ((enemy.x - player.x) / Math.max(dp, 0.2)) * w;
            threatZ += ((enemy.z - player.z) / Math.max(dp, 0.2)) * w;
            threatCount++;
          }
        }

        for (const other of this.enemies) {
          if (!other || other.id === enemy.id || other.hp <= 0 || other.isPrey || other.isAquatic) continue;
          if (other.aggroStance === 'prey_pacifist') continue;
          const dc = dist2D(enemy.x, enemy.z, other.x, other.z);
          if (dc <= 9.5) {
            const w = (10.5 - dc) / 10.5;
            threatX += ((enemy.x - other.x) / Math.max(dc, 0.2)) * w;
            threatZ += ((enemy.z - other.z) / Math.max(dc, 0.2)) * w;
            threatCount++;
          }
        }

        if (threatCount > 0) {
          enemy.state = 'flee';
          const fleeAngle = Math.atan2(threatZ, threatX);
          enemy.wanderAngle = fleeAngle;
          const fleeSpeed = moveSpeed * 1.15;
          enemy.vx = Math.cos(fleeAngle) * fleeSpeed;
          enemy.vz = Math.sin(fleeAngle) * fleeSpeed;
        } else {
          enemy.state = 'graze';
          enemy.wanderTimer -= dt;
          if (enemy.wanderTimer <= 0) {
            enemy.wanderTimer = 2.0 + Math.random() * 3.0;
            const mate = this._findNearestCompatibleMate(enemy);
            const dHome = dist2D(enemy.x, enemy.z, enemy.homeX, enemy.homeZ);
            if (mate && dist2D(enemy.x, enemy.z, mate.x, mate.z) > 12) {
              enemy.wanderAngle = Math.atan2(mate.z - enemy.z, mate.x - enemy.x);
            } else if (dHome > 16) {
              enemy.wanderAngle =
                Math.atan2(enemy.homeZ - enemy.z, enemy.homeX - enemy.x) +
                (Math.random() - 0.5) * 0.5;
            } else {
              enemy.wanderAngle += (Math.random() - 0.5) * 1.3;
            }
          }
          const grazeSpeed = moveSpeed * 0.36;
          enemy.vx = Math.cos(enemy.wanderAngle) * grazeSpeed;
          enemy.vz = Math.sin(enemy.wanderAngle) * grazeSpeed;
        }

        if (distToBastion < bastionRadius + 10) {
          const pushAngle = Math.atan2(enemy.z, enemy.x);
          enemy.vx = Math.cos(pushAngle) * moveSpeed * 0.55;
          enemy.vz = Math.sin(pushAngle) * moveSpeed * 0.55;
          enemy.wanderAngle = pushAngle;
        }
      } else if (targetType) {
        enemy.state = enemy.enraged ? 'wrath_raid' : 'chase';
        const attackRange = targetType === 'bastion' ? bastionRadius + 2.5 : 2.6;
        const hasPyro =
          Array.isArray(enemy.genome?.mutations) && enemy.genome.mutations.includes('pyro_gland');
        const isDragon = enemy.genome?.speciesId === 'dragon';
        const rangedRange = hasPyro || isDragon ? 12.5 : attackRange;

        if (nearestDist <= attackRange) {
          // Melee strike
          enemy.state = 'attack';
          isAttacking = true;
          enemy.vx *= 0.7;
          enemy.vz *= 0.7;

          if (enemy.attackCooldown <= 0) {
            enemy.attackCooldown = 1.15;
            this._performEnemyAttack(enemy, targetType, targetEntity, bastionAndNpcs, false);
          }
        } else if ((hasPyro || isDragon) && nearestDist <= rangedRange && enemy.attackCooldown <= 0) {
          // Ranged Pyroclastic Fireball!
          enemy.state = 'attack';
          isAttacking = true;
          enemy.attackCooldown = isDragon && enemy.enraged ? 1.55 : 2.2;
          this._spawnFireball(enemy, targetX, targetZ);
        } else {
          // Chase target
          const angle = Math.atan2(targetZ - enemy.z, targetX - enemy.x);
          enemy.vx = Math.cos(angle) * moveSpeed;
          enemy.vz = Math.sin(angle) * moveSpeed;
        }
      } else {
        // Patrol / Pack Cohesion / Famine Migration
        enemy.state = enemy.starving && !isPeacefulApex ? 'migrate' : 'patrol';
        enemy.wanderTimer -= dt;
        if (enemy.wanderTimer <= 0) {
          enemy.wanderTimer = 2.0 + Math.random() * 3.5;

          if (isPeacefulApex) {
            // Peaceful Sovereign Dragons glide majestically around their volcanic home territory (> 55m from Bastion)
            const dHome = dist2D(enemy.x, enemy.z, enemy.homeX, enemy.homeZ);
            if (dHome > 20 || distToBastion < 55) {
              enemy.wanderAngle =
                Math.atan2(enemy.homeZ - enemy.z, enemy.homeX - enemy.x) +
                (Math.random() - 0.5) * 0.4;
            } else {
              enemy.wanderAngle += (Math.random() - 0.5) * 1.1;
            }
          } else if (enemy.starving) {
            // Migrate inward toward richer central plains
            const inwardAngle = Math.atan2(-enemy.z, -enemy.x) + (Math.random() - 0.5) * 0.9;
            enemy.wanderAngle = inwardAngle;
          } else if (enemy.lonely) {
            // Lonely creature searches for nearest compatible mate
            const mate = this._findNearestCompatibleMate(enemy);
            if (mate) {
              enemy.wanderAngle = Math.atan2(mate.z - enemy.z, mate.x - enemy.x);
            } else {
              enemy.wanderAngle += (Math.random() - 0.5) * 1.6;
            }
          } else {
            // Gentle patrol around home territory
            const dHome = dist2D(enemy.x, enemy.z, enemy.homeX, enemy.homeZ);
            if (dHome > 18) {
              enemy.wanderAngle = Math.atan2(enemy.homeZ - enemy.z, enemy.homeX - enemy.x) + (Math.random() - 0.5) * 0.5;
            } else {
              enemy.wanderAngle += (Math.random() - 0.5) * 1.4;
            }
          }
        }

        const patrolSpeed = moveSpeed * (enemy.starving && !isPeacefulApex ? 0.72 : 0.42);
        enemy.vx = Math.cos(enemy.wanderAngle) * patrolSpeed;
        enemy.vz = Math.sin(enemy.wanderAngle) * patrolSpeed;

        // Keep wild patrolling creatures outside the Bastion sanctuary ring unless aggroed
        if (distToBastion < bastionRadius + (isPeacefulApex ? 38 : 6)) {
          const pushAngle = Math.atan2(enemy.z, enemy.x);
          enemy.vx = Math.cos(pushAngle) * moveSpeed * 0.6;
          enemy.vz = Math.sin(pushAngle) * moveSpeed * 0.6;
          enemy.wanderAngle = pushAngle;
        }
      }

      // Integrate position & clamp to island bounds
      enemy.x = clamp(enemy.x + enemy.vx * dt, -worldHalf, worldHalf);
      enemy.z = clamp(enemy.z + enemy.vz * dt, -worldHalf, worldHalf);
      enemy.y = this.terrain ? this.terrain.getHeightAt(enemy.x, enemy.z) : 0;

      // Prevent drowning in deep ocean
      if (enemy.y < waterLevel + 0.1) {
        const toCenter = Math.atan2(-enemy.z, -enemy.x);
        enemy.x += Math.cos(toCenter) * moveSpeed * dt * 1.5;
        enemy.z += Math.sin(toCenter) * moveSpeed * dt * 1.5;
        enemy.wanderAngle = toCenter;
        enemy.y = this.terrain ? this.terrain.getHeightAt(enemy.x, enemy.z) : 0;
      }

      // Sync 3D Mesh & Animation
      if (enemy.mesh) {
        enemy.mesh.position.set(enemy.x, Math.max(enemy.y, waterLevel + 0.1), enemy.z);
        const speedMag = Math.hypot(enemy.vx, enemy.vz);
        if (speedMag > 0.15) {
          const targetRot = Math.atan2(enemy.vx, enemy.vz);
          enemy.mesh.rotation.y = targetRot;
        }

        animateCreatureMesh(
          enemy.mesh,
          {
            isMoving: speedMag > 0.25,
            speed: speedMag,
            isAttacking: isAttacking || enemy.attackCooldown > 0.75,
            hitFlash: enemy.hitFlash,
            hasLandLegs: enemy.hasLandLegs !== false,
            isAquatic: Boolean(enemy.isAquatic),
          },
          elapsedTime,
          dt
        );

        const growthProgress = enemy.isAdult
          ? 1.0
          : clamp((enemy.age || 0) / (enemy.maturationTime || 20), 0, 1);

        updateCreatureOverlay(
          enemy.mesh,
          enemy.hp,
          enemy.maxHp,
          enemy.isPatientZero,
          enemy.spottedByScout,
          !enemy.isAdult,
          growthProgress
        );

        // Keep 3D sky beacon locked onto moving spotted mutant/Patient Zero
        if (enemy.spottedByScout && this.vfx && typeof this.vfx.setPatientZeroBeacon === 'function') {
          const mutId = enemy.genome?.mutations?.[0];
          const colorHex = mutId ? CONFIG.MUTATIONS?.[mutId]?.colorHex || 0xff3300 : 0xff3300;
          this.vfx.setPatientZeroBeacon(enemy.id, enemy.mesh.position, colorHex, true);
        }
      } else {
        enemy.position.set(enemy.x, enemy.y, enemy.z);
      }
    }

    // 3. Update Fireball Projectiles
    this._updateProjectiles(dt, player, bastionAndNpcs);
  }

  /**
   * Finds the nearest compatible packmate for a lonely creature so it can form a breeding cluster.
   * @param {Object} enemy - Searching enemy.
   * @returns {Object|null}
   */
  _findNearestCompatibleMate(enemy) {
    let best = null;
    let bestDist = Infinity;
    for (const other of this.enemies) {
      if (other.id === enemy.id || other.isAquatic) continue;
      if (other.genome?.speciesId === enemy.genome?.speciesId || other.genome?.clade === enemy.genome?.clade) {
        const d = dist2D(enemy.x, enemy.z, other.x, other.z);
        if (d < bestDist && d < 65) {
          bestDist = d;
          best = other;
        }
      }
    }
    return best;
  }

  /**
   * Determines the primary damage type (`'fire' | 'poison' | 'ice' | 'physical'`) of an enemy attack.
   * @param {Object} enemy
   * @returns {'fire'|'poison'|'ice'|'physical'}
   */
  _getEnemyDamageType(enemy) {
    const muts = Array.isArray(enemy?.genome?.mutations) ? enemy.genome.mutations : [];
    if (muts.includes('pyro_gland') || enemy?.genome?.speciesId === 'dragon') return 'fire';
    if (muts.includes('venom_sacs')) return 'poison';
    if (muts.includes('cryo_blood')) return 'ice';
    return 'physical';
  }

  /**
   * Executes a melee or elemental attack from an enemy against its target.
   */
  _performEnemyAttack(enemy, targetType, targetEntity, bastionAndNpcs) {
    const damageType = this._getEnemyDamageType(enemy);
    const isElemental = damageType !== 'physical';
    const effDamage = Math.max(1, +(enemy.damage * (enemy.venomWeakened ? 0.7 : 1.0)).toFixed(1));

    if (targetType === 'player' && targetEntity) {
      if (typeof targetEntity.takeDamage === 'function') {
        targetEntity.takeDamage(effDamage, isElemental, enemy, damageType);
      } else {
        targetEntity.hp = Math.max(0, targetEntity.hp - effDamage);
      }
    } else if (targetType === 'npc' && targetEntity && bastionAndNpcs) {
      if (typeof bastionAndNpcs.damageNpc === 'function') {
        bastionAndNpcs.damageNpc(targetEntity.id, effDamage);
      } else {
        targetEntity.hp = Math.max(0, targetEntity.hp - effDamage);
      }
    } else if (targetType === 'bastion' && bastionAndNpcs) {
      if (typeof bastionAndNpcs.damageBastion === 'function') {
        const thorns = bastionAndNpcs.damageBastion(effDamage);
        if (thorns > 0) {
          this.damageEnemy(enemy.id, thorns);
        }
      }
    }
  }

  /**
   * Spawns a glowing magma fireball projectile from a `pyro_gland` mutant or `dragon`.
   */
  _spawnFireball(enemy, targetX, targetZ) {
    const angle = Math.atan2(targetZ - enemy.z, targetX - enemy.x);
    const speed = 18;
    const effDamage = Math.max(1, +(enemy.damage * 0.85 * (enemy.venomWeakened ? 0.7 : 1.0)).toFixed(1));
    let mesh = null;
    if (this.scene) {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 8, 8),
        new THREE.MeshStandardMaterial({
          color: 0xff5500,
          emissive: 0xff2200,
          emissiveIntensity: 2.2,
        })
      );
      mesh.position.set(enemy.x, enemy.y + 1.3, enemy.z);
      this.scene.add(mesh);
    }

    this.projectiles.push({
      x: enemy.x,
      y: enemy.y + 1.3,
      z: enemy.z,
      vx: Math.cos(angle) * speed,
      vz: Math.sin(angle) * speed,
      damage: effDamage,
      ttl: 1.6,
      mesh,
      ownerId: enemy.id,
      ownerEnemy: enemy,
    });
  }

  /**
   * Updates active enemy fireball projectiles.
   */
  _updateProjectiles(dt, player, bastionAndNpcs) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.ttl -= dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      if (p.mesh) {
        p.mesh.position.set(p.x, p.y, p.z);
      }

      let hit = false;
      if (player && player.hp > 0 && dist2D(p.x, p.z, player.x, player.z) < 1.5) {
        if (typeof player.takeDamage === 'function') {
          player.takeDamage(p.damage, true, p.ownerEnemy || null, 'fire');
        } else {
          player.hp = Math.max(0, player.hp - p.damage);
        }
        hit = true;
      } else if (bastionAndNpcs && Math.hypot(p.x, p.z) < (CONFIG.BASTION?.RADIUS || 14)) {
        if (typeof bastionAndNpcs.damageBastion === 'function') {
          bastionAndNpcs.damageBastion(p.damage);
        }
        hit = true;
      }

      if (hit || p.ttl <= 0) {
        if (hit && this.vfx && typeof this.vfx.spawnHitEffect === 'function') {
          this.vfx.spawnHitEffect(new THREE.Vector3(p.x, p.y, p.z), 0xff4500);
        }
        if (p.mesh && this.scene) {
          this.scene.remove(p.mesh);
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  /**
   * Applies combat damage and optional knockback to an enemy.
   * - If the damaged enemy is an unprovoked peaceful Sovereign Dragon (`aggroStance === 'pacifist_apex'`),
   *   immediately triggers `provokeSpecies('dragon', enemy)` so the entire Dragon species charges the
   *   Player and Bastion!
   * - If a herbivore prey (`deer` / `rabbit`) dies, awards Food Rations (`+35` / `+18`) & instant HP heal
   *   (`+25` / `+12`), fires `onPreyKilled`, and triggers `onPreyEcologicalCrisis` + carnivore famine
   *   migration if the herd is overhunted below `< 2` individuals!
   *
   * @param {string|Object} enemyIdOrObj - Enemy ID string or enemy object.
   * @param {number} amount - Damage amount.
   * @param {{x: number, z: number}|THREE.Vector3|null} [knockbackDir=null] - Normalized knockback vector.
   * @param {Function|null} [onLineageEradicated=null] - Optional eradication callback.
   * @param {Object} [options={}] - Optional `{ isSpellDamage: boolean }`.
   * @returns {{ killed: boolean, enemy: Object|null, xpGained: number }}
   */
  damageEnemy(enemyIdOrObj, amount, knockbackDir = null, onLineageEradicated = null, options = {}) {
    const targetId = typeof enemyIdOrObj === 'object' ? enemyIdOrObj?.id : enemyIdOrObj;
    const idx = this.enemies.findIndex((e) => e.id === targetId);
    if (idx === -1) {
      return { killed: false, enemy: null, xpGained: 0 };
    }

    const enemy = this.enemies[idx];
    const isSpellDamage = Boolean(options?.isSpellDamage);

    // Provoke Collective Dragon Wrath if an unprovoked peaceful apex sovereign is attacked!
    if (
      enemy.aggroStance === 'pacifist_apex' &&
      !enemy.enraged &&
      !this.isSpeciesProvoked(enemy.genome?.speciesId || 'dragon')
    ) {
      this.provokeSpecies(enemy.genome?.speciesId || 'dragon', enemy);
    } else if (enemy.aggroStance === 'territorial') {
      enemy.provokedByAttack = true;
      enemy.aggressiveness = Math.max(enemy.aggressiveness || 0.5, 0.92);
    }

    enemy.hp -= amount;
    enemy.hitFlash = 1.0;

    if (knockbackDir) {
      const kx = knockbackDir.x || 0;
      const kz = knockbackDir.z || 0;
      const kbScale = knockbackDir.strength || 1.45;
      enemy.x += kx * kbScale;
      enemy.z += kz * kbScale;
    }

    if (this.vfx && typeof this.vfx.spawnHitEffect === 'function') {
      const hasPyro = enemy.genome?.mutations?.includes('pyro_gland');
      this.vfx.spawnHitEffect(
        new THREE.Vector3(enemy.x, enemy.y + 1.0, enemy.z),
        hasPyro ? 0xff4500 : 0xffaa33
      );
    }

    if (enemy.hp <= 0) {
      const spId = enemy.genome?.speciesId || 'goblin';
      const spDef = CONFIG.SPECIES[spId] || CONFIG.SPECIES.goblin;
      const isPrey =
        Boolean(enemy.isPrey) ||
        enemy.aggroStance === 'prey_pacifist' ||
        enemy.genome?.clade === 'herbivore' ||
        spId === 'deer' ||
        spId === 'rabbit';

      const baseXp = spDef.xpReward || (isPrey ? 10 : 20);
      const mutBonus = (enemy.genome?.mutations?.length || 0) * 25;
      const pzBonus = enemy.isPatientZero ? 45 : 0;
      const xpGained =
        typeof enemy.xpRewardOverride === 'number'
          ? enemy.xpRewardOverride
          : baseXp + mutBonus + pzBonus;

      const cb = onLineageEradicated || this.onLineageEradicated;
      this._removeEnemyAtIndex(idx, true, cb);

      if (this.playerRef && typeof this.playerRef.recordEnemyKill === 'function' && !enemy._killRecorded) {
        enemy._killRecorded = true;
        this.playerRef.recordEnemyKill(enemy, xpGained, isSpellDamage);
      }

      if (isPrey) {
        const summary = this.getPreyPopulationSummary();
        if (typeof this.onPreyKilled === 'function') {
          this.onPreyKilled(enemy, summary, isSpellDamage);
        }
        if (summary.isExtinct || summary.isEndangered) {
          if (summary.isExtinct) {
            for (const pred of this.enemies) {
              if (!pred || pred.isPrey || pred.isAquatic) continue;
              if (
                pred.genome?.speciesId === 'wolf' ||
                pred.genome?.speciesId === 'lion' ||
                pred.genome?.speciesId === 'vulture' ||
                pred.genome?.speciesId === 'shark'
              ) {
                pred.starving = true;
              }
            }
            logger.alert(
              `⚠️ EXTINCTION DES PROIES ! Les troupeaux de Biches et Lapins ont été décimés (${isSpellDamage ? 'dégâts collatéraux de sorts' : 'surchasse'}) : les prédateurs affamés convergent vers le Bastion ! Utilisez [Réintroduire Troupeaux (-25 Biomasse)] au Bio-Lab !`,
              { summary, isSpellDamage }
            );
          } else {
            logger.warn(
              'ECO',
              `⚠️ ALERTE ÉCOLOGIQUE : Troupeaux d'herbivores menacés (${summary.deer} Biches, ${summary.rabbit} Lapins). Sous < 2 individus d'une espèce, elle ne pourra plus se reproduire !`,
              { summary, isSpellDamage }
            );
          }
          if (typeof this.onPreyEcologicalCrisis === 'function') {
            this.onPreyEcologicalCrisis(summary, enemy, isSpellDamage);
          }
        }
      }

      if (typeof this.onEnemyKilled === 'function') {
        this.onEnemyKilled(enemy, xpGained);
      }
      return { killed: true, enemy, xpGained };
    }

    return { killed: false, enemy, xpGained: 0 };
  }

  /**
   * Internal helper to remove a dead enemy, clean up its 3D mesh/beacon, and check
   * whether its death eradicated an active mutation lineage.
   */
  _removeEnemyAtIndex(idx, killedByPlayer = false, onLineageEradicated = null) {
    const enemy = this.enemies[idx];
    if (!enemy) return;

    const carriedMutations = Array.isArray(enemy.genome?.mutations) ? [...enemy.genome.mutations] : [];
    const wasHybrid = Boolean(enemy.genome?.isHybrid);
    const hybridName = enemy.genome?.speciesName;

    if (this.vfx) {
      if (typeof this.vfx.spawnDeathEffect === 'function') {
        this.vfx.spawnDeathEffect(
          new THREE.Vector3(enemy.x, enemy.y + 0.8, enemy.z),
          carriedMutations.length > 0 ? 0xff4500 : 0xaa2222
        );
      }
      if (typeof this.vfx.setPatientZeroBeacon === 'function') {
        this.vfx.setPatientZeroBeacon(
          enemy.id,
          enemy.mesh ? enemy.mesh.position : new THREE.Vector3(enemy.x, enemy.y, enemy.z),
          0xff3300,
          false
        );
      }
    }

    if (enemy.mesh && this.scene) {
      this.scene.remove(enemy.mesh);
    }

    this.enemies.splice(idx, 1);

    // Check if any mutation carried by this enemy now has 0 surviving carriers in the world!
    for (const mutId of carriedMutations) {
      const remaining = this.enemies.filter(
        (e) => Array.isArray(e.genome?.mutations) && e.genome.mutations.includes(mutId)
      ).length;

      if (remaining === 0) {
        const mutName = CONFIG.MUTATIONS?.[mutId]?.name || mutId;
        logger.alert(`Lignée mutante [${mutName}] éradiquée à temps ! Aucun porteur survivant.`, {
          mutationId: mutId,
          lastCarrierId: enemy.id,
          speciesName: enemy.genome?.speciesName,
          killedByPlayer,
        });
        if (typeof onLineageEradicated === 'function') {
          onLineageEradicated(mutId, enemy);
        }
      }
    }

    if (wasHybrid && killedByPlayer) {
      const remainingHybrids = this.enemies.filter(
        (e) => e.genome?.isHybrid && e.genome?.speciesName === hybridName
      ).length;
      if (remainingHybrids === 0 && carriedMutations.length === 0 && typeof onLineageEradicated === 'function') {
        onLineageEradicated(enemy.genome?.lineageId || hybridName, enemy);
      }
    }
  }

  /**
   * Returns all live enemies currently in the world.
   * @returns {Array<Object>}
   */
  getEnemies() {
    return this.enemies;
  }
}

export default EnemyManager;
