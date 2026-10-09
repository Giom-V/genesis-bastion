/**
 * @file src/ecosystem/BalanceAndPacing.js
 * @description Module de Game Design, d'équilibrage systémique et de rythme (pacing)
 * pour **Genesis Bastion**.
 *
 * Ce module gouverne les quatre piliers mathématiques et tactiques du gameplay :
 * 1. **Cycle de Vie & Fenêtre de Réaction Juvénile (`getMaturationProfile`, `evaluateCreatureLifeStage`)** :
 *    - Chaque nouvelle naissance issue d'un Eco-Tick commence au stade **Bébé** (`lifeStage: 'baby'`,
 *      `isAdult: false`, échelle 3D `0.5x -> 1.0x`, stats de combat `0.55x`, métabolisme `0.50x`).
 *    - Un Bébé **ne peut pas se reproduire** tant qu'il n'a pas atteint sa durée de maturation
 *      spécifique à son clade (`16s` Gobelin à `38s` Dragon).
 *    - Cette règle crée une fenêtre d'intervention tactique de **20 à 35 secondes** permettant au
 *      joueur, alerté par un Éclaireur, de sprinter dans les terres sauvages pour assassiner un
 *      Patient Zéro juvénile avant son premier cycle de reproduction adulte.
 *
 * 2. **Formule Darwinienne de Fitness (`computeDetailedFitness`, `computeFitnessScore`)** :
 *    - Calcule explicitement le `fitnessScore` à partir des **stats génétiques normalisées**
 *      (`strength`, `maxHp`, `speed`, `size`, `fertility`, `aggroRadius`), du **bonus d'adaptation
 *      au biome**, de la **vigueur hybride (hétérosis)** et des **bonus de mutations dominantes**,
 *      pondérés par le **coût métabolique** (`metabolism`).
 *    - Garantit que les mutants à haute valeur sélective dominent la reproduction en densité
 *      optimale (2–5 voisins), mais que les lignées hyper-métaboliques (ex. *Gigantisme Titanesque* +
 *      *Glande Pyroclastique*) épuisent plus vite la biomasse locale et déclenchent des famines
 *      auto-régulatrices (`starving`).
 *
 * 3. **Planificateur d'Expédition des Éclaireurs Hors-Frontière (`pickScoutExpeditionWaypoint`, `computeScoutEvasionVector`)** :
 *    - Dirige les Éclaireurs (`role === 'scout'`) bien au-delà du périmètre du Bastion, dans les
 *      secteurs sauvages profonds (**Deep Wilderness**, rayon `50` à `108` unités), en priorisant
 *      les biomes à haut risque mutagène (caldeira volcanique, hautes terres, forêts lointaines)
 *      et les secteurs les moins récemment patrouillés, tout en maintenant un tampon d'esquive
 *      (`flee`) face aux meutes ennemies.
 *
 * 4. **Contre-Adaptations Roguelike (`DESIGNED_UPGRADES`, `pickCounterAdaptationUpgrades`)** :
 *    - Catalogue enrichi d'améliorations roguelike interagissant directement avec la génétique,
 *      la biomasse de Conway, la traque des Patients Zéro et les Éclaireurs.
 */

import { CONFIG } from '../config.js';
import { clamp, lerp, dist2D, angleBetween, getCardinalLabelFR } from '../utils/math.js';
import { logger } from '../utils/logger.js';

/**
 * Constantes maîtresses d'équilibrage et de pacing ("Single Source of Truth" du Game Design).
 */
export const BALANCE = {
  /**
   * Durées de maturation (en secondes) du stade Bébé (`baby`) au stade Adulte reproducteur (`adult`).
   * Différenciées fortement par espèce pour refléter la biologie de chaque clade :
   * - Gobelin (12s) & Loup (15s) : croissance rapide mais fragile.
   * - Orc (22s) & Lion (26s) : croissance intermédiaire.
   * - Troll (34s) & Dragon (50s) : longue période juvénile vulnérable permettant au joueur
   *   d'intercepter un colosse ou un Dragon mutant avant sa maturité.
   */
  MATURATION_BY_SPECIES: {
    goblin: 12,
    wolf: 15,
    vulture: 17,
    orc: 22,
    lion: 26,
    troll: 34,
    dragon: 50,
  },

  /**
   * Cooldowns de gestation / reproduction de base (en secondes) entre deux pontes/portées
   * pour chaque parent adulte (`reproductionCooldown = genes.gestationTime`).
   */
  GESTATION_BY_SPECIES: {
    goblin: 9,
    wolf: 13,
    vulture: 15,
    orc: 18,
    lion: 24,
    troll: 30,
    dragon: 65,
  },

  /**
   * Gène d'agressivité de base (`0.05` à `1.00`) et posture comportementale (`aggroStance`) par espèce :
   * - `'hostile'` : chasse activement le joueur et assiège le Bastion.
   * - `'territorial'` : patrouille son biome avec rayon d'aggro réduit (`aggroRadius * (0.45 + 0.55 * aggressiveness)`)
   *   sauf en cas de famine (`starving`) ou d'attaque directe.
   * - `'pacifist_apex'` : les Dragons sont des souverains paisibles (`0.08`) qui n'attaquent jamais
   *   en premier, mais déclenchent le Courroux Draconique (`90s`) de toute leur espèce s'ils sont attaqués.
   */
  AGGRESSIVENESS_BY_SPECIES: {
    orc: 0.88,
    wolf: 0.82,
    goblin: 0.75,
    lion: 0.70,
    troll: 0.48,
    vulture: 0.38,
    dragon: 0.08,
  },

  AGGRO_STANCE_BY_SPECIES: {
    orc: 'hostile',
    wolf: 'hostile',
    goblin: 'hostile',
    lion: 'hostile',
    troll: 'territorial',
    vulture: 'territorial',
    dragon: 'pacifist_apex',
  },

  /**
   * Paramètres de repeuplement sauvage depuis les habitats cachés (terriers, tanières, falaises, crêtes)
   * garantissant qu'aucune des 7 espèces de base ne s'éteint définitivement (`< 2` individus vivants).
   */
  REPOPULATION_BY_SPECIES: {
    goblin: {
      cooldown: 8,
      minThreshold: 2,
      spawnCount: 2,
      habitatLabel: 'les terriers forestiers',
      messageFR: 'Des Gobelins sauvages émergent de leurs terriers forestiers !',
    },
    wolf: {
      cooldown: 12,
      minThreshold: 2,
      spawnCount: 2,
      habitatLabel: 'les tanières sylvestres',
      messageFR: 'Des Loups sauvages quittent leurs tanières sylvestres !',
    },
    vulture: {
      cooldown: 12,
      minThreshold: 2,
      spawnCount: 2,
      habitatLabel: 'les nids des falaises escarpées',
      messageFR: 'Des Vautours descendent en piqué depuis les nids des falaises !',
    },
    orc: {
      cooldown: 16,
      minThreshold: 2,
      spawnCount: 2,
      habitatLabel: 'les campements enfouis des plaines',
      messageFR: 'Une patrouille d’Orcs sauvages surgit des campements enfouis !',
    },
    lion: {
      cooldown: 16,
      minThreshold: 2,
      spawnCount: 2,
      habitatLabel: 'les hautes herbes sauvages',
      messageFR: 'Un couple de Lions sauvages regagne son territoire dans les plaines !',
    },
    troll: {
      cooldown: 16,
      minThreshold: 2,
      spawnCount: 2,
      habitatLabel: 'les cavernes profondes des hautes terres',
      messageFR: 'Des Trolls anciens sortent des cavernes profondes des hautes terres !',
    },
    dragon: {
      cooldown: 28,
      minThreshold: 2,
      spawnCount: 2,
      habitatLabel: 'les crêtes volcaniques inaccessibles',
      messageFR: 'Un couple de Dragons ancestraux se pose sur la caldeira volcanique !',
    },
  },

  /**
   * Paramètres du Courroux d'Espèce (Collective Species Wrath) lorsqu'une espèce `pacifist_apex`
   * (Dragon) est provoquée par le joueur.
   */
  SPECIES_WRATH: {
    DURATION_SEC: CONFIG.ECO?.SPECIES_WRATH_DURATION ?? 90,
    SPEED_MULTIPLIER: 1.25,
    AGGRO_OVERRIDE: 1.0,
  },

  /**
   * Paramètres du croisement génétique à expansion de spectre (Scope-Expanding Crossover) :
   * Chaque gène quantitatif tire uniformément dans `[min(Dad, Mom), max(Dad, Mom)]`
   * puis est multiplié par un facteur de dérive uniforme dans `[0.90, 1.10]` (+/- 10%).
   */
  CROSSOVER_DRIFT: {
    MIN_MULTIPLIER: 0.90,
    MAX_MULTIPLIER: 1.10,
    MIN_CLAMP_FACTOR: 0.35,
    MAX_CLAMP_FACTOR: 4.5,
  },

  /**
   * Modificateurs de temps de maturation (en secondes) induits par certaines mutations.
   * Les mutations de gigantisme ou de blindage osseux demandent une croissance plus longue,
   * offrant quelques secondes supplémentaires au joueur pour intercepter un titan juvénile.
   */
  MATURATION_MUTATION_OFFSET: {
    pyro_gland: 2.0,
    venom_sacs: 0.0,
    osteo_plating: 3.0,
    vampiric_maw: 1.0,
    cryo_blood: 2.5,
    winged_leap: -2.0,
    titan_growth: 5.0,
  },

  /**
   * Multiplicateurs phénotypiques appliqués aux créatures au stade Bébé (`lifeStage === 'baby'`).
   */
  JUVENILE_TRAITS: {
    INITIAL_SCALE: CONFIG.ECO?.BABY_SCALE ?? 0.5,
    ADULT_SCALE: 1.0,
    STAT_MULTIPLIER: CONFIG.ECO?.BABY_STAT_MULT ?? 0.55,
    METABOLISM_MULTIPLIER: CONFIG.ECO?.BABY_METABOLISM_MULT ?? 0.5,
    XP_MULTIPLIER: 0.65,
    CAN_REPRODUCE: false,
  },

  /**
   * Pondérations de la formule de Fitness Darwinien (`computeDetailedFitness`).
   * La somme des poids des traits vaut 1.00 pour qu'un individu Gen-1 sauvage non muté
   * obtienne un `statsScore` de référence exactement égal à `1.000`.
   */
  FITNESS_WEIGHTS: {
    strength: 0.26,
    maxHp: 0.24,
    speed: 0.18,
    fertility: 0.14,
    size: 0.10,
    aggroRadius: 0.08,
    /** Exposant d'efficience métabolique : pénalise modérément la surconsommation de biomasse */
    metabolicExponent: 0.24,
    /** Bonus d'adaptation lorsque la créature évolue dans son biome de prédilection */
    preferredBiomeBonus: 0.14,
    /** Bonus d'hétérosis (vigueur hybride) pour les croisements inter-espèces */
    hybridVigorBonus: 0.18,
    /** Synergie supplémentaire lorsque 2+ mutations dominantes coexistent sur le même génome */
    polyMutationSynergy: 0.08,
  },

  /**
   * Paramètres d'expédition lointaine des Éclaireurs (Deep Wilderness Exploration).
   */
  SCOUT_EXPEDITION: {
    MIN_RADIUS: 50,
    MAX_RADIUS: 108,
    HIGH_RISK_MIN_RADIUS: 68,
    HIGH_RISK_MAX_RADIUS: 104,
    CANDIDATE_SAMPLES: 9,
    THREAT_AVOIDANCE_BUFFER: 24,
    FLEE_TRIGGER_RADIUS: CONFIG.SCOUT?.FLEE_RADIUS ?? 16,
    VISION_RADIUS: CONFIG.SCOUT?.VISION_RADIUS ?? 34,
    /** Biomes prioritaires où émergent les prédateurs apex et les Trolls/Dragons mutants */
    BIOME_PRIORITY_WEIGHTS: {
      volcanic: 1.45,
      highlands: 1.30,
      forest: 1.20,
      plains: 1.0,
      beach: 0.75,
    },
  },
};

/**
 * Évalue un tirage pseudo-aléatoire uniforme dans `[0, 1)` depuis `Math.random` ou `SeededRNG`.
 *
 * @param {Function|object} [rng=Math.random] - Fonction RNG ou instance de `SeededRNG`.
 * @returns {number} Flottant dans `[0, 1)`.
 */
function sampleRng(rng = Math.random) {
  if (typeof rng === 'function') {
    const v = rng();
    return Number.isFinite(v) ? clamp(v, 0, 0.9999999) : Math.random();
  }
  if (rng && typeof rng.next === 'function') {
    return clamp(rng.next(), 0, 0.9999999);
  }
  return Math.random();
}

/**
 * Calcule l'héritage d'un gène quantitatif selon la formule de croisement à expansion de spectre :
 * `rawValue = uniform(min(valDad, valMom), max(valDad, valMom))`
 * `mutatedValue = rawValue * uniform(0.90, 1.10)`
 * Ainsi, même si deux parents ont la même valeur (ex. `10`), l'enfant peut dériver dans `[9, 11]`,
 * élargissant le pool génétique de génération en génération pour que la sélection naturelle opère.
 *
 * @param {number} valDad - Valeur du gène chez le parent A.
 * @param {number} valMom - Valeur du gène chez le parent B.
 * @param {number} [minBound=0.1] - Borne minimale absolue autorisée pour ce gène.
 * @param {number} [maxBound=9999] - Borne maximale absolue autorisée pour ce gène.
 * @param {Function|object} [rng=Math.random] - Générateur aléatoire.
 * @returns {number} Valeur héritée et dérivée du gène.
 */
export function sampleScopeExpandingGene(
  valDad,
  valMom,
  minBound = 0.1,
  maxBound = 9999,
  rng = Math.random
) {
  const safeDad = Number.isFinite(valDad) ? valDad : minBound;
  const safeMom = Number.isFinite(valMom) ? valMom : safeDad;
  const low = Math.min(safeDad, safeMom);
  const high = Math.max(safeDad, safeMom);
  const rawValue = low + (high - low) * sampleRng(rng);
  const driftMin = BALANCE.CROSSOVER_DRIFT.MIN_MULTIPLIER;
  const driftMax = BALANCE.CROSSOVER_DRIFT.MAX_MULTIPLIER;
  const driftFactor = driftMin + (driftMax - driftMin) * sampleRng(rng);
  const mutatedValue = rawValue * driftFactor;
  return Number(clamp(mutatedValue, minBound, maxBound).toFixed(3));
}

/**
 * Résout le profil reproductif, comportemental (agressivité / posture) et de repeuplement sauvage
 * d'une espèce (pure ou hybride).
 *
 * @param {string} [speciesId='goblin'] - Identifiant de l'espèce (`'goblin'`, `'dragon'`, `'orc_troll'`, etc.).
 * @param {object} [genes={}] - Gènes individuels éventuels (`gestationTime`, `aggressiveness`).
 * @param {string[]} [mutations=[]] - Mutations actives éventuelles.
 * @returns {{
 *   speciesId: string,
 *   gestationTime: number,
 *   maturationTime: number,
 *   aggressiveness: number,
 *   aggroStance: 'hostile' | 'territorial' | 'pacifist_apex',
 *   isPacifistApex: boolean,
 *   effectiveAggroRadiusMultiplier: number,
 *   repopulationCooldown: number,
 *   repopulationHabitatLabel: string,
 *   repopulationMessageFR: string,
 *   wrathDurationSec: number,
 *   wrathSpeedMultiplier: number
 * }} Profil reproductif et comportemental complet.
 */
export function getSpeciesReproductiveAndAggroProfile(
  speciesId = 'goblin',
  genes = {},
  mutations = []
) {
  const spCfg = CONFIG?.SPECIES?.[speciesId];
  let baseGestation =
    spCfg?.baseGestationTime ?? BALANCE.GESTATION_BY_SPECIES[speciesId];
  let baseAggro =
    spCfg?.baseAggressiveness ?? BALANCE.AGGRESSIVENESS_BY_SPECIES[speciesId];
  let aggroStance =
    spCfg?.aggroStance ?? BALANCE.AGGRO_STANCE_BY_SPECIES[speciesId] ?? 'hostile';

  if (typeof baseGestation !== 'number' || typeof baseAggro !== 'number') {
    if (typeof speciesId === 'string' && speciesId.includes('_')) {
      const [pA, pB] = speciesId.split('_');
      const gA =
        CONFIG?.SPECIES?.[pA]?.baseGestationTime ??
        BALANCE.GESTATION_BY_SPECIES[pA] ??
        16;
      const gB =
        CONFIG?.SPECIES?.[pB]?.baseGestationTime ??
        BALANCE.GESTATION_BY_SPECIES[pB] ??
        16;
      baseGestation = (gA + gB) * 0.5;

      const aA =
        CONFIG?.SPECIES?.[pA]?.baseAggressiveness ??
        BALANCE.AGGRESSIVENESS_BY_SPECIES[pA] ??
        0.7;
      const aB =
        CONFIG?.SPECIES?.[pB]?.baseAggressiveness ??
        BALANCE.AGGRESSIVENESS_BY_SPECIES[pB] ??
        0.7;
      baseAggro = (aA + aB) * 0.5;

      const stA =
        CONFIG?.SPECIES?.[pA]?.aggroStance ??
        BALANCE.AGGRO_STANCE_BY_SPECIES[pA] ??
        'hostile';
      const stB =
        CONFIG?.SPECIES?.[pB]?.aggroStance ??
        BALANCE.AGGRO_STANCE_BY_SPECIES[pB] ??
        'hostile';
      if (stA === 'pacifist_apex' && stB === 'pacifist_apex') {
        aggroStance = 'pacifist_apex';
      } else if (stA === 'territorial' || stB === 'territorial') {
        aggroStance = baseAggro < 0.58 ? 'territorial' : 'hostile';
      } else {
        aggroStance = 'hostile';
      }
    } else {
      baseGestation = baseGestation ?? 15;
      baseAggro = baseAggro ?? 0.75;
    }
  }

  const matProfile = getMaturationProfile(speciesId, mutations);
  const gestationTime = Number(
    clamp(genes?.gestationTime ?? baseGestation, 4, 180).toFixed(1)
  );
  const aggressiveness = Number(
    clamp(genes?.aggressiveness ?? baseAggro, 0.05, 1.0).toFixed(3)
  );
  const isPacifistApex = aggroStance === 'pacifist_apex';

  const effectiveAggroRadiusMultiplier = isPacifistApex
    ? 0.0
    : aggroStance === 'territorial'
      ? Number((0.45 + 0.55 * aggressiveness).toFixed(3))
      : Number((0.75 + 0.35 * aggressiveness).toFixed(3));

  const repopEntry = BALANCE.REPOPULATION_BY_SPECIES[speciesId] || {
    cooldown: spCfg?.repopulationCooldown ?? 14,
    habitatLabel: spCfg?.repopulationHabitatLabel ?? 'les terres sauvages',
    messageFR:
      spCfg?.repopulationMessageFR ??
      'De nouveaux individus sauvages émergent de leur habitat caché !',
  };

  return {
    speciesId,
    gestationTime,
    maturationTime: matProfile.maturationTime,
    aggressiveness,
    aggroStance,
    isPacifistApex,
    effectiveAggroRadiusMultiplier,
    repopulationCooldown: spCfg?.repopulationCooldown ?? repopEntry.cooldown,
    repopulationHabitatLabel:
      spCfg?.repopulationHabitatLabel ?? repopEntry.habitatLabel,
    repopulationMessageFR:
      spCfg?.repopulationMessageFR ?? repopEntry.messageFR,
    wrathDurationSec: BALANCE.SPECIES_WRATH.DURATION_SEC,
    wrathSpeedMultiplier: BALANCE.SPECIES_WRATH.SPEED_MULTIPLIER,
  };
}

/**
 * Calcule le profil complet de maturation juvénile (`baby` -> `adult`) pour une espèce
 * (pure ou hybride) et ses mutations éventuelles.
 *
 * Chaque nouveau-né commence au stade `lifeStage: 'baby'` (`isAdult: false`) et ne peut pas
 * se reproduire lors des Eco-Ticks tant que son `age` (en secondes) n'a pas atteint `maturationTime`.
 *
 * @param {string} [speciesId='goblin'] - Identifiant de l'espèce (`'goblin'`, `'troll'`, `'goblin_orc'`, etc.).
 * @param {string[]} [mutations=[]] - Liste des identifiants de mutations portées par le nouveau-né.
 * @returns {{
 *   speciesId: string,
 *   lifeStage: 'baby',
 *   isAdult: false,
 *   canReproduce: false,
 *   maturationTime: number,
 *   gestationTime: number,
 *   baseAggressiveness: number,
 *   aggroStance: string,
 *   babyScale: number,
 *   adultScale: number,
 *   babyStatMult: number,
 *   babyMetabolismMult: number,
 *   estimatedPlayerInterceptWindowSec: number
 * }} Profil de maturation prêt à être attaché à une entité nouveau-née.
 */
export function getMaturationProfile(speciesId = 'goblin', mutations = []) {
  const durationTable = BALANCE.MATURATION_BY_SPECIES;
  const spCfg = CONFIG?.SPECIES?.[speciesId];
  let baseDuration = spCfg?.baseMaturationTime ?? durationTable[speciesId];
  let baseGestation =
    spCfg?.baseGestationTime ?? BALANCE.GESTATION_BY_SPECIES[speciesId] ?? 15;
  let baseAggressiveness =
    spCfg?.baseAggressiveness ?? BALANCE.AGGRESSIVENESS_BY_SPECIES[speciesId] ?? 0.75;
  let aggroStance =
    spCfg?.aggroStance ?? BALANCE.AGGRO_STANCE_BY_SPECIES[speciesId] ?? 'hostile';

  // Si c'est un hybride (ex. 'orc_troll' ou 'vulture_dragon'), moyenne les durées des espèces parentes
  if (typeof baseDuration !== 'number') {
    if (typeof speciesId === 'string' && speciesId.includes('_')) {
      const parts = speciesId.split('_');
      const dA =
        CONFIG?.SPECIES?.[parts[0]]?.baseMaturationTime ??
        durationTable[parts[0]] ??
        (CONFIG.ECO?.MATURATION_TIME || 20);
      const dB =
        CONFIG?.SPECIES?.[parts[1]]?.baseMaturationTime ??
        durationTable[parts[1]] ??
        (CONFIG.ECO?.MATURATION_TIME || 20);
      baseDuration = (dA + dB) * 0.5;

      const gA =
        CONFIG?.SPECIES?.[parts[0]]?.baseGestationTime ??
        BALANCE.GESTATION_BY_SPECIES[parts[0]] ??
        15;
      const gB =
        CONFIG?.SPECIES?.[parts[1]]?.baseGestationTime ??
        BALANCE.GESTATION_BY_SPECIES[parts[1]] ??
        15;
      baseGestation = (gA + gB) * 0.5;

      const aA =
        CONFIG?.SPECIES?.[parts[0]]?.baseAggressiveness ??
        BALANCE.AGGRESSIVENESS_BY_SPECIES[parts[0]] ??
        0.7;
      const aB =
        CONFIG?.SPECIES?.[parts[1]]?.baseAggressiveness ??
        BALANCE.AGGRESSIVENESS_BY_SPECIES[parts[1]] ??
        0.7;
      baseAggressiveness = (aA + aB) * 0.5;
    } else {
      baseDuration = CONFIG.ECO?.MATURATION_TIME || 20;
    }
  }

  let mutationOffset = 0;
  if (Array.isArray(mutations)) {
    for (const mutId of mutations) {
      mutationOffset += BALANCE.MATURATION_MUTATION_OFFSET[mutId] ?? 0;
    }
  }

  const maturationTime = Number(clamp(baseDuration + mutationOffset, 10, 68).toFixed(1));
  const gestationTime = Number(clamp(baseGestation, 6, 120).toFixed(1));
  const ecoTickInterval = CONFIG.ECO?.TICK_INTERVAL || 12;

  // Fenêtre de réaction effective avant le premier Eco-Tick suivant la maturité adulte
  const ticksUntilAdult = Math.ceil(maturationTime / ecoTickInterval);
  const estimatedPlayerInterceptWindowSec = Math.max(
    maturationTime + gestationTime * 0.35,
    ticksUntilAdult * ecoTickInterval
  );

  return {
    speciesId,
    lifeStage: 'baby',
    isAdult: false,
    canReproduce: false,
    maturationTime,
    gestationTime,
    baseAggressiveness: Number(baseAggressiveness.toFixed(3)),
    aggroStance,
    babyScale: BALANCE.JUVENILE_TRAITS.INITIAL_SCALE,
    adultScale: BALANCE.JUVENILE_TRAITS.ADULT_SCALE,
    babyStatMult: BALANCE.JUVENILE_TRAITS.STAT_MULTIPLIER,
    babyMetabolismMult: BALANCE.JUVENILE_TRAITS.METABOLISM_MULTIPLIER,
    estimatedPlayerInterceptWindowSec: Number(estimatedPlayerInterceptWindowSec.toFixed(1)),
  };
}

/**
 * Calcule l'état de croissance courant d'une créature en fonction de son âge (`age`)
 * et de son temps de maturation (`maturationTime`).
 * Permet à `EnemyManager`, `CreatureMeshBuilder` et `EcosystemSimulator` de mettre à jour
 * de manière fluide l'échelle 3D (`0.5x -> 1.0x`), les stats et l'éligibilité reproductrice.
 *
 * @param {number} age - Âge actuel de la créature en secondes.
 * @param {number} [maturationTime=20] - Durée requise pour devenir adulte en secondes.
 * @returns {{
 *   lifeStage: 'baby' | 'adult',
 *   isAdult: boolean,
 *   canReproduce: boolean,
 *   growthProgress: number,
 *   scaleMultiplier: number,
 *   statMultiplier: number,
 *   metabolismMultiplier: number,
 *   stageLabelFR: string
 * }} État de croissance calculé.
 */
export function evaluateCreatureLifeStage(age = 0, maturationTime = 20) {
  const safeMaturation = Math.max(1, maturationTime || CONFIG.ECO?.MATURATION_TIME || 20);
  const safeAge = Math.max(0, age || 0);
  const growthProgress = clamp(safeAge / safeMaturation, 0, 1);
  const isAdult = growthProgress >= 1.0;

  const scaleMultiplier = isAdult
    ? BALANCE.JUVENILE_TRAITS.ADULT_SCALE
    : Number(
        lerp(
          BALANCE.JUVENILE_TRAITS.INITIAL_SCALE,
          BALANCE.JUVENILE_TRAITS.ADULT_SCALE,
          growthProgress
        ).toFixed(3)
      );

  const statMultiplier = isAdult
    ? 1.0
    : Number(lerp(BALANCE.JUVENILE_TRAITS.STAT_MULTIPLIER, 1.0, growthProgress * 0.45).toFixed(3));

  const metabolismMultiplier = isAdult
    ? 1.0
    : BALANCE.JUVENILE_TRAITS.METABOLISM_MULTIPLIER;

  return {
    lifeStage: isAdult ? 'adult' : 'baby',
    isAdult,
    canReproduce: isAdult,
    growthProgress: Number(growthProgress.toFixed(3)),
    scaleMultiplier,
    statMultiplier,
    metabolismMultiplier,
    stageLabelFR: isAdult ? 'Adulte' : 'Bébé',
  };
}

/**
 * Résout les statistiques de référence d'une espèce (ou moyenne de ses parents si hybride)
 * pour la normalisation du calcul de fitness.
 *
 * @param {string} [speciesId='goblin'] - Identifiant de l'espèce.
 * @returns {object} Définition de base de l'espèce.
 */
function resolveBaselineForFitness(speciesId = 'goblin') {
  if (CONFIG?.SPECIES?.[speciesId]) {
    return CONFIG.SPECIES[speciesId];
  }
  if (typeof speciesId === 'string' && speciesId.includes('_')) {
    const [spAId, spBId] = speciesId.split('_');
    const spA = CONFIG?.SPECIES?.[spAId];
    const spB = CONFIG?.SPECIES?.[spBId];
    if (spA && spB) {
      return {
        id: speciesId,
        name: `${spA.name}-${spB.name}`,
        baseHp: (spA.baseHp + spB.baseHp) * 0.5,
        baseSpeed: (spA.baseSpeed + spB.baseSpeed) * 0.5,
        baseDamage: (spA.baseDamage + spB.baseDamage) * 0.5,
        baseSize: (spA.baseSize + spB.baseSize) * 0.5,
        baseGestationTime:
          ((spA.baseGestationTime || 15) + (spB.baseGestationTime || 15)) * 0.5,
        baseMaturationTime:
          ((spA.baseMaturationTime || 20) + (spB.baseMaturationTime || 20)) * 0.5,
        baseAggressiveness:
          ((spA.baseAggressiveness || 0.7) + (spB.baseAggressiveness || 0.7)) * 0.5,
        metabolism: (spA.metabolism + spB.metabolism) * 0.5,
        fertility: ((spA.fertility || 1.0) + (spB.fertility || 1.0)) * 0.5,
        aggroRadius: (spA.aggroRadius + spB.aggroRadius) * 0.5,
        preferredBiome: spA.preferredBiome || spB.preferredBiome || 'plains',
        isHybrid: true,
      };
    }
  }
  return CONFIG?.SPECIES?.goblin || {
    id: 'goblin',
    baseHp: 48,
    baseSpeed: 8.8,
    baseDamage: 8,
    baseSize: 0.78,
    baseGestationTime: 9,
    baseMaturationTime: 12,
    baseAggressiveness: 0.75,
    metabolism: 3.2,
    fertility: 1.25,
    aggroRadius: 16,
    preferredBiome: 'forest',
  };
}

/**
 * Calcule le score de Fitness Darwinien détaillé d'un génome à partir :
 * 1. Des **stats génétiques normalisées** (`strength`, `maxHp`, `speed`, `size`, `fertility`, `aggroRadius`)
 *    par rapport au standard de l'espèce, modulées par la rapidité de gestation (`refGestation / gestationTime`).
 * 2. De l'**efficience métabolique** (`refMetabolism / genes.metabolism`), qui tempère les mutations
 *    trop gourmandes en biomasse et évalue le risque de famine locale (`starvationRiskIndex`).
 * 3. Du **bonus d'adaptation au biome** (`currentBiome === preferredBiome`).
 * 4. Des **bonus de mutations dominantes** (`CONFIG.MUTATIONS[m].fitnessBonus`) et de la synergie
 *    polymutante.
 *
 * Note d'ergonomie : l'objet retourné implémente `valueOf() -> total`, ce qui permet de l'utiliser
 * aussi bien comme objet détaillé (`res.total`, `res.statsScore`, `res.mutationsScore`) que dans
 * des expressions numériques directes (`+computeDetailedFitness(...)`).
 *
 * @param {object} [genes={}] - Gènes exprimés (`strength`, `maxHp`, `speed`, `size`, `gestationTime`, `aggressiveness`, `fertility`, `metabolism`, `aggroRadius`).
 * @param {string[]} [mutations=[]] - Liste des identifiants de mutations actives.
 * @param {string} [speciesId='goblin'] - Identifiant de l'espèce de la créature.
 * @param {string|null} [currentBiome=null] - Biome actuel où se trouve la créature (`'forest'`, `'volcanic'`, etc.).
 * @returns {{
 *   total: number,
 *   fitnessScore: number,
 *   statsScore: number,
 *   mutationsScore: number,
 *   biomeBonus: number,
 *   hybridBonus: number,
 *   metabolicEfficiency: number,
 *   starvationRiskIndex: number,
 *   traitRatios: { strength: number, maxHp: number, speed: number, size: number, fertility: number, aggroRadius: number, gestationEfficiency: number, aggressiveness: number },
 *   valueOf: () => number
 * }} Détail complet du score de fitness darwinien.
 */
export function computeDetailedFitness(
  genes = {},
  mutations = [],
  speciesId = 'goblin',
  currentBiome = null
) {
  const baseline = resolveBaselineForFitness(speciesId);
  const weights = BALANCE.FITNESS_WEIGHTS;

  const refStr = baseline.baseDamage || 12;
  const refHp = baseline.baseHp || 80;
  const refSpd = baseline.baseSpeed || 7.5;
  const refSize = baseline.baseSize || 1.0;
  const refFert = baseline.fertility || 1.0;
  const refAggro = baseline.aggroRadius || 20;
  const refMetab = baseline.metabolism || 4.0;
  const refGestation =
    baseline.baseGestationTime || BALANCE.GESTATION_BY_SPECIES[speciesId] || 15;
  const refAggressiveness =
    baseline.baseAggressiveness || BALANCE.AGGRESSIVENESS_BY_SPECIES[speciesId] || 0.75;

  const strRatio = clamp((genes.strength ?? refStr) / refStr, 0.35, 4.5);
  const hpRatio = clamp((genes.maxHp ?? refHp) / refHp, 0.35, 4.5);
  const spdRatio = clamp((genes.speed ?? refSpd) / refSpd, 0.35, 3.5);
  const sizeRatio = clamp((genes.size ?? refSize) / refSize, 0.35, 3.5);
  const actualGestation = Math.max(3, genes.gestationTime ?? refGestation);
  const gestationEfficiency = clamp(refGestation / actualGestation, 0.5, 1.8);
  const fertRatio = clamp(
    ((genes.fertility ?? refFert) / refFert) * Math.pow(gestationEfficiency, 0.35),
    0.35,
    3.2
  );
  const aggroRatio = clamp((genes.aggroRadius ?? refAggro) / refAggro, 0.4, 2.8);
  const aggressivenessVal = clamp(genes.aggressiveness ?? refAggressiveness, 0.05, 1.0);

  const rawPolygenicOutput =
    strRatio * weights.strength +
    hpRatio * weights.maxHp +
    spdRatio * weights.speed +
    fertRatio * weights.fertility +
    sizeRatio * weights.size +
    aggroRatio * weights.aggroRadius;

  const actualMetabolism = Math.max(0.8, genes.metabolism ?? refMetab);
  const metabolicEfficiency = clamp(
    Math.pow(refMetab / actualMetabolism, weights.metabolicExponent),
    0.76,
    1.26
  );

  const statsScore = Number((rawPolygenicOutput * metabolicEfficiency).toFixed(3));

  // Calcul des bonus de mutations dominantes + synergie multi-mutations
  let mutationsScore = 0;
  const validMutations = Array.isArray(mutations) ? mutations : [];
  const catalog = CONFIG?.MUTATIONS || {};
  for (const mutId of validMutations) {
    const mutDef = catalog[mutId];
    if (mutDef) {
      mutationsScore += mutDef.fitnessBonus ?? 0.35;
    }
  }
  if (validMutations.length >= 2) {
    mutationsScore += (validMutations.length - 1) * weights.polyMutationSynergy;
  }
  mutationsScore = Number(mutationsScore.toFixed(3));

  // Bonus d'adaptation écologique au biome local
  const isAdaptedToBiome =
    Boolean(currentBiome) &&
    (currentBiome === baseline.preferredBiome ||
      (validMutations.includes('pyro_gland') && currentBiome === 'volcanic') ||
      (validMutations.includes('cryo_blood') && currentBiome === 'highlands'));
  const biomeBonus = isAdaptedToBiome ? weights.preferredBiomeBonus : 0.0;

  // Vigueur hybride (hétérosis)
  const isHybrid = Boolean(baseline.isHybrid || (typeof speciesId === 'string' && speciesId.includes('_')));
  const hybridBonus = isHybrid ? weights.hybridVigorBonus : 0.0;

  const total = Number(
    clamp(statsScore + mutationsScore + biomeBonus + hybridBonus, 0.25, 4.5).toFixed(3)
  );

  // Indice de risque de famine locale : combien d'individus de ce type suffisent à dépasser
  // la régénération naturelle de biomasse d'une cellule standard (18 biomasse / tick)
  const regenPerTick = CONFIG?.ECO?.BIOMASS_REGEN || 18;
  const starvationRiskIndex = Number(clamp(actualMetabolism / (regenPerTick / 3.5), 0.2, 3.0).toFixed(2));

  return {
    total,
    fitnessScore: total,
    statsScore,
    mutationsScore,
    biomeBonus: Number(biomeBonus.toFixed(3)),
    hybridBonus: Number(hybridBonus.toFixed(3)),
    metabolicEfficiency: Number(metabolicEfficiency.toFixed(3)),
    starvationRiskIndex,
    traitRatios: {
      strength: Number(strRatio.toFixed(2)),
      maxHp: Number(hpRatio.toFixed(2)),
      speed: Number(spdRatio.toFixed(2)),
      size: Number(sizeRatio.toFixed(2)),
      fertility: Number(fertRatio.toFixed(2)),
      aggroRadius: Number(aggroRatio.toFixed(2)),
      gestationEfficiency: Number(gestationEfficiency.toFixed(2)),
      aggressiveness: Number(aggressivenessVal.toFixed(2)),
    },
    valueOf() {
      return total;
    },
  };
}

/**
 * Renvoie directement la valeur numérique `fitnessScore` issue de `computeDetailedFitness`.
 *
 * @param {object} genes - Gènes exprimés.
 * @param {string[]} [mutations=[]] - Mutations actives.
 * @param {string} [speciesId='goblin'] - Identifiant d'espèce.
 * @param {string|null} [currentBiome=null] - Biome courant.
 * @returns {number} Score numérique de fitness.
 */
export function computeFitnessScore(genes, mutations = [], speciesId = 'goblin', currentBiome = null) {
  return computeDetailedFitness(genes, mutations, speciesId, currentBiome).total;
}

/**
 * Planificateur d'expédition lointaine pour les Éclaireurs (`role === 'scout'`).
 *
 * Contrairement aux Gardes ou Récolteurs qui restent près du Bastion (`< 35` unités),
 * les Éclaireurs sont envoyés en expédition dans la **Deep Wilderness** (rayon `50` à `108` unités
 * du centre), en privilégiant :
 * 1. Les secteurs angulaires éloignés de leur position actuelle (grande traversée d'exploration).
 * 2. Les zones de haute activité mutagène (Caldeira Volcanique au Nord-Est/Nord-Ouest, Hautes Terres,
 *    Forêts profondes).
 * 3. L'évitement préventif des concentrations denses d'ennemis connus (`knownThreats`) afin de ne pas
 *    se suicider dans un goulet d'étranglement.
 *
 * @param {object} [scout={}] - Entité Éclaireur (`{ id, x, z, patrolSectorIndex, visitedAngles }`).
 * @param {{ x: number, z: number }} [bastionPos={ x: 0, z: 0 }] - Position centrale du Bastion.
 * @param {number} [worldSize=240] - Taille totale du monde (`CONFIG.WORLD.SIZE`).
 * @param {Array<object>} [knownThreats=[]] - Ennemis connus ou proches (`[{ x, z, isPatientZero, genome }]`).
 * @param {Function|object} [rng=Math.random] - Générateur aléatoire (`Math.random` ou `SeededRNG`).
 * @returns {{
 *   x: number,
 *   z: number,
 *   radius: number,
 *   angle: number,
 *   sectorName: string,
 *   targetZone: string,
 *   priorityScore: number
 * }} Waypoint d'expédition dans les terres sauvages profondes.
 */
export function pickScoutExpeditionWaypoint(
  scout = {},
  bastionPos = CONFIG.BASTION?.POS || { x: 0, z: 0 },
  worldSize = CONFIG.WORLD?.SIZE || 240,
  knownThreats = [],
  rng = Math.random
) {
  const bx = bastionPos?.x ?? 0;
  const bz = bastionPos?.z ?? 0;
  const sx = scout?.x ?? bx;
  const sz = scout?.z ?? bz;

  const worldHalf = worldSize * 0.45;
  const minRadius = Math.max(BALANCE.SCOUT_EXPEDITION.MIN_RADIUS, CONFIG.SCOUT?.PATROL_MIN_RADIUS || 45);
  const maxRadius = Math.min(worldHalf - 2, BALANCE.SCOUT_EXPEDITION.MAX_RADIUS);

  const currentAngle = Math.atan2(sz - bz, sx - bx);
  const candidateCount = BALANCE.SCOUT_EXPEDITION.CANDIDATE_SAMPLES;

  let bestWaypoint = null;
  let bestScore = -Infinity;

  for (let i = 0; i < candidateCount; i++) {
    // Échantillonne des secteurs bien répartis autour de l'île avec un décalage franc
    // par rapport à l'angle actuel de l'Éclaireur pour garantir une vraie expédition
    const baseSectorAngle =
      currentAngle + Math.PI * 0.45 + (i / candidateCount) * Math.PI * 1.45 + (sampleRng(rng) - 0.5) * 0.35;
    const normAngle = Math.atan2(Math.sin(baseSectorAngle), Math.cos(baseSectorAngle));

    // Favorise les rayons lointains (68..105 unités) où se trouvent les meutes mutantes et la caldeira
    const tRadius = Math.pow(sampleRng(rng), 0.72);
    const radius = clamp(lerp(minRadius, maxRadius, tRadius), minRadius, maxRadius);

    const wx = clamp(bx + Math.cos(normAngle) * radius, -worldHalf, worldHalf);
    const wz = clamp(bz + Math.sin(normAngle) * radius, -worldHalf, worldHalf);

    // 1. Score d'éloignement par rapport au Bastion et à la position courante
    const travelDist = dist2D(sx, sz, wx, wz);
    let score = radius * 0.55 + clamp(travelDist, 20, 120) * 0.35;

    // 2. Bonus d'intérêt écologique : les secteurs Nord-Est / Nord-Ouest (Caldeira Volcanique & Crêtes)
    // et les forêts profondes ont un potentiel de mutation supérieur
    const sectorFR = getCardinalLabelFR(wx - bx, wz - bz);
    let targetZone = 'Forêts & Plaines Sauvages';
    if (sectorFR === 'Nord-Est' || sectorFR === 'Nord-Ouest' || sectorFR === 'Nord') {
      if (radius >= 68) {
        score += 26;
        targetZone = 'Caldeira Volcanique & Hautes Terres';
      } else {
        score += 14;
        targetZone = 'Crêtes Rocheuses du Nord';
      }
    } else if (radius >= 76) {
      score += 18;
      targetZone = 'Confins Sauvages (Deep Wilderness)';
    }

    // 3. Curiosité génétique vs Sécurité de l'Éclaireur :
    // Si un mutant NON encore repéré (`!spottedByScout`) est dans les parages lointains,
    // passer à portée de vision (22..32 unités) est très intéressant, mais tomber à `< 16` unités
    // d'une meute dense est dangereux !
    if (Array.isArray(knownThreats) && knownThreats.length > 0) {
      let localDangerPenalty = 0;
      let unspottedMutantAttraction = 0;

      for (const threat of knownThreats) {
        if (!threat || typeof threat.x !== 'number' || typeof threat.z !== 'number') continue;
        const dThreat = dist2D(wx, wz, threat.x, threat.z);

        if (dThreat < BALANCE.SCOUT_EXPEDITION.THREAT_AVOIDANCE_BUFFER) {
          // Trop proche d'un ennemi : pénalité proportionnelle à la proximité
          localDangerPenalty += (BALANCE.SCOUT_EXPEDITION.THREAT_AVOIDANCE_BUFFER - dThreat) * 2.4;
        }

        const isUnspottedInteresting =
          !threat.spottedByScout &&
          (threat.isPatientZero ||
            threat.genome?.isHybrid ||
            (Array.isArray(threat.genome?.mutations) && threat.genome.mutations.length > 0));

        if (isUnspottedInteresting && dThreat >= 18 && dThreat <= 42) {
          // Distance idéale d'observation au télescope / faucon sans entrer dans le rayon de fuite !
          unspottedMutantAttraction += 38;
        }
      }

      score += unspottedMutantAttraction - localDangerPenalty;
    }

    if (score > bestScore) {
      bestScore = score;
      bestWaypoint = {
        x: Number(wx.toFixed(2)),
        z: Number(wz.toFixed(2)),
        radius: Number(radius.toFixed(1)),
        angle: Number(normAngle.toFixed(3)),
        sectorName: sectorFR,
        targetZone,
        priorityScore: Number(score.toFixed(1)),
      };
    }
  }

  return (
    bestWaypoint || {
      x: 68,
      z: -54,
      radius: 86.8,
      angle: -0.67,
      sectorName: 'Nord-Est',
      targetZone: 'Caldeira Volcanique & Hautes Terres',
      priorityScore: 100,
    }
  );
}

/**
 * Calcule le vecteur directionnel d'esquive (`flee` steering) d'un Éclaireur lorsqu'un ou
 * plusieurs ennemis pénètrent dans son rayon de sécurité (`FLEE_RADIUS`).
 * Combine une répulsion pondérée par l'inverse de la distance aux menaces et un léger rappel
 * tangentiel pour contourner la meute sans rester coincé contre la côte.
 *
 * @param {object} scout - Entité Éclaireur (`{ x, z }`).
 * @param {Array<object>} [nearbyThreats=[]] - Liste des ennemis proches.
 * @param {{ x: number, z: number }} [bastionPos={ x: 0, z: 0 }] - Position du Bastion.
 * @param {number} [worldSize=240] - Taille du monde.
 * @returns {{ vx: number, vz: number, angle: number, nearestThreatDist: number, isFleeing: boolean }}
 */
export function computeScoutEvasionVector(
  scout,
  nearbyThreats = [],
  bastionPos = { x: 0, z: 0 },
  worldSize = 240
) {
  const sx = scout?.x ?? 0;
  const sz = scout?.z ?? 0;
  const fleeRadius = BALANCE.SCOUT_EXPEDITION.FLEE_TRIGGER_RADIUS;

  let repulseX = 0;
  let repulseZ = 0;
  let nearestThreatDist = Infinity;

  if (Array.isArray(nearbyThreats)) {
    for (const enemy of nearbyThreats) {
      if (!enemy || enemy.hp <= 0) continue;
      const d = dist2D(sx, sz, enemy.x, enemy.z);
      if (d < nearestThreatDist) {
        nearestThreatDist = d;
      }
      if (d <= fleeRadius * 1.25) {
        const safeD = Math.max(0.5, d);
        const weight = Math.pow((fleeRadius * 1.35) / safeD, 2);
        repulseX += ((sx - enemy.x) / safeD) * weight;
        repulseZ += ((sz - enemy.z) / safeD) * weight;
      }
    }
  }

  if (nearestThreatDist > fleeRadius || (Math.abs(repulseX) < 1e-4 && Math.abs(repulseZ) < 1e-4)) {
    return { vx: 0, vz: 0, angle: 0, nearestThreatDist, isFleeing: false };
  }

  // Si l'Éclaireur approche du bord de l'océan, ajoute une composante de repli vers l'intérieur de l'île
  const distFromCenter = Math.hypot(sx - (bastionPos?.x ?? 0), sz - (bastionPos?.z ?? 0));
  const maxSafeCoast = worldSize * 0.42;
  if (distFromCenter > maxSafeCoast) {
    const toCenterAngle = angleBetween(sx, sz, bastionPos?.x ?? 0, bastionPos?.z ?? 0);
    repulseX += Math.cos(toCenterAngle) * 2.2;
    repulseZ += Math.sin(toCenterAngle) * 2.2;
  }

  const mag = Math.hypot(repulseX, repulseZ) || 1;
  const normX = repulseX / mag;
  const normZ = repulseZ / mag;
  const angle = Math.atan2(normZ, normX);

  return {
    vx: Number(normX.toFixed(3)),
    vz: Number(normZ.toFixed(3)),
    angle: Number(angle.toFixed(3)),
    nearestThreatDist: Number(nearestThreatDist.toFixed(2)),
    isFleeing: true,
  };
}

/**
 * Catalogue complet des améliorations de Contre-Adaptation Roguelike (`DESIGNED_UPGRADES`).
 * Conçu pour offrir au joueur de vrais choix stratégiques entre :
 * - **Traque chirurgicale de Patient Zéro** (mobilité hors-frontière, assassinat des juvéniles mutants)
 * - **Contrôle écologique de Conway** (destruction de biomasse locale pour stopper la reproduction)
 * - **Renseignement & Fauconnerie** (portée de détection et survie des Éclaireurs)
 * - **Fortification du Bastion** (défense contre les migrations de famine et hordes surpeuplées)
 */
export const DESIGNED_UPGRADES = [
  {
    id: 'patient_zero_tracker',
    legacyId: 'cleave_damage',
    name: 'Traqueur de Patient Zéro',
    category: 'Traque Génétique',
    description:
      '+45% vitesse de course et +45% dégâts de fente en se dirigeant vers ou en combattant une mutation repérée par un Éclaireur.',
    icon: '🎯',
    counterTarget: 'Lignées Mutantes & Patients Zéro',
    bonus: {
      cleaveDamageMult: 1.35,
      mutantDamageMult: 1.45,
      towardMutantSpeedMult: 1.45,
    },
  },
  {
    id: 'scout_falconry',
    legacyId: 'scout_vision',
    name: 'Fauconnerie d’Éclaireur',
    category: 'Renseignement',
    description:
      '+40% portée de vision des Éclaireurs au-delà de la frontière et +25% vitesse d’expédition et d’esquive.',
    icon: '🦅',
    counterTarget: 'Détection Précoce en Deep Wilderness',
    bonus: {
      scoutVisionMult: 1.4,
      scoutSpeedMult: 1.25,
    },
  },
  {
    id: 'juvenile_purge',
    legacyId: 'darwinian_purge',
    name: 'Purge Juvénile & Terre Brûlée',
    category: 'Écologie Conway',
    description:
      'Tuer un mutant ou un Bébé monstre draine 30% de la biomasse de sa cellule, retardant la reproduction de toute la meute locale.',
    icon: '🧬',
    counterTarget: 'Cellules à Densité Optimale (2–5)',
    bonus: {
      cellBiomassDrainOnKill: 0.3,
      babyDamageMult: 1.5,
      cleaveDamageMult: 1.2,
    },
  },
  {
    id: 'thorn_bulwark',
    legacyId: 'bastion_turret_power',
    name: 'Muraille d’Épines & Balistes Runiques',
    category: 'Bastion',
    description:
      '+180 PV au Bastion, +40% dégâts des Tours de Guet et renvoie 16 dégâts d’épines aux meutes affamées en migration.',
    icon: '🏰',
    counterTarget: 'Migrations de Famine (Surpopulation > 6)',
    bonus: {
      turretDamageMult: 1.4,
      bastionHpBonus: 180,
      bastionThornsAdd: 16,
    },
  },
  {
    id: 'pyrophage_blade',
    legacyId: 'fire_resist',
    name: 'Lame Pyrophage & Égide Cryo',
    category: 'Contre-Mutation',
    description:
      'Réduit de 40% les dégâts élémentaires (Glande Pyroclastique, Venin, Givre) et élargit l’arc de fente de +1.4m.',
    icon: '🛡️',
    counterTarget: 'Troll de Feu & Dragons Volcaniques',
    bonus: {
      damageReduction: 0.4,
      cleaveRangeAdd: 1.4,
      cleaveDamageMult: 1.2,
    },
  },
  {
    id: 'strider_boots',
    legacyId: 'move_speed',
    name: 'Bottes d’Expédition Véloce',
    category: 'Mobilité',
    description:
      '+24% vitesse de déplacement permanente et réduction de 30% du temps de recharge d’esquive pour traverser l’île avant un Eco-Tick.',
    icon: '🥾',
    counterTarget: 'Course contre le Compte à Rebours Eco-Tick',
    bonus: {
      speedMult: 1.24,
      dashCooldownMult: 0.7,
    },
  },
  {
    id: 'amber_blood_vigor',
    legacyId: 'max_hp_regen',
    name: 'Sang d’Ambre Régénérant',
    category: 'Survie',
    description:
      '+60 PV Maximum, soin immédiat de 70 PV et régénération passive de +3.0 PV/s lors des expéditions lointaines.',
    icon: '❤️',
    counterTarget: 'Guerre d’Usure en Terres Sauvages',
    bonus: {
      maxHpFlat: 60,
      healInstant: 70,
      regenPerSec: 3.0,
    },
  },
];

/**
 * Sélectionne `count` cartes d'amélioration roguelike contextuellement adaptées aux menaces
 * génétiques actives dans l'écosystème (ex. propose prioritairement *Lame Pyrophage* ou
 * *Traqueur de Patient Zéro* lorsqu'un Troll de Feu est détecté).
 *
 * @param {Array<string>} [alreadyChosenIds=[]] - IDs des améliorations déjà acquises.
 * @param {object} [ecoContext={}] - Contexte écologique (`{ hasActivePyro, activeMutantCount, starvingCount }`).
 * @param {number} [count=3] - Nombre de cartes à proposer au joueur lors d'un Level-Up.
 * @param {Function|object} [rng=Math.random] - Générateur aléatoire.
 * @returns {Array<object>} Sélection de `count` cartes d'améliorations.
 */
export function pickCounterAdaptationUpgrades(
  alreadyChosenIds = [],
  ecoContext = {},
  count = 3,
  rng = Math.random
) {
  const chosenSet = new Set(alreadyChosenIds);
  const pool = DESIGNED_UPGRADES.map((u) => {
    let weight = chosenSet.has(u.id) ? 0.45 : 1.0;
    if (ecoContext.hasActivePyro && u.id === 'pyrophage_blade') weight *= 1.8;
    if ((ecoContext.activeMutantCount || 0) > 0 && u.id === 'patient_zero_tracker') weight *= 1.65;
    if ((ecoContext.activeMutantCount || 0) >= 2 && u.id === 'juvenile_purge') weight *= 1.6;
    if ((ecoContext.starvingCount || 0) >= 4 && u.id === 'thorn_bulwark') weight *= 1.7;
    return { upgrade: u, weight: weight * (0.85 + sampleRng(rng) * 0.3) };
  });

  pool.sort((a, b) => b.weight - a.weight);
  const selected = pool.slice(0, Math.min(count, pool.length)).map((item) => item.upgrade);

  logger.info('BALANCE', `Tirage Roguelike de Contre-Adaptation : ${selected.map((s) => s.name).join(' | ')}`, {
    selectedIds: selected.map((s) => s.id),
    ecoContext,
  });

  return selected;
}

export default BALANCE;
