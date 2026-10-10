/**
 * @file src/ecosystem/OnboardingSteps.js
 * @description Bilingual (EN default / FR 2nd) structured 7-Act Interactive Onboarding
 * for **Genesis Bastion**, designed around Progressive Disclosure.
 */

import { logger } from '../utils/logger.js';
import { getLanguage, tr } from '../utils/i18n.js';

/**
 * Initial HUD state at second 0 (Act 1): complex panels are locked/hidden.
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
 * Full unlocked HUD state once Onboarding is completed (Act 7 or after `[P] Skip Tutorial`).
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
 * Helper that attaches dynamic language-aware getters (`title`, `subtitle`, `instructionText`,
 * `whyItMatters`, `keys`, `keyBadges`, `objectiveLabel`, `progressLabelTemplate`, `contextPrompt`,
 * `subObjectives`) to an Act definition so reading properties directly from `ONBOARDING_ACTS[i]`
 * or via `getOnboardingAct()` always returns the active language (`'en'` default or `'fr'`).
 *
 * @param {object} rawAct - Bilingual act specification.
 * @returns {object} Language-reactive Act definition.
 */
function createBilingualAct(rawAct) {
  const act = {
    ...rawAct,
    get title() {
      return tr(rawAct.titleEN, rawAct.titleFR);
    },
    get subtitle() {
      return tr(rawAct.subtitleEN, rawAct.subtitleFR);
    },
    get instructionText() {
      return tr(rawAct.instructionTextEN, rawAct.instructionTextFR);
    },
    get voiceoverScript() {
      return tr(rawAct.instructionTextEN, rawAct.instructionTextFR);
    },
    get whyItMatters() {
      return tr(rawAct.whyItMattersEN, rawAct.whyItMattersFR);
    },
    get keys() {
      return getLanguage() === 'fr' ? rawAct.keysFR : rawAct.keysEN;
    },
    get keyBadges() {
      return getLanguage() === 'fr' ? rawAct.keyBadgesFR : rawAct.keyBadgesEN;
    },
    get objectiveLabel() {
      return tr(rawAct.objectiveLabelEN, rawAct.objectiveLabelFR);
    },
    get progressLabelTemplate() {
      return tr(rawAct.progressLabelTemplateEN, rawAct.progressLabelTemplateFR);
    },
    get contextPrompt() {
      return tr(rawAct.contextPromptEN, rawAct.contextPromptFR);
    },
    get subObjectives() {
      if (!rawAct.subObjectivesBilingual) return undefined;
      return rawAct.subObjectivesBilingual.map((sub) => ({
        id: sub.id,
        label: tr(sub.labelEN, sub.labelFR),
        targetPos: sub.targetPos,
      }));
    },
  };
  return act;
}

/**
 * The 7 sequential Onboarding Acts of Genesis Bastion (Bilingual EN default / FR 2nd).
 */
export const ONBOARDING_ACTS = [
  // ============================================================================
  // ACT 1 — AWAKENING AT THE BASTION & CAMERA CONTROL (0:00 – 1:00)
  // ============================================================================
  createBilingualAct({
    actNumber: 1,
    stepIndex: 0,
    id: 'act_1_awakening',
    shortId: 'act1',
    titleEN: 'Act 1 — Awakening at the Bastion & Bearings',
    titleFR: 'Acte 1 — Réveil au Bastion & Repères',
    subtitleEN: 'Master your Hero movement and the 3D tactical camera',
    subtitleFR: 'Prendre en main son Héros et la caméra tactique 3D',
    timeWindow: '0:00 – 1:00',
    ecoPaused: true,
    instructionTextEN:
      'Welcome to the Bastion Sanctuary. The island is quiet for now. Walk to the golden beacon near the campfire and test zooming/rotating your tactical camera.',
    instructionTextFR:
      'Bienvenue au Sanctuaire du Bastion. L’île est calme pour l’instant. Déplacez-vous jusqu’au fanal doré près du feu de camp et testez le zoom de votre caméra tactique.',
    whyItMattersEN:
      'The central campfire regenerates your HP when near the Bastion. The 3/4 overhead camera lets you read the terrain and anticipate threats.',
    whyItMattersFR:
      'Le feu de camp central régénère vos PV lorsque vous êtes proche du Bastion. La caméra 3/4 plongeante vous permet de lire le terrain et d’anticiper les menaces.',
    keysEN: ['W / A / S / D', 'Z / Q / S / D', 'Mouse Wheel', 'R / F'],
    keysFR: ['Z / Q / S / D', 'W / A / S / D', 'Molette Souris', 'R / F'],
    keyBadgesEN: [
      { keys: ['W', 'A', 'S', 'D'], altKeys: ['Z', 'Q', 'S', 'D'], label: 'Move Hero' },
      { keys: ['Mouse Wheel'], altKeys: ['Right Click', 'R / F'], label: 'Zoom & Rotate Camera' },
    ],
    keyBadgesFR: [
      { keys: ['Z', 'Q', 'S', 'D'], altKeys: ['W', 'A', 'S', 'D'], label: 'Se déplacer' },
      { keys: ['Molette'], altKeys: ['Clic Droit', 'R / F'], label: 'Zoomer & Orienter la vue' },
    ],
    objectiveLabelEN: 'Reach the golden beacon in front of the Bastion (0, 12)',
    objectiveLabelFR: 'Rejoindre le fanal doré devant le Bastion (0, 12)',
    progressLabelTemplateEN: 'Progress: {current}/{target} objective reached',
    progressLabelTemplateFR: 'Progression : {current}/{target} objectif atteint',
    targetCount: 1,
    targetWorldPos: { x: 0, z: 12 },
    contextPromptEN: '🔥 Bastion Sanctuary — Healing Zone',
    contextPromptFR: '🔥 Sanctuaire du Bastion — Zone de soin',
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
  }),

  // ============================================================================
  // ACT 2 — MELEE COMBAT, DASH & 1ST UPGRADE (1:00 – 2:30)
  // ============================================================================
  createBilingualAct({
    actNumber: 2,
    stepIndex: 1,
    id: 'act_2_combat_dash',
    shortId: 'act2',
    titleEN: 'Act 2 — The Art of Combat, Dash & Adaptation',
    titleFR: 'Acte 2 — L’Art du Combat, de l’Esquive & de l’Adaptation',
    subtitleEN: 'Strike within your cleave arc, dash, and choose your 1st roguelike gift',
    subtitleFR: 'Frapper dans l’arc de fente, esquiver et choisir son 1er don roguelike',
    timeWindow: '1:00 – 2:30',
    ecoPaused: true,
    instructionTextEN:
      'A Stray Goblin and a Marauder Orc are approaching! Step into the attack ring on the ground, strike with [Left Click] or [Space], press [Shift] to dash, then choose your 1st Upgrade.',
    instructionTextFR:
      'Un Gobelin Égaré puis un Orc Maraudeur approchent ! Entrez dans le cercle d’attaque au sol, frappez avec [Clic Gauche] ou [Espace], utilisez [Shift] pour esquiver, puis choisissez votre 1re Amélioration.',
    whyItMattersEN:
      'Your Cleave strike hits all enemies in a wide frontal arc. Each kill grants XP and adaptive mastery (<=1%/kill) to tailor your Hero against the island’s threats.',
    whyItMattersFR:
      'Votre attaque de fente (Cleave) touche tous les ennemis dans un large arc frontal. Chaque élimination rapporte de l’XP pour adapter votre Héros aux menaces de l’île.',
    keysEN: ['Left Click / Space', 'Shift / Right Click'],
    keysFR: ['Clic Gauche / Espace', 'Shift / Clic Droit'],
    keyBadgesEN: [
      { keys: ['Left Click', 'Space'], altKeys: [], label: 'Cleave Strike' },
      { keys: ['Shift', 'Right Click'], altKeys: [], label: 'Quick Dash' },
    ],
    keyBadgesFR: [
      { keys: ['Clic Gauche', 'Espace'], altKeys: [], label: 'Attaque de Fente (Cleave)' },
      { keys: ['Shift', 'Clic Droit'], altKeys: [], label: 'Esquive Rapide (Dash)' },
    ],
    objectiveLabelEN: 'Slay the Stray Goblin, dash [Shift], and defeat the Marauder Orc',
    objectiveLabelFR: 'Terrasser le Gobelin Égaré, esquiver [Shift] et vaincre l’Orc Maraudeur',
    progressLabelTemplateEN: 'Martial Training: {current}/{target}',
    progressLabelTemplateFR: 'Entraînement martial : {current}/{target}',
    targetCount: 3,
    targetWorldPos: { x: 10, z: 10 },
    contextPromptEN: '[Left Click / Space]: Strike!',
    contextPromptFR: '[Clic Gauche / Espace] : Frapper !',
    subObjectivesBilingual: [
      {
        id: 'kill_stray_goblin',
        labelEN: '2A. Approach and slay the Stray Goblin (14m)',
        labelFR: '2A. Approcher et éliminer le Gobelin Égaré (14m)',
        targetPos: { x: 10, z: 10 },
      },
      {
        id: 'dash_and_kill_orc',
        labelEN: '2B. Use [Shift] to dash and slay the Marauder Orc',
        labelFR: '2B. Utiliser [Shift] pour esquiver et éliminer l’Orc Maraudeur',
        targetPos: { x: 13, z: -9 },
      },
      {
        id: 'pick_first_upgrade',
        labelEN: '2C. Choose your 1st Roguelike Upgrade Card (Level 2)',
        labelFR: '2C. Choisir votre 1re carte d’Amélioration Roguelike (Niveau 2)',
        targetPos: { x: 0, z: 4 },
      },
    ],
    spawnSpec: {
      strayGoblin: { speciesId: 'goblin', x: 10, z: 10, hp: 65, damage: 10, speed: 5.2, xpReward: 45 },
      marauderOrc: { speciesId: 'orc', x: 13, z: -9, hp: 135, damage: 16, speed: 5.8, xpReward: 80 },
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
  }),

  // ============================================================================
  // ACT 3 — RESCUE 1ST SURVIVOR & HARVEST RESOURCES (2:30 – 4:00)
  // ============================================================================
  createBilingualAct({
    actNumber: 3,
    stepIndex: 2,
    id: 'act_3_rescue_harvest',
    shortId: 'act3',
    titleEN: 'Act 3 — First Rescue & Resource Harvesting',
    titleFR: 'Acte 3 — Premier Sauvetage & Récolte de Ressources',
    subtitleEN: 'Free a caged survivor and unlock Bastion management',
    subtitleFR: 'Libérer un survivant en cage et débloquer la gestion du Bastion',
    timeWindow: '2:30 – 4:00',
    ecoPaused: true,
    instructionTextEN:
      'A cry for help echoes 28m to the South-East! Follow the golden arrow, slay the guard Wolf, press [E] near the cage to free your 1st Survivor, then harvest Wood or Crystal with [E].',
    instructionTextFR:
      'Un appel à l’aide retentit à 28m au Sud-Est ! Suivez la flèche dorée, éliminez le Loup gardien, appuyez sur [E] près de la cage pour libérer votre 1er Survivant, puis récoltez du Bois ou du Cristal avec [E].',
    whyItMattersEN:
      'You cannot survive alone: every rescued survivor joins the Bastion. As a Gatherer, they automatically harvest Wood and Crystal and repair your ramparts.',
    whyItMattersFR:
      'Vous ne survivrez pas seul : chaque survivant libéré rejoint le Bastion. En tant que Récolteur, il amasse automatiquement du Bois et du Cristal et répare vos remparts.',
    keysEN: ['E', 'W / A / S / D'],
    keysFR: ['E', 'Z / Q / S / D'],
    keyBadgesEN: [
      { keys: ['E'], altKeys: [], label: 'Unlock Cage / Harvest Resource' },
    ],
    keyBadgesFR: [
      { keys: ['E'], altKeys: [], label: 'Libérer la Cage / Récolter une ressource' },
    ],
    objectiveLabelEN: 'Free Cage #1 in the South-East [E] and harvest a nearby node [E]',
    objectiveLabelFR: 'Libérer la Cage #1 au Sud-Est [E] et récolter un gisement proche [E]',
    progressLabelTemplateEN: 'Rescue & Harvest: {current}/{target}',
    progressLabelTemplateFR: 'Sauvetage & Récolte : {current}/{target}',
    targetCount: 2,
    targetWorldPos: { x: 20, z: 20 },
    contextPromptEN: '[E] Rescue Survivor / Harvest',
    contextPromptFR: '[E] Libérer le Survivant / Récolter',
    subObjectivesBilingual: [
      {
        id: 'rescue_cage_1',
        labelEN: '3A. Slay the Wolf and free the caged Survivor [E] (28m South-East)',
        labelFR: '3A. Vaincre le Loup et libérer le Survivant en cage [E] (28m Sud-Est)',
        targetPos: { x: 20, z: 20 },
      },
      {
        id: 'harvest_resource_1',
        labelEN: '3B. Harvest a nearby Tree (Wood) or Crystal node with [E]',
        labelFR: '3B. Récolter un Arbre (Bois) ou un Cristal proche avec [E]',
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
  }),

  // ============================================================================
  // ACT 4 — BUILD THE WATCHTOWER & DEFEND THE BASTION (4:00 – 5:15)
  // ============================================================================
  createBilingualAct({
    actNumber: 4,
    stepIndex: 3,
    id: 'act_4_build_watchtower',
    shortId: 'act4',
    titleEN: 'Act 4 — Fortify the Sanctuary: The Watchtower',
    titleFR: 'Acte 4 — Fortifier le Sanctuaire : La Tour de Guet',
    subtitleEN: 'Erect an automated defense to protect the Bastion during your expeditions',
    subtitleFR: 'Ériger une défense automatisée pour protéger le Bastion pendant vos expéditions',
    timeWindow: '4:00 – 5:15',
    ecoPaused: true,
    instructionTextEN:
      'The Buildings section in the left panel is now unlocked! Click the golden button [🏹 Build: Watchtower] (or press [F1]), then watch it repel an assault of 2 Goblin Raiders.',
    instructionTextFR:
      'La section Bâtiments du panneau gauche vient de s’ouvrir ! Cliquez sur le bouton doré [🏹 Construire : Tour de Guet] (ou appuyez sur [F1]), puis observez-la repousser l’assaut de 2 Gobelins.',
    whyItMattersEN:
      'Once the ecosystem awakens, you must venture far from the Bastion to hunt mutants. Watchtowers and Guards protect the sacred fire while you are away.',
    whyItMattersFR:
      'Lorsque l’écosystème s’éveillera, vous devrez vous éloigner du Bastion pour traquer des mutants. Les Tours de Guet et les Gardes protègent le feu sacré en votre absence.',
    keysEN: ['Click Watchtower', 'Key F1'],
    keysFR: ['Clic sur Tour de Guet', 'Touche F1'],
    keyBadgesEN: [
      { keys: ['Left Click', 'F1'], altKeys: [], label: 'Build: Watchtower (Left Panel)' },
    ],
    keyBadgesFR: [
      { keys: ['Clic Gauche', 'F1'], altKeys: [], label: 'Construire : Tour de Guet (Panneau Gauche)' },
    ],
    objectiveLabelEN: 'Build a Watchtower and repel the 2 attacking Goblin Raiders',
    objectiveLabelFR: 'Construire une Tour de Guet et repousser les 2 Gobelins assaillants',
    progressLabelTemplateEN: 'Bastion Defense: {current}/{target}',
    progressLabelTemplateFR: 'Défense du Bastion : {current}/{target}',
    targetCount: 2,
    targetWorldPos: { x: 0, z: 0 },
    contextPromptEN: '🏹 Build the Watchtower in the left panel',
    contextPromptFR: '🏹 Construisez la Tour de Guet dans le panneau gauche',
    subObjectivesBilingual: [
      {
        id: 'build_watchtower',
        labelEN: '4A. Click "Watchtower" in the left panel (or press [F1])',
        labelFR: '4A. Cliquer sur « Tour de Guet » dans le panneau gauche (ou touche [F1])',
        targetPos: { x: 0, z: 0 },
      },
      {
        id: 'repel_goblin_raiders',
        labelEN: '4B. Eliminate the 2 Goblin Raiders with help from your Watchtower',
        labelFR: '4B. Éliminer les 2 Gobelins Pilleurs avec l’aide de votre Tour de Guet',
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
  }),

  // ============================================================================
  // ACT 5 — THE TURNING POINT: 2ND SURVIVOR & 1ST SCOUT (5:15 – 6:45)
  // ============================================================================
  createBilingualAct({
    actNumber: 5,
    stepIndex: 4,
    id: 'act_5_recruit_scout',
    shortId: 'act5',
    titleEN: 'Act 5 — Eyes of the Bastion: Recruit a Scout',
    titleFR: 'Acte 5 — Les Yeux du Bastion : Recruter un Éclaireur',
    subtitleEN: 'Unlock the Radar Minimap and send a Scout beyond the frontier',
    subtitleFR: 'Débloquer la Minimap Radar et envoyer un Éclaireur au-delà de la frontière',
    timeWindow: '5:15 – 6:45',
    ecoPaused: true,
    instructionTextEN:
      'A 2nd Survivor Cage is spotted 38m to the North! Free them with [E] to unlock the Radar Minimap, then click [+ Scout] in the left panel to send them into the deep wilderness.',
    instructionTextFR:
      'Une 2e Cage de Survivant est signalée à 38m au Nord ! Libérez-la avec [E] pour débloquer la Minimap Radar, puis cliquez sur [+ Éclaireur (Scout)] dans le panneau gauche pour l’envoyer explorer les terres sauvages.',
    whyItMattersEN:
      'Scouts are the key to Genesis Bastion: too fragile for combat, they evade packs while using spyglasses to pinpoint mutations deep in the wilderness.',
    whyItMattersFR:
      'Les Éclaireurs sont la clé de Genesis Bastion : trop fragiles pour combattre, ils fuient le danger mais possèdent une longue-vue capable de repérer les mutations au cœur des terres sauvages.',
    keysEN: ['E', 'Click + Scout'],
    keysFR: ['E', 'Clic sur + Éclaireur'],
    keyBadgesEN: [
      { keys: ['E'], altKeys: [], label: 'Free 2nd Survivor (38m North)' },
      { keys: ['+ Scout'], altKeys: [], label: 'Assign Scout Role (Left Panel)' },
    ],
    keyBadgesFR: [
      { keys: ['E'], altKeys: [], label: 'Libérer le 2e Survivant (38m Nord)' },
      { keys: ['+ Éclaireur'], altKeys: [], label: 'Assigner le rôle d’Éclaireur (Panneau Gauche)' },
    ],
    objectiveLabelEN: 'Free Cage #2 in the North [E], then assign 1 Scout',
    objectiveLabelFR: 'Libérer la Cage #2 au Nord [E] puis assigner 1 Éclaireur (Scout)',
    progressLabelTemplateEN: 'Reconnaissance: {current}/{target}',
    progressLabelTemplateFR: 'Reconnaissance : {current}/{target}',
    targetCount: 2,
    targetWorldPos: { x: 0, z: -38 },
    contextPromptEN: '🦅 Assign your survivor as a Scout!',
    contextPromptFR: '🦅 Assignez votre survivant en Éclaireur (Scout) !',
    subObjectivesBilingual: [
      {
        id: 'rescue_cage_2',
        labelEN: '5A. Reach and free the 2nd Survivor Cage 38m North [E]',
        labelFR: '5A. Rejoindre et libérer la 2e Cage de Survivant à 38m au Nord [E]',
        targetPos: { x: 0, z: -38 },
      },
      {
        id: 'assign_scout_role',
        labelEN: '5B. Click "+ Scout" in the left panel to launch the expedition',
        labelFR: '5B. Cliquer sur « + Éclaireur » dans le panneau gauche pour lancer l’expédition',
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
  }),

  // ============================================================================
  // ACT 6 — GENETIC ALARM: HUNT THE BABY "PATIENT ZERO" (6:45 – 8:30)
  // ============================================================================
  createBilingualAct({
    actNumber: 6,
    stepIndex: 5,
    id: 'act_6_patient_zero',
    shortId: 'act6',
    titleEN: 'Act 6 — Scout Alert: The Baby "Patient Zero"!',
    titleFR: 'Acte 6 — Alerte Éclaireur : Le Bébé « Patient Zéro » !',
    subtitleEN: 'Assassinate a dominant mutation in its juvenile stage before it matures into an Adult',
    subtitleFR: 'Assassiner une mutation dominante au stade juvénile avant qu’elle ne devienne Adulte',
    timeWindow: '6:45 – 8:30',
    ecoPaused: true,
    instructionTextEN:
      '🦅 SCOUT IN RECONNAISSANCE! Your Scout is patrolling the North-East wilderness (~8s) and will spot a Juvenile Fire Troll (Pyroclastic Gland mutation)! ⚠️ CLOSE-CALL BOSS FIGHT (360 HP, Fireballs): use [Shift] to dodge its fireballs and unleash your Spells [1..4] + Cleave before it becomes an ADULT, then open the Codex [Tab]!',
    instructionTextFR:
      '🦅 ÉCLAIREUR EN RECONNAISSANCE ! Votre Éclaireur patrouille au Nord-Est (~8s) et va repérer un Bébé Troll de Feu (mutation Glande Pyroclastique) ! ⚠️ DUEL PÉRILLEUX (360 PV, Boules de Feu) : esquivez avec [Shift] et enchaînez vos Sorts [1..4] + Fente avant qu’il ne devienne ADULTE, puis ouvrez le Codex [Tab] !',
    whyItMattersEN:
      'In Genesis Bastion, fire and gigantism mutations are hyper-dominant (92%–99% inheritance). Slaying a Patient Zero while it is still a BABY is a perilous duel, but it eradicates an entire Fire Titan lineage before its first reproductive cycle!',
    whyItMattersFR:
      'Dans Genesis Bastion, les mutations de feu et de gigantisme sont hyper-dominantes (92%–99% de transmission). Terrasser un Patient Zéro tant qu’il est BÉBÉ est un duel périlleux, mais cela éradique une lignée entière de Titans de Feu avant son 1er cycle de reproduction !',
    keysEN: ['Sprint / Shift', 'Left Click / Spells 1..4', 'Tab (Genetic Codex)'],
    keysFR: ['Sprint / Shift', 'Clic Gauche / Sorts 1..4', 'Tab (Codex Génétique)'],
    keyBadgesEN: [
      { keys: ['Shift'], altKeys: ['W/A/S/D'], label: 'Sprint & Dodge Fireballs (North-East)' },
      { keys: ['Left Click', '1..4'], altKeys: ['Auto'], label: 'Eliminate the Baby Fire Troll (360 HP)' },
      { keys: ['Tab'], altKeys: [], label: 'Open Phylogenetic Tree & Codex' },
    ],
    keyBadgesFR: [
      { keys: ['Shift'], altKeys: ['Z/Q/S/D'], label: 'Foncer & Esquiver les Boules de Feu (Nord-Est)' },
      { keys: ['Clic Gauche', '1..4'], altKeys: ['Auto'], label: 'Éliminer le Bébé Troll de Feu (360 PV)' },
      { keys: ['Tab'], altKeys: [], label: 'Ouvrir l’Arbre Phylogénétique & Codex' },
    ],
    objectiveLabelEN: 'Eliminate the Baby Fire Troll (Patient Zero) in the North-East, then press [Tab]',
    objectiveLabelFR: 'Éliminer le Bébé Troll de Feu (Patient Zéro) au Nord-Est puis appuyer sur [Tab]',
    progressLabelTemplateEN: 'Genetic Hunt: {current}/{target}',
    progressLabelTemplateFR: 'Traque Génétique : {current}/{target}',
    targetCount: 2,
    targetWorldPos: { x: 46, z: -46 },
    contextPromptEN: '🔥 BABY PATIENT ZERO — Perilous Duel (Dodge with [Shift])!',
    contextPromptFR: '🔥 BÉBÉ PATIENT ZÉRO — Duel Périlleux (Esquivez avec [Shift]) !',
    subObjectivesBilingual: [
      {
        id: 'kill_baby_fire_troll',
        labelEN: '6A. Wait for the Scout alert (~8s), sprint North-East, and defeat the Baby Fire Troll (360 HP)',
        labelFR: '6A. Attendre l’alerte de l’Éclaireur (~8s), foncer au Nord-Est et vaincre le Bébé Troll de Feu (360 PV)',
        targetPos: { x: 46, z: -46 },
      },
      {
        id: 'open_phylo_codex',
        labelEN: '6B. Press [Tab] to inspect the Phylogenetic Tree & Conway laws',
        labelFR: '6B. Appuyer sur [Tab] pour inspecter l’Arbre Phylogénétique & les lois de Conway',
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
        hp: 360,
        damage: 24,
        speed: 6.8,
        fireballCooldown: 2.2,
        scoutDelaySec: 8.5,
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
  }),

  // ============================================================================
  // ACT 7 — AWAKENING OF THE ECOSYSTEM (OPEN SURVIVAL)
  // ============================================================================
  createBilingualAct({
    actNumber: 7,
    stepIndex: 6,
    id: 'act_7_ecosystem_awakens',
    shortId: 'act7',
    titleEN: 'Act 7 — Awakening of the Darwinian Ecosystem',
    titleFR: 'Acte 7 — L’Éveil de l’Écosystème Darwinien',
    subtitleEN: 'Conway’s Game of Life and natural selection now begin across the entire island!',
    subtitleFR: 'Le Jeu de la Vie de Conway et la sélection naturelle démarrent sur toute l’île !',
    timeWindow: '8:30+',
    ecoPaused: false,
    instructionTextEN:
      'You have mastered all controls! The Eco-Tick Bar is now active and wild species populate the island: every 12s, packs in optimal density (2 to 6) reproduce, hybridize, and mutate, while overpopulation (> 6) triggers famine and migrations toward the Bastion.',
    instructionTextFR:
      'Vous maîtrisez toutes les commandes ! La Barre d’Eco-Tick est activée et les 7 espèces sauvages peuplent désormais l’île : toutes les 12s, les meutes en densité optimale (2 à 6) se reproduisent, s’hybrident et mutent, tandis que la surpopulation (> 6) provoque des famines et des migrations vers le Bastion.',
    whyItMattersEN:
      'Free the remaining cages, recruit more Scouts to monitor the Volcanic Caldera and distant forests, collect the 3 Eden Relics, and intercept Baby Patient Zeros before they dominate the island!',
    whyItMattersFR:
      'Libérez les cages restantes, recrutez davantage d’Éclaireurs pour surveiller la Caldeira Volcanique et les forêts lointaines, et interceptez les Bébés Patients Zéro avant qu’ils ne dominent l’île !',
    keysEN: ['1..4: Spells', 'C: Auto/Active Mode', 'Tab: Codex', 'O: Settings'],
    keysFR: ['1..4 : Sorts', 'C : Mode Auto/Actif', 'Tab : Codex', 'O : Paramètres'],
    keyBadgesEN: [
      { keys: ['1', '2', '3', '4'], altKeys: ['C: Auto Mode'], label: '3D Spells & Abilities' },
      { keys: ['Tab'], altKeys: ['G', 'O'], label: 'Phylogenetic Codex, Grid & Settings' },
      { keys: ['F1', 'F2', 'F3'], altKeys: [], label: 'Bastion Buildings' },
    ],
    keyBadgesFR: [
      { keys: ['1', '2', '3', '4'], altKeys: ['C : Mode Auto'], label: 'Compétences & Sorts 3D' },
      { keys: ['Tab'], altKeys: ['G', 'O'], label: 'Codex Phylogénétique, Grille & Paramètres' },
      { keys: ['F1', 'F2', 'F3'], altKeys: [], label: 'Bâtiments du Bastion' },
    ],
    objectiveLabelEN: 'Open Survival: Protect the Bastion, unite the 3 Relics & eradicate mutant lineages!',
    objectiveLabelFR: 'Survie Ouverte : Protégez le Bastion et éradiquez les lignées mutantes !',
    progressLabelTemplateEN: 'Active Ecosystem',
    progressLabelTemplateFR: 'Écosystème Actif',
    targetCount: 1,
    targetWorldPos: null,
    contextPromptEN: '🧬 Darwinian Ecosystem Active — Good hunting!',
    contextPromptFR: '🧬 Écosystème Darwinien Actif — Bonne chasse !',
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
  }),
];

/**
 * Dictionary indexed by `actNumber` (`1..7`), `id`, and `shortId`.
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
 * Returns the complete Onboarding Act definition for a given act number (`1..7`),
 * index (`0..6`), or id (`'act_1_awakening'`, `'act1'`), localized in the active language.
 *
 * @param {number|string} actRef - Act number (`1..7`) or identifier.
 * @returns {object} Localized Onboarding Act definition.
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
 * Returns the unlocked HUD panels configuration for a given act.
 *
 * @param {number|string} actRef - Act number (`1..7`) or `'completed'` / `'skipped'`.
 * @param {boolean} [tutorialSkippedOrCompleted=false] - If true, unlocks 100% of the HUD.
 * @returns {object} HUD visibility flags.
 */
export function getUnlockedHudForAct(actRef = 1, tutorialSkippedOrCompleted = false) {
  if (tutorialSkippedOrCompleted || actRef === 'completed' || actRef === 'skipped' || actRef >= 7) {
    return { ...FULL_UNLOCKED_HUD };
  }
  const act = getOnboardingAct(actRef);
  return act?.unlockedHud ? { ...act.unlockedHud } : { ...DEFAULT_LOCKED_HUD };
}

/**
 * Logs an onboarding act transition.
 *
 * @param {number} actNumber - New act number (`1..7`).
 * @param {string} [reason='progression'] - Transition reason.
 */
export function logOnboardingTransition(actNumber, reason = 'progression') {
  const act = getOnboardingAct(actNumber);
  logger.info(
    'ONBOARDING',
    `Transition to ${act.title} (${act.timeWindow}) — ${act.subtitle}`,
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
