/**
 * @file src/config.js
 * @description Centralized configuration module for Genesis Bastion.
 * Defines all world generation parameters, Conway's Game of Life ecological density
 * thresholds, base species traits across 3 evolutionary clades, the 7x7 symmetric
 * phylogenetic distance matrix governing inter-species hybridization, Mendelian
 * dominant mutations (including the iconic "Glande Pyroclastique / Feu" for the
 * Fire Troll scenario), Bastion defenses, Scout NPC parameters, and roguelike
 * player upgrades.
 */

export const CONFIG = {
  /**
   * 3D Island World & Spatial Grid Configuration
   */
  WORLD: {
    SIZE: 240,
    WATER_LEVEL: -1.2,
    BIOME_SCALE: 0.015,
    GRID_CELLS: 24,
    SAFE_SPAWN_RADIUS: 42,
    DAY_DURATION: 120,
  },

  /**
   * Conway's Game of Life & Darwinian Ecosystem Parameters
   */
  ECO: {
    TICK_INTERVAL: 12,
    MIN_DENSITY: 2,
    MAX_DENSITY: 6,
    OPTIMAL_MAX: 5,
    BASE_BIOMASS: 100,
    BIOMASS_REGEN: 18,
    BIRTH_BIOMASS_COST: 22,
    NEIGHBOR_RADIUS: 22,
    MUTATION_RATE: 0.08,
    DOMINANT_INHERITANCE_SINGLE: 0.78,
    DOMINANT_INHERITANCE_BOTH: 0.92,
    HYBRID_MAX_DIST: 0.45,
    HYBRID_BASE_CHANCE: 0.22,
    STARVATION_DPS: 4.5,
    INITIAL_POPULATION: 42,
    MAX_WORLD_POPULATION: 130,
  },

  /**
   * Evolutionary Clade Metadata
   */
  CLADES: {
    greenskin: {
      id: 'greenskin',
      name: 'Peaux-Vertes',
      description: 'Tribu humanoïde robuste à forte adaptabilité territoriale (Gobelin, Orc, Troll).',
      color: '#4caf50',
      colorHex: 0x4caf50,
    },
    beast: {
      id: 'beast',
      name: 'Bêtes Sauvages',
      description: 'Prédateurs véloces de meute et des cieux (Loup, Lion, Vautour).',
      color: '#d99b38',
      colorHex: 0xd99b38,
    },
    apex: {
      id: 'apex',
      name: 'Prédateurs Apex',
      description: 'Créatures draconiques anciennes situées au sommet de la chaîne trophique (Dragon).',
      color: '#e04038',
      colorHex: 0xe04038,
    },
  },

  /**
   * Base Species Definitions (7 core species across 3 clades)
   */
  SPECIES: {
    goblin: {
      id: 'goblin',
      name: 'Gobelin',
      clade: 'greenskin',
      baseHp: 48,
      baseSpeed: 8.8,
      baseDamage: 8,
      baseSize: 0.78,
      color: '#5b9e3e',
      accentColor: '#9be061',
      colorHex: 0x5b9e3e,
      accentHex: 0x9be061,
      preferredBiome: 'forest',
      metabolism: 3.2,
      fertility: 1.25,
      aggroRadius: 16,
      xpReward: 15,
      description: 'Éclaireur peau-verte agile, prolifique mais fragile en duel.',
    },
    orc: {
      id: 'orc',
      name: 'Orc',
      clade: 'greenskin',
      baseHp: 95,
      baseSpeed: 6.8,
      baseDamage: 15,
      baseSize: 1.08,
      color: '#3f7833',
      accentColor: '#c97a3e',
      colorHex: 0x3f7833,
      accentHex: 0xc97a3e,
      preferredBiome: 'plains',
      metabolism: 4.8,
      fertility: 1.05,
      aggroRadius: 19,
      xpReward: 28,
      description: 'Guerrier tribal discipliné capable de s’hybrider avec les Gobelins et les Trolls.',
    },
    troll: {
      id: 'troll',
      name: 'Troll',
      clade: 'greenskin',
      baseHp: 175,
      baseSpeed: 5.1,
      baseDamage: 24,
      baseSize: 1.52,
      color: '#346357',
      accentColor: '#78a898',
      colorHex: 0x346357,
      accentHex: 0x78a898,
      preferredBiome: 'highlands',
      metabolism: 7.2,
      fertility: 0.85,
      aggroRadius: 21,
      xpReward: 48,
      description: 'Colosse massif des hautes terres. Redoutable s’il développe la Glande Pyroclastique.',
    },
    wolf: {
      id: 'wolf',
      name: 'Loup',
      clade: 'beast',
      baseHp: 58,
      baseSpeed: 9.6,
      baseDamage: 11,
      baseSize: 0.85,
      color: '#737d8c',
      accentColor: '#b8c4d4',
      colorHex: 0x737d8c,
      accentHex: 0xb8c4d4,
      preferredBiome: 'forest',
      metabolism: 3.8,
      fertility: 1.2,
      aggroRadius: 20,
      xpReward: 20,
      description: 'Chasseur de meute rapide qui prospère dans les forêts denses.',
    },
    lion: {
      id: 'lion',
      name: 'Lion',
      clade: 'beast',
      baseHp: 110,
      baseSpeed: 8.2,
      baseDamage: 18,
      baseSize: 1.15,
      color: '#d4943a',
      accentColor: '#7a4419',
      colorHex: 0xd4943a,
      accentHex: 0x7a4419,
      preferredBiome: 'plains',
      metabolism: 5.4,
      fertility: 1.0,
      aggroRadius: 22,
      xpReward: 34,
      description: 'Félin territorial dominant des plaines dorées.',
    },
    vulture: {
      id: 'vulture',
      name: 'Vautour',
      clade: 'beast',
      baseHp: 64,
      baseSpeed: 10.2,
      baseDamage: 13,
      baseSize: 0.9,
      color: '#5e4b44',
      accentColor: '#d96b52',
      colorHex: 0x5e4b44,
      accentHex: 0xd96b52,
      preferredBiome: 'highlands',
      metabolism: 3.5,
      fertility: 1.1,
      aggroRadius: 24,
      xpReward: 24,
      description: 'Charognard ailé des crêtes rocheuses, chaînon évolutif vers les reptiles ailés.',
    },
    dragon: {
      id: 'dragon',
      name: 'Dragon',
      clade: 'apex',
      baseHp: 260,
      baseSpeed: 7.4,
      baseDamage: 34,
      baseSize: 1.85,
      color: '#b82929',
      accentColor: '#ff9436',
      colorHex: 0xb82929,
      accentHex: 0xff9436,
      preferredBiome: 'volcanic',
      metabolism: 10.5,
      fertility: 0.65,
      aggroRadius: 26,
      xpReward: 85,
      description: 'Prédateur apex de la caldeira volcanique au métabolisme vorace.',
    },
  },

  /**
   * 2D Symmetric Phylogenetic Distance Matrix between all 7 species.
   * Pairs with distance <= ECO.HYBRID_MAX_DIST (0.45) can interbreed to produce fertile hybrids.
   * Distant species (> 0.45, e.g. goblin-dragon = 0.85) are reproductively isolated.
   */
  PHYLOGENY_DIST: {
    goblin: {
      goblin: 0.0,
      orc: 0.18,
      troll: 0.32,
      wolf: 0.62,
      lion: 0.72,
      vulture: 0.78,
      dragon: 0.85,
    },
    orc: {
      goblin: 0.18,
      orc: 0.0,
      troll: 0.22,
      wolf: 0.44,
      lion: 0.58,
      vulture: 0.70,
      dragon: 0.68,
    },
    troll: {
      goblin: 0.32,
      orc: 0.22,
      troll: 0.0,
      wolf: 0.64,
      lion: 0.60,
      vulture: 0.66,
      dragon: 0.42,
    },
    wolf: {
      goblin: 0.62,
      orc: 0.44,
      troll: 0.64,
      wolf: 0.0,
      lion: 0.20,
      vulture: 0.40,
      dragon: 0.74,
    },
    lion: {
      goblin: 0.72,
      orc: 0.58,
      troll: 0.60,
      wolf: 0.20,
      lion: 0.0,
      vulture: 0.35,
      dragon: 0.62,
    },
    vulture: {
      goblin: 0.78,
      orc: 0.70,
      troll: 0.66,
      wolf: 0.40,
      lion: 0.35,
      vulture: 0.0,
      dragon: 0.38,
    },
    dragon: {
      goblin: 0.85,
      orc: 0.68,
      troll: 0.42,
      wolf: 0.74,
      lion: 0.62,
      vulture: 0.38,
      dragon: 0.0,
    },
  },

  /**
   * Mendelian Dominant Mutations Catalog.
   * When a mutation emerges spontaneously (de novo) or is carried by a parent,
   * its fitnessBonus increases mate selection weight and it inherits dominantly (78%–92%),
   * swiftly sweeping through the population unless the Player hunts down Patient Zero.
   */
  MUTATIONS: {
    pyro_gland: {
      id: 'pyro_gland',
      name: 'Glande Pyroclastique (Feu)',
      shortLabel: 'Pyro / Feu',
      description:
        'Organe exocrine incandescent générant une couronne de magma et des attaques enflammées dévastatrices. Rend les Trolls de Feu capables de dominer tout un biome.',
      dominant: true,
      fitnessBonus: 0.45,
      metabolismCost: 1.15,
      statMultipliers: {
        maxHp: 1.25,
        strength: 1.45,
        speed: 1.08,
        size: 1.18,
      },
      colorHex: 0xff4500,
      emissiveHex: 0xff2200,
      colorCss: '#ff4500',
      emissiveCss: '#ff2200',
      visualTag: 'pyro_crown',
    },
    venom_sacs: {
      id: 'venom_sacs',
      name: 'Sacs à Venin Neurotoxique',
      shortLabel: 'Venin',
      description:
        'Bulbes dorsaux bioluminescents sécrétant des toxines corrosives qui augmentent la létalité et l’agressivité.',
      dominant: true,
      fitnessBonus: 0.34,
      metabolismCost: 1.05,
      statMultipliers: {
        maxHp: 1.05,
        strength: 1.35,
        speed: 1.15,
        size: 1.04,
      },
      colorHex: 0x39ff14,
      emissiveHex: 0x1ec800,
      colorCss: '#39ff14',
      emissiveCss: '#1ec800',
      visualTag: 'venom_bulbs',
    },
    osteo_plating: {
      id: 'osteo_plating',
      name: 'Carapace Ostéo-Dermique',
      shortLabel: 'Carapace',
      description:
        'Plaques osseuses d’ivoire soudées sur le thorax et les épaules, conférant une résistance massive aux coups.',
      dominant: true,
      fitnessBonus: 0.38,
      metabolismCost: 1.1,
      statMultipliers: {
        maxHp: 1.55,
        strength: 1.12,
        speed: 0.94,
        size: 1.16,
      },
      colorHex: 0xe8e4d9,
      emissiveHex: 0x9e9578,
      colorCss: '#e8e4d9',
      emissiveCss: '#9e9578',
      visualTag: 'bone_armor',
    },
    vampiric_maw: {
      id: 'vampiric_maw',
      name: 'Crocs Hématophages',
      shortLabel: 'Vampirique',
      description:
        'Mandibules écarlates qui régénèrent la créature en combat et stimulent sa fécondité prédatrice.',
      dominant: true,
      fitnessBonus: 0.4,
      metabolismCost: 1.08,
      statMultipliers: {
        maxHp: 1.18,
        strength: 1.38,
        speed: 1.16,
        size: 1.08,
      },
      colorHex: 0xdc143c,
      emissiveHex: 0x990022,
      colorCss: '#dc143c',
      emissiveCss: '#990022',
      visualTag: 'crimson_fangs',
    },
    cryo_blood: {
      id: 'cryo_blood',
      name: 'Hémolymphe Cryogénique',
      shortLabel: 'Cryo / Givre',
      description:
        'Cristaux de givre dorsaux ralentissant le métabolisme basal (résistance aux famines) tout en renforçant la vigueur.',
      dominant: true,
      fitnessBonus: 0.36,
      metabolismCost: 0.8,
      statMultipliers: {
        maxHp: 1.3,
        strength: 1.22,
        speed: 1.05,
        size: 1.1,
      },
      colorHex: 0x00e5ff,
      emissiveHex: 0x0088cc,
      colorCss: '#00e5ff',
      emissiveCss: '#0088cc',
      visualTag: 'ice_spikes',
    },
    winged_leap: {
      id: 'winged_leap',
      name: 'Membranes Alaires',
      shortLabel: 'Ailé',
      description:
        'Excroissances membraneuses dorsales permettant des bonds fulgurants et une dispersion rapide entre biomes.',
      dominant: true,
      fitnessBonus: 0.35,
      metabolismCost: 1.12,
      statMultipliers: {
        maxHp: 1.0,
        strength: 1.15,
        speed: 1.42,
        size: 1.06,
      },
      colorHex: 0xffb300,
      emissiveHex: 0xcc7700,
      colorCss: '#ffb300',
      emissiveCss: '#cc7700',
      visualTag: 'membrane_wings',
    },
    titan_growth: {
      id: 'titan_growth',
      name: 'Gigantisme Titanesque',
      shortLabel: 'Titan',
      description:
        'Hypertrophie hormonale héréditaire décuplant la carrure, la vitalité et la force brute au prix d’un appétit colossal.',
      dominant: true,
      fitnessBonus: 0.48,
      metabolismCost: 1.35,
      statMultipliers: {
        maxHp: 1.65,
        strength: 1.5,
        speed: 0.92,
        size: 1.35,
      },
      colorHex: 0xffd700,
      emissiveHex: 0xd48800,
      colorCss: '#ffd700',
      emissiveCss: '#d48800',
      visualTag: 'titan_runes',
    },
  },

  /**
   * Central Sanctuary Bastion Parameters
   */
  BASTION: {
    POS: { x: 0, z: 0 },
    RADIUS: 14,
    INITIAL_HP: 500,
    MAX_HP: 500,
    HEAL_RATE: 15,
    STRUCTURES: {
      watchtower: {
        id: 'watchtower',
        name: 'Tour de Guet',
        woodCost: 25,
        crystalCost: 10,
        range: 34,
        damage: 16,
        fireInterval: 1.4,
      },
      palisade: {
        id: 'palisade',
        name: 'Palissade Runique',
        woodCost: 30,
        crystalCost: 5,
        hpBonus: 180,
        thornsDamage: 8,
      },
      biolab: {
        id: 'biolab',
        name: 'Bio-Laboratoire',
        woodCost: 20,
        crystalCost: 20,
        scoutVisionBonus: 12,
      },
    },
  },

  /**
   * Scout (Éclaireur) & Allied NPC Parameters
   */
  SCOUT: {
    SPEED: 13,
    VISION_RADIUS: 34,
    FLEE_RADIUS: 16,
    HP: 60,
    PATROL_MIN_RADIUS: 28,
    PATROL_MAX_RADIUS: 98,
  },

  /**
   * Player Base Attributes
   */
  PLAYER: {
    MAX_HP: 160,
    SPEED: 13.5,
    DASH_SPEED: 30,
    DASH_DURATION: 0.22,
    DASH_COOLDOWN: 1.4,
    CLEAVE_DAMAGE: 32,
    CLEAVE_RANGE: 5.2,
    CLEAVE_COOLDOWN: 0.42,
    INTERACT_RADIUS: 5.5,
  },

  /**
   * Roguelike Level-Up Upgrade Cards for the Player
   */
  UPGRADES: [
    {
      id: 'cleave_damage',
      name: 'Lame d’Éradication Génétique',
      category: 'Combat',
      description: '+35% dégâts de fente (Cleave) et +25% dégâts bonus contre les Mutants et Hybrides.',
      icon: '⚔️',
      bonus: { cleaveDamageMult: 1.35, mutantDamageMult: 1.25 },
    },
    {
      id: 'move_speed',
      name: 'Bottes de Traqueur',
      category: 'Mobilité',
      description: '+20% vitesse de déplacement et réduction de 25% du temps de recharge d’esquive.',
      icon: '🥾',
      bonus: { speedMult: 1.2, dashCooldownMult: 0.75 },
    },
    {
      id: 'max_hp_regen',
      name: 'Sang d’Ambre Régénérant',
      category: 'Survie',
      description: '+50 PV Maximum, restauration immédiate de 60 PV et régénération passive accrue.',
      icon: '❤️',
      bonus: { maxHpFlat: 50, healInstant: 60, regenPerSec: 2.5 },
    },
    {
      id: 'scout_vision',
      name: 'Optiques d’Éclaireur Faucon',
      category: 'Éclaireurs',
      description: '+30% rayon de détection des Éclaireurs et +20% vitesse de fuite des Éclaireurs.',
      icon: '🦅',
      bonus: { scoutVisionMult: 1.3, scoutSpeedMult: 1.2 },
    },
    {
      id: 'bastion_turret_power',
      name: 'Balistes Alchimiques du Bastion',
      category: 'Bastion',
      description: '+40% dégâts de tir des Gardes et des Tours de Guet, +150 PV au Bastion.',
      icon: '🏰',
      bonus: { turretDamageMult: 1.4, bastionHpBonus: 150 },
    },
    {
      id: 'fire_resist',
      name: 'Égide Ignifuge & Cryo-Purge',
      category: 'Défense',
      description: 'Réduit de 35% les dégâts subis des mutants élémentaires (Feu/Venin) et élargit l’arc d’attaque.',
      icon: '🛡️',
      bonus: { damageReduction: 0.35, cleaveRangeAdd: 1.2 },
    },
  ],
};

export default CONFIG;
