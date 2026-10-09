/**
 * @file src/main.js
 * @description Point d'entrée principal et orchestrateur de la boucle de jeu pour **Genesis Bastion**,
 * incluant le **Tutoriel Guidé Interactif en 7 Actes (5–10 premières minutes)** avec dévoilement
 * progressif du HUD (`Progressive Disclosure`), pause écologique initiale (`ecoPaused = true`),
 * guidage spatial 3D (flèche directionnelle + colonne lumineuse), bulles d'actions contextuelles 3D->2D
 * et nombres de dégâts flottants.
 *
 * Ce module assemble et synchronise l'ensemble des sous-systèmes :
 * 1. Rendu 3D & Atmosphère (`SceneManager`, `Terrain`, `VFXManager`)
 * 2. Écosystème & Génétique Darwinienne (`EcosystemSimulator`, `BalanceAndPacing`, `OnboardingSteps`)
 * 3. Entités, IA de meute, Joueur & Éclaireurs hors-frontière (`EnemyManager`, `PlayerController`, `BastionAndNPCs`)
 * 4. Interface Tactique & Radar Cartographique (`HUDManager`, `Minimap`)
 *
 * Raccourcis clavier globaux :
 * - `Tab`   : Ouvrir / Fermer le Codex Phylogénétique & Génome
 * - `P`     : Passer le tutoriel guidé et déverrouiller immédiatement l'écosystème complet
 * - `T`     : Forcer immédiatement un Eco-Tick génétique (reproduction & sélection de Conway)
 * - `M`     : Spawner un Troll de Feu ("Patient Zéro" avec `pyro_gland`) pour tester la traque
 * - `G`     : Afficher / Masquer la grille écologique de Conway sur la Minimap
 * - `1/2/3` : Construire Tour de Guet (1), Palissade Runique (2) ou Bio-Laboratoire (3)
 *
 * Expose également `window.__GENESIS_GAME__` pour l'inspection, le débogage et la vérification automatisée.
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { logger } from './utils/logger.js';
import { dist2D } from './utils/math.js';
import { SceneManager } from './world/SceneManager.js';
import { Terrain } from './world/Terrain.js';
import { VFXManager } from './world/VFXManager.js';
import { EcosystemSimulator } from './ecosystem/EcosystemSimulator.js';
import { DESIGNED_UPGRADES } from './ecosystem/BalanceAndPacing.js';
import {
  ONBOARDING_ACTS,
  getOnboardingAct,
  logOnboardingTransition,
  FULL_UNLOCKED_HUD,
} from './ecosystem/OnboardingSteps.js';
import {
  DynamicQuestSystem,
  getBuildingUpgradeSpec,
  getElementalWeaponSpec,
  RELIC_FRAGMENTS_SPEC,
  getIslandTierSpec,
} from './ecosystem/BaseAndQuestsDesign.js';
import { EnemyManager } from './entities/EnemyManager.js';
import { PlayerController } from './entities/PlayerController.js';
import { BastionAndNPCs } from './entities/BastionAndNPCs.js';
import { buildCreatureMesh } from './entities/CreatureMeshBuilder.js';
import { HUDManager } from './ui/HUDManager.js';
import { Minimap } from './ui/Minimap.js';
import { SoundManager } from './audio/SoundManager.js';

/**
 * Classe principale d'orchestration d'une session Genesis Bastion.
 */
export class GenesisBastionGame {
  /**
   * Initialise tous les sous-systèmes 3D, écologiques, entités, audio, HUD et l'Onboarding en 7 Actes.
   * @param {Object} [options={}]
   * @param {boolean} [options.startWithTutorial=true] - Démarre en Acte 1 du tutoriel guidé.
   */
  constructor(options = {}) {
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

    // 1B. Moteur Audio Adaptatif Lyria Realtime + Multi-Stem, Voix Gemini TTS & SFX WebAudio
    /** @type {SoundManager} */
    this.sound = new SoundManager();

    // 2. Simulateur d'Écosystème (Jeu de la Vie de Conway + Algorithme Génétique) & Système de Quêtes Dynamiques
    /** @type {EcosystemSimulator} */
    this.ecoSim = new EcosystemSimulator();
    /** @type {DynamicQuestSystem} */
    this.questSystem = new DynamicQuestSystem();

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
    if (typeof this.player.setQuestSystem === 'function') {
      this.player.setQuestSystem(this.questSystem);
    }
    if (this.player && this.player.resources) {
      if (typeof this.player.resources.food !== 'number') {
        this.player.resources.food = CONFIG.PLAYER?.INITIAL_FOOD ?? 60;
      }
      if (typeof this.player.resources.maxFood !== 'number') {
        this.player.resources.maxFood = CONFIG.PLAYER?.MAX_FOOD ?? 150;
      }
    }

    /** @type {BastionAndNPCs} */
    this.bastionAndNpcs = new BastionAndNPCs(
      this.sceneManager.scene,
      this.terrain,
      this.vfx,
      this.ecoSim,
      { tutorialMode: options.startWithTutorial !== false }
    );

    // Rendu immédiat de la frame 0 du monde 3D pour garantir que le canvas WebGL n'est jamais noir
    try {
      this.sceneManager.update(0.016, 0, this.player.position);
    } catch (err) {
      logger.error('RENDER', 'Erreur lors du rendu initial de la scène 3D', {
        error: String(err),
      });
    }

    // 4. Interface Tactique (HUDManager) & Radar Cartographique 2D (Minimap)
    /** @type {HUDManager} */
    this.hud = new HUDManager({
      onForceEcoTick: () => this.forceEcoTick(),
      onSpawnFireTroll: () => this.spawnTestFireTroll(),
      onTriggerSharkLanding: () => this.triggerSharkLanding(),
      onTriggerMoleEruption: () => this.triggerMoleEruption(),
      onReintroducePrey: () => this.handleReintroducePrey(),
      onEquipWeapon: (weaponId) => this.handleEquipElementalWeapon(weaponId),
      onActivateIslandShield: () => this.triggerIslandShieldAndVictory(true),
      onAdvanceNextIsland: () => this.advanceToNextIsland(),
      onAssignRole: (targetRole) => this.handleRoleAssignment(targetRole),
      onBuildStructure: (structId) => this.handleBuildStructure(structId),
      onFocusWorldPos: (wx, wz, lineageId) => this.focusWorldPosition(wx, wz, lineageId),
      onSelectUpgrade: (upgrade) => this.handleSelectUpgrade(upgrade),
      onSkipTutorial: () => this.skipTutorial(),
      onSetCombatMode: (mode) => this.handleSetCombatMode(mode),
      onChangeCombatMode: (mode) => this.handleSetCombatMode(mode),
      onCastSpellSlot: (slotIndex) => this.handleCastSpellSlot(slotIndex),
      onSetScoutMission: (missionType, targetMutationId) =>
        this.handleSetScoutMission(missionType, targetMutationId),
      onTriggerQuestAction: (quest) => this.handleTriggerQuestAction(quest),
      onToggleAudioMute: () => this.sound.toggleMute(),
      onReplayTutorialVoice: (actNum) =>
        this.sound.playTutorialVoice(actNum || this.tutorialAct || 1),
    });
    this.hud.registerExtraUpgrades(DESIGNED_UPGRADES);

    // Initialiser le mode de combat par défaut ('vampire_survivors' avec Lames Orbitales 3D)
    if (this.player && typeof this.player.setCombatMode === 'function') {
      this.player.setCombatMode('vampire_survivors', true);
      this.hud.setCombatMode(this.player.combatMode, false);
    }

    /** @type {Minimap} */
    this.minimap = new Minimap(this.hud.root, {
      onPingWorld: (wx, wz) => {
        this.focusWorldPosition(wx, wz, null);
      },
    });

    // 5. Câblage des callbacks de découverte Éclaireur, d'éradication, de dégâts flottants et de Level-Up
    this._wireGameCallbacks();
    this._ensurePlayerSpatialGuides();

    // 6. État du Tutoriel Guidé en 7 Actes (Onboarding)
    /** @type {boolean} */
    this.tutorialActive = options.startWithTutorial !== false;
    /** @type {number} */
    this.tutorialAct = 1;
    /** @type {string} */
    this.tutorialSubStep = '1A';
    /** @type {boolean} */
    this.ecoPaused = true;
    /** @type {Object} */
    this.tutState = {
      actTimer: 0,
      reachedBeacon: false,
      cameraAdjusted: false,
      usedDashInAct2: false,
      upgradePickedInAct2: false,
      harvestedInAct3: false,
      watchtowerBuiltInAct4: false,
      scoutAssignedInAct5: false,
      codexOpenedInAct6: false,
      spawnedEnemies: [],
      babyTroll: null,
      act7BannerTimer: 0,
    };

    if (this.tutorialActive) {
      this._prepareWorldForTutorialStart();
      this.startTutorialAct(1);
    } else {
      this.skipTutorial();
    }

    // 7. Raccourcis clavier globaux (Tab, P, T, M, G, H, 1-4, F1-F5, Escape)
    this._bindGlobalShortcuts();

    // 8. État de la boucle d'animation & synchronisation initiale HUD + 3D
    /** @type {number} */
    this.lastFrameTime = performance.now();
    /** @type {number} */
    this.elapsedTime = 0;
    /** @type {boolean} */
    this.isRunning = true;

    try {
      this.hud.update({
        sceneManager: this.sceneManager,
        ecoSim: this.ecoSim,
        enemyManager: this.enemyManager,
        player: this.player,
        bastionAndNpcs: this.bastionAndNpcs,
        questSystem: this.questSystem,
        sound: this.sound,
      });
      this.sceneManager.update(0.016, 0, this.player.position);
    } catch (err) {
      logger.error('INIT', 'Erreur lors de la synchronisation initiale HUD/3D', {
        error: String(err),
      });
    }

    logger.info(
      'SYSTEM',
      'Genesis Bastion prêt. Tutoriel Guidé en 7 Actes initialisé (Appuyez sur [P] pour passer).',
      {
        tutorialActive: this.tutorialActive,
        tutorialAct: this.tutorialAct,
        ecoPaused: this.ecoPaused,
      }
    );
  }

  /**
   * Ajoute un anneau discret de portée d'épée et une flèche directionnelle dorée 3D autour du joueur
   * si `PlayerController` n'en possède pas déjà un.
   * @private
   */
  _ensurePlayerSpatialGuides() {
    if (!this.player || !this.player.mesh) return;

    // Anneau au sol indiquant la portée de la Fente Cleave
    if (!this.player.attackRangeRingMesh) {
      const range = this.player.cleaveRange || 5.2;
      const ringGeo = new THREE.RingGeometry(range - 0.12, range, 48);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xe6a145,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.08;
      this.player.mesh.add(ringMesh);
      this.player.attackRangeRingMesh = ringMesh;
    }

    // Flèche directionnelle 3D dorée pointant vers l'objectif actif du tutoriel
    if (!this.player.questArrowMesh) {
      const arrowGroup = new THREE.Group();
      arrowGroup.position.set(0, 0.25, 0);

      const coneGeo = new THREE.ConeGeometry(0.32, 0.85, 6);
      coneGeo.rotateX(Math.PI / 2);
      const coneMat = new THREE.MeshStandardMaterial({
        color: 0xffd166,
        emissive: 0xe6a145,
        emissiveIntensity: 1.4,
        roughness: 0.25,
      });
      const tip = new THREE.Mesh(coneGeo, coneMat);
      tip.position.set(0, 0, 2.25);
      arrowGroup.add(tip);

      this.sceneManager.scene.add(arrowGroup);
      this._fallbackQuestArrow = arrowGroup;
    }
  }

  /**
   * Oriente la flèche directionnelle 3D du joueur et la colonne lumineuse `VFXManager` vers `(tx, tz)`.
   * @param {{x: number, z: number}|null} targetPos
   * @param {number} [colorHex=0xffd166]
   * @private
   */
  _updateTutorialWaypointAndArrow(targetPos, colorHex = 0xffd166) {
    if (typeof this.player?.setQuestTarget === 'function') {
      this.player.setQuestTarget(targetPos);
    }

    if (this._fallbackQuestArrow) {
      if (!targetPos || !this.player) {
        this._fallbackQuestArrow.visible = false;
      } else {
        const dx = targetPos.x - this.player.x;
        const dz = targetPos.z - this.player.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 2.8) {
          this._fallbackQuestArrow.visible = false;
        } else {
          this._fallbackQuestArrow.visible = true;
          const py = this.terrain ? this.terrain.getHeightAt(this.player.x, this.player.z) : this.player.y;
          this._fallbackQuestArrow.position.set(
            this.player.x,
            Math.max(py, CONFIG.WORLD.WATER_LEVEL + 0.15) + 0.35,
            this.player.z
          );
          this._fallbackQuestArrow.rotation.y = Math.atan2(dx, dz);
        }
      }
    }

    if (this.vfx && typeof this.vfx.setTutorialWaypoint === 'function') {
      if (!targetPos) {
        this.vfx.setTutorialWaypoint(null, false, colorHex);
      } else {
        const ty = this.terrain ? this.terrain.getHeightAt(targetPos.x, targetPos.z) : 0;
        this.vfx.setTutorialWaypoint(
          new THREE.Vector3(targetPos.x, Math.max(ty, CONFIG.WORLD.WATER_LEVEL + 0.15), targetPos.z),
          true,
          colorHex
        );
      }
    }
  }

  /**
   * Vide les créatures sauvages, PNJ initiaux et cages pré-générées pour que l'Acte 1 démarre
   * dans un sanctuaire calme et maîtrisé (`0` monstre, `0` PNJ, `0` cage, `ecoPaused = true`).
   * @private
   */
  _prepareWorldForTutorialStart() {
    this.ecoPaused = true;
    this.enemyManager.ecoPaused = true;

    // Retirer tout ennemi éventuel
    if (Array.isArray(this.enemyManager.enemies)) {
      for (const e of this.enemyManager.enemies) {
        if (e.mesh && this.sceneManager.scene) {
          this.sceneManager.scene.remove(e.mesh);
        }
      }
      this.enemyManager.enemies.length = 0;
    }

    // Retirer les PNJ et cages initiaux si BastionAndNPCs les a créés par défaut
    if (this.bastionAndNpcs) {
      if (typeof this.bastionAndNpcs.enterTutorialMode === 'function') {
        this.bastionAndNpcs.enterTutorialMode();
      } else {
        if (Array.isArray(this.bastionAndNpcs.npcs)) {
          for (const npc of this.bastionAndNpcs.npcs) {
            if (npc.mesh && this.sceneManager.scene) {
              this.sceneManager.scene.remove(npc.mesh);
            }
          }
          this.bastionAndNpcs.npcs.length = 0;
        }
        if (Array.isArray(this.bastionAndNpcs.cages)) {
          for (const cage of this.bastionAndNpcs.cages) {
            if (cage.mesh && this.sceneManager.scene) {
              this.sceneManager.scene.remove(cage.mesh);
            }
          }
          this.bastionAndNpcs.cages.length = 0;
        }
        this.bastionAndNpcs.rescuedCount = 0;
      }
    }
  }

  /**
   * Crée une cage de prisonnier de tutoriel aux coordonnées `(x, z)` avec le rôle demandé.
   * @param {number} x
   * @param {number} z
   * @param {'harvester'|'scout'|'guard'} [role='harvester']
   * @param {string} [id='cage_tut']
   * @returns {Object}
   * @private
   */
  _spawnTutorialCageAt(x, z, role = 'harvester', id = 'cage_tut') {
    if (this.bastionAndNpcs && typeof this.bastionAndNpcs.spawnCageAt === 'function') {
      return this.bastionAndNpcs.spawnCageAt(x, z, role, id);
    }

    const y = this.terrain ? this.terrain.getHeightAt(x, z) : 0;
    let mesh = null;
    if (this.sceneManager?.scene) {
      mesh = new THREE.Group();
      mesh.position.set(x, Math.max(y, CONFIG.WORLD.WATER_LEVEL + 0.2), z);

      const ironMat = new THREE.MeshStandardMaterial({
        color: 0x2f3640,
        roughness: 0.4,
        metalness: 0.8,
      });
      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0x00d8ff,
        emissive: 0x00a8ff,
        emissiveIntensity: 1.8,
      });

      const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 2.2), ironMat);
      basePlinth.position.y = 0.12;
      const topFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 2.2), ironMat);
      topFrame.position.y = 2.35;
      mesh.add(basePlinth, topFrame);

      for (let b = 0; b < 8; b++) {
        const ba = (b / 8) * Math.PI * 2;
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), ironMat);
        bar.position.set(Math.cos(ba) * 0.95, 1.25, Math.sin(ba) * 0.95);
        bar.castShadow = true;
        mesh.add(bar);
      }

      const captiveMesh = buildCreatureMesh({ type: 'npc', role });
      captiveMesh.scale.setScalar(0.85);
      mesh.add(captiveMesh);

      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), beaconMat);
      crystal.position.y = 3.1;
      mesh.userData.crystal = crystal;
      mesh.add(crystal);

      this.sceneManager.scene.add(mesh);
    }

    const cageObj = {
      id,
      x,
      z,
      y,
      role,
      rescued: false,
      mesh,
    };
    this.bastionAndNpcs.cages.push(cageObj);
    return cageObj;
  }

  /**
   * Fait apparaître une créature spécifique pour une étape du tutoriel.
   * @param {Object} spec
   * @returns {Object} Ennemi créé.
   * @private
   */
  _spawnTutorialCreature(spec = {}) {
    const speciesId = spec.speciesId || 'goblin';
    const genome = this.enemyManager._createSafeGenome(speciesId);
    if (spec.mutationId) {
      this.enemyManager._applyMutationToGenome(genome, spec.mutationId);
      genome.isPatientZero = Boolean(spec.isPatientZero);
    }
    const enemy = this.enemyManager.spawnEnemy(spec.x || 0, spec.z || 0, genome, [], {
      isPatientZero: Boolean(spec.isPatientZero),
      lifeStage: spec.lifeStage || 'adult',
      isAdult: spec.isAdult !== undefined ? spec.isAdult : true,
      maturationTime: spec.maturationTime || 36,
      age: 0,
    });

    if (typeof spec.hp === 'number') {
      enemy.hp = spec.hp;
      enemy.maxHp = spec.hp;
    }
    if (typeof spec.damage === 'number') {
      enemy.damage = spec.damage;
    }
    if (typeof spec.speed === 'number') {
      enemy.speed = spec.speed;
    }
    if (spec.forceChaseBastion) {
      enemy.homeX = 0;
      enemy.homeZ = 0;
      enemy.starving = true;
    }

    if (this.vfx && typeof this.vfx.spawnBirthEffect === 'function') {
      this.vfx.spawnBirthEffect(
        new THREE.Vector3(enemy.x, enemy.y + 0.5, enemy.z),
        Boolean(spec.mutationId),
        false,
        spec.mutationId ? 0xff4500 : 0x44ff88
      );
    }

    return enemy;
  }

  /**
   * Démarre un Acte spécifique (`1..7`) du Tutoriel Guidé Interactif.
   * Déverrouille progressivement les panneaux du HUD correspondants et initialise les cibles 3D.
   *
   * @param {number} actNumber - Numéro de l'acte (`1..7`).
   */
  startTutorialAct(actNumber) {
    const act = getOnboardingAct(actNumber);
    if (!act) return;

    this.tutorialAct = act.actNumber;
    this.tutState.actTimer = 0;
    this.tutState.spawnedEnemies = [];
    this.hud.setTutorialHighlight(null);

    // Appliquer le dévoilement progressif du HUD
    this.hud.setHudVisibility(act.unlockedHud, this.minimap);
    logOnboardingTransition(act.actNumber, `Début de l'Acte ${act.actNumber}`);

    if (act.actNumber === 1) {
      this.tutorialSubStep = '1A';
      this.ecoPaused = true;
      this.enemyManager.ecoPaused = true;
      this.tutState.reachedBeacon = false;
      this.tutState.cameraAdjusted = false;
      this.sceneManager.hasZoomed = false;
      this.sceneManager.hasRotatedCamera = false;
      this._updateTutorialWaypointAndArrow({ x: 0, z: 12 }, 0xffd166);
    } else if (act.actNumber === 2) {
      this.tutorialSubStep = '2A';
      this.tutState.usedDashInAct2 = false;
      this.tutState.upgradePickedInAct2 = false;
      const goblin =
        typeof this.enemyManager.spawnTutorialGoblin === 'function'
          ? this.enemyManager.spawnTutorialGoblin(10, 10)
          : this._spawnTutorialCreature({
              speciesId: 'goblin',
              x: 10,
              z: 10,
              hp: 36,
              damage: 5,
              speed: 5.2,
            });
      this.tutState.spawnedEnemies = [goblin];
      this._updateTutorialWaypointAndArrow({ x: goblin.x, z: goblin.z }, 0xff4757);
    } else if (act.actNumber === 3) {
      this.tutorialSubStep = '3A';
      this.tutState.harvestedInAct3 = false;
      if (typeof this.bastionAndNpcs.spawnTutorialCage1 === 'function') {
        this.bastionAndNpcs.spawnTutorialCage1(20, 20, this.enemyManager);
      } else {
        this._spawnTutorialCageAt(20, 20, 'harvester', 'cage_tut_1');
        const wolf = this._spawnTutorialCreature({
          speciesId: 'wolf',
          x: 22,
          z: 18,
          hp: 48,
          damage: 8,
          speed: 6.8,
        });
        this.tutState.spawnedEnemies = [wolf];
      }
      this._updateTutorialWaypointAndArrow({ x: 20, z: 20 }, 0x00d8ff);
    } else if (act.actNumber === 4) {
      this.tutorialSubStep = '4A';
      this.tutState.watchtowerBuiltInAct4 = false;
      // Garantir que le joueur a assez de Bois (25) et Cristal (10) pour bâtir la Tour de Guet
      if (this.player && this.player.resources) {
        this.player.resources.wood = Math.max(this.player.resources.wood, 30);
        this.player.resources.crystal = Math.max(this.player.resources.crystal, 15);
      }
      this.hud.setTutorialHighlight('watchtower');
      this._updateTutorialWaypointAndArrow({ x: 0, z: 0 }, 0xe6a145);
    } else if (act.actNumber === 5) {
      this.tutorialSubStep = '5A';
      this.tutState.scoutAssignedInAct5 = false;
      if (typeof this.bastionAndNpcs.spawnTutorialCage2 === 'function') {
        this.bastionAndNpcs.spawnTutorialCage2(0, -38);
      } else {
        this._spawnTutorialCageAt(0, -38, 'harvester', 'cage_tut_2');
      }
      const orcGuard = this._spawnTutorialCreature({
        speciesId: 'orc',
        x: 3,
        z: -35,
        hp: 65,
        damage: 9,
        speed: 5.6,
      });
      this.tutState.spawnedEnemies = [orcGuard];
      this._updateTutorialWaypointAndArrow({ x: 0, z: -38 }, 0x00d8ff);
    } else if (act.actNumber === 6) {
      this.tutorialSubStep = '6A';
      this.tutState.codexOpenedInAct6 = false;
      const babyTroll =
        typeof this.enemyManager.spawnTutorialBabyFireTroll === 'function'
          ? this.enemyManager.spawnTutorialBabyFireTroll(46, -46)
          : this._spawnTutorialCreature({
              speciesId: 'troll',
              mutationId: 'pyro_gland',
              isPatientZero: true,
              lifeStage: 'baby',
              isAdult: false,
              x: 46,
              z: -46,
              hp: 88,
              damage: 9,
              speed: 4.5,
              maturationTime: 40,
            });
      this.tutState.babyTroll = babyTroll;
      this.tutState.spawnedEnemies = [babyTroll];

      // Diriger l'Éclaireur directement vers le secteur Nord-Est (46, -46) pour qu'il le repère rapidement
      const scouts = this.bastionAndNpcs.getScouts ? this.bastionAndNpcs.getScouts() : [];
      for (const s of scouts) {
        s.targetX = 42;
        s.targetZ = -42;
        s.waypointTimer = 20;
      }
      this._updateTutorialWaypointAndArrow({ x: babyTroll.x, z: babyTroll.z }, 0xff4757);
    } else if (act.actNumber === 7) {
      this.tutorialSubStep = '7A';
      this.ecoPaused = false;
      this.enemyManager.ecoPaused = false;
      this.tutState.act7BannerTimer = 10.0;
      this._updateTutorialWaypointAndArrow(null);

      // Activer le mode Survie Ouvert complet (cages restantes + 42 créatures sauvages)
      if (typeof this.bastionAndNpcs.startOpenSurvivalMode === 'function') {
        this.bastionAndNpcs.startOpenSurvivalMode();
      } else if (this.bastionAndNpcs && this.bastionAndNpcs.cages.length < 6) {
        this.bastionAndNpcs._spawnPrisonerCages();
      }
      if (typeof this.enemyManager.startOpenSurvivalMode === 'function') {
        this.enemyManager.startOpenSurvivalMode(CONFIG.ECO?.INITIAL_POPULATION || 42);
      } else if (this.enemyManager.getEnemies().length < 15) {
        this.enemyManager.spawnInitialPopulation(CONFIG.ECO?.INITIAL_POPULATION || 42);
      }
      this._ensurePhase7EcosystemPopulated();
      this.ecoSim.stepEcoTick(this.enemyManager.getEnemies(), (x, z) =>
        this.terrain.getBiomeAt(x, z)
      );
    }

    // Déclencher le doublage vocal français Gemini TTS correspondant à l'Acte (Aldric Actes 1-4 / Kaelen Actes 5-7)
    if (this.sound && typeof this.sound.playTutorialVoice === 'function') {
      this.sound.playTutorialVoice(act.actNumber);
    }

    this._refreshOnboardingBannerUI();
  }

  /**
   * Garantit la présence des troupeaux d'herbivores (`deer`, `rabbit`) et des Requins au large (`shark`)
   * lors de l'activation du mode Survie Ouvert (Phase 7).
   * @private
   */
  _ensurePhase7EcosystemPopulated() {
    if (!this.enemyManager || typeof this.enemyManager._spawnSingleCreature !== 'function') return;
    const enemies = this.enemyManager.getEnemies();
    const deerCount = enemies.filter((e) => e && e.hp > 0 && e.genome?.speciesId === 'deer').length;
    const rabbitCount = enemies.filter((e) => e && e.hp > 0 && e.genome?.speciesId === 'rabbit').length;
    const sharkCount = enemies.filter((e) => e && e.hp > 0 && e.genome?.speciesId === 'shark').length;

    if (deerCount < 3) {
      const toSpawn = 5 - deerCount;
      for (let i = 0; i < toSpawn; i++) {
        const a = (i / Math.max(1, toSpawn)) * Math.PI * 2 + 0.4;
        const d = this.enemyManager._spawnSingleCreature('deer', Math.cos(a) * 34, Math.sin(a) * 34);
        if (d) {
          d.aggroStance = 'prey_pacifist';
          d.damage = 0;
        }
      }
    }
    if (rabbitCount < 3) {
      const toSpawn = 6 - rabbitCount;
      for (let i = 0; i < toSpawn; i++) {
        const a = (i / Math.max(1, toSpawn)) * Math.PI * 2 + 1.1;
        const r = this.enemyManager._spawnSingleCreature('rabbit', Math.cos(a) * 26, Math.sin(a) * 26);
        if (r) {
          r.aggroStance = 'prey_pacifist';
          r.damage = 0;
        }
      }
    }
    if (sharkCount === 0) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.25;
        const s = this.enemyManager._spawnSingleCreature('shark', Math.cos(a) * 112, Math.sin(a) * 112);
        if (s) {
          s.isAquatic = true;
          s.hasLandedOnBeach = false;
        }
      }
    }
  }

  /**
   * Passe immédiatement le tutoriel, déverrouille l'intégralité du HUD (`FULL_UNLOCKED_HUD`),
   * active l'horloge écologique et génère la population complète de l'île.
   */
  skipTutorial() {
    this.tutorialActive = false;
    this.tutorialAct = 7;
    this.ecoPaused = false;
    this.enemyManager.ecoPaused = false;

    if (this.sound && typeof this.sound.stopVoice === 'function') {
      this.sound.stopVoice();
    }

    this.hud.setTutorialHighlight(null);
    this.hud.setHudVisibility(FULL_UNLOCKED_HUD, this.minimap);
    this.hud.hideOnboardingBanner();
    this.hud.updateContextualPrompt(null);
    this._updateTutorialWaypointAndArrow(null);

    if (typeof this.bastionAndNpcs?.startOpenSurvivalMode === 'function') {
      this.bastionAndNpcs.startOpenSurvivalMode();
    } else if (this.bastionAndNpcs) {
      const counts = this.bastionAndNpcs.getRoleCounts();
      if (counts.harvester === 0) {
        this.bastionAndNpcs.spawnNpc('harvester', -3.5, -2.5);
      }
      if (counts.scout === 0) {
        this.bastionAndNpcs.spawnNpc('scout', 4.0, -3.0);
      }
      if (this.bastionAndNpcs.cages.length < 3) {
        this.bastionAndNpcs._spawnPrisonerCages();
      }
    }

    if (typeof this.enemyManager?.startOpenSurvivalMode === 'function') {
      this.enemyManager.startOpenSurvivalMode(CONFIG.ECO?.INITIAL_POPULATION || 42);
    } else if (this.enemyManager.getEnemies().length < 15) {
      this.enemyManager.spawnInitialPopulation(CONFIG.ECO?.INITIAL_POPULATION || 42);
    }
    this._ensurePhase7EcosystemPopulated();
    this.ecoSim.stepEcoTick(this.enemyManager.getEnemies(), (x, z) =>
      this.terrain.getBiomeAt(x, z)
    );

    logger.info(
      'SYSTEM',
      'Tutoriel terminé / passé : tous les panneaux du HUD et l’écosystème génétique complet sont actifs !',
      {
        population: this.enemyManager.getEnemies().length,
        scouts: this.bastionAndNpcs.getRoleCounts()?.scout ?? 1,
      }
    );
  }

  /**
   * Met à jour l'état du Tutoriel Guidé en 7 Actes et les bulles d'actions contextuelles 3D->2D à chaque frame.
   * @param {number} dt
   * @private
   */
  _updateTutorialAndWorldPrompts(dt) {
    // 1. Mise à jour de la bulle d'action contextuelle 3D -> 2D au-dessus de la cible la plus proche
    this._updateContextualScreenPrompt();

    if (!this.tutorialActive) return;

    this.tutState.actTimer += dt;

    // Pendant les Actes 1 à 6, maintenir l'Eco-Tick en pause pour laisser le joueur apprendre à son rythme
    if (this.ecoPaused) {
      this.enemyManager.ecoTickTimer = 0;
      this.enemyManager.timeUntilNextTick = this.enemyManager.ecoTickInterval;
      this.enemyManager.ecoTickProgress = 0;
    }

    // Acte 1 : Marche vers la balise dorée (0, 12) + Caméra
    if (this.tutorialAct === 1) {
      const dBeacon = dist2D(this.player.x, this.player.z, 0, 12);
      if (dBeacon <= 4.5) {
        this.tutState.reachedBeacon = true;
      }
      if (
        this.sceneManager.hasZoomed ||
        this.sceneManager.hasRotatedCamera ||
        (this.tutState.reachedBeacon && this.tutState.actTimer >= 4.0)
      ) {
        this.tutState.cameraAdjusted = true;
      }

      if (this.tutState.reachedBeacon && this.tutState.cameraAdjusted) {
        this.startTutorialAct(2);
        return;
      }
    }

    // Acte 2 : 2A (Gobelin Égaré) -> 2B (Esquive Shift + Orc Maraudeur) -> 2C (Carte Roguelike Niv. 2)
    else if (this.tutorialAct === 2) {
      if (this.player.dashTimer > 0 || (this.player.dashCount || 0) > 0) {
        this.tutState.usedDashInAct2 = true;
      }

      const aliveTutEnemies = this.tutState.spawnedEnemies.filter(
        (e) => e && e.hp > 0 && this.enemyManager.enemies.includes(e)
      );

      if (this.tutorialSubStep === '2A') {
        if (aliveTutEnemies.length > 0) {
          this._updateTutorialWaypointAndArrow(
            { x: aliveTutEnemies[0].x, z: aliveTutEnemies[0].z },
            0xff4757
          );
        } else {
          // Gobelin vaincu -> Passer à 2B (Orc Maraudeur)
          this.tutorialSubStep = '2B';
          const orc =
            typeof this.enemyManager.spawnTutorialOrc === 'function'
              ? this.enemyManager.spawnTutorialOrc(13, -9)
              : this._spawnTutorialCreature({
                  speciesId: 'orc',
                  x: 13,
                  z: -9,
                  hp: 68,
                  damage: 9,
                  speed: 5.6,
                });
          this.tutState.spawnedEnemies = [orc];
          this._updateTutorialWaypointAndArrow({ x: orc.x, z: orc.z }, 0xff4757);
        }
      } else if (this.tutorialSubStep === '2B') {
        if (aliveTutEnemies.length > 0) {
          this._updateTutorialWaypointAndArrow(
            { x: aliveTutEnemies[0].x, z: aliveTutEnemies[0].z },
            0xff4757
          );
        } else {
          // Orc vaincu -> Garantir le passage au Niveau 2 et ouvrir les 3 cartes Roguelike (2C)
          this.tutorialSubStep = '2C';
          this._updateTutorialWaypointAndArrow(null);
          if (this.player.level < 2) {
            const needed = Math.max(10, this.player.nextLevelXp - this.player.xp + 5);
            this.player.gainXp(needed);
          } else if (!this.hud.isLevelUpOpen && !this.tutState.upgradePickedInAct2) {
            this.hud.showLevelUpModal(null, (upgrade) => this.handleSelectUpgrade(upgrade));
          }
        }
      } else if (this.tutorialSubStep === '2C') {
        if (this.tutState.upgradePickedInAct2 || this.player.upgrades.length > 0) {
          this.startTutorialAct(3);
          return;
        }
      }
    }

    // Acte 3 : 3A (Secourir Cage #1 à (20, 20)) -> débloque panneau Bastion -> 3B (Récolter ressource [E])
    else if (this.tutorialAct === 3) {
      if (this.tutorialSubStep === '3A') {
        if (this.bastionAndNpcs.rescuedCount >= 1) {
          this.tutorialSubStep = '3B';
          // Déverrouiller immédiatement le Panneau Gauche du Bastion avec illumination dorée !
          const act3 = getOnboardingAct(3);
          this.hud.setHudVisibility(act3.unlockedHud, this.minimap);

          const nearNode =
            this.terrain && typeof this.terrain.getNearestResourceNode === 'function'
              ? this.terrain.getNearestResourceNode(this.player.x, this.player.z, 90)
              : null;
          if (nearNode) {
            this._updateTutorialWaypointAndArrow({ x: nearNode.x, z: nearNode.z }, 0x38c172);
          } else {
            this._updateTutorialWaypointAndArrow({ x: 14, z: 14 }, 0x38c172);
          }
        } else {
          this._updateTutorialWaypointAndArrow({ x: 20, z: 20 }, 0x00d8ff);
        }
      } else if (this.tutorialSubStep === '3B') {
        if (this.tutState.harvestedInAct3 || (this.player.harvestCount || 0) >= 1) {
          this.startTutorialAct(4);
          return;
        }
      }
    }

    // Acte 4 : 4A (Construire Tour de Guet) -> 4B (Repousser les 2 Gobelins Pillards)
    else if (this.tutorialAct === 4) {
      if (this.tutorialSubStep === '4A') {
        if (this.tutState.watchtowerBuiltInAct4) {
          this.tutorialSubStep = '4B';
          this.hud.setTutorialHighlight(null);
          if (typeof this.enemyManager.spawnTutorialRaiders === 'function') {
            this.tutState.spawnedEnemies = this.enemyManager.spawnTutorialRaiders();
          } else {
            const raider1 = this._spawnTutorialCreature({
              speciesId: 'goblin',
              x: -22,
              z: 16,
              hp: 40,
              damage: 6,
              speed: 6.2,
              forceChaseBastion: true,
            });
            const raider2 = this._spawnTutorialCreature({
              speciesId: 'goblin',
              x: -19,
              z: 21,
              hp: 40,
              damage: 6,
              speed: 6.2,
              forceChaseBastion: true,
            });
            this.tutState.spawnedEnemies = [raider1, raider2];
          }
          if (this.tutState.spawnedEnemies[0]) {
            this._updateTutorialWaypointAndArrow(
              { x: this.tutState.spawnedEnemies[0].x, z: this.tutState.spawnedEnemies[0].z },
              0xff4757
            );
          }
        }
      } else if (this.tutorialSubStep === '4B') {
        const aliveRaiders = this.tutState.spawnedEnemies.filter(
          (e) => e && e.hp > 0 && this.enemyManager.enemies.includes(e)
        );
        if (aliveRaiders.length > 0) {
          this._updateTutorialWaypointAndArrow(
            { x: aliveRaiders[0].x, z: aliveRaiders[0].z },
            0xff4757
          );
        } else {
          this.startTutorialAct(5);
          return;
        }
      }
    }

    // Acte 5 : 5A (Libérer Cage #2 au Nord (0, -38)) -> débloque Éclaireurs + Minimap -> 5B (Cliquer [+ Éclaireur])
    else if (this.tutorialAct === 5) {
      if (this.tutorialSubStep === '5A') {
        if (this.bastionAndNpcs.rescuedCount >= 2) {
          this.tutorialSubStep = '5B';
          const act5 = getOnboardingAct(5);
          this.hud.setHudVisibility(act5.unlockedHud, this.minimap);
          this.hud.setTutorialHighlight('scout');
          this._updateTutorialWaypointAndArrow(null);
        } else {
          this._updateTutorialWaypointAndArrow({ x: 0, z: -38 }, 0x00d8ff);
        }
      } else if (this.tutorialSubStep === '5B') {
        const scoutCount = this.bastionAndNpcs.getRoleCounts()?.scout || 0;
        if (this.tutState.scoutAssignedInAct5 || scoutCount >= 1) {
          this.hud.setTutorialHighlight(null);
          this.startTutorialAct(6);
          return;
        }
      }
    }

    // Acte 6 : 6A (Éclaireur repère Bébé Troll de Feu Patient Zéro -> Éradiquer avant âge adulte) -> 6B (Ouvrir Codex [Tab])
    else if (this.tutorialAct === 6) {
      if (this.tutorialSubStep === '6A') {
        const baby = this.tutState.babyTroll;
        const isAlive = baby && baby.hp > 0 && this.enemyManager.enemies.includes(baby);
        if (isAlive) {
          // Plafonner la maturation à 80% pendant le tutoriel pour garantir que le joueur expérimente la fenêtre Juvénile
          const maxTutAge = (baby.maturationTime || 40) * 0.8;
          if (baby.age > maxTutAge) {
            baby.age = maxTutAge;
          }
          // Si l'Éclaireur met plus de 3.5s à l'atteindre, déclencher le repérage automatiquement
          if (!baby.spottedByScout && this.tutState.actTimer > 3.5) {
            const scouts = this.bastionAndNpcs.getScouts ? this.bastionAndNpcs.getScouts() : [];
            const scout = scouts[0] || { id: 'npc_scout', name: 'Kaelen' };
            baby.spottedByScout = true;
            if (this.ecoSim && typeof this.ecoSim.markMutationDiscovered === 'function') {
              this.ecoSim.markMutationDiscovered('pyro_gland', baby.id);
            }
            if (this.vfx && typeof this.vfx.setPatientZeroBeacon === 'function' && baby.mesh) {
              this.vfx.setPatientZeroBeacon(baby.id, baby.mesh.position, 0xff4500, true);
            }
            this.handleScoutDiscovery({
              scout,
              enemy: baby,
              mutations: ['pyro_gland'],
              isHybrid: false,
              speciesName: baby.genome?.speciesName || 'Troll',
              lifeStage: 'baby',
              isAdult: false,
            });
          }
          this._updateTutorialWaypointAndArrow({ x: baby.x, z: baby.z }, 0xff4757);
        } else {
          // Bébé Troll de Feu Patient Zéro éradiqué ! Passer à 6B (Ouvrir Codex Phylogénétique [Tab])
          this.tutorialSubStep = '6B';
          this._updateTutorialWaypointAndArrow(null);
          this.hud.setTutorialHighlight('codex');
        }
      } else if (this.tutorialSubStep === '6B') {
        if (this.hud.isCodexOpen || this.tutState.codexOpenedInAct6) {
          this.hud.setTutorialHighlight(null);
          this.startTutorialAct(7);
          return;
        }
      }
    }

    // Acte 7 : Célébration finale puis masquage automatique de la bannière de tutoriel
    else if (this.tutorialAct === 7) {
      this.tutState.act7BannerTimer -= dt;
      if (this.tutState.act7BannerTimer <= 0) {
        this.tutorialActive = false;
        this.hud.hideOnboardingBanner();
        return;
      }
    }

    this._refreshOnboardingBannerUI();
  }

  /**
   * Synchronise le texte, les badges de touches et la barre de progression de la bannière d'Onboarding.
   * @private
   */
  _refreshOnboardingBannerUI() {
    if (!this.tutorialActive) {
      this.hud.hideOnboardingBanner();
      return;
    }

    const act = getOnboardingAct(this.tutorialAct);
    if (!act) return;

    let objectiveText = act.objectiveLabel;
    let progressText = 'En cours';
    let isCompleted = false;

    if (this.tutorialAct === 1) {
      const doneCount = (this.tutState.reachedBeacon ? 1 : 0) + (this.tutState.cameraAdjusted ? 1 : 0);
      objectiveText = !this.tutState.reachedBeacon
        ? 'Marchez jusqu’à la balise dorée au Sud du Bastion (0, 12)'
        : 'Tournez la caméra (Clic Droit / Q-E) ou zoomez (Molette)';
      progressText = `${doneCount} / 2`;
    } else if (this.tutorialAct === 2) {
      if (this.tutorialSubStep === '2A') {
        objectiveText = 'Éliminez le Gobelin Égaré avec votre Fente Cleave [Clic Gauche / Espace]';
        progressText = 'Étape 1 / 3';
      } else if (this.tutorialSubStep === '2B') {
        objectiveText = 'Esquivez [Shift] et éliminez l’Orc Maraudeur à l’Est';
        progressText = 'Étape 2 / 3';
      } else {
        objectiveText = 'Choisissez votre 1re Adaptation Roguelike dans la fenêtre de Niveau 2';
        progressText = 'Étape 3 / 3';
      }
    } else if (this.tutorialAct === 3) {
      if (this.tutorialSubStep === '3A') {
        objectiveText = 'Éliminez le Loup et libérez la Cage de Survivant au Sud-Est (20, 20) avec [E]';
        progressText = '0 / 1 Survivant';
      } else {
        objectiveText = 'Approchez d’un arbre ou cristal proche et appuyez sur [E] pour récolter';
        progressText = '1 / 2 · Récolte [E]';
      }
    } else if (this.tutorialAct === 4) {
      if (this.tutorialSubStep === '4A') {
        objectiveText = 'Cliquez sur [🗼 Tour de Guet] dans le panneau gauche (ou touche [1])';
        progressText = '0 / 1 Tour bâtie';
      } else {
        const alive = this.tutState.spawnedEnemies.filter(
          (e) => e && e.hp > 0 && this.enemyManager.enemies.includes(e)
        ).length;
        objectiveText = 'Repoussez les 2 Gobelins Pillards avec l’aide de votre Tour de Guet';
        progressText = `${2 - alive} / 2 Pillards vaincus`;
      }
    } else if (this.tutorialAct === 5) {
      if (this.tutorialSubStep === '5A') {
        objectiveText = 'Libérez le second survivant de la cage au Nord (0, -38) avec [E]';
        progressText = 'Étape 1 / 2';
      } else {
        objectiveText = 'Cliquez sur le bouton illuminé [+ Éclaireur] dans le panneau gauche';
        progressText = 'Étape 2 / 2';
      }
    } else if (this.tutorialAct === 6) {
      if (this.tutorialSubStep === '6A') {
        objectiveText =
          'Traquez et éliminez le Bébé Troll de Feu [Patient Zéro] au Nord-Est (46, -46) avant son âge adulte !';
        progressText = 'Patient Zéro Juvénile 🐣';
      } else {
        objectiveText = 'Appuyez sur [Tab] (ou le bouton Codex) pour inspecter l’Arbre Phylogénétique';
        progressText = 'Ouvrir Codex [Tab]';
      }
    } else if (this.tutorialAct === 7) {
      objectiveText =
        'Écosystème Darwinien éveillé ! Protégez le Bastion et traquez les futurs Patients Zéro.';
      progressText = 'Complété ✓';
      isCompleted = true;
    }

    this.hud.updateOnboardingBanner({
      visible: true,
      actNumber: act.actNumber,
      subStep: this.tutorialSubStep,
      totalActs: ONBOARDING_ACTS.length,
      stepLabel: `ACTE ${act.actNumber} / ${ONBOARDING_ACTS.length} — ${act.timeWindow}`,
      title: act.title,
      instructionText: act.instructionText,
      whyItMatters: act.whyItMatters,
      keyBadges: act.keyBadges,
      objectiveText,
      progressText,
      isCompleted,
    });
  }

  /**
   * Calcule et affiche la bulle d'action contextuelle 3D -> 2D (`[E : Libérer]`, `[Clic Gauche : Frapper]`, `[E : Récolter]`)
   * projetée au-dessus de l'entité interactive la plus proche du joueur.
   * @private
   */
  _updateContextualScreenPrompt() {
    if (!this.player || !this.sceneManager || typeof this.sceneManager.worldToScreen !== 'function') {
      return;
    }

    const px = this.player.x;
    const pz = this.player.z;

    // 0A. Monolithe de Relique Ancienne non collecté à proximité (<= 9.5m)
    if (this.bastionAndNpcs && typeof this.bastionAndNpcs.getNearestRelicShrine === 'function') {
      const relic = this.bastionAndNpcs.getNearestRelicShrine(px, pz, 9.5);
      if (relic) {
        const nextCount = (this.bastionAndNpcs.collectedRelicFragments || 0) + 1;
        const maxCount = this.bastionAndNpcs.maxRelicFragments || 3;
        const screenPos = this.sceneManager.worldToScreen(
          new THREE.Vector3(relic.x, relic.y || 0, relic.z),
          3.4
        );
        this.hud.updateContextualPrompt(
          screenPos,
          'E',
          `🏛️ Collecter ${relic.name} (${nextCount}/${maxCount} Reliques)`,
          'prompt-rescue'
        );
        return;
      }
    }

    // 0B. Sanctuaire d'Arme Élémentaire à proximité (<= 8.5m)
    if (this.bastionAndNpcs && typeof this.bastionAndNpcs.getNearestWeaponShrine === 'function') {
      const shrine = this.bastionAndNpcs.getNearestWeaponShrine(px, pz, 8.5);
      if (shrine) {
        const wSpec = getElementalWeaponSpec(shrine.weaponId);
        const screenPos = this.sceneManager.worldToScreen(
          new THREE.Vector3(shrine.x, shrine.y || 0, shrine.z),
          3.0
        );
        this.hud.updateContextualPrompt(
          screenPos,
          'E',
          `⚔️ Forger & Équiper : ${wSpec.icon} ${wSpec.shortName}`,
          'prompt-build'
        );
        return;
      }
    }

    // 1. Cage de prisonnier verrouillée à proximité (<= 9.5m)
    const cages = this.bastionAndNpcs?.cages || [];
    for (const cage of cages) {
      if (!cage || cage.rescued) continue;
      const d = dist2D(px, pz, cage.x, cage.z);
      if (d <= 9.5) {
        const screenPos = this.sceneManager.worldToScreen(
          new THREE.Vector3(cage.x, cage.y || 0, cage.z),
          3.4
        );
        this.hud.updateContextualPrompt(screenPos, 'E', 'Libérer le Survivant', 'prompt-rescue');
        return;
      }
    }

    // 1B. Dragon Souverain à proximité (<= 14.0m) : Avertissement royal Pacifique ou Alerte Courroux Draconique
    const enemies = this.enemyManager?.getEnemies ? this.enemyManager.getEnemies() : [];
    let nearestDragon = null;
    let minDragonDist = 14.0;
    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      if (e.genome?.speciesId !== 'dragon' && e.aggroStance !== 'pacifist_apex') continue;
      const d = dist2D(px, pz, e.x, e.z);
      if (d < minDragonDist) {
        minDragonDist = d;
        nearestDragon = e;
      }
    }
    if (nearestDragon) {
      const screenPos = this.sceneManager.worldToScreen(
        new THREE.Vector3(nearestDragon.x, nearestDragon.y || 0, nearestDragon.z),
        3.4
      );
      const isDragonProvoked =
        Boolean(nearestDragon.enraged) ||
        nearestDragon.state === 'wrath_raid' ||
        (typeof this.enemyManager?.isSpeciesProvoked === 'function' &&
          this.enemyManager.isSpeciesProvoked('dragon'));
      const hpRounded = Math.round(nearestDragon.hp || nearestDragon.maxHp || 680);

      if (!isDragonProvoked) {
        this.hud.updateContextualPrompt(
          screenPos,
          '⚠️ PACIFIQUE',
          `[DRAGON SOUVERAIN — ${hpRounded} PV] Ne l'attaquez pas ou TOUTE l'espèce rasera votre Bastion !`,
          'prompt-dragon-peaceful'
        );
      } else {
        this.hud.updateContextualPrompt(
          screenPos,
          '🔥 COURROUX',
          `[DRAGON ENRAGÉ — ${hpRounded} PV] Toute l'espèce converge vers le Bastion !`,
          'prompt-dragon-wrath'
        );
      }
      return;
    }

    // 2. Ennemi à portée de combat (<= 8.0m)
    let nearestEnemy = null;
    let minEnemyDist = 8.0;
    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      const d = dist2D(px, pz, e.x, e.z);
      if (d < minEnemyDist) {
        minEnemyDist = d;
        nearestEnemy = e;
      }
    }
    if (nearestEnemy) {
      const screenPos = this.sceneManager.worldToScreen(
        new THREE.Vector3(nearestEnemy.x, nearestEnemy.y || 0, nearestEnemy.z),
        2.6
      );
      if (this.tutorialActive && this.tutorialAct === 2 && this.tutorialSubStep === '2B' && !this.tutState.usedDashInAct2) {
        this.hud.updateContextualPrompt(screenPos, 'Shift', 'Esquiver puis Frapper', 'prompt-combat');
      } else {
        this.hud.updateContextualPrompt(
          screenPos,
          'Clic Gauche / Espace',
          `Frapper ${nearestEnemy.genome?.speciesName || 'Ennemi'}`,
          'prompt-combat'
        );
      }
      return;
    }

    // 3. Socle de Bâtiment 3D du Bastion à proximité (<= 4.8m)
    if (this.bastionAndNpcs && typeof this.bastionAndNpcs.getNearestBuildingPad === 'function') {
      const pad = this.bastionAndNpcs.getNearestBuildingPad(px, pz, 4.8, this.player?.resources);
      if (pad && !pad.isMaxLevel) {
        const py = this.terrain ? this.terrain.getHeightAt(pad.x, pad.z) : 0;
        const screenPos = this.sceneManager.worldToScreen(
          new THREE.Vector3(pad.x, py, pad.z),
          2.9
        );
        const label =
          pad.worldPromptText ||
          `${pad.actionVerb} : ${pad.shortName} → Niv. ${pad.nextLevel} (${pad.costText})`;
        this.hud.updateContextualPrompt(screenPos, 'E', label, 'prompt-build');
        return;
      }
    }

    // 4. Gisement de Bois / Cristal à proximité (pendant l'Acte 3B ou quand le joueur est proche <= 6.2m)
    if (this.terrain && typeof this.terrain.getNearestResourceNode === 'function') {
      const searchRad = this.tutorialActive && this.tutorialAct === 3 && this.tutorialSubStep === '3B' ? 8.5 : 5.5;
      const node = this.terrain.getNearestResourceNode(px, pz, searchRad);
      if (node) {
        const ny = this.terrain.getHeightAt(node.x, node.z);
        const screenPos = this.sceneManager.worldToScreen(new THREE.Vector3(node.x, ny, node.z), 2.4);
        const label = node.type === 'crystal' ? 'Récolter Cristal (+5)' : 'Récolter Bois (+6)';
        this.hud.updateContextualPrompt(screenPos, 'E', label, 'prompt-harvest');
        return;
      }
    }

    this.hud.updateContextualPrompt(null);
  }

  /**
   * Connecte les événements entre les Éclaireurs, le gestionnaire d'ennemis, le joueur, le moteur Audio et le HUD.
   * Intercepte également `enemyManager.damageEnemy` et `player.interact` pour afficher les nombres
   * de dégâts flottants 3D->2D, déclencher les SFX WebAudio et détecter la récolte ou la construction sur socle 3D.
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

      if (this.sound && typeof this.sound.playScoutAlert === 'function') {
        const shouldPlayAlertVoice = !(this.tutorialActive && this.tutorialAct === 6);
        this.sound.playScoutAlert(shouldPlayAlertVoice);
      }

      this.hud.showScoutAlert(discovery);
      this.minimap.pingLocation(ex, ez, 'PATIENT ZÉRO', 8000);
    };

    if (this.bastionAndNpcs) {
      this.bastionAndNpcs.onScoutDiscovery = this.handleScoutDiscovery;
      this.bastionAndNpcs.onRelicCollected = (relic, collectedCount, maxCount) =>
        this.handleRelicCollected(relic, collectedCount, maxCount);
      this.bastionAndNpcs.onWeaponShrineInteracted = (_shrine, weaponSpec) => {
        if (weaponSpec && this.sound && typeof this.sound.playWeaponForge === 'function') {
          this.sound.playWeaponForge(weaponSpec.id || weaponSpec.element);
        }
        this.hud?.refreshLogFeed?.();
      };
      this.bastionAndNpcs.onRelicSpottedByScout = (relic) => {
        if (relic && this.minimap && typeof this.minimap.pingLocation === 'function') {
          this.minimap.pingLocation(relic.x || 0, relic.z || 0, 'RELIQUE', 7000);
        }
        this.hud?.refreshLogFeed?.();
      };
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

    /**
     * Callback Phase 5 : déclenché lorsqu'un Dragon Souverain pacifique est attaqué
     * et que toute l'espèce entre en Courroux Draconique collectif contre le Bastion.
     * @param {string} speciesId
     * @param {Object} targetEnemy
     */
    this._wrathBannerShownForSpecies = new Set();
    this.handleSpeciesWrath = (speciesId = 'dragon', targetEnemy = null) => {
      const spKey = speciesId || 'dragon';
      this._wrathBannerShownForSpecies.add(spKey);
      const ex = targetEnemy?.x ?? targetEnemy?.mesh?.position?.x ?? 0;
      const ez = targetEnemy?.z ?? targetEnemy?.mesh?.position?.z ?? 0;

      if (this.sound && typeof this.sound.playDragonWrath === 'function') {
        this.sound.playDragonWrath(true);
      }
      if (this.hud && typeof this.hud.showSpeciesWrathBanner === 'function') {
        this.hud.showSpeciesWrathBanner(spKey, targetEnemy);
      }
      if (this.minimap && typeof this.minimap.pingLocation === 'function') {
        this.minimap.pingLocation(ex, ez, 'COURROUX DRACONIQUE', 10000);
      }
    };

    this.enemyManager.onSpeciesWrathTriggered = this.handleSpeciesWrath;

    // Callbacks Phase 7 : Débarquement Amphibie des Requins, Éruption des Taupes Géantes & Écologie du Gibier
    this.handleSharkBeachLanding = (eventData = {}) => {
      const isArr = Array.isArray(eventData);
      const shark = (isArr ? eventData[0] : eventData?.enemy || eventData?.sharks?.[0]) || null;
      const ex = (!isArr && eventData?.x) ?? shark?.x ?? 68;
      const ey = (!isArr && eventData?.y) ?? shark?.y ?? 0;
      const ez = (!isArr && eventData?.z) ?? shark?.z ?? 32;

      if (!isArr && this.ecoSim && typeof this.ecoSim.recordSharkLanding === 'function') {
        this.ecoSim.recordSharkLanding(eventData.count || eventData.sharks?.length || 1);
      }
      if (!isArr && this.vfx && typeof this.vfx.spawnBeachLandingSplash === 'function') {
        this.vfx.spawnBeachLandingSplash(new THREE.Vector3(ex, ey, ez));
      }
      if (this.sound && typeof this.sound.playSharkLanding === 'function') {
        this.sound.playSharkLanding(!this.tutorialActive);
      }
      if (this.hud && typeof this.hud.showSharkLandingAlert === 'function') {
        this.hud.showSharkLandingAlert(eventData);
      }
      if (this.minimap && typeof this.minimap.pingLocation === 'function') {
        this.minimap.pingLocation(ex, ez, 'REQUINS MARCHEURS', 9000);
      }
      this.hud?.refreshLogFeed?.();
    };

    this.handleMoleSubterraneanEruption = (eventData = {}) => {
      const isArr = Array.isArray(eventData);
      const mole = (isArr ? eventData[0] : eventData?.enemy || eventData?.moles?.[0]) || null;
      const ex = (!isArr && eventData?.x) ?? mole?.x ?? -48;
      const ey = (!isArr && eventData?.y) ?? mole?.y ?? 0;
      const ez = (!isArr && eventData?.z) ?? mole?.z ?? 44;

      if (!isArr && this.ecoSim && typeof this.ecoSim.recordMoleEruption === 'function') {
        this.ecoSim.recordMoleEruption(eventData.count || eventData.moles?.length || 1);
      }
      if (!isArr && this.vfx && typeof this.vfx.spawnBurrowEruption === 'function') {
        this.vfx.spawnBurrowEruption(new THREE.Vector3(ex, ey, ez));
      }
      if (this.sound && typeof this.sound.playMoleEruption === 'function') {
        this.sound.playMoleEruption(!this.tutorialActive);
      }
      if (this.hud && typeof this.hud.showMoleEruptionAlert === 'function') {
        this.hud.showMoleEruptionAlert(eventData);
      }
      if (this.minimap && typeof this.minimap.pingLocation === 'function') {
        this.minimap.pingLocation(ex, ez, 'TAUPES GÉANTES', 9000);
      }
      this.hud?.refreshLogFeed?.();
    };

    this.handlePreyEcologicalCrisis = (crisisData = {}, enemy = null, isSpellDamage = false) => {
      if (this.sound && typeof this.sound.playPreyWarning === 'function') {
        this.sound.playPreyWarning(!this.tutorialActive);
      }
      if (this.hud && typeof this.hud.showPreyEcologicalCrisisAlert === 'function') {
        this.hud.showPreyEcologicalCrisisAlert(crisisData, enemy, isSpellDamage);
      }
      this.hud?.refreshLogFeed?.();
    };

    this.handlePreyKilled = (enemy, summaryOrRemaining = 0, wasKilledBySpell = false) => {
      const spId = enemy?.genome?.speciesId || 'deer';
      const foodGain =
        CONFIG.SPECIES?.[spId]?.foodYield ?? (spId === 'deer' ? 35 : 18);
      const ex = enemy?.x ?? this.player?.x ?? 0;
      const ey = enemy?.y ?? this.player?.y ?? 0;
      const ez = enemy?.z ?? this.player?.z ?? 0;
      const remainingPreyCount =
        typeof summaryOrRemaining === 'object' && summaryOrRemaining !== null
          ? (spId === 'rabbit' ? summaryOrRemaining.rabbit : summaryOrRemaining.deer) ??
            summaryOrRemaining.total ??
            0
          : summaryOrRemaining;

      if (this.sceneManager && typeof this.sceneManager.worldToScreen === 'function') {
        const screenPos = this.sceneManager.worldToScreen(new THREE.Vector3(ex, ey + 0.8, ez), 2.3);
        this.hud.spawnFloatingNumber(screenPos, `+${foodGain} 🍖 Rations`, 'dmg-heal');

        if (wasKilledBySpell || remainingPreyCount <= 3) {
          const warnPos = this.sceneManager.worldToScreen(new THREE.Vector3(ex, ey + 1.5, ez), 2.7);
          this.hud.spawnFloatingNumber(
            warnPos,
            `⚠️ Gibier touché (${remainingPreyCount} restant) !`,
            'dmg-crit'
          );
        }
      }

      if (wasKilledBySpell && remainingPreyCount > 1 && this.sound && typeof this.sound.playPreyWarning === 'function') {
        this.sound.playPreyWarning(false);
      }
      this.hud?.refreshLogFeed?.();
    };

    this.enemyManager.onSharkBeachLanding = this.handleSharkBeachLanding;
    this.enemyManager.onMoleSubterraneanEruption = this.handleMoleSubterraneanEruption;
    this.enemyManager.onPreyEcologicalCrisis = this.handlePreyEcologicalCrisis;
    this.enemyManager.onPreyKilled = this.handlePreyKilled;

    // Interception non-intrusive de `enemyManager.damageEnemy` pour faire jaillir les dégâts flottants 3D->2D + SFX d'impact
    const origDamageEnemy = this.enemyManager.damageEnemy.bind(this.enemyManager);
    this.enemyManager.damageEnemy = (
      enemyIdOrObj,
      amount,
      knockbackDir = null,
      onEradicated = null,
      options = {}
    ) => {
      const targetId = typeof enemyIdOrObj === 'object' ? enemyIdOrObj?.id : enemyIdOrObj;
      const targetRef = this.enemyManager.enemies.find((e) => e.id === targetId);
      const tx = targetRef ? targetRef.x : 0;
      const ty = targetRef ? targetRef.y : 0;
      const tz = targetRef ? targetRef.z : 0;
      const prevFood = this.player?.resources?.food ?? 60;

      const wasPeacefulDragon =
        Boolean(targetRef) &&
        (targetRef.genome?.speciesId === 'dragon' || targetRef.aggroStance === 'pacifist_apex') &&
        !targetRef.enraged &&
        targetRef.state !== 'wrath_raid' &&
        !this._wrathBannerShownForSpecies.has('dragon');

      const res = origDamageEnemy(enemyIdOrObj, amount, knockbackDir, onEradicated, options);

      if (wasPeacefulDragon && !this._wrathBannerShownForSpecies.has('dragon')) {
        if (typeof this.enemyManager.provokeSpecies === 'function') {
          this.enemyManager.provokeSpecies('dragon', targetRef);
        }
        if (!this._wrathBannerShownForSpecies.has('dragon')) {
          this.handleSpeciesWrath('dragon', targetRef);
        }
      }

      if (res && res.killed && targetRef) {
        if (this.questSystem && typeof this.questSystem.recordEnemyKilled === 'function') {
          this.questSystem.recordEnemyKilled(targetRef);
        }

        // Si la créature tuée est du Gibier Herbivore (Biche / Lapin) et que EnemyManager/PlayerController n'a pas encore crédité les Rations
        const spId = targetRef.genome?.speciesId || '';
        const isPrey =
          spId === 'deer' ||
          spId === 'rabbit' ||
          targetRef.aggroStance === 'prey_pacifist' ||
          CONFIG.SPECIES?.[spId]?.clade === 'herbivore';
        if (isPrey && this.player?.resources && this.player.resources.food === prevFood) {
          const foodYield = CONFIG.SPECIES?.[spId]?.foodYield ?? (spId === 'deer' ? 35 : 18);
          const healYield = CONFIG.SPECIES?.[spId]?.healYield ?? (spId === 'deer' ? 25 : 12);
          const maxFood = this.player.resources.maxFood || 150;
          this.player.resources.food = Math.min(maxFood, (this.player.resources.food || 0) + foodYield);
          this.player.hp = Math.min(this.player.maxHp || 160, (this.player.hp || 100) + healYield);
        }
      }

      if (targetRef) {
        const muts = Array.isArray(targetRef.genome?.mutations) ? targetRef.genome.mutations : [];
        const isMut = Boolean(targetRef.genome?.isHybrid) || muts.length > 0;
        let hitElem = 'physical';
        if (muts.includes('pyro_gland') || targetRef.genome?.speciesId === 'dragon') hitElem = 'fire';
        else if (muts.includes('cryo_blood') || muts.includes('amphibious_lungs')) hitElem = 'ice';
        else if (muts.includes('venom_sacs')) hitElem = 'venom';

        if (this.sound && typeof this.sound.playHitImpact === 'function') {
          this.sound.playHitImpact(isMut, hitElem);
        }

        if (this.sceneManager && typeof this.sceneManager.worldToScreen === 'function') {
          const screenPos = this.sceneManager.worldToScreen(new THREE.Vector3(tx, ty, tz), 2.1);
          this.hud.spawnFloatingNumber(
            screenPos,
            `-${Math.round(amount)}`,
            isMut ? 'dmg-crit' : 'dmg-normal'
          );

          if (res && res.killed && res.xpGained > 0) {
            const xpPos = this.sceneManager.worldToScreen(new THREE.Vector3(tx, ty + 0.6, tz), 2.6);
            this.hud.spawnFloatingNumber(xpPos, `+${res.xpGained} XP`, 'dmg-xp');
          }
        }
      }
      return res;
    };

    // Interception de `player.performCleaveAttack`, `player.performDash` et `player.interact` pour les SFX et le tutoriel
    if (this.player) {
      if (typeof this.player.performCleaveAttack === 'function') {
        const origCleave = this.player.performCleaveAttack.bind(this.player);
        this.player.performCleaveAttack = (enemyManager, bastionAndNpcs, isAutoMelee) => {
          const prevSwings = this.player.attackSwings || 0;
          const hits = origCleave(enemyManager, bastionAndNpcs, isAutoMelee);
          if ((this.player.attackSwings || 0) > prevSwings && this.sound && typeof this.sound.playSwordCleave === 'function') {
            this.sound.playSwordCleave();
          }
          return hits;
        };
      }

      if (typeof this.player.performDash === 'function') {
        const origDash = this.player.performDash.bind(this.player);
        this.player.performDash = () => {
          const prevDash = this.player.dashCount || 0;
          origDash();
          if ((this.player.dashCount || 0) > prevDash && this.sound && typeof this.sound.playDash === 'function') {
            this.sound.playDash();
          }
        };
      }

      this.player.onAbilityCast = (abilityId) => {
        if (this.sound && typeof this.sound.playSpellCast === 'function') {
          this.sound.playSpellCast(abilityId);
        }
      };

      this.player.onResourceHarvested = (resType) => {
        if (this.sound && typeof this.sound.playHarvest === 'function') {
          this.sound.playHarvest(resType);
        }
      };

      this.player.onCageRescued = () => {
        if (this.sound && typeof this.sound.playCageRescue === 'function') {
          this.sound.playCageRescue();
        }
      };

      this.player.onBuildingUpgraded = (_id, lvl) => {
        if (this.sound && typeof this.sound.playBuildOrUpgrade === 'function') {
          this.sound.playBuildOrUpgrade(lvl || 1);
        }
      };

      this.player.onWeaponEquipped = (wSpec) => {
        if (this.sound && typeof this.sound.playWeaponForge === 'function') {
          this.sound.playWeaponForge(wSpec?.id || wSpec?.element || 'runic_steel');
        }
        if (wSpec && this.sceneManager && typeof this.sceneManager.worldToScreen === 'function') {
          const screenPos = this.sceneManager.worldToScreen(
            new THREE.Vector3(this.player.x, this.player.y + 0.8, this.player.z),
            2.6
          );
          this.hud.spawnFloatingNumber(screenPos, `${wSpec.icon} ${wSpec.shortName}`, 'dmg-mastery');
        }
        this.hud?.refreshLogFeed?.();
      };

      if (typeof this.player.interact === 'function') {
        const origInteract = this.player.interact.bind(this.player);
        this.player.interact = (bastionAndNpcs) => {
          const prevWood = this.player.resources?.wood || 0;
          const prevCrystal = this.player.resources?.crystal || 0;
          const prevRescued = bastionAndNpcs?.rescuedCount || 0;
          const prevRelics = bastionAndNpcs?.collectedRelicFragments || 0;
          const prevWatchtowerLvl =
            typeof bastionAndNpcs?.getBuildingLevel === 'function'
              ? bastionAndNpcs.getBuildingLevel('watchtower')
              : 0;

          const interactResult = origInteract(bastionAndNpcs);

          const newWood = this.player.resources?.wood || 0;
          const newCrystal = this.player.resources?.crystal || 0;
          const newRescued = bastionAndNpcs?.rescuedCount || 0;
          const newRelics = bastionAndNpcs?.collectedRelicFragments || 0;
          const newWatchtowerLvl =
            typeof bastionAndNpcs?.getBuildingLevel === 'function'
              ? bastionAndNpcs.getBuildingLevel('watchtower')
              : 0;

          if (newWatchtowerLvl > prevWatchtowerLvl) {
            this.tutState.watchtowerBuiltInAct4 = true;
            this.hud.refreshLogFeed();
          }

          // Si le joueur a récolté un gisement (sans que ce soit le bonus d'ouverture d'une cage ou d'une relique)
          if (
            newRescued === prevRescued &&
            newRelics === prevRelics &&
            (newWood > prevWood || newCrystal > prevCrystal)
          ) {
            this.tutState.harvestedInAct3 = true;
            if (this.sceneManager && typeof this.sceneManager.worldToScreen === 'function') {
              const screenPos = this.sceneManager.worldToScreen(
                new THREE.Vector3(this.player.x, this.player.y, this.player.z),
                2.2
              );
              const gainTxt =
                newCrystal > prevCrystal
                  ? `+${newCrystal - prevCrystal} Cristal 💎`
                  : `+${newWood - prevWood} Bois 🪵`;
              this.hud.spawnFloatingNumber(screenPos, gainTxt, 'dmg-heal');
            }
          }
          return interactResult;
        };
      }

      // Montée de niveau Roguelike & Maîtrises Adaptatives du joueur
      this.player.onLevelUp = () => {
        if (this.sound && typeof this.sound.playLevelUp === 'function') {
          this.sound.playLevelUp();
        }
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
          player: this.player,
          hasActivePyro,
          activeMutantCount,
          starvingCount,
        });
      };

      this.player.onMasteryRankUp = (notif) => {
        if (!notif) return;
        if (this.sceneManager && typeof this.sceneManager.worldToScreen === 'function') {
          const screenPos = this.sceneManager.worldToScreen(
            new THREE.Vector3(this.player.x, this.player.y, this.player.z),
            2.9
          );
          this.hud.spawnFloatingNumber(
            screenPos,
            `🧬 ${notif.badgeText || notif.title || 'Maîtrise +1'}`,
            'dmg-mastery'
          );
        }
        this.hud.refreshLogFeed();
      };
    }
  }

  /**
   * Équipe une Arme Élémentaire Légendaire (`fire_greatsword`, `ice_greatsword`, `lightning_greatsword`,
   * `venom_greatsword`, ou `runic_steel`) sur le Héros (Phase 8).
   * @param {string} weaponId
   * @returns {Object} Spécification de l'arme équipée.
   */
  handleEquipElementalWeapon(weaponId = 'runic_steel') {
    const wSpec = getElementalWeaponSpec(weaponId);
    if (!this.player) return wSpec;

    if (typeof this.player.equipElementalWeapon === 'function') {
      this.player.equipElementalWeapon(wSpec.id);
    } else {
      this.player.equippedWeaponId = wSpec.id;
      this.player.equippedWeapon = wSpec;
      if (this.sound && typeof this.sound.playWeaponForge === 'function') {
        this.sound.playWeaponForge(wSpec.id);
      }
    }

    this.hud?.refreshLogFeed?.();
    return wSpec;
  }

  /**
   * Callback déclenché lorsqu'un Fragment de Relique d'Éden (`1/3`, `2/3`, `3/3`) est collecté (Phase 8).
   * @param {Object} relic
   * @param {number} collectedCount
   * @param {number} maxCount
   */
  handleRelicCollected(relic, collectedCount = 1, maxCount = 3) {
    if (this.player) {
      this.player.relicFragmentsCollected = collectedCount;
    }

    if (this.sound && typeof this.sound.playRelicPickup === 'function') {
      this.sound.playRelicPickup(collectedCount, !this.tutorialActive);
    }

    if (this.sceneManager && typeof this.sceneManager.worldToScreen === 'function') {
      const rx = relic?.x ?? this.player?.x ?? 0;
      const ry = relic?.y ?? this.player?.y ?? 0;
      const rz = relic?.z ?? this.player?.z ?? 0;
      const screenPos = this.sceneManager.worldToScreen(new THREE.Vector3(rx, ry + 1.0, rz), 2.8);
      this.hud.spawnFloatingNumber(
        screenPos,
        `🧩 Relique ${collectedCount}/${maxCount} (+15 💎)`,
        'dmg-mastery'
      );
    }

    if (this.hud && typeof this.hud.showRelicCollectedAlert === 'function') {
      this.hud.showRelicCollectedAlert({
        relic,
        fragmentCount: collectedCount,
        maxFragments: maxCount,
        x: relic?.x ?? 0,
        z: relic?.z ?? 0,
      });
    }

    if (collectedCount >= maxCount) {
      if (this.bastionAndNpcs && typeof this.bastionAndNpcs.activateIslandShield === 'function') {
        this.bastionAndNpcs.activateIslandShield(true);
      }
      if (this.enemyManager) {
        this.enemyManager.islandShieldActive = true;
        if (typeof this.enemyManager.pacifyAllEnemiesWithIslandShield === 'function') {
          this.enemyManager.pacifyAllEnemiesWithIslandShield();
        }
      }
    }

    this.hud?.refreshLogFeed?.();
  }

  /**
   * Collecte immédiatement le prochain Fragment de Relique Ancienne non collecté (pour test / vérification).
   * @returns {Object|null}
   */
  collectNextRelicFragmentForTest() {
    if (!this.bastionAndNpcs) return null;
    if (typeof this.bastionAndNpcs.collectRelicFragment === 'function') {
      const relic = this.bastionAndNpcs.collectRelicFragment(null, this.player?.resources);
      if (relic && typeof this.player?.gainXp === 'function') {
        this.player.gainXp(RELIC_FRAGMENTS_SPEC?.fragmentRewardXp || 50);
      }
      return relic;
    }
    return null;
  }

  /**
   * Active le Dôme-Bouclier Planétaire d'Éden (`3/3 Reliques`) et ouvre la modale de Victoire d'Île `[V]` (Phase 8).
   * @param {boolean} [forceCollectAll=true] - Si `true`, complète les reliques restantes pour permettre le test immédiat via `[V]`.
   * @returns {boolean}
   */
  triggerIslandShieldAndVictory(forceCollectAll = true) {
    if (this.bastionAndNpcs) {
      const maxRelics = this.bastionAndNpcs.maxRelicFragments || 3;
      if (forceCollectAll && (this.bastionAndNpcs.collectedRelicFragments || 0) < maxRelics) {
        for (const r of this.bastionAndNpcs.relicShrines || []) {
          if (!r.collected && typeof this.bastionAndNpcs.collectRelicFragment === 'function') {
            this.bastionAndNpcs.collectRelicFragment(r, this.player?.resources);
          }
        }
      }
      if (typeof this.bastionAndNpcs.activateIslandShield === 'function') {
        this.bastionAndNpcs.activateIslandShield(true);
      } else {
        this.bastionAndNpcs.islandShieldActive = true;
      }
    }

    if (this.enemyManager) {
      this.enemyManager.islandShieldActive = true;
      if (typeof this.enemyManager.pacifyAllEnemiesWithIslandShield === 'function') {
        this.enemyManager.pacifyAllEnemiesWithIslandShield();
      }
    }

    if (this.sound && typeof this.sound.playIslandShieldActivation === 'function') {
      this.sound.playIslandShieldActivation(!this.tutorialActive);
    }

    const currentIsland =
      this.enemyManager?.islandNumber ||
      this.bastionAndNpcs?.islandNumber ||
      1;
    this.hud.showIslandVictoryModal({
      islandNumber: currentIsland,
      relicCount: this.bastionAndNpcs?.collectedRelicFragments || 3,
      equippedWeaponId: this.player?.equippedWeaponId || 'runic_steel',
    });

    this.hud?.refreshLogFeed?.();
    return true;
  }

  /**
   * Appareille vers l'Île suivante de la campagne (`Île #1 -> Île #2 -> Île #3...`) en conservant
   * le niveau du Héros, son Arme Élémentaire Légendaire, ses Sorts 3D, ses Maîtrises et ses Bâtiments (Phase 8).
   * @returns {Object} Spécification du palier de la nouvelle île (`getIslandTierSpec`).
   */
  advanceToNextIsland() {
    const currentIsland =
      this.enemyManager?.islandNumber ||
      this.bastionAndNpcs?.islandNumber ||
      1;
    const nextIsland = currentIsland + 1;
    const tierSpec = getIslandTierSpec(nextIsland);

    this.hud.hideIslandVictoryModal();
    this.hud.hideAlertBanner();

    if (this.tutorialActive) {
      this.skipTutorial();
    }

    // 1. Réinitialiser la grille écologique et escalader le taux de mutation sur la nouvelle île
    if (this.ecoSim && typeof this.ecoSim.resetForNextIsland === 'function') {
      this.ecoSim.resetForNextIsland(nextIsland, tierSpec);
    }

    // 2. Réinitialiser les 3 Monolithes de Relique, les Cages et le Dôme sur le Bastion
    if (this.bastionAndNpcs && typeof this.bastionAndNpcs.resetForNextIsland === 'function') {
      this.bastionAndNpcs.resetForNextIsland(nextIsland);
    } else if (this.bastionAndNpcs) {
      this.bastionAndNpcs.islandNumber = nextIsland;
      this.bastionAndNpcs.islandShieldActive = false;
      this.bastionAndNpcs.collectedRelicFragments = 0;
    }

    // 3. Transitionner EnemyManager vers la nouvelle île avec escalade de difficulté et meutes fraîches
    if (this.enemyManager) {
      if (typeof this.enemyManager.startNextIslandEcosystem === 'function') {
        this.enemyManager.startNextIslandEcosystem(nextIsland);
      } else if (typeof this.enemyManager.resetForNextIsland === 'function') {
        this.enemyManager.resetForNextIsland(nextIsland);
      } else {
        this.enemyManager.islandNumber = nextIsland;
        this.enemyManager.islandDifficultyMult = tierSpec.enemyStatMultiplier || 1.35;
        this.enemyManager.islandShieldActive = false;
        this.enemyManager.clearAllEnemies();
        this.enemyManager.spawnInitialPopulation(
          (CONFIG.ECO?.INITIAL_POPULATION || 42) + (tierSpec.extraInitialPackCount || 0) * 3
        );
      }
      this._ensurePhase7EcosystemPopulated();
    }

    // 4. Repositionner le Héros devant le Foyer du Sanctuaire avec santé restaurée et rations de voyage
    if (this.player) {
      this.player.x = 0;
      this.player.z = 6.5;
      this.player.y = this.terrain ? this.terrain.getHeightAt(0, 6.5) : 0;
      this.player.hp = this.player.maxHp;
      this.player.relicFragmentsCollected = 0;
      if (this.player.resources) {
        const maxFood = this.player.resources.maxFood || 150;
        this.player.resources.food = Math.min(maxFood, (this.player.resources.food || 60) + 45);
      }
    }

    logger.evolution(
      `⛵ Débarquement sur ${tierSpec.name} (${tierSpec.subtitle}) ! Difficulté x${tierSpec.enemyStatMultiplier.toFixed(2)} · Mutations +${Math.round(tierSpec.mutationRateBonus * 100)}%.`,
      {
        islandNumber: nextIsland,
        tierName: tierSpec.name,
        enemyStatMultiplier: tierSpec.enemyStatMultiplier,
        mutationRateBonus: tierSpec.mutationRateBonus,
      }
    );

    this.hud?.refreshLogFeed?.();
    return tierSpec;
  }

  /**
   * Change le mode de gameplay de combat (`'vampire_survivors'` Auto-Cast vs `'diablo_action'` Actif `[1-4]`).
   * Débloque automatiquement le sort de départ du mode choisi s'il n'est pas encore acquis.
   * @param {'vampire_survivors'|'diablo_action'} mode
   */
  handleSetCombatMode(mode) {
    if (!this.player) return;
    if (typeof this.player.setCombatMode === 'function') {
      this.player.setCombatMode(mode, true);
    } else {
      this.player.combatMode = mode;
    }

    // Garantir que le joueur dispose du sort signature du mode choisi
    if (
      mode === 'diablo_action' &&
      typeof this.player.unlockOrUpgradeAbility === 'function' &&
      !this.player.abilities?.has('pyro_nova')
    ) {
      this.player.unlockOrUpgradeAbility('pyro_nova');
    } else if (
      mode === 'vampire_survivors' &&
      typeof this.player.unlockOrUpgradeAbility === 'function' &&
      !this.player.abilities?.has('spinning_blades')
    ) {
      this.player.unlockOrUpgradeAbility('spinning_blades');
    }

    this.hud.refreshLogFeed();
  }

  /**
   * Déclenche le Sort 3D équipé dans l'emplacement `slotIndex` (`0..3`, touches `[1]..[4]` ou clic Skill Bar).
   * @param {number} slotIndex
   * @returns {boolean}
   */
  handleCastSpellSlot(slotIndex) {
    if (!this.player || this.hud.isModalPaused) return false;
    if (typeof this.player.triggerAbilitySlot === 'function') {
      return this.player.triggerAbilitySlot(slotIndex, this.enemyManager);
    }
    return false;
  }

  /**
   * Assigne un Ordre de Mission aux Éclaireurs (`'track_lineage'`, `'find_cages'`, `'scout_volcano'`, `'perimeter_alert'`).
   * @param {string} missionType
   * @param {string|null} [targetMutationId=null]
   */
  handleSetScoutMission(missionType, targetMutationId = null) {
    if (!this.bastionAndNpcs || typeof this.bastionAndNpcs.setScoutMission !== 'function') return;
    const mutId = targetMutationId || this.hud.selectedLineageId || 'pyro_gland';
    this.bastionAndNpcs.setScoutMission(missionType, mutId);
    if (missionType === 'track_lineage' && mutId) {
      this.hud.selectedLineageId = mutId;
      this.minimap.setHighlightedLineage(mutId);
    }
    this.hud.refreshLogFeed();
  }

  /**
   * Exécute l'action rapide associée à la carte de Quête Dynamique en cours (panneau droit).
   * @param {Object|null} [quest=null]
   */
  handleTriggerQuestAction(quest = null) {
    const activeQuest =
      quest || (this.questSystem && this.questSystem.getActiveQuest()) || null;
    if (!activeQuest) return;

    if (activeQuest.type === 'track_and_eradicate') {
      const mutId = activeQuest.targetMutationId || 'pyro_gland';
      this.handleSetScoutMission('track_lineage', mutId);

      // Si aucun porteur de cette mutation n'est présent sur l'île (ex. pendant ou juste après le tutoriel), en faire apparaître un pack
      const enemies = this.enemyManager.getEnemies();
      let carriers = enemies.filter(
        (e) =>
          e &&
          !e.dead &&
          e.hp > 0 &&
          Array.isArray(e.genome?.mutations) &&
          e.genome.mutations.includes(mutId)
      );
      if (carriers.length === 0 && typeof this.enemyManager.spawnQuestLineagePack === 'function') {
        carriers = this.enemyManager.spawnQuestLineagePack(
          mutId,
          activeQuest.targetSpeciesId || 'troll',
          activeQuest.initialPackSize || 3
        );
      }

      const targetCarrier = carriers.find((c) => c.spottedByScout) || carriers[0] || null;
      if (targetCarrier) {
        this.focusWorldPosition(targetCarrier.x, targetCarrier.z, mutId);
      }
    } else if (activeQuest.type === 'build_bastion') {
      this.hud.toggleBastionArchitectModal(true, this.bastionAndNpcs, this.player);
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
   * Déclenche immédiatement l'évolution amphibie (`amphibious_lungs`) et le débarquement côtier
   * des Requins Marcheurs des Abysses (`shark`) sur les plages de l'île (Phase 7).
   * @returns {Object|Array}
   */
  triggerSharkLanding() {
    if (this.enemyManager && typeof this.enemyManager.triggerSharkBeachLanding === 'function') {
      const res = this.enemyManager.triggerSharkBeachLanding();
      const firstShark = Array.isArray(res) ? res[0] : res?.enemy || res?.sharks?.[0] || res;
      if (!this.enemyManager.onSharkBeachLanding) {
        this.handleSharkBeachLanding({
          enemy: firstShark,
          sharks: Array.isArray(res) ? res : res?.sharks || (firstShark ? [firstShark] : []),
          count: Array.isArray(res) ? res.length : res?.count || 2,
          x: firstShark?.x ?? 68,
          z: firstShark?.z ?? 32,
        });
      }
      return res;
    }

    // Fallback direct si EnemyManager utilise forceSpawnMutant
    const shark = this.enemyManager?.forceSpawnMutant?.('amphibious_lungs', 'shark');
    if (shark) {
      shark.spottedByScout = true;
      shark.isAquatic = false;
      shark.hasLandedOnBeach = true;
    }
    this.handleSharkBeachLanding({
      enemy: shark,
      sharks: shark ? [shark] : [],
      count: shark ? 2 : 1,
      x: shark?.x ?? 68,
      z: shark?.z ?? 32,
    });
    return shark;
  }

  /**
   * Déclenche immédiatement l'éruption souterraine d'une colonie de Taupes Géantes Fouisseuses (`giant_mole`)
   * à la surface de l'île (Phase 7).
   * @returns {Object|Array}
   */
  triggerMoleEruption() {
    if (this.enemyManager && typeof this.enemyManager.triggerMoleSubterraneanEruption === 'function') {
      const res = this.enemyManager.triggerMoleSubterraneanEruption();
      const firstMole = Array.isArray(res) ? res[0] : res?.enemy || res?.moles?.[0] || res;
      if (!this.enemyManager.onMoleSubterraneanEruption) {
        this.handleMoleSubterraneanEruption({
          enemy: firstMole,
          moles: Array.isArray(res) ? res : res?.moles || (firstMole ? [firstMole] : []),
          count: Array.isArray(res) ? res.length : res?.count || 2,
          x: firstMole?.x ?? -48,
          z: firstMole?.z ?? 44,
        });
      }
      return res;
    }

    // Fallback direct via forceSpawnMutant
    const mole = this.enemyManager?.forceSpawnMutant?.('chitin_shell', 'giant_mole');
    if (mole) {
      mole.spottedByScout = true;
      mole.hasErupted = true;
    }
    this.handleMoleSubterraneanEruption({
      enemy: mole,
      moles: mole ? [mole] : [],
      count: mole ? 2 : 1,
      x: mole?.x ?? -48,
      z: mole?.z ?? 44,
    });
    return mole;
  }

  /**
   * Réintroduit des troupeaux d'herbivores (`deer` Biches Sylvestres & `rabbit` Lapins des Plaines)
   * contre 25 Biomasse depuis le Bio-Labo du Bastion (Phase 7).
   * @returns {boolean}
   */
  handleReintroducePrey() {
    const cost = 25;
    const currentBiomass = this.player?.resources?.biomass ?? 0;
    if (currentBiomass < cost) {
      logger.warn('ECO', 'Biomasse insuffisante pour réintroduire le Gibier (25 Biomasse requis).', {
        currentBiomass,
        requiredBiomass: cost,
      });
      return false;
    }

    if (this.enemyManager && typeof this.enemyManager.reintroducePreyHerds === 'function') {
      const res = this.enemyManager.reintroducePreyHerds(this.player?.resources);
      if (res && res.success !== false) {
        if (this.sound && typeof this.sound.playBuildOrUpgrade === 'function') {
          this.sound.playBuildOrUpgrade(2);
        }
        this.hud?.hideAlertBanner?.();
        this.hud?.refreshLogFeed?.();
        return true;
      }
      return false;
    }

    // Déduction directe et repeuplement si reintroducePreyHerds n'a pas encore consommé la Biomasse
    if (this.player?.resources) {
      this.player.resources.biomass = Math.max(0, currentBiomass - cost);
    }
    if (this.enemyManager && typeof this.enemyManager.spawnInitialPopulation === 'function') {
      if (typeof this.enemyManager._spawnSingleCreature === 'function') {
        for (let i = 0; i < 3; i++) {
          this.enemyManager._spawnSingleCreature('deer', 32 + i * 6, -24 + i * 5);
        }
        for (let i = 0; i < 4; i++) {
          this.enemyManager._spawnSingleCreature('rabbit', -28 + i * 5, 26 - i * 4);
        }
      }
    }
    logger.info(
      'ECO',
      '🌿 Réintroduction écologique réussie : nouveaux troupeaux de Biches Sylvestres et Lapins des Plaines relâchés !',
      { biomassSpent: cost }
    );
    if (this.sound && typeof this.sound.playBuildOrUpgrade === 'function') {
      this.sound.playBuildOrUpgrade(2);
    }
    this.hud?.hideAlertBanner?.();
    this.hud?.refreshLogFeed?.();
    return true;
  }

  /**
   * Gère l'allocation ou le recrutement d'un PNJ vers le rôle demandé (`scout`, `guard`, `harvester`).
   * @param {string} targetRole
   */
  handleRoleAssignment(targetRole) {
    if (!this.bastionAndNpcs) return;

    // Pendant l'Acte 5B du tutoriel, convertir en priorité l'un des survivants secourus en Éclaireur
    if (this.tutorialActive && this.tutorialAct === 5 && targetRole === 'scout') {
      if (
        this.bastionAndNpcs.assignNpcRole('harvester', 'scout') ||
        this.bastionAndNpcs.assignNpcRole('guard', 'scout')
      ) {
        this.tutState.scoutAssignedInAct5 = true;
        this.hud.refreshLogFeed();
        return;
      }
    }

    // 1. Tente d'abord de recruter un nouveau survivant si le joueur a assez de ressources
    if (typeof this.bastionAndNpcs.recruitNpcWithResources === 'function') {
      const recruited = this.bastionAndNpcs.recruitNpcWithResources(
        targetRole,
        this.player?.resources
      );
      if (recruited) {
        if (targetRole === 'scout') this.tutState.scoutAssignedInAct5 = true;
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
          if (targetRole === 'scout') this.tutState.scoutAssignedInAct5 = true;
          this.hud.refreshLogFeed();
          return;
        }
      }
    }
  }

  /**
   * Construit ou améliore un bâtiment du Bastion (`sanctuary_hearth`, `watchtower`, `scout_guild`, `lumber_forge`/`palisade`, `biolab`).
   * @param {string} structureId
   * @returns {boolean}
   */
  handleBuildStructure(structureId) {
    if (!this.bastionAndNpcs) return false;
    const fn =
      typeof this.bastionAndNpcs.upgradeBuilding === 'function'
        ? this.bastionAndNpcs.upgradeBuilding.bind(this.bastionAndNpcs)
        : this.bastionAndNpcs.buildStructure?.bind(this.bastionAndNpcs);
    if (!fn) return false;

    const built = fn(structureId, this.player?.resources);
    if (built) {
      if (structureId === 'watchtower') {
        this.tutState.watchtowerBuiltInAct4 = true;
      }
      if (this.sound && typeof this.sound.playBuildOrUpgrade === 'function') {
        const lvl =
          typeof this.bastionAndNpcs.getBuildingLevel === 'function'
            ? this.bastionAndNpcs.getBuildingLevel(structureId)
            : 1;
        this.sound.playBuildOrUpgrade(lvl || 1);
      }
    }
    this.hud.refreshLogFeed();
    return Boolean(built);
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
   * Applique une carte d'amélioration Roguelike (Sort 3D ou Adaptation Passive) choisie par le joueur.
   * @param {Object} upgrade
   */
  handleSelectUpgrade(upgrade) {
    if (!upgrade || !this.player) return;
    this.player.applyUpgrade(upgrade);
    this.tutState.upgradePickedInAct2 = true;
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
        const isOpen = this.hud.toggleCodexModal(undefined, this.enemyManager.getEnemies());
        if (isOpen) {
          this.tutState.codexOpenedInAct6 = true;
        }
      } else if (evt.code === 'KeyH' && !evt.ctrlKey && !evt.metaKey) {
        evt.preventDefault();
        this.hud.toggleBastionArchitectModal(undefined, this.bastionAndNpcs, this.player);
      } else if (evt.code === 'KeyK' && !evt.ctrlKey && !evt.metaKey) {
        evt.preventDefault();
        this.hud.toggleWeaponModal(undefined, this.player, this.bastionAndNpcs);
      } else if (evt.code === 'KeyV' && !evt.ctrlKey && !evt.metaKey) {
        evt.preventDefault();
        if (this.hud.isIslandModalOpen) {
          this.hud.hideIslandVictoryModal();
        } else {
          this.triggerIslandShieldAndVictory(true);
        }
      } else if (evt.code === 'KeyP' && !evt.ctrlKey && !evt.metaKey) {
        if (this.tutorialActive) {
          this.skipTutorial();
        }
      } else if (evt.code === 'KeyC' && !evt.ctrlKey && !evt.metaKey) {
        this.hud.toggleCombatMode();
      } else if (evt.code === 'KeyB' && !evt.ctrlKey && !evt.metaKey) {
        if (this.hud.isCombatModeModalOpen) {
          this.hud.hideCombatModeModal();
        } else {
          this.hud.showCombatModeModal();
        }
      } else if (evt.code === 'Escape') {
        if (this.hud.isCodexOpen) {
          this.hud.toggleCodexModal(false);
        }
        if (this.hud.isCombatModeModalOpen) {
          this.hud.hideCombatModeModal();
        }
        if (this.hud.isBastionModalOpen) {
          this.hud.toggleBastionArchitectModal(false);
        }
        if (this.hud.isWeaponModalOpen) {
          this.hud.toggleWeaponModal(false);
        }
        if (this.hud.isIslandModalOpen) {
          this.hud.hideIslandVictoryModal();
        }
        this.hud.hideAlertBanner();
      } else if (evt.code === 'KeyT' && !evt.ctrlKey && !evt.metaKey) {
        this.forceEcoTick();
      } else if (evt.code === 'KeyM' && !evt.ctrlKey && !evt.metaKey) {
        this.spawnTestFireTroll();
      } else if (evt.code === 'KeyG' && !evt.ctrlKey && !evt.metaKey) {
        this.minimap.toggleConwayOverlay();
      } else if (evt.code === 'Digit1') {
        if (
          this.tutorialActive &&
          this.tutorialAct === 4 &&
          this.tutorialSubStep === '4A' &&
          !this.tutState.watchtowerBuiltInAct4
        ) {
          this.handleBuildStructure('watchtower');
        } else {
          this.handleCastSpellSlot(0);
        }
      } else if (evt.code === 'Digit2') {
        this.handleCastSpellSlot(1);
      } else if (evt.code === 'Digit3') {
        this.handleCastSpellSlot(2);
      } else if (evt.code === 'Digit4') {
        this.handleCastSpellSlot(3);
      } else if (evt.code === 'F1') {
        evt.preventDefault();
        this.handleBuildStructure('watchtower');
      } else if (evt.code === 'F2') {
        evt.preventDefault();
        this.handleBuildStructure('lumber_forge');
      } else if (evt.code === 'F3') {
        evt.preventDefault();
        this.handleBuildStructure('biolab');
      } else if (evt.code === 'F4') {
        evt.preventDefault();
        this.handleBuildStructure('scout_guild');
      } else if (evt.code === 'F5') {
        evt.preventDefault();
        this.handleBuildStructure('sanctuary_hearth');
      }
    });
  }

  /**
   * Exécute un pas de simulation et de rendu (`requestAnimationFrame`).
   * Si une modale tactique est ouverte (`this.hud.isModalPaused === true` : Level-Up, Mode de Combat,
   * Architecte du Bastion `[H]`, Forge des Armes `[K]`, Dôme-Bouclier `[V]` ou Codex Phylogénétique `[Tab]`),
   * toute la simulation de gameplay est mise en PAUSE STRICTE afin que le joueur puisse lire et planifier sans subir d'attaques.
   *
   * @param {number} nowMs - Timestamp haute précision fourni par `requestAnimationFrame`.
   */
  tickFrame(nowMs) {
    if (!this.isRunning) return;

    // Planifier immédiatement la frame suivante pour garantir que la boucle 3D ne s'arrête jamais
    requestAnimationFrame((t) => this.tickFrame(t));

    const safeNow = Number.isFinite(nowMs) ? nowMs : performance.now();
    const rawDt = (safeNow - this.lastFrameTime) * 0.001;
    this.lastFrameTime = safeNow;
    const dt = Number.isFinite(rawDt) ? Math.min(Math.max(rawDt, 0.001), 0.1) : 0.016;

    const isPaused = Boolean(this.hud.isModalPaused);

    if (!isPaused) {
      this.elapsedTime += dt;

      try {
        const camYaw =
          typeof this.sceneManager.getCameraYaw === 'function'
            ? this.sceneManager.getCameraYaw()
            : this.sceneManager.cameraYaw || 0;

        // 1. Mise à jour du Joueur (Mouvement, Auto-Cast Vampire Survivors ou Sorts Actifs Diablo)
        const foodBefore = this.player?.resources?.food;
        this.player.update(dt, this.elapsedTime, this.enemyManager, this.bastionAndNpcs, camYaw);
        // Métabolisme passif des Rations si PlayerController ne l'a pas encore décrémenté sur cette frame
        if (
          this.player?.resources &&
          typeof foodBefore === 'number' &&
          this.player.resources.food === foodBefore &&
          !this.tutorialActive
        ) {
          this.player.resources.food = Math.max(0, foodBefore - dt * 0.65);
          if (this.player.resources.food >= 10 && this.player.hp > 0 && this.player.hp < this.player.maxHp) {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + dt * 2.5);
          }
        }

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

        // 3. Progression du Tutoriel Guidé en 7 Actes & Bulles Contextuelles 3D->2D
        this._updateTutorialAndWorldPrompts(dt);

        // 4. Mise à jour des Créatures Sauvages, Meutes, Croissance Bébé -> Adulte & Eco-Ticks
        this.enemyManager.update(
          dt,
          this.elapsedTime,
          this.player,
          this.bastionAndNpcs,
          this.handleLineageEradicated
        );

        // 4B. Évaluation des Quêtes Dynamiques en 2 phases (Repérage Éclaireur -> Extermination)
        if (this.questSystem) {
          if (typeof this.questSystem.update === 'function') {
            const buildingLevels = this.bastionAndNpcs?.buildingLevels || {};
            const activeScoutMission =
              typeof this.bastionAndNpcs?.getScoutMission === 'function'
                ? this.bastionAndNpcs.getScoutMission()
                : {};
            this.questSystem.update(
              this.enemyManager.getEnemies(),
              buildingLevels,
              activeScoutMission,
              this.tutorialActive
            );
            if (typeof this.questSystem.consumePendingRewards === 'function') {
              const rewards = this.questSystem.consumePendingRewards();
              for (const r of rewards) {
                const rw = r.rewards || r;
                if (this.player) {
                  if (typeof this.player.applyQuestReward === 'function') {
                    this.player.applyQuestReward(rw);
                  } else {
                    if (rw.wood) this.player.resources.wood = (this.player.resources.wood || 0) + rw.wood;
                    if (rw.crystal) this.player.resources.crystal = (this.player.resources.crystal || 0) + rw.crystal;
                    if (rw.biomass) this.player.resources.biomass = (this.player.resources.biomass || 0) + rw.biomass;
                    if (rw.xp && typeof this.player.gainXp === 'function') {
                      this.player.gainXp(rw.xp);
                    }
                  }
                }
                this.hud.refreshLogFeed();
              }
            }
          } else if (typeof this.questSystem.evaluateProgress === 'function') {
            this.questSystem.evaluateProgress({
              enemies: this.enemyManager.getEnemies(),
              bastionAndNpcs: this.bastionAndNpcs,
              player: this.player,
              onStep1Complete: () => {
                this.hud.refreshLogFeed();
              },
              onQuestComplete: (reward) => {
                if (this.player && typeof this.player.applyQuestReward === 'function') {
                  this.player.applyQuestReward(reward);
                }
                this.hud.refreshLogFeed();
                const nextQ = this.questSystem.advanceToNextQuest();
                if (
                  nextQ &&
                  nextQ.type === 'track_and_eradicate' &&
                  typeof this.enemyManager.spawnQuestLineagePack === 'function'
                ) {
                  const existing = this.enemyManager
                    .getEnemies()
                    .filter(
                      (e) =>
                        e &&
                        e.hp > 0 &&
                        Array.isArray(e.genome?.mutations) &&
                        e.genome.mutations.includes(nextQ.targetMutationId)
                    );
                  if (existing.length === 0) {
                    this.enemyManager.spawnQuestLineagePack(
                      nextQ.targetMutationId,
                      nextQ.targetSpeciesId,
                      nextQ.initialPackSize || 3
                    );
                  }
                }
              },
            });
          }
        }
      } catch (err) {
        logger.error('GAMEPLAY', 'Erreur interceptée dans la mise à jour gameplay', {
          error: String(err),
        });
      }
    }

    // 4C. Mise à jour du Directeur Musical Adaptatif Lyria (Crossfade Stems & Télémétrie Live)
    try {
      if (this.sound && typeof this.sound.updateAdaptiveMusic === 'function') {
        const dragonWrath =
          typeof this.enemyManager.isSpeciesProvoked === 'function'
            ? this.enemyManager.isSpeciesProvoked('dragon')
            : false;
        this.sound.updateAdaptiveMusic({
          player: this.player,
          enemies: this.enemyManager.getEnemies(),
          tutorialActive: this.tutorialActive,
          tutorialAct: this.tutorialAct,
          isTutorialDialogue: this.tutorialActive,
          isModalPaused: isPaused,
          dragonWrathActive: dragonWrath,
        });
      }
    } catch (err) {
      logger.error('AUDIO', 'Erreur interceptée dans sound.updateAdaptiveMusic', {
        error: String(err),
      });
    }

    // 5. Mise à jour de l'Océan, de la Végétation et des Particules / Balises 3D (dt = 0 en pause)
    const renderDt = isPaused ? 0 : dt;
    try {
      const sunDir = this.sceneManager.getSunDirection();
      this.terrain.update(renderDt, this.elapsedTime, sunDir);
      this.vfx.update(renderDt, this.elapsedTime);
    } catch (err) {
      logger.error('VFX', 'Erreur interceptée dans terrain/vfx.update', {
        error: String(err),
      });
    }

    // 6. Mise à jour de la Caméra 3D Tactique / Isométrique & Rendu Post-Processing (TOUJOURS exécuté)
    try {
      this.sceneManager.update(renderDt, this.elapsedTime, this.player.position);
    } catch (err) {
      logger.error('RENDER', 'Erreur interceptée dans sceneManager.update', {
        error: String(err),
      });
    }

    // 7. Mise à jour du HUD et du Radar Minimap 2D
    try {
      this.hud.update({
        sceneManager: this.sceneManager,
        ecoSim: this.ecoSim,
        enemyManager: this.enemyManager,
        player: this.player,
        bastionAndNpcs: this.bastionAndNpcs,
        questSystem: this.questSystem,
        sound: this.sound,
      });

      this.minimap.update({
        terrain: this.terrain,
        ecoSim: this.ecoSim,
        enemies: this.enemyManager.getEnemies(),
        player: this.player,
        bastionAndNpcs: this.bastionAndNpcs,
        elapsedTime: this.elapsedTime,
      });
    } catch (err) {
      logger.error('HUD', 'Erreur interceptée dans hud/minimap.update', {
        error: String(err),
      });
    }
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
      sound: gameInstance.sound,
      sceneManager: gameInstance.sceneManager,
      terrain: gameInstance.terrain,
      vfx: gameInstance.vfx,
      ecoSim: gameInstance.ecoSim,
      questSystem: gameInstance.questSystem,
      enemyManager: gameInstance.enemyManager,
      player: gameInstance.player,
      bastionAndNpcs: gameInstance.bastionAndNpcs,
      hud: gameInstance.hud,
      minimap: gameInstance.minimap,
      forceEcoTick: () => gameInstance.forceEcoTick(),
      spawnFireTroll: () => gameInstance.spawnTestFireTroll(),
      triggerSharkLanding: () => gameInstance.triggerSharkLanding(),
      triggerMoleEruption: () => gameInstance.triggerMoleEruption(),
      reintroducePreyHerds: () => gameInstance.handleReintroducePrey(),
      equipWeapon: (weaponId) => gameInstance.handleEquipElementalWeapon(weaponId),
      toggleWeaponForge: (forceState) =>
        gameInstance.hud.toggleWeaponModal(
          forceState,
          gameInstance.player,
          gameInstance.bastionAndNpcs
        ),
      collectNextRelic: () => gameInstance.collectNextRelicFragmentForTest(),
      activateIslandShield: (force = true) => gameInstance.triggerIslandShieldAndVictory(force),
      advanceToNextIsland: () => gameInstance.advanceToNextIsland(),
      skipTutorial: () => gameInstance.skipTutorial(),
      startTutorialAct: (actNum) => gameInstance.startTutorialAct(actNum),
      playTutorialVoice: (actOrKey) => gameInstance.sound?.playTutorialVoice?.(actOrKey),
      toggleMute: () => gameInstance.sound?.toggleMute?.(),
      toggleCodex: () =>
        gameInstance.hud.toggleCodexModal(undefined, gameInstance.enemyManager.getEnemies()),
      toggleBastionArchitect: (forceState) =>
        gameInstance.hud.toggleBastionArchitectModal(
          forceState,
          gameInstance.bastionAndNpcs,
          gameInstance.player
        ),
      upgradeBuilding: (buildingId) => gameInstance.handleBuildStructure(buildingId),
      setScoutMission: (missionType, mutId) =>
        gameInstance.handleSetScoutMission(missionType, mutId),
      setCombatMode: (mode) => gameInstance.hud.setCombatMode(mode, true),
      toggleCombatMode: () => gameInstance.hud.toggleCombatMode(),
      openCombatModeModal: () => gameInstance.hud.showCombatModeModal(),
      castSpellSlot: (slotIdx) => gameInstance.handleCastSpellSlot(slotIdx),
      provokeDragonWrath: () => {
        const dragon = gameInstance.enemyManager
          .getEnemies()
          .find((e) => e.hp > 0 && e.genome?.speciesId === 'dragon');
        if (typeof gameInstance.enemyManager.provokeSpecies === 'function') {
          gameInstance.enemyManager.provokeSpecies('dragon', dragon);
        } else {
          gameInstance.handleSpeciesWrath('dragon', dragon);
        }
      },
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
