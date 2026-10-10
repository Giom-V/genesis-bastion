/**
 * @fileoverview Darwinian Genome, Polygenic Crossover, Inter-Species Hybridization & Mendelian Dominant Mutations.
 *
 * This module defines the `Genome` class that encodes the hereditary genotype and expressed phenotype
 * of every creature in Genesis Bastion.
 *
 * Key Evolutionary Mechanics:
 * 1. **Natural Variance (Gen-1)**: `Genome.createInitial(speciesId, rng)` initializes creatures with
 *    $\pm 10\%$ polygenic variation around their foundational species baseline in `CONFIG.SPECIES`.
 * 2. **Blended Polygenic Crossover & Drift**: `Genome.crossover(parentA, parentB, rng)` blends parent
 *    genes using uniform/interpolated inheritance plus $\pm 6\%$ Gaussian micro-mutation drift.
 * 3. **Inter-Species Hybridization**: When two distinct species within `CONFIG.ECO.HYBRID_MAX_DIST`
 *    mate, `createHybridSpec` synthesizes a fertile hybrid offspring (e.g. `"Goblorc"`, `"Olog-Troll"`,
 *    `"Griffon Sauvage"`, `"Drak-Troll"`) inheriting blended base stats and hybrid vigor.
 * 4. **Mendelian Dominant Mutations**: Any adaptive mutation carried by one parent has a **78% dominant
 *    inheritance probability** (`CONFIG.ECO.DOMINANT_INHERITANCE_SINGLE`), rising to **92%**
 *    (`CONFIG.ECO.DOMINANT_INHERITANCE_BOTH`) if both parents carry it.
 * 5. **De Novo Spontaneous Mutation**: With probability `CONFIG.ECO.MUTATION_RATE` (8%), an offspring
 *    spontaneously develops a brand-new mutation from `CONFIG.MUTATIONS` that neither parent possessed.
 * 6. **Darwinian Fitness Scoring**: Computes `fitnessScore` from normalized polygenic performance and
 *    dominant mutation bonuses so stronger mutants are preferentially selected for reproduction.
 */

import { CONFIG } from '../config.js';
import { canHybridize, getHybridProbability, createHybridSpec } from './Phylogeny.js';
import { computeDetailedFitness, getMaturationProfile } from './BalanceAndPacing.js';
import { clamp, lerp } from '../utils/math.js';
import { logger } from '../utils/logger.js';

let nextLineageCounter = 1;

/**
 * Evaluates a random number in `[0, 1)` from either a function (`Math.random`) or a `SeededRNG` instance.
 *
 * @param {Function|object} [rng=Math.random] - Random generator function or `SeededRNG` object.
 * @returns {number} Pseudo-random float in `[0, 1)`.
 */
function sampleUniform(rng = Math.random) {
  if (typeof rng === 'function') {
    const val = rng();
    return Number.isFinite(val) ? clamp(val, 0, 0.9999999) : Math.random();
  }
  if (rng && typeof rng.next === 'function') {
    return clamp(rng.next(), 0, 0.9999999);
  }
  if (rng && typeof rng.random === 'function') {
    return clamp(rng.random(), 0, 0.9999999);
  }
  return Math.random();
}

/**
 * Samples an approximate Gaussian random variable centered at `0` with standard deviation `stdDev`
 * using Box-Muller transform, clamped to `[-maxAbs, maxAbs]`.
 *
 * @param {Function|object} rng - Random generator function or `SeededRNG`.
 * @param {number} [stdDev=0.03] - Standard deviation.
 * @param {number} [maxAbs=0.06] - Maximum absolute drift clamp ($\pm 6\%$ by default).
 * @returns {number} Clamped Gaussian drift value.
 */
function sampleGaussianDrift(rng, stdDev = 0.03, maxAbs = 0.06) {
  if (rng && typeof rng.gaussian === 'function') {
    return clamp(rng.gaussian(0, stdDev), -maxAbs, maxAbs);
  }
  const u1 = Math.max(1e-7, sampleUniform(rng));
  const u2 = sampleUniform(rng);
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return clamp(z0 * stdDev, -maxAbs, maxAbs);
}

/**
 * Resolves the baseline species specification for a base or hybrid species identifier.
 *
 * @param {string} speciesId - Species ID (`'goblin'`, `'troll'`, or `'goblin_orc'`).
 * @param {string[]} [hybridParents=[]] - Optional pair of parent species IDs if hybrid.
 * @returns {object} Species baseline traits.
 */
/**
 * Default Phase 5 gestation, maturation, aggressiveness, and stance profiles per foundational species.
 * @type {Readonly<Record<string, object>>}
 */
const SPECIES_CYCLE_DEFAULTS = Object.freeze({
  goblin: {
    id: 'goblin',
    name: 'Gobelin',
    clade: 'greenskin',
    baseHp: 48,
    baseDamage: 8,
    baseSpeed: 8.8,
    baseSize: 0.78,
    baseGestationTime: 9,
    baseMaturationTime: 12,
    baseAggressiveness: 0.75,
    aggroStance: 'hostile',
    autoRepopulate: true,
  },
  wolf: {
    id: 'wolf',
    name: 'Loup',
    clade: 'beast',
    baseHp: 58,
    baseDamage: 11,
    baseSpeed: 9.6,
    baseSize: 0.85,
    baseGestationTime: 13,
    baseMaturationTime: 15,
    baseAggressiveness: 0.82,
    aggroStance: 'hostile',
    autoRepopulate: true,
  },
  vulture: {
    id: 'vulture',
    name: 'Vautour',
    clade: 'beast',
    baseHp: 64,
    baseDamage: 13,
    baseSpeed: 10.2,
    baseSize: 0.9,
    baseGestationTime: 15,
    baseMaturationTime: 17,
    baseAggressiveness: 0.38,
    aggroStance: 'territorial',
    autoRepopulate: true,
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    clade: 'greenskin',
    baseHp: 95,
    baseDamage: 15,
    baseSpeed: 6.8,
    baseSize: 1.08,
    baseGestationTime: 18,
    baseMaturationTime: 22,
    baseAggressiveness: 0.88,
    aggroStance: 'hostile',
    autoRepopulate: true,
  },
  lion: {
    id: 'lion',
    name: 'Lion',
    clade: 'beast',
    baseHp: 110,
    baseDamage: 18,
    baseSpeed: 8.2,
    baseSize: 1.15,
    baseGestationTime: 24,
    baseMaturationTime: 26,
    baseAggressiveness: 0.70,
    aggroStance: 'hostile',
    autoRepopulate: true,
  },
  troll: {
    id: 'troll',
    name: 'Troll',
    clade: 'greenskin',
    baseHp: 175,
    baseDamage: 24,
    baseSpeed: 5.1,
    baseSize: 1.52,
    baseGestationTime: 30,
    baseMaturationTime: 34,
    baseAggressiveness: 0.48,
    aggroStance: 'territorial',
    autoRepopulate: true,
  },
  dragon: {
    id: 'dragon',
    name: 'Dragon',
    clade: 'apex',
    baseHp: 680,
    baseDamage: 58,
    baseSpeed: 8.2,
    baseSize: 2.05,
    baseGestationTime: 65,
    baseMaturationTime: 50,
    baseAggressiveness: 0.08,
    aggroStance: 'pacifist_apex',
    autoRepopulate: true,
  },
  shark: {
    id: 'shark',
    name: 'Requin Marcheur des Abysses',
    clade: 'abyssal',
    isAquatic: true,
    baseHp: 135,
    baseDamage: 22,
    baseSpeed: 7.8,
    baseSize: 1.25,
    baseGestationTime: 22,
    baseMaturationTime: 24,
    baseAggressiveness: 0.90,
    aggroStance: 'hostile',
    metabolism: 5.8,
    fertility: 1.0,
    aggroRadius: 24,
    autoRepopulate: true,
  },
  giant_mole: {
    id: 'giant_mole',
    name: 'Taupe Géante Fouisseuse',
    clade: 'subterranean',
    isSubterranean: true,
    baseHp: 150,
    baseDamage: 21,
    baseSpeed: 6.4,
    baseSize: 1.32,
    baseGestationTime: 20,
    baseMaturationTime: 22,
    baseAggressiveness: 0.78,
    aggroStance: 'hostile',
    metabolism: 5.5,
    fertility: 0.95,
    aggroRadius: 20,
    autoRepopulate: true,
  },
  rabbit: {
    id: 'rabbit',
    name: 'Lapin des Plaines',
    clade: 'herbivore',
    baseHp: 26,
    baseDamage: 0,
    baseSpeed: 9.8,
    baseSize: 0.58,
    baseGestationTime: 7.5,
    baseMaturationTime: 9.5,
    baseAggressiveness: 0.0,
    aggroStance: 'prey_pacifist',
    foodYield: 18,
    healYield: 12,
    biomassEnrichment: 6,
    metabolism: 1.5,
    fertility: 1.45,
    aggroRadius: 12,
    autoRepopulate: false,
  },
  deer: {
    id: 'deer',
    name: 'Biche Sylvestre',
    clade: 'herbivore',
    baseHp: 54,
    baseDamage: 0,
    baseSpeed: 10.5,
    baseSize: 1.05,
    baseGestationTime: 15,
    baseMaturationTime: 17,
    baseAggressiveness: 0.0,
    aggroStance: 'prey_pacifist',
    foodYield: 35,
    healYield: 25,
    biomassEnrichment: 6,
    metabolism: 2.2,
    fertility: 1.25,
    aggroRadius: 14,
    autoRepopulate: false,
  },
  storm_harpy: {
    id: 'storm_harpy',
    name: 'Vouivre des Nuées',
    clade: 'beast',
    isFlying: true,
    baseHp: 82,
    baseDamage: 16,
    baseSpeed: 10.8,
    baseSize: 0.96,
    baseGestationTime: 16,
    baseMaturationTime: 18,
    baseAggressiveness: 0.80,
    aggroStance: 'hostile',
    metabolism: 4.2,
    fertility: 1.1,
    aggroRadius: 26,
    autoRepopulate: true,
  },
  undead: {
    id: 'undead',
    name: 'Revenant Maudit',
    clade: 'undead',
    isNocturnalUndead: true,
    burnsInSunlight: true,
    baseHp: 115,
    baseDamage: 19,
    baseSpeed: 7.4,
    baseSize: 1.05,
    baseGestationTime: 16,
    baseMaturationTime: 14,
    baseAggressiveness: 0.95,
    aggroStance: 'hostile',
    metabolism: 2.5,
    fertility: 1.0,
    aggroRadius: 28,
    autoRepopulate: false,
  },
});

const FALLBACK_MUTATIONS = Object.freeze({
  pyro_gland: {
    id: 'pyro_gland',
    name: 'Glande Pyroclastique',
    shortLabel: 'Pyro',
    element: 'fire',
    dominant: true,
    colorHex: 0xff4500,
    colorCss: '#ff4500',
    statMultipliers: { maxHp: 1.35, speed: 1.08, strength: 1.45, size: 1.24 },
    metabolismCost: 1.0,
    fitnessBonus: 1.45,
  },
  titan_growth: {
    id: 'titan_growth',
    name: 'Gigantisme Titanesque',
    shortLabel: 'Titan',
    element: 'physical',
    dominant: true,
    colorHex: 0xff9f1c,
    colorCss: '#ff9f1c',
    statMultipliers: { maxHp: 1.55, speed: 1.02, strength: 1.42, size: 1.52 },
    metabolismCost: 1.0,
    fitnessBonus: 1.35,
  },
  amphibious_lungs: {
    id: 'amphibious_lungs',
    name: 'Pattes & Branchies Amphibies',
    shortLabel: 'Amphibie',
    element: 'water',
    dominant: true,
    colorHex: 0x1ee6ff,
    colorCss: '#1ee6ff',
    statMultipliers: { maxHp: 1.2, speed: 1.2, strength: 1.15, size: 1.08 },
    metabolismCost: 1.1,
    fitnessBonus: 0.5,
    grantsLandLocomotion: true,
  },
});

/**
 * Resolves the baseline species specification for a base or hybrid species identifier.
 *
 * @param {string} speciesId - Species ID (`'goblin'`, `'shark'`, `'giant_mole'`, `'rabbit'`, `'deer'`, or `'goblin_orc'`).
 * @param {string[]} [hybridParents=[]] - Optional pair of parent species IDs if hybrid.
 * @returns {object} Species baseline traits.
 */
function resolveSpeciesBaseline(speciesId, hybridParents = []) {
  const cycleDef = SPECIES_CYCLE_DEFAULTS[speciesId] || null;
  if (CONFIG?.SPECIES?.[speciesId] || cycleDef) {
    const cfgSpec = CONFIG?.SPECIES?.[speciesId] || {};
    return {
      ...(cycleDef || {}),
      ...cfgSpec,
      id: speciesId,
      baseGestationTime:
        cfgSpec.baseGestationTime ?? cycleDef?.baseGestationTime ?? 18,
      baseMaturationTime:
        cfgSpec.baseMaturationTime ?? cycleDef?.baseMaturationTime ?? 20,
      baseAggressiveness:
        cfgSpec.baseAggressiveness ?? cycleDef?.baseAggressiveness ?? 0.65,
      aggroStance: cfgSpec.aggroStance || cycleDef?.aggroStance || 'hostile',
    };
  }
  if (Array.isArray(hybridParents) && hybridParents.length >= 2) {
    return createHybridSpec(hybridParents[0], hybridParents[1]);
  }
  if (typeof speciesId === 'string' && speciesId.includes('_')) {
    return createHybridSpec(speciesId);
  }
  return {
    id: 'goblin',
    name: 'Gobelin',
    clade: 'greenskin',
    baseHp: 48,
    baseSpeed: 8.8,
    baseDamage: 8,
    baseSize: 0.78,
    baseGestationTime: 9,
    baseMaturationTime: 12,
    baseAggressiveness: 0.75,
    aggroStance: 'hostile',
    metabolism: 3.2,
    fertility: 1.25,
    aggroRadius: 16,
    color: '#5b9e3e',
    accentColor: '#9be061',
    ...(CONFIG?.SPECIES?.goblin || {}),
  };
}

/**
 * Represents the complete genetic profile, polygenic stats, hybrid lineage, and Mendelian dominant
 * mutations of an individual creature in the ecosystem.
 */
export class Genome {
  /**
   * Constructs a `Genome` instance.
   *
   * @param {object} [init={}] - Genome initialization parameters.
   * @param {string} [init.speciesId='goblin'] - Species identifier.
   * @param {string} [init.speciesName] - Display name of the species or hybrid.
   * @param {string} [init.clade] - Evolutionary clade (`'greenskin'`, `'beast'`, `'apex'`, `'herbivore'`, `'abyssal'`, `'subterranean'`).
   * @param {boolean} [init.isHybrid=false] - Whether this individual is an inter-species hybrid.
   * @param {string[]} [init.hybridParents=[]] - Parent species IDs if hybrid.
   * @param {number} [init.generation=1] - Evolutionary generation number (`1` for initial population).
   * @param {string} [init.lineageId] - Unique identifier for tracking genetic lineages.
   * @param {string} [init.aggroStance] - Behavioral stance (`'hostile'`, `'territorial'`, `'pacifist_apex'`, `'prey_pacifist'`).
   * @param {object} [init.genes] - Polygenic traits (`size`, `speed`, `strength`, `maxHp`, `gestationTime`, `aggressiveness`, `fertility`, `metabolism`, `aggroRadius`).
   * @param {object} [init.baseGenes] - Unmutated polygenic baseline prior to mutation multipliers.
   * @param {string[]} [init.mutations=[]] - Array of active mutation IDs from `CONFIG.MUTATIONS`.
   * @param {number} [init.fitnessScore] - Computed Darwinian fitness score.
   */
  constructor(init = {}) {
    const requestedHybridParents = Array.isArray(init.hybridParents)
      ? [...init.hybridParents]
      : [];
    const baseline = resolveSpeciesBaseline(init.speciesId || 'goblin', requestedHybridParents);

    /** @type {string} */
    this.speciesId = init.speciesId || baseline.id || 'goblin';

    /** @type {string} */
    this.clade = init.clade || baseline.clade || 'greenskin';

    /** @type {boolean} */
    this.isHybrid = Boolean(
      init.isHybrid ||
        baseline.isHybrid ||
        requestedHybridParents.length >= 2
    );

    /** @type {string[]} */
    this.hybridParents = this.isHybrid
      ? requestedHybridParents.length >= 2
        ? requestedHybridParents.slice(0, 2)
        : Array.isArray(baseline.parentSpecies)
          ? [...baseline.parentSpecies]
          : []
      : [];

    /** @type {string} */
    this.speciesName = init.speciesName || baseline.name || this.speciesId;

    /** @type {'hostile'|'territorial'|'pacifist_apex'|'prey_pacifist'} */
    this.aggroStance =
      init.aggroStance ||
      baseline.aggroStance ||
      (this.speciesId === 'dragon'
        ? 'pacifist_apex'
        : this.clade === 'herbivore'
          ? 'prey_pacifist'
          : 'hostile');

    /** @type {number} */
    this.foodYield = init.foodYield ?? baseline.foodYield ?? 0;

    /** @type {boolean} */
    this.autoRepopulate =
      init.autoRepopulate !== undefined
        ? Boolean(init.autoRepopulate)
        : baseline.autoRepopulate !== false;

    /** @type {number} */
    this.generation = Math.max(1, Math.floor(init.generation ?? 1));

    /** @type {string} */
    this.lineageId =
      init.lineageId || `lineage_${this.speciesId}_g${this.generation}_${nextLineageCounter++}`;

    const isHerbivore = this.clade === 'herbivore' || this.aggroStance === 'prey_pacifist';

    const defaultGenes = {
      size: baseline.baseSize ?? 1.0,
      speed: baseline.baseSpeed ?? 7.5,
      strength: baseline.baseDamage ?? (isHerbivore ? 0 : 12),
      maxHp: baseline.baseHp ?? 80,
      gestationTime: baseline.baseGestationTime ?? 18,
      aggressiveness: baseline.baseAggressiveness ?? (isHerbivore ? 0.0 : 0.65),
      fertility: baseline.fertility ?? 1.0,
      metabolism: baseline.metabolism ?? 4.0,
      aggroRadius: baseline.aggroRadius ?? 20,
    };

    const rawBaseGenes = init.baseGenes || init.genes || defaultGenes;

    /**
     * Underlying polygenic traits before mutation multipliers are applied, preventing exponential
     * runaway across multi-generation dominant inheritance while preserving polygenic selection.
     * @type {{
     *   size: number,
     *   speed: number,
     *   strength: number,
     *   maxHp: number,
     *   gestationTime: number,
     *   aggressiveness: number,
     *   fertility: number,
     *   metabolism: number,
     *   aggroRadius: number
     * }}
     */
    this.baseGenes = {
      size: Number((rawBaseGenes.size ?? defaultGenes.size).toFixed(3)),
      speed: Number((rawBaseGenes.speed ?? defaultGenes.speed).toFixed(3)),
      strength: Number((rawBaseGenes.strength ?? defaultGenes.strength).toFixed(2)),
      maxHp: Math.max(10, Math.round(rawBaseGenes.maxHp ?? defaultGenes.maxHp)),
      gestationTime: Number((rawBaseGenes.gestationTime ?? defaultGenes.gestationTime).toFixed(2)),
      aggressiveness: Number(
        clamp(
          rawBaseGenes.aggressiveness ?? defaultGenes.aggressiveness,
          isHerbivore ? 0.0 : 0.02,
          1.0
        ).toFixed(3)
      ),
      fertility: Number((rawBaseGenes.fertility ?? defaultGenes.fertility).toFixed(3)),
      metabolism: Number((rawBaseGenes.metabolism ?? defaultGenes.metabolism).toFixed(3)),
      aggroRadius: Number((rawBaseGenes.aggroRadius ?? defaultGenes.aggroRadius).toFixed(2)),
    };

    /**
     * Expressed phenotypic genes used by EnemyManager, CreatureMeshBuilder, and EcosystemSimulator.
     * @type {{
     *   size: number,
     *   speed: number,
     *   strength: number,
     *   maxHp: number,
     *   gestationTime: number,
     *   aggressiveness: number,
     *   fertility: number,
     *   metabolism: number,
     *   aggroRadius: number
     * }}
     */
    this.genes = { ...this.baseGenes };

    const mutCatalog = { ...FALLBACK_MUTATIONS, ...(CONFIG?.MUTATIONS || {}) };
    /** @type {string[]} */
    this.mutations = Array.isArray(init.mutations)
      ? Array.from(new Set(init.mutations.filter((m) => Boolean(mutCatalog[m]))))
      : [];

    /** @type {string} */
    this._appliedMutationsKey = '';

    /** @type {{ statsScore: number, mutationsScore: number, hybridBonus: number, total: number }} */
    this.fitnessBreakdown = {
      statsScore: 1.0,
      mutationsScore: 0.0,
      hybridBonus: 0.0,
      total: 1.0,
    };

    /** @type {number} */
    this.fitnessScore = 1.0;

    // Synchronize expressed genes and Darwinian fitness with any initial mutations
    this.syncMutations();
    if (typeof init.fitnessScore === 'number' && Number.isFinite(init.fitnessScore)) {
      this.fitnessScore = init.fitnessScore;
      this.fitnessBreakdown.total = init.fitnessScore;
    }
  }

  /**
   * Synchronizes `this.genes` and `this.fitnessScore` whenever `this.mutations` changes
   * (supporting both `genome.addMutation(id)` and direct array pushes `genome.mutations.push(id)`).
   * Uses wide clamp bounds (`0.35x` to `4.5x` baseline) so traits can expand across generations.
   *
   * @returns {this} This Genome instance.
   */
  syncMutations() {
    // Deduplicate and filter valid mutations
    if (Array.isArray(this.mutations)) {
      const unique = [];
      for (const m of this.mutations) {
        if (m && typeof m === 'string' && !unique.includes(m)) {
          unique.push(m);
        }
      }
      if (unique.length !== this.mutations.length) {
        this.mutations.length = 0;
        this.mutations.push(...unique);
      }
    } else {
      this.mutations = [];
    }

    let multMaxHp = 1.0;
    let multStrength = 1.0;
    let multSpeed = 1.0;
    let multSize = 1.0;
    let multMetabolism = 1.0;

    const catalog = { ...FALLBACK_MUTATIONS, ...(CONFIG?.MUTATIONS || {}) };
    for (const mutId of this.mutations) {
      const mut = catalog[mutId];
      if (!mut) continue;
      const sm = mut.statMultipliers || {};
      if (mutId === 'pyro_gland') {
        multMaxHp *= Math.max(sm.maxHp ?? 1.0, 1.35);
        multStrength *= Math.max(sm.strength ?? 1.0, 1.45);
        multSpeed *= Math.max(sm.speed ?? 1.0, 1.08);
        multSize *= Math.max(sm.size ?? 1.0, 1.24);
        // Phase 16: Zero metabolic famine penalty for pyro_gland
      } else if (mutId === 'titan_growth') {
        multMaxHp *= Math.max(sm.maxHp ?? 1.0, 1.55);
        multStrength *= Math.max(sm.strength ?? 1.0, 1.42);
        multSpeed *= Math.max(sm.speed ?? 1.0, 1.02);
        multSize *= Math.max(sm.size ?? 1.0, 1.52);
        // Phase 16: Zero metabolic famine penalty for titan_growth
      } else {
        multMaxHp *= sm.maxHp ?? 1.0;
        multStrength *= sm.strength ?? 1.0;
        multSpeed *= sm.speed ?? 1.0;
        multSize *= sm.size ?? 1.0;
        multMetabolism *= mut.metabolismCost ?? 1.0;
      }
    }

    const baseline = resolveSpeciesBaseline(this.speciesId, this.hybridParents);
    const isHerbivore =
      this.clade === 'herbivore' ||
      baseline.clade === 'herbivore' ||
      this.aggroStance === 'prey_pacifist';

    const minHp = Math.max(12, Math.round((baseline.baseHp || 48) * 0.35));
    const maxHpCap = Math.max(950, Math.round((baseline.baseHp || 680) * 4.5));
    const minStr = isHerbivore ? 0 : Math.max(2.0, (baseline.baseDamage || 8) * 0.35);
    const maxStrCap = isHerbivore ? 0 : Math.max(140.0, (baseline.baseDamage || 58) * 4.5);
    const minSpd = Math.max(1.8, (baseline.baseSpeed || 5.0) * 0.35);
    const maxSpdCap = Math.max(22.0, (baseline.baseSpeed || 10.2) * 3.5);
    const minSize = Math.max(0.3, (baseline.baseSize || 0.78) * 0.35);
    const maxSizeCap = Math.max(4.5, (baseline.baseSize || 2.05) * 3.2);
    const minGest = Math.max(3.5, (baseline.baseGestationTime || 9) * 0.35);
    const maxGestCap = Math.max(120.0, (baseline.baseGestationTime || 65) * 2.5);

    // Aggressive mutations slightly increase expressed aggressiveness (except pacifist_apex and prey_pacifist)
    const mutAggroAdd =
      this.aggroStance === 'pacifist_apex' || isHerbivore
        ? 0
        : Math.min(0.18, this.mutations.length * 0.06);

    this.genes = {
      size: Number(clamp(this.baseGenes.size * multSize, minSize, maxSizeCap).toFixed(3)),
      speed: Number(clamp(this.baseGenes.speed * multSpeed, minSpd, maxSpdCap).toFixed(2)),
      strength: isHerbivore
        ? 0
        : Number(clamp(this.baseGenes.strength * multStrength, minStr, maxStrCap).toFixed(2)),
      maxHp: Math.max(12, Math.round(clamp(this.baseGenes.maxHp * multMaxHp, minHp, maxHpCap))),
      gestationTime: Number(
        clamp(this.baseGenes.gestationTime ?? baseline.baseGestationTime ?? 18, minGest, maxGestCap).toFixed(2)
      ),
      aggressiveness: isHerbivore
        ? 0.0
        : Number(
            clamp(
              (this.baseGenes.aggressiveness ?? baseline.baseAggressiveness ?? 0.65) + mutAggroAdd,
              0.02,
              1.0
            ).toFixed(3)
          ),
      fertility: Number(clamp(this.baseGenes.fertility, 0.25, 3.8).toFixed(3)),
      metabolism: Number(clamp(this.baseGenes.metabolism * multMetabolism, 0.8, 36.0).toFixed(2)),
      aggroRadius: Number(
        clamp(
          this.baseGenes.aggroRadius * (this.mutations.length > 0 ? 1.12 : 1.0),
          6.0,
          68.0
        ).toFixed(2)
      ),
    };

    this._appliedMutationsKey = this.mutations.join(',');
    this.fitnessScore = this.computeFitness();
    return this;
  }

  /**
   * Computes the Darwinian fitness score of this genome from the weighted combination of
   * normalized genetic stats (`strength`, `maxHp`, `speed`, `size`, `fertility`, `aggroRadius`
   * relative to `metabolism` cost), biome adaptation, and the adaptive bonuses of each mutation.
   * Also populates `this.fitnessBreakdown` (`{ statsScore, mutationsScore, biomeBonus, hybridBonus, total, ... }`)
   * and `this.maturationProfile` via `BalanceAndPacing.js`.
   *
   * @param {string|null} [currentBiome=null] - Optional current biome for ecological adaptation bonus.
   * @returns {number} Fitness score (typically `~1.0` for wild-type Gen-1, `1.5–3.2+` for adapted mutants).
   */
  computeFitness(currentBiome = null) {
    const detailed = computeDetailedFitness(
      this.genes || this.baseGenes,
      this.mutations,
      this.speciesId,
      currentBiome
    );

    this.fitnessBreakdown = detailed;
    this.fitnessScore = detailed.total;
    this.maturationProfile = getMaturationProfile(this.speciesId, this.mutations);
    return this.fitnessScore;
  }

  /**
   * Checks whether this genome carries a specific mutation.
   *
   * @param {string} mutationId - Key from `CONFIG.MUTATIONS`.
   * @returns {boolean} True if present.
   */
  hasMutation(mutationId) {
    return Array.isArray(this.mutations) && this.mutations.includes(mutationId);
  }

  /**
   * Adds a dominant mutation to this genome (if not already present), updates phenotypic `genes`
   * and `fitnessScore`, and updates `lineageId` to reflect the mutant strain.
   *
   * @param {string} mutationId - Key from `CONFIG.MUTATIONS` (e.g. `'pyro_gland'`, `'amphibious_lungs'`).
   * @returns {boolean} True if the mutation was newly added.
   */
  addMutation(mutationId) {
    const mutCatalog = { ...FALLBACK_MUTATIONS, ...(CONFIG?.MUTATIONS || {}) };
    if (!mutationId || !mutCatalog[mutationId]) {
      return false;
    }
    if (!this.mutations.includes(mutationId)) {
      this.mutations.push(mutationId);
    }
    this.lineageId = `mut_${mutationId}_${this.speciesId}`;
    this.syncMutations();
    return true;
  }

  /**
   * Creates a deep copy of this `Genome` instance.
   *
   * @returns {Genome} Cloned genome.
   */
  clone() {
    return new Genome({
      speciesId: this.speciesId,
      speciesName: this.speciesName,
      isHybrid: this.isHybrid,
      hybridParents: [...this.hybridParents],
      aggroStance: this.aggroStance,
      generation: this.generation,
      lineageId: this.lineageId,
      baseGenes: { ...this.baseGenes },
      mutations: [...this.mutations],
      fitnessScore: this.fitnessScore,
    });
  }

  /**
   * Creates a Gen-1 genome for a foundational species with natural variance ($\pm 10\%$,
   * i.e. $\times \text{uniform}(0.90, 1.10)$) around the species base stats defined in `CONFIG.SPECIES`.
   *
   * @param {string} speciesId - Species identifier (e.g. `'goblin'`, `'orc'`, `'troll'`, `'wolf'`, `'lion'`, `'vulture'`, `'dragon'`).
   * @param {Function|object} [rng=Math.random] - Random number generator function or `SeededRNG` instance.
   * @param {string[]} [initialMutations=[]] - Optional innate mutations (e.g. for seeding a Patient Zero).
   * @returns {Genome} Newly created Generation-1 `Genome`.
   */
  static createInitial(speciesId = 'goblin', rng = Math.random, initialMutations = [], options = {}) {
    const baseline = resolveSpeciesBaseline(speciesId);
    const isHerbivore =
      baseline.clade === 'herbivore' || baseline.aggroStance === 'prey_pacifist';
    const statMult = isHerbivore ? 1.0 : Math.max(0.5, Number(options?.statMultiplier ?? 1.0));
    const initialGen = Math.max(1, Math.floor(options?.generation ?? 1));

    const vary = (baseVal, amplitude = 0.1) => {
      const delta = (sampleUniform(rng) * 2 - 1) * amplitude;
      return baseVal * (1 + delta);
    };

    const baseGenes = {
      size: Number(vary(baseline.baseSize ?? 1.0, 0.1).toFixed(3)),
      speed: Number(vary(baseline.baseSpeed ?? 7.5, 0.1).toFixed(2)),
      strength: isHerbivore
        ? 0
        : Number((vary(baseline.baseDamage ?? 12, 0.1) * statMult).toFixed(2)),
      maxHp: Math.max(12, Math.round(vary(baseline.baseHp ?? 80, 0.1) * statMult)),
      gestationTime: Number(clamp(vary(baseline.baseGestationTime ?? 18, 0.1), 3.5, 160.0).toFixed(2)),
      aggressiveness: isHerbivore
        ? 0.0
        : Number(
            clamp(vary(baseline.baseAggressiveness ?? 0.65, 0.1), 0.02, 1.0).toFixed(3)
          ),
      fertility: Number(vary(baseline.fertility ?? 1.0, 0.1).toFixed(3)),
      metabolism: Number(vary(baseline.metabolism ?? 4.0, 0.1).toFixed(2)),
      aggroRadius: Number(vary(baseline.aggroRadius ?? 20, 0.1).toFixed(2)),
    };

    const isHybrid = Boolean(baseline.isHybrid);
    const hybridParents = isHybrid && Array.isArray(baseline.parentSpecies)
      ? [...baseline.parentSpecies]
      : [];

    const genome = new Genome({
      speciesId: baseline.id || speciesId,
      speciesName: baseline.name || speciesId,
      clade: baseline.clade,
      isHybrid,
      hybridParents,
      aggroStance:
        baseline.aggroStance ||
        (speciesId === 'dragon'
          ? 'pacifist_apex'
          : isHerbivore
            ? 'prey_pacifist'
            : 'hostile'),
      foodYield: baseline.foodYield ?? 0,
      autoRepopulate: baseline.autoRepopulate !== false,
      generation: initialGen,
      baseGenes,
      mutations: initialMutations,
    });

    if (genome.mutations.length > 0) {
      genome.lineageId = `mut_${genome.mutations[0]}_${genome.speciesId}`;
    }

    return genome;
  }

  /**
   * Performs sexual genetic crossover between `parentAGenome` and `parentBGenome`:
   * - Implements the exact **`[min(Dad, Mom), max(Dad, Mom)] * uniform(0.90, 1.10)`** scope-expanding
   *   crossover formula for all quantitative traits (`maxHp`, `strength`, `speed`, `size`,
   *   `gestationTime`, `aggressiveness`, `fertility`, `metabolism`, `aggroRadius`):
   *   1. Samples a uniform random value strictly between Dad ($g_A$) and Mom ($g_B$).
   *   2. Multiplies by a random drift factor in $[-10\%, +10\%]$ ($\times \text{uniform}(0.90, 1.10)$).
   *   3. Keeps clamp bounds wide (`0.35x` to `4.5x` species baseline) so phenotypic traits can evolve
   *      well beyond Gen-1 ranges across multiple generations.
   * - Checks inter-species hybridization (`parentA.speciesId !== parentB.speciesId` and `canHybridize`)
   *   and synthesizes a hybrid offspring via `createHybridSpec` when compatible.
   * - Applies **Mendelian Dominant Mutation Inheritance**:
   *   - `78%` chance (`CONFIG.ECO.DOMINANT_INHERITANCE_SINGLE`) if carried by 1 parent.
   *   - `92%` chance (`CONFIG.ECO.DOMINANT_INHERITANCE_BOTH`) if carried by both parents.
   * - Rolls **De Novo Spontaneous Mutation** with probability `CONFIG.ECO.MUTATION_RATE` (`8%`)
   *   from mutations neither parent carried.
   * - Logs all evolutionary milestones via `logger.evolution(...)`.
   *
   * @param {Genome} parentAGenome - First parent genome.
   * @param {Genome} parentBGenome - Second parent genome.
   * @param {Function|object} [rng=Math.random] - Random number generator function or `SeededRNG` instance.
   * @returns {{ genome: Genome, newMutationId: string | null, becameHybrid: boolean }} Crossover offspring result.
   */
  static crossover(parentAGenome, parentBGenome, rng = Math.random, options = {}) {
    const parentA = parentAGenome instanceof Genome ? parentAGenome : new Genome(parentAGenome);
    const parentB = parentBGenome instanceof Genome ? parentBGenome : new Genome(parentBGenome);

    // Ensure parent mutations are synced before crossover
    parentA.syncMutations();
    parentB.syncMutations();

    const generation = Math.max(parentA.generation || 1, parentB.generation || 1) + 1;

    // 1. Determine Species Identity & Inter-Species Hybridization
    let childSpeciesId = parentA.speciesId;
    let childSpeciesName = parentA.speciesName;
    let childIsHybrid = Boolean(parentA.isHybrid || parentB.isHybrid);
    let childHybridParents = parentA.isHybrid
      ? [...parentA.hybridParents]
      : parentB.isHybrid
        ? [...parentB.hybridParents]
        : [];
    let becameHybrid = false;
    let hybridSpec = null;

    if (parentA.speciesId !== parentB.speciesId) {
      if (canHybridize(parentA, parentB)) {
        hybridSpec = createHybridSpec(parentA.speciesId, parentB.speciesId);
        childSpeciesId = hybridSpec.id;
        childSpeciesName = hybridSpec.name;
        childIsHybrid = true;
        childHybridParents = [...hybridSpec.parentSpecies];
        becameHybrid = !parentA.isHybrid && !parentB.isHybrid;
      } else {
        // Fallback if incompatible pair was passed: inherit fitter parent's species
        const pickA = parentA.fitnessScore >= parentB.fitnessScore;
        childSpeciesId = pickA ? parentA.speciesId : parentB.speciesId;
        childSpeciesName = pickA ? parentA.speciesName : parentB.speciesName;
        childIsHybrid = pickA ? parentA.isHybrid : parentB.isHybrid;
        childHybridParents = pickA ? [...parentA.hybridParents] : [...parentB.hybridParents];
      }
    }

    const childBaseline =
      hybridSpec || resolveSpeciesBaseline(childSpeciesId, childHybridParents);
    const isHerbivore =
      childBaseline.clade === 'herbivore' ||
      childBaseline.aggroStance === 'prey_pacifist';

    // 2. Scope-Expanding Crossover with Phase 16 Directional Bias toward Giant Fire Monsters
    const genesA = parentA.baseGenes || parentA.genes;
    const genesB = parentB.baseGenes || parentB.genes;
    const hasEliteOrMutantParent =
      !isHerbivore &&
      ((parentA.mutations?.length || 0) > 0 ||
        (parentB.mutations?.length || 0) > 0 ||
        (parentA.fitnessScore || 1.0) > 1.18 ||
        (parentB.fitnessScore || 1.0) > 1.18);

    const crossoverTrait = (valA, valB, fallbackVal, biasUpward = false) => {
      const a = typeof valA === 'number' && Number.isFinite(valA) ? valA : fallbackVal;
      const b = typeof valB === 'number' && Number.isFinite(valB) ? valB : fallbackVal;
      const minVal = Math.min(a, b);
      const maxVal = Math.max(a, b);
      const rawU1 = sampleUniform(rng);
      const u1 =
        biasUpward || hasEliteOrMutantParent ? Math.pow(rawU1, 0.55) : rawU1;
      const vBetween = minVal + u1 * (maxVal - minVal);
      const u2 = sampleUniform(rng);
      const driftFactor =
        biasUpward || hasEliteOrMutantParent
          ? 0.96 + u2 * 0.18 // [-4%, +14%] upward evolutionary drift
          : 0.90 + u2 * 0.20; // [-10%, +10%]
      return vBetween * driftFactor;
    };

    const refSize = childBaseline.baseSize || 1.0;
    const refSpeed = childBaseline.baseSpeed || 7.5;
    const refStr = isHerbivore ? 0 : childBaseline.baseDamage || 12;
    const refHp = childBaseline.baseHp || 80;
    const refGest = childBaseline.baseGestationTime || 18;
    const refAggro = isHerbivore ? 0.0 : childBaseline.baseAggressiveness ?? 0.65;
    const refFert = childBaseline.fertility || 1.0;
    const refMetab = childBaseline.metabolism || 4.0;
    const refRadius = childBaseline.aggroRadius || 20;

    const childBaseGenes = {
      size: Number(
        clamp(
          crossoverTrait(genesA.size, genesB.size, refSize, !isHerbivore),
          refSize * 0.35,
          refSize * 4.5
        ).toFixed(3)
      ),
      speed: Number(
        clamp(
          crossoverTrait(genesA.speed, genesB.speed, refSpeed, false),
          refSpeed * 0.35,
          refSpeed * 4.5
        ).toFixed(2)
      ),
      strength: isHerbivore
        ? 0
        : Number(
            clamp(
              crossoverTrait(genesA.strength, genesB.strength, refStr, true),
              refStr * 0.35,
              refStr * 4.5
            ).toFixed(2)
          ),
      maxHp: Math.max(
        12,
        Math.round(
          clamp(
            crossoverTrait(genesA.maxHp, genesB.maxHp, refHp, !isHerbivore),
            refHp * 0.35,
            refHp * 4.5
          )
        )
      ),
      gestationTime: Number(
        clamp(
          crossoverTrait(genesA.gestationTime, genesB.gestationTime, refGest, false),
          Math.max(3.5, refGest * 0.35),
          refGest * 3.0
        ).toFixed(2)
      ),
      aggressiveness: isHerbivore
        ? 0.0
        : Number(
            clamp(
              crossoverTrait(genesA.aggressiveness, genesB.aggressiveness, refAggro, false),
              0.02,
              1.0
            ).toFixed(3)
          ),
      fertility: Number(
        clamp(
          crossoverTrait(genesA.fertility, genesB.fertility, refFert, false),
          refFert * 0.35,
          refFert * 4.0
        ).toFixed(3)
      ),
      metabolism: Number(
        clamp(
          crossoverTrait(genesA.metabolism, genesB.metabolism, refMetab, false),
          refMetab * 0.35,
          refMetab * 4.0
        ).toFixed(2)
      ),
      aggroRadius: Number(
        clamp(
          crossoverTrait(genesA.aggroRadius, genesB.aggroRadius, refRadius, false),
          refRadius * 0.4,
          refRadius * 3.5
        ).toFixed(2)
      ),
    };

    // 3. Mendelian Dominant Inheritance for Existing Parental Mutations
    // Phase 16: pyro_gland & titan_growth inherit at 92% (single parent) and 99% (both parents)
    const singleParentProb = CONFIG?.ECO?.DOMINANT_INHERITANCE_SINGLE ?? 0.92;
    const bothParentsProb = CONFIG?.ECO?.DOMINANT_INHERITANCE_BOTH ?? 0.99;

    const parentMutationsUnion = new Set([
      ...(parentA.mutations || []),
      ...(parentB.mutations || []),
    ]);

    const childMutations = [];
    for (const mutId of parentMutationsUnion) {
      const inA = parentA.hasMutation(mutId);
      const inB = parentB.hasMutation(mutId);
      const isFireOrGiant = mutId === 'pyro_gland' || mutId === 'titan_growth';
      const inheritChance =
        inA && inB
          ? isFireOrGiant
            ? Math.max(bothParentsProb, 0.99)
            : bothParentsProb
          : isFireOrGiant
            ? Math.max(singleParentProb, 0.92)
            : singleParentProb;
      if (sampleUniform(rng) < inheritChance) {
        childMutations.push(mutId);
      }
    }

    // 4. De Novo Spontaneous Mutation Roll (CONFIG.ECO.MUTATION_RATE = 16% + optional island bonus)
    // Phase 16: pyro_gland and titan_growth are weighted at 70% combined probability (35% each, 30% others)
    const rateBonus = Math.max(0, Number(options?.mutationRateBonus ?? 0));
    const baseMutRate = Math.max(CONFIG?.ECO?.MUTATION_RATE ?? 0.16, 0.16);
    const deNovoRate = isHerbivore
      ? 0.0
      : clamp(baseMutRate + rateBonus, 0.0, 0.75);
    let newMutationId = null;

    if (deNovoRate > 0 && sampleUniform(rng) < deNovoRate) {
      const allMutationKeys = Object.keys({
        ...FALLBACK_MUTATIONS,
        ...(CONFIG?.MUTATIONS || {}),
      });
      const candidateKeys = allMutationKeys.filter(
        (k) => !parentMutationsUnion.has(k) && !childMutations.includes(k)
      );
      if (candidateKeys.length > 0) {
        const hasPyroCand = candidateKeys.includes('pyro_gland');
        const hasTitanCand = candidateKeys.includes('titan_growth');
        const otherCands = candidateKeys.filter(
          (k) => k !== 'pyro_gland' && k !== 'titan_growth'
        );
        const roll = sampleUniform(rng);

        if (hasPyroCand && hasTitanCand) {
          if (roll < 0.35) {
            newMutationId = 'pyro_gland';
          } else if (roll < 0.70 || otherCands.length === 0) {
            newMutationId = 'titan_growth';
          } else {
            const idx = Math.floor(sampleUniform(rng) * otherCands.length);
            newMutationId = otherCands[idx];
          }
        } else if (hasPyroCand) {
          if (roll < 0.70 || otherCands.length === 0) {
            newMutationId = 'pyro_gland';
          } else {
            const idx = Math.floor(sampleUniform(rng) * otherCands.length);
            newMutationId = otherCands[idx];
          }
        } else if (hasTitanCand) {
          if (roll < 0.70 || otherCands.length === 0) {
            newMutationId = 'titan_growth';
          } else {
            const idx = Math.floor(sampleUniform(rng) * otherCands.length);
            newMutationId = otherCands[idx];
          }
        } else {
          const idx = Math.floor(sampleUniform(rng) * candidateKeys.length);
          newMutationId = candidateKeys[idx];
        }

        if (newMutationId) {
          childMutations.push(newMutationId);
        }
      }
    }

    // Determine lineage ID
    let lineageId =
      parentA.fitnessScore >= parentB.fitnessScore ? parentA.lineageId : parentB.lineageId;
    if (newMutationId) {
      lineageId = `mut_${newMutationId}_${childSpeciesId}_g${generation}`;
    } else if (becameHybrid) {
      lineageId = `hyb_${childSpeciesId}_g${generation}`;
    } else if (childMutations.length > 0) {
      lineageId = `mut_${childMutations[0]}_${childSpeciesId}`;
    }

    const childGenome = new Genome({
      speciesId: childSpeciesId,
      speciesName: childSpeciesName,
      clade: childBaseline.clade,
      isHybrid: childIsHybrid,
      hybridParents: childHybridParents,
      aggroStance:
        childBaseline.aggroStance ||
        (childSpeciesId === 'dragon'
          ? 'pacifist_apex'
          : isHerbivore
            ? 'prey_pacifist'
            : parentA.aggroStance || 'hostile'),
      foodYield: childBaseline.foodYield ?? 0,
      autoRepopulate: childBaseline.autoRepopulate !== false,
      generation,
      lineageId,
      baseGenes: childBaseGenes,
      mutations: childMutations,
    });

    // Attach convenience flags on the genome instance as well
    childGenome.newMutationId = newMutationId;
    childGenome.becameHybrid = becameHybrid;

    // 5. Log Evolutionary Events (Hybridization, De Novo Mutation, Dominant Inheritance)
    if (becameHybrid) {
      logger.evolution(
        `Hybridation inter-espèces : [${parentA.speciesName} × ${parentB.speciesName}] → naissance d’un ${childSpeciesName} (Gén. ${generation}, Fitness ${childGenome.fitnessScore})`,
        {
          event: 'HYBRIDIZATION',
          parentA: parentA.speciesId,
          parentB: parentB.speciesId,
          hybridId: childSpeciesId,
          hybridName: childSpeciesName,
          generation,
          fitnessScore: childGenome.fitnessScore,
        }
      );
    }

    if (newMutationId) {
      const mutDef = CONFIG?.MUTATIONS?.[newMutationId];
      const mutName = mutDef ? mutDef.name : newMutationId;
      logger.evolution(
        `Mutation spontanée de novo ! Un ${childSpeciesName} (Gén. ${generation}) développe [${mutName}] (Fitness ${childGenome.fitnessScore})`,
        {
          event: 'DE_NOVO_MUTATION',
          speciesId: childSpeciesId,
          speciesName: childSpeciesName,
          mutationId: newMutationId,
          mutationName: mutName,
          generation,
          fitnessScore: childGenome.fitnessScore,
        }
      );
    } else if (childMutations.length > 0) {
      const inheritedLabels = childMutations
        .map((id) => CONFIG?.MUTATIONS?.[id]?.shortLabel || id)
        .join(', ');
      logger.evolution(
        `Transmission mendélienne dominante : ${childSpeciesName} (Gén. ${generation}) hérite de [${inheritedLabels}] (Fitness ${childGenome.fitnessScore})`,
        {
          event: 'DOMINANT_INHERITANCE',
          speciesId: childSpeciesId,
          speciesName: childSpeciesName,
          mutations: [...childMutations],
          generation,
          fitnessScore: childGenome.fitnessScore,
        }
      );
    }

    return {
      genome: childGenome,
      newMutationId,
      becameHybrid,
    };
  }
}

export default Genome;
