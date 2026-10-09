/**
 * @file src/audio/SoundManager.js
 * @description Gestionnaire Audio Hybride pour **Genesis Bastion** :
 * 1. **Voix Françaises du Tutoriel & Alertes (Gemini TTS `gemini-v4s-tts`)** :
 *    - 9 lignes de dialogue doublées en français dans `public/assets/audio/tts/*.wav` incarnant :
 *      - **Aldric, Maître Biologiste & Forgeron du Bastion (`Fenrir`)** : Actes 1 à 4
 *      - **Kaelen, Cheffe des Éclaireurs Hors-Frontière (`Kore`)** : Actes 5 à 7 + Alertes Patient Zéro & Courroux Draconique
 *    - Atténuation automatique de la musique (`-12 dB` / `0.22x` ducking) pendant qu'un personnage parle,
 *      déverrouillage automatique au premier clic/touche si l'autoplay navigateur bloque l'Acte 1,
 *      et fonction `replayCurrentVoice()` pour le bouton HUD `🔈 Réécouter Voix`.
 *
 * 2. **Musique Adaptative Temps Réel (`LyriaRealtimeClient` `models/lyria-realtime-exp` + Multi-Stems Lyria 3 + Synthèse Élémentaire WebAudio)** :
 *    - 4 pistes maîtresses Lyria 3 (`public/assets/audio/music/*.mp3`) :
 *      - `lyria_tutorial_dialogue.mp3` (85 BPM — Tutoriel & Dialogues au Sanctuaire)
 *      - `lyria_sanctuary_peace.mp3` (92 BPM — Exploration paisible & Construction du Bastion)
 *      - `lyria_combat_pack.mp3` (128 BPM — Escarmouches contre Peaux-Vertes & Bêtes Sauvages)
 *      - `lyria_boss_mutation_wrath.mp3` (145 BPM — Traque de Patient Zéro Mutant, PV Critiques & Courroux Draconique)
 *    - Connecteur WebSocket temps réel vers `models/lyria-realtime-exp` (`BidiGenerateContent`)
 *      recalculant dynamiquement les `weightedPrompts` et `musicGenerationConfig` (`bpm`, `density`, `brightness`)
 *      en fonction :
 *      1) de l'état Tutoriel / Dialogue,
 *      2) du ratio de PV du joueur (`< 45%` tension + battement de cœur sub-bass, `< 25%` urgence vitale),
 *      3) de l'espèce et du clade combattus (`greenskin` tambours tribaux, `beast` cordes véloces, `mutant` dissonance arcane, `dragon` apocalyptique),
 *      4) des éléments actifs utilisés par les monstres mutants ET les sorts du joueur (`fire`, `ice`, `venom`, `lightning`, `arcane`, `earth`).
 *
 * 3. **Effets Sonores de Combat & Monde Procéduraux Zéro-Latence (WebAudio API)** :
 *    - Synthèse procédurale multi-couches pour la fente d'épée (`playSwordCleave`), les impacts élémentaires
 *      (`playHitImpact`), l'esquive (`playDash`), les 8 sorts 3D (`playSpellCast`), la récolte bois/cristal
 *      (`playHarvest`), la libération de prisonnier (`playCageRescue`), la construction/amélioration
 *      (`playBuildOrUpgrade`), l'alerte Éclaireur (`playScoutAlert`), le Level-Up (`playLevelUp`)
 *      et le Courroux Draconique (`playDragonWrath`).
 *
 * Compatible avec l'exécution headless Node.js (`scripts/dry-run-sim.js`) grâce à des garde-fous DOM/WebAudio complets.
 */

import { logger } from '../utils/logger.js';

/**
 * Catalogue complet des 9 lignes de voix françaises générées via Gemini TTS (`gemini-v4s-tts`).
 */
export const TTS_VOICE_CATALOG = {
  act1_aldric: {
    key: 'act1_aldric',
    actNumber: 1,
    speaker: 'Aldric',
    speakerTitle: 'Maître Biologiste & Forgeron du Bastion',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Fenrir',
    url: '/assets/audio/tts/act1_aldric.wav',
    text: "Bienvenue au Sanctuaire du Bastion, Gardien. L'écosystème autour de nous est figé pour l'instant. Marche jusqu'à la balise dorée au Sud et ajuste ta caméra.",
  },
  act2_aldric: {
    key: 'act2_aldric',
    actNumber: 2,
    speaker: 'Aldric',
    speakerTitle: 'Maître Biologiste & Forgeron du Bastion',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Fenrir',
    url: '/assets/audio/tts/act2_aldric.wav',
    text: 'Un Gobelin égaré puis un Orc maraudeur approchent ! Frappe-les avec ton épée runique, esquive avec Shift, et choisis ton premier sort au niveau deux.',
  },
  act3_aldric: {
    key: 'act3_aldric',
    actNumber: 3,
    speaker: 'Aldric',
    speakerTitle: 'Maître Biologiste & Forgeron du Bastion',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Fenrir',
    url: '/assets/audio/tts/act3_aldric.wav',
    text: 'Élimine ce loup, libère le survivant enfermé dans la cage au Sud-Est avec la touche E, puis récolte du bois ou du cristal pour notre camp.',
  },
  act4_aldric: {
    key: 'act4_aldric',
    actNumber: 4,
    speaker: 'Aldric',
    speakerTitle: 'Maître Biologiste & Forgeron du Bastion',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Fenrir',
    url: '/assets/audio/tts/act4_aldric.wav',
    text: 'Utilise nos ressources pour bâtir une Tour de Guet sur le socle doré, puis repousse les pillards gobelins qui fondent sur nos remparts !',
  },
  act5_kaelen: {
    key: 'act5_kaelen',
    actNumber: 5,
    speaker: 'Kaelen',
    speakerTitle: 'Cheffe des Éclaireurs Hors-Frontière',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    url: '/assets/audio/tts/act5_kaelen.wav',
    text: "Merci de m'avoir libérée ! Affecte un survivant au rôle d'Éclaireur dans le panneau gauche : nous irons patrouiller au-delà de la frontière pour traquer les mutations.",
  },
  act6_kaelen: {
    key: 'act6_kaelen',
    actNumber: 6,
    speaker: 'Kaelen',
    speakerTitle: 'Cheffe des Éclaireurs Hors-Frontière',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    url: '/assets/audio/tts/act6_kaelen.wav',
    text: "Alerte prioritaire ! J'ai repéré un Bébé Troll de Feu au Nord-Est ! C'est un Patient Zéro : élimine-le vite avant qu'il ne devienne adulte et ne se reproduise !",
  },
  act7_kaelen: {
    key: 'act7_kaelen',
    actNumber: 7,
    speaker: 'Kaelen',
    speakerTitle: 'Cheffe des Éclaireurs Hors-Frontière',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    url: '/assets/audio/tts/act7_kaelen.wav',
    text: "Bien joué ! L'écosystème darwinien s'éveille maintenant sur toute l'île. Mais attention aux Dragons de la caldeira : tant qu'on ne les attaque pas, ils nous laissent en paix !",
  },
  alert_patient_zero: {
    key: 'alert_patient_zero',
    actNumber: null,
    speaker: 'Kaelen',
    speakerTitle: 'Cheffe des Éclaireurs Hors-Frontière',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    url: '/assets/audio/tts/alert_patient_zero.wav',
    text: 'Alerte Éclaireur ! Nouveau Patient Zéro mutant repéré dans les terres sauvages ! Traque-le avant le prochain cycle de reproduction !',
  },
  alert_dragon_wrath: {
    key: 'alert_dragon_wrath',
    actNumber: null,
    speaker: 'Kaelen',
    speakerTitle: 'Cheffe des Éclaireurs Hors-Frontière',
    voiceModel: 'gemini-v4s-tts',
    voiceName: 'Kore',
    url: '/assets/audio/tts/alert_dragon_wrath.wav',
    text: "Malheur ! Tu as provoqué un Dragon Souverain ! Toute l'espèce entre en fureur et fond sur notre Bastion !",
  },
};

/**
 * Catalogue des 4 pistes musicales adaptatives générées via Lyria 3 (`lyria-3-mp3`).
 */
export const LYRIA_MUSIC_STEMS = {
  tutorial: {
    id: 'tutorial',
    title: 'Parchemin du Sanctuaire (Tutoriel & Dialogue)',
    url: '/assets/audio/music/lyria_tutorial_dialogue.mp3',
    bpm: 85,
    baseVolume: 0.42,
    prompt:
      'Mystical, warm acoustic fantasy chamber music with gentle harp, celesta, soft woodwinds, and parchment expedition atmosphere, calm and curious, 85 bpm',
  },
  peace: {
    id: 'peace',
    title: 'Veillée du Bastion (Exploration & Camp)',
    url: '/assets/audio/music/lyria_sanctuary_peace.mp3',
    bpm: 92,
    baseVolume: 0.44,
    prompt:
      'Peaceful atmospheric fantasy bastion music, warm acoustic guitar, soft cello, ambient forest breeze and gentle runic chimes, 92 bpm',
  },
  combat: {
    id: 'combat',
    title: 'Escarmouche Sauvage (Combat de Meute)',
    url: '/assets/audio/music/lyria_combat_pack.mp3',
    bpm: 128,
    baseVolume: 0.50,
    prompt:
      'Driving dark-fantasy action roguelike combat music, tribal war drums, tense staccato strings, dynamic brass, 128 bpm',
  },
  boss: {
    id: 'boss',
    title: 'Patient Zéro & Courroux Draconique (Urgence Vitale)',
    url: '/assets/audio/music/lyria_boss_mutation_wrath.mp3',
    bpm: 145,
    baseVolume: 0.56,
    prompt:
      'Epic apocalyptic boss battle music, blazing brass, intense fast percussion, dark choir and volcanic fire energy, 145 bpm',
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
 * Gestionnaire principal du son, des voix françaises Gemini TTS, de la musique adaptative Lyria
 * et des effets sonores procéduraux WebAudio.
 */
export class SoundManager {
  /**
   * @param {Object} [options={}]
   * @param {boolean} [options.muted=false] - Démarre en mode muet si true.
   */
  constructor(options = {}) {
    /** @type {boolean} */
    this.isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    /** @type {boolean} */
    this.muted = Boolean(options.muted);
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

    // --- État Voix TTS (Gemini TTS) ---
    /** @type {HTMLAudioElement|null} */
    this.activeVoiceAudio = null;
    /** @type {boolean} */
    this.isVoiceSpeaking = false;
    /** @type {string|null} */
    this.currentVoiceKey = 'act1_aldric';
    /** @type {string|null} */
    this.pendingAutoplayVoiceKey = null;
    /** @type {Set<Function>} */
    this.voiceListeners = new Set();

    // --- État Musique Adaptative Lyria 3 + Lyria Realtime ---
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
    };
    /** @type {string} */
    this.activeStemId = 'tutorial';
    /** @type {number} */
    this.musicDuckMultiplier = 1.0;

    // --- Télémétrie & État Adaptatif Temps Réel ---
    /** @type {Object} */
    this.adaptiveState = {
      stemId: 'tutorial',
      modeLabelFR: '📜 Sanctuaire & Dialogue (85 BPM)',
      shortStatusFR: '🔊 Lyria : 📜 Dialogue & Sanctuaire',
      bpm: 85,
      hpRatio: 1.0,
      isLowHp: false,
      isCriticalHp: false,
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
     * Sorts élémentaires récemment lancés par le joueur : `{ element: expiresAtMs }`
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

    if (this.isBrowser) {
      this._initAudioStems();
      this._bindUserGestureUnlock();
    }

    logger.info(
      'AUDIO',
      'SoundManager initialisé (Gemini TTS Français 9 voix + Lyria Adaptive 4 stems + WebAudio SFX)',
      {
        ttsTracks: Object.keys(TTS_VOICE_CATALOG).length,
        lyriaStems: Object.keys(LYRIA_MUSIC_STEMS),
        lyriaRealtimeModel: this.lyriaRealtime.model,
      }
    );
  }

  /**
   * Précharge les 4 pistes MP3 Lyria 3 (`public/assets/audio/music/*.mp3`).
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
   * Initialise ou reprend le `AudioContext` WebAudio.
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
        this.sfxGain.gain.value = 0.9;
        this.sfxGain.connect(this.masterGain);

        this.elementalLayerGain = this.ctx.createGain();
        this.elementalLayerGain.gain.value = 0.16;
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
   * Déverrouille automatiquement le contexte WebAudio et lance la voix ou musique en attente
   * dès le premier clic ou la première touche pressée par le joueur.
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
   * Démarre la lecture HTMLAudio de la piste Lyria active si elle est en pause.
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
  // 1. VOIX FRANÇAISES GEMINI TTS (TUTORIEL ACTES 1–7 & ALERTES)
  // ============================================================================

  /**
   * Résout un numéro d'acte (`1..7`) ou une clé (`'act1_aldric'`, `'alert_patient_zero'`, etc.)
   * vers l'entrée correspondante dans `TTS_VOICE_CATALOG`.
   *
   * @param {number|string} actNumberOrKey
   * @returns {Object|null}
   */
  resolveVoiceEntry(actNumberOrKey) {
    if (actNumberOrKey === null || actNumberOrKey === undefined) return null;
    if (typeof actNumberOrKey === 'number' || /^[1-7]$/.test(String(actNumberOrKey).trim())) {
      const actNum = Number(actNumberOrKey);
      const byAct = {
        1: TTS_VOICE_CATALOG.act1_aldric,
        2: TTS_VOICE_CATALOG.act2_aldric,
        3: TTS_VOICE_CATALOG.act3_aldric,
        4: TTS_VOICE_CATALOG.act4_aldric,
        5: TTS_VOICE_CATALOG.act5_kaelen,
        6: TTS_VOICE_CATALOG.act6_kaelen,
        7: TTS_VOICE_CATALOG.act7_kaelen,
      };
      return byAct[actNum] || null;
    }

    const raw = String(actNumberOrKey).trim().toLowerCase();
    if (TTS_VOICE_CATALOG[raw]) return TTS_VOICE_CATALOG[raw];

    const shortActMatch = raw.match(/^act([1-7])$/);
    if (shortActMatch) {
      return this.resolveVoiceEntry(Number(shortActMatch[1]));
    }
    return null;
  }

  /**
   * Abonne un callback aux changements d'état de prise de parole TTS (`(isSpeaking, voiceMeta) => void`).
   * Permet au HUD d'animer les portraits Nano Banana ("simagrées") pendant que le personnage parle.
   *
   * @param {Function} callback
   * @returns {Function} Fonction de désabonnement.
   */
  onVoiceStateChange(callback) {
    if (typeof callback === 'function') {
      this.voiceListeners.add(callback);
    }
    return () => this.voiceListeners.delete(callback);
  }

  /**
   * Notifie les écouteurs UI et dispatch un événement DOM `genesis:voice-state`.
   * @param {boolean} speaking
   * @param {Object|null} voiceMeta
   * @private
   */
  _notifyVoiceState(speaking, voiceMeta) {
    this.isVoiceSpeaking = speaking;
    this.musicDuckMultiplier = speaking ? 0.22 : 1.0; // -12dB ducking pendant le dialogue

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
   * Joue la ligne de dialogue française Gemini TTS correspondant à l'Acte du tutoriel (`1..7`)
   * ou à une alerte (`'alert_patient_zero'`, `'alert_dragon_wrath'`), avec atténuation automatique
   * (`-12 dB`) de la musique Lyria pendant la prise de parole.
   *
   * @param {number|string} actNumberOrKey - Numéro d'acte (`1..7`) ou clé (`'act1_aldric'`, `'alert_patient_zero'`, `'alert_dragon_wrath'`).
   * @param {Function} [onStart] - Callback appelé au démarrage effectif de la voix.
   * @param {Function} [onEnd] - Callback appelé à la fin de la voix.
   * @returns {Object|null} Métadonnées de la voix lancée.
   */
  playTutorialVoice(actNumberOrKey, onStart, onEnd) {
    const entry = this.resolveVoiceEntry(actNumberOrKey);
    if (!entry) {
      logger.warn('AUDIO', `Clé de voix TTS inconnue : ${String(actNumberOrKey)}`);
      return null;
    }

    this.currentVoiceKey = entry.key;

    // Traçabilité stricte LLM / Gemini TTS
    logger.info(
      'AUDIO',
      `[LLM Gemini TTS] Lecture voix française "${entry.key}" (${entry.speaker} — voix ${entry.voiceName})`,
      {
        model: entry.voiceModel,
        voice: entry.voiceName,
        speaker: entry.speaker,
        url: entry.url,
        transcript: entry.text,
      }
    );

    if (!this.isBrowser || typeof Audio === 'undefined') {
      if (typeof onStart === 'function') onStart(entry);
      if (typeof onEnd === 'function') onEnd(entry);
      return entry;
    }

    this.stopVoice();

    if (this.muted) {
      this.pendingAutoplayVoiceKey = entry.key;
      return entry;
    }

    try {
      const audio = new Audio(entry.url);
      audio.volume = 0.96;
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
          // Si le navigateur bloque l'autoplay avant le 1er clic (ex: Acte 1 au chargement),
          // on mémorise la clé pour la lancer dès la première interaction du joueur.
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
   * Réécoute la ligne de voix du tutoriel ou de l'alerte en cours (`🔈 Réécouter Voix`).
   * @param {Function} [onStart]
   * @param {Function} [onEnd]
   * @returns {Object|null}
   */
  replayCurrentVoice(onStart, onEnd) {
    this._ensureAudioContext();
    const key = this.currentVoiceKey || this.pendingAutoplayVoiceKey || 'act1_aldric';
    return this.playTutorialVoice(key, onStart, onEnd);
  }

  /**
   * Interrompt immédiatement toute voix TTS en cours de lecture.
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
  // 2. MUSIQUE ADAPTATIVE LYRIA REALTIME + MULTI-STEMS + SYNTHÉTISEUR ÉLÉMENTAIRE
  // ============================================================================

  /**
   * Enregistre l'utilisation d'un élément par un sort du joueur ou une attaque ennemie
   * afin d'enrichir pendant quelques secondes la couche harmonique et le prompt Lyria Realtime.
   *
   * @param {'fire'|'ice'|'venom'|'lightning'|'arcane'|'earth'} elementId
   * @param {number} [durationMs=6500]
   */
  registerActiveElement(elementId, durationMs = 6500) {
    if (!elementId || !ELEMENT_SIGNATURES[elementId]) return;
    this._recentPlayerElements.set(elementId, Date.now() + durationMs);
  }

  /**
   * Met à jour à chaque frame la musique adaptative Lyria (Stems MP3 + `LyriaRealtimeClient` + couches WebAudio)
   * en fonction :
   * 1. De l'état Tutoriel / Dialogue (`tutorialActive`, `isVoiceSpeaking`),
   * 2. Du ratio de PV du joueur (`player.hp / player.maxHp`),
   * 3. De l'état Combat vs Paix et de l'espèce / clade combattu (`greenskin`, `beast`, `mutant`, `dragon`),
   * 4. Des éléments actifs utilisés par les monstres et par les sorts du joueur (`fire`, `ice`, `venom`, `lightning`, `arcane`, `earth`).
   *
   * @param {Object} [state={}]
   * @param {Object} [state.player] - Instance `PlayerController` (`hp`, `maxHp`, `position`, `combatSystem`).
   * @param {Array<Object>} [state.enemies] - Liste des ennemis actifs (`enemyManager.getEnemies()`).
   * @param {boolean} [state.tutorialActive] - True si le tutoriel en 7 Actes est en cours.
   * @param {number} [state.tutorialAct] - Numéro de l'acte actuel (`1..7`).
   * @param {boolean} [state.isTutorialDialogue] - Force l'état dialogue si précisé.
   * @param {boolean} [state.isModalPaused] - True si une modale (Level-Up / Codex) est ouverte.
   * @param {boolean} [state.dragonWrathActive] - True si l'espèce Dragon est en Courroux Draconique.
   */
  updateAdaptiveMusic(state = {}) {
    const nowMs = Date.now();

    // 1. Extraction de l'état de santé du joueur
    const player = state.player || null;
    const hp = player && typeof player.hp === 'number' ? player.hp : 160;
    const maxHp = player && typeof player.maxHp === 'number' && player.maxHp > 0 ? player.maxHp : 160;
    const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
    const isLowHp = hpRatio < 0.45;
    const isCriticalHp = hpRatio < 0.25;

    // 2. Analyse des ennemis proches (< 26m) : Clades, Espèces, Mutants Patient Zéro & Éléments
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

    // Nettoyage des éléments de sorts expirés
    for (const [el, expMs] of this._recentPlayerElements.entries()) {
      if (expMs > nowMs) {
        activeElementSet.add(el);
      } else {
        this._recentPlayerElements.delete(el);
      }
    }

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || e.isDead || e.hp <= 0) continue;
      const ex = e.position?.x ?? e.x ?? 0;
      const ez = e.position?.z ?? e.z ?? 0;
      const dx = ex - px;
      const dz = ez - pz;
      const dSq = dx * dx + dz * dz;
      if (dSq > combatRadiusSq) continue;

      const spId = e.speciesId || e.genome?.speciesId || 'goblin';
      // Un dragon pacifique non provoqué ne déclenche pas la musique de combat à lui seul
      if (spId === 'dragon' && !state.dragonWrathActive && e.state !== 'attack' && e.state !== 'chase') {
        continue;
      }

      nearbyEnemyCount++;
      speciesCounts[spId] = (speciesCounts[spId] || 0) + 1;

      if (spId === 'goblin' || spId === 'orc' || spId === 'troll') {
        cladeCounts.greenskin++;
      } else if (spId === 'wolf' || spId === 'lion' || spId === 'vulture') {
        cladeCounts.beast++;
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
          else if (mId === 'cryo_blood') activeElementSet.add('ice');
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

    // Clade et espèce dominants
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

    // 3. Sélection de la piste maîtresse Lyria 3 (`tutorial`, `peace`, `combat`, `boss`)
    let targetStemId = 'peace';
    let modeLabelFR = '🌿 Paix du Bastion (92 BPM)';
    let targetBpm = 92;

    if (fightingDragon) {
      targetStemId = 'boss';
      targetBpm = 145;
      modeLabelFR = '🐉 Courroux Draconique (145 BPM)';
    } else if (inCombat && (hasMutantNearby || isCriticalHp)) {
      targetStemId = 'boss';
      targetBpm = 145;
      modeLabelFR = isCriticalHp
        ? '💔 Urgence Vitale & Combat (145 BPM)'
        : '🧬 Traque Patient Zéro (145 BPM)';
    } else if (inCombat) {
      targetStemId = 'combat';
      targetBpm = isLowHp ? 136 : 128;
      if (dominantClade === 'greenskin') {
        modeLabelFR = `⚔️ Combat Peaux-Vertes (${targetBpm} BPM)`;
      } else if (dominantClade === 'beast') {
        modeLabelFR = `🐺 Meute Bêtes Sauvages (${targetBpm} BPM)`;
      } else {
        modeLabelFR = `⚔️ Escarmouche (${targetBpm} BPM)`;
      }
    } else if (isTutorialDialogue) {
      targetStemId = 'tutorial';
      targetBpm = 85;
      const speakerEntry = this.resolveVoiceEntry(this.currentVoiceKey);
      const speakerTag =
        this.isVoiceSpeaking && speakerEntry ? ` · 🎙️ ${speakerEntry.speaker}` : '';
      modeLabelFR = `📜 Sanctuaire & Dialogue (85 BPM${speakerTag})`;
    } else if (isCriticalHp) {
      targetStemId = 'combat';
      targetBpm = 132;
      modeLabelFR = '💓 Survie Critique (132 BPM)';
    }

    const elementBadges = activeElements
      .slice(0, 2)
      .map((el) => ELEMENT_SIGNATURES[el]?.labelFR.split(' ')[0] || '')
      .join('');
    const shortStatusFR = this.muted
      ? '🔇 Audio Muet'
      : `🔊 Lyria : ${modeLabelFR}${elementBadges ? ` ${elementBadges}` : ''}`;

    // Changement de piste maîtresse Lyria
    if (targetStemId !== this.activeStemId) {
      const prevStem = this.activeStemId;
      this.activeStemId = targetStemId;
      logger.info(
        'AUDIO',
        `[LLM Lyria 3 Stem] Transition musicale : "${prevStem}" -> "${targetStemId}" (${modeLabelFR})`,
        {
          fromStem: prevStem,
          toStem: targetStemId,
          trackUrl: LYRIA_MUSIC_STEMS[targetStemId]?.url,
          bpm: targetBpm,
          hpRatio: Number(hpRatio.toFixed(2)),
          dominantClade,
          dominantSpecies,
          activeElements,
        }
      );
      this._ensureActiveStemPlaying();
    }

    this.adaptiveState = {
      stemId: targetStemId,
      modeLabelFR,
      shortStatusFR,
      bpm: targetBpm,
      hpRatio,
      isLowHp,
      isCriticalHp,
      inCombat,
      nearbyEnemyCount,
      dominantClade,
      dominantSpecies,
      hasMutantNearby,
      dragonWrathActive: fightingDragon,
      activeElements,
      isTutorialDialogue,
    };

    // 4. Crossfade fluide des volumes HTMLAudio + Ducking (-12dB) pendant les voix TTS
    this._updateStemCrossfades(state.isModalPaused);

    // 5. Battement de cœur sub-bass WebAudio si PV faibles (< 45%)
    if (isLowHp && !this.muted) {
      const heartbeatIntervalMs = isCriticalHp ? 460 : 760;
      if (nowMs - this._lastHeartbeatMs >= heartbeatIntervalMs) {
        this._lastHeartbeatMs = nowMs;
        this._playLowHpHeartbeat(isCriticalHp);
      }
    }

    // 6. Texture harmonique élémentaire WebAudio temps réel (toutes les ~1.6s si élément actif)
    if (activeElements.length > 0 && !this.muted && nowMs - this._lastElementalPulseMs >= 1650) {
      this._lastElementalPulseMs = nowMs;
      const chosenEl = activeElements[Math.floor(nowMs / 1650) % activeElements.length];
      this._playElementalTexturePulse(chosenEl, inCombat);
    }

    // 7. Mise à jour périodique des `weightedPrompts` pour Lyria Realtime (`models/lyria-realtime-exp`)
    if (nowMs - this._lastStateEvalMs >= 1500) {
      this._lastStateEvalMs = nowMs;
      const weightedPrompts = this._buildLyriaWeightedPrompts();
      const density = fightingDragon
        ? 0.92
        : inCombat
        ? 0.75
        : isTutorialDialogue
        ? 0.35
        : 0.45;
      const brightness = activeElements.includes('ice') || activeElements.includes('lightning')
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
   * Construit le vecteur de prompts pondérés (`weightedPrompts`) envoyé à `models/lyria-realtime-exp`.
   * @returns {Array<{text: string, weight: number}>}
   * @private
   */
  _buildLyriaWeightedPrompts() {
    const s = this.adaptiveState;
    const prompts = [];

    // Couche de base selon l'état (Tutoriel / Paix / Combat / Boss)
    const baseStem = LYRIA_MUSIC_STEMS[s.stemId] || LYRIA_MUSIC_STEMS.peace;
    prompts.push({
      text: baseStem.prompt,
      weight: this.isVoiceSpeaking ? 0.45 : 1.0,
    });

    // Couche Santé du Joueur (PV bas / critiques)
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

    // Couche Espèce / Clade combattu
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

    // Couches Élémentaires actives (Monstres + Sorts du Joueur)
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
   * Effectue le fondu enchaîné (crossfade) entre les 4 pistes MP3 Lyria et applique le ducking `-12 dB`
   * lorsqu'une voix française Gemini TTS est en train de parler.
   *
   * @param {boolean} [isModalPaused=false]
   * @private
   */
  _updateStemCrossfades(isModalPaused = false) {
    if (!this.isBrowser) return;

    const modalAttenuation = isModalPaused ? 0.55 : 1.0;
    const duckMult = this.isVoiceSpeaking ? 0.22 : 1.0;
    const speedRate = this.adaptiveState.isCriticalHp
      ? 1.06
      : this.adaptiveState.isLowHp
      ? 1.03
      : 1.0;

    for (const [stemId, meta] of Object.entries(LYRIA_MUSIC_STEMS)) {
      const audio = this.stemElements[stemId];
      if (!audio) continue;

      const isTarget = stemId === this.activeStemId && !this.muted;
      const targetVol = isTarget ? meta.baseVolume * duckMult * modalAttenuation : 0;
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
   * Retourne l'état complet de la musique adaptative Lyria et des voix TTS pour l'affichage HUD.
   * @returns {Object}
   */
  getMusicTelemetryForHUD() {
    const voiceEntry = this.resolveVoiceEntry(this.currentVoiceKey);
    return {
      muted: this.muted,
      activeStemId: this.activeStemId,
      activeTrackTitle: LYRIA_MUSIC_STEMS[this.activeStemId]?.title || 'Sanctuaire',
      modeLabelFR: this.adaptiveState.modeLabelFR,
      shortStatusFR: this.adaptiveState.shortStatusFR,
      bpm: this.adaptiveState.bpm,
      hpRatio: this.adaptiveState.hpRatio,
      isLowHp: this.adaptiveState.isLowHp,
      isCriticalHp: this.adaptiveState.isCriticalHp,
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
   * Bascule l'état muet (`Mute / Unmute`) de l'ensemble du moteur audio.
   * @returns {boolean} Nouvel état `muted`.
   */
  toggleMute() {
    return this.setMuted(!this.muted);
  }

  /**
   * Définit explicitement l'état muet (`muted`).
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
    logger.info('AUDIO', this.muted ? 'Audio mis en sourdine (Mute)' : 'Audio réactivé (Unmute)');
    return this.muted;
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
}

export default SoundManager;
