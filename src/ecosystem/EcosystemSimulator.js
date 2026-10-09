/**
 * @fileoverview Conway's Game of Life Spatial Density & Darwinian Ecosystem Simulator.
 *
 * This module implements `EcosystemSimulator`, which governs the macro-ecological and evolutionary
 * dynamics of Genesis Bastion across a 2D spatial grid (`24x24` cells over the `240x240` island).
 *
 * Core Mechanics:
 * 1. **Spatial Biomass Grid**: Tracks per-cell plant/prey biomass, biome-dependent regeneration,
 *    metabolic consumption (with `0.5x` metabolic weight for juveniles/babies), and dominant species.
 * 2. **Conway's Game of Life + Ecological Carrying Capacity**:
 *    - **Underpopulation (Allee Effect, `< 2` neighbors within radius `22`)**: Creatures become
 *      `lonely = true` and cannot reproduce.
 *    - **Overpopulation / Famine (`> 6` creatures in cell or `biomass <= 10`)**: Creatures become
 *      `starving = true`, suffer starvation HP drain, migrate outward toward greener cells/Bastion,
 *      and cannot reproduce.
 *    - **Optimal Window (`2..6` neighbors & sufficient biomass)**: Adult creatures (`isAdult !== false`
 *      and `lifeStage !== 'baby'`) reproduce via sexual genetic crossover (`Genome.crossover`).
 * 3. **Juvenile -> Adult Maturation Gate**: All newborn offspring start as babies (`lifeStage: 'baby'`,
 *    `isAdult: false`, `age: 0`, `maturationTime: CONFIG.ECO.MATURATION_TIME`) and cannot reproduce
 *    until they reach adulthood, giving the player a tactical window to hunt down a juvenile mutant
 *    before it spreads its genes.
 * 4. **Darwinian Fitness Selection & Phylogenetic Hybridization**: Mate choice is weighted by
 *    `genome.fitnessScore`, allowing dominant mutations (e.g. `pyro_gland` "Troll de Feu") and
 *    inter-species hybrids (`Goblorc`, `Olog-Troll`, `Griffon Sauvage`) to sweep through habitats.
 * 5. **Patient Zero & Scout Discovery Registry**: Tracks the first carrier of every mutation and
 *    hybrid lineage, updating live positions and epidemic statuses (`latent`, `spreading`,
 *    `dominant`, `eradicated`) for the HUD and Minimap radar.
 */

import { CONFIG } from '../config.js';
import { Genome } from './Genome.js';
import { canHybridize, getHybridProbability, createHybridSpec } from './Phylogeny.js';
import { dist2D, clamp } from '../utils/math.js';
import { logger } from '../utils/logger.js';

/**
 * Biome-specific biomass regeneration multipliers.
 * @type {Readonly<Record<string, number>>}
 */
const BIOME_REGEN_MULTIPLIERS = Object.freeze({
  forest: 1.28,
  plains: 1.15,
  highlands: 0.92,
  volcanic: 0.78,
  beach: 0.68,
});

/**
 * Biome-specific carrying capacity (max biomass) multipliers.
 * @type {Readonly<Record<string, number>>}
 */
const BIOME_MAX_BIOMASS_MULTIPLIERS = Object.freeze({
  forest: 1.25,
  plains: 1.15,
  highlands: 0.95,
  volcanic: 0.80,
  beach: 0.70,
});

/**
 * Simulates the spatial Game of Life population dynamics, biomass economy, Darwinian mate selection,
 * and mutant/hybrid lineage tracking across the island.
 */
export class EcosystemSimulator {
  /**
   * @param {object} [options={}] - Optional configuration overrides.
   * @param {Function} [options.rng=Math.random] - Random number generator function or `SeededRNG`.
   */
  constructor(options = {}) {
    /** @type {Function} */
    this.rng =
      typeof options.rng === 'function'
        ? options.rng
        : options.rng && typeof options.rng.asFunction === 'function'
          ? options.rng.asFunction()
          : Math.random;

    /** @type {number} */
    this.worldSize = CONFIG?.WORLD?.SIZE ?? 240;

    /** @type {number} */
    this.gridCells = CONFIG?.WORLD?.GRID_CELLS ?? 24;

    /** @type {number} */
    this.cellSize = this.worldSize / this.gridCells;

    /** @type {number} */
    this.halfWorld = this.worldSize * 0.5;

    /** @type {number} */
    this.tickNumber = 0;

    /**
     * 2D array `[row][col]` of spatial ecosystem cells.
     * @type {Array<Array<object>>}
     */
    this.grid = [];

    /**
     * Flat 1D array of all `gridCells * gridCells` cell objects for fast iteration & HUD snapshots.
     * @type {Array<object>}
     */
    this.cells = [];

    /**
     * Tracks the first carrier ("Patient Zero") and metadata for each mutation or hybrid lineage ID.
     * @type {Map<string, {
     *   id: string,
     *   name: string,
     *   type: 'mutation'|'hybrid',
     *   colorHex: number,
     *   colorCss: string,
     *   patientZeroId: string,
     *   patientZeroPos: { x: number, z: number },
     *   firstSeenTick: number,
     *   generationMax: number,
     *   speciesName: string
     * }>}
     */
    this.patientZeroMap = new Map();

    /**
     * Set of mutation IDs and hybrid species IDs discovered by allied Scouts (Éclaireurs).
     * @type {Set<string>}
     */
    this.discoveredMutations = new Set();

    /**
     * Last computed ecosystem summary statistics.
     * @type {object}
     */
    this.lastStats = {
      totalPopulation: 0,
      adultCount: 0,
      babyCount: 0,
      birthsCount: 0,
      hybridsBorn: 0,
      newMutationsCount: 0,
      starvingCount: 0,
      lonelyCount: 0,
      optimalCount: 0,
      activeMutants: 0,
      activeHybrids: 0,
      averageFitness: 1.0,
      totalBiomass: 0,
    };

    this._initGrid();
  }

  /**
   * Initializes the `24x24` spatial grid cells across `[-halfWorld, +halfWorld]`.
   * @private
   */
  _initGrid() {
    const baseBiomass = CONFIG?.ECO?.BASE_BIOMASS ?? 100;
    this.grid = [];
    this.cells = [];

    for (let row = 0; row < this.gridCells; row += 1) {
      const rowArr = [];
      const zCenter = -this.halfWorld + (row + 0.5) * this.cellSize;
      for (let col = 0; col < this.gridCells; col += 1) {
        const xCenter = -this.halfWorld + (col + 0.5) * this.cellSize;
        const cell = {
          row,
          col,
          xCenter: Number(xCenter.toFixed(2)),
          zCenter: Number(zCenter.toFixed(2)),
          biomass: baseBiomass,
          maxBiomass: baseBiomass,
          enemyCount: 0,
          adultCount: 0,
          babyCount: 0,
          densityState: 'empty',
          dominantSpecies: null,
          biome: 'plains',
        };
        rowArr.push(cell);
        this.cells.push(cell);
      }
      this.grid.push(rowArr);
    }
  }

  /**
   * Samples a uniform float in `[0, 1)`.
   * @private
   * @returns {number}
   */
  _rand() {
    const v = this.rng();
    return Number.isFinite(v) ? clamp(v, 0, 0.9999999) : Math.random();
  }

  /**
   * Retrieves the spatial grid cell containing world coordinates `(x, z)`.
   * Coordinates outside the world bounds are safely clamped to the nearest edge cell.
   *
   * @param {number} x - World X coordinate.
   * @param {number} z - World Z coordinate.
   * @returns {object} Grid cell object `{ row, col, xCenter, zCenter, biomass, maxBiomass, enemyCount, densityState, dominantSpecies }`.
   */
  getCellAt(x, z) {
    const safeX = Number.isFinite(x) ? x : 0;
    const safeZ = Number.isFinite(z) ? z : 0;
    const col = clamp(
      Math.floor((safeX + this.halfWorld) / this.cellSize),
      0,
      this.gridCells - 1
    );
    const row = clamp(
      Math.floor((safeZ + this.halfWorld) / this.cellSize),
      0,
      this.gridCells - 1
    );
    return this.grid[row][col];
  }

  /**
   * Returns a shallow snapshot array of all spatial grid cells for Minimap heatmap rendering and HUD inspection.
   *
   * @returns {Array<object>} Array of `gridCells * gridCells` cell objects.
   */
  getGridSnapshot() {
    return this.cells.map((cell) => ({ ...cell }));
  }

  /**
   * Registers a carrier in `patientZeroMap` if its mutation or hybrid lineage has not yet been recorded
   * (or if the lineage is re-emerging after previous eradication).
   *
   * @private
   * @param {object} enemy - Enemy entity or birth record with `{ id, x, z, genome }`.
   * @param {boolean} [forcePatientZeroFlag=false] - Whether to set `enemy.isPatientZero = true` on first sight.
   */
  _ensureLineageTracked(enemy, forcePatientZeroFlag = false) {
    if (!enemy || !enemy.genome) return;
    const genome = enemy.genome;
    const pos = {
      x: Number((enemy.x ?? enemy.mesh?.position?.x ?? 0).toFixed(1)),
      z: Number((enemy.z ?? enemy.mesh?.position?.z ?? 0).toFixed(1)),
    };

    // Track mutations
    if (Array.isArray(genome.mutations)) {
      for (const mutId of genome.mutations) {
        const mutDef = CONFIG?.MUTATIONS?.[mutId];
        if (!mutDef) continue;
        const existing = this.patientZeroMap.get(mutId);
        if (!existing) {
          if (forcePatientZeroFlag) {
            enemy.isPatientZero = true;
          }
          this.patientZeroMap.set(mutId, {
            id: mutId,
            name: mutDef.name || mutId,
            shortLabel: mutDef.shortLabel || mutId,
            type: 'mutation',
            colorHex: mutDef.colorHex ?? 0xff4500,
            colorCss: mutDef.colorCss || '#ff4500',
            patientZeroId: enemy.id || 'patient_zero',
            patientZeroPos: pos,
            firstSeenTick: this.tickNumber,
            generationMax: genome.generation || 1,
            speciesName: genome.speciesName || genome.speciesId,
          });
        } else {
          existing.generationMax = Math.max(existing.generationMax, genome.generation || 1);
          if (existing.patientZeroId === enemy.id) {
            existing.patientZeroPos = pos;
          }
        }
        if (enemy.spottedByScout) {
          this.discoveredMutations.add(mutId);
        }
      }
    }

    // Track inter-species hybrids
    if (genome.isHybrid && genome.speciesId) {
      const hybId = genome.speciesId;
      const existingHyb = this.patientZeroMap.get(hybId);
      const hybSpec = createHybridSpec(
        genome.hybridParents?.[0] || hybId,
        genome.hybridParents?.[1]
      );
      if (!existingHyb) {
        if (forcePatientZeroFlag) {
          enemy.isPatientZero = true;
        }
        this.patientZeroMap.set(hybId, {
          id: hybId,
          name: genome.speciesName || hybSpec.name || hybId,
          shortLabel: 'Hybride',
          type: 'hybrid',
          colorHex: hybSpec.colorHex ?? 0xe6a145,
          colorCss: hybSpec.colorCss || hybSpec.color || '#e6a145',
          patientZeroId: enemy.id || 'hybrid_zero',
          patientZeroPos: pos,
          firstSeenTick: this.tickNumber,
          generationMax: genome.generation || 1,
          speciesName: genome.speciesName || hybSpec.name,
        });
      } else {
        existingHyb.generationMax = Math.max(existingHyb.generationMax, genome.generation || 1);
        if (existingHyb.patientZeroId === enemy.id) {
          existingHyb.patientZeroPos = pos;
        }
      }
      if (enemy.spottedByScout) {
        this.discoveredMutations.add(hybId);
      }
    }
  }

  /**
   * Selects a mate from `candidates` using Darwinian fitness-proportional roulette wheel selection.
   *
   * @private
   * @param {Array<{ enemy: object, weight: number }>} weightedCandidates
   * @returns {object|null} Selected partner enemy or `null`.
   */
  _selectWeightedMate(weightedCandidates) {
    if (!weightedCandidates || weightedCandidates.length === 0) return null;
    let totalWeight = 0;
    for (const item of weightedCandidates) {
      totalWeight += Math.max(0.01, item.weight);
    }
    if (totalWeight <= 0) {
      return weightedCandidates[0].enemy;
    }
    let roll = this._rand() * totalWeight;
    for (const item of weightedCandidates) {
      roll -= Math.max(0.01, item.weight);
      if (roll <= 0) {
        return item.enemy;
      }
    }
    return weightedCandidates[weightedCandidates.length - 1].enemy;
  }

  /**
   * Executes one full Conway's Game of Life + Darwinian Genetic Evolution step (`stepEcoTick`).
   *
   * Rules enforced:
   * 1. **Cell Biomass & Density Update**: Counts all live creatures per cell. Babies (`isAdult === false`
   *    or `lifeStage === 'baby'`) consume half metabolic biomass (`0.5x`), while adults consume `1.0x`.
   *    Cells regenerate biomass according to their biome.
   * 2. **Underpopulation (Allee Effect)**: If local neighbor count within `CONFIG.ECO.NEIGHBOR_RADIUS` (`22`)
   *    is `< CONFIG.ECO.MIN_DENSITY` (`< 2`), the creature is marked `lonely = true` and cannot reproduce.
   * 3. **Overpopulation / Famine**: If cell enemy count `> CONFIG.ECO.MAX_DENSITY` (`> 6`) OR cell
   *    `biomass <= 10`, creatures in that cell are marked `starving = true` and cannot reproduce.
   * 4. **Optimal Window (`2..6` neighbors & `biomass > 10`)**: Creatures are marked optimal. Only
   *    **Adult** creatures (`enemy.isAdult !== false && enemy.lifeStage !== 'baby'`) can pair up and
   *    reproduce! Parent selection is weighted by **Darwinian `fitnessScore`**, producing juvenile
   *    offspring (`lifeStage: 'baby'`, `isAdult: false`, `age: 0`) via `Genome.crossover`.
   *
   * @param {Array<object>} [enemies=[]] - Array of live enemy entities in the world.
   * @param {Function} [getBiomeAt] - Optional callback `(x, z) => biomeId` from `Terrain`.
   * @returns {{
   *   tickNumber: number,
   *   births: Array<object>,
   *   starvingIds: string[],
   *   lonelyIds: string[],
   *   optimalIds: string[],
   *   stats: object
   * }} Tick outcomes and evolutionary telemetry.
   */
  stepEcoTick(enemies = [], getBiomeAt = null) {
    this.tickNumber += 1;

    const liveEnemies = Array.isArray(enemies)
      ? enemies.filter((e) => e && (e.hp === undefined || e.hp > 0))
      : [];

    const baseBiomass = CONFIG?.ECO?.BASE_BIOMASS ?? 100;
    const baseRegen = CONFIG?.ECO?.BIOMASS_REGEN ?? 18;
    const minDensity = CONFIG?.ECO?.MIN_DENSITY ?? 2;
    const maxDensity = CONFIG?.ECO?.MAX_DENSITY ?? 6;
    const neighborRadius = CONFIG?.ECO?.NEIGHBOR_RADIUS ?? 22;
    const birthBiomassCost = CONFIG?.ECO?.BIRTH_BIOMASS_COST ?? 22;
    const maxWorldPop = CONFIG?.ECO?.MAX_WORLD_POPULATION ?? 130;

    // 1. Reset per-tick cell counters and apply biome-scaled biomass regeneration
    const cellMembersMap = new Map();
    for (const cell of this.cells) {
      if (typeof getBiomeAt === 'function') {
        cell.biome = getBiomeAt(cell.xCenter, cell.zCenter) || 'plains';
      }
      const maxMult = BIOME_MAX_BIOMASS_MULTIPLIERS[cell.biome] ?? 1.0;
      const regenMult = BIOME_REGEN_MULTIPLIERS[cell.biome] ?? 1.0;
      cell.maxBiomass = Math.round(baseBiomass * maxMult);
      cell.biomass = clamp(cell.biomass + baseRegen * regenMult, 0, cell.maxBiomass);
      cell.enemyCount = 0;
      cell.adultCount = 0;
      cell.babyCount = 0;
      cell.dominantSpecies = null;
      cell.densityState = 'empty';
    }

    // 2. Assign enemies to cells, sync genomes, and consume cell biomass
    for (const enemy of liveEnemies) {
      if (!(enemy.genome instanceof Genome)) {
        enemy.genome = new Genome(enemy.genome || { speciesId: enemy.speciesId || 'goblin' });
      } else {
        enemy.genome.syncMutations();
      }

      // Promote baby if age has already reached maturationTime before tick
      if (
        (enemy.lifeStage === 'baby' || enemy.isAdult === false) &&
        typeof enemy.age === 'number' &&
        enemy.age >= (enemy.maturationTime || CONFIG?.ECO?.MATURATION_TIME || 20)
      ) {
        enemy.lifeStage = 'adult';
        enemy.isAdult = true;
      }

      this._ensureLineageTracked(enemy, false);

      const ex = enemy.x ?? enemy.mesh?.position?.x ?? 0;
      const ez = enemy.z ?? enemy.mesh?.position?.z ?? 0;
      const cell = this.getCellAt(ex, ez);

      cell.enemyCount += 1;
      const isBaby = enemy.isAdult === false || enemy.lifeStage === 'baby';
      if (isBaby) {
        cell.babyCount += 1;
      } else {
        cell.adultCount += 1;
      }

      if (!cellMembersMap.has(cell)) {
        cellMembersMap.set(cell, []);
      }
      cellMembersMap.get(cell).push(enemy);

      // Metabolic biomass consumption (0.5x metabolic weight for babies!)
      const rawMetabolism = enemy.genome.genes?.metabolism ?? 4.0;
      const metabolicWeight = isBaby ? 0.5 : 1.0;
      const consumed = rawMetabolism * metabolicWeight * 0.72;
      cell.biomass = Math.max(0, Number((cell.biomass - consumed).toFixed(2)));
    }

    // Determine dominant species per occupied cell
    for (const [cell, members] of cellMembersMap.entries()) {
      const counts = new Map();
      let bestSp = null;
      let bestCount = 0;
      for (const m of members) {
        const sp = m.genome?.speciesId || 'goblin';
        const c = (counts.get(sp) || 0) + 1;
        counts.set(sp, c);
        if (c > bestCount) {
          bestCount = c;
          bestSp = sp;
        }
      }
      cell.dominantSpecies = bestSp;
    }

    // 3. Evaluate Conway's Game of Life Density & Carrying Capacity Rules per individual
    const starvingIds = [];
    const lonelyIds = [];
    const optimalIds = [];
    const optimalAdults = [];

    for (let i = 0; i < liveEnemies.length; i += 1) {
      const e = liveEnemies[i];
      const ex = e.x ?? e.mesh?.position?.x ?? 0;
      const ez = e.z ?? e.mesh?.position?.z ?? 0;
      const cell = this.getCellAt(ex, ez);

      // Count neighbors within radius 22 (`CONFIG.ECO.NEIGHBOR_RADIUS`)
      let neighborCount = 0;
      for (let j = 0; j < liveEnemies.length; j += 1) {
        if (i === j) continue;
        const other = liveEnemies[j];
        const ox = other.x ?? other.mesh?.position?.x ?? 0;
        const oz = other.z ?? other.mesh?.position?.z ?? 0;
        if (dist2D(ex, ez, ox, oz) <= neighborRadius) {
          neighborCount += 1;
        }
      }

      e.neighborCount = neighborCount;

      // Rule 2: Overpopulation / Famine (cell enemyCount > 6 OR local crowding > 8 OR cell biomass <= 10)
      if (cell.enemyCount > maxDensity || neighborCount > maxDensity + 2 || cell.biomass <= 10) {
        e.starving = true;
        e.lonely = false;
        if (e.id) starvingIds.push(e.id);
      } else if (neighborCount < minDensity) {
        // Rule 1: Underpopulation / Allee Effect (< 2 neighbors within radius 22)
        e.lonely = true;
        e.starving = false;
        if (e.id) lonelyIds.push(e.id);
      } else {
        // Rule 3: Optimal Reproduction Window (2..6 neighbors and biomass > 10)
        e.lonely = false;
        e.starving = false;
        if (e.id) optimalIds.push(e.id);

        // Only ADULTS can reproduce! Babies must mature first.
        const isAdult = e.isAdult !== false && e.lifeStage !== 'baby';
        if (isAdult) {
          optimalAdults.push(e);
        }
      }
    }

    // Update each cell's densityState for the Minimap & HUD heatmap
    for (const cell of this.cells) {
      if (cell.enemyCount === 0) {
        cell.densityState = 'empty';
      } else if (cell.enemyCount > maxDensity || cell.biomass <= 10) {
        cell.densityState = 'overpopulated';
      } else {
        const members = cellMembersMap.get(cell) || [];
        const hasOptimalMember = members.some((m) => !m.lonely && !m.starving);
        if (hasOptimalMember || (cell.enemyCount >= minDensity && cell.enemyCount <= maxDensity)) {
          cell.densityState = 'optimal';
        } else {
          cell.densityState = 'underpopulated';
        }
      }
      cell.biomass = Number(cell.biomass.toFixed(1));
    }

    // 4. Darwinian Fitness-Weighted Mate Selection & Reproduction (Optimal Adults Only)
    // Sort eligible adults by fitnessScore descending so adapted mutants & hybrids have priority access to mates
    optimalAdults.sort((a, b) => (b.genome?.fitnessScore || 1) - (a.genome?.fitnessScore || 1));

    const matedThisTick = new Set();
    const births = [];
    let hybridsBornThisTick = 0;
    let newMutationsThisTick = 0;
    const matingSearchRadius = neighborRadius * 1.25;
    const safeBastionRadius = CONFIG?.WORLD?.SAFE_SPAWN_RADIUS ?? 42;

    for (const parentA of optimalAdults) {
      if (liveEnemies.length + births.length >= maxWorldPop) break;
      if (matedThisTick.has(parentA)) continue;

      const ax = parentA.x ?? parentA.mesh?.position?.x ?? 0;
      const az = parentA.z ?? parentA.mesh?.position?.z ?? 0;
      const cellA = this.getCellAt(ax, az);

      // Require sufficient cell biomass for reproduction
      if (cellA.biomass < Math.min(16, birthBiomassCost * 0.75)) continue;

      // Gather compatible unmated adult candidates within mating radius
      const sameSpeciesCandidates = [];
      const hybridCandidates = [];

      for (const candidate of optimalAdults) {
        if (candidate === parentA || matedThisTick.has(candidate)) continue;
        const cx = candidate.x ?? candidate.mesh?.position?.x ?? 0;
        const cz = candidate.z ?? candidate.mesh?.position?.z ?? 0;
        const d = dist2D(ax, az, cx, cz);
        if (d > matingSearchRadius) continue;

        const candFitness = candidate.genome?.fitnessScore || 1.0;
        // Quadratic fitness weighting ensures strong Darwinian selection for beneficial mutations
        const fitnessWeight = Math.pow(candFitness, 2.1);

        if (candidate.genome.speciesId === parentA.genome.speciesId) {
          sameSpeciesCandidates.push({
            enemy: candidate,
            weight: fitnessWeight,
            isInterSpecies: false,
            hybridProb: 0,
          });
        } else if (canHybridize(parentA.genome.speciesId, candidate.genome.speciesId)) {
          const hybProb = getHybridProbability(
            parentA.genome.speciesId,
            candidate.genome.speciesId
          );
          if (hybProb > 0) {
            hybridCandidates.push({
              enemy: candidate,
              weight: fitnessWeight * (0.85 + hybProb * 2.0),
              isInterSpecies: true,
              hybridProb: hybProb,
            });
          }
        }
      }

      if (sameSpeciesCandidates.length === 0 && hybridCandidates.length === 0) {
        continue;
      }

      // Decide between conspecific mating and inter-species hybridization
      let chosenPartner = null;
      if (hybridCandidates.length > 0 && sameSpeciesCandidates.length > 0) {
        const bestHybProb = Math.max(...hybridCandidates.map((c) => c.hybridProb));
        if (this._rand() < bestHybProb) {
          chosenPartner = this._selectWeightedMate(hybridCandidates);
        } else {
          chosenPartner = this._selectWeightedMate(sameSpeciesCandidates);
        }
      } else if (sameSpeciesCandidates.length > 0) {
        chosenPartner = this._selectWeightedMate(sameSpeciesCandidates);
      } else if (hybridCandidates.length > 0) {
        // When only a compatible sister species is nearby in optimal density, hybridize at elevated rate
        const maxHybProb = Math.max(...hybridCandidates.map((c) => c.hybridProb));
        if (this._rand() < Math.min(0.65, maxHybProb * 2.2)) {
          chosenPartner = this._selectWeightedMate(hybridCandidates);
        }
      }

      if (!chosenPartner) continue;

      // Evaluate fertility & fitness-boosted birth roll
      const fertA = parentA.genome?.genes?.fertility ?? 1.0;
      const fertB = chosenPartner.genome?.genes?.fertility ?? 1.0;
      const fitA = parentA.genome?.fitnessScore ?? 1.0;
      const fitB = chosenPartner.genome?.fitnessScore ?? 1.0;
      const hasMutantParent =
        (parentA.genome?.mutations?.length || 0) > 0 ||
        (chosenPartner.genome?.mutations?.length || 0) > 0;

      const meanFertility = (fertA + fertB) * 0.5;
      const meanFitness = (fitA + fitB) * 0.5;
      const reproChance = clamp(
        0.46 * meanFertility * Math.pow(meanFitness, 0.65) * (hasMutantParent ? 1.22 : 1.0),
        0.22,
        0.92
      );

      if (this._rand() > reproChance) continue;

      // Mark both parents as having reproduced this tick
      matedThisTick.add(parentA);
      matedThisTick.add(chosenPartner);

      // Consume cell biomass for gestation/birth
      cellA.biomass = Number(Math.max(11, cellA.biomass - birthBiomassCost).toFixed(1));

      // Perform genetic crossover, Mendelian dominant inheritance, and de novo mutation roll
      const { genome: childGenome, newMutationId, becameHybrid } = Genome.crossover(
        parentA.genome,
        chosenPartner.genome,
        () => this._rand()
      );

      // Compute birth coordinates near parents
      const bxRaw = (ax + (chosenPartner.x ?? chosenPartner.mesh?.position?.x ?? ax)) * 0.5;
      const bzRaw = (az + (chosenPartner.z ?? chosenPartner.mesh?.position?.z ?? az)) * 0.5;
      const angle = this._rand() * Math.PI * 2;
      const offsetDist = 2.2 + this._rand() * 3.2;
      let bx = clamp(bxRaw + Math.cos(angle) * offsetDist, -this.halfWorld + 12, this.halfWorld - 12);
      let bz = clamp(bzRaw + Math.sin(angle) * offsetDist, -this.halfWorld + 12, this.halfWorld - 12);

      // Keep wild births outside the central Bastion sanctuary ring
      const distFromBastion = Math.hypot(bx, bz);
      if (distFromBastion < safeBastionRadius) {
        const pushAngle = Math.atan2(bz || 1, bx || 1);
        bx = Math.cos(pushAngle) * (safeBastionRadius + 3);
        bz = Math.sin(pushAngle) * (safeBastionRadius + 3);
      }

      // Check if this offspring is the first carrier ("Patient Zero") of a new mutation or hybrid
      let isPatientZero = false;
      if (newMutationId && !this.patientZeroMap.has(newMutationId)) {
        isPatientZero = true;
      }
      if (becameHybrid && !this.patientZeroMap.has(childGenome.speciesId)) {
        isPatientZero = true;
      }

      const birthRecord = {
        id: `birth_t${this.tickNumber}_${births.length + 1}`,
        genome: childGenome,
        x: Number(bx.toFixed(2)),
        z: Number(bz.toFixed(2)),
        speciesId: childGenome.speciesId,
        speciesName: childGenome.speciesName,
        parentIds: [parentA.id, chosenPartner.id].filter(Boolean),
        parentAId: parentA.id || null,
        parentBId: chosenPartner.id || null,
        isHybrid: childGenome.isHybrid,
        becameHybrid,
        newMutationId,
        mutations: [...childGenome.mutations],
        isPatientZero,
        // Juvenile / Baby lifecycle attributes (Directive #8)
        lifeStage: 'baby',
        isAdult: false,
        age: 0,
        maturationTime: CONFIG?.ECO?.MATURATION_TIME ?? 20,
        scaleMultiplier: CONFIG?.ECO?.BABY_SCALE ?? 0.5,
        statMultiplier: CONFIG?.ECO?.BABY_STAT_MULT ?? 0.55,
      };

      this._ensureLineageTracked(birthRecord, isPatientZero);

      if (becameHybrid || childGenome.isHybrid) {
        hybridsBornThisTick += 1;
      }
      if (newMutationId) {
        newMutationsThisTick += 1;
      }

      births.push(birthRecord);
    }

    // 5. Compile Ecosystem & Evolutionary Telemetry Stats
    const totalPop = liveEnemies.length + births.length;
    const adultCount = liveEnemies.filter(
      (e) => e.isAdult !== false && e.lifeStage !== 'baby'
    ).length;
    const babyCount =
      liveEnemies.filter((e) => e.isAdult === false || e.lifeStage === 'baby').length +
      births.length;

    const activeMutants =
      liveEnemies.filter((e) => (e.genome?.mutations?.length || 0) > 0).length +
      births.filter((b) => (b.genome?.mutations?.length || 0) > 0).length;

    const activeHybrids =
      liveEnemies.filter((e) => Boolean(e.genome?.isHybrid)).length +
      births.filter((b) => Boolean(b.genome?.isHybrid)).length;

    let fitnessSum = 0;
    for (const e of liveEnemies) {
      fitnessSum += e.genome?.fitnessScore || 1.0;
    }
    for (const b of births) {
      fitnessSum += b.genome?.fitnessScore || 1.0;
    }
    const averageFitness = totalPop > 0 ? Number((fitnessSum / totalPop).toFixed(3)) : 1.0;

    let totalBiomass = 0;
    for (const cell of this.cells) {
      totalBiomass += cell.biomass;
    }

    this.lastStats = {
      tickNumber: this.tickNumber,
      totalPopulation: totalPop,
      adultCount,
      babyCount,
      birthsCount: births.length,
      hybridsBorn: hybridsBornThisTick,
      newMutationsCount: newMutationsThisTick,
      starvingCount: starvingIds.length,
      lonelyCount: lonelyIds.length,
      optimalCount: optimalIds.length,
      activeMutants,
      activeHybrids,
      averageFitness,
      totalBiomass: Math.round(totalBiomass),
    };

    logger.info(
      'ECO',
      `Cycle écologique #${this.tickNumber} : Pop=${totalPop} (${adultCount} adultes, ${babyCount} bébés) | Naissances=${births.length} | Mutants=${activeMutants} | Hybrides=${activeHybrids} | Famine=${starvingIds.length}`,
      this.lastStats
    );

    return {
      tickNumber: this.tickNumber,
      births,
      starvingIds,
      lonelyIds,
      optimalIds,
      stats: this.lastStats,
    };
  }

  /**
   * Marks a mutation or hybrid lineage as discovered by a Scout (Éclaireur), unlocking it in
   * the HUD Genetic Radar and Phylogenetic Codex.
   *
   * @param {string} mutationOrHybridId - Mutation key (e.g. `'pyro_gland'`) or hybrid species ID (e.g. `'orc_troll'`).
   * @param {string} [enemyId] - Optional ID of the carrier spotted by the Scout.
   * @returns {boolean} True if this was a brand-new discovery.
   */
  markMutationDiscovered(mutationOrHybridId, enemyId = null) {
    if (!mutationOrHybridId) return false;
    const key = String(mutationOrHybridId).trim();
    const wasNew = !this.discoveredMutations.has(key);
    this.discoveredMutations.add(key);

    if (enemyId && this.patientZeroMap.has(key)) {
      const entry = this.patientZeroMap.get(key);
      if (!entry.patientZeroId) {
        entry.patientZeroId = enemyId;
      }
    }

    if (wasNew) {
      logger.info('SCOUT', `Lignée génétique enregistrée au Codex : ${key}`, {
        lineageId: key,
        enemyId,
      });
    }
    return wasNew;
  }

  /**
   * Builds a comprehensive report of all active and historical mutation and hybrid lineages
   * in the ecosystem for the Right HUD Panel ("Radar Génétique & Lignées Mutantes"), Minimap
   * target beacons, and the Phylogenetic Codex modal.
   *
   * @param {Array<object>} [enemies=[]] - Current live enemies in the world.
   * @returns {Array<{
   *   id: string,
   *   name: string,
   *   shortLabel: string,
   *   type: 'mutation'|'hybrid',
   *   colorHex: number,
   *   colorCss: string,
   *   count: number,
   *   adultCount: number,
   *   babyCount: number,
   *   generationMax: number,
   *   discoveredByScout: boolean,
   *   patientZeroId: string|null,
   *   patientZeroPos: { x: number, z: number }|null,
   *   carrierSpecies: string[],
   *   status: 'latent'|'spreading'|'dominant'|'eradicated'
   * }>} Sorted array of lineage report entries.
   */
  getLineageReport(enemies = []) {
    const liveEnemies = Array.isArray(enemies)
      ? enemies.filter((e) => e && (e.hp === undefined || e.hp > 0))
      : [];

    // Ensure all currently living mutants/hybrids are registered in patientZeroMap
    for (const enemy of liveEnemies) {
      this._ensureLineageTracked(enemy, false);
    }

    const totalPop = Math.max(1, liveEnemies.length);
    const dominantThreshold = Math.max(5, Math.ceil(totalPop * 0.24));
    const report = [];

    for (const [key, meta] of this.patientZeroMap.entries()) {
      let carriers = [];
      if (meta.type === 'mutation') {
        carriers = liveEnemies.filter((e) => e.genome?.mutations?.includes(key));
      } else {
        carriers = liveEnemies.filter(
          (e) => e.genome?.isHybrid && e.genome?.speciesId === key
        );
      }

      const count = carriers.length;
      let adultCount = 0;
      let babyCount = 0;
      let generationMax = meta.generationMax || 1;
      let activeCarrier = null;
      const speciesSet = new Set();

      for (const c of carriers) {
        const isBaby = c.isAdult === false || c.lifeStage === 'baby';
        if (isBaby) {
          babyCount += 1;
        } else {
          adultCount += 1;
        }
        generationMax = Math.max(generationMax, c.genome?.generation || 1);
        if (c.genome?.speciesName) {
          speciesSet.add(c.genome.speciesName);
        }
        if (c.spottedByScout) {
          this.discoveredMutations.add(key);
        }
        if (c.id === meta.patientZeroId || c.isPatientZero) {
          activeCarrier = c;
        }
      }

      if (!activeCarrier && carriers.length > 0) {
        activeCarrier = carriers[0];
      }

      if (activeCarrier) {
        meta.patientZeroId = activeCarrier.id;
        meta.patientZeroPos = {
          x: Number((activeCarrier.x ?? activeCarrier.mesh?.position?.x ?? 0).toFixed(1)),
          z: Number((activeCarrier.z ?? activeCarrier.mesh?.position?.z ?? 0).toFixed(1)),
        };
      }

      meta.generationMax = generationMax;

      /** @type {'latent'|'spreading'|'dominant'|'eradicated'} */
      let status = 'latent';
      if (count === 0) {
        status = 'eradicated';
      } else if (count === 1) {
        status = 'latent';
      } else if (count >= dominantThreshold) {
        status = 'dominant';
      } else {
        status = 'spreading';
      }

      const speciesList =
        speciesSet.size > 0 ? Array.from(speciesSet) : [meta.speciesName || 'Inconnu'];

      report.push({
        id: key,
        name: meta.name,
        shortLabel: meta.shortLabel || meta.name,
        type: meta.type,
        colorHex: meta.colorHex,
        colorCss: meta.colorCss,
        color: meta.colorCss,
        count,
        adultCount,
        babyCount,
        generationMax,
        discoveredByScout: this.discoveredMutations.has(key),
        patientZeroId: meta.patientZeroId,
        patientZeroPos: meta.patientZeroPos ? { ...meta.patientZeroPos } : { x: 0, z: 0 },
        carrierSpecies: speciesList,
        speciesName: speciesList[0],
        status,
      });
    }

    // Sort active threats first (dominant -> spreading -> latent -> eradicated), then by count desc
    const statusPriority = { dominant: 0, spreading: 1, latent: 2, eradicated: 3 };
    report.sort((a, b) => {
      const pa = statusPriority[a.status] ?? 4;
      const pb = statusPriority[b.status] ?? 4;
      if (pa !== pb) return pa - pb;
      return b.count - a.count;
    });

    return report;
  }
}

export default EcosystemSimulator;
