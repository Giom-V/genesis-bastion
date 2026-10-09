/**
 * @file src/ecosystem/OnboardingSteps.js
 * @description Définition structurée de l'Onboarding Interactif en 7 Actes (5 à 10 premières minutes)
 * pour **Genesis Bastion**, conçu selon le principe de **Dévoilement Progressif (Progressive Disclosure)**.
 *
 * Problème résolu :
 * - Au lieu de submerger le joueur dès la seconde 0 avec 42 monstres en évolution, 4 panneaux
 *   de HUD complexes et des comptes à rebours écologiques, l'écosystème démarre **en pause**
 *   (`ecoPaused: true`, `0` monstre sauvage).
 * - Chaque Acte enseigne **une seule mécanique fondamentale** par l'action directe, accompagnée :
 *   1. D'une flèche directionnelle 3D dorée au sol (`targetWorldPos`),
 *   2. De badges de touches explicites (`keys` & `keyBadges`),
 *   3. De bulles contextuelles en monde 3D (`contextPrompts`),
 *   4. Du déverrouillage progressif et illuminé du panneau de HUD correspondant (`unlockedHud`).
 */

import { logger } from '../utils/logger.js';

/**
 * État initial du HUD à la seconde 0 (Acte 1) : tous les panneaux complexes sont verrouillés/masqués,
 * seules la barre de santé du Héros et la Bannière Guidée de Tutoriel sont visibles.
 */
export const DEFAULT_LOCKED_HUD = Object.freeze({
  topEcoBar: false,
  leftBastionPanel: false,
  leftBuildSection: false,
  leftScoutRole: false,
  leftLabSection: false,
  rightLineagePanel: false,
  minimap: false,
});

/**
 * État complet du HUD une fois l'Onboarding terminé (Acte 7 ou après `[P] Passer le tutoriel`).
 */
export const FULL_UNLOCKED_HUD = Object.freeze({
  topEcoBar: true,
  leftBastionPanel: true,
  leftBuildSection: true,
  leftScoutRole: true,
  leftLabSection: true,
  rightLineagePanel: true,
  minimap: true,
});

/**
 * Les 7 Actes séquentiels de l'Onboarding de Genesis Bastion.
 * Exporté sous forme de tableau ordonné (`actNumber` 1 à 7, index `0` à `6`).
 */
export const ONBOARDING_ACTS = [
  // ============================================================================
  // ACTE 1 — RÉVEIL AU BASTION & CONTRÔLE DE LA CAMÉRA (0:00 – 1:00)
  // ============================================================================
  {
    actNumber: 1,
    stepIndex: 0,
    id: 'act_1_awakening',
    shortId: 'act1',
    title: 'Acte 1 — Réveil au Bastion & Repères',
    subtitle: 'Prendre en main son Héros et la caméra tactique 3D',
    timeWindow: '0:00 – 1:00',
    ecoPaused: true,
    instructionText:
      'Bienvenue au Sanctuaire du Bastion. L’île est calme pour l’instant. Déplacez-vous jusqu’au fanal doré près du feu de camp et testez le zoom de votre caméra tactique.',
    whyItMatters:
      'Le feu de camp central régénère vos PV lorsque vous êtes proche du Bastion. La caméra 3/4 plongeante vous permet de lire le terrain et d’anticiper les menaces.',
    keys: ['Z / Q / S / D', 'W / A / S / D', 'Molette Souris', 'R / F'],
    keyBadges: [
      { keys: ['Z', 'Q', 'S', 'D'], altKeys: ['W', 'A', 'S', 'D'], label: 'Se déplacer' },
      { keys: ['Molette'], altKeys: ['Clic Droit', 'R / F'], label: 'Zoomer & Orienter la vue' },
    ],
    objectiveLabel: 'Rejoindre le fanal doré devant le Bastion (0, 12)',
    progressLabelTemplate: 'Progression : {current}/{target} objectif atteint',
    targetCount: 1,
    targetWorldPos: { x: 0, z: 12 },
    contextPrompt: '🔥 Sanctuaire du Bastion — Zone de soin',
    spawnSpec: {
      wildPopulation: 0,
      initialNpcs: 0,
      beaconPos: { x: 0, z: 12, radius: 4.0 },
    },
    unlockedHud: {
      topEcoBar: false,
      leftBastionPanel: false,
      leftBuildSection: false,
      leftScoutRole: false,
      leftLabSection: false,
      rightLineagePanel: false,
      minimap: false,
    },
    newlyUnlockedHudKeys: [],
  },

  // ============================================================================
  // ACTE 2 — COMBAT DE MÊLÉE, ESQUIVE (DASH) & 1re AMÉLIORATION (1:00 – 2:30)
  // ============================================================================
  {
    actNumber: 2,
    stepIndex: 1,
    id: 'act_2_combat_dash',
    shortId: 'act2',
    title: 'Acte 2 — L’Art du Combat, de l’Esquive & de l’Adaptation',
    subtitle: 'Frapper dans l’arc de fente, esquiver et choisir son 1er don roguelike',
    timeWindow: '1:00 – 2:30',
    ecoPaused: true,
    instructionText:
      'Un Gobelin Égaré puis un Orc Maraudeur approchent ! Entrez dans le cercle d’attaque au sol, frappez avec [Clic Gauche] ou [Espace], utilisez [Shift] pour esquiver, puis choisissez votre 1re Amélioration.',
    whyItMatters:
      'Votre attaque de fente (Cleave) touche tous les ennemis dans un large arc frontal. Chaque élimination rapporte de l’XP pour adapter votre Héros aux menaces de l’île.',
    keys: ['Clic Gauche / Espace', 'Shift / Clic Droit'],
    keyBadges: [
      { keys: ['Clic Gauche', 'Espace'], altKeys: [], label: 'Attaque de Fente (Cleave)' },
      { keys: ['Shift', 'Clic Droit'], altKeys: [], label: 'Esquive Rapide (Dash)' },
    ],
    objectiveLabel: 'Terrasser le Gobelin Égaré, esquiver [Shift] et vaincre l’Orc Maraudeur',
    progressLabelTemplate: 'Entraînement martial : {current}/{target}',
    targetCount: 3,
    targetWorldPos: { x: 10, z: 10 },
    contextPrompt: '[Clic Gauche / Espace] : Frapper !',
    subObjectives: [
      {
        id: 'kill_stray_goblin',
        label: '2A. Approcher et éliminer le Gobelin Égaré (14m)',
        targetPos: { x: 10, z: 10 },
      },
      {
        id: 'dash_and_kill_orc',
        label: '2B. Utiliser [Shift] pour esquiver et éliminer l’Orc Maraudeur',
        targetPos: { x: 13, z: -9 },
      },
      {
        id: 'pick_first_upgrade',
        label: '2C. Choisir votre 1re carte d’Amélioration Roguelike (Niveau 2)',
        targetPos: { x: 0, z: 4 },
      },
    ],
    spawnSpec: {
      strayGoblin: { speciesId: 'goblin', x: 10, z: 10, hp: 36, damage: 5, speed: 5.2, xpReward: 45 },
      marauderOrc: { speciesId: 'orc', x: 13, z: -9, hp: 70, damage: 10, speed: 5.8, xpReward: 80 },
    },
    unlockedHud: {
      topEcoBar: false,
      leftBastionPanel: false,
      leftBuildSection: false,
      leftScoutRole: false,
      leftLabSection: false,
      rightLineagePanel: false,
      minimap: false,
    },
    newlyUnlockedHudKeys: [],
  },

  // ============================================================================
  // ACTE 3 — SAUVER SON 1er PNJ & RÉCOLTER DES RESSOURCES (2:30 – 4:00)
  // ============================================================================
  {
    actNumber: 3,
    stepIndex: 2,
    id: 'act_3_rescue_harvest',
    shortId: 'act3',
    title: 'Acte 3 — Premier Sauvetage & Récolte de Ressources',
    subtitle: 'Libérer un survivant en cage et débloquer la gestion du Bastion',
    timeWindow: '2:30 – 4:00',
    ecoPaused: true,
    instructionText:
      'Un appel à l’aide retentit à 28m au Sud-Est ! Suivez la flèche dorée, éliminez le Loup gardien, appuyez sur [E] près de la cage pour libérer votre 1er Survivant, puis récoltez du Bois ou du Cristal avec [E].',
    whyItMatters:
      'Vous ne survivrez pas seul : chaque survivant libéré rejoint le Bastion. En tant que Récolteur, il amasse automatiquement du Bois et du Cristal et répare vos remparts.',
    keys: ['E', 'Z / Q / S / D'],
    keyBadges: [
      { keys: ['E'], altKeys: [], label: 'Libérer la Cage / Récolter une ressource' },
    ],
    objectiveLabel: 'Libérer la Cage #1 au Sud-Est [E] et récolter un gisement proche [E]',
    progressLabelTemplate: 'Sauvetage & Récolte : {current}/{target}',
    targetCount: 2,
    targetWorldPos: { x: 20, z: 20 },
    contextPrompt: '[E] Libérer le Survivant / Récolter',
    subObjectives: [
      {
        id: 'rescue_cage_1',
        label: '3A. Vaincre le Loup et libérer le Survivant en cage [E] (28m Sud-Est)',
        targetPos: { x: 20, z: 20 },
      },
      {
        id: 'harvest_resource_1',
        label: '3B. Récolter un Arbre (Bois) ou un Cristal proche avec [E]',
        targetPos: { x: 16, z: 14 },
      },
    ],
    spawnSpec: {
      cagePos: { x: 20, z: 20 },
      guardWolf: { speciesId: 'wolf', x: 22, z: 18, hp: 48, damage: 8, speed: 7.2, xpReward: 30 },
      initialNpcRoleOnRescue: 'harvester',
    },
    unlockedHud: {
      topEcoBar: false,
      leftBastionPanel: true,
      leftBuildSection: false,
      leftScoutRole: false,
      leftLabSection: false,
      rightLineagePanel: false,
      minimap: false,
    },
    newlyUnlockedHudKeys: ['leftBastionPanel'],
  },

  // ============================================================================
  // ACTE 4 — CONSTRUIRE LA TOUR DE GUET & DÉFENDRE LE BASTION (4:00 – 5:15)
  // ============================================================================
  {
    actNumber: 4,
    stepIndex: 3,
    id: 'act_4_build_watchtower',
    shortId: 'act4',
    title: 'Acte 4 — Fortifier le Sanctuaire : La Tour de Guet',
    subtitle: 'Ériger une défense automatisée pour protéger le Bastion pendant vos expéditions',
    timeWindow: '4:00 – 5:15',
    ecoPaused: true,
    instructionText:
      'La section Bâtiments du panneau gauche vient de s’ouvrir ! Cliquez sur le bouton doré [🏹 Construire : Tour de Guet] (ou appuyez sur [F1]), puis observez-la repousser l’assaut de 2 Gobelins.',
    whyItMatters:
      'Lorsque l’écosystème s’éveillera, vous devrez vous éloigner du Bastion pour traquer des mutants. Les Tours de Guet et les Gardes protègent le feu sacré en votre absence.',
    keys: ['Clic sur Tour de Guet', 'Touche F1'],
    keyBadges: [
      { keys: ['Clic Gauche', 'F1'], altKeys: [], label: 'Construire : Tour de Guet (Panneau Gauche)' },
    ],
    objectiveLabel: 'Construire une Tour de Guet et repousser les 2 Gobelins assaillants',
    progressLabelTemplate: 'Défense du Bastion : {current}/{target}',
    targetCount: 2,
    targetWorldPos: { x: 0, z: 0 },
    contextPrompt: '🏹 Construisez la Tour de Guet dans le panneau gauche',
    subObjectives: [
      {
        id: 'build_watchtower',
        label: '4A. Cliquer sur « Tour de Guet » dans le panneau gauche (ou touche [F1])',
        targetPos: { x: 0, z: 0 },
      },
      {
        id: 'repel_goblin_raiders',
        label: '4B. Éliminer les 2 Gobelins Pilleurs avec l’aide de votre Tour de Guet',
        targetPos: { x: -16, z: 12 },
      },
    ],
    spawnSpec: {
      raiderGoblins: [
        { speciesId: 'goblin', x: -22, z: 16, hp: 42, damage: 7, speed: 6.8 },
        { speciesId: 'goblin', x: -19, z: 21, hp: 42, damage: 7, speed: 6.8 },
      ],
    },
    unlockedHud: {
      topEcoBar: false,
      leftBastionPanel: true,
      leftBuildSection: true,
      leftScoutRole: false,
      leftLabSection: false,
      rightLineagePanel: false,
      minimap: false,
    },
    newlyUnlockedHudKeys: ['leftBuildSection'],
  },

  // ============================================================================
  // ACTE 5 — LE TOURNANT : 2e SURVIVANT & RECRUTER SON 1er ÉCLAIREUR (5:15 – 6:45)
  // ============================================================================
  {
    actNumber: 5,
    stepIndex: 4,
    id: 'act_5_recruit_scout',
    shortId: 'act5',
    title: 'Acte 5 — Les Yeux du Bastion : Recruter un Éclaireur',
    subtitle: 'Débloquer la Minimap Radar et envoyer un Éclaireur au-delà de la frontière',
    timeWindow: '5:15 – 6:45',
    ecoPaused: true,
    instructionText:
      'Une 2e Cage de Survivant est signalée à 38m au Nord ! Libérez-la avec [E] pour débloquer la Minimap Radar, puis cliquez sur [+ Éclaireur (Scout)] dans le panneau gauche pour l’envoyer explorer les terres sauvages.',
    whyItMatters:
      'Les Éclaireurs sont la clé de Genesis Bastion : trop fragiles pour combattre, ils fuient le danger mais possèdent une longue-vue capable de repérer les mutations au cœur des terres sauvages.',
    keys: ['E', 'Clic sur + Éclaireur'],
    keyBadges: [
      { keys: ['E'], altKeys: [], label: 'Libérer le 2e Survivant (38m Nord)' },
      { keys: ['+ Éclaireur'], altKeys: [], label: 'Assigner le rôle d’Éclaireur (Panneau Gauche)' },
    ],
    objectiveLabel: 'Libérer la Cage #2 au Nord [E] puis assigner 1 Éclaireur (Scout)',
    progressLabelTemplate: 'Reconnaissance : {current}/{target}',
    targetCount: 2,
    targetWorldPos: { x: 0, z: -38 },
    contextPrompt: '🦅 Assignez votre survivant en Éclaireur (Scout) !',
    subObjectives: [
      {
        id: 'rescue_cage_2',
        label: '5A. Rejoindre et libérer la 2e Cage de Survivant à 38m au Nord [E]',
        targetPos: { x: 0, z: -38 },
      },
      {
        id: 'assign_scout_role',
        label: '5B. Cliquer sur « + Éclaireur » dans le panneau gauche pour lancer l’expédition',
        targetPos: { x: 0, z: 0 },
      },
    ],
    spawnSpec: {
      cagePos: { x: 0, z: -38 },
      guardSpecies: { speciesId: 'orc', x: 3, z: -35, hp: 62, damage: 10, speed: 6.0 },
    },
    unlockedHud: {
      topEcoBar: false,
      leftBastionPanel: true,
      leftBuildSection: true,
      leftScoutRole: true,
      leftLabSection: false,
      rightLineagePanel: false,
      minimap: true,
    },
    newlyUnlockedHudKeys: ['leftScoutRole', 'minimap'],
  },

  // ============================================================================
  // ACTE 6 — L'ALARME GÉNÉTIQUE : TRAQUER LE BÉBÉ "PATIENT ZÉRO" (6:45 – 8:30)
  // ============================================================================
  {
    actNumber: 6,
    stepIndex: 5,
    id: 'act_6_patient_zero',
    shortId: 'act6',
    title: 'Acte 6 — Alerte Éclaireur : Le Bébé « Patient Zéro » !',
    subtitle: 'Assassiner une mutation dominante au stade juvénile avant qu’elle ne devienne Adulte',
    timeWindow: '6:45 – 8:30',
    ecoPaused: true,
    instructionText:
      '🦅 ALERTE ÉCLAIREUR ! Votre Éclaireur a repéré au Nord-Est un Bébé Troll de Feu (mutation Glande Pyroclastique) ! Ce monstre vient de naître : c’est encore un BÉBÉ (taille 0.5x, incapable de se reproduire). Éliminez-le avant qu’il ne devienne ADULTE, puis ouvrez le Codex [Tab] !',
    whyItMatters:
      'Dans Genesis Bastion, les mutations sont mendéliennes et dominantes (78% de transmission). Tuer un Patient Zéro tant qu’il est encore BÉBÉ éradique la lignée avant son 1er cycle de reproduction !',
    keys: ['Sprint / Shift', 'Clic Gauche / Sorts 1..4', 'Tab (Codex Génétique)'],
    keyBadges: [
      { keys: ['Shift'], altKeys: ['Z/Q/S/D'], label: 'Foncer vers le faisceau rouge (Nord-Est)' },
      { keys: ['Clic Gauche', '1..4'], altKeys: ['Auto'], label: 'Éliminer le Bébé Troll de Feu' },
      { keys: ['Tab'], altKeys: [], label: 'Ouvrir l’Arbre Phylogénétique & Codex' },
    ],
    objectiveLabel: 'Éliminer le Bébé Troll de Feu (Patient Zéro) au Nord-Est puis appuyer sur [Tab]',
    progressLabelTemplate: 'Traque Génétique : {current}/{target}',
    targetCount: 2,
    targetWorldPos: { x: 46, z: -46 },
    contextPrompt: '🔥 BÉBÉ PATIENT ZÉRO — Éliminez-le avant l’âge adulte !',
    subObjectives: [
      {
        id: 'kill_baby_fire_troll',
        label: '6A. Suivre le faisceau rouge au Nord-Est et éliminer le Bébé Troll de Feu',
        targetPos: { x: 46, z: -46 },
      },
      {
        id: 'open_phylo_codex',
        label: '6B. Appuyer sur [Tab] pour inspecter l’Arbre Phylogénétique & les lois de Conway',
        targetPos: { x: 0, z: 0 },
      },
    ],
    spawnSpec: {
      patientZeroTutorial: {
        speciesId: 'troll',
        mutationId: 'pyro_gland',
        x: 46,
        z: -46,
        lifeStage: 'baby',
        isAdult: false,
        freezeMaturationCap: 0.8,
        hp: 95,
        damage: 13,
      },
    },
    unlockedHud: {
      topEcoBar: false,
      leftBastionPanel: true,
      leftBuildSection: true,
      leftScoutRole: true,
      leftLabSection: false,
      rightLineagePanel: true,
      minimap: true,
    },
    newlyUnlockedHudKeys: ['rightLineagePanel'],
  },

  // ============================================================================
  // ACTE 7 — ÉVEIL DE L'ÉCOSYSTÈME (FIN DU TUTORIEL -> SURVIE OUVERTE)
  // ============================================================================
  {
    actNumber: 7,
    stepIndex: 6,
    id: 'act_7_ecosystem_awakens',
    shortId: 'act7',
    title: 'Acte 7 — L’Éveil de l’Écosystème Darwinien',
    subtitle: 'Le Jeu de la Vie de Conway et la sélection naturelle démarrent sur toute l’île !',
    timeWindow: '8:30+',
    ecoPaused: false,
    instructionText:
      'Vous maîtrisez toutes les commandes ! La Barre d’Eco-Tick est activée et les 7 espèces sauvages peuplent désormais l’île : toutes les 12s, les meutes en densité optimale (2 à 6) se reproduisent, s’hybrident et mutent, tandis que la surpopulation (> 6) provoque des famines et des migrations vers le Bastion.',
    whyItMatters:
      'Libérez les cages restantes, recrutez davantage d’Éclaireurs pour surveiller la Caldeira Volcanique et les forêts lointaines, et interceptez les Bébés Patients Zéro avant qu’ils ne dominent l’île !',
    keys: ['1..4 : Sorts', 'C : Mode Auto/Actif', 'Tab : Codex', 'G : Grille Conway'],
    keyBadges: [
      { keys: ['1', '2', '3', '4'], altKeys: ['C : Mode Auto'], label: 'Compétences & Sorts 3D' },
      { keys: ['Tab'], altKeys: ['G'], label: 'Codex Phylogénétique & Grille Conway' },
      { keys: ['F1', 'F2', 'F3'], altKeys: [], label: 'Bâtiments du Bastion' },
    ],
    objectiveLabel: 'Survie Ouverte : Protégez le Bastion et éradiquez les lignées mutantes !',
    progressLabelTemplate: 'Écosystème Actif',
    targetCount: 1,
    targetWorldPos: null,
    contextPrompt: '🧬 Écosystème Darwinien Actif — Bonne chasse !',
    spawnSpec: {
      triggerFullEcosystemSpawn: true,
      wildPopulation: 42,
    },
    unlockedHud: {
      topEcoBar: true,
      leftBastionPanel: true,
      leftBuildSection: true,
      leftScoutRole: true,
      leftLabSection: true,
      rightLineagePanel: true,
      minimap: true,
    },
    newlyUnlockedHudKeys: ['topEcoBar', 'leftLabSection'],
  },
];

/**
 * Dictionnaire indexé par `actNumber` (`1..7`), `id` (`'act_1_awakening'`, etc.) et `shortId` (`'act1'`).
 */
export const ONBOARDING_ACTS_BY_ID = Object.freeze(
  ONBOARDING_ACTS.reduce((acc, act) => {
    acc[act.id] = act;
    acc[act.shortId] = act;
    acc[act.actNumber] = act;
    acc[`act_${act.actNumber}`] = act;
    return acc;
  }, {})
);

/**
 * Récupère la définition complète d'un acte d'onboarding à partir de son numéro (`1..7`),
 * de son index (`0..6`) ou de son identifiant (`'act_1_awakening'`, `'act1'`).
 *
 * @param {number|string} actRef - Numéro d'acte (`1..7`) ou identifiant.
 * @returns {object} Définition de l'acte d'onboarding.
 */
export function getOnboardingAct(actRef = 1) {
  if (typeof actRef === 'number') {
    const byNum = ONBOARDING_ACTS.find((a) => a.actNumber === actRef);
    if (byNum) return byNum;
    if (actRef >= 0 && actRef < ONBOARDING_ACTS.length) return ONBOARDING_ACTS[actRef];
  }
  if (typeof actRef === 'string' && ONBOARDING_ACTS_BY_ID[actRef]) {
    return ONBOARDING_ACTS_BY_ID[actRef];
  }
  return ONBOARDING_ACTS[0];
}

/**
 * Retourne la configuration exacte des panneaux de HUD déverrouillés pour un acte donné
 * (ou `FULL_UNLOCKED_HUD` si le tutoriel est terminé / passé).
 *
 * @param {number|string} actRef - Numéro d'acte (`1..7`) ou `'completed'` / `'skipped'`.
 * @param {boolean} [tutorialSkippedOrCompleted=false] - Si vrai, débloque 100% du HUD.
 * @returns {{
 *   topEcoBar: boolean,
 *   leftBastionPanel: boolean,
 *   leftBuildSection: boolean,
 *   leftScoutRole: boolean,
 *   leftLabSection: boolean,
 *   rightLineagePanel: boolean,
 *   minimap: boolean
 * }} Drapeaux de visibilité des panneaux du HUD.
 */
export function getUnlockedHudForAct(actRef = 1, tutorialSkippedOrCompleted = false) {
  if (tutorialSkippedOrCompleted || actRef === 'completed' || actRef === 'skipped' || actRef >= 7) {
    return { ...FULL_UNLOCKED_HUD };
  }
  const act = getOnboardingAct(actRef);
  return act?.unlockedHud ? { ...act.unlockedHud } : { ...DEFAULT_LOCKED_HUD };
}

/**
 * Journalise une transition d'acte d'onboarding dans le logger central.
 *
 * @param {number} actNumber - Numéro du nouvel acte (`1..7`).
 * @param {string} [reason='progression'] - Motif de transition (`'progression'`, `'skipped'`, `'init'`).
 */
export function logOnboardingTransition(actNumber, reason = 'progression') {
  const act = getOnboardingAct(actNumber);
  logger.info(
    'ONBOARDING',
    `Passage à l’${act.title} (${act.timeWindow}) — ${act.subtitle}`,
    {
      actNumber: act.actNumber,
      actId: act.id,
      ecoPaused: act.ecoPaused,
      unlockedHud: act.unlockedHud,
      reason,
    }
  );
}

export default ONBOARDING_ACTS;
