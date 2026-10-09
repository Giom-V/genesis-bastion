/**
 * @file src/audio/SoundManager.js
 * @description Hybrid Bilingual Audio Manager for **Genesis Bastion**:
 * 1. **Bilingual Tutorial & Alert Voiceovers (Gemini TTS `gemini-v4s-tts` — 🇬🇧 English Default `'en'` + 🇫🇷 Français `'fr'`)**:
 *    - 15 English voice lines in `public/assets/audio/tts/en/*.wav` and 15 French voice lines in `public/assets/audio/tts/*.wav` embodying:
 *      - **Aldric, Master Biologist & Bastion Forgemaster (`Fenrir`)**: Acts 1 to 4 + Relic Found, Island Victory & Game Over Requiem
 *      - **Kaelen, Chief of Outrider Scouts (`Kore`)**: Acts 5 to 7 + Patient Zero, Dragon Wrath, Shark Landing, Mole Eruption & Prey Crisis Alerts
 *    - Automatic music ducking (`-12 dB` / `0.22x`) while a character is speaking,
 *      instant live language switching (`setLanguage('en' | 'fr')`),
 *      volume sliders (`setMusicVolume`, `setVoiceVolume`, `setSfxVolume`, `getAudioSettings`),
 *      and `replayCurrentVoice()` for the HUD & Settings modal voice preview.
 *
 * 2. **Realtime Adaptive Music (`LyriaRealtimeClient` `models/lyria-realtime-exp` + Lyria 3 Multi-Stems + WebAudio Elemental Synth)**:
 *    - 5 Lyria 3 master stems (`public/assets/audio/music/*.mp3`):
 *      - `lyria_tutorial_dialogue.mp3` (85 BPM — Sanctuary & Tutorial Dialogue)
 *      - `lyria_sanctuary_peace.mp3` (92 BPM — Peaceful Exploration & Base Building)
 *      - `lyria_combat_pack.mp3` (128 BPM — Skirmishes against Greenskins & Wild Beasts)
 *      - `lyria_boss_mutation_wrath.mp3` (145 BPM — Mutant Patient Zero Hunt, Critical HP & Dragon Wrath)
 *      - `lyria_gameover_requiem.mp3` (64 BPM — D-Minor Game Over Requiem)
 *    - Live WebSocket connector to `models/lyria-realtime-exp` (`BidiGenerateContent`)
 *      dynamically computing `weightedPrompts` and `musicGenerationConfig` (`bpm`, `density`, `brightness`).
 *
 * 3. **Zero-Latency Procedural WebAudio Combat & World SFX**:
 *    - Multi-layered procedural synthesis for sword cleave, elemental hit impacts, dash, all 8 spells,
 *      harvesting, cage rescue, building/upgrading, scout alerts, level-up, dragon wrath, shark landing,
 *      mole eruption, prey crisis, relic pickup, weapon forge, island shield victory, and game over requiem.
 *
 * Headless Node.js compatible (`scripts/dry-run-sim.js`) with full DOM/WebAudio guards.
 */

import { logger } from '../utils/logger.js';
import { getLanguage, onLanguageChange } from '../utils/i18n.js';

/**
 * Complete bilingual catalog of all 15 voiceover lines generated via Gemini TTS (`gemini-v4s-tts`)
 * in both English (`public/assets/audio/tts/en/*.wav`, default) and French (`public/assets/audio/tts/*.wav`).
 */
export const TTS_VOICE_CATALOG = {
  act1_aldric: {
    key: 'act1_aldric',
    actNumber: 1,
    speaker: 'Aldric',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Fenrir',
    voice: 'Fenrir',
    roleEN: 'Master Biologist & Bastion Forgemaster',
    roleFR: 'Maître Biologiste & Forgeron du Bastion',
    speakerTitle: 'Master Biologist & Bastion Forgemaster',
    urlEN: 'assets/audio/tts/en/act1_aldric.wav',
    urlFR: 'assets/audio/tts/act1_aldric.wav',
    url: 'assets/audio/tts/en/act1_aldric.wav',
    textEN:
      'Welcome to the Bastion Sanctuary, Guardian. The ecosystem around us is frozen for now. Walk to the golden beacon to the South and adjust your camera.',
    textFR:
      "Bienvenue au Sanctuaire du Bastion, Gardien. L'écosystème autour de nous est figé pour l'instant. Marche jusqu'à la balise dorée au Sud et ajuste ta caméra.",
    text:
      'Welcome to the Bastion Sanctuary, Guardian. The ecosystem around us is frozen for now. Walk to the golden beacon to the South and adjust your camera.',
  },
  act2_aldric: {
    key: 'act2_aldric',
    actNumber: 2,
    speaker: 'Aldric',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Fenrir',
    voice: 'Fenrir',
    roleEN: 'Master Biologist & Bastion Forgemaster',
    roleFR: 'Maître Biologiste & Forgeron du Bastion',
    speakerTitle: 'Master Biologist & Bastion Forgemaster',
    urlEN: 'assets/audio/tts/en/act2_aldric.wav',
    urlFR: 'assets/audio/tts/act2_aldric.wav',
    url: 'assets/audio/tts/en/act2_aldric.wav',
    textEN:
      'A stray Goblin and an Orc marauder are approaching! Strike them with your runic sword, dodge with Shift, and choose your first spell at level two.',
    textFR:
      'Un Gobelin égaré puis un Orc maraudeur approchent ! Frappe-les avec ton épée runique, esquive avec Shift, et choisis ton premier sort au niveau deux.',
    text:
      'A stray Goblin and an Orc marauder are approaching! Strike them with your runic sword, dodge with Shift, and choose your first spell at level two.',
  },
  act3_aldric: {
    key: 'act3_aldric',
    actNumber: 3,
    speaker: 'Aldric',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Fenrir',
    voice: 'Fenrir',
    roleEN: 'Master Biologist & Bastion Forgemaster',
    roleFR: 'Maître Biologiste & Forgeron du Bastion',
    speakerTitle: 'Master Biologist & Bastion Forgemaster',
    urlEN: 'assets/audio/tts/en/act3_aldric.wav',
    urlFR: 'assets/audio/tts/act3_aldric.wav',
    url: 'assets/audio/tts/en/act3_aldric.wav',
    textEN:
      'Eliminate that wolf, rescue the survivor locked in the cage to the Southeast with the E key, then harvest wood or crystal for our camp.',
    textFR:
      'Élimine ce loup, libère le survivant enfermé dans la cage au Sud-Est avec la touche E, puis récolte du bois ou du cristal pour notre camp.',
    text:
      'Eliminate that wolf, rescue the survivor locked in the cage to the Southeast with the E key, then harvest wood or crystal for our camp.',
  },
  act4_aldric: {
    key: 'act4_aldric',
    actNumber: 4,
    speaker: 'Aldric',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Fenrir',
    voice: 'Fenrir',
    roleEN: 'Master Biologist & Bastion Forgemaster',
    roleFR: 'Maître Biologiste & Forgeron du Bastion',
    speakerTitle: 'Master Biologist & Bastion Forgemaster',
    urlEN: 'assets/audio/tts/en/act4_aldric.wav',
    urlFR: 'assets/audio/tts/act4_aldric.wav',
    url: 'assets/audio/tts/en/act4_aldric.wav',
    textEN:
      'Use our resources to build a Watchtower on the golden pad, then repel the goblin raiders charging our ramparts!',
    textFR:
      'Utilise nos ressources pour bâtir une Tour de Guet sur le socle doré, puis repousse les pillards gobelins qui fondent sur nos remparts !',
    text:
      'Use our resources to build a Watchtower on the golden pad, then repel the goblin raiders charging our ramparts!',
  },
  act5_kaelen: {
    key: 'act5_kaelen',
    actNumber: 5,
    speaker: 'Kaelen',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    voice: 'Kore',
    roleEN: 'Chief of Outrider Scouts',
    roleFR: 'Cheffe des Éclaireurs Hors-Frontière',
    speakerTitle: 'Chief of Outrider Scouts',
    urlEN: 'assets/audio/tts/en/act5_kaelen.wav',
    urlFR: 'assets/audio/tts/act5_kaelen.wav',
    url: 'assets/audio/tts/en/act5_kaelen.wav',
    textEN:
      'Thank you for freeing me! Assign a survivor to the Scout role in the left panel: we will patrol beyond the frontier to track down mutations.',
    textFR:
      "Merci de m'avoir libérée ! Affecte un survivant au rôle d'Éclaireur dans le panneau gauche : nous irons patrouiller au-delà de la frontière pour traquer les mutations.",
    text:
      'Thank you for freeing me! Assign a survivor to the Scout role in the left panel: we will patrol beyond the frontier to track down mutations.',
  },
  act6_kaelen: {
    key: 'act6_kaelen',
    actNumber: 6,
    speaker: 'Kaelen',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    voice: 'Kore',
    roleEN: 'Chief of Outrider Scouts',
    roleFR: 'Cheffe des Éclaireurs Hors-Frontière',
    speakerTitle: 'Chief of Outrider Scouts',
    urlEN: 'assets/audio/tts/en/act6_kaelen.wav',
    urlFR: 'assets/audio/tts/act6_kaelen.wav',
    url: 'assets/audio/tts/en/act6_kaelen.wav',
    textEN:
      'Priority alert! I have spotted a Baby Fire Troll to the Northeast! It is a Patient Zero: eliminate it quickly before it matures and reproduces!',
    textFR:
      "Alerte prioritaire ! J'ai repéré un Bébé Troll de Feu au Nord-Est ! C'est un Patient Zéro : élimine-le vite avant qu'il ne devienne adulte et ne se reproduise !",
    text:
      'Priority alert! I have spotted a Baby Fire Troll to the Northeast! It is a Patient Zero: eliminate it quickly before it matures and reproduces!',
  },
  act7_kaelen: {
    key: 'act7_kaelen',
    actNumber: 7,
    speaker: 'Kaelen',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    voice: 'Kore',
    roleEN: 'Chief of Outrider Scouts',
    roleFR: 'Cheffe des Éclaireurs Hors-Frontière',
    speakerTitle: 'Chief of Outrider Scouts',
    urlEN: 'assets/audio/tts/en/act7_kaelen.wav',
    urlFR: 'assets/audio/tts/act7_kaelen.wav',
    url: 'assets/audio/tts/en/act7_kaelen.wav',
    textEN:
      'Well done! The Darwinian ecosystem now awakens across the entire island. But beware the caldera Dragons: as long as we do not attack them, they leave us in peace!',
    textFR:
      "Bien joué ! L'écosystème darwinien s'éveille maintenant sur toute l'île. Mais attention aux Dragons de la caldeira : tant qu'on ne les attaque pas, ils nous laissent en paix !",
    text:
      'Well done! The Darwinian ecosystem now awakens across the entire island. But beware the caldera Dragons: as long as we do not attack them, they leave us in peace!',
  },
  alert_patient_zero: {
    key: 'alert_patient_zero',
    actNumber: null,
    speaker: 'Kaelen',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    voice: 'Kore',
    roleEN: 'Chief of Outrider Scouts',
    roleFR: 'Cheffe des Éclaireurs Hors-Frontière',
    speakerTitle: 'Chief of Outrider Scouts',
    urlEN: 'assets/audio/tts/en/alert_patient_zero.wav',
    urlFR: 'assets/audio/tts/alert_patient_zero.wav',
    url: 'assets/audio/tts/en/alert_patient_zero.wav',
    textEN:
      'Scout Alert! A new mutant Patient Zero has been spotted in the wilds! Hunt it down before the next breeding cycle!',
    textFR:
      'Alerte Éclaireur ! Nouveau Patient Zéro mutant repéré dans les terres sauvages ! Traque-le avant le prochain cycle de reproduction !',
    text:
      'Scout Alert! A new mutant Patient Zero has been spotted in the wilds! Hunt it down before the next breeding cycle!',
  },
  alert_dragon_wrath: {
    key: 'alert_dragon_wrath',
    actNumber: null,
    speaker: 'Kaelen',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    voice: 'Kore',
    roleEN: 'Chief of Outrider Scouts',
    roleFR: 'Cheffe des Éclaireurs Hors-Frontière',
    speakerTitle: 'Chief of Outrider Scouts',
    urlEN: 'assets/audio/tts/en/alert_dragon_wrath.wav',
    urlFR: 'assets/audio/tts/alert_dragon_wrath.wav',
    url: 'assets/audio/tts/en/alert_dragon_wrath.wav',
    textEN:
      'Disaster! You have provoked a Sovereign Dragon! The entire species has entered a frenzy and is descending upon our Bastion!',
    textFR:
      "Malheur ! Tu as provoqué un Dragon Souverain ! Toute l'espèce entre en fureur et fond sur notre Bastion !",
    text:
      'Disaster! You have provoked a Sovereign Dragon! The entire species has entered a frenzy and is descending upon our Bastion!',
  },
  alert_shark_landing: {
    key: 'alert_shark_landing',
    actNumber: null,
    speaker: 'Kaelen',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    voice: 'Kore',
    roleEN: 'Chief of Outrider Scouts',
    roleFR: 'Cheffe des Éclaireurs Hors-Frontière',
    speakerTitle: 'Chief of Outrider Scouts',
    urlEN: 'assets/audio/tts/en/alert_shark_landing.wav',
    urlFR: 'assets/audio/tts/alert_shark_landing.wav',
    url: 'assets/audio/tts/en/alert_shark_landing.wav',
    textEN:
      'Coastal alert! Abyssal Sharks have evolved amphibious legs and are storming onto our beaches!',
    textFR:
      'Alerte côtière ! Les Requins des Abysses ont développé des pattes amphibies et débarquent sur nos plages !',
    text:
      'Coastal alert! Abyssal Sharks have evolved amphibious legs and are storming onto our beaches!',
  },
  alert_mole_eruption: {
    key: 'alert_mole_eruption',
    actNumber: null,
    speaker: 'Kaelen',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    voice: 'Kore',
    roleEN: 'Chief of Outrider Scouts',
    roleFR: 'Cheffe des Éclaireurs Hors-Frontière',
    speakerTitle: 'Chief of Outrider Scouts',
    urlEN: 'assets/audio/tts/en/alert_mole_eruption.wav',
    urlFR: 'assets/audio/tts/alert_mole_eruption.wav',
    url: 'assets/audio/tts/en/alert_mole_eruption.wav',
    textEN:
      'Watch the ground beneath your feet! Burrowing Giant Moles are erupting from underground tunnels!',
    textFR:
      'Attention sous vos pieds ! Des Taupes Géantes Fouisseuses surgissent des galeries souterraines !',
    text:
      'Watch the ground beneath your feet! Burrowing Giant Moles are erupting from underground tunnels!',
  },
  alert_prey_crisis: {
    key: 'alert_prey_crisis',
    actNumber: null,
    speaker: 'Kaelen',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    voice: 'Kore',
    roleEN: 'Chief of Outrider Scouts',
    roleFR: 'Cheffe des Éclaireurs Hors-Frontière',
    speakerTitle: 'Chief of Outrider Scouts',
    urlEN: 'assets/audio/tts/en/alert_prey_crisis.wav',
    urlFR: 'assets/audio/tts/alert_prey_crisis.wav',
    url: 'assets/audio/tts/en/alert_prey_crisis.wav',
    textEN:
      'Ecological alert! Our spells have decimated the herbivore prey! Without deer or rabbits, famine looms and the predators are going berserk!',
    textFR:
      'Alerte écologique ! Nos sorts ont décimé le gibier herbivore ! Sans biches ni lapins, la famine menace et les prédateurs deviennent fous !',
    text:
      'Ecological alert! Our spells have decimated the herbivore prey! Without deer or rabbits, famine looms and the predators are going berserk!',
  },
  alert_relic_found: {
    key: 'alert_relic_found',
    actNumber: null,
    speaker: 'Aldric',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Fenrir',
    voice: 'Fenrir',
    roleEN: 'Master Biologist & Bastion Forgemaster',
    roleFR: 'Maître Biologiste & Forgeron du Bastion',
    speakerTitle: 'Master Biologist & Bastion Forgemaster',
    urlEN: 'assets/audio/tts/en/alert_relic_found.wav',
    urlFR: 'assets/audio/tts/alert_relic_found.wav',
    url: 'assets/audio/tts/en/alert_relic_found.wav',
    textEN:
      'Eden Relic Fragment recovered! Gather all three ancient fragments to raise the Solar Shield Dome across the entire island!',
    textFR:
      "Fragment de Relique d'Éden récupéré ! Rassemble les trois fragments anciens pour ériger le Dôme-Bouclier Solaire sur toute l'île !",
    text:
      'Eden Relic Fragment recovered! Gather all three ancient fragments to raise the Solar Shield Dome across the entire island!',
  },
  alert_island_victory: {
    key: 'alert_island_victory',
    actNumber: null,
    speaker: 'Aldric',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Fenrir',
    voice: 'Fenrir',
    roleEN: 'Master Biologist & Bastion Forgemaster',
    roleFR: 'Maître Biologiste & Forgeron du Bastion',
    speakerTitle: 'Master Biologist & Bastion Forgemaster',
    urlEN: 'assets/audio/tts/en/alert_island_victory.wav',
    urlFR: 'assets/audio/tts/alert_island_victory.wav',
    url: 'assets/audio/tts/en/alert_island_victory.wav',
    textEN:
      'Victory! The Shield of Eden shines across the entire island and purifies the ecosystem! Our Bastion is unbreakable: prepare to set sail for the next island!',
    textFR:
      "Victoire ! Le Bouclier d'Éden rayonne sur toute l'île et purifie l'écosystème ! Notre Bastion est inviolable : prépare-toi à voguer vers la prochaine île !",
    text:
      'Victory! The Shield of Eden shines across the entire island and purifies the ecosystem! Our Bastion is unbreakable: prepare to set sail for the next island!',
  },
  alert_gameover_requiem: {
    key: 'alert_gameover_requiem',
    actNumber: null,
    speaker: 'Aldric',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Fenrir',
    voice: 'Fenrir',
    roleEN: 'Master Biologist & Bastion Forgemaster',
    roleFR: 'Maître Biologiste & Forgeron du Bastion',
    speakerTitle: 'Master Biologist & Bastion Forgemaster',
    urlEN: 'assets/audio/tts/en/alert_gameover_requiem.wav',
    urlFR: 'assets/audio/tts/alert_gameover_requiem.wav',
    url: 'assets/audio/tts/en/alert_gameover_requiem.wav',
    textEN:
      "The Guardian has fallen, and shadows close in upon the Bastion. In this unforgiving world, every death seals the fate of an expedition. Will you start anew for a fresh lineage, or invoke the Sanctuary's Grace to carry on?",
    textFR:
      "Le Gardien est tombé et les ombres se referment sur le Bastion. Dans ce monde impitoyable, toute mort scelle le destin d'une expédition. Veux-tu repartir à zéro pour une nouvelle lignée, ou invoquer la Grâce du Sanctuaire pour continuer ?",
    text:
      "The Guardian has fallen, and shadows close in upon the Bastion. In this unforgiving world, every death seals the fate of an expedition. Will you start anew for a fresh lineage, or invoke the Sanctuary's Grace to carry on?",
  },
};

/**
 * Catalog of the 5 adaptive music stems generated via Lyria 3 (`lyria-3-mp3`).
 */
export const LYRIA_MUSIC_STEMS = {
  tutorial: {
    id: 'tutorial',
    title: 'Sanctuary Parchment (Tutorial & Dialogue)',
    titleEN: 'Sanctuary Parchment (Tutorial & Dialogue)',
    titleFR: 'Parchemin du Sanctuaire (Tutoriel & Dialogue)',
    url: 'assets/audio/music/lyria_tutorial_dialogue.mp3',
    bpm: 85,
    baseVolume: 0.42,
    prompt:
      'Mystical, warm acoustic fantasy chamber music with gentle harp, celesta, soft woodwinds, and parchment expedition atmosphere, calm and curious, 85 bpm',
  },
  peace: {
    id: 'peace',
    title: 'Bastion Watch (Exploration & Camp)',
    titleEN: 'Bastion Watch (Exploration & Camp)',
    titleFR: 'Veillée du Bastion (Exploration & Camp)',
    url: 'assets/audio/music/lyria_sanctuary_peace.mp3',
    bpm: 92,
    baseVolume: 0.44,
    prompt:
      'Peaceful atmospheric fantasy bastion music, warm acoustic guitar, soft cello, ambient forest breeze and gentle runic chimes, 92 bpm',
  },
  combat: {
    id: 'combat',
    title: 'Wild Skirmish (Pack Combat)',
    titleEN: 'Wild Skirmish (Pack Combat)',
    titleFR: 'Escarmouche Sauvage (Combat de Meute)',
    url: 'assets/audio/music/lyria_combat_pack.mp3',
    bpm: 128,
    baseVolume: 0.50,
    prompt:
      'Driving dark-fantasy action roguelike combat music, tribal war drums, tense staccato strings, dynamic brass, 128 bpm',
  },
  boss: {
    id: 'boss',
    title: 'Patient Zero & Dragon Wrath (Critical Urgency)',
    titleEN: 'Patient Zero & Dragon Wrath (Critical Urgency)',
    titleFR: 'Patient Zéro & Courroux Draconique (Urgence Vitale)',
    url: 'assets/audio/music/lyria_boss_mutation_wrath.mp3',
    bpm: 145,
    baseVolume: 0.56,
    prompt:
      'Epic apocalyptic boss battle music, blazing brass, intense fast percussion, dark choir and volcanic fire energy, 145 bpm',
  },
  gameover: {
    id: 'gameover',
    title: 'Requiem of Ashes (Game Over — 64 BPM)',
    titleEN: 'Requiem of Ashes (Game Over — 64 BPM)',
    titleFR: 'Requiem des Cendres (Game Over — 64 BPM)',
    url: 'assets/audio/music/lyria_gameover_requiem.mp3',
    bpm: 64,
    baseVolume: 0.62,
    prompt:
      'Tragic, deeply sad melancholic dark-fantasy game over requiem in D minor, weeping solo cello, slow sorrowful piano chords, solo viola, ethereal mournful choir and distant rain, emotional farewell, 64 bpm',
  },
};

/**
 * Table de correspondance entre les identifiants de sorts / mutations et les signatures élémentaires.
 */
const ELEMENT_SIGNATURES = {
  fire: {
    id: 'fire',
    labelFR: '🔥 Feu Pyroclastique',
    promptFragment: 'blazing volcanic brass, crackling ember percussion, fiery aggressive synth',
    freqHz: 220,
  },
  ice: {
    id: 'ice',
    labelFR: '❄️ Givre Cryogénique',
    promptFragment: 'crystalline glass chimes, shimmering icy high strings, frost bell arpeggios',
    freqHz: 880,
  },
  venom: {
    id: 'venom',
    labelFR: '🧪 Venin Neurotoxique',
    promptFragment: 'acidic resonant bassline, sinuous exotic woodwinds, toxic bubbling synth texture',
    freqHz: 311.13,
  },
  lightning: {
    id: 'lightning',
    labelFR: '⚡ Foudre Arcanique',
    promptFragment: 'high-voltage staccato synth pulses, electric harp arpeggios, storm brass',
    freqHz: 659.25,
  },
  arcane: {
    id: 'arcane',
    labelFR: '🔮 Éther Runique',
    promptFragment: 'mystical runic choir pad, ethereal celesta harmonics, arcane resonance',
    freqHz: 440,
  },
  earth: {
    id: 'earth',
    labelFR: '🪨 Titan Tellurique',
    promptFragment: 'colossal tectonic low brass, deep war-drum anvil hits, heavy sub-bass',
    freqHz: 110,
  },
};

/**
 * Connecteur WebSocket temps réel pour **Lyria Realtime (`models/lyria-realtime-exp`)**.
 * Pilote le flux musical bidirectionnel `BidiGenerateContent` lorsque la clé d'API Gemini est disponible,
 * et trace systématiquement tous les prompts pondérés (`weightedPrompts`) et paramètres envoyés au modèle.
 */
export class LyriaRealtimeClient {
  /**
   * @param {Object} [options={}]
   * @param {AudioContext|null} [options.audioContext=null]
   */
  constructor(options = {}) {
    /** @type {string} */
    this.model = 'models/lyria-realtime-exp';
    /** @type {AudioContext|null} */
    this.audioContext = options.audioContext || null;
    /** @type {WebSocket|null} */
    this.ws = null;
    /** @type {boolean} */
    this.connected = false;
    /** @type {boolean} */
    this.connecting = false;
    /** @type {Array<{text: string, weight: number}>} */
    this.lastWeightedPrompts = [];
    /** @type {Object} */
    this.lastConfig = {
      bpm: 85,
      density: 0.45,
      brightness: 0.55,
      guidance: 4.0,
      temperature: 1.0,
    };
    /** @type {string} */
    this.lastSignature = '';
    /** @type {number} */
    this.nextPlayTime = 0;
  }

  /**
   * Récupère une clé d'API Gemini éventuelle depuis l'environnement navigateur.
   * @returns {string|null}
   */
  getApiKey() {
    if (typeof window === 'undefined') return null;
    try {
      return (
        window.GEMINI_API_KEY ||
        (window.localStorage && window.localStorage.getItem('GEMINI_API_KEY')) ||
        (typeof import.meta !== 'undefined' &&
          import.meta.env &&
          import.meta.env.VITE_GEMINI_API_KEY) ||
        null
      );
    } catch (_err) {
      return null;
    }
  }

  /**
   * Ouvre la session WebSocket `BidiGenerateContent` vers `models/lyria-realtime-exp` si une clé est configurée.
   * @param {AudioContext} [audioCtx]
   * @returns {boolean} True si une connexion est active ou en cours.
   */
  connectIfConfigured(audioCtx) {
    if (audioCtx) this.audioContext = audioCtx;
    if (this.connected || this.connecting) return true;
    const apiKey = this.getApiKey();
    if (!apiKey || typeof WebSocket === 'undefined') {
      return false;
    }

    this.connecting = true;
    const endpoint = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    logger.info('AUDIO', '[LLM Lyria Realtime] Ouverture de session WebSocket BidiGenerateContent', {
      model: this.model,
      endpoint: 'wss://generativelanguage.googleapis.com/.../BidiGenerateContent',
    });

    try {
      this.ws = new WebSocket(endpoint);
      this.ws.onopen = () => {
        this.connecting = false;
        this.connected = true;
        this._sendPayload({
          setup: {
            model: this.model,
          },
        });
        if (this.lastWeightedPrompts.length > 0) {
          this.sendWeightedPrompts(this.lastWeightedPrompts, this.lastConfig, true);
        }
        this._sendPayload({
          playbackControl: 'PLAY',
        });
      };

      this.ws.onmessage = (event) => {
        this._handleServerMessage(event.data);
      };

      this.ws.onerror = () => {
        this.connecting = false;
        this.connected = false;
      };

      this.ws.onclose = () => {
        this.connecting = false;
        this.connected = false;
      };
      return true;
    } catch (err) {
      this.connecting = false;
      this.connected = false;
      logger.warn('AUDIO', 'Connexion WebSocket Lyria Realtime indisponible (bascule Multi-Stems Lyria 3)', {
        error: String(err),
      });
      return false;
    }
  }

  /**
   * Envoie une mise à jour de prompts pondérés (`weightedPrompts`) et de configuration musicale (`musicGenerationConfig`)
   * à Lyria Realtime, avec traçabilité LLM stricte dans `logger`.
   *
   * @param {Array<{text: string, weight: number}>} weightedPrompts - Liste de prompts pondérés.
   * @param {Object} [config={}] - Paramètres `bpm`, `density`, `brightness`, `guidance`.
   * @param {boolean} [force=false] - Force l'envoi même si la signature n'a pas changé.
   */
  sendWeightedPrompts(weightedPrompts, config = {}, force = false) {
    const normalizedPrompts = (weightedPrompts || [])
      .filter((p) => p && p.text && p.weight > 0.01)
      .map((p) => ({
        text: String(p.text),
        weight: Number(p.weight.toFixed(2)),
      }));

    const mergedConfig = {
      bpm: Math.round(config.bpm || 92),
      density: Number((config.density ?? 0.5).toFixed(2)),
      brightness: Number((config.brightness ?? 0.55).toFixed(2)),
      guidance: Number((config.guidance ?? 4.0).toFixed(1)),
      temperature: 1.0,
    };

    const sig = JSON.stringify({ p: normalizedPrompts, c: mergedConfig });
    if (!force && sig === this.lastSignature) {
      return;
    }

    this.lastSignature = sig;
    this.lastWeightedPrompts = normalizedPrompts;
    this.lastConfig = mergedConfig;

    // Traçabilité stricte des appels LLM / Modèles Génératifs (Règle Giom)
    logger.info(
      'AUDIO',
      `[LLM Lyria Realtime] Mise à jour des prompts pondérés (${mergedConfig.bpm} BPM, ${normalizedPrompts.length} couches)`,
      {
        model: this.model,
        weightedPrompts: normalizedPrompts,
        musicGenerationConfig: mergedConfig,
        wsConnected: this.connected,
      }
    );

    if (this.connected && this.ws && this.ws.readyState === 1) {
      this._sendPayload({
        clientContent: {
          weightedPrompts: normalizedPrompts,
        },
        musicGenerationConfig: mergedConfig,
      });
    }
  }

  /**
   * @private
   */
  _sendPayload(payload) {
    try {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify(payload));
      }
    } catch (_err) {
      // Ignore transient WebSocket errors
    }
  }

  /**
   * Décode les chunks PCM 48kHz 16-bit stéréo renvoyés par `models/lyria-realtime-exp`.
   * @param {string|Blob} rawData
   * @private
   */
  _handleServerMessage(rawData) {
    if (!this.audioContext || typeof rawData !== 'string') return;
    try {
      const msg = JSON.parse(rawData);
      const chunks = msg?.serverContent?.audioChunks;
      if (!Array.isArray(chunks) || chunks.length === 0) return;

      for (const chunk of chunks) {
        if (!chunk?.data) continue;
        const binaryStr = atob(chunk.data);
        const byteLen = binaryStr.length;
        const int16Count = Math.floor(byteLen / 2);
        const frameCount = Math.floor(int16Count / 2);
        if (frameCount <= 0) continue;

        const audioBuffer = this.audioContext.createBuffer(2, frameCount, 48000);
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);

        let byteIdx = 0;
        for (let i = 0; i < frameCount; i++) {
          const lLo = binaryStr.charCodeAt(byteIdx++);
          const lHi = binaryStr.charCodeAt(byteIdx++);
          let lSample = (lHi << 8) | lLo;
          if (lSample >= 0x8000) lSample -= 0x10000;
          left[i] = lSample / 32768.0;

          const rLo = binaryStr.charCodeAt(byteIdx++);
          const rHi = binaryStr.charCodeAt(byteIdx++);
          let rSample = (rHi << 8) | rLo;
          if (rSample >= 0x8000) rSample -= 0x10000;
          right[i] = rSample / 32768.0;
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        const now = this.audioContext.currentTime;
        if (this.nextPlayTime < now) {
          this.nextPlayTime = now + 0.04;
        }
        source.start(this.nextPlayTime);
        this.nextPlayTime += audioBuffer.duration;
      }
    } catch (_err) {
      // Safe fallback
    }
  }
}

/**
 * Main manager for sound, bilingual Gemini TTS voiceovers (EN default, FR 2nd),
 * Lyria adaptive music, and procedural WebAudio SFX.
 */
export class SoundManager {
  /**
   * @param {Object} [options={}]
   * @param {boolean} [options.muted=false] - Starts muted if true.
   * @param {'en'|'fr'} [options.language] - Initial language ('en' default, 'fr' 2nd).
   * @param {number} [options.musicVolume=1.0] - Music volume multiplier [0..1].
   * @param {number} [options.voiceVolume=1.0] - Voiceover volume multiplier [0..1].
   * @param {number} [options.sfxVolume=1.0] - Combat & world SFX volume multiplier [0..1].
   */
  constructor(options = {}) {
    /** @type {boolean} */
    this.isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    /** @type {boolean} */
    this.muted = Boolean(options.muted);
    /** @type {'en'|'fr'} */
    this.language =
      options.language === 'fr' || (!options.language && getLanguage() === 'fr') ? 'fr' : 'en';

    /** @type {number} Music volume multiplier (0..1) */
    this.musicVolume =
      typeof options.musicVolume === 'number'
        ? Math.max(0, Math.min(1, options.musicVolume))
        : 1.0;
    /** @type {number} Voiceover volume multiplier (0..1) */
    this.voiceVolume =
      typeof options.voiceVolume === 'number'
        ? Math.max(0, Math.min(1, options.voiceVolume))
        : 1.0;
    /** @type {number} Combat & World SFX volume multiplier (0..1) */
    this.sfxVolume =
      typeof options.sfxVolume === 'number'
        ? Math.max(0, Math.min(1, options.sfxVolume))
        : 1.0;

    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {GainNode|null} */
    this.masterGain = null;
    /** @type {GainNode|null} */
    this.sfxGain = null;
    /** @type {GainNode|null} */
    this.elementalLayerGain = null;

    /** @type {boolean} */
    this.audioUnlocked = false;

    // --- Gemini TTS Voice State (Bilingual EN / FR) ---
    /** @type {HTMLAudioElement|null} */
    this.activeVoiceAudio = null;
    /** @type {boolean} */
    this.isVoiceSpeaking = false;
    /** @type {string|null} */
    this.currentVoiceKey = 'act1_aldric';
    /** @type {string|null} */
    this.lastPlayedVoiceKey = 'act1_aldric';
    /** @type {string|null} */
    this.pendingAutoplayVoiceKey = null;
    /** @type {Set<Function>} */
    this.voiceListeners = new Set();

    // --- Adaptive Music State (Lyria 3 + Lyria Realtime) ---
    /** @type {LyriaRealtimeClient} */
    this.lyriaRealtime = new LyriaRealtimeClient();
    /** @type {Object<string, HTMLAudioElement>} */
    this.stemElements = {};
    /** @type {Object<string, number>} */
    this.stemVolumes = {
      tutorial: 0,
      peace: 0,
      combat: 0,
      boss: 0,
      gameover: 0,
    };
    /** @type {string} */
    this.activeStemId = 'tutorial';
    /** @type {number} */
    this.musicDuckMultiplier = 1.0;

    // --- Realtime Adaptive Telemetry ---
    /** @type {Object} */
    this.adaptiveState = {
      stemId: 'tutorial',
      modeLabelFR:
        this.language === 'fr'
          ? '📜 Sanctuaire & Dialogue (85 BPM)'
          : '📜 Sanctuary & Dialogue (85 BPM)',
      shortStatusFR:
        this.language === 'fr'
          ? '🔊 Lyria : 📜 Dialogue & Sanctuaire'
          : '🔊 Lyria: 📜 Sanctuary & Dialogue',
      bpm: 85,
      hpRatio: 1.0,
      isLowHp: false,
      isCriticalHp: false,
      isGameOver: false,
      inCombat: false,
      nearbyEnemyCount: 0,
      dominantClade: null,
      dominantSpecies: null,
      hasMutantNearby: false,
      dragonWrathActive: false,
      activeElements: [],
      isTutorialDialogue: true,
    };

    /**
     * Recently cast player elemental spells: `{ element: expiresAtMs }`
     * @type {Map<string, number>}
     * @private
     */
    this._recentPlayerElements = new Map();

    /** @type {number} */
    this._lastStateEvalMs = 0;
    /** @type {number} */
    this._lastHeartbeatMs = 0;
    /** @type {number} */
    this._lastElementalPulseMs = 0;
    /** @type {number} */
    this._lastHitSfxMs = 0;

    // Keep SoundManager language synchronized with global i18n changes
    this._unsubscribeI18n = onLanguageChange((newLang) => {
      if (newLang && newLang !== this.language) {
        this.setLanguage(newLang);
      }
    });

    if (this.isBrowser) {
      this._initAudioStems();
      this._bindUserGestureUnlock();
    }

    logger.info(
      'AUDIO',
      'SoundManager initialized (Bilingual Gemini TTS EN/FR + Lyria Adaptive 5 stems + WebAudio SFX)',
      {
        defaultLanguage: this.language,
        ttsTracks: Object.keys(TTS_VOICE_CATALOG).length,
        lyriaStems: Object.keys(LYRIA_MUSIC_STEMS),
        lyriaRealtimeModel: this.lyriaRealtime.model,
      }
    );
  }

  /**
   * Preloads the 5 Lyria 3 MP3 tracks (`public/assets/audio/music/*.mp3`).
   * @private
   */
  _initAudioStems() {
    if (!this.isBrowser || typeof Audio === 'undefined') return;

    for (const [stemId, meta] of Object.entries(LYRIA_MUSIC_STEMS)) {
      try {
        const audio = new Audio(meta.url);
        audio.loop = true;
        audio.preload = 'auto';
        audio.volume = 0;
        this.stemElements[stemId] = audio;
      } catch (_err) {
        // Ignore in restricted environments
      }
    }
  }

  /**
   * Initializes or resumes the WebAudio `AudioContext`.
   * @returns {AudioContext|null}
   * @private
   */
  _ensureAudioContext() {
    if (!this.isBrowser) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : 0.85;
        this.masterGain.connect(this.ctx.destination);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.9 * this.sfxVolume;
        this.sfxGain.connect(this.masterGain);

        this.elementalLayerGain = this.ctx.createGain();
        this.elementalLayerGain.gain.value = 0.16 * this.musicVolume;
        this.elementalLayerGain.connect(this.masterGain);
      } catch (_err) {
        return null;
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    this.lyriaRealtime.connectIfConfigured(this.ctx);
    return this.ctx;
  }

  /**
   * Automatically unlocks the WebAudio context and plays any pending voice/music
   * on the player's first pointer click or key press.
   * @private
   */
  _bindUserGestureUnlock() {
    if (!this.isBrowser) return;

    const unlockHandler = () => {
      this.audioUnlocked = true;
      this._ensureAudioContext();
      this._ensureActiveStemPlaying();

      if (this.pendingAutoplayVoiceKey && !this.isVoiceSpeaking && !this.muted) {
        const keyToPlay = this.pendingAutoplayVoiceKey;
        this.pendingAutoplayVoiceKey = null;
        this.playTutorialVoice(keyToPlay);
      }
    };

    window.addEventListener('pointerdown', unlockHandler, { passive: true });
    window.addEventListener('keydown', unlockHandler, { passive: true });
  }

  /**
   * Starts HTMLAudio playback of the active Lyria stem if paused.
   * @private
   */
  _ensureActiveStemPlaying() {
    if (!this.isBrowser || this.muted) return;
    const activeAudio = this.stemElements[this.activeStemId];
    if (activeAudio && activeAudio.paused) {
      activeAudio.play().catch(() => {});
    }
  }

  // ============================================================================
  // 1. BILINGUAL GEMINI TTS VOICEOVERS (ENGLISH DEFAULT 'en' & FRENCH 'fr')
  // ============================================================================

  /**
   * Returns a localized voice catalog entry (`{ speaker, voice, url, text, role, ... }`)
   * for the given catalog key and language (`'en'` default or `'fr'`).
   *
   * @param {string} key - Catalog key (e.g. `'act1_aldric'`, `'alert_patient_zero'`).
   * @param {'en'|'fr'} [lang=this.language] - Language code (`'en'` or `'fr'`).
   * @returns {Object|null}
   */
  getVoiceEntry(key, lang = this.language) {
    if (!key || !TTS_VOICE_CATALOG[key]) return null;
    const rawEntry = TTS_VOICE_CATALOG[key];
    const activeLang = String(lang || this.language || 'en').toLowerCase().startsWith('fr')
      ? 'fr'
      : 'en';
    const isFR = activeLang === 'fr';
    const url = isFR ? rawEntry.urlFR : rawEntry.urlEN;
    const text = isFR ? rawEntry.textFR : rawEntry.textEN;
    const role = isFR ? rawEntry.roleFR : rawEntry.roleEN;

    return {
      ...rawEntry,
      language: activeLang,
      voice: rawEntry.voiceName,
      url,
      text,
      role,
      speakerTitle: role,
    };
  }

  /**
   * Resolves an act number (`1..7`) or a voice key (`'act1_aldric'`, `'alert_patient_zero'`, `'gameover'`, etc.)
   * to the localized entry from `TTS_VOICE_CATALOG` for the active language (`this.language`).
   *
   * @param {number|string} actNumberOrKey
   * @param {'en'|'fr'} [lang=this.language]
   * @returns {Object|null}
   */
  resolveVoiceEntry(actNumberOrKey, lang = this.language) {
    if (actNumberOrKey === null || actNumberOrKey === undefined) return null;
    if (typeof actNumberOrKey === 'number' || /^[1-7]$/.test(String(actNumberOrKey).trim())) {
      const actNum = Number(actNumberOrKey);
      const keyByAct = {
        1: 'act1_aldric',
        2: 'act2_aldric',
        3: 'act3_aldric',
        4: 'act4_aldric',
        5: 'act5_kaelen',
        6: 'act6_kaelen',
        7: 'act7_kaelen',
      };
      const mappedKey = keyByAct[actNum];
      return mappedKey ? this.getVoiceEntry(mappedKey, lang) : null;
    }

    const raw = String(actNumberOrKey).trim().toLowerCase();
    if (TTS_VOICE_CATALOG[raw]) return this.getVoiceEntry(raw, lang);
    if (TTS_VOICE_CATALOG[`alert_${raw}`]) return this.getVoiceEntry(`alert_${raw}`, lang);
    if (raw === 'gameover' || raw === 'game_over' || raw === 'gameover_requiem') {
      return this.getVoiceEntry('alert_gameover_requiem', lang);
    }

    const shortActMatch = raw.match(/^act([1-7])$/);
    if (shortActMatch) {
      return this.resolveVoiceEntry(Number(shortActMatch[1]), lang);
    }
    return null;
  }

  /**
   * Sets the active language (`'en'` default or `'fr'`) for Gemini TTS voiceovers and HUD audio telemetry.
   * If a voiceover is currently speaking when the user switches language, it immediately switches
   * to the newly selected language's `.wav` voiceover!
   *
   * @param {'en'|'fr'} lang - `'en'` (English) or `'fr'` (Français).
   * @param {boolean} [replayIfSpeaking=true] - Replay active voice immediately in the new language if currently speaking.
   * @returns {'en'|'fr'}
   */
  setLanguage(lang, replayIfSpeaking = true) {
    const normalized = String(lang || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
    const prevLang = this.language;
    this.language = normalized;

    logger.info(
      'AUDIO',
      `[LLM Gemini TTS] Language switched: "${prevLang}" -> "${normalized}" (${
        normalized === 'en' ? '🇬🇧 English' : '🇫🇷 Français'
      })`,
      {
        previousLanguage: prevLang,
        language: normalized,
        currentVoiceKey: this.currentVoiceKey,
        isVoiceSpeaking: this.isVoiceSpeaking,
      }
    );

    // Refresh localized status strings in adaptiveState
    this._refreshLocalizedAdaptiveLabels();

    if (replayIfSpeaking && this.isVoiceSpeaking) {
      const keyToSwitch = this.currentVoiceKey || this.lastPlayedVoiceKey || 'act1_aldric';
      this.playTutorialVoice(keyToSwitch, true);
    }

    return this.language;
  }

  /**
   * Returns the currently active voiceover language (`'en'` or `'fr'`).
   * @returns {'en'|'fr'}
   */
  getLanguage() {
    return this.language;
  }

  /**
   * Subscribes a callback to TTS speaking state changes (`(isSpeaking, voiceMeta) => void`).
   *
   * @param {Function} callback
   * @returns {Function} Unsubscribe function.
   */
  onVoiceStateChange(callback) {
    if (typeof callback === 'function') {
      this.voiceListeners.add(callback);
    }
    return () => this.voiceListeners.delete(callback);
  }

  /**
   * Notifies UI listeners and dispatches a `genesis:voice-state` DOM CustomEvent.
   * @param {boolean} speaking
   * @param {Object|null} voiceMeta
   * @private
   */
  _notifyVoiceState(speaking, voiceMeta) {
    this.isVoiceSpeaking = speaking;
    this.musicDuckMultiplier = speaking ? 0.22 : 1.0; // -12dB ducking during dialogue

    for (const cb of this.voiceListeners) {
      try {
        cb(speaking, voiceMeta);
      } catch (_err) {
        // Ignore listener error
      }
    }

    if (this.isBrowser && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('genesis:voice-state', {
          detail: { speaking, voiceMeta },
        })
      );
    }
  }

  /**
   * Plays the localized Gemini TTS voiceover (`urlEN` + `textEN` when `this.language === 'en'`,
   * `urlFR` + `textFR` when `this.language === 'fr'`) for the given Tutorial Act (`1..7`) or Alert key,
   * with automatic `-12 dB` ducking of the Lyria background music while speaking.
   *
   * Supports both `(actOrKey, forceReplayBoolean)` and `(actOrKey, onStartCallback, onEndCallback)`.
   *
   * @param {number|string} actNumberOrKey - Act number (`1..7`) or alert key.
   * @param {boolean|Function} [forceReplayOrOnStart=false] - `forceReplay` boolean or `onStart` callback.
   * @param {Function} [onEnd] - Callback invoked when the voice finishes.
   * @returns {Object|null} Localized voice metadata entry.
   */
  playTutorialVoice(actNumberOrKey, forceReplayOrOnStart = false, onEnd) {
    const forceReplay = typeof forceReplayOrOnStart === 'boolean' ? forceReplayOrOnStart : false;
    const onStart = typeof forceReplayOrOnStart === 'function' ? forceReplayOrOnStart : undefined;

    if (forceReplay) {
      this._ensureAudioContext();
    }

    const entry = this.resolveVoiceEntry(actNumberOrKey, this.language);
    if (!entry) {
      logger.warn('AUDIO', `Unknown TTS voice key: ${String(actNumberOrKey)}`);
      return null;
    }

    this.currentVoiceKey = entry.key;
    this.lastPlayedVoiceKey = entry.key;

    // Strict LLM / Gemini TTS Traceability (Giom's Rule)
    logger.info(
      'AUDIO',
      `[LLM Gemini TTS] Playing ${entry.language.toUpperCase()} voice "${entry.key}" (${entry.speaker} — voice ${entry.voiceName})`,
      {
        model: entry.voiceModel,
        language: entry.language,
        voice: entry.voiceName,
        speaker: entry.speaker,
        role: entry.role,
        url: entry.url,
        transcript: entry.text,
        voiceVolume: this.voiceVolume,
      }
    );

    if (!this.isBrowser || typeof Audio === 'undefined') {
      if (typeof onStart === 'function') onStart(entry);
      if (typeof onEnd === 'function') onEnd(entry);
      return entry;
    }

    this.stopVoice();

    if (this.muted || this.voiceVolume <= 0.001) {
      this.pendingAutoplayVoiceKey = entry.key;
      return entry;
    }

    try {
      const audio = new Audio(entry.url);
      audio.volume = Math.max(0, Math.min(1, 0.96 * this.voiceVolume));
      this.activeVoiceAudio = audio;

      audio.onplay = () => {
        this.pendingAutoplayVoiceKey = null;
        this._notifyVoiceState(true, entry);
        if (typeof onStart === 'function') onStart(entry);
      };

      const handleFinish = () => {
        if (this.activeVoiceAudio === audio) {
          this.activeVoiceAudio = null;
          this._notifyVoiceState(false, entry);
        }
        if (typeof onEnd === 'function') onEnd(entry);
      };

      audio.onended = handleFinish;
      audio.onerror = handleFinish;

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // If browser blocks autoplay before 1st gesture, queue for immediate playback on first input
          this.pendingAutoplayVoiceKey = entry.key;
          this._notifyVoiceState(false, entry);
        });
      }
    } catch (_err) {
      this.pendingAutoplayVoiceKey = entry.key;
    }

    return entry;
  }

  /**
   * Replays the current tutorial or alert voiceover in the active language (`🔈 Preview / Replay Voice`).
   * @param {Function} [onStart]
   * @param {Function} [onEnd]
   * @returns {Object|null}
   */
  replayCurrentVoice(onStart, onEnd) {
    this._ensureAudioContext();
    const key =
      this.currentVoiceKey || this.lastPlayedVoiceKey || this.pendingAutoplayVoiceKey || 'act1_aldric';
    return this.playTutorialVoice(key, onStart, onEnd);
  }

  /**
   * Immediately stops any currently playing TTS voiceover.
   */
  stopVoice() {
    if (this.activeVoiceAudio) {
      try {
        this.activeVoiceAudio.pause();
        this.activeVoiceAudio.currentTime = 0;
      } catch (_err) {
        // Ignore
      }
      this.activeVoiceAudio = null;
    }
    if (this.isVoiceSpeaking) {
      this._notifyVoiceState(false, null);
    }
  }

  // ============================================================================
  // 2. ADAPTIVE MUSIC: LYRIA REALTIME + MULTI-STEMS + ELEMENTAL SYNTHESIZER
  // ============================================================================

  /**
   * Registers an active elemental signature from a player spell or mutant enemy attack
   * to enrich the WebAudio harmonic layer and Lyria Realtime prompt.
   *
   * @param {'fire'|'ice'|'venom'|'lightning'|'arcane'|'earth'} elementId
   * @param {number} [durationMs=6500]
   */
  registerActiveElement(elementId, durationMs = 6500) {
    if (!elementId || !ELEMENT_SIGNATURES[elementId]) return;
    this._recentPlayerElements.set(elementId, Date.now() + durationMs);
  }

  /**
   * Recomputes the localized `modeLabelFR` and `shortStatusFR` strings in `this.adaptiveState`
   * according to `this.language` (`'en'` or `'fr'`).
   * @private
   */
  _refreshLocalizedAdaptiveLabels() {
    const s = this.adaptiveState;
    if (!s) return;
    const isFR = this.language === 'fr';
    const targetBpm = s.bpm || 92;

    let modeLabel = isFR ? '🌿 Paix du Bastion (92 BPM)' : '🌿 Bastion Peace (92 BPM)';
    if (s.isGameOver || s.stemId === 'gameover') {
      modeLabel = isFR
        ? '🕯️ Requiem des Cendres — Game Over (64 BPM)'
        : '🕯️ Requiem of Ashes — Game Over (64 BPM)';
    } else if (s.dragonWrathActive) {
      modeLabel = isFR
        ? '🐉 Courroux Draconique (145 BPM)'
        : '🐉 Dragon Wrath (145 BPM)';
    } else if (s.inCombat && (s.hasMutantNearby || s.isCriticalHp)) {
      if (s.isCriticalHp) {
        modeLabel = isFR
          ? '💔 Urgence Vitale & Combat (145 BPM)'
          : '💔 Critical Survival & Combat (145 BPM)';
      } else if (s.dominantSpecies === 'shark') {
        modeLabel = isFR
          ? '🦈 Requins Marcheurs Mutants (145 BPM)'
          : '🦈 Mutant Walking Sharks (145 BPM)';
      } else if (s.dominantSpecies === 'giant_mole') {
        modeLabel = isFR
          ? '🕳️ Taupes Géantes Fouisseuses (145 BPM)'
          : '🕳️ Burrowing Giant Moles (145 BPM)';
      } else {
        modeLabel = isFR
          ? '🧬 Traque Patient Zéro (145 BPM)'
          : '🧬 Patient Zero Hunt (145 BPM)';
      }
    } else if (s.inCombat) {
      if (s.dominantSpecies === 'shark') {
        modeLabel = isFR
          ? `🦈 Assaut Requins Marcheurs (${targetBpm} BPM)`
          : `🦈 Walking Shark Assault (${targetBpm} BPM)`;
      } else if (s.dominantSpecies === 'giant_mole') {
        modeLabel = isFR
          ? `🕳️ Assaut Taupes Géantes (${targetBpm} BPM)`
          : `🕳️ Giant Mole Eruption (${targetBpm} BPM)`;
      } else if (s.dominantClade === 'greenskin') {
        modeLabel = isFR
          ? `⚔️ Combat Peaux-Vertes (${targetBpm} BPM)`
          : `⚔️ Greenskin Pack Combat (${targetBpm} BPM)`;
      } else if (s.dominantClade === 'beast') {
        modeLabel = isFR
          ? `🐺 Meute Bêtes Sauvages (${targetBpm} BPM)`
          : `🐺 Wild Beast Pack (${targetBpm} BPM)`;
      } else {
        modeLabel = isFR
          ? `⚔️ Escarmouche (${targetBpm} BPM)`
          : `⚔️ Skirmish (${targetBpm} BPM)`;
      }
    } else if (s.isTutorialDialogue || s.stemId === 'tutorial') {
      const speakerEntry = this.resolveVoiceEntry(this.currentVoiceKey);
      const speakerTag =
        this.isVoiceSpeaking && speakerEntry ? ` · 🎙️ ${speakerEntry.speaker}` : '';
      modeLabel = isFR
        ? `📜 Sanctuaire & Dialogue (85 BPM${speakerTag})`
        : `📜 Sanctuary & Dialogue (85 BPM${speakerTag})`;
    } else if (s.isCriticalHp) {
      modeLabel = isFR
        ? '💓 Survie Critique (132 BPM)'
        : '💓 Critical Survival (132 BPM)';
    }

    const activeElements = Array.isArray(s.activeElements) ? s.activeElements : [];
    const elementBadges = s.isGameOver
      ? ''
      : activeElements
          .slice(0, 2)
          .map((el) => ELEMENT_SIGNATURES[el]?.labelFR.split(' ')[0] || '')
          .join('');
    const shortStatus = this.muted
      ? isFR
        ? '🔇 Audio Muet'
        : '🔇 Audio Muted'
      : isFR
      ? `🔊 Lyria : ${modeLabel}${elementBadges ? ` ${elementBadges}` : ''}`
      : `🔊 Lyria: ${modeLabel}${elementBadges ? ` ${elementBadges}` : ''}`;

    s.modeLabelFR = modeLabel;
    s.shortStatusFR = shortStatus;
  }

  /**
   * Updates the adaptive Lyria music engine every frame (MP3 Stems + `LyriaRealtimeClient` + WebAudio layers).
   *
   * @param {Object} [state={}]
   */
  updateAdaptiveMusic(state = {}) {
    const nowMs = Date.now();

    // 1. Player health ratio
    const player = state.player || null;
    const hp = player && typeof player.hp === 'number' ? player.hp : 160;
    const maxHp = player && typeof player.maxHp === 'number' && player.maxHp > 0 ? player.maxHp : 160;
    const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
    const isLowHp = hpRatio < 0.45;
    const isCriticalHp = hpRatio < 0.25;

    // 2. Nearby enemies (< 26m): Clades, Species, Mutant Patient Zero & Elements
    const enemies = Array.isArray(state.enemies) ? state.enemies : [];
    const px = player?.position?.x ?? 0;
    const pz = player?.position?.z ?? 0;
    const combatRadiusSq = 26 * 26;

    const cladeCounts = { greenskin: 0, beast: 0, apex: 0 };
    const speciesCounts = {};
    let nearbyEnemyCount = 0;
    let hasMutantNearby = false;
    let fightingDragon = Boolean(state.dragonWrathActive);
    const activeElementSet = new Set();

    // Clean up expired spell elements
    for (const [el, expMs] of this._recentPlayerElements.entries()) {
      if (expMs > nowMs) {
        activeElementSet.add(el);
      } else {
        this._recentPlayerElements.delete(el);
      }
    }

    // Equipped Legendary Elemental Weapon (Phase 8)
    const eqWeapon = String(player?.equippedWeaponId || '').toLowerCase();
    if (eqWeapon.includes('fire')) activeElementSet.add('fire');
    else if (eqWeapon.includes('ice') || eqWeapon.includes('frost')) activeElementSet.add('ice');
    else if (eqWeapon.includes('lightning') || eqWeapon.includes('storm')) activeElementSet.add('lightning');
    else if (eqWeapon.includes('venom') || eqWeapon.includes('emerald')) activeElementSet.add('venom');

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || e.isDead || e.hp <= 0) continue;
      const spId = e.speciesId || e.genome?.speciesId || 'goblin';

      // Peaceful herbivore prey (Deer / Rabbits) and offshore swimming Sharks do not trigger combat music
      if (
        spId === 'deer' ||
        spId === 'rabbit' ||
        e.clade === 'herbivore' ||
        e.aggroStance === 'prey_pacifist' ||
        (spId === 'shark' && e.isAquatic)
      ) {
        continue;
      }

      const ex = e.position?.x ?? e.x ?? 0;
      const ez = e.position?.z ?? e.z ?? 0;
      const dx = ex - px;
      const dz = ez - pz;
      const dSq = dx * dx + dz * dz;
      if (dSq > combatRadiusSq) continue;

      // Peaceful unprovoked dragons do not trigger combat music on their own
      if (spId === 'dragon' && !state.dragonWrathActive && e.state !== 'attack' && e.state !== 'chase') {
        continue;
      }

      nearbyEnemyCount++;
      speciesCounts[spId] = (speciesCounts[spId] || 0) + 1;

      if (spId === 'goblin' || spId === 'orc' || spId === 'troll' || spId === 'giant_mole') {
        cladeCounts.greenskin++;
        if (spId === 'giant_mole') activeElementSet.add('earth');
      } else if (spId === 'wolf' || spId === 'lion' || spId === 'vulture' || spId === 'shark' || spId === 'storm_harpy') {
        cladeCounts.beast++;
        if (spId === 'shark') activeElementSet.add('ice');
        if (spId === 'storm_harpy') activeElementSet.add('lightning');
      } else if (spId === 'dragon') {
        cladeCounts.apex++;
        fightingDragon = true;
      }

      const muts = e.mutations || e.genome?.mutations || [];
      if (e.isPatientZero || muts.length > 0) {
        hasMutantNearby = true;
        for (const m of muts) {
          const mId = typeof m === 'string' ? m : m?.id;
          if (mId === 'pyro_gland') activeElementSet.add('fire');
          else if (mId === 'cryo_blood' || mId === 'amphibious_lungs') activeElementSet.add('ice');
          else if (mId === 'venom_sacs') activeElementSet.add('venom');
          else if (mId === 'vampiric_maw') activeElementSet.add('arcane');
          else if (mId === 'titan_growth' || mId === 'osteo_plating') activeElementSet.add('earth');
          else if (mId === 'winged_leap') activeElementSet.add('lightning');
        }
      }
    }

    if (fightingDragon) {
      activeElementSet.add('fire');
    }

    const inCombat = nearbyEnemyCount > 0 || fightingDragon;

    // Dominant clade & species
    let dominantClade = null;
    if (cladeCounts.apex > 0) dominantClade = 'apex';
    else if (cladeCounts.greenskin >= cladeCounts.beast && cladeCounts.greenskin > 0) {
      dominantClade = 'greenskin';
    } else if (cladeCounts.beast > 0) {
      dominantClade = 'beast';
    }

    let dominantSpecies = null;
    let maxSpCount = 0;
    for (const [sp, count] of Object.entries(speciesCounts)) {
      if (count > maxSpCount) {
        maxSpCount = count;
        dominantSpecies = sp;
      }
    }

    const activeElements = Array.from(activeElementSet);
    const tutorialActive = Boolean(state.tutorialActive);
    const isTutorialDialogue =
      Boolean(state.isTutorialDialogue) ||
      this.isVoiceSpeaking ||
      (tutorialActive && !inCombat);

    const isGameOver = Boolean(
      state.isGameOver ||
        state.player?.isDead ||
        (state.player && typeof state.player.hp === 'number' && state.player.hp <= 0)
    );

    // 3. Select master Lyria 3 stem (`tutorial`, `peace`, `combat`, `boss`, `gameover`)
    let targetStemId = 'peace';
    let targetBpm = 92;

    if (isGameOver) {
      targetStemId = 'gameover';
      targetBpm = 64;
    } else if (fightingDragon) {
      targetStemId = 'boss';
      targetBpm = 145;
    } else if (inCombat && (hasMutantNearby || isCriticalHp)) {
      targetStemId = 'boss';
      targetBpm = 145;
    } else if (inCombat) {
      targetStemId = 'combat';
      targetBpm = isLowHp ? 136 : 128;
    } else if (isTutorialDialogue) {
      targetStemId = 'tutorial';
      targetBpm = 85;
    } else if (isCriticalHp) {
      targetStemId = 'combat';
      targetBpm = 132;
    }

    this.adaptiveState = {
      stemId: targetStemId,
      modeLabelFR: '',
      shortStatusFR: '',
      bpm: targetBpm,
      hpRatio,
      isLowHp,
      isCriticalHp,
      isGameOver,
      inCombat,
      nearbyEnemyCount,
      dominantClade,
      dominantSpecies,
      hasMutantNearby,
      dragonWrathActive: fightingDragon,
      activeElements,
      isTutorialDialogue,
    };
    this._refreshLocalizedAdaptiveLabels();

    // Master stem transition logging
    if (targetStemId !== this.activeStemId) {
      const prevStem = this.activeStemId;
      this.activeStemId = targetStemId;
      logger.info(
        'AUDIO',
        `[LLM Lyria 3 Stem] Musical transition: "${prevStem}" -> "${targetStemId}" (${this.adaptiveState.modeLabelFR})`,
        {
          fromStem: prevStem,
          toStem: targetStemId,
          trackUrl: LYRIA_MUSIC_STEMS[targetStemId]?.url,
          bpm: targetBpm,
          hpRatio: Number(hpRatio.toFixed(2)),
          isGameOver,
          dominantClade,
          dominantSpecies,
          activeElements,
        }
      );
      this._ensureActiveStemPlaying();
    }

    // 4. Smooth HTMLAudio stem crossfade + -12dB ducking during TTS voiceovers + musicVolume scaling
    this._updateStemCrossfades(state.isModalPaused);

    // 5. Sub-bass WebAudio heartbeat when HP < 45% (suppressed during Game Over Requiem)
    if (isLowHp && !isGameOver && !this.muted) {
      const heartbeatIntervalMs = isCriticalHp ? 460 : 760;
      if (nowMs - this._lastHeartbeatMs >= heartbeatIntervalMs) {
        this._lastHeartbeatMs = nowMs;
        this._playLowHpHeartbeat(isCriticalHp);
      }
    }

    // 6. Real-time WebAudio elemental harmonic texture pulse (~1.6s interval when element active)
    if (activeElements.length > 0 && !isGameOver && !this.muted && nowMs - this._lastElementalPulseMs >= 1650) {
      this._lastElementalPulseMs = nowMs;
      const chosenEl = activeElements[Math.floor(nowMs / 1650) % activeElements.length];
      this._playElementalTexturePulse(chosenEl, inCombat);
    }

    // 7. Periodic `weightedPrompts` update for Lyria Realtime (`models/lyria-realtime-exp`)
    if (nowMs - this._lastStateEvalMs >= 1500) {
      this._lastStateEvalMs = nowMs;
      const weightedPrompts = this._buildLyriaWeightedPrompts();
      const density = isGameOver
        ? 0.28
        : fightingDragon
        ? 0.92
        : inCombat
        ? 0.75
        : isTutorialDialogue
        ? 0.35
        : 0.45;
      const brightness = isGameOver
        ? 0.22
        : activeElements.includes('ice') || activeElements.includes('lightning')
        ? 0.78
        : isLowHp
        ? 0.38
        : 0.56;

      this.lyriaRealtime.sendWeightedPrompts(weightedPrompts, {
        bpm: targetBpm,
        density,
        brightness,
        guidance: 4.2,
      });
    }
  }

  /**
   * Builds the `weightedPrompts` vector sent to `models/lyria-realtime-exp`.
   * @returns {Array<{text: string, weight: number}>}
   * @private
   */
  _buildLyriaWeightedPrompts() {
    const s = this.adaptiveState;
    if (s.isGameOver) {
      return [
        {
          text: LYRIA_MUSIC_STEMS.gameover.prompt,
          weight: 1.0,
        },
        {
          text: 'Mournful solo cello and weeping slow piano in D minor, fallen hero elegy, 64 bpm',
          weight: 0.95,
        },
      ];
    }

    const prompts = [];

    // Base layer according to state (Tutorial / Peace / Combat / Boss)
    const baseStem = LYRIA_MUSIC_STEMS[s.stemId] || LYRIA_MUSIC_STEMS.peace;
    prompts.push({
      text: baseStem.prompt,
      weight: this.isVoiceSpeaking ? 0.45 : 1.0,
    });

    // Player Health layer (Low / Critical HP)
    if (s.isCriticalHp) {
      prompts.push({
        text: 'Critical Low Health, urgent survival heartbeat sub-bass, high tension 142 bpm',
        weight: 0.95,
      });
    } else if (s.isLowHp) {
      prompts.push({
        text: 'Wounded guardian tension, pulsing low strings and heartbeat timpani',
        weight: 0.6,
      });
    }

    // Enemy Species / Clade layer
    if (s.dragonWrathActive) {
      prompts.push({
        text: 'Sovereign Dragon Wrath, apocalyptic volcanic choir, roaring brass and war drums',
        weight: 1.0,
      });
    } else if (s.hasMutantNearby) {
      prompts.push({
        text: 'Mutant Patient Zero bio-hazard tension, dissonant arcane lead, urgent hunt rhythm',
        weight: 0.85,
      });
    } else if (s.dominantClade === 'greenskin') {
      prompts.push({
        text: 'Greenskin Goblin and Orc war pack, heavy tribal percussion and bone drums',
        weight: 0.75,
      });
    } else if (s.dominantClade === 'beast') {
      prompts.push({
        text: 'Savage Wolf and Lion predator pack, fast agile strings and primal woodwinds',
        weight: 0.75,
      });
    }

    // Active Elemental layers (Monsters + Player Spells)
    for (const elId of s.activeElements) {
      const elMeta = ELEMENT_SIGNATURES[elId];
      if (elMeta) {
        prompts.push({
          text: elMeta.promptFragment,
          weight: 0.65,
        });
      }
    }

    return prompts;
  }

  /**
   * Crossfades between the 5 Lyria MP3 stems, applies `-12 dB` ducking while a Gemini TTS voice
   * is speaking, and scales by `this.musicVolume`.
   *
   * @param {boolean} [isModalPaused=false]
   * @private
   */
  _updateStemCrossfades(isModalPaused = false) {
    if (!this.isBrowser) return;

    const isGameOverStem = this.activeStemId === 'gameover' || Boolean(this.adaptiveState.isGameOver);
    const modalAttenuation = isGameOverStem ? 1.0 : isModalPaused ? 0.55 : 1.0;
    const duckMult = this.isVoiceSpeaking ? 0.22 : 1.0;
    const speedRate = isGameOverStem
      ? 1.0
      : this.adaptiveState.isCriticalHp
      ? 1.06
      : this.adaptiveState.isLowHp
      ? 1.03
      : 1.0;

    for (const [stemId, meta] of Object.entries(LYRIA_MUSIC_STEMS)) {
      const audio = this.stemElements[stemId];
      if (!audio) continue;

      const isTarget = stemId === this.activeStemId && !this.muted && this.musicVolume > 0.001;
      const targetVol = isTarget
        ? meta.baseVolume * this.musicVolume * duckMult * modalAttenuation
        : 0;
      const currentVol = this.stemVolumes[stemId] || 0;
      const nextVol = currentVol + (targetVol - currentVol) * 0.08;
      this.stemVolumes[stemId] = nextVol;

      try {
        audio.volume = Math.max(0, Math.min(1, nextVol));
        if (isTarget && Math.abs(audio.playbackRate - speedRate) > 0.01) {
          audio.playbackRate = speedRate;
        }
        if (isTarget && audio.paused && this.audioUnlocked) {
          audio.play().catch(() => {});
        } else if (!isTarget && nextVol < 0.005 && !audio.paused) {
          audio.pause();
        }
      } catch (_err) {
        // Ignore audio DOM exceptions
      }
    }
  }

  /**
   * Returns complete adaptive music & TTS telemetry for HUD and Settings modal display.
   * @returns {Object}
   */
  getMusicTelemetryForHUD() {
    const voiceEntry = this.resolveVoiceEntry(this.currentVoiceKey);
    const stemMeta = LYRIA_MUSIC_STEMS[this.activeStemId];
    const activeTrackTitle = stemMeta
      ? this.language === 'fr'
        ? stemMeta.titleFR
        : stemMeta.titleEN
      : this.language === 'fr'
      ? 'Sanctuaire'
      : 'Sanctuary';

    return {
      muted: this.muted,
      language: this.language,
      musicVolume: this.musicVolume,
      voiceVolume: this.voiceVolume,
      sfxVolume: this.sfxVolume,
      activeStemId: this.activeStemId,
      activeTrackTitle,
      modeLabelFR: this.adaptiveState.modeLabelFR,
      shortStatusFR: this.adaptiveState.shortStatusFR,
      bpm: this.adaptiveState.bpm,
      hpRatio: this.adaptiveState.hpRatio,
      isLowHp: this.adaptiveState.isLowHp,
      isCriticalHp: this.adaptiveState.isCriticalHp,
      isGameOver: Boolean(this.adaptiveState.isGameOver),
      inCombat: this.adaptiveState.inCombat,
      dominantClade: this.adaptiveState.dominantClade,
      dominantSpecies: this.adaptiveState.dominantSpecies,
      activeElements: this.adaptiveState.activeElements,
      isVoiceSpeaking: this.isVoiceSpeaking,
      currentVoiceKey: this.currentVoiceKey,
      currentSpeaker: voiceEntry ? voiceEntry.speaker : null,
      isDucking: this.isVoiceSpeaking,
      lyriaModel: 'models/lyria-realtime-exp + lyria-3-mp3',
      weightedPrompts: this.lyriaRealtime.lastWeightedPrompts,
    };
  }

  /**
   * Toggles master mute (`Mute / Unmute`).
   * @returns {boolean} New `muted` state.
   */
  toggleMute() {
    return this.setMuted(!this.muted);
  }

  /**
   * Explicitly sets master mute (`muted`).
   * @param {boolean} muted
   * @returns {boolean}
   */
  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.85, this.ctx.currentTime);
    }
    if (this.muted) {
      this.stopVoice();
      for (const audio of Object.values(this.stemElements)) {
        try {
          audio.pause();
        } catch (_err) {
          // Ignore
        }
      }
    } else {
      this._ensureAudioContext();
      this._ensureActiveStemPlaying();
    }
    this._refreshLocalizedAdaptiveLabels();
    logger.info('AUDIO', this.muted ? 'Audio Muted' : 'Audio Unmuted');
    return this.muted;
  }

  /**
   * Sets the Lyria 3 music volume multiplier (`0.0` to `1.0`).
   * @param {number} val0to1
   * @returns {number}
   */
  setMusicVolume(val0to1) {
    const clamped = Math.max(0, Math.min(1, Number(val0to1)));
    this.musicVolume = Number.isFinite(clamped) ? clamped : 1.0;

    if (this.elementalLayerGain && this.ctx) {
      this.elementalLayerGain.gain.setValueAtTime(0.16 * this.musicVolume, this.ctx.currentTime);
    }

    // Immediately reflect on active stem volume
    const activeMeta = LYRIA_MUSIC_STEMS[this.activeStemId];
    const activeAudio = this.stemElements[this.activeStemId];
    if (activeMeta && activeAudio && !this.muted) {
      const duckMult = this.isVoiceSpeaking ? 0.22 : 1.0;
      const targetVol = activeMeta.baseVolume * this.musicVolume * duckMult;
      this.stemVolumes[this.activeStemId] = targetVol;
      try {
        activeAudio.volume = Math.max(0, Math.min(1, targetVol));
        if (this.musicVolume <= 0.001 && !activeAudio.paused) {
          activeAudio.pause();
        } else if (this.musicVolume > 0.001 && activeAudio.paused && this.audioUnlocked) {
          activeAudio.play().catch(() => {});
        }
      } catch (_err) {
        // Ignore
      }
    }

    logger.info('AUDIO', `Music volume set to ${Math.round(this.musicVolume * 100)}%`, {
      musicVolume: this.musicVolume,
    });
    return this.musicVolume;
  }

  /**
   * Sets the Gemini TTS voiceover volume multiplier (`0.0` to `1.0`).
   * @param {number} val0to1
   * @returns {number}
   */
  setVoiceVolume(val0to1) {
    const clamped = Math.max(0, Math.min(1, Number(val0to1)));
    this.voiceVolume = Number.isFinite(clamped) ? clamped : 1.0;

    if (this.activeVoiceAudio) {
      try {
        this.activeVoiceAudio.volume = Math.max(0, Math.min(1, 0.96 * this.voiceVolume));
      } catch (_err) {
        // Ignore
      }
    }

    logger.info('AUDIO', `Voiceover volume set to ${Math.round(this.voiceVolume * 100)}%`, {
      voiceVolume: this.voiceVolume,
    });
    return this.voiceVolume;
  }

  /**
   * Sets the procedural WebAudio Combat & World SFX volume multiplier (`0.0` to `1.0`).
   * @param {number} val0to1
   * @returns {number}
   */
  setSfxVolume(val0to1) {
    const clamped = Math.max(0, Math.min(1, Number(val0to1)));
    this.sfxVolume = Number.isFinite(clamped) ? clamped : 1.0;

    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(0.9 * this.sfxVolume, this.ctx.currentTime);
    }

    logger.info('AUDIO', `SFX volume set to ${Math.round(this.sfxVolume * 100)}%`, {
      sfxVolume: this.sfxVolume,
    });
    return this.sfxVolume;
  }

  /**
   * Updates multiple audio settings at once (`{ muted, language, musicVolume, voiceVolume, sfxVolume }`).
   * @param {Object} [cfg={}]
   * @returns {Object} Updated audio settings snapshot.
   */
  setAudioSettings(cfg = {}) {
    if (!cfg || typeof cfg !== 'object') return this.getAudioSettings();
    if (typeof cfg.muted === 'boolean') this.setMuted(cfg.muted);
    if (typeof cfg.musicVolume === 'number') this.setMusicVolume(cfg.musicVolume);
    if (typeof cfg.voiceVolume === 'number') this.setVoiceVolume(cfg.voiceVolume);
    if (typeof cfg.sfxVolume === 'number') this.setSfxVolume(cfg.sfxVolume);
    if (typeof cfg.language === 'string') this.setLanguage(cfg.language);
    return this.getAudioSettings();
  }

  /**
   * Returns the current audio settings snapshot for the Settings modal (`⚙️ Settings [O]`).
   * @returns {{ muted: boolean, language: 'en'|'fr', musicVolume: number, voiceVolume: number, sfxVolume: number }}
   */
  getAudioSettings() {
    return {
      muted: this.muted,
      language: this.language,
      musicVolume: this.musicVolume,
      voiceVolume: this.voiceVolume,
      sfxVolume: this.sfxVolume,
    };
  }

  // ============================================================================
  // 3. EFFETS SONORES DE COMBAT & MONDE PROCÉDURAUX ZÉRO-LATENCE (WEBAUDIO)
  // ============================================================================

  /**
   * Génère un bruit blanc filtré court (utile pour les souffles d'épée, explosions, vent).
   * @param {number} durationSec
   * @param {BiquadFilterType} filterType
   * @param {number} startFreq
   * @param {number} endFreq
   * @param {number} peakGain
   * @private
   */
  _playNoiseBurst(durationSec, filterType, startFreq, endFreq, peakGain = 0.25) {
    const ctx = this._ensureAudioContext();
    if (!ctx || this.muted || !this.sfxGain) return;

    const now = ctx.currentTime;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + durationSec);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + Math.min(0.02, durationSec * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + durationSec);
  }

  /**
   * Joue une note / balayage de fréquence synthétique.
   * @param {OscillatorType} type
   * @param {number} startFreq
   * @param {number} endFreq
   * @param {number} durationSec
   * @param {number} peakGain
   * @param {number} [delaySec=0]
   * @private
   */
  _playTone(type, startFreq, endFreq, durationSec, peakGain = 0.2, delaySec = 0) {
    const ctx = this._ensureAudioContext();
    if (!ctx || this.muted || !this.sfxGain) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), now);
    if (endFreq !== startFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + durationSec);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + Math.min(0.015, durationSec * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + durationSec);
  }

  /**
   * Battement de cœur sub-bass joué automatiquement lorsque les PV du joueur passent sous 45% / 25%.
   * @param {boolean} isCritical
   * @private
   */
  _playLowHpHeartbeat(isCritical = false) {
    const gain = isCritical ? 0.28 : 0.16;
    this._playTone('sine', 68, 42, 0.14, gain, 0);
    this._playTone('sine', 58, 36, 0.18, gain * 0.85, 0.16);
  }

  /**
   * Texture harmonique temps réel reflétant l'élément actif (`fire`, `ice`, `venom`, `lightning`, `arcane`, `earth`).
   * @param {string} elementId
   * @param {boolean} inCombat
   * @private
   */
  _playElementalTexturePulse(elementId, inCombat = false) {
    const ctx = this._ensureAudioContext();
    if (!ctx || this.muted || !this.elementalLayerGain) return;
    const baseGain = inCombat ? 0.08 : 0.045;

    switch (elementId) {
      case 'fire':
        this._playTone('sawtooth', 146.83, 220.0, 0.35, baseGain, 0);
        break;
      case 'ice':
        this._playTone('sine', 1046.5, 1318.5, 0.28, baseGain * 0.9, 0);
        this._playTone('triangle', 1567.98, 2093.0, 0.22, baseGain * 0.6, 0.08);
        break;
      case 'venom':
        this._playTone('triangle', 185.0, 155.56, 0.32, baseGain, 0);
        break;
      case 'lightning':
        this._playTone('sawtooth', 659.25, 987.77, 0.14, baseGain, 0);
        break;
      case 'earth':
        this._playTone('sine', 82.41, 55.0, 0.4, baseGain * 1.2, 0);
        break;
      default:
        this._playTone('sine', 440.0, 554.37, 0.3, baseGain * 0.8, 0);
        break;
    }
  }

  /**
   * SFX : Fente d'Épée Runique (`playSwordCleave`) — souffle métallique + résonance runique.
   */
  playSwordCleave() {
    this._playNoiseBurst(0.16, 'bandpass', 1400, 380, 0.24);
    this._playTone('sawtooth', 340, 120, 0.14, 0.16, 0);
    this._playTone('sine', 680, 440, 0.18, 0.10, 0.02);
  }

  /**
   * SFX : Impact de coup sur un ennemi (`playHitImpact`) — choc charnel/armure + crépitement élémentaire.
   * @param {boolean} [isCritOrMutant=false]
   * @param {string|null} [element=null]
   */
  playHitImpact(isCritOrMutant = false, element = null) {
    const nowMs = Date.now();
    if (nowMs - this._lastHitSfxMs < 45) return; // Anti-saturation en cas de Cleave multi-cibles
    this._lastHitSfxMs = nowMs;

    if (element) {
      this.registerActiveElement(element, 5500);
    }

    this._playTone('triangle', isCritOrMutant ? 190 : 145, 48, 0.11, isCritOrMutant ? 0.28 : 0.20, 0);
    this._playNoiseBurst(0.08, 'lowpass', 950, 220, 0.18);

    if (isCritOrMutant) {
      this._playTone('sawtooth', 520, 880, 0.12, 0.14, 0.02);
    }
  }

  /**
   * SFX : Esquive rapide (`playDash`) — rafale de vent aérodynamique.
   */
  playDash() {
    this._playNoiseBurst(0.20, 'bandpass', 600, 2200, 0.22);
    this._playTone('sine', 240, 520, 0.16, 0.12, 0);
  }

  /**
   * SFX : Lancement de l'un des 8 sorts 3D du Gardien (`playSpellCast`).
   * Enregistre également l'élément du sort dans le moteur adaptatif Lyria !
   *
   * @param {string} spellId - Identifiant du sort (`spinning_blades`, `pyro_nova`, `chain_lightning`, `frost_spear`, `venom_volley`, `meteor_strike`, `soul_siphon`, `seismic_slam`).
   */
  playSpellCast(spellId) {
    const id = String(spellId || '').toLowerCase();

    switch (id) {
      case 'spinning_blades':
        this.registerActiveElement('arcane', 7000);
        this._playTone('sawtooth', 440, 880, 0.22, 0.18, 0);
        this._playTone('triangle', 660, 1320, 0.22, 0.14, 0.06);
        this._playNoiseBurst(0.24, 'highpass', 1800, 4200, 0.16);
        break;

      case 'pyro_nova':
        this.registerActiveElement('fire', 7500);
        this._playNoiseBurst(0.38, 'lowpass', 1200, 180, 0.32);
        this._playTone('sawtooth', 180, 62, 0.34, 0.26, 0);
        this._playTone('triangle', 360, 140, 0.25, 0.16, 0.04);
        break;

      case 'chain_lightning':
        this.registerActiveElement('lightning', 7500);
        this._playTone('sawtooth', 920, 1840, 0.09, 0.22, 0);
        this._playTone('sawtooth', 1480, 640, 0.10, 0.20, 0.06);
        this._playTone('sawtooth', 1760, 880, 0.12, 0.18, 0.12);
        this._playNoiseBurst(0.18, 'highpass', 2400, 5000, 0.18);
        break;

      case 'frost_spear':
        this.registerActiveElement('ice', 7500);
        this._playTone('sine', 1174.66, 2349.32, 0.18, 0.20, 0);
        this._playTone('triangle', 1567.98, 3135.96, 0.22, 0.16, 0.05);
        this._playNoiseBurst(0.15, 'bandpass', 2800, 4800, 0.16);
        break;

      case 'venom_volley':
        this.registerActiveElement('venom', 7500);
        this._playNoiseBurst(0.25, 'bandpass', 900, 2600, 0.20);
        this._playTone('sawtooth', 290, 145, 0.22, 0.16, 0);
        break;

      case 'meteor_strike':
        this.registerActiveElement('fire', 8500);
        this.registerActiveElement('earth', 8500);
        this._playTone('sine', 880, 110, 0.28, 0.22, 0);
        this._playNoiseBurst(0.45, 'lowpass', 950, 90, 0.35);
        this._playTone('sawtooth', 120, 38, 0.42, 0.30, 0.12);
        break;

      case 'soul_siphon':
        this.registerActiveElement('arcane', 7500);
        this._playTone('sine', 330, 660, 0.32, 0.18, 0);
        this._playTone('triangle', 495, 247.5, 0.32, 0.15, 0.05);
        break;

      case 'seismic_slam':
        this.registerActiveElement('earth', 7500);
        this._playTone('sine', 130, 36, 0.38, 0.34, 0);
        this._playNoiseBurst(0.32, 'lowpass', 650, 110, 0.28);
        break;

      default:
        this.registerActiveElement('arcane', 5000);
        this._playTone('sine', 523.25, 783.99, 0.20, 0.18, 0);
        break;
    }
  }

  /**
   * SFX : Récolte de ressources (`playHarvest`) — coupe de bois franche vs carillon cristallin.
   * @param {'wood'|'crystal'|string} [resourceType='wood']
   */
  playHarvest(resourceType = 'wood') {
    if (String(resourceType).toLowerCase().includes('crystal')) {
      this._playTone('sine', 1046.5, 1567.98, 0.24, 0.20, 0);
      this._playTone('triangle', 1318.5, 2093.0, 0.28, 0.16, 0.07);
    } else {
      this._playTone('triangle', 180, 75, 0.12, 0.24, 0);
      this._playNoiseBurst(0.09, 'bandpass', 800, 320, 0.20);
    }
  }

  /**
   * SFX : Libération d'un survivant en cage (`playCageRescue`) — chaîne brisée + accord héroïque.
   */
  playCageRescue() {
    this._playNoiseBurst(0.12, 'highpass', 1600, 3400, 0.22);
    const notes = [523.25, 659.25, 783.99, 1046.5]; // Do Majeur
    notes.forEach((freq, idx) => {
      this._playTone('triangle', freq, freq, 0.26, 0.18, idx * 0.06);
    });
  }

  /**
   * SFX : Construction ou amélioration d'un bâtiment du Bastion (`playBuildOrUpgrade`) — enclume + arpège doré.
   * @param {number} [level=1]
   */
  playBuildOrUpgrade(level = 1) {
    const pitchMult = 1 + Math.min(3, Math.max(0, (level || 1) - 1)) * 0.12;
    this._playTone('triangle', 220 * pitchMult, 110, 0.14, 0.24, 0);
    const chord = [440, 554.37, 659.25, 880];
    chord.forEach((f, i) => {
      this._playTone('sine', f * pitchMult, f * pitchMult, 0.22, 0.16, 0.05 + i * 0.055);
    });
  }

  /**
   * SFX : Alerte Éclaireur Patient Zéro (`playScoutAlert`) — cor de chasse + radar ping.
   * @param {boolean} [triggerVoice=false] - Si true, lance également `alert_patient_zero.wav`.
   */
  playScoutAlert(triggerVoice = false) {
    this._playTone('sawtooth', 392.0, 587.33, 0.28, 0.22, 0);
    this._playTone('sine', 1174.66, 1174.66, 0.18, 0.20, 0.22);
    this._playTone('sine', 1567.98, 1567.98, 0.24, 0.20, 0.36);

    if (triggerVoice) {
      this.playTutorialVoice('alert_patient_zero');
    }
  }

  /**
   * SFX : Montée de niveau Roguelike (`playLevelUp`) — fanfare céleste.
   */
  playLevelUp() {
    const fanfare = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    fanfare.forEach((freq, idx) => {
      this._playTone('triangle', freq, freq, 0.32, 0.20, idx * 0.065);
    });
  }

  /**
   * SFX : Courroux Draconique (`playDragonWrath`) — rugissement sub-bass + cuivres d'alarme.
   * @param {boolean} [triggerVoice=false] - Si true, lance également `alert_dragon_wrath.wav`.
   */
  playDragonWrath(triggerVoice = false) {
    this.registerActiveElement('fire', 12000);
    this._playNoiseBurst(0.65, 'lowpass', 850, 95, 0.36);
    this._playTone('sawtooth', 146.83, 55.0, 0.65, 0.32, 0);
    this._playTone('sawtooth', 220.0, 110.0, 0.55, 0.26, 0.12);

    if (triggerVoice) {
      this.playTutorialVoice('alert_dragon_wrath');
    }
  }

  /**
   * SFX : Débarquement des Requins Marcheurs Amphibies sur la plage (`playSharkLanding`) —
   * déferlante d'écume océanique + motif de cuivres menaçant demi-ton (Mi1 -> Fa1) + pas lourds amphibies.
   * @param {boolean} [triggerVoice=false] - Si true, lance également `alert_shark_landing.wav`.
   */
  playSharkLanding(triggerVoice = false) {
    this.registerActiveElement('ice', 9000);
    // Déferlante d'écume sur le rivage
    this._playNoiseBurst(0.52, 'bandpass', 1100, 280, 0.30);
    // Motif grave menaçant en demi-ton (façon prédateur des abysses : E2 -> F2 -> E2 -> F2)
    this._playTone('sawtooth', 82.41, 82.41, 0.22, 0.28, 0.02);
    this._playTone('sawtooth', 87.31, 87.31, 0.24, 0.32, 0.25);
    this._playTone('triangle', 164.81, 174.61, 0.35, 0.22, 0.48);

    if (triggerVoice) {
      this.playTutorialVoice('alert_shark_landing');
    }
  }

  /**
   * SFX : Éruption souterraine des Taupes Géantes Fouisseuses (`playMoleEruption`) —
   * grondement tectonique sub-bass + fracas de roche percée + griffes métalliques.
   * @param {boolean} [triggerVoice=false] - Si true, lance également `alert_mole_eruption.wav`.
   */
  playMoleEruption(triggerVoice = false) {
    this.registerActiveElement('earth', 9000);
    // Grondement tellurique montant des profondeurs
    this._playTone('sine', 44.0, 110.0, 0.42, 0.34, 0);
    this._playNoiseBurst(0.45, 'lowpass', 720, 140, 0.32);
    // Crépitement des griffes métalliques de fouissage
    this._playTone('sawtooth', 580, 1240, 0.14, 0.18, 0.18);
    this._playTone('sawtooth', 640, 1380, 0.14, 0.18, 0.28);

    if (triggerVoice) {
      this.playTutorialVoice('alert_mole_eruption');
    }
  }

  /**
   * SFX : Alerte Écologique Gibier Herbivore décimé / risque d'extinction (`playPreyWarning`) —
   * appel de détresse sylvestre + carillon d'alerte dissonant.
   * @param {boolean} [triggerVoice=false] - Si true, lance également `alert_prey_crisis.wav`.
   */
  playPreyWarning(triggerVoice = false) {
    // Double note d'alerte écologique descendante (quinte diminuée / triton d'avertissement)
    this._playTone('triangle', 659.25, 466.16, 0.26, 0.24, 0);
    this._playTone('sawtooth', 466.16, 329.63, 0.34, 0.22, 0.22);
    this._playTone('sine', 932.33, 659.25, 0.30, 0.16, 0.12);

    if (triggerVoice) {
      this.playTutorialVoice('alert_prey_crisis');
    }
  }

  /**
   * SFX : Collecte d'un Fragment de Relique d'Éden (`playRelicPickup`) —
   * résonance cristalline ancienne + arpège céleste ascendant.
   * @param {number|boolean} [fragmentCountOrVoice=1] - Numéro du fragment (`1..3`) ou booléen `triggerVoice`.
   * @param {boolean} [triggerVoice=false] - Si true, lance également `alert_relic_found.wav`.
   */
  playRelicPickup(fragmentCountOrVoice = 1, triggerVoice = false) {
    const shouldSpeak =
      typeof fragmentCountOrVoice === 'boolean' ? fragmentCountOrVoice : Boolean(triggerVoice);
    const count =
      typeof fragmentCountOrVoice === 'number' ? Math.max(1, Math.min(3, fragmentCountOrVoice)) : 1;
    const pitchBoost = 1 + (count - 1) * 0.12;

    this.registerActiveElement('arcane', 8000);
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    notes.forEach((f, idx) => {
      this._playTone('sine', f * pitchBoost, f * pitchBoost, 0.28, 0.20, idx * 0.055);
      this._playTone('triangle', f * 0.5 * pitchBoost, f * 0.5 * pitchBoost, 0.26, 0.12, idx * 0.055);
    });

    if (shouldSpeak) {
      this.playTutorialVoice('alert_relic_found');
    }
  }

  /**
   * SFX : Forge ou Équipement d'une Arme Élémentaire Légendaire (`playWeaponForge`) —
   * choc d'enclume runique + décharge élémentaire propre à l'arme choisie (`fire`, `ice`, `lightning`, `venom`).
   * @param {string} [elementOrWeaponId='fire'] - Identifiant de l'arme (`fire_greatsword`, `ice_greatsword`, `lightning_greatsword`, `venom_greatsword`) ou élément.
   */
  playWeaponForge(elementOrWeaponId = 'fire') {
    const raw = String(elementOrWeaponId || 'fire').toLowerCase();
    // Frappe d'enclume runique initiale
    this._playTone('triangle', 240, 110, 0.16, 0.28, 0);
    this._playNoiseBurst(0.14, 'highpass', 1800, 3800, 0.22);

    if (raw.includes('ice') || raw.includes('frost')) {
      this.registerActiveElement('ice', 10000);
      this._playTone('sine', 1046.5, 2093.0, 0.28, 0.22, 0.08);
      this._playTone('triangle', 1567.98, 3135.96, 0.30, 0.18, 0.15);
    } else if (raw.includes('lightning') || raw.includes('storm')) {
      this.registerActiveElement('lightning', 10000);
      this._playTone('sawtooth', 880, 1760, 0.12, 0.24, 0.06);
      this._playTone('sawtooth', 1320, 2640, 0.14, 0.22, 0.14);
    } else if (raw.includes('venom') || raw.includes('emerald')) {
      this.registerActiveElement('venom', 10000);
      this._playTone('sawtooth', 330, 165, 0.28, 0.22, 0.06);
      this._playTone('triangle', 495, 660, 0.26, 0.18, 0.14);
    } else {
      this.registerActiveElement('fire', 10000);
      this._playNoiseBurst(0.32, 'lowpass', 1100, 220, 0.28);
      this._playTone('sawtooth', 220, 440, 0.28, 0.24, 0.06);
    }
  }

  /**
   * SFX : Activation du Dôme-Bouclier Planétaire de l'Île (`playIslandShieldActivation`) —
   * onde d'expansion sub-bass + accord solaire triomphal à 6 voix + carillon de purification.
   * @param {boolean} [triggerVoice=false] - Si true, lance également `alert_island_victory.wav`.
   */
  playIslandShieldActivation(triggerVoice = false) {
    this.registerActiveElement('arcane', 12000);
    // Onde d'expansion énergétique du dôme (sweep ascendant)
    this._playTone('sine', 65.41, 261.63, 0.65, 0.32, 0);
    this._playNoiseBurst(0.55, 'bandpass', 400, 2400, 0.24);

    // Grand accord solaire de victoire (Do Majeur 9e céleste)
    const chord = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, idx) => {
      this._playTone('triangle', freq, freq, 0.55, 0.20, 0.08 + idx * 0.07);
      this._playTone('sine', freq * 2, freq * 2, 0.45, 0.12, 0.12 + idx * 0.07);
    });

    if (triggerVoice) {
      this.playTutorialVoice('alert_island_victory');
    }
  }

  /**
   * SFX + Lyria Music + TTS Voice: Triggers the Game Over Requiem (`playGameOverRequiem`) —
   * immediately switches to `lyria_gameover_requiem.mp3` (64 BPM), plays a solemn D-minor funeral bell +
   * synthesized cello chord, and plays Aldric's voiceover (`alert_gameover_requiem.wav`) in the active language (`'en'` or `'fr'`).
   *
   * @param {boolean} [playVoice=true] - If false, skips playing the TTS voiceover.
   */
  playGameOverRequiem(playVoice = true) {
    const prevStem = this.activeStemId;
    this.activeStemId = 'gameover';
    this.adaptiveState.isGameOver = true;
    this.adaptiveState.stemId = 'gameover';
    this.adaptiveState.bpm = 64;
    this._refreshLocalizedAdaptiveLabels();

    logger.info(
      'AUDIO',
      `[LLM Lyria 3 Stem] Transition Game Over Requiem: "${prevStem}" -> "gameover" (64 BPM)`,
      {
        fromStem: prevStem,
        toStem: 'gameover',
        trackUrl: LYRIA_MUSIC_STEMS.gameover.url,
        bpm: 64,
        language: this.language,
      }
    );

    this._ensureActiveStemPlaying();
    this._updateStemCrossfades(true);

    // Immediate update for Lyria Realtime (`models/lyria-realtime-exp`)
    this.lyriaRealtime.sendWeightedPrompts(
      [
        {
          text: LYRIA_MUSIC_STEMS.gameover.prompt,
          weight: 1.0,
        },
        {
          text: 'Mournful solo cello and weeping slow piano in D minor, fallen hero elegy, 64 bpm',
          weight: 0.95,
        },
      ],
      {
        bpm: 64,
        density: 0.28,
        brightness: 0.22,
        guidance: 4.5,
      },
      true
    );

    // D-Minor funeral chord (D2=73.42, A2=110, D3=146.83, F3=174.61, A3=220)
    const dMinorRequiem = [73.42, 110.0, 146.83, 174.61, 220.0];
    dMinorRequiem.forEach((freq, idx) => {
      this._playTone('triangle', freq, freq * 0.985, 0.85, 0.20, idx * 0.09);
      this._playTone('sine', freq * 0.5, freq * 0.5, 0.95, 0.14, idx * 0.09);
    });

    if (playVoice !== false) {
      this.playTutorialVoice('alert_gameover_requiem');
    }
  }

  /**
   * SFX: Sanctuary's Grace (`playReviveGrace`) when the player chooses to continue from the Game Over screen.
   * Stops the Requiem, returns to `peace` stem, and plays an ascending golden harp arpeggio.
   */
  playReviveGrace() {
    this.stopVoice();
    this.adaptiveState.isGameOver = false;
    this.activeStemId = 'peace';
    this.adaptiveState.stemId = 'peace';
    this.adaptiveState.bpm = 92;
    this._refreshLocalizedAdaptiveLabels();

    this._ensureActiveStemPlaying();
    this._updateStemCrossfades(false);

    // Ascending celestial harp arpeggio (D Major)
    const graceNotes = [293.66, 369.99, 440.0, 587.33, 739.99, 880.0, 1174.66];
    graceNotes.forEach((freq, idx) => {
      this._playTone('sine', freq, freq, 0.36, 0.20, idx * 0.055);
      this._playTone('triangle', freq * 0.5, freq * 0.5, 0.32, 0.12, idx * 0.055);
    });
  }

  /**
   * SFX: New Roguelike Run (`playNewRunReset`) when the player restarts from Level 1, Island #1.
   * Stops the Requiem, returns to `peace` stem, and sounds the runic expedition horn.
   */
  playNewRunReset() {
    this.stopVoice();
    this.adaptiveState.isGameOver = false;
    this.activeStemId = 'peace';
    this.adaptiveState.stemId = 'peace';
    this.adaptiveState.bpm = 92;
    this._refreshLocalizedAdaptiveLabels();

    this._ensureActiveStemPlaying();
    this._updateStemCrossfades(false);

    // Runic expedition horn (ascending heroic fifth: G3 -> D4 -> G4)
    this._playTone('sawtooth', 196.0, 196.0, 0.24, 0.22, 0);
    this._playTone('sawtooth', 293.66, 293.66, 0.26, 0.24, 0.16);
    this._playTone('triangle', 392.0, 392.0, 0.45, 0.26, 0.32);
  }
}

export default SoundManager;
