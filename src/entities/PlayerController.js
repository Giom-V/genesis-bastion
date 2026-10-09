/**
 * @fileoverview Player Action-Roguelike Controller, Dual Combat Modes ("Vampire Survivors" Auto-Cast
 * vs "Diablo" Active ARPG), 8-Spell 3D Ability Arsenal, Adaptive Mastery System Integration,
 * 3D Ground Attack Range Indicator, and 3D Golden Quest Arrow.
 *
 * Capabilities:
 * 1. **Dual Combat Modes (`combatMode`)**:
 *    - `'vampire_survivors'` (Auto-Battler): Hero automatically swings their Rune Greatsword when
 *      enemies enter cleave range and auto-casts all unlocked 3D spells as soon as cooldowns are ready.
 *    - `'diablo_action'` (Action-RPG): Hero attacks with `Left Click` / `Space`, dashes with
 *      `Right Click` / `Shift`, and triggers equipped active spells with keys `[1] [2] [3] [4]`
 *      (or HUD skill bar clicks).
 * 2. **8-Spell Evolvable 3D Ability Arsenal (Levels 1–5)**:
 *    - `spinning_blades` (Lames Orbitales Spectrales — permanent 3D orbiting blades + overdrive pulse)
 *    - `pyro_nova` (Nova Pyroclastique — expanding 3D fire ring + Burn DoT)
 *    - `chain_lightning` (Arc Foudroyant — multi-bounce 3D lightning chain)
 *    - `frost_spear` (Javelot Cryogénique — piercing ice javelins + 50% Cryo Slow)
 *    - `venom_volley` (Salve Venimeuse — cone fan of toxic daggers + Poison DoT)
 *    - `meteor_strike` (Météore d'Ambre — targets highest-Fitness / Patient Zero enemy with AoE meteor)
 *    - `soul_siphon` (Siphon Vampirique — crimson life-drain beams that heal the Hero)
 *    - `seismic_slam` (Onde Sismique — tectonic ground slam with radial Knockback + Stun)
 * 3. **Action-Driven Adaptive Mastery (`AdaptiveMasterySystem`)**:
 *    - Killing a species (`goblin`, `orc`, `troll`, `wolf`, `lion`, `vulture`, `dragon`) increases
 *      damage dealt against that species (`+12%` per rank, starting on the 1st kill).
 *    - Killing mutant carriers (`pyro_gland`, `venom_sacs`, `cryo_blood`, etc.) increases damage
 *      against that mutation (`+15%` per rank) and boosts spell affinity.
 *    - Enduring Fire, Venom, Cryo, or Physical hits builds permanent Adaptive Resistance (`+8..9%`
 *      elemental / `+6%` physical damage reduction per rank).
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { buildCreatureMesh, animateCreatureMesh } from './CreatureMeshBuilder.js';
import {
  COMBAT_MODES,
  ROGUELIKE_ABILITIES_BY_ID,
  getAbilityStatsAtLevel,
  AdaptiveMasterySystem,
} from '../ecosystem/RoguelikeAbilitiesAndMastery.js';
import { dist2D, clamp } from '../utils/math.js';
import { logger } from '../utils/logger.js';

export class PlayerController {
  /**
   * @param {THREE.Scene} scene - Three.js scene to mount player, orbital blades, range ring, and quest arrow.
   * @param {Object} terrain - Terrain instance for height grounding and resource nodes.
   * @param {Object} vfx - VFXManager instance for combat hit, ability, and level-up particles.
   * @param {Object} [options={}] - Optional initial callbacks and combatMode configuration.
   */
  constructor(scene, terrain, vfx, options = {}) {
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
    /** @type {string[]} List of applied roguelike upgrade/ability IDs */
    this.upgrades = [];
    /** @type {number} Unspent level-up picks waiting for modal selection */
    this.pendingLevelUps = 0;

    // Combat Mode ('vampire_survivors' | 'diablo_action') & Active 3D Spell Arsenal
    /** @type {'vampire_survivors'|'diablo_action'} */
    this.combatMode = options.combatMode || 'diablo_action';
    /** @type {Map<string, { id: string, level: number, cooldownRemaining: number, maxCooldown: number, stats: Object }>} */
    this.abilities = new Map();
    /** @type {string[]} Ordered list of unlocked ability IDs (slots 0..3 map to [1]..[4]) */
    this.abilityOrder = [];
    /** @type {AdaptiveMasterySystem} Action-driven mastery & adaptive resistance tracker */
    this.mastery = options.masterySystem instanceof AdaptiveMasterySystem
      ? options.masterySystem
      : new AdaptiveMasterySystem();

    // 3D Orbital Blades state ('spinning_blades')
    /** @type {THREE.Group|null} */
    this.orbitalBladesGroup = null;
    /** @type {number} */
    this.orbitalAngle = 0;
    /** @type {number} */
    this.orbitalOverdriveTimer = 0;
    /** @type {Map<string, number>} enemyId -> cooldown before next orbital blade slice */
    this._orbitalHitTimers = new Map();

    // Onboarding & Combat Telemetry Counters
    /** @type {number} Total planar distance walked by the player */
    this.distanceMoved = 0;
    /** @type {number} Total cleave attack swings performed */
    this.attackSwings = 0;
    /** @type {number} Total cleave/spell hits landed on enemies */
    this.hitsLanded = 0;
    /** @type {number} Total dashes performed (`Shift` or `Right Click`) */
    this.dashCount = 0;
    /** @type {number} Total resource nodes harvested */
    this.harvestCount = 0;
    /** @type {number} Total survivor cages rescued */
    this.cagesRescuedCount = 0;

    // Event Callbacks for HUD / Floating Damage Numbers / Tutorial / Mastery Progression
    /** @type {Function|null} `(level, player)` */
    this.onLevelUp = options.onLevelUp || null;
    /** @type {Function|null} `(enemy, damageAmount, killed)` */
    this.onDamageDealt = options.onDamageDealt || null;
    /** @type {Function|null} `(rescuedNpc, cage)` */
    this.onCageRescued = options.onCageRescued || null;
    /** @type {Function|null} `(resourceType, amount, worldPos)` */
    this.onResourceHarvested = options.onResourceHarvested || null;
    /** @type {Function|null} `(notif)` invoked when a species/mutation/resistance mastery rank increases */
    this.onMasteryRankUp = options.onMasteryRankUp || null;
    /** @type {Function|null} `(abilityId, stats)` invoked when a 3D spell is cast */
    this.onAbilityCast = options.onAbilityCast || null;

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

    // Build Articulated 3D Hero Mesh, Ground Range Ring, Cleave Slash Arc, Orbital Blades Group, and Golden Quest Arrow
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

      // 2. 3D Ground Attack Range Ring + Forward Strike Cone
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

      // 3. 3D Orbital Blades Group ('spinning_blades')
      this.orbitalBladesGroup = new THREE.Group();
      this.orbitalBladesGroup.name = 'PlayerOrbitalBlades';
      this.orbitalBladesGroup.visible = false;
      this.scene.add(this.orbitalBladesGroup);

      // 4. 3D Golden Directional Quest Arrow at Player's Feet
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
    /** @type {number|null} Slot index (0..3) requested via keys [1]..[4] */
    this._requestedAbilitySlot = null;
    this._rightDownTime = 0;
    this._rightDownPos = { x: 0, y: 0 };

    this._bindInputs();
  }

  /**
   * Injects a shared `AdaptiveMasterySystem` instance if created externally by `main.js`.
   * @param {AdaptiveMasterySystem} masterySystem
   */
  setMasterySystem(masterySystem) {
    if (masterySystem) {
      this.mastery = masterySystem;
    }
  }

  /**
   * Sets the active combat gameplay mode (`'vampire_survivors'` vs `'diablo_action'`).
   * Grants the mode's starter 3D ability if the player has no abilities unlocked yet.
   *
   * @param {'vampire_survivors'|'diablo_action'} modeId
   * @param {boolean} [grantStarterIfEmpty=true]
   * @returns {'vampire_survivors'|'diablo_action'}
   */
  setCombatMode(modeId, grantStarterIfEmpty = true) {
    const normalized = modeId === 'vampire_survivors' ? 'vampire_survivors' : 'diablo_action';
    this.combatMode = normalized;
    const modeDef = COMBAT_MODES[normalized];

    if (grantStarterIfEmpty && this.abilities.size === 0 && modeDef?.starterAbilityId) {
      this.unlockOrUpgradeAbility(modeDef.starterAbilityId);
    }

    logger.info('COMBAT', `Mode de combat actif : [${modeDef?.name || normalized}]`, {
      combatMode: this.combatMode,
      abilities: this.abilityOrder,
    });
    return this.combatMode;
  }

  /**
   * Toggles between `'vampire_survivors'` (Auto-Cast) and `'diablo_action'` (Active ARPG `[1-4]`).
   * @returns {'vampire_survivors'|'diablo_action'} The new combat mode.
   */
  toggleCombatMode() {
    const nextMode =
      this.combatMode === 'vampire_survivors' ? 'diablo_action' : 'vampire_survivors';
    return this.setCombatMode(nextMode, true);
  }

  /**
   * Unlocks a new 3D spell from `ROGUELIKE_ABILITIES` at Level 1 or upgrades an existing spell
   * up to `maxLevel` (5).
   *
   * @param {string} abilityId - Spell identifier (e.g. `'spinning_blades'`, `'pyro_nova'`).
   * @returns {Object|null} Updated ability entry `{ id, level, cooldownRemaining, maxCooldown, stats }`.
   */
  unlockOrUpgradeAbility(abilityId) {
    const def = ROGUELIKE_ABILITIES_BY_ID[abilityId];
    if (!def) return null;

    const existing = this.abilities.get(abilityId);
    const nextLevel = existing ? Math.min(def.maxLevel || 5, existing.level + 1) : 1;
    const stats = getAbilityStatsAtLevel(abilityId, nextLevel);

    const entry = {
      id: abilityId,
      level: nextLevel,
      cooldownRemaining: existing ? Math.min(existing.cooldownRemaining, stats.cooldown) : 0,
      maxCooldown: stats.cooldown,
      stats,
    };

    this.abilities.set(abilityId, entry);
    if (!this.abilityOrder.includes(abilityId)) {
      this.abilityOrder.push(abilityId);
    }

    if (abilityId === 'spinning_blades') {
      this._rebuildOrbitalBladesMesh(stats);
    }

    logger.info(
      'COMBAT',
      `${def.icon} Compétence ${existing ? 'améliorée' : 'débloquée'} : [${def.name}] (Niv. ${nextLevel}/${def.maxLevel})`,
      { abilityId, level: nextLevel, damage: stats.damage, cooldown: stats.cooldown }
    );

    return entry;
  }

  /**
   * Rebuilds the 3D orbiting spectral blades (`this.orbitalBladesGroup`) whenever `spinning_blades`
   * is unlocked or leveled up (2 to 6 blades around the Hero).
   * @param {Object} stats - Calculated stats from `getAbilityStatsAtLevel('spinning_blades', level)`.
   * @private
   */
  _rebuildOrbitalBladesMesh(stats) {
    if (!this.orbitalBladesGroup) return;

    while (this.orbitalBladesGroup.children.length > 0) {
      this.orbitalBladesGroup.remove(this.orbitalBladesGroup.children[0]);
    }

    const bladeCount = stats?.count || 2;
    const orbitRadius = stats?.range || 4.0;
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00a8ff,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.85,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });

    for (let i = 0; i < bladeCount; i++) {
      const angle = (i / bladeCount) * Math.PI * 2;
      const holder = new THREE.Group();
      holder.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius);
      holder.rotation.y = -angle;

      const bladeMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), bladeMat);
      bladeMesh.scale.set(1.8, 0.22, 0.65);

      const coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), coreMat);
      coreMesh.scale.set(1.4, 0.35, 0.45);

      holder.add(bladeMesh, coreMesh);
      this.orbitalBladesGroup.add(holder);
    }

    // Subtle orbital track ring
    const ringGeo = new THREE.RingGeometry(orbitRadius - 0.06, orbitRadius + 0.06, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    this.orbitalBladesGroup.add(new THREE.Mesh(ringGeo, ringMat));
    this.orbitalBladesGroup.visible = true;
  }

  /**
   * Returns a dictionary `{ abilityId: level }` of all owned 3D spells for `drawRoguelikeLevelUpChoices`.
   * @returns {Record<string, number>}
   */
  getOwnedAbilitiesMap() {
    const map = {};
    for (const [id, entry] of this.abilities.entries()) {
      map[id] = entry.level;
    }
    return map;
  }

  /**
   * Returns the structured state of the 4-slot (or up to 8-slot in Auto mode) Skill Bar for `HUDManager`.
   * @returns {Array<Object>}
   */
  getSkillBarState() {
    const slots = [];
    const maxSlots = Math.max(4, this.abilityOrder.length);
    for (let i = 0; i < maxSlots; i++) {
      const abilityId = this.abilityOrder[i] || null;
      if (!abilityId) {
        slots.push({
          slotIndex: i,
          keyLabel: `${i + 1}`,
          empty: true,
          id: null,
          name: 'Emplacement Vide',
          icon: '➕',
          level: 0,
          maxLevel: 5,
          cooldownRemaining: 0,
          maxCooldown: 1,
          cooldownRatio: 0,
          isAutoCast: this.combatMode === 'vampire_survivors',
        });
        continue;
      }

      const entry = this.abilities.get(abilityId);
      const stats = entry?.stats || getAbilityStatsAtLevel(abilityId, 1);
      const maxCd = Math.max(0.1, entry?.maxCooldown || stats.cooldown || 1);
      const remCd = Math.max(0, entry?.cooldownRemaining || 0);
      slots.push({
        slotIndex: i,
        keyLabel: `${i + 1}`,
        empty: false,
        id: abilityId,
        name: stats.name,
        icon: stats.icon,
        category: stats.category,
        level: entry?.level || 1,
        maxLevel: stats.maxLevel || 5,
        damage: stats.damage,
        range: stats.range,
        count: stats.count,
        colorHex: stats.colorHex,
        colorCss: stats.colorCss,
        cooldownRemaining: +remCd.toFixed(1),
        maxCooldown: maxCd,
        cooldownRatio: clamp(remCd / maxCd, 0, 1),
        isAutoCast: this.combatMode === 'vampire_survivors',
      });
    }
    return slots;
  }

  /**
   * Returns the live Adaptive Mastery & Resistance summary for the HUD panel.
   * @returns {Object}
   */
  getMasterySummary() {
    return this.mastery ? this.mastery.getSummaryForHUD() : {
      speciesMasteries: [],
      mutationMasteries: [],
      resistances: [],
      totalAdaptationsCount: 0,
    };
  }

  /**
   * Triggers the ability in slot `slotIndex` (`0..3`, bound to keys `[1]..[4]` or HUD skill bar clicks).
   * @param {number} slotIndex - 0-based slot index (`0..3`).
   * @param {Object} [enemyManager] - EnemyManager instance.
   * @returns {boolean} True if cast succeeded.
   */
  triggerAbilitySlot(slotIndex, enemyManager = this.lastEnemyManagerRef) {
    const abilityId = this.abilityOrder[slotIndex];
    if (!abilityId) return false;
    return this.castAbility(abilityId, enemyManager, false, true);
  }

  /**
   * Alias for `triggerAbilitySlot`.
   */
  useAbilitySlot(slotIndex, enemyManager = this.lastEnemyManagerRef) {
    return this.triggerAbilitySlot(slotIndex, enemyManager);
  }

  /**
   * Attaches a `DynamicQuestSystem` instance so kills and quest rewards are synchronized automatically.
   * @param {Object} questSystem
   */
  setQuestSystem(questSystem) {
    if (questSystem) {
      this.questSystem = questSystem;
    }
  }

  /**
   * Credits the Hero with resources (`wood`, `crystal`, `biomass`) and `xp` from a completed Dynamic Quest.
   * @param {Object} rewardEntry - `{ rewards: { wood, crystal, biomass, xp }, title }`
   */
  applyQuestReward(rewardEntry) {
    const r = rewardEntry?.rewards || rewardEntry;
    if (!r) return;
    if (r.wood) this.resources.wood += r.wood;
    if (r.crystal) this.resources.crystal += r.crystal;
    if (r.biomass) this.resources.biomass += r.biomass;
    if (r.xp) this.gainXp(r.xp);
  }

  /**
   * Computes total final damage dealt by the Hero against a specific enemy, combining
   * base weapon/spell multipliers, anti-mutant bonuses (including Bastion Bio-Lab), and
   * `AdaptiveMasterySystem` species/mutation ranks.
   *
   * @param {number} rawDamage
   * @param {Object} enemy
   * @returns {number} Rounded final damage.
   */
  _computeFinalDamageAgainst(rawDamage, enemy) {
    let dmg = rawDamage * this.cleaveDamageMult;
    const isMutantOrHybrid =
      Boolean(enemy?.genome?.isHybrid) ||
      (Array.isArray(enemy?.genome?.mutations) && enemy.genome.mutations.length > 0);
    if (isMutantOrHybrid) {
      dmg *= this.mutantDamageMult;
      if (this.lastBastionRef?.heroMutantDamageBonus > 0) {
        dmg *= 1 + this.lastBastionRef.heroMutantDamageBonus;
      }
    }
    if (this.juvenilePurge && enemy && enemy.isAdult === false) {
      dmg *= 1.35;
    }
    if (this.mastery && typeof this.mastery.getDamageMultiplierAgainst === 'function') {
      dmg *= this.mastery.getDamageMultiplierAgainst(enemy);
    }
    return Math.max(1, Math.round(dmg));
  }

  /**
   * Deals Hero damage to an enemy via `enemyManager.damageEnemy` and invokes `onDamageDealt`.
   * Note: Kill mastery/XP recording happens automatically via `recordEnemyKill` hooked in `EnemyManager.damageEnemy`.
   *
   * @param {Object} enemyManager
   * @param {Object} enemy
   * @param {number} rawDamage
   * @param {{x: number, z: number, strength?: number}|null} [knockDir=null]
   * @returns {{ killed: boolean, finalDmg: number, xpGained: number }}
   * @private
   */
  _dealDamageToEnemy(enemyManager, enemy, rawDamage, knockDir = null) {
    if (!enemyManager || !enemy || enemy.hp <= 0) {
      return { killed: false, finalDmg: 0, xpGained: 0 };
    }
    const finalDmg = this._computeFinalDamageAgainst(rawDamage, enemy);
    const res = enemyManager.damageEnemy(enemy.id, finalDmg, knockDir);
    this.hitsLanded++;

    if (typeof this.onDamageDealt === 'function') {
      this.onDamageDealt(enemy, finalDmg, Boolean(res?.killed));
    }

    // Fallback in case enemyManager didn't have playerRef set yet
    if (res?.killed && !enemy._killRecorded) {
      enemy._killRecorded = true;
      this.recordEnemyKill(enemy, res.xpGained || 20);
    }

    return {
      killed: Boolean(res?.killed),
      finalDmg,
      xpGained: res?.xpGained || 0,
    };
  }

  /**
   * Executes one of the 8 3D Roguelike Abilities (`pyro_nova`, `chain_lightning`, `frost_spear`,
   * `venom_volley`, `meteor_strike`, `soul_siphon`, `seismic_slam`, `spinning_blades`).
   *
   * @param {string} abilityId - Ability identifier.
   * @param {Object} [enemyManager] - EnemyManager instance.
   * @param {boolean} [ignoreCooldown=false] - Force cast even if on cooldown.
   * @param {boolean} [isManualTrigger=false] - True when pressed manually via `[1-4]` in Diablo mode.
   * @returns {boolean} True if ability was cast.
   */
  castAbility(
    abilityId,
    enemyManager = this.lastEnemyManagerRef,
    ignoreCooldown = false,
    isManualTrigger = false
  ) {
    const entry = this.abilities.get(abilityId);
    const level = entry ? entry.level : 1;
    if (entry && !ignoreCooldown && entry.cooldownRemaining > 0) {
      return false;
    }

    const stats = entry?.stats || getAbilityStatsAtLevel(abilityId, level);
    const enemies =
      enemyManager && typeof enemyManager.getEnemies === 'function'
        ? enemyManager.getEnemies().filter((e) => e && e.hp > 0)
        : [];

    // Sort living enemies by distance to the Hero
    const sortedByDist = enemies
      .map((enemy) => ({
        enemy,
        dist: dist2D(this.x, this.z, enemy.x, enemy.z),
      }))
      .sort((a, b) => a.dist - b.dist);

    const nearestEntry = sortedByDist[0] || null;

    // In Vampire Survivors auto-cast mode, only fire when at least 1 enemy is within range
    if (!isManualTrigger && !ignoreCooldown) {
      const triggerRange = abilityId === 'spinning_blades' ? stats.range + 1.5 : stats.range + 1.0;
      if (!nearestEntry || nearestEntry.dist > triggerRange) {
        return false;
      }
    }

    if (entry) {
      entry.cooldownRemaining = stats.cooldown;
      entry.maxCooldown = stats.cooldown;
    }

    const originPos = new THREE.Vector3(this.x, this.y, this.z);
    let hitTargets = [];

    switch (abilityId) {
      case 'spinning_blades': {
        // Active pulse overdrives blade rotation and slices all enemies within range + 1.4m
        this.orbitalOverdriveTimer = 2.6;
        const pulseRange = stats.range + 1.4;
        for (const item of sortedByDist) {
          if (item.dist > pulseRange) break;
          const dx = item.enemy.x - this.x;
          const dz = item.enemy.z - this.z;
          const inv = item.dist > 0.01 ? 1 / item.dist : 1;
          this._dealDamageToEnemy(enemyManager, item.enemy, stats.damage * 1.25, {
            x: dx * inv,
            z: dz * inv,
            strength: 1.6,
          });
          hitTargets.push(new THREE.Vector3(item.enemy.x, item.enemy.y, item.enemy.z));
        }
        if (this.vfx && typeof this.vfx.spawnAbilityVFX === 'function') {
          this.vfx.spawnAbilityVFX('spinning_blades', originPos, hitTargets, {
            radius: stats.range,
            colorHex: stats.colorHex,
          });
        }
        break;
      }

      case 'pyro_nova': {
        // Expanding 3D magma ring burning all enemies within stats.range
        for (const item of sortedByDist) {
          if (item.dist > stats.range) break;
          const dx = item.enemy.x - this.x;
          const dz = item.enemy.z - this.z;
          const inv = item.dist > 0.01 ? 1 / item.dist : 1;
          this._dealDamageToEnemy(enemyManager, item.enemy, stats.damage, {
            x: dx * inv,
            z: dz * inv,
            strength: 2.2,
          });
          if (typeof item.enemy.applyBurn === 'function') {
            item.enemy.applyBurn(stats.extra?.burnDps || 10, stats.extra?.burnDuration || 3.5);
          }
          hitTargets.push(new THREE.Vector3(item.enemy.x, item.enemy.y, item.enemy.z));
        }
        if (this.vfx && typeof this.vfx.spawnAbilityVFX === 'function') {
          this.vfx.spawnAbilityVFX('pyro_nova', originPos, hitTargets, {
            radius: stats.range,
            colorHex: stats.colorHex,
          });
        }
        break;
      }

      case 'chain_lightning': {
        // High-voltage 3D lightning chain bouncing from enemy to enemy (3..7 bounces)
        const maxBounces = stats.count || 3;
        const visitedIds = new Set();
        let currentX = this.x;
        let currentZ = this.z;
        let maxJumpDist = stats.range;

        for (let b = 0; b < maxBounces; b++) {
          let bestEnemy = null;
          let bestDist = maxJumpDist;
          for (const e of enemies) {
            if (!e || e.hp <= 0 || visitedIds.has(e.id)) continue;
            const d = dist2D(currentX, currentZ, e.x, e.z);
            if (d <= bestDist) {
              bestDist = d;
              bestEnemy = e;
            }
          }
          if (!bestEnemy) break;

          visitedIds.add(bestEnemy.id);
          hitTargets.push(new THREE.Vector3(bestEnemy.x, bestEnemy.y, bestEnemy.z));
          this._dealDamageToEnemy(enemyManager, bestEnemy, stats.damage * Math.pow(0.92, b));
          if (typeof bestEnemy.applyStun === 'function') {
            bestEnemy.applyStun(0.35);
          }
          currentX = bestEnemy.x;
          currentZ = bestEnemy.z;
          maxJumpDist = 9.5;
        }

        if (hitTargets.length === 0) {
          // Visual arc forward if manually triggered with no enemy in range
          hitTargets.push(
            new THREE.Vector3(
              this.x + Math.sin(this.facingAngle) * 8,
              this.y,
              this.z + Math.cos(this.facingAngle) * 8
            )
          );
        }

        if (this.vfx && typeof this.vfx.spawnAbilityVFX === 'function') {
          this.vfx.spawnAbilityVFX('chain_lightning', originPos, hitTargets, {
            colorHex: stats.colorHex,
          });
        }
        break;
      }

      case 'frost_spear': {
        // Piercing cryo javelin(s) that slow enemies by 50%
        const spearCount = stats.count || 1;
        const baseAimAngle = nearestEntry
          ? Math.atan2(nearestEntry.enemy.x - this.x, nearestEntry.enemy.z - this.z)
          : this.facingAngle;

        for (let s = 0; s < spearCount; s++) {
          const spreadOffset = spearCount > 1 ? (s - (spearCount - 1) / 2) * 0.22 : 0;
          const aimAngle = baseAimAngle + spreadOffset;
          const dirX = Math.sin(aimAngle);
          const dirZ = Math.cos(aimAngle);
          const endPos = new THREE.Vector3(
            this.x + dirX * stats.range,
            this.y,
            this.z + dirZ * stats.range
          );
          hitTargets.push(endPos);

          // Pierce all enemies along the javelin line (corridor half-width 1.85m)
          for (const item of sortedByDist) {
            if (item.dist > stats.range + 1.0) continue;
            const rx = item.enemy.x - this.x;
            const rz = item.enemy.z - this.z;
            const proj = rx * dirX + rz * dirZ;
            if (proj < -0.5 || proj > stats.range + 1.0) continue;
            const perpDist = Math.abs(rx * dirZ - rz * dirX);
            if (perpDist <= 1.85) {
              this._dealDamageToEnemy(enemyManager, item.enemy, stats.damage, {
                x: dirX,
                z: dirZ,
                strength: 1.5,
              });
              if (typeof item.enemy.applySlow === 'function') {
                item.enemy.applySlow(
                  stats.extra?.slowFactor || 0.5,
                  stats.extra?.slowDuration || 4.0
                );
              }
            }
          }
        }

        if (this.vfx && typeof this.vfx.spawnAbilityVFX === 'function') {
          this.vfx.spawnAbilityVFX('frost_spear', originPos, hitTargets[0] || originPos, {
            colorHex: stats.colorHex,
          });
        }
        break;
      }

      case 'venom_volley': {
        // Cone fan of toxic daggers inflicting Poison DoT
        const baseAimAngle = nearestEntry
          ? Math.atan2(nearestEntry.enemy.x - this.x, nearestEntry.enemy.z - this.z)
          : this.facingAngle;
        const dirX = Math.sin(baseAimAngle);
        const dirZ = Math.cos(baseAimAngle);

        for (const item of sortedByDist) {
          if (item.dist > stats.range) break;
          const dx = item.enemy.x - this.x;
          const dz = item.enemy.z - this.z;
          const inv = item.dist > 0.01 ? 1 / item.dist : 1;
          const dot = (dx * dirX + dz * dirZ) * inv;
          // Hit all enemies inside a generous 110° forward cone (or very close <= 3.2m)
          if (dot >= 0.35 || item.dist <= 3.2) {
            this._dealDamageToEnemy(enemyManager, item.enemy, stats.damage);
            if (typeof item.enemy.applyPoison === 'function') {
              item.enemy.applyPoison(
                stats.extra?.poisonDps || 10,
                stats.extra?.poisonDuration || 4.5
              );
            }
            hitTargets.push(new THREE.Vector3(item.enemy.x, item.enemy.y, item.enemy.z));
          }
        }

        const primaryTargetPos =
          hitTargets[0] ||
          new THREE.Vector3(
            this.x + dirX * stats.range * 0.85,
            this.y,
            this.z + dirZ * stats.range * 0.85
          );
        if (this.vfx && typeof this.vfx.spawnAbilityVFX === 'function') {
          this.vfx.spawnAbilityVFX('venom_volley', originPos, primaryTargetPos, {
            count: stats.count,
            colorHex: stats.colorHex,
          });
        }
        break;
      }

      case 'meteor_strike': {
        // Prioritizes the highest-fitness / Patient Zero enemy within range
        const inRange = sortedByDist.filter((item) => item.dist <= stats.range + 2.5);
        let apexTarget = null;
        let bestScore = -Infinity;
        for (const item of inRange) {
          const e = item.enemy;
          const score =
            (e.isPatientZero ? 100 : 0) +
            (e.genome?.mutations?.length || 0) * 25 +
            (e.genome?.fitnessScore || 1.0) * 10 -
            item.dist * 0.1;
          if (score > bestScore) {
            bestScore = score;
            apexTarget = e;
          }
        }

        const impactX = apexTarget
          ? apexTarget.x
          : this.x + Math.sin(this.facingAngle) * 7.5;
        const impactZ = apexTarget
          ? apexTarget.z
          : this.z + Math.cos(this.facingAngle) * 7.5;
        const impactY = this.terrain ? this.terrain.getHeightAt(impactX, impactZ) : this.y;
        const impactPos = new THREE.Vector3(impactX, impactY, impactZ);
        const aoeRadius = stats.extra?.aoeRadius || 5.5;

        for (const e of enemies) {
          if (!e || e.hp <= 0) continue;
          const dImpact = dist2D(impactX, impactZ, e.x, e.z);
          if (dImpact <= aoeRadius) {
            const dx = e.x - impactX;
            const dz = e.z - impactZ;
            const inv = dImpact > 0.01 ? 1 / dImpact : 1;
            this._dealDamageToEnemy(enemyManager, e, stats.damage, {
              x: dx * inv,
              z: dz * inv,
              strength: 2.8,
            });
            if (typeof e.applyBurn === 'function') {
              e.applyBurn(12, 3.5);
            }
            if (typeof e.applyStun === 'function') {
              e.applyStun(1.2);
            }
            hitTargets.push(new THREE.Vector3(e.x, e.y, e.z));
          }
        }

        if (this.vfx && typeof this.vfx.spawnAbilityVFX === 'function') {
          this.vfx.spawnAbilityVFX('meteor_strike', originPos, impactPos, {
            radius: aoeRadius,
            colorHex: stats.colorHex,
          });
        }
        break;
      }

      case 'soul_siphon': {
        // Crimson life-drain beams on up to stats.count nearest enemies, healing the Hero
        const maxTargets = stats.count || 2;
        let totalDamageDealt = 0;
        for (const item of sortedByDist) {
          if (item.dist > stats.range || hitTargets.length >= maxTargets) break;
          const res = this._dealDamageToEnemy(enemyManager, item.enemy, stats.damage);
          totalDamageDealt += res.finalDmg;
          hitTargets.push(new THREE.Vector3(item.enemy.x, item.enemy.y, item.enemy.z));
        }

        const healAmount = Math.max(
          6,
          Math.round(totalDamageDealt * (stats.extra?.lifestealRatio || 0.45))
        );
        if (hitTargets.length > 0) {
          this.hp = Math.min(this.maxHp, this.hp + healAmount);
        }

        if (this.vfx && typeof this.vfx.spawnAbilityVFX === 'function') {
          this.vfx.spawnAbilityVFX('soul_siphon', originPos, hitTargets, {
            colorHex: stats.colorHex,
          });
        }
        break;
      }

      case 'seismic_slam': {
        // Tectonic shockwave knocking back and stunning all enemies within stats.range
        const kbStrength = stats.extra?.knockbackDist || 5.0;
        const stunDur = stats.extra?.stunDuration || 1.5;
        for (const item of sortedByDist) {
          if (item.dist > stats.range) break;
          const dx = item.enemy.x - this.x;
          const dz = item.enemy.z - this.z;
          const inv = item.dist > 0.01 ? 1 / item.dist : 1;
          this._dealDamageToEnemy(enemyManager, item.enemy, stats.damage, {
            x: dx * inv,
            z: dz * inv,
            strength: kbStrength * 0.65,
          });
          if (typeof item.enemy.applyStun === 'function') {
            item.enemy.applyStun(stunDur);
          }
          hitTargets.push(new THREE.Vector3(item.enemy.x, item.enemy.y, item.enemy.z));
        }

        if (this.vfx && typeof this.vfx.spawnAbilityVFX === 'function') {
          this.vfx.spawnAbilityVFX('seismic_slam', originPos, hitTargets, {
            radius: stats.range,
            colorHex: stats.colorHex,
          });
        }
        break;
      }

      default:
        return false;
    }

    if (typeof this.onAbilityCast === 'function') {
      this.onAbilityCast(abilityId, stats, hitTargets.length);
    }

    return true;
  }

  /**
   * Updates all unlocked abilities (cooldowns, continuous 3D orbital blades slicing, and
   * automatic spell casting when `this.combatMode === 'vampire_survivors'`).
   *
   * @param {number} dt
   * @param {Object} enemyManager
   * @private
   */
  _updateAbilities(dt, enemyManager) {
    // 1. Tick per-enemy orbital blade hit timers
    for (const [enemyId, rem] of this._orbitalHitTimers.entries()) {
      if (rem - dt <= 0) {
        this._orbitalHitTimers.delete(enemyId);
      } else {
        this._orbitalHitTimers.set(enemyId, rem - dt);
      }
    }

    if (this.orbitalOverdriveTimer > 0) {
      this.orbitalOverdriveTimer = Math.max(0, this.orbitalOverdriveTimer - dt);
    }

    // 2. Update 3D Orbital Blades ('spinning_blades') if unlocked
    const bladesEntry = this.abilities.get('spinning_blades');
    if (bladesEntry && this.orbitalBladesGroup) {
      this.orbitalBladesGroup.visible = true;
      this.orbitalBladesGroup.position.set(
        this.x,
        Math.max(this.y, CONFIG.WORLD.WATER_LEVEL + 0.15) + 1.05,
        this.z
      );
      const spinSpeed = this.orbitalOverdriveTimer > 0 ? 8.2 : 4.4;
      this.orbitalAngle = (this.orbitalAngle + dt * spinSpeed) % (Math.PI * 2);
      this.orbitalBladesGroup.rotation.y = this.orbitalAngle;

      // Continuous contact slicing against enemies inside the orbital ring
      const enemies =
        enemyManager && typeof enemyManager.getEnemies === 'function'
          ? enemyManager.getEnemies()
          : [];
      const orbitRange = (bladesEntry.stats?.range || 4.2) + 0.45;
      const sliceDamage = Math.max(8, Math.round((bladesEntry.stats?.damage || 18) * 0.75));

      for (const enemy of [...enemies]) {
        if (!enemy || enemy.hp <= 0) continue;
        if (this._orbitalHitTimers.has(enemy.id)) continue;
        const d = dist2D(this.x, this.z, enemy.x, enemy.z);
        if (d <= orbitRange) {
          this._orbitalHitTimers.set(enemy.id, this.orbitalOverdriveTimer > 0 ? 0.28 : 0.48);
          const dx = enemy.x - this.x;
          const dz = enemy.z - this.z;
          const inv = d > 0.01 ? 1 / d : 1;
          this._dealDamageToEnemy(enemyManager, enemy, sliceDamage, {
            x: dx * inv,
            z: dz * inv,
            strength: 0.65,
          });
        }
      }
    }

    // 3. Tick cooldowns for all unlocked abilities & Auto-Cast in 'vampire_survivors' mode
    for (const abilityId of this.abilityOrder) {
      const entry = this.abilities.get(abilityId);
      if (!entry) continue;
      entry.cooldownRemaining = Math.max(0, entry.cooldownRemaining - dt);

      if (this.combatMode === 'vampire_survivors' && entry.cooldownRemaining <= 0) {
        this.castAbility(abilityId, enemyManager, false, false);
      }
    }

    // 4. Handle manual slot request [1..4] from 'diablo_action' mode
    if (this._requestedAbilitySlot !== null) {
      const slotIdx = this._requestedAbilitySlot;
      this._requestedAbilitySlot = null;
      this.triggerAbilitySlot(slotIdx, enemyManager);
    }
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
   * Binds keyboard (`WASD` / `ZQSD` / Arrows / `Space` / `Shift` / `E` / `1..4`) and mouse listeners.
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
      } else if (code === 'Digit1') {
        this._requestedAbilitySlot = 0;
      } else if (code === 'Digit2') {
        this._requestedAbilitySlot = 1;
      } else if (code === 'Digit3') {
        this._requestedAbilitySlot = 2;
      } else if (code === 'Digit4') {
        this._requestedAbilitySlot = 3;
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
          'button, .hud-panel, .hud-side-panel, .hud-top-bar, .hud-onboarding-banner, .hud-onboarding-card, .hud-skill-bar, .modal-overlay, .hud-modal-backdrop, #hud-root button'
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
   * Records an enemy kill (from melee Cleave, 3D Spell, Orbital Blades, or DoT), awards XP &
   * Biomass, advances `AdaptiveMasterySystem`, and updates active `DynamicQuestSystem` objectives.
   *
   * @param {Object} enemy - Slain enemy entity.
   * @param {number} [xpGained=20] - XP reward.
   */
  recordEnemyKill(enemy, xpGained = 20) {
    if (!enemy) return;

    const isMutantOrHybrid =
      Boolean(enemy.genome?.isHybrid) ||
      (Array.isArray(enemy.genome?.mutations) && enemy.genome.mutations.length > 0);

    const bonusMult =
      isMutantOrHybrid && this.lastBastionRef?.bonusMutantXpMult > 1
        ? this.lastBastionRef.bonusMutantXpMult
        : 1.0;

    this.kills++;
    if (isMutantOrHybrid) {
      this.mutantsSlain++;
      this.resources.biomass += Math.round(6 * bonusMult);
    } else {
      this.resources.biomass += 2;
    }

    if (this.questSystem && typeof this.questSystem.recordEnemyKilled === 'function') {
      this.questSystem.recordEnemyKilled(enemy);
    }
    if (typeof this.onEnemyKilled === 'function') {
      this.onEnemyKilled(enemy);
    }

    if (this.mastery && typeof this.mastery.recordKill === 'function') {
      const masteryRes = this.mastery.recordKill(enemy);
      if (Array.isArray(masteryRes?.newlyUnlockedRanks) && masteryRes.newlyUnlockedRanks.length > 0) {
        if (this.vfx && typeof this.vfx.spawnAbilityVFX === 'function') {
          this.vfx.spawnAbilityVFX('mastery_rank_up', new THREE.Vector3(this.x, this.y, this.z));
        }
        if (typeof this.onMasteryRankUp === 'function') {
          for (const notif of masteryRes.newlyUnlockedRanks) {
            this.onMasteryRankUp(notif);
          }
        }
      }
    }

    const finalXp = Math.round(xpGained * bonusMult);
    if (finalXp > 0) {
      this.gainXp(finalXp);
    }
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
          const knockDir = { x: dx * invDist, z: dz * invDist, strength: 1.45 };
          this._dealDamageToEnemy(enemyManager, enemy, this.cleaveDamage, knockDir);
          hitCount++;
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
   * Interacts with nearby Prisoner Cages, 3D Bastion Building Pads (`watchtower`, `scout_guild`,
   * `lumber_forge`, `biolab`, `sanctuary_hearth`), or Resource Nodes (Wood/Crystal).
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

    // 2. Construct or Upgrade nearby 3D Bastion Building Pad!
    if (bastionAndNpcs && typeof bastionAndNpcs.getNearestBuildingPad === 'function') {
      const pad = bastionAndNpcs.getNearestBuildingPad(this.x, this.z, 4.8, this.resources);
      if (pad && !pad.isMaxed) {
        const built = bastionAndNpcs.upgradeBuilding
          ? bastionAndNpcs.upgradeBuilding(pad.id, this.resources)
          : bastionAndNpcs.buildStructure(pad.id, this.resources);
        if (built) {
          this.gainXp(25);
          if (typeof this.onBuildingUpgraded === 'function') {
            this.onBuildingUpgraded(pad.id, bastionAndNpcs.getBuildingLevel?.(pad.id) || pad.nextLevel);
          }
          return;
        }
        // If standing on a pad without enough resources, don't fall through to random foraging
        return;
      }
    }

    // 3. Harvest nearby Terrain Resource Node (Wood / Crystal)
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
   * Applies incoming damage to the player, reduced by both `AdaptiveMasterySystem` resistance
   * (learned by enduring Fire, Venom, Cryo, or Physical hits) and passive armor upgrades.
   *
   * @param {number} amount - Raw incoming damage.
   * @param {boolean} [isElemental=false] - Whether damage is from an elemental mutation.
   * @param {Object|null} [attackerEnemy=null] - Attacking enemy entity for adaptive mastery tracking.
   * @param {string|null} [damageType=null] - Explicit damage category (`'fire' | 'poison' | 'ice' | 'physical'`).
   */
  takeDamage(amount, isElemental = false, attackerEnemy = null, damageType = null) {
    if (this.dashTimer > 0) return;

    let adaptiveReduction = 0;
    if (this.mastery && typeof this.mastery.recordDamageTaken === 'function') {
      const adaptRes = this.mastery.recordDamageTaken(
        damageType || isElemental,
        attackerEnemy,
        amount
      );
      adaptiveReduction = clamp(1 - (adaptRes?.damageMultiplier ?? 1), 0, 0.45);
      if (Array.isArray(adaptRes?.newlyUnlockedRanks) && adaptRes.newlyUnlockedRanks.length > 0) {
        if (this.vfx && typeof this.vfx.spawnAbilityVFX === 'function') {
          this.vfx.spawnAbilityVFX('mastery_rank_up', new THREE.Vector3(this.x, this.y, this.z));
        }
        if (typeof this.onMasteryRankUp === 'function') {
          for (const notif of adaptRes.newlyUnlockedRanks) {
            this.onMasteryRankUp(notif);
          }
        }
      }
    }

    const passiveReduction = this.damageReduction * (isElemental ? 1.25 : 0.7);
    const totalReduction = clamp(adaptiveReduction + passiveReduction, 0, 0.72);
    const finalDmg = Math.max(1, Math.round(amount * (1 - totalReduction)));
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
   * Applies a chosen roguelike card (either one of the 8 3D spells from `ROGUELIKE_ABILITIES`
   * or a passive counter-adaptation upgrade from `DESIGNED_UPGRADES` / `CONFIG.UPGRADES`).
   *
   * @param {string|Object} upgradeOrId - Upgrade identifier string or card object.
   * @returns {boolean} True if applied.
   */
  applyUpgrade(upgradeOrId) {
    if (!upgradeOrId) return false;
    const upgradeId =
      typeof upgradeOrId === 'object' ? upgradeOrId.id || upgradeOrId.legacyId : upgradeOrId;
    if (!upgradeId) return false;

    this.upgrades.push(upgradeId);
    if (this.pendingLevelUps > 0) {
      this.pendingLevelUps--;
    }

    // 1. Check if this card is one of the 8 3D Roguelike Abilities / Spells
    if (ROGUELIKE_ABILITIES_BY_ID[upgradeId]) {
      this.unlockOrUpgradeAbility(upgradeId);
      return true;
    }

    // 2. Otherwise apply passive stat / counter-adaptation upgrade
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
      const isAuto = this.combatMode === 'vampire_survivors';
      this.nearestPrompt = {
        type: 'attack',
        keyHint: isAuto ? '[AUTO]' : '[Clic Gauche / Espace]',
        label: isAuto
          ? 'Frappe & Sorts Auto actifs !'
          : inReach
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

    // Priority C: 3D Bastion Building Pad within 4.8m
    if (
      !this.nearestPrompt &&
      bastionAndNpcs &&
      typeof bastionAndNpcs.getNearestBuildingPad === 'function'
    ) {
      const pad = bastionAndNpcs.getNearestBuildingPad(this.x, this.z, 4.8, this.resources);
      if (pad && !pad.isMaxed) {
        const py = this.terrain ? this.terrain.getHeightAt(pad.x, pad.z) : 2.2;
        this.nearestPrompt = {
          type: 'build',
          keyHint: '[E]',
          label: pad.worldPromptText,
          worldPos: new THREE.Vector3(pad.x, py + 2.6, pad.z),
          entity: pad,
          dist: pad.dist,
          canAfford: pad.canAfford,
        };
      }
    }

    // Priority D: Resource Node within 7m
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
   * Main per-frame update for player movement, cleave attack (manual or Vampire Survivors auto-melee),
   * 3D spell execution (auto-cast or `[1..4]` active slots), dash, passive Bastion healing,
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
    if (enemyManager) {
      enemyManager.playerRef = this;
    }

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
      this.keys.has('a') ||
      this.keys.has('q')
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

    const distToBastionNow = Math.hypot(this.x, this.z);
    const auraRange = bastionAndNpcs?.passiveAuraRange || CONFIG.BASTION?.RADIUS || 14;
    const hearthSpeedBoost =
      distToBastionNow <= auraRange && (bastionAndNpcs?.structures?.sanctuary_hearth || 1) >= 2
        ? 1.15
        : 1.0;

    let currentSpeed = 0;
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      currentSpeed = this.dashSpeed;
      this.vx = this.dashDirX * currentSpeed;
      this.vz = this.dashDirZ * currentSpeed;
    } else if (isMoving) {
      currentSpeed = this.baseSpeed * this.speedMult * hearthSpeedBoost;
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

    // 3. Handle Cleave Attack (Manual OR Vampire Survivors Auto-Melee) & Interact Requests
    if (this._attackRequested) {
      this._attackRequested = false;
      this.performCleaveAttack(enemyManager, bastionAndNpcs);
    } else if (this.combatMode === 'vampire_survivors' && this.cleaveCooldown <= 0 && enemyManager) {
      const enemies = typeof enemyManager.getEnemies === 'function' ? enemyManager.getEnemies() : [];
      const hasEnemyInReach = enemies.some(
        (e) => e && e.hp > 0 && dist2D(this.x, this.z, e.x, e.z) <= this.cleaveRange + 0.35
      );
      if (hasEnemyInReach) {
        this.performCleaveAttack(enemyManager, bastionAndNpcs);
      }
    }

    if (this._interactRequested) {
      this._interactRequested = false;
      this.interact(bastionAndNpcs);
    }

    // 4. Update 3D Abilities (Orbital Blades, Auto-Cast in Vampire Survivors mode, or [1..4] in Diablo mode)
    this._updateAbilities(dt, enemyManager);

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

    // 5. Passive HP Regeneration & Bastion Sanctuary Hearth Healing
    const distToBastion = Math.hypot(this.x, this.z);
    const inBastion = distToBastion <= auraRange;
    const bastionHealRate = bastionAndNpcs?.heroHealRate || CONFIG.BASTION?.HEAL_RATE || 15;
    const healRate = this.regenPerSec + (inBastion ? bastionHealRate : 0);
    if (this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + healRate * dt);
    }

    // 6. Update Cleave Slash Arc VFX & Hero 3D Mesh
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

    // 7. Update 3D Ground Range Ring, Golden Quest Arrow & Contextual Action Bubbles
    this._updateTacticalIndicators(elapsedTime, enemyManager, bastionAndNpcs);
  }
}

export default PlayerController;
