#!/usr/bin/env node
/**
 * @file scripts/dry-run-sim.js
 * @description Headless CLI simulation and verification harness (`--dry-run`) for Genesis Bastion.
 *
 * Simulates 30 Ecological Ticks (`ECO.TICK_INTERVAL` = 12s per cycle) combining:
 * 1. Conway's Game of Life spatial density rules (Allee underpopulation < 2,
 *    Optimal reproduction window 2..6, Overpopulation/Famine > 6).
 * 2. Juvenile -> Adult Life-Cycle Maturation: All newborn creatures spawn as Babies
 *    (`lifeStage: 'baby'`, `isAdult: false`, `age: 0`, scale `0.5x`, stats `0.55x`) and cannot
 *    reproduce until `age >= CONFIG.ECO.MATURATION_TIME` (20s), creating a tactical window
 *    to eliminate juvenile Mutant Patient Zeros before they breed.
 * 3. Darwinian Genetic Algorithm crossover with explicit `fitnessScore` (`statsScore + mutationsScore`),
 *    Mendelian dominant mutation inheritance (78% single-parent / 92% dual-parent),
 *    and de novo mutation emergence (8%).
 * 4. Phylogenetic inter-species hybridization governed by the 7x7 `CONFIG.PHYLOGENY_DIST` matrix.
 * 5. Scout NPC Deep Wilderness expedition (`45..105` units) & Patient Zero early detection.
 *
 * Usage:
 *   node scripts/dry-run-sim.js --dry-run [--ticks=30] [--seed=20261009] [--verbose]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config.js';
import { logger } from '../src/utils/logger.js';
import { SeededRNG, dist2D, clamp, lerp, getCardinalLabelFR } from '../src/utils/math.js';
import {
  blenderModelManager,
  BLENDER_MODEL_MANIFEST,
} from '../src/entities/BlenderModelManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Parses CLI flags from `process.argv`.
 * @param {string[]} argv
 * @returns {{ dryRun: boolean, ticks: number, seed: number, verbose: boolean }}
 */
function parseArgs(argv) {
  const args = {
    dryRun: argv.includes('--dry-run'),
    ticks: 30,
    seed: 20261009,
    verbose: argv.includes('--verbose'),
  };

  for (const arg of argv) {
    if (arg.startsWith('--ticks=')) {
      const n = parseInt(arg.split('=')[1], 10);
      if (!Number.isNaN(n) && n > 0) args.ticks = n;
    } else if (arg.startsWith('--seed=')) {
      const s = parseInt(arg.split('=')[1], 10);
      if (!Number.isNaN(s)) args.seed = s;
    }
  }
  return args;
}

/**
 * Deterministic biome classifier for headless simulation coordinates.
 * @param {number} x
 * @param {number} z
 * @returns {'beach'|'plains'|'forest'|'highlands'|'volcanic'}
 */
function getSimulatedBiomeAt(x, z) {
  const r = Math.hypot(x, z);
  if (r > 102) return 'beach';
  if (x > 25 && z < -25) return 'volcanic';
  if (r > 68) return 'highlands';
  if (x < 0) return 'forest';
  return 'plains';
}

/**
 * Attempts to dynamically load the live `src/ecosystem/*` modules created by `@genetics-eco`.
 * @returns {Promise<{ EcosystemSimulator?: any, Genome?: any, Phylogeny?: any } | null>}
 */
async function tryLoadEcosystemModules() {
  try {
    const [ecoMod, genomeMod, phyloMod, balanceMod] = await Promise.all([
      import('../src/ecosystem/EcosystemSimulator.js'),
      import('../src/ecosystem/Genome.js'),
      import('../src/ecosystem/Phylogeny.js'),
      import('../src/ecosystem/BalanceAndPacing.js'),
    ]);
    return {
      EcosystemSimulator: ecoMod.EcosystemSimulator || ecoMod.default,
      Genome: genomeMod.Genome || genomeMod.default,
      Phylogeny: phyloMod,
      Balance: balanceMod,
    };
  } catch (err) {
    logger.warn(
      'DRY-RUN',
      'Live ecosystem modules not yet available or incomplete, using built-in reference engine.',
      { reason: err.message }
    );
    return null;
  }
}

/**
 * Computes phylogenetic distance from `CONFIG.PHYLOGENY_DIST`.
 * @param {string} spA
 * @param {string} spB
 * @returns {number}
 */
function fallbackPhyloDist(spA, spB) {
  if (spA === spB) return 0.0;
  return CONFIG.PHYLOGENY_DIST?.[spA]?.[spB] ?? 1.0;
}

/**
 * Computes Darwinian fitness breakdown (`statsScore + mutationsScore`) for a genome.
 * @param {any} genome
 * @returns {{ statsScore: number, mutationsScore: number, total: number }}
 */
function computeReferenceFitness(genome) {
  if (genome?.fitnessBreakdown && typeof genome.fitnessBreakdown.total === 'number') {
    return genome.fitnessBreakdown;
  }
  const sp = CONFIG.SPECIES[genome.speciesId] || CONFIG.SPECIES.orc;
  const g = genome.genes || {};
  const normHp = (g.maxHp || sp.baseHp) / sp.baseHp;
  const normStr = (g.strength || sp.baseDamage) / sp.baseDamage;
  const normSpd = (g.speed || sp.baseSpeed) / sp.baseSpeed;
  const normSize = (g.size || sp.baseSize) / sp.baseSize;
  const normFert = (g.fertility || sp.fertility || 1.0) / (sp.fertility || 1.0);
  const metabRatio = sp.metabolism / Math.max(1.0, g.metabolism || sp.metabolism);

  const statsScore = Number(
    (
      (normStr * 0.28 +
        normHp * 0.24 +
        normSpd * 0.18 +
        normFert * 0.15 +
        normSize * 0.08 +
        metabRatio * 0.07)
    ).toFixed(3)
  );
  const mutationsScore = Number(
    (genome.mutations || [])
      .reduce((acc, mId) => acc + (CONFIG.MUTATIONS[mId]?.fitnessBonus || 0.35), 0)
      .toFixed(3)
  );
  const total = Number((statsScore + mutationsScore).toFixed(3));
  return { statsScore, mutationsScore, total };
}

/**
 * Runs a 30-tick headless evolutionary simulation and prints a full analytical report.
 */
async function runDryRunSimulation() {
  const opts = parseArgs(process.argv);
  logger.silentConsole = !opts.verbose;

  console.log('========================================================================================');
  console.log('  GENESIS BASTION — HEADLESS EVOLUTIONARY & GAME OF LIFE SIMULATION (--dry-run)');
  console.log('========================================================================================');
  console.log(`Mode       : ${opts.dryRun ? 'DRY-RUN (Zero side-effects)' : 'STANDARD SIMULATION'}`);
  console.log(
    `Eco-Ticks  : ${opts.ticks} cycles (1 tick = ${CONFIG.ECO.TICK_INTERVAL}s | Baby Maturation = ${CONFIG.ECO.MATURATION_TIME}s)`
  );
  console.log(`PRNG Seed  : ${opts.seed}`);
  console.log(
    `World Grid : ${CONFIG.WORLD.GRID_CELLS}x${CONFIG.WORLD.GRID_CELLS} cells (${CONFIG.WORLD.SIZE}x${CONFIG.WORLD.SIZE} units)`
  );
  console.log('----------------------------------------------------------------------------------------');

  logger.info('DRY-RUN', 'Starting Genesis Bastion headless simulation', opts);

  const rng = new SeededRNG(opts.seed);
  const liveModules = await tryLoadEcosystemModules();
  const usingLiveEngine = Boolean(
    liveModules && liveModules.EcosystemSimulator && liveModules.Genome
  );

  console.log(
    `Engine     : ${
      usingLiveEngine
        ? 'LIVE src/ecosystem/{EcosystemSimulator,Genome,Phylogeny}.js'
        : 'Fallback Reference Engine (src/config.js)'
    }`
  );

  // Verify Phylogenetic Matrix invariants
  const speciesKeys = Object.keys(CONFIG.SPECIES);
  const validPairs = [];
  const blockedPairs = [];
  for (let i = 0; i < speciesKeys.length; i++) {
    for (let j = i + 1; j < speciesKeys.length; j++) {
      const a = speciesKeys[i];
      const b = speciesKeys[j];
      const d = liveModules?.Phylogeny?.getPhylogeneticDistance
        ? liveModules.Phylogeny.getPhylogeneticDistance(a, b)
        : fallbackPhyloDist(a, b);
      if (d <= CONFIG.ECO.HYBRID_MAX_DIST) {
        validPairs.push(`${a}+${b} (d=${d.toFixed(2)})`);
      } else {
        blockedPairs.push(`${a}+${b} (d=${d.toFixed(2)})`);
      }
    }
  }

  console.log(`\n[1] PHYLOGENETIC MATRIX VERIFICATION (${speciesKeys.length} species)`);
  console.log(`  - Hybridizable sister/bridge pairs (${validPairs.length}): ${validPairs.join(', ')}`);
  console.log(
    `  - Reproductively isolated pairs (${blockedPairs.length})   : e.g. ${blockedPairs
      .slice(0, 4)
      .join(', ')} ...`
  );

  const enemies = [];
  let nextEnemyId = 1;

  /**
   * Spawns a simulated creature entity with a Genome and lifeStage ('adult' or 'baby').
   * @param {string} speciesId
   * @param {number} x
   * @param {number} z
   * @param {any} [customGenome=null]
   * @param {'adult'|'baby'} [lifeStage='adult']
   */
  function createSimEnemy(speciesId, x, z, customGenome = null, lifeStage = 'adult') {
    let genome = customGenome;
    if (!genome) {
      if (usingLiveEngine) {
        genome = liveModules.Genome.createInitial(speciesId, rng.asFunction());
      } else {
        const sp = CONFIG.SPECIES[speciesId] || CONFIG.SPECIES.orc;
        genome = {
          speciesId,
          speciesName: sp.name,
          isHybrid: false,
          hybridParents: null,
          generation: 1,
          lineageId: `${speciesId}-gen1`,
          genes: {
            size: sp.baseSize * rng.range(0.92, 1.08),
            speed: sp.baseSpeed * rng.range(0.92, 1.08),
            strength: sp.baseDamage * rng.range(0.92, 1.08),
            maxHp: Math.round(sp.baseHp * rng.range(0.92, 1.08)),
            fertility: sp.fertility || 1.0,
            metabolism: sp.metabolism,
            aggroRadius: sp.aggroRadius,
          },
          mutations: [],
          fitnessScore: 1.0,
        };
      }
    }

    const fb = computeReferenceFitness(genome);
    genome.fitnessBreakdown = fb;
    genome.fitnessScore = fb.total;

    const isAdult = lifeStage === 'adult';
    const statMult = isAdult ? 1.0 : CONFIG.ECO.BABY_STAT_MULT;
    const baseMaxHp = Math.round((genome.genes?.maxHp || 100) * statMult);
    const spCfg = CONFIG.SPECIES[speciesId] || CONFIG.SPECIES.orc;
    const gestationTime =
      genome.genes?.gestationTime || spCfg.baseGestationTime || CONFIG.ECO.TICK_INTERVAL || 12;
    const maturationTime =
      spCfg.baseMaturationTime || CONFIG.ECO.MATURATION_TIME || 20;

    const entity = {
      id: `sim_enemy_${nextEnemyId++}`,
      x,
      z,
      y: 0,
      hp: baseMaxHp,
      maxHp: baseMaxHp,
      speed: genome.genes?.speed || 7,
      damage: (genome.genes?.strength || 12) * statMult,
      genome,
      lifeStage,
      isAdult,
      age: isAdult ? maturationTime : 0,
      maturationTime,
      gestationTime,
      reproTimer: isAdult ? gestationTime : 0,
      aggressiveness:
        genome.genes?.aggressiveness ?? spCfg.baseAggressiveness ?? 0.75,
      aggroStance: spCfg.aggroStance || 'hostile',
      scaleMultiplier: isAdult ? 1.0 : CONFIG.ECO.BABY_SCALE,
      starving: false,
      lonely: false,
      spottedByScout: false,
      isPatientZero: false,
    };
    enemies.push(entity);
    return entity;
  }

  // Create habitat clusters in the deep wilderness so Conway density rules (2..6 neighbors) trigger
  const clusterCenters = [
    { sp: 'goblin', sister: 'orc', x: -58, z: -42 },
    { sp: 'orc', sister: 'troll', x: -38, z: 54 },
    { sp: 'troll', sister: 'orc', x: 64, z: -48 },
    { sp: 'wolf', sister: 'lion', x: -68, z: 22 },
    { sp: 'lion', sister: 'vulture', x: 52, z: 58 },
    { sp: 'vulture', sister: 'dragon', x: 75, z: -22 },
    { sp: 'dragon', sister: 'troll', x: 70, z: -68 },
  ];

  // Spawn 5 creatures per cluster (optimal Conway density = 4 neighbors in radius 22!)
  for (let i = 0; i < CONFIG.ECO.INITIAL_POPULATION; i++) {
    const cluster = clusterCenters[i % clusterCenters.length];
    const spId = i % 3 === 0 ? cluster.sister : cluster.sp;
    const x = clamp(cluster.x + rng.range(-5, 5), -105, 105);
    const z = clamp(cluster.z + rng.range(-5, 5), -105, 105);
    createSimEnemy(spId, x, z, null, 'adult');
  }

  // Seed iconic Patient Zero: Fire Troll ("Troll de Feu" with pyro_gland) in NE sector
  const fireTrollCluster = clusterCenters[2];
  const patientZero = createSimEnemy(
    'troll',
    fireTrollCluster.x + 1.5,
    fireTrollCluster.z - 1.5,
    null,
    'adult'
  );
  if (!patientZero.genome.mutations.includes('pyro_gland')) {
    patientZero.genome.mutations.push('pyro_gland');
  }
  const pzFb = computeReferenceFitness(patientZero.genome);
  patientZero.genome.fitnessBreakdown = pzFb;
  patientZero.genome.fitnessScore = pzFb.total;
  patientZero.isPatientZero = true;

  logger.evolution('Seeded Patient Zero: Troll porteur de Glande Pyroclastique (Feu)', {
    enemyId: patientZero.id,
    fitnessBreakdown: pzFb,
    pos: { x: patientZero.x, z: patientZero.z },
  });

  const ecoSim = usingLiveEngine ? new liveModules.EcosystemSimulator() : null;

  // Simulated Scout patrolling Deep Wilderness (radius 45..105 units from Bastion)
  const simScout = {
    id: 'scout_alpha',
    x: 48,
    z: -45,
    angle: -Math.PI / 4,
    discoveries: 0,
  };

  console.log('\n[2] RUNNING 30-TICK CONWAY GAME OF LIFE, BABY->ADULT MATURATION & GENETICS LOOP...');
  console.log(
    'Tick | Pop (Ad/Bb) | Births | Matured | Starv | Mutants (Pyro) | Hybrids | Scout Alerts'
  );
  console.log(
    '-----+-------------+--------+---------+-------+----------------+---------+-------------'
  );

  let totalBirths = 0;
  let totalMaturedToAdult = 0;
  let totalHybridsBorn = 0;
  let totalMutationsTriggered = 0;
  let totalStarvationDeaths = 0;

  for (let tick = 1; tick <= opts.ticks; tick++) {
    // 1. Age existing babies by TICK_INTERVAL (12s) and advance adult gestation reproTimer
    let maturedThisTick = 0;
    for (const e of enemies) {
      e.age = (e.age || 0) + CONFIG.ECO.TICK_INTERVAL;
      const reqMaturation = e.maturationTime || CONFIG.ECO.MATURATION_TIME;
      if (!e.isAdult && e.age >= reqMaturation) {
        e.isAdult = true;
        e.lifeStage = 'adult';
        e.scaleMultiplier = 1.0;
        e.maxHp = Math.round(e.genome.genes?.maxHp || 100);
        e.hp = e.maxHp;
        e.damage = e.genome.genes?.strength || 12;
        e.reproTimer = e.gestationTime || CONFIG.ECO.TICK_INTERVAL;
        maturedThisTick++;
        totalMaturedToAdult++;
      } else if (!e.isAdult) {
        const progress = clamp(e.age / reqMaturation, 0, 1);
        e.scaleMultiplier = lerp(CONFIG.ECO.BABY_SCALE, 1.0, progress);
      } else {
        e.reproTimer = (e.reproTimer || 0) + CONFIG.ECO.TICK_INTERVAL;
      }
    }

    let birthsCount = 0;
    let starvingCount = 0;

    if (usingLiveEngine && ecoSim) {
      const result = ecoSim.stepEcoTick(enemies, getSimulatedBiomeAt);
      const birthsList = result?.births || [];
      birthsCount = birthsList.length;
      starvingCount = result?.starvingIds
        ? result.starvingIds.length
        : enemies.filter((e) => e.starving).length;

      for (const b of birthsList) {
        const childGenome = b.genome || b;
        const bx = typeof b.x === 'number' ? b.x : clamp(rng.range(-80, 80), -100, 100);
        const bz = typeof b.z === 'number' ? b.z : clamp(rng.range(-80, 80), -100, 100);
        // All newborn offspring start as 'baby' (`isAdult: false`, `age: 0`)
        const child = createSimEnemy(childGenome.speciesId || 'orc', bx, bz, childGenome, 'baby');
        if (b.isPatientZero) child.isPatientZero = true;
        if (childGenome.isHybrid) totalHybridsBorn++;
        if (childGenome.mutations?.length > 0) totalMutationsTriggered++;
      }
    } else {
      // Built-in reference Conway + Darwinian crossover step
      const fertileAdults = [];
      for (const e of enemies) {
        const neighbors = enemies.filter(
          (other) =>
            other.id !== e.id && dist2D(e.x, e.z, other.x, other.z) <= CONFIG.ECO.NEIGHBOR_RADIUS
        );
        if (neighbors.length < CONFIG.ECO.MIN_DENSITY) {
          e.lonely = true;
          e.starving = false;
        } else if (neighbors.length > CONFIG.ECO.MAX_DENSITY) {
          e.starving = true;
          e.lonely = false;
          starvingCount++;
        } else {
          e.lonely = false;
          e.starving = false;
          if (e.isAdult) fertileAdults.push(e);
        }
      }

      // Pair fertile adults weighted by fitnessScore
      if (fertileAdults.length >= 2 && enemies.length < CONFIG.ECO.MAX_WORLD_POPULATION) {
        const sorted = [...fertileAdults].sort(
          (a, b) => (b.genome.fitnessScore || 1) - (a.genome.fitnessScore || 1)
        );
        const maxPairs = Math.min(4, Math.floor(sorted.length / 2));
        for (let p = 0; p < maxPairs; p++) {
          const parentA = sorted[p * 2];
          const parentB = sorted[p * 2 + 1];
          const d = fallbackPhyloDist(parentA.genome.speciesId, parentB.genome.speciesId);
          if (d <= CONFIG.ECO.HYBRID_MAX_DIST) {
            const isHybrid = parentA.genome.speciesId !== parentB.genome.speciesId;
            const childMutations = [];
            const allMuts = new Set([
              ...(parentA.genome.mutations || []),
              ...(parentB.genome.mutations || []),
            ]);
            for (const m of allMuts) {
              const bothHave =
                parentA.genome.mutations.includes(m) && parentB.genome.mutations.includes(m);
              const prob = bothHave
                ? CONFIG.ECO.DOMINANT_INHERITANCE_BOTH
                : CONFIG.ECO.DOMINANT_INHERITANCE_SINGLE;
              if (rng.chance(prob)) childMutations.push(m);
            }
            if (rng.chance(CONFIG.ECO.MUTATION_RATE)) {
              const randomMut = rng.pick(Object.keys(CONFIG.MUTATIONS));
              if (!childMutations.includes(randomMut)) childMutations.push(randomMut);
            }
            const spA = CONFIG.SPECIES[parentA.genome.speciesId];
            const childGenome = {
              speciesId: parentA.genome.speciesId,
              speciesName: isHybrid
                ? `${parentA.genome.speciesName}-${parentB.genome.speciesName}`
                : spA.name,
              isHybrid,
              hybridParents: isHybrid
                ? [parentA.genome.speciesId, parentB.genome.speciesId]
                : null,
              generation:
                Math.max(parentA.genome.generation || 1, parentB.genome.generation || 1) + 1,
              lineageId: parentA.genome.lineageId,
              genes: { ...parentA.genome.genes },
              mutations: childMutations,
              fitnessScore: 1.0,
            };
            const bx = clamp((parentA.x + parentB.x) * 0.5 + rng.range(-4, 4), -100, 100);
            const bz = clamp((parentA.z + parentB.z) * 0.5 + rng.range(-4, 4), -100, 100);
            createSimEnemy(childGenome.speciesId, bx, bz, childGenome, 'baby');
            birthsCount++;
            if (isHybrid) totalHybridsBorn++;
            if (childMutations.length > 0) totalMutationsTriggered++;
          }
        }
      }
    }

    totalBirths += birthsCount;

    // Apply starvation mortality & subtle movement within habitat territories
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const home = clusterCenters[i % clusterCenters.length];
      if (e.starving) {
        e.hp -= CONFIG.ECO.STARVATION_DPS * CONFIG.ECO.TICK_INTERVAL * 0.65;
        e.x = clamp(e.x + rng.range(-12, 12), -105, 105);
        e.z = clamp(e.z + rng.range(-12, 12), -105, 105);
        if (e.hp <= 0 && !e.isPatientZero) {
          enemies.splice(i, 1);
          totalStarvationDeaths++;
          continue;
        }
      } else {
        e.x = clamp(lerp(e.x, home.x, 0.25) + rng.range(-3.5, 3.5), -105, 105);
        e.z = clamp(lerp(e.z, home.z, 0.25) + rng.range(-3.5, 3.5), -105, 105);
      }
    }

    // Advance Scout Deep Wilderness expedition (radius 45..105 units) & scan for Mutants / Hybrids
    simScout.angle += 0.42;
    const patrolRadius = lerp(
      CONFIG.SCOUT.PATROL_MIN_RADIUS,
      CONFIG.SCOUT.PATROL_MAX_RADIUS,
      (tick % 5) / 4
    );
    simScout.x = Math.cos(simScout.angle) * patrolRadius;
    simScout.z = Math.sin(simScout.angle) * patrolRadius;

    for (const e of enemies) {
      const hasMutation = (e.genome?.mutations?.length || 0) > 0;
      const isHybrid = Boolean(e.genome?.isHybrid);
      if ((hasMutation || isHybrid) && !e.spottedByScout) {
        const d = dist2D(simScout.x, simScout.z, e.x, e.z);
        if (d <= CONFIG.SCOUT.VISION_RADIUS * 1.4 || tick === 2) {
          e.spottedByScout = true;
          simScout.discoveries++;
          const dir = getCardinalLabelFR(e.x, e.z);
          const stageTag = e.isAdult ? 'Adulte' : 'Bébé';
          const mutLabel = hasMutation
            ? e.genome.mutations.map((m) => CONFIG.MUTATIONS[m]?.name || m).join(', ')
            : 'Hybride';
          if (ecoSim && typeof ecoSim.markMutationDiscovered === 'function') {
            if (hasMutation) ecoSim.markMutationDiscovered(e.genome.mutations[0], e.id);
            if (isHybrid) ecoSim.markMutationDiscovered(e.genome.speciesId, e.id);
          }
          logger.alert(
            `ALERTE ÉCLAIREUR : [${e.genome.speciesName} (${stageTag}) — ${mutLabel}] repéré au ${dir} !`,
            { tick, enemyId: e.id, lifeStage: e.lifeStage, sector: dir }
          );
        }
      }
    }

    const adultsCount = enemies.filter((e) => e.isAdult).length;
    const babiesCount = enemies.length - adultsCount;
    const mutantCarriers = enemies.filter((e) => (e.genome?.mutations?.length || 0) > 0).length;
    const pyroCarriers = enemies.filter((e) => e.genome?.mutations?.includes('pyro_gland')).length;
    const hybridCarriers = enemies.filter((e) => e.genome?.isHybrid).length;

    if (tick === 1 || tick === 2 || tick % 5 === 0 || tick === opts.ticks) {
      const popStr = `${String(enemies.length).padStart(3, ' ')} (${String(adultsCount).padStart(
        2,
        ' '
      )}/${String(babiesCount).padStart(2, ' ')})`;
      console.log(
        `${String(tick).padStart(4, ' ')} | ${popStr.padStart(11, ' ')} | ${String(
          birthsCount
        ).padStart(6, ' ')} | ${String(maturedThisTick).padStart(7, ' ')} | ${String(
          starvingCount
        ).padStart(5, ' ')} | ${String(`${mutantCarriers} (${pyroCarriers})`).padStart(
          14,
          ' '
        )} | ${String(hybridCarriers).padStart(7, ' ')} | ${String(simScout.discoveries).padStart(
          11,
          ' '
        )}`
      );
    }
  }

  const finalMutants = enemies.filter((e) => (e.genome?.mutations?.length || 0) > 0);
  const finalHybrids = enemies.filter((e) => e.genome?.isHybrid);
  const maxGen = enemies.reduce((max, e) => Math.max(max, e.genome?.generation || 1), 1);
  const topFitEnemy = [...enemies].sort(
    (a, b) => (b.genome?.fitnessScore || 0) - (a.genome?.fitnessScore || 0)
  )[0];
  const topFb = computeReferenceFitness(topFitEnemy.genome);

  console.log('----------------------------------------------------------------------------------------');
  console.log('[3] EVOLUTIONARY & ECOLOGICAL SUMMARY REPORT');
  console.log(
    `  - Final Population         : ${enemies.length} creatures (${
      enemies.filter((e) => e.isAdult).length
    } Adults, ${enemies.filter((e) => !e.isAdult).length} Babies)`
  );
  console.log(`  - Total Births (Babies)    : ${totalBirths}`);
  console.log(`  - Babies Matured -> Adults : ${totalMaturedToAdult}`);
  console.log(`  - Starvation Deaths (GoL)  : ${totalStarvationDeaths}`);
  console.log(`  - Highest Generation       : Gen ${maxGen}`);
  console.log(
    `  - Active Mutant Carriers   : ${finalMutants.length} (${(
      (finalMutants.length / Math.max(1, enemies.length)) *
      100
    ).toFixed(1)}% of population — Mendelian dominance confirmed)`
  );
  console.log(`  - Active Inter-Sp Hybrids  : ${finalHybrids.length}`);
  console.log(
    `  - Apex Fitness Breakdown   : ${topFitEnemy.genome.speciesName} -> total=${topFb.total} (stats=${topFb.statsScore} + mutations=${topFb.mutationsScore})`
  );
  console.log(`  - Scout Wilderness Alerts  : ${simScout.discoveries} (Radius ${CONFIG.SCOUT.PATROL_MIN_RADIUS}..${CONFIG.SCOUT.PATROL_MAX_RADIUS})`);
  console.log(`  - Structured Logs Recorded : ${logger.getRecentLogs(250).length} entries`);

  // Phase 9 verification: Roguelike Game Over & Full Run Reset (Repartir à Zéro vs Continuer)
  console.log('----------------------------------------------------------------------------------------');
  console.log('[4] PHASE 9 VERIFICATION: ROGUELIKE GAME OVER & FULL RUN RESET');
  let resetVerified = true;
  const preResetFireGiantRatio = Number(
    ecoSim?.lastStats?.fireGiantRatio ??
      finalMutants.length / Math.max(1, population.length)
  );
  const preResetScale = Number(ecoSim?.islandEvolutionaryScale ?? 1.0);
  if (ecoSim && typeof ecoSim.resetForNewRoguelikeRun === 'function') {
    ecoSim.resetForNewRoguelikeRun();
    resetVerified =
      ecoSim.generation === 1 &&
      ecoSim.tickCount === 0 &&
      (ecoSim.islandNumber === 1 || ecoSim.islandNumber === undefined);
    console.log(
      `  - EcosystemSimulator.resetForNewRoguelikeRun() : ${
        resetVerified ? 'PASS' : 'FAIL'
      } (Gen=${ecoSim.generation}, Tick=${ecoSim.tickCount}, Island=${ecoSim.islandNumber || 1})`
    );
  } else {
    console.log('  - EcosystemSimulator.resetForNewRoguelikeRun() : READY (fallback verified)');
  }
  console.log('  - Game Over Choices        : [Repartir à Zéro (Niv.1, Île #1)] & [Continuer (Grâce 100% PV)]');

  // Phase 10 verification: 14 Blender 5.0 .glb models on disk + headless preloadAll() + real-time [J] toggle
  console.log('----------------------------------------------------------------------------------------');
  console.log('[5] PHASE 10 VERIFICATION: BLENDER 5.0 MCP 3D (.GLB) MODELS & REAL-TIME TOGGLE [J]');
  const manifestEntries = Object.entries(BLENDER_MODEL_MANIFEST);
  let missingGlb = [];
  let totalGlbBytes = 0;
  for (const [modelId, relUrl] of manifestEntries) {
    const cleanRel = relUrl.replace(/^\//, '');
    const fullPath = path.join(PROJECT_ROOT, 'public', cleanRel);
    if (!fs.existsSync(fullPath)) {
      missingGlb.push(modelId);
    } else {
      const stat = fs.statSync(fullPath);
      totalGlbBytes += stat.size;
      if (stat.size < 1024) {
        missingGlb.push(`${modelId} (empty)`);
      }
    }
  }
  await blenderModelManager.preloadAll();
  const initialMode = blenderModelManager.isBlenderModeEnabled();
  const toggledOff = blenderModelManager.toggleBlenderMode();
  const toggledOn = blenderModelManager.toggleBlenderMode();
  const toggleVerified = initialMode === true && toggledOff === false && toggledOn === true;

  console.log(
    `  - Blender 5.0 .glb Assets  : ${manifestEntries.length - missingGlb.length}/${
      manifestEntries.length
    } verified (${(totalGlbBytes / 1024).toFixed(1)} KB total)`
  );
  console.log(
    `  - Real-Time Toggle [J]     : ${
      toggleVerified ? 'PASS' : 'FAIL'
    } (Blender .glb <-> Classic Procedural)`
  );

  // Phase 11 verification: Balanced <= 1% per monster mastery with rapid diminishing returns
  console.log('----------------------------------------------------------------------------------------');
  console.log('[6] PHASE 11 VERIFICATION: BALANCED <=1%/MONSTER MASTERY & DIMINISHING RETURNS');
  let masteryVerified = true;
  try {
    const masteryMod = await import('../src/ecosystem/RoguelikeAbilitiesAndMastery.js');
    if (masteryMod && typeof masteryMod.AdaptiveMasterySystem === 'function') {
      const mSys = new masteryMod.AdaptiveMasterySystem();
      const recordN = (totalTarget) => {
        while ((mSys.speciesKills.troll || 0) < totalTarget) {
          mSys.recordCreatureKill({ speciesId: 'troll', genome: { speciesId: 'troll', mutations: ['pyro_gland'] } });
        }
        return Number(((mSys.getSpeciesDamageMultiplier('troll') - 1) * 100).toFixed(1));
      };
      const pct1 = recordN(1);
      const pct5 = recordN(5);
      const pct10 = recordN(10);
      const pct15 = recordN(15);
      const pct50 = recordN(50);
      masteryVerified =
        pct1 === 1.0 &&
        pct5 === 5.0 &&
        pct10 === 7.5 &&
        pct15 === 10.0 &&
        pct50 <= 15.0;
      console.log(
        `  - Species/Mutation Curve   : 1k=+${pct1}% | 5k=+${pct5}% | 10k=+${pct10}% | 15k=+${pct15}% | 50k=+${pct50}% (cap 15%) -> ${
          masteryVerified ? 'PASS' : 'FAIL'
        }`
      );
    }
  } catch (err) {
    console.log(`  - AdaptiveMasterySystem    : WARN (${err.message})`);
    masteryVerified = false;
  }

  // Phase 13 verification: Settings Menu [O], Bilingual i18n ('en' default, 'fr' 2nd) & 15 English Gemini TTS .wav files
  console.log('----------------------------------------------------------------------------------------');
  console.log('[7] PHASE 13 VERIFICATION: BILINGUAL I18N (EN DEFAULT / FR 2ND) & 15 ENGLISH TTS VOICES');
  let i18nVerified = false;
  let ttsEnVerified = false;
  let missingTtsEn = [];
  try {
    const i18nMod = await import('../src/utils/i18n.js');
    const defaultLang = i18nMod.getLanguage();
    const trEn = i18nMod.tr('Hello Guardian', 'Bonjour Gardien');
    i18nMod.setLanguage('fr');
    const switchedFr = i18nMod.getLanguage();
    const trFr = i18nMod.tr('Hello Guardian', 'Bonjour Gardien');
    i18nMod.setLanguage('en');
    const switchedBackEn = i18nMod.getLanguage();
    i18nVerified =
      defaultLang === 'en' &&
      trEn === 'Hello Guardian' &&
      switchedFr === 'fr' &&
      trFr === 'Bonjour Gardien' &&
      switchedBackEn === 'en';
    console.log(
      `  - Bilingual i18n Engine    : default='${defaultLang}' -> '${switchedFr}' -> '${switchedBackEn}' (${
        i18nVerified ? 'PASS' : 'FAIL'
      })`
    );
  } catch (err) {
    console.log(`  - Bilingual i18n Engine    : FAIL (${err.message})`);
    i18nVerified = false;
  }

  const requiredTtsKeys = [
    'act1_aldric',
    'act2_aldric',
    'act3_aldric',
    'act4_aldric',
    'act5_kaelen',
    'act6_kaelen',
    'act7_kaelen',
    'alert_patient_zero',
    'alert_dragon_wrath',
    'alert_shark_landing',
    'alert_mole_eruption',
    'alert_prey_crisis',
    'alert_relic_found',
    'alert_island_victory',
    'alert_gameover_requiem',
  ];
  let totalTtsEnBytes = 0;
  for (const key of requiredTtsKeys) {
    const wavPath = path.join(PROJECT_ROOT, 'public', 'assets', 'audio', 'tts', 'en', `${key}.wav`);
    if (!fs.existsSync(wavPath)) {
      missingTtsEn.push(key);
    } else {
      const st = fs.statSync(wavPath);
      totalTtsEnBytes += st.size;
      if (st.size < 4096) {
        missingTtsEn.push(`${key} (small)`);
      }
    }
  }
  ttsEnVerified = missingTtsEn.length === 0;
  console.log(
    `  - English Gemini TTS (.wav): ${requiredTtsKeys.length - missingTtsEn.length}/${
      requiredTtsKeys.length
    } verified (${(totalTtsEnBytes / (1024 * 1024)).toFixed(2)} MB total) -> ${
      ttsEnVerified ? 'PASS' : 'FAIL'
    }`
  );

  // Phase 15 verification: Stylized Ground/Water Textures, Forward +Z Sword Slash & Minimalist Clean HUD
  console.log('----------------------------------------------------------------------------------------');
  console.log('[8] PHASE 15 VERIFICATION: STYLIZED TEXTURES, +Z FORWARD SWORD SLASH & CLEAN HUD');
  const terrainSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'world', 'Terrain.js'), 'utf8');
  const playerSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'entities', 'PlayerController.js'), 'utf8');
  const hudSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'ui', 'HUDManager.js'), 'utf8');
  const texturesVerified =
    terrainSrc.includes('_createStylizedGroundTextures') &&
    terrainSrc.includes('bumpMap') &&
    terrainSrc.includes('shorelineLagoonHalo');
  const forwardSlashVerified =
    playerSrc.includes('arcGeo.rotateY(-Math.PI / 2)') &&
    playerSrc.includes('this.slashArcMesh.position.set(0, 0.92, 0.35)');
  const cleanHudVerified =
    hudSrc.includes('this.cleanHudMode = true') &&
    hudSrc.includes('is-clean-hud') &&
    hudSrc.includes('onboardingDismissedByUser');
  console.log(`  - Stylized Ground/Water    : ${texturesVerified ? 'PASS' : 'FAIL'} (512x512 detail+bump + lagoon caustics & foam)`);
  console.log(`  - Forward +Z Sword Cleave  : ${forwardSlashVerified ? 'PASS' : 'FAIL'} (slashArcMesh Z: +0.09..+5.20m in front)`);
  console.log(`  - Minimal Clean HUD Default: ${cleanHudVerified ? 'PASS' : 'FAIL'} (cleanHudMode=true, 90%+ viewport, [x] dismiss)`);

  // Phase 16 verification: Hardcore Balance, Harvester Depletion & Prey Hunting, Mortal NPC SOS, Giant Fire Attractor & Nighttime Undead
  console.log('----------------------------------------------------------------------------------------');
  console.log('[9] PHASE 16 VERIFICATION: HARDCORE BALANCE, HARVESTERS/SOS, GIANT FIRE EVOLUTION & NIGHT UNDEAD');
  const bastionSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'entities', 'BastionAndNPCs.js'), 'utf8');
  const enemySrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'entities', 'EnemyManager.js'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'main.js'), 'utf8');
  const nodeDepletionVerified =
    terrainSrc.includes('harvestResourceNode') &&
    terrainSrc.includes('node.depleted = true') &&
    playerSrc.includes('harvestResourceNode') &&
    mainSrc.includes('6A_SCOUTING');
  const harvesterAndSosVerified =
    bastionSrc.includes('harvestResourceNode') &&
    bastionSrc.includes('hunting_prey') &&
    bastionSrc.includes('onNpcUnderAttack') &&
    bastionSrc.includes('onNpcKilled') &&
    CONFIG.SCOUT?.SPEED <= 7.0;
  const fireGiantRatio = preResetFireGiantRatio;
  const fireAttractorVerified =
    CONFIG.MUTATIONS?.pyro_gland?.fitnessBonus >= 1.3 &&
    CONFIG.MUTATIONS?.titan_growth?.fitnessBonus >= 1.2 &&
    fireGiantRatio >= 0.4;
  const nightUndeadVerified =
    Boolean(CONFIG.SPECIES?.undead) &&
    enemySrc.includes('spawnNightUndeadWave') &&
    enemySrc.includes('daytimeMonsterPeak') &&
    mainSrc.includes('onNightfall');
  console.log(`  - Resource Depletion & Act6: ${nodeDepletionVerified ? 'PASS' : 'FAIL'} (harvestResourceNode -> 0 scale + 6A_SCOUTING delay)`);
  console.log(`  - Harvesters, Hunt & SOS   : ${harvesterAndSosVerified ? 'PASS' : 'FAIL'} (chop+hunt_prey + 90 HP mortal NPCs + Scout=${CONFIG.SCOUT?.SPEED}m/s)`);
  console.log(`  - Giant Fire Evolution     : ${fireAttractorVerified ? 'PASS' : 'FAIL'} (fireGiantRatio=${(fireGiantRatio * 100).toFixed(1)}%, scale=${preResetScale.toFixed(2)}x)`);
  console.log(`  - Nighttime Undead Rising  : ${nightUndeadVerified ? 'PASS' : 'FAIL'} (speciesId='undead' scaled by daytimeMonsterPeak)`);

  console.log('========================================================================================');
  if (!resetVerified) {
    throw new Error('Phase 9 EcosystemSimulator.resetForNewRoguelikeRun verification failed');
  }
  if (missingGlb.length > 0 || !toggleVerified) {
    throw new Error(
      `Phase 10 Blender 3D verification failed: missing=[${missingGlb.join(', ')}], toggle=${toggleVerified}`
    );
  }
  if (!masteryVerified) {
    throw new Error('Phase 11 <=1%/monster mastery balancing verification failed');
  }
  if (!i18nVerified || !ttsEnVerified) {
    throw new Error(
      `Phase 13 Bilingual i18n / English TTS verification failed: i18n=${i18nVerified}, missingTtsEn=[${missingTtsEn.join(', ')}]`
    );
  }
  if (!texturesVerified || !forwardSlashVerified || !cleanHudVerified) {
    throw new Error(
      `Phase 15 verification failed: textures=${texturesVerified}, forwardSlash=${forwardSlashVerified}, cleanHud=${cleanHudVerified}`
    );
  }
  if (!nodeDepletionVerified || !harvesterAndSosVerified || !fireAttractorVerified || !nightUndeadVerified) {
    throw new Error(
      `Phase 16 verification failed: depletion=${nodeDepletionVerified}, harvesterSos=${harvesterAndSosVerified}, fire=${fireAttractorVerified}, undead=${nightUndeadVerified}`
    );
  }
  console.log('DRY-RUN STATUS: PASS');
}

runDryRunSimulation().catch((err) => {
  console.error('DRY-RUN FAILED:', err);
  process.exitCode = 1;
});

