/**
 * @file src/ecosystem/BaseAndQuestsDesign.js
 * @description Bilingual (EN default / FR 2nd) 3D Bastion Architecture (5 Upgradable Buildings Lvl 0 → 3
 * on `[E]` pads or `[H]` modal), Scout Mission Orders (`SCOUT_MISSIONS_CATALOG`), Dynamic Lineage
 * Eradication Quests (`DynamicQuestSystem`), Legendary Elemental Weapons (`ELEMENTAL_WEAPONS_CATALOG`),
 * Eden Relic Fragments (`RELIC_FRAGMENTS_SPEC`), and Multi-Island Campaign Tiers (`getIslandTierSpec`).
 */

import { CONFIG } from '../config.js';
import { clamp } from '../utils/math.js';
import { logger } from '../utils/logger.js';
import { getLanguage, tr, translateString } from '../utils/i18n.js';

/**
 * Helper to create a bilingual building entry whose `.name`, `.shortName`, `.description`, and `.tiers`
 * dynamically resolve to English (`'en'`, default) or French (`'fr'`).
 *
 * @param {object} spec
 * @returns {object}
 */
function createBilingualBuilding(spec) {
  return {
    ...spec,
    get name() {
      return tr(spec.nameEN, spec.nameFR);
    },
    get shortName() {
      return tr(spec.shortNameEN, spec.shortNameFR);
    },
    get description() {
      return tr(spec.descriptionEN, spec.descriptionFR);
    },
    tiers: spec.tiersBilingual.map((t) => ({
      ...t,
      get tierName() {
        return tr(t.tierNameEN, t.tierNameFR);
      },
      get effectDesc() {
        return tr(t.effectDescEN, t.effectDescFR);
      },
    })),
  };
}

/**
 * Catalog of the 5 Bastion Buildings (Lvl 0 Pad → Lvl 1 → Lvl 2 → Lvl 3).
 */
export const BASTION_BUILDINGS_CATALOG = [
  createBilingualBuilding({
    id: 'sanctuary_hearth',
    nameEN: 'Sanctuary Hearth',
    nameFR: 'Cœur du Sanctuaire',
    shortNameEN: 'Bastion Core',
    shortNameFR: 'Cœur du Bastion',
    icon: '🔥',
    hotkey: 'F5',
    padPos: { x: 0, z: 0 },
    interactRadius: 4.8,
    initialLevel: 1,
    maxLevel: 3,
    colorHex: 0xff9f43,
    colorCss: '#ff9f43',
    descriptionEN:
      'The sacred hearth of the Bastion. Upgrading it increases Bastion Max HP, accelerates Hero regeneration near the fire, and houses more survivors.',
    descriptionFR:
      'Le foyer sacré du Bastion. L’améliorer augmente les PV max du Bastion, accélère la régénération du Héros près du feu et accueille davantage de survivants.',
    tiersBilingual: [
      {
        level: 1,
        tierNameEN: 'Survivors’ Hearth (Lvl 1)',
        tierNameFR: 'Foyer des Survivants (Niv. 1)',
        cost: { wood: 0, crystal: 0, biomass: 0 },
        effectDescEN: '500 Bastion Max HP • Hero Heal +15 HP/s • Capacity: 8 Survivors.',
        effectDescFR: '500 PV Max Bastion • Soin Héros +15 PV/s • Capacité : 8 Survivants.',
        stats: { bastionMaxHp: 500, heroHealRate: 15, maxSurvivors: 8, passiveAuraRange: 14 },
      },
      {
        level: 2,
        tierNameEN: 'Amber Citadel (Lvl 2)',
        tierNameFR: 'Citadelle d’Ambre (Niv. 2)',
        cost: { wood: 35, crystal: 15, biomass: 10 },
        effectDescEN: '+250 Bastion Max HP (750) • Hero Heal +28 HP/s • +15% Speed around the Bastion.',
        effectDescFR: '+250 PV Max Bastion (750) • Soin Héros +28 PV/s • +15% Vitesse autour du Bastion.',
        stats: { bastionMaxHp: 750, heroHealRate: 28, maxSurvivors: 12, passiveAuraRange: 18 },
      },
      {
        level: 3,
        tierNameEN: 'Invincible Solar Fortress (Lvl 3)',
        tierNameFR: 'Forteresse Solaire Invincible (Niv. 3)',
        cost: { wood: 60, crystal: 35, biomass: 25 },
        effectDescEN: '+550 Bastion Max HP (1050) • Hero Heal +45 HP/s • Sacred Aura burning attackers (12 DPS).',
        effectDescFR: '+550 PV Max Bastion (1050) • Soin Héros +45 PV/s • Aura sacrée brûlant les assaillants (12 DPS).',
        stats: { bastionMaxHp: 1050, heroHealRate: 45, maxSurvivors: 16, passiveAuraRange: 22, auraBurnDps: 12 },
      },
    ],
  }),
  createBilingualBuilding({
    id: 'watchtower',
    nameEN: 'Watchtower',
    nameFR: 'Tour de Guet',
    shortNameEN: 'Watchtower',
    shortNameFR: 'Tour de Guet',
    icon: '🏹',
    hotkey: 'F1',
    padPos: { x: 8.5, z: -7.5 },
    interactRadius: 4.5,
    initialLevel: 0,
    maxLevel: 3,
    colorHex: 0xe6a145,
    colorCss: '#e6a145',
    descriptionEN:
      'Automated defensive turret built in the North-East of the camp. Protects the Bastion against raids and famine migrations during your expeditions.',
    descriptionFR:
      'Tourelle défensive automatique érigée au Nord-Est du camp. Protège le Bastion contre les raids et les migrations de famine pendant vos expéditions.',
    tiersBilingual: [
      {
        level: 1,
        tierNameEN: 'Archer Tower (Lvl 1)',
        tierNameFR: 'Tour d’Archer (Niv. 1)',
        cost: { wood: 25, crystal: 10, biomass: 0 },
        effectDescEN: 'Auto-fire (18 dmg / 1.35s, 34m range) against nearby enemies.',
        effectDescFR: 'Tir automatique (18 dégâts / 1.35s, portée 34m) sur les ennemis proches.',
        stats: { damage: 18, fireInterval: 1.35, range: 34, boltsCount: 1, mutantDamageMult: 1.0, slowOnHit: 0 },
      },
      {
        level: 2,
        tierNameEN: 'Cryogenic Twin Ballista (Lvl 2)',
        tierNameFR: 'Baliste Double Cryogénique (Niv. 2)',
        cost: { wood: 40, crystal: 20, biomass: 10 },
        effectDescEN: 'Fires 2 frost bolts (30 dmg / 1.15s, 40m range) slowing targets by 35%.',
        effectDescFR: 'Tire 2 carreaux givrants (30 dégâts / 1.15s, portée 40m) qui ralentissent les cibles de 35%.',
        stats: { damage: 30, fireInterval: 1.15, range: 40, boltsCount: 2, mutantDamageMult: 1.25, slowOnHit: 0.35 },
      },
      {
        level: 3,
        tierNameEN: 'Anti-Mutant Pyrophage Tower (Lvl 3)',
        tierNameFR: 'Tour Pyrophage Anti-Mutants (Niv. 3)',
        cost: { wood: 65, crystal: 35, biomass: 25 },
        effectDescEN: 'Runic artillery (48 dmg / 0.95s, 46m range) dealing +100% damage to Mutants & Hybrids!',
        effectDescFR: 'Artillerie runique (48 dégâts / 0.95s, portée 46m) infligeant +100% de dégâts aux Mutants et Hybrides !',
        stats: { damage: 48, fireInterval: 0.95, range: 46, boltsCount: 3, mutantDamageMult: 2.0, slowOnHit: 0.45 },
      },
    ],
  }),
  createBilingualBuilding({
    id: 'scout_guild',
    nameEN: 'Scout Guild',
    nameFR: 'Guilde des Éclaireurs',
    shortNameEN: 'Scout Guild',
    shortNameFR: 'Guilde Éclaireurs',
    icon: '🦅',
    hotkey: 'F2',
    padPos: { x: -8.5, z: -7.5 },
    interactRadius: 4.5,
    initialLevel: 0,
    maxLevel: 3,
    colorHex: 0x1e90ff,
    colorCss: '#1e90ff',
    descriptionEN:
      'Cartographic command post in the North-West. Allows issuing targeted Mission Orders to Scouts and boosts their expedition speed and detection range.',
    descriptionFR:
      'Poste de commandement cartographique au Nord-Ouest. Permet de donner des Ordres de Mission précis aux Éclaireurs et augmente leur vitesse et portée de détection.',
    tiersBilingual: [
      {
        level: 1,
        tierNameEN: 'Falconry Post (Lvl 1)',
        tierNameFR: 'Poste de Fauconnerie (Niv. 1)',
        cost: { wood: 20, crystal: 15, biomass: 0 },
        effectDescEN: '+30% Scout vision range (44m), +25% expedition speed & targeted Scout Missions.',
        effectDescFR: '+30% portée de vision des Éclaireurs (44m), +25% vitesse d’expédition et Missions Ciblées optimisées.',
        stats: { visionMult: 1.3, speedMult: 1.25, slowBeaconOnPatientZero: false, bonusScoutsOnBuild: 1 },
      },
      {
        level: 2,
        tierNameEN: 'Lineage Observatory (Lvl 2)',
        tierNameFR: 'Observatoire des Lignées (Niv. 2)',
        cost: { wood: 35, crystal: 25, biomass: 12 },
        effectDescEN: '+60% vision (54m), +45% speed, and Scouts plant a Slowing Beacon (-35% speed) on every spotted Patient Zero!',
        effectDescFR: '+60% vision (54m), +45% vitesse, et les Éclaireurs posent une Balise Ralentissante (-35% vitesse) sur chaque Patient Zéro repéré !',
        stats: { visionMult: 1.6, speedMult: 1.45, slowBeaconOnPatientZero: true, slowBeaconFactor: 0.65, bonusScoutsOnBuild: 0 },
      },
      {
        level: 3,
        tierNameEN: 'Omniscient Telescopic Network (Lvl 3)',
        tierNameFR: 'Réseau Téléscopique Omniscient (Niv. 3)',
        cost: { wood: 55, crystal: 40, biomass: 25 },
        effectDescEN: '+95% vision (66m), +70% speed, fleeing Scout immunity, and instant marking of newborn mutants!',
        effectDescFR: '+95% vision (66m), +70% vitesse, immunité des Éclaireurs en fuite et marquage instantané des nouveau-nés mutants !',
        stats: { visionMult: 1.95, speedMult: 1.7, slowBeaconOnPatientZero: true, slowBeaconFactor: 0.5, autoSpotNewbornMutants: true },
      },
    ],
  }),
  createBilingualBuilding({
    id: 'lumber_forge',
    legacyId: 'palisade',
    nameEN: 'Runic Workshop & Palisade',
    nameFR: 'Atelier & Palissade Runique',
    shortNameEN: 'Workshop & Ramparts',
    shortNameFR: 'Atelier & Remparts',
    icon: '🛡️',
    hotkey: 'F3',
    padPos: { x: 8.5, z: 7.5 },
    interactRadius: 4.5,
    initialLevel: 0,
    maxLevel: 3,
    colorHex: 0x38c172,
    colorCss: '#38c172',
    descriptionEN:
      'Alchemical sawmill and thorn ramparts in the South-East. Passively generates Wood and Crystal every 5s and reflects damage to starving hordes.',
    descriptionFR:
      'Scierie alchimique et remparts d’épines au Sud-Est. Génère passivement du Bois et du Cristal toutes les 5s et renvoie les dégâts aux hordes affamées.',
    tiersBilingual: [
      {
        level: 1,
        tierNameEN: 'Thorn Palisade & Sawmill (Lvl 1)',
        tierNameFR: 'Palissade d’Épines & Scierie (Niv. 1)',
        cost: { wood: 30, crystal: 5, biomass: 0 },
        effectDescEN: '+180 Bastion HP, reflects 10 thorn damage to attackers, and produces +2 Wood / +1 Crystal every 5s.',
        effectDescFR: '+180 PV au Bastion, renvoie 10 dégâts d’épines aux assaillants et produit +2 Bois / +1 Cristal toutes les 5s.',
        stats: { hpBonus: 180, thornsDamage: 10, woodPer5Sec: 2, crystalPer5Sec: 1 },
      },
      {
        level: 2,
        tierNameEN: 'Ironclad Rampart & Forge (Lvl 2)',
        tierNameFR: 'Rempart Ferré & Forge (Niv. 2)',
        cost: { wood: 45, crystal: 20, biomass: 10 },
        effectDescEN: '+380 Bastion HP, reflects 22 thorn damage, and produces +4 Wood / +3 Crystal every 5s.',
        effectDescFR: '+380 PV au Bastion, renvoie 22 dégâts d’épines et produit +4 Bois / +3 Cristal toutes les 5s.',
        stats: { hpBonus: 380, thornsDamage: 22, woodPer5Sec: 4, crystalPer5Sec: 3 },
      },
      {
        level: 3,
        tierNameEN: 'Automated Obsidian Bastion (Lvl 3)',
        tierNameFR: 'Bastion d’Obsidienne Automatisé (Niv. 3)',
        cost: { wood: 70, crystal: 35, biomass: 20 },
        effectDescEN: '+650 Bastion HP, reflects 38 thorn damage, and produces +7 Wood / +5 Crystal / +2 Biomass every 5s.',
        effectDescFR: '+650 PV au Bastion, renvoie 38 dégâts d’épines et produit +7 Bois / +5 Cristal / +2 Biomasse toutes les 5s.',
        stats: { hpBonus: 650, thornsDamage: 38, woodPer5Sec: 7, crystalPer5Sec: 5, biomassPer5Sec: 2 },
      },
    ],
  }),
  createBilingualBuilding({
    id: 'biolab',
    nameEN: 'Genetic Bio-Laboratory',
    nameFR: 'Bio-Laboratoire Génétique',
    shortNameEN: 'Bio-Laboratory',
    shortNameFR: 'Bio-Laboratoire',
    icon: '🧬',
    hotkey: 'F4',
    padPos: { x: -8.5, z: 7.5 },
    interactRadius: 4.5,
    initialLevel: 0,
    maxLevel: 3,
    colorHex: 0x00d2d3,
    colorCss: '#00d2d3',
    descriptionEN:
      'Darwinian laboratory in the South-West. Analyzes creature genomes, slows the maturation of mutant Babies across the island, and boosts your damage against mutant lineages.',
    descriptionFR:
      'Laboratoire darwinien au Sud-Ouest. Analyse le génome des créatures, ralentit la croissance des Bébés mutants sur l’île et augmente vos dégâts contre les lignées.',
    tiersBilingual: [
      {
        level: 1,
        tierNameEN: 'Genome Sequencer (Lvl 1)',
        tierNameFR: 'Séquenceur de Génome (Niv. 1)',
        cost: { wood: 20, crystal: 20, biomass: 0 },
        effectDescEN: '+15% Hero damage vs Mutants/Hybrids and slows mutant Baby maturation by 20% (+5s window to slay them!).',
        effectDescFR: '+15% dégâts du Héros contre les Mutants/Hybrides et ralentit de 20% la maturation des Bébés mutants (+5s pour les tuer !).',
        stats: { heroMutantDamageBonus: 0.15, babyMaturationSlowMult: 1.2, scoutVisionBonus: 12 },
      },
      {
        level: 2,
        tierNameEN: 'Dominance Inhibitor (Lvl 2)',
        tierNameFR: 'Inhibiteur de Dominance (Niv. 2)',
        cost: { wood: 35, crystal: 30, biomass: 15 },
        effectDescEN: '+30% damage vs Mutants, slows mutant Baby maturation by 40%, and reduces enemy Mendelian inheritance.',
        effectDescFR: '+30% dégâts contre les Mutants, ralentit de 40% la maturation des Bébés mutants et réduit la transmission mendélienne ennemie.',
        stats: { heroMutantDamageBonus: 0.3, babyMaturationSlowMult: 1.4, scoutVisionBonus: 22 },
      },
      {
        level: 3,
        tierNameEN: 'Genetic Eradication Sanctuary (Lvl 3)',
        tierNameFR: 'Sanctuaire d’Éradication Génétique (Niv. 3)',
        cost: { wood: 55, crystal: 45, biomass: 30 },
        effectDescEN: '+50% damage vs Mutants, slows mutant Baby maturation by 60%, and +50% XP/Biomass from every Patient Zero!',
        effectDescFR: '+50% dégâts contre les Mutants, ralentit de 60% la maturation des Bébés mutants et +50% XP/Biomasse sur chaque Patient Zéro !',
        stats: { heroMutantDamageBonus: 0.5, babyMaturationSlowMult: 1.6, scoutVisionBonus: 34, bonusMutantXpMult: 1.5 },
      },
    ],
  }),
];

/**
 * Dictionary of buildings by `id` (including `'palisade'` -> `'lumber_forge'`).
 */
export const BASTION_BUILDINGS_BY_ID = Object.freeze(
  BASTION_BUILDINGS_CATALOG.reduce((acc, b) => {
    acc[b.id] = b;
    if (b.legacyId) acc[b.legacyId] = b;
    return acc;
  }, {})
);

/**
 * Returns the localized upgrade specification for a Bastion building at `currentLevel`.
 *
 * @param {string} buildingId
 * @param {number} [currentLevel=0]
 * @returns {object}
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

  const actionVerb =
    lvl === 0
      ? tr('Build', 'Construire')
      : isMaxed
        ? tr('Max Level', 'Niveau Max')
        : tr(`Upgrade Lvl ${nextLevel}`, `Améliorer Niv. ${nextLevel}`);

  const costParts = [];
  if (cost.wood > 0) costParts.push(`${cost.wood} ${tr('Wood', 'Bois')}`);
  if (cost.crystal > 0) costParts.push(`${cost.crystal} ${tr('Crystal', 'Cristal')}`);
  if (cost.biomass > 0) costParts.push(`${cost.biomass} ${tr('Biomass', 'Biomasse')}`);
  const costText = isMaxed ? 'MAX' : costParts.length > 0 ? costParts.join(' • ') : tr('Free', 'Gratuit');

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
    currentTierName: currentTier ? currentTier.tierName : tr('Empty Pad (Lvl 0)', 'Chantier Vierge (Niv. 0)'),
    nextTierName: nextTier ? nextTier.tierName : tr('Maximum Level', 'Niveau Maximum'),
    currentEffectDesc: currentTier
      ? currentTier.effectDesc
      : tr(
          'Not built yet — Approach the pad [E] or click to build.',
          'Non construit — Approchez-vous du socle [E] ou cliquez pour bâtir.'
        ),
    nextEffectDesc: nextTier ? nextTier.effectDesc : tr('Maximum upgrade reached.', 'Amélioration maximale atteinte.'),
    levelDesc: currentTier ? currentTier.effectDesc : nextTier ? nextTier.effectDesc : def.description,
    statsAtCurrent: currentTier ? { ...currentTier.stats } : null,
    statsAtNext: nextTier ? { ...nextTier.stats } : null,
    worldPromptText: isMaxed
      ? `${def.icon} ${def.name} (${tr('Lvl MAX', 'Niv. MAX')})`
      : `[E] ${actionVerb}: ${def.name} (${costText})`,
  };
}

/**
 * Checks if the player can afford a building construction or upgrade.
 *
 * @param {string} buildingId
 * @param {number} [currentLevel=0]
 * @param {object} [resources={}]
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
 * Catalog of the 4 Scout Mission Orders (Bilingual EN default / FR 2nd).
 */
export const SCOUT_MISSIONS_CATALOG = [
  {
    id: 'track_lineage',
    nameEN: 'Track Mutant Lineage',
    nameFR: 'Traquer la Lignée Mutante',
    shortLabelEN: '🔍 Track Lineage',
    shortLabelFR: '🔍 Traquer Lignée',
    get name() {
      return tr(this.nameEN, this.nameFR);
    },
    get shortLabel() {
      return tr(this.shortLabelEN, this.shortLabelFR);
    },
    icon: '🔍',
    colorHex: 0xff4757,
    colorCss: '#ff4757',
    speedBonusMult: 1.45,
    descriptionEN:
      'Your Scouts prioritize locating all carriers (Babies and Adults) of the targeted mutation (e.g., Fire Trolls) and mark them with a 3D sky beam.',
    descriptionFR:
      'Vos Éclaireurs recherchent en priorité absolue tous les individus (Bébés et Adultes) porteurs de la mutation ciblée (ex: Trolls de Feu) et les marquent d’un faisceau céleste 3D.',
    get description() {
      return tr(this.descriptionEN, this.descriptionFR);
    },
  },
  {
    id: 'find_cages',
    nameEN: 'Rescue Caged Survivors',
    nameFR: 'Secourir les Survivants en Cage',
    shortLabelEN: '⛓️ Find Cages',
    shortLabelFR: '⛓️ Chercher Cages',
    get name() {
      return tr(this.nameEN, this.nameFR);
    },
    get shortLabel() {
      return tr(this.shortLabelEN, this.shortLabelFR);
    },
    icon: '⛓️',
    colorHex: 0xffd166,
    colorCss: '#ffd166',
    speedBonusMult: 1.3,
    descriptionEN:
      'Your Scouts patrol toward locked Prisoner Cages to reveal their exact coordinates on your Minimap.',
    descriptionFR:
      'Vos Éclaireurs patrouillent vers les Cages de Prisonniers non libérées pour révéler leur position exacte sur votre Minimap.',
    get description() {
      return tr(this.descriptionEN, this.descriptionFR);
    },
  },
  {
    id: 'scout_volcano',
    nameEN: 'Scout Caldera & Deep Wilds',
    nameFR: 'Explorer la Caldeira & Terres Sauvages',
    shortLabelEN: '🌋 Deep Exploration',
    shortLabelFR: '🌋 Exploration Profonde',
    get name() {
      return tr(this.nameEN, this.nameFR);
    },
    get shortLabel() {
      return tr(this.shortLabelEN, this.shortLabelFR);
    },
    icon: '🌋',
    colorHex: 0x1e90ff,
    colorCss: '#1e90ff',
    speedBonusMult: 1.2,
    descriptionEN:
      'Deep wilderness expedition (50m to 108m) into the Volcanic Caldera and ancient forests to spot emerging threats early.',
    descriptionFR:
      'Expédition au-delà de la frontière (50m à 108m) dans la Caldeira Volcanique et les forêts profondes pour anticiper toute nouvelle émergence.',
    get description() {
      return tr(this.descriptionEN, this.descriptionFR);
    },
  },
  {
    id: 'perimeter_alert',
    nameEN: 'Anti-Horde Frontier Watch',
    nameFR: 'Vigilance Frontière Anti-Hordes',
    shortLabelEN: '🛡️ Frontier Watch',
    shortLabelFR: '🛡️ Garde Frontière',
    get name() {
      return tr(this.nameEN, this.nameFR);
    },
    get shortLabel() {
      return tr(this.shortLabelEN, this.shortLabelFR);
    },
    icon: '🛡️',
    colorHex: 0x38c172,
    colorCss: '#38c172',
    speedBonusMult: 1.15,
    descriptionEN:
      'Circular patrol around the Bastion (35m to 58m) to detect starving packs migrating toward your ramparts.',
    descriptionFR:
      'Patrouille circulaire autour du Bastion (35m à 58m) pour repérer les meutes en famine qui migrent vers vos remparts.',
    get description() {
      return tr(this.descriptionEN, this.descriptionFR);
    },
  },
];

/**
 * Dictionary of Scout Missions by `id`.
 */
export const SCOUT_MISSIONS_BY_ID = Object.freeze(
  SCOUT_MISSIONS_CATALOG.reduce((acc, m) => {
    acc[m.id] = m;
    return acc;
  }, {})
);

/**
 * Returns localized mutation label (`'en'` default or `'fr'`).
 * @param {string|null} mutationId
 * @returns {string}
 */
function getLocalizedMutationLabel(mutationId) {
  if (!mutationId) return tr('All Mutations', 'Toutes les Mutations');
  const mapEN = {
    pyro_gland: 'Pyro / Fire',
    venom_sacs: 'Venom / Poison',
    osteo_plating: 'Osteo Armor',
    winged_leap: 'Winged Leap',
    cryo_blood: 'Cryo / Frost',
    vampiric_maw: 'Vampirism',
    titan_growth: 'Titan / Giant',
    amphibious_lungs: 'Amphibious Walker',
  };
  const mutDef = CONFIG.MUTATIONS?.[mutationId];
  const frLabel = mutDef?.shortLabel || mutDef?.name || mutationId;
  const enLabel = mapEN[mutationId] || translateString(frLabel, 'en');
  return tr(enLabel, frLabel);
}

/**
 * Returns formatted details of a Scout Mission in the active language.
 *
 * @param {string} [missionType='track_lineage']
 * @param {string|null} [targetMutationId='pyro_gland']
 * @returns {object}
 */
export function getScoutMissionSpec(missionType = 'track_lineage', targetMutationId = 'pyro_gland') {
  const base = SCOUT_MISSIONS_BY_ID[missionType] || SCOUT_MISSIONS_CATALOG[0];
  const targetLabel = getLocalizedMutationLabel(targetMutationId);

  const fullTitle =
    base.id === 'track_lineage'
      ? tr(`🔍 Scout Mission: Track [${targetLabel}]`, `🔍 Mission Éclaireurs : Traquer [${targetLabel}]`)
      : tr(`${base.icon} Scout Mission: ${base.name}`, `${base.icon} Mission Éclaireurs : ${base.name}`);

  return {
    ...base,
    name: base.name,
    shortLabel: base.shortLabel,
    description: base.description,
    type: base.id,
    targetMutationId: base.id === 'track_lineage' ? targetMutationId || 'pyro_gland' : null,
    targetLabel,
    fullTitle,
  };
}

/**
 * Dynamic Lineage Eradication & Bastion Architecture Quest System (`DynamicQuestSystem`).
 */
export class DynamicQuestSystem {
  constructor() {
    /** @type {Array<object>} Active quests */
    this.activeQuests = [];
    /** @type {Array<object>} Completed quests */
    this.completedQuests = [];
    /** @type {Array<object>} Pending rewards */
    this.pendingRewards = [];
    /** @type {number} Monotonic quest sequence ID */
    this.nextQuestSeq = 1;

    this.startLineageEradicationQuest('pyro_gland', 'troll');
    this.startBaseUpgradeQuest();
  }

  /**
   * Resets all dynamic quests for a new Roguelike run ("Restart from Zero").
   */
  resetForNewRoguelikeRun() {
    this.activeQuests = [];
    this.completedQuests = [];
    this.pendingRewards = [];
    this.nextQuestSeq = 1;
    this.startLineageEradicationQuest('pyro_gland', 'troll');
    this.startBaseUpgradeQuest();
  }

  /**
   * Alias of `resetForNewRoguelikeRun()`.
   */
  reset() {
    this.resetForNewRoguelikeRun();
  }

  /**
   * Refreshes localized quest titles and step descriptions according to `getLanguage()`.
   * @param {object} quest
   */
  _refreshQuestLocalization(quest) {
    if (!quest) return quest;
    if (quest.type === 'eradicate_lineage') {
      const mutId = quest.targetMutationId || 'pyro_gland';
      const mutLabel = getLocalizedMutationLabel(mutId);
      const spDef = CONFIG.SPECIES?.[quest.speciesHint] || CONFIG.SPECIES?.troll;
      const spName = translateString(spDef?.name || 'Mutants', getLanguage());
      const lineageDisplayName =
        mutId === 'pyro_gland' && quest.speciesHint === 'troll'
          ? tr('Fire Trolls (Pyroclastic Gland)', 'Trolls de Feu (Glande Pyroclastique)')
          : tr(`[${mutLabel}] Carriers (${spName})`, `Porteurs de [${mutLabel}] (${spName})`);

      quest.title = tr(
        `📜 Operation: Eradication — ${lineageDisplayName}`,
        `📜 Opération : Éradication — ${lineageDisplayName}`
      );
      quest.shortTitle = tr(`Eradicate: ${lineageDisplayName}`, `Éradiquer : ${lineageDisplayName}`);

      const totalCarriers = quest.totalCarriers ?? 1;
      const spottedCarriers = quest.spottedCarriers ?? 0;
      const unspottedCarriers = quest.unspottedCarriers ?? 1;
      const babyCarriers = quest.babyCarriers ?? 0;
      const allCurrentlySpotted = totalCarriers > 0 && spottedCarriers >= totalCarriers;

      quest.step1Text = allCurrentlySpotted
        ? tr(
            `✅ 1. Scouts: All [${mutLabel}] carriers located (${spottedCarriers}/${totalCarriers})!`,
            `✅ 1. Éclaireurs : Tous les porteurs [${mutLabel}] sont localisés (${spottedCarriers}/${totalCarriers}) !`
          )
        : tr(
            `🔍 1. Scouts: Locate all [${mutLabel}] carriers (${spottedCarriers}/${Math.max(1, totalCarriers)} spotted)`,
            `🔍 1. Éclaireurs : Localiser tous les porteurs [${mutLabel}] (${spottedCarriers}/${Math.max(1, totalCarriers)} repérés)`
          );

      const babyWarn =
        babyCarriers > 0
          ? tr(` incl. ${babyCarriers} Baby!`, ` dont ${babyCarriers} Bébé(s) !`)
          : '';
      quest.step2Text =
        totalCarriers === 0 && quest.slainCount > 0
          ? tr(
              `✅ 2. Extermination: [${mutLabel}] lineage eradicated (${quest.slainCount} slain)!`,
              `✅ 2. Extermination : Lignée [${mutLabel}] éradiquée (${quest.slainCount} éliminés) !`
            )
          : tr(
              `⚔️ 2. Extermination: Eliminate all [${mutLabel}] (${totalCarriers} remaining${babyWarn} • ${quest.slainCount || 0} slain)`,
              `⚔️ 2. Extermination : Éliminer tous les [${mutLabel}] (${totalCarriers} restant(s)${babyWarn} • ${quest.slainCount || 0} tué(s))`
            );

      if (!quest.scoutMissionAssigned && unspottedCarriers > 0) {
        quest.actionHint = tr(
          `💡 Order Scouts to "🔍 Track [${mutLabel}]" to reveal the ${unspottedCarriers} hidden carrier(s)!`,
          `💡 Ordonnez aux Éclaireurs « 🔍 Traquer [${mutLabel}] » pour révéler les ${unspottedCarriers} porteur(s) caché(s) !`
        );
      } else if (unspottedCarriers > 0) {
        quest.actionHint = tr(
          `🦅 Your Scouts are tracking the ${unspottedCarriers} remaining [${mutLabel}] carrier(s) in the wilds...`,
          `🦅 Vos Éclaireurs traquent les ${unspottedCarriers} porteur(s) [${mutLabel}] restant(s) dans les terres sauvages...`
        );
      } else if (totalCarriers > 0) {
        quest.actionHint = tr(
          `🎯 All [${mutLabel}] carriers are locked on the Minimap! Strike them down before the next Eco-Tick!`,
          `🎯 Tous les [${mutLabel}] sont verrouillés sur la Minimap ! Foncez les éliminer avant le prochain Eco-Tick !`
        );
      }
    } else if (quest.type === 'upgrade_bastion') {
      const builtCount = quest.buildingsConstructed ?? 0;
      const maxLvl = quest.highestUpgradeLevel ?? 1;
      const step1Done = builtCount >= quest.targetBuildingsCount;
      const step2Done = maxLvl >= quest.targetUpgradeLevel;

      quest.title = tr(
        '🏰 Bastion Architecture: Build & Upgrade the Sanctuary',
        '🏰 Architecture du Bastion : Bâtir & Améliorer le Sanctuaire'
      );
      quest.shortTitle = tr(
        'Expand the Bastion (Pads [E] or [H])',
        'Développer le Bastion (Chantiers [E] ou [H])'
      );
      quest.step1Text = tr(
        `${step1Done ? '✅' : '🔨'} 1. Build ${quest.targetBuildingsCount} buildings at the Bastion (${builtCount}/${quest.targetBuildingsCount})`,
        `${step1Done ? '✅' : '🔨'} 1. Construire ${quest.targetBuildingsCount} bâtiments au Bastion (${builtCount}/${quest.targetBuildingsCount})`
      );
      quest.step2Text = tr(
        `${step2Done ? '✅' : '⬆️'} 2. Upgrade a building to Level ${quest.targetUpgradeLevel} (Current max: Lvl ${maxLvl})`,
        `${step2Done ? '✅' : '⬆️'} 2. Améliorer un bâtiment au Niveau ${quest.targetUpgradeLevel} (Max actuel : Niv. ${maxLvl})`
      );
      quest.actionHint = tr(
        'Approach a golden pad around the campfire and press [E] (or open [H]) to upgrade your Base!',
        'Approchez-vous d’un socle doré autour du feu de camp et appuyez sur [E] (ou ouvrez [H]) pour améliorer la Base !'
      );
    }
    return quest;
  }

  /**
   * Starts (or prioritizes) a dynamic lineage eradication quest.
   *
   * @param {string} [mutationId='pyro_gland']
   * @param {string} [speciesHint='troll']
   * @returns {object}
   */
  startLineageEradicationQuest(mutationId = 'pyro_gland', speciesHint = 'troll') {
    const existing = this.activeQuests.find(
      (q) => q.type === 'eradicate_lineage' && q.targetMutationId === mutationId && !q.completed
    );
    if (existing) {
      this._refreshQuestLocalization(existing);
      this.activeQuests = [existing, ...this.activeQuests.filter((q) => q.id !== existing.id)];
      return existing;
    }

    const mutDef = CONFIG.MUTATIONS?.[mutationId] || CONFIG.MUTATIONS?.pyro_gland;
    const quest = {
      id: `quest_lineage_${mutationId}_${this.nextQuestSeq++}`,
      type: 'eradicate_lineage',
      targetMutationId: mutationId,
      speciesHint,
      title: '',
      shortTitle: '',
      icon: '🎯',
      colorCss: mutDef?.colorCss || '#ff4757',
      colorHex: mutDef?.colorHex || 0xff4757,
      phase: 1,
      totalCarriers: 1,
      spottedCarriers: 0,
      unspottedCarriers: 1,
      babyCarriers: 0,
      slainCount: 0,
      peakCarriersSeen: 1,
      scoutMissionAssigned: false,
      completed: false,
      step1Text: '',
      step2Text: '',
      actionHint: '',
      rewards: {
        wood: 45,
        crystal: 35,
        biomass: 30,
        xp: 120,
      },
    };

    this._refreshQuestLocalization(quest);
    this.activeQuests.unshift(quest);
    logger.info('QUEST', `New quest started: ${quest.title}`, {
      questId: quest.id,
      targetMutationId: mutationId,
    });
    return quest;
  }

  /**
   * Starts the Bastion development quest.
   *
   * @returns {object}
   */
  startBaseUpgradeQuest() {
    const existing = this.activeQuests.find((q) => q.type === 'upgrade_bastion' && !q.completed);
    if (existing) return this._refreshQuestLocalization(existing);

    const quest = {
      id: `quest_bastion_upgrade_${this.nextQuestSeq++}`,
      type: 'upgrade_bastion',
      title: '',
      shortTitle: '',
      icon: '🏰',
      colorCss: '#e6a145',
      colorHex: 0xe6a145,
      buildingsConstructed: 0,
      targetBuildingsCount: 2,
      highestUpgradeLevel: 1,
      targetUpgradeLevel: 2,
      completed: false,
      step1Text: '',
      step2Text: '',
      actionHint: '',
      rewards: {
        wood: 40,
        crystal: 30,
        biomass: 20,
        xp: 100,
      },
    };

    this._refreshQuestLocalization(quest);
    this.activeQuests.push(quest);
    return quest;
  }

  /**
   * Records an enemy kill to update active quest counters.
   *
   * @param {object} enemy
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
   * Updates all active quests from live enemy population, building levels, and scout missions.
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

        this._refreshQuestLocalization(quest);

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

        this._refreshQuestLocalization(quest);

        if (step1Done && step2Done) {
          this._completeQuest(quest);
        }
      }
    }

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
   * Marks a quest as completed and queues its reward notification.
   * @param {object} quest
   */
  _completeQuest(quest) {
    if (quest.completed) return;
    quest.completed = true;
    this._refreshQuestLocalization(quest);
    this.completedQuests.push(quest);
    this.activeQuests = this.activeQuests.filter((q) => q.id !== quest.id);

    const rewardEntry = {
      questId: quest.id,
      title: tr(
        `🏆 QUEST COMPLETED: ${quest.shortTitle}`,
        `🏆 QUÊTE ACCOMPLIE : ${quest.shortTitle}`
      ),
      subtitle: tr(
        `Reward: +${quest.rewards.wood} Wood, +${quest.rewards.crystal} Crystal, +${quest.rewards.biomass} Biomass & +${quest.rewards.xp} XP!`,
        `Récompense : +${quest.rewards.wood} Bois, +${quest.rewards.crystal} Cristal, +${quest.rewards.biomass} Biomasse & +${quest.rewards.xp} XP !`
      ),
      rewards: { ...quest.rewards },
      colorCss: quest.colorCss,
      colorHex: quest.colorHex,
    };
    this.pendingRewards.push(rewardEntry);
    logger.evolution(rewardEntry.title, rewardEntry);
  }

  /**
   * Consumes and returns recently completed quest rewards.
   * @returns {Array<object>}
   */
  consumePendingRewards() {
    if (this.pendingRewards.length === 0) return [];
    const copy = [...this.pendingRewards];
    this.pendingRewards.length = 0;
    return copy;
  }

  /**
   * Returns the primary active quest and all active quests for the HUD, localized in the active language.
   * @returns {{ primaryQuest: object|null, activeQuests: Array<object>, completedCount: number }}
   */
  getQuestsSummaryForHUD() {
    for (const q of this.activeQuests) {
      this._refreshQuestLocalization(q);
    }
    return {
      primaryQuest: this.activeQuests[0] || null,
      activeQuests: [...this.activeQuests],
      completedCount: this.completedQuests.length,
    };
  }

  /**
   * Alias of `getQuestsSummaryForHUD()`.
   */
  getHUDState() {
    return this.getQuestsSummaryForHUD();
  }
}

/**
 * English localization metadata for the 5 Legendary Elemental Weapons.
 */
const ELEMENTAL_WEAPONS_EN_META = {
  runic_steel: {
    nameEN: 'Bastion Runic Greatsword',
    shortNameEN: 'Runic Greatsword',
    descriptionEN:
      'Standard runic steel blade forged at the Sanctuary. Balanced, without elemental affinity.',
    passiveSummaryEN: 'Balanced starter weapon (Damage ×1.00, Range ×1.00).',
  },
  fire_greatsword: {
    nameEN: 'Solar Blade of Ignis',
    shortNameEN: 'Fire Blade',
    descriptionEN:
      '+12% cleave damage, ignites targets (8 DPS for 3.5s), triggers a solar detonation on kill, and deals +15% damage vs Wild Beasts & Giant Moles.',
    passiveSummaryEN:
      '🔥 +12% Damage • Burn (8 DPS/3.5s) • Solar blast on kill • +15% vs Beasts & Moles',
  },
  ice_greatsword: {
    nameEN: 'Frost Greatsword of Boreas',
    shortNameEN: 'Ice Weapon',
    descriptionEN:
      '+10% damage and +12% cleave range, inflicts Frost (-35% speed for 3.5s), shatters Osteo-Dermal Plating, and deals +15% damage vs Pyro Mutants & Land Sharks.',
    passiveSummaryEN:
      '❄️ +10% Damage • +12% Range • Frost (-35% speed) • Armor-Shatter • +15% vs Fire Mutants & Sharks',
  },
  lightning_greatsword: {
    nameEN: 'Thunder Glaive of Aether',
    shortNameEN: 'Lightning Weapon',
    descriptionEN:
      '+10% damage, +12% attack speed, and +8% move speed. Every strike chains lightning across 3 nearby enemies (12 dmg) and deals +15% damage vs Greenskins & Amphibians.',
    passiveSummaryEN:
      '⚡ +10% Damage • +12% Atk Speed • +8% Move Speed • Chain Lightning (12 dmg) • +15% vs Goblins/Orcs',
  },
  venom_greatsword: {
    nameEN: 'Symbiotic Emerald Scythe',
    shortNameEN: 'Venom & Biomass Weapon',
    descriptionEN:
      '+10% damage, inflicts Corrosive Venom (7 DPS, -15% enemy damage), grants 8% Lifesteal, AUTOMATICALLY SPARES Herbivore Prey (0 damage to Deer/Rabbits!), and harvests +1 Biomass per kill.',
    passiveSummaryEN:
      '🧪 +10% Damage • 8% Lifesteal • Venom (7 DPS) • Prey Immunity (Spares Deer/Rabbits) • +1 Biomass/kill',
  },
};

/**
 * Wraps a raw weapon config entry with bilingual getters (`name`, `shortName`, `description`, `passiveSummary`, `passiveSummaryFR`).
 * @param {object} rawWeapon
 * @returns {object}
 */
function createBilingualWeaponSpec(rawWeapon) {
  const enMeta = ELEMENTAL_WEAPONS_EN_META[rawWeapon.id] || {};
  const nameFR = rawWeapon.name;
  const shortNameFR = rawWeapon.shortName;
  const descriptionFR = rawWeapon.description;
  const passiveSummaryFR = rawWeapon.passiveSummaryFR;

  return {
    ...rawWeapon,
    nameEN: enMeta.nameEN || nameFR,
    nameFR,
    shortNameEN: enMeta.shortNameEN || shortNameFR,
    shortNameFR,
    descriptionEN: enMeta.descriptionEN || descriptionFR,
    descriptionFR,
    passiveSummaryEN: enMeta.passiveSummaryEN || passiveSummaryFR,
    get name() {
      return tr(this.nameEN, this.nameFR);
    },
    get shortName() {
      return tr(this.shortNameEN, this.shortNameFR);
    },
    get description() {
      return tr(this.descriptionEN, this.descriptionFR);
    },
    get passiveSummary() {
      return tr(this.passiveSummaryEN, passiveSummaryFR);
    },
    get passiveSummaryFR() {
      return tr(this.passiveSummaryEN, passiveSummaryFR);
    },
  };
}

/**
 * Complete catalog of Legendary Elemental Weapons (bilingual EN default / FR 2nd).
 */
export const ELEMENTAL_WEAPONS_CATALOG = Object.values(CONFIG.ELEMENTAL_WEAPONS || {}).map(
  createBilingualWeaponSpec
);

/**
 * Fast lookup of Elemental Weapons by `id`.
 */
export const ELEMENTAL_WEAPONS_BY_ID = Object.fromEntries(
  ELEMENTAL_WEAPONS_CATALOG.map((w) => [w.id, w])
);

/**
 * Returns the complete localized specification of an Elemental Weapon by `weaponId`.
 *
 * @param {string} [weaponId='runic_steel']
 * @returns {object}
 */
export function getElementalWeaponSpec(weaponId = 'runic_steel') {
  return (
    ELEMENTAL_WEAPONS_BY_ID[weaponId] ||
    ELEMENTAL_WEAPONS_BY_ID.runic_steel ||
    ELEMENTAL_WEAPONS_CATALOG[0]
  );
}

/**
 * Returns all Elemental Weapon specifications localized in the active language.
 *
 * @returns {Array<object>}
 */
export function getAllElementalWeaponSpecs() {
  return ELEMENTAL_WEAPONS_CATALOG;
}

/**
 * Specification of the 3 Eden Relic Fragments and the Planetary Island Shield Dome (`RELIC_FRAGMENTS_SPEC`).
 */
export const RELIC_FRAGMENTS_SPEC = {
  requiredCount: CONFIG.RELIC_FRAGMENTS?.REQUIRED_COUNT ?? 3,
  shieldDomeRadius: CONFIG.RELIC_FRAGMENTS?.SHIELD_DOME_RADIUS ?? 115,
  fragmentRewardXp: CONFIG.RELIC_FRAGMENTS?.FRAGMENT_REWARD_XP ?? 50,
  fragmentRewardCrystal: CONFIG.RELIC_FRAGMENTS?.FRAGMENT_REWARD_CRYSTAL ?? 15,
  shrines: [
    {
      id: 'relic_dawn_north',
      index: 1,
      nameEN: 'Fragment of Dawn (North)',
      nameFR: 'Fragment d’Aube (Nord)',
      sectorLabelEN: 'Northern Highlands',
      sectorLabelFR: 'Hautes Terres du Nord',
      get name() {
        return tr(this.nameEN, this.nameFR);
      },
      get sectorLabel() {
        return tr(this.sectorLabelEN, this.sectorLabelFR);
      },
      pos: { x: 4, z: -64 },
      colorHex: 0x00e5ff,
      colorCss: '#00e5ff',
    },
    {
      id: 'relic_breakers_southeast',
      index: 2,
      nameEN: 'Fragment of Breakers (South-East)',
      nameFR: 'Fragment des Brisants (Sud-Est)',
      sectorLabelEN: 'South-East Coast & Plains',
      sectorLabelFR: 'Littoral & Plaines du Sud-Est',
      get name() {
        return tr(this.nameEN, this.nameFR);
      },
      get sectorLabel() {
        return tr(this.sectorLabelEN, this.sectorLabelFR);
      },
      pos: { x: 58, z: 42 },
      colorHex: 0xffd32a,
      colorCss: '#ffd32a',
    },
    {
      id: 'relic_caldera_southwest',
      index: 3,
      nameEN: 'Fragment of Caldera (South-West)',
      nameFR: 'Fragment de Caldeira (Sud-Ouest)',
      sectorLabelEN: 'South-West Volcanic Rim',
      sectorLabelFR: 'Lisière Volcanique Sud-Ouest',
      get name() {
        return tr(this.nameEN, this.nameFR);
      },
      get sectorLabel() {
        return tr(this.sectorLabelEN, this.sectorLabelFR);
      },
      pos: { x: -56, z: 44 },
      colorHex: 0xff5e57,
      colorCss: '#ff5e57',
    },
  ],
};

/**
 * Multi-island campaign difficulty tiers (`ISLAND_TIERS_CONFIG`).
 */
export const ISLAND_TIERS_CONFIG = CONFIG.ISLAND_TIERS || [];

const ISLAND_TIERS_EN_META = {
  1: {
    nameEN: 'Island 1: Emerald Sanctuary Archipelago',
    subtitleEN: 'Balanced Awakening Ecosystem (Difficulty ×1.00)',
  },
  2: {
    nameEN: 'Island 2: Abyssal Caldera Archipelago',
    subtitleEN: 'Accelerated Evolution & Early Mutants (Difficulty ×1.35)',
  },
  3: {
    nameEN: 'Island 3: Obsidian Mutant Wilds',
    subtitleEN: 'High-Mutation Predator Ecosystem (Difficulty ×1.75)',
  },
  4: {
    nameEN: 'Island 4: Primordial Draconic Sanctuary',
    subtitleEN: 'Extreme Apex Darwinian Crucible (Difficulty ×2.20)',
  },
};

/**
 * Resolves the localized difficulty and ecosystem parameters for a given island (`1, 2, 3, ...`).
 *
 * @param {number} [islandNumber=1]
 * @returns {object}
 */
export function getIslandTierSpec(islandNumber = 1) {
  const safeNum = Math.max(1, Math.floor(Number(islandNumber) || 1));
  const preset = ISLAND_TIERS_CONFIG.find((t) => t.islandNumber === safeNum);
  if (preset) {
    const enMeta = ISLAND_TIERS_EN_META[safeNum] || {};
    return {
      ...preset,
      name: tr(enMeta.nameEN || preset.name, preset.name),
      subtitle: tr(enMeta.subtitleEN || preset.subtitle, preset.subtitle),
    };
  }
  const extraTiers = safeNum - 1;
  const multStr = (1 + extraTiers * 0.35).toFixed(2);
  return {
    islandNumber: safeNum,
    name: tr(
      `Island ${safeNum}: Primordial Abyssal Archipelago #${safeNum}`,
      `Île ${safeNum} : Archipel Abyssal Primordial #${safeNum}`
    ),
    subtitle: tr(
      `Hyper-Mutagenic Ecosystem (Difficulty ×${multStr})`,
      `Écosystème Hyper-Mutagène (Difficulté ×${multStr})`
    ),
    enemyStatMultiplier: Number(multStr),
    mutationRateBonus: Number(Math.min(0.32, extraTiers * 0.04).toFixed(3)),
    initialMutantCount: Math.min(12, 1 + extraTiers * 2),
    sharkLandingTimeSec: Math.max(10, 40 - extraTiers * 6),
    moleEruptionTimeSec: Math.max(14, 65 - extraTiers * 10),
    skyTintHex: 0xff5252,
  };
}

export default {
  BASTION_BUILDINGS_CATALOG,
  BASTION_BUILDINGS_BY_ID,
  getBuildingUpgradeSpec,
  canAffordBuildingUpgrade,
  SCOUT_MISSIONS_CATALOG,
  SCOUT_MISSIONS_BY_ID,
  getScoutMissionSpec,
  ELEMENTAL_WEAPONS_CATALOG,
  ELEMENTAL_WEAPONS_BY_ID,
  getElementalWeaponSpec,
  getAllElementalWeaponSpecs,
  RELIC_FRAGMENTS_SPEC,
  ISLAND_TIERS_CONFIG,
  getIslandTierSpec,
  DynamicQuestSystem,
};
