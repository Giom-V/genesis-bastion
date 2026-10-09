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
    /** @type {number} */
    this.lastKnownPlayerLevel = 1;
    /** @type {number|null} */
    this.alertTimeoutId = null;
    /** @type {{x: number, z: number, lineageId?: string}|null} */
    this.currentAlertTarget = null;
    /** @type {Array<Object>} */
    this.extraUpgrades = [];
    /** @type {Record<string, boolean>} */
    this.previousUnlockedHud = {};
    /** @type {string} */
    this._lastPromptSignature = '';
    /** @type {string} */
    this._lastOnboardingKeySig = '';

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

    // Abonnement temps réel au logger pour le fil d'évolution
    this._unsubscribeLogger = logger.subscribe(() => {
      this.refreshLogFeed();
    });
    this.refreshLogFeed();
  }

  /**
   * Enregistre des cartes d'améliorations supplémentaires (ex. issues de `BalanceAndPacing.js`).
   * @param {Array<Object>} upgrades
   */
  registerExtraUpgrades(upgrades) {
    if (Array.isArray(upgrades)) {
      this.extraUpgrades = upgrades;
    }
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
   * @param {'dmg-normal'|'dmg-crit'|'dmg-xp'|'dmg-heal'} [variant='dmg-normal'] - Variante CSS.
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
    }, 920);
  }

  /* ==========================================================================
     1. BARRE SUPÉRIEURE (SURVIE, HORLOGE, ECO-TICK, POPULATION, JOUEUR, RESSOURCES)
     ========================================================================== */
  _buildTopBar() {
    this.topBar = el('header', 'hud-top-bar hud-interactive');

    // Marque + Horloge Jour/Nuit
    const brandGroup = el('div', 'hud-brand-group');
    const brandTitle = el('h1', 'hud-brand-title', 'Genesis Bastion');
    this.clockBadge = el('div', 'hud-clock-badge', '☀️ Jour 1 — 08h00 (Jour)');
    brandGroup.append(brandTitle, this.clockBadge);

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

    // Constructions du Bastion
    this.buildSection = el('div', 'hud-section-block');
    this.buildSection.appendChild(el('div', 'hud-section-label', 'Fortifications & Bio-Structures'));
    const buildGrid = el('div', 'hud-build-grid');

    this.watchtowerBtn = this._createBuildButton(
      'watchtower',
      '🗼 Tour de Guet',
      '25 Bois · 10 Cristal'
    );
    this.palisadeBtn = this._createBuildButton(
      'palisade',
      '🛡️ Palissade Runique',
      '30 Bois · 5 Cristal'
    );
    this.biolabBtn = this._createBuildButton(
      'biolab',
      '🔬 Bio-Laboratoire',
      '20 Bois · 20 Cristal'
    );

    buildGrid.append(this.watchtowerBtn, this.palisadeBtn, this.biolabBtn);
    this.buildSection.appendChild(buildGrid);

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

  /**
   * Crée un bouton de construction de structure du Bastion.
   * @param {string} structId
   * @param {string} labelText
   * @param {string} costText
   * @returns {HTMLButtonElement}
   * @private
   */
  _createBuildButton(structId, labelText, costText) {
    const btn = el('button', 'hud-btn hud-build-btn');
    btn.type = 'button';
    const nameSpan = el('span', '', labelText);
    const costSpan = el('span', 'hud-build-cost', costText);
    btn.append(nameSpan, costSpan);
    btn.addEventListener('click', () => {
      if (this.callbacks.onBuildStructure) {
        this.callbacks.onBuildStructure(structId);
      }
    });
    return btn;
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

    this.alertBanner.classList.remove('is-hidden', 'is-eradicated');
    this.alertIconWrap.textContent = '🦅';
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

    this.alertBanner.classList.remove('is-hidden');
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
   * Masque la bannière d'alerte centrale.
   */
  hideAlertBanner() {
    if (this.alertBanner) {
      this.alertBanner.classList.add('is-hidden');
    }
  }

  /* ==========================================================================
     4. PANNEAU DROIT : RADAR GÉNÉTIQUE & LIGNÉES MUTANTES / HYBRIDES
     ========================================================================== */
  _buildRightPanel() {
    this.rightPanel = el('aside', 'hud-side-panel hud-right-panel hud-interactive');

    const header = el('div', 'hud-panel-header');
    header.append(
      el('h2', 'hud-panel-title', '🧬 Radar Génétique & Lignées'),
      (this.lineageSubtitleEl = el('span', 'hud-panel-subtitle', 'Mendel 78% / 92%'))
    );

    // Résumé de la grille écologique de Conway
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

    // Liste des lignées mutantes & hybrides
    const lineageBlock = el('div', 'hud-section-block');
    lineageBlock.appendChild(
      el('div', 'hud-section-label', 'Lignées Mutantes & Hybrides Actives')
    );
    this.lineageListEl = el('div', 'hud-lineage-list');
    lineageBlock.appendChild(this.lineageListEl);

    this.rightPanel.append(header, conwayBlock, lineageBlock);
    this.root.appendChild(this.rightPanel);
  }

  /**
   * Met à jour la liste des lignées mutantes et hybrides dans le panneau droit.
   * Combine le rapport de `ecoSim.getLineageReport(enemies)` et l'analyse directe des ennemis vivants
   * (afin d'afficher le détail Adultes reproducteurs vs Bébés juvéniles et le temps avant maturité).
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
          minMaturationRem: null,
          maxFitness: 0,
          speciesNames: new Set(),
          generationMax: item.generationMax || 1,
          discoveredByScout: Boolean(item.discoveredByScout),
          patientZeroPos: item.patientZeroPos || null,
          status: item.status || 'latent',
        });
      }
    }

    // Enrichissement direct depuis les entités vivantes (Adultes vs Bébés, Fitness, Espèces porteuses)
    for (const enemy of enemies) {
      if (!enemy || enemy.dead || (typeof enemy.hp === 'number' && enemy.hp <= 0)) continue;
      const genome = enemy.genome || {};
      const isBaby = enemy.lifeStage === 'baby' || enemy.isAdult === false;
      const spName = genome.speciesName || CONFIG.SPECIES?.[genome.speciesId]?.name || 'Créature';
      const fit = genome.fitnessScore || 1.0;
      const matRem =
        isBaby && typeof enemy.maturationTime === 'number' && typeof enemy.age === 'number'
          ? Math.max(0, enemy.maturationTime - enemy.age)
          : null;

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
            minMaturationRem: null,
            maxFitness: 0,
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
        entry.count = Math.max(entry.count, entry.adultCount + entry.babyCount);
        entry.maxFitness = Math.max(entry.maxFitness, fit);
        entry.generationMax = Math.max(entry.generationMax, genome.generation || 1);
        if (enemy.spottedByScout) entry.discoveredByScout = true;
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
            minMaturationRem: null,
            maxFitness: 0,
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
        hEntry.count = Math.max(hEntry.count, hEntry.adultCount + hEntry.babyCount);
        hEntry.maxFitness = Math.max(hEntry.maxFitness, fit);
        hEntry.generationMax = Math.max(hEntry.generationMax, genome.generation || 2);
        if (enemy.spottedByScout) hEntry.discoveredByScout = true;
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
        : `${item.adultCount} Ad. / ${item.babyCount} Bébé${item.babyCount > 1 ? 's' : ''} 🐣`;
      const genFitnessText = `Gén. ${item.generationMax} · Fit ${item.maxFitness ? item.maxFitness.toFixed(2) : '1.45'}`;
      metaRow.append(el('span', '', stageDetail), el('span', '', genFitnessText));

      card.append(topRow, metaRow);

      // Message tactique contextuel (ex. fenêtre juvénile avant reproduction ou risque de dominance)
      if (!isEradicated) {
        let warnMsg = '';
        if (item.adultCount === 0 && item.babyCount > 0) {
          const remStr =
            item.minMaturationRem !== null ? ` (${Math.ceil(item.minMaturationRem)}s)` : '';
          warnMsg = `⏳ Fenêtre tactique : tous les porteurs sont encor Juvéniles${remStr} et ne peuvent pas encore se reproduire !`;
        } else if (isPatientZeroSingle) {
          warnMsg = item.discoveredByScout
            ? '🎯 Repéré par Éclaireur -> Éliminez-le avant le prochain Eco-Tick !'
            : '⚠️ Porteur actif en territoire sauvage -> Risque de dominance !';
        } else {
          warnMsg = `🔥 Transmission dominante (78%) en cours -> Chassez les ${item.adultCount} adulte(s) reproducteur(s) !`;
        }
        card.appendChild(el('div', 'hud-lineage-warning', warnMsg));
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
     5. FIL D'ÉVOLUTION ET DE COMBAT EN DIRECT (BAS-GAUCHE) & BARRE D'ACTIONS
     ========================================================================== */
  _buildBottomLeftLogFeed() {
    this.bottomLeft = el('section', 'hud-bottom-left hud-interactive');
    const header = el('div', 'hud-panel-header');
    header.append(
      el('span', 'hud-panel-title', '📜 Journal Évolution & Alerte'),
      el('span', 'hud-panel-subtitle', 'Temps réel')
    );
    this.logListEl = el('div', 'hud-log-list');
    this.bottomLeft.append(header, this.logListEl);
    this.root.appendChild(this.bottomLeft);
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
    this.bottomCenter = el('nav', 'hud-bottom-center hud-interactive');

    const controls = [
      { key: 'ZQSD / WASD', label: 'Déplacer' },
      { key: 'Clic / Espace', label: 'Fente Cleave' },
      { key: 'Shift', label: 'Esquive' },
      { key: 'E', label: 'Secourir / Récolter' },
      { key: 'Q/E / Molette', label: 'Caméra 3D Iso' },
      { key: 'Tab', label: 'Codex Génétique' },
      { key: 'T', label: 'Eco-Tick' },
      { key: 'M', label: 'Troll de Feu' },
    ];

    for (const c of controls) {
      const hint = el('span', 'hud-hotkey-hint');
      hint.append(el('kbd', 'hud-kbd', c.key), el('span', '', c.label));
      this.bottomCenter.appendChild(hint);
    }

    this.root.appendChild(this.bottomCenter);
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

    // Comptage des populations vivantes par espèce, hybride et mutation
    const speciesCounts = {};
    const mutationCounts = {};
    for (const e of enemies) {
      if (!e || e.dead || (typeof e.hp === 'number' && e.hp <= 0)) continue;
      const spId = e.genome?.speciesId || 'goblin';
      speciesCounts[spId] = (speciesCounts[spId] || 0) + 1;
      for (const m of e.genome?.mutations || []) {
        mutationCounts[m] = (mutationCounts[m] || 0) + 1;
      }
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

    // Section 2 : Encadré explicatif de la Formule de Fitness Darwinienne & Cycle Bébé -> Adulte
    const formulaCard = el('div', 'codex-item-card');
    formulaCard.append(
      el(
        'div',
        'codex-item-title',
        '📐 Loi de Sélection Darwinienne, Fitness Score & Maturation Juvénile'
      ),
      el(
        'div',
        'codex-item-desc',
        '1. Maturation Bébé -> Adulte : Chaque naissance issue d’un croisement génétique crée un individu BÉBÉ (échelle 0.5x, stats 0.55x) qui NE PEUT PAS SE REPRODUIRE avant d’atteindre l’âge Adulte (~16s à 38s selon l’espèce). Profitez de cette fenêtre pour éliminer un Patient Zéro juvénile repéré par vos Éclaireurs !'
      ),
      el(
        'div',
        'codex-item-stats',
        '2. Formule Fitness = Score Poly-Génétique Normalisé (PV×0.24 + Force×0.26 + Vitesse×0.18 + Taille×0.10 + Fertilité×0.14 + Efficacité Métabolique×0.08) + Bonus Mutations Dominantes (+0.34 à +0.48) + Vigueur Hybride (+0.18).'
      )
    );

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

    this.codexBody.append(graphSection, formulaCard, hybridTitle, hybridGrid, mutTitle, mutGrid);
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
     7. MODALE ROGUELIKE DE MONTÉE DE NIVEAU
     ========================================================================== */
  _buildLevelUpModal() {
    this.levelUpBackdrop = el('div', 'hud-modal-backdrop is-hidden hud-interactive');
    const dialog = el('div', 'hud-modal-dialog');
    dialog.style.maxWidth = '820px';

    const header = el('div', 'hud-modal-header');
    this.levelUpTitleEl = el(
      'h2',
      'hud-modal-title',
      '⚡ MONTÉE DE NIVEAU — CHOISISSEZ UNE ADAPTATION TACTIQUE'
    );
    header.appendChild(this.levelUpTitleEl);

    const body = el('div', 'hud-modal-body');
    body.appendChild(
      el(
        'p',
        'codex-item-desc',
        'Face à l’évolution darwinienne des meutes sauvages, renforcez vos capacités de traque, vos Éclaireurs ou les défenses du Bastion :'
      )
    );
    this.levelUpCardsGrid = el('div', 'levelup-cards-grid');
    body.appendChild(this.levelUpCardsGrid);

    dialog.append(header, body);
    this.levelUpBackdrop.appendChild(dialog);
    this.root.appendChild(this.levelUpBackdrop);
  }

  /**
   * Affiche la modale Roguelike de sélection d'amélioration (3 cartes).
   * @param {Array<Object>} [customChoices] - Liste optionnelle de 3 améliorations.
   * @param {Function} [onSelect] - Callback `(upgrade)` appelé lors du choix.
   */
  showLevelUpModal(customChoices = null, onSelect = null, ecoContext = {}) {
    if (!this.levelUpBackdrop || !this.levelUpCardsGrid) return;

    let choices = [];
    if (Array.isArray(customChoices) && customChoices.length > 0) {
      choices = customChoices.slice(0, 3);
    } else if (typeof pickCounterAdaptationUpgrades === 'function') {
      choices = pickCounterAdaptationUpgrades(this.chosenUpgradeIds || [], ecoContext, 3);
    } else {
      const pool = [...(DESIGNED_UPGRADES || []), ...(CONFIG.UPGRADES || []), ...this.extraUpgrades];
      choices = pool.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    }

    this.levelUpCardsGrid.replaceChildren();

    for (const upg of choices) {
      const card = el('div', 'levelup-card');
      const top = el('div', '');
      const iconAndTitle = el(
        'div',
        'levelup-card-title',
        `${upg.icon || '⚡'} ${upg.name}`
      );
      const categoryBadge = el(
        'span',
        'hud-lineage-badge badge-spread',
        upg.category || 'Adaptation'
      );
      const desc = el('p', 'levelup-card-desc', upg.description || '');

      top.append(iconAndTitle, categoryBadge);
      if (upg.counterTarget) {
        top.appendChild(
          el('div', 'codex-item-stats', `Contre-mesure : ${upg.counterTarget}`)
        );
      }
      const chooseBtn = el('button', 'hud-btn hud-btn-amber', 'Choisir cette Adaptation');
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
   */
  update(state = {}) {
    const {
      sceneManager = null,
      ecoSim = null,
      enemyManager = null,
      player = null,
      bastionAndNpcs = null,
    } = state;

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
          this.showLevelUpModal();
        }
      }

      const res = player.resources || {};
      this.woodBadge.textContent = `🪵 Bois: ${Math.floor(res.wood ?? 0)}`;
      this.crystalBadge.textContent = `💎 Cristal: ${Math.floor(res.crystal ?? 0)}`;
      this.biomassBadge.textContent = `🌿 Biomasse: ${Math.floor(res.biomass ?? 0)}`;
    }

    // 4. Bastion & PNJ Alliés (Éclaireurs en expédition lointaine, Gardes, Récolteurs)
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
    }

    // 5. Panneau droit : Radar Génétique & Lignées Mutantes
    this._updateLineagesPanel(ecoSim, enemies);
  }
}

export default HUDManager;
