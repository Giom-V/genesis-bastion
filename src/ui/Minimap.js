/**
 * @file src/ui/Minimap.js
 * @description Radar cartographique et écologique 2D (220x220) en temps réel pour Genesis Bastion.
 *
 * Cas d'usage et fonctionnalités :
 * 1. Rendu de la topographie de l'île (côtes, océan, plages, plaines, forêts, hautes-terres, caldeira volcanique)
 *    mis en cache sur un canvas hors-écran pour garantir 60 FPS constants.
 * 2. Superposition interactive de la Grille Écologique de Conway (`showConwayGrid`) :
 *    - Vert émeraude : Zone de densité optimale (2 à 5 individus, reproduction active & sélection darwinienne)
 *    - Rouge cramoisi : Surpopulation (> 6 individus) ou Famine (biomasse épuisée, migration forcée)
 *    - Bleu ardoise : Sous-population (< 2 voisins, effet Allee)
 * 3. Affichage des entités :
 *    - Sanctuaire du Bastion au centre (0,0) et périmètre défensif
 *    - Cages de survivants à secourir
 *    - Éclaireurs (Scouts) alliés en cyan avec leur anneau translucide de détection (`VISION_RADIUS`)
 *    - Créatures sauvages colorées par espèce/clade
 *    - Anneaux cibles cramoisis pulsants sur les Mutants / Hybrides "Patient Zéro" repérés par un Éclaireur
 * 4. Indicateur boussole directionnel pointant depuis le Joueur vers le Patient Zéro actif le plus proche.
 *
 * Conformité sécurité : Construction DOM exclusivement via `document.createElement` et `textContent`.
 */

import { CONFIG } from '../config.js';
import { dist2D, angleBetween, clamp, getCardinalLabelFR } from '../utils/math.js';

/**
 * Helper sécurisé de création d'élément DOM via `document.createElement`.
 * @param {string} tag - Nom de la balise HTML.
 * @param {string} [className=''] - Classes CSS.
 * @param {string} [text=''] - Contenu textuel sécurisé (`textContent`).
 * @returns {HTMLElement}
 */
function createEl(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null && text !== '') {
    element.textContent = String(text);
  }
  return element;
}

/**
 * Couleurs cartographiques des biomes pour le fond de carte pré-calculé.
 */
const BIOME_COLORS = {
  ocean: '#07111c',
  shallow: '#0d2236',
  beach: '#6e6248',
  plains: '#243b27',
  forest: '#172b1d',
  highlands: '#383d42',
  volcanic: '#2e1818',
};

export class Minimap {
  /**
   * Initialise le composant Minimap et l'attache au conteneur HUD parent.
   * @param {HTMLElement} [parentContainer] - Conteneur DOM parent (ex. `#hud-root`).
   * @param {Object} [options={}] - Options de configuration.
   * @param {number} [options.size=220] - Taille en pixels du canvas carré.
   * @param {Function} [options.onPingWorld] - Callback `(worldX, worldZ)` lors d'un clic sur le radar.
   */
  constructor(parentContainer = null, options = {}) {
    /** @type {number} */
    this.size = options.size || 220;
    /** @type {number} */
    this.worldSize = CONFIG.WORLD?.SIZE || 240;
    /** @type {boolean} */
    this.showConwayGrid = true;
    /** @type {string|null} */
    this.highlightedLineageId = null;
    /** @type {{x: number, z: number, label: string, until: number}|null} */
    this.focusedPing = null;
    /** @type {Function|null} */
    this.onPingWorld = typeof options.onPingWorld === 'function' ? options.onPingWorld : null;

    /** @type {HTMLCanvasElement|null} */
    this.backdropCanvas = null;
    /** @type {boolean} */
    this.backdropReady = false;

    this._buildDOM(parentContainer);
  }

  /**
   * Construit la structure DOM du panneau Minimap (Bas-Droite) via `document.createElement`.
   * @param {HTMLElement|null} parentContainer
   * @private
   */
  _buildDOM(parentContainer) {
    const root = parentContainer || document.getElementById('hud-root') || document.body;

    this.container = createEl('section', 'hud-bottom-right hud-interactive');
    this.container.setAttribute('aria-label', 'Radar Biomasse et Menaces Mutantes');

    // En-tête avec bouton de bascule de la grille Conway
    const header = createEl('div', 'minimap-header');
    const title = createEl('span', 'minimap-title', 'Radar Éco & Mutants');

    this.toggleGridBtn = createEl('button', 'hud-btn hud-btn-sm hud-btn-biomass', 'Grille Conway: ON');
    this.toggleGridBtn.type = 'button';
    this.toggleGridBtn.title = 'Afficher/Masquer la densité écologique du Jeu de la Vie [G]';
    this.toggleGridBtn.addEventListener('click', () => {
      this.toggleConwayOverlay();
    });

    header.append(title, this.toggleGridBtn);

    // Enveloppe du Canvas 220x220
    const canvasWrap = createEl('div', 'minimap-canvas-wrap');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap-canvas';
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d');

    this.canvas.addEventListener('click', (evt) => this._handleCanvasClick(evt));
    canvasWrap.appendChild(this.canvas);

    // Barre d'état boussole Patient Zéro sous le radar
    this.compassReadout = createEl(
      'div',
      'hud-panel-subtitle',
      'Boussole : Aucun Patient Zéro repéré'
    );

    // Légende cartographique
    const legend = createEl('div', 'minimap-legend');
    legend.append(
      this._createLegendItem('#1e90ff', 'Éclaireur'),
      this._createLegendItem('#38c172', 'Optimum'),
      this._createLegendItem('#ff4757', 'Patient Zéro'),
      this._createLegendItem('#e6a145', 'Bastion')
    );

    this.container.append(header, canvasWrap, this.compassReadout, legend);
    root.appendChild(this.container);
  }

  /**
   * Crée un élément de légende avec une pastille de couleur.
   * @param {string} colorCss
   * @param {string} labelText
   * @returns {HTMLElement}
   * @private
   */
  _createLegendItem(colorCss, labelText) {
    const item = createEl('span', 'minimap-legend-item');
    const dot = createEl('span', 'minimap-dot');
    dot.style.backgroundColor = colorCss;
    const text = createEl('span', '', labelText);
    item.append(dot, text);
    return item;
  }

  /**
   * Bascule l'affichage de la grille de biomasse et densité de Conway.
   * @param {boolean} [forceState] - État explicite optionnel.
   * @returns {boolean} Nouvel état.
   */
  toggleConwayOverlay(forceState) {
    this.showConwayGrid = typeof forceState === 'boolean' ? forceState : !this.showConwayGrid;
    if (this.toggleGridBtn) {
      this.toggleGridBtn.textContent = this.showConwayGrid ? 'Grille Conway: ON' : 'Grille Conway: OFF';
      this.toggleGridBtn.className = this.showConwayGrid
        ? 'hud-btn hud-btn-sm hud-btn-biomass'
        : 'hud-btn hud-btn-sm';
    }
    return this.showConwayGrid;
  }

  /**
   * Met en surbrillance une lignée mutante ou hybride spécifique sur le radar.
   * @param {string|null} lineageId - Identifiant de mutation ou d'hybride.
   */
  setHighlightedLineage(lineageId) {
    this.highlightedLineageId = lineageId || null;
  }

  /**
   * Déclenche une impulsion visuelle temporaire sur une coordonnée du monde (ex. lors d'une alerte Éclaireur).
   * @param {number} worldX
   * @param {number} worldZ
   * @param {string} [label='CIBLE']
   * @param {number} [durationMs=6000]
   */
  pingLocation(worldX, worldZ, label = 'PATIENT ZÉRO', durationMs = 6000) {
    this.focusedPing = {
      x: worldX,
      z: worldZ,
      label,
      until: performance.now() + durationMs,
    };
  }

  /**
   * Convertit une coordonnée monde `(x, z)` en coordonnée pixel `(px, py)` sur le canvas 220x220.
   * @param {number} worldX
   * @param {number} worldZ
   * @returns {{px: number, py: number}}
   */
  worldToCanvas(worldX, worldZ) {
    const halfWorld = this.worldSize * 0.5;
    const normX = clamp((worldX + halfWorld) / this.worldSize, 0, 1);
    const normZ = clamp((worldZ + halfWorld) / this.worldSize, 0, 1);
    return {
      px: normX * this.size,
      py: normZ * this.size,
    };
  }

  /**
   * Convertit un clic sur le canvas en coordonnées monde `(worldX, worldZ)`.
   * @param {MouseEvent} evt
   * @private
   */
  _handleCanvasClick(evt) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = clamp(evt.clientX - rect.left, 0, this.size);
    const cy = clamp(evt.clientY - rect.top, 0, this.size);
    const halfWorld = this.worldSize * 0.5;
    const worldX = (cx / this.size) * this.worldSize - halfWorld;
    const worldZ = (cy / this.size) * this.worldSize - halfWorld;

    this.pingLocation(worldX, worldZ, 'BALISE TACTIQUE', 3500);
    if (this.onPingWorld) {
      this.onPingWorld(worldX, worldZ);
    }
  }

  /**
   * Pré-calcule le fond topographique de l'île (côtes, plages, biomes) une seule fois.
   * @param {Object} terrain - Instance de `Terrain` exposant `getHeightAt(x,z)` et `getBiomeAt(x,z)`.
   * @private
   */
  _ensureTerrainBackdrop(terrain) {
    if (this.backdropReady && this.backdropCanvas) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = this.size;
    offscreen.height = this.size;
    const bctx = offscreen.getContext('2d');

    const halfWorld = this.worldSize * 0.5;
    const waterLevel = CONFIG.WORLD?.WATER_LEVEL ?? -1.2;
    const step = 2; // Résolution 2x2 px pour un rendu net et immédiat

    for (let py = 0; py < this.size; py += step) {
      for (let px = 0; px < this.size; px += step) {
        const wx = ((px + step * 0.5) / this.size) * this.worldSize - halfWorld;
        const wz = ((py + step * 0.5) / this.size) * this.worldSize - halfWorld;

        let height = 0;
        let biome = 'plains';

        if (terrain && typeof terrain.getHeightAt === 'function') {
          height = terrain.getHeightAt(wx, wz);
        } else {
          const dist = Math.hypot(wx, wz);
          height = dist > 98 ? -2.0 : 2.0;
        }

        if (height < waterLevel) {
          bctx.fillStyle = height < waterLevel - 1.2 ? BIOME_COLORS.ocean : BIOME_COLORS.shallow;
        } else {
          if (terrain && typeof terrain.getBiomeAt === 'function') {
            biome = terrain.getBiomeAt(wx, wz);
          }
          bctx.fillStyle = BIOME_COLORS[biome] || BIOME_COLORS.plains;
        }

        bctx.fillRect(px, py, step, step);
      }
    }

    // Fine grille cartographique de référence
    bctx.strokeStyle = 'rgba(240, 234, 214, 0.05)';
    bctx.lineWidth = 1;
    const gridStep = this.size / 6;
    for (let i = 1; i < 6; i++) {
      const pos = Math.round(i * gridStep) + 0.5;
      bctx.beginPath();
      bctx.moveTo(pos, 0);
      bctx.lineTo(pos, this.size);
      bctx.stroke();

      bctx.beginPath();
      bctx.moveTo(0, pos);
      bctx.lineTo(this.size, pos);
      bctx.stroke();
    }

    this.backdropCanvas = offscreen;
    this.backdropReady = Boolean(terrain && typeof terrain.getHeightAt === 'function');
  }

  /**
   * Met à jour et dessine l'intégralité du radar Minimap.
   *
   * @param {Object} state - État courant du monde.
   * @param {Object} [state.terrain] - Instance `Terrain`.
   * @param {Object} [state.ecoSim] - Instance `EcosystemSimulator`.
   * @param {Array<Object>} [state.enemies] - Liste des ennemis vivants.
   * @param {Object} [state.player] - Instance `PlayerController` (ou `{x, z, rotation}`).
   * @param {Object} [state.bastionAndNpcs] - Instance `BastionAndNPCs`.
   * @param {number} [state.elapsedTime=0] - Temps écoulé en secondes pour les animations de pulsation.
   */
  update(state = {}) {
    if (!this.ctx) return;
    const {
      terrain = null,
      ecoSim = null,
      enemies = [],
      player = null,
      bastionAndNpcs = null,
      elapsedTime = performance.now() * 0.001,
    } = state;

    this._ensureTerrainBackdrop(terrain);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);

    // 1. Fond topographique
    if (this.backdropCanvas) {
      ctx.drawImage(this.backdropCanvas, 0, 0);
    }

    // 2. Superposition de la Grille de Conway (Biomasse & Densité)
    if (this.showConwayGrid && ecoSim && typeof ecoSim.getGridSnapshot === 'function') {
      this._drawConwayOverlay(ctx, ecoSim.getGridSnapshot());
    }

    // 3. Sanctuaire du Bastion au centre (0,0)
    this._drawBastion(ctx, bastionAndNpcs);

    // 4. Cages de prisonniers non secourues
    this._drawCages(ctx, bastionAndNpcs);

    // 5. Éclaireurs (Scouts) alliés et leurs rayons de vision
    this._drawAlliedNpcs(ctx, bastionAndNpcs);

    // 6. Ennemis, Hybrides et Patients Zéro
    const nearestPatientZero = this._drawEnemiesAndMutants(ctx, enemies, player, elapsedTime);

    // 7. Ping tactique éventuel
    this._drawFocusedPing(ctx, elapsedTime);

    // 8. Flèche directionnelle du Joueur + Boussole vers le Patient Zéro le plus proche
    this._drawPlayerAndCompass(ctx, player, nearestPatientZero, elapsedTime);

    // 9. Points cardinaux (N, S, E, O)
    this._drawCardinalLabels(ctx);
  }

  /**
   * Dessine la grille 24x24 du Jeu de la Vie de Conway (zones optimales, famines, sous-population).
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<Object>} cells
   * @private
   */
  _drawConwayOverlay(ctx, cells) {
    if (!Array.isArray(cells) || cells.length === 0) return;

    const gridCells = CONFIG.WORLD?.GRID_CELLS || 24;
    const cellPx = this.size / gridCells;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell) continue;

      const col = typeof cell.col === 'number' ? cell.col : 0;
      const row = typeof cell.row === 'number' ? cell.row : 0;
      const x = col * cellPx;
      const y = row * cellPx;

      const state = cell.densityState || 'empty';
      const count = cell.enemyCount || 0;

      if (state === 'optimal') {
        ctx.fillStyle = 'rgba(56, 193, 114, 0.28)';
        ctx.fillRect(x, y, cellPx, cellPx);
        ctx.strokeStyle = 'rgba(56, 193, 114, 0.55)';
        ctx.lineWidth = 0.75;
        ctx.strokeRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
      } else if (state === 'overpopulated') {
        ctx.fillStyle = 'rgba(255, 71, 87, 0.34)';
        ctx.fillRect(x, y, cellPx, cellPx);
        ctx.strokeStyle = 'rgba(255, 71, 87, 0.7)';
        ctx.lineWidth = 0.85;
        ctx.strokeRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
      } else if (state === 'underpopulated' && count > 0) {
        ctx.fillStyle = 'rgba(30, 144, 255, 0.16)';
        ctx.fillRect(x, y, cellPx, cellPx);
      } else if (typeof cell.biomass === 'number' && cell.biomass < 25) {
        // Zone à biomasse appauvrie
        ctx.fillStyle = 'rgba(230, 161, 69, 0.12)';
        ctx.fillRect(x, y, cellPx, cellPx);
      }
    }
  }

  /**
   * Dessine le Bastion central, son anneau de sécurité et la frontière d'expédition sauvage.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object|null} bastionAndNpcs
   * @private
   */
  _drawBastion(ctx, bastionAndNpcs) {
    const bx = CONFIG.BASTION?.POS?.x || 0;
    const bz = CONFIG.BASTION?.POS?.z || 0;
    const { px, py } = this.worldToCanvas(bx, bz);
    const radiusPx = ((CONFIG.BASTION?.RADIUS || 14) / this.worldSize) * this.size;
    const frontierPx = ((CONFIG.WORLD?.SAFE_SPAWN_RADIUS || 42) / this.worldSize) * this.size;

    ctx.save();
    // Frontière des Terres Sauvages (au-delà de laquelle les Éclaireurs partent en expédition)
    ctx.beginPath();
    ctx.arc(px, py, frontierPx, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(240, 234, 214, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Anneau du sanctuaire
    ctx.beginPath();
    ctx.arc(px, py, radiusPx, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(230, 161, 69, 0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 161, 69, 0.75)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Icône octogonale / fortin au centre (Cœur du Bastion)
    ctx.beginPath();
    ctx.arc(px, py, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#e6a145';
    ctx.fill();
    ctx.strokeStyle = '#0d131a';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Emplacements des 4 chantiers / bâtiments autour du Bastion
    const defaultPads = [
      { id: 'watchtower', x: 8, z: -7 },
      { id: 'scout_guild', x: -8, z: -7 },
      { id: 'lumber_forge', x: 8, z: 7 },
      { id: 'biolab', x: -8, z: 7 },
    ];
    const bLevels = bastionAndNpcs?.buildingLevels || bastionAndNpcs?.buildings || {};
    for (const pad of defaultPads) {
      const pCanvas = this.worldToCanvas(pad.x, pad.z);
      const lvl =
        typeof bLevels[pad.id] === 'number'
          ? bLevels[pad.id]
          : bLevels[pad.id]?.level || 0;
      ctx.fillStyle = lvl > 0 ? '#38c172' : 'rgba(230, 161, 69, 0.35)';
      ctx.strokeStyle = lvl > 0 ? '#ffffff' : 'rgba(230, 161, 69, 0.75)';
      ctx.lineWidth = 0.8;
      ctx.fillRect(pCanvas.px - 2, pCanvas.py - 2, 4, 4);
      ctx.strokeRect(pCanvas.px - 2, pCanvas.py - 2, 4, 4);
    }
    ctx.restore();
  }

  /**
   * Dessine les cages de prisonniers restant à libérer sur l'île.
   * Met en évidence d'un anneau doré celles repérées par la mission `'find_cages'` des Éclaireurs.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object|null} bastionAndNpcs
   * @private
   */
  _drawCages(ctx, bastionAndNpcs) {
    if (!bastionAndNpcs) return;
    const cages =
      bastionAndNpcs.cages ||
      (typeof bastionAndNpcs.getCages === 'function' ? bastionAndNpcs.getCages() : []);
    if (!Array.isArray(cages)) return;

    ctx.save();
    for (const cage of cages) {
      if (!cage || cage.rescued || cage.isRescued) continue;
      const cx = cage.x ?? cage.pos?.x ?? cage.mesh?.position?.x ?? 0;
      const cz = cage.z ?? cage.pos?.z ?? cage.mesh?.position?.z ?? 0;
      const { px, py } = this.worldToCanvas(cx, cz);

      if (cage.discoveredByScout || cage.spottedByScout) {
        ctx.beginPath();
        ctx.arc(px, py, 6.2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.85)';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }

      ctx.fillStyle = '#ffd285';
      ctx.strokeStyle = '#0d131a';
      ctx.lineWidth = 1;
      ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
      ctx.strokeRect(px - 2.5, py - 2.5, 5, 5);
    }
    ctx.restore();
  }

  /**
   * Dessine les PNJ alliés, en particulier les Éclaireurs (Scouts) avec leur rayon de détection
   * et leur vecteur de mission active.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object|null} bastionAndNpcs
   * @private
   */
  _drawAlliedNpcs(ctx, bastionAndNpcs) {
    if (!bastionAndNpcs) return;
    const npcs =
      bastionAndNpcs.npcs ||
      (typeof bastionAndNpcs.getNpcs === 'function' ? bastionAndNpcs.getNpcs() : []);
    if (!Array.isArray(npcs)) return;

    const scoutVisionWorld =
      bastionAndNpcs.scoutVisionRadius || CONFIG.SCOUT?.VISION_RADIUS || 34;
    const visionPx = (scoutVisionWorld / this.worldSize) * this.size;

    ctx.save();
    for (const npc of npcs) {
      if (!npc || npc.dead || (typeof npc.hp === 'number' && npc.hp <= 0)) continue;
      const nx = npc.x ?? npc.pos?.x ?? npc.mesh?.position?.x ?? 0;
      const nz = npc.z ?? npc.pos?.z ?? npc.mesh?.position?.z ?? 0;
      const { px, py } = this.worldToCanvas(nx, nz);

      if (npc.role === 'scout') {
        // Vecteur de trajectoire vers la cible de mission de l'Éclaireur
        if (typeof npc.targetX === 'number' && typeof npc.targetZ === 'number') {
          const tgt = this.worldToCanvas(npc.targetX, npc.targetZ);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(tgt.px, tgt.py);
          ctx.strokeStyle = 'rgba(72, 219, 251, 0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Cercle de reconnaissance de l'Éclaireur
        ctx.beginPath();
        ctx.arc(px, py, visionPx, 0, Math.PI * 2);
        ctx.fillStyle =
          npc.state === 'fleeing'
            ? 'rgba(255, 165, 2, 0.08)'
            : 'rgba(30, 144, 255, 0.09)';
        ctx.fill();
        ctx.strokeStyle =
          npc.state === 'fleeing'
            ? 'rgba(255, 165, 2, 0.5)'
            : 'rgba(30, 144, 255, 0.42)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Point central de l'Éclaireur
        ctx.beginPath();
        ctx.arc(px, py, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = npc.state === 'fleeing' ? '#ffa502' : '#1e90ff';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      } else {
        // Garde ou Récolteur près du Bastion
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = npc.role === 'guard' ? '#e6a145' : '#2ed573';
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Dessine les créatures ennemies et met en évidence les Mutants / Patients Zéro repérés.
   * Distingue également les individus Juvéniles (`lifeStage === 'baby'`) des Adultes reproducteurs.
   * Retourne le Mutant / Patient Zéro actif le plus proche du joueur pour la boussole.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<Object>} enemies
   * @param {Object|null} player
   * @param {number} elapsedTime
   * @returns {Object|null} Ennemi mutant prioritaire le plus proche.
   * @private
   */
  _drawEnemiesAndMutants(ctx, enemies, player, elapsedTime) {
    if (!Array.isArray(enemies)) return null;

    const playerX = player?.x ?? player?.mesh?.position?.x ?? 0;
    const playerZ = player?.z ?? player?.mesh?.position?.z ?? 0;

    let nearestPriorityTarget = null;
    let nearestPriorityDist = Infinity;

    const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 6.0);

    ctx.save();
    for (const enemy of enemies) {
      if (!enemy || enemy.dead || (typeof enemy.hp === 'number' && enemy.hp <= 0)) continue;

      const ex = enemy.x ?? enemy.pos?.x ?? enemy.mesh?.position?.x ?? 0;
      const ez = enemy.z ?? enemy.pos?.z ?? enemy.mesh?.position?.z ?? 0;
      const { px, py } = this.worldToCanvas(ex, ez);

      const genome = enemy.genome || {};
      const mutations = Array.isArray(genome.mutations) ? genome.mutations : [];
      const hasMutation = mutations.length > 0;
      const isHybrid = Boolean(genome.isHybrid);
      const isSpotted = Boolean(enemy.spottedByScout || enemy.isPatientZero);
      const isBaby = enemy.lifeStage === 'baby' || enemy.isAdult === false;

      const matchesHighlight =
        this.highlightedLineageId &&
        (mutations.includes(this.highlightedLineageId) ||
          genome.speciesId === this.highlightedLineageId ||
          genome.lineageId === this.highlightedLineageId);

      // Si c'est un mutant ou hybride repéré (ou Patient Zéro), calculer s'il est le plus proche
      if (hasMutation || isHybrid) {
        const d = dist2D(playerX, playerZ, ex, ez);
        const priorityScore = isSpotted ? d : d + 500;
        if (priorityScore < nearestPriorityDist) {
          nearestPriorityDist = priorityScore;
          nearestPriorityTarget = {
            enemy,
            x: ex,
            z: ez,
            dist: d,
            isSpotted,
            isBaby,
            mutationId: mutations[0] || null,
            speciesName: genome.speciesName || CONFIG.SPECIES?.[genome.speciesId]?.name || 'Mutant',
          };
        }
      }

      // Anneau pulsant cramoisi pour les Patients Zéro / Mutants repérés par un Éclaireur
      const spId = genome.speciesId || '';
      const isDragon = spId === 'dragon' || enemy.aggroStance === 'pacifist_apex';
      const isEnragedDragon = Boolean(
        isDragon && (enemy.enraged || enemy.state === 'wrath_raid')
      );
      const isHerbivorePrey =
        spId === 'deer' ||
        spId === 'rabbit' ||
        enemy.aggroStance === 'prey_pacifist' ||
        CONFIG.SPECIES?.[spId]?.clade === 'herbivore';
      const isShark = spId === 'shark';
      const isMole = spId === 'giant_mole';

      if (isEnragedDragon) {
        // Trajectoire de Courroux Draconique droit vers le Bastion (0, 0)
        const half = this.size * 0.5;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(half, half);
        ctx.strokeStyle = `rgba(255, 71, 87, ${0.55 + pulse * 0.4})`;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(px, py, 6.0 + pulse * 4.0, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff4757';
        ctx.lineWidth = 2.0;
        ctx.stroke();
      } else if (isDragon) {
        // Halo doré souverain pour un Dragon Pacifique non provoqué
        ctx.beginPath();
        ctx.arc(px, py, 4.8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.72)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (isHerbivorePrey) {
        // Gibier pacifique (Biche / Lapin) en vert tendre pour éviter les dégâts collatéraux de sorts
        ctx.beginPath();
        ctx.arc(px, py, isBaby ? 1.8 : spId === 'deer' ? 2.7 : 2.1, 0, Math.PI * 2);
        ctx.fillStyle = '#a3cb38';
        ctx.fill();
        ctx.strokeStyle = 'rgba(220, 248, 163, 0.8)';
        ctx.lineWidth = 0.75;
        ctx.stroke();
        continue;
      } else if (isShark) {
        // Requin des Abysses : aileron cyan en mer vs anneau amphibie sur terre
        const landed = enemy.isAquatic === false || enemy.hasLandLegs || enemy.isAmphibiousLanded;
        ctx.beginPath();
        ctx.arc(px, py, landed ? 4.2 + pulse * 2.0 : 3.4, 0, Math.PI * 2);
        ctx.strokeStyle = landed ? '#00d2d3' : 'rgba(0, 210, 211, 0.65)';
        ctx.lineWidth = landed ? 1.6 : 1.1;
        ctx.stroke();
      } else if (isMole) {
        // Taupe Géante Fouisseuse : halo tellurique cuivré
        ctx.beginPath();
        ctx.arc(px, py, 3.8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(229, 142, 38, 0.78)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      if ((hasMutation || isHybrid) && (isSpotted || matchesHighlight)) {
        const ringRadius = 5.5 + pulse * 4.5 + (matchesHighlight ? 2.5 : 0);
        ctx.beginPath();
        ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = matchesHighlight
          ? '#ffd700'
          : `rgba(255, 71, 87, ${0.45 + pulse * 0.5})`;
        ctx.lineWidth = matchesHighlight ? 2.2 : 1.8;
        ctx.stroke();

        // Second anneau interne (ambre/orangé si encore Bébé juvénile non reproducteur, cramoisi si Adulte)
        ctx.beginPath();
        ctx.arc(px, py, isBaby ? 3.0 : 3.7, 0, Math.PI * 2);
        ctx.fillStyle = isBaby ? '#ff9f43' : '#ff4757';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        // Point d'ennemi standard coloré selon l'espèce (plus petit si Bébé juvénile, plus grand si Dragon)
        const spColor =
          CONFIG.SPECIES?.[spId]?.color ||
          (isShark ? '#00d2d3' : isMole ? '#e58e26' : isHybrid ? '#e6a145' : '#9fb1c1');
        ctx.beginPath();
        const dotR = isBaby ? 1.5 : isDragon ? 3.3 : isShark || isMole ? 2.9 : hasMutation ? 2.8 : 2.1;
        ctx.arc(px, py, dotR, 0, Math.PI * 2);
        ctx.fillStyle = isEnragedDragon
          ? '#ff4757'
          : isDragon
            ? '#ff9436'
            : isShark
              ? '#00d2d3'
              : isMole
                ? '#e58e26'
                : hasMutation
                  ? '#ff6b6b'
                  : spColor;
        ctx.fill();
      }
    }
    ctx.restore();

    return nearestPriorityTarget;
  }

  /**
   * Dessine le ping tactique temporaire déclenché par clic ou alerte.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} elapsedTime
   * @private
   */
  _drawFocusedPing(ctx, elapsedTime) {
    if (!this.focusedPing) return;
    if (performance.now() > this.focusedPing.until) {
      this.focusedPing = null;
      return;
    }

    const { px, py } = this.worldToCanvas(this.focusedPing.x, this.focusedPing.z);
    const wave = (elapsedTime * 2.4) % 1;
    const radius = 4 + wave * 16;

    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(230, 161, 69, ${1 - wave})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Dessine la flèche directionnelle du Joueur et l'indicateur boussole vers le Patient Zéro.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object|null} player
   * @param {Object|null} nearestTarget
   * @param {number} elapsedTime
   * @private
   */
  _drawPlayerAndCompass(ctx, player, nearestTarget, elapsedTime) {
    const pxWorld = player?.x ?? player?.pos?.x ?? player?.mesh?.position?.x ?? 0;
    const pzWorld = player?.z ?? player?.pos?.z ?? player?.mesh?.position?.z ?? 4;
    const yaw =
      player?.rotation ??
      player?.facingAngle ??
      player?.mesh?.rotation?.y ??
      0;

    const { px, py } = this.worldToCanvas(pxWorld, pzWorld);

    // Ligne boussole pointillée et flèche vers le Patient Zéro le plus proche
    if (nearestTarget) {
      const targetCanvas = this.worldToCanvas(nearestTarget.x, nearestTarget.z);
      const angle = angleBetween(px, py, targetCanvas.px, targetCanvas.py);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(targetCanvas.px, targetCanvas.py);
      ctx.strokeStyle = 'rgba(255, 71, 87, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Petit chevron directionnel autour du joueur pointant vers la menace
      const compassRadius = 11;
      const tipX = px + Math.cos(angle) * (compassRadius + 4);
      const tipY = py + Math.sin(angle) * (compassRadius + 4);
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4757';
      ctx.fill();
      ctx.restore();

      const sector = getCardinalLabelFR(nearestTarget.x - pxWorld, nearestTarget.z - pzWorld);
      const mutLabel = nearestTarget.mutationId
        ? CONFIG.MUTATIONS?.[nearestTarget.mutationId]?.shortLabel || nearestTarget.mutationId
        : 'Hybride';
      const stagePrefix = nearestTarget.isBaby ? '🐣 Bébé ' : '';
      if (this.compassReadout) {
        this.compassReadout.textContent = `🎯 Cap : ${stagePrefix}${nearestTarget.speciesName} [${mutLabel}] — ${Math.round(nearestTarget.dist)}m (${sector})`;
        this.compassReadout.style.color = '#ff8a93';
      }
    } else if (this.compassReadout) {
      this.compassReadout.textContent = 'Boussole : Aucun Patient Zéro actif détecté';
      this.compassReadout.style.color = '';
    }

    // Flèche du Joueur
    ctx.save();
    ctx.translate(px, py);
    // Adaptation de l'angle 3D Three.js vers le plan 2D du canvas
    ctx.rotate(-yaw + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.8, 5.2);
    ctx.lineTo(0, 2.8);
    ctx.lineTo(-4.8, 5.2);
    ctx.closePath();
    ctx.fillStyle = '#f0ead6';
    ctx.fill();
    ctx.strokeStyle = '#0d131a';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Dessine les repères cardinaux (N, S, E, O) sur les bords du radar.
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */
  _drawCardinalLabels(ctx) {
    ctx.save();
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(240, 234, 214, 0.72)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', this.size * 0.5, 4);

    ctx.textBaseline = 'bottom';
    ctx.fillText('S', this.size * 0.5, this.size - 3);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('O', 4, this.size * 0.5);

    ctx.textAlign = 'right';
    ctx.fillText('E', this.size - 4, this.size * 0.5);
    ctx.restore();
  }
}

export default Minimap;
