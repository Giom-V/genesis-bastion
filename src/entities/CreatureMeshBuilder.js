/**
 * @fileoverview Procedural 3D Creature, Hero, and NPC Morphology Builder.
 * Constructs expressive, articulated Three.js hierarchical meshes driven by
 * species clade, genetic traits (size, strength, speed), inter-species
 * hybridization (grafting anatomical traits from both parents), and Mendelian
 * dominant mutations (e.g. Pyroclastic Gland / "Troll de Feu", Venom Sacs,
 * Osteo-Plating, Cryo-Blood, Vampiric Maw, Winged Leap, Titan Growth).
 *
 * Usage:
 *   import { buildCreatureMesh, animateCreatureMesh, updateCreatureOverlay } from './CreatureMeshBuilder.js';
 *   const mesh = buildCreatureMesh({ type: 'enemy', speciesId: 'troll', genome, isPatientZero: true });
 *   animateCreatureMesh(mesh, { isMoving: true, speed: 6, isAttacking: false, hitFlash: 0 }, elapsedTime, dt);
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';

/** Default fallback species definitions in case CONFIG.SPECIES is partially populated */
const FALLBACK_SPECIES = {
  goblin: {
    id: 'goblin',
    name: 'Gobelin',
    clade: 'greenskin',
    baseSize: 0.78,
    color: 0x5c8a3c,
    accentColor: 0x9ab858,
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    clade: 'greenskin',
    baseSize: 1.12,
    color: 0x3f6a34,
    accentColor: 0x8f4426,
  },
  troll: {
    id: 'troll',
    name: 'Troll',
    clade: 'greenskin',
    baseSize: 1.55,
    color: 0x3b5249,
    accentColor: 0x6c7a72,
  },
  wolf: {
    id: 'wolf',
    name: 'Loup',
    clade: 'beast',
    baseSize: 0.92,
    color: 0x626a73,
    accentColor: 0x9aa4b0,
  },
  lion: {
    id: 'lion',
    name: 'Lion',
    clade: 'beast',
    baseSize: 1.18,
    color: 0xc9933b,
    accentColor: 0x6e3f19,
  },
  vulture: {
    id: 'vulture',
    name: 'Vautour',
    clade: 'beast',
    baseSize: 0.88,
    color: 0x4a3b39,
    accentColor: 0xb86f52,
  },
  dragon: {
    id: 'dragon',
    name: 'Dragon',
    clade: 'apex',
    baseSize: 1.85,
    color: 0x8f2424,
    accentColor: 0xff6b1a,
  },
};

/**
 * Converts a hex number or CSS string into a THREE.Color instance.
 * @param {number|string|THREE.Color} val - Input color value.
 * @param {number} fallbackHex - Fallback hex number.
 * @returns {THREE.Color}
 */
function toThreeColor(val, fallbackHex = 0x668855) {
  if (val instanceof THREE.Color) return val.clone();
  if (typeof val === 'number' && !Number.isNaN(val)) return new THREE.Color(val);
  if (typeof val === 'string') {
    try {
      return new THREE.Color(val);
    } catch {
      return new THREE.Color(fallbackHex);
    }
  }
  return new THREE.Color(fallbackHex);
}

/**
 * Enables castShadow and receiveShadow recursively on a mesh or group.
 * @param {THREE.Object3D} obj - Root 3D object.
 */
function enableShadows(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

/**
 * Extracts normalized mutation ID strings from a genome.
 * @param {Object} [genome] - Creature genome object.
 * @returns {string[]} Array of mutation IDs.
 */
function extractMutationIds(genome) {
  if (!genome || !Array.isArray(genome.mutations)) return [];
  return genome.mutations
    .map((m) => (typeof m === 'string' ? m : m?.id))
    .filter(Boolean);
}

/**
 * Builds the player's articulated 3D Hero mesh with flowing cape, shield, and glowing rune blade.
 * @returns {THREE.Group} Articulated player group.
 */
function buildPlayerHeroMesh() {
  const group = new THREE.Group();
  group.name = 'PlayerHero';

  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x243447,
    roughness: 0.35,
    metalness: 0.65,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xe6a145,
    roughness: 0.25,
    metalness: 0.8,
  });
  const capeMat = new THREE.MeshStandardMaterial({
    color: 0xb3282d,
    roughness: 0.7,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd9a982,
    roughness: 0.6,
    metalness: 0.05,
  });
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x88eeff,
    emissive: 0x1e90ff,
    emissiveIntensity: 1.35,
    roughness: 0.2,
    metalness: 0.8,
  });

  const body = new THREE.Group();
  body.position.y = 1.05;
  group.add(body);

  // Torso cuirass
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.92, 0.46), armorMat);
  torso.position.y = 0.12;
  body.add(torso);

  // Chest gold emblem
  const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), trimMat);
  emblem.position.set(0, 0.2, 0.24);
  emblem.scale.set(1, 1.3, 0.4);
  body.add(emblem);

  // Shoulder pauldrons
  const pauldronGeo = new THREE.SphereGeometry(0.24, 10, 8);
  const leftPauldron = new THREE.Mesh(pauldronGeo, trimMat);
  leftPauldron.position.set(-0.48, 0.46, 0);
  leftPauldron.scale.set(1.1, 0.75, 1.0);
  body.add(leftPauldron);

  const rightPauldron = new THREE.Mesh(pauldronGeo, trimMat);
  rightPauldron.position.set(0.48, 0.46, 0);
  rightPauldron.scale.set(1.1, 0.75, 1.0);
  body.add(rightPauldron);

  // Flowing Hero Cape (mapped to tail for wind/walk sway)
  const tail = new THREE.Group();
  tail.position.set(0, 0.5, -0.24);
  const capeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.15, 0.06), capeMat);
  capeMesh.position.set(0, -0.52, -0.08);
  capeMesh.rotation.x = 0.18;
  tail.add(capeMesh);
  body.add(tail);

  // Head & Helmet
  const head = new THREE.Group();
  head.position.set(0, 0.78, 0);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.46), skinMat);
  head.add(headMesh);

  const helmMesh = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.42, 6), armorMat);
  helmMesh.position.y = 0.26;
  head.add(helmMesh);

  const visorGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.08, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0x66f0ff,
      emissive: 0x00d8ff,
      emissiveIntensity: 1.5,
    })
  );
  visorGlow.position.set(0, 0.05, 0.23);
  head.add(visorGlow);
  body.add(head);

  // Left Arm + Bastion Shield
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.52, 0.42, 0);
  const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), armorMat);
  leftArmMesh.position.y = -0.28;
  leftArm.add(leftArmMesh);

  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.78, 0.58), armorMat);
  shield.position.set(-0.16, -0.32, 0.14);
  const shieldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.84, 0.64), trimMat);
  shieldTrim.position.set(-0.14, -0.32, 0.14);
  leftArm.add(shieldTrim);
  leftArm.add(shield);
  body.add(leftArm);

  // Right Arm + Glowing Rune Greatsword
  const rightArm = new THREE.Group();
  rightArm.position.set(0.52, 0.42, 0);
  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), armorMat);
  rightArmMesh.position.y = -0.28;
  rightArm.add(rightArmMesh);

  const swordGroup = new THREE.Group();
  swordGroup.position.set(0.05, -0.56, 0.22);
  swordGroup.rotation.x = Math.PI * 0.38;

  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 6), trimMat);
  const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.12), trimMat);
  crossguard.position.y = 0.16;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.35, 0.04), bladeMat);
  blade.position.y = 0.86;
  swordGroup.add(hilt, crossguard, blade);
  rightArm.add(swordGroup);
  body.add(rightArm);

  // Legs
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.2, 0.68, 0);
  const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.28), armorMat);
  leftLegMesh.position.y = -0.35;
  leftLeg.add(leftLegMesh);
  group.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.2, 0.68, 0);
  const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.28), armorMat);
  rightLegMesh.position.y = -0.35;
  rightLeg.add(rightLegMesh);
  group.add(rightLeg);

  const limbs = {
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    tail,
    wings: null,
    weapon: swordGroup,
    isQuadruped: false,
    isHovering: false,
    baseBodyY: 1.05,
  };

  attachLimbReferences(group, limbs);
  enableShadows(group);
  return group;
}

/**
 * Builds an articulated 3D NPC mesh differentiated by role ('scout' | 'guard' | 'harvester').
 * @param {string} role - NPC role identifier.
 * @returns {THREE.Group}
 */
function buildNpcMesh(role = 'scout') {
  const group = new THREE.Group();
  group.name = `NPC_${role}`;

  const rolePalette = {
    scout: { tunic: 0x16697a, cloak: 0x2ed573, accent: 0x48dbfb },
    guard: { tunic: 0x3b4d61, cloak: 0xe6a145, accent: 0xff6b6b },
    harvester: { tunic: 0x6b5335, cloak: 0x38c172, accent: 0xfeca57 },
  };
  const pal = rolePalette[role] || rolePalette.scout;

  const tunicMat = new THREE.MeshStandardMaterial({ color: pal.tunic, roughness: 0.55, metalness: 0.25 });
  const cloakMat = new THREE.MeshStandardMaterial({ color: pal.cloak, roughness: 0.65, side: THREE.DoubleSide });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdeb896, roughness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: pal.accent,
    emissive: pal.accent,
    emissiveIntensity: role === 'scout' ? 0.9 : 0.35,
    roughness: 0.3,
  });

  const body = new THREE.Group();
  body.position.y = 0.95;
  group.add(body);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.78, 0.36), tunicMat);
  torso.position.y = 0.1;
  body.add(torso);

  const head = new THREE.Group();
  head.position.set(0, 0.66, 0);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
  head.add(face);

  if (role === 'scout') {
    // Hooded ranger cowl + glowing cyan feather/visor
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.4, 5), cloakMat);
    hood.position.y = 0.22;
    head.add(hood);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.08), accentMat);
    lens.position.set(0, 0.04, 0.21);
    head.add(lens);
  } else if (role === 'guard') {
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.3, 8), tunicMat);
    helm.position.y = 0.18;
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.38), cloakMat);
    crest.position.y = 0.34;
    head.add(helm, crest);
  } else {
    // Harvester straw/leather cap
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 10), cloakMat);
    brim.position.y = 0.2;
    head.add(brim);
  }
  body.add(head);

  // Cloak / Backpack (tail slot)
  const tail = new THREE.Group();
  tail.position.set(0, 0.38, -0.2);
  if (role === 'harvester') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.28), cloakMat);
    pack.position.set(0, -0.15, -0.1);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), accentMat);
    crystal.position.set(0, 0.18, -0.12);
    tail.add(pack, crystal);
  } else {
    const cloak = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.85, 0.05), cloakMat);
    cloak.position.set(0, -0.35, -0.06);
    cloak.rotation.x = 0.16;
    tail.add(cloak);
  }
  body.add(tail);

  // Arms & Role Gear
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.38, 0.36, 0);
  const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.56, 0.18), tunicMat);
  leftArmMesh.position.y = -0.22;
  leftArm.add(leftArmMesh);
  body.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.38, 0.36, 0);
  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.56, 0.18), tunicMat);
  rightArmMesh.position.y = -0.22;
  rightArm.add(rightArmMesh);

  const toolGroup = new THREE.Group();
  toolGroup.position.set(0, -0.45, 0.16);
  if (role === 'scout') {
    // Scout signal staff with cyan beacon lantern
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.15, 6), tunicMat);
    staff.position.y = 0.25;
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), accentMat);
    lantern.position.y = 0.88;
    toolGroup.add(staff, lantern);
  } else if (role === 'guard') {
    // Guard spear/crossbow
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.35, 6), tunicMat);
    spear.position.y = 0.35;
    spear.rotation.x = Math.PI * 0.35;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 4), accentMat);
    tip.position.set(0, 0.65, 0.55);
    tip.rotation.x = Math.PI * 0.35;
    toolGroup.add(spear, tip);
  } else {
    // Harvester pickaxe
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 6), tunicMat);
    handle.rotation.x = Math.PI * 0.4;
    const pickHead = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.08), accentMat);
    pickHead.position.set(0, 0.12, 0.32);
    toolGroup.add(handle, pickHead);
  }
  rightArm.add(toolGroup);
  body.add(rightArm);

  // Legs
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.15, 0.56, 0);
  const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.56, 0.22), tunicMat);
  leftLegMesh.position.y = -0.28;
  leftLeg.add(leftLegMesh);
  group.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.15, 0.56, 0);
  const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.56, 0.22), tunicMat);
  rightLegMesh.position.y = -0.28;
  rightLeg.add(rightLegMesh);
  group.add(rightLeg);

  // Floating role ring at feet for instant visual clarity
  const ringGeo = new THREE.RingGeometry(0.48, 0.58, 20);
  ringGeo.rotateX(-Math.PI / 2);
  const roleRing = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: pal.accent,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    })
  );
  roleRing.position.y = 0.04;
  group.add(roleRing);

  const limbs = {
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    tail,
    wings: null,
    weapon: toolGroup,
    isQuadruped: false,
    isHovering: false,
    baseBodyY: 0.95,
  };

  attachLimbReferences(group, limbs);
  enableShadows(group);
  return group;
}

/**
 * Helper to attach limb references both on `group.userData.limbs` and directly on `group`.
 * @param {THREE.Group} group - Root creature group.
 * @param {Object} limbs - Dictionary of articulated limb groups.
 */
function attachLimbReferences(group, limbs) {
  group.userData = group.userData || {};
  group.userData.limbs = limbs;
  group.leftLeg = limbs.leftLeg;
  group.rightLeg = limbs.rightLeg;
  group.leftArm = limbs.leftArm;
  group.rightArm = limbs.rightArm;
  group.head = limbs.head;
  group.tail = limbs.tail;
  group.wings = limbs.wings;
}

/**
 * Builds an enemy creature 3D mesh with full genome morphology, hybrid anatomical grafting,
 * and dominant mutation visual attachments.
 *
 * @param {Object} spec - Creature specification.
 * @param {'player'|'npc'|'enemy'} [spec.type='enemy'] - Entity category.
 * @param {string} [spec.speciesId='goblin'] - Species identifier.
 * @param {Object} [spec.genome] - Genome instance or plain object.
 * @param {string} [spec.role] - Role if building an NPC.
 * @param {boolean} [spec.isPatientZero=false] - Whether this individual is Patient Zero.
 * @returns {THREE.Group} Articulated Three.js Group.
 */
export function buildCreatureMesh(spec = {}) {
  const type = spec.type || 'enemy';
  if (type === 'player') {
    return buildPlayerHeroMesh();
  }
  if (type === 'npc') {
    return buildNpcMesh(spec.role || 'scout');
  }

  const genome = spec.genome || {};
  const rawSpeciesId = spec.speciesId || genome.speciesId || 'goblin';
  const isHybrid = Boolean(genome.isHybrid);
  const hybridParents =
    Array.isArray(genome.hybridParents) && genome.hybridParents.length >= 2
      ? genome.hybridParents
      : [rawSpeciesId, rawSpeciesId];

  const primarySpeciesId = CONFIG.SPECIES?.[rawSpeciesId]
    ? rawSpeciesId
    : hybridParents[0] && (CONFIG.SPECIES?.[hybridParents[0]] || FALLBACK_SPECIES[hybridParents[0]])
      ? hybridParents[0]
      : 'goblin';
  const secondarySpeciesId = isHybrid ? hybridParents[1] || primarySpeciesId : primarySpeciesId;

  const spA = CONFIG.SPECIES?.[primarySpeciesId] || FALLBACK_SPECIES[primarySpeciesId] || FALLBACK_SPECIES.goblin;
  const spB = CONFIG.SPECIES?.[secondarySpeciesId] || FALLBACK_SPECIES[secondarySpeciesId] || spA;

  const mutationIds = extractMutationIds(genome);
  const hasMutation = (id) => mutationIds.includes(id);
  const isPatientZero = Boolean(spec.isPatientZero || genome.isPatientZero);

  // Blend colors if hybrid
  const primaryColor = toThreeColor(spA.color, 0x5c8a3c);
  const accentColor = toThreeColor(spA.accentColor, 0x9ab858);
  if (isHybrid && spB !== spA) {
    primaryColor.lerp(toThreeColor(spB.color, 0x626a73), 0.45);
    accentColor.lerp(toThreeColor(spB.accentColor, 0x9aa4b0), 0.5);
  }

  // Apply Pyro Gland skin tinting for iconic "Troll de Feu" look
  let emissiveColor = new THREE.Color(0x000000);
  let emissiveIntensity = 0.0;
  if (hasMutation('pyro_gland')) {
    primaryColor.lerp(new THREE.Color(0x521808), 0.45);
    accentColor.setHex(0xff5500);
    emissiveColor = new THREE.Color(0xff3b00);
    emissiveIntensity = 0.55;
  } else if (hasMutation('cryo_blood')) {
    primaryColor.lerp(new THREE.Color(0x1f6f8b), 0.4);
    emissiveColor = new THREE.Color(0x00b4d8);
    emissiveIntensity = 0.35;
  } else if (hasMutation('venom_sacs')) {
    emissiveColor = new THREE.Color(0x1b7a1b);
    emissiveIntensity = 0.28;
  } else if (hasMutation('vampiric_maw')) {
    primaryColor.lerp(new THREE.Color(0x3a0ca3), 0.25);
    emissiveColor = new THREE.Color(0x800f2f);
    emissiveIntensity = 0.3;
  }

  const skinMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    emissive: emissiveColor,
    emissiveIntensity,
    roughness: 0.65,
    metalness: 0.12,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.5,
    metalness: 0.2,
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x22252a,
    roughness: 0.4,
    metalness: 0.6,
  });

  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xe8e4d9,
    roughness: 0.4,
    metalness: 0.1,
  });

  const eyeColorHex = hasMutation('pyro_gland')
    ? 0xffdd00
    : hasMutation('cryo_blood')
      ? 0x00ffff
      : hasMutation('vampiric_maw')
        ? 0xff0033
        : 0xff5522;
  const eyeMat = new THREE.MeshStandardMaterial({
    color: eyeColorHex,
    emissive: eyeColorHex,
    emissiveIntensity: 1.6,
  });

  const group = new THREE.Group();
  group.name = `Creature_${rawSpeciesId}`;

  const body = new THREE.Group();
  body.name = 'body';
  group.add(body);

  const head = new THREE.Group();
  head.name = 'head';
  body.add(head);

  const leftArm = new THREE.Group();
  leftArm.name = 'leftArm';
  body.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.name = 'rightArm';
  body.add(rightArm);

  const leftLeg = new THREE.Group();
  leftLeg.name = 'leftLeg';
  group.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.name = 'rightLeg';
  group.add(rightLeg);

  const tail = new THREE.Group();
  tail.name = 'tail';
  body.add(tail);

  let wings = null;
  let leftWing = null;
  let rightWing = null;
  let weapon = null;
  let isQuadruped = false;
  let isHovering = false;
  let baseBodyY = 0.95;

  // --- SPECIES SILHOUETTES ---
  if (primarySpeciesId === 'goblin') {
    baseBodyY = 0.72;
    body.position.y = baseBodyY;

    // Hunched compact torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.58, 0.36), skinMat);
    torso.rotation.x = 0.25;
    body.add(torso);

    const loincloth = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.25, 0.38), accentMat);
    loincloth.position.y = -0.26;
    body.add(loincloth);

    // Oversized head with long pointed goblin ears & sharp nose
    head.position.set(0, 0.44, 0.14);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.44), skinMat);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 4), skinMat);
    nose.rotation.x = Math.PI * 0.5;
    nose.position.set(0, -0.02, 0.3);
    head.add(skull, nose);

    const earGeo = new THREE.ConeGeometry(0.11, 0.52, 4);
    const leftEar = new THREE.Mesh(earGeo, skinMat);
    leftEar.position.set(-0.38, 0.08, -0.02);
    leftEar.rotation.z = Math.PI * 0.38;
    const rightEar = new THREE.Mesh(earGeo, skinMat);
    rightEar.position.set(0.38, 0.08, -0.02);
    rightEar.rotation.z = -Math.PI * 0.38;
    head.add(leftEar, rightEar);

    addEyes(head, eyeMat, 0.13, 0.06, 0.23, 0.055);

    // Wiry arms + jagged dagger
    leftArm.position.set(-0.34, 0.2, 0.06);
    const lArmM = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.48, 0.15), skinMat);
    lArmM.position.y = -0.2;
    leftArm.add(lArmM);

    rightArm.position.set(0.34, 0.2, 0.06);
    const rArmM = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.48, 0.15), skinMat);
    rArmM.position.y = -0.2;
    rightArm.add(rArmM);

    weapon = new THREE.Group();
    weapon.position.set(0, -0.42, 0.12);
    const daggerBlade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 4), darkMat);
    daggerBlade.rotation.x = Math.PI * 0.5;
    daggerBlade.position.z = 0.22;
    weapon.add(daggerBlade);
    rightArm.add(weapon);

    // Legs
    leftLeg.position.set(-0.15, 0.45, 0);
    const lLegM = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.46, 0.18), skinMat);
    lLegM.position.y = -0.22;
    leftLeg.add(lLegM);

    rightLeg.position.set(0.15, 0.45, 0);
    const rLegM = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.46, 0.18), skinMat);
    rLegM.position.y = -0.22;
    rightLeg.add(rLegM);
  } else if (primarySpeciesId === 'orc') {
    baseBodyY = 1.05;
    body.position.y = baseBodyY;

    // Broad V-shaped muscular torso + leather harness
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.65, 0.52), skinMat);
    chest.position.y = 0.22;
    const waist = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.45, 0.44), accentMat);
    waist.position.y = -0.22;
    body.add(chest, waist);

    // Orc Head with jaw & twin ivory tusks
    head.position.set(0, 0.72, 0.08);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.48, 0.5), skinMat);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.2, 0.36), skinMat);
    jaw.position.set(0, -0.16, 0.12);
    head.add(skull, jaw);
    addOrcTusks(head, boneMat);
    addEyes(head, eyeMat, 0.14, 0.08, 0.26, 0.06);

    // Muscular arms + heavy iron cleaver
    leftArm.position.set(-0.56, 0.38, 0);
    const lArmM = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.68, 0.26), skinMat);
    lArmM.position.y = -0.28;
    leftArm.add(lArmM);

    rightArm.position.set(0.56, 0.38, 0);
    const rArmM = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.68, 0.26), skinMat);
    rArmM.position.y = -0.28;
    rightArm.add(rArmM);

    weapon = new THREE.Group();
    weapon.position.set(0, -0.56, 0.18);
    const cleaverHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), accentMat);
    cleaverHandle.rotation.x = Math.PI * 0.5;
    const cleaverBlade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.68), darkMat);
    cleaverBlade.position.set(0, 0.08, 0.42);
    weapon.add(cleaverHandle, cleaverBlade);
    rightArm.add(weapon);

    // Sturdy legs
    leftLeg.position.set(-0.22, 0.64, 0);
    const lLegM = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.64, 0.28), darkMat);
    lLegM.position.y = -0.32;
    leftLeg.add(lLegM);

    rightLeg.position.set(0.22, 0.64, 0);
    const rLegM = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.64, 0.28), darkMat);
    rLegM.position.y = -0.32;
    rightLeg.add(rLegM);
  } else if (primarySpeciesId === 'troll') {
    baseBodyY = 1.38;
    body.position.y = baseBodyY;

    // Towering hunchbacked colossus torso
    const upperBack = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72, 1), skinMat);
    upperBack.position.set(0, 0.32, -0.06);
    upperBack.scale.set(1.22, 1.05, 0.95);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.56, 10, 8), accentMat);
    belly.position.set(0, -0.15, 0.08);
    body.add(upperBack, belly);

    // Rocky dorsal ridges
    addTrollBackStones(body, accentMat);

    // Forward-slung Troll head
    head.position.set(0, 0.68, 0.46);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.54, 0.58), skinMat);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.26), accentMat);
    brow.position.set(0, 0.18, 0.24);
    head.add(skull, brow);
    addEyes(head, eyeMat, 0.16, 0.05, 0.3, 0.075);

    // Long gorilla-like arms + massive stone club
    leftArm.position.set(-0.78, 0.42, 0.1);
    const lArmM = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.98, 0.34), skinMat);
    lArmM.position.y = -0.44;
    leftArm.add(lArmM);

    rightArm.position.set(0.78, 0.42, 0.1);
    const rArmM = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.98, 0.34), skinMat);
    rArmM.position.y = -0.44;
    rightArm.add(rArmM);

    weapon = new THREE.Group();
    weapon.position.set(0, -0.84, 0.2);
    const clubShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.25, 7), accentMat);
    clubShaft.rotation.x = Math.PI * 0.45;
    clubShaft.position.z = 0.45;
    const clubRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), darkMat);
    clubRock.position.set(0, 0.08, 0.92);
    weapon.add(clubShaft, clubRock);
    rightArm.add(weapon);

    // Thick pillar legs
    leftLeg.position.set(-0.32, 0.82, 0);
    const lLegM = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.82, 0.38), skinMat);
    lLegM.position.y = -0.4;
    leftLeg.add(lLegM);

    rightLeg.position.set(0.32, 0.82, 0);
    const rLegM = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.82, 0.38), skinMat);
    rLegM.position.y = -0.4;
    rightLeg.add(rLegM);
  } else if (primarySpeciesId === 'wolf' || primarySpeciesId === 'lion') {
    isQuadruped = true;
    const isLion = primarySpeciesId === 'lion';
    baseBodyY = isLion ? 0.88 : 0.74;
    body.position.y = baseBodyY;

    // Horizontal quadruped torso
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(isLion ? 0.68 : 0.54, isLion ? 0.58 : 0.48, isLion ? 1.28 : 1.12),
      skinMat
    );
    body.add(torso);

    // Head + Snout (+ Mane if Lion)
    head.position.set(0, 0.32, isLion ? 0.68 : 0.6);
    if (isLion) {
      addLionMane(head, accentMat);
    }
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.44), skinMat);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.36), accentMat);
    snout.position.set(0, -0.06, 0.32);
    head.add(skull, snout);

    const earGeo = new THREE.ConeGeometry(0.09, 0.22, 4);
    const lEar = new THREE.Mesh(earGeo, skinMat);
    lEar.position.set(-0.16, 0.26, -0.05);
    const rEar = new THREE.Mesh(earGeo, skinMat);
    rEar.position.set(0.16, 0.26, -0.05);
    head.add(lEar, rEar);
    addEyes(head, eyeMat, 0.13, 0.08, 0.23, 0.05);

    // Tail
    tail.position.set(0, 0.18, isLion ? -0.64 : -0.56);
    const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.65, 6), accentMat);
    tailMesh.rotation.x = -Math.PI * 0.32;
    tailMesh.position.set(0, -0.12, -0.25);
    tail.add(tailMesh);

    // Front legs (mapped to leftArm / rightArm)
    const legH = baseBodyY;
    leftArm.position.set(-0.22, -0.1, 0.42);
    const flMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, legH, 0.18), skinMat);
    flMesh.position.y = -legH * 0.45;
    leftArm.add(flMesh);

    rightArm.position.set(0.22, -0.1, 0.42);
    const frMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, legH, 0.18), skinMat);
    frMesh.position.y = -legH * 0.45;
    rightArm.add(frMesh);

    // Hind legs (mapped to leftLeg / rightLeg)
    leftLeg.position.set(-0.22, legH * 0.85, -0.42);
    const blMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, legH, 0.2), skinMat);
    blMesh.position.y = -legH * 0.45;
    leftLeg.add(blMesh);

    rightLeg.position.set(0.22, legH * 0.85, -0.42);
    const brMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, legH, 0.2), skinMat);
    brMesh.position.y = -legH * 0.45;
    rightLeg.add(brMesh);
  } else if (primarySpeciesId === 'vulture') {
    isHovering = true;
    baseBodyY = 1.65;
    body.position.y = baseBodyY;

    // Avian body
    const avianTorso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), skinMat);
    avianTorso.scale.set(0.95, 0.85, 1.35);
    body.add(avianTorso);

    // Neck ruff + hooked beak head
    const ruff = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.1, 6, 12), accentMat);
    ruff.rotation.x = Math.PI * 0.4;
    ruff.position.set(0, 0.18, 0.42);
    body.add(ruff);

    head.position.set(0, 0.34, 0.56);
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), accentMat);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.38, 4), boneMat);
    beak.rotation.x = Math.PI * 0.58;
    beak.position.set(0, -0.04, 0.26);
    head.add(cranium, beak);
    addEyes(head, eyeMat, 0.11, 0.05, 0.16, 0.045);

    // Feathered tail fan
    tail.position.set(0, 0.0, -0.52);
    const tailFan = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.44), skinMat);
    tailFan.position.z = -0.18;
    tail.add(tailFan);

    // Articulated Wings
    const wingObj = createWingsGroup(skinMat, accentMat, 1.25);
    wings = wingObj.wings;
    leftWing = wingObj.leftWing;
    rightWing = wingObj.rightWing;
    body.add(wings);

    // Talons
    leftLeg.position.set(-0.16, baseBodyY - 0.3, 0.05);
    const lTalon = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.36, 5), boneMat);
    lTalon.position.y = -0.18;
    leftLeg.add(lTalon);

    rightLeg.position.set(0.16, baseBodyY - 0.3, 0.05);
    const rTalon = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.36, 5), boneMat);
    rTalon.position.y = -0.18;
    rightLeg.add(rTalon);
  } else if (primarySpeciesId === 'dragon') {
    isHovering = true;
    baseBodyY = 1.95;
    body.position.y = baseBodyY;

    // Armored apex drake body
    const drakeTorso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.82, 1.55), skinMat);
    const bellyPlates = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.2, 1.4), accentMat);
    bellyPlates.position.y = -0.36;
    body.add(drakeTorso, bellyPlates);

    // Long neck + horned dragon head
    head.position.set(0, 0.58, 0.92);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.65, 7), skinMat);
    neck.rotation.x = Math.PI * 0.25;
    neck.position.set(0, -0.22, -0.22);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.72), skinMat);
    head.add(neck, snout);
    addDragonHorns(head, boneMat);
    addEyes(head, eyeMat, 0.18, 0.1, 0.32, 0.07);

    // Long spiked dragon tail
    tail.position.set(0, 0.05, -0.78);
    const drakeTail = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.35, 6), skinMat);
    drakeTail.rotation.x = -Math.PI * 0.46;
    drakeTail.position.set(0, -0.12, -0.62);
    tail.add(drakeTail);

    // Massive Dragon Wings
    const wingObj = createWingsGroup(skinMat, accentMat, 1.85);
    wings = wingObj.wings;
    leftWing = wingObj.leftWing;
    rightWing = wingObj.rightWing;
    body.add(wings);

    // Foreclaws & Hindlegs
    leftArm.position.set(-0.5, -0.22, 0.45);
    leftArm.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), skinMat));
    rightArm.position.set(0.5, -0.22, 0.45);
    rightArm.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), skinMat));

    leftLeg.position.set(-0.36, baseBodyY - 0.35, -0.35);
    leftLeg.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.65, 0.28), skinMat));
    rightLeg.position.set(0.36, baseBodyY - 0.35, -0.35);
    rightLeg.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.65, 0.28), skinMat));
  }

  // --- INTER-SPECIES HYBRID ANATOMICAL GRAFTING ---
  if (isHybrid && secondarySpeciesId !== primarySpeciesId) {
    const parents = new Set([primarySpeciesId, secondarySpeciesId]);
    // Graft Orc tusks onto non-Orc hybrid (e.g. Goblorc, Olog-Troll, Chevaucheur Garou)
    if (parents.has('orc') && primarySpeciesId !== 'orc') {
      addOrcTusks(head, boneMat);
    }
    // Graft Troll rocky back boulders onto non-Troll hybrid
    if (parents.has('troll') && primarySpeciesId !== 'troll') {
      addTrollBackStones(body, accentMat);
    }
    // Graft Lion royal mane onto non-Lion hybrid (e.g. Warg-Lion, Griffon Sauvage)
    if (parents.has('lion') && primarySpeciesId !== 'lion') {
      addLionMane(head, accentMat);
    }
    // Graft Wings onto land species when hybridized with Vulture or Dragon (e.g. Griffon Sauvage, Drak-Troll, Lycan-Rapace)
    if ((parents.has('vulture') || parents.has('dragon')) && !wings) {
      const wingObj = createWingsGroup(skinMat, accentMat, parents.has('dragon') ? 1.55 : 1.25);
      wings = wingObj.wings;
      leftWing = wingObj.leftWing;
      rightWing = wingObj.rightWing;
      body.add(wings);
    }
    // Graft Dragon horns when hybridized with Dragon
    if (parents.has('dragon') && primarySpeciesId !== 'dragon') {
      addDragonHorns(head, boneMat);
    }
  }

  // --- MUTATION VISUAL ATTACHMENTS ---
  let emberCrown = null;
  let venomGroup = null;
  let auraRing = null;
  let titanRunes = null;

  // 1. pyro_gland ("Troll de Feu", etc.): glowing magma horns, fiery veins on torso, floating ember crown (0xff4500)
  if (hasMutation('pyro_gland')) {
    const magmaMat = new THREE.MeshStandardMaterial({
      color: 0xff4500,
      emissive: 0xff3300,
      emissiveIntensity: 2.0,
      roughness: 0.2,
    });

    // Magma horns on head
    const hornGeo = new THREE.ConeGeometry(0.11, 0.48, 5);
    const lHorn = new THREE.Mesh(hornGeo, magmaMat);
    lHorn.position.set(-0.22, 0.34, 0.05);
    lHorn.rotation.z = 0.35;
    const rHorn = new THREE.Mesh(hornGeo, magmaMat);
    rHorn.position.set(0.22, 0.34, 0.05);
    rHorn.rotation.z = -0.35;
    head.add(lHorn, rHorn);

    // Fiery emissive magma veins across torso
    for (let i = 0; i < 4; i++) {
      const vein = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.07, 0.58), magmaMat);
      vein.position.y = -0.15 + i * 0.14;
      vein.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.22;
      body.add(vein);
    }

    // Floating ember crown orbiting above head
    emberCrown = new THREE.Group();
    emberCrown.position.set(0, 0.62, 0);
    const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 6, 16), magmaMat);
    crownRing.rotation.x = Math.PI / 2;
    emberCrown.add(crownRing);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), magmaMat);
      shard.position.set(Math.cos(angle) * 0.36, 0.08, Math.sin(angle) * 0.36);
      emberCrown.add(shard);
    }
    head.add(emberCrown);
  }

  // 2. venom_sacs: pulsing toxic green dorsal bulbs (0x39ff14)
  if (hasMutation('venom_sacs')) {
    const venomMat = new THREE.MeshStandardMaterial({
      color: 0x39ff14,
      emissive: 0x28cc0e,
      emissiveIntensity: 1.5,
      roughness: 0.25,
    });
    venomGroup = new THREE.Group();
    const bulbPositions = [
      [-0.22, 0.32, -0.24],
      [0.22, 0.32, -0.24],
      [0, 0.44, -0.28],
      [-0.16, 0.12, -0.28],
      [0.16, 0.12, -0.28],
    ];
    for (const [bx, by, bz] of bulbPositions) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), venomMat);
      bulb.position.set(bx, by, bz);
      venomGroup.add(bulb);
    }
    body.add(venomGroup);
  }

  // 3. osteo_plating: jagged ivory bone shoulder/back armor plates (0xe8e4d9)
  if (hasMutation('osteo_plating')) {
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xe8e4d9,
      roughness: 0.35,
      metalness: 0.15,
    });
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.46, 4), plateMat);
      spike.position.set(0, 0.38 - i * 0.2, -0.32);
      spike.rotation.x = -Math.PI * 0.35;
      body.add(spike);
    }
    const lPlate = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), plateMat);
    lPlate.position.set(-0.46, 0.38, 0);
    const rPlate = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), plateMat);
    rPlate.position.set(0.46, 0.38, 0);
    body.add(lPlate, rPlate);
  }

  // 4. vampiric_maw: crimson fangs & blood-red aura ring (0xdc143c)
  if (hasMutation('vampiric_maw')) {
    const fangMat = new THREE.MeshStandardMaterial({
      color: 0xdc143c,
      emissive: 0xaa0022,
      emissiveIntensity: 1.3,
    });
    const fangGeo = new THREE.ConeGeometry(0.06, 0.28, 4);
    const lFang = new THREE.Mesh(fangGeo, fangMat);
    lFang.position.set(-0.14, -0.2, 0.28);
    lFang.rotation.x = Math.PI;
    const rFang = new THREE.Mesh(fangGeo, fangMat);
    rFang.position.set(0.14, -0.2, 0.28);
    rFang.rotation.x = Math.PI;
    head.add(lFang, rFang);

    const ringGeo = new THREE.RingGeometry(0.65, 0.85, 24);
    ringGeo.rotateX(-Math.PI / 2);
    auraRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xdc143c,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      })
    );
    auraRing.position.y = 0.06;
    group.add(auraRing);
  }

  // 5. cryo_blood: translucent crystalline ice spikes on back (0x00e5ff)
  if (hasMutation('cryo_blood')) {
    const cryoMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00b4d8,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.85,
      roughness: 0.1,
      metalness: 0.5,
    });
    const crystalOffsets = [
      [-0.25, 0.42, -0.2, 0.3, -0.4],
      [0.25, 0.42, -0.2, -0.3, -0.4],
      [0, 0.55, -0.26, 0, -0.5],
      [-0.18, 0.2, -0.28, 0.2, -0.6],
      [0.18, 0.2, -0.28, -0.2, -0.6],
    ];
    for (const [cx, cy, cz, rz, rx] of crystalOffsets) {
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.58, 5), cryoMat);
      shard.position.set(cx, cy, cz);
      shard.rotation.set(rx, 0, rz);
      body.add(shard);
    }
  }

  // 6. winged_leap: extra membrane wings on back
  if (hasMutation('winged_leap') && !wings) {
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x9b5de5,
      emissive: 0x480ca8,
      emissiveIntensity: 0.6,
      side: THREE.DoubleSide,
    });
    const wingObj = createWingsGroup(wingMat, accentMat, 1.35);
    wings = wingObj.wings;
    leftWing = wingObj.leftWing;
    rightWing = wingObj.rightWing;
    body.add(wings);
  }

  // 7. titan_growth: 1.35x scale multiplier + golden/amber runes
  let mutationScaleMult = 1.0;
  if (hasMutation('titan_growth')) {
    mutationScaleMult *= 1.35;
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0xffbe0b,
      emissive: 0xfb5607,
      emissiveIntensity: 1.6,
    });
    titanRunes = new THREE.Group();
    titanRunes.position.y = 0.2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), runeMat);
      rune.position.set(Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72);
      titanRunes.add(rune);
    }
    body.add(titanRunes);
  }

  // Compute genome-driven overall adult scale
  const baseSize = spA.baseSize || 1.0;
  const geneSize = genome.genes?.size ? genome.genes.size / baseSize : 1.0;
  const adultScale = Math.max(0.55, Math.min(2.6, baseSize * Math.sqrt(geneSize) * mutationScaleMult));
  const isBaby = spec.lifeStage === 'baby' || spec.isAdult === false;
  const babyScaleMult = CONFIG.ECO?.BABY_SCALE || 0.5;
  const initialScale = isBaby ? adultScale * babyScaleMult : adultScale;
  group.scale.setScalar(initialScale);
  group.userData = group.userData || {};
  group.userData.adultScale = adultScale;

  // --- FLOATING OVERHEAD 3D STATUS INDICATOR (HP BAR + MUTANT DIAMOND + BABY RING) ---
  const overlayGroup = new THREE.Group();
  overlayGroup.position.set(0, baseBodyY + 1.25, 0);
  group.add(overlayGroup);

  const hpBarBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.13),
    new THREE.MeshBasicMaterial({ color: 0x0d131a, side: THREE.DoubleSide })
  );
  const hpBarFill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.04, 0.08),
    new THREE.MeshBasicMaterial({
      color: isPatientZero ? 0xff3b30 : mutationIds.length > 0 ? 0xff9f1c : 0x38c172,
      side: THREE.DoubleSide,
    })
  );
  hpBarFill.position.z = 0.01;
  overlayGroup.add(hpBarBg, hpBarFill);

  // Juvenile / Baby glowing cradle ring around HP bar (visible while lifeStage === 'baby')
  const babyBadge = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.035, 6, 14),
    new THREE.MeshBasicMaterial({ color: 0x7bed9f })
  );
  babyBadge.position.set(-0.68, 0, 0.01);
  babyBadge.visible = isBaby;
  overlayGroup.add(babyBadge);

  // Mutant / Patient Zero / Hybrid floating diamond indicator
  const showDiamond = isPatientZero || mutationIds.length > 0 || isHybrid;
  const diamondColor = isPatientZero
    ? 0xff2a2a
    : hasMutation('pyro_gland')
      ? 0xff5500
      : mutationIds.length > 0
        ? 0xffbe0b
        : 0x48dbfb;
  const mutantDiamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(isPatientZero ? 0.24 : 0.17, 0),
    new THREE.MeshStandardMaterial({
      color: diamondColor,
      emissive: diamondColor,
      emissiveIntensity: 1.8,
    })
  );
  mutantDiamond.position.y = 0.34;
  mutantDiamond.visible = showDiamond;
  overlayGroup.add(mutantDiamond);

  const limbs = {
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    tail,
    wings,
    leftWing,
    rightWing,
    weapon,
    emberCrown,
    venomGroup,
    auraRing,
    titanRunes,
    overlayGroup,
    hpBarFill,
    hpBarBg,
    babyBadge,
    mutantDiamond,
    isQuadruped,
    isHovering,
    baseBodyY,
    adultScale,
  };

  attachLimbReferences(group, limbs);
  enableShadows(group);
  return group;
}

/**
 * Adds a pair of glowing eyes to a head group.
 */
function addEyes(headGroup, eyeMat, xOffset, yOffset, zOffset, radius = 0.06) {
  const eyeGeo = new THREE.SphereGeometry(radius, 6, 6);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-xOffset, yOffset, zOffset);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(xOffset, yOffset, zOffset);
  headGroup.add(leftEye, rightEye);
}

/**
 * Grafts twin curved lower-jaw Orc tusks onto a creature's head.
 */
function addOrcTusks(headGroup, boneMat) {
  const tuskGeo = new THREE.ConeGeometry(0.055, 0.24, 4);
  const leftTusk = new THREE.Mesh(tuskGeo, boneMat);
  leftTusk.position.set(-0.16, -0.06, 0.28);
  leftTusk.rotation.x = Math.PI * 0.15;
  const rightTusk = new THREE.Mesh(tuskGeo, boneMat);
  rightTusk.position.set(0.16, -0.06, 0.28);
  rightTusk.rotation.x = Math.PI * 0.15;
  headGroup.add(leftTusk, rightTusk);
}

/**
 * Grafts rocky dorsal boulders onto a Troll or hybrid body.
 */
function addTrollBackStones(bodyGroup, stoneMat) {
  const offsets = [
    [0, 0.56, -0.28, 0.22],
    [-0.28, 0.42, -0.32, 0.18],
    [0.28, 0.42, -0.32, 0.18],
  ];
  for (const [x, y, z, r] of offsets) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stoneMat);
    rock.position.set(x, y, z);
    bodyGroup.add(rock);
  }
}

/**
 * Grafts a thick royal Lion mane collar around a creature's head.
 */
function addLionMane(headGroup, maneMat) {
  const mane = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 1), maneMat);
  mane.position.set(0, 0.04, -0.08);
  mane.scale.set(1.15, 1.15, 0.85);
  headGroup.add(mane);
}

/**
 * Grafts swept-back Dragon horns onto a creature's head.
 */
function addDragonHorns(headGroup, hornMat) {
  const hornGeo = new THREE.ConeGeometry(0.08, 0.52, 5);
  const lHorn = new THREE.Mesh(hornGeo, hornMat);
  lHorn.position.set(-0.18, 0.28, -0.12);
  lHorn.rotation.set(-Math.PI * 0.28, 0, 0.25);
  const rHorn = new THREE.Mesh(hornGeo, hornMat);
  rHorn.position.set(0.18, 0.28, -0.12);
  rHorn.rotation.set(-Math.PI * 0.28, 0, -0.25);
  headGroup.add(lHorn, rHorn);
}

/**
 * Creates an articulated pair of wings (`wings`, `leftWing`, `rightWing`).
 */
function createWingsGroup(primaryMat, accentMat, span = 1.4) {
  const wings = new THREE.Group();
  wings.name = 'wings';
  wings.position.set(0, 0.28, -0.1);

  const leftWing = new THREE.Group();
  leftWing.position.set(-0.25, 0, 0);
  const lMembrane = new THREE.Mesh(new THREE.BoxGeometry(span, 0.06, 0.62), primaryMat);
  lMembrane.position.set(-span * 0.48, 0, -0.05);
  const lStrut = new THREE.Mesh(new THREE.BoxGeometry(span * 1.05, 0.09, 0.1), accentMat);
  lStrut.position.set(-span * 0.48, 0.02, 0.22);
  leftWing.add(lMembrane, lStrut);

  const rightWing = new THREE.Group();
  rightWing.position.set(0.25, 0, 0);
  const rMembrane = new THREE.Mesh(new THREE.BoxGeometry(span, 0.06, 0.62), primaryMat);
  rMembrane.position.set(span * 0.48, 0, -0.05);
  const rStrut = new THREE.Mesh(new THREE.BoxGeometry(span * 1.05, 0.09, 0.1), accentMat);
  rStrut.position.set(span * 0.48, 0.02, 0.22);
  rightWing.add(rMembrane, rStrut);

  wings.add(leftWing, rightWing);
  return { wings, leftWing, rightWing };
}

/**
 * Updates the overhead 3D HP bar, Patient Zero diamond indicator, and Juvenile-to-Adult
 * 3D scale progression on a creature mesh.
 *
 * @param {THREE.Group} group - Creature root group.
 * @param {number} hp - Current HP.
 * @param {number} maxHp - Maximum HP.
 * @param {boolean} [isPatientZero=false] - Whether this is a Patient Zero carrier.
 * @param {boolean} [spottedByScout=false] - Whether spotted by a Scout.
 * @param {boolean} [isBaby=false] - Whether the creature is currently a juvenile ('baby').
 * @param {number} [growthProgress=1.0] - Normalized maturation progress in [0..1].
 */
export function updateCreatureOverlay(
  group,
  hp,
  maxHp,
  isPatientZero = false,
  spottedByScout = false,
  isBaby = false,
  growthProgress = 1.0
) {
  const limbs = group?.userData?.limbs;
  if (!limbs) return;

  if (limbs.hpBarFill) {
    const ratio = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 1));
    limbs.hpBarFill.scale.x = Math.max(0.001, ratio);
    limbs.hpBarFill.position.x = -(1 - ratio) * 0.52;
  }

  if (limbs.mutantDiamond && (isPatientZero || spottedByScout)) {
    limbs.mutantDiamond.visible = true;
  }

  if (limbs.babyBadge) {
    limbs.babyBadge.visible = Boolean(isBaby);
  }

  const adultScale = group.userData?.adultScale || limbs.adultScale || 1.0;
  const babyScaleMult = CONFIG.ECO?.BABY_SCALE || 0.5;
  const mult = isBaby ? babyScaleMult + (1.0 - babyScaleMult) * Math.max(0, Math.min(1, growthProgress)) : 1.0;
  group.scale.setScalar(adultScale * mult);
}

/**
 * Smoothly animates a creature's walk cycle, attack swing, wing flap, idle breathing,
 * mutation attachments, and damage hit flash.
 *
 * @param {THREE.Group} group - Root creature group built by `buildCreatureMesh`.
 * @param {Object} [animState={}] - Current animation state.
 * @param {boolean} [animState.isMoving=false] - Whether the entity is moving.
 * @param {number} [animState.speed=4] - Current movement speed.
 * @param {boolean} [animState.isAttacking=false] - Whether performing an attack swing.
 * @param {number} [animState.attackProgress=0] - Attack progress in [0..1].
 * @param {number} [animState.hitFlash=0] - Remaining hit flash intensity in [0..1].
 * @param {number} elapsedTime - Total elapsed game time in seconds.
 * @param {number} dt - Frame delta time in seconds.
 */
export function animateCreatureMesh(group, animState = {}, elapsedTime = 0, dt = 0.016) {
  if (!group || !group.userData?.limbs) return;
  const limbs = group.userData.limbs;
  const isMoving = Boolean(animState.isMoving || (animState.speed && animState.speed > 0.25));
  const moveSpeed = animState.speed || 4.5;
  const phase = elapsedTime * Math.max(4.5, moveSpeed * 1.15) + (group.id || 0) * 0.7;

  // 1. Walk Cycle & Idle Breathing
  if (limbs.body) {
    const hoverOffset = limbs.isHovering ? Math.sin(elapsedTime * 3.8 + (group.id || 0)) * 0.22 : 0;
    const walkBob = isMoving && !limbs.isHovering ? Math.abs(Math.sin(phase)) * 0.1 : Math.sin(elapsedTime * 2.2) * 0.03;
    limbs.body.position.y = limbs.baseBodyY + hoverOffset + walkBob;
  }

  if (isMoving && !limbs.isHovering) {
    const swingAmp = limbs.isQuadruped ? 0.55 : 0.62;
    if (limbs.leftLeg) limbs.leftLeg.rotation.x = Math.sin(phase) * swingAmp;
    if (limbs.rightLeg) limbs.rightLeg.rotation.x = -Math.sin(phase) * swingAmp;

    if (limbs.isQuadruped) {
      if (limbs.leftArm) limbs.leftArm.rotation.x = -Math.sin(phase) * swingAmp;
      if (limbs.rightArm) limbs.rightArm.rotation.x = Math.sin(phase) * swingAmp;
    } else {
      if (limbs.leftArm) limbs.leftArm.rotation.x = -Math.sin(phase) * (swingAmp * 0.75);
      if (limbs.rightArm && !animState.isAttacking) {
        limbs.rightArm.rotation.x = Math.sin(phase) * (swingAmp * 0.75);
      }
    }
  } else {
    // Smoothly damp limbs toward idle pose
    const damp = Math.min(1, dt * 10);
    if (limbs.leftLeg) limbs.leftLeg.rotation.x *= 1 - damp;
    if (limbs.rightLeg) limbs.rightLeg.rotation.x *= 1 - damp;
    if (limbs.leftArm) limbs.leftArm.rotation.x *= 1 - damp;
    if (limbs.rightArm && !animState.isAttacking) limbs.rightArm.rotation.x *= 1 - damp;
  }

  // 2. Attack Swing Animation
  if (limbs.rightArm && (animState.isAttacking || animState.attackProgress > 0)) {
    const p = animState.attackProgress !== undefined ? animState.attackProgress : (Math.sin(elapsedTime * 16) + 1) * 0.5;
    limbs.rightArm.rotation.x = -Math.PI * 0.75 + Math.sin(p * Math.PI) * 1.85;
    limbs.rightArm.rotation.z = -Math.sin(p * Math.PI) * 0.35;
  } else if (limbs.rightArm) {
    limbs.rightArm.rotation.z *= 0.85;
  }

  // 3. Wing Flap (for Vulture, Dragon, Winged Hybrids, or Winged Leap Mutants)
  if (limbs.leftWing && limbs.rightWing) {
    const flapFreq = limbs.isHovering || isMoving ? 7.5 : 3.2;
    const flapAmp = limbs.isHovering || isMoving ? 0.55 : 0.25;
    const flapAngle = Math.sin(elapsedTime * flapFreq + (group.id || 0)) * flapAmp;
    limbs.leftWing.rotation.z = flapAngle;
    limbs.rightWing.rotation.z = -flapAngle;
  }

  // 4. Tail / Cape Sway
  if (limbs.tail) {
    limbs.tail.rotation.y = Math.sin(elapsedTime * (isMoving ? 6.0 : 2.2)) * 0.24;
  }

  // 5. Mutation Attachments Animation
  if (limbs.emberCrown) {
    limbs.emberCrown.rotation.y = elapsedTime * 2.4;
    limbs.emberCrown.position.y = 0.62 + Math.sin(elapsedTime * 4.5) * 0.06;
  }
  if (limbs.venomGroup) {
    const pulse = 1 + Math.sin(elapsedTime * 5.0) * 0.16;
    limbs.venomGroup.scale.setScalar(pulse);
  }
  if (limbs.titanRunes) {
    limbs.titanRunes.rotation.y = -elapsedTime * 1.8;
  }
  if (limbs.mutantDiamond && limbs.mutantDiamond.visible) {
    limbs.mutantDiamond.rotation.y = elapsedTime * 2.8;
    limbs.mutantDiamond.position.y = 0.34 + Math.sin(elapsedTime * 4.0) * 0.06;
  }
}
