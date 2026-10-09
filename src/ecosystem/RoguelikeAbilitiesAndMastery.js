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
    levelScalingDesc: '+1 lame orbitale et +25% dégâts par niveau.',
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
    levelScalingDesc: '+30% dégâts de feu, +1.2m de rayon et -0.4s de recharge par niveau.',
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
    levelScalingDesc: '+1 rebond de foudre et +22% dégâts par niveau.',
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
    levelScalingDesc: '+1 javelot aux niveaux 3 & 5, +25% dégâts et ralentissement prolongé.',
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
    levelScalingDesc: '+2 dagues par niveau et +30% dégâts de poison.',
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
    levelScalingDesc: '+35% dégâts d’impact, +1m de rayon d’explosion et -0.6s de recharge par niveau.',
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
    levelScalingDesc: '+1 cible drainée et +25% de soin vampirique par niveau.',
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
    levelScalingDesc: '+28% dégâts, +20% distance de recul et +0.3s d’étourdissement par niveau.',
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

  const damage = Math.round(def.baseDamage * (1 + steps * 0.28));
  const cooldown = Number(Math.max(1.2, def.baseCooldown * Math.pow(0.9, steps)).toFixed(2));
  const range = Number((def.baseRange * (1 + steps * 0.12)).toFixed(2));

  let count = def.baseCount || 1;
  if (def.id === 'spinning_blades' || def.id === 'chain_lightning' || def.id === 'soul_siphon') {
    count = def.baseCount + steps;
  } else if (def.id === 'venom_volley') {
    count = def.baseCount + steps * 2;
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
      burnDps: def.burnDps ? Math.round(def.burnDps * (1 + steps * 0.25)) : 0,
      burnDuration: def.burnDuration || 0,
      poisonDps: def.poisonDps ? Math.round(def.poisonDps * (1 + steps * 0.28)) : 0,
      poisonDuration: def.poisonDuration || 0,
      slowFactor: def.slowFactor || 0,
      slowDuration: def.slowDuration ? +(def.slowDuration + steps * 0.35).toFixed(1) : 0,
      aoeRadius: def.aoeRadius ? +(def.aoeRadius + steps * 0.6).toFixed(1) : range,
      lifestealRatio: def.lifestealRatio ? +(def.lifestealRatio + steps * 0.05).toFixed(2) : 0,
      knockbackDist: def.knockbackDist ? +(def.knockbackDist + steps * 0.8).toFixed(1) : 0,
      stunDuration: def.stunDuration ? +(def.stunDuration + steps * 0.25).toFixed(2) : 0,
    },
  };
}

/**
 * Classe d'Apprentissage & d'Adaptation par l'Action du Héros (`AdaptiveMasterySystem`).
 *
 * Principe : "Plus tu fais ou subis X, plus ton Héros devient fort et résistant face à X."
 * 1. **Maîtrise de Chasse par Espèce (`speciesKills`)** :
 *    - Paliers rapides (`1`, `3`, `6`, `10`, `16` éliminations) pour que le joueur ressente
 *      l'adaptation dès ses tout premiers combats (Acte 2 & Acte 3 !).
 *    - Chaque rang confère `+12%` de dégâts supplémentaires contre cette espèce (jusqu'à `+60%`).
 * 2. **Maîtrise Anti-Mutation (`mutationKills`)** :
 *    - Paliers (`1`, `2`, `4`, `7`, `12` éliminations de porteurs d'une mutation).
 *    - Chaque rang confère `+15%` de dégâts contre les porteurs de cette mutation ET augmente de
 *      `+65%` la probabilité de se voir proposer le sort élémentaire associé au prochain Level-Up !
 * 3. **Résistance Adaptative par Dégâts Subis (`damageTakenByType`)** :
 *    - Types suivis : `'fire'` (Feu/Pyro), `'venom'` (Venin/Poison), `'cryo'` (Givre), `'physical'` (Mêlée).
 *    - Dès que le joueur encaisse des coups d'un type donné, son organisme s'endurcit par paliers :
 *      - Élémentaire (`fire`, `venom`, `cryo`) : `+8%` de réduction par rang (jusqu'à `45%`).
 *      - Physique (`physical`) : `+6%` de réduction par rang (jusqu'à `30%`).
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

    /** Paliers de kills pour monter de rang contre une espèce (Rang 1 dès le 1er kill !) */
    this.speciesThresholds = [1, 3, 6, 10, 16];
    /** Paliers de kills pour monter de rang contre une mutation (Rang 1 dès le 1er mutant tué !) */
    this.mutationThresholds = [1, 2, 4, 7, 12];
    /** Paliers de coups/dégâts reçus (en équivalent coups) pour monter de rang de résistance */
    this.resistanceHitThresholds = [2, 5, 9, 15, 22];
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
   * Enregistre l'élimination d'un ennemi par le joueur et met à jour les maîtrises d'espèce et de mutation.
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
    // Si c'est un hybride (ex. 'goblin_orc'), fait progresser la maîtrise des deux espèces parentes !
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

      if (newRank > prevRank) {
        this.speciesRanks[spId] = newRank;
        const spName = CONFIG.SPECIES?.[spId]?.name || enemy.genome?.speciesName || spId;
        const bonusPct = newRank * 12;
        const notif = {
          id: `mastery_sp_${spId}_r${newRank}_${Date.now()}`,
          type: 'species_slayer',
          speciesId: spId,
          rank: newRank,
          bonusPct,
          title: `⚔️ Maîtrise : Fléau des ${spName}s (Rang ${newRank})`,
          subtitle: `+${bonusPct}% Dégâts contre l’espèce ${spName} (${nextKills} éliminés)`,
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
    const mutations = Array.isArray(enemy.genome?.mutations) ? enemy.genome.mutations : [];
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

      if (newMutRank > prevMutRank) {
        this.mutationRanks[mutId] = newMutRank;
        const mutDef = CONFIG.MUTATIONS?.[mutId];
        const mutLabel = mutDef?.shortLabel || mutDef?.name || mutId;
        const bonusPct = newMutRank * 15;
        const notif = {
          id: `mastery_mut_${mutId}_r${newMutRank}_${Date.now()}`,
          type: 'mutation_slayer',
          mutationId: mutId,
          rank: newMutRank,
          bonusPct,
          title: `🧬 Adaptation Génétique : Chasseur [${mutLabel}] (Rang ${newMutRank})`,
          subtitle: `+${bonusPct}% Dégâts contre les mutants [${mutLabel}] & affinité de sort accrue !`,
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
      speciesBonusPct: primaryRank * 12,
      newlyUnlockedRanks,
    };
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
      const meta = this._getResistanceDisplayMeta(category, newRank);
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
      resistancePct: Math.round(reduction * 100),
      damageMultiplier: Number((1 - reduction).toFixed(3)),
      newlyUnlockedRanks,
    };
  }

  /**
   * Métadonnées d'affichage pour chaque catégorie de résistance adaptative.
   * @param {'fire'|'venom'|'cryo'|'physical'} category
   * @param {number} rank
   */
  _getResistanceDisplayMeta(category, rank) {
    const map = {
      fire: {
        label: 'Ignifugation Sang-de-Dragon',
        shortName: 'Feu',
        icon: '🔥',
        pct: Math.min(45, rank * 9),
        colorCss: '#ff5252',
        colorHex: 0xff5252,
      },
      venom: {
        label: 'Immunité Antitoxine',
        shortName: 'Venin',
        icon: '🧪',
        pct: Math.min(45, rank * 9),
        colorCss: '#39ff14',
        colorHex: 0x39ff14,
      },
      cryo: {
        label: 'Sang Calorigène',
        shortName: 'Givre',
        icon: '❄️',
        pct: Math.min(45, rank * 9),
        colorCss: '#00e5ff',
        colorHex: 0x00e5ff,
      },
      physical: {
        label: 'Endurcissement Ostéo-Dermique',
        shortName: 'Physique',
        icon: '🛡️',
        pct: Math.min(30, rank * 6),
        colorCss: '#f0ead6',
        colorHex: 0xf0ead6,
      },
    };
    return map[category] || map.physical;
  }

  /**
   * Calcule le multiplicateur total de dégâts infligés par le Héros contre une cible donnée,
   * en cumulant la Maîtrise d'Espèce (`+12%/rang`) et la Maîtrise Anti-Mutation (`+15%/rang`).
   *
   * @param {object} enemy - Ennemi ciblé.
   * @returns {number} Multiplicateur de dégâts (`>= 1.0`).
   */
  getDamageMultiplierAgainst(enemy) {
    if (!enemy) return 1.0;
    let bonus = 0;

    const spId = this._resolveSpeciesId(enemy);
    if (this.speciesRanks[spId]) {
      bonus += this.speciesRanks[spId] * 0.12;
    } else if (Array.isArray(enemy.genome?.hybridParents)) {
      for (const pId of enemy.genome.hybridParents) {
        if (this.speciesRanks[pId]) {
          bonus += this.speciesRanks[pId] * 0.08;
        }
      }
    }

    const mutations = Array.isArray(enemy.genome?.mutations) ? enemy.genome.mutations : [];
    for (const mutId of mutations) {
      if (this.mutationRanks[mutId]) {
        bonus += this.mutationRanks[mutId] * 0.15;
      }
    }

    return Number(clamp(1.0 + bonus, 1.0, 2.6).toFixed(3));
  }

  /**
   * Calcule la réduction de dégâts adaptative (`0.0` à `0.45`) acquise contre un type d'attaque.
   *
   * @param {string|boolean} damageTypeOrIsElemental
   * @param {object|null} [attackerEnemy=null]
   * @returns {number} Fraction de réduction dans `[0, 0.45]`.
   */
  getDamageReductionFor(damageTypeOrIsElemental = 'physical', attackerEnemy = null) {
    const category = this._resolveDamageCategory(damageTypeOrIsElemental, attackerEnemy);
    const rank = this.resistanceRanks[category] || 0;
    if (rank <= 0) return 0;
    if (category === 'physical') {
      return clamp(rank * 0.06, 0, 0.3);
    }
    return clamp(rank * 0.09, 0, 0.45);
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
          bonusPct: rank * 12,
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
          bonusPct: rank * 15,
          colorCss: mutDef?.colorCss || '#ff4757',
        };
      })
      .sort((a, b) => b.kills - a.kills);

    const resistances = ['fire', 'venom', 'cryo', 'physical']
      .filter((cat) => (this.hitsTakenByType[cat] || 0) > 0 || (this.resistanceRanks[cat] || 0) > 0)
      .map((cat) => {
        const rank = this.resistanceRanks[cat] || 0;
        const hits = this.hitsTakenByType[cat] || 0;
        const meta = this._getResistanceDisplayMeta(cat, rank);
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
      speciesMasteries.filter((s) => s.rank > 0).length +
      mutationMasteries.filter((m) => m.rank > 0).length +
      resistances.filter((r) => r.rank > 0).length;

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
    let weight = currentLvl > 0 ? 1.45 : 1.3; // Favorise légèrement les sorts actifs et l'évolution des sorts équipés

    // Synergie avec l'Apprentissage Adaptatif : si le joueur a combattu la mutation/espèce associée
    if (mastery) {
      if (ability.affinityMutation && (mastery.mutationKills?.[ability.affinityMutation] || 0) > 0) {
        weight *= 1.75;
      }
      if (ability.affinitySpecies && (mastery.speciesKills?.[ability.affinitySpecies] || 0) > 0) {
        weight *= 1.3;
      }
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
      weight: weight * (0.82 + randFn() * 0.36),
    });
  }

  // 2. Générer les cartes Passives de Contre-Adaptation (`DESIGNED_UPGRADES`)
  const passiveSet = new Set(Array.isArray(chosenPassives) ? chosenPassives : []);
  for (const upg of DESIGNED_UPGRADES) {
    let weight = passiveSet.has(upg.id) ? 0.5 : 1.05;
    if (ecoContext?.hasActivePyro && upg.id === 'pyrophage_blade') weight *= 1.65;
    if ((ecoContext?.activeMutantCount || 0) > 0 && upg.id === 'patient_zero_tracker') weight *= 1.5;

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
  AdaptiveMasterySystem,
};
