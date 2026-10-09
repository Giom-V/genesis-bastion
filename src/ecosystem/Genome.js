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
function resolveSpeciesBaseline(speciesId, hybridParents = []) {
  if (CONFIG?.SPECIES?.[speciesId]) {
    return CONFIG.SPECIES[speciesId];
  }
  if (Array.isArray(hybridParents) && hybridParents.length >= 2) {
    return createHybridSpec(hybridParents[0], hybridParents[1]);
  }
  if (typeof speciesId === 'string' && speciesId.includes('_')) {
    return createHybridSpec(speciesId);
  }
  return (
    CONFIG?.SPECIES?.goblin || {
      id: 'goblin',
      name: 'Gobelin',
      clade: 'greenskin',
      baseHp: 48,
      baseSpeed: 8.8,
      baseDamage: 8,
      baseSize: 0.78,
      metabolism: 3.2,
      fertility: 1.25,
      aggroRadius: 16,
      color: '#5b9e3e',
      accentColor: '#9be061',
    }
  );
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
   * @param {boolean} [init.isHybrid=false] - Whether this individual is an inter-species hybrid.
   * @param {string[]} [init.hybridParents=[]] - Parent species IDs if hybrid.
   * @param {number} [init.generation=1] - Evolutionary generation number (`1` for initial population).
   * @param {string} [init.lineageId] - Unique identifier for tracking genetic lineages.
   * @param {object} [init.genes] - Polygenic traits (`size`, `speed`, `strength`, `maxHp`, `fertility`, `metabolism`, `aggroRadius`).
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

    /** @type {number} */
    this.generation = Math.max(1, Math.floor(init.generation ?? 1));

    /** @type {string} */
    this.lineageId =
      init.lineageId || `lineage_${this.speciesId}_g${this.generation}_${nextLineageCounter++}`;

    const defaultGenes = {
      size: baseline.baseSize ?? 1.0,
      speed: baseline.baseSpeed ?? 7.5,
      strength: baseline.baseDamage ?? 12,
      maxHp: baseline.baseHp ?? 80,
      fertility: baseline.fertility ?? 1.0,
      metabolism: baseline.metabolism ?? 4.0,
      aggroRadius: baseline.aggroRadius ?? 20,
    };

    const rawBaseGenes = init.baseGenes || init.genes || defaultGenes;

    /**
     * Underlying polygenic traits before mutation multipliers are applied, preventing exponential
     * runaway across multi-generation dominant inheritance while preserving polygenic selection.
     * @type {{ size: number, speed: number, strength: number, maxHp: number, fertility: number, metabolism: number, aggroRadius: number }}
     */
    this.baseGenes = {
      size: Number((rawBaseGenes.size ?? defaultGenes.size).toFixed(3)),
      speed: Number((rawBaseGenes.speed ?? defaultGenes.speed).toFixed(3)),
      strength: Number((rawBaseGenes.strength ?? defaultGenes.strength).toFixed(2)),
      maxHp: Math.max(10, Math.round(rawBaseGenes.maxHp ?? defaultGenes.maxHp)),
      fertility: Number((rawBaseGenes.fertility ?? defaultGenes.fertility).toFixed(3)),
      metabolism: Number((rawBaseGenes.metabolism ?? defaultGenes.metabolism).toFixed(3)),
      aggroRadius: Number((rawBaseGenes.aggroRadius ?? defaultGenes.aggroRadius).toFixed(2)),
    };

    /**
     * Expressed phenotypic genes used by EnemyManager, CreatureMeshBuilder, and EcosystemSimulator.
     * @type {{ size: number, speed: number, strength: number, maxHp: number, fertility: number, metabolism: number, aggroRadius: number }}
     */
    this.genes = { ...this.baseGenes };

    /** @type {string[]} */
    this.mutations = Array.isArray(init.mutations)
      ? Array.from(new Set(init.mutations.filter((m) => Boolean(CONFIG?.MUTATIONS?.[m]))))
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

    const catalog = CONFIG?.MUTATIONS || {};
    for (const mutId of this.mutations) {
      const mut = catalog[mutId];
      if (!mut) continue;
      const sm = mut.statMultipliers || {};
      multMaxHp *= sm.maxHp ?? 1.0;
      multStrength *= sm.strength ?? 1.0;
      multSpeed *= sm.speed ?? 1.0;
      multSize *= sm.size ?? 1.0;
      multMetabolism *= mut.metabolismCost ?? 1.0;
    }

    this.genes = {
      size: Number(clamp(this.baseGenes.size * multSize, 0.45, 3.4).toFixed(3)),
      speed: Number(clamp(this.baseGenes.speed * multSpeed, 2.5, 18.0).toFixed(2)),
      strength: Number(clamp(this.baseGenes.strength * multStrength, 3.0, 120.0).toFixed(2)),
      maxHp: Math.max(15, Math.round(clamp(this.baseGenes.maxHp * multMaxHp, 20, 950))),
      fertility: Number(clamp(this.baseGenes.fertility, 0.35, 2.2).toFixed(3)),
      metabolism: Number(clamp(this.baseGenes.metabolism * multMetabolism, 1.2, 22.0).toFixed(2)),
      aggroRadius: Number(
        clamp(
          this.baseGenes.aggroRadius * (this.mutations.length > 0 ? 1.12 : 1.0),
          10,
          48
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
   * @param {string} mutationId - Key from `CONFIG.MUTATIONS` (e.g. `'pyro_gland'`).
   * @returns {boolean} True if the mutation was newly added.
   */
  addMutation(mutationId) {
    if (!mutationId || !CONFIG?.MUTATIONS?.[mutationId]) {
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
      generation: this.generation,
      lineageId: this.lineageId,
      baseGenes: { ...this.baseGenes },
      mutations: [...this.mutations],
      fitnessScore: this.fitnessScore,
    });
  }

  /**
   * Creates a Gen-1 genome for a foundational species with natural variance ($\pm 10\%$)
   * around the species base stats defined in `CONFIG.SPECIES`.
   *
   * @param {string} speciesId - Species identifier (e.g. `'goblin'`, `'orc'`, `'troll'`, `'wolf'`, `'lion'`, `'vulture'`, `'dragon'`).
   * @param {Function|object} [rng=Math.random] - Random number generator function or `SeededRNG` instance.
   * @param {string[]} [initialMutations=[]] - Optional innate mutations (e.g. for seeding a Patient Zero).
   * @returns {Genome} Newly created Generation-1 `Genome`.
   */
  static createInitial(speciesId = 'goblin', rng = Math.random, initialMutations = []) {
    const baseline = resolveSpeciesBaseline(speciesId);
    const vary = (baseVal, amplitude = 0.1) => {
      const delta = (sampleUniform(rng) * 2 - 1) * amplitude;
      return baseVal * (1 + delta);
    };

    const baseGenes = {
      size: Number(vary(baseline.baseSize ?? 1.0, 0.1).toFixed(3)),
      speed: Number(vary(baseline.baseSpeed ?? 7.5, 0.1).toFixed(2)),
      strength: Number(vary(baseline.baseDamage ?? 12, 0.1).toFixed(2)),
      maxHp: Math.max(15, Math.round(vary(baseline.baseHp ?? 80, 0.1))),
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
      isHybrid,
      hybridParents,
      generation: 1,
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
   * - Blends polygenic traits (`size`, `speed`, `strength`, `maxHp`, `fertility`, `metabolism`, `aggroRadius`)
   *   via uniform/interpolated crossover + Gaussian micro-mutation drift ($\pm 6\%$).
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
  static crossover(parentAGenome, parentBGenome, rng = Math.random) {
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
      if (canHybridize(parentA.speciesId, parentB.speciesId)) {
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

    // 2. Polygenic Uniform/Blended Inheritance + Gaussian Micro-Mutation Drift (+/- 6%)
    const genesA = parentA.baseGenes || parentA.genes;
    const genesB = parentB.baseGenes || parentB.genes;

    // Bias blending slightly toward the fitter parent (Darwinian advantage)
    const totalFit = (parentA.fitnessScore || 1) + (parentB.fitnessScore || 1);
    const fitBiasA = totalFit > 0 ? (parentA.fitnessScore || 1) / totalFit : 0.5;

    const blendGene = (valA, valB, hybridBaseVal = null) => {
      // Mix uniform locus choice and continuous interpolation
      const alpha = clamp(lerp(sampleUniform(rng), fitBiasA, 0.35), 0.15, 0.85);
      let blended = lerp(valB, valA, alpha);
      if (typeof hybridBaseVal === 'number' && Number.isFinite(hybridBaseVal)) {
        // Incorporate hybrid vigor baseline
        blended = lerp(blended, hybridBaseVal, 0.35);
      }
      const drift = sampleGaussianDrift(rng, 0.03, 0.06);
      return blended * (1 + drift);
    };

    const childBaseGenes = {
      size: Number(
        clamp(blendGene(genesA.size, genesB.size, hybridSpec?.baseSize), 0.45, 2.8).toFixed(3)
      ),
      speed: Number(
        clamp(blendGene(genesA.speed, genesB.speed, hybridSpec?.baseSpeed), 2.8, 15.5).toFixed(2)
      ),
      strength: Number(
        clamp(blendGene(genesA.strength, genesB.strength, hybridSpec?.baseDamage), 4.0, 85.0).toFixed(2)
      ),
      maxHp: Math.max(
        20,
        Math.round(clamp(blendGene(genesA.maxHp, genesB.maxHp, hybridSpec?.baseHp), 25, 650))
      ),
      fertility: Number(
        clamp(blendGene(genesA.fertility, genesB.fertility, null), 0.4, 2.0).toFixed(3)
      ),
      metabolism: Number(
        clamp(blendGene(genesA.metabolism, genesB.metabolism, hybridSpec?.metabolism), 1.5, 18.0).toFixed(2)
      ),
      aggroRadius: Number(
        clamp(
          blendGene(genesA.aggroRadius, genesB.aggroRadius, hybridSpec?.aggroRadius),
          12,
          42
        ).toFixed(2)
      ),
    };

    // 3. Mendelian Dominant Inheritance for Existing Parental Mutations
    const singleParentProb = CONFIG?.ECO?.DOMINANT_INHERITANCE_SINGLE ?? 0.78;
    const bothParentsProb = CONFIG?.ECO?.DOMINANT_INHERITANCE_BOTH ?? 0.92;

    const parentMutationsUnion = new Set([
      ...(parentA.mutations || []),
      ...(parentB.mutations || []),
    ]);

    const childMutations = [];
    for (const mutId of parentMutationsUnion) {
      const inA = parentA.hasMutation(mutId);
      const inB = parentB.hasMutation(mutId);
      const inheritChance = inA && inB ? bothParentsProb : singleParentProb;
      if (sampleUniform(rng) < inheritChance) {
        childMutations.push(mutId);
      }
    }

    // 4. De Novo Spontaneous Mutation Roll (CONFIG.ECO.MUTATION_RATE = 8%)
    const deNovoRate = CONFIG?.ECO?.MUTATION_RATE ?? 0.08;
    let newMutationId = null;

    if (sampleUniform(rng) < deNovoRate) {
      const allMutationKeys = Object.keys(CONFIG?.MUTATIONS || {});
      const candidateKeys = allMutationKeys.filter((k) => !parentMutationsUnion.has(k) && !childMutations.includes(k));
      if (candidateKeys.length > 0) {
        const idx = Math.floor(sampleUniform(rng) * candidateKeys.length);
        newMutationId = candidateKeys[idx];
        childMutations.push(newMutationId);
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
      isHybrid: childIsHybrid,
      hybridParents: childHybridParents,
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
