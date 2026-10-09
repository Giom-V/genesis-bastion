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
import {
  buildCreatureMesh,
  animateCreatureMesh,
  updateCreatureOverlay,
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

    /**
     * Tracks collective species wrath state (e.g. `'dragon'` when a peaceful Sovereign Dragon is attacked).
     * @type {Map<string, { active: boolean, timer: number, duration: number }>}
     */
    this.speciesWrath = new Map();

    /**
     * Per-species repopulation timers in seconds when a foundational species drops below `< 2` individuals.
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
   * Returns true if an enemy is an unprovoked peaceful apex sovereign (e.g. `'dragon'`)
   * that should NOT be targeted by automatic attacks or Bastion turrets.
   * @param {Object} enemy
   * @returns {boolean}
   */
  isPeacefulTowardsPlayer(enemy) {
    if (!enemy) return false;
    const spId = enemy.genome?.speciesId || 'goblin';
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
   * Returns a dictionary of living counts for each of the 7 foundational species.
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
   * Checks foundational species counts (`goblin`, `orc`, `troll`, `wolf`, `lion`, `vulture`, `dragon`)
   * and repopulates any base species whose living count drops below `< 2` from hidden burrows,
   * deep caves, or mountain crags (`> 52m` from the Bastion).
   * Note: Mutant lineages CAN be permanently eradicated; only wild Gen-1 base species repopulate!
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

    // Preferred biome angles & radial distances (> 52m from Bastion at (0,0))
    const habitatAnchors = {
      goblin: { angle: 0.4, dist: 58 },
      orc: { angle: 1.0, dist: 64 },
      troll: { angle: 0.75, dist: 74 },
      wolf: { angle: 2.15, dist: 60 },
      lion: { angle: 2.8, dist: 68 },
      vulture: { angle: 4.85, dist: 76 },
      dragon: { angle: 1.55, dist: 86 },
    };

    const allSpawned = [];

    for (const spId of baseSpeciesIds) {
      const living = counts[spId] || 0;
      if (living >= minThreshold) {
        this.repopulationTimers[spId] = 0;
        continue;
      }

      const spDef = CONFIG.SPECIES?.[spId] || CONFIG.SPECIES.goblin;
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
        // Always spawn unmutated wild Gen-1 adults
        const wildGenome = this._createSafeGenome(spId);
        wildGenome.mutations = [];
        if (typeof wildGenome.syncMutations === 'function') {
          wildGenome.syncMutations();
        }
        const spawned = this.spawnEnemy(sx, sz, wildGenome, [], {
          lifeStage: 'adult',
          isAdult: true,
          isPatientZero: false,
        });
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
   * Creates a fallback Genome object if `Genome.createInitial` is unavailable or returns partial data.
   * @param {string} speciesId - Base species ID.
   * @returns {Object} Genome instance.
   */
  _createSafeGenome(speciesId = 'goblin') {
    if (Genome && typeof Genome.createInitial === 'function') {
      return Genome.createInitial(speciesId);
    }
    const sp = CONFIG.SPECIES[speciesId] || CONFIG.SPECIES.goblin;
    return {
      speciesId: sp.id,
      speciesName: sp.name,
      isHybrid: false,
      hybridParents: [sp.id, sp.id],
      generation: 1,
      lineageId: `${sp.id}_gen1`,
      aggroStance: sp.aggroStance || (sp.id === 'dragon' ? 'pacifist_apex' : 'hostile'),
      genes: {
        size: sp.baseSize,
        speed: sp.baseSpeed,
        strength: sp.baseDamage,
        maxHp: sp.baseHp,
        gestationTime: sp.baseGestationTime || 18,
        aggressiveness: sp.baseAggressiveness ?? 0.7,
        fertility: sp.fertility || 1.0,
        metabolism: sp.metabolism || 4.0,
        aggroRadius: sp.aggroRadius || 18,
      },
      mutations: [],
      fitnessScore: 1.0,
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
   * outside the Bastion safe radius (`42` units), and seeds an innate "Patient Zero"
   * Fire Troll (`troll` with `pyro_gland`) at moderate distance (~68-78 units) so
   * Scouts can discover it early in the session.
   *
   * @param {number} [count=CONFIG.ECO.INITIAL_POPULATION] - Total initial creatures to spawn.
   * @returns {Array<Object>} Spawned enemies.
   */
  spawnInitialPopulation(count = CONFIG.ECO?.INITIAL_POPULATION || 42) {
    const safeRadius = CONFIG.WORLD?.SAFE_SPAWN_RADIUS || 42;
    const maxRadius = (CONFIG.WORLD?.SIZE || 240) * 0.43;

    // Define biome-aligned pack centers around the island (each pack has 3-5 creatures
    // within Conway's optimal neighbor radius so reproduction works immediately).
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

    // Fill any remaining count with small sister-species pairs
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

    logger.info('ECO', `Population initiale générée : ${this.enemies.length} créatures réparties en meutes.`, {
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
      goblin: 12,
      wolf: 15,
      vulture: 17,
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
      goblin: 9,
      wolf: 13,
      vulture: 15,
      orc: 18,
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
   * individual `gestationTime` & `reproTimer`, and species `aggressiveness` & `aggroStance`.
   *
   * @param {number} x - World X position.
   * @param {number} z - World Z position.
   * @param {Object} genome - Creature Genome object.
   * @param {Array<string|number>} [parentIds=[]] - Parent IDs if born from crossover.
   * @param {Object} [options={}] - Additional spawn flags (`isPatientZero`, `spottedByScout`, `lifeStage`, `isAdult`, `age`, `gestationTime`, `reproTimer`, `aggressiveness`, `aggroStance`).
   * @returns {Object} Spawned enemy entity.
   */
  spawnEnemy(x, z, genome, parentIds = [], options = {}) {
    const safeGenome = genome || this._createSafeGenome('goblin');
    const spDef = CONFIG.SPECIES[safeGenome.speciesId] || CONFIG.SPECIES.goblin;
    const genes = safeGenome.genes || {};

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

    const id = `enemy_${this.nextEnemyId++}`;
    const y = this.terrain ? this.terrain.getHeightAt(x, z) : 0;

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

    // Aggressiveness gene & stance ('hostile' | 'territorial' | 'pacifist_apex')
    const speciesWrathActive = this.isSpeciesProvoked(safeGenome.speciesId);
    const enraged = Boolean(options.enraged || speciesWrathActive);
    const aggressiveness = enraged
      ? 1.0
      : typeof options.aggressiveness === 'number'
        ? options.aggressiveness
        : Number((genes.aggressiveness ?? spDef.baseAggressiveness ?? 0.7).toFixed(3));
    const aggroStance = enraged
      ? 'hostile'
      : options.aggroStance ||
        safeGenome.aggroStance ||
        spDef.aggroStance ||
        (safeGenome.speciesId === 'dragon' ? 'pacifist_apex' : 'hostile');

    const adultMaxHp = Math.round(genes.maxHp || spDef.baseHp || 60);
    const adultDamage = +(genes.strength || spDef.baseDamage || 10).toFixed(1);
    const babyStatMult = CONFIG.ECO?.BABY_STAT_MULT || 0.55;

    const baseCalculatedMaxHp = isAdult ? adultMaxHp : Math.max(12, Math.round(adultMaxHp * babyStatMult));
    const baseCalculatedDamage = isAdult ? adultDamage : +(adultDamage * babyStatMult).toFixed(1);
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
      });
      mesh.position.set(x, Math.max(y, CONFIG.WORLD.WATER_LEVEL + 0.2), z);
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
      state: enraged ? 'wrath_raid' : 'patrol',
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
        e.starving = starvingSet.has(e.id);
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
   * gestation) when `parentA.reproTimer >= parentA.gestationTime` in real time and a compatible
   * adult mate in Conway's optimal density window (`2..6` neighbors) is nearby.
   *
   * @param {Object} parentA
   * @returns {Object|null} Spawned baby entity or `null`.
   * @private
   */
  _tryIndividualGestationBirth(parentA) {
    if (!parentA || !parentA.isAdult || parentA.starving || parentA.lonely) return null;
    const maxPop = CONFIG.ECO?.MAX_WORLD_POPULATION || 130;
    if (this.enemies.length >= maxPop) return null;

    const neighborRadius = CONFIG.ECO?.NEIGHBOR_RADIUS || 22;
    const minDensity = CONFIG.ECO?.MIN_DENSITY || 2;
    const maxDensity = CONFIG.ECO?.MAX_DENSITY || 6;

    let neighborCount = 0;
    let bestMate = null;
    let bestFitness = -Infinity;

    for (const other of this.enemies) {
      if (!other || other.id === parentA.id || other.hp <= 0) continue;
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

    // Check cell biomass if ecoSim grid is available
    if (this.ecoSim && typeof this.ecoSim.getCellAt === 'function') {
      const cell = this.ecoSim.getCellAt(parentA.x, parentA.z);
      if (cell && cell.biomass < 18) return null;
      if (cell) {
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
   * Updates all enemies, eco-tick timers, individual gestation timers, wild species repopulation,
   * juvenile-to-adult maturation, starvation damage, peaceful/enraged Dragon AI, pack movement,
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

    // 1. Automatic Genetic Eco-Tick Timer & Wild Species Repopulation (paused during Acts 1–6 of the guided tutorial)
    if (!this.ecoPaused) {
      this.ecoTickTimer += dt;
      this.timeUntilNextTick = Math.max(0, this.ecoTickInterval - this.ecoTickTimer);
      this.ecoTickProgress = clamp(this.ecoTickTimer / this.ecoTickInterval, 0, 1);

      // Continuous Wild Species Repopulation when any base species drops < 2
      this.checkAndRepopulateSpecies(dt, false);

      if (this.ecoTickTimer >= this.ecoTickInterval) {
        this.triggerEcoTick();
      }
    }

    const worldHalf = (CONFIG.WORLD?.SIZE || 240) * 0.45;
    const bastionRadius = CONFIG.BASTION?.RADIUS || 14;
    const starvationDps = CONFIG.ECO?.STARVATION_DPS || 4.5;

    // 2. Update Each Enemy Entity
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);

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
          // Player has engaged the Juvenile Patient Zero; unfreeze with ~25% remaining timer
          enemy.freezeMaturationAt80 = false;
          enemy.age = Math.min(enemy.age, matTime * 0.75);
        } else {
          // Cap maturation at 80% while player is still traveling so they are guaranteed to face a Baby
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
        // Fast breeders (e.g. Goblins at 9s gestation < 12s Eco-Tick) can give birth continuously in real time
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
              this.onLineageEradicated
            );
            if (dotRes.killed) {
              continue;
            }
          }
        }
      } else {
        enemy.dotTickTimer = 0;
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

      // Starvation HP drain & migration pressure (unprovoked peaceful Sovereign Dragons have ancient volcanic reserves)
      const isPeacefulApex = this.isPeacefulTowardsPlayer(enemy);
      if (enemy.starving && !isPeacefulApex) {
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
      const effectiveAggroRadius = isPeacefulApex
        ? 0
        : isTerritorialUnprovoked
          ? rawAggroRadius * (0.52 + 0.45 * (enemy.aggressiveness ?? 0.48))
          : rawAggroRadius * (0.85 + 0.3 * (enemy.aggressiveness ?? 0.75));

      let targetX = null;
      let targetZ = null;
      let targetType = null;
      let targetEntity = null;
      let nearestDist = Infinity;

      if (!isPeacefulApex) {
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
      if (enemy.y < CONFIG.WORLD.WATER_LEVEL + 0.1) {
        const toCenter = Math.atan2(-enemy.z, -enemy.x);
        enemy.x += Math.cos(toCenter) * moveSpeed * dt * 1.5;
        enemy.z += Math.sin(toCenter) * moveSpeed * dt * 1.5;
        enemy.wanderAngle = toCenter;
        enemy.y = this.terrain ? this.terrain.getHeightAt(enemy.x, enemy.z) : 0;
      }

      // Sync 3D Mesh & Animation
      if (enemy.mesh) {
        enemy.mesh.position.set(enemy.x, Math.max(enemy.y, CONFIG.WORLD.WATER_LEVEL + 0.1), enemy.z);
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
      if (other.id === enemy.id) continue;
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

    if (targetType === 'player' && targetEntity) {
      if (typeof targetEntity.takeDamage === 'function') {
        targetEntity.takeDamage(enemy.damage, isElemental, enemy, damageType);
      } else {
        targetEntity.hp = Math.max(0, targetEntity.hp - enemy.damage);
      }
    } else if (targetType === 'npc' && targetEntity && bastionAndNpcs) {
      if (typeof bastionAndNpcs.damageNpc === 'function') {
        bastionAndNpcs.damageNpc(targetEntity.id, enemy.damage);
      } else {
        targetEntity.hp = Math.max(0, targetEntity.hp - enemy.damage);
      }
    } else if (targetType === 'bastion' && bastionAndNpcs) {
      if (typeof bastionAndNpcs.damageBastion === 'function') {
        const thorns = bastionAndNpcs.damageBastion(enemy.damage);
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
      damage: enemy.damage * 0.85,
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
   * If the damaged enemy is an unprovoked peaceful Sovereign Dragon (`aggroStance === 'pacifist_apex'`),
   * immediately triggers `provokeSpecies('dragon', enemy)` so the entire Dragon species charges the
   * Player and Bastion! Also checks for complete eradication of a mutant lineage when a carrier dies.
   *
   * @param {string|Object} enemyIdOrObj - Enemy ID string or enemy object.
   * @param {number} amount - Damage amount.
   * @param {{x: number, z: number}|THREE.Vector3|null} [knockbackDir=null] - Normalized knockback vector.
   * @param {Function|null} [onLineageEradicated=null] - Optional eradication callback.
   * @returns {{ killed: boolean, enemy: Object|null, xpGained: number }}
   */
  damageEnemy(enemyIdOrObj, amount, knockbackDir = null, onLineageEradicated = null) {
    const targetId = typeof enemyIdOrObj === 'object' ? enemyIdOrObj?.id : enemyIdOrObj;
    const idx = this.enemies.findIndex((e) => e.id === targetId);
    if (idx === -1) {
      return { killed: false, enemy: null, xpGained: 0 };
    }

    const enemy = this.enemies[idx];

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
      const spDef = CONFIG.SPECIES[enemy.genome?.speciesId] || CONFIG.SPECIES.goblin;
      const baseXp = spDef.xpReward || 20;
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
        this.playerRef.recordEnemyKill(enemy, xpGained);
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
