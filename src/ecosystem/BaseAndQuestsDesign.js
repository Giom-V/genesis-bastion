/**
 * @file src/ecosystem/BaseAndQuestsDesign.js
 * @description Système d'Architecture 3D du Bastion (5 Bâtiments améliorables Niv. 0 → 3 sur socles
 * physiques `[E]` ou panneau `[H]`), Centre d'Ordres de Mission des Éclaireurs (`SCOUT_MISSIONS_CATALOG`)
 * et Générateur de Quêtes Dynamiques d'Éradication de Lignée (`DynamicQuestSystem`).
 *
 * Ce module répond aux deux besoins clés d'engagement à moyen terme :
 * 1. **Progression Tangible de la Base (Bastion)** :
 *    - Autour du feu de camp `(0, 0)`, 5 emplacements de bâtiments (`sanctuary_hearth`, `watchtower`,
 *      `scout_guild`, `lumber_forge`, `biolab`) sont matérialisés en 3D.
 *    - Le joueur peut s'approcher physiquement d'un chantier 3D et appuyer sur **`[E]`** (ou cliquer
 *      dans le panneau gauche / modale **`[H]`**) pour construire (`Niv. 0 → 1`) puis améliorer
 *      (`Niv. 1 → 2 → 3`) chaque structure avec des effets visuels et mécaniques majeurs.
 *
 * 2. **Ordres de Mission d'Éclaireurs & Quêtes Dynamiques d'Éradication** :
 *    - Le joueur peut ordonner à ses Éclaireurs une mission précise :
 *      - `track_lineage` : **🔍 Traquer tous les porteurs d'une lignée mutante** (ex. *Trolls de Feu*)
 *      - `find_cages` : **⛓️ Localiser les Cages de Survivants**
 *      - `scout_volcano` : **🌋 Explorer la Caldeira & Terres Sauvages**
 *      - `perimeter_alert` : **🛡️ Vigilance Frontière Anti-Hordes**
 *    - `DynamicQuestSystem` génère des opérations en 2 phases :
 *      - **Phase 1 (Renseignement)** : Envoyer les Éclaireurs repérer 100% des porteurs de la lignée (`Repérés : X / Y`).
 *      - **Phase 2 (Extermination)** : Éliminer tous les porteurs repérés (`Restants : Y → 0`), y compris les Bébés avant leur passage à l'âge adulte.
 */

import { CONFIG } from '../config.js';
import { clamp } from '../utils/math.js';
import { logger } from '../utils/logger.js';

/**
 * Catalogue des 5 Bâtiments du Bastion (Niv. 0 Chantier au sol → Niv. 1 → Niv. 2 → Niv. 3).
 * Chaque bâtiment possède une coordonnée 3D fixe (`padPos`) autour du sanctuaire central `(0, 0)`.
 */
export const BASTION_BUILDINGS_CATALOG = [
  {
    id: 'sanctuary_hearth',
    name: 'Cœur du Sanctuaire',
    shortName: 'Cœur du Bastion',
    icon: '🔥',
    hotkey: 'F5',
    padPos: { x: 0, z: 0 },
    interactRadius: 4.8,
    initialLevel: 1,
    maxLevel: 3,
    colorHex: 0xff9f43,
    colorCss: '#ff9f43',
    description:
      'Le foyer sacré du Bastion. L’améliorer augmente les PV max du Bastion, accélère la régénération du Héros près du feu et accueille davantage de survivants.',
    tiers: [
      {
        level: 1,
        tierName: 'Foyer des Survivants (Niv. 1)',
        cost: { wood: 0, crystal: 0, biomass: 0 },
        effectDesc: '500 PV Max Bastion • Soin Héros +15 PV/s • Capacité : 8 Survivants.',
        stats: { bastionMaxHp: 500, heroHealRate: 15, maxSurvivors: 8, passiveauraRange: 14 },
      },
      {
        level: 2,
        tierName: 'Citadelle d’Ambre (Niv. 2)',
        cost: { wood: 35, crystal: 15, biomass: 10 },
        effectDesc: '+250 PV Max Bastion (750) • Soin Héros +28 PV/s • +15% Vitesse autour du Bastion.',
        stats: { bastionMaxHp: 750, heroHealRate: 28, maxSurvivors: 12, passiveAuraRange: 18 },
      },
      {
        level: 3,
        tierName: 'Forteresse Solaire Invincible (Niv. 3)',
        cost: { wood: 60, crystal: 35, biomass: 25 },
        effectDesc: '+550 PV Max Bastion (1050) • Soin Héros +45 PV/s • Aura sacrée brûlant les assaillants (12 DPS).',
        stats: { bastionMaxHp: 1050, heroHealRate: 45, maxSurvivors: 16, passiveAuraRange: 22, auraBurnDps: 12 },
      },
    ],
  },
  {
    id: 'watchtower',
    name: 'Tour de Guet',
    shortName: 'Tour de Guet',
    icon: '🏹',
    hotkey: 'F1',
    padPos: { x: 8.5, z: -7.5 },
    interactRadius: 4.5,
    initialLevel: 0,
    maxLevel: 3,
    colorHex: 0xe6a145,
    colorCss: '#e6a145',
    description:
      'Tourelle défensive automatique érigée au Nord-Est du camp. Protège le Bastion contre les raids et les migrations de famine pendant vos expéditions.',
    tiers: [
      {
        level: 1,
        tierName: 'Tour d’Archer (Niv. 1)',
        cost: { wood: 25, crystal: 10, biomass: 0 },
        effectDesc: 'Tir automatique (18 dégâts / 1.35s, portée 34m) sur les ennemis proches.',
        stats: { damage: 18, fireInterval: 1.35, range: 34, boltsCount: 1, mutantDamageMult: 1.0, slowOnHit: 0 },
      },
      {
        level: 2,
        tierName: 'Baliste Double Cryogénique (Niv. 2)',
        cost: { wood: 40, crystal: 20, biomass: 10 },
        effectDesc: 'Tire 2 carreaux givrants (30 dégâts / 1.15s, portée 40m) qui ralentissent les cibles de 35%.',
        stats: { damage: 30, fireInterval: 1.15, range: 40, boltsCount: 2, mutantDamageMult: 1.25, slowOnHit: 0.35 },
      },
      {
        level: 3,
        tierName: 'Tour Pyrophage Anti-Mutants (Niv. 3)',
        cost: { wood: 65, crystal: 35, biomass: 25 },
        effectDesc: 'Artillerie runique (48 dégâts / 0.95s, portée 46m) infligeant +100% de dégâts aux Mutants et Hybrides !',
        stats: { damage: 48, fireInterval: 0.95, range: 46, boltsCount: 3, mutantDamageMult: 2.0, slowOnHit: 0.45 },
      },
    ],
  },
  {
    id: 'scout_guild',
    name: 'Guilde des Éclaireurs',
    shortName: 'Guilde Éclaireurs',
    icon: '🦅',
    hotkey: 'F2',
    padPos: { x: -8.5, z: -7.5 },
    interactRadius: 4.5,
    initialLevel: 0,
    maxLevel: 3,
    colorHex: 0x1e90ff,
    colorCss: '#1e90ff',
    description:
      'Poste de commandement cartographique au Nord-Ouest. Permet de donner des Ordres de Mission précis aux Éclaireurs et augmente leur vitesse et portée de détection.',
    tiers: [
      {
        level: 1,
        tierName: 'Poste de Fauconnerie (Niv. 1)',
        cost: { wood: 20, crystal: 15, biomass: 0 },
        effectDesc: '+30% portée de vision des Éclaireurs (44m), +25% vitesse d’expédition et Missions Ciblées optimisées.',
        stats: { visionMult: 1.3, speedMult: 1.25, slowBeaconOnPatientZero: false, bonusScoutsOnBuild: 1 },
      },
      {
        level: 2,
        tierName: 'Observatoire des Lignées (Niv. 2)',
        cost: { wood: 35, crystal: 25, biomass: 12 },
        effectDesc: '+60% vision (54m), +45% vitesse, et les Éclaireurs posent une Balise Ralentissante (-35% vitesse) sur chaque Patient Zéro repéré !',
        stats: { visionMult: 1.6, speedMult: 1.45, slowBeaconOnPatientZero: true, slowBeaconFactor: 0.65, bonusScoutsOnBuild: 0 },
      },
      {
        level: 3,
        tierName: 'Réseau Téléscopique Omniscient (Niv. 3)',
        cost: { wood: 55, crystal: 40, biomass: 25 },
        effectDesc: '+95% vision (66m), +70% vitesse, immunité des Éclaireurs en fuite et marquage instantané des nouveau-nés mutants !',
        stats: { visionMult: 1.95, speedMult: 1.7, slowBeaconOnPatientZero: true, slowBeaconFactor: 0.5, autoSpotNewbornMutants: true },
      },
    ],
  },
  {
    id: 'lumber_forge',
    legacyId: 'palisade',
    name: 'Atelier & Palissade Runique',
    shortName: 'Atelier & Remparts',
    icon: '🛡️',
    hotkey: 'F3',
    padPos: { x: 8.5, z: 7.5 },
    interactRadius: 4.5,
    initialLevel: 0,
    maxLevel: 3,
    colorHex: 0x38c172,
    colorCss: '#38c172',
    description:
      'Scierie alchimique et remparts d’épines au Sud-Est. Génère passivement du Bois et du Cristal toutes les 5s et renvoie les dégâts aux hordes affamées.',
    tiers: [
      {
        level: 1,
        tierName: 'Palissade d’Épines & Scierie (Niv. 1)',
        cost: { wood: 30, crystal: 5, biomass: 0 },
        effectDesc: '+180 PV au Bastion, renvoie 10 dégâts d’épines aux assaillants et produit +2 Bois / +1 Cristal toutes les 5s.',
        stats: { hpBonus: 180, thornsDamage: 10, woodPer5Sec: 2, crystalPer5Sec: 1 },
      },
      {
        level: 2,
        tierName: 'Rempart Ferré & Forge (Niv. 2)',
        cost: { wood: 45, crystal: 20, biomass: 10 },
        effectDesc: '+380 PV au Bastion, renvoie 22 dégâts d’épines et produit +4 Bois / +3 Cristal toutes les 5s.',
        stats: { hpBonus: 380, thornsDamage: 22, woodPer5Sec: 4, crystalPer5Sec: 3 },
      },
      {
        level: 3,
        tierName: 'Bastion d’Obsidienne Automatisé (Niv. 3)',
        cost: { wood: 70, crystal: 35, biomass: 20 },
        effectDesc: '+650 PV au Bastion, renvoie 38 dégâts d’épines et produit +7 Bois / +5 Cristal / +2 Biomasse toutes les 5s.',
        stats: { hpBonus: 650, thornsDamage: 38, woodPer5Sec: 7, crystalPer5Sec: 5, biomassPer5Sec: 2 },
      },
    ],
  },
  {
    id: 'biolab',
    name: 'Bio-Laboratoire Génétique',
    shortName: 'Bio-Laboratoire',
    icon: '🧬',
    hotkey: 'F4',
    padPos: { x: -8.5, z: 7.5 },
    interactRadius: 4.5,
    initialLevel: 0,
    maxLevel: 3,
    colorHex: 0x00d2d3,
    colorCss: '#00d2d3',
    description:
      'Laboratoire darwinien au Sud-Ouest. Analyse le génome des créatures, ralentit la croissance des Bébés mutants sur l’île et augmente vos dégâts contre les lignées.',
    tiers: [
      {
        level: 1,
        tierName: 'Séquenceur de Génome (Niv. 1)',
        cost: { wood: 20, crystal: 20, biomass: 0 },
        effectDesc: '+15% dégâts du Héros contre les Mutants/Hybrides et ralentit de 20% la maturation des Bébés mutants (+5s pour les tuer !).',
        stats: { heroMutantDamageBonus: 0.15, babyMaturationSlowMult: 1.2,scoutVisionBonus: 12 },
      },
      {
        level: 2,
        tierName: 'Inhibiteur de Dominance (Niv. 2)',
        cost: { wood: 35, crystal: 30, biomass: 15 },
        effectDesc: '+30% dégâts contre les Mutants, ralentit de 40% la maturation des Bébés mutants et réduit la transmission mendélienne ennemie.',
        stats: { heroMutantDamageBonus: 0.3, babyMaturationSlowMult: 1.4, scoutVisionBonus: 22 },
      },
      {
        level: 3,
        tierName: 'Sanctuaire d’Éradication Génétique (Niv. 3)',
        cost: { wood: 55, crystal: 45, biomass: 30 },
        effectDesc: '+50% dégâts contre les Mutants, ralentit de 60% la maturation des Bébés mutants et +50% XP/Biomasse sur chaque Patient Zéro !',
        stats: { heroMutantDamageBonus: 0.5, babyMaturationSlowMult: 1.6, scoutVisionBonus: 34, bonusMutantXpMult: 1.5 },
      },
    ],
  },
];

/**
 * Dictionnaire d'accès rapide aux bâtiments par `id` (supporte aussi l'alias `'palisade'` -> `'lumber_forge'`).
 */
export const BASTION_BUILDINGS_BY_ID = Object.freeze(
  BASTION_BUILDINGS_CATALOG.reduce((acc, b) => {
    acc[b.id] = b;
    if (b.legacyId) acc[b.legacyId] = b;
    return acc;
  }, {})
);

/**
 * Retourne la spécification complète d'un bâtiment du Bastion à son niveau actuel ainsi que
 * le coût et les effets de son prochain niveau (`currentLevel + 1`).
 *
 * @param {string} buildingId - Identifiant du bâtiment (`'watchtower'`, `'scout_guild'`, `'lumber_forge'`, `'biolab'`, `'sanctuary_hearth'`, ou `'palisade'`).
 * @param {number} [currentLevel=0] - Niveau actuel du bâtiment (`0` à `3`).
 * @returns {object} Spécification détaillée pour l'UI et la logique 3D.
 */
export function getBuildingUpgradeSpec(buildingId, currentLevel = 0) {
  const def = BASTION_BUILDINGS_BY_ID[buildingId] || BASTION_BUILDINGS_CATALOG[1];
  const lvl = clamp(Math.floor(currentLevel ?? def.initialLevel ?? 0), 0, def.maxLevel);
  const isMaxed = lvl >= def.maxLevel;
  const nextLevel = isMaxed ? def.maxLevel : lvl + 1;

  const currentTier = lvl > 0 ? def.tiers[lvl - 1] : null;
  const nextTier = !isMaxed ? def.tiers[nextLevel - 1] : def.tiers[def.maxLevel - 1];
  const cost = isMaxed
    ? { wood: 0, crystal: 0, biomass: 0 }
    : {
        wood: nextTier?.cost?.wood || 0,
        crystal: nextTier?.cost?.crystal || 0,
        biomass: nextTier?.cost?.biomass || 0,
      };

  const actionVerb = lvl === 0 ? 'Construire' : isMaxed ? 'Niveau Max' : `Améliorer Niv. ${nextLevel}`;
  const costParts = [];
  if (cost.wood > 0) costParts.push(`${cost.wood} Bois`);
  if (cost.crystal > 0) costParts.push(`${cost.crystal} Cristal`);
  if (cost.biomass > 0) costParts.push(`${cost.biomass} Biomasse`);
  const costText = isMaxed ? 'MAX' : costParts.length > 0 ? costParts.join(' • ') : 'Gratuit';

  return {
    id: def.id,
    legacyId: def.legacyId || def.id,
    name: def.name,
    shortName: def.shortName,
    icon: def.icon,
    hotkey: def.hotkey,
    padPos: { ...def.padPos },
    interactRadius: def.interactRadius || 4.5,
    colorHex: def.colorHex,
    colorCss: def.colorCss,
    description: def.description,
    currentLevel: lvl,
    nextLevel,
    maxLevel: def.maxLevel,
    isMaxed,
    actionVerb,
    cost,
    costText,
    currentTierName: currentTier ? currentTier.tierName : 'Chantier Vierge (Niv. 0)',
    nextTierName: nextTier ? nextTier.tierName : 'Niveau Maximum',
    currentEffectDesc: currentTier ? currentTier.effectDesc : 'Non construit — Approchez-vous du socle [E] ou cliquez pour bâtir.',
    nextEffectDesc: nextTier ? nextTier.effectDesc : 'Amélioration maximale atteinte.',
    statsAtCurrent: currentTier ? { ...currentTier.stats } : null,
    statsAtNext: nextTier ? { ...nextTier.stats } : null,
    worldPromptText: isMaxed
      ? `${def.icon} ${def.name} (Niv. MAX)`
      : `[E] ${actionVerb} : ${def.name} (${costText})`,
  };
}

/**
 * Vérifie si le joueur dispose des ressources nécessaires pour construire ou améliorer un bâtiment.
 *
 * @param {string} buildingId
 * @param {number} currentLevel
 * @param {{ wood?: number, crystal?: number, biomass?: number }} [resources={}]
 * @returns {boolean}
 */
export function canAffordBuildingUpgrade(buildingId, currentLevel = 0, resources = {}) {
  const spec = getBuildingUpgradeSpec(buildingId, currentLevel);
  if (spec.isMaxed) return false;
  const w = resources?.wood ?? 0;
  const c = resources?.crystal ?? 0;
  const b = resources?.biomass ?? 0;
  return w >= spec.cost.wood && c >= spec.cost.crystal && b >= spec.cost.biomass;
}

/**
 * Catalogue des 4 Ordres de Mission que le joueur peut confier à ses Éclaireurs (`role === 'scout'`).
 */
export const SCOUT_MISSIONS_CATALOG = [
  {
    id: 'track_lineage',
    name: 'Traquer la Lignée Mutante',
    shortLabel: '🔍 Traquer Lignée',
    icon: '🔍',
    colorHex: 0xff4757,
    colorCss: '#ff4757',
    speedBonusMult: 1.45,
    description:
      'Vos Éclaireurs recherchent en priorité absolue tous les individus (Bébés et Adultes) porteurs de la mutation ciblée (ex: Trolls de Feu) et les marquent d’un faisceau céleste 3D.',
  },
  {
    id: 'find_cages',
    name: 'Secourir les Survivants en Cage',
    shortLabel: '⛓️ Chercher Cages',
    icon: '⛓️',
    colorHex: 0xffd166,
    colorCss: '#ffd166',
    speedBonusMult: 1.3,
    description:
      'Vos Éclaireurs patrouillent vers les Cages de Prisonniers non libérées pour révéler leur position exacte sur votre Minimap.',
  },
  {
    id: 'scout_volcano',
    name: 'Explorer la Caldeira & Terres Sauvages',
    shortLabel: '🌋 Exploration Profonde',
    icon: '🌋',
    colorHex: 0x1e90ff,
    colorCss: '#1e90ff',
    speedBonusMult: 1.2,
    description:
      'Expédition au-delà de la frontière (50m à 108m) dans la Caldeira Volcanique et les forêts profondes pour anticiper toute nouvelle émergence.',
  },
  {
    id: 'perimeter_alert',
    name: 'Vigilance Frontière Anti-Hordes',
    shortLabel: '🛡️ Garde Frontière',
    icon: '🛡️',
    colorHex: 0x38c172,
    colorCss: '#38c172',
    speedBonusMult: 1.15,
    description:
      'Patrouille circulaire autour du Bastion (35m à 58m) pour repérer les meutes en famine qui migrent vers vos remparts.',
  },
];

/**
 * Dictionnaire d'accès rapide aux missions d'Éclaireurs par `id`.
 */
export const SCOUT_MISSIONS_BY_ID = Object.freeze(
  SCOUT_MISSIONS_CATALOG.reduce((acc, m) => {
    acc[m.id] = m;
    return acc;
  }, {})
);

/**
 * Retourne les détails formatés d'une mission d'Éclaireur (avec le nom de la mutation/lignée ciblée).
 *
 * @param {string} [missionType='track_lineage']
 * @param {string|null} [targetMutationId='pyro_gland']
 * @returns {object}
 */
export function getScoutMissionSpec(missionType = 'track_lineage', targetMutationId = 'pyro_gland') {
  const base = SCOUT_MISSIONS_BY_ID[missionType] || SCOUT_MISSIONS_CATALOG[0];
  const mutDef = targetMutationId ? CONFIG.MUTATIONS?.[targetMutationId] : null;
  const targetLabel = mutDef
    ? mutDef.shortLabel || mutDef.name
    : targetMutationId || 'Toutes les Mutations';

  const fullTitle =
    base.id === 'track_lineage'
      ? `🔍 Mission Éclaireurs : Traquer [${targetLabel}]`
      : `${base.icon} Mission Éclaireurs : ${base.name}`;

  return {
    ...base,
    type: base.id,
    targetMutationId: base.id === 'track_lineage' ? targetMutationId || 'pyro_gland' : null,
    targetLabel,
    fullTitle,
  };
}

/**
 * Système de Quêtes Dynamiques d'Éradication de Lignée & d'Architecture du Bastion (`DynamicQuestSystem`).
 *
 * Donne au joueur des objectifs clairs, mesurables et gratifiants :
 * 1. **Quête d'Éradication de Lignée (`type: 'eradicate_lineage'`)** :
 *    - *Exemple* : **« Opération : Éradication des Trolls de Feu [Pyro / Feu] »**
 *    - **Étape 1 (Mission Éclaireurs)** : Localiser tous les porteurs de la lignée avec vos Éclaireurs (`Repérés : X / Y`).
 *    - **Étape 2 (Extermination)** : Éliminer 100% des porteurs de la lignée (`Éliminés : K / Total`, `Restants : Y → 0`).
 * 2. **Quête d'Architecture du Bastion (`type: 'upgrade_bastion'`)** :
 *    - Guide pas à pas le joueur pour construire et améliorer ses bâtiments sur les socles 3D du camp (`[E]`) ou via le panneau Bastion (`[H]`).
 */
export class DynamicQuestSystem {
  constructor() {
    /** @type {Array<object>} Quêtes actives */
    this.activeQuests = [];
    /** @type {Array<object>} Quêtes accomplies */
    this.completedQuests = [];
    /** @type {Array<object>} Récompenses et bannières en attente d'attribution au joueur */
    this.pendingRewards = [];
    /** @type {number} Compteur monotone d'ID de quête */
    this.nextQuestSeq = 1;

    // Initialise les quêtes de départ (Architecture du Bastion + Traque de la Lignée Pyro)
    this.startLineageEradicationQuest('pyro_gland', 'troll');
    this.startBaseUpgradeQuest();
  }

  /**
   * Démarre (ou met en priorité) une quête dynamique d'éradication d'une lignée mutante ou hybride.
   *
   * @param {string} [mutationId='pyro_gland'] - Identifiant de la mutation ciblée (ex. `'pyro_gland'`).
   * @param {string} [speciesHint='troll'] - Espèce emblématique porteuse (ex. `'troll'`).
   * @returns {object} La quête créée ou existante.
   */
  startLineageEradicationQuest(mutationId = 'pyro_gland', speciesHint = 'troll') {
    const existing = this.activeQuests.find(
      (q) => q.type === 'eradicate_lineage' && q.targetMutationId === mutationId && !q.completed
    );
    if (existing) {
      // Place cette quête en tête de liste (prioritaire)
      this.activeQuests = [existing, ...this.activeQuests.filter((q) => q.id !== existing.id)];
      return existing;
    }

    const mutDef = CONFIG.MUTATIONS?.[mutationId] || CONFIG.MUTATIONS?.pyro_gland;
    const spDef = CONFIG.SPECIES?.[speciesHint] || CONFIG.SPECIES?.troll;
    const mutLabel = mutDef?.shortLabel || mutDef?.name || mutationId;
    const lineageDisplayName =
      mutationId === 'pyro_gland' && speciesHint === 'troll'
        ? 'Trolls de Feu (Glande Pyroclastique)'
        : `Porteurs de [${mutLabel}] (${spDef?.name || 'Mutants'})`;

    const quest = {
      id: `quest_lineage_${mutationId}_${this.nextQuestSeq++}`,
      type: 'eradicate_lineage',
      targetMutationId: mutationId,
      speciesHint,
      title: `📜 Opération : Éradication — ${lineageDisplayName}`,
      shortTitle: `Éradiquer : ${lineageDisplayName}`,
      icon: '🎯',
      colorCss: mutDef?.colorCss || '#ff4757',
      colorHex: mutDef?.colorHex || 0xff4757,
      phase: 1, // 1 = Repérage Éclaireurs, 2 = Extermination
      totalCarriers: 1,
      spottedCarriers: 0,
      unspottedCarriers: 1,
      babyCarriers: 0,
      slainCount: 0,
      peakCarriersSeen: 1,
      scoutMissionAssigned: false,
      completed: false,
      step1Text: `1. Mission Éclaireurs : Localiser tous les porteurs [${mutLabel}] (0/1 repéré)`,
      step2Text: `2. Extermination : Éliminer toute la lignée [${mutLabel}] (1 restant)`,
      actionHint: `Cliquez sur « 🔍 Traquer [${mutLabel}] » pour envoyer vos Éclaireurs débusquer toute la lignée !`,
      rewards: {
        wood: 45,
        crystal: 35,
        biomass: 30,
        xp: 120,
      },
    };

    this.activeQuests.unshift(quest);
    logger.info('QUEST', `Nouvelle quête lancée : ${quest.title}`, {
      questId: quest.id,
      targetMutationId: mutationId,
    });
    return quest;
  }

  /**
   * Démarre la quête fil-rouge de développement et d'amélioration du Bastion.
   *
   * @returns {object} Quête de développement de base.
   */
  startBaseUpgradeQuest() {
    const existing = this.activeQuests.find((q) => q.type === 'upgrade_bastion' && !q.completed);
    if (existing) return existing;

    const quest = {
      id: `quest_bastion_upgrade_${this.nextQuestSeq++}`,
      type: 'upgrade_bastion',
      title: '🏰 Architecture du Bastion : Bâtir & Améliorer le Sanctuaire',
      shortTitle: 'Développer le Bastion (Chantiers [E] ou [H])',
      icon: '🏰',
      colorCss: '#e6a145',
      colorHex: 0xe6a145,
      buildingsConstructed: 0,
      targetBuildingsCount: 2,
      highestUpgradeLevel: 1,
      targetUpgradeLevel: 2,
      completed: false,
      step1Text: '1. Construire au moins 2 bâtiments sur les socles 3D du camp [E] ou via [H] (0/2)',
      step2Text: '2. Améliorer un bâtiment au Niveau 2 (Niv. max actuel : 1/2)',
      actionHint:
        'Approchez-vous d’un socle doré autour du feu de camp et appuyez sur [E] (ou ouvrez [H]) pour améliorer la Base !',
      rewards: {
        wood: 40,
        crystal: 30,
        biomass: 20,
        xp: 100,
      },
    };

    this.activeQuests.push(quest);
    return quest;
  }

  /**
   * Enregistre l'élimination d'un ennemi pour mettre à jour les compteurs de chasse de la quête active.
   *
   * @param {object} enemy - Ennemi éliminé.
   */
  recordEnemyKilled(enemy) {
    if (!enemy) return;
    const muts = Array.isArray(enemy.genome?.mutations) ? enemy.genome.mutations : [];
    for (const quest of this.activeQuests) {
      if (quest.type === 'eradicate_lineage' && !quest.completed) {
        if (
          muts.includes(quest.targetMutationId) ||
          enemy.genome?.speciesId === quest.targetMutationId
        ) {
          quest.slainCount = (quest.slainCount || 0) + 1;
        }
      }
    }
  }

  /**
   * Met à jour en temps réel l'état de toutes les quêtes actives à partir de la population ennemie,
   * des niveaux de bâtiments du Bastion et de l'ordre de mission actuel des Éclaireurs.
   *
   * @param {Array<object>} [enemies=[]] - Liste des ennemis vivants dans le monde.
   * @param {object} [buildingLevels={}] - Niveaux actuels des bâtiments (`{ watchtower: 1, scout_guild: 0, ... }`).
   * @param {object} [activeScoutMission={}] - Mission active des Éclaireurs (`{ type, targetMutationId }`).
   * @param {boolean} [isTutorialActive=false] - Si vrai, ne clôture pas prématurément les quêtes avant que des porteurs existent.
   */
  update(
    enemies = [],
    buildingLevels = {},
    activeScoutMission = {},
    isTutorialActive = false
  ) {
    const safeEnemies = Array.isArray(enemies) ? enemies : [];

    for (const quest of this.activeQuests) {
      if (quest.completed) continue;

      if (quest.type === 'eradicate_lineage') {
        const mutId = quest.targetMutationId;
        const mutDef = CONFIG.MUTATIONS?.[mutId];
        const mutLabel = mutDef?.shortLabel || mutDef?.name || mutId;

        const carriers = safeEnemies.filter(
          (e) =>
            e &&
            e.hp > 0 &&
            ((Array.isArray(e.genome?.mutations) && e.genome.mutations.includes(mutId)) ||
              e.genome?.speciesId === mutId)
        );

        const totalCarriers = carriers.length;
        const spottedCarriers = carriers.filter((e) => e.spottedByScout).length;
        const unspottedCarriers = Math.max(0, totalCarriers - spottedCarriers);
        const babyCarriers = carriers.filter((e) => !e.isAdult || e.lifeStage === 'baby').length;

        if (totalCarriers > quest.peakCarriersSeen) {
          quest.peakCarriersSeen = totalCarriers;
        }

        quest.totalCarriers = totalCarriers;
        quest.spottedCarriers = spottedCarriers;
        quest.unspottedCarriers = unspottedCarriers;
        quest.babyCarriers = babyCarriers;
        quest.scoutMissionAssigned =
          activeScoutMission?.type === 'track_lineage' &&
          (!activeScoutMission.targetMutationId || activeScoutMission.targetMutationId === mutId);

        const allCurrentlySpotted = totalCarriers > 0 && spottedCarriers >= totalCarriers;
        quest.phase = allCurrentlySpotted ? 2 : 1;

        quest.step1Text = allCurrentlySpotted
          ? `✅ 1. Éclaireurs : Tous les porteurs [${mutLabel}] sont localisés (${spottedCarriers}/${totalCarriers}) !`
          : `🔍 1. Éclaireurs : Localiser tous les porteurs [${mutLabel}] (${spottedCarriers}/${Math.max(1, totalCarriers)} repérés)`;

        const babyWarn = babyCarriers > 0 ? ` dont ${babyCarriers} Bébé(s) !` : '';
        quest.step2Text =
          totalCarriers === 0 && quest.slainCount > 0
            ? `✅ 2. Extermination : Lignée [${mutLabel}] éradiquée (${quest.slainCount} éliminés) !`
            : `⚔️ 2. Extermination : Éliminer tous les [${mutLabel}] (${totalCarriers} restant(s)${babyWarn} • ${quest.slainCount} tué(s))`;

        if (!quest.scoutMissionAssigned && unspottedCarriers > 0) {
          quest.actionHint = `💡 Ordonnez aux Éclaireurs « 🔍 Traquer [${mutLabel}] » pour révéler les ${unspottedCarriers} porteur(s) caché(s) !`;
        } else if (unspottedCarriers > 0) {
          quest.actionHint = `🦅 Vos Éclaireurs traquent les ${unspottedCarriers} porteur(s) [${mutLabel}] restant(s) dans les terres sauvages...`;
        } else if (totalCarriers > 0) {
          quest.actionHint = `🎯 Tous les [${mutLabel}] sont verrouillés sur la Minimap ! Foncez les éliminer avant le prochain Eco-Tick !`;
        }

        // Condition de victoire de la quête : au moins 1 porteur a été tué et il n'en reste plus aucun en vie !
        if (totalCarriers === 0 && quest.slainCount > 0 && !isTutorialActive) {
          this._completeQuest(quest);
        }
      } else if (quest.type === 'upgrade_bastion') {
        const builtList = ['watchtower', 'scout_guild', 'lumber_forge', 'biolab'].filter(
          (id) => (buildingLevels?.[id] || 0) >= 1
        );
        const maxLvl = Math.max(
          1,
          ...Object.values(buildingLevels || {}).map((v) => Number(v) || 0)
        );

        quest.buildingsConstructed = builtList.length;
        quest.highestUpgradeLevel = maxLvl;

        const step1Done = builtList.length >= quest.targetBuildingsCount;
        const step2Done = maxLvl >= quest.targetUpgradeLevel;

        quest.step1Text = `${step1Done ? '✅' : '🔨'} 1. Construire ${quest.targetBuildingsCount} bâtiments au Bastion (${builtList.length}/${quest.targetBuildingsCount})`;
        quest.step2Text = `${step2Done ? '✅' : '⬆️'} 2. Améliorer un bâtiment au Niveau ${quest.targetUpgradeLevel} (Max actuel : Niv. ${maxLvl})`;

        if (step1Done && step2Done) {
          this._completeQuest(quest);
        }
      }
    }

    // Si aucune quête d'éradication de lignée n'est active et qu'une autre mutation existe dans le monde, en lance une nouvelle !
    const hasActiveLineageQuest = this.activeQuests.some(
      (q) => q.type === 'eradicate_lineage' && !q.completed
    );
    if (!hasActiveLineageQuest && safeEnemies.length > 0) {
      const nextMutant = safeEnemies.find(
        (e) => e.hp > 0 && Array.isArray(e.genome?.mutations) && e.genome.mutations.length > 0
      );
      if (nextMutant) {
        this.startLineageEradicationQuest(
          nextMutant.genome.mutations[0],
          nextMutant.genome.speciesId
        );
      }
    }
  }

  /**
   * Marque une quête comme accomplie et met ses récompenses en file d'attente.
   * @param {object} quest
   */
  _completeQuest(quest) {
    if (quest.completed) return;
    quest.completed = true;
    this.completedQuests.push(quest);
    this.activeQuests = this.activeQuests.filter((q) => q.id !== quest.id);

    const rewardEntry = {
      questId: quest.id,
      title: `🏆 QUÊTE ACCOMPLIE : ${quest.shortTitle}`,
      subtitle: `Récompense : +${quest.rewards.wood} Bois, +${quest.rewards.crystal} Cristal, +${quest.rewards.biomass} Biomasse & +${quest.rewards.xp} XP !`,
      rewards: { ...quest.rewards },
      colorCss: quest.colorCss,
      colorHex: quest.colorHex,
    };
    this.pendingRewards.push(rewardEntry);
    logger.evolution(rewardEntry.title, rewardEntry);
  }

  /**
   * Consomme et retourne les récompenses des quêtes récemment accomplies.
   * @returns {Array<object>}
   */
  consumePendingRewards() {
    if (this.pendingRewards.length === 0) return [];
    const copy = [...this.pendingRewards];
    this.pendingRewards.length = 0;
    return copy;
  }

  /**
   * Retourne la quête prioritaire actuelle (ainsi que la liste complète des quêtes actives) pour le HUD.
   * @returns {{ primaryQuest: object|null, activeQuests: Array<object>, completedCount: number }}
   */
  getQuestsSummaryForHUD() {
    return {
      primaryQuest: this.activeQuests[0] || null,
      activeQuests: [...this.activeQuests],
      completedCount: this.completedQuests.length,
    };
  }
}

export default {
  BASTION_BUILDINGS_CATALOG,
  BASTION_BUILDINGS_BY_ID,
  getBuildingUpgradeSpec,
  canAffordBuildingUpgrade,
  SCOUT_MISSIONS_CATALOG,
  SCOUT_MISSIONS_BY_ID,
  getScoutMissionSpec,
  DynamicQuestSystem,
};
