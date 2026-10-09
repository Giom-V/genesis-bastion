/**
 * @file src/main.js
 * @description Point d'entrée principal et orchestrateur de la boucle de jeu pour **Genesis Bastion**.
 *
 * Ce module assemble et synchronise l'ensemble des sous-systèmes :
 * 1. Rendu 3D & Atmosphère (`SceneManager`, `Terrain`, `VFXManager`)
 * 2. Écosystème & Génétique Darwinienne (`EcosystemSimulator`, `BalanceAndPacing`)
 * 3. Entités, IA de meute, Joueur & Éclaireurs hors-frontière (`EnemyManager`, `PlayerController`, `BastionAndNPCs`)
 * 4. Interface Tactique & Radar Cartographique (`HUDManager`, `Minimap`)
 *
 * Raccourcis clavier globaux :
 * - `Tab` : Ouvrir / Fermer le Codex Phylogénétique & Génome
 * - `T`   : Forcer immédiatement un Eco-Tick génétique (reproduction & sélection de Conway)
 * - `M`   : Spawner un Troll de Feu ("Patient Zéro" avec `pyro_gland`) pour tester la traque
 * - `G`   : Afficher / Masquer la grille écologique de Conway sur la Minimap
 * - `1/2/3` : Construire Tour de Guet (1), Palissade Runique (2) ou Bio-Laboratoire (3)
 *
 * Expose également `window.__GENESIS_GAME__` pour l'inspection, le débogage et la vérification automatisée.
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { logger } from './utils/logger.js';
import { SceneManager } from './world/SceneManager.js';
import { Terrain } from './world/Terrain.js';
import { VFXManager } from './world/VFXManager.js';
import { EcosystemSimulator } from './ecosystem/EcosystemSimulator.js';
import { DESIGNED_UPGRADES } from './ecosystem/BalanceAndPacing.js';
import { EnemyManager } from './entities/EnemyManager.js';
import { PlayerController } from './entities/PlayerController.js';
import { BastionAndNPCs } from './entities/BastionAndNPCs.js';
import { HUDManager } from './ui/HUDManager.js';
import { Minimap } from './ui/Minimap.js';

/**
 * Classe principale d'orchestration d'une session Genesis Bastion.
 */
export class GenesisBastionGame {
  /**
   * Initialise tous les sous-systèmes 3D, écologiques, entités et HUD.
   */
  constructor() {
    logger.info('SYSTEM', 'Initialisation de Genesis Bastion — Évolution Génétique & Survie 3D...');

    /** @type {HTMLElement} */
    this.appContainer = document.getElementById('app') || document.body;

    // 1. Moteur 3D Three.js, Terrain insulaire & Effets visuels (VFX)
    /** @type {SceneManager} */
    this.sceneManager = new SceneManager(this.appContainer);
    /** @type {Terrain} */
    this.terrain = new Terrain(this.sceneManager.scene);
    /** @type {VFXManager} */
    this.vfx = new VFXManager(this.sceneManager.scene);

    // 2. Simulateur d'Écosystème (Jeu de la Vie de Conway + Algorithme Génétique)
    /** @type {EcosystemSimulator} */
    this.ecoSim = new EcosystemSimulator();

    // 3. Gestionnaire d'Ennemis, Joueur & Bastion + Éclaireurs (Scouts)
    /** @type {EnemyManager} */
    this.enemyManager = new EnemyManager(
      this.sceneManager.scene,
      this.terrain,
      this.vfx,
      this.ecoSim
    );

    /** @type {PlayerController} */
    this.player = new PlayerController(this.sceneManager.scene, this.terrain, this.vfx);

    /** @type {BastionAndNPCs} */
    this.bastionAndNpcs = new BastionAndNPCs(
      this.sceneManager.scene,
      this.terrain,
      this.vfx,
      this.ecoSim
    );

    // 4. Interface Tactique (HUDManager) & Radar Cartographique 2D (Minimap)
    /** @type {HUDManager} */
    this.hud = new HUDManager({
      onForceEcoTick: () => this.forceEcoTick(),
      onSpawnFireTroll: () => this.spawnTestFireTroll(),
      onAssignRole: (targetRole) => this.handleRoleAssignment(targetRole),
      onBuildStructure: (structId) => this.handleBuildStructure(structId),
      onFocusWorldPos: (wx, wz, lineageId) => this.focusWorldPosition(wx, wz, lineageId),
      onSelectUpgrade: (upgrade) => this.handleSelectUpgrade(upgrade),
    });
    this.hud.registerExtraUpgrades(DESIGNED_UPGRADES);

    /** @type {Minimap} */
    this.minimap = new Minimap(this.hud.root, {
      onPingWorld: (wx, wz) => {
        this.focusWorldPosition(wx, wz, null);
      },
    });

    // 5. Câblage des callbacks de découverte Éclaireur, d'éradication et de Level-Up
    this._wireGameCallbacks();

    // 6. Génération de la population initiale (incluant un Patient Zéro initial) + 1er cliché écologique
    this.enemyManager.spawnInitialPopulation(CONFIG.ECO?.INITIAL_POPULATION || 42);
    this.ecoSim.stepEcoTick(this.enemyManager.getEnemies(), (x, z) =>
      this.terrain.getBiomeAt(x, z)
    );

    // 7. Raccourcis clavier globaux (Tab, T, M, G, 1, 2, 3, Escape)
    this._bindGlobalShortcuts();

    // 8. État de la boucle d'animation
    /** @type {number} */
    this.lastFrameTime = performance.now();
    /** @type {number} */
    this.elapsedTime = 0;
    /** @type {boolean} */
    this.isRunning = true;

    logger.info(
      'SYSTEM',
      'Genesis Bastion prêt. Les Éclaireurs partent en expédition au-delà de la frontière !',
      {
        initialPopulation: this.enemyManager.getEnemies().length,
        scoutsCount: this.bastionAndNpcs.getRoleCounts?.()?.scout ?? 1,
      }
    );
  }

  /**
   * Connecte les événements entre les Éclaireurs, le gestionnaire d'ennemis, le joueur et le HUD.
   * @private
   */
  _wireGameCallbacks() {
    /**
     * Callback déclenché lorsqu'un Éclaireur (Scout) découvre un Mutant ou Hybride dans les terres sauvages.
     * @param {Object} discovery
     */
    this.handleScoutDiscovery = (discovery) => {
      if (!discovery) return;
      const enemy = discovery.enemy;
      const ex = enemy?.x ?? enemy?.mesh?.position?.x ?? 0;
      const ez = enemy?.z ?? enemy?.mesh?.position?.z ?? 0;

      this.hud.showScoutAlert(discovery);
      this.minimap.pingLocation(ex, ez, 'PATIENT ZÉRO', 8000);
    };

    if (this.bastionAndNpcs) {
      this.bastionAndNpcs.onScoutDiscovery = this.handleScoutDiscovery;
    }

    /**
     * Callback déclenché lorsqu'une lignée mutante entière tombe à 0 individu survivant.
     * @param {string} mutationId
     * @param {Object} lastEnemy
     */
    this.handleLineageEradicated = (mutationId, lastEnemy) => {
      if (this.vfx && lastEnemy?.id && typeof this.vfx.removePatientZeroBeacon === 'function') {
        this.vfx.removePatientZeroBeacon(lastEnemy.id);
      }
      this.hud.showEradicationBanner(mutationId, lastEnemy);
      if (this.player) {
        this.player.gainXp(60);
      }
    };

    this.enemyManager.onLineageEradicated = this.handleLineageEradicated;

    // Montée de niveau Roguelike du joueur
    if (this.player) {
      this.player.onLevelUp = () => {
        const enemies = this.enemyManager.getEnemies();
        let activeMutantCount = 0;
        let hasActivePyro = false;
        let starvingCount = 0;
        for (const e of enemies) {
          if (!e || e.hp <= 0) continue;
          if (e.starving) starvingCount++;
          const muts = e.genome?.mutations || [];
          if (muts.length > 0) {
            activeMutantCount++;
            if (muts.includes('pyro_gland')) hasActivePyro = true;
          }
        }
        this.hud.showLevelUpModal(null, (upgrade) => this.handleSelectUpgrade(upgrade), {
          hasActivePyro,
          activeMutantCount,
          starvingCount,
        });
      };
    }
  }

  /**
   * Force l'exécution immédiate d'un cycle écologique (Eco-Tick) de Conway + Génétique.
   * @returns {Object} Résultat du cycle écologique.
   */
  forceEcoTick() {
    const res = this.enemyManager.triggerEcoTick();
    logger.info('ECO', 'Cycle écologique forcé manuellement depuis le Laboratoire.', {
      tickNumber: res?.tickNumber,
      births: res?.spawnedOffspring?.length ?? res?.births?.length ?? 0,
      totalPopulation: this.enemyManager.getEnemies().length,
    });
    return res;
  }

  /**
   * Fait apparaître immédiatement un Troll de Feu ("Patient Zéro" porteur de `pyro_gland`)
   * et déclenche son repérage pour permettre au joueur de tester la boucle complète.
   * @returns {Object} L'entité ennemie créée.
   */
  spawnTestFireTroll() {
    const mutant = this.enemyManager.forceSpawnMutant('pyro_gland', 'troll');
    if (mutant) {
      mutant.spottedByScout = true;
      if (this.ecoSim && typeof this.ecoSim.markMutationDiscovered === 'function') {
        this.ecoSim.markMutationDiscovered('pyro_gland', mutant.id);
      }
      if (this.vfx && typeof this.vfx.setPatientZeroBeacon === 'function') {
        const pos = mutant.mesh ? mutant.mesh.position : new THREE.Vector3(mutant.x, mutant.y, mutant.z);
        this.vfx.setPatientZeroBeacon(mutant.id, pos, 0xff4500, true);
      }
      this.handleScoutDiscovery({
        scout: null,
        enemy: mutant,
        mutations: mutant.genome?.mutations || ['pyro_gland'],
        isHybrid: Boolean(mutant.genome?.isHybrid),
        speciesName: mutant.genome?.speciesName || 'Troll',
      });
    }
    return mutant;
  }

  /**
   * Gère l'allocation ou le recrutement d'un PNJ vers le rôle demandé (`scout`, `guard`, `harvester`).
   * @param {string} targetRole
   */
  handleRoleAssignment(targetRole) {
    if (!this.bastionAndNpcs) return;

    // 1. Tente d'abord de recruter un nouveau survivant si le joueur a assez de ressources
    if (typeof this.bastionAndNpcs.recruitNpcWithResources === 'function') {
      const recruited = this.bastionAndNpcs.recruitNpcWithResources(
        targetRole,
        this.player?.resources
      );
      if (recruited) {
        this.hud.refreshLogFeed();
        return;
      }
    }

    // 2. Sinon, réassigne un PNJ existant depuis un autre rôle
    if (typeof this.bastionAndNpcs.assignNpcRole === 'function') {
      const donorOrder =
        targetRole === 'scout'
          ? ['harvester', 'guard']
          : targetRole === 'guard'
            ? ['harvester', 'scout']
            : ['guard', 'scout'];

      for (const fromRole of donorOrder) {
        if (this.bastionAndNpcs.assignNpcRole(fromRole, targetRole)) {
          this.hud.refreshLogFeed();
          return;
        }
      }
    }
  }

  /**
   * Construit une structure défensive ou scientifique au Bastion (`watchtower`, `palisade`, `biolab`).
   * @param {string} structureId
   */
  handleBuildStructure(structureId) {
    if (!this.bastionAndNpcs || typeof this.bastionAndNpcs.buildStructure !== 'function') return;
    this.bastionAndNpcs.buildStructure(structureId, this.player?.resources);
    this.hud.refreshLogFeed();
  }

  /**
   * Oriente temporairement la caméra 3D et le radar Minimap vers une coordonnée du monde
   * (ex. lors du clic sur "TRAQUER LE PATIENT ZÉRO" ou sur une lignée mutante).
   * @param {number} worldX
   * @param {number} worldZ
   * @param {string|null} [lineageId=null]
   */
  focusWorldPosition(worldX, worldZ, lineageId = null) {
    this.minimap.setHighlightedLineage(lineageId);
    this.minimap.pingLocation(worldX, worldZ, 'CIBLE', 5000);

    if (this.sceneManager && typeof this.sceneManager.focusOnPosition === 'function') {
      const y = this.terrain ? this.terrain.getHeightAt(worldX, worldZ) : 0;
      this.sceneManager.focusOnPosition(new THREE.Vector3(worldX, y, worldZ), 2.8);
    }
  }

  /**
   * Applique une carte d'amélioration Roguelike choisie par le joueur.
   * @param {Object} upgrade
   */
  handleSelectUpgrade(upgrade) {
    if (!upgrade || !this.player) return;
    this.player.applyUpgrade(upgrade.id || upgrade.legacyId);
    this.hud.refreshLogFeed();
  }

  /**
   * Configure les raccourcis clavier globaux de la session.
   * @private
   */
  _bindGlobalShortcuts() {
    window.addEventListener('keydown', (evt) => {
      if (evt.target && (evt.target.tagName === 'INPUT' || evt.target.tagName === 'TEXTAREA')) {
        return;
      }

      if (evt.code === 'Tab') {
        evt.preventDefault();
        this.hud.toggleCodexModal(undefined, this.enemyManager.getEnemies());
      } else if (evt.code === 'Escape') {
        if (this.hud.isCodexOpen) {
          this.hud.toggleCodexModal(false);
        }
        this.hud.hideAlertBanner();
      } else if (evt.code === 'KeyT' && !evt.ctrlKey && !evt.metaKey) {
        this.forceEcoTick();
      } else if (evt.code === 'KeyM' && !evt.ctrlKey && !evt.metaKey) {
        this.spawnTestFireTroll();
      } else if (evt.code === 'KeyG' && !evt.ctrlKey && !evt.metaKey) {
        this.minimap.toggleConwayOverlay();
      } else if (evt.code === 'Digit1') {
        this.handleBuildStructure('watchtower');
      } else if (evt.code === 'Digit2') {
        this.handleBuildStructure('palisade');
      } else if (evt.code === 'Digit3') {
        this.handleBuildStructure('biolab');
      }
    });
  }

  /**
   * Exécute un pas de simulation et de rendu (`requestAnimationFrame`).
   * @param {number} nowMs - Timestamp haute précision fourni par `requestAnimationFrame`.
   */
  tickFrame(nowMs) {
    if (!this.isRunning) return;

    const rawDt = (nowMs - this.lastFrameTime) * 0.001;
    this.lastFrameTime = nowMs;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.1);
    this.elapsedTime += dt;

    const camYaw =
      typeof this.sceneManager.getCameraYaw === 'function'
        ? this.sceneManager.getCameraYaw()
        : this.sceneManager.cameraYaw || 0;

    // 1. Mise à jour du Joueur
    this.player.update(dt, this.elapsedTime, this.enemyManager, this.bastionAndNpcs, camYaw);

    // 2. Mise à jour du Bastion, des Gardes, Récolteurs et Éclaireurs (Scouts hors-frontière)
    if (this.bastionAndNpcs && typeof this.bastionAndNpcs.update === 'function') {
      this.bastionAndNpcs.update(
        dt,
        this.elapsedTime,
        this.enemyManager,
        this.player,
        this.handleScoutDiscovery
      );
    }

    // 3. Mise à jour des Créatures Sauvages, Meutes, Croissance Bébé -> Adulte & Eco-Ticks
    this.enemyManager.update(
      dt,
      this.elapsedTime,
      this.player,
      this.bastionAndNpcs,
      this.handleLineageEradicated
    );

    // 4. Mise à jour de l'Océan, de la Végétation et des Particules / Balises 3D
    const sunDir = this.sceneManager.getSunDirection();
    this.terrain.update(dt, this.elapsedTime, sunDir);
    this.vfx.update(dt, this.elapsedTime);

    // 5. Mise à jour de la Caméra 3D Tactique / Isométrique & Rendu Post-Processing
    this.sceneManager.update(dt, this.elapsedTime, this.player.position);

    // 6. Mise à jour du HUD et du Radar Minimap 2D
    this.hud.update({
      sceneManager: this.sceneManager,
      ecoSim: this.ecoSim,
      enemyManager: this.enemyManager,
      player: this.player,
      bastionAndNpcs: this.bastionAndNpcs,
    });

    this.minimap.update({
      terrain: this.terrain,
      ecoSim: this.ecoSim,
      enemies: this.enemyManager.getEnemies(),
      player: this.player,
      bastionAndNpcs: this.bastionAndNpcs,
      elapsedTime: this.elapsedTime,
    });

    requestAnimationFrame((t) => this.tickFrame(t));
  }

  /**
   * Démarre la boucle principale `requestAnimationFrame`.
   */
  start() {
    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.tickFrame(t));
  }
}

// Démarrage automatique au chargement du DOM et exposition globale pour inspection
let gameInstance = null;

function bootstrapGenesisBastion() {
  if (gameInstance) return gameInstance;
  gameInstance = new GenesisBastionGame();
  if (typeof window !== 'undefined') {
    window.__GENESIS_GAME__ = {
      game: gameInstance,
      config: CONFIG,
      logger,
      sceneManager: gameInstance.sceneManager,
      terrain: gameInstance.terrain,
      vfx: gameInstance.vfx,
      ecoSim: gameInstance.ecoSim,
      enemyManager: gameInstance.enemyManager,
      player: gameInstance.player,
      bastionAndNpcs: gameInstance.bastionAndNpcs,
      hud: gameInstance.hud,
      minimap: gameInstance.minimap,
      forceEcoTick: () => gameInstance.forceEcoTick(),
      spawnFireTroll: () => gameInstance.spawnTestFireTroll(),
      toggleCodex: () =>
        gameInstance.hud.toggleCodexModal(undefined, gameInstance.enemyManager.getEnemies()),
    };
  }
  gameInstance.start();
  return gameInstance;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapGenesisBastion);
  } else {
    bootstrapGenesisBastion();
  }
}

export default bootstrapGenesisBastion;
