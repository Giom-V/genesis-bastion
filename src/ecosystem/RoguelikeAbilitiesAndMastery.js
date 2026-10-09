/**
 * @file src/ecosystem/RoguelikeAbilitiesAndMastery.js
 * @description Système complet de Compétences Roguelike 3D (Sorts Actifs / Auto-Cast Niv. 1 à 5),
 * Modes de Combat ("Vampire Survivors" Auto-Battler vs "Diablo" Action-RPG) et Système d'Apprentissage
 * & d'Adaptation par l'Action (`AdaptiveMasterySystem` : "Plus tu fais/subis X, plus tu deviens fort/résistant à X").
 *
 * Ce module exporte :
 * 1. `COMBAT_MODES` : Définition des deux modes de gameplay (`'vampire_survivors'` vs `'diablo_action'`).
 * 2. `ROGUELIKE_ABILITIES` & `ROGUELIKE_ABILITIES_BY_ID` : Les 8 sorts 3D évolutifs (Niv. 1 à 5) :
 *    - `spinning_blades` (Lames Orbitales)
 *    - `pyro_nova` (Nova Pyroclastique)
 *    - `chain_lightning` (Arc Foudroyant)
 *    - `frost_spear` (Javelot Cryogénique)
 *    - `venom_volley` (Salve Venimeuse)
 *    - `meteor_strike` (Météore d'Ambre)
 *    - `soul_siphon` (Siphon Vampirique)
 *    - `seismic_slam` (Onde Sismique)
 *    ainsi que les passifs de contre-adaptation (`DESIGNED_UPGRADES`).
 * 3. `getAbilityStatsAtLevel(abilityId, level)` : Calcule les dégâts, le rayon, le cooldown et le nombre
 *    de projectiles d'une compétence à un niveau donné (`1..5`).
 * 4. `drawRoguelikeLevelUpChoices(optionsOrOwned, masteryOrContext, count, rng)` : Tire 3 cartes de
 *    montée de niveau (nouveaux sorts, améliorations de sorts existants Niv. +1, ou passifs), pondérées
 *    par l'expérience adaptative du joueur (ex. tuer un monstre de feu augmente la chance de découvrir
 *    `pyro_nova` ou `Lame Pyrophage`).
 * 5. `AdaptiveMasterySystem` : Classe traçant chaque élimination d'espèce, chaque élimination de
 *    mutation et chaque coup encaissé (Feu, Venin, Glace, Physique) pour faire évoluer dynamiquement
 *    les bonus offensifs et les résistances du Héros.
 */

import { CONFIG } from '../config.js';
import { DESIGNED_UPGRADES } from './BalanceAndPacing.js';
import { clamp } from '../utils/math.js';
import { logger } from '../utils/logger.js';

/**
 * Définition des deux modes de gameplay sélectionnables au départ et permutables à tout moment via `[C]`.
 */
export const COMBAT_MODES = Object.freeze({
  vampire_survivors: {
    id: 'vampire_survivors',
    name: 'Mode Vampire Survivors (Auto-Cast)',
    shortLabel: 'Auto (Vampire Survivors)',
    badgeIcon: '🧛',
    description:
      'Concentrez-vous sur le placement, l’esquive [Shift] et la stratégie : votre Héros frappe automatiquement à l’épée et déclenche tous ses sorts dès qu’un ennemi est à portée.',
    autoMelee: true,
    autoCastSpells: true,
    starterAbilityId: 'spinning_blades',
  },
  diablo_action: {
    id: 'diablo_action',
    name: 'Mode Diablo (Action & Sorts Actifs)',
    shortLabel: 'Actif (Diablo ARPG)',
    badgeIcon: '⚔️',
    description:
      'Contrôle viscéral total : frappez au [Clic Gauche / Espace], esquivez avec [Clic Droit / Shift], et déclenchez vos 4 compétences spéciales équipées avec les touches [1] [2] [3] [4].',
    autoMelee: false,
    autoCastSpells: false,
    starterAbilityId: 'pyro_nova',
  },
});

/**
 * Catalogue des 8 Compétences & Sorts 3D Roguelike (évolutifs du Niveau 1 au Niveau 5).
 * En mode `vampire_survivors`, ils se lancent automatiquement dès que `cooldown` est prêt.
 * En mode `diablo_action`, ils s'activent via les emplacements `[1]`, `[2]`, `[3]`, `[4]` (sauf
 * `spinning_blades` qui maintient ses lames en orbite permanente et peut être surcadencé à l'activation).
 */
export const ROGUELIKE_ABILITIES = [
  {
    id: 'spinning_blades',
    type: 'ability',
    isSpell: true,
    name: 'Lames Orbitales Spectrales',
    category: 'Orbite 3D Permanente',
    rarity: 'common',
    icon: '🌀',
    colorHex: 0x00e5ff,
    colorCss: '#00e5ff',
    maxLevel: 5,
    baseCooldown: 4.5,
    baseDamage: 18,
    baseRange: 4.2,
    baseCount: 2,
    description:
      'Invoque 2 à 5 lames spectrales qui tournent en orbite 3D permanente autour du Héros et tranchent tout ennemi au contact.',
    levelScalingDesc: '+1 lame orbitale, +8% dégâts et +4% portée par niveau.',
    affinityMutation: 'winged_leap',
    affinitySpecies: 'goblin',
  },
  {
    id: 'pyro_nova',
    type: 'ability',
    isSpell: true,
    name: 'Nova Pyroclastique',
    category: 'Explosion Élémentaire (Feu)',
    rarity: 'rare',
    icon: '🔥',
    colorHex: 0xff4500,
    colorCss: '#ff4500',
    maxLevel: 5,
    baseCooldown: 5.2,
    baseDamage: 42,
    baseRange: 8.5,
    baseCount: 1,
    burnDps: 8,
    burnDuration: 3.0,
    description:
      'Libère une onde de choc circulaire de magma autour du Héros, calcinant les meutes proches et leur infligeant une brûlure continue.',
    levelScalingDesc: '+8% dégâts de feu, +4% de rayon et -4% de recharge par niveau.',
    affinityMutation: 'pyro_gland',
    affinitySpecies: 'troll',
  },
  {
    id: 'chain_lightning',
    type: 'ability',
    isSpell: true,
    name: 'Arc Foudroyant',
    category: 'Foudre en Chaîne',
    rarity: 'rare',
    icon: '⚡',
    colorHex: 0x48dbfb,
    colorCss: '#48dbfb',
    maxLevel: 5,
    baseCooldown: 3.8,
    baseDamage: 34,
    baseRange: 13.0,
    baseCount: 3,
    description:
      'Frappe l’ennemi le plus proche d’un éclair 3D haute tension qui rebondit instantanément de monstre en monstre (3 à 7 cibles).',
    levelScalingDesc: '+1 rebond de foudre, +8% dégâts et -4% de recharge par niveau.',
    affinityMutation: 'winged_leap',
    affinitySpecies: 'vulture',
  },
  {
    id: 'frost_spear',
    type: 'ability',
    isSpell: true,
    name: 'Javelot Cryogénique',
    category: 'Contrôle & Perforation (Glace)',
    rarity: 'common',
    icon: '❄️',
    colorHex: 0x00d2d3,
    colorCss: '#00d2d3',
    maxLevel: 5,
    baseCooldown: 3.2,
    baseDamage: 38,
    baseRange: 16.0,
    baseCount: 1,
    slowFactor: 0.5,
    slowDuration: 3.5,
    description:
      'Projette une lance de glace perforante à longue portée qui ralentit les ennemis touchés de 50% — idéal pour stopper un Patient Zéro en fuite !',
    levelScalingDesc: '+1 javelot aux niveaux 3 & 5, +8% dégâts et +4% portée par niveau.',
    affinityMutation: 'cryo_blood',
    affinitySpecies: 'wolf',
  },
  {
    id: 'venom_volley',
    type: 'ability',
    isSpell: true,
    name: 'Salve Venimeuse',
    category: 'Barrage Toxique (DoT)',
    rarity: 'common',
    icon: '🧪',
    colorHex: 0x39ff14,
    colorCss: '#39ff14',
    maxLevel: 5,
    baseCooldown: 3.6,
    baseDamage: 22,
    baseRange: 12.5,
    baseCount: 5,
    poisonDps: 10,
    poisonDuration: 4.0,
    description:
      'Tire un éventail de 5 dagues neurotoxiques qui empoisonnent les ennemis sur la durée et réduisent leur régénération.',
    levelScalingDesc: '+1 dague par niveau et +8% dégâts de poison.',
    affinityMutation: 'venom_sacs',
    affinitySpecies: 'orc',
  },
  {
    id: 'meteor_strike',
    type: 'ability',
    isSpell: true,
    name: 'Météore d’Ambre',
    category: 'Frappe Anti-Apex',
    rarity: 'epic',
    icon: '☄️',
    colorHex: 0xff9f43,
    colorCss: '#ff9f43',
    maxLevel: 5,
    baseCooldown: 7.0,
    baseDamage: 68,
    baseRange: 15.0,
    baseCount: 1,
    aoeRadius: 5.5,
    description:
      'Cible prioritairement la créature au plus haut Fitness Score (ou Patient Zéro) à portée et abat un météore explosif dévastateur.',
    levelScalingDesc: '+8% dégâts d’impact, +4% de rayon d’explosion et -4% de recharge par niveau.',
    affinityMutation: 'titan_growth',
    affinitySpecies: 'dragon',
  },
  {
    id: 'soul_siphon',
    type: 'ability',
    isSpell: true,
    name: 'Siphon Vampirique',
    category: 'Drain de Vie Hématophage',
    rarity: 'rare',
    icon: '🩸',
    colorHex: 0xff4757,
    colorCss: '#ff4757',
    maxLevel: 5,
    baseCooldown: 5.5,
    baseDamage: 32,
    baseRange: 10.5,
    baseCount: 2,
    lifestealRatio: 0.45,
    description:
      'Relie le Héros aux ennemis proches par un faisceau cramoisi qui draine leur vitalité et restaure immédiatement vos PV.',
    levelScalingDesc: '+1 cible drainée, +8% dégâts et +2% de soin vampirique par niveau.',
    affinityMutation: 'vampiric_maw',
    affinitySpecies: 'lion',
  },
  {
    id: 'seismic_slam',
    type: 'ability',
    isSpell: true,
    name: 'Onde Sismique',
    category: 'Onde de Choc & Étourdissement',
    rarity: 'common',
    icon: '🔨',
    colorHex: 0xe6a145,
    colorCss: '#e6a145',
    maxLevel: 5,
    baseCooldown: 5.0,
    baseDamage: 36,
    baseRange: 7.5,
    baseCount: 1,
    knockbackDist: 5.5,
    stunDuration: 1.4,
    description:
      'Fracasse le sol pour créer une onde tellurique qui repousse violemment (Knockback) et étourdit toutes les créatures alentour.',
    levelScalingDesc: '+8% dégâts, +4% rayon et +0.12s d’étourdissement par niveau.',
    affinityMutation: 'osteo_plating',
    affinitySpecies: 'troll',
  },
];

/**
 * Dictionnaire d'accès rapide aux compétences par `id`.
 */
export const ROGUELIKE_ABILITIES_BY_ID = Object.freeze(
  ROGUELIKE_ABILITIES.reduce((acc, ab) => {
    acc[ab.id] = ab;
    return acc;
  }, {})
);

/**
 * Calcule les caractéristiques exactes d'une compétence active/auto-cast à un niveau donné (`1..5`).
 * Progression équilibrée Phase 11 : `+8%` dégâts par niveau, `+4%` portée par niveau, `-4%` temps de recharge par niveau.
 *
 * @param {string} abilityId - Identifiant de la compétence (ex. `'spinning_blades'`, `'pyro_nova'`).
 * @param {number} [level=1] - Niveau actuel de la compétence (`1` à `5`).
 * @returns {{
 *   id: string,
 *   name: string,
 *   icon: string,
 *   level: number,
 *   maxLevel: number,
 *   damage: number,
 *   cooldown: number,
 *   range: number,
 *   count: number,
 *   colorHex: number,
 *   colorCss: string,
 *   extra: object
 * }} Statistiques calculées pour ce niveau.
 */
export function getAbilityStatsAtLevel(abilityId, level = 1) {
  const def = ROGUELIKE_ABILITIES_BY_ID[abilityId] || ROGUELIKE_ABILITIES[0];
  const lvl = clamp(Math.floor(level || 1), 1, def.maxLevel || 5);
  const steps = lvl - 1;

  const damage = Math.round(def.baseDamage * (1 + steps * 0.08));
  const minCooldown = Math.max(1.2, def.baseCooldown * 0.65);
  const cooldown = Number(Math.max(minCooldown, def.baseCooldown * Math.pow(0.96, steps)).toFixed(2));
  const range = Number((def.baseRange * (1 + steps * 0.04)).toFixed(2));

  let count = def.baseCount || 1;
  if (def.id === 'spinning_blades' || def.id === 'chain_lightning' || def.id === 'soul_siphon') {
    count = def.baseCount + steps;
  } else if (def.id === 'venom_volley') {
    count = def.baseCount + steps;
  } else if (def.id === 'frost_spear') {
    count = lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1;
  }

  return {
    id: def.id,
    name: def.name,
    icon: def.icon,
    category: def.category,
    level: lvl,
    maxLevel: def.maxLevel || 5,
    damage,
    cooldown,
    range,
    count,
    colorHex: def.colorHex,
    colorCss: def.colorCss,
    extra: {
      burnDps: def.burnDps ? Math.round(def.burnDps * (1 + steps * 0.08)) : 0,
      burnDuration: def.burnDuration || 0,
      poisonDps: def.poisonDps ? Math.round(def.poisonDps * (1 + steps * 0.08)) : 0,
      poisonDuration: def.poisonDuration || 0,
      slowFactor: def.slowFactor || 0,
      slowDuration: def.slowDuration ? +(def.slowDuration + steps * 0.15).toFixed(1) : 0,
      aoeRadius: def.aoeRadius ? +(def.aoeRadius * (1 + steps * 0.04)).toFixed(2) : range,
      lifestealRatio: def.lifestealRatio ? +(def.lifestealRatio + steps * 0.02).toFixed(2) : 0,
      knockbackDist: def.knockbackDist ? +(def.knockbackDist + steps * 0.25).toFixed(2) : 0,
      stunDuration: def.stunDuration ? +(def.stunDuration + steps * 0.12).toFixed(2) : 0,
    },
  };
}

/**
 * Calcule le bonus de dégâts (`%`) contre une espèce selon le nombre d'individus tués :
 * - Kills 1..5 : `+1.0%` par monstre (`1%` à `5%`)
 * - Kills 6..15 : `+0.5%` par monstre (`5.5%` à `10%`)
 * - Kills 16+ : `+0.25%` par monstre, plafonné à `+15.0%` max (atteint à 35 kills).
 *
 * @param {number} [kills=0] - Nombre de monstres tués de cette espèce.
 * @returns {number} Bonus en pourcentage (`0` à `15.0`), arrondi à 1 décimale.
 */
export function computeSpeciesSlayerBonusPct(kills = 0) {
  const k = Math.max(0, Math.floor(Number(kills) || 0));
  if (k <= 0) return 0;
  const tier1 = Math.min(k, 5) * 1.0;
  const tier2 = Math.max(0, Math.min(k - 5, 10)) * 0.5;
  const tier3 = Math.max(0, k - 15) * 0.25;
  const val = Math.min(15.0, tier1 + tier2 + tier3);
  return Math.round(val * 10) / 10;
}

/**
 * Calcule le bonus de dégâts (`%`) contre une mutation selon le nombre de porteurs tués :
 * - Kills 1..5 : `+1.0%` par mutant (`1%` à `5%`)
 * - Kills 6..15 : `+0.5%` par mutant (`5.5%` à `10%`)
 * - Kills 16+ : `+0.25%` par mutant, plafonné à `+15.0%` max.
 *
 * @param {number} [kills=0] - Nombre de mutants tués portant ce gène.
 * @returns {number} Bonus en pourcentage (`0` à `15.0`), arrondi à 1 décimale.
 */
export function computeMutationSlayerBonusPct(kills = 0) {
  return computeSpeciesSlayerBonusPct(kills);
}

/**
 * Calcule le pourcentage de réduction de dégâts (`%`) acquis après `hits` coups reçus :
 * - Élémentaire / Venin / Givre (`!isPhysical`) :
 *   - Coups 1..6 : `+0.5%` par coup (`3.0%` à 6 coups)
 *   - Coups 7..22 : `+0.25%` par coup (`7.0%` à 22 coups)
 *   - Coups 23+ : `+0.15%` par coup, plafonné à `10.0%` max.
 * - Physique (`isPhysical === true`) :
 *   - Coups 1..5 : `+0.4%` par coup (`2.0%` à 5 coups)
 *   - Coups 6+ : `+0.2%` par coup, plafonné à `6.0%` max.
 *
 * @param {number} [hits=0] - Nombre de coups encaissés dans cette catégorie.
 * @param {boolean} [isPhysical=false] - Si vrai, applique la courbe physique plafonnée à `6%`.
 * @returns {number} Pourcentage de réduction (`0` à `10.0` ou `6.0`), arrondi à 1 décimale.
 */
export function computeResistanceBonusPct(hits = 0, isPhysical = false) {
  const h = Math.max(0, Math.floor(Number(hits) || 0));
  if (h <= 0) return 0;
  if (isPhysical) {
    const t1 = Math.min(h, 5) * 0.4;
    const t2 = Math.max(0, h - 5) * 0.2;
    return Math.round(Math.min(6.0, t1 + t2) * 10) / 10;
  }
  const t1 = Math.min(h, 6) * 0.5;
  const t2 = Math.max(0, Math.min(h - 6, 16)) * 0.25;
  const t3 = Math.max(0, h - 22) * 0.15;
  return Math.round(Math.min(10.0, t1 + t2 + t3) * 10) / 10;
}

/**
 * Classe d'Apprentissage & d'Adaptation par l'Action du Héros (`AdaptiveMasterySystem`).
 *
 * Principe équilibré (Phase 11 — `<= 1%` par monstre avec rendement décroissant rapide) :
 * 1. **Maîtrise de Chasse par Espèce (`speciesKills`)** :
 *    - Kills `1..5` : **`+1.0%` par monstre** (`1%` → `5%`)
 *    - Kills `6..15` : **`+0.5%` par monstre** (`5.5%` → `10%`)
 *    - Kills `16+` : **`+0.25%` par monstre**, plafonné à **`+15.0%` max** (à 35 kills).
 *    - Paliers de notification (`speciesThresholds`) : `[1, 3, 6, 10, 15]` (`+1%`, `+3%`, `+5.5%`, `+7.5%`, `+10%`).
 * 2. **Maîtrise Anti-Mutation (`mutationKills`)** :
 *    - Même courbe à rendement décroissant (`+1.0%` kills `1..5`, `+0.5%` kills `6..15`, `+0.25%` kills `16+`, plafond **`+15.0%`**).
 *    - Augmente légèrement (`+15%`, multiplicateur `1.15`) la probabilité de se voir proposer le sort élémentaire associé au prochain Level-Up.
 *    - Plafond global cumulé (`getTotalAdaptiveDamageMultiplier` / `getDamageMultiplierAgainst`) : **`1.30x` (`+30%` grand max)**.
 * 3. **Résistance Adaptative par Dégâts Subis (`hitsTakenByType`)** :
 *    - Élémentaire (`fire`, `venom`, `cryo`) : `+0.5%` par coup (1..6), `+0.25%` (7..22), `+0.15%` (23+), plafonné à **`10.0%` max**.
 *    - Physique (`physical`) : `+0.4%` par coup (1..5), `+0.2%` (6+), plafonné à **`6.0%` max**.
 */
export class AdaptiveMasterySystem {
  constructor() {
    /** @type {Record<string, number>} Compteur de kills par espèce */
    this.speciesKills = {};
    /** @type {Record<string, number>} Rang actuel (0..5) de maîtrise par espèce */
    this.speciesRanks = {};

    /** @type {Record<string, number>} Compteur de kills par mutation */
    this.mutationKills = {};
    /** @type {Record<string, number>} Rang actuel (0..5) de maîtrise par mutation */
    this.mutationRanks = {};

    /** @type {Record<string, number>} Cumul de dégâts encaissés par type ('fire', 'venom', 'cryo', 'physical') */
    this.damageTakenByType = {
      fire: 0,
      venom: 0,
      cryo: 0,
      physical: 0,
    };
    /** @type {Record<string, number>} Nombre de coups encaissés par type */
    this.hitsTakenByType = {
      fire: 0,
      venom: 0,
      cryo: 0,
      physical: 0,
    };
    /** @type {Record<string, number>} Rang actuel (0..5) de résistance par type */
    this.resistanceRanks = {
      fire: 0,
      venom: 0,
      cryo: 0,
      physical: 0,
    };

    /** @type {Array<object>} File d'attente des notifications de montée de rang pour le HUD */
    this.pendingNotifications = [];

    /** Paliers de kills pour notifier les rangs d'espèce (+1%, +3%, +5.5%, +7.5%, +10%) */
    this.speciesThresholds = [1, 3, 6, 10, 15];
    /** Paliers de kills pour notifier les rangs de mutation (+1%, +3%, +5.5%, +7.5%, +10%) */
    this.mutationThresholds = [1, 3, 6, 10, 15];
    /** Paliers de coups reçus pour notifier les rangs de résistance */
    this.resistanceHitThresholds = [2, 5, 9, 15, 22];
  }

  /**
   * Calcule le bonus de dégâts (`%`) contre une espèce selon le nombre d'individus tués.
   * @param {number} [kills=0]
   * @returns {number}
   */
  computeSpeciesSlayerBonusPct(kills = 0) {
    return computeSpeciesSlayerBonusPct(kills);
  }

  /**
   * Calcule le bonus de dégâts (`%`) contre une mutation selon le nombre de porteurs tués.
   * @param {number} [kills=0]
   * @returns {number}
   */
  computeMutationSlayerBonusPct(kills = 0) {
    return computeMutationSlayerBonusPct(kills);
  }

  /**
   * Calcule le pourcentage de réduction de dégâts (`%`) acquis après `hits` coups reçus.
   * @param {number} [hits=0]
   * @param {boolean} [isPhysical=false]
   * @returns {number}
   */
  computeResistanceBonusPct(hits = 0, isPhysical = false) {
    return computeResistanceBonusPct(hits, isPhysical);
  }

  /**
   * Réinitialise intégralement toutes les maîtrises adaptatives pour une nouvelle run Roguelike ("Repartir à Zéro").
   */
  resetForNewRoguelikeRun() {
    this.speciesKills = {};
    this.speciesRanks = {};
    this.mutationKills = {};
    this.mutationRanks = {};
    this.damageTakenByType = { fire: 0, venom: 0, cryo: 0, physical: 0 };
    this.hitsTakenByType = { fire: 0, venom: 0, cryo: 0, physical: 0 };
    this.resistanceRanks = { fire: 0, venom: 0, cryo: 0, physical: 0 };
    this.pendingNotifications = [];
  }

  /**
   * Alias de `resetForNewRoguelikeRun()`.
   */
  reset() {
    this.resetForNewRoguelikeRun();
  }

  /**
   * Normalise un identifiant d'espèce (extrait l'espèce de base ou garde l'identifiant).
   * @param {string|object} enemyOrSpeciesId
   * @returns {string}
   */
  _resolveSpeciesId(enemyOrSpeciesId) {
    if (!enemyOrSpeciesId) return 'goblin';
    if (typeof enemyOrSpeciesId === 'string') return enemyOrSpeciesId;
    return (
      enemyOrSpeciesId.genome?.speciesId ||
      enemyOrSpeciesId.speciesId ||
      'goblin'
    );
  }

  /**
   * Enregistre l'élimination d'un ennemi par le joueur et met à jour les maîtrises d'espèce et de mutation
   * selon la courbe `<= 1%` par monstre à rendement décroissant rapide.
   *
   * @param {object} enemy - Entité ennemie éliminée (`{ speciesId, genome: { speciesId, speciesName, mutations } }`).
   * @returns {{
   *   speciesId: string,
   *   speciesKills: number,
   *   speciesRank: number,
   *   speciesBonusPct: number,
   *   newlyUnlockedRanks: Array<object>
   * }} Résultat de la progression.
   */
  recordKill(enemy) {
    const newlyUnlockedRanks = [];
    if (!enemy) {
      return { speciesId: 'goblin', speciesKills: 0, speciesRank: 0, speciesBonusPct: 0, newlyUnlockedRanks };
    }

    const rawSpeciesId = this._resolveSpeciesId(enemy);
    const targetSpeciesList =
      rawSpeciesId.includes('_') && Array.isArray(enemy.genome?.hybridParents) && enemy.genome.hybridParents.length > 0
        ? enemy.genome.hybridParents
        : [rawSpeciesId];

    let primaryRank = 0;
    let primaryKills = 0;

    for (const spId of targetSpeciesList) {
      const prevKills = this.speciesKills[spId] || 0;
      const nextKills = prevKills + 1;
      this.speciesKills[spId] = nextKills;

      const prevRank = this.speciesRanks[spId] || 0;
      let newRank = prevRank;
      while (newRank < this.speciesThresholds.length && nextKills >= this.speciesThresholds[newRank]) {
        newRank++;
      }

      const bonusPct = this.computeSpeciesSlayerBonusPct(nextKills);

      if (newRank > prevRank) {
        this.speciesRanks[spId] = newRank;
        const spName = CONFIG.SPECIES?.[spId]?.name || enemy.genome?.speciesName || spId;
        const notif = {
          id: `mastery_sp_${spId}_r${newRank}_${Date.now()}`,
          type: 'species_slayer',
          speciesId: spId,
          rank: newRank,
          bonusPct,
          title: `⚔️ Maîtrise : Fléau des ${spName}s (Rang ${newRank})`,
          subtitle: `+${bonusPct}% Dégâts contre l’espèce ${spName} (${nextKills} éliminés, rendement décroissant)`,
          badgeText: `vs ${spName} +${bonusPct}%`,
          colorCss: '#e6a145',
          colorHex: 0xe6a145,
        };
        newlyUnlockedRanks.push(notif);
        this.pendingNotifications.push(notif);
        logger.evolution(notif.title, notif);
      }

      primaryRank = this.speciesRanks[spId] || 0;
      primaryKills = nextKills;
    }

    // Maîtrise Anti-Mutation si l'ennemi portait une ou plusieurs mutations
    const mutations = Array.isArray(enemy.genome?.mutations)
      ? enemy.genome.mutations
      : Array.isArray(enemy.mutations)
        ? enemy.mutations
        : [];
    for (const mutId of mutations) {
      const prevMutKills = this.mutationKills[mutId] || 0;
      const nextMutKills = prevMutKills + 1;
      this.mutationKills[mutId] = nextMutKills;

      const prevMutRank = this.mutationRanks[mutId] || 0;
      let newMutRank = prevMutRank;
      while (
        newMutRank < this.mutationThresholds.length &&
        nextMutKills >= this.mutationThresholds[newMutRank]
      ) {
        newMutRank++;
      }

      const bonusPct = this.computeMutationSlayerBonusPct(nextMutKills);

      if (newMutRank > prevMutRank) {
        this.mutationRanks[mutId] = newMutRank;
        const mutDef = CONFIG.MUTATIONS?.[mutId];
        const mutLabel = mutDef?.shortLabel || mutDef?.name || mutId;
        const notif = {
          id: `mastery_mut_${mutId}_r${newMutRank}_${Date.now()}`,
          type: 'mutation_slayer',
          mutationId: mutId,
          rank: newMutRank,
          bonusPct,
          title: `🧬 Adaptation Génétique : Chasseur [${mutLabel}] (Rang ${newMutRank})`,
          subtitle: `+${bonusPct}% Dégâts contre les mutants [${mutLabel}] & affinité de sort (+15%) !`,
          badgeText: `vs ${mutLabel} +${bonusPct}%`,
          colorCss: mutDef?.colorCss || '#ff4757',
          colorHex: mutDef?.colorHex || 0xff4757,
        };
        newlyUnlockedRanks.push(notif);
        this.pendingNotifications.push(notif);
        logger.evolution(notif.title, notif);
      }
    }

    return {
      speciesId: rawSpeciesId,
      speciesKills: primaryKills,
      speciesRank: primaryRank,
      speciesBonusPct: this.computeSpeciesSlayerBonusPct(primaryKills),
      newlyUnlockedRanks,
    };
  }

  /**
   * Alias de `recordKill(enemy)` pour compatibilité avec les scripts de simulation et le moteur.
   * @param {object} enemy
   * @returns {object}
   */
  recordCreatureKill(enemy) {
    return this.recordKill(enemy);
  }

  /**
   * Détermine le type de dégât ('fire', 'venom', 'cryo', 'physical') à partir d'un descripteur
   * ou de l'ennemi attaquant.
   *
   * @param {string|boolean} damageTypeOrIsElemental - `'fire'`, `'venom'`, `'cryo'`, `'physical'`, ou booléen `isElemental`.
   * @param {object|string|null} [attackerEnemy=null] - Ennemi attaquant ou identifiant.
   * @returns {'fire'|'venom'|'cryo'|'physical'}
   */
  _resolveDamageCategory(damageTypeOrIsElemental, attackerEnemy = null) {
    if (typeof damageTypeOrIsElemental === 'string') {
      const lower = damageTypeOrIsElemental.toLowerCase();
      if (lower.includes('fire') || lower.includes('pyro') || lower.includes('feu')) return 'fire';
      if (lower.includes('venom') || lower.includes('poison') || lower.includes('venin')) return 'venom';
      if (lower.includes('cryo') || lower.includes('ice') || lower.includes('frost') || lower.includes('givre')) {
        return 'cryo';
      }
      if (lower.includes('phys') || lower.includes('melee')) return 'physical';
    }

    const muts = Array.isArray(attackerEnemy?.genome?.mutations)
      ? attackerEnemy.genome.mutations
      : [];
    if (muts.includes('pyro_gland') || attackerEnemy?.genome?.speciesId === 'dragon') {
      return 'fire';
    }
    if (muts.includes('venom_sacs')) {
      return 'venom';
    }
    if (muts.includes('cryo_blood')) {
      return 'cryo';
    }
    if (damageTypeOrIsElemental === true) {
      return 'fire';
    }
    return 'physical';
  }

  /**
   * Enregistre des dégâts subis par le Héros et développe automatiquement la Résistance Adaptative
   * correspondante (`fire`, `venom`, `cryo`, ou `physical`).
   *
   * @param {string|boolean} damageTypeOrIsElemental - Catégorie de dégât ou booléen `isElemental`.
   * @param {object|string|null} [attackerEnemy=null] - Ennemi source de l'attaque.
   * @param {number} [amount=10] - Montant de dégâts bruts reçus.
   * @returns {{
   *   damageCategory: 'fire'|'venom'|'cryo'|'physical',
   *   resistanceRank: number,
   *   resistancePct: number,
   *   damageMultiplier: number,
   *   newlyUnlockedRanks: Array<object>
   * }}
   */
  recordDamageTaken(damageTypeOrIsElemental = 'physical', attackerEnemy = null, amount = 10) {
    const category = this._resolveDamageCategory(damageTypeOrIsElemental, attackerEnemy);
    const safeAmount = Math.max(1, Number(amount) || 10);

    this.damageTakenByType[category] = (this.damageTakenByType[category] || 0) + safeAmount;
    this.hitsTakenByType[category] = (this.hitsTakenByType[category] || 0) + 1;

    const hits = this.hitsTakenByType[category];
    const prevRank = this.resistanceRanks[category] || 0;
    let newRank = prevRank;
    while (
      newRank < this.resistanceHitThresholds.length &&
      hits >= this.resistanceHitThresholds[newRank]
    ) {
      newRank++;
    }

    const newlyUnlockedRanks = [];
    if (newRank > prevRank) {
      this.resistanceRanks[category] = newRank;
      const meta = this._getResistanceDisplayMeta(category, newRank, hits);
      const notif = {
        id: `mastery_res_${category}_r${newRank}_${Date.now()}`,
        type: 'resistance',
        damageCategory: category,
        rank: newRank,
        resistancePct: meta.pct,
        title: `🛡️ Adaptation Corporelle : ${meta.label} (Rang ${newRank})`,
        subtitle: `Réduit de ${meta.pct}% tous les dégâts de type ${meta.shortName} !`,
        badgeText: `${meta.icon} Rés. ${meta.shortName} +${meta.pct}%`,
        colorCss: meta.colorCss,
        colorHex: meta.colorHex,
      };
      newlyUnlockedRanks.push(notif);
      this.pendingNotifications.push(notif);
      logger.evolution(notif.title, notif);
    }

    const reduction = this.getDamageReductionFor(category, attackerEnemy);
    return {
      damageCategory: category,
      resistanceRank: this.resistanceRanks[category] || 0,
      resistancePct: Number((reduction * 100).toFixed(1)),
      damageMultiplier: Number((1 - reduction).toFixed(4)),
      newlyUnlockedRanks,
    };
  }

  /**
   * Métadonnées d'affichage pour chaque catégorie de résistance adaptative.
   * @param {'fire'|'venom'|'cryo'|'physical'} category
   * @param {number} rank
   * @param {number} [hitsOverride]
   */
  _getResistanceDisplayMeta(category, rank, hitsOverride) {
    const hits = hitsOverride ?? (this.hitsTakenByType[category] || 0);
    const isPhys = category === 'physical';
    const pct = this.computeResistanceBonusPct(hits, isPhys);
    const map = {
      fire: {
        label: 'Ignifugation Sang-de-Dragon',
        shortName: 'Feu',
        icon: '🔥',
        pct,
        colorCss: '#ff5252',
        colorHex: 0xff5252,
      },
      venom: {
        label: 'Immunité Antitoxine',
        shortName: 'Venin',
        icon: '🧪',
        pct,
        colorCss: '#39ff14',
        colorHex: 0x39ff14,
      },
      cryo: {
        label: 'Sang Calorigène',
        shortName: 'Givre',
        icon: '❄️',
        pct,
        colorCss: '#00e5ff',
        colorHex: 0x00e5ff,
      },
      physical: {
        label: 'Endurcissement Ostéo-Dermique',
        shortName: 'Physique',
        icon: '🛡️',
        pct,
        colorCss: '#f0ead6',
        colorHex: 0xf0ead6,
      },
    };
    return map[category] || map.physical;
  }

  /**
   * Calcule le multiplicateur de dégâts d'espèce directement à partir du compteur de kills (`1 + bonusPct / 100`).
   *
   * @param {string} speciesId - Identifiant de l'espèce.
   * @returns {number} Multiplicateur dans `[1.0, 1.15]`.
   */
  getSpeciesDamageMultiplier(speciesId) {
    if (!speciesId) return 1.0;
    const kills = this.speciesKills[speciesId] || 0;
    if (kills > 0) {
      return Number((1 + this.computeSpeciesSlayerBonusPct(kills) / 100).toFixed(4));
    }
    if (typeof speciesId === 'string' && speciesId.includes('_')) {
      const parts = speciesId.split('_');
      let sumPct = 0;
      for (const pId of parts) {
        sumPct += this.computeSpeciesSlayerBonusPct(this.speciesKills[pId] || 0) * 0.65;
      }
      return Number(clamp(1 + sumPct / 100, 1.0, 1.15).toFixed(4));
    }
    return 1.0;
  }

  /**
   * Calcule le multiplicateur de dégâts contre une liste de mutations (`1 + sum(bonusPct) / 100`).
   *
   * @param {Array<string>} [mutationIds=[]] - Identifiants des mutations portées par la cible.
   * @returns {number} Multiplicateur dans `[1.0, 1.20]`.
   */
  getMutationDamageMultiplier(mutationIds = []) {
    if (!Array.isArray(mutationIds) || mutationIds.length === 0) return 1.0;
    let totalPct = 0;
    for (const mutId of mutationIds) {
      const kills = this.mutationKills[mutId] || 0;
      totalPct += this.computeMutationSlayerBonusPct(kills);
    }
    return Number(clamp(1 + totalPct / 100, 1.0, 1.2).toFixed(4));
  }

  /**
   * Calcule le multiplicateur total de dégâts infligés par le Héros contre une cible donnée,
   * en cumulant la Maîtrise d'Espèce (`<= +15%`) et la Maîtrise Anti-Mutation (`<= +15%`),
   * plafonné à `1.30` (`+30%` grand maximum).
   *
   * @param {object} enemy - Ennemi ciblé.
   * @returns {number} Multiplicateur de dégâts (`1.0` à `1.30`).
   */
  getDamageMultiplierAgainst(enemy) {
    if (!enemy) return 1.0;
    const spId = this._resolveSpeciesId(enemy);
    let spBonusPct = this.computeSpeciesSlayerBonusPct(this.speciesKills[spId] || 0);

    if (spBonusPct === 0 && Array.isArray(enemy.genome?.hybridParents)) {
      for (const pId of enemy.genome.hybridParents) {
        spBonusPct += this.computeSpeciesSlayerBonusPct(this.speciesKills[pId] || 0) * 0.65;
      }
      spBonusPct = Math.min(15.0, spBonusPct);
    }

    const mutations = Array.isArray(enemy.genome?.mutations) ? enemy.genome.mutations : [];
    let mutBonusPct = 0;
    for (const mutId of mutations) {
      mutBonusPct += this.computeMutationSlayerBonusPct(this.mutationKills[mutId] || 0);
    }

    const totalBonusFraction = (spBonusPct + mutBonusPct) / 100;
    return Number(clamp(1.0 + totalBonusFraction, 1.0, 1.30).toFixed(4));
  }

  /**
   * Alias de `getDamageMultiplierAgainst(creature)` conformément à la spécification Phase 11.
   *
   * @param {object} creature - Créature ciblée.
   * @returns {number} Multiplicateur de dégâts (`1.0` à `1.30`).
   */
  getTotalAdaptiveDamageMultiplier(creature) {
    return this.getDamageMultiplierAgainst(creature);
  }

  /**
   * Calcule la réduction de dégâts adaptative (`0.0` à `0.10` élémentaire / `0.06` physique) acquise contre un type d'attaque.
   *
   * @param {string|boolean} damageTypeOrIsElemental
   * @param {object|null} [attackerEnemy=null]
   * @returns {number} Fraction de réduction dans `[0, 0.10]`.
   */
  getDamageReductionFor(damageTypeOrIsElemental = 'physical', attackerEnemy = null) {
    const category = this._resolveDamageCategory(damageTypeOrIsElemental, attackerEnemy);
    const hits = this.hitsTakenByType[category] || 0;
    if (hits <= 0) return 0;
    const isPhys = category === 'physical';
    const pct = this.computeResistanceBonusPct(hits, isPhys);
    return Number(clamp(pct / 100, 0, isPhys ? 0.06 : 0.10).toFixed(4));
  }

  /**
   * Retourne le multiplicateur de dégâts subis (`1 - reduction`) pour un type de dégât donné.
   *
   * @param {string|boolean} damageTypeOrIsElemental
   * @param {object|null} [attackerEnemy=null]
   * @returns {number} Multiplicateur dans `[0.90, 1.0]`.
   */
  getDamageTakenMultiplier(damageTypeOrIsElemental = 'physical', attackerEnemy = null) {
    return Number((1 - this.getDamageReductionFor(damageTypeOrIsElemental, attackerEnemy)).toFixed(4));
  }

  /**
   * Calcule le multiplicateur de pondération d'offre de sort au Level-Up (`+15%` max si affinité de mutation).
   *
   * @param {object} ability - Définition du sort dans `ROGUELIKE_ABILITIES`.
   * @returns {number} Multiplicateur de poids (`1.0` à `1.265`).
   */
  getSpellOfferWeightMultiplier(ability) {
    if (!ability) return 1.0;
    let mult = 1.0;
    if (ability.affinityMutation && (this.mutationKills?.[ability.affinityMutation] || 0) > 0) {
      mult *= 1.15;
    }
    if (ability.affinitySpecies && (this.speciesKills?.[ability.affinitySpecies] || 0) > 0) {
      mult *= 1.10;
    }
    return Number(mult.toFixed(3));
  }

  /**
   * Dépile et retourne la prochaine notification de maîtrise en attente (ou `null`).
   *
   * @returns {object|null}
   */
  getUnlockNotification() {
    if (this.pendingNotifications.length === 0) return null;
    return this.pendingNotifications.shift() || null;
  }

  /**
   * Extrait et vide les notifications de montée de rang en attente (pour affichage de bannières
   * ou textes flottants par le HUD).
   *
   * @returns {Array<object>}
   */
  consumePendingNotifications() {
    if (this.pendingNotifications.length === 0) return [];
    const copy = [...this.pendingNotifications];
    this.pendingNotifications.length = 0;
    return copy;
  }

  /**
   * Retourne un résumé structuré de toutes les maîtrises offensives et résistances adaptatives
   * actives pour l'affichage en direct dans l'encart **🧬 Adaptations & Maîtrises du Héros** du HUD.
   *
   * @returns {{
   *   speciesMasteries: Array<{ id: string, name: string, kills: number, nextThreshold: number, rank: number, bonusPct: number }>,
   *   mutationMasteries: Array<{ id: string, name: string, kills: number, rank: number, bonusPct: number, colorCss: string }>,
   *   resistances: Array<{ id: string, name: string, icon: string, hits: number, nextThreshold: number, rank: number, reductionPct: number, colorCss: string }>,
   *   totalAdaptationsCount: number
   * }}
   */
  getSummaryForHUD() {
    const speciesMasteries = Object.entries(this.speciesKills)
      .filter(([, kills]) => kills > 0)
      .map(([spId, kills]) => {
        const rank = this.speciesRanks[spId] || 0;
        const spName = CONFIG.SPECIES?.[spId]?.name || spId;
        const nextThreshold =
          this.speciesThresholds[Math.min(rank, this.speciesThresholds.length - 1)] || kills;
        return {
          id: spId,
          name: spName,
          kills,
          nextThreshold,
          rank,
          bonusPct: this.computeSpeciesSlayerBonusPct(kills),
        };
      })
      .sort((a, b) => b.kills - a.kills);

    const mutationMasteries = Object.entries(this.mutationKills)
      .filter(([, kills]) => kills > 0)
      .map(([mutId, kills]) => {
        const rank = this.mutationRanks[mutId] || 0;
        const mutDef = CONFIG.MUTATIONS?.[mutId];
        return {
          id: mutId,
          name: mutDef?.shortLabel || mutDef?.name || mutId,
          kills,
          rank,
          bonusPct: this.computeMutationSlayerBonusPct(kills),
          colorCss: mutDef?.colorCss || '#ff4757',
        };
      })
      .sort((a, b) => b.kills - a.kills);

    const resistances = ['fire', 'venom', 'cryo', 'physical']
      .filter((cat) => (this.hitsTakenByType[cat] || 0) > 0 || (this.resistanceRanks[cat] || 0) > 0)
      .map((cat) => {
        const rank = this.resistanceRanks[cat] || 0;
        const hits = this.hitsTakenByType[cat] || 0;
        const meta = this._getResistanceDisplayMeta(cat, rank, hits);
        const nextThreshold =
          this.resistanceHitThresholds[Math.min(rank, this.resistanceHitThresholds.length - 1)] ||
          hits;
        return {
          id: cat,
          name: meta.shortName,
          fullName: meta.label,
          icon: meta.icon,
          hits,
          nextThreshold,
          rank,
          reductionPct: meta.pct,
          colorCss: meta.colorCss,
        };
      });

    const totalAdaptationsCount =
      speciesMasteries.filter((s) => s.kills > 0).length +
      mutationMasteries.filter((m) => m.kills > 0).length +
      resistances.filter((r) => r.hits > 0).length;

    return {
      speciesMasteries,
      mutationMasteries,
      resistances,
      totalAdaptationsCount,
    };
  }
}

/**
 * Tire `count` (par défaut 3) propositions d'améliorations lors d'une montée de niveau (Level-Up),
 * en combinant :
 * - Les **8 Sorts Actifs / Auto-Cast 3D** (`ROGUELIKE_ABILITIES`), avec évolution du Niveau 1 au Niveau 5,
 * - Les **7 Améliorations Passives de Contre-Adaptation** (`DESIGNED_UPGRADES`),
 * - Une pondération intelligente basée sur l'`AdaptiveMasterySystem` du joueur (ex. tuer un monstre
 *   porteur de `pyro_gland` booste la probabilité d'obtenir `Nova Pyroclastique` !).
 *
 * Accepte une signature souple : soit un objet d'options unique, soit `(ownedState, masteryOrContext, count, rng)`.
 *
 * @param {object|Array<string>} [optionsOrOwned={}] - Objet d'options `{ abilityLevels, equippedSpellIds, chosenPassives, masterySystem, ecoContext, combatMode, count, rng }` ou tableau des IDs déjà acquis.
 * @param {object} [masteryOrContext={}] - Instance de `AdaptiveMasterySystem` ou contexte écologique.
 * @param {number} [count=3] - Nombre de cartes à proposer.
 * @param {Function} [rng=Math.random] - Générateur aléatoire.
 * @returns {Array<object>} Tableau de `count` cartes prêtes à être affichées dans la Modale de Level-Up.
 */
export function drawRoguelikeLevelUpChoices(
  optionsOrOwned = {},
  masteryOrContext = {},
  count = 3,
  rng = Math.random
) {
  let abilityLevels = {};
  let chosenPassives = [];
  let mastery = null;
  let ecoContext = {};
  let requestedCount = count;
  let randFn = typeof rng === 'function' ? rng : Math.random;

  if (Array.isArray(optionsOrOwned)) {
    chosenPassives = optionsOrOwned;
    for (const id of optionsOrOwned) {
      if (ROGUELIKE_ABILITIES_BY_ID[id]) {
        abilityLevels[id] = (abilityLevels[id] || 0) + 1;
      }
    }
    if (masteryOrContext instanceof AdaptiveMasterySystem) {
      mastery = masteryOrContext;
    } else if (masteryOrContext && typeof masteryOrContext === 'object') {
      ecoContext = masteryOrContext;
      mastery = masteryOrContext.masterySystem || null;
    }
  } else if (optionsOrOwned && typeof optionsOrOwned === 'object') {
    abilityLevels = optionsOrOwned.abilityLevels || optionsOrOwned.abilities || {};
    chosenPassives = optionsOrOwned.chosenPassives || optionsOrOwned.upgrades || [];
    mastery =
      optionsOrOwned.masterySystem ||
      optionsOrOwned.mastery ||
      (masteryOrContext instanceof AdaptiveMasterySystem ? masteryOrContext : null);
    ecoContext = optionsOrOwned.ecoContext || masteryOrContext || {};
    if (typeof optionsOrOwned.count === 'number') requestedCount = optionsOrOwned.count;
    if (typeof optionsOrOwned.rng === 'function') randFn = optionsOrOwned.rng;
  }

  const candidates = [];

  // 1. Générer les cartes pour les 8 Sorts 3D (Nouveau Sort Niv. 1 ou Amélioration Niv. +1 jusqu'à 5)
  for (const ability of ROGUELIKE_ABILITIES) {
    const currentLvl = Number(abilityLevels[ability.id] || 0);
    if (currentLvl >= ability.maxLevel) continue;

    const nextLvl = currentLvl + 1;
    const statsNext = getAbilityStatsAtLevel(ability.id, nextLvl);
    let weight = currentLvl > 0 ? 1.35 : 1.25;

    // Synergie avec l'Apprentissage Adaptatif (+15% max via getSpellOfferWeightMultiplier)
    if (mastery && typeof mastery.getSpellOfferWeightMultiplier === 'function') {
      weight *= mastery.getSpellOfferWeightMultiplier(ability);
    }

    const isUpgrade = currentLvl > 0;
    const cardTitle = isUpgrade
      ? `${ability.name} (Niv. ${nextLvl})`
      : `${ability.name} (Nouveau Sort)`;

    const cardDesc = isUpgrade
      ? `${ability.levelScalingDesc} → Dégâts: ${statsNext.damage} | Portée: ${statsNext.range}m | Recharge: ${statsNext.cooldown}s.`
      : `${ability.description} (Dégâts: ${statsNext.damage} | Recharge: ${statsNext.cooldown}s).`;

    candidates.push({
      id: ability.id,
      cardType: 'spell',
      isSpell: true,
      isNewSpell: !isUpgrade,
      currentLevel: currentLvl,
      nextLevel: nextLvl,
      maxLevel: ability.maxLevel,
      name: cardTitle,
      baseName: ability.name,
      category: `Sort 3D • ${ability.category}`,
      rarity: ability.rarity,
      icon: ability.icon,
      colorHex: ability.colorHex,
      colorCss: ability.colorCss,
      description: cardDesc,
      statsAtNextLevel: statsNext,
      weight: weight * (0.85 + randFn() * 0.3),
    });
  }

  // 2. Générer les cartes Passives de Contre-Adaptation (`DESIGNED_UPGRADES`)
  const passiveSet = new Set(Array.isArray(chosenPassives) ? chosenPassives : []);
  for (const upg of DESIGNED_UPGRADES) {
    let weight = passiveSet.has(upg.id) ? 0.5 : 1.05;
    if (ecoContext?.hasActivePyro && upg.id === 'pyrophage_blade') weight *= 1.15;
    if ((ecoContext?.activeMutantCount || 0) > 0 && upg.id === 'patient_zero_tracker') weight *= 1.15;

    candidates.push({
      ...upg,
      cardType: 'passive',
      isSpell: false,
      isNewSpell: false,
      currentLevel: passiveSet.has(upg.id) ? 1 : 0,
      nextLevel: passiveSet.has(upg.id) ? 2 : 1,
      maxLevel: 5,
      rarity: 'uncommon',
      colorCss: '#e6a145',
      colorHex: 0xe6a145,
      weight: weight * (0.82 + randFn() * 0.36),
    });
  }

  candidates.sort((a, b) => b.weight - a.weight);

  // Garantir qu'au moins 2 des 3 cartes proposées soient des Sorts 3D (pour que le joueur construise un vrai kit de compétences !)
  const spellCards = candidates.filter((c) => c.isSpell);
  const passiveCards = candidates.filter((c) => !c.isSpell);

  const selected = [];
  for (const sc of spellCards) {
    if (selected.length < Math.max(2, requestedCount - 1)) {
      selected.push(sc);
    }
  }
  for (const pc of passiveCards) {
    if (selected.length < requestedCount) {
      selected.push(pc);
    }
  }
  for (const c of candidates) {
    if (selected.length < requestedCount && !selected.some((s) => s.id === c.id)) {
      selected.push(c);
    }
  }

  return selected.slice(0, requestedCount);
}

export default {
  COMBAT_MODES,
  ROGUELIKE_ABILITIES,
  ROGUELIKE_ABILITIES_BY_ID,
  getAbilityStatsAtLevel,
  drawRoguelikeLevelUpChoices,
  computeSpeciesSlayerBonusPct,
  computeMutationSlayerBonusPct,
  computeResistanceBonusPct,
  AdaptiveMasterySystem,
};
