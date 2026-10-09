/**
 * @fileoverview Player Action-Roguelike Controller, 3D Cleave Combat, Dash, Resource Harvesting,
 * 3D Ground Attack Range Indicator, 3D Golden Quest Arrow, and Onboarding Telemetry.
 *
 * Handles responsive WASD/ZQSD/Arrow movement oriented to the 3D tactical camera yaw,
 * wide-arc Rune Greatsword cleave attacks with 3D slash VFX and ground range ring,
 * dodge roll dashing (`Shift` or `Right Click`), prisoner cage rescues (`[E]`),
 * resource gathering (`[E]`), XP/level progression, and counter-adaptation upgrades.
 *
 * Usage:
 *   const player = new PlayerController(scene, terrain, vfx);
 *   player.setQuestTarget({ x: 0, z: -4 });
 *   player.update(dt, elapsedTime, enemyManager, bastionAndNpcs, cameraYaw);
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { buildCreatureMesh, animateCreatureMesh } from './CreatureMeshBuilder.js';
import { dist2D, clamp } from '../utils/math.js';
import { logger } from '../utils/logger.js';

export class PlayerController {
  /**
   * @param {THREE.Scene} scene - Three.js scene to mount player, range ring, and quest arrow meshes.
   * @param {Object} terrain - Terrain instance for height grounding and resource nodes.
   * @param {Object} vfx - VFXManager instance for combat hit and level-up particles.
   */
  constructor(scene, terrain, vfx) {
    /** @type {THREE.Scene} */
    this.scene = scene;
    /** @type {Object} */
    this.terrain = terrain;
    /** @type {Object} */
    this.vfx = vfx;

    // Spawn near the Bastion Sanctuary at (0, 6.5)
    /** @type {number} */
    this.x = 0;
    /** @type {number} */
    this.z = 6.5;
    /** @type {number} */
    this.y = this.terrain ? this.terrain.getHeightAt(this.x, this.z) : 0;
    /** @type {number} */
    this.vx = 0;
    /** @type {number} */
    this.vz = 0;
    /** @type {number} */
    this.facingAngle = Math.PI;

    // Core Survival & Roguelike Progression Stats
    /** @type {number} */
    this.maxHp = CONFIG.PLAYER?.MAX_HP || 160;
    /** @type {number} */
    this.hp = this.maxHp;
    /** @type {number} */
    this.level = 1;
    /** @type {number} */
    this.xp = 0;
    /** @type {number} */
    this.nextLevelXp = 100;
    /** @type {number} */
    this.kills = 0;
    /** @type {number} */
    this.mutantsSlain = 0;
    /** @type {{ wood: number, crystal: number, biomass: number }} */
    this.resources = {
      wood: 40,
      crystal: 20,
      biomass: 15,
    };
    /** @type {string[]} List of applied roguelike upgrade IDs */
    this.upgrades = [];
    /** @type {number} Unspent level-up picks waiting for modal selection */
    this.pendingLevelUps = 0;

    // Onboarding & Combat Telemetry Counters
    /** @type {number} Total planar distance walked by the player */
    this.distanceMoved = 0;
    /** @type {number} Total cleave attack swings performed */
    this.attackSwings = 0;
    /** @type {number} Total cleave hits landed on enemies */
    this.hitsLanded = 0;
    /** @type {number} Total dashes performed (`Shift` or `Right Click`) */
    this.dashCount = 0;
    /** @type {number} Total resource nodes harvested */
    this.harvestCount = 0;
    /** @type {number} Total survivor cages rescued */
    this.cagesRescuedCount = 0;

    // Event Callbacks for HUD / Floating Damage Numbers / Tutorial Progression
    /** @type {Function|null} `(level, player)` */
    this.onLevelUp = null;
    /** @type {Function|null} `(enemy, damageAmount, killed)` */
    this.onDamageDealt = null;
    /** @type {Function|null} `(rescuedNpc, cage)` */
    this.onCageRescued = null;
    /** @type {Function|null} `(resourceType, amount, worldPos)` */
    this.onResourceHarvested = null;

    /** @type {{ type: string, label: string, keyHint: string, worldPos: THREE.Vector3, entity: Object }|null} */
    this.nearestPrompt = null;

    // Combat & Mobility Modifiers
    this.baseSpeed = CONFIG.PLAYER?.SPEED || 13.5;
    this.speedMult = 1.0;
    this.cleaveDamage = CONFIG.PLAYER?.CLEAVE_DAMAGE || 32;
    this.cleaveDamageMult = 1.0;
    this.mutantDamageMult = 1.0;
    this.cleaveRange = CONFIG.PLAYER?.CLEAVE_RANGE || 5.2;
    this.cleaveCooldown = 0;
    this.cleaveAnimTimer = 0;

    this.dashSpeed = CONFIG.PLAYER?.DASH_SPEED || 30;
    this.dashDuration = CONFIG.PLAYER?.DASH_DURATION || 0.22;
    this.dashBaseCooldown = CONFIG.PLAYER?.DASH_COOLDOWN || 1.4;
    this.dashCooldownMult = 1.0;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.dashDirX = 0;
    this.dashDirZ = -1;

    this.regenPerSec = 1.2;
    this.damageReduction = 0.0;
    this.scoutVisionMult = 1.0;
    this.scoutSpeedMult = 1.0;
    this.turretDamageMult = 1.0;
    this.juvenilePurge = false;
    this.patientZeroTracker = false;

    this.interactCooldown = 0;
    this.lastBastionRef = null;
    this.lastEnemyManagerRef = null;

    // Quest / Tutorial Directional Target
    /** @type {{ x: number, z: number }|null} */
    this.targetWorldPos = null;

    // Build Articulated 3D Hero Mesh, Ground Range Ring, Cleave Slash Arc, and Golden Quest Arrow
    /** @type {THREE.Group|null} */
    this.mesh = null;
    /** @type {THREE.Mesh|null} */
    this.slashArcMesh = null;
    /** @type {THREE.Mesh|null} */
    this.attackRangeRingMesh = null;
    /** @type {THREE.Mesh|null} */
    this.attackConeMesh = null;
    /** @type {THREE.Group|null} */
    this.questArrowMesh = null;

    if (this.scene) {
      this.mesh = buildCreatureMesh({ type: 'player' });
      this.mesh.position.set(this.x, this.y, this.z);
      this.scene.add(this.mesh);

      // 1. Animated 3D Sword Cleave Slash Arc
      const arcGeo = new THREE.RingGeometry(1.4, this.cleaveRange, 24, 1, -Math.PI * 0.48, Math.PI * 0.96);
      arcGeo.rotateX(-Math.PI / 2);
      arcGeo.rotateY(Math.PI / 2);
      const arcMat = new THREE.MeshBasicMaterial({
        color: 0x48dbfb,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0,
      });
      this.slashArcMesh = new THREE.Mesh(arcGeo, arcMat);
      this.slashArcMesh.position.y = 0.85;
      this.slashArcMesh.visible = false;
      this.mesh.add(this.slashArcMesh);

      // 2. 3D Ground Attack Range Ring + Forward Strike Cone (lights up when enemies are near)
      const rangeRingGeo = new THREE.RingGeometry(this.cleaveRange - 0.14, this.cleaveRange, 40);
      rangeRingGeo.rotateX(-Math.PI / 2);
      const rangeRingMat = new THREE.MeshBasicMaterial({
        color: 0x48dbfb,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      this.attackRangeRingMesh = new THREE.Mesh(rangeRingGeo, rangeRingMat);
      this.attackRangeRingMesh.position.y = 0.08;
      this.attackRangeRingMesh.visible = false;
      this.mesh.add(this.attackRangeRingMesh);

      const coneGeo = new THREE.RingGeometry(0.9, this.cleaveRange - 0.14, 24, 1, -Math.PI * 0.42, Math.PI * 0.84);
      coneGeo.rotateX(-Math.PI / 2);
      coneGeo.rotateY(Math.PI / 2);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xffd166,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      this.attackConeMesh = new THREE.Mesh(coneGeo, coneMat);
      this.attackConeMesh.position.y = 0.07;
      this.attackConeMesh.visible = false;
      this.mesh.add(this.attackConeMesh);

      // 3. 3D Golden Directional Quest Arrow at Player's Feet
      this.questArrowMesh = this._buildGoldenQuestArrow();
      this.questArrowMesh.visible = false;
      this.scene.add(this.questArrowMesh);
    }

    /** @type {THREE.Vector3} Synced position vector for camera/UI consumers */
    this.position = this.mesh ? this.mesh.position : new THREE.Vector3(this.x, this.y, this.z);
    this.pos = this.position;

    // Input State
    /** @type {Set<string>} */
    this.keys = new Set();
    this._attackRequested = false;
    this._dashRequested = false;
    this._interactRequested = false;
    this._rightDownTime = 0;
    this._rightDownPos = { x: 0, y: 0 };

    this._bindInputs();
  }

  /**
   * Builds the sculpted 3D Golden Quest Arrow (`questArrowMesh`) that orbits at the player's
   * feet pointing toward the active tutorial or Patient Zero objective.
   * @returns {THREE.Group}
   */
  _buildGoldenQuestArrow() {
    const group = new THREE.Group();
    group.name = 'PlayerQuestArrow';

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0xe6a145,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.75,
    });

    const pointerOffset = new THREE.Group();
    pointerOffset.position.set(0, 0.32, 2.35);

    const headGeo = new THREE.ConeGeometry(0.38, 0.78, 4);
    headGeo.rotateX(Math.PI / 2);
    const arrowHead = new THREE.Mesh(headGeo, goldMat);
    arrowHead.position.z = 0.35;

    const shaftGeo = new THREE.BoxGeometry(0.24, 0.12, 0.65);
    const arrowShaft = new THREE.Mesh(shaftGeo, goldMat);
    arrowShaft.position.z = -0.22;

    const baseRingGeo = new THREE.RingGeometry(1.15, 1.32, 28);
    baseRingGeo.rotateX(-Math.PI / 2);
    const baseRing = new THREE.Mesh(
      baseRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.42,
      })
    );
    baseRing.position.y = 0.08;

    pointerOffset.add(arrowHead, arrowShaft);
    group.add(baseRing, pointerOffset);
    group.userData.pointerOffset = pointerOffset;
    return group;
  }

  /**
   * Sets or clears the 3D Golden Quest Arrow target coordinate (`{ x, z }`).
   * Also updates the 3D world tutorial waypoint beacon if `vfx.setTutorialWaypoint` is available.
   *
   * @param {{x: number, z: number}|number|null} posOrX - Target `{x, z}` object, X coordinate, or `null` to clear.
   * @param {number} [zCoord] - Z coordinate if first parameter was numeric X.
   * @param {boolean} [showWorldBeacon=true] - Whether to also display the 3D ground beacon at the target.
   */
  setQuestTarget(posOrX, zCoord, showWorldBeacon = true) {
    if (posOrX === null || posOrX === undefined) {
      this.clearQuestTarget();
      return;
    }

    let tx = 0;
    let tz = 0;
    if (typeof posOrX === 'number' && typeof zCoord === 'number') {
      tx = posOrX;
      tz = zCoord;
    } else if (typeof posOrX === 'object') {
      tx = Number(posOrX.x ?? 0);
      tz = Number(posOrX.z ?? 0);
    }

    this.targetWorldPos = { x: tx, z: tz };
    if (this.questArrowMesh) {
      this.questArrowMesh.visible = true;
    }

    if (this.vfx && typeof this.vfx.setTutorialWaypoint === 'function') {
      const ty = this.terrain ? this.terrain.getHeightAt(tx, tz) : 0;
      this.vfx.setTutorialWaypoint(new THREE.Vector3(tx, ty, tz), showWorldBeacon, 0xffd166);
    }
  }

  /**
   * Hides the 3D Golden Quest Arrow and any active tutorial waypoint beacon.
   */
  clearQuestTarget() {
    this.targetWorldPos = null;
    if (this.questArrowMesh) {
      this.questArrowMesh.visible = false;
    }
    if (this.vfx && typeof this.vfx.setTutorialWaypoint === 'function') {
      this.vfx.setTutorialWaypoint(new THREE.Vector3(0, 0, 0), false);
    }
  }

  /**
   * Binds keyboard (`WASD` / `ZQSD` / Arrows / `Space` / `Shift` / `E`) and mouse listeners.
   */
  _bindInputs() {
    if (typeof window === 'undefined') return;

    this._onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : '';
      this.keys.add(code);
      this.keys.add(key);

      if (code === 'Space') {
        this._attackRequested = true;
      } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
        this._dashRequested = true;
      } else if (code === 'KeyE' || key === 'e') {
        this._interactRequested = true;
      }
    };

    this._onKeyUp = (e) => {
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : '';
      this.keys.delete(code);
      this.keys.delete(key);
    };

    this._onMouseDown = (e) => {
      // Ignore clicks on HUD buttons, panels, or modals
      if (
        e.target &&
        e.target.closest &&
        e.target.closest(
          'button, .hud-panel, .hud-side-panel, .hud-top-bar, .hud-onboarding-banner, .modal-overlay, .hud-modal-backdrop, #hud-root button'
        )
      ) {
        return;
      }
      if (e.button === 0) {
        this._attackRequested = true;
      } else if (e.button === 2) {
        this._rightDownTime = performance.now();
        this._rightDownPos = { x: e.clientX, y: e.clientY };
      }
    };

    this._onMouseUp = (e) => {
      if (e.button === 2 && this._rightDownTime > 0) {
        const elapsed = performance.now() - this._rightDownTime;
        const moveDist = Math.hypot(e.clientX - this._rightDownPos.x, e.clientY - this._rightDownPos.y);
        // Quick right-click (not camera orbit drag) triggers Dash / Dodge Roll!
        if (elapsed < 260 && moveDist < 12) {
          this._dashRequested = true;
        }
        this._rightDownTime = 0;
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  /**
   * Triggers a wide 3D Cleave Attack, damaging all enemies within the forward frontal arc
   * (plus 360° close-range spin tolerance so combat feels snappy and generous).
   *
   * @param {Object} enemyManager - EnemyManager instance.
   * @param {Object} [bastionAndNpcs] - BastionAndNPCs instance.
   * @returns {number} Number of enemies hit.
   */
  performCleaveAttack(enemyManager, bastionAndNpcs) {
    if (this.cleaveCooldown > 0) return 0;

    this.cleaveCooldown = CONFIG.PLAYER?.CLEAVE_COOLDOWN || 0.4;
    this.cleaveAnimTimer = 0.28;
    this.attackSwings++;

    if (this.slashArcMesh) {
      this.slashArcMesh.visible = true;
      this.slashArcMesh.material.opacity = 0.85;
      this.slashArcMesh.scale.setScalar(1.0);
    }

    if (!enemyManager || typeof enemyManager.getEnemies !== 'function') return 0;

    const enemies = enemyManager.getEnemies();

    // Auto-orient toward nearest enemy within cleaveRange if one is right next to the player
    let closestInRange = null;
    let closestDist = this.cleaveRange + 0.6;
    for (const enemy of enemies) {
      const d = dist2D(this.x, this.z, enemy.x, enemy.z);
      if (d < closestDist) {
        closestDist = d;
        closestInRange = enemy;
      }
    }
    if (closestInRange) {
      this.facingAngle = Math.atan2(closestInRange.x - this.x, closestInRange.z - this.z);
    }

    const forwardX = Math.sin(this.facingAngle);
    const forwardZ = Math.cos(this.facingAngle);
    let hitCount = 0;

    // Copy list in case enemies are removed on death
    const candidates = [...enemies];
    for (const enemy of candidates) {
      const dx = enemy.x - this.x;
      const dz = enemy.z - this.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= this.cleaveRange + 0.4) {
        // Check directional dot product (generous 240° forward cone or close < 2.8u)
        const invDist = dist > 0.001 ? 1 / dist : 1;
        const dot = (dx * forwardX + dz * forwardZ) * invDist;

        if (dot >= -0.45 || dist <= 2.8) {
          const isMutantOrHybrid =
            Boolean(enemy.genome?.isHybrid) ||
            (Array.isArray(enemy.genome?.mutations) && enemy.genome.mutations.length > 0);

          let dmg = this.cleaveDamage * this.cleaveDamageMult;
          if (isMutantOrHybrid) {
            dmg *= this.mutantDamageMult;
          }
          const roundedDmg = Math.round(dmg);

          const knockDir = { x: dx * invDist, z: dz * invDist };
          const res = enemyManager.damageEnemy(enemy.id, roundedDmg, knockDir);
          hitCount++;
          this.hitsLanded++;

          if (typeof this.onDamageDealt === 'function') {
            this.onDamageDealt(enemy, roundedDmg, Boolean(res.killed));
          }

          if (res.killed) {
            this.kills++;
            if (isMutantOrHybrid) {
              this.mutantsSlain++;
              this.resources.biomass += 6;
            } else {
              this.resources.biomass += 2;
            }
            this.gainXp(res.xpGained || 20);
          }
        }
      }
    }

    // Also allow Cleave/Action to rescue an adjacent cage if within reach
    if (bastionAndNpcs && typeof bastionAndNpcs.tryRescueNearestCage === 'function') {
      const rescued = bastionAndNpcs.tryRescueNearestCage(this.x, this.z, this.resources);
      if (rescued) {
        this.cagesRescuedCount++;
        this.gainXp(35);
        if (typeof this.onCageRescued === 'function') {
          this.onCageRescued(rescued);
        }
      }
    }

    return hitCount;
  }

  /**
   * Triggers a high-speed Dodge Roll / Dash in the current movement or facing direction.
   */
  performDash() {
    if (this.dashCooldown > 0 || this.dashTimer > 0) return;
    this.dashTimer = this.dashDuration;
    this.dashCooldown = this.dashBaseCooldown * this.dashCooldownMult;
    this.dashDirX = Math.sin(this.facingAngle);
    this.dashDirZ = Math.cos(this.facingAngle);
    this.dashCount++;

    if (this.vfx && typeof this.vfx.spawnHitEffect === 'function') {
      this.vfx.spawnHitEffect(new THREE.Vector3(this.x, this.y + 0.5, this.z), 0x48dbfb);
    }
  }

  /**
   * Interacts with nearby Prisoner Cages, Resource Nodes (Wood/Crystal), or Bastion healing hearth.
   * @param {Object} bastionAndNpcs
   */
  interact(bastionAndNpcs) {
    if (this.interactCooldown > 0) return;
    this.interactCooldown = 0.35;

    // 1. Rescue Prisoner Cage if nearby
    if (bastionAndNpcs && typeof bastionAndNpcs.tryRescueNearestCage === 'function') {
      const rescued = bastionAndNpcs.tryRescueNearestCage(
        this.x,
        this.z,
        this.resources,
        (CONFIG.PLAYER?.INTERACT_RADIUS || 5.5) + 3.0
      );
      if (rescued) {
        this.cagesRescuedCount++;
        this.gainXp(35);
        if (typeof this.onCageRescued === 'function') {
          this.onCageRescued(rescued);
        }
        return;
      }
    }

    // 2. Harvest nearby Terrain Resource Node (Wood / Crystal)
    if (this.terrain && typeof this.terrain.getNearestResourceNode === 'function') {
      const node = this.terrain.getNearestResourceNode(this.x, this.z, 8.5);
      if (node) {
        this.harvestCount++;
        if (node.type === 'crystal') {
          this.resources.crystal += 6;
          logger.info('PLAYER', 'Cristal récolté (+6 Cristal).', { crystal: this.resources.crystal });
          if (typeof this.onResourceHarvested === 'function') {
            this.onResourceHarvested('crystal', 6, new THREE.Vector3(node.x, this.y + 1, node.z));
          }
        } else {
          this.resources.wood += 8;
          logger.info('PLAYER', 'Bois ancien récolté (+8 Bois).', { wood: this.resources.wood });
          if (typeof this.onResourceHarvested === 'function') {
            this.onResourceHarvested('wood', 8, new THREE.Vector3(node.x, this.y + 1, node.z));
          }
        }
        if (this.vfx && typeof this.vfx.spawnHitEffect === 'function') {
          this.vfx.spawnHitEffect(new THREE.Vector3(this.x, this.y + 0.8, this.z), 0x38c172);
        }
        return;
      }
    }

    // Fallback ambient foraging so pressing [E] always gives clear feedback
    this.harvestCount++;
    this.resources.wood += 5;
    this.resources.crystal += 2;
    logger.info('PLAYER', 'Récolte de matériaux (+5 Bois, +2 Cristal).', {
      wood: this.resources.wood,
      crystal: this.resources.crystal,
    });
    if (this.vfx && typeof this.vfx.spawnHitEffect === 'function') {
      this.vfx.spawnHitEffect(new THREE.Vector3(this.x, this.y + 0.8, this.z), 0x38c172);
    }
    if (typeof this.onResourceHarvested === 'function') {
      this.onResourceHarvested('wood', 5, new THREE.Vector3(this.x, this.y + 1, this.z));
    }
  }

  /**
   * Applies incoming damage to the player (reduced by armor/fire resistance upgrades or dash i-frames).
   * @param {number} amount - Raw incoming damage.
   * @param {boolean} [isElemental=false] - Whether damage is from an elemental mutation.
   */
  takeDamage(amount, isElemental = false) {
    if (this.dashTimer > 0) return;

    let finalDmg = amount * (1 - this.damageReduction * (isElemental ? 1.25 : 0.7));
    finalDmg = Math.max(1, Math.round(finalDmg));
    this.hp = Math.max(0, this.hp - finalDmg);

    if (this.vfx && typeof this.vfx.spawnHitEffect === 'function') {
      this.vfx.spawnHitEffect(new THREE.Vector3(this.x, this.y + 1.0, this.z), 0xff4757);
    }

    if (this.hp <= 0) {
      this.hp = Math.round(this.maxHp * 0.65);
      this.x = 0;
      this.z = 5.5;
      logger.warn('PLAYER', 'Repli d’urgence au Sanctuaire du Bastion ! Vitalité restaurée.', {
        hp: this.hp,
      });
    }
  }

  /**
   * Awards XP to the player and triggers roguelike Level-Up progression when threshold is reached.
   * @param {number} amount - XP gained.
   */
  gainXp(amount) {
    if (!amount || amount <= 0) return;
    this.xp += amount;
    while (this.xp >= this.nextLevelXp) {
      this.xp -= this.nextLevelXp;
      this.level++;
      this.nextLevelXp = Math.round(this.nextLevelXp * 1.35);
      this.maxHp += 15;
      this.hp = Math.min(this.maxHp, this.hp + 35);
      this.pendingLevelUps++;

      logger.info('PLAYER', `Niveau ${this.level} atteint ! Choisissez une adaptation roguelike.`, {
        level: this.level,
      });

      if (typeof this.onLevelUp === 'function') {
        this.onLevelUp(this.level, this);
      }
    }
  }

  /**
   * Applies a chosen roguelike upgrade card to the player, Bastion, and Scouts.
   * Supports both `CONFIG.UPGRADES` IDs and `BalanceAndPacing.js` `DESIGNED_UPGRADES` IDs.
   *
   * @param {string} upgradeId - Upgrade identifier.
   * @returns {boolean} True if applied.
   */
  applyUpgrade(upgradeId) {
    if (!upgradeId) return false;
    this.upgrades.push(upgradeId);
    if (this.pendingLevelUps > 0) {
      this.pendingLevelUps--;
    }

    switch (upgradeId) {
      case 'cleave_damage':
      case 'pyrophage_blade':
        this.cleaveDamageMult *= 1.35;
        this.mutantDamageMult *= 1.25;
        break;
      case 'move_speed':
      case 'strider_boots':
        this.speedMult *= 1.2;
        this.dashCooldownMult *= 0.75;
        break;
      case 'max_hp_regen':
      case 'amber_blood_vigor':
        this.maxHp += 50;
        this.hp = Math.min(this.maxHp, this.hp + 60);
        this.regenPerSec += 2.5;
        break;
      case 'scout_vision':
      case 'scout_falconry':
        this.scoutVisionMult *= 1.35;
        this.scoutSpeedMult *= 1.2;
        if (this.lastBastionRef) {
          this.lastBastionRef.scoutVisionMultiplier = this.scoutVisionMult;
          this.lastBastionRef.scoutSpeedMultiplier = this.scoutSpeedMult;
        }
        break;
      case 'bastion_turret_power':
      case 'thorn_bulwark':
        this.turretDamageMult *= 1.4;
        if (this.lastBastionRef) {
          this.lastBastionRef.turretDamageMultiplier = this.turretDamageMult;
          this.lastBastionRef.maxHp += 150;
          this.lastBastionRef.hp = Math.min(this.lastBastionRef.maxHp, this.lastBastionRef.hp + 150);
        }
        break;
      case 'fire_resist':
        this.damageReduction = Math.min(0.65, this.damageReduction + 0.35);
        this.cleaveRange += 1.2;
        break;
      case 'patient_zero_tracker':
        this.patientZeroTracker = true;
        this.speedMult *= 1.18;
        this.mutantDamageMult *= 1.35;
        break;
      case 'juvenile_purge':
        this.juvenilePurge = true;
        this.cleaveDamageMult *= 1.25;
        break;
      default:
        this.cleaveDamageMult *= 1.2;
        break;
    }

    logger.info('PLAYER', `Amélioration activée : [${upgradeId}]`, {
      upgradeId,
      level: this.level,
      totalUpgrades: this.upgrades.length,
    });

    return true;
  }

  /**
   * Updates the 3D ground attack range indicator, golden quest arrow, and contextual interaction prompt.
   * @private
   */
  _updateTacticalIndicators(elapsedTime, enemyManager, bastionAndNpcs) {
    const enemies =
      enemyManager && typeof enemyManager.getEnemies === 'function' ? enemyManager.getEnemies() : [];

    // 1. Find nearest enemy & check if within Cleave Range
    let nearestEnemy = null;
    let nearestEnemyDist = Infinity;
    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      const d = dist2D(this.x, this.z, e.x, e.z);
      if (d < nearestEnemyDist) {
        nearestEnemyDist = d;
        nearestEnemy = e;
      }
    }

    if (this.attackRangeRingMesh && this.attackConeMesh) {
      const showCombatRing = nearestEnemyDist <= this.cleaveRange + 6.5 || this.cleaveAnimTimer > 0;
      this.attackRangeRingMesh.visible = showCombatRing;
      this.attackConeMesh.visible = showCombatRing;

      if (showCombatRing) {
        const inStrikeReach = nearestEnemyDist <= this.cleaveRange + 0.4;
        const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 7.0);
        this.attackRangeRingMesh.material.color.setHex(inStrikeReach ? 0xffd166 : 0x48dbfb);
        this.attackRangeRingMesh.material.opacity = inStrikeReach ? 0.45 + pulse * 0.25 : 0.22;
        this.attackConeMesh.material.color.setHex(inStrikeReach ? 0xff4757 : 0x48dbfb);
        this.attackConeMesh.material.opacity = inStrikeReach ? 0.22 + pulse * 0.14 : 0.1;
      }
    }

    // 2. Update 3D Golden Quest Arrow pointing toward `this.targetWorldPos`
    if (this.questArrowMesh) {
      if (
        this.targetWorldPos &&
        typeof this.targetWorldPos.x === 'number' &&
        typeof this.targetWorldPos.z === 'number'
      ) {
        const distToGoal = dist2D(this.x, this.z, this.targetWorldPos.x, this.targetWorldPos.z);
        if (distToGoal > 2.4) {
          this.questArrowMesh.visible = true;
          this.questArrowMesh.position.set(
            this.x,
            Math.max(this.y, CONFIG.WORLD.WATER_LEVEL + 0.18),
            this.z
          );
          const angle = Math.atan2(this.targetWorldPos.x - this.x, this.targetWorldPos.z - this.z);
          this.questArrowMesh.rotation.y = angle;
          const pointer = this.questArrowMesh.userData?.pointerOffset;
          if (pointer) {
            pointer.position.z = 2.25 + Math.sin(elapsedTime * 6.0) * 0.25;
            pointer.position.y = 0.32 + Math.abs(Math.sin(elapsedTime * 6.0)) * 0.12;
          }
        } else {
          this.questArrowMesh.visible = false;
        }
      } else {
        this.questArrowMesh.visible = false;
      }
    }

    // 3. Compute nearest contextual action prompt (`nearestPrompt`) for HUD screen-space bubbles
    this.nearestPrompt = null;

    // Priority A: Unrescued Cage within 8m
    if (bastionAndNpcs && Array.isArray(bastionAndNpcs.cages)) {
      for (const cage of bastionAndNpcs.cages) {
        if (!cage || cage.rescued) continue;
        const dCage = dist2D(this.x, this.z, cage.x, cage.z);
        if (dCage <= 8.5) {
          this.nearestPrompt = {
            type: 'rescue',
            keyHint: '[E]',
            label: '[E] Libérer le Survivant',
            worldPos: new THREE.Vector3(cage.x, (cage.y || 2) + 2.6, cage.z),
            entity: cage,
            dist: dCage,
          };
          break;
        }
      }
    }

    // Priority B: Enemy within Cleave Attack reach (7.5m)
    if (!this.nearestPrompt && nearestEnemy && nearestEnemyDist <= this.cleaveRange + 2.5) {
      const inReach = nearestEnemyDist <= this.cleaveRange + 0.4;
      this.nearestPrompt = {
        type: 'attack',
        keyHint: '[Clic Gauche / Espace]',
        label: inReach
          ? '[Clic Gauche / Espace : Frapper !]'
          : 'Approchez pour frapper [Clic Gauche]',
        worldPos: new THREE.Vector3(
          nearestEnemy.x,
          (nearestEnemy.y || 2) + 2.2,
          nearestEnemy.z
        ),
        entity: nearestEnemy,
        dist: nearestEnemyDist,
      };
    }

    // Priority C: Resource Node within 7m
    if (
      !this.nearestPrompt &&
      this.terrain &&
      typeof this.terrain.getNearestResourceNode === 'function'
    ) {
      const node = this.terrain.getNearestResourceNode(this.x, this.z, 7.0);
      if (node) {
        const resName = node.type === 'crystal' ? 'Cristal' : 'Bois';
        const ny = this.terrain.getHeightAt(node.x, node.z);
        this.nearestPrompt = {
          type: 'harvest',
          keyHint: '[E]',
          label: `[E] Récolter (${resName})`,
          worldPos: new THREE.Vector3(node.x, ny + 2.0, node.z),
          entity: node,
          dist: dist2D(this.x, this.z, node.x, node.z),
        };
      }
    }
  }

  /**
   * Main per-frame update for player movement, cleave attack, dash, passive Bastion healing,
   * automatic nearby cage rescue, tactical indicators, and 3D hero animation.
   *
   * @param {number} dt - Frame delta time in seconds.
   * @param {number} elapsedTime - Total elapsed game time in seconds.
   * @param {Object} enemyManager - EnemyManager instance.
   * @param {Object} bastionAndNpcs - BastionAndNPCs instance.
   * @param {number} [cameraYaw=0] - Current camera orbit yaw angle in radians.
   */
  update(dt, elapsedTime, enemyManager, bastionAndNpcs, cameraYaw = 0) {
    this.lastBastionRef = bastionAndNpcs || this.lastBastionRef;
    this.lastEnemyManagerRef = enemyManager || this.lastEnemyManagerRef;

    this.cleaveCooldown = Math.max(0, this.cleaveCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.interactCooldown = Math.max(0, this.interactCooldown - dt);

    // 1. Read WASD / ZQSD / Arrow movement input
    let inputX = 0;
    let inputZ = 0;
    if (
      this.keys.has('KeyW') ||
      this.keys.has('KeyZ') ||
      this.keys.has('ArrowUp') ||
      this.keys.has('w') ||
      this.keys.has('z')
    ) {
      inputZ -= 1;
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.keys.has('s')) {
      inputZ += 1;
    }
    if (
      this.keys.has('KeyA') ||
      this.keys.has('KeyQ') ||
      this.keys.has('ArrowLeft') ||
      this.keys.has('a')
    ) {
      inputX -= 1;
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.keys.has('d')) {
      inputX += 1;
    }

    // Rotate planar input vector by cameraYaw so 'Up' always moves toward camera forward
    let moveX = 0;
    let moveZ = 0;
    const isMoving = inputX !== 0 || inputZ !== 0;

    if (isMoving) {
      const len = Math.hypot(inputX, inputZ);
      const nx = inputX / len;
      const nz = inputZ / len;
      const cosY = Math.cos(cameraYaw);
      const sinY = Math.sin(cameraYaw);
      moveX = nx * cosY + nz * sinY;
      moveZ = nz * cosY - nx * sinY;
      this.facingAngle = Math.atan2(moveX, moveZ);
    }

    // 2. Handle Dash or Normal Movement
    if (this._dashRequested) {
      this._dashRequested = false;
      this.performDash();
    }

    let currentSpeed = 0;
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      currentSpeed = this.dashSpeed;
      this.vx = this.dashDirX * currentSpeed;
      this.vz = this.dashDirZ * currentSpeed;
    } else if (isMoving) {
      currentSpeed = this.baseSpeed * this.speedMult;
      this.vx = moveX * currentSpeed;
      this.vz = moveZ * currentSpeed;
    } else {
      this.vx *= 0.75;
      this.vz *= 0.75;
    }

    const prevX = this.x;
    const prevZ = this.z;
    const worldHalf = (CONFIG.WORLD?.SIZE || 240) * 0.45;
    this.x = clamp(this.x + this.vx * dt, -worldHalf, worldHalf);
    this.z = clamp(this.z + this.vz * dt, -worldHalf, worldHalf);
    this.y = this.terrain ? this.terrain.getHeightAt(this.x, this.z) : 0;

    const stepMoved = Math.hypot(this.x - prevX, this.z - prevZ);
    if (stepMoved > 0.001) {
      this.distanceMoved += stepMoved;
    }

    // Keep player above water level
    if (this.y < CONFIG.WORLD.WATER_LEVEL + 0.15) {
      const toCenter = Math.atan2(-this.z, -this.x);
      this.x += Math.cos(toCenter) * 8 * dt;
      this.z += Math.sin(toCenter) * 8 * dt;
      this.y = this.terrain ? this.terrain.getHeightAt(this.x, this.z) : 0;
    }

    // 3. Handle Cleave Attack & Interact Requests
    if (this._attackRequested) {
      this._attackRequested = false;
      this.performCleaveAttack(enemyManager, bastionAndNpcs);
    }
    if (this._interactRequested) {
      this._interactRequested = false;
      this.interact(bastionAndNpcs);
    }

    // Auto-rescue prisoner cages when the player walks directly next to them (< 4.2 units)
    if (bastionAndNpcs && typeof bastionAndNpcs.tryRescueNearestCage === 'function') {
      const autoRescued = bastionAndNpcs.tryRescueNearestCage(this.x, this.z, this.resources, 4.2);
      if (autoRescued) {
        this.cagesRescuedCount++;
        this.gainXp(35);
        if (typeof this.onCageRescued === 'function') {
          this.onCageRescued(autoRescued);
        }
      }
    }

    // 4. Passive HP Regeneration & Bastion Sanctuary Hearth Healing
    const distToBastion = Math.hypot(this.x, this.z);
    const inBastion = distToBastion <= (CONFIG.BASTION?.RADIUS || 14);
    const healRate = this.regenPerSec + (inBastion ? CONFIG.BASTION?.HEAL_RATE || 12 : 0);
    if (this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + healRate * dt);
    }

    // 5. Update Cleave Slash Arc VFX & Hero 3D Mesh
    if (this.cleaveAnimTimer > 0) {
      this.cleaveAnimTimer = Math.max(0, this.cleaveAnimTimer - dt);
      if (this.slashArcMesh) {
        const progress = 1 - this.cleaveAnimTimer / 0.28;
        this.slashArcMesh.material.opacity = (1 - progress) * 0.85;
        this.slashArcMesh.scale.setScalar(0.85 + progress * 0.3);
        if (this.cleaveAnimTimer <= 0) {
          this.slashArcMesh.visible = false;
        }
      }
    }

    if (this.mesh) {
      this.mesh.position.set(this.x, Math.max(this.y, CONFIG.WORLD.WATER_LEVEL + 0.15), this.z);
      this.mesh.rotation.y = this.facingAngle;

      animateCreatureMesh(
        this.mesh,
        {
          isMoving: isMoving || this.dashTimer > 0,
          speed: currentSpeed,
          isAttacking: this.cleaveAnimTimer > 0,
          attackProgress: this.cleaveAnimTimer > 0 ? 1 - this.cleaveAnimTimer / 0.28 : 0,
        },
        elapsedTime,
        dt
      );
    } else {
      this.position.set(this.x, this.y, this.z);
    }

    // 6. Update 3D Ground Range Ring, Golden Quest Arrow & Contextual Action Bubbles
    this._updateTacticalIndicators(elapsedTime, enemyManager, bastionAndNpcs);
  }
}

export default PlayerController;
