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
} from '../ecosystem/BaseAndQuestsDesign.js';
import { logger } from '../utils/logger.js';
import { getCardinalLabelFR, dist2D } from '../utils/math.js';

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
    node.textContent = String(text);
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
    node.textContent = String(text);
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

    // Abonnement temps réel au logger pour le fil d'évolution
    this._unsubscribeLogger = logger.subscribe(() => {
      this.refreshLogFeed();
    });
    this.refreshLogFeed();
  }

  /**
   * Indique si le jeu doit être mis en pause totale (`true` dès que la modale de Montée de Niveau,
   * la modale de Choix du Mode de Combat, l'Architecte du Bastion `[H]` ou le Codex Phylogénétique `[Tab]` est ouvert).
   * @returns {boolean}
   */
  get isModalPaused() {
    return Boolean(
      this.isLevelUpOpen ||
        this.isCodexOpen ||
        this.isCombatModeModalOpen ||
        this.isBastionModalOpen
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
        ? '⚡ Mode : Auto (Vampire Survivors) [C]'
        : '⚔️ Mode : Actif [1-4] (Diablo) [C]';
      this.combatModeSwitchBtn.classList.toggle('is-vs-mode', isVS);
    }

    if (this.vsModeCardEl && this.diabloModeCardEl) {
      this.vsModeCardEl.classList.toggle('is-active-mode', isVS);
      this.diabloModeCardEl.classList.toggle('is-active-mode', !isVS);
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

    // Marque + Horloge Jour/Nuit + Bouton Switch Mode [C]
    const brandGroup = el('div', 'hud-brand-group');
    const brandTitle = el('h1', 'hud-brand-title', 'Genesis Bastion');
    this.clockBadge = el('div', 'hud-clock-badge', '☀️ Jour 1 — 08h00 (Jour)');

    this.combatModeSwitchBtn = el(
      'button',
      'hud-mode-switch-btn is-vs-mode',
      '⚡ Mode : Auto (Vampire Survivors) [C]'
    );
    this.combatModeSwitchBtn.type = 'button';
    this.combatModeSwitchBtn.title =
      'Basculer entre le mode Auto-Cast (Vampire Survivors) et le mode Sorts Actifs [1-4] (Diablo) [Raccourci : C]';
    this.combatModeSwitchBtn.addEventListener('click', () => {
      this.toggleCombatMode();
    });

    brandGroup.append(brandTitle, this.clockBadge, this.combatModeSwitchBtn);

    // Barre de progression Eco-Tick
    this.ecoGroup = el('div', 'hud-ecotick-group');
    const ecoHeader = el('div', 'hud-ecotick-header');
    const ecoLabel = el('span', 'hud-ecotick-label', '🧬 Prochain Cycle Génétique');
    this.ecoTimerText = el('span', 'hud-ecotick-timer', '12.0s');
    ecoHeader.append(ecoLabel, this.ecoTimerText);

    const ecoTrack = el('div', 'hud-progress-track');
    this.ecoProgressFill = el('div', 'hud-progress-fill eco-fill');
    ecoTrack.appendChild(this.ecoProgressFill);
    this.ecoGroup.append(ecoHeader, ecoTrack);

    // Compteurs Population (Adultes / Bébés) & Mutations actives
    this.statsCluster = el('div', 'hud-stats-cluster');

    const popPill = el('div', 'hud-stat-pill');
    popPill.append(
      el('span', 'hud-stat-pill-label', 'Population (Ad. / Bébés)'),
      (this.popValueEl = el('span', 'hud-stat-pill-value', '42 (42 / 0 🐣)'))
    );

    this.mutPill = el('div', 'hud-stat-pill');
    this.mutPill.append(
      el('span', 'hud-stat-pill-label', 'Lignées Mutantes'),
      (this.mutCountValueEl = el('span', 'hud-stat-pill-value', '1 Active'))
    );

    this.statsCluster.append(popPill, this.mutPill);

    // Barres PV & XP du Joueur
    const vitalsGroup = el('div', 'hud-player-vitals');

    // PV
    const hpBox = el('div', 'hud-vital-box');
    const hpRow = el('div', 'hud-vital-row');
    hpRow.append(
      el('span', '', '❤️ PV Gardien'),
      (this.playerHpText = el('span', '', '160 / 160'))
    );
    const hpTrack = el('div', 'hud-progress-track');
    this.playerHpFill = el('div', 'hud-progress-fill hp-fill');
    this.playerHpFill.style.width = '100%';
    hpTrack.appendChild(this.playerHpFill);
    hpBox.append(hpRow, hpTrack);

    // XP & Niveau
    const xpBox = el('div', 'hud-vital-box');
    const xpRow = el('div', 'hud-vital-row');
    this.playerLevelText = el('span', '', '⭐ Niv. 1');
    this.playerXpText = el('span', '', '0 / 100 XP');
    xpRow.append(this.playerLevelText, this.playerXpText);
    const xpTrack = el('div', 'hud-progress-track');
    this.playerXpFill = el('div', 'hud-progress-fill xp-fill');
    this.playerXpFill.style.width = '0%';
    xpTrack.appendChild(this.playerXpFill);
    xpBox.append(xpRow, xpTrack);

    vitalsGroup.append(hpBox, xpBox);

    // Ressources (Bois, Cristal, Biomasse)
    this.resGroup = el('div', 'hud-resources-group');
    this.woodBadge = el('div', 'hud-resource-badge res-wood', '🪵 Bois: 40');
    this.crystalBadge = el('div', 'hud-resource-badge res-crystal', '💎 Cristal: 20');
    this.biomassBadge = el('div', 'hud-resource-badge res-biomass', '🌿 Biomasse: 15');
    this.resGroup.append(this.woodBadge, this.crystalBadge, this.biomassBadge);

    this.topBar.append(brandGroup, this.ecoGroup, this.statsCluster, vitalsGroup, this.resGroup);
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

    // Laboratoire de Simulation / Actions de Test Directes
    this.simLab = el('div', 'hud-sim-lab');
    this.simLab.appendChild(el('div', 'hud-section-label', '🧪 Laboratoire Génétique (Actions Test)'));

    const forceTickBtn = el(
      'button',
      'hud-btn hud-btn-biomass',
      '⚡ Forcer Eco-Tick Génétique [T]'
    );
    forceTickBtn.type = 'button';
    forceTickBtn.addEventListener('click', () => {
      if (this.callbacks.onForceEcoTick) this.callbacks.onForceEcoTick();
    });

    const spawnFireTrollBtn = el(
      'button',
      'hud-btn hud-btn-threat',
      '🔥 Spawner Troll de Feu (Test) [M]'
    );
    spawnFireTrollBtn.type = 'button';
    spawnFireTrollBtn.addEventListener('click', () => {
      if (this.callbacks.onSpawnFireTroll) this.callbacks.onSpawnFireTroll();
    });

    this.openCodexBtn = el(
      'button',
      'hud-btn hud-btn-scout',
      '🧬 Ouvrir Arbre Phylogénétique [Tab]'
    );
    this.openCodexBtn.type = 'button';
    this.openCodexBtn.addEventListener('click', () => {
      this.toggleCodexModal();
    });

    this.simLab.append(forceTickBtn, spawnFireTrollBtn, this.openCodexBtn);

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

    // 3A. Carte d'Onboarding Guidé (Actes 1 à 7)
    this.onboardingCard = el('div', 'hud-onboarding-card is-hidden hud-interactive');

    const topRow = el('div', 'hud-onboarding-top');
    const stepWrap = el('div', 'hud-onboarding-step-wrap');
    this.onboardingStepBadge = el('span', 'hud-onboarding-step-badge', 'ACTE 1 / 7');
    const progTrack = el('div', 'hud-onboarding-progress-track');
    this.onboardingProgressFill = el('div', 'hud-onboarding-progress-fill');
    this.onboardingProgressFill.style.width = '14%';
    progTrack.appendChild(this.onboardingProgressFill);
    stepWrap.append(this.onboardingStepBadge, progTrack);

    this.skipTutorialBtn = el('button', 'hud-onboarding-skip-btn', 'Passer le tutoriel [P]');
    this.skipTutorialBtn.type = 'button';
    this.skipTutorialBtn.title = 'Déverrouiller immédiatement tous les systèmes et lancer l’écosystème complet';
    this.skipTutorialBtn.addEventListener('click', () => {
      if (this.callbacks.onSkipTutorial) {
        this.callbacks.onSkipTutorial();
      }
    });
    topRow.append(stepWrap, this.skipTutorialBtn);

    this.onboardingTitleEl = el('div', 'hud-onboarding-title', '');
    this.onboardingDescEl = el('div', 'hud-onboarding-desc', '');
    this.onboardingWhyEl = el('div', 'hud-onboarding-why', '');
    this.onboardingKeysRow = el('div', 'hud-onboarding-keys-row');

    const objBox = el('div', 'hud-onboarding-objective-box');
    this.onboardingObjIcon = el('span', 'hud-onboarding-obj-icon', '🎯');
    this.onboardingObjText = el('span', 'hud-onboarding-obj-text', '');
    this.onboardingObjProgress = el('span', 'hud-onboarding-obj-progress', '');
    objBox.append(this.onboardingObjIcon, this.onboardingObjText, this.onboardingObjProgress);

    this.onboardingCard.append(
      topRow,
      this.onboardingTitleEl,
      this.onboardingDescEl,
      this.onboardingWhyEl,
      this.onboardingKeysRow,
      objBox
    );
    this.centerCol.appendChild(this.onboardingCard);

    // 3B. Bannière d'alerte prioritaire Éclaireur (Patient Zéro)
    this.alertBanner = el('div', 'hud-scout-alert-banner is-hidden hud-interactive');
    this.alertIconWrap = el('div', 'hud-alert-icon-wrap', '🦅');

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
    this.alertBanner.append(this.alertIconWrap, body, actions);
    this.centerCol.appendChild(this.alertBanner);
    this.root.appendChild(this.centerCol);
  }

  /**
   * Met à jour la bannière d'Onboarding Guidé (Actes 1 à 7) en haut au centre.
   *
   * @param {Object} state - État courant de l'acte d'onboarding.
   * @param {boolean} [state.visible=true] - Affiche ou masque la carte.
   * @param {number} [state.actNumber=1] - Numéro de l'acte (`1..7`).
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
    if (state.visible === false) {
      this.onboardingCard.classList.add('is-hidden');
      return;
    }

    this.onboardingCard.classList.remove('is-hidden');
    const actNum = state.actNumber || 1;
    const total = state.totalActs || 7;
    this.onboardingStepBadge.textContent = state.stepLabel || `ACTE ${actNum} / ${total}`;
    const pct = Math.min(100, Math.max(8, Math.round((actNum / total) * 100)));
    this.onboardingProgressFill.style.width = `${pct}%`;

    this.onboardingTitleEl.textContent = state.title || '';
    this.onboardingDescEl.textContent = state.instructionText || '';

    if (state.whyItMatters) {
      this.onboardingWhyEl.textContent = `💡 ${state.whyItMatters}`;
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
    this.onboardingObjText.textContent = state.objectiveText || '';
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
      'Créature';

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
        ? `Hybride Fertile (${speciesName})`
        : 'Mutation Dominante';

    this.currentAlertTarget = {
      x: ex,
      z: ez,
      lineageId: mutId || genome.speciesId || genome.lineageId,
    };

    this.alertBanner.classList.remove('is-hidden', 'is-eradicated', 'is-dragon-wrath');
    this.alertIconWrap.textContent = '🦅';
    this.trackPatientZeroBtn.textContent = '🎯 TRAQUER LE PATIENT ZÉRO';
    this.trackPatientZeroBtn.style.display = 'inline-flex';

    const babyTag = isBaby ? '🐣 BÉBÉ JUVÉNILE — ' : '';
    this.alertTitleEl.textContent = `🦅 ALERTE ÉCLAIREUR : ${babyTag}${speciesName.toUpperCase()} [${traitLabel}]`;

    if (isBaby) {
      this.alertDescEl.textContent = `Nouveau [${speciesName} — ${traitLabel}] repéré au ${sector} (${distFromBastion}m) ! Il est encore Juvénile (non reproducteur) : éliminez ce Patient Zéro avant son passage à l’âge adulte !`;
    } else {
      this.alertDescEl.textContent = `Nouveau [${speciesName} — ${traitLabel}] repéré au ${sector} (${distFromBastion}m) ! Éliminez le Patient Zéro avant le prochain cycle de reproduction !`;
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
    const mutName = mutDef ? mutDef.name : mutationId || 'Lignée Mutante';
    const speciesName = lastEnemy?.genome?.speciesName || 'Porteur';

    this.alertBanner.classList.remove('is-hidden', 'is-dragon-wrath');
    this.alertBanner.classList.add('is-eradicated');
    this.alertIconWrap.textContent = '✨';
    this.trackPatientZeroBtn.style.display = 'none';

    this.alertTitleEl.textContent = `🏆 LIGNÉE MUTANTE ÉRADIQUÉE : ${mutName.toUpperCase()}`;
    this.alertDescEl.textContent = `Le dernier porteur (${speciesName}) a été neutralisé ! La mutation dominante [${mutName}] ne peut plus se propager dans l'écosystème.`;

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

    this.alertBanner.classList.remove('is-hidden', 'is-eradicated');
    this.alertBanner.classList.add('is-dragon-wrath');
    this.alertIconWrap.textContent = '🐉';
    this.trackPatientZeroBtn.textContent = '🏰 DÉFENDRE LE BASTION';
    this.trackPatientZeroBtn.style.display = 'inline-flex';

    this.alertTitleEl.textContent = `🐉 COURROUX DRACONIQUE ! TOUS LES ${spName.toUpperCase()}S ATTAQUENT VOTRE BASTION !`;
    this.alertDescEl.textContent = `Vous avez provoqué un ${spName} Souverain (${Math.round(ex)}m, ${Math.round(ez)}m) : toute l’espèce entre en rage collective (Agressivité 100%, Vitesse ×1.25) et fond sur votre Bastion ("notre villa") pour le raser !`;

    if (this.alertTimeoutId) {
      clearTimeout(this.alertTimeoutId);
    }
    this.alertTimeoutId = window.setTimeout(() => {
      this.hideAlertBanner();
    }, 14000);
  }

  /**
   * Masque la bannière d'alerte centrale.
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
      this.mutCountValueEl.textContent = `${activeLineagesCount} Active${activeLineagesCount > 1 ? 's' : ''}`;
    }
    if (this.mutPill) {
      this.mutPill.classList.toggle('threat-active', activeLineagesCount > 0);
    }

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

    // Tri : Lignées actives d'abord (par nombre de porteurs), puis éradiquées
    lineages.sort((a, b) => {
      if ((a.count > 0) !== (b.count > 0)) return a.count > 0 ? -1 : 1;
      return b.count - a.count;
    });

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
          ? `${Array.from(item.speciesNames).join('/')} — `
          : '';
      const nameSpan = el('span', 'hud-lineage-name', `${hostPrefix}${item.name}`);

      let badgeText = 'ÉRADIQUÉ';
      let badgeClass = 'badge-eradicated';
      if (!isEradicated) {
        if (isPatientZeroSingle) {
          badgeText = item.babyCount === 1 ? '🐣 PATIENT ZÉRO BÉBÉ' : 'PATIENT ZÉRO (1)';
          badgeClass = 'badge-pz';
        } else if (item.count >= 5 || item.status === 'dominant') {
          badgeText = `DOMINANT (${item.count})`;
          badgeClass = 'badge-pz';
        } else {
          badgeText = `EN EXPANSION (${item.count})`;
          badgeClass = 'badge-spread';
        }
      }

      const badge = el('span', `hud-lineage-badge ${badgeClass}`, badgeText);
      topRow.append(nameSpan, badge);

      const metaRow = el('div', 'hud-lineage-meta');
      const stageDetail = isEradicated
        ? '0 porteur survivant'
        : `${item.adultCount} Ad. / ${item.babyCount} Bébé${item.babyCount > 1 ? 's' : ''} 🐣 · Repérés: ${item.spottedCount || 0}/${item.count}`;
      const genFitnessText = `Gén. ${item.generationMax} · Fit ${item.maxFitness ? item.maxFitness.toFixed(2) : '1.45'}`;
      metaRow.append(el('span', '', stageDetail), el('span', '', genFitnessText));

      card.append(topRow, metaRow);

      // Barre des traits évolutifs (Gestation, Agressivité, Étendue Phénotypique [Papa, Maman] ± 10%)
      if (!isEradicated && item.sampleCount > 0) {
        const avgGest = Math.round(item.gestationSum / item.sampleCount);
        const avgAggroPct = Math.round((item.aggroSum / item.sampleCount) * 100);
        const traitsBar = el('div', 'hud-lineage-traits-bar');
        traitsBar.append(
          el('span', 'hud-lineage-trait-pill', `⏱️ Gestation ~${avgGest}s`),
          el('span', 'hud-lineage-trait-pill', `💢 Agressivité ${avgAggroPct}%`),
          el(
            'span',
            'hud-lineage-trait-pill',
            `🧬 PV max ${Math.round(item.maxHpVal)} · Force ${Math.round(item.maxStrengthVal)} · Vit ${item.maxSpeedVal.toFixed(1)}`
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
          warnMsg = `⏳ Fenêtre tactique : tous les porteurs sont encore Juvéniles${remStr} et ne peuvent pas se reproduire !`;
        } else if (isPatientZeroSingle) {
          warnMsg = item.discoveredByScout
            ? '🎯 Repéré par Éclaireur -> Éliminez-le avant le prochain Eco-Tick !'
            : '⚠️ Porteur actif en territoire sauvage -> Risque de dominance !';
        } else {
          warnMsg = `🔥 Transmission dominante (78%) en cours -> Chassez les ${item.adultCount} adulte(s) reproducteur(s) !`;
        }
        card.appendChild(el('div', 'hud-lineage-warning', warnMsg));

        const actionRow = el('div', 'hud-lineage-actions');
        const allSpotted = (item.spottedCount || 0) >= item.count;
        const trackBtn = el(
          'button',
          `hud-btn hud-btn-sm ${allSpotted ? 'hud-btn-amber' : 'hud-btn-scout'} hud-lineage-track-btn`,
          allSpotted
            ? `🎯 Tous repérés (${item.spottedCount}/${item.count}) — Cibler & Éradiquer`
            : `🦅 Ordonner aux Éclaireurs : Traquer (${item.spottedCount || 0}/${item.count} repérés)`
        );
        trackBtn.type = 'button';
        trackBtn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          this.selectedLineageId = item.id;
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
        'Combattez des espèces/mutants (+12% à +15% dégâts/rang) ou encaissez des éléments (-9% dégâts reçus/rang) pour vous adapter.'
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

    // 1. Maîtrises d'Espèce (Rangs débloqués ou progression en cours)
    for (const sp of summary.speciesMasteries || []) {
      if (sp.rank > 0) {
        pills.push({
          cls: 'mastery-species',
          text: `🗡️ Chasseur ${sp.name} Rg.${sp.rank}`,
          val: `+${sp.bonusPct}% Dégâts (${sp.kills} tués)`,
        });
      } else if (sp.kills > 0) {
        pills.push({
          cls: 'mastery-species',
          text: `🎯 Traque ${sp.name}`,
          val: `${sp.kills}/${sp.nextThreshold} tués → Rg.1 (+12%)`,
        });
      }
    }

    // 2. Maîtrises Anti-Mutation
    for (const mut of summary.mutationMasteries || []) {
      if (mut.rank > 0) {
        pills.push({
          cls: 'mastery-mutation',
          text: `🧬 Purge ${mut.name} Rg.${mut.rank}`,
          val: `+${mut.bonusPct}% Dégâts`,
        });
      } else if (mut.kills > 0) {
        pills.push({
          cls: 'mastery-mutation',
          text: `🧬 Étude ${mut.name}`,
          val: `${mut.kills}/2 tués → Rg.1 (+15%)`,
        });
      }
    }

    // 3. Résistances Élémentaires & Physiques
    for (const res of summary.resistances || []) {
      if (res.rank > 0) {
        pills.push({
          cls: 'mastery-resist',
          text: `${res.icon || '🛡️'} Rés. ${res.name} Rg.${res.rank}`,
          val: `-${res.reductionPct}% Dégâts reçus`,
        });
      } else if (res.hits > 0) {
        pills.push({
          cls: 'mastery-resist',
          text: `${res.icon || '🛡️'} Immunité ${res.name}`,
          val: `${res.hits}/${res.nextThreshold} coups → Rg.1`,
        });
      }
    }

    const activeRanks = summary.totalAdaptationsCount || 0;
    if (this.masteryCountBadgeEl) {
      this.masteryCountBadgeEl.textContent = `${activeRanks} rang${activeRanks > 1 ? 's' : ''} actif${activeRanks > 1 ? 's' : ''}`;
    }

    // Éviter de reconstruire le DOM si la signature n'a pas changé
    const sig = JSON.stringify(pills);
    if (this._lastMasterySig === sig) return;
    this._lastMasterySig = sig;

    this.masteryListEl.replaceChildren();
    if (pills.length === 0) {
      this.masteryListEl.appendChild(
        el(
          'div',
          'hud-mastery-empty',
          'Combattez des espèces/mutants (+12% à +15% dégâts/rang) ou encaissez des éléments (-9% dégâts reçus/rang) pour vous adapter.'
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
      { key: 'Tab', label: 'Codex Génétique' },
      { key: 'T', label: 'Eco-Tick' },
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
        ui.nameEl.textContent = 'Niveau Sup.';
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

      ui.slotBtn.className = `hud-skill-slot${isAuto ? ' is-auto-mode' : ' is-ready'}`;
      ui.iconEl.textContent = meta.icon || '⚡';
      ui.nameEl.textContent = meta.name || spellId;
      ui.lvlEl.textContent = `Niv.${level}`;
      ui.cdFillEl.style.height = `${cdPct}%`;
      ui.cdTextEl.textContent = onCd ? `${remCd.toFixed(1)}s` : '';
      ui.slotBtn.title = `${meta.name} (Niv. ${level}) — ${meta.description || ''}`;
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
        `Arbre Phylogénétique & Matrice d'Hybridation (Seuil de compatibilité <= ${graphData.maxHybridDistance})`
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

    // Section 2B : Cycles de Gestation, Agressivité & Étendue Génétique des 7 Espèces Fondatrices
    const speciesTitle = el(
      'div',
      'hud-section-label',
      'Cycles de Gestation, Agressivité & Étendue Génétique [Papa, Maman] ± 10% des 7 Espèces'
    );
    const speciesGrid = el('div', 'codex-species-grid');
    const orderedSpeciesIds = ['goblin', 'wolf', 'vulture', 'orc', 'lion', 'troll', 'dragon'];

    for (const spId of orderedSpeciesIds) {
      const spConf = CONFIG.SPECIES?.[spId] || {};
      const spDef = SPECIES_CYCLE_AND_AGGRO_DEFAULTS[spId] || {};
      const sc = speciesScope[spId] || null;

      const name = spConf.name || spId;
      const baseGest = spConf.baseGestationTime ?? spDef.baseGestationTime ?? 18;
      const baseMat = spConf.baseMaturationTime ?? spDef.baseMaturationTime ?? 20;
      const baseAggro = spConf.baseAggressiveness ?? spDef.baseAggressiveness ?? 0.7;
      const stance = spConf.aggroStance || spDef.aggroStance || 'hostile';
      const repopCd = spConf.repopulationCooldown ?? spDef.repopulationCooldown ?? 15;
      const habitat =
        spConf.repopulationHabitatLabel || spDef.repopulationHabitatLabel || 'Terres sauvages';
      const baseHp = spConf.baseHp ?? spDef.baseHp ?? 60;
      const baseDmg = spConf.baseDamage ?? spDef.baseDamage ?? 10;
      const baseSpd = spConf.baseSpeed ?? spDef.baseSpeed ?? 7.0;

      const avgGest = sc && sc.count > 0 ? Math.round(sc.gestSum / sc.count) : baseGest;
      const avgAggroPct =
        sc && sc.count > 0
          ? Math.round((sc.aggroSum / sc.count) * 100)
          : Math.round(baseAggro * 100);
      const isWrath = Boolean(sc && sc.enraged > 0);

      let stanceLabel = `⚔️ Hostile à vue (${avgAggroPct}%)`;
      let stanceCls = 'stance-hostile';
      if (isWrath) {
        stanceLabel = '🔥 COURROUX DRACONIQUE (100%)';
        stanceCls = 'stance-wrath';
      } else if (stance === 'pacifist_apex') {
        stanceLabel = `👑 Souverain Pacifique (${avgAggroPct}%)`;
        stanceCls = 'stance-pacifist_apex';
      } else if (stance === 'territorial') {
        stanceLabel = `🛡️ Territorial (${avgAggroPct}%)`;
        stanceCls = 'stance-territorial';
      }

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
          `${spId === 'dragon' ? '🐉 ' : ''}${name} (${sc ? `${sc.adults} Ad. / ${sc.babies} 🐣` : '0 en vie'})`
        ),
        el('span', `codex-stance-badge ${stanceCls}`, stanceLabel)
      );

      const cycleLine = el(
        'div',
        'codex-item-desc',
        `⏱️ Cycle Reproduction : Gestation ~${avgGest}s (Base ${baseGest}s) · Maturation Bébé ${baseMat}s`
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
        `🧬 Étendue [Papa,Maman]±10% : PV ${hpRange} · Force ${dmgRange} · Vit ${spdRange} · Gest. ${gestRange}`
      );

      const repopLine = el(
        'div',
        'codex-repop-pill',
        `🕳️ Repeuplement auto (<2 indiv., ${repopCd}s) : ${habitat}`
      );

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
        el('span', '', `${hyb.name}`),
        el('span', 'hud-lineage-badge badge-spread', `${count} en vie`)
      );

      const parentsText = `Parents : ${hyb.parentSpecies.join(' × ')} (Dist. phylogénétique : ${hyb.phylogeneticDistance})`;
      const statsText = `PV Base: ${hyb.baseHp} · Dégâts: ${hyb.baseDamage} · Vitesse: ${hyb.baseSpeed}`;
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
        el('span', '', mut.name),
        el(
          'span',
          `hud-lineage-badge ${count > 0 ? 'badge-pz' : 'badge-eradicated'}`,
          `${count} porteur${count > 1 ? 's' : ''}`
        )
      );

      const sm = mut.statMultipliers || {};
      const statsLine = `Fitness +${mut.fitnessBonus} · PV ×${sm.maxHp || 1} · Force ×${sm.strength || 1} · Vitesse ×${sm.speed || 1} · Métabolisme ×${mut.metabolismCost || 1}`;
      mCard.append(
        titleRow,
        el('div', 'codex-item-desc', mut.description || ''),
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
   * Construit le graphe SVG des 7 espèces de base groupées par Clade et leurs ponts d'hybridation.
   * @param {Object} graphData
   * @param {Record<string, number>} speciesCounts
   * @returns {SVGElement}
   * @private
   */
  _buildPhylogenySvg(graphData, speciesCounts) {
    const svg = svgEl('svg', {
      class: 'phylo-svg',
      viewBox: '0 0 880 265',
      role: 'img',
      'aria-label': 'Graphe Phylogénétique des 7 espèces et ponts d’hybridation',
    });

    // Positions fixes par Clade pour une lisibilité cartographique parfaite
    const nodePositions = {
      // Clade Peaux-Vertes (Gauche)
      goblin: { x: 115, y: 75, cladeLabel: 'Peaux-Vertes' },
      orc: { x: 245, y: 135, cladeLabel: 'Peaux-Vertes' },
      troll: { x: 155, y: 215, cladeLabel: 'Peaux-Vertes' },
      // Clade Bêtes Sauvages (Centre)
      wolf: { x: 455, y: 75, cladeLabel: 'Bêtes Sauvages' },
      lion: { x: 585, y: 135, cladeLabel: 'Bêtes Sauvages' },
      vulture: { x: 495, y: 215, cladeLabel: 'Bêtes Sauvages' },
      // Clade Apex (Droite)
      dragon: { x: 775, y: 165, cladeLabel: 'Prédateurs Apex' },
    };

    // Titres des 3 Clades
    const cladeHeaders = [
      { x: 170, y: 24, text: 'CLADE : PEAUX-VERTES', color: '#4caf50' },
      { x: 515, y: 24, text: 'CLADE : BÊTES SAUVAGES', color: '#d99b38' },
      { x: 775, y: 24, text: 'CLADE : APEX', color: '#e04038' },
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
            'font-size': '12',
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
            'font-size': '9.5',
            'text-anchor': 'middle',
          },
          `${edge.hybridName} (d=${edge.distance}, ${probPct}%)`
        )
      );
    }

    // 2. Nœuds des 7 espèces de base
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
          node.name
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
        `${upg.icon || '⚡'} ${upg.name}`
      );

      let badgeLabel = upg.category || 'Adaptation';
      if (upg.isSpell) {
        badgeLabel = upg.isNewSpell
          ? `✨ NOUVEAU SORT 3D (Niv. 1/${upg.maxLevel || 5})`
          : `⬆️ AMÉLIORATION SORT (Niv. ${upg.currentLevel} → ${upg.nextLevel})`;
      }

      const categoryBadge = el(
        'span',
        `hud-lineage-badge ${upg.isSpell ? 'badge-pz' : 'badge-spread'}`,
        badgeLabel
      );
      const desc = el('p', 'levelup-card-desc', upg.description || '');

      top.append(iconAndTitle, categoryBadge);
      if (upg.counterTarget) {
        top.appendChild(
          el('div', 'codex-item-stats', `Contre-mesure : ${upg.counterTarget}`)
        );
      } else if (upg.statsAtNextLevel) {
        const st = upg.statsAtNextLevel;
        top.appendChild(
          el(
            'div',
            'codex-item-stats',
            `Dégâts: ${st.damage} · Portée: ${st.range}m · Recharge: ${st.cooldown > 0 ? `${st.cooldown}s` : 'Permanent'}`
          )
        );
      }

      const btnLabel = upg.isSpell
        ? upg.isNewSpell
          ? '✨ Débloquer ce Sort 3D'
          : `⬆️ Améliorer au Niv. ${upg.nextLevel}`
        : '🛡️ Choisir cette Adaptation';
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
        el('div', 'hud-resource-badge res-wood', `🪵 Bois dispo: ${Math.floor(res.wood ?? 0)}`),
        el(
          'div',
          'hud-resource-badge res-crystal',
          `💎 Cristal dispo: ${Math.floor(res.crystal ?? 0)}`
        ),
        el(
          'div',
          'hud-resource-badge res-biomass',
          `🌿 Biomasse dispo: ${Math.floor(res.biomass ?? 0)}`
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
        el('div', 'bastion-architect-name', `${spec.name} [${spec.hotkey}]`)
      );
      const lvlBadge = el(
        'span',
        `hud-building-lvl-badge${currentLevel === 0 ? ' lvl-0' : spec.isMaxLevel ? ' lvl-max' : ''}`,
        spec.isMaxLevel ? 'NIV. 3 MAX' : `Niv. ${currentLevel} / ${spec.maxLevel}`
      );
      header.append(titleGroup, lvlBadge);

      const summary = el('p', 'bastion-architect-summary', bDef.summary);

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
            `${tier.level <= currentLevel ? '✅' : '🔒'} Niv. ${tier.level} — ${tier.label}`
          ),
          el('div', '', tier.effectText)
        );
        tiersWrap.appendChild(tierRow);
      }

      const footer = el('div', 'hud-building-bottom');
      const costSpan = el(
        'span',
        `hud-building-cost${spec.isMaxLevel ? '' : affordable ? ' is-affordable' : ' is-missing'}`,
        spec.isMaxLevel ? '✨ Niveau Maximum Atteint' : `Coût Niv. ${spec.nextLevel}: ${spec.costText}`
      );

      const actBtn = el(
        'button',
        `hud-btn hud-building-upgrade-btn${!spec.isMaxLevel && affordable ? ' is-ready-glow' : ''}`,
        spec.isMaxLevel
          ? '✅ Niv. 3 Max'
          : `⬆️ ${spec.actionVerb} → Niv. ${spec.nextLevel} [${spec.hotkey}]`
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
      ui.nameEl.textContent = `${spec.icon} ${spec.shortName}`;
      ui.lvlBadge.className = `hud-building-lvl-badge${currentLevel === 0 ? ' lvl-0' : spec.isMaxLevel ? ' lvl-max' : ''}`;
      ui.lvlBadge.textContent = spec.isMaxLevel
        ? 'NIV. MAX (3/3)'
        : `Niv. ${currentLevel}/${spec.maxLevel}`;

      ui.effectEl.textContent = spec.isMaxLevel
        ? `Actif : ${spec.currentEffectDesc}`
        : currentLevel > 0
          ? `Actif : ${spec.currentEffectDesc} → Prochain : ${spec.nextEffectDesc}`
          : `Effet Niv. 1 : ${spec.nextEffectDesc}`;

      ui.costEl.className = `hud-building-cost${spec.isMaxLevel ? '' : affordable ? ' is-affordable' : ' is-missing'}`;
      ui.costEl.textContent = spec.isMaxLevel ? '✨ Maximisé' : `Coût: ${spec.costText}`;

      ui.upgBtn.disabled = spec.isMaxLevel || !affordable;
      ui.upgBtn.classList.toggle('is-ready-glow', !spec.isMaxLevel && affordable);
      ui.upgBtn.textContent = spec.isMaxLevel
        ? '✅ Max'
        : `⬆️ ${spec.actionVerb} [${spec.hotkey}]`;
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
        this.scoutMissionStatusEl.textContent =
          prog.totalCarriers > 0
            ? `🔍 Mission Active : Traquer [${prog.targetLabel}] (Repérés : ${prog.spottedCarriers} / ${prog.totalCarriers})`
            : `✅ Mission Active : Traquer [${prog.targetLabel}] (Aucun porteur survivant)`;
      } else {
        const spec = getScoutMissionSpec(mType, targetMutId);
        this.scoutMissionStatusEl.textContent = `${spec.icon} Mission Active : ${spec.label}`;
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
    this.questTitleEl.textContent = primaryQuest.title || '📜 Opération Prioritaire';
    this.questPhaseBadgeEl.textContent =
      primaryQuest.phaseBadge || (isPhase2 ? 'PHASE 2/2' : 'PHASE 1/2');
    this.questPhaseBadgeEl.className = `hud-lineage-badge ${isPhase2 ? 'badge-spread' : 'badge-pz'}`;

    if (this.questStep1El) {
      this.questStep1El.className = `hud-quest-step ${isPhase2 ? 'is-done' : 'is-active'}`;
      this.questStep1El.textContent = primaryQuest.step1Text || primaryQuest.step1Label || '';
    }
    if (this.questStep2El) {
      this.questStep2El.className = `hud-quest-step ${isPhase2 ? 'is-active' : ''}`;
      this.questStep2El.textContent = primaryQuest.step2Text || primaryQuest.step2Label || '';
    }
    if (this.questHintEl && (primaryQuest.actionHint || primaryQuest.objectiveText)) {
      this.questHintEl.textContent = primaryQuest.actionHint || primaryQuest.objectiveText;
    }
    if (this.questRewardEl) {
      const rw = primaryQuest.rewards;
      this.questRewardEl.textContent = rw
        ? `🎁 +${rw.wood || 0} Bois · +${rw.crystal || 0} Cristal · +${rw.biomass || 0} Bio · +${rw.xp || 0} XP`
        : `🎁 Récompense : ${primaryQuest.rewardText || ''}`;
    }
    if (this.questActionBtn) {
      if (
        (primaryQuest.type === 'eradicate_lineage' ||
          primaryQuest.type === 'track_and_eradicate') &&
        !isPhase2
      ) {
        this.questActionBtn.textContent = `🦅 Lancer Traque Éclaireurs (${primaryQuest.spottedCarriers || 0}/${Math.max(1, primaryQuest.totalCarriers || 1)})`;
      } else if (
        primaryQuest.type === 'eradicate_lineage' ||
        primaryQuest.type === 'track_and_eradicate'
      ) {
        this.questActionBtn.textContent = `🎯 Cibler la Lignée (${primaryQuest.totalCarriers || 0} restant${(primaryQuest.totalCarriers || 0) > 1 ? 's' : ''})`;
      } else {
        this.questActionBtn.textContent = '🏰 Ouvrir l’Architecte du Bastion [H]';
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
    } = state;

    if (player) {
      this.lastPlayerRef = player;
    }
    if (bastionAndNpcs) {
      this.lastBastionRef = bastionAndNpcs;
    }
    if (questSystem) {
      this.lastQuestSystemRef = questSystem;
    }

    // 1. Horloge Jour / Nuit
    if (sceneManager && typeof sceneManager.getTimeOfDay === 'function') {
      const tod = sceneManager.getTimeOfDay();
      const icon = tod.isNight ? '🌙' : tod.phase === 'dawn' || tod.phase === 'dusk' ? '🌅' : '☀️';
      const timeStr = tod.formattedTime ? ` — ${tod.formattedTime}` : '';
      this.clockBadge.textContent = `${icon} Jour ${tod.dayNumber || 1}${timeStr} (${tod.label || 'Jour'})`;
      this.clockBadge.classList.toggle('is-night', Boolean(tod.isNight));
    }

    // 2. Compte à rebours Eco-Tick & Population (Adultes vs Bébés)
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

    let adultCount = 0;
    let babyCount = 0;
    for (const e of enemies) {
      if (!e || e.dead || (typeof e.hp === 'number' && e.hp <= 0)) continue;
      if (e.lifeStage === 'baby' || e.isAdult === false) babyCount++;
      else adultCount++;
    }
    const totalPop = adultCount + babyCount;
    this.popValueEl.textContent = `${totalPop} (${adultCount} Ad. / ${babyCount} 🐣)`;

    // 3. Statistiques & Ressources du Joueur
    if (player) {
      const hp = Math.max(0, Math.round(player.hp ?? 160));
      const maxHp = Math.max(1, Math.round(player.maxHp ?? 160));
      this.playerHpText.textContent = `${hp} / ${maxHp}`;
      this.playerHpFill.style.width = `${Math.min(100, Math.round((hp / maxHp) * 100))}%`;

      const lvl = player.level || 1;
      const xp = Math.floor(player.xp || 0);
      const nextXp = Math.max(1, Math.floor(player.nextLevelXp || 100));
      this.playerLevelText.textContent = `⭐ Niv. ${lvl}`;
      this.playerXpText.textContent = `${xp} / ${nextXp} XP`;
      this.playerXpFill.style.width = `${Math.min(100, Math.round((xp / nextXp) * 100))}%`;

      // Détection automatique de montée de niveau si le PlayerController incrémente `level` ou `pendingLevelUps`
      if (lvl > this.lastKnownPlayerLevel) {
        this.lastKnownPlayerLevel = lvl;
        if (!this.isLevelUpOpen) {
          this.showLevelUpModal(null, null, { player });
        }
      }

      const res = player.resources || {};
      this.woodBadge.textContent = `🪵 Bois: ${Math.floor(res.wood ?? 0)}`;
      this.crystalBadge.textContent = `💎 Cristal: ${Math.floor(res.crystal ?? 0)}`;
      this.biomassBadge.textContent = `🌿 Biomasse: ${Math.floor(res.biomass ?? 0)}`;

      // Mise à jour de la Barre de Compétences Roguelike (4 Sorts 3D) et du Panneau des Maîtrises Adaptatives
      this._updateSkillBar(player);
      this._updateMasteryPanel(player);
    }

    // 4. Bastion & PNJ Alliés (Éclaireurs en expédition lointaine, Gardes, Récolteurs, Bâtiments Niv. 0->3)
    if (bastionAndNpcs) {
      const bHp = Math.max(0, Math.round(bastionAndNpcs.hp ?? bastionAndNpcs.bastionHp ?? 500));
      const bMaxHp = Math.max(
        1,
        Math.round(bastionAndNpcs.maxHp ?? bastionAndNpcs.bastionMaxHp ?? 500)
      );
      this.bastionHpText.textContent = `${bHp} / ${bMaxHp}`;
      this.bastionHpFill.style.width = `${Math.min(100, Math.round((bHp / bMaxHp) * 100))}%`;

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
        this.scoutMetaEl.textContent = `⚠️ ${scoutsFleeing} en fuite d'urgence ! (${scoutsDeepWilderness} hors-frontière)`;
        this.scoutMetaEl.style.color = '#ffa502';
      } else {
        this.scoutMetaEl.textContent = `🧭 ${scoutsDeepWilderness}/${counts.scout || 0} en expédition lointaine (>42m)`;
        this.scoutMetaEl.style.color = '';
      }

      const cages = bastionAndNpcs.cages || [];
      const totalCages = cages.length || 6;
      const rescuedCages = cages.filter((c) => c && (c.rescued || c.isRescued)).length;
      this.rescueCounterEl.textContent = `PNJ: ${counts.total || 0} (${rescuedCages}/${totalCages} cages)`;

      // Mise à jour des 5 Bâtiments du Bastion (Niv. 0 -> 3)
      this._updateBastionBuildingsUI(bastionAndNpcs, player);
    }

    // 5. Panneau droit : Radar Génétique, Lignées Mutantes & Opération / Quête Active
    this._updateLineagesPanel(ecoSim, enemies);
    this._updateQuestAndScoutMissionUI(bastionAndNpcs, enemies, questSystem);

    if (this.isBastionModalOpen) {
      this.renderBastionArchitectContent(bastionAndNpcs, player);
    }
  }
}

export default HUDManager;
