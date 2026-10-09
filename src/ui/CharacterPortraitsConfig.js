/**
 * @file src/ui/CharacterPortraitsConfig.js
 * @description Direction Artistique (DA), catalogue des portraits 2D générés via Nano Banana
 * (`gempix-2-flash-lite-png` / `gempix2-flash`), profils d'expressions animées (« Simagrées »)
 * et métadonnées de dialogues vocaux (Gemini TTS) pour l'Onboarding en 7 Actes et les bannières
 * d'alerte tactique et écologique de **Genesis Bastion**.
 *
 * Cas d'usage :
 * 1. **Bannière d'Onboarding Guidé (Actes 1 à 7)** (`src/ui/HUDManager.js`) :
 *    Affiche le médaillon illustré d'Aldric (Actes 1–4) ou de Kaelen (Actes 5–7), alterne
 *    dynamiquement entre l'expression principale et l'expression secondaire pendant la lecture
 *    de la voix TTS (`act1_aldric` .. `act7_kaelen`), et applique la classe CSS de « simagrée »
 *    (`simagree-talk-bounce`, `simagree-battle-shake`, `simagree-scholar-nod`, `simagree-panic-pulse`,
 *    `simagree-proud-glow`, `simagree-roar-tremble`).
 * 2. **Bannière Centrale d'Alerte Éclaireur, Émergences & Courroux Draconique** (`src/ui/HUDManager.js`) :
 *    Illustre les découvertes de Patients Zéro (`kaelen_shocked.png` + `specimen_fire_troll.png`),
 *    l'éradication d'une lignée mutante (`kaelen_proud.png`), le Courroux Collectif des Dragons
 *    Souverains (`specimen_dragon_sovereign.png`), le débarquement des Requins Marcheurs Amphibies
 *    (`specimen_land_shark.png`), l'éruption souterraine des Taupes Géantes (`specimen_giant_mole.png`)
 *    et les Crises Écologiques du Gibier (`prey_crisis`).
 * 3. **Codex Phylogénétique [Tab] & Journal de Bord** :
 *    Fournit les illustrations naturalistes de référence pour les spécimens émergents et les mentors.
 */

import { logger } from '../utils/logger.js';
import { getLanguage, tr } from '../utils/i18n.js';

/**
 * Direction Artistique (DA) unifiée utilisée pour la génération Nano Banana des 10 portraits.
 * Inspirée de *Hades*, *Ravenswatch* et des carnets naturalistes enluminés du XIXe siècle.
 */
export const NANO_BANANA_ART_DIRECTION = Object.freeze({
  styleName: 'Dark-Fantasy Illustrated Biological Codex',
  promptPrefix:
    'Stylized hand-painted dark-fantasy character portrait, Hades and Ravenswatch video game art style, bold ink linework, rich parchment and obsidian rim-lighting, warm amber gold and bioluminescent emerald accents, expressive face close-up bust framed in a dark slate medallion, no text, no watermark',
  resolution: '256x256',
  format: 'image/png',
  modelsUsed: ['gempix-2-flash-lite-png', 'gempix2-flash'],
});

/**
 * Classes CSS d'animations d'expressions (« Simagrées ») appliquées au médaillon du portrait.
 */
export const SIMAGREE_ANIMATION_CLASSES = Object.freeze({
  TALK_BOUNCE: 'simagree-talk-bounce',
  BATTLE_SHAKE: 'simagree-battle-shake',
  PANIC_PULSE: 'simagree-panic-pulse',
  SCHOLAR_NOD: 'simagree-scholar-nod',
  PROUD_GLOW: 'simagree-proud-glow',
  ROAR_TREMBLE: 'simagree-roar-tremble',
});

/**
 * Définition complète des 10 fichiers PNG de portraits générés dans `public/assets/portraits/`.
 */
export const PORTRAIT_ASSETS = Object.freeze({
  aldric_neutral: 'assets/portraits/aldric_neutral.png',
  aldric_combat: 'assets/portraits/aldric_combat.png',
  aldric_scholar: 'assets/portraits/aldric_scholar.png',
  kaelen_scout: 'assets/portraits/kaelen_scout.png',
  kaelen_shocked: 'assets/portraits/kaelen_shocked.png',
  kaelen_proud: 'assets/portraits/kaelen_proud.png',
  specimen_fire_troll: 'assets/portraits/specimen_fire_troll.png',
  specimen_dragon_sovereign: 'assets/portraits/specimen_dragon_sovereign.png',
  specimen_land_shark: 'assets/portraits/specimen_land_shark.png',
  specimen_giant_mole: 'assets/portraits/specimen_giant_mole.png',
});

/**
 * Construit un descripteur normalisé d'expression (« simagrée ») afin que toutes les conventions
 * de nommage de propriétés (`url`, `portraitUrl`, `src`, `simagreeClass`, `animationClass`, `cssClass`)
 * soient disponibles sans ambiguïté pour `HUDManager.js`.
 *
 * @param {Object} spec - Spécification brute de l'expression.
 * @returns {Object} Objet d'expression figé (`Object.freeze`).
 */
function createExpressionEntry(spec) {
  return Object.freeze({
    characterId: spec.characterId,
    characterName: spec.characterName,
    title: spec.title,
    emotion: spec.emotion,
    emotionLabel: spec.emotionLabel,
    url: spec.url,
    portraitUrl: spec.url,
    src: spec.url,
    secondaryUrl: spec.secondaryUrl || spec.url,
    secondaryPortraitUrl: spec.secondaryUrl || spec.url,
    secondaryExpressionUrl: spec.secondaryUrl || spec.url,
    themeColor: spec.themeColor,
    accentColor: spec.accentColor || spec.themeColor,
    simagreeClass: spec.simagreeClass,
    animationClass: spec.simagreeClass,
    cssClass: spec.simagreeClass,
    voicePersona: spec.voicePersona || null,
  });
}

// ============================================================================
// EXPRESSIONS D'ALDRIC (Actes 1 à 4 — Maître Biologiste & Forgeron Runique)
// ============================================================================
const ALDRIC_EXPRESSIONS = Object.freeze({
  neutral: createExpressionEntry({
    characterId: 'aldric',
    characterName: 'Aldric',
    title: 'Maître Biologiste & Forgeron Runique',
    emotion: 'neutral',
    emotionLabel: '🧭 Mentor du Sanctuaire',
    url: PORTRAIT_ASSETS.aldric_neutral,
    secondaryUrl: PORTRAIT_ASSETS.aldric_scholar,
    themeColor: '#e2b76b',
    accentColor: '#48c78e',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.TALK_BOUNCE,
    voicePersona: 'Fenrir',
  }),
  combat: createExpressionEntry({
    characterId: 'aldric',
    characterName: 'Aldric',
    title: 'Maître Biologiste & Forgeron Runique',
    emotion: 'combat',
    emotionLabel: '😤 Posture de Combat',
    url: PORTRAIT_ASSETS.aldric_combat,
    secondaryUrl: PORTRAIT_ASSETS.aldric_neutral,
    themeColor: '#f59e0b',
    accentColor: '#38bdf8',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.BATTLE_SHAKE,
    voicePersona: 'Fenrir',
  }),
  scholar: createExpressionEntry({
    characterId: 'aldric',
    characterName: 'Aldric',
    title: 'Maître Biologiste & Forgeron Runique',
    emotion: 'scholar',
    emotionLabel: '🧐 Analyse Biologique',
    url: PORTRAIT_ASSETS.aldric_scholar,
    secondaryUrl: PORTRAIT_ASSETS.aldric_neutral,
    themeColor: '#48c78e',
    accentColor: '#e2b76b',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.SCHOLAR_NOD,
    voicePersona: 'Fenrir',
  }),
});

// ============================================================================
// EXPRESSIONS DE KAELEN (Actes 5 à 7 & Alertes — Cheffe des Éclaireurs)
// ============================================================================
const KAELEN_EXPRESSIONS = Object.freeze({
  scout: createExpressionEntry({
    characterId: 'kaelen',
    characterName: 'Kaelen',
    title: 'Cheffe des Éclaireurs Hors-Frontière',
    emotion: 'scout',
    emotionLabel: '🦅 Reconnaissance Tactique',
    url: PORTRAIT_ASSETS.kaelen_scout,
    secondaryUrl: PORTRAIT_ASSETS.kaelen_proud,
    themeColor: '#3ec7e6',
    accentColor: '#48c78e',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.TALK_BOUNCE,
    voicePersona: 'Kore',
  }),
  shocked: createExpressionEntry({
    characterId: 'kaelen',
    characterName: 'Kaelen',
    title: 'Cheffe des Éclaireurs Hors-Frontière',
    emotion: 'shocked',
    emotionLabel: '😱 Alerte Paniquée !',
    url: PORTRAIT_ASSETS.kaelen_shocked,
    secondaryUrl: PORTRAIT_ASSETS.kaelen_scout,
    themeColor: '#ef4444',
    accentColor: '#f97316',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.PANIC_PULSE,
    voicePersona: 'Kore',
  }),
  proud: createExpressionEntry({
    characterId: 'kaelen',
    characterName: 'Kaelen',
    title: 'Cheffe des Éclaireurs Hors-Frontière',
    emotion: 'proud',
    emotionLabel: '🌟 Fierté & Éveil',
    url: PORTRAIT_ASSETS.kaelen_proud,
    secondaryUrl: PORTRAIT_ASSETS.kaelen_scout,
    themeColor: '#fbbf24',
    accentColor: '#3ec7e6',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.PROUD_GLOW,
    voicePersona: 'Kore',
  }),
});

// ============================================================================
// PORTRAITS DE MENACES / SPÉCIMENS (Troll de Feu, Dragon, Requin Marcheur, Taupe Géante)
// ============================================================================
const FIRE_TROLL_EXPRESSION = createExpressionEntry({
  characterId: 'fire_troll',
  characterName: 'Patient Zéro : Troll de Feu',
  title: 'Spécimen Mutant Juvénile (Glande Pyroclastique)',
  emotion: 'roar',
  emotionLabel: '🔥 Mutation Dominante (78%)',
  url: PORTRAIT_ASSETS.specimen_fire_troll,
  secondaryUrl: PORTRAIT_ASSETS.kaelen_shocked,
  themeColor: '#ef4444',
  accentColor: '#f97316',
  simagreeClass: SIMAGREE_ANIMATION_CLASSES.ROAR_TREMBLE,
});

const DRAGON_SOVEREIGN_EXPRESSION = createExpressionEntry({
  characterId: 'dragon_sovereign',
  characterName: 'Dragon Souverain de la Caldeira',
  title: 'Prédateur Apex Pacifique (Courroux Collectif si provoqué)',
  emotion: 'roar',
  emotionLabel: '🐉 Souverain de la Caldeira',
  url: PORTRAIT_ASSETS.specimen_dragon_sovereign,
  secondaryUrl: PORTRAIT_ASSETS.kaelen_shocked,
  themeColor: '#dc2626',
  accentColor: '#fbbf24',
  simagreeClass: SIMAGREE_ANIMATION_CLASSES.ROAR_TREMBLE,
});

const LAND_SHARK_EXPRESSION = createExpressionEntry({
  characterId: 'land_shark',
  characterName: 'Requin Marcheur des Abysses',
  title: 'Prédateur Amphibie Émergent (Pattes & Branchies Amphibies)',
  emotion: 'roar',
  emotionLabel: '🦈 Débarquement Amphibie !',
  url: PORTRAIT_ASSETS.specimen_land_shark,
  secondaryUrl: PORTRAIT_ASSETS.kaelen_shocked,
  themeColor: '#0ea5e9',
  accentColor: '#38bdf8',
  simagreeClass: SIMAGREE_ANIMATION_CLASSES.ROAR_TREMBLE,
});

const GIANT_MOLE_EXPRESSION = createExpressionEntry({
  characterId: 'giant_mole',
  characterName: 'Taupe Géante Fouisseuse',
  title: 'Colosse Souterrain Émergent (Griffes Foreuses)',
  emotion: 'roar',
  emotionLabel: '🕳️ Éruption Souterraine !',
  url: PORTRAIT_ASSETS.specimen_giant_mole,
  secondaryUrl: PORTRAIT_ASSETS.kaelen_shocked,
  themeColor: '#d97706',
  accentColor: '#f59e0b',
  simagreeClass: SIMAGREE_ANIMATION_CLASSES.BATTLE_SHAKE,
});

/**
 * Catalogue principal `CHARACTER_PORTRAITS` exporté pour l'interface utilisateur.
 * Expose les personnages et spécimens clés (`aldric`, `kaelen`, `fire_troll`, `dragon_sovereign`,
 * `land_shark`, `giant_mole`) avec leurs sous-expressions (`neutral`, `combat`, `scholar`,
 * `scout`, `shocked`, `proud`, `roar`) ainsi que des raccourcis directs par nom de fichier ou d'espèce.
 */
export const CHARACTER_PORTRAITS = Object.freeze({
  aldric: Object.freeze({
    id: 'aldric',
    name: 'Aldric',
    characterName: 'Aldric',
    fullName: 'Aldric, Maître Biologiste & Forgeron Runique',
    title: 'Maître Biologiste & Forgeron Runique',
    themeColor: '#e2b76b',
    accentColor: '#48c78e',
    voicePersona: 'Fenrir',
    defaultEmotion: 'neutral',
    defaultPortraitUrl: PORTRAIT_ASSETS.aldric_neutral,
    portraitUrl: PORTRAIT_ASSETS.aldric_neutral,
    url: PORTRAIT_ASSETS.aldric_neutral,
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.TALK_BOUNCE,
    expressions: Object.freeze({
      neutral: ALDRIC_EXPRESSIONS.neutral,
      combat: ALDRIC_EXPRESSIONS.combat,
      scholar: ALDRIC_EXPRESSIONS.scholar,
      scout: ALDRIC_EXPRESSIONS.neutral,
      shocked: ALDRIC_EXPRESSIONS.combat,
      proud: ALDRIC_EXPRESSIONS.scholar,
      roar: ALDRIC_EXPRESSIONS.combat,
    }),
    neutral: ALDRIC_EXPRESSIONS.neutral,
    combat: ALDRIC_EXPRESSIONS.combat,
    scholar: ALDRIC_EXPRESSIONS.scholar,
  }),

  kaelen: Object.freeze({
    id: 'kaelen',
    name: 'Kaelen',
    characterName: 'Kaelen',
    fullName: 'Kaelen, Cheffe des Éclaireurs Hors-Frontière',
    title: 'Cheffe des Éclaireurs Hors-Frontière',
    themeColor: '#3ec7e6',
    accentColor: '#f59e0b',
    voicePersona: 'Kore',
    defaultEmotion: 'scout',
    defaultPortraitUrl: PORTRAIT_ASSETS.kaelen_scout,
    portraitUrl: PORTRAIT_ASSETS.kaelen_scout,
    url: PORTRAIT_ASSETS.kaelen_scout,
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.TALK_BOUNCE,
    expressions: Object.freeze({
      scout: KAELEN_EXPRESSIONS.scout,
      shocked: KAELEN_EXPRESSIONS.shocked,
      proud: KAELEN_EXPRESSIONS.proud,
      neutral: KAELEN_EXPRESSIONS.scout,
      combat: KAELEN_EXPRESSIONS.shocked,
      scholar: KAELEN_EXPRESSIONS.scout,
      roar: KAELEN_EXPRESSIONS.shocked,
    }),
    scout: KAELEN_EXPRESSIONS.scout,
    shocked: KAELEN_EXPRESSIONS.shocked,
    proud: KAELEN_EXPRESSIONS.proud,
    neutral: KAELEN_EXPRESSIONS.scout,
  }),

  fire_troll: Object.freeze({
    id: 'fire_troll',
    name: 'Patient Zéro : Troll de Feu',
    characterName: 'Patient Zéro : Troll de Feu',
    fullName: 'Patient Zéro — Troll de Feu Mutant (pyro_gland)',
    title: 'Spécimen Mutant Juvénile (Glande Pyroclastique)',
    themeColor: '#ef4444',
    accentColor: '#f97316',
    defaultEmotion: 'roar',
    defaultPortraitUrl: PORTRAIT_ASSETS.specimen_fire_troll,
    portraitUrl: PORTRAIT_ASSETS.specimen_fire_troll,
    url: PORTRAIT_ASSETS.specimen_fire_troll,
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.ROAR_TREMBLE,
    expressions: Object.freeze({
      roar: FIRE_TROLL_EXPRESSION,
      neutral: FIRE_TROLL_EXPRESSION,
      combat: FIRE_TROLL_EXPRESSION,
      shocked: FIRE_TROLL_EXPRESSION,
    }),
    roar: FIRE_TROLL_EXPRESSION,
    neutral: FIRE_TROLL_EXPRESSION,
    combat: FIRE_TROLL_EXPRESSION,
  }),

  dragon_sovereign: Object.freeze({
    id: 'dragon_sovereign',
    name: 'Dragon Souverain de la Caldeira',
    characterName: 'Dragon Souverain de la Caldeira',
    fullName: 'Dragon Souverain de la Caldeira',
    title: 'Prédateur Apex Pacifique (Courroux Collectif si provoqué)',
    themeColor: '#dc2626',
    accentColor: '#fbbf24',
    defaultEmotion: 'roar',
    defaultPortraitUrl: PORTRAIT_ASSETS.specimen_dragon_sovereign,
    portraitUrl: PORTRAIT_ASSETS.specimen_dragon_sovereign,
    url: PORTRAIT_ASSETS.specimen_dragon_sovereign,
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.ROAR_TREMBLE,
    expressions: Object.freeze({
      roar: DRAGON_SOVEREIGN_EXPRESSION,
      neutral: DRAGON_SOVEREIGN_EXPRESSION,
      combat: DRAGON_SOVEREIGN_EXPRESSION,
      shocked: DRAGON_SOVEREIGN_EXPRESSION,
    }),
    roar: DRAGON_SOVEREIGN_EXPRESSION,
    neutral: DRAGON_SOVEREIGN_EXPRESSION,
    combat: DRAGON_SOVEREIGN_EXPRESSION,
  }),

  land_shark: Object.freeze({
    id: 'land_shark',
    name: 'Requin Marcheur des Abysses',
    characterName: 'Requin Marcheur des Abysses',
    fullName: 'Requin Marcheur Amphibie (amphibious_lungs)',
    title: 'Prédateur Amphibie Émergent des Plages',
    themeColor: '#0ea5e9',
    accentColor: '#38bdf8',
    defaultEmotion: 'roar',
    defaultPortraitUrl: PORTRAIT_ASSETS.specimen_land_shark,
    portraitUrl: PORTRAIT_ASSETS.specimen_land_shark,
    url: PORTRAIT_ASSETS.specimen_land_shark,
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.ROAR_TREMBLE,
    expressions: Object.freeze({
      roar: LAND_SHARK_EXPRESSION,
      neutral: LAND_SHARK_EXPRESSION,
      combat: LAND_SHARK_EXPRESSION,
      shocked: LAND_SHARK_EXPRESSION,
    }),
    roar: LAND_SHARK_EXPRESSION,
    neutral: LAND_SHARK_EXPRESSION,
    combat: LAND_SHARK_EXPRESSION,
  }),

  giant_mole: Object.freeze({
    id: 'giant_mole',
    name: 'Taupe Géante Fouisseuse',
    characterName: 'Taupe Géante Fouisseuse',
    fullName: 'Taupe Géante Fouisseuse des Profondeurs',
    title: 'Colosse Souterrain Émergent',
    themeColor: '#d97706',
    accentColor: '#f59e0b',
    defaultEmotion: 'roar',
    defaultPortraitUrl: PORTRAIT_ASSETS.specimen_giant_mole,
    portraitUrl: PORTRAIT_ASSETS.specimen_giant_mole,
    url: PORTRAIT_ASSETS.specimen_giant_mole,
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.BATTLE_SHAKE,
    expressions: Object.freeze({
      roar: GIANT_MOLE_EXPRESSION,
      neutral: GIANT_MOLE_EXPRESSION,
      combat: GIANT_MOLE_EXPRESSION,
      shocked: GIANT_MOLE_EXPRESSION,
    }),
    roar: GIANT_MOLE_EXPRESSION,
    neutral: GIANT_MOLE_EXPRESSION,
    combat: GIANT_MOLE_EXPRESSION,
  }),

  // Raccourcis directs par identifiant de fichier ou d'espèce
  aldric_neutral: ALDRIC_EXPRESSIONS.neutral,
  aldric_combat: ALDRIC_EXPRESSIONS.combat,
  aldric_scholar: ALDRIC_EXPRESSIONS.scholar,
  kaelen_scout: KAELEN_EXPRESSIONS.scout,
  kaelen_shocked: KAELEN_EXPRESSIONS.shocked,
  kaelen_proud: KAELEN_EXPRESSIONS.proud,
  specimen_fire_troll: FIRE_TROLL_EXPRESSION,
  specimen_dragon_sovereign: DRAGON_SOVEREIGN_EXPRESSION,
  specimen_land_shark: LAND_SHARK_EXPRESSION,
  specimen_giant_mole: GIANT_MOLE_EXPRESSION,
  troll: FIRE_TROLL_EXPRESSION,
  dragon: DRAGON_SOVEREIGN_EXPRESSION,
  shark: LAND_SHARK_EXPRESSION,
  mole: GIANT_MOLE_EXPRESSION,
});

/**
 * Table des présentations narratives, visuelles et vocales pour chacun des 7 Actes du Tutoriel.
 * - Actes 1 à 4 : incarnés par **Aldric** (voix `Fenrir`).
 * - Actes 5 à 7 : incarnés par **Kaelen** (voix `Kore`).
 */
export const TUTORIAL_ACT_DIALOGUES = Object.freeze({
  1: Object.freeze({
    actNumber: 1,
    speakerId: 'aldric',
    speaker: 'Aldric',
    speakerTitleEN: 'Master Biologist & Runic Blacksmith',
    speakerTitleFR: 'Maître Biologiste & Forgeron Runique',
    emotion: 'neutral',
    emotionLabelEN: '🧭 Benevolent Mentor',
    emotionLabelFR: '🧭 Mentor Bienveillant',
    portraitUrl: PORTRAIT_ASSETS.aldric_neutral,
    secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_scholar,
    specimenPortraitUrl: null,
    themeColor: '#e2b76b',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.TALK_BOUNCE,
    voiceAudioKey: 'act1_aldric',
    ttsUrlEN: 'assets/audio/tts/en/act1_aldric.wav',
    ttsUrlFR: 'assets/audio/tts/act1_aldric.wav',
    quoteEN:
      '"Welcome to the Bastion Sanctuary, Guardian. The ecosystem around us is frozen for now. Walk to the golden beacon to the South and test your tactical camera."',
    quoteFR:
      "« Bienvenue au Sanctuaire du Bastion, Gardien. L'écosystème autour de nous est figé pour l'instant. Marche jusqu'à la balise dorée au Sud et ajuste ta caméra. »",
  }),

  2: Object.freeze({
    actNumber: 2,
    speakerId: 'aldric',
    speaker: 'Aldric',
    speakerTitleEN: 'Master Biologist & Runic Blacksmith',
    speakerTitleFR: 'Maître Biologiste & Forgeron Runique',
    emotion: 'combat',
    emotionLabelEN: '😤 Battle Stance',
    emotionLabelFR: '😤 Posture de Combat',
    portraitUrl: PORTRAIT_ASSETS.aldric_combat,
    secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_neutral,
    specimenPortraitUrl: null,
    themeColor: '#f59e0b',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.BATTLE_SHAKE,
    voiceAudioKey: 'act2_aldric',
    ttsUrlEN: 'assets/audio/tts/en/act2_aldric.wav',
    ttsUrlFR: 'assets/audio/tts/act2_aldric.wav',
    quoteEN:
      '"A Stray Goblin and a Marauder Orc are approaching! Strike them with your runic greatsword, dash with Shift, and choose your first spell at level two."',
    quoteFR:
      '« Un Gobelin égaré puis un Orc maraudeur approchent ! Frappe-les avec ton épée runique, esquive avec Shift, et choisis ton premier sort au niveau deux. »',
    subStepOverrides: Object.freeze({
      pick_first_upgrade: {
        emotion: 'scholar',
        emotionLabelEN: '🧐 Runic Mastery',
        emotionLabelFR: '🧐 Maîtrise Runique',
        portraitUrl: PORTRAIT_ASSETS.aldric_scholar,
        secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_neutral,
        simagreeClass: SIMAGREE_ANIMATION_CLASSES.SCHOLAR_NOD,
      },
      2: {
        emotion: 'scholar',
        emotionLabelEN: '🧐 Runic Mastery',
        emotionLabelFR: '🧐 Maîtrise Runique',
        portraitUrl: PORTRAIT_ASSETS.aldric_scholar,
        secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_neutral,
        simagreeClass: SIMAGREE_ANIMATION_CLASSES.SCHOLAR_NOD,
      },
    }),
  }),

  3: Object.freeze({
    actNumber: 3,
    speakerId: 'aldric',
    speaker: 'Aldric',
    speakerTitleEN: 'Master Biologist & Runic Blacksmith',
    speakerTitleFR: 'Maître Biologiste & Forgeron Runique',
    emotion: 'scholar',
    emotionLabelEN: '🧐 Biological Analysis & Harvest',
    emotionLabelFR: '🧐 Analyse Biologique & Récolte',
    portraitUrl: PORTRAIT_ASSETS.aldric_scholar,
    secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_neutral,
    specimenPortraitUrl: null,
    themeColor: '#48c78e',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.SCHOLAR_NOD,
    voiceAudioKey: 'act3_aldric',
    ttsUrlEN: 'assets/audio/tts/en/act3_aldric.wav',
    ttsUrlFR: 'assets/audio/tts/act3_aldric.wav',
    quoteEN:
      '"Slay that wolf, free the survivor locked in the South-East cage with key E, then harvest wood or crystal for our camp."',
    quoteFR:
      '« Élimine ce loup, libère le survivant enfermé dans la cage au Sud-Est avec la touche E, puis récolte du bois ou du cristal pour notre camp. »',
    subStepOverrides: Object.freeze({
      rescue_cage_1: {
        emotion: 'combat',
        emotionLabelEN: '⚔️ Tactical Rescue',
        emotionLabelFR: '⚔️ Sauvetage Tactique',
        portraitUrl: PORTRAIT_ASSETS.aldric_combat,
        secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_scholar,
        simagreeClass: SIMAGREE_ANIMATION_CLASSES.TALK_BOUNCE,
      },
    }),
  }),

  4: Object.freeze({
    actNumber: 4,
    speakerId: 'aldric',
    speaker: 'Aldric',
    speakerTitleEN: 'Master Biologist & Runic Blacksmith',
    speakerTitleFR: 'Maître Biologiste & Forgeron Runique',
    emotion: 'neutral',
    emotionLabelEN: '🛡️ Master Blacksmith of the Bastion',
    emotionLabelFR: '🛡️ Maître Forgeron du Bastion',
    portraitUrl: PORTRAIT_ASSETS.aldric_neutral,
    secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_combat,
    specimenPortraitUrl: null,
    themeColor: '#e2b76b',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.TALK_BOUNCE,
    voiceAudioKey: 'act4_aldric',
    ttsUrlEN: 'assets/audio/tts/en/act4_aldric.wav',
    ttsUrlFR: 'assets/audio/tts/act4_aldric.wav',
    quoteEN:
      '"Use our resources to build a Watchtower on the golden pad, then repel the goblin raiders charging our ramparts!"',
    quoteFR:
      '« Utilise nos ressources pour bâtir une Tour de Guet sur le socle doré, puis repousse les pillards gobelins qui fondent sur nos remparts ! »',
    subStepOverrides: Object.freeze({
      repel_goblin_raiders: {
        emotion: 'combat',
        emotionLabelEN: '😤 Defend the Ramparts!',
        emotionLabelFR: '😤 Défense des Remparts !',
        portraitUrl: PORTRAIT_ASSETS.aldric_combat,
        secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_neutral,
        simagreeClass: SIMAGREE_ANIMATION_CLASSES.BATTLE_SHAKE,
      },
      1: {
        emotion: 'combat',
        emotionLabelEN: '😤 Defend the Ramparts!',
        emotionLabelFR: '😤 Défense des Remparts !',
        portraitUrl: PORTRAIT_ASSETS.aldric_combat,
        secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_neutral,
        simagreeClass: SIMAGREE_ANIMATION_CLASSES.BATTLE_SHAKE,
      },
    }),
  }),

  5: Object.freeze({
    actNumber: 5,
    speakerId: 'kaelen',
    speaker: 'Kaelen',
    speakerTitleEN: 'Chief Frontier Scout',
    speakerTitleFR: 'Cheffe des Éclaireurs Hors-Frontière',
    emotion: 'scout',
    emotionLabelEN: '🦅 Deep Wilderness Reconnaissance',
    emotionLabelFR: '🦅 Reconnaissance Hors-Frontière',
    portraitUrl: PORTRAIT_ASSETS.kaelen_scout,
    secondaryExpressionUrl: PORTRAIT_ASSETS.kaelen_proud,
    specimenPortraitUrl: null,
    themeColor: '#3ec7e6',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.TALK_BOUNCE,
    voiceAudioKey: 'act5_kaelen',
    ttsUrlEN: 'assets/audio/tts/en/act5_kaelen.wav',
    ttsUrlFR: 'assets/audio/tts/act5_kaelen.wav',
    quoteEN:
      '"Thank you for freeing me! Assign a survivor to the Scout role in the left panel: we will patrol beyond the frontier to track mutations."',
    quoteFR:
      "« Merci de m'avoir libérée ! Affecte un survivant au rôle d'Éclaireur dans le panneau gauche : nous irons patrouiller au-delà de la frontière pour traquer les mutations. »",
  }),

  6: Object.freeze({
    actNumber: 6,
    speakerId: 'kaelen',
    speaker: 'Kaelen',
    speakerTitleEN: 'Chief Frontier Scout',
    speakerTitleFR: 'Cheffe des Éclaireurs Hors-Frontière',
    emotion: 'shocked',
    emotionLabelEN: '😱 Urgent Scout Alert!',
    emotionLabelFR: '😱 Alerte Paniquée !',
    portraitUrl: PORTRAIT_ASSETS.kaelen_shocked,
    secondaryExpressionUrl: PORTRAIT_ASSETS.specimen_fire_troll,
    specimenPortraitUrl: PORTRAIT_ASSETS.specimen_fire_troll,
    themeColor: '#ef4444',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.PANIC_PULSE,
    voiceAudioKey: 'act6_kaelen',
    ttsUrlEN: 'assets/audio/tts/en/act6_kaelen.wav',
    ttsUrlFR: 'assets/audio/tts/act6_kaelen.wav',
    quoteEN:
      '"Priority alert! I spotted a Baby Fire Troll in the North-East! It is a Patient Zero: eliminate it quickly before it matures into an adult and reproduces!"',
    quoteFR:
      "« Alerte prioritaire ! J'ai repéré un Bébé Troll de Feu au Nord-Est ! C'est un Patient Zéro : élimine-le vite avant qu'il ne devienne adulte et ne se reproduise ! »",
    subStepOverrides: Object.freeze({
      open_phylo_codex: {
        emotion: 'scout',
        emotionLabelEN: '🧐 Phylogenetic Report [Tab]',
        emotionLabelFR: '🧐 Rapport Phylogénétique [Tab]',
        portraitUrl: PORTRAIT_ASSETS.kaelen_scout,
        secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_scholar,
        simagreeClass: SIMAGREE_ANIMATION_CLASSES.SCHOLAR_NOD,
      },
      1: {
        emotion: 'scout',
        emotionLabelEN: '🧐 Phylogenetic Report [Tab]',
        emotionLabelFR: '🧐 Rapport Phylogénétique [Tab]',
        portraitUrl: PORTRAIT_ASSETS.kaelen_scout,
        secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_scholar,
        simagreeClass: SIMAGREE_ANIMATION_CLASSES.SCHOLAR_NOD,
      },
    }),
  }),

  7: Object.freeze({
    actNumber: 7,
    speakerId: 'kaelen',
    speaker: 'Kaelen',
    speakerTitleEN: 'Chief Frontier Scout',
    speakerTitleFR: 'Cheffe des Éclaireurs Hors-Frontière',
    emotion: 'proud',
    emotionLabelEN: '🌟 Victory & Darwinian Awakening',
    emotionLabelFR: '🌟 Victoire & Éveil Darwinien',
    portraitUrl: PORTRAIT_ASSETS.kaelen_proud,
    secondaryExpressionUrl: PORTRAIT_ASSETS.specimen_dragon_sovereign,
    specimenPortraitUrl: PORTRAIT_ASSETS.specimen_dragon_sovereign,
    themeColor: '#fbbf24',
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.PROUD_GLOW,
    voiceAudioKey: 'act7_kaelen',
    ttsUrlEN: 'assets/audio/tts/en/act7_kaelen.wav',
    ttsUrlFR: 'assets/audio/tts/act7_kaelen.wav',
    quoteEN:
      '"Well done! The Darwinian ecosystem now awakens across the entire island. Beware the Dragons of the caldera: as long as we do not attack them, they leave us in peace!"',
    quoteFR:
      "« Bien joué ! L'écosystème darwinien s'éveille maintenant sur toute l'île. Mais attention aux Dragons de la caldeira : tant qu'on ne les attaque pas, ils nous laissent en paix ! »",
  }),
});

/**
 * Returns the complete localized character presentation for Onboarding Acts 1–7.
 *
 * @param {number|string} [actNumber=1]
 * @param {number|string|null} [subStep=null]
 * @returns {object}
 */
export function getTutorialDialoguePresentation(actNumber = 1, subStep = null) {
  let parsedAct = 1;
  if (typeof actNumber === 'number' && Number.isFinite(actNumber)) {
    parsedAct = Math.max(1, Math.min(7, Math.round(actNumber)));
  } else if (typeof actNumber === 'string') {
    const match = actNumber.match(/([1-7])/);
    if (match) {
      parsedAct = Number(match[1]);
    }
  }

  const baseSpec = TUTORIAL_ACT_DIALOGUES[parsedAct] || TUTORIAL_ACT_DIALOGUES[1];
  const override =
    subStep !== null &&
    subStep !== undefined &&
    baseSpec.subStepOverrides &&
    baseSpec.subStepOverrides[subStep]
      ? baseSpec.subStepOverrides[subStep]
      : null;

  const speakerTitle = tr(baseSpec.speakerTitleEN, baseSpec.speakerTitleFR);
  const emotion = override?.emotion || baseSpec.emotion;
  const emotionLabel = override
    ? tr(override.emotionLabelEN, override.emotionLabelFR)
    : tr(baseSpec.emotionLabelEN, baseSpec.emotionLabelFR);
  const portraitUrl = override?.portraitUrl || baseSpec.portraitUrl;
  const secondaryExpressionUrl =
    override?.secondaryExpressionUrl || baseSpec.secondaryExpressionUrl || portraitUrl;
  const simagreeClass = override?.simagreeClass || baseSpec.simagreeClass;
  const quote = override?.quoteEN
    ? tr(override.quoteEN, override.quoteFR)
    : tr(baseSpec.quoteEN, baseSpec.quoteFR);
  const ttsUrl = getLanguage() === 'fr' ? baseSpec.ttsUrlFR : baseSpec.ttsUrlEN;

  return {
    actNumber: parsedAct,
    subStep,
    speakerId: baseSpec.speakerId,
    speaker: baseSpec.speaker,
    speakerName: baseSpec.speaker,
    speakerTitle,
    title: speakerTitle,
    themeColor: baseSpec.themeColor,
    emotion,
    emotionLabel,
    portraitUrl,
    url: portraitUrl,
    secondaryExpressionUrl,
    secondaryPortraitUrl: secondaryExpressionUrl,
    altPortraitUrl: secondaryExpressionUrl,
    specimenPortraitUrl: baseSpec.specimenPortraitUrl || null,
    simagreeClass,
    animationClass: simagreeClass,
    cssClass: simagreeClass,
    voiceAudioKey: baseSpec.voiceAudioKey,
    voiceKey: baseSpec.voiceAudioKey,
    audioKey: baseSpec.voiceAudioKey,
    ttsUrl,
    quote,
    characterQuote: quote,
    dialogueText: quote,
  };
}

/**
 * Alias of `getTutorialDialoguePresentation` for convenience.
 */
export const getOnboardingPortraitPresentation = getTutorialDialoguePresentation;

/**
 * Retrieves a portrait descriptor by character id and emotion.
 *
 * @param {string} [characterId='aldric']
 * @param {string} [emotion='neutral']
 * @returns {Object}
 */
export function getCharacterPortrait(characterId = 'aldric', emotion = 'neutral') {
  const charEntry = CHARACTER_PORTRAITS[characterId] || CHARACTER_PORTRAITS.aldric;
  if (charEntry.expressions) {
    return (
      charEntry.expressions[emotion] ||
      charEntry.expressions[charEntry.defaultEmotion] ||
      ALDRIC_EXPRESSIONS.neutral
    );
  }
  return charEntry;
}

/**
 * Returns the localized visual and voice configuration for the Central Alert Banner
 * (`patient_zero`, `eradicated`, `dragon_wrath`, `shark_landing`, `mole_eruption`, `prey_crisis`, `relic_found`, `island_victory`, `game_over`).
 *
 * @param {string} [alertType='patient_zero']
 * @returns {object}
 */
export function getAlertBannerPortraitPresentation(alertType = 'patient_zero') {
  if (alertType === 'shark_landing' || alertType === 'land_shark' || alertType === 'shark') {
    return {
      alertType: 'shark_landing',
      speaker: 'Kaelen',
      speakerTitle: tr('Chief Frontier Scout', 'Cheffe des Éclaireurs Hors-Frontière'),
      emotionLabel: tr('🦈 AMPHIBIOUS LANDING!', '🦈 DÉBARQUEMENT AMPHIBIE !'),
      portraitUrl: PORTRAIT_ASSETS.specimen_land_shark,
      secondaryExpressionUrl: PORTRAIT_ASSETS.kaelen_shocked,
      specimenPortraitUrl: PORTRAIT_ASSETS.specimen_land_shark,
      simagreeClass: SIMAGREE_ANIMATION_CLASSES.ROAR_TREMBLE,
      specimenSimagreeClass: SIMAGREE_ANIMATION_CLASSES.ROAR_TREMBLE,
      themeColor: '#0ea5e9',
      voiceAudioKey: 'alert_shark_landing',
      quote: tr(
        '"Deep-sea Sharks have evolved muscular legs and amphibious gills! They are emerging from the ocean onto our beaches!"',
        '« Les Requins des Abysses ont développé des pattes musclées et des branchies amphibies ! Ils sortent de la mer et débarquent sur nos plages ! »'
      ),
    };
  }

  if (alertType === 'mole_eruption' || alertType === 'giant_mole' || alertType === 'mole') {
    return {
      alertType: 'mole_eruption',
      speaker: 'Kaelen',
      speakerTitle: tr('Chief Frontier Scout', 'Cheffe des Éclaireurs Hors-Frontière'),
      emotionLabel: tr('🕳️ SUBTERRANEAN ERUPTION!', '🕳️ ÉRUPTION SOUTERRAINE !'),
      portraitUrl: PORTRAIT_ASSETS.specimen_giant_mole,
      secondaryExpressionUrl: PORTRAIT_ASSETS.kaelen_shocked,
      specimenPortraitUrl: PORTRAIT_ASSETS.specimen_giant_mole,
      simagreeClass: SIMAGREE_ANIMATION_CLASSES.BATTLE_SHAKE,
      specimenSimagreeClass: SIMAGREE_ANIMATION_CLASSES.BATTLE_SHAKE,
      themeColor: '#d97706',
      voiceAudioKey: 'alert_mole_eruption',
      quote: tr(
        '"The ground is trembling! Burrowing Giant Moles are erupting from underground tunnels and threaten to hybridize with Trolls!"',
        '« Le sol tremble ! Des Taupes Géantes Fouisseuses surgissent des galeries souterraines et menacent de s’hybrider avec les Trolls ! »'
      ),
    };
  }

  if (
    alertType === 'prey_crisis' ||
    alertType === 'prey_extinction' ||
    alertType === 'herbivore_crisis' ||
    alertType === 'famine_crisis'
  ) {
    return {
      alertType: 'prey_crisis',
      speaker: 'Aldric',
      speakerTitle: tr('Master Biologist & Runic Blacksmith', 'Maître Biologiste & Forgeron Runique'),
      emotionLabel: tr('🦌 ECOLOGICAL PREY CRISIS!', '🦌 CRISE ÉCOLOGIQUE DU GIBIER !'),
      portraitUrl: PORTRAIT_ASSETS.aldric_scholar,
      secondaryExpressionUrl: PORTRAIT_ASSETS.kaelen_shocked,
      specimenPortraitUrl: PORTRAIT_ASSETS.aldric_scholar,
      simagreeClass: SIMAGREE_ANIMATION_CLASSES.PANIC_PULSE,
      specimenSimagreeClass: SIMAGREE_ANIMATION_CLASSES.PANIC_PULSE,
      themeColor: '#eab308',
      voiceAudioKey: 'alert_prey_crisis',
      quote: tr(
        '"Watch your area spells! Deer and Rabbits do not repopulate on their own: if they go extinct, our camp will starve and hungry predators will swarm the Bastion!"',
        '« Attention à tes sorts de zone ! Les Biches et les Lapins ne réapparaissent pas tout seuls : s’ils s’éteignent, notre camp tombera en famine et les prédateurs affamés fondront sur le Bastion ! »'
      ),
    };
  }

  if (alertType === 'dragon_wrath' || alertType === 'species_wrath') {
    return {
      alertType: 'dragon_wrath',
      speaker: 'Kaelen',
      speakerTitle: tr('Chief Frontier Scout', 'Cheffe des Éclaireurs Hors-Frontière'),
      emotionLabel: tr('🐉 DRAGON WRATH!', '🐉 COURROUX DRACONIQUE !'),
      portraitUrl: PORTRAIT_ASSETS.specimen_dragon_sovereign,
      secondaryExpressionUrl: PORTRAIT_ASSETS.kaelen_shocked,
      specimenPortraitUrl: PORTRAIT_ASSETS.specimen_dragon_sovereign,
      simagreeClass: SIMAGREE_ANIMATION_CLASSES.ROAR_TREMBLE,
      specimenSimagreeClass: SIMAGREE_ANIMATION_CLASSES.ROAR_TREMBLE,
      themeColor: '#dc2626',
      voiceAudioKey: 'alert_dragon_wrath',
      quote: tr(
        '"Disaster! You provoked a Sovereign Dragon! The entire species is enraged and descending upon our Bastion!"',
        "« Malheur ! Tu as provoqué un Dragon Souverain ! Toute l'espèce entre en fureur et fond sur notre Bastion ! »"
      ),
    };
  }

  if (
    alertType === 'relic_found' ||
    alertType === 'relic_collected' ||
    alertType === 'relic'
  ) {
    return {
      alertType: 'relic_found',
      speaker: 'Aldric',
      speakerTitle: tr('Master Biologist & Runic Blacksmith', 'Maître Biologiste & Forgeron Runique'),
      emotionLabel: tr('🏛️ EDEN RELIC ACTIVATED!', '🏛️ RELIQUE D’ÉDEN ACTIVÉE !'),
      portraitUrl: PORTRAIT_ASSETS.aldric_scholar,
      secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_neutral,
      specimenPortraitUrl: PORTRAIT_ASSETS.aldric_scholar,
      simagreeClass: SIMAGREE_ANIMATION_CLASSES.SCHOLAR_NOD,
      specimenSimagreeClass: SIMAGREE_ANIMATION_CLASSES.PROUD_GLOW,
      themeColor: '#00e5ff',
      voiceAudioKey: 'alert_relic_found',
      quote: tr(
        '"An Eden Relic Fragment resonates with the Sanctuary Hearth! Unite all three fragments to raise the Planetary Shield Dome!"',
        '« Un Fragment de Relique d’Éden résonne avec le Foyer du Sanctuaire ! Réunis les trois fragments pour ériger le Dôme-Bouclier Planétaire ! »'
      ),
    };
  }

  if (
    alertType === 'island_victory' ||
    alertType === 'island_shield' ||
    alertType === 'shield_activated'
  ) {
    return {
      alertType: 'island_victory',
      speaker: 'Kaelen',
      speakerTitle: tr('Chief Frontier Scout', 'Cheffe des Éclaireurs Hors-Frontière'),
      emotionLabel: tr('🛡️ EDEN PLANETARY DOME!', '🛡️ DÔME PLANÉTAIRE D’ÉDEN !'),
      portraitUrl: PORTRAIT_ASSETS.kaelen_proud,
      secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_scholar,
      specimenPortraitUrl: PORTRAIT_ASSETS.kaelen_proud,
      simagreeClass: SIMAGREE_ANIMATION_CLASSES.PROUD_GLOW,
      specimenSimagreeClass: SIMAGREE_ANIMATION_CLASSES.PROUD_GLOW,
      themeColor: '#38bdf8',
      voiceAudioKey: 'alert_island_victory',
      quote: tr(
        '"All three Eden Relics are united! The Planetary Shield Dome protects the entire island and pacifies wild predators!"',
        '« Les trois Reliques d’Éden sont réunies ! Le Dôme-Bouclier Planétaire protège l’île entière et pacifie les prédateurs sauvages ! »'
      ),
    };
  }

  if (
    alertType === 'game_over' ||
    alertType === 'gameover' ||
    alertType === 'requiem'
  ) {
    return {
      alertType: 'game_over',
      speaker: 'Aldric',
      speakerTitle: tr('Master Biologist & Runic Blacksmith', 'Maître Biologiste & Forgeron Runique'),
      emotionLabel: tr('🕯️ SANCTUARY REQUIEM', '🕯️ REQUIEM DU SANCTUAIRE'),
      portraitUrl: PORTRAIT_ASSETS.aldric_scholar,
      secondaryExpressionUrl: PORTRAIT_ASSETS.aldric_neutral,
      specimenPortraitUrl: PORTRAIT_ASSETS.aldric_scholar,
      simagreeClass: SIMAGREE_ANIMATION_CLASSES.SCHOLAR_NOD,
      specimenSimagreeClass: SIMAGREE_ANIMATION_CLASSES.SCHOLAR_NOD,
      themeColor: '#dc2626',
      voiceAudioKey: 'alert_gameover_requiem',
      quote: tr(
        '"Even the greatest Guardians sometimes fall to Darwin’s law, my friend. Hear the Sanctuary’s song: will you restart from zero by the sacred roguelike rule, or let Eden’s flame raise you to continue this expedition?"',
        '« Même les plus grands Gardiens tombent parfois sous la loi de Darwin, mon ami. Écoute le chant du Sanctuaire : veux-tu repartir à zéro selon la règle sacrée du roguelike, ou laisser la flamme d’Éden te relever pour continuer cette expédition ? »'
      ),
    };
  }

  if (alertType === 'eradicated' || alertType === 'lineage_eradicated') {
    return {
      alertType: 'eradicated',
      speaker: 'Kaelen',
      speakerTitle: tr('Chief Frontier Scout', 'Cheffe des Éclaireurs Hors-Frontière'),
      emotionLabel: tr('🌟 Lineage Eradicated!', '🌟 Lignée Éradiquée !'),
      portraitUrl: PORTRAIT_ASSETS.kaelen_proud,
      secondaryExpressionUrl: PORTRAIT_ASSETS.kaelen_scout,
      specimenPortraitUrl: PORTRAIT_ASSETS.specimen_fire_troll,
      simagreeClass: SIMAGREE_ANIMATION_CLASSES.PROUD_GLOW,
      specimenSimagreeClass: SIMAGREE_ANIMATION_CLASSES.PROUD_GLOW,
      themeColor: '#48c78e',
      voiceAudioKey: null,
      quote: tr(
        '"Great work, Guardian! The last carrier was neutralized before its mutation could dominate the island!"',
        "« Beau travail, Gardien ! Le dernier porteur a été neutralisé avant que sa mutation ne domine l'île ! »"
      ),
    };
  }

  return {
    alertType: 'patient_zero',
    speaker: 'Kaelen',
    speakerTitle: tr('Chief Frontier Scout', 'Cheffe des Éclaireurs Hors-Frontière'),
    emotionLabel: tr('😱 Patient Zero Alert!', '😱 Alerte Patient Zéro !'),
    portraitUrl: PORTRAIT_ASSETS.kaelen_shocked,
    secondaryExpressionUrl: PORTRAIT_ASSETS.specimen_fire_troll,
    specimenPortraitUrl: PORTRAIT_ASSETS.specimen_fire_troll,
    simagreeClass: SIMAGREE_ANIMATION_CLASSES.PANIC_PULSE,
    specimenSimagreeClass: SIMAGREE_ANIMATION_CLASSES.ROAR_TREMBLE,
    themeColor: '#ef4444',
    voiceAudioKey: 'alert_patient_zero',
    quote: tr(
      '"Scout Alert! New mutant Patient Zero spotted in the deep wilderness! Hunt it down before the next breeding cycle!"',
      '« Alerte Éclaireur ! Nouveau Patient Zéro mutant repéré dans les terres sauvages ! Traque-le avant le prochain cycle de reproduction ! »'
    ),
  };
}

logger.info(
  'PORTRAITS',
  'Nano Banana Portrait Catalog (10 portraits 256x256 PNG & 6 expression profiles) initialized.',
  {
    style: NANO_BANANA_ART_DIRECTION.styleName,
    models: NANO_BANANA_ART_DIRECTION.modelsUsed,
    assetsCount: Object.keys(PORTRAIT_ASSETS).length,
  }
);

export default CHARACTER_PORTRAITS;
