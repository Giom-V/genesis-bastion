/**
 * @file src/utils/i18n.js
 * @description Bilingual Internationalization (i18n) & Live DOM Translation Engine for Genesis Bastion.
 *
 * Supports:
 * - Default language: `'en'` (🇬🇧 English)
 * - Secondary language: `'fr'` (🇫🇷 Français)
 * - Instant live switching via `setLanguage('en' | 'fr')` with listener callbacks (`onLanguageChange`)
 *   and automatic in-place DOM tree text-node / attribute translation (`translateDOMTree`).
 * - Direct inline helper `tr(enText, frText)` for UI, audio, quests, onboarding, and 3D prompts.
 */

import { logger } from './logger.js';

/**
 * Supported languages catalog (English default, French 2nd choice).
 */
export const SUPPORTED_LANGUAGES = Object.freeze([
  Object.freeze({
    code: 'en',
    label: '🇬🇧 English (Default)',
    nativeName: 'English',
    short: 'EN',
    flag: '🇬🇧',
  }),
  Object.freeze({
    code: 'fr',
    label: '🇫🇷 Français',
    nativeName: 'Français',
    short: 'FR',
    flag: '🇫🇷',
  }),
]);

/** @type {'en' | 'fr'} Active language state — defaults strictly to 'en' (English) */
let currentLanguage = 'en';

/** @type {Set<Function>} Registered language change subscribers */
const languageListeners = new Set();

/**
 * Bidirectional exact phrase dictionary (`[en, fr]`).
 * Used by `translateString()` and `translateDOMTree()` so both static and dynamic texts
 * switch seamlessly between English and French in real time.
 */
const BIDIRECTIONAL_PHRASES = [
  // Top HUD Bar & Controls
  ['Bastion Sanctuary', 'Sanctuaire du Bastion'],
  ['Next Eco-Tick', 'Prochain Eco-Tick'],
  ['Cycle', 'Cycle'],
  ['Population', 'Population'],
  ['Mutants', 'Mutants'],
  ['Hybrids', 'Hybrides'],
  ['Starving', 'Affamés'],
  ['Generation', 'Génération'],
  ['Gen', 'Gén'],
  ['Island', 'Île'],
  ['Settings', 'Paramètres'],
  ['⚙️ Settings [O]', '⚙️ Paramètres [O]'],
  ['⚙️ Settings', '⚙️ Paramètres'],
  ['Codex [Tab]', 'Codex [Tab]'],
  ['🧬 Codex [Tab]', '🧬 Codex [Tab]'],
  ['🏰 Architect [H]', '🏰 Architecte [H]'],
  ['⚔️ Armory [K]', '⚔️ Armurerie [K]'],
  ['🎨 3D: Blender [J]', '🎨 3D : Blender [J]'],
  ['📐 3D: Classic [J]', '📐 3D : Classique [J]'],
  ['🔊 Audio [M]', '🔊 Audio [M]'],
  ['🔇 Muted [M]', '🔇 Muet [M]'],
  ['⏸️ Pause', '⏸️ Pause'],
  ['▶️ Resume', '▶️ Reprendre'],
  ['⚡ Auto (VS) [C]', '⚡ Auto (VS) [C]'],
  ['⚔️ Active (Diablo) [C]', '⚔️ Actif (Diablo) [C]'],

  // Resources & Telemetry
  ['Wood', 'Bois'],
  ['Stone', 'Pierre'],
  ['Crystal', 'Cristal'],
  ['Biomass', 'Biomasse'],
  ['Rations', 'Rations'],
  ['Food', 'Nourriture'],
  ['🍖 Rations', '🍖 Rations'],
  ['🪵 Wood', '🪵 Bois'],
  ['🪨 Stone', '🪨 Pierre'],
  ['💎 Crystal', '💎 Cristal'],
  ['🌿 Biomass', '🌿 Biomasse'],
  ['Survivors', 'Survivants'],
  ['Gatherers', 'Récolteurs'],
  ['Guards', 'Gardes'],
  ['Scouts', 'Éclaireurs'],
  ['+ Gatherer', '+ Récolteur'],
  ['+ Guard', '+ Garde'],
  ['+ Scout', '+ Éclaireur'],

  // Left Panel — Bastion & Buildings
  ['🏰 BASTION & SURVIVORS', '🏰 BASTION & SURVIVANTS'],
  ['🏗️ BASTION ARCHITECTURE [H]', '🏗️ ARCHITECTURE DU BASTION [H]'],
  ['🦅 SCOUT MISSION ORDERS', '🦅 ORDRES DE MISSION ÉCLAIREURS'],
  ['📜 ACTIVE ERADICATION QUEST', '📜 QUÊTE D’ÉRADICATION ACTIVE'],
  ['⚔️ ADAPTIVE MASTERY & RESISTANCES', '⚔️ MAÎTRISES ADAPTATIVES & RÉSISTANCES'],
  ['🧪 EVOLUTIONARY LAB & SIMULATION', '🧪 LABORATOIRE ÉVOLUTIF & SIMULATION'],
  ['Sanctuary Hearth', 'Cœur du Sanctuaire'],
  ['Bastion Core', 'Cœur du Bastion'],
  ['Watchtower', 'Tour de Guet'],
  ['Scout Guild', 'Guilde des Éclaireurs'],
  ['Scout Guildhall', 'Guilde Éclaireurs'],
  ['Workshop & Ramparts', 'Atelier & Remparts'],
  ['Forge & Palisade', 'Forge & Palissade'],
  ['Bio-Laboratory', 'Bio-Laboratoire'],
  ['Genetics Lab', 'Labo Génétique'],
  ['🌿 Reintroduce Prey (25 Biomass)', '🌿 Réintroduire Gibier (25 Biomasse)'],

  // Right Panel — Lineages, Radar & Minimap
  ['🧬 MUTANT LINEAGES & RADAR', '🧬 LIGNÉES MUTANTES & RADAR'],
  ['🗺️ TACTICAL RADAR & CONWAY', '🗺️ RADAR TACTIQUE & CONWAY'],
  ['No active mutant lineage detected', 'Aucune lignée mutante active détectée'],
  ['No active adaptation yet — hunt monsters to adapt (<=1%/kill, max +15%)', 'Aucune adaptation active — chassez des monstres pour vous adapter (<=1%/kill, max +15%)'],
  ['Track Lineage', 'Traquer la Lignée'],
  ['🔍 Track Lineage', '🔍 Traquer la Lignée'],
  ['⛓️ Rescue Survivors', '⛓️ Secourir les Survivants'],
  ['🌋 Scout Caldera', '🌋 Explorer la Caldeira'],
  ['🛡️ Frontier Watch', '🛡️ Vigilance Frontière'],

  // Species Names
  ['Goblin', 'Gobelin'],
  ['Goblins', 'Gobelins'],
  ['Orc', 'Orc'],
  ['Orcs', 'Orcs'],
  ['Troll', 'Troll'],
  ['Trolls', 'Trolls'],
  ['Wolf', 'Loup'],
  ['Wolves', 'Loups'],
  ['Lion', 'Lion'],
  ['Lions', 'Lions'],
  ['Vulture', 'Vautour'],
  ['Vultures', 'Vautours'],
  ['Dragon', 'Dragon'],
  ['Dragons', 'Dragons'],
  ['Land Shark', 'Requin Marcheur'],
  ['Land Sharks', 'Requins Marcheurs'],
  ['Giant Mole', 'Taupe Géante'],
  ['Giant Moles', 'Taupes Géantes'],
  ['Plains Rabbit', 'Lapin des Plaines'],
  ['Rabbit', 'Lapin'],
  ['Rabbits', 'Lapins'],
  ['Sylvan Deer', 'Biche Sylvestre'],
  ['Deer', 'Biche'],
  ['Baby', 'Bébé'],
  ['Babies', 'Bébés'],
  ['Adult', 'Adulte'],
  ['Adults', 'Adultes'],

  // Mutations
  ['Pyroclastic Gland', 'Glande Pyroclastique'],
  ['Pyro / Fire', 'Pyro / Feu'],
  ['Neuro-Venom Sacs', 'Sacs à Venin Neurotoxique'],
  ['Venom / Poison', 'Venin / Poison'],
  ['Osteo-Dermal Plating', 'Carapace Ostéo-Dermique'],
  ['Armor +45%', 'Armure +45%'],
  ['Winged Leap Tendons', 'Tendons de Saut Ailé'],
  ['Winged Leap', 'Saut Ailé'],
  ['Cryogenic Blood', 'Sang Cryogénique'],
  ['Cryo / Frost', 'Cryo / Givre'],
  ['Vampiric Maw', 'Gueule Hématophage'],
  ['Vampirism', 'Vampirisme'],
  ['Titan Gigantism', 'Gigantisme Titanesque'],
  ['Titan / Giant', 'Titan / Géant'],
  ['Amphibious Legs & Gills', 'Pattes & Branchies Amphibies'],
  ['Amphibious Walker', 'Amphibie Marcheur'],

  // Elemental Weapons
  ['Bastion Runic Greatsword', 'Espadon Runique du Bastion'],
  ['Runic Greatsword', 'Espadon Runique'],
  ['Solar Blade of Ignis', 'Lame Solaire d’Ignis'],
  ['Fire Blade', 'Lame de Feu'],
  ['Frost Greatsword of Boreas', 'Espadon Givré de Borée'],
  ['Ice Weapon', 'Arme de Glace'],
  ['Thunder Glaive of Aether', 'Glaive Foudroyant d’Aether'],
  ['Lightning Weapon', 'Arme de Foudre'],
  ['Symbiotic Emerald Scythe', 'Faux d’Émeraude Symbiotique'],
  ['Venom & Biomass Weapon', 'Arme de Venin & Biomasse'],

  // 8 Roguelike 3D Spells
  ['Spectral Orbiting Blades', 'Lames Orbitales Spectrales'],
  ['Pyroclastic Nova', 'Nova Pyroclastique'],
  ['Chain Lightning Arc', 'Arc Foudroyant en Chaîne'],
  ['Cryogenic Javelin', 'Javelot Cryogénique'],
  ['Neurotoxic Venom Volley', 'Salve de Dagues Venimeuses'],
  ['Amber Meteor Strike', 'Météore d’Ambre Solaire'],
  ['Vampiric Soul Siphon', 'Siphon Vampirique'],
  ['Telluric Seismic Slam', 'Onde de Choc Sismique'],

  // 7 Passive Upgrades
  ['Patient Zero Tracker', 'Traqueur de Patient Zéro'],
  ['Scout Falconry', 'Fauconnerie d’Éclaireur'],
  ['Juvenile Purge & Scorched Earth', 'Purge Juvénile & Terre Brûlée'],
  ['Thorn Bulwark & Runic Ballistas', 'Muraille d’Épines & Balistes Runiques'],
  ['Pyrophage Blade & Cryo Aegis', 'Lame Pyrophage & Égide Cryo'],
  ['Swift Expedition Boots', 'Bottes d’Expédition Véloce'],
  ['Regenerating Amber Blood', 'Sang d’Ambre Régénérant'],

  // Onboarding & Modals
  ['Skip Tutorial [P]', 'Passer le tutoriel [P]'],
  ['Passer le tutoriel [P]', 'Passer le tutoriel [P]'],
  ['⏸️ GAME PAUSED — Take your time to read and choose your upgrade', '⏸️ JEU EN PAUSE — Prenez tout votre temps pour lire et choisir votre compétence'],
  ['💀 GAME OVER — EXPEDITION ENDED', '💀 GAME OVER — FIN DE L’EXPÉDITION'],
  ['🔄 Restart from Zero (True Roguelike Run — Lvl 1, Island #1)', '🔄 Repartir à Zéro (Nouvelle Run Roguelike — Niv. 1, Île #1)'],
  ['✨ Continue Anyway (Sanctuary Grace — 100% HP)', '✨ Continuer quand même (Grâce Temporaire du Sanctuaire — 100% PV)'],
  ['🛡️ ISLAND SECURED — EDEN SHIELD ACTIVE', '🛡️ ZONE VALIDÉE — BOUCLIER D’ÉDEN ACTIF'],
  ['⛵ SAIL TO NEXT ISLAND', '⛵ CAP SUR L’ÎLE SUIVANTE'],

  // Contextual 3D Prompts
  ['[E] Harvest (Wood)', '[E] Récolter (Bois)'],
  ['[E] Harvest (Stone)', '[E] Récolter (Pierre)'],
  ['[E] Harvest (Crystal)', '[E] Récolter (Cristal)'],
  ['[E] Rescue Survivor', '[E] Libérer le Survivant'],
  ['[E] Build / Upgrade', '[E] Construire / Améliorer'],
  ['[E] Activate Sanctuary', '[E] Activer le Sanctuaire'],
  ['[Left Click / Space] Strike!', '[Clic Gauche / Espace] : Frapper !'],
  ['🕊️ Peaceful Sovereign (Do Not Provoke)', '🕊️ Souverain Paisible (Ne pas provoquer)'],
];

/** Fast lookup Maps built from BIDIRECTIONAL_PHRASES */
const FR_TO_EN_MAP = new Map();
const EN_TO_FR_MAP = new Map();
for (const [en, fr] of BIDIRECTIONAL_PHRASES) {
  FR_TO_EN_MAP.set(fr, en);
  EN_TO_FR_MAP.set(en, fr);
}

/**
 * Pattern replacements for composite dynamic strings when translating FR -> EN or EN -> FR.
 */
const FR_TO_EN_PATTERNS = [
  [/\bActe\s+(\d+)\b/g, 'Act $1'],
  [/\bNiv\.\s*(\d+)/g, 'Lvl $1'],
  [/\bNiveau\s+(\d+)/g, 'Level $1'],
  [/\bRang\s+(\d+)/g, 'Rank $1'],
  [/\bÎle\s+#?(\d+)/g, 'Island #$1'],
  [/\bGénération\s+(\d+)/g, 'Generation $1'],
  [/\bProgression\s*:/g, 'Progress:'],
  [/\bObjectif\s*:/g, 'Objective:'],
  [/\bDégâts\b/g, 'Damage'],
  [/\bPortée\b/g, 'Range'],
  [/\bRecharge\b/g, 'Cooldown'],
  [/\bVitesse\b/g, 'Speed'],
  [/\bNouveau Sort\b/g, 'New Spell'],
  [/\bRepérés\s*:/g, 'Spotted:'],
  [/\bRestants\s*:/g, 'Remaining:'],
  [/\bporteurs\b/g, 'carriers'],
  [/\bporteur\b/g, 'carrier'],
  [/\béliminés\b/g, 'slain'],
  [/\bConstruire\s*:/g, 'Build:'],
  [/\bAméliorer\s*:/g, 'Upgrade:'],
  [/\bLibérer le Survivant\b/g, 'Rescue Survivor'],
  [/\bRécolter\b/g, 'Harvest'],
  [/\bBois\b/g, 'Wood'],
  [/\bPierre\b/g, 'Stone'],
  [/\bCristal\b/g, 'Crystal'],
  [/\bBiomasse\b/g, 'Biomass'],
  [/\bSurvivants\b/g, 'Survivors'],
  [/\bÉclaireurs\b/g, 'Scouts'],
  [/\bÉclaireur\b/g, 'Scout'],
  [/\bGardes\b/g, 'Guards'],
  [/\bRécolteurs\b/g, 'Gatherers'],
  [/\bGobelins\b/g, 'Goblins'],
  [/\bGobelin\b/g, 'Goblin'],
  [/\bLoups\b/g, 'Wolves'],
  [/\bLoup\b/g, 'Wolf'],
  [/\bVautours\b/g, 'Vultures'],
  [/\bVautour\b/g, 'Vulture'],
  [/\bRequins Marcheurs\b/g, 'Land Sharks'],
  [/\bRequin Marcheur\b/g, 'Land Shark'],
  [/\bTaupes Géantes\b/g, 'Giant Moles'],
  [/\bTaupe Géante\b/g, 'Giant Mole'],
  [/\bBiches\b/g, 'Deer'],
  [/\bBiche\b/g, 'Deer'],
  [/\bLapins\b/g, 'Rabbits'],
  [/\bLapin\b/g, 'Rabbit'],
  [/\bBébés\b/g, 'Babies'],
  [/\bBébé\b/g, 'Baby'],
  [/\bAdultes\b/g, 'Adults'],
  [/\bAdulte\b/g, 'Adult'],
  [/\bFeu\b/g, 'Fire'],
  [/\bGlace\b/g, 'Ice'],
  [/\bGivre\b/g, 'Frost'],
  [/\bFoudre\b/g, 'Lightning'],
  [/\bVenin\b/g, 'Venom'],
  [/\bPhysique\b/g, 'Physical'],
  [/\bClic Gauche\b/g, 'Left Click'],
  [/\bClic Droit\b/g, 'Right Click'],
  [/\bEspace\b/g, 'Space'],
  [/\bMolette\b/g, 'Mouse Wheel'],
];

const EN_TO_FR_PATTERNS = [
  [/\bAct\s+(\d+)\b/g, 'Acte $1'],
  [/\bLvl\s*(\d+)/g, 'Niv. $1'],
  [/\bLevel\s+(\d+)/g, 'Niveau $1'],
  [/\bRank\s+(\d+)/g, 'Rang $1'],
  [/\bIsland\s+#?(\d+)/g, 'Île #$1'],
  [/\bGeneration\s+(\d+)/g, 'Génération $1'],
  [/\bProgress:/g, 'Progression :'],
  [/\bObjective:/g, 'Objectif :'],
  [/\bDamage\b/g, 'Dégâts'],
  [/\bRange\b/g, 'Portée'],
  [/\bCooldown\b/g, 'Recharge'],
  [/\bSpeed\b/g, 'Vitesse'],
  [/\bNew Spell\b/g, 'Nouveau Sort'],
  [/\bSpotted:/g, 'Repérés :'],
  [/\bRemaining:/g, 'Restants :'],
  [/\bcarriers\b/g, 'porteurs'],
  [/\bcarrier\b/g, 'porteur'],
  [/\bslain\b/g, 'éliminés'],
  [/\bBuild:/g, 'Construire :'],
  [/\bUpgrade:/g, 'Améliorer :'],
  [/\bRescue Survivor\b/g, 'Libérer le Survivant'],
  [/\bHarvest\b/g, 'Récolter'],
  [/\bWood\b/g, 'Bois'],
  [/\bStone\b/g, 'Pierre'],
  [/\bCrystal\b/g, 'Cristal'],
  [/\bBiomass\b/g, 'Biomasse'],
  [/\bSurvivors\b/g, 'Survivants'],
  [/\bScouts\b/g, 'Éclaireurs'],
  [/\bScout\b/g, 'Éclaireur'],
  [/\bGuards\b/g, 'Gardes'],
  [/\bGatherers\b/g, 'Récolteurs'],
  [/\bGoblins\b/g, 'Gobelins'],
  [/\bGoblin\b/g, 'Gobelin'],
  [/\bWolves\b/g, 'Loups'],
  [/\bWolf\b/g, 'Loup'],
  [/\bVultures\b/g, 'Vautours'],
  [/\bVulture\b/g, 'Vautour'],
  [/\bLand Sharks\b/g, 'Requins Marcheurs'],
  [/\bLand Shark\b/g, 'Requin Marcheur'],
  [/\bGiant Moles\b/g, 'Taupes Géantes'],
  [/\bGiant Mole\b/g, 'Taupe Géante'],
  [/\bRabbits\b/g, 'Lapins'],
  [/\bRabbit\b/g, 'Lapin'],
  [/\bBabies\b/g, 'Bébés'],
  [/\bBaby\b/g, 'Bébé'],
  [/\bAdults\b/g, 'Adultes'],
  [/\bAdult\b/g, 'Adulte'],
  [/\bLeft Click\b/g, 'Clic Gauche'],
  [/\bRight Click\b/g, 'Clic Droit'],
  [/\bMouse Wheel\b/g, 'Molette'],
];

/**
 * Returns the currently active language (`'en'` by default, or `'fr'`).
 *
 * @returns {'en' | 'fr'}
 */
export function getLanguage() {
  return currentLanguage;
}

/**
 * Selects the localized string between English (`'en'`, default) and French (`'fr'`).
 *
 * @param {string} enText - English string (used when `getLanguage() === 'en'`).
 * @param {string} [frText=enText] - French string (used when `getLanguage() === 'fr'`).
 * @returns {string} Active localized string.
 */
export function tr(enText, frText = enText) {
  return currentLanguage === 'fr' ? frText : enText;
}

/**
 * Translates a single string into `targetLang` (`'en'` or `'fr'`) using exact lookup
 * followed by pattern replacement.
 *
 * @param {string} str - Input text.
 * @param {'en' | 'fr'} [targetLang=currentLanguage] - Target language code.
 * @returns {string} Translated text.
 */
export function translateString(str, targetLang = currentLanguage) {
  if (typeof str !== 'string' || str.length === 0) return str;
  const trimmed = str.trim();
  if (!trimmed) return str;

  const exactMap = targetLang === 'en' ? FR_TO_EN_MAP : EN_TO_FR_MAP;
  if (exactMap.has(trimmed)) {
    const leading = str.slice(0, str.indexOf(trimmed));
    const trailing = str.slice(str.indexOf(trimmed) + trimmed.length);
    return `${leading}${exactMap.get(trimmed)}${trailing}`;
  }

  let out = str;
  const patterns = targetLang === 'en' ? FR_TO_EN_PATTERNS : EN_TO_FR_PATTERNS;
  for (const [regex, replacement] of patterns) {
    out = out.replace(regex, replacement);
  }
  return out;
}

/**
 * Walks a DOM subtree (`rootEl`) and translates all text nodes (`nodeType === 3`)
 * and `title` / `aria-label` / `placeholder` attributes in place without touching DOM structure
 * or event listeners. Uses `nodeValue` and `setAttribute` exclusively (zero `innerHTML`).
 *
 * @param {Element|DocumentFragment|null} rootEl - Root DOM element to translate.
 * @param {'en' | 'fr'} [targetLang=currentLanguage] - Target language code.
 */
export function translateDOMTree(rootEl, targetLang = currentLanguage) {
  if (!rootEl || typeof document === 'undefined') return;

  const walkNode = (node) => {
    if (!node) return;

    if (node.nodeType === 3) {
      // Text node
      const raw = node.nodeValue;
      if (raw && raw.trim().length > 1) {
        const translated = translateString(raw, targetLang);
        if (translated !== raw) {
          node.nodeValue = translated;
        }
      }
      return;
    }

    if (node.nodeType === 1) {
      const tag = node.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;

      for (const attr of ['title', 'aria-label', 'placeholder']) {
        if (node.hasAttribute && node.hasAttribute(attr)) {
          const val = node.getAttribute(attr);
          if (val) {
            const nextVal = translateString(val, targetLang);
            if (nextVal !== val) {
              node.setAttribute(attr, nextVal);
            }
          }
        }
      }

      const children = node.childNodes;
      if (children && children.length > 0) {
        for (let i = 0; i < children.length; i++) {
          walkNode(children[i]);
        }
      }
    }
  };

  walkNode(rootEl);
}

/**
 * Sets the active language (`'en'` or `'fr'`), updates `<html lang="...">`, translates
 * any existing DOM nodes in place, and notifies all registered listeners.
 *
 * @param {'en' | 'fr' | string} lang - Desired language code (`'en'` or `'fr'`).
 * @returns {'en' | 'fr'} The newly active language code.
 */
export function setLanguage(lang) {
  const normalized =
    typeof lang === 'string' && lang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const changed = normalized !== currentLanguage;
  currentLanguage = normalized;

  if (typeof document !== 'undefined') {
    if (document.documentElement) {
      document.documentElement.setAttribute('lang', currentLanguage);
    }
    if (document.body) {
      translateDOMTree(document.body, currentLanguage);
    }
  }

  if (changed) {
    logger.info(
      'I18N',
      `Language switched to ${currentLanguage.toUpperCase()} (${
        currentLanguage === 'en' ? 'English' : 'Français'
      }).`
    );
  }

  for (const listener of languageListeners) {
    try {
      listener(currentLanguage);
    } catch (err) {
      logger.warn('I18N', `Language listener error: ${err?.message || err}`);
    }
  }

  return currentLanguage;
}

/**
 * Registers a callback invoked whenever `setLanguage(lang)` is called.
 *
 * @param {(lang: 'en' | 'fr') => void} callback - Listener function.
 * @returns {() => void} Unsubscribe function.
 */
export function onLanguageChange(callback) {
  if (typeof callback === 'function') {
    languageListeners.add(callback);
  }
  return () => {
    languageListeners.delete(callback);
  };
}

export default {
  SUPPORTED_LANGUAGES,
  getLanguage,
  setLanguage,
  onLanguageChange,
  tr,
  translateString,
  translateDOMTree,
};
