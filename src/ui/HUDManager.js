/**
 * @file src/ui/HUDManager.js
 * @description Gestionnaire complet de l'interface tactique (HUD), du système d'alerte prioritaire
 * des Éclaireurs (Patient Zéro), du suivi des lignées mutantes/hybrides, du Codex Phylogénétique SVG,
 * et des améliorations Roguelike pour Genesis Bastion.
 *
 * Fonctionnalités principales :
 * 1. Barre supérieure : Horloge Jour/Nuit, compte à rebours du prochain Eco-Tick génétique,
 *    population totale (Adultes reproducteurs vs Bébés juvéniles), PV/XP du joueur et Ressources.
 * 2. Panneau gauche (Bastion & Éclaireurs) : PV du Bastion, allocation des rôles PNJ
 *    (Éclaireurs d'expédition lointaine, Gardes, Récolteurs), compteur de sauvetages,
 *    constructions défensives et Laboratoire de Simulation (Forcer Eco-Tick, Spawner Troll de Feu, Codex).
 * 3. Panneau droit (Radar Génétique & Lignées Mutantes) : État de densité Conway et liste en temps réel
 *    des lignées mutantes et hybrides (Patient Zéro juvénile/adulte, En Expansion, Éradiqué).
 * 4. Bannière centrale d'alerte prioritaire Éclaireur : Notification dramatique lors de la découverte
 *    d'un Patient Zéro avec bouton de traque directe, et bannière de victoire lors de l'éradication.
 * 5. Modale Codex Phylogénétique & Génome [Tab] : Graphe SVG interactif des 7 espèces par clade,
 *    distances phylogénétiques, hybrides et catalogue des mutations dominantes de Mendel + formule de Fitness.
 * 6. Modale Roguelike de montée de niveau : Sélection parmi 3 cartes d'adaptation tactique.
 * 7. Journal d'évolution et de combat en direct (Bas-Gauche) connecté à `logger`.
 */

import { CONFIG } from '../config.js';
import {
  getAllSpecies,
  getMutationsCatalog,
  getPhylogenyGraphData,
} from '../ecosystem/Phylogeny.js';
import {
  DESIGNED_UPGRADES,
  pickCounterAdaptationUpgrades,
} from '../ecosystem/BalanceAndPacing.js';
import {
  COMBAT_MODES,
  ROGUELIKE_ABILITIES_BY_ID,
  getAbilityStatsAtLevel,
  drawRoguelikeLevelUpChoices,
} from '../ecosystem/RoguelikeAbilitiesAndMastery.js';
import {
  BASTION_BUILDINGS_CATALOG,
  getBuildingUpgradeSpec,
  canAffordBuildingUpgrade,
  SCOUT_MISSIONS_CATALOG,
  getScoutMissionSpec,
  ELEMENTAL_WEAPONS_CATALOG,
  getElementalWeaponSpec,
  RELIC_FRAGMENTS_SPEC,
  getIslandTierSpec,
} from '../ecosystem/BaseAndQuestsDesign.js';
import {
  CHARACTER_PORTRAITS,
  SIMAGREE_ANIMATION_CLASSES,
  getTutorialDialoguePresentation,
  getAlertBannerPortraitPresentation,
} from './CharacterPortraitsConfig.js';
import { logger } from '../utils/logger.js';
import { getCardinalLabelFR, dist2D } from '../utils/math.js';
import {
  tr,
  getLanguage,
  setLanguage,
  onLanguageChange,
  translateDOMTree,
  translateString,
} from '../utils/i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Crée un élément HTML de manière déclarative et sécurisée via `document.createElement` et `textContent`.
 * @param {string} tag - Nom de la balise HTML.
 * @param {string} [className=''] - Classes CSS.
 * @param {string|number} [text=''] - Texte sécurisé assigné via `textContent`.
 * @returns {HTMLElement}
 */
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== '') {
    const raw = String(text);
    node.textContent = typeof translateString === 'function' ? translateString(raw) : raw;
  }
  return node;
}

/**
 * Crée un élément SVG via `document.createElementNS`.
 * @param {string} tag - Balise SVG (`svg`, `g`, `line`, `circle`, `text`, `rect`).
 * @param {Record<string, string|number>} [attrs={}] - Attributs SVG.
 * @param {string} [text=''] - Contenu textuel éventuel.
 * @returns {SVGElement}
 */
function svgEl(tag, attrs = {}, text = '') {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) {
      node.setAttribute(k, String(v));
    }
  }
  if (text) {
    const raw = String(text);
    node.textContent = typeof translateString === 'function' ? translateString(raw) : raw;
  }
  return node;
}

/**
 * Paramètres de référence Phase 5 par espèce (cycles de gestation, maturation, agressivité, posture et repeuplement sauvage).
 */
export const SPECIES_CYCLE_AND_AGGRO_DEFAULTS = {
  goblin: {
    baseGestationTime: 9,
    baseMaturationTime: 12,
    baseAggressiveness: 0.75,
    aggroStance: 'hostile',
    repopulationCooldown: 8,
    repopulationHabitatLabel: 'Terriers forestiers souterrains',
  },
  wolf: {
    baseGestationTime: 13,
    baseMaturationTime: 15,
    baseAggressiveness: 0.82,
    aggroStance: 'hostile',
    repopulationCooldown: 12,
    repopulationHabitatLabel: 'Tanières profondes des bois',
  },
  vulture: {
    baseGestationTime: 15,
    baseMaturationTime: 17,
    baseAggressiveness: 0.38,
    aggroStance: 'territorial',
    repopulationCooldown: 12,
    repopulationHabitatLabel: 'Nids des falaises rocheuses',
  },
  orc: {
    baseGestationTime: 18,
    baseMaturationTime: 22,
    baseAggressiveness: 0.88,
    aggroStance: 'hostile',
    repopulationCooldown: 16,
    repopulationHabitatLabel: 'Avant-postes tribaux des plaines',
  },
  lion: {
    baseGestationTime: 24,
    baseMaturationTime: 26,
    baseAggressiveness: 0.70,
    aggroStance: 'hostile',
    repopulationCooldown: 16,
    repopulationHabitatLabel: 'Hautes herbes de la savane',
  },
  troll: {
    baseGestationTime: 30,
    baseMaturationTime: 34,
    baseAggressiveness: 0.48,
    aggroStance: 'territorial',
    repopulationCooldown: 16,
    repopulationHabitatLabel: 'Cavernes des hautes terres',
  },
  dragon: {
    baseGestationTime: 65,
    baseMaturationTime: 50,
    baseAggressiveness: 0.08,
    aggroStance: 'pacifist_apex',
    repopulationCooldown: 28,
    repopulationHabitatLabel: 'Caldeira volcanique & hautes nuées',
    baseHp: 680,
    baseDamage: 58,
    baseSpeed: 8.2,
  },
  shark: {
    baseGestationTime: 22,
    baseMaturationTime: 24,
    baseAggressiveness: 0.85,
    aggroStance: 'hostile',
    repopulationCooldown: 35,
    repopulationHabitatLabel: 'Fosses abyssales & débarquement sur les plages (40s+)',
    baseHp: 135,
    baseDamage: 22,
    baseSpeed: 7.8,
  },
  giant_mole: {
    baseGestationTime: 20,
    baseMaturationTime: 22,
    baseAggressiveness: 0.78,
    aggroStance: 'hostile',
    repopulationCooldown: 40,
    repopulationHabitatLabel: 'Galeries telluriques souterraines (éruption 65s+)',
    baseHp: 150,
    baseDamage: 21,
    baseSpeed: 6.4,
  },
  rabbit: {
    baseGestationTime: 7.5,
    baseMaturationTime: 9.5,
    baseAggressiveness: 0.0,
    aggroStance: 'prey_pacifist',
    autoRepopulate: false,
    foodYield: 18,
    repopulationCooldown: 0,
    repopulationHabitatLabel: '⚠️ AUCUN REPEUPLEMENT AUTO (<2 = Extinction ! Bio-Labo 25 Biomasse)',
    baseHp: 26,
    baseDamage: 0,
    baseSpeed: 9.8,
  },
  deer: {
    baseGestationTime: 15,
    baseMaturationTime: 17,
    baseAggressiveness: 0.0,
    aggroStance: 'prey_pacifist',
    autoRepopulate: false,
    foodYield: 35,
    repopulationCooldown: 0,
    repopulationHabitatLabel: '⚠️ AUCUN REPEUPLEMENT AUTO (<2 = Extinction ! Bio-Labo 25 Biomasse)',
    baseHp: 54,
    baseDamage: 0,
    baseSpeed: 10.5,
  },
  storm_harpy: {
    baseGestationTime: 16,
    baseMaturationTime: 18,
    baseAggressiveness: 0.76,
    aggroStance: 'hostile',
    repopulationCooldown: 35,
    repopulationHabitatLabel: 'Nuées d’orage au-delà de l’horizon (90s+)',
    baseHp: 82,
    baseDamage: 16,
    baseSpeed: 10.8,
  },
};

/**
 * Catalogue de secours des 8 Compétences / Sorts 3D Roguelike pour affichage riche dans la Skill Bar et Level-Up.
 */
export const FALLBACK_ROGUELIKE_ABILITIES = {
  spinning_blades: {
    id: 'spinning_blades',
    name: 'Lames Orbitales',
    icon: '🗡️',
    category: 'Sort 3D Orbital',
    cooldown: 0,
    description:
      '2 à 5 lames spectrales tournent en orbite permanente autour du Gardien et tranchent tout ennemi au contact.',
    counterTarget: 'Meutes denses & Gobelins',
  },
  pyro_nova: {
    id: 'pyro_nova',
    name: 'Nova Pyroclastique',
    icon: '🔥',
    category: 'Sort 3D Zone (Feu)',
    cooldown: 5.5,
    description:
      'Déchaîne une onde circulaire de magma incandescent autour du héros qui calcine tous les ennemis proches.',
    counterTarget: 'Meutes en famine & Bêtes',
  },
  chain_lightning: {
    id: 'chain_lightning',
    name: 'Arc Foudroyant',
    icon: '⚡',
    category: 'Sort 3D Chaîne',
    cooldown: 3.8,
    description:
      'Frappe la cible la plus proche d’un éclair voltaïque qui rebondit automatiquement de monstre en monstre (3 à 6 cibles).',
    counterTarget: 'Groupes d’Orcs & Hybrides',
  },
  frost_spear: {
    id: 'frost_spear',
    name: 'Javelot Cryogénique',
    icon: '❄️',
    category: 'Sort 3D Contrôle (Glace)',
    cooldown: 3.2,
    description:
      'Projette une lance de glace perforante qui inflige de lourds dégâts et ralentit la cible de 50% pendant 4s.',
    counterTarget: 'Patient Zéro en fuite & Trolls',
  },
  venom_volley: {
    id: 'venom_volley',
    name: 'Salve Venimeuse',
    icon: '🧪',
    category: 'Sort 3D Cône (Poison)',
    cooldown: 4.0,
    description:
      'Tire un éventail de 5 dagues toxiques corrodant l’armure et infligeant de lourds dégâts de poison sur la durée (DoT).',
    counterTarget: 'Carapaces Ostéo & Trolls',
  },
  meteor_strike: {
    id: 'meteor_strike',
    name: 'Météore d’Ambre',
    icon: '☄️',
    category: 'Sort 3D Frappe Apex',
    cooldown: 7.0,
    description:
      'Invoque un météore céleste ciblant automatiquement la créature au plus haut Fitness Score à portée.',
    counterTarget: 'Patients Zéro & Prédateurs Apex',
  },
  soul_siphon: {
    id: 'soul_siphon',
    name: 'Siphon Vampirique',
    icon: '🩸',
    category: 'Sort 3D Drain & Soin',
    cooldown: 5.0,
    description:
      'canalise un rayon cramoisi qui draine la vitalité des ennemis proches et restaure immédiatement les PV du Gardien.',
    counterTarget: 'Survie prolongée hors-Bastion',
  },
  seismic_slam: {
    id: 'seismic_slam',
    name: 'Onde Sismique',
    icon: '🌋',
    category: 'Sort 3D Onde de Choc',
    cooldown: 6.0,
    description:
      'Frappe le sol avec une force tellurique qui repousse violemment (knockback) et étourdit les ennemis proches.',
    counterTarget: 'Encerclement & Charges d’Orcs',
  },
};

export class HUDManager {
  /**
   * Initialise le HUDManager et construit tous les panneaux dans `#hud-root`.
   * @param {Object} [callbacks={}] - Callbacks d'actions déclenchées par l'interface.
   * @param {Function} [callbacks.onForceEcoTick] - Déclenche immédiatement un cycle écologique.
   * @param {Function} [callbacks.onSpawnFireTroll] - Fait apparaître un Troll de Feu Patient Zéro.
   * @param {Function} [callbacks.onAssignRole] - `(fromRole, toRole)` Réassigne ou recrute un PNJ.
   * @param {Function} [callbacks.onBuildStructure] - `(structureId)` Construit un bâtiment au Bastion.
   * @param {Function} [callbacks.onFocusWorldPos] - `(x, z, lineageId)` Centre la caméra/radar sur une cible.
   * @param {Function} [callbacks.onSelectUpgrade] - `(upgrade)` Applique une amélioration roguelike.
   * @param {Function} [callbacks.onSkipTutorial] - Passe immédiatement le tutoriel et déverrouille tout le HUD.
   * @param {Function} [callbacks.onChangeCombatMode] - `(mode)` Bascule entre `'vampire_survivors'` et `'diablo_action'`.
   * @param {Function} [callbacks.onCastAbilitySlot] - `(slotIndex)` Lance manuellement le sort du slot `0..3`.
   */
  constructor(callbacks = {}) {
    /** @type {Object} */
    this.callbacks = callbacks;
    /** @type {HTMLElement} */
    this.root = document.getElementById('hud-root') || document.body;
    /** @type {Record<string, HTMLElement>} */
    this.els = {};

    /** @type {string|null} */
    this.selectedLineageId = null;
    /** @type {boolean} */
    this.isCodexOpen = false;
    /** @type {boolean} */
    this.isLevelUpOpen = false;
    /** @type {boolean} */
    this.isCombatModeModalOpen = false;
    /** @type {boolean} */
    this.isBastionModalOpen = false;
    /** @type {boolean} */
    this.isWeaponModalOpen = false;
    /** @type {boolean} */
    this.isIslandModalOpen = false;
    /** @type {boolean} */
    this.isGameOverModalOpen = false;
    /** @type {boolean} */
    this.isSettingsModalOpen = false;
    /** @type {boolean} Mode HUD épuré minimaliste actif par défaut (masque les panneaux latéraux denses) */
    this.cleanHudMode = true;
    /** @type {boolean} */
    this.showAdvancedTelemetry = false;
    /** @type {boolean} Indique si l'utilisateur a fermé manuellement le toast d'onboarding via [×] */
    this.onboardingDismissedByUser = false;
    /** @type {boolean} */
    this.isBlenderMode = true;
    /** @type {boolean} */
    this.isBloomEnabled = false;
    /** @type {boolean} */
    this.isConwayGridEnabled = true;
    /** @type {{muted: boolean, musicVolume: number, voiceVolume: number, sfxVolume: number}} */
    this.audioSettings = {
      muted: false,
      musicVolume: 0.75,
      voiceVolume: 1.0,
      sfxVolume: 0.75,
    };
    /** @type {'vampire_survivors'|'diablo_action'} */
    this.combatMode = 'vampire_survivors';
    /** @type {number} */
    this.lastKnownPlayerLevel = 1;
    /** @type {number|null} */
    this.alertTimeoutId = null;
    /** @type {{x: number, z: number, lineageId?: string}|null} */
    this.currentAlertTarget = null;
    /** @type {Array<Object>} */
    this.extraUpgrades = Object.values(FALLBACK_ROGUELIKE_ABILITIES);
    /** @type {Record<string, boolean>} */
    this.previousUnlockedHud = {};
    /** @type {string} */
    this._lastPromptSignature = '';
    /** @type {string} */
    this._lastOnboardingKeySig = '';
    /** @type {string} */
    this._lastMasterySig = '';
    /** @type {Array<Object>} */
    this.skillSlotEls = [];
    /** @type {Record<string, Object>} */
    this.buildingRowEls = {};
    /** @type {Record<string, Object>} */
    this.scoutMissionBtns = {};

    // Nettoyage initial du conteneur
    this.root.replaceChildren();
    this.root.classList.add('is-clean-hud');

    this._buildWorldOverlayLayer();
    this._buildTopBar();
    this._buildLeftPanel();
    this._buildCenterAlertColumn();
    this._buildRightPanel();
    this._buildBottomLeftLogFeed();
    this._buildBottomCenterControls();
    this._buildCodexModal();
    this._buildLevelUpModal();
    this._buildCombatModeModal();
    this._buildBastionArchitectModal();
    this._buildWeaponForgeModal();
    this._buildIslandVictoryModal();
    this._buildGameOverModal();
    this._buildSettingsModal();

    this.setCleanHudMode(true);

    if (typeof translateDOMTree === 'function') {
      translateDOMTree(this.root);
    }

    this._unsubscribeLang = onLanguageChange((lang) => {
      this.refreshLanguage(lang);
    });

    // Abonnement temps réel au logger pour le fil d'évolution
    this._unsubscribeLogger = logger.subscribe(() => {
      this.refreshLogFeed();
    });
    this.refreshLogFeed();
  }

  /**
   * Active ou désactive le mode HUD épuré minimaliste (`cleanHudMode = true` par défaut).
   * Quand `cleanHudMode` est actif (`showAdvancedTelemetry = false`), les panneaux latéraux denses
   * (Lignées, Génétique Diploïde, Conway, Maîtrises, Missions Éclaireurs, Bâtiments) sont masqués
   * de l'écran principal et consultables via `[Tab]` ou l'option `📊 Advanced Telemetry Panels` dans `[O]`.
   * @param {boolean} clean
   * @returns {boolean}
   */
  setCleanHudMode(clean = true) {
    this.cleanHudMode = Boolean(clean);
    this.showAdvancedTelemetry = !this.cleanHudMode;
    if (this.root) {
      this.root.classList.toggle('is-clean-hud', this.cleanHudMode);
      this.root.classList.toggle('is-advanced-telemetry', this.showAdvancedTelemetry);
    }
    if (this.replayVoiceBtn) {
      this.replayVoiceBtn.textContent = this.cleanHudMode
        ? '🔈'
        : tr('🔈 Replay Voice', '🔈 Réécouter Voix');
    }
    if (this.skipTutorialBtn) {
      this.skipTutorialBtn.textContent = this.cleanHudMode
        ? tr('[N] Skip', '[N] Passer')
        : tr('Skip Tutorial [P]', 'Passer le tutoriel [P]');
    }
    if (this.settingsBtn) {
      this.settingsBtn.textContent = this.cleanHudMode
        ? '⚙️ [O]'
        : tr('⚙️ Settings [O]', '⚙️ Options [O]');
    }
    if (this.isSettingsModalOpen) {
      this.renderSettingsModalContent();
    }
    return this.cleanHudMode;
  }

  /**
   * Bascule l'affichage des panneaux de télémétrie avancée (`showAdvancedTelemetry`).
   * @param {boolean} [forceState]
   * @returns {boolean} `true` si les panneaux avancés sont affichés.
   */
  toggleAdvancedTelemetry(forceState) {
    const nextShow =
      typeof forceState === 'boolean' ? forceState : !this.showAdvancedTelemetry;
    this.setCleanHudMode(!nextShow);
    return this.showAdvancedTelemetry;
  }

  /**
   * Indique si le jeu doit être mis en pause totale (`true` dès que la modale de Montée de Niveau,
   * la modale de Choix du Mode de Combat, l'Architecte du Bastion `[H]`, l'Armurerie des Artefacts `[K]`,
   * la Victoire du Bouclier d'Éden `[V]`, l'écran Game Over `[X]`, les Options `[O]` ou le Codex Phylogénétique `[Tab]` est ouvert).
   * @returns {boolean}
   */
  get isModalPaused() {
    return Boolean(
      this.isLevelUpOpen ||
        this.isCodexOpen ||
        this.isCombatModeModalOpen ||
        this.isBastionModalOpen ||
        this.isWeaponModalOpen ||
        this.isIslandModalOpen ||
        this.isGameOverModalOpen ||
        this.isSettingsModalOpen
    );
  }

  /**
   * Enregistre des cartes d'améliorations supplémentaires (ex. issues de `BalanceAndPacing.js` ou `RoguelikeAbilitiesAndMastery.js`).
   * @param {Array<Object>} upgrades
   */
  registerExtraUpgrades(upgrades) {
    if (Array.isArray(upgrades)) {
      const mergedMap = new Map();
      for (const u of [...Object.values(FALLBACK_ROGUELIKE_ABILITIES), ...this.extraUpgrades, ...upgrades]) {
        if (u && u.id) mergedMap.set(u.id, u);
      }
      this.extraUpgrades = Array.from(mergedMap.values());
    }
  }

  /**
   * Définit le mode de combat actif (`'vampire_survivors'` Auto-Cast vs `'diablo_action'` Sorts Actifs `[1-4]`).
   * @param {'vampire_survivors'|'diablo_action'} mode
   * @param {boolean} [notify=true]
   */
  setCombatMode(mode, notify = true) {
    const normalized = mode === 'diablo_action' ? 'diablo_action' : 'vampire_survivors';
    this.combatMode = normalized;
    const isVS = normalized === 'vampire_survivors';

    if (this.combatModeSwitchBtn) {
      this.combatModeSwitchBtn.textContent = isVS
        ? tr('⚡ Mode: Auto (Vampire Survivors) [C]', '⚡ Mode : Auto (Vampire Survivors) [C]')
        : tr('⚔️ Mode: Active [1-4] (Diablo) [C]', '⚔️ Mode : Actif [1-4] (Diablo) [C]');
      this.combatModeSwitchBtn.classList.toggle('is-vs-mode', isVS);
    }

    if (this.vsModeCardEl && this.diabloModeCardEl) {
      this.vsModeCardEl.classList.toggle('is-active-mode', isVS);
      this.diabloModeCardEl.classList.toggle('is-active-mode', !isVS);
    }

    if (this.isSettingsModalOpen) {
      this.renderSettingsModalContent();
    }

    if (notify && typeof this.callbacks.onChangeCombatMode === 'function') {
      this.callbacks.onChangeCombatMode(normalized);
    }
  }

  /**
   * Bascule à tout moment entre `'vampire_survivors'` (Auto-Cast) et `'diablo_action'` (Sorts Actifs `[1-4]`).
   * @returns {'vampire_survivors'|'diablo_action'}
   */
  toggleCombatMode() {
    const next = this.combatMode === 'vampire_survivors' ? 'diablo_action' : 'vampire_survivors';
    this.setCombatMode(next, true);
    return next;
  }

  /**
   * Rafraîchit le libellé du bouton de bascule de mode de combat (`[C]`) sans émettre de callback.
   */
  _refreshCombatModeSwitchLabel() {
    this.setCombatMode(this.combatMode, false);
  }

  /**
   * Met à jour l'état visuel des boutons de bascule Modèles 3D Blender (.glb) vs Procéduraux Classiques [J].
   * @param {boolean} enabled
   */
  setBlenderModeUI(enabled) {
    this.isBlenderMode = Boolean(enabled);
    const label = this.isBlenderMode
      ? tr('🎨 3D Models: Blender (.glb) [J]', '🎨 Modèles 3D : Blender (.glb) [J]')
      : tr('🎨 3D Models: Procedural (v0.9) [J]', '🎨 Modèles 3D : Procéduraux (v0.9) [J]');

    if (this.topBlenderSwitchBtn) {
      this.topBlenderSwitchBtn.textContent = label;
      this.topBlenderSwitchBtn.classList.toggle('is-blender-mode', this.isBlenderMode);
    }
    if (this.toggleBlenderModelsBtn) {
      this.toggleBlenderModelsBtn.textContent = label;
      this.toggleBlenderModelsBtn.classList.toggle('is-blender-mode', this.isBlenderMode);
    }
    if (this.isSettingsModalOpen) {
      this.renderSettingsModalContent();
    }
  }

  /**
   * Déclenche la bascule entre les Modèles 3D Blender (.glb) et les Modèles Procéduraux Classiques (`[J]`).
   * @returns {boolean}
   */
  _triggerBlenderModelsToggle() {
    if (typeof this.callbacks.onToggleBlenderModels === 'function') {
      const next = this.callbacks.onToggleBlenderModels();
      if (typeof next === 'boolean') {
        this.setBlenderModeUI(next);
        return next;
      }
    }
    this.setBlenderModeUI(!this.isBlenderMode);
    return this.isBlenderMode;
  }

  /* ==========================================================================
     0. CALQUE DE PROJECTION 3D -> 2D (BULLES D'ACTION & DÉGÂTS FLOTTANTS)
     ========================================================================== */
  _buildWorldOverlayLayer() {
    this.worldOverlayLayer = el('div', 'hud-world-overlay-layer');
    this.contextPromptEl = el('div', 'hud-context-prompt is-hidden');
    this.worldOverlayLayer.appendChild(this.contextPromptEl);
    this.root.appendChild(this.worldOverlayLayer);
  }

  /**
   * Met à jour ou masque la bulle d'action contextuelle projetée au-dessus d'une cible 3D proche
   * (ennemi à portée de fente, cage de survivant à secourir `[E]`, ou gisement à récolter `[E]`).
   *
   * @param {{x: number, y: number, visible: boolean}|null} screenPos - Coordonnées 2D écran.
   * @param {string} [keyLabel=''] - Touche mise en avant (ex. `'Clic Gauche'`, `'E'`, `'Shift'`).
   * @param {string} [actionText=''] - Texte d'action (ex. `'Libérer le Survivant'`).
   * @param {'prompt-combat'|'prompt-rescue'|'prompt-harvest'|''} [variant=''] - Style visuel.
   */
  updateContextualPrompt(screenPos, keyLabel = '', actionText = '', variant = '') {
    if (!this.contextPromptEl) return;
    if (!screenPos || !screenPos.visible || !actionText) {
      this.contextPromptEl.classList.add('is-hidden');
      return;
    }

    this.contextPromptEl.className = `hud-context-prompt${variant ? ` ${variant}` : ''}`;
    this.contextPromptEl.style.left = `${Math.round(screenPos.x)}px`;
    this.contextPromptEl.style.top = `${Math.round(screenPos.y)}px`;

    const sig = `${keyLabel}|${actionText}`;
    if (this._lastPromptSignature !== sig) {
      this._lastPromptSignature = sig;
      this.contextPromptEl.replaceChildren();
      if (keyLabel) {
        this.contextPromptEl.appendChild(el('kbd', 'hud-key-cap', keyLabel));
      }
      this.contextPromptEl.appendChild(el('span', '', actionText));
    }
  }

  /**
   * Fait jaillir un nombre de dégâts ou d'XP flottant (`-32`, `+45 XP`) aux coordonnées écran 2D.
   *
   * @param {{x: number, y: number, visible: boolean}|null} screenPos - Coordonnées 2D écran.
   * @param {string} text - Texte à afficher (ex. `'-32'`, `'+45 XP'`).
   * @param {'dmg-normal'|'dmg-crit'|'dmg-xp'|'dmg-heal'|'dmg-mastery'} [variant='dmg-normal'] - Variante CSS.
   */
  spawnFloatingNumber(screenPos, text, variant = 'dmg-normal') {
    if (!this.worldOverlayLayer || !screenPos || !screenPos.visible || !text) return;
    const node = el('div', `hud-floating-number ${variant}`, text);
    const jitterX = (Math.random() - 0.5) * 26;
    const jitterY = (Math.random() - 0.5) * 12;
    node.style.left = `${Math.round(screenPos.x + jitterX)}px`;
    node.style.top = `${Math.round(screenPos.y + jitterY)}px`;
    this.worldOverlayLayer.appendChild(node);

    window.setTimeout(() => {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }, 980);
  }

  /* ==========================================================================
     1. BARRE SUPÉRIEURE (SURVIE, HORLOGE, ECO-TICK, POPULATION, JOUEUR, RESSOURCES)
     ========================================================================== */
  _buildTopBar() {
    this.topBar = el('header', 'hud-top-bar hud-interactive');

    // =========================================================================
    // 1A. CLUSTER FLOTTANT HAUT-GAUCHE (PV, XP/Niveau, PV Bastion & Ressources Compactes)
    // =========================================================================
    this.topLeftCluster = el('div', 'hud-top-left-cluster hud-interactive');

    // Barres PV, XP & Mini-Pilule Bastion
    const vitalsGroup = el('div', 'hud-player-vitals');

    // PV Gardien
    const hpBox = el('div', 'hud-vital-box hud-vital-hp');
    const hpRow = el('div', 'hud-vital-row');
    hpRow.append(
      el('span', 'hud-vital-icon-lbl', '❤️ HP'),
      (this.playerHpText = el('span', 'hud-vital-num', '160 / 160'))
    );
    const hpTrack = el('div', 'hud-progress-track');
    this.playerHpFill = el('div', 'hud-progress-fill hp-fill');
    this.playerHpFill.style.width = '100%';
    hpTrack.appendChild(this.playerHpFill);
    hpBox.append(hpRow, hpTrack);

    // XP & Niveau
    const xpBox = el('div', 'hud-vital-box hud-vital-xp');
    const xpRow = el('div', 'hud-vital-row');
    this.playerLevelText = el('span', 'hud-level-pill', '⭐ Lv. 1');
    this.playerXpText = el('span', 'hud-vital-num hud-telemetry-only', '0 / 100 XP');
    xpRow.append(this.playerLevelText, this.playerXpText);
    const xpTrack = el('div', 'hud-progress-track');
    this.playerXpFill = el('div', 'hud-progress-fill xp-fill');
    this.playerXpFill.style.width = '0%';
    xpTrack.appendChild(this.playerXpFill);
    xpBox.append(xpRow, xpTrack);

    // Mini-Pilule PV du Bastion
    this.topBastionPill = el('div', 'hud-bastion-mini-pill', '🏰 500/500');
    this.topBastionPill.title = tr(
      'Bastion Sanctuary Integrity [H to Upgrade]',
      'Intégrité du Sanctuaire du Bastion [H pour Améliorer]'
    );
    this.topBastionPill.addEventListener('click', () => {
      this.toggleBastionArchitectModal();
    });

    vitalsGroup.append(hpBox, xpBox, this.topBastionPill);

    // Ressources compactes : 🪵 Bois, 🪨 Pierre, 💎 Cristal, 🏺 Reliques (affiché seulement si > 0 en mode Clean HUD)
    this.resGroup = el('div', 'hud-resources-group');
    this.woodBadge = el('div', 'hud-resource-badge res-wood', '🪵 40');
    this.stoneBadge = el('div', 'hud-resource-badge res-stone', '🪨 25');
    this.crystalBadge = el('div', 'hud-resource-badge res-crystal', '💎 20');

    this.relicBadge = el(
      'div',
      'hud-resource-badge res-relic is-zero-relics',
      '🏺 0/3'
    );
    this.relicBadge.title = tr(
      'Eden Relic Fragments (3/3 required to raise the Planetary Shield Dome [V])',
      'Fragments de Relique d’Éden assemblés (3/3 requis pour ériger le Dôme-Bouclier Planétaire [V])'
    );
    this.relicBadge.addEventListener('click', () => {
      if (this.callbacks.onActivateIslandShield) {
        this.callbacks.onActivateIslandShield();
      }
    });

    // Badges supplémentaires (visibles uniquement si Télémétrie Avancée = ON)
    this.islandBadge = el(
      'div',
      'hud-resource-badge res-island hud-telemetry-only',
      '🏝️ Island #1'
    );
    this.biomassBadge = el('div', 'hud-resource-badge res-biomass hud-telemetry-only', '🌿 15');
    this.foodBadge = el(
      'div',
      'hud-resource-badge res-food is-well-fed hud-telemetry-only',
      '🍖 60/150'
    );
    this.preyHealthBadge = el(
      'div',
      'hud-resource-badge res-prey is-healthy hud-telemetry-only',
      '🦌 Prey: 11'
    );
    this.weaponBadgeBtn = el(
      'button',
      'hud-weapon-badge-btn weapon-runic_steel hud-telemetry-only',
      '⚔️ Weapon [K]'
    );
    this.weaponBadgeBtn.type = 'button';
    this.weaponBadgeBtn.addEventListener('click', () => {
      this.toggleWeaponModal();
    });

    this.resGroup.append(
      this.woodBadge,
      this.stoneBadge,
      this.crystalBadge,
      this.relicBadge,
      this.islandBadge,
      this.biomassBadge,
      this.foodBadge,
      this.preyHealthBadge,
      this.weaponBadgeBtn
    );

    this.topLeftCluster.append(vitalsGroup, this.resGroup);

    // =========================================================================
    // 1B. TÉLÉMÉTRIE AVANCÉE CENTRALE (Masquée par défaut en mode Clean HUD)
    // =========================================================================
    this.topTelemetryCenter = el('div', 'hud-top-telemetry-center hud-telemetry-only');

    const brandGroup = el('div', 'hud-brand-group');
    const brandTitle = el('h1', 'hud-brand-title', 'Genesis Bastion');
    this.clockBadge = el(
      'div',
      'hud-clock-badge',
      tr('☀️ Day 1 — 08:00 (Day)', '☀️ Jour 1 — 08h00 (Jour)')
    );

    this.combatModeSwitchBtn = el(
      'button',
      'hud-mode-switch-btn is-vs-mode',
      tr('⚡ Mode: Auto [C]', '⚡ Mode : Auto [C]')
    );
    this.combatModeSwitchBtn.type = 'button';
    this.combatModeSwitchBtn.addEventListener('click', () => {
      this.toggleCombatMode();
    });

    this.audioStatusGroup = el('div', 'hud-audio-status-group');
    this.lyriaStatusPill = el('div', 'hud-lyria-pill state-tutorial');
    this.lyriaStateDot = el('span', 'hud-lyria-state-dot');
    this.lyriaStatusLabel = el(
      'span',
      'hud-lyria-label',
      tr('🎵 Lyria: Tutorial (85 BPM)', '🎵 Lyria : Tutoriel (85 BPM)')
    );
    this.lyriaStatusPill.append(this.lyriaStateDot, this.lyriaStatusLabel);

    this.muteToggleBtn = el('button', 'hud-mute-btn', '🔊 Audio');
    this.muteToggleBtn.type = 'button';
    this.muteToggleBtn.addEventListener('click', () => {
      if (typeof this.callbacks.onToggleAudioMute === 'function') {
        const isMuted = this.callbacks.onToggleAudioMute();
        this.setAudioMuteUI(Boolean(isMuted));
      }
    });

    this.topBlenderSwitchBtn = el(
      'button',
      'hud-blender-switch-btn is-blender-mode',
      tr('🎨 3D Models: Blender (.glb) [J]', '🎨 Modèles 3D : Blender (.glb) [J]')
    );
    this.topBlenderSwitchBtn.type = 'button';
    this.topBlenderSwitchBtn.addEventListener('click', () => {
      this._triggerBlenderModelsToggle();
    });

    this.classicVersionLink = el(
      'a',
      'hud-classic-version-link',
      tr('⏪ Classic (5174)', '⏪ Classique (5174)')
    );
    this.classicVersionLink.href = 'http://giom-us.c.googlers.com:5174/';
    this.classicVersionLink.target = '_blank';
    this.classicVersionLink.rel = 'noopener noreferrer';

    this.audioStatusGroup.append(
      this.lyriaStatusPill,
      this.muteToggleBtn,
      this.topBlenderSwitchBtn,
      this.classicVersionLink
    );
    brandGroup.append(brandTitle, this.clockBadge, this.combatModeSwitchBtn, this.audioStatusGroup);

    this.ecoGroup = el('div', 'hud-ecotick-group');
    const ecoHeader = el('div', 'hud-ecotick-header');
    const ecoLabel = el('span', 'hud-ecotick-label', '🧬 Eco-Tick');
    this.ecoTimerText = el('span', 'hud-ecotick-timer', '12.0s');
    ecoHeader.append(ecoLabel, this.ecoTimerText);
    const ecoTrack = el('div', 'hud-progress-track');
    this.ecoProgressFill = el('div', 'hud-progress-fill eco-fill');
    ecoTrack.appendChild(this.ecoProgressFill);
    this.ecoGroup.append(ecoHeader, ecoTrack);

    this.statsCluster = el('div', 'hud-stats-cluster');
    const popPill = el('div', 'hud-stat-pill');
    popPill.append(
      el('span', 'hud-stat-pill-label', 'Population'),
      (this.popValueEl = el('span', 'hud-stat-pill-value', '42'))
    );
    this.mutPill = el('div', 'hud-stat-pill');
    this.mutPill.append(
      el('span', 'hud-stat-pill-label', 'Mutants'),
      (this.mutCountValueEl = el('span', 'hud-stat-pill-value', '1'))
    );
    this.statsCluster.append(popPill, this.mutPill);

    this.topTelemetryCenter.append(brandGroup, this.ecoGroup, this.statsCluster);

    // =========================================================================
    // 1C. CLUSTER FLOTTANT HAUT-DROITE (3 Boutons Icônes Minimaux : 🏰 [H], 📖 [Tab], ⚙️ [O])
    // =========================================================================
    this.topRightCluster = el('div', 'hud-top-right-cluster hud-interactive');
    this.topQuickActions = el('div', 'hud-top-quick-actions');

    this.topBastionQuickBtn = el('button', 'hud-minimal-icon-btn', '🏰 [H]');
    this.topBastionQuickBtn.type = 'button';
    this.topBastionQuickBtn.title = tr(
      'Bastion Architect & Elemental Forge [H / K]',
      'Architecte du Bastion & Forge Élémentaire [H / K]'
    );
    this.topBastionQuickBtn.addEventListener('click', () => {
      this.toggleBastionArchitectModal();
    });

    this.topCodexQuickBtn = el('button', 'hud-minimal-icon-btn', '📖 [Tab]');
    this.topCodexQuickBtn.type = 'button';
    this.topCodexQuickBtn.title = tr(
      'Genetic Codex & Ecosystem Telemetry [Tab]',
      'Codex Génétique & Télémétrie Écosystème [Tab]'
    );
    this.topCodexQuickBtn.addEventListener('click', () => {
      this.toggleCodexModal();
    });

    this.settingsBtn = el('button', 'hud-minimal-icon-btn hud-settings-btn', '⚙️ [O]');
    this.settingsBtn.type = 'button';
    this.settingsBtn.title = tr(
      'Settings: Language (EN/FR), Audio, 3D Graphics & Telemetry Toggle [O]',
      'Options : Langue (EN/FR), Audio, Graphismes 3D & Télémétrie [O]'
    );
    this.settingsBtn.addEventListener('click', () => {
      this.toggleSettingsModal();
    });
    this.els.settingsBtn = this.settingsBtn;

    this.topQuickActions.append(
      this.topBastionQuickBtn,
      this.topCodexQuickBtn,
      this.settingsBtn
    );
    this.topRightCluster.appendChild(this.topQuickActions);

    this.topBar.append(this.topLeftCluster, this.topTelemetryCenter, this.topRightCluster);
    this.root.appendChild(this.topBar);
  }

  /* ==========================================================================
     2. PANNEAU GAUCHE : BASTION, ÉCLAIREURS (SCOUTS) & LABO DE SIMULATION
     ========================================================================== */
  _buildLeftPanel() {
    this.leftPanel = el('aside', 'hud-side-panel hud-left-panel hud-interactive');

    // En-tête Bastion
    const header = el('div', 'hud-panel-header');
    header.append(
      el('h2', 'hud-panel-title', '🏰 Sanctuaire du Bastion'),
      (this.rescueCounterEl = el('span', 'hud-panel-subtitle', 'Survivants: 2 (0/6 cages)'))
    );

    // Barre PV du Bastion
    const bastionHpSection = el('div', 'hud-section-block');
    const bastionHpRow = el('div', 'hud-vital-row');
    bastionHpRow.append(
      el('span', '', 'Intégrité des Remparts'),
      (this.bastionHpText = el('span', '', '500 / 500'))
    );
    const bastionTrack = el('div', 'hud-progress-track');
    this.bastionHpFill = el('div', 'hud-progress-fill bastion-fill');
    this.bastionHpFill.style.width = '100%';
    bastionTrack.appendChild(this.bastionHpFill);
    bastionHpSection.append(bastionHpRow, bastionTrack);

    // Rôles des PNJ Alliés (Éclaireurs hors-frontière, Gardes, Récolteurs)
    const rolesSection = el('div', 'hud-section-block');
    rolesSection.appendChild(el('div', 'hud-section-label', 'Gestion des Rôles & Expéditions'));

    const roleList = el('div', 'hud-role-list');

    // Ligne Éclaireurs (Scouts)
    const scoutRow = this._createRoleRow(
      'scout',
      '🦅 Éclaireurs (Scouts)',
      'Expédition hors-frontière & Radar Mutant',
      '+ Éclaireur'
    );
    this.scoutRowEl = scoutRow.row;
    this.scoutCountEl = scoutRow.countEl;
    this.scoutMetaEl = scoutRow.metaEl;
    this.scoutAssignBtn = scoutRow.assignBtn;

    // Ligne Gardes
    const guardRow = this._createRoleRow(
      'guard',
      '🏹 Gardes du Bastion',
      'Tir défensif sur le périmètre',
      '+ Garde'
    );
    this.guardCountEl = guardRow.countEl;

    // Ligne Récolteurs
    const harvRow = this._createRoleRow(
      'harvester',
      '⛏️ Récolteurs / Bâtisseurs',
      'Récolte Bois/Cristal & Réparation',
      '+ Récolteur'
    );
    this.harvesterCountEl = harvRow.countEl;

    roleList.append(scoutRow.row, guardRow.row, harvRow.row);
    rolesSection.appendChild(roleList);

    // Centre de Commandement des Missions d'Éclaireurs (Assignation d'ordre en 1 clic)
    this.scoutMissionBox = el('div', 'hud-scout-mission-box');
    this.scoutMissionBox.appendChild(
      el('div', 'hud-section-label', '🦅 Ordre de Mission des Éclaireurs')
    );
    this.scoutMissionStatusEl = el(
      'div',
      'hud-scout-mission-status',
      '🔍 Mission Active : Traquer [Trolls de Feu] (Repérés : 0 / 1)'
    );
    const missionGrid = el('div', 'hud-scout-mission-grid');
    this.scoutMissionBtns = {};

    for (const m of SCOUT_MISSIONS_CATALOG) {
      const mBtn = el('button', `hud-scout-mission-btn${m.id === 'track_lineage' ? ' is-active' : ''}`);
      mBtn.type = 'button';
      mBtn.title = m.description;
      const topSpan = el('span', '', m.shortLabel);
      const subSpan = el(
        'span',
        'hud-scout-mission-sub',
        m.id === 'track_lineage'
          ? 'Cibler porteurs mutants'
          : m.id === 'find_cages'
            ? 'Révéler les cages'
            : m.id === 'scout_volcano'
              ? 'Zone 50m–108m'
              : 'Périmètre 35m–58m'
      );
      mBtn.append(topSpan, subSpan);
      mBtn.addEventListener('click', () => {
        if (this.callbacks.onSetScoutMission) {
          this.callbacks.onSetScoutMission(m.id, this.selectedLineageId || 'pyro_gland');
        }
      });
      this.scoutMissionBtns[m.id] = { btn: mBtn, subSpan };
      missionGrid.appendChild(mBtn);
    }

    this.scoutMissionBox.append(this.scoutMissionStatusEl, missionGrid);
    rolesSection.appendChild(this.scoutMissionBox);

    // Constructions & Améliorations du Bastion (5 Bâtiments Niv. 0 -> 3)
    this.buildSection = el('div', 'hud-section-block');
    const buildHeaderRow = el('div', 'hud-panel-header');
    buildHeaderRow.append(
      el('span', 'hud-section-label', '🏰 Bâtiments du Bastion (Niv. 0 → 3)'),
      (this.openArchitectBtn = el('button', 'hud-btn hud-btn-sm hud-btn-amber', '📐 Architecte [H]'))
    );
    this.openArchitectBtn.type = 'button';
    this.openArchitectBtn.title = 'Ouvrir le Plan d’Architecte complet du Bastion en Pause [H]';
    this.openArchitectBtn.addEventListener('click', () => {
      this.toggleBastionArchitectModal();
    });

    const bastionHint = el(
      'div',
      'hud-bastion-hint',
      '💡 Approchez d’un socle doré au camp et appuyez sur [E] ou cliquez sur [⬆️ Construire / Améliorer] ci-dessous :'
    );

    this.bastionBuildingsListEl = el('div', 'hud-bastion-building-list');
    this.buildingRowEls = {};

    for (const bDef of BASTION_BUILDINGS_CATALOG) {
      const spec = getBuildingUpgradeSpec(bDef.id, bDef.initialLevel);
      const row = el('div', 'hud-building-row');

      const top = el('div', 'hud-building-top');
      const nameEl = el('span', 'hud-building-name', `${spec.icon} ${spec.shortName}`);
      const lvlBadge = el(
        'span',
        `hud-building-lvl-badge${spec.currentLevel === 0 ? ' lvl-0' : ''}`,
        `Niv. ${spec.currentLevel}/${spec.maxLevel}`
      );
      top.append(nameEl, lvlBadge);

      const effectEl = el('div', 'hud-building-effect', spec.nextEffectDesc);

      const bottom = el('div', 'hud-building-bottom');
      const costEl = el('span', 'hud-building-cost', `Coût: ${spec.costText}`);
      const upgBtn = el(
        'button',
        'hud-btn hud-btn-sm hud-building-upgrade-btn',
        `⬆️ ${spec.actionVerb} [${spec.hotkey}]`
      );
      upgBtn.type = 'button';
      upgBtn.addEventListener('click', () => {
        if (this.callbacks.onBuildStructure) {
          this.callbacks.onBuildStructure(bDef.id);
        }
      });

      bottom.append(costEl, upgBtn);
      row.append(top, effectEl, bottom);
      this.bastionBuildingsListEl.appendChild(row);

      this.buildingRowEls[bDef.id] = {
        row,
        nameEl,
        lvlBadge,
        effectEl,
        costEl,
        upgBtn,
      };
      if (bDef.legacyId) {
        this.buildingRowEls[bDef.legacyId] = this.buildingRowEls[bDef.id];
      }
    }

    // Références de compatibilité pour les surbrillances du tutoriel (Acte 4)
    this.watchtowerBtn = this.buildingRowEls.watchtower?.upgBtn || null;
    this.palisadeBtn = this.buildingRowEls.lumber_forge?.upgBtn || null;
    this.biolabBtn = this.buildingRowEls.biolab?.upgBtn || null;

    this.buildSection.append(buildHeaderRow, bastionHint, this.bastionBuildingsListEl);

    // Laboratoire de Simulation / Actions de Test Directes (Phase 7 : Émergences & Réintroduction Gibier)
    this.simLab = el('div', 'hud-sim-lab');
    this.simLab.appendChild(
      el('div', 'hud-section-label', '🧪 Laboratoire Génétique & Émergence')
    );

    const simGrid = el('div', 'hud-sim-lab-grid');

    this.forceTickBtn = el(
      'button',
      'hud-btn hud-btn-biomass',
      '⚡ Forcer Eco-Tick [T]'
    );
    this.forceTickBtn.type = 'button';
    this.forceTickBtn.title = 'Forcer immédiatement un cycle écologique de Conway + Génétique [T]';
    this.forceTickBtn.addEventListener('click', () => {
      if (this.callbacks.onForceEcoTick) this.callbacks.onForceEcoTick();
    });

    this.spawnFireTrollBtn = el(
      'button',
      'hud-btn hud-btn-threat',
      '🔥 Troll de Feu [M]'
    );
    this.spawnFireTrollBtn.type = 'button';
    this.spawnFireTrollBtn.title = 'Faire apparaître un Troll de Feu Patient Zéro [M]';
    this.spawnFireTrollBtn.addEventListener('click', () => {
      if (this.callbacks.onSpawnFireTroll) this.callbacks.onSpawnFireTroll();
    });

    this.sharkLandingBtn = el(
      'button',
      'hud-btn hud-btn-abyss',
      '🦈 Débarquement Requins'
    );
    this.sharkLandingBtn.type = 'button';
    this.sharkLandingBtn.title =
      'Faire muter les Requins de l’océan (Pattes Amphibies) et déclencher leur débarquement sur la plage !';
    this.sharkLandingBtn.addEventListener('click', () => {
      if (this.callbacks.onTriggerSharkLanding) {
        this.callbacks.onTriggerSharkLanding();
      }
    });

    this.moleEruptionBtn = el(
      'button',
      'hud-btn hud-btn-earth',
      '🕳️ Éruption Taupes'
    );
    this.moleEruptionBtn.type = 'button';
    this.moleEruptionBtn.title =
      'Déclencher une éruption souterraine de Taupes Géantes Fouisseuses à travers l’île !';
    this.moleEruptionBtn.addEventListener('click', () => {
      if (this.callbacks.onTriggerMoleEruption) {
        this.callbacks.onTriggerMoleEruption();
      }
    });

    this.reintroducePreyBtn = el(
      'button',
      'hud-btn hud-btn-prey is-full-span',
      '🌿 Réintroduire Gibier (25 Biomasse)'
    );
    this.reintroducePreyBtn.type = 'button';
    this.reintroducePreyBtn.title =
      'Réintroduire 3 Biches Sylvestres et 4 Lapins des Plaines si vos sorts ont décimé le gibier (Coût : 25 Biomasse)';
    this.reintroducePreyBtn.addEventListener('click', () => {
      if (this.callbacks.onReintroducePrey) {
        this.callbacks.onReintroducePrey();
      }
    });

    this.openWeaponModalBtn = el(
      'button',
      'hud-btn hud-btn-amber',
      '⚔️ Armes Élémentaires [K]'
    );
    this.openWeaponModalBtn.type = 'button';
    this.openWeaponModalBtn.title =
      'Ouvrir la Forge des 4 Armes Élémentaires Légendaires (Feu / Glace / Foudre / Venin Symbiotique) [K]';
    this.openWeaponModalBtn.addEventListener('click', () => {
      this.toggleWeaponModal();
    });

    this.activateIslandShieldBtn = el(
      'button',
      'hud-btn hud-btn-shield',
      '🛡️ Bouclier & Île Suiv. [V]'
    );
    this.activateIslandShieldBtn.type = 'button';
    this.activateIslandShieldBtn.title =
      'Assembler les 3 Reliques d’Éden, ériger le Dôme-Bouclier Planétaire 3D et mettre le cap sur l’Île suivante [V]';
    this.activateIslandShieldBtn.addEventListener('click', () => {
      if (this.callbacks.onActivateIslandShield) {
        this.callbacks.onActivateIslandShield();
      }
    });

    this.openCodexBtn = el(
      'button',
      'hud-btn hud-btn-scout is-full-span',
      '🧬 Ouvrir Arbre Phylogénétique [Tab]'
    );
    this.openCodexBtn.type = 'button';
    this.openCodexBtn.addEventListener('click', () => {
      this.toggleCodexModal();
    });

    this.triggerGameOverTestBtn = el(
      'button',
      'hud-btn hud-btn-gameover is-full-span',
      '💀 Tester Game Over & Requiem Lyria [X]'
    );
    this.triggerGameOverTestBtn.type = 'button';
    this.triggerGameOverTestBtn.title =
      'Simuler la mort du Gardien (PV → 0) pour tester l’écran Game Over Roguelike et la musique triste Lyria [X]';
    this.triggerGameOverTestBtn.addEventListener('click', () => {
      if (this.callbacks.onTriggerGameOverTest) {
        this.callbacks.onTriggerGameOverTest();
      }
    });

    this.toggleBlenderModelsBtn = el(
      'button',
      'hud-btn hud-btn-blender is-blender-mode is-full-span',
      '🎨 Modèles 3D : Blender (.glb) [J]'
    );
    this.toggleBlenderModelsBtn.type = 'button';
    this.toggleBlenderModelsBtn.title =
      'Comparer en 1 clic les 14 modèles 3D .glb sculptés sous Blender 5.0 et les modèles procéduraux classiques [J]';
    this.toggleBlenderModelsBtn.addEventListener('click', () => {
      this._triggerBlenderModelsToggle();
    });

    simGrid.append(
      this.forceTickBtn,
      this.spawnFireTrollBtn,
      this.sharkLandingBtn,
      this.moleEruptionBtn,
      this.reintroducePreyBtn,
      this.openWeaponModalBtn,
      this.activateIslandShieldBtn,
      this.openCodexBtn,
      this.triggerGameOverTestBtn,
      this.toggleBlenderModelsBtn
    );
    this.simLab.appendChild(simGrid);

    this.leftPanel.append(header, bastionHpSection, rolesSection, this.buildSection, this.simLab);
    this.root.appendChild(this.leftPanel);
  }

  /**
   * Crée une ligne de contrôle pour un rôle PNJ (`scout`, `guard`, `harvester`).
   * @param {string} roleKey
   * @param {string} titleText
   * @param {string} subtitleText
   * @param {string} addLabel
   * @returns {{row: HTMLElement, countEl: HTMLElement, metaEl: HTMLElement, assignBtn: HTMLButtonElement}}
   * @private
   */
  _createRoleRow(roleKey, titleText, subtitleText, addLabel) {
    const row = el('div', `hud-role-row role-${roleKey}`);
    const info = el('div', 'hud-role-info');
    const nameEl = el('span', 'hud-role-name', titleText);
    const metaEl = el('span', 'hud-role-meta', subtitleText);
    info.append(nameEl, metaEl);

    const controls = el('div', 'hud-role-controls');
    const countEl = el('span', 'hud-role-count', '1');
    const assignBtn = el('button', 'hud-btn hud-btn-sm hud-btn-amber', addLabel);
    assignBtn.type = 'button';
    assignBtn.title = `Affecter un survivant ou recruter vers : ${titleText}`;
    assignBtn.addEventListener('click', () => {
      if (this.callbacks.onAssignRole) {
        this.callbacks.onAssignRole(roleKey);
      }
    });

    controls.append(countEl, assignBtn);
    row.append(info, controls);
    return { row, countEl, metaEl, assignBtn };
  }

  /* ==========================================================================
     3. COLONNE CENTRALE : ONBOARDING GUIDÉ (7 ACTES) & ALERTE ÉCLAIREUR
     ========================================================================== */
  _buildCenterAlertColumn() {
    this.centerCol = el('div', 'hud-center-column');

    // 3A. Carte d'Onboarding Guidé (Actes 1 à 7) avec Médaillon Portrait Nano Banana & Simagrées
    this.onboardingCard = el('div', 'hud-onboarding-card is-hidden hud-interactive');
    const onboardingLayout = el('div', 'hud-onboarding-layout');

    // Colonne gauche : Médaillon de Portrait Animé ("Simagrées") — Aldric (Actes 1–4) / Kaelen (Actes 5–7)
    this.portraitMedallionCol = el('div', 'hud-portrait-medallion-col');
    this.portraitFrameEl = el('div', 'hud-portrait-frame simagree-talk-bounce');
    this.portraitImgEl = el('img', 'hud-portrait-img');
    this.portraitImgEl.src = CHARACTER_PORTRAITS.aldric.defaultPortraitUrl;
    this.portraitImgEl.alt = 'Portrait du Mentor';

    this.portraitSpecimenPipEl = el('img', 'hud-portrait-specimen-pip is-hidden');
    this.portraitSpecimenPipEl.src = CHARACTER_PORTRAITS.fire_troll.defaultPortraitUrl;
    this.portraitSpecimenPipEl.alt = 'Spécimen ciblé';

    this.portraitFrameEl.append(this.portraitImgEl, this.portraitSpecimenPipEl);
    this.speakerNameEl = el('div', 'hud-speaker-name', 'Aldric');
    this.emotionBadgeEl = el('div', 'hud-emotion-badge', '🧭 Mentor Bienveillant');
    this.portraitMedallionCol.append(this.portraitFrameEl, this.speakerNameEl, this.emotionBadgeEl);

    // Alternance automatique d'expression ("simagrée") entre portrait principal et secondaire
    this._currentPortraitPrimaryUrl = CHARACTER_PORTRAITS.aldric.defaultPortraitUrl;
    this._currentPortraitSecondaryUrl = CHARACTER_PORTRAITS.aldric.scholar.url;
    this._portraitAltToggle = false;
    this._portraitSwapIntervalId = window.setInterval(() => {
      if (!this.onboardingCard || this.onboardingCard.classList.contains('is-hidden')) return;
      if (
        this._currentPortraitPrimaryUrl &&
        this._currentPortraitSecondaryUrl &&
        this._currentPortraitPrimaryUrl !== this._currentPortraitSecondaryUrl
      ) {
        this._portraitAltToggle = !this._portraitAltToggle;
        this.portraitImgEl.src = this._portraitAltToggle
          ? this._currentPortraitSecondaryUrl
          : this._currentPortraitPrimaryUrl;
      }
    }, 1850);

    // Colonne principale droite : En-tête d'acte, Citation parlée + bouton "🔈 Réécouter Voix", Instructions, Touches et Objectif
    this.onboardingMainCol = el('div', 'hud-onboarding-main-col');

    // Ligne compacte 1-ligne (Clean HUD Toast) : "Act 1/7: Move with WASD & harvest 3 resources with [E] (0/3)" + 🔈 + [N] Skip + [×]
    this.onboardingCompactRow = el('div', 'hud-onboarding-compact-row');
    this.onboardingCompactTextEl = el(
      'div',
      'hud-onboarding-compact-line',
      tr('Act 1/7: Explore the Sanctuary & adjust camera with [R]/[F]', 'Acte 1/7 : Explorez le Sanctuaire & orientez la caméra avec [R]/[F]')
    );

    this.replayVoiceBtn = el('button', 'hud-replay-voice-btn', '🔈');
    this.replayVoiceBtn.type = 'button';
    this.replayVoiceBtn.title = tr(
      'Replay Gemini TTS voiceover for this act',
      'Réécouter le doublage vocal Gemini TTS de cet acte'
    );
    this.replayVoiceBtn.addEventListener('click', () => {
      if (typeof this.callbacks.onReplayTutorialVoice === 'function') {
        this.callbacks.onReplayTutorialVoice(this._currentOnboardingActNum || 1);
      }
    });

    this.skipTutorialBtn = el(
      'button',
      'hud-onboarding-skip-btn',
      tr('[N] Skip', '[N] Passer')
    );
    this.skipTutorialBtn.type = 'button';
    this.skipTutorialBtn.title = tr(
      'Skip tutorial and unlock full ecosystem immediately [P]',
      'Déverrouiller immédiatement tous les systèmes et lancer l’écosystème complet [P]'
    );
    this.skipTutorialBtn.addEventListener('click', () => {
      if (this.callbacks.onSkipTutorial) {
        this.callbacks.onSkipTutorial();
      }
    });

    this.dismissOnboardingBtn = el('button', 'hud-onboarding-dismiss-btn', '×');
    this.dismissOnboardingBtn.type = 'button';
    this.dismissOnboardingBtn.title = tr(
      'Dismiss tutorial banner',
      'Fermer la bannière de tutoriel'
    );
    this.dismissOnboardingBtn.addEventListener('click', () => {
      this.onboardingDismissedByUser = true;
      this.hideOnboardingBanner();
    });

    const compactActions = el('div', 'hud-onboarding-compact-actions');
    compactActions.append(this.replayVoiceBtn, this.skipTutorialBtn, this.dismissOnboardingBtn);
    this.onboardingCompactRow.append(this.onboardingCompactTextEl, compactActions);

    const topRow = el('div', 'hud-onboarding-top hud-telemetry-only');
    const stepWrap = el('div', 'hud-onboarding-step-wrap');
    this.onboardingStepBadge = el('span', 'hud-onboarding-step-badge', 'ACTE 1 / 7');
    const progTrack = el('div', 'hud-onboarding-progress-track');
    this.onboardingProgressFill = el('div', 'hud-onboarding-progress-fill');
    this.onboardingProgressFill.style.width = '14%';
    progTrack.appendChild(this.onboardingProgressFill);
    stepWrap.append(this.onboardingStepBadge, progTrack);
    topRow.append(stepWrap);

    this.onboardingTitleEl = el('div', 'hud-onboarding-title hud-telemetry-only', '');

    this.onboardingQuoteRow = el('div', 'hud-onboarding-quote-row hud-telemetry-only');
    this.onboardingQuoteEl = el('div', 'hud-onboarding-quote', '');
    this.onboardingQuoteRow.append(this.onboardingQuoteEl);

    this.onboardingDescEl = el('div', 'hud-onboarding-desc hud-telemetry-only', '');
    this.onboardingWhyEl = el('div', 'hud-onboarding-why hud-telemetry-only', '');
    this.onboardingKeysRow = el('div', 'hud-onboarding-keys-row hud-telemetry-only');

    const objBox = el('div', 'hud-onboarding-objective-box hud-telemetry-only');
    this.onboardingObjIcon = el('span', 'hud-onboarding-obj-icon', '🎯');
    this.onboardingObjText = el('span', 'hud-onboarding-obj-text', '');
    this.onboardingObjProgress = el('span', 'hud-onboarding-obj-progress', '');
    objBox.append(this.onboardingObjIcon, this.onboardingObjText, this.onboardingObjProgress);

    this.onboardingMainCol.append(
      this.onboardingCompactRow,
      topRow,
      this.onboardingTitleEl,
      this.onboardingQuoteRow,
      this.onboardingDescEl,
      this.onboardingWhyEl,
      this.onboardingKeysRow,
      objBox
    );

    onboardingLayout.append(this.portraitMedallionCol, this.onboardingMainCol);
    this.onboardingCard.appendChild(onboardingLayout);
    this.centerCol.appendChild(this.onboardingCard);

    // 3B. Bannière d'alerte prioritaire Éclaireur (Patient Zéro) & Courroux Draconique avec Portrait Nano Banana
    this.alertBanner = el('div', 'hud-scout-alert-banner is-hidden hud-interactive');
    this.alertPortraitWrap = el('div', 'hud-alert-portrait-wrap simagree-panic-pulse');
    this.alertPortraitImg = el('img', 'hud-alert-portrait-img');
    this.alertPortraitImg.src = CHARACTER_PORTRAITS.kaelen.shocked.url;
    this.alertPortraitImg.alt = 'Alerte Éclaireur';

    this.alertSpecimenPipImg = el('img', 'hud-alert-specimen-pip');
    this.alertSpecimenPipImg.src = CHARACTER_PORTRAITS.fire_troll.defaultPortraitUrl;
    this.alertSpecimenPipImg.alt = 'Spécimen Mutant';

    this.alertIconWrap = el('div', 'hud-alert-icon-wrap', '🦅');
    this.alertIconWrap.style.display = 'none';
    this.alertPortraitWrap.append(this.alertPortraitImg, this.alertSpecimenPipImg);

    const body = el('div', 'hud-alert-body');
    this.alertTitleEl = el('div', 'hud-alert-title', 'ALERTE ÉCLAIREUR — PATIENT ZÉRO REPÉRÉ');
    this.alertDescEl = el(
      'div',
      'hud-alert-desc',
      'Un porteur de mutation dominante a été localisé dans les terres sauvages.'
    );
    body.append(this.alertTitleEl, this.alertDescEl);

    const actions = el('div', 'hud-alert-actions');
    this.trackPatientZeroBtn = el(
      'button',
      'hud-btn hud-btn-threat',
      '🎯 TRAQUER LE PATIENT ZÉRO'
    );
    this.trackPatientZeroBtn.type = 'button';
    this.trackPatientZeroBtn.addEventListener('click', () => {
      if (this.currentAlertTarget?.actionType === 'reintroduce_prey') {
        if (typeof this.callbacks.onReintroducePrey === 'function') {
          this.callbacks.onReintroducePrey();
        }
        this.hideAlertBanner();
        return;
      }
      if (this.currentAlertTarget?.actionType === 'activate_island_shield') {
        if (typeof this.callbacks.onActivateIslandShield === 'function') {
          this.callbacks.onActivateIslandShield();
        }
        this.hideAlertBanner();
        return;
      }
      if (this.currentAlertTarget?.actionType === 'open_weapon_forge') {
        this.toggleWeaponModal(true);
        this.hideAlertBanner();
        return;
      }
      if (this.currentAlertTarget && this.callbacks.onFocusWorldPos) {
        this.callbacks.onFocusWorldPos(
          this.currentAlertTarget.x,
          this.currentAlertTarget.z,
          this.currentAlertTarget.lineageId || null
        );
      }
    });

    const dismissBtn = el('button', 'hud-btn hud-btn-sm', '✕');
    dismissBtn.type = 'button';
    dismissBtn.title = 'Fermer la bannière';
    dismissBtn.addEventListener('click', () => {
      this.hideAlertBanner();
    });

    actions.append(this.trackPatientZeroBtn, dismissBtn);
    this.alertBanner.append(this.alertPortraitWrap, this.alertIconWrap, body, actions);
    this.centerCol.appendChild(this.alertBanner);
    this.root.appendChild(this.centerCol);
  }

  /**
   * Met à jour l'état visuel du bouton Mute/Unmute de la barre supérieure.
   * @param {boolean} isMuted
   */
  setAudioMuteUI(isMuted) {
    this.audioSettings.muted = Boolean(isMuted);
    if (this.muteToggleBtn) {
      this.muteToggleBtn.classList.toggle('is-muted', Boolean(isMuted));
      this.muteToggleBtn.textContent = isMuted
        ? tr('🔇 Muted', '🔇 Muet')
        : tr('🔊 Audio', '🔊 Audio');
    }
    if (this.lyriaStatusPill) {
      this.lyriaStatusPill.classList.toggle('is-muted', Boolean(isMuted));
    }
    if (this.isSettingsModalOpen) {
      this.renderSettingsModalContent();
    }
  }

  /**
   * Met à jour la bannière d'Onboarding Guidé (Actes 1 à 7) en haut au centre,
   * y compris le portrait Nano Banana d'Aldric (Actes 1–4) ou Kaelen (Actes 5–7),
   * son badge d'émotion, sa classe d'animation « simagrée » et sa réplique vocale.
   *
   * @param {Object} state - État courant de l'acte d'onboarding.
   * @param {boolean} [state.visible=true] - Affiche ou masque la carte.
   * @param {number} [state.actNumber=1] - Numéro de l'acte (`1..7`).
   * @param {string|number|null} [state.subStep=null] - Sous-étape courante.
   * @param {number} [state.totalActs=7] - Nombre total d'actes (`7`).
   * @param {string} [state.stepLabel] - Libellé d'étape (ex. `'Acte 1/7'`).
   * @param {string} [state.title] - Titre narratif et mécanique.
   * @param {string} [state.instructionText] - Instructions détaillées.
   * @param {string} [state.whyItMatters] - Encadré pédagogique expliquant l'utilité stratégique.
   * @param {Array<{key: string, action: string}>} [state.keyBadges] - Badges de touches/souris.
   * @param {string} [state.objectiveText] - Objectif actif en cours.
   * @param {string} [state.progressText] - Compteur de progression (ex. `'1 / 2'`).
   * @param {boolean} [state.isCompleted=false] - Si l'objectif vient d'être validé.
   */
  updateOnboardingBanner(state = {}) {
    if (!this.onboardingCard) return;
    if (state.visible === false || this.onboardingDismissedByUser) {
      this.onboardingCard.classList.add('is-hidden');
      return;
    }

    this.onboardingCard.classList.remove('is-hidden');
    const actNum = state.actNumber || 1;
    this._currentOnboardingActNum = actNum;
    this._lastOnboardingState = state;
    const total = state.totalActs || 7;
    this.onboardingStepBadge.textContent =
      state.stepLabel || tr(`ACT ${actNum} / ${total}`, `ACTE ${actNum} / ${total}`);
    const pct = Math.min(100, Math.max(8, Math.round((actNum / total) * 100)));
    this.onboardingProgressFill.style.width = `${pct}%`;

    // Mise à jour du portrait Nano Banana & Simagrée d'Aldric / Kaelen
    const pres = getTutorialDialoguePresentation(actNum, state.subStep ?? null);
    if (pres) {
      const lang = typeof getLanguage === 'function' ? getLanguage() : 'en';
      const portraitSig = `${lang}|${pres.actNumber}|${pres.subStep || ''}|${pres.portraitUrl}|${pres.simagreeClass}`;
      if (this._lastPortraitSig !== portraitSig) {
        this._lastPortraitSig = portraitSig;
        this._currentPortraitPrimaryUrl = pres.portraitUrl;
        this._currentPortraitSecondaryUrl = pres.secondaryExpressionUrl || pres.portraitUrl;
        this._portraitAltToggle = false;

        if (this.portraitImgEl) {
          this.portraitImgEl.src = pres.portraitUrl;
          this.portraitImgEl.alt = `${pres.speaker} (${pres.emotionLabel})`;
        }
        if (this.portraitFrameEl) {
          const allSimClasses = Object.values(SIMAGREE_ANIMATION_CLASSES);
          this.portraitFrameEl.classList.remove(...allSimClasses);
          if (pres.simagreeClass) {
            this.portraitFrameEl.classList.add(pres.simagreeClass);
          }
          if (pres.themeColor) {
            this.portraitFrameEl.style.borderColor = pres.themeColor;
          }
        }
        if (this.portraitSpecimenPipEl) {
          if (pres.specimenPortraitUrl) {
            this.portraitSpecimenPipEl.src = pres.specimenPortraitUrl;
            this.portraitSpecimenPipEl.classList.remove('is-hidden');
          } else {
            this.portraitSpecimenPipEl.classList.add('is-hidden');
          }
        }
        if (this.speakerNameEl) {
          this.speakerNameEl.textContent = pres.speaker;
          if (pres.themeColor) {
            this.speakerNameEl.style.color = pres.themeColor;
          }
        }
        if (this.emotionBadgeEl) {
          this.emotionBadgeEl.textContent = pres.emotionLabel;
        }
        if (this.onboardingQuoteEl) {
          this.onboardingQuoteEl.textContent = pres.quote || '';
        }
        if (this.onboardingQuoteRow && pres.themeColor) {
          this.onboardingQuoteRow.style.borderLeftColor = pres.themeColor;
        }
      }
    }

    const rawTitle = translateString(state.title || '');
    const rawObj = translateString(state.objectiveText || rawTitle || '');
    const rawProg = state.progressText ? ` (${state.progressText})` : '';
    const actPrefix = tr(`Act ${actNum}/${total}:`, `Acte ${actNum}/${total} :`);
    if (this.onboardingCompactTextEl) {
      this.onboardingCompactTextEl.textContent = `${state.isCompleted ? '✅ ' : ''}${actPrefix} ${rawObj}${rawProg}`;
      this.onboardingCompactTextEl.title = translateString(state.instructionText || rawObj);
    }

    this.onboardingTitleEl.textContent = rawTitle;
    this.onboardingDescEl.textContent = translateString(state.instructionText || '');

    if (state.whyItMatters) {
      this.onboardingWhyEl.textContent = `💡 ${translateString(state.whyItMatters)}`;
      this.onboardingWhyEl.style.display = 'block';
    } else {
      this.onboardingWhyEl.style.display = 'none';
    }

    const badges = Array.isArray(state.keyBadges) ? state.keyBadges : [];
    const keySig = badges.map((b) => `${b.key}:${b.action}`).join('|');
    if (this._lastOnboardingKeySig !== keySig) {
      this._lastOnboardingKeySig = keySig;
      this.onboardingKeysRow.replaceChildren();
      for (const b of badges) {
        const pill = el('div', 'hud-key-badge-item');
        pill.append(
          el('kbd', 'hud-key-cap', b.key || ''),
          el('span', 'hud-key-action-label', b.action || '')
        );
        this.onboardingKeysRow.appendChild(pill);
      }
    }

    this.onboardingObjIcon.textContent = state.isCompleted ? '✅' : '🎯';
    this.onboardingObjText.textContent = rawObj;
    this.onboardingObjProgress.textContent = state.progressText || '';
    this.onboardingObjProgress.classList.toggle('is-completed', Boolean(state.isCompleted));
  }

  /**
   * Masque la bannière d'Onboarding Guidé (une fois l'Acte 7 terminé ou le tutoriel passé).
   */
  hideOnboardingBanner() {
    if (this.onboardingCard) {
      this.onboardingCard.classList.add('is-hidden');
    }
  }

  /**
   * Applique le dévoilement progressif (Progressive Disclosure) des panneaux du HUD selon l'Acte courant.
   * Ajoute une animation d'illumination dorée (`.hud-just-unlocked`) aux panneaux nouvellement déverrouillés.
   *
   * @param {Object} unlockedHud - Dictionnaire de visibilité issu de `OnboardingSteps.js`.
   * @param {Object} [minimapInstance=null] - Instance `Minimap` pour verrouiller/déverrouiller son conteneur.
   */
  setHudVisibility(unlockedHud = {}, minimapInstance = null) {
    const applyLockState = (element, key, isUnlocked) => {
      if (!element) return;
      const wasUnlocked = Boolean(this.previousUnlockedHud[key]);
      element.classList.toggle('hud-locked', !isUnlocked);

      if (isUnlocked && !wasUnlocked && Object.keys(this.previousUnlockedHud).length > 0) {
        element.classList.remove('hud-just-unlocked');
        void element.offsetWidth;
        element.classList.add('hud-just-unlocked');
        window.setTimeout(() => {
          element.classList.remove('hud-just-unlocked');
        }, 1800);
      }
    };

    const topEco = Boolean(unlockedHud.topEcoBar);
    const leftBastion = Boolean(unlockedHud.leftBastionPanel);
    const leftBuild = Boolean(unlockedHud.leftBuildSection);
    const leftScout = Boolean(unlockedHud.leftScoutRole);
    const leftLab = Boolean(unlockedHud.leftLabSection);
    const rightLineage = Boolean(unlockedHud.rightLineagePanel);
    const showMinimap = Boolean(unlockedHud.minimap);

    applyLockState(this.ecoGroup, 'topEcoBar', topEco);
    applyLockState(this.statsCluster, 'topStatsCluster', topEco);
    applyLockState(this.resGroup, 'topResGroup', leftBastion || topEco);
    applyLockState(this.leftPanel, 'leftBastionPanel', leftBastion);
    applyLockState(this.buildSection, 'leftBuildSection', leftBuild);
    applyLockState(this.scoutRowEl, 'leftScoutRole', leftScout);
    applyLockState(this.simLab, 'leftLabSection', leftLab);
    applyLockState(this.rightPanel, 'rightLineagePanel', rightLineage);

    if (minimapInstance && minimapInstance.container) {
      applyLockState(minimapInstance.container, 'minimap', showMinimap);
    }

    this.previousUnlockedHud = {
      topEcoBar: topEco,
      topStatsCluster: topEco,
      topResGroup: leftBastion || topEco,
      leftBastionPanel: leftBastion,
      leftBuildSection: leftBuild,
      leftScoutRole: leftScout,
      leftLabSection: leftLab,
      rightLineagePanel: rightLineage,
      minimap: showMinimap,
    };
  }

  /**
   * Met en surbrillance pulsante dorée (`.tutorial-highlight-pulse`) un bouton clé du HUD pendant le tutoriel.
   *
   * @param {'watchtower'|'scout'|'codex'|null} targetKey - Bouton à mettre en valeur ou `null`.
   */
  setTutorialHighlight(targetKey = null) {
    const buttons = [this.watchtowerBtn, this.scoutAssignBtn, this.openCodexBtn];
    for (const btn of buttons) {
      if (btn) btn.classList.remove('tutorial-highlight-pulse');
    }

    if (targetKey === 'watchtower' && this.watchtowerBtn) {
      this.watchtowerBtn.classList.add('tutorial-highlight-pulse');
    } else if (targetKey === 'scout' && this.scoutAssignBtn) {
      this.scoutAssignBtn.classList.add('tutorial-highlight-pulse');
    } else if (targetKey === 'codex' && this.openCodexBtn) {
      this.openCodexBtn.classList.add('tutorial-highlight-pulse');
    }
  }

  /**
   * Applique la configuration de portrait Nano Banana et d'animation « simagrée » à la bannière d'alerte.
   * @param {'patient_zero'|'eradicated'|'dragon_wrath'|'shark_landing'|'mole_eruption'|'prey_crisis'} alertType
   * @private
   */
  _applyAlertBannerPortrait(alertType = 'patient_zero') {
    const alertPres = getAlertBannerPortraitPresentation(alertType);
    if (!alertPres || !this.alertPortraitWrap) return;

    const allSimClasses = Object.values(SIMAGREE_ANIMATION_CLASSES);
    this.alertPortraitWrap.classList.remove(...allSimClasses);
    if (alertPres.simagreeClass) {
      this.alertPortraitWrap.classList.add(alertPres.simagreeClass);
    }
    if (alertPres.themeColor) {
      this.alertPortraitWrap.style.borderColor = alertPres.themeColor;
    }

    if (this.alertPortraitImg) {
      this.alertPortraitImg.src = alertPres.portraitUrl;
      this.alertPortraitImg.alt = alertPres.emotionLabel || alertType;
    }
    if (this.alertSpecimenPipImg) {
      if (alertPres.specimenPortraitUrl && alertType !== 'dragon_wrath') {
        this.alertSpecimenPipImg.src = alertPres.specimenPortraitUrl;
        this.alertSpecimenPipImg.classList.remove('is-hidden');
      } else if (
        (alertType === 'dragon_wrath' ||
          alertType === 'shark_landing' ||
          alertType === 'mole_eruption' ||
          alertType === 'prey_crisis') &&
        alertPres.secondaryExpressionUrl
      ) {
        this.alertSpecimenPipImg.src = alertPres.secondaryExpressionUrl;
        this.alertSpecimenPipImg.classList.remove('is-hidden');
      } else {
        this.alertSpecimenPipImg.classList.add('is-hidden');
      }
    }
  }

  /**
   * Nettoie toutes les classes de variantes visuelles de `this.alertBanner`.
   * @private
   */
  _resetAlertBannerVariantClasses() {
    if (!this.alertBanner) return;
    this.alertBanner.classList.remove(
      'is-hidden',
      'is-eradicated',
      'is-dragon-wrath',
      'is-shark-landing',
      'is-mole-eruption',
      'is-prey-crisis',
      'is-relic-found'
    );
  }

  /**
   * Déclenche la bannière d'alerte prioritaire lorsqu'un Éclaireur découvre un Mutant ou Hybride.
   * Mentionne explicitement si la cible est encore un Bébé (Juvénile) avant maturité reproductive.
   *
   * @param {Object} discovery - Données de découverte transmises par l'Éclaireur.
   * @param {Object} [discovery.enemy] - Entité ennemie découverte.
   * @param {string[]} [discovery.mutations] - Liste des clés de mutations.
   * @param {boolean} [discovery.isHybrid] - Indique s'il s'agit d'un hybride.
   * @param {string} [discovery.speciesName] - Nom de l'espèce ou de l'hybride.
   */
  showScoutAlert(discovery = {}) {
    const enemy = discovery.enemy || {};
    const genome = enemy.genome || {};
    const mutations = discovery.mutations || genome.mutations || [];
    const isHybrid = Boolean(discovery.isHybrid ?? genome.isHybrid);
    const speciesName =
      discovery.speciesName ||
      genome.speciesName ||
      CONFIG.SPECIES?.[genome.speciesId]?.name ||
      tr('Creature', 'Créature');

    const ex = enemy.x ?? enemy.pos?.x ?? enemy.mesh?.position?.x ?? 0;
    const ez = enemy.z ?? enemy.pos?.z ?? enemy.mesh?.position?.z ?? 0;
    const sector = getCardinalLabelFR(ex, ez);
    const distFromBastion = Math.round(Math.hypot(ex, ez));

    const isBaby = enemy.lifeStage === 'baby' || enemy.isAdult === false;
    const mutId = mutations[0] || null;
    const mutDef = mutId ? CONFIG.MUTATIONS?.[mutId] : null;
    const traitLabel = mutDef
      ? mutDef.name
      : isHybrid
        ? tr(`Fertile Hybrid (${speciesName})`, `Hybride Fertile (${speciesName})`)
        : tr('Dominant Mutation', 'Mutation Dominante');

    this.currentAlertTarget = {
      x: ex,
      z: ez,
      lineageId: mutId || genome.speciesId || genome.lineageId,
    };

    this._applyAlertBannerPortrait('patient_zero');
    this._resetAlertBannerVariantClasses();
    this.alertIconWrap.textContent = '🦅';
    this.trackPatientZeroBtn.className = 'hud-btn hud-btn-threat';
    this.trackPatientZeroBtn.textContent = tr(
      '🎯 TRACK PATIENT ZERO',
      '🎯 TRAQUER LE PATIENT ZÉRO'
    );
    this.trackPatientZeroBtn.style.display = 'inline-flex';

    const babyTag = isBaby ? tr('🐣 JUVENILE BABY — ', '🐣 BÉBÉ JUVÉNILE — ') : '';
    this.alertTitleEl.textContent = tr(
      `🦅 SCOUT ALERT: ${babyTag}${speciesName.toUpperCase()} [${traitLabel}]`,
      `🦅 ALERTE ÉCLAIREUR : ${babyTag}${speciesName.toUpperCase()} [${traitLabel}]`
    );

    if (isBaby) {
      this.alertDescEl.textContent = tr(
        `New [${speciesName} — ${traitLabel}] spotted in the ${sector} (${distFromBastion}m)! Still a Juvenile (cannot breed yet): eliminate this Patient Zero before it matures!`,
        `Nouveau [${speciesName} — ${traitLabel}] repéré au ${sector} (${distFromBastion}m) ! Il est encore Juvénile (non reproducteur) : éliminez ce Patient Zéro avant son passage à l’âge adulte !`
      );
    } else {
      this.alertDescEl.textContent = tr(
        `New [${speciesName} — ${traitLabel}] spotted in the ${sector} (${distFromBastion}m)! Eliminate this Patient Zero before the next breeding cycle!`,
        `Nouveau [${speciesName} — ${traitLabel}] repéré au ${sector} (${distFromBastion}m) ! Éliminez le Patient Zéro avant le prochain cycle de reproduction !`
      );
    }

    if (this.alertTimeoutId) {
      clearTimeout(this.alertTimeoutId);
    }
    this.alertTimeoutId = window.setTimeout(() => {
      this.hideAlertBanner();
    }, 11000);
  }

  /**
   * Affiche une bannière de célébration lorsqu'une lignée mutante entière est éradiquée à temps.
   * @param {string} mutationId - Identifiant de la mutation éradiquée.
   * @param {Object} [lastEnemy] - Dernier porteur éliminé.
   */
  showEradicationBanner(mutationId, lastEnemy = null) {
    const mutDef = CONFIG.MUTATIONS?.[mutationId];
    const mutName = mutDef ? mutDef.name : mutationId || tr('Mutant Lineage', 'Lignée Mutante');
    const speciesName = lastEnemy?.genome?.speciesName || tr('Carrier', 'Porteur');

    this._applyAlertBannerPortrait('eradicated');
    this._resetAlertBannerVariantClasses();
    this.alertBanner.classList.add('is-eradicated');
    this.alertIconWrap.textContent = '✨';
    this.trackPatientZeroBtn.style.display = 'none';

    this.alertTitleEl.textContent = tr(
      `🏆 MUTANT LINEAGE ERADICATED: ${mutName.toUpperCase()}`,
      `🏆 LIGNÉE MUTANTE ÉRADIQUÉE : ${mutName.toUpperCase()}`
    );
    this.alertDescEl.textContent = tr(
      `The last carrier (${speciesName}) has been neutralized! Dominant mutation [${mutName}] can no longer spread across the ecosystem.`,
      `Le dernier porteur (${speciesName}) a été neutralisé ! La mutation dominante [${mutName}] ne peut plus se propager dans l'écosystème.`
    );

    if (this.alertTimeoutId) {
      clearTimeout(this.alertTimeoutId);
    }
    this.alertTimeoutId = window.setTimeout(() => {
      this.hideAlertBanner();
    }, 8000);
  }

  /**
   * Affiche la bannière cramoisie de Courroux Collectif lorsqu'un Dragon Souverain pacifique est attaqué.
   * @param {string} [speciesId='dragon']
   * @param {Object|null} [targetEnemy=null]
   */
  showSpeciesWrathBanner(speciesId = 'dragon', targetEnemy = null) {
    if (!this.alertBanner) return;
    const spName = CONFIG.SPECIES?.[speciesId]?.name || 'Dragon';
    const ex = targetEnemy?.x ?? 0;
    const ez = targetEnemy?.z ?? 0;

    this.currentAlertTarget = {
      x: 0,
      z: 0,
      lineageId: speciesId,
    };

    this._applyAlertBannerPortrait('dragon_wrath');
    this._resetAlertBannerVariantClasses();
    this.alertBanner.classList.add('is-dragon-wrath');
    this.alertIconWrap.textContent = '🐉';
    this.trackPatientZeroBtn.className = 'hud-btn hud-btn-threat';
    this.trackPatientZeroBtn.textContent = tr(
      '🏰 DEFEND THE BASTION',
      '🏰 DÉFENDRE LE BASTION'
    );
    this.trackPatientZeroBtn.style.display = 'inline-flex';

    this.alertTitleEl.textContent = tr(
      `🐉 DRACONIC WRATH! ALL ${spName.toUpperCase()}S ARE ATTACKING YOUR BASTION!`,
      `🐉 COURROUX DRACONIQUE ! TOUS LES ${spName.toUpperCase()}S ATTAQUENT VOTRE BASTION !`
    );
    this.alertDescEl.textContent = tr(
      `You provoked a Sovereign ${spName} (${Math.round(ex)}m, ${Math.round(ez)}m): the entire species enters collective rage (100% Aggression, ×1.25 Speed) and charges your Bastion to raze it!`,
      `Vous avez provoqué un ${spName} Souverain (${Math.round(ex)}m, ${Math.round(ez)}m) : toute l’espèce entre en rage collective (Agressivité 100%, Vitesse ×1.25) et fond sur votre Bastion ("notre villa") pour le raser !`
    );

    if (this.alertTimeoutId) {
      clearTimeout(this.alertTimeoutId);
    }
    this.alertTimeoutId = window.setTimeout(() => {
      this.hideAlertBanner();
    }, 14000);
  }

  /**
   * Affiche la bannière d'émergence abyssale lorsque les Requins de l'océan développent des pattes
   * (`amphibious_lungs`) et débarquent en marchant sur la plage !
   * @param {Object|Array} [eventData={}]
   */
  showSharkLandingAlert(eventData = {}) {
    if (!this.alertBanner) return;
    const isArr = Array.isArray(eventData);
    const shark = (isArr ? eventData[0] : eventData?.enemy || eventData?.sharks?.[0]) || {};
    const ex = (!isArr && eventData?.x) ?? shark.x ?? 68;
    const ez = (!isArr && eventData?.z) ?? shark.z ?? 32;
    const sector = getCardinalLabelFR(ex, ez);
    const dist = Math.round(Math.hypot(ex, ez));
    const count = isArr ? eventData.length || 1 : eventData?.count || eventData?.sharks?.length || 1;

    this.currentAlertTarget = {
      x: ex,
      z: ez,
      lineageId: 'amphibious_lungs',
    };

    this._applyAlertBannerPortrait('shark_landing');
    this._resetAlertBannerVariantClasses();
    this.alertBanner.classList.add('is-shark-landing');
    this.alertIconWrap.textContent = '🦈';
    this.trackPatientZeroBtn.className = 'hud-btn hud-btn-abyss';
    this.trackPatientZeroBtn.textContent = tr(
      '🦈 TARGET THE BEACH',
      '🦈 CIBLER LA PLAGE'
    );
    this.trackPatientZeroBtn.style.display = 'inline-flex';

    this.alertTitleEl.textContent = tr(
      `🦈 ABYSSAL EMERGENCE: ${count > 1 ? `${count} WALKING SHARKS LANDING` : 'A WALKING SHARK LANDS'} IN THE ${sector.toUpperCase()}!`,
      `🦈 ÉMERGENCE ABYSSALE : ${count > 1 ? `${count} REQUINS MARCHEURS DÉBARQUENT` : 'UN REQUIN MARCHEUR DÉBARQUE'} AU ${sector.toUpperCase()} !`
    );
    this.alertDescEl.textContent = tr(
      `Ocean sharks (${dist}m) have mutated [Amphibious Legs & Gills]: they crawl out of the waves onto the beach and can hybridize with Wolves ("Shark-Wolf")!`,
      `Les squales de l’océan (${dist}m) ont muté [Pattes & Branchies Amphibies] : ils sortent des vagues sur leurs pattes griffues, marchent sur la plage et peuvent s’hybrider avec les Loups ("Squale-Garou") !`
    );

    if (this.alertTimeoutId) {
      clearTimeout(this.alertTimeoutId);
    }
    this.alertTimeoutId = window.setTimeout(() => {
      this.hideAlertBanner();
    }, 12500);
  }

  /**
   * Affiche la bannière d'éruption souterraine lorsque des Taupes Géantes Fouisseuses surgissent des profondeurs.
   * @param {Object|Array} [eventData={}]
   */
  showMoleEruptionAlert(eventData = {}) {
    if (!this.alertBanner) return;
    const isArr = Array.isArray(eventData);
    const mole = (isArr ? eventData[0] : eventData?.enemy || eventData?.moles?.[0]) || {};
    const ex = (!isArr && eventData?.x) ?? mole.x ?? -48;
    const ez = (!isArr && eventData?.z) ?? mole.z ?? 44;
    const sector = getCardinalLabelFR(ex, ez);
    const dist = Math.round(Math.hypot(ex, ez));
    const count = isArr ? eventData.length || 1 : eventData?.count || eventData?.moles?.length || 1;

    this.currentAlertTarget = {
      x: ex,
      z: ez,
      lineageId: 'giant_mole',
    };

    this._applyAlertBannerPortrait('mole_eruption');
    this._resetAlertBannerVariantClasses();
    this.alertBanner.classList.add('is-mole-eruption');
    this.alertIconWrap.textContent = '🕳️';
    this.trackPatientZeroBtn.className = 'hud-btn hud-btn-earth';
    this.trackPatientZeroBtn.textContent = tr(
      '🕳️ TARGET THE TUNNEL',
      '🕳️ CIBLER LA GALERIE'
    );
    this.trackPatientZeroBtn.style.display = 'inline-flex';

    this.alertTitleEl.textContent = tr(
      `🕳️ SUBTERRANEAN ERUPTION: ${count > 1 ? `${count} GIANT BURROWING MOLES` : 'GIANT BURROWING MOLE'} IN THE ${sector.toUpperCase()}!`,
      `🕳️ ÉRUPTION SOUTERRAINE : ${count > 1 ? `${count} TAUPES GÉANTES FOUISSEUSES` : 'TAUPE GÉANTE FOUISSEUSE'} AU ${sector.toUpperCase()} !`
    );
    this.alertDescEl.textContent = tr(
      `A subterranean tunnel just opened (${dist}m)! These metal-clawed colossi can hybridize with Trolls ("Mole-Colossus"): intercept them!`,
      `Une galerie tellurique vient de s’ouvrir (${dist}m) ! Ces colosses souterrains aux griffes métalliques peuvent s’hybrider avec les Trolls ("Taupe-Colosse") : interceptez-les !`
    );

    if (this.alertTimeoutId) {
      clearTimeout(this.alertTimeoutId);
    }
    this.alertTimeoutId = window.setTimeout(() => {
      this.hideAlertBanner();
    }, 12500);
  }

  /**
   * Affiche la bannière d'alerte écologique lorsque les sorts de zone du joueur déciment le gibier
   * (`deer` Biche Sylvestre / `rabbit` Lapin des Plaines) ou provoquent une crise de famine.
   * @param {Object} [crisisData={}]
   * @param {Object|null} [enemy=null]
   * @param {boolean} [isSpellDamage=false]
   */
  showPreyEcologicalCrisisAlert(crisisData = {}, enemy = null, isSpellDamage = false) {
    if (!this.alertBanner) return;
    const speciesId =
      crisisData.speciesId ||
      enemy?.genome?.speciesId ||
      (typeof crisisData.deer === 'number' && crisisData.deer < 2 ? 'deer' : 'rabbit');
    const spName =
      speciesId === 'rabbit'
        ? tr('Plains Rabbits', 'Lapins des Plaines')
        : speciesId === 'deer'
          ? tr('Sylvan Deer', 'Biches Sylvestres')
          : tr('Herbivore Prey Herds', 'Troupeaux de Gibier');
    const remaining =
      crisisData.remainingPrey ??
      crisisData.remainingCount ??
      (speciesId === 'rabbit' ? crisisData.rabbit : crisisData.deer) ??
      crisisData.total ??
      0;

    this.currentAlertTarget = {
      x: 0,
      z: 0,
      actionType: 'reintroduce_prey',
    };

    this._applyAlertBannerPortrait('prey_crisis');
    this._resetAlertBannerVariantClasses();
    this.alertBanner.classList.add('is-prey-crisis');
    this.alertIconWrap.textContent = '🦌';
    this.trackPatientZeroBtn.className = 'hud-btn hud-btn-prey is-urgent-reintroduce';
    this.trackPatientZeroBtn.textContent = tr(
      '🌿 REINTRODUCE PREY (25 BIO)',
      '🌿 RÉINTRODUIRE GIBIER (25 BIO)'
    );
    this.trackPatientZeroBtn.style.display = 'inline-flex';

    const causeText =
      isSpellDamage || crisisData.isSpellDamage
        ? tr('DECIMATED BY YOUR SPELLS', 'DÉCIMÉS PAR VOS SORTS')
        : tr('NEAR EXTINCTION', 'EN VOIE D’EXTINCTION');
    this.alertTitleEl.textContent = tr(
      `⚠️ ECOLOGICAL CRISIS: ${spName.toUpperCase()} ${causeText} (${remaining} REMAINING)!`,
      `⚠️ ALERTE ÉCOLOGIQUE : ${spName.toUpperCase()} ${causeText} (${remaining} RESTANT) !`
    );
    this.alertDescEl.textContent = tr(
      'Unlike monsters, Deer and Rabbits DO NOT respawn on their own (<2 = Extinction)! Without prey, your Rations (🍖) drop to zero and starving predators charge the Bastion!',
      'Contrairement aux monstres, les Biches et Lapins ne réapparaissent PAS tout seuls (<2 = Extinction) ! Sans gibier, vos Rations (🍖) tombent à zéro et tous les prédateurs affamés fondent sur le Bastion !'
    );

    if (this.alertTimeoutId) {
      clearTimeout(this.alertTimeoutId);
    }
    this.alertTimeoutId = window.setTimeout(() => {
      this.hideAlertBanner();
    }, 14500);
  }

  /**
   * Affiche la bannière de découverte d'un Fragment de Relique d'Éden (`1/3`, `2/3`, ou `3/3` prêt pour le Bouclier).
   * @param {Object} [relicData={}]
   */
  showRelicCollectedAlert(relicData = {}) {
    if (!this.alertBanner) return;
    const collected = relicData.collectedCount ?? relicData.collected ?? 1;
    const required = relicData.requiredCount ?? RELIC_FRAGMENTS_SPEC.requiredCount ?? 3;
    const relicName =
      relicData.name ||
      relicData.shrine?.name ||
      tr(`Eden Fragment #${collected}`, `Fragment d’Éden #${collected}`);
    const isComplete = collected >= required;

    this.currentAlertTarget = {
      x: 0,
      z: 0,
      actionType: 'activate_island_shield',
    };

    this._applyAlertBannerPortrait('relic_found');
    this._resetAlertBannerVariantClasses();
    this.alertBanner.classList.add('is-relic-found');
    this.alertIconWrap.textContent = isComplete ? '🛡️' : '🧩';
    this.trackPatientZeroBtn.className = `hud-btn hud-btn-shield${isComplete ? ' is-shield-ready' : ''}`;
    this.trackPatientZeroBtn.textContent = isComplete
      ? tr('🛡️ RAISE ISLAND SHIELD [V]', '🛡️ ÉRIGER LE BOUCLIER DE L’ÎLE [V]')
      : tr(`🧩 ${collected}/${required} RELICS (VIEW SHIELD)`, `🧩 ${collected}/${required} RELIQUES (VOIR BOUCLIER)`);
    this.trackPatientZeroBtn.style.display = 'inline-flex';

    this.alertTitleEl.textContent = isComplete
      ? tr(
          `🛡️ ALL ${required} EDEN RELICS ASSEMBLED (${collected}/${required})!`,
          `🛡️ LES ${required} RELIQUES D’ÉDEN SONT RÉUNIES (${collected}/${required}) !`
        )
      : tr(
          `🧩 EDEN RELIC ASSEMBLED: ${relicName.toUpperCase()} (${collected}/${required})`,
          `🧩 RELIQUE D’ÉDEN ASSEMBLÉE : ${relicName.toUpperCase()} (${collected}/${required})`
        );
    this.alertDescEl.textContent = isComplete
      ? tr(
          'The Solar Artifact is complete! Press [V] or click the button to deploy the Planetary Shield Dome across the island and clear the zone!',
          'L’Artefact Solaire est complet ! Appuyez sur [V] ou cliquez sur le bouton pour déployer le Dôme-Bouclier Planétaire sur toute l’île et valider la zone !'
        )
      : tr(
          `+50 XP & +15 Crystal! Find the remaining ${required - collected} runic monolith(s) on the island to unlock the Planetary Shield Dome!`,
          `+50 XP & +15 Cristal ! Retrouvez les ${required - collected} monolithe(s) runique(s) restant(s) sur l’île pour débloquer le Dôme-Bouclier Planétaire !`
        );

    if (this.alertTimeoutId) {
      clearTimeout(this.alertTimeoutId);
    }
    this.alertTimeoutId = window.setTimeout(() => {
      this.hideAlertBanner();
    }, 12000);
  }

  /**
   *Masque la bannière d'alerte centrale.
   */
  hideAlertBanner() {
    if (this.alertBanner) {
      this.alertBanner.classList.add('is-hidden');
    }
  }

  /* ==========================================================================
     4. PANNEAU DROIT : QUÊTE PRIORITAIRE, RADAR GÉNÉTIQUE & LIGNÉES MUTANTES
     ========================================================================== */
  _buildRightPanel() {
    this.rightPanel = el('aside', 'hud-side-panel hud-right-panel hud-interactive');

    const header = el('div', 'hud-panel-header');
    header.append(
      el('h2', 'hud-panel-title', '🧬 Quêtes, Radar & Lignées'),
      (this.lineageSubtitleEl = el('span', 'hud-panel-subtitle', 'Mendel 78% / 92%'))
    );

    // 4A. Encart Quête Dynamique Prioritaire (Mission Éclaireurs -> Extermination Lignée)
    this.questCardEl = el('div', 'hud-quest-card');
    const qHeader = el('div', 'hud-quest-header');
    this.questTitleEl = el(
      'div',
      'hud-quest-title',
      '📜 Opération : Éradication — Trolls de Feu'
    );
    this.questPhaseBadgeEl = el('span', 'hud-lineage-badge badge-pz', 'PHASE 1/2');
    qHeader.append(this.questTitleEl, this.questPhaseBadgeEl);

    const qSteps = el('div', 'hud-quest-steps');
    this.questStep1El = el(
      'div',
      'hud-quest-step is-active',
      '🔍 1. Éclaireurs : Localiser tous les Trolls de Feu (0/1 repéré)'
    );
    this.questStep2El = el(
      'div',
      'hud-quest-step',
      '⚔️ 2. Extermination : Éliminer toute la lignée (1 restant)'
    );
    qSteps.append(this.questStep1El, this.questStep2El);

    this.questHintEl = el(
      'div',
      'hud-lineage-warning',
      '💡 Ordonnez aux Éclaireurs de traquer la lignée pour révéler tous les porteurs sur la carte !'
    );

    const qFooter = el('div', 'hud-quest-footer');
    this.questRewardEl = el(
      'span',
      'hud-quest-reward',
      '🎁 +45 Bois · +35 Cristal · +30 Bio · +120 XP'
    );
    this.questActionBtn = el(
      'button',
      'hud-btn hud-btn-sm hud-btn-scout',
      '🦅 Lancer Traque Éclaireurs'
    );
    this.questActionBtn.type = 'button';
    this.questActionBtn.addEventListener('click', () => {
      if (this.callbacks.onTriggerQuestAction) {
        this.callbacks.onTriggerQuestAction(this._currentPrimaryQuest || null);
      } else if (this.callbacks.onSetScoutMission) {
        this.callbacks.onSetScoutMission(
          'track_lineage',
          this._currentPrimaryQuest?.targetMutationId || 'pyro_gland'
        );
      }
    });
    qFooter.append(this.questRewardEl, this.questActionBtn);

    this.questCardEl.append(qHeader, qSteps, this.questHintEl, qFooter);

    // 4B. Résumé de la grille écologique de Conway
    const conwayBlock = el('div', 'hud-section-block');
    conwayBlock.appendChild(
      el('div', 'hud-section-label', 'Cellules Écologiques (Jeu de la Vie)')
    );
    const conwaySummary = el('div', 'hud-conway-summary');

    const optCell = el('div', 'hud-conway-cell');
    this.conwayOptVal = el('div', 'hud-conway-cell-val', '0');
    this.conwayOptVal.style.color = '#38c172';
    optCell.append(this.conwayOptVal, el('div', 'hud-conway-cell-lbl', 'Optimales (2-5)'));

    const famCell = el('div', 'hud-conway-cell');
    this.conwayFamVal = el('div', 'hud-conway-cell-val', '0');
    this.conwayFamVal.style.color = '#ff4757';
    famCell.append(this.conwayFamVal, el('div', 'hud-conway-cell-lbl', 'Famine (>6)'));

    const isoCell = el('div', 'hud-conway-cell');
    this.conwayIsoVal = el('div', 'hud-conway-cell-val', '0');
    this.conwayIsoVal.style.color = '#70a1ff';
    isoCell.append(this.conwayIsoVal, el('div', 'hud-conway-cell-lbl', 'Sous-pop (<2)'));

    conwaySummary.append(optCell, famCell, isoCell);
    conwayBlock.appendChild(conwaySummary);

    // 4C. Liste des lignées mutantes & hybrides
    const lineageBlock = el('div', 'hud-section-block');
    lineageBlock.appendChild(
      el('div', 'hud-section-label', 'Lignées Mutantes & Hybrides Actives')
    );
    this.lineageListEl = el('div', 'hud-lineage-list');
    lineageBlock.appendChild(this.lineageListEl);

    this.rightPanel.append(header, this.questCardEl, conwayBlock, lineageBlock);
    this.root.appendChild(this.rightPanel);
  }

  /**
   * Met à jour la liste des lignées mutantes et hybrides dans le panneau droit.
   * Combine le rapport de `ecoSim.getLineageReport(enemies)` et l'analyse directe des ennemis vivants
   * (afin d'afficher le détail Adultes reproducteurs vs Bébés juvéniles, le cycle de gestation,
   * l'agressivité, l'étendue phénotypique `[Papa, Maman] ± 10%`, et un bouton direct de traque).
   *
   * @param {Object} ecoSim - Instance `EcosystemSimulator`.
   * @param {Array<Object>} enemies - Liste des ennemis vivants.
   */
  _updateLineagesPanel(ecoSim, enemies = []) {
    if (!this.lineageListEl) return;

    // 1. Mise à jour des compteurs de cellules Conway
    if (ecoSim && typeof ecoSim.getGridSnapshot === 'function') {
      const cells = ecoSim.getGridSnapshot() || [];
      let optCount = 0;
      let famCount = 0;
      let isoCount = 0;
      for (const c of cells) {
        if (!c) continue;
        if (c.densityState === 'optimal') optCount++;
        else if (c.densityState === 'overpopulated') famCount++;
        else if (c.densityState === 'underpopulated' && c.enemyCount > 0) isoCount++;
      }
      this.conwayOptVal.textContent = String(optCount);
      this.conwayFamVal.textContent = String(famCount);
      this.conwayIsoVal.textContent = String(isoCount);
    }

    // 2. Agrégation des lignées mutantes et hybrides
    const reportMap = new Map();

    if (ecoSim && typeof ecoSim.getLineageReport === 'function') {
      const rawReport = ecoSim.getLineageReport(enemies) || [];
      for (const item of rawReport) {
        if (!item || !item.id) continue;
        reportMap.set(item.id, {
          id: item.id,
          name: item.name || item.id,
          type: item.type || 'mutation',
          count: item.count ?? 0,
          adultCount: 0,
          babyCount: 0,
          spottedCount: 0,
          minMaturationRem: null,
          maxFitness: 0,
          maxHpVal: 0,
          maxStrengthVal: 0,
          maxSpeedVal: 0,
          gestationSum: 0,
          aggroSum: 0,
          sampleCount: 0,
          speciesNames: new Set(),
          generationMax: item.generationMax || 1,
          discoveredByScout: Boolean(item.discoveredByScout),
          patientZeroPos: item.patientZeroPos || null,
          status: item.status || 'latent',
        });
      }
    }

    // Enrichissement direct depuis les entités vivantes
    for (const enemy of enemies) {
      if (!enemy || enemy.dead || (typeof enemy.hp === 'number' && enemy.hp <= 0)) continue;
      const genome = enemy.genome || {};
      const genes = genome.genes || {};
      const spId = genome.speciesId || 'goblin';
      const spDefaults = SPECIES_CYCLE_AND_AGGRO_DEFAULTS[spId] || {};
      const isBaby = enemy.lifeStage === 'baby' || enemy.isAdult === false;
      const spName = genome.speciesName || CONFIG.SPECIES?.[spId]?.name || 'Créature';
      const fit = genome.fitnessScore || 1.0;
      const matRem =
        isBaby && typeof enemy.maturationTime === 'number' && typeof enemy.age === 'number'
          ? Math.max(0, enemy.maturationTime - enemy.age)
          : null;

      const hpVal = Number(enemy.maxHp || genes.maxHp || CONFIG.SPECIES?.[spId]?.baseHp || 90);
      const strVal = Number(
        enemy.damage || genes.strength || CONFIG.SPECIES?.[spId]?.baseDamage || 15
      );
      const spdVal = Number(enemy.speed || genes.speed || CONFIG.SPECIES?.[spId]?.baseSpeed || 6.5);
      const gestVal = Number(
        enemy.gestationTime ||
          genes.gestationTime ||
          CONFIG.SPECIES?.[spId]?.baseGestationTime ||
          spDefaults.baseGestationTime ||
          18
      );
      const aggroVal = Number(
        enemy.aggressiveness ??
          genes.aggressiveness ??
          CONFIG.SPECIES?.[spId]?.baseAggressiveness ??
          spDefaults.baseAggressiveness ??
          0.7
      );

      // Mutations portées par l'ennemi
      const muts = Array.isArray(genome.mutations) ? genome.mutations : [];
      for (const mutId of muts) {
        const mutDef = CONFIG.MUTATIONS?.[mutId];
        if (!reportMap.has(mutId)) {
          reportMap.set(mutId, {
            id: mutId,
            name: mutDef ? mutDef.name : mutId,
            type: 'mutation',
            count: 0,
            adultCount: 0,
            babyCount: 0,
            spottedCount: 0,
            minMaturationRem: null,
            maxFitness: 0,
            maxHpVal: 0,
            maxStrengthVal: 0,
            maxSpeedVal: 0,
            gestationSum: 0,
            aggroSum: 0,
            sampleCount: 0,
            speciesNames: new Set(),
            generationMax: genome.generation || 1,
            discoveredByScout: Boolean(enemy.spottedByScout),
            patientZeroPos: { x: enemy.x, z: enemy.z },
            status: 'latent',
          });
        }
        const entry = reportMap.get(mutId);
        entry.speciesNames.add(spName);
        if (isBaby) {
          entry.babyCount++;
          if (matRem !== null && (entry.minMaturationRem === null || matRem < entry.minMaturationRem)) {
            entry.minMaturationRem = matRem;
          }
        } else {
          entry.adultCount++;
        }
        if (enemy.spottedByScout) {
          entry.spottedCount++;
          entry.discoveredByScout = true;
        }
        entry.count = Math.max(entry.count, entry.adultCount + entry.babyCount);
        entry.maxFitness = Math.max(entry.maxFitness, fit);
        entry.maxHpVal = Math.max(entry.maxHpVal || 0, hpVal);
        entry.maxStrengthVal = Math.max(entry.maxStrengthVal || 0, strVal);
        entry.maxSpeedVal = Math.max(entry.maxSpeedVal || 0, spdVal);
        entry.gestationSum = (entry.gestationSum || 0) + gestVal;
        entry.aggroSum = (entry.aggroSum || 0) + aggroVal;
        entry.sampleCount = (entry.sampleCount || 0) + 1;
        entry.generationMax = Math.max(entry.generationMax, genome.generation || 1);
        if (!entry.patientZeroPos) entry.patientZeroPos = { x: enemy.x, z: enemy.z };
      }

      // Hybrides inter-espèces
      if (genome.isHybrid) {
        const hybKey = genome.speciesId || `hybrid_${spName}`;
        if (!reportMap.has(hybKey)) {
          reportMap.set(hybKey, {
            id: hybKey,
            name: `Hybride : ${spName}`,
            type: 'hybrid',
            count: 0,
            adultCount: 0,
            babyCount: 0,
            spottedCount: 0,
            minMaturationRem: null,
            maxFitness: 0,
            maxHpVal: 0,
            maxStrengthVal: 0,
            maxSpeedVal: 0,
            gestationSum: 0,
            aggroSum: 0,
            sampleCount: 0,
            speciesNames: new Set([spName]),
            generationMax: genome.generation || 2,
            discoveredByScout: Boolean(enemy.spottedByScout),
            patientZeroPos: { x: enemy.x, z: enemy.z },
            status: 'spreading',
          });
        }
        const hEntry = reportMap.get(hybKey);
        hEntry.speciesNames.add(spName);
        if (isBaby) {
          hEntry.babyCount++;
          if (matRem !== null && (hEntry.minMaturationRem === null || matRem < hEntry.minMaturationRem)) {
            hEntry.minMaturationRem = matRem;
          }
        } else {
          hEntry.adultCount++;
        }
        if (enemy.spottedByScout) {
          hEntry.spottedCount++;
          hEntry.discoveredByScout = true;
        }
        hEntry.count = Math.max(hEntry.count, hEntry.adultCount + hEntry.babyCount);
        hEntry.maxFitness = Math.max(hEntry.maxFitness, fit);
        hEntry.maxHpVal = Math.max(hEntry.maxHpVal || 0, hpVal);
        hEntry.maxStrengthVal = Math.max(hEntry.maxStrengthVal || 0, strVal);
        hEntry.maxSpeedVal = Math.max(hEntry.maxSpeedVal || 0, spdVal);
        hEntry.gestationSum = (hEntry.gestationSum || 0) + gestVal;
        hEntry.aggroSum = (hEntry.aggroSum || 0) + aggroVal;
        hEntry.sampleCount = (hEntry.sampleCount || 0) + 1;
        hEntry.generationMax = Math.max(hEntry.generationMax, genome.generation || 2);
      }
    }

    const lineages = Array.from(reportMap.values());

    // Mise à jour du compteur global dans la barre supérieure
    const activeLineagesCount = lineages.filter((l) => l.count > 0).length;
    if (this.mutCountValueEl) {
      this.mutCountValueEl.textContent = tr(
        `${activeLineagesCount} Active`,
        `${activeLineagesCount} Active${activeLineagesCount > 1 ? 's' : ''}`
      );
    }
    if (this.mutPill) {
      this.mutPill.classList.toggle('threat-active', activeLineagesCount > 0);
    }

    // Tri : Lignées actives d'abord (par nombre de porteurs), puis éradiquées
    lineages.sort((a, b) => {
      if ((a.count > 0) !== (b.count > 0)) return a.count > 0 ? -1 : 1;
      return b.count - a.count;
    });

    const sig = `${getLanguage()}|` + lineages
      .map(
        (l) =>
          `${l.id}:${l.count}:${l.adultCount}:${l.babyCount}:${l.spottedCount}:${Math.round(l.minMaturationRem || 0)}:${this.selectedLineageId === l.id ? 1 : 0}`
      )
      .join('|');
    if (this._lastLineageListSig === sig) {
      return;
    }
    this._lastLineageListSig = sig;

    this.lineageListEl.replaceChildren();

    if (lineages.length === 0) {
      this.lineageListEl.appendChild(
        el(
          'div',
          'hud-lineage-empty',
          'Aucune lignée mutante détectée. Envoyez vos Éclaireurs explorer au-delà de la frontière !'
        )
      );
      return;
    }

    for (const item of lineages) {
      const isEradicated = item.count === 0 || item.status === 'eradicated';
      const isPatientZeroSingle = item.count === 1;
      const statusClass = isEradicated
        ? 'status-eradicated'
        : isPatientZeroSingle
          ? 'status-patient-zero'
          : 'status-spreading';

      const card = el(
        'div',
        `hud-lineage-card ${statusClass}${this.selectedLineageId === item.id ? ' is-selected' : ''}`
      );

      const topRow = el('div', 'hud-lineage-top');
      const hostPrefix =
        item.speciesNames && item.speciesNames.size > 0
          ? `${Array.from(item.speciesNames).map((s) => translateString(s)).join('/')} — `
          : '';
      const nameSpan = el('span', 'hud-lineage-name', `${hostPrefix}${translateString(item.name)}`);

      let badgeText = tr('ERADICATED', 'ÉRADIQUÉ');
      let badgeClass = 'badge-eradicated';
      if (!isEradicated) {
        if (isPatientZeroSingle) {
          badgeText =
            item.babyCount === 1
              ? tr('🐣 BABY PATIENT ZERO', '🐣 PATIENT ZÉRO BÉBÉ')
              : tr('PATIENT ZERO (1)', 'PATIENT ZÉRO (1)');
          badgeClass = 'badge-pz';
        } else if (item.count >= 5 || item.status === 'dominant') {
          badgeText = `DOMINANT (${item.count})`;
          badgeClass = 'badge-pz';
        } else {
          badgeText = tr(`SPREADING (${item.count})`, `EN EXPANSION (${item.count})`);
          badgeClass = 'badge-spread';
        }
      }

      const badge = el('span', `hud-lineage-badge ${badgeClass}`, badgeText);
      topRow.append(nameSpan, badge);

      const metaRow = el('div', 'hud-lineage-meta');
      const stageDetail = isEradicated
        ? tr('0 surviving carriers', '0 porteur survivant')
        : tr(
            `${item.adultCount} Ad. / ${item.babyCount} ${item.babyCount > 1 ? 'Babies' : 'Baby'} 🐣 · Spotted: ${item.spottedCount || 0}/${item.count}`,
            `${item.adultCount} Ad. / ${item.babyCount} Bébé${item.babyCount > 1 ? 's' : ''} 🐣 · Repérés: ${item.spottedCount || 0}/${item.count}`
          );
      const genFitnessText = tr(
        `Gen. ${item.generationMax} · Fit ${item.maxFitness ? item.maxFitness.toFixed(2) : '1.45'}`,
        `Gén. ${item.generationMax} · Fit ${item.maxFitness ? item.maxFitness.toFixed(2) : '1.45'}`
      );
      metaRow.append(el('span', '', stageDetail), el('span', '', genFitnessText));

      card.append(topRow, metaRow);

      // Barre des traits évolutifs (Gestation, Agressivité, Étendue Phénotypique [Papa, Maman] ± 10%)
      if (!isEradicated && item.sampleCount > 0) {
        const avgGest = Math.round(item.gestationSum / item.sampleCount);
        const avgAggroPct = Math.round((item.aggroSum / item.sampleCount) * 100);
        const traitsBar = el('div', 'hud-lineage-traits-bar');
        traitsBar.append(
          el('span', 'hud-lineage-trait-pill', `⏱️ Gestation ~${avgGest}s`),
          el(
            'span',
            'hud-lineage-trait-pill',
            tr(`💢 Aggression ${avgAggroPct}%`, `💢 Agressivité ${avgAggroPct}%`)
          ),
          el(
            'span',
            'hud-lineage-trait-pill',
            tr(
              `🧬 Max HP ${Math.round(item.maxHpVal)} · Str ${Math.round(item.maxStrengthVal)} · Spd ${item.maxSpeedVal.toFixed(1)}`,
              `🧬 PV max ${Math.round(item.maxHpVal)} · Force ${Math.round(item.maxStrengthVal)} · Vit ${item.maxSpeedVal.toFixed(1)}`
            )
          )
        );
        card.appendChild(traitsBar);
      }

      // Message tactique contextuel + Bouton direct "Ordonner aux Éclaireurs : Traquer cette lignée"
      if (!isEradicated) {
        let warnMsg = '';
        if (item.adultCount === 0 && item.babyCount > 0) {
          const remStr =
            item.minMaturationRem !== null ? ` (${Math.ceil(item.minMaturationRem)}s)` : '';
          warnMsg = tr(
            `⏳ Tactical window: all carriers are still Juveniles${remStr} and cannot breed!`,
            `⏳ Fenêtre tactique : tous les porteurs sont encore Juvéniles${remStr} et ne peuvent pas se reproduire !`
          );
        } else if (isPatientZeroSingle) {
          warnMsg = item.discoveredByScout
            ? tr(
                '🎯 Spotted by Scout -> Eliminate before the next Eco-Tick!',
                '🎯 Repéré par Éclaireur -> Éliminez-le avant le prochain Eco-Tick !'
              )
            : tr(
                '⚠️ Active carrier in the wild -> Risk of genetic dominance!',
                '⚠️ Porteur actif en territoire sauvage -> Risque de dominance !'
              );
        } else {
          warnMsg = tr(
            `🔥 Dominant inheritance (78%) in progress -> Hunt the ${item.adultCount} breeding adult(s)!`,
            `🔥 Transmission dominante (78%) en cours -> Chassez les ${item.adultCount} adulte(s) reproducteur(s) !`
          );
        }
        card.appendChild(el('div', 'hud-lineage-warning', warnMsg));

        const actionRow = el('div', 'hud-lineage-actions');
        const allSpotted = (item.spottedCount || 0) >= item.count;
        const trackBtn = el(
          'button',
          `hud-btn hud-btn-sm ${allSpotted ? 'hud-btn-amber' : 'hud-btn-scout'} hud-lineage-track-btn`,
          allSpotted
            ? tr(
                `🎯 All spotted (${item.spottedCount}/${item.count}) — Target & Eradicate`,
                `🎯 Tous repérés (${item.spottedCount}/${item.count}) — Cibler & Éradiquer`
              )
            : tr(
                `🦅 Order Scouts: Track (${item.spottedCount || 0}/${item.count} spotted)`,
                `🦅 Ordonner aux Éclaireurs : Traquer (${item.spottedCount || 0}/${item.count} repérés)`
              )
        );
        trackBtn.type = 'button';
        trackBtn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          this.selectedLineageId = item.id;
          this._lastLineageListSig = null;
          if (this.callbacks.onSetScoutMission) {
            this.callbacks.onSetScoutMission('track_lineage', item.id);
          }
          if (this.callbacks.onFocusWorldPos && item.patientZeroPos) {
            this.callbacks.onFocusWorldPos(
              item.patientZeroPos.x,
              item.patientZeroPos.z,
              item.id
            );
          }
        });
        actionRow.appendChild(trackBtn);
        card.appendChild(actionRow);
      }

      card.addEventListener('click', () => {
        this.selectedLineageId = this.selectedLineageId === item.id ? null : item.id;
        this._lastLineageListSig = null;
        if (this.callbacks.onFocusWorldPos && item.patientZeroPos) {
          this.callbacks.onFocusWorldPos(
            item.patientZeroPos.x,
            item.patientZeroPos.z,
            this.selectedLineageId
          );
        }
      });

      this.lineageListEl.appendChild(card);
    }
  }

  /* ==========================================================================
     5. FIL D'ÉVOLUTION ET DE COMBAT EN DIRECT (BAS-GAUCHE), MAÎTRISES & SKILL BAR
     ========================================================================== */
  _buildBottomLeftLogFeed() {
    this.bottomLeft = el('section', 'hud-bottom-left hud-interactive');

    // Section 5A : Apprentissage Adaptatif & Résistances Dynamiques du Héros
    const masteryHeader = el('div', 'hud-panel-header');
    masteryHeader.append(
      el('span', 'hud-panel-title', '🧬 Maîtrises & Résistances Adaptatives'),
      (this.masteryCountBadgeEl = el('span', 'hud-panel-subtitle', '0 adaptation'))
    );
    this.masteryListEl = el('div', 'hud-mastery-list');
    this.masteryListEl.appendChild(
      el(
        'div',
        'hud-mastery-empty',
        'Combattez des espèces/mutants (+1% dégâts/monstre, rendement décroissant, max +15%) ou encaissez des éléments (-0.5%/coup, max -10%) pour vous adapter.'
      )
    );

    // Section 5B : Journal Évolution & Alerte en Temps Réel
    const header = el('div', 'hud-panel-header');
    header.style.marginTop = '4px';
    header.append(
      el('span', 'hud-panel-title', '📜 Journal Évolution & Alerte'),
      el('span', 'hud-panel-subtitle', 'Temps réel')
    );
    this.logListEl = el('div', 'hud-log-list');
    this.bottomLeft.append(masteryHeader, this.masteryListEl, header, this.logListEl);
    this.root.appendChild(this.bottomLeft);
  }

  /**
   * Met à jour le panneau des Maîtrises Offensives (Tueur d'Espèce / Anti-Mutation)
   * et des Résistances Élémentaires/Physiques acquises par l'action (`AdaptiveMasterySystem`).
   * @param {Object} player - Instance `PlayerController`.
   */
  _updateMasteryPanel(player) {
    if (!this.masteryListEl || !player) return;
    const ms = player.masterySystem || player.mastery || player.adaptiveMastery || null;
    if (!ms) return;

    const summary =
      typeof ms.getSummaryForHUD === 'function'
        ? ms.getSummaryForHUD()
        : {
            speciesMasteries: [],
            mutationMasteries: [],
            resistances: [],
            totalAdaptationsCount: 0,
          };

    const pills = [];

    // 1. Maîtrises d'Espèce (<= 1% par monstre avec rendement décroissant rapide, max +15%)
    for (const sp of summary.speciesMasteries || []) {
      const spName = translateString(sp.name);
      if (sp.rank > 0) {
        pills.push({
          cls: 'mastery-species',
          text: tr(`🗡️ ${spName} Slayer Rk.${sp.rank}`, `🗡️ Chasseur ${spName} Rg.${sp.rank}`),
          val: tr(
            `+${sp.bonusPct}% Dmg (${sp.kills} slain)`,
            `+${sp.bonusPct}% Dégâts (${sp.kills} tué${sp.kills > 1 ? 's' : ''})`
          ),
        });
      } else if (sp.kills > 0) {
        pills.push({
          cls: 'mastery-species',
          text: tr(`🎯 Hunting ${spName}`, `🎯 Traque ${spName}`),
          val: tr(
            `+${sp.bonusPct ?? sp.kills}% Dmg (${sp.kills}/${sp.nextThreshold || 1} slain)`,
            `+${sp.bonusPct ?? sp.kills}% Dégâts (${sp.kills}/${sp.nextThreshold || 1} tués)`
          ),
        });
      }
    }

    // 2. Maîtrises Anti-Mutation (<= 1% par mutant avec rendement décroissant rapide, max +15%)
    for (const mut of summary.mutationMasteries || []) {
      const mutName = translateString(mut.name);
      if (mut.rank > 0) {
        pills.push({
          cls: 'mastery-mutation',
          text: tr(`🧬 ${mutName} Purge Rk.${mut.rank}`, `🧬 Purge ${mutName} Rg.${mut.rank}`),
          val: tr(
            `+${mut.bonusPct}% Dmg (${mut.kills || 1} slain)`,
            `+${mut.bonusPct}% Dégâts (${mut.kills || 1} tué${(mut.kills || 1) > 1 ? 's' : ''})`
          ),
        });
      } else if (mut.kills > 0) {
        pills.push({
          cls: 'mastery-mutation',
          text: tr(`🧬 Studying ${mutName}`, `🧬 Étude ${mutName}`),
          val: tr(
            `+${mut.bonusPct ?? mut.kills}% Dmg (${mut.kills}/${mut.nextThreshold || 1} slain)`,
            `+${mut.bonusPct ?? mut.kills}% Dégâts (${mut.kills}/${mut.nextThreshold || 1} tués)`
          ),
        });
      }
    }

    // 3. Résistances Élémentaires & Physiques (-0.5%/coup avec rendement décroissant, max -10%)
    for (const res of summary.resistances || []) {
      const resName = translateString(res.name);
      if (res.rank > 0) {
        pills.push({
          cls: 'mastery-resist',
          text: tr(
            `${res.icon || '🛡️'} ${resName} Res. Rk.${res.rank}`,
            `${res.icon || '🛡️'} Rés. ${resName} Rg.${res.rank}`
          ),
          val: tr(`-${res.reductionPct}% Dmg taken`, `-${res.reductionPct}% Dégâts reçus`),
        });
      } else if (res.hits > 0) {
        pills.push({
          cls: 'mastery-resist',
          text: tr(`${res.icon || '🛡️'} ${resName} Immunity`, `${res.icon || '🛡️'} Immunité ${resName}`),
          val: tr(
            `-${res.reductionPct ?? 0.5}% (${res.hits}/${res.nextThreshold || 2} hits)`,
            `-${res.reductionPct ?? 0.5}% (${res.hits}/${res.nextThreshold || 2} coups)`
          ),
        });
      }
    }

    const activeRanks = summary.totalAdaptationsCount || 0;
    if (this.masteryCountBadgeEl) {
      this.masteryCountBadgeEl.textContent = tr(
        `${activeRanks} active rank${activeRanks > 1 ? 's' : ''}`,
        `${activeRanks} rang${activeRanks > 1 ? 's' : ''} actif${activeRanks > 1 ? 's' : ''}`
      );
    }

    // Éviter de reconstruire le DOM si la signature n'a pas changé
    const sig = `${getLanguage()}|` + JSON.stringify(pills);
    if (this._lastMasterySig === sig) return;
    this._lastMasterySig = sig;

    this.masteryListEl.replaceChildren();
    if (pills.length === 0) {
      this.masteryListEl.appendChild(
        el(
          'div',
          'hud-mastery-empty',
          'Combattez des espèces/mutants (+1% dégâts/monstre, rendement décroissant, max +15%) ou encaissez des éléments (-0.5%/coup, max -10%) pour vous adapter.'
        )
      );
      return;
    }

    for (const p of pills.slice(0, 8)) {
      const badge = el('span', `hud-mastery-pill ${p.cls}`);
      badge.append(el('span', '', p.text), el('span', 'hud-mastery-val', p.val));
      this.masteryListEl.appendChild(badge);
    }
  }

  /**
   * Rafraîchit le journal d'événements en bas à gauche à partir de `logger.getRecentLogs`.
   */
  refreshLogFeed() {
    if (!this.logListEl) return;
    const entries = logger.getRecentLogs(18).slice().reverse();
    this.logListEl.replaceChildren();

    for (const entry of entries) {
      let levelClass = 'log-info';
      if (entry.level === 'EVOLUTION') levelClass = 'log-evolution';
      else if (entry.level === 'ALERT') levelClass = 'log-alert';
      else if (entry.level === 'WARN') levelClass = 'log-warn';

      const line = el(
        'div',
        `hud-log-item ${levelClass}`,
        `[${entry.timestamp}] ${entry.message}`
      );
      line.title = entry.message;
      this.logListEl.appendChild(line);
    }
  }

  _buildBottomCenterControls() {
    this.bottomStack = el('div', 'hud-bottom-stack');

    // 1. Barre de Compétences Roguelike à 4 Emplacements (`[1][2][3][4]` ou `AUTO`)
    this.skillBarWrap = el('div', 'hud-skill-bar-wrap hud-interactive');
    this.skillSlotEls = [];

    for (let i = 0; i < 4; i++) {
      const slotBtn = el('button', 'hud-skill-slot is-empty');
      slotBtn.type = 'button';
      slotBtn.dataset.slotIndex = String(i);

      const cdFillEl = el('div', 'hud-skill-cooldown-fill');
      cdFillEl.style.height = '0%';
      const keyEl = el('span', 'hud-skill-key', String(i + 1));
      const lvlEl = el('span', 'hud-skill-level', '');
      const iconEl = el('span', 'hud-skill-icon', '🔒');
      const nameEl = el('span', 'hud-skill-name', 'Emplacement Vide');
      const cdTextEl = el('span', 'hud-skill-cd-text', '');

      slotBtn.append(cdFillEl, keyEl, lvlEl, iconEl, nameEl, cdTextEl);
      slotBtn.addEventListener('click', () => {
        if (this.callbacks.onCastSpellSlot) {
          this.callbacks.onCastSpellSlot(i);
        }
      });

      this.skillBarWrap.appendChild(slotBtn);
      this.skillSlotEls.push({
        slotBtn,
        cdFillEl,
        keyEl,
        lvlEl,
        iconEl,
        nameEl,
        cdTextEl,
      });
    }

    // 2. Barre des Raccourcis Clavier
    this.bottomCenter = el('nav', 'hud-bottom-center hud-interactive');

    const controls = [
      { key: 'ZQSD / WASD', label: 'Déplacer' },
      { key: 'Clic / Espace', label: 'Fente Cleave' },
      { key: '1-4', label: 'Sorts 3D' },
      { key: 'C', label: 'Mode Auto/Actif' },
      { key: 'Shift', label: 'Esquive' },
      { key: 'E', label: 'Bâtir / Secourir / Récolter' },
      { key: 'H', label: 'Architecte Bastion' },
      { key: 'K', label: 'Armes Élémentaires' },
      { key: 'V', label: 'Bouclier Île' },
      { key: 'Tab', label: 'Codex Génétique' },
      { key: 'O', label: tr('Settings / Language', 'Paramètres / Langue') },
      { key: 'T', label: 'Eco-Tick' },
      { key: 'J', label: 'Modèles Blender (.glb)' },
      { key: 'X', label: 'Test Game Over' },
    ];

    for (const c of controls) {
      const hint = el('span', 'hud-hotkey-hint');
      hint.append(el('kbd', 'hud-kbd', c.key), el('span', '', c.label));
      this.bottomCenter.appendChild(hint);
    }

    this.bottomStack.append(this.skillBarWrap, this.bottomCenter);
    this.root.appendChild(this.bottomStack);
  }

  /**
   * Met à jour l'affichage des 4 emplacements de Sorts 3D (`[1][2][3][4]` / `AUTO`) et leurs temps de recharge.
   * @param {Object} player - Instance `PlayerController`.
   */
  _updateSkillBar(player) {
    if (!this.skillSlotEls || this.skillSlotEls.length === 0) return;

    const mode = player?.combatMode || this.combatMode || 'vampire_survivors';
    const isAuto = mode === 'vampire_survivors';

    // Synchroniser le bouton de mode en haut si le joueur a changé de mode
    if (player?.combatMode && player.combatMode !== this.combatMode) {
      this.combatMode = player.combatMode;
      this._refreshCombatModeSwitchLabel();
    }

    // Récupérer les jusqu'à 4 sorts équipés du joueur via getSkillBarState()
    let equippedList = [];
    if (player && typeof player.getSkillBarState === 'function') {
      equippedList = player.getSkillBarState();
    } else if (player && typeof player.getEquippedSpellsForHUD === 'function') {
      equippedList = player.getEquippedSpellsForHUD();
    } else if (Array.isArray(player?.equippedSpells) && player.equippedSpells.length > 0) {
      equippedList = player.equippedSpells;
    } else if (Array.isArray(player?.spellSlots) && player.spellSlots.length > 0) {
      equippedList = player.spellSlots;
    } else if (player?.abilityLevels && typeof player.abilityLevels === 'object') {
      equippedList = Object.entries(player.abilityLevels)
        .filter(([, lvl]) => lvl > 0)
        .map(([id, level]) => ({ id, level }));
    }

    for (let i = 0; i < 4; i++) {
      const ui = this.skillSlotEls[i];
      const rawEntry = equippedList[i] || null;
      const spellId = typeof rawEntry === 'string' ? rawEntry : rawEntry?.id || null;
      const meta = spellId
        ? ROGUELIKE_ABILITIES_BY_ID[spellId] || FALLBACK_ROGUELIKE_ABILITIES[spellId] || rawEntry
        : null;

      ui.keyEl.textContent = isAuto ? `AUTO ${i + 1}` : `[${i + 1}]`;
      ui.keyEl.classList.toggle('is-auto', isAuto);

      if (!spellId || !meta) {
        ui.slotBtn.className = 'hud-skill-slot is-empty';
        ui.iconEl.textContent = '🔒';
        ui.nameEl.textContent = tr('Level Up', 'Niveau Sup.');
        ui.lvlEl.textContent = '';
        ui.cdFillEl.style.height = '0%';
        ui.cdTextEl.textContent = '';
        continue;
      }

      const level =
        typeof rawEntry === 'object' && rawEntry.level
          ? rawEntry.level
          : player?.abilityLevels?.[spellId] || 1;

      const stats = getAbilityStatsAtLevel(spellId, level);
      const maxCd =
        typeof rawEntry === 'object' && typeof rawEntry.maxCooldown === 'number'
          ? rawEntry.maxCooldown
          : stats?.cooldown ?? meta.cooldown ?? 4.0;
      const remCd =
        typeof rawEntry === 'object' && typeof rawEntry.cooldownRemaining === 'number'
          ? rawEntry.cooldownRemaining
          : player?.abilityCooldowns?.[spellId] ?? 0;

      const onCd = remCd > 0.05 && maxCd > 0;
      const cdPct = onCd ? Math.min(100, Math.round((remCd / maxCd) * 100)) : 0;

      const spellName = translateString(meta.name || spellId);
      const spellDesc = translateString(meta.description || '');
      ui.slotBtn.className = `hud-skill-slot${isAuto ? ' is-auto-mode' : ' is-ready'}`;
      ui.iconEl.textContent = meta.icon || '⚡';
      ui.nameEl.textContent = spellName;
      ui.lvlEl.textContent = tr(`Lv.${level}`, `Niv.${level}`);
      ui.cdFillEl.style.height = `${cdPct}%`;
      ui.cdTextEl.textContent = onCd ? `${remCd.toFixed(1)}s` : '';
      ui.slotBtn.title = tr(
        `${spellName} (Lv. ${level}) — ${spellDesc}`,
        `${spellName} (Niv. ${level}) — ${spellDesc}`
      );
    }
  }

  /* ==========================================================================
     6. MODALE CODEX PHYLOGÉNÉTIQUE & CATALOGUE DES MUTATIONS [Tab]
     ========================================================================== */
  _buildCodexModal() {
    this.codexBackdrop = el('div', 'hud-modal-backdrop is-hidden hud-interactive');
    const dialog = el('div', 'hud-modal-dialog');

    const header = el('div', 'hud-modal-header');
    header.appendChild(
      el(
        'h2',
        'hud-modal-title',
        '🧬 Codex Phylogénétique, Hybridation & Génétique Mendélienne'
      )
    );

    const closeBtn = el('button', 'hud-btn hud-btn-amber', 'Fermer [Tab / Échap]');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => this.toggleCodexModal(false));
    header.appendChild(closeBtn);

    this.codexBody = el('div', 'hud-modal-body');
    dialog.append(header, this.codexBody);
    this.codexBackdrop.appendChild(dialog);

    this.codexBackdrop.addEventListener('click', (evt) => {
      if (evt.target === this.codexBackdrop) {
        this.toggleCodexModal(false);
      }
    });

    this.root.appendChild(this.codexBackdrop);
  }

  /**
   * Ouvre ou ferme la modale de l'Arbre Phylogénétique et du Codex Génétique.
   * @param {boolean} [forceState] - État explicite optionnel.
   * @param {Array<Object>} [enemies=[]] - Liste des ennemis pour afficher les statistiques en direct.
   * @returns {boolean} Nouvel état d'ouverture.
   */
  toggleCodexModal(forceState, enemies = []) {
    this.isCodexOpen = typeof forceState === 'boolean' ? forceState : !this.isCodexOpen;
    if (this.codexBackdrop) {
      this.codexBackdrop.classList.toggle('is-hidden', !this.isCodexOpen);
    }
    if (this.isCodexOpen) {
      this.renderCodexContent(enemies);
    }
    return this.isCodexOpen;
  }

  /**
   * Construit le contenu interactif du Codex Phylogénétique :
   * 1. Graphe SVG des 7 espèces de base par clade (`Peaux-Vertes`, `Bêtes Sauvages`, `Apex`)
   *    et leurs liens de distance phylogénétique (avec probabilités d'hybridation).
   * 2. Formule explicite du `fitnessScore` darwinien et cycle Juvénile (Bébé) -> Adulte.
   * 3. Catalogue des Hybrides inter-espèces et des 7 Mutations Dominantes de Mendel.
   *
   * @param {Array<Object>} [enemies=[]]
   */
  renderCodexContent(enemies = []) {
    if (!this.codexBody) return;
    this.codexBody.replaceChildren();

    const graphData = getPhylogenyGraphData();
    const mutationsCatalog = getMutationsCatalog();

    // Comptage des populations vivantes et de l'étendue phénotypique par espèce, hybride et mutation
    const speciesCounts = {};
    const mutationCounts = {};
    const speciesScope = {};

    for (const e of enemies) {
      if (!e || e.dead || (typeof e.hp === 'number' && e.hp <= 0)) continue;
      const genome = e.genome || {};
      const genes = genome.genes || {};
      const spId = genome.speciesId || 'goblin';
      speciesCounts[spId] = (speciesCounts[spId] || 0) + 1;

      for (const m of genome.mutations || []) {
        mutationCounts[m] = (mutationCounts[m] || 0) + 1;
      }

      if (!speciesScope[spId]) {
        speciesScope[spId] = {
          adults: 0,
          babies: 0,
          enraged: 0,
          minHp: Infinity,
          maxHp: 0,
          minDmg: Infinity,
          maxDmg: 0,
          minSpd: Infinity,
          maxSpd: 0,
          minGest: Infinity,
          maxGest: 0,
          gestSum: 0,
          aggroSum: 0,
          count: 0,
        };
      }
      const sc = speciesScope[spId];
      const isBaby = e.lifeStage === 'baby' || e.isAdult === false;
      if (isBaby) sc.babies++;
      else sc.adults++;
      if (e.enraged || e.state === 'wrath_raid') sc.enraged++;

      const spConf = CONFIG.SPECIES?.[spId] || {};
      const spDef = SPECIES_CYCLE_AND_AGGRO_DEFAULTS[spId] || {};
      const hp = Number(e.maxHp || genes.maxHp || spConf.baseHp || 60);
      const dmg = Number(e.damage || genes.strength || spConf.baseDamage || 10);
      const spd = Number(e.speed || genes.speed || spConf.baseSpeed || 7);
      const gest = Number(
        e.gestationTime ||
          genes.gestationTime ||
          spConf.baseGestationTime ||
          spDef.baseGestationTime ||
          18
      );
      const aggro = Number(
        e.aggressiveness ??
          genes.aggressiveness ??
          spConf.baseAggressiveness ??
          spDef.baseAggressiveness ??
          0.7
      );

      sc.minHp = Math.min(sc.minHp, hp);
      sc.maxHp = Math.max(sc.maxHp, hp);
      sc.minDmg = Math.min(sc.minDmg, dmg);
      sc.maxDmg = Math.max(sc.maxDmg, dmg);
      sc.minSpd = Math.min(sc.minSpd, spd);
      sc.maxSpd = Math.max(sc.maxSpd, spd);
      sc.minGest = Math.min(sc.minGest, gest);
      sc.maxGest = Math.max(sc.maxGest, gest);
      sc.gestSum += gest;
      sc.aggroSum += aggro;
      sc.count++;
    }

    // Section 1 : Graphe SVG de l'Arbre Phylogénétique & Distances d'Hybridation
    const graphSection = el('div', 'phylo-graph-container');
    graphSection.append(
      el(
        'div',
        'hud-section-label',
        tr(
          `Phylogenetic Tree & Hybridization Matrix (Compatibility threshold <= ${graphData.maxHybridDistance})`,
          `Arbre Phylogénétique & Matrice d'Hybridation (Seuil de compatibilité <= ${graphData.maxHybridDistance})`
        )
      ),
      this._buildPhylogenySvg(graphData, speciesCounts)
    );

    // Section 2 : Encadré explicatif de la Loi [Papa, Maman] ± 10%, Cycles de Gestation & Repeuplement Sauvage
    const formulaCard = el('div', 'codex-item-card');
    formulaCard.append(
      el(
        'div',
        'codex-item-title',
        '📐 Lois Génétiques : Croisement [Papa, Maman] ± 10%, Cycles de Gestation & Dragons Souverains'
      ),
      el(
        'div',
        'codex-item-desc',
        '1. Croisement à Étendue Élargie ([Papa, Maman] ± 10%) : Pour chaque trait quantitatif (PV, Force, Vitesse, Taille, Gestation, Agressivité), l’enfant tire une valeur aléatoire entre le Père et la Mère puis applique une dérive de [-10%, +10%] (×0.90 à ×1.10). Les lignées peuvent ainsi dépasser les limites de la Génération 1 au fil de la sélection darwinienne !'
      ),
      el(
        'div',
        'codex-item-stats',
        '2. Repeuplement Sauvage & Courroux Draconique : Les 7 espèces de base ne s’éteignent jamais (elles réémergent de leurs terriers ou falaises si < 2 individus), tandis que les lignées mutantes s’éteignent définitivement une fois éradiquées. Les Dragons Souverains (680 PV, Gestation 65s) sont pacifiques tant que vous ne les attaquez pas — mais si vous en blessez un seul, TOUTE l’espèce fondra sur votre Bastion !'
      )
    );

    // Section 2B : Cycles de Gestation, Agressivité & Étendue Génétique des 11 Espèces
    const baseOrder = [
      'goblin',
      'wolf',
      'vulture',
      'orc',
      'lion',
      'troll',
      'dragon',
      'shark',
      'giant_mole',
      'deer',
      'rabbit',
    ];
    const allConfigSpecies = Object.keys(CONFIG.SPECIES || {});
    const orderedSpeciesIds = Array.from(new Set([...baseOrder, ...allConfigSpecies])).filter(
      (id) => CONFIG.SPECIES?.[id] || SPECIES_CYCLE_AND_AGGRO_DEFAULTS[id]
    );

    const speciesTitle = el(
      'div',
      'hud-section-label',
      tr(
        `Gestation Cycles, Aggression, Emergence & Prey (${orderedSpeciesIds.length} Species)`,
        `Cycles de Gestation, Agressivité, Émergence & Gibier (${orderedSpeciesIds.length} Espèces)`
      )
    );
    const speciesGrid = el('div', 'codex-species-grid');

    for (const spId of orderedSpeciesIds) {
      const spConf = CONFIG.SPECIES?.[spId] || {};
      const spDef = SPECIES_CYCLE_AND_AGGRO_DEFAULTS[spId] || {};
      const sc = speciesScope[spId] || null;

      const name = translateString(spConf.name || spId);
      const baseGest = spConf.baseGestationTime ?? spDef.baseGestationTime ?? 18;
      const baseMat = spConf.baseMaturationTime ?? spDef.baseMaturationTime ?? 20;
      const baseAggro = spConf.baseAggressiveness ?? spDef.baseAggressiveness ?? 0.7;
      const stance = spConf.aggroStance || spDef.aggroStance || 'hostile';
      const autoRepop =
        spConf.autoRepopulate !== undefined
          ? Boolean(spConf.autoRepopulate)
          : spDef.autoRepopulate !== undefined
            ? Boolean(spDef.autoRepopulate)
            : true;
      const foodYield = spConf.foodYield ?? spDef.foodYield ?? 0;
      const repopCd = spConf.repopulationCooldown ?? spDef.repopulationCooldown ?? 15;
      const habitat = translateString(
        spConf.repopulationHabitatLabel || spDef.repopulationHabitatLabel || 'Terres sauvages'
      );
      const baseHp = spConf.baseHp ?? spDef.baseHp ?? 60;
      const baseDmg = spConf.baseDamage ?? spDef.baseDamage ?? 10;
      const baseSpd = spConf.baseSpeed ?? spDef.baseSpeed ?? 7.0;

      const avgGest = sc && sc.count > 0 ? Math.round(sc.gestSum / sc.count) : baseGest;
      const avgAggroPct =
        sc && sc.count > 0
          ? Math.round((sc.aggroSum / sc.count) * 100)
          : Math.round(baseAggro * 100);
      const isWrath = Boolean(sc && sc.enraged > 0);

      let stanceLabel = tr(
        `⚔️ Hostile on Sight (${avgAggroPct}%)`,
        `⚔️ Hostile à vue (${avgAggroPct}%)`
      );
      let stanceCls = 'stance-hostile';
      if (isWrath) {
        stanceLabel = tr('🔥 DRACONIC WRATH (100%)', '🔥 COURROUX DRACONIQUE (100%)');
        stanceCls = 'stance-wrath';
      } else if (stance === 'prey_pacifist' || spConf.clade === 'herbivore') {
        stanceLabel = tr(
          `🦌 Peaceful Prey (+${foodYield || 25} 🍖)`,
          `🦌 Gibier Pacifique (+${foodYield || 25} 🍖)`
        );
        stanceCls = 'stance-prey_pacifist';
      } else if (stance === 'pacifist_apex') {
        stanceLabel = tr(
          `👑 Peaceful Sovereign (${avgAggroPct}%)`,
          `👑 Souverain Pacifique (${avgAggroPct}%)`
        );
        stanceCls = 'stance-pacifist_apex';
      } else if (stance === 'territorial') {
        stanceLabel = `🛡️ Territorial (${avgAggroPct}%)`;
        stanceCls = 'stance-territorial';
      }

      const spIcon =
        spId === 'dragon'
          ? '🐉 '
          : spId === 'shark'
            ? '🦈 '
            : spId === 'giant_mole'
              ? '🕳️ '
              : spId === 'deer'
                ? '🦌 '
                : spId === 'rabbit'
                  ? '🐇 '
                  : '';

      const spCard = el(
        'div',
        `codex-species-card${spId === 'dragon' ? ' is-dragon-card' : ''}`
      );
      spCard.style.borderLeft = `4px solid ${spConf.color || '#e6a145'}`;

      const spHeader = el('div', 'codex-species-header');
      spHeader.append(
        el(
          'span',
          'codex-item-title',
          `${spIcon}${name} (${sc ? `${sc.adults} Ad. / ${sc.babies} 🐣` : tr('0 alive', '0 en vie')})`
        ),
        el('span', `codex-stance-badge ${stanceCls}`, stanceLabel)
      );

      const cycleLine = el(
        'div',
        'codex-item-desc',
        tr(
          `⏱️ Breeding Cycle: Gestation ~${avgGest}s (Base ${baseGest}s) · Baby Maturation ${baseMat}s`,
          `⏱️ Cycle Reproduction : Gestation ~${avgGest}s (Base ${baseGest}s) · Maturation Bébé ${baseMat}s`
        )
      );

      const hpRange =
        sc && sc.count > 0
          ? `${Math.round(sc.minHp)}–${Math.round(sc.maxHp)}`
          : `${Math.round(baseHp * 0.9)}–${Math.round(baseHp * 1.1)}`;
      const dmgRange =
        sc && sc.count > 0
          ? `${Math.round(sc.minDmg)}–${Math.round(sc.maxDmg)}`
          : `${Math.round(baseDmg * 0.9)}–${Math.round(baseDmg * 1.1)}`;
      const spdRange =
        sc && sc.count > 0
          ? `${sc.minSpd.toFixed(1)}–${sc.maxSpd.toFixed(1)}`
          : `${(baseSpd * 0.9).toFixed(1)}–${(baseSpd * 1.1).toFixed(1)}`;
      const gestRange =
        sc && sc.count > 0
          ? `${Math.round(sc.minGest)}–${Math.round(sc.maxGest)}s`
          : `${Math.round(baseGest * 0.9)}–${Math.round(baseGest * 1.1)}s`;

      const scopeBox = el(
        'div',
        'codex-scope-box',
        tr(
          `🧬 Range [Dad,Mom]±10%: HP ${hpRange} · Str ${dmgRange} · Spd ${spdRange} · Gest. ${gestRange}`,
          `🧬 Étendue [Papa,Maman]±10% : PV ${hpRange} · Force ${dmgRange} · Vit ${spdRange} · Gest. ${gestRange}`
        )
      );

      const repopText = !autoRepop
        ? tr(
            `⚠️ NO AUTO-REPOPULATION (<2 indiv. = EXTINCTION! Bio-Lab Reintroduction: 25 🌿 Biomass)`,
            `⚠️ PAS DE REPEUPLEMENT AUTO (<2 indiv. = EXTINCTION ! Réintroduction Bio-Labo : 25 🌿 Biomasse)`
          )
        : tr(
            `🕳️ Auto-repopulation (<2 indiv., ${repopCd}s): ${habitat}`,
            `🕳️ Repeuplement auto (<2 indiv., ${repopCd}s) : ${habitat}`
          );
      const repopLine = el('div', 'codex-repop-pill', repopText);

      spCard.append(spHeader, cycleLine, scopeBox, repopLine);
      speciesGrid.appendChild(spCard);
    }

    // Section 3 : Catalogue des Hybrides Inter-Espèces Viables
    const hybridTitle = el(
      'div',
      'hud-section-label',
      'Hybrides Inter-Espèces Fertiles (Hétérosis +6% PV/Dégâts)'
    );
    const hybridGrid = el('div', 'codex-catalog-grid');
    for (const hyb of graphData.hybrids) {
      const count = speciesCounts[hyb.id] || 0;
      const hCard = el('div', 'codex-item-card');
      hCard.style.borderLeft = `3px solid ${hyb.colorHex || '#e6a145'}`;

      const titleRow = el('div', 'codex-item-title');
      titleRow.append(
        el('span', '', `${translateString(hyb.name)}`),
        el('span', 'hud-lineage-badge badge-spread', tr(`${count} alive`, `${count} en vie`))
      );

      const parentsText = tr(
        `Parents: ${hyb.parentSpecies.map((p) => translateString(p)).join(' × ')} (Phylogenetic dist.: ${hyb.phylogeneticDistance})`,
        `Parents : ${hyb.parentSpecies.join(' × ')} (Dist. phylogénétique : ${hyb.phylogeneticDistance})`
      );
      const statsText = tr(
        `Base HP: ${hyb.baseHp} · Damage: ${hyb.baseDamage} · Speed: ${hyb.baseSpeed}`,
        `PV Base: ${hyb.baseHp} · Dégâts: ${hyb.baseDamage} · Vitesse: ${hyb.baseSpeed}`
      );
      hCard.append(
        titleRow,
        el('div', 'codex-item-desc', parentsText),
        el('div', 'codex-item-stats', statsText)
      );
      hybridGrid.appendChild(hCard);
    }

    // Section 4 : Catalogue des Mutations Dominantes de Mendel
    const mutTitle = el(
      'div',
      'hud-section-label',
      'Catalogue des Mutations Dominantes de Mendel (Hérédité : 78% 1 parent / 92% 2 parents)'
    );
    const mutGrid = el('div', 'codex-catalog-grid');
    for (const mut of mutationsCatalog) {
      const count = mutationCounts[mut.id] || 0;
      const mCard = el('div', 'codex-item-card');
      mCard.style.borderLeft = `4px solid ${mut.colorCss || '#ff4757'}`;

      const titleRow = el('div', 'codex-item-title');
      titleRow.append(
        el('span', '', translateString(mut.name)),
        el(
          'span',
          `hud-lineage-badge ${count > 0 ? 'badge-pz' : 'badge-eradicated'}`,
          tr(`${count} carrier${count > 1 ? 's' : ''}`, `${count} porteur${count > 1 ? 's' : ''}`)
        )
      );

      const sm = mut.statMultipliers || {};
      const statsLine = tr(
        `Fitness +${mut.fitnessBonus} · HP ×${sm.maxHp || 1} · Str ×${sm.strength || 1} · Spd ×${sm.speed || 1} · Metabolism ×${mut.metabolismCost || 1}`,
        `Fitness +${mut.fitnessBonus} · PV ×${sm.maxHp || 1} · Force ×${sm.strength || 1} · Vitesse ×${sm.speed || 1} · Métabolisme ×${mut.metabolismCost || 1}`
      );
      mCard.append(
        titleRow,
        el('div', 'codex-item-desc', translateString(mut.description || '')),
        el('div', 'codex-item-stats', statsLine)
      );
      mutGrid.appendChild(mCard);
    }

    this.codexBody.append(
      graphSection,
      formulaCard,
      speciesTitle,
      speciesGrid,
      hybridTitle,
      hybridGrid,
      mutTitle,
      mutGrid
    );
  }

  /**
   * Construit le graphe SVG des espèces groupées par Clade et leurs ponts d'hybridation.
   * @param {Object} graphData
   * @param {Record<string, number>} speciesCounts
   * @returns {SVGElement}
   * @private
   */
  _buildPhylogenySvg(graphData, speciesCounts) {
    const svg = svgEl('svg', {
      class: 'phylo-svg',
      viewBox: '0 0 980 305',
      role: 'img',
      'aria-label': 'Graphe Phylogénétique des espèces et ponts d’hybridation',
    });

    // Positions fixes par Clade pour une lisibilité cartographique parfaite (11 espèces)
    const nodePositions = {
      // Clade Peaux-Vertes & Fouisseurs (Gauche)
      goblin: { x: 95, y: 72, cladeLabel: 'Peaux-Vertes' },
      orc: { x: 215, y: 125, cladeLabel: 'Peaux-Vertes' },
      troll: { x: 115, y: 195, cladeLabel: 'Peaux-Vertes' },
      giant_mole: { x: 225, y: 255, cladeLabel: 'Émergents' },
      // Clade Bêtes Sauvages & Abysses (Centre)
      wolf: { x: 405, y: 72, cladeLabel: 'Bêtes Sauvages' },
      lion: { x: 525, y: 128, cladeLabel: 'Bêtes Sauvages' },
      vulture: { x: 425, y: 198, cladeLabel: 'Bêtes Sauvages' },
      shark: { x: 535, y: 255, cladeLabel: 'Abysses' },
      // Clade Apex (Centre-Droit)
      dragon: { x: 705, y: 155, cladeLabel: 'Prédateurs Apex' },
      storm_harpy: { x: 695, y: 255, cladeLabel: 'Nuées' },
      // Clade Faune Herbivore / Gibier (Droite)
      deer: { x: 885, y: 105, cladeLabel: 'Gibier Herbivore' },
      rabbit: { x: 885, y: 215, cladeLabel: 'Gibier Herbivore' },
    };

    // Titres des 4 Clades
    const cladeHeaders = [
      { x: 160, y: 24, text: 'PEAUX-VERTES & PROFONDEURS', color: '#4caf50' },
      { x: 470, y: 24, text: 'BÊTES & REQUINS ABYSSAUX', color: '#00d2d3' },
      { x: 705, y: 24, text: 'CLADE : APEX', color: '#e04038' },
      { x: 885, y: 24, text: 'GIBIER HERBIVORE', color: '#a3cb38' },
    ];
    for (const ch of cladeHeaders) {
      svg.appendChild(
        svgEl(
          'text',
          {
            x: ch.x,
            y: ch.y,
            fill: ch.color,
            'font-family': 'Cinzel, serif',
            'font-size': '11.5',
            'font-weight': '700',
            'text-anchor': 'middle',
          },
          ch.text
        )
      );
    }

    // 1. Arêtes (liens phylogénétiques compatibles <= 0.45)
    for (const edge of graphData.edges) {
      if (!edge.canHybridize) continue;
      const pA = nodePositions[edge.source];
      const pB = nodePositions[edge.target];
      if (!pA || !pB) continue;

      const isSameClade = edge.sameClade;
      const strokeColor = isSameClade ? '#38c172' : '#e6a145';

      svg.appendChild(
        svgEl('line', {
          x1: pA.x,
          y1: pA.y,
          x2: pB.x,
          y2: pB.y,
          stroke: strokeColor,
          'stroke-width': isSameClade ? 2.6 : 2.0,
          'stroke-dasharray': isSameClade ? '' : '5,4',
          opacity: '0.88',
        })
      );

      // Étiquette au milieu de l'arête avec le nom de l'Hybride et la distance
      const mx = (pA.x + pB.x) * 0.5;
      const my = (pA.y + pB.y) * 0.5 - 6;
      const probPct = Math.round((edge.hybridProbability || 0.15) * 100);
      svg.appendChild(
        svgEl(
          'text',
          {
            x: mx,
            y: my,
            fill: '#f0ead6',
            'font-family': 'JetBrains Mono, monospace',
            'font-size': '9.0',
            'text-anchor': 'middle',
          },
          `${translateString(edge.hybridName)} (d=${edge.distance}, ${probPct}%)`
        )
      );
    }

    // 2. Nœuds des espèces de base
    for (const node of graphData.nodes) {
      const pos = nodePositions[node.id];
      if (!pos) continue;
      const g = svgEl('g', { transform: `translate(${pos.x}, ${pos.y})` });

      g.appendChild(
        svgEl('circle', {
          r: 24,
          fill: node.color || '#2c3e50',
          stroke: '#f0ead6',
          'stroke-width': 2,
        })
      );

      g.appendChild(
        svgEl(
          'text',
          {
            y: -2,
            fill: '#ffffff',
            'font-family': 'Cinzel, serif',
            'font-size': '11',
            'font-weight': '700',
            'text-anchor': 'middle',
          },
          translateString(node.name)
        )
      );

      const liveCount = speciesCounts[node.id] || 0;
      g.appendChild(
        svgEl(
          'text',
          {
            y: 12,
            fill: '#f0ead6',
            'font-family': 'JetBrains Mono, monospace',
            'font-size': '9.5',
            'text-anchor': 'middle',
          },
          `Pop: ${liveCount}`
        )
      );

      svg.appendChild(g);
    }

    return svg;
  }

  /* ==========================================================================
     7. MODALE ROGUELIKE DE MONTÉE DE NIVEAU & MODALE DE CHOIX DU MODE DE COMBAT
     ========================================================================== */
  _buildLevelUpModal() {
    this.levelUpBackdrop = el('div', 'hud-modal-backdrop is-hidden hud-interactive');
    const dialog = el('div', 'hud-modal-dialog');
    dialog.style.maxWidth = '860px';

    const header = el('div', 'hud-modal-header');
    this.levelUpTitleEl = el(
      'h2',
      'hud-modal-title',
      '⚡ MONTÉE DE NIVEAU — CHOISISSEZ UN SORT 3D OU UNE ADAPTATION'
    );
    header.appendChild(this.levelUpTitleEl);

    const body = el('div', 'hud-modal-body');

    // Bannière explicite de Pause Totale de la simulation 3D
    this.levelUpPauseBanner = el('div', 'hud-pause-banner');
    this.levelUpPauseBanner.append(
      el('span', 'hud-pause-banner-icon', '⏸️'),
      el(
        'span',
        '',
        'JEU EN PAUSE — Le monde 3D est figé. Prenez tout votre temps pour lire et choisir votre compétence.'
      )
    );
    body.appendChild(this.levelUpPauseBanner);

    body.appendChild(
      el(
        'p',
        'codex-item-desc',
        'Débloquez de nouveaux Sorts 3D (jusqu’à 4 emplacements actifs/auto-cast évoluant du Niv. 1 au Niv. 5) ou des contre-mesures passives adaptées aux mutations ennemies :'
      )
    );
    this.levelUpCardsGrid = el('div', 'levelup-cards-grid');
    body.appendChild(this.levelUpCardsGrid);

    dialog.append(header, body);
    this.levelUpBackdrop.appendChild(dialog);
    this.root.appendChild(this.levelUpBackdrop);
  }

  /**
   * Construit la modale de sélection du Mode de Gameplay de Combat :
   * - `vampire_survivors` : Auto-Attack & Auto-Cast des Sorts 3D dès que rechargés
   * - `diablo_action` : Fente manuelle (`Clic Gauche / Espace`) & Sorts actifs sur `[1] [2] [3] [4]`
   */
  _buildCombatModeModal() {
    this.combatModeBackdrop = el('div', 'hud-modal-backdrop is-hidden hud-interactive');
    const dialog = el('div', 'hud-modal-dialog');
    dialog.style.maxWidth = '840px';

    const header = el('div', 'hud-modal-header');
    header.append(
      el('h2', 'hud-modal-title', '⚔️ STYLE DE COMBAT ROGUELIKE — VAMPIRE SURVIVORS OU DIABLO ?'),
      el('span', 'hud-panel-subtitle', 'Modifiable à tout moment via [C]')
    );

    const body = el('div', 'hud-modal-body');

    const pauseBanner = el('div', 'hud-pause-banner');
    pauseBanner.append(
      el('span', 'hud-pause-banner-icon', '⏸️'),
      el(
        'span',
        '',
        'JEU EN PAUSE — Choisissez comment contrôler les attaques et les Sorts 3D de votre Gardien :'
      )
    );
    body.appendChild(pauseBanner);

    const grid = el('div', 'combat-mode-cards-grid');

    // Carte 1 : Mode Vampire Survivors (Auto-Cast)
    const vsCard = el('div', 'combat-mode-card mode-vs');
    const vsHeader = el('div', 'combat-mode-card-header');
    vsHeader.append(
      el('span', 'combat-mode-icon', '⚡'),
      el('div', 'combat-mode-title', 'Mode Vampire Survivors (Auto-Cast)')
    );
    const vsBadge = el(
      'span',
      'hud-lineage-badge badge-spread',
      'Recommandé • Concentration Tactique & Positionnement'
    );
    const vsDesc = el(
      'p',
      'combat-mode-desc',
      'Votre Gardien frappe automatiquement les ennemis à portée d’épée et déclenche automatiquement tous vos Sorts 3D équipés dès que leur temps de recharge est prêt. Idéal pour vous concentrer sur l’esquive, le sauvetage des Éclaireurs et la traque du Patient Zéro.'
    );
    const vsPerks = el('div', 'combat-mode-perks');
    vsPerks.append(
      el('div', 'combat-mode-perk-item', '🗡️ Sort 3D de départ : Lames Orbitales (Niv. 1)'),
      el('div', 'combat-mode-perk-item', '🔄 Sorts [1-4] lancés automatiquement dès recharge'),
      el('div', 'combat-mode-perk-item', '🎯 Clic Gauche / Espace reste utilisable à volonté')
    );
    const vsBtn = el(
      'button',
      'hud-btn hud-btn-biomass',
      '⚡ Jouer en Mode Auto (Vampire Survivors)'
    );
    vsBtn.type = 'button';
    vsCard.append(vsHeader, vsBadge, vsDesc, vsPerks, vsBtn);
    vsCard.addEventListener('click', () => {
      this.setCombatMode('vampire_survivors', true);
      this.hideCombatModeModal();
    });

    // Carte 2 : Mode Diablo / Action-RPG (Actif 1-4)
    const diabloCard = el('div', 'combat-mode-card mode-diablo');
    const diabloHeader = el('div', 'combat-mode-card-header');
    diabloHeader.append(
      el('span', 'combat-mode-icon', '⚔️'),
      el('div', 'combat-mode-title', 'Mode Diablo / Action-RPG (Actif 1-4)')
    );
    const diabloBadge = el(
      'span',
      'hud-lineage-badge badge-pz',
      'Contrôle Total • Timing & Combos Manuels'
    );
    const diabloDesc = el(
      'p',
      'combat-mode-desc',
      'Vous déclenchez manuellement vos coups d’épée Runique (Clic Gauche / Espace) et choisissez l’instant exact où lancer chacun de vos 4 Sorts 3D avec les touches [1], [2], [3], [4] (ou en cliquant sur la barre de compétences).'
    );
    const diabloPerks = el('div', 'combat-mode-perks');
    diabloPerks.append(
      el('div', 'combat-mode-perk-item', '🔥 Sort 3D de départ : Nova Pyroclastique (Niv. 1)'),
      el('div', 'combat-mode-perk-item', '⌨️ Touches [1] [2] [3] [4] pour lancer vos Sorts 3D'),
      el('div', 'combat-mode-perk-item', '🏰 Raccourcis Bâtiments Bastion déplacés sur [F1-F3]')
    );
    const diabloBtn = el(
      'button',
      'hud-btn hud-btn-amber',
      '⚔️ Jouer en Mode Actif [1-4] (Diablo)'
    );
    diabloBtn.type = 'button';
    diabloCard.append(diabloHeader, diabloBadge, diabloDesc, diabloPerks, diabloBtn);
    diabloCard.addEventListener('click', () => {
      this.setCombatMode('diablo_action', true);
      this.hideCombatModeModal();
    });

    grid.append(vsCard, diabloCard);
    body.appendChild(grid);
    dialog.append(header, body);
    this.combatModeBackdrop.appendChild(dialog);
    this.root.appendChild(this.combatModeBackdrop);
  }

  /**
   * Ouvre la modale de choix du mode de combat (`Vampire Survivors` vs `Diablo`) et met le jeu en pause.
   */
  showCombatModeModal() {
    if (!this.combatModeBackdrop) return;
    this.isCombatModeModalOpen = true;
    this.combatModeBackdrop.classList.remove('is-hidden');
  }

  /**
   * Ferme la modale de choix du mode de combat et reprend la simulation.
   */
  hideCombatModeModal() {
    this.isCombatModeModalOpen = false;
    if (this.combatModeBackdrop) {
      this.combatModeBackdrop.classList.add('is-hidden');
    }
  }

  /**
   * Affiche la modale Roguelike de sélection d'amélioration (3 cartes) et met le jeu en pause (`isLevelUpOpen = true`).
   * @param {Array<Object>} [customChoices] - Liste optionnelle de 3 améliorations.
   * @param {Function} [onSelect] - Callback `(upgrade)` appelé lors du choix.
   * @param {Object} [ecoContext={}] - Contexte écologique et/ou joueur pour pondérer les choix.
   */
  showLevelUpModal(customChoices = null, onSelect = null, ecoContext = {}) {
    if (!this.levelUpBackdrop || !this.levelUpCardsGrid) return;

    let choices = [];
    if (Array.isArray(customChoices) && customChoices.length > 0) {
      choices = customChoices.slice(0, 3);
    } else if (typeof drawRoguelikeLevelUpChoices === 'function') {
      const playerRef = ecoContext?.player || this.lastPlayerRef || null;
      const ownedMap =
        playerRef && typeof playerRef.getOwnedAbilitiesMap === 'function'
          ? playerRef.getOwnedAbilitiesMap()
          : playerRef?.abilityLevels || {};
      choices = drawRoguelikeLevelUpChoices({
        abilityLevels: ownedMap,
        chosenPassives: this.chosenUpgradeIds || playerRef?.upgrades || [],
        masterySystem: playerRef?.masterySystem || playerRef?.mastery || null,
        ecoContext,
        combatMode: this.combatMode,
        count: 3,
      });
    } else if (typeof pickCounterAdaptationUpgrades === 'function') {
      choices = pickCounterAdaptationUpgrades(this.chosenUpgradeIds || [], ecoContext, 3);
    } else {
      const pool = [...(DESIGNED_UPGRADES || []), ...(CONFIG.UPGRADES || []), ...this.extraUpgrades];
      choices = pool.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    }

    this.levelUpCardsGrid.replaceChildren();

    for (const upg of choices) {
      const card = el('div', 'levelup-card');
      if (upg.isSpell && upg.colorCss) {
        card.style.borderColor = upg.colorCss;
      }

      const top = el('div', '');
      const iconAndTitle = el(
        'div',
        'levelup-card-title',
        `${upg.icon || '⚡'} ${translateString(upg.name)}`
      );

      let badgeLabel = translateString(upg.category || 'Adaptation');
      if (upg.isSpell) {
        badgeLabel = upg.isNewSpell
          ? tr(
              `✨ NEW 3D SPELL (Lv. 1/${upg.maxLevel || 5})`,
              `✨ NOUVEAU SORT 3D (Niv. 1/${upg.maxLevel || 5})`
            )
          : tr(
              `⬆️ SPELL UPGRADE (Lv. ${upg.currentLevel} → ${upg.nextLevel})`,
              `⬆️ AMÉLIORATION SORT (Niv. ${upg.currentLevel} → ${upg.nextLevel})`
            );
      }

      const categoryBadge = el(
        'span',
        `hud-lineage-badge ${upg.isSpell ? 'badge-pz' : 'badge-spread'}`,
        badgeLabel
      );
      const desc = el('p', 'levelup-card-desc', translateString(upg.description || ''));

      top.append(iconAndTitle, categoryBadge);
      if (upg.counterTarget) {
        top.appendChild(
          el(
            'div',
            'codex-item-stats',
            tr(
              `Countermeasure: ${translateString(upg.counterTarget)}`,
              `Contre-mesure : ${upg.counterTarget}`
            )
          )
        );
      } else if (upg.statsAtNextLevel) {
        const st = upg.statsAtNextLevel;
        top.appendChild(
          el(
            'div',
            'codex-item-stats',
            tr(
              `Damage: ${st.damage} · Range: ${st.range}m · Cooldown: ${st.cooldown > 0 ? `${st.cooldown}s` : 'Permanent'}`,
              `Dégâts: ${st.damage} · Portée: ${st.range}m · Recharge: ${st.cooldown > 0 ? `${st.cooldown}s` : 'Permanent'}`
            )
          )
        );
      }

      const btnLabel = upg.isSpell
        ? upg.isNewSpell
          ? tr('✨ Unlock 3D Spell', '✨ Débloquer ce Sort 3D')
          : tr(`⬆️ Upgrade to Lv. ${upg.nextLevel}`, `⬆️ Améliorer au Niv. ${upg.nextLevel}`)
        : tr('🛡️ Choose Adaptation', '🛡️ Choisir cette Adaptation');
      const chooseBtn = el('button', 'hud-btn hud-btn-amber', btnLabel);
      chooseBtn.type = 'button';

      const handlePick = () => {
        if (!this.chosenUpgradeIds) this.chosenUpgradeIds = [];
        if (upg.id) this.chosenUpgradeIds.push(upg.id);
        this.hideLevelUpModal();
        if (typeof onSelect === 'function') {
          onSelect(upg);
        } else if (this.callbacks.onSelectUpgrade) {
          this.callbacks.onSelectUpgrade(upg);
        }
      };

      card.addEventListener('click', handlePick);
      card.append(top, desc, chooseBtn);
      this.levelUpCardsGrid.appendChild(card);
    }

    this.isLevelUpOpen = true;
    this.levelUpBackdrop.classList.remove('is-hidden');
  }

  /**
   * Ferme la modale Roguelike de montée de niveau.
   */
  hideLevelUpModal() {
    this.isLevelUpOpen = false;
    if (this.levelUpBackdrop) {
      this.levelUpBackdrop.classList.add('is-hidden');
    }
  }

  /* ==========================================================================
     7C. MODALE ARCHITECTE DU BASTION (`[H]`) — CONSTRUCTION & AMÉLIORATION NIV. 0 -> 3
     ========================================================================== */
  _buildBastionArchitectModal() {
    this.bastionModalBackdrop = el('div', 'hud-modal-backdrop is-hidden hud-interactive');
    const dialog = el('div', 'hud-modal-dialog');
    dialog.style.maxWidth = '1060px';

    const header = el('div', 'hud-modal-header');
    header.append(
      el(
        'h2',
        'hud-modal-title',
        '🏰 ARCHITECTE DU BASTION — INFRASTRUCTURES & ÉCLAIREURS [H]'
      ),
      (this.bastionModalCloseBtn = el(
        'button',
        'hud-btn hud-btn-amber',
        'Fermer [H / Échap]'
      ))
    );
    this.bastionModalCloseBtn.type = 'button';
    this.bastionModalCloseBtn.addEventListener('click', () =>
      this.toggleBastionArchitectModal(false)
    );

    const body = el('div', 'hud-modal-body');

    const pauseBanner = el('div', 'hud-pause-banner');
    pauseBanner.append(
      el('span', 'hud-pause-banner-icon', '⏸️'),
      el(
        'span',
        '',
        'JEU EN PAUSE — Construisez et améliorez les 5 Bâtiments du Bastion (Niv. 0 → 3) ici ou en vous approchant des socles dorés autour du feu avec [E].'
      )
    );
    body.appendChild(pauseBanner);

    this.bastionArchitectResBar = el('div', 'hud-resources-group');
    this.bastionArchitectResBar.style.marginBottom = '12px';
    body.appendChild(this.bastionArchitectResBar);

    this.bastionArchitectGridEl = el('div', 'bastion-architect-grid');
    body.appendChild(this.bastionArchitectGridEl);

    dialog.append(header, body);
    this.bastionModalBackdrop.appendChild(dialog);
    this.bastionModalBackdrop.addEventListener('click', (evt) => {
      if (evt.target === this.bastionModalBackdrop) {
        this.toggleBastionArchitectModal(false);
      }
    });

    this.root.appendChild(this.bastionModalBackdrop);
  }

  /**
   * Ouvre ou ferme la modale Architecte du Bastion (`[H]`) et met le jeu en pause (`isBastionModalOpen`).
   * @param {boolean} [forceState]
   * @param {Object} [bastionAndNpcs]
   * @param {Object} [player]
   * @returns {boolean}
   */
  toggleBastionArchitectModal(forceState, bastionAndNpcs = null, player = null) {
    this.isBastionModalOpen =
      typeof forceState === 'boolean' ? forceState : !this.isBastionModalOpen;
    if (this.bastionModalBackdrop) {
      this.bastionModalBackdrop.classList.toggle('is-hidden', !this.isBastionModalOpen);
    }
    if (this.isBastionModalOpen) {
      this.renderBastionArchitectContent(
        bastionAndNpcs || this.lastBastionRef,
        player || this.lastPlayerRef
      );
    }
    return this.isBastionModalOpen;
  }

  /**
   * Construit les 5 cartes détaillées de l'Architecte du Bastion (Niv. 0 -> 1 -> 2 -> 3).
   * @param {Object} [bastionAndNpcs]
   * @param {Object} [player]
   */
  renderBastionArchitectContent(bastionAndNpcs = null, player = null) {
    if (!this.bastionArchitectGridEl) return;
    const bRef = bastionAndNpcs || this.lastBastionRef;
    const pRef = player || this.lastPlayerRef;
    const res = pRef?.resources || { wood: 0, crystal: 0, biomass: 0 };

    if (this.bastionArchitectResBar) {
      this.bastionArchitectResBar.replaceChildren(
        el(
          'div',
          'hud-resource-badge res-wood',
          tr(
            `🪵 Available Wood: ${Math.floor(res.wood ?? 0)}`,
            `🪵 Bois dispo: ${Math.floor(res.wood ?? 0)}`
          )
        ),
        el(
          'div',
          'hud-resource-badge res-crystal',
          tr(
            `💎 Available Crystal: ${Math.floor(res.crystal ?? 0)}`,
            `💎 Cristal dispo: ${Math.floor(res.crystal ?? 0)}`
          )
        ),
        el(
          'div',
          'hud-resource-badge res-biomass',
          tr(
            `🌿 Available Biomass: ${Math.floor(res.biomass ?? 0)}`,
            `🌿 Biomasse dispo: ${Math.floor(res.biomass ?? 0)}`
          )
        )
      );
    }

    this.bastionArchitectGridEl.replaceChildren();

    for (const bDef of BASTION_BUILDINGS_CATALOG) {
      const currentLevel =
        bRef && typeof bRef.getBuildingLevel === 'function'
          ? bRef.getBuildingLevel(bDef.id)
          : bRef?.buildingLevels?.[bDef.id] ?? bDef.initialLevel;
      const spec = getBuildingUpgradeSpec(bDef.id, currentLevel);
      const affordable = canAffordBuildingUpgrade(bDef.id, currentLevel, res);

      const card = el(
        'div',
        `bastion-architect-card${spec.isMaxLevel ? ' is-max-level' : ''}`
      );

      const header = el('div', 'bastion-architect-header');
      const titleGroup = el('div', 'bastion-architect-title-group');
      titleGroup.append(
        el('span', 'bastion-architect-icon', spec.icon),
        el('div', 'bastion-architect-name', `${translateString(spec.name)} [${spec.hotkey}]`)
      );
      const lvlBadge = el(
        'span',
        `hud-building-lvl-badge${currentLevel === 0 ? ' lvl-0' : spec.isMaxLevel ? ' lvl-max' : ''}`,
        spec.isMaxLevel
          ? tr('LV. 3 MAX', 'NIV. 3 MAX')
          : tr(`Lv. ${currentLevel} / ${spec.maxLevel}`, `Niv. ${currentLevel} / ${spec.maxLevel}`)
      );
      header.append(titleGroup, lvlBadge);

      const summary = el('p', 'bastion-architect-summary', translateString(bDef.summary));

      const tiersWrap = el('div', 'bastion-architect-tiers');
      for (const tier of bDef.levels || []) {
        let stateCls = 'is-locked';
        if (tier.level === currentLevel) stateCls = 'is-current';
        else if (tier.level < currentLevel) stateCls = 'is-unlocked';

        const tierRow = el('div', `bastion-tier-item ${stateCls}`);
        tierRow.append(
          el(
            'div',
            'bastion-tier-title',
            tr(
              `${tier.level <= currentLevel ? '✅' : '🔒'} Lv. ${tier.level} — ${translateString(tier.label)}`,
              `${tier.level <= currentLevel ? '✅' : '🔒'} Niv. ${tier.level} — ${tier.label}`
            )
          ),
          el('div', '', translateString(tier.effectText))
        );
        tiersWrap.appendChild(tierRow);
      }

      const footer = el('div', 'hud-building-bottom');
      const costSpan = el(
        'span',
        `hud-building-cost${spec.isMaxLevel ? '' : affordable ? ' is-affordable' : ' is-missing'}`,
        spec.isMaxLevel
          ? tr('✨ Maximum Level Reached', '✨ Niveau Maximum Atteint')
          : tr(
              `Cost Lv. ${spec.nextLevel}: ${translateString(spec.costText)}`,
              `Coût Niv. ${spec.nextLevel}: ${spec.costText}`
            )
      );

      const actBtn = el(
        'button',
        `hud-btn hud-building-upgrade-btn${!spec.isMaxLevel && affordable ? ' is-ready-glow' : ''}`,
        spec.isMaxLevel
          ? tr('✅ Lv. 3 Max', '✅ Niv. 3 Max')
          : tr(
              `⬆️ ${translateString(spec.actionVerb)} → Lv. ${spec.nextLevel} [${spec.hotkey}]`,
              `⬆️ ${spec.actionVerb} → Niv. ${spec.nextLevel} [${spec.hotkey}]`
            )
      );
      actBtn.type = 'button';
      actBtn.disabled = spec.isMaxLevel || !affordable;
      actBtn.addEventListener('click', () => {
        if (this.callbacks.onBuildStructure) {
          this.callbacks.onBuildStructure(bDef.id);
          this.renderBastionArchitectContent(
            bastionAndNpcs || this.lastBastionRef,
            player || this.lastPlayerRef
          );
        }
      });

      footer.append(costSpan, actBtn);
      card.append(header, summary, tiersWrap, footer);
      this.bastionArchitectGridEl.appendChild(card);
    }
  }

  /* ==========================================================================
     7C. MODALE FORGE DES ARMES ÉLÉMENTAIRES LÉGENDAIRES [K] (PHASE 8)
     ========================================================================== */
  _buildWeaponForgeModal() {
    this.weaponModalBackdrop = el('div', 'modal-backdrop hud-interactive');

    const card = el('div', 'modal-card');
    card.style.maxWidth = '1060px';

    const header = el('div', 'modal-header');
    const titleWrap = el('div', 'modal-title-wrap');
    titleWrap.append(
      el(
        'h2',
        'modal-title',
        '⚔️ Forge des Artéfacts Élémentaires & Reliques d’Éden [K]'
      ),
      el(
        'p',
        'modal-subtitle',
        'Équipez librement l’une des 4 Grandes Épées Élémentaires Légendaires (Feu, Glace, Foudre, Venin Bio-Sélectif) ou votre Lame d’Acier Runique. La Lame de Venin Sylvestre épargne automatiquement le Gibier Herbivore (Biches & Lapins) !'
      )
    );

    const closeBtn = el('button', 'modal-close-btn', '✕ Fermer [K / Échap]');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => this.toggleWeaponModal(false));

    header.append(titleWrap, closeBtn);

    const body = el('div', 'modal-body');

    // Bandeau de progression des Reliques Anciennes (0/3 -> 3/3) dans la modale
    this.weaponModalRelicBanner = el('div', 'codex-summary-grid');
    this.weaponForgeGridEl = el('div', 'weapon-forge-grid');

    body.append(this.weaponModalRelicBanner, this.weaponForgeGridEl);
    card.append(header, body);
    this.weaponModalBackdrop.appendChild(card);

    this.weaponModalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.weaponModalBackdrop) {
        this.toggleWeaponModal(false);
      }
    });

    this.root.appendChild(this.weaponModalBackdrop);
  }

  /**
   * Ouvre ou ferme la modale de la Forge des Armes Élémentaires [K] (met le jeu en pause).
   * @param {boolean} [forceState]
   * @param {Object} [player]
   * @param {Object} [bastionAndNpcs]
   */
  toggleWeaponModal(forceState, player = null, bastionAndNpcs = null) {
    this.isWeaponModalOpen =
      typeof forceState === 'boolean' ? forceState : !this.isWeaponModalOpen;
    this.weaponModalBackdrop.classList.toggle('is-open', this.isWeaponModalOpen);
    if (this.isWeaponModalOpen) {
      this.renderWeaponForgeContent(
        player || this.lastPlayerRef,
        bastionAndNpcs || this.lastBastionRef
      );
    }
  }

  /**
   * Génère les cartes des 5 armes (Acier Runique + 4 Armes Élémentaires Légendaires) et l'état des 3 Reliques.
   * @param {Object} player
   * @param {Object} bastionAndNpcs
   */
  renderWeaponForgeContent(player = null, bastionAndNpcs = null) {
    if (!this.weaponForgeGridEl) return;
    this.weaponForgeGridEl.replaceChildren();

    const p = player || this.lastPlayerRef;
    const b = bastionAndNpcs || this.lastBastionRef;
    const equippedId = p?.equippedWeaponId || 'runic_steel';
    const relicCount =
      typeof b?.getCollectedRelicCount === 'function'
        ? b.getCollectedRelicCount()
        : b?.collectedRelicFragments || 0;
    const maxRelics = RELIC_FRAGMENTS_SPEC?.totalRequired || 3;

    if (this.weaponModalRelicBanner) {
      this.weaponModalRelicBanner.replaceChildren();
      const equippedSpec = getElementalWeaponSpec(equippedId);
      const stats = [
        {
          val: `${equippedSpec.icon} ${translateString(equippedSpec.shortName)}`,
          lbl: tr('Active Equipped Weapon', 'Arme Équipée Active'),
        },
        {
          val: tr(
            `+${Math.round(((equippedSpec.damageMultiplier || 1) - 1) * 100)}% Damage`,
            `+${Math.round(((equippedSpec.damageMultiplier || 1) - 1) * 100)}% Dégâts`
          ),
          lbl: tr('Elemental Power', 'Puissance Élémentaire'),
        },
        {
          val: tr(`${relicCount} / ${maxRelics} Relics`, `${relicCount} / ${maxRelics} Reliques`),
          lbl: tr('Eden Relic Fragments', 'Fragments de Relique d’Éden'),
        },
        {
          val:
            relicCount >= maxRelics
              ? tr('🛡️ READY [V]', '🛡️ PRÊT [V]')
              : tr('🧭 Exploring', '🧭 En Exploration'),
          lbl: tr('Planetary Shield Dome', 'Dôme-Bouclier Planétaire'),
        },
      ];
      for (const s of stats) {
        const box = el('div', 'codex-stat-card');
        box.append(
          el('span', 'codex-stat-val', s.val),
          el('span', 'codex-stat-lbl', s.lbl)
        );
        this.weaponModalRelicBanner.appendChild(box);
      }
    }

    for (const wSpec of ELEMENTAL_WEAPONS_CATALOG) {
      const isEquipped = wSpec.id === equippedId;
      const card = el(
        'div',
        `weapon-forge-card elem-${wSpec.element || 'steel'}${isEquipped ? ' is-equipped' : ''}`
      );

      const head = el('div', 'weapon-forge-head');
      const iconBox = el('div', 'weapon-forge-icon', wSpec.icon);
      const titleGroup = el('div', '');
      titleGroup.append(
        el('h4', 'weapon-forge-title', translateString(wSpec.name)),
        el('span', 'weapon-forge-element-tag', translateString(wSpec.badgeText || wSpec.element))
      );
      head.append(iconBox, titleGroup);

      const desc = el('p', 'weapon-forge-desc', translateString(wSpec.description));
      const passive = el('div', 'weapon-forge-passive', translateString(wSpec.passiveDesc));

      const equipBtn = el(
        'button',
        `weapon-forge-equip-btn${isEquipped ? ' is-equipped' : ''}`,
        isEquipped
          ? tr('✅ Weapon Currently Equipped', '✅ Arme Actuellement Équipée')
          : tr(`⚔️ Equip ${translateString(wSpec.shortName)}`, `⚔️ Équiper ${wSpec.shortName}`)
      );
      equipBtn.type = 'button';
      equipBtn.addEventListener('click', () => {
        if (typeof this.callbacks.onEquipWeapon === 'function') {
          this.callbacks.onEquipWeapon(wSpec.id);
        }
        this.renderWeaponForgeContent(
          player || this.lastPlayerRef,
          bastionAndNpcs || this.lastBastionRef
        );
      });

      card.append(head, desc, passive, equipBtn);
      this.weaponForgeGridEl.appendChild(card);
    }
  }

  /* ==========================================================================
     7D. MODALE DÔME-BOUCLIER PLANÉTAIRE & VICTOIRE D'ÎLE [V] (PHASE 8)
     ========================================================================== */
  _buildIslandVictoryModal() {
    this.islandModalBackdrop = el('div', 'modal-backdrop hud-interactive');

    const card = el('div', 'modal-card');
    card.style.maxWidth = '920px';

    const header = el('div', 'modal-header');
    const titleWrap = el('div', 'modal-title-wrap');
    this.islandModalTitleEl = el(
      'h2',
      'modal-title',
      '🛡️ Dôme-Bouclier Planétaire d’Éden & Sanctuarisation de l’Île [V]'
    );
    this.islandModalSubtitleEl = el(
      'p',
      'modal-subtitle',
      'Les 3 Fragments de Relique Ancienne résonnent avec le Cœur du Bastion : un Dôme-Bouclier Planétaire protège désormais l’écosystème de cette île !'
    );
    titleWrap.append(this.islandModalTitleEl, this.islandModalSubtitleEl);

    const closeBtn = el('button', 'modal-close-btn', '✕ Rester sur l’Île [Échap]');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => this.hideIslandVictoryModal());

    header.append(titleWrap, closeBtn);

    const body = el('div', 'modal-body');

    const hero = el('div', 'island-victory-hero');
    const artWrap = el('div', 'island-victory-artwork-wrap');
    const artImg = document.createElement('img');
    artImg.className = 'island-victory-artwork';
    artImg.src = CHARACTER_PORTRAITS.kaelen.proud.url;
    artImg.alt = 'Dôme-Bouclier Planétaire Genesis Bastion';
    artWrap.appendChild(artImg);

    const contentCol = el('div', '');
    this.islandVictoryHeadlineEl = el(
      'h3',
      'modal-title',
      '🏝️ Île #1 Sanctuarisée — Écosystème Stabilisé !'
    );
    this.islandVictoryHeadlineEl.style.marginBottom = '8px';

    this.islandVictoryLoreEl = el(
      'p',
      'modal-subtitle',
      'Le Dôme-Bouclier Planétaire englobe désormais toute l’île dans une voûte d’énergie émeraude et dorée. Vous pouvez continuer à observer cet écosystème ou appareiller immédiatement vers la prochaine île de l’archipel (faune plus dense, mutations accélérées, nouvelles reliques).'
    );

    this.islandVictoryStatsGrid = el('div', 'island-victory-stats-grid');

    const actionsWrap = el('div', 'island-victory-actions');
    this.advanceNextIslandBtn = el(
      'button',
      'island-next-btn',
      '⛵ CAP SUR L’ÎLE SUIVANTE (Île #2) →'
    );
    this.advanceNextIslandBtn.type = 'button';
    this.advanceNextIslandBtn.addEventListener('click', () => {
      this.hideIslandVictoryModal();
      if (typeof this.callbacks.onAdvanceNextIsland === 'function') {
        this.callbacks.onAdvanceNextIsland();
      }
    });

    const stayBtn = el(
      'button',
      'hud-btn',
      '🔍 Continuer d’explorer cette île sous le Dôme'
    );
    stayBtn.type = 'button';
    stayBtn.addEventListener('click', () => this.hideIslandVictoryModal());

    actionsWrap.append(this.advanceNextIslandBtn, stayBtn);
    contentCol.append(
      this.islandVictoryHeadlineEl,
      this.islandVictoryLoreEl,
      this.islandVictoryStatsGrid,
      actionsWrap
    );

    hero.append(artWrap, contentCol);
    body.appendChild(hero);
    card.append(header, body);
    this.islandModalBackdrop.appendChild(card);

    this.root.appendChild(this.islandModalBackdrop);
  }

  /**
   * Affiche la modale de Victoire d'Île / Dôme-Bouclier Planétaire [V] (met le jeu en pause).
   * @param {Object} [islandData]
   */
  showIslandVictoryModal(islandData = {}) {
    this._lastIslandVictoryData = islandData;
    const currentIsland = islandData.islandNumber || 1;
    const nextIsland = currentIsland + 1;
    const currentTier = getIslandTierSpec(currentIsland);
    const nextTier = getIslandTierSpec(nextIsland);
    const relicCount = islandData.relicCount ?? 3;
    const equippedWeapon = getElementalWeaponSpec(
      islandData.equippedWeaponId || this.lastPlayerRef?.equippedWeaponId || 'runic_steel'
    );

    this._applyAlertBannerPortrait('island_victory');

    const curName = translateString(currentTier.name);
    const curSub = translateString(currentTier.subtitle);
    const nextName = translateString(nextTier.name);
    const nextSub = translateString(nextTier.subtitle);

    if (this.islandVictoryHeadlineEl) {
      this.islandVictoryHeadlineEl.textContent = tr(
        `🛡️ ${curName} Sanctuarized — Planetary Shield Dome Active!`,
        `🛡️ ${currentTier.name} Sanctuarisée — Dôme-Bouclier Planétaire Actif !`
      );
    }
    if (this.islandVictoryLoreEl) {
      this.islandVictoryLoreEl.textContent = tr(
        `Thanks to the ${relicCount}/3 Eden Relics, the Planetary Shield Dome now protects ${curName} (${curSub}). Next destination: ${nextName} (${nextSub}) — Threat multiplier x${nextTier.enemyStatMultiplier.toFixed(2)}, mutation bonus +${Math.round(nextTier.mutationRateBonus * 100)}%.`,
        `Grâce aux ${relicCount}/3 Reliques d'Éden, le Dôme-Bouclier Planétaire protège désormais ${currentTier.name} (${currentTier.subtitle}). Prochaine destination : ${nextTier.name} (${nextTier.subtitle}) — Multiplicateur de menace x${nextTier.enemyStatMultiplier.toFixed(2)}, bonus de mutation +${Math.round(nextTier.mutationRateBonus * 100)}%.`
      );
    }

    if (this.islandVictoryStatsGrid) {
      this.islandVictoryStatsGrid.replaceChildren();
      const stats = [
        {
          val: tr(`Island #${currentIsland} → #${nextIsland}`, `Île #${currentIsland} → #${nextIsland}`),
          lbl: tr('Archipelago Campaign', 'Campagne Archipel'),
        },
        {
          val: `${relicCount} / 3 🧩`,
          lbl: tr('Assembled Eden Relics', 'Reliques d’Éden Assemblées'),
        },
        {
          val: `${equippedWeapon.icon} ${translateString(equippedWeapon.shortName)}`,
          lbl: tr('Retained Elemental Weapon', 'Arme Élémentaire Conservée'),
        },
      ];
      for (const s of stats) {
        const box = el('div', 'island-victory-stat-box');
        box.append(
          el('span', 'island-victory-stat-val', s.val),
          el('span', 'island-victory-stat-lbl', s.lbl)
        );
        this.islandVictoryStatsGrid.appendChild(box);
      }
    }

    if (this.advanceNextIslandBtn) {
      this.advanceNextIslandBtn.textContent = tr(
        `⛵ SET SAIL FOR NEXT ISLAND (${nextName}) →`,
        `⛵ CAP SUR L’ÎLE SUIVANTE (${nextTier.name}) →`
      );
    }

    this.isIslandModalOpen = true;
    this.islandModalBackdrop.classList.add('is-open');
  }

  /**
   * Ferme la modale du Dôme-Bouclier Planétaire.
   */
  hideIslandVictoryModal() {
    this.isIslandModalOpen = false;
    if (this.islandModalBackdrop) {
      this.islandModalBackdrop.classList.remove('is-open');
    }
  }

  /* ==========================================================================
     7E. MODALE GAME OVER ROGUELIKE, REQUIEM TRISTE LYRIA (64 BPM)
         & DOUBLE OPTION : REPARTIR À ZÉRO VS CONTINUER QUAND MÊME [X] (PHASE 9)
     ========================================================================== */
  _buildGameOverModal() {
    this.gameOverBackdrop = el(
      'div',
      'modal-backdrop gameover-modal-backdrop hud-interactive'
    );

    const card = el('div', 'gameover-modal-card');

    // 1. En-tête dramatique Game Over
    const header = el('div', 'gameover-header');
    const headerLeft = el('div', 'gameover-header-left');
    const skullBadge = el('div', 'gameover-skull-badge', '💀');
    const titleWrap = el('div', 'modal-title-wrap');
    this.gameOverTitleEl = el(
      'h2',
      'gameover-title',
      '💀 GAME OVER — FIN DE L’EXPÉDITION'
    );
    this.gameOverSubtitleEl = el(
      'p',
      'gameover-subtitle',
      'Tombé au combat sous la pression de l’écosystème darwinien'
    );
    titleWrap.append(this.gameOverTitleEl, this.gameOverSubtitleEl);
    headerLeft.append(skullBadge, titleWrap);

    const roguelikePill = el(
      'span',
      'gameover-roguelike-pill',
      '🕯️ RÈGLE ROGUELIKE : MORT DÉFINITIVE OU GRÂCE D’ÉDEN'
    );
    header.append(headerLeft, roguelikePill);

    // 2. Corps de la modale
    const body = el('div', 'modal-body');

    // 2A. Encart Musical & Vocal Lyria "Requiem des Cendres" (Aldric)
    const pres = getAlertBannerPortraitPresentation('game_over');
    const lyriaBox = el('div', 'gameover-lyria-box');
    const portraitWrap = el(
      'div',
      `gameover-portrait-wrap ${pres.simagreeClass || 'simagree-scholar-nod'}`
    );
    this.gameOverPortraitImgEl = el('img', 'gameover-portrait-img');
    this.gameOverPortraitImgEl.src =
      pres.portraitUrl || CHARACTER_PORTRAITS.aldric.scholar.url;
    this.gameOverPortraitImgEl.alt = 'Aldric — Requiem du Sanctuaire';
    portraitWrap.appendChild(this.gameOverPortraitImgEl);

    const lyriaContent = el('div', 'gameover-lyria-content');
    const lyriaTopRow = el('div', 'gameover-lyria-top-row');
    this.gameOverLyriaBadgeEl = el(
      'span',
      'gameover-lyria-badge',
      '🕯️ Lyria : Requiem des Cendres (64 BPM — Violoncelle & Piano Mélancolique)'
    );

    this.replayGameOverVoiceBtn = el(
      'button',
      'hud-replay-voice-btn',
      '🔈 Réécouter l’Élégie'
    );
    this.replayGameOverVoiceBtn.type = 'button';
    this.replayGameOverVoiceBtn.title =
      'Réécouter l’élégie vocale d’Aldric (Gemini TTS Fenrir) et le thème triste Lyria 64 BPM';
    this.replayGameOverVoiceBtn.addEventListener('click', () => {
      if (typeof this.callbacks.onReplayGameOverVoice === 'function') {
        this.callbacks.onReplayGameOverVoice();
      } else if (typeof this.callbacks.onReplayTutorialVoice === 'function') {
        this.callbacks.onReplayTutorialVoice('alert_gameover_requiem');
      }
    });
    lyriaTopRow.append(this.gameOverLyriaBadgeEl, this.replayGameOverVoiceBtn);

    this.gameOverQuoteEl = el(
      'div',
      'gameover-quote',
      pres.quote ||
        '« Même les plus grands Gardiens tombent parfois sous la loi de Darwin, mon ami. Écoute le chant du Sanctuaire : veux-tu repartir à zéro selon la règle sacrée du roguelike, ou laisser la flamme d’Éden te relever pour continuer cette expédition ? »'
    );
    lyriaContent.append(lyriaTopRow, this.gameOverQuoteEl);
    lyriaBox.append(portraitWrap, lyriaContent);

    // 2B. Grille Bilan de la Run Roguelike (6 cartes)
    this.gameOverStatsGrid = el('div', 'gameover-stats-grid');

    // 2C. Deux Boutons d'Action Principaux : Repartir à Zéro (Roguelike Pur) vs Continuer quand même
    const actionsRow = el('div', 'gameover-actions');

    this.gameOverRestartBtn = el('button', 'gameover-btn-restart');
    this.gameOverRestartBtn.type = 'button';
    this.gameOverRestartBtn.append(
      el(
        'span',
        'gameover-btn-main-label',
        '🔄 Repartir à Zéro (Nouvelle Run Roguelike — Niv. 1, Île #1)'
      ),
      el(
        'span',
        'gameover-btn-sub-label',
        'Règle Roguelike Pure : Réinitialise le Gardien Niv. 1, le Bastion et l’Écosystème sur l’Île #1'
      )
    );
    this.gameOverRestartBtn.addEventListener('click', () => {
      this.lastKnownPlayerLevel = 1;
      this.chosenUpgradeIds = [];
      this.hideGameOverModal();
      if (typeof this.callbacks.onRestartFromZero === 'function') {
        this.callbacks.onRestartFromZero();
      }
    });

    this.gameOverContinueBtn = el('button', 'gameover-btn-continue');
    this.gameOverContinueBtn.type = 'button';
    this.gameOverContinueBtn.append(
      el(
        'span',
        'gameover-btn-main-label',
        '✨ Continuer quand même (Grâce Temporaire du Sanctuaire — 100% PV)'
      ),
      el(
        'span',
        'gameover-btn-sub-label',
        'Option pour le moment : Ressuscite au Sanctuaire avec 100% PV, +60 Rations et toute votre progression'
      )
    );
    this.gameOverContinueBtn.addEventListener('click', () => {
      this.hideGameOverModal();
      if (typeof this.callbacks.onContinueAfterGameOver === 'function') {
        this.callbacks.onContinueAfterGameOver();
      }
    });

    actionsRow.append(this.gameOverRestartBtn, this.gameOverContinueBtn);

    body.append(lyriaBox, this.gameOverStatsGrid, actionsRow);
    card.append(header, body);
    this.gameOverBackdrop.appendChild(card);
    this.root.appendChild(this.gameOverBackdrop);
  }

  /**
   * Affiche l'écran plein écran Game Over Roguelike accompagné de la musique triste Lyria
   * ("Requiem des Cendres" — 64 BPM) et laisse le choix entre Repartir à Zéro ou Continuer quand même.
   * Met immédiatement la simulation 3D en pause (`this.isGameOverModalOpen = true`).
   *
   * @param {Object} [summary={}] - Bilan de la run roguelike et circonstances de la mort.
   */
  showGameOverModal(summary = {}) {
    if (!this.gameOverBackdrop) return;
    this._lastGameOverSummary = summary;

    const p = summary.player || this.lastPlayerRef || {};
    const b = summary.bastionAndNpcs || this.lastBastionRef || {};
    const em = summary.enemyManager || this.lastEnemyManagerRef || {};
    const eco = summary.ecoSim || this.lastEcoSimRef || {};

    const isBastionFallen =
      summary.reason === 'bastion_destroyed' || summary.reason === 'bastion_fallen';

    const rawKillerName =
      summary.killerName ||
      p.lastKillerName ||
      p.lastDamageSource ||
      (isBastionFallen
        ? tr('Destruction of the Sanctuary Core', 'Destruction du Cœur du Sanctuaire')
        : tr('Mutant Archipelago Predator', 'Prédateur Mutant de l’Archipel'));
    const killerName = translateString(rawKillerName);

    if (this.gameOverSubtitleEl) {
      if (isBastionFallen) {
        this.gameOverSubtitleEl.textContent = tr(
          `⚔️ The Sanctuary Core was destroyed (${killerName}) — The expedition ends here`,
          `⚔️ Le Cœur du Sanctuaire a été détruit (${killerName}) — L’expédition s’achève ici`
        );
      } else {
        this.gameOverSubtitleEl.textContent = tr(
          `⚔️ Fallen in battle under the blows of: ${killerName}`,
          `⚔️ Tombé au combat sous les coups de : ${killerName}`
        );
      }
    }

    const islandNum =
      summary.islandNumber ||
      em.islandNumber ||
      eco.islandNumber ||
      b.islandNumber ||
      1;
    const islandSpec = getIslandTierSpec(islandNum);

    const playerLevel = summary.playerLevel || p.level || 1;
    const modeId = summary.combatMode || p.combatMode || this.combatMode || 'vampire_survivors';
    const modeLabel =
      modeId === 'diablo_action'
        ? tr('Diablo Mode [1-4]', 'Mode Diablo [1-4]')
        : tr('Vampire Survivors Mode (Auto)', 'Mode Vampire Survivors (Auto)');

    const weaponId = summary.equippedWeaponId || p.equippedWeaponId || 'runic_steel';
    const weaponSpec = getElementalWeaponSpec(weaponId);

    const ownedMap =
      typeof p.getOwnedAbilitiesMap === 'function'
        ? p.getOwnedAbilitiesMap()
        : p.abilityLevels || {};
    const spellsCount =
      summary.spellsCount ??
      Object.values(ownedMap).filter((lvl) => Number(lvl) > 0).length;
    const msRef = p.masterySystem || p.mastery || p.adaptiveMastery || null;
    const masterySummary =
      msRef && typeof msRef.getSummaryForHUD === 'function'
        ? msRef.getSummaryForHUD()
        : null;
    const masteryRanks =
      summary.masteryRanks ?? (masterySummary?.totalAdaptationsCount || 0);

    const totalKilled =
      summary.totalKilled ??
      p.enemiesKilledCount ??
      p.kills ??
      em.totalKilled ??
      0;
    const mutantsKilled =
      summary.mutantsKilled ??
      p.mutantsKilledCount ??
      p.mutantsSlain ??
      em.mutantsKilled ??
      0;

    const relicCount =
      summary.relicCount ??
      (typeof b.getCollectedRelicCount === 'function'
        ? b.getCollectedRelicCount()
        : b.collectedRelicFragments || 0);
    const maxRelics = RELIC_FRAGMENTS_SPEC?.totalRequired || 3;
    const generation =
      summary.generation ?? eco.generation ?? Math.max(1, (eco.tickCount || 0) + 1);

    if (this.gameOverStatsGrid) {
      this.gameOverStatsGrid.replaceChildren();
      const cards = [
        {
          label: tr('🏝️ Island Reached', '🏝️ Île Atteinte'),
          value: tr(`Island #${islandNum}`, `Île #${islandNum}`),
          sub: `${translateString(islandSpec.name)} (${translateString(islandSpec.subtitle)})`,
        },
        {
          label: tr('⭐ Guardian Level', '⭐ Niveau du Gardien'),
          value: tr(`Level ${playerLevel}`, `Niveau ${playerLevel}`),
          sub: modeLabel,
        },
        {
          label: tr('⚔️ Elemental Weapon', '⚔️ Arme Élémentaire'),
          value: `${weaponSpec.icon} ${translateString(weaponSpec.shortName)}`,
          sub: translateString(weaponSpec.badgeText || 'Acier Runique'),
        },
        {
          label: tr('✨ Spells & Masteries', '✨ Sorts & Maîtrises'),
          value: tr(
            `${spellsCount} 3D Spell${spellsCount > 1 ? 's' : ''}`,
            `${spellsCount} Sort${spellsCount > 1 ? 's' : ''} 3D`
          ),
          sub: tr(
            `${masteryRanks} Adaptive Mastery Rank${masteryRanks > 1 ? 's' : ''}`,
            `${masteryRanks} Rang${masteryRanks > 1 ? 's' : ''} de Maîtrise Adaptative`
          ),
        },
        {
          label: tr('💀 Monsters Slain', '💀 Monstres Éliminés'),
          value: tr(`${totalKilled} Slain`, `${totalKilled} Vaincu${totalKilled > 1 ? 's' : ''}`),
          sub: tr(
            `incl. ${mutantsKilled} Mutant${mutantsKilled > 1 ? 's' : ''} / Patient Zero`,
            `dont ${mutantsKilled} Mutant${mutantsKilled > 1 ? 's' : ''} / Patient Zéro`
          ),
        },
        {
          label: tr('🧩 Relics & Genetics', '🧩 Reliques & Génétique'),
          value: tr(`${relicCount} / ${maxRelics} Relics`, `${relicCount} / ${maxRelics} Reliques`),
          sub: tr(`Darwinian Generation #${generation}`, `Génération Darwinienne #${generation}`),
        },
      ];

      for (const c of cards) {
        const cardEl = el('div', 'gameover-stat-card');
        cardEl.append(
          el('span', 'gameover-stat-label', c.label),
          el('span', 'gameover-stat-value', c.value),
          el('span', 'gameover-stat-sub', c.sub)
        );
        this.gameOverStatsGrid.appendChild(cardEl);
      }
    }

    this.isGameOverModalOpen = true;
    this.gameOverBackdrop.classList.add('is-open');
  }

  /**
   * Ferme la modale Game Over Roguelike et reprend la simulation (`isGameOverModalOpen = false`).
   */
  hideGameOverModal() {
    this.isGameOverModalOpen = false;
    if (this.gameOverBackdrop) {
      this.gameOverBackdrop.classList.remove('is-open');
    }
  }

  /* ==========================================================================
     7F. MODALE PARAMÈTRES, LANGUE (EN/FR), VOIX GEMINI TTS & AUDIO MIXER [O] (PHASE 13)
     ========================================================================== */
  _buildSettingsModal() {
    this.settingsModalBackdrop = el('div', 'modal-backdrop hud-interactive');

    const card = el('div', 'modal-card settings-modal-card');

    const header = el('div', 'modal-header');
    const titleWrap = el('div', 'modal-title-wrap');
    this.settingsModalTitleEl = el(
      'h2',
      'modal-title',
      tr(
        '⚙️ Settings — Language, Voices, Audio & 3D Graphics [O]',
        '⚙️ Paramètres — Langue, Voix, Audio & Graphismes 3D [O]'
      )
    );
    this.settingsModalSubtitleEl = el(
      'p',
      'modal-subtitle',
      tr(
        'Switch UI & Gemini TTS voice language (English default, French 2nd), adjust Lyria 3 / Voice / SFX volumes, or toggle gameplay & 3D options.',
        'Changez la langue de l’interface et des voix Gemini TTS (Anglais par défaut, Français en 2e), ajustez le mixeur audio ou basculez les options 3D.'
      )
    );
    titleWrap.append(this.settingsModalTitleEl, this.settingsModalSubtitleEl);

    this.settingsCloseBtn = el(
      'button',
      'modal-close-btn',
      tr('✕ [O] / [Esc] Close Settings', '✕ [O] / [Échap] Fermer Paramètres')
    );
    this.settingsCloseBtn.type = 'button';
    this.settingsCloseBtn.addEventListener('click', () => this.hideSettingsModal());

    header.append(titleWrap, this.settingsCloseBtn);

    this.settingsModalBody = el('div', 'modal-body');
    card.append(header, this.settingsModalBody);
    this.settingsModalBackdrop.appendChild(card);

    this.settingsModalBackdrop.addEventListener('click', (evt) => {
      if (evt.target === this.settingsModalBackdrop) {
        this.hideSettingsModal();
      }
    });

    this.root.appendChild(this.settingsModalBackdrop);
    this.renderSettingsModalContent();
  }

  /**
   * Ouvre la modale des Paramètres (`[O]`) et met le jeu en pause (`this.isSettingsModalOpen = true`).
   */
  showSettingsModal() {
    if (!this.settingsModalBackdrop) return;
    this.isSettingsModalOpen = true;
    this.renderSettingsModalContent();
    this.settingsModalBackdrop.classList.add('is-open');
  }

  /**
   * Ferme la modale des Paramètres (`[O]`) et reprend la simulation (`this.isSettingsModalOpen = false`).
   */
  hideSettingsModal() {
    this.isSettingsModalOpen = false;
    if (this.settingsModalBackdrop) {
      this.settingsModalBackdrop.classList.remove('is-open');
    }
  }

  /**
   * Bascule l'ouverture/fermeture de la modale des Paramètres (`[O]`).
   * @param {boolean} [forceState]
   * @returns {boolean}
   */
  toggleSettingsModal(forceState) {
    const next = typeof forceState === 'boolean' ? forceState : !this.isSettingsModalOpen;
    if (next) {
      this.showSettingsModal();
    } else {
      this.hideSettingsModal();
    }
    return this.isSettingsModalOpen;
  }

  /**
   * Construit le contenu interactif de la modale Paramètres :
   * 1. Langue de l'interface & des voix Gemini TTS (`🇬🇧 English (Default)` vs `🇫🇷 Français (2nd)`) + Bouton Tester la Voix
   * 2. Mixeur Audio (`Mute [M]`, `Musique Lyria 3`, `Voix Gemini TTS`, `Effets SFX Combat` : 0% / 25% / 50% / 75% / 100%)
   * 3. Gameplay & Graphismes 3D (`Mode de Combat [C]`, `Modèles Blender 5.0 [J]`, `Post-Processing Bloom`, `Grille Conway [G]`)
   * 4. Bouton Fermer (`[O] / [Esc] Close Settings`)
   */
  renderSettingsModalContent() {
    if (!this.settingsModalBody) return;
    this.settingsModalBody.replaceChildren();

    const currentLang = getLanguage();

    if (this.settingsModalTitleEl) {
      this.settingsModalTitleEl.textContent = tr(
        '⚙️ Settings — Language, Voices, Audio & 3D Graphics [O]',
        '⚙️ Paramètres — Langue, Voix, Audio & Graphismes 3D [O]'
      );
    }
    if (this.settingsModalSubtitleEl) {
      this.settingsModalSubtitleEl.textContent = tr(
        'Switch UI & Gemini TTS voice language (English default, French 2nd), adjust Lyria 3 / Voice / SFX volumes, or toggle gameplay & 3D options.',
        'Changez la langue de l’interface et des voix Gemini TTS (Anglais par défaut, Français en 2e), ajustez le mixeur audio ou basculez les options 3D.'
      );
    }
    if (this.settingsCloseBtn) {
      this.settingsCloseBtn.textContent = tr(
        '✕ [O] / [Esc] Close Settings',
        '✕ [O] / [Échap] Fermer Paramètres'
      );
    }

    // Bannière de pause
    const pauseBanner = el('div', 'hud-pause-banner');
    pauseBanner.append(
      el('span', 'hud-pause-banner-icon', '⏸️'),
      el(
        'span',
        '',
        tr(
          'GAME PAUSED — Changes to language, voices, audio mixer, and 3D graphics apply immediately.',
          'JEU EN PAUSE — Les changements de langue, de voix, de mixeur audio et de graphismes 3D s’appliquent immédiatement.'
        )
      )
    );
    this.settingsModalBody.appendChild(pauseBanner);

    // =========================================================================
    // SECTION 1 : LANGUE DE L'INTERFACE & DES VOIX GEMINI TTS (EN DEFAULT / FR 2ND)
    // =========================================================================
    const langSection = el('div', 'settings-section');
    const langHeader = el('div', 'settings-section-header');
    langHeader.append(
      el(
        'h3',
        'settings-section-title',
        tr(
          '🌐 Interface & Voice Language / Langue UI & Voix',
          '🌐 Langue UI & Voix / Interface & Voice Language'
        )
      ),
      el(
        'span',
        'hud-panel-subtitle',
        tr('English Default • French 2nd', 'Anglais par défaut • Français en 2e')
      )
    );
    langSection.appendChild(langHeader);

    const langGrid = el('div', 'settings-lang-grid');

    // Carte 1 : English (Default)
    const enCard = el(
      'button',
      `settings-lang-card${currentLang === 'en' ? ' is-active' : ''}`
    );
    enCard.type = 'button';
    const enTop = el('div', 'settings-lang-card-top');
    const enNameWrap = el('div', '');
    enNameWrap.append(
      el('span', 'settings-lang-flag', '🇬🇧 '),
      el('span', 'settings-lang-name', 'English (Default)')
    );
    const enBadge = el(
      'span',
      'settings-lang-badge',
      currentLang === 'en' ? tr('ACTIVE • DEFAULT', 'ACTIF • DÉFAUT') : 'DEFAULT (1st)'
    );
    enTop.append(enNameWrap, enBadge);
    const enDesc = el(
      'div',
      'settings-lang-desc',
      'Full English interface, codex, quests & 15 English Gemini TTS voiceovers (Commander Aldric & Scout Chief Kaelen).'
    );
    enCard.append(enTop, enDesc);
    enCard.addEventListener('click', () => {
      setLanguage('en');
      if (typeof this.callbacks.onChangeLanguage === 'function') {
        this.callbacks.onChangeLanguage('en');
      }
      this.refreshLanguage('en');
    });

    // Carte 2 : Français (2nd)
    const frCard = el(
      'button',
      `settings-lang-card${currentLang === 'fr' ? ' is-active' : ''}`
    );
    frCard.type = 'button';
    const frTop = el('div', 'settings-lang-card-top');
    const frNameWrap = el('div', '');
    frNameWrap.append(
      el('span', 'settings-lang-flag', '🇫🇷 '),
      el('span', 'settings-lang-name', 'Français (2nd)')
    );
    const frBadge = el(
      'span',
      'settings-lang-badge',
      currentLang === 'fr' ? tr('ACTIVE • 2ND', 'ACTIF • 2E CHOIX') : '2E LANGUE (2nd)'
    );
    frTop.append(frNameWrap, frBadge);
    const frDesc = el(
      'div',
      'settings-lang-desc',
      'Interface intégrale en français, codex génétique, quêtes & 15 doublages vocaux Gemini TTS en français (Commandant Aldric & Cheffe Kaelen).'
    );
    frCard.append(frTop, frDesc);
    frCard.addEventListener('click', () => {
      setLanguage('fr');
      if (typeof this.callbacks.onChangeLanguage === 'function') {
        this.callbacks.onChangeLanguage('fr');
      }
      this.refreshLanguage('fr');
    });

    langGrid.append(enCard, frCard);
    langSection.appendChild(langGrid);

    const langVoiceRow = el('div', 'settings-lang-voice-row');
    langVoiceRow.append(
      el(
        'span',
        'codex-item-desc',
        currentLang === 'en'
          ? '🎙️ Active Voice Pack: English Gemini TTS (Fenrir & Kore — 24kHz WAV)'
          : '🎙️ Pack Vocal Actif : Gemini TTS Français (Fenrir & Kore — 24kHz WAV)'
      )
    );
    const previewVoiceBtn = el(
      'button',
      'hud-btn hud-btn-amber',
      tr(
        '🔈 Preview Voice / Tester la Voix (Aldric & Kaelen)',
        '🔈 Tester la Voix / Preview Voice (Aldric & Kaelen)'
      )
    );
    previewVoiceBtn.type = 'button';
    previewVoiceBtn.addEventListener('click', () => {
      if (typeof this.callbacks.onTestVoice === 'function') {
        this.callbacks.onTestVoice(currentLang);
      } else if (typeof this.callbacks.onReplayTutorialVoice === 'function') {
        this.callbacks.onReplayTutorialVoice(this._currentOnboardingActNum || 1);
      }
    });
    langVoiceRow.appendChild(previewVoiceBtn);
    langSection.appendChild(langVoiceRow);

    this.settingsModalBody.appendChild(langSection);

    // =========================================================================
    // SECTION 2 : MIXEUR AUDIO (LYRIA 3, VOIX GEMINI TTS & EFFETS SFX COMBAT)
    // =========================================================================
    const audioSection = el('div', 'settings-section');
    const audioHeader = el('div', 'settings-section-header');
    audioHeader.append(
      el(
        'h3',
        'settings-section-title',
        tr(
          '🔊 Audio Mixer & Lyria 3 / Gemini TTS',
          '🔊 Mixeur Audio & Lyria 3 / Gemini TTS'
        )
      )
    );

    const muteBtn = el(
      'button',
      `hud-btn ${this.isAudioMuted ? 'hud-btn-amber' : 'hud-btn-biomass'}`,
      this.isAudioMuted
        ? tr('🔇 Audio Muted — Click to Unmute [M]', '🔇 Audio Muet — Cliquer pour Réactiver [M]')
        : tr('🔊 Audio Active — Click to Mute [M]', '🔊 Audio Actif — Cliquer pour Couper [M]')
    );
    muteBtn.type = 'button';
    muteBtn.addEventListener('click', () => {
      if (typeof this.callbacks.onToggleAudioMute === 'function') {
        const nextMuted = this.callbacks.onToggleAudioMute();
        if (typeof nextMuted === 'boolean') {
          this.setAudioMuteUI(nextMuted);
        } else {
          this.setAudioMuteUI(!this.isAudioMuted);
        }
      } else {
        this.setAudioMuteUI(!this.isAudioMuted);
      }
      this.renderSettingsModalContent();
    });
    audioHeader.appendChild(muteBtn);
    audioSection.appendChild(audioHeader);

    // Synchroniser les volumes depuis SoundManager si disponible
    if (typeof this.callbacks.onGetAudioSettings === 'function') {
      const liveAudio = this.callbacks.onGetAudioSettings();
      if (liveAudio) {
        if (typeof liveAudio.musicVolume === 'number') this.audioSettings.musicVolume = liveAudio.musicVolume;
        if (typeof liveAudio.voiceVolume === 'number') this.audioSettings.voiceVolume = liveAudio.voiceVolume;
        if (typeof liveAudio.sfxVolume === 'number') this.audioSettings.sfxVolume = liveAudio.sfxVolume;
      }
    }

    const audioRowsWrap = el('div', 'settings-audio-rows');
    const volumeSteps = [0, 0.25, 0.5, 0.75, 1.0];
    const channels = [
      {
        key: 'musicVolume',
        label: tr('🎵 Music Volume (Lyria 3 Adaptive Stems)', '🎵 Volume Musique (Stems Adaptatifs Lyria 3)'),
        cbName: 'onSetMusicVolume',
      },
      {
        key: 'voiceVolume',
        label: tr('🎙️ Voiceover Volume (Gemini TTS Aldric & Kaelen)', '🎙️ Volume Voix (Gemini TTS Aldric & Kaelen)'),
        cbName: 'onSetVoiceVolume',
      },
      {
        key: 'sfxVolume',
        label: tr('⚔️ Combat & Ecosystem SFX Volume', '⚔️ Volume Effets Sonores (Combat & Écosystème)'),
        cbName: 'onSetSfxVolume',
      },
    ];

    for (const ch of channels) {
      const row = el('div', 'settings-audio-row');
      const lbl = el('span', 'settings-audio-label', ch.label);
      const pillGroup = el('div', 'settings-vol-pills');
      const curVal = Number(this.audioSettings[ch.key] ?? 0.85);

      // Trouver le palier le plus proche parmi [0, 0.25, 0.5, 0.75, 1.0]
      let closestStep = volumeSteps[0];
      for (const st of volumeSteps) {
        if (Math.abs(curVal - st) < Math.abs(curVal - closestStep)) {
          closestStep = st;
        }
      }

      for (const step of volumeSteps) {
        const pct = Math.round(step * 100);
        const btn = el(
          'button',
          `settings-vol-btn${step === closestStep ? ' is-active' : ''}`,
          `${pct}%`
        );
        btn.type = 'button';
        btn.addEventListener('click', () => {
          this.audioSettings[ch.key] = step;
          if (typeof this.callbacks[ch.cbName] === 'function') {
            this.callbacks[ch.cbName](step);
          }
          if (typeof this.callbacks.onChangeAudioSettings === 'function') {
            this.callbacks.onChangeAudioSettings({ ...this.audioSettings });
          }
          this.renderSettingsModalContent();
        });
        pillGroup.appendChild(btn);
      }

      row.append(lbl, pillGroup);
      audioRowsWrap.appendChild(row);
    }

    audioSection.appendChild(audioRowsWrap);
    this.settingsModalBody.appendChild(audioSection);

    // =========================================================================
    // SECTION 3 : GAMEPLAY & GRAPHISMES 3D (COMBAT, BLENDER 5.0, BLOOM, CONWAY)
    // =========================================================================
    const gfxSection = el('div', 'settings-section');
    const gfxHeader = el('div', 'settings-section-header');
    gfxHeader.append(
      el(
        'h3',
        'settings-section-title',
        tr('🎮 Gameplay & 3D Graphics', '🎮 Gameplay & Graphismes 3D')
      ),
      el(
        'span',
        'hud-panel-subtitle',
        tr('Real-time switches & hotkeys', 'Bascules temps réel & raccourcis')
      )
    );
    gfxSection.appendChild(gfxHeader);

    const togglesGrid = el('div', 'settings-toggles-grid');

    // 3A. Mode de Combat [C]
    const isAutoCombat = this.combatMode === 'vampire_survivors';
    const combatCard = el('div', 'settings-toggle-card');
    combatCard.append(
      el('div', 'settings-toggle-title', tr('⚔️ Combat Mode [C]', '⚔️ Mode de Combat [C]')),
      el(
        'div',
        'settings-toggle-desc',
        isAutoCombat
          ? tr(
              'Auto-Attack & Auto-Cast 3D Spells as soon as cooldowns finish.',
              'Frappe et lance automatiquement vos Sorts 3D dès qu’ils sont rechargés.'
            )
          : tr(
              'Manual Sword Cleave (Click/Space) & Active 3D Spells on [1-4].',
              'Frappe manuelle (Clic/Espace) et Sorts 3D lancés avec [1-4].'
            )
      )
    );
    const combatToggleBtn = el(
      'button',
      `hud-btn ${isAutoCombat ? 'hud-btn-biomass' : 'hud-btn-amber'}`,
      isAutoCombat
        ? tr('⚡ Auto (Vampire Survivors) [C]', '⚡ Auto (Vampire Survivors) [C]')
        : tr('⚔️ Active (Diablo [1-4]) [C]', '⚔️ Actif (Diablo [1-4]) [C]')
    );
    combatToggleBtn.type = 'button';
    combatToggleBtn.addEventListener('click', () => {
      const nextMode = isAutoCombat ? 'diablo_action' : 'vampire_survivors';
      this.setCombatMode(nextMode, true);
      this.renderSettingsModalContent();
    });
    combatCard.appendChild(combatToggleBtn);

    // 3B. Modèles 3D Blender 5.0 (.glb) vs Procédural Classique [J]
    const blenderCard = el('div', 'settings-toggle-card');
    blenderCard.append(
      el(
        'div',
        'settings-toggle-title',
        tr('🎨 3D Models Pipeline [J]', '🎨 Pipeline Modèles 3D [J]')
      ),
      el(
        'div',
        'settings-toggle-desc',
        this.isBlenderMode
          ? tr(
              'Using 15 low-poly PBR Blender 5.0 (.glb) assets with vertex-color shaders.',
              'Utilise les 15 modèles PBR low-poly Blender 5.0 (.glb) avec shaders vertex-color.'
            )
          : tr(
              'Using classic procedural Three.js geometric primitives.',
              'Utilise les géométries procédurales Three.js classiques.'
            )
      )
    );
    const blenderToggleBtn = el(
      'button',
      `hud-btn ${this.isBlenderMode ? 'hud-btn-amber' : ''}`,
      this.isBlenderMode
        ? tr('🎨 Blender 5.0 (.glb) [J]', '🎨 Blender 5.0 (.glb) [J]')
        : tr('📐 Procedural Classic [J]', '📐 Procédural Classique [J]')
    );
    blenderToggleBtn.type = 'button';
    blenderToggleBtn.addEventListener('click', () => {
      const next = !this.isBlenderMode;
      this.setBlenderModeUI(next);
      if (typeof this.callbacks.onToggleBlenderModels === 'function') {
        this.callbacks.onToggleBlenderModels(next);
      }
      this.renderSettingsModalContent();
    });
    blenderCard.appendChild(blenderToggleBtn);

    // 3C. Post-Processing Bloom vs Direct 60FPS
    const bloomCard = el('div', 'settings-toggle-card');
    bloomCard.append(
      el(
        'div',
        'settings-toggle-title',
        tr('✨ Post-Processing Bloom', '✨ Post-Processing Bloom')
      ),
      el(
        'div',
        'settings-toggle-desc',
        this.isBloomEnabled
          ? tr(
              'UnrealBloomPass active for glowing runes and bioluminescent mutations.',
              'UnrealBloomPass actif pour le halo lumineux des runes et mutations.'
            )
          : tr(
              'Direct single-pass WebGL rendering for ultra-stable 60 FPS performance.',
              'Rendu WebGL direct en une passe pour 60 FPS ultra-fluide.'
            )
      )
    );
    const bloomToggleBtn = el(
      'button',
      `hud-btn ${this.isBloomEnabled ? 'hud-btn-amber' : 'hud-btn-biomass'}`,
      this.isBloomEnabled
        ? tr('✨ Bloom ON', '✨ Bloom ACTIVÉ')
        : tr('⚡ Direct 60FPS (Bloom OFF)', '⚡ Direct 60FPS (Bloom DÉSACTIVÉ)')
    );
    bloomToggleBtn.type = 'button';
    bloomToggleBtn.addEventListener('click', () => {
      this.isBloomEnabled = !this.isBloomEnabled;
      if (typeof this.callbacks.onToggleBloom === 'function') {
        this.callbacks.onToggleBloom(this.isBloomEnabled);
      }
      this.renderSettingsModalContent();
    });
    bloomCard.appendChild(bloomToggleBtn);

    // 3D. Grille Automate Cellulaire de Conway [G]
    const conwayCard = el('div', 'settings-toggle-card');
    conwayCard.append(
      el(
        'div',
        'settings-toggle-title',
        tr('🧬 Conway Automaton Grid [G]', '🧬 Grille Automate de Conway [G]')
      ),
      el(
        'div',
        'settings-toggle-desc',
        this.isConwayGridVisible
          ? tr(
              '3D Conway cellular automaton biomass overlay visible on terrain.',
              'Surcouche 3D de biomasse de l’automate cellulaire de Conway visible au sol.'
            )
          : tr(
              'Conway cellular automaton overlay hidden on terrain.',
              'Surcouche 3D de l’automate de Conway masquée sur le terrain.'
            )
      )
    );
    const conwayToggleBtn = el(
      'button',
      `hud-btn ${this.isConwayGridVisible ? 'hud-btn-biomass' : ''}`,
      this.isConwayGridVisible
        ? tr('🧬 Grid ON [G]', '🧬 Grille ACTIVÉE [G]')
        : tr('Grid OFF [G]', 'Grille DÉSACTIVÉE [G]')
    );
    conwayToggleBtn.type = 'button';
    conwayToggleBtn.addEventListener('click', () => {
      this.isConwayGridVisible = !this.isConwayGridVisible;
      if (typeof this.callbacks.onToggleConwayGrid === 'function') {
        this.callbacks.onToggleConwayGrid(this.isConwayGridVisible);
      }
      this.renderSettingsModalContent();
    });
    conwayCard.appendChild(conwayToggleBtn);

    // 3E. Panneaux de Télémétrie Avancée (Défaut : OFF — Clean HUD Minimaliste)
    const telemetryCard = el('div', 'settings-toggle-card');
    telemetryCard.append(
      el(
        'div',
        'settings-toggle-title',
        tr('📊 Advanced Telemetry Panels (Default: OFF)', '📊 Panneaux Télémétrie Avancée (Défaut : OFF)')
      ),
      el(
        'div',
        'settings-toggle-desc',
        this.showAdvancedTelemetry
          ? tr(
              'Showing dense sidebars (Lineages, Conway Forecast, Mastery %, Scout Missions & Logs) on main screen.',
              'Affiche les panneaux latéraux détaillés (Lignées, Conway, Maîtrises, Missions & Logs) sur l’écran.'
            )
          : tr(
              'Clean Minimalist Action-RPG HUD active (90%+ unobstructed 3D viewport). Detailed telemetry stays in [Tab].',
              'HUD Action-RPG minimaliste actif (vue 3D dégagée à 90%+). La télémétrie reste dans le Codex [Tab].'
            )
      )
    );
    const telemetryToggleBtn = el(
      'button',
      `hud-btn ${this.showAdvancedTelemetry ? 'hud-btn-amber' : 'hud-btn-biomass'}`,
      this.showAdvancedTelemetry
        ? tr('📊 Telemetry Sidebars: ON', '📊 Panneaux Télémétrie : ACTIVÉS')
        : tr('✨ Clean Minimalist HUD (Telemetry OFF)', '✨ HUD Minimaliste Épuré (Télémétrie OFF)')
    );
    telemetryToggleBtn.type = 'button';
    telemetryToggleBtn.addEventListener('click', () => {
      this.toggleAdvancedTelemetry();
      this.renderSettingsModalContent();
    });
    telemetryCard.appendChild(telemetryToggleBtn);

    togglesGrid.append(telemetryCard, combatCard, blenderCard, bloomCard, conwayCard);
    gfxSection.appendChild(togglesGrid);
    this.settingsModalBody.appendChild(gfxSection);

    // Pied de modale avec bouton Fermer
    const footer = el('div', 'settings-footer-actions');
    const closeFooterBtn = el(
      'button',
      'hud-btn hud-btn-amber',
      tr('✅ [O] / [Esc] Close Settings & Resume', '✅ [O] / [Échap] Fermer & Reprendre')
    );
    closeFooterBtn.type = 'button';
    closeFooterBtn.addEventListener('click', () => this.hideSettingsModal());
    footer.appendChild(closeFooterBtn);
    this.settingsModalBody.appendChild(footer);
  }

  /**
   * Rafraîchit instantanément toute l'interface HUD, les bannières, les quêtes,
   * les info-bulles et les modales ouvertes lors d'un changement de langue (`'en'` / `'fr'`).
   * @param {'en'|'fr'} [lang]
   */
  refreshLanguage(lang = getLanguage()) {
    // 1. Traduire l'arbre DOM existant (tous les nœuds statiques avec data-i18n-fr)
    translateDOMTree(this.root);

    // 2. Mettre à jour les boutons de la barre supérieure
    this._refreshCombatModeSwitchLabel();
    this.setBlenderModeUI(this.isBlenderMode);
    this.setAudioMuteUI(this.isAudioMuted);
    this.setCleanHudMode(this.cleanHudMode);
    if (this.settingsBtn) {
      this.settingsBtn.textContent = this.cleanHudMode
        ? '⚙️ [O]'
        : tr('⚙️ Settings [O]', '⚙️ Paramètres [O]');
      this.settingsBtn.title = tr(
        'Open Settings: Language (EN/FR), Voices, Audio Mixer & 3D Graphics [O]',
        'Ouvrir les Paramètres : Langue (EN/FR), Voix, Mixeur Audio & Graphismes 3D [O]'
      );
    }

    // 3. Rafraîchir les boutons d'ordres d'éclaireurs (panneau gauche)
    for (const [id, ui] of Object.entries(this.scoutMissionBtns || {})) {
      const spec = getScoutMissionSpec(id, this.selectedLineageId);
      if (ui.titleRow) ui.titleRow.textContent = `${spec.icon} ${translateString(spec.shortLabel)}`;
      if (ui.descRow) ui.descRow.textContent = translateString(spec.description);
    }

    // 4. Forcer le rafraîchissement des panneaux à signature cachée
    this._lastLineageListSig = null;
    this._lastMasterySig = null;

    if (this.lastBastionRef || this.lastPlayerRef) {
      this._updateBastionBuildingsUI(this.lastBastionRef, this.lastPlayerRef);
    }
    if (this.lastPlayerRef) {
      this._updateSkillBar(this.lastPlayerRef);
      this._updateMasteryPanel(this.lastPlayerRef);
    }
    const enemies =
      this.lastEnemyManagerRef && typeof this.lastEnemyManagerRef.getEnemies === 'function'
        ? this.lastEnemyManagerRef.getEnemies()
        : this.lastEnemyManagerRef?.enemies || [];
    this._updateLineagesPanel(this.lastEcoSimRef, enemies);
    this._updateQuestAndScoutMissionUI(this.lastBastionRef, enemies, this.lastQuestSystemRef);

    // 5. Rafraîchir le bandeau d'onboarding si visible
    if (
      this.onboardingCard &&
      !this.onboardingCard.classList.contains('is-hidden') &&
      this._lastOnboardingState
    ) {
      this.updateOnboardingBanner(this._lastOnboardingState);
    }

    // 6. Rafraîchir les modales ouvertes
    if (this.isSettingsModalOpen) {
      this.renderSettingsModalContent();
    }
    if (this.isCodexOpen) {
      this.renderCodexContent(enemies);
    }
    if (this.isBastionModalOpen) {
      this.renderBastionArchitectContent(this.lastBastionRef, this.lastPlayerRef);
    }
    if (this.isWeaponModalOpen) {
      this.renderWeaponForgeContent(this.lastPlayerRef, this.lastBastionRef);
    }
    if (this.isIslandModalOpen && this._lastIslandVictoryData) {
      this.showIslandVictoryModal(this._lastIslandVictoryData);
    }
    if (this.isGameOverModalOpen && this._lastGameOverSummary) {
      this.showGameOverModal(this._lastGameOverSummary);
    }
  }

  /**
   * Met à jour les 5 lignes de bâtiments du Bastion dans le panneau gauche.
   * @param {Object} bastionAndNpcs
   * @param {Object} player
   */
  _updateBastionBuildingsUI(bastionAndNpcs, player) {
    if (!bastionAndNpcs || !this.buildingRowEls) return;
    const res = player?.resources || { wood: 0, crystal: 0, biomass: 0 };

    for (const bDef of BASTION_BUILDINGS_CATALOG) {
      const ui = this.buildingRowEls[bDef.id];
      if (!ui) continue;

      const currentLevel =
        typeof bastionAndNpcs.getBuildingLevel === 'function'
          ? bastionAndNpcs.getBuildingLevel(bDef.id)
          : bastionAndNpcs.buildingLevels?.[bDef.id] ?? bDef.initialLevel;
      const spec = getBuildingUpgradeSpec(bDef.id, currentLevel);
      const affordable = canAffordBuildingUpgrade(bDef.id, currentLevel, res);

      ui.row.className = `hud-building-row${currentLevel > 0 ? ' is-built' : ''}${spec.isMaxLevel ? ' is-max' : ''}`;
      ui.nameEl.textContent = `${spec.icon} ${translateString(spec.shortName)}`;
      ui.lvlBadge.className = `hud-building-lvl-badge${currentLevel === 0 ? ' lvl-0' : spec.isMaxLevel ? ' lvl-max' : ''}`;
      ui.lvlBadge.textContent = spec.isMaxLevel
        ? tr('MAX LV. (3/3)', 'NIV. MAX (3/3)')
        : tr(`Lv. ${currentLevel}/${spec.maxLevel}`, `Niv. ${currentLevel}/${spec.maxLevel}`);

      const curEff = translateString(spec.currentEffectDesc);
      const nextEff = translateString(spec.nextEffectDesc);
      ui.effectEl.textContent = spec.isMaxLevel
        ? tr(`Active: ${curEff}`, `Actif : ${spec.currentEffectDesc}`)
        : currentLevel > 0
          ? tr(`Active: ${curEff} → Next: ${nextEff}`, `Actif : ${spec.currentEffectDesc} → Prochain : ${spec.nextEffectDesc}`)
          : tr(`Lv. 1 Effect: ${nextEff}`, `Effet Niv. 1 : ${spec.nextEffectDesc}`);

      ui.costEl.className = `hud-building-cost${spec.isMaxLevel ? '' : affordable ? ' is-affordable' : ' is-missing'}`;
      ui.costEl.textContent = spec.isMaxLevel
        ? tr('✨ Maxed Out', '✨ Maximisé')
        : tr(`Cost: ${translateString(spec.costText)}`, `Coût: ${spec.costText}`);

      ui.upgBtn.disabled = spec.isMaxLevel || !affordable;
      ui.upgBtn.classList.toggle('is-ready-glow', !spec.isMaxLevel && affordable);
      ui.upgBtn.textContent = spec.isMaxLevel
        ? '✅ Max'
        : `⬆️ ${translateString(spec.actionVerb)} [${spec.hotkey}]`;
    }
  }

  /**
   * Met à jour le Centre de Commandement des Missions d'Éclaireurs (panneau gauche)
   * et la Carte d'Opération / Quête Dynamique en 2 Phases (panneau droit).
   * @param {Object} bastionAndNpcs
   * @param {Array<Object>} enemies
   * @param {Object} questSystem
   */
  _updateQuestAndScoutMissionUI(bastionAndNpcs, enemies = [], questSystem = null) {
    // 1. Mise à jour du panneau Ordre de Mission des Éclaireurs (Gauche)
    if (bastionAndNpcs && this.scoutMissionStatusEl) {
      const mission =
        typeof bastionAndNpcs.getScoutMission === 'function'
          ? bastionAndNpcs.getScoutMission()
          : {
              type: bastionAndNpcs.scoutMissionType || 'track_lineage',
              targetMutationId: bastionAndNpcs.scoutMissionTargetId || 'pyro_gland',
            };
      const mType = mission.type || 'track_lineage';
      const targetMutId = mission.targetMutationId || this.selectedLineageId || 'pyro_gland';

      if (mType === 'track_lineage') {
        const prog =
          typeof bastionAndNpcs.getLineageTrackingProgress === 'function'
            ? bastionAndNpcs.getLineageTrackingProgress(enemies, targetMutId)
            : {
                targetLabel: targetMutId,
                spottedCarriers: 0,
                totalCarriers: 0,
                allSpotted: false,
              };
        const tLbl = translateString(prog.targetLabel);
        this.scoutMissionStatusEl.textContent =
          prog.totalCarriers > 0
            ? tr(
                `🔍 Active Mission: Track [${tLbl}] (Spotted: ${prog.spottedCarriers} / ${prog.totalCarriers})`,
                `🔍 Mission Active : Traquer [${prog.targetLabel}] (Repérés : ${prog.spottedCarriers} / ${prog.totalCarriers})`
              )
            : tr(
                `✅ Active Mission: Track [${tLbl}] (No surviving carriers)`,
                `✅ Mission Active : Traquer [${prog.targetLabel}] (Aucun porteur survivant)`
              );
      } else {
        const spec = getScoutMissionSpec(mType, targetMutId);
        this.scoutMissionStatusEl.textContent = tr(
          `${spec.icon} Active Mission: ${translateString(spec.label)}`,
          `${spec.icon} Mission Active : ${spec.label}`
        );
      }

      for (const [id, ui] of Object.entries(this.scoutMissionBtns || {})) {
        ui.btn.classList.toggle('is-active', id === mType);
      }
    }

    // 2. Mise à jour de la Quête Dynamique en 2 phases (Panneau Droit)
    if (!questSystem || !this.questCardEl) return;

    const summary =
      typeof questSystem.getQuestsSummaryForHUD === 'function'
        ? questSystem.getQuestsSummaryForHUD()
        : null;
    const primaryQuest =
      summary?.primaryQuest ||
      questSystem.activeQuests?.[0] ||
      (typeof questSystem.getQuestHUDState === 'function'
        ? questSystem.getQuestHUDState(enemies, bastionAndNpcs)
        : null);
    if (!primaryQuest) return;

    this._currentPrimaryQuest = primaryQuest;
    const isPhase2 = primaryQuest.phase === 2;
    this.questCardEl.classList.toggle('is-phase-2', isPhase2);
    this.questTitleEl.textContent = translateString(
      primaryQuest.title || '📜 Opération Prioritaire'
    );
    this.questPhaseBadgeEl.textContent = translateString(
      primaryQuest.phaseBadge || (isPhase2 ? 'PHASE 2/2' : 'PHASE 1/2')
    );
    this.questPhaseBadgeEl.className = `hud-lineage-badge ${isPhase2 ? 'badge-spread' : 'badge-pz'}`;

    if (this.questStep1El) {
      this.questStep1El.className = `hud-quest-step ${isPhase2 ? 'is-done' : 'is-active'}`;
      this.questStep1El.textContent = translateString(
        primaryQuest.step1Text || primaryQuest.step1Label || ''
      );
    }
    if (this.questStep2El) {
      this.questStep2El.className = `hud-quest-step ${isPhase2 ? 'is-active' : ''}`;
      this.questStep2El.textContent = translateString(
        primaryQuest.step2Text || primaryQuest.step2Label || ''
      );
    }
    if (this.questHintEl && (primaryQuest.actionHint || primaryQuest.objectiveText)) {
      this.questHintEl.textContent = translateString(
        primaryQuest.actionHint || primaryQuest.objectiveText
      );
    }
    if (this.questRewardEl) {
      const rw = primaryQuest.rewards;
      this.questRewardEl.textContent = rw
        ? tr(
            `🎁 +${rw.wood || 0} Wood · +${rw.crystal || 0} Crystal · +${rw.biomass || 0} Bio · +${rw.xp || 0} XP`,
            `🎁 +${rw.wood || 0} Bois · +${rw.crystal || 0} Cristal · +${rw.biomass || 0} Bio · +${rw.xp || 0} XP`
          )
        : tr(
            `🎁 Reward: ${translateString(primaryQuest.rewardText || '')}`,
            `🎁 Récompense : ${primaryQuest.rewardText || ''}`
          );
    }
    if (this.questActionBtn) {
      if (
        (primaryQuest.type === 'eradicate_lineage' ||
          primaryQuest.type === 'track_and_eradicate') &&
        !isPhase2
      ) {
        this.questActionBtn.textContent = tr(
          `🦅 Launch Scout Tracking (${primaryQuest.spottedCarriers || 0}/${Math.max(1, primaryQuest.totalCarriers || 1)})`,
          `🦅 Lancer Traque Éclaireurs (${primaryQuest.spottedCarriers || 0}/${Math.max(1, primaryQuest.totalCarriers || 1)})`
        );
      } else if (
        primaryQuest.type === 'eradicate_lineage' ||
        primaryQuest.type === 'track_and_eradicate'
      ) {
        this.questActionBtn.textContent = tr(
          `🎯 Target Lineage (${primaryQuest.totalCarriers || 0} remaining)`,
          `🎯 Cibler la Lignée (${primaryQuest.totalCarriers || 0} restant${(primaryQuest.totalCarriers || 0) > 1 ? 's' : ''})`
        );
      } else {
        this.questActionBtn.textContent = tr(
          '🏰 Open Bastion Architect [H]',
          '🏰 Ouvrir l’Architecte du Bastion [H]'
        );
      }
    }
  }

  /* ==========================================================================
     8. BOUCLE DE MISE À JOUR PRINCIPALE DU HUD (`update`)
     ========================================================================== */
  /**
   * Met à jour tous les indicateurs du HUD à chaque frame.
   *
   * @param {Object} state - État courant des systèmes du jeu.
   * @param {Object} [state.sceneManager] - Instance `SceneManager` (pour `getTimeOfDay()`).
   * @param {Object} [state.ecoSim] - Instance `EcosystemSimulator`.
   * @param {Object} [state.enemyManager] - Instance `EnemyManager`.
   * @param {Object} [state.player] - Instance `PlayerController`.
   * @param {Object} [state.bastionAndNpcs] - Instance `BastionAndNPCs`.
   * @param {Object} [state.questSystem] - Instance `DynamicQuestSystem`.
   */
  update(state = {}) {
    const {
      sceneManager = null,
      ecoSim = null,
      enemyManager = null,
      player = null,
      bastionAndNpcs = null,
      questSystem = null,
      sound = null,
    } = state;

    if (player) {
      this.lastPlayerRef = player;
    }
    if (bastionAndNpcs) {
      this.lastBastionRef = bastionAndNpcs;
    }
    if (enemyManager) {
      this.lastEnemyManagerRef = enemyManager;
    }
    if (ecoSim) {
      this.lastEcoSimRef = ecoSim;
    }
    if (questSystem) {
      this.lastQuestSystemRef = questSystem;
    }
    if (
      typeof state.isBlenderMode === 'boolean' &&
      state.isBlenderMode !== this.isBlenderMode
    ) {
      this.setBlenderModeUI(state.isBlenderMode);
    }

    // 0. Télémétrie Musicale Adaptative Lyria & État Voix TTS
    if (sound && typeof sound.getMusicTelemetryForHUD === 'function') {
      const tel = sound.getMusicTelemetryForHUD();
      if (tel) {
        this.setAudioMuteUI(Boolean(tel.muted));
        if (this.lyriaStatusLabel) {
          this.lyriaStatusLabel.textContent =
            getLanguage() === 'en'
              ? tel.shortStatusEN ||
                tel.shortStatus ||
                translateString(tel.shortStatusFR || `🎵 Lyria: ${tel.modeLabelEN || 'Sanctuary'}`)
              : tel.shortStatusFR || `🎵 Lyria : ${tel.modeLabelFR || 'Sanctuaire'}`;
        }
        if (this.lyriaStatusPill) {
          this.lyriaStatusPill.classList.remove(
            'state-tutorial',
            'state-combat',
            'state-boss',
            'state-gameover'
          );
          if (tel.activeStemId === 'gameover' || tel.mode === 'gameover') {
            this.lyriaStatusPill.classList.add('state-gameover');
          } else if (tel.activeStemId === 'boss') {
            this.lyriaStatusPill.classList.add('state-boss');
          } else if (tel.activeStemId === 'combat') {
            this.lyriaStatusPill.classList.add('state-combat');
          } else if (tel.activeStemId === 'tutorial') {
            this.lyriaStatusPill.classList.add('state-tutorial');
          }
        }
        if (this.portraitFrameEl) {
          this.portraitFrameEl.classList.toggle('is-speaking', Boolean(tel.isVoiceSpeaking));
        }
      }
    }

    // 1. Horloge Jour / Nuit & Numéro d'Île (Phase 8)
    if (sceneManager && typeof sceneManager.getTimeOfDay === 'function') {
      const tod = sceneManager.getTimeOfDay();
      const icon = tod.isNight ? '🌙' : tod.phase === 'dawn' || tod.phase === 'dusk' ? '🌅' : '☀️';
      const timeStr = tod.formattedTime ? ` — ${tod.formattedTime}` : '';
      const rawPhaseLbl = tod.label || 'Jour';
      const phaseLbl = translateString(rawPhaseLbl);
      this.clockBadge.textContent = tr(
        `${icon} Day ${tod.dayNumber || 1}${timeStr} (${phaseLbl})`,
        `${icon} Jour ${tod.dayNumber || 1}${timeStr} (${rawPhaseLbl})`
      );
      this.clockBadge.classList.toggle('is-night', Boolean(tod.isNight));
    }

    const currentIslandNumber =
      enemyManager?.islandNumber ||
      ecoSim?.islandNumber ||
      bastionAndNpcs?.islandNumber ||
      1;
    if (this.islandBadge) {
      const tierSpec = getIslandTierSpec(currentIslandNumber);
      const tName = translateString(tierSpec.name);
      const tSub = translateString(tierSpec.subtitle);
      this.islandBadge.textContent = `🏝️ ${tName}`;
      this.islandBadge.title = `${tName} — ${tSub}`;
    }

    // 2. Compte à rebours Eco-Tick & Population (Adultes vs Bébés)
    const nowMs = performance.now();
    const shouldRunSlowHud = !this._lastSlowHudMs || nowMs - this._lastSlowHudMs >= 140;
    if (shouldRunSlowHud) {
      this._lastSlowHudMs = nowMs;
    }

    const enemies =
      enemyManager && typeof enemyManager.getEnemies === 'function'
        ? enemyManager.getEnemies()
        : enemyManager?.enemies || [];

    if (enemyManager) {
      const rem =
        typeof enemyManager.timeUntilNextTick === 'number'
          ? enemyManager.timeUntilNextTick
          : CONFIG.ECO?.TICK_INTERVAL || 12;
      const prog =
        typeof enemyManager.ecoTickProgress === 'number'
          ? enemyManager.ecoTickProgress
          : 0;
      this.ecoTimerText.textContent = `${rem.toFixed(1)}s`;
      this.ecoProgressFill.style.width = `${Math.round(prog * 100)}%`;
    }

    if (shouldRunSlowHud) {
      let adultCount = 0;
      let babyCount = 0;
      let deerCount = 0;
      let rabbitCount = 0;
      let otherHerbivoreCount = 0;
      for (const e of enemies) {
        if (!e || e.dead || (typeof e.hp === 'number' && e.hp <= 0)) continue;
        if (e.lifeStage === 'baby' || e.isAdult === false) babyCount++;
        else adultCount++;

        const spId = e.genome?.speciesId || '';
        if (spId === 'deer') deerCount++;
        else if (spId === 'rabbit') rabbitCount++;
        else if (
          e.aggroStance === 'prey_pacifist' ||
          CONFIG.SPECIES?.[spId]?.clade === 'herbivore'
        ) {
          otherHerbivoreCount++;
        }
      }
      const totalPop = adultCount + babyCount;
      this.popValueEl.textContent = `${totalPop} (${adultCount} Ad. / ${babyCount} 🐣)`;

      const totalPrey = deerCount + rabbitCount + otherHerbivoreCount;
      const isTutorialReserve = Boolean(enemyManager?.ecoPaused) && totalPop < 5 && totalPrey === 0;
      if (this.preyHealthBadge) {
        this.preyHealthBadge.classList.remove('is-healthy', 'is-warning', 'is-extinct');
        if (isTutorialReserve) {
          this.preyHealthBadge.classList.add('is-healthy');
          this.preyHealthBadge.textContent = tr(
            '🦌 Prey: 11 (5 Deer / 6 Rabbits)',
            '🦌 Gibier: 11 (5 Biches / 6 Lapins)'
          );
        } else if (totalPrey === 0 || (deerCount < 2 && rabbitCount < 2)) {
          this.preyHealthBadge.classList.add('is-extinct');
          this.preyHealthBadge.textContent = tr(
            `🚨 Prey: ${totalPrey} (EXTINCTION!)`,
            `🚨 Gibier: ${totalPrey} (EXTINCTION !)`
          );
        } else if (deerCount < 2 || rabbitCount < 2) {
          this.preyHealthBadge.classList.add('is-warning');
          this.preyHealthBadge.textContent = tr(
            `⚠️ Prey: ${totalPrey} (${deerCount} Deer / ${rabbitCount} Rabbits)`,
            `⚠️ Gibier: ${totalPrey} (${deerCount} Biches / ${rabbitCount} Lapins)`
          );
        } else {
          this.preyHealthBadge.classList.add('is-healthy');
          this.preyHealthBadge.textContent = tr(
            `🦌 Prey: ${totalPrey} (${deerCount} Deer / ${rabbitCount} Rabbits)`,
            `🦌 Gibier: ${totalPrey} (${deerCount} Biches / ${rabbitCount} Lapins)`
          );
        }
      }

      if (this.reintroducePreyBtn) {
        const needsReintro = !isTutorialReserve && (deerCount < 2 || rabbitCount < 2);
        this.reintroducePreyBtn.classList.toggle('is-urgent-reintroduce', needsReintro);
      }
    }

    // 3. Statistiques & Ressources du Joueur (dont 🍖 Rations / Nourriture & ⚔️ Arme Élémentaire)
    if (player) {
      const hp = Math.max(0, Math.round(player.hp ?? 160));
      const maxHp = Math.max(1, Math.round(player.maxHp ?? 160));
      this.playerHpText.textContent = `${hp}/${maxHp}`;
      this.playerHpFill.style.width = `${Math.min(100, Math.round((hp / maxHp) * 100))}%`;

      const lvl = player.level || 1;
      const xp = Math.floor(player.xp || 0);
      const nextXp = Math.max(1, Math.floor(player.nextLevelXp || 100));
      this.playerLevelText.textContent = tr(`⭐ Lv. ${lvl}`, `⭐ Niv. ${lvl}`);
      this.playerXpText.textContent = `${xp} / ${nextXp} XP`;
      this.playerXpFill.style.width = `${Math.min(100, Math.round((xp / nextXp) * 100))}%`;

      // Détection automatique de montée de niveau si le PlayerController incrémente `level` ou `pendingLevelUps`
      if (lvl > this.lastKnownPlayerLevel) {
        this.lastKnownPlayerLevel = lvl;
        if (!this.isLevelUpOpen) {
          this.showLevelUpModal(null, null, { player });
        }
      } else if (lvl < this.lastKnownPlayerLevel) {
        this.lastKnownPlayerLevel = lvl;
      }

      const res = player.resources || {};
      const woodVal = Math.floor(res.wood ?? 0);
      const stoneVal = Math.floor(res.stone ?? res.biomass ?? 15);
      const crystalVal = Math.floor(res.crystal ?? 0);
      const bioVal = Math.floor(res.biomass ?? 0);

      this.woodBadge.textContent = this.cleanHudMode
        ? `🪵 ${woodVal}`
        : tr(`🪵 Wood: ${woodVal}`, `🪵 Bois: ${woodVal}`);
      if (this.stoneBadge) {
        this.stoneBadge.textContent = this.cleanHudMode
          ? `🪨 ${stoneVal}`
          : tr(`🪨 Stone: ${stoneVal}`, `🪨 Pierre: ${stoneVal}`);
      }
      this.crystalBadge.textContent = this.cleanHudMode
        ? `💎 ${crystalVal}`
        : tr(`💎 Crystal: ${crystalVal}`, `💎 Cristal: ${crystalVal}`);
      this.biomassBadge.textContent = tr(
        `🌿 Biomass: ${bioVal}`,
        `🌿 Biomasse: ${bioVal}`
      );

      if (this.foodBadge) {
        const foodVal = Math.max(
          0,
          Math.round(res.food ?? player.food ?? CONFIG.PLAYER?.INITIAL_FOOD ?? 60)
        );
        const maxFood = Math.max(100, Math.round(res.maxFood ?? player.maxFood ?? 150));
        this.foodBadge.classList.remove('is-well-fed', 'is-famine');
        if (foodVal <= 0) {
          this.foodBadge.classList.add('is-famine');
          this.foodBadge.textContent = tr(
            `⚠️ Rations: 0/${maxFood} (FAMINE!)`,
            `⚠️ Rations: 0/${maxFood} (FAMINE !)`
          );
        } else if (foodVal > 25) {
          this.foodBadge.classList.add('is-well-fed');
          this.foodBadge.textContent = `🍖 Rations: ${foodVal}/${maxFood}`;
        } else {
          this.foodBadge.textContent = `🍖 Rations: ${foodVal}/${maxFood}`;
        }
      }

      if (this.weaponBadgeBtn) {
        const wSpec = getElementalWeaponSpec(player.equippedWeaponId || 'runic_steel');
        this.weaponBadgeBtn.className = `hud-weapon-badge-btn hud-telemetry-only elem-${wSpec.element || 'steel'}`;
        this.weaponBadgeBtn.textContent = tr(
          `${wSpec.icon} Weapon: ${translateString(wSpec.shortName)} [K]`,
          `${wSpec.icon} Arme: ${wSpec.shortName} [K]`
        );
      }

      // Mise à jour de la Barre de Compétences Roguelike (4 Sorts 3D) et du Panneau des Maîtrises Adaptatives
      this._updateSkillBar(player);
      if (shouldRunSlowHud) {
        this._updateMasteryPanel(player);
      }
    }

    // 4. Bastion & PNJ Alliés (Éclaireurs en expédition lointaine, Gardes, Récolteurs, Bâtiments Niv. 0->3, Reliques X/3)
    if (bastionAndNpcs) {
      const bHp = Math.max(0, Math.round(bastionAndNpcs.hp ?? bastionAndNpcs.bastionHp ?? 500));
      const bMaxHp = Math.max(
        1,
        Math.round(bastionAndNpcs.maxHp ?? bastionAndNpcs.bastionMaxHp ?? 500)
      );
      this.bastionHpText.textContent = `${bHp} / ${bMaxHp}`;
      this.bastionHpFill.style.width = `${Math.min(100, Math.round((bHp / bMaxHp) * 100))}%`;
      if (this.topBastionPill) {
        this.topBastionPill.textContent = `🏰 ${bHp}/${bMaxHp}`;
      }

      if (shouldRunSlowHud) {
        const relicCount =
          typeof bastionAndNpcs.getCollectedRelicCount === 'function'
            ? bastionAndNpcs.getCollectedRelicCount()
            : bastionAndNpcs.collectedRelicFragments || 0;
        const maxRelics = RELIC_FRAGMENTS_SPEC?.totalRequired || 3;
        const shieldReady = relicCount >= maxRelics || Boolean(bastionAndNpcs.islandShieldActive);

        if (this.relicBadge) {
          this.relicBadge.classList.toggle('is-complete', shieldReady);
          this.relicBadge.classList.toggle('is-zero-relics', relicCount <= 0 && !bastionAndNpcs.islandShieldActive);
          this.relicBadge.textContent = this.cleanHudMode
            ? `🏺 ${relicCount}/${maxRelics}`
            : bastionAndNpcs.islandShieldActive
              ? tr(
                  `🛡️ Relics: ${relicCount}/${maxRelics} (DOME ACTIVE [V])`,
                  `🛡️ Reliques: ${relicCount}/${maxRelics} (DÔME ACTIF [V])`
                )
              : tr(
                  `🧩 Relics: ${relicCount}/${maxRelics}${shieldReady ? ' (READY [V]!)' : ''}`,
                  `🧩 Reliques: ${relicCount}/${maxRelics}${shieldReady ? ' (PRÊT [V] !)' : ''}`
                );
        }
        if (this.activateIslandShieldBtn) {
          this.activateIslandShieldBtn.classList.toggle('is-ready-glow', shieldReady);
          this.activateIslandShieldBtn.textContent = bastionAndNpcs.islandShieldActive
            ? tr(
                `⛵ Sail to Island #${currentIslandNumber + 1} [V]`,
                `⛵ Cap sur Île #${currentIslandNumber + 1} [V]`
              )
            : shieldReady
              ? tr('🛡️ Activate Dome & Next Island [V]!', '🛡️ Activer Dôme & Île Suiv. [V] !')
              : tr(
                  `🛡️ Shield & Island (${relicCount}/${maxRelics}) [V]`,
                  `🛡️ Bouclier & Île (${relicCount}/${maxRelics}) [V]`
                );
        }

        const counts =
          typeof bastionAndNpcs.getRoleCounts === 'function'
            ? bastionAndNpcs.getRoleCounts()
            : { total: 2, scout: 1, guard: 0, harvester: 1 };

        this.scoutCountEl.textContent = String(counts.scout ?? 0);
        this.guardCountEl.textContent = String(counts.guard ?? 0);
        this.harvesterCountEl.textContent = String(counts.harvester ?? 0);

        // État d'expédition des Éclaireurs (ex. combien sont au-delà de la frontière 42u ou en fuite)
        const npcs = bastionAndNpcs.npcs || [];
        let scoutsDeepWilderness = 0;
        let scoutsFleeing = 0;
        for (const npc of npcs) {
          if (!npc || npc.role !== 'scout' || (typeof npc.hp === 'number' && npc.hp <= 0)) continue;
          const d = Math.hypot(npc.x || 0, npc.z || 0);
          if (d >= (CONFIG.WORLD?.SAFE_SPAWN_RADIUS || 42)) scoutsDeepWilderness++;
          if (npc.state === 'fleeing') scoutsFleeing++;
        }
        if (scoutsFleeing > 0) {
          this.scoutMetaEl.textContent = tr(
            `⚠️ ${scoutsFleeing} fleeing in emergency! (${scoutsDeepWilderness} beyond frontier)`,
            `⚠️ ${scoutsFleeing} en fuite d'urgence ! (${scoutsDeepWilderness} hors-frontière)`
          );
          this.scoutMetaEl.style.color = '#ffa502';
        } else {
          this.scoutMetaEl.textContent = tr(
            `🧭 ${scoutsDeepWilderness}/${counts.scout || 0} on deep expedition (>42m)`,
            `🧭 ${scoutsDeepWilderness}/${counts.scout || 0} en expédition lointaine (>42m)`
          );
          this.scoutMetaEl.style.color = '';
        }

        const cages = bastionAndNpcs.cages || [];
        const totalCages = cages.length || 6;
        const rescuedCages = cages.filter((c) => c && (c.rescued || c.isRescued)).length;
        this.rescueCounterEl.textContent = tr(
          `NPCs: ${counts.total || 0} (${rescuedCages}/${totalCages} cages)`,
          `PNJ: ${counts.total || 0} (${rescuedCages}/${totalCages} cages)`
        );

        // Mise à jour des 5 Bâtiments du Bastion (Niv. 0 -> 3)
        this._updateBastionBuildingsUI(bastionAndNpcs, player);
      }
    }

    // 5. Panneau droit : Radar Génétique, Lignées Mutantes & Opération / Quête Active
    if (shouldRunSlowHud) {
      this._updateLineagesPanel(ecoSim, enemies);
      this._updateQuestAndScoutMissionUI(bastionAndNpcs, enemies, questSystem);

      if (this.isBastionModalOpen) {
        this.renderBastionArchitectContent(bastionAndNpcs, player);
      }
      if (this.isWeaponModalOpen) {
        this.renderWeaponForgeContent(player, bastionAndNpcs);
      }
    }
  }
}

export default HUDManager;
