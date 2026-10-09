class_name AudioDirector
extends Node
## Module: scripts/audio/AudioDirector.gd
## Description:
##   Bilingual Audio, Lyria 3 Adaptive Music Crossfader, Gemini TTS Voiceover Player
##   (30 WAV tracks: 15 English default + 15 French 2nd option), and Real-Time
##   Procedural SFX Synthesizer (`AudioStreamGenerator`) for Genesis Bastion (Godot 4.3 Edition).
##
## Use Cases:
##   1. Adaptive Music: Crossfades `explore_lyria.wav`, `combat_lyria.wav`, and
##      `requiem_gameover_lyria.wav` based on combat state, HP ratio, Dragon Wrath, and Game Over.
##   2. Bilingual Voiceovers: Plays English (`res://assets/audio/tts/en/<key>.wav`, default `"en"`)
##      or French (`res://assets/audio/tts/<key>.wav`, `"fr"`) Gemini TTS lines (`Fenrir` & `Kore`)
##      with automatic `-12 dB` music ducking and instant live language switching.
##   3. Procedural SFX: Synthesizes zero-latency waveforms via `AudioStreamGenerator` for sword
##      slashes, spells, resource harvesting, level-up fanfares, dragon roars, and relic resonance.

signal voice_state_changed(is_speaking: bool, voice_entry: Dictionary)
signal music_stem_changed(new_stem: String, bpm: int)
signal audio_settings_changed(settings: Dictionary)

const LYRIA_STEM_PATHS: Dictionary = {
	"explore": "res://assets/audio/lyria/explore_lyria.wav",
	"tutorial": "res://assets/audio/lyria/tutorial_lyria.wav",
	"combat": "res://assets/audio/lyria/combat_lyria.wav",
	"boss": "res://assets/audio/lyria/boss_lyria.wav",
	"requiem": "res://assets/audio/lyria/requiem_gameover_lyria.wav",
}

const LYRIA_STEM_BPM: Dictionary = {
	"explore": 92,
	"tutorial": 85,
	"combat": 128,
	"boss": 145,
	"requiem": 64,
}

const VOICE_CATALOG: Dictionary = {
	"act1_aldric": {
		"key": "act1_aldric",
		"act": 1,
		"speaker": "Aldric",
		"voice": "Fenrir",
		"role_en": "Master Biologist & Bastion Forgemaster",
		"role_fr": "Maître Biologiste & Forgeron du Bastion",
		"path_en": "res://assets/audio/tts/en/act1_aldric.wav",
		"path_fr": "res://assets/audio/tts/act1_aldric.wav",
		"text_en": "Welcome to the Bastion Sanctuary, Guardian. The ecosystem around us is frozen for now. Walk to the golden beacon to the South and adjust your camera.",
		"text_fr": "Bienvenue au Sanctuaire du Bastion, Gardien. L'écosystème autour de nous est figé pour l'instant. Marche jusqu'à la balise dorée au Sud et ajuste ta caméra.",
	},
	"act2_aldric": {
		"key": "act2_aldric",
		"act": 2,
		"speaker": "Aldric",
		"voice": "Fenrir",
		"role_en": "Master Biologist & Bastion Forgemaster",
		"role_fr": "Maître Biologiste & Forgeron du Bastion",
		"path_en": "res://assets/audio/tts/en/act2_aldric.wav",
		"path_fr": "res://assets/audio/tts/act2_aldric.wav",
		"text_en": "A stray Goblin and an Orc marauder are approaching! Strike them with your runic sword, dodge with Shift, and choose your first spell at level two.",
		"text_fr": "Un Gobelin égaré puis un Orc maraudeur approchent ! Frappe-les avec ton épée runique, esquive avec Shift, et choisis ton premier sort au niveau deux.",
	},
	"act3_aldric": {
		"key": "act3_aldric",
		"act": 3,
		"speaker": "Aldric",
		"voice": "Fenrir",
		"role_en": "Master Biologist & Bastion Forgemaster",
		"role_fr": "Maître Biologiste & Forgeron du Bastion",
		"path_en": "res://assets/audio/tts/en/act3_aldric.wav",
		"path_fr": "res://assets/audio/tts/act3_aldric.wav",
		"text_en": "Eliminate that wolf, rescue the survivor locked in the cage to the Southeast with the E key, then harvest wood or crystal for our camp.",
		"text_fr": "Élimine ce loup, libère le survivant enfermé dans la cage au Sud-Est avec la touche E, puis récolte du bois ou du cristal pour notre camp.",
	},
	"act4_aldric": {
		"key": "act4_aldric",
		"act": 4,
		"speaker": "Aldric",
		"voice": "Fenrir",
		"role_en": "Master Biologist & Bastion Forgemaster",
		"role_fr": "Maître Biologiste & Forgeron du Bastion",
		"path_en": "res://assets/audio/tts/en/act4_aldric.wav",
		"path_fr": "res://assets/audio/tts/act4_aldric.wav",
		"text_en": "Use our resources to build a Watchtower on the golden pad, then repel the goblin raiders charging our ramparts!",
		"text_fr": "Utilise nos ressources pour bâtir une Tour de Guet sur le socle doré, puis repousse les pillards gobelins qui fondent sur nos remparts !",
	},
	"act5_kaelen": {
		"key": "act5_kaelen",
		"act": 5,
		"speaker": "Kaelen",
		"voice": "Kore",
		"role_en": "Chief of Outrider Scouts",
		"role_fr": "Cheffe des Éclaireurs Hors-Frontière",
		"path_en": "res://assets/audio/tts/en/act5_kaelen.wav",
		"path_fr": "res://assets/audio/tts/act5_kaelen.wav",
		"text_en": "Thank you for freeing me! Assign a survivor to the Scout role in the left panel: we will patrol beyond the frontier to track down mutations.",
		"text_fr": "Merci de m'avoir libérée ! Affecte un survivant au rôle d'Éclaireur dans le panneau gauche : nous irons patrouiller au-delà de la frontière pour traquer les mutations.",
	},
	"act6_kaelen": {
		"key": "act6_kaelen",
		"act": 6,
		"speaker": "Kaelen",
		"voice": "Kore",
		"role_en": "Chief of Outrider Scouts",
		"role_fr": "Cheffe des Éclaireurs Hors-Frontière",
		"path_en": "res://assets/audio/tts/en/act6_kaelen.wav",
		"path_fr": "res://assets/audio/tts/act6_kaelen.wav",
		"text_en": "Priority alert! I have spotted a Baby Fire Troll to the Northeast! It is a Patient Zero: eliminate it quickly before it matures and reproduces!",
		"text_fr": "Alerte prioritaire ! J'ai repéré un Bébé Troll de Feu au Nord-Est ! C'est un Patient Zéro : élimine-le vite avant qu'il ne devienne adulte et ne se reproduise !",
	},
	"act7_kaelen": {
		"key": "act7_kaelen",
		"act": 7,
		"speaker": "Kaelen",
		"voice": "Kore",
		"role_en": "Chief of Outrider Scouts",
		"role_fr": "Cheffe des Éclaireurs Hors-Frontière",
		"path_en": "res://assets/audio/tts/en/act7_kaelen.wav",
		"path_fr": "res://assets/audio/tts/act7_kaelen.wav",
		"text_en": "Well done! The Darwinian ecosystem now awakens across the entire island. But beware the caldera Dragons: as long as we do not attack them, they leave us in peace!",
		"text_fr": "Bien joué ! L'écosystème darwinien s'éveille maintenant sur toute l'île. Mais attention aux Dragons de la caldeira : tant qu'on ne les attaque pas, ils nous laissent en paix !",
	},
	"alert_patient_zero": {
		"key": "alert_patient_zero",
		"act": 0,
		"speaker": "Kaelen",
		"voice": "Kore",
		"role_en": "Chief of Outrider Scouts",
		"role_fr": "Cheffe des Éclaireurs Hors-Frontière",
		"path_en": "res://assets/audio/tts/en/alert_patient_zero.wav",
		"path_fr": "res://assets/audio/tts/alert_patient_zero.wav",
		"text_en": "Scout Alert! A new mutant Patient Zero has been spotted in the wilds! Hunt it down before the next breeding cycle!",
		"text_fr": "Alerte Éclaireur ! Nouveau Patient Zéro mutant repéré dans les terres sauvages ! Traque-le avant le prochain cycle de reproduction !",
	},
	"alert_dragon_wrath": {
		"key": "alert_dragon_wrath",
		"act": 0,
		"speaker": "Kaelen",
		"voice": "Kore",
		"role_en": "Chief of Outrider Scouts",
		"role_fr": "Cheffe des Éclaireurs Hors-Frontière",
		"path_en": "res://assets/audio/tts/en/alert_dragon_wrath.wav",
		"path_fr": "res://assets/audio/tts/alert_dragon_wrath.wav",
		"text_en": "Disaster! You have provoked a Sovereign Dragon! The entire species has entered a frenzy and is descending upon our Bastion!",
		"text_fr": "Malheur ! Tu as provoqué un Dragon Souverain ! Toute l'espèce entre en fureur et fond sur notre Bastion !",
	},
	"alert_shark_landing": {
		"key": "alert_shark_landing",
		"act": 0,
		"speaker": "Kaelen",
		"voice": "Kore",
		"role_en": "Chief of Outrider Scouts",
		"role_fr": "Cheffe des Éclaireurs Hors-Frontière",
		"path_en": "res://assets/audio/tts/en/alert_shark_landing.wav",
		"path_fr": "res://assets/audio/tts/alert_shark_landing.wav",
		"text_en": "Coastal alert! Abyssal Sharks have evolved amphibious legs and are storming onto our beaches!",
		"text_fr": "Alerte côtière ! Les Requins des Abysses ont développé des pattes amphibies et débarquent sur nos plages !",
	},
	"alert_mole_eruption": {
		"key": "alert_mole_eruption",
		"act": 0,
		"speaker": "Kaelen",
		"voice": "Kore",
		"role_en": "Chief of Outrider Scouts",
		"role_fr": "Cheffe des Éclaireurs Hors-Frontière",
		"path_en": "res://assets/audio/tts/en/alert_mole_eruption.wav",
		"path_fr": "res://assets/audio/tts/alert_mole_eruption.wav",
		"text_en": "Watch the ground beneath your feet! Burrowing Giant Moles are erupting from underground tunnels!",
		"text_fr": "Attention sous vos pieds ! Des Taupes Géantes Fouisseuses surgissent des galeries souterraines !",
	},
	"alert_prey_crisis": {
		"key": "alert_prey_crisis",
		"act": 0,
		"speaker": "Kaelen",
		"voice": "Kore",
		"role_en": "Chief of Outrider Scouts",
		"role_fr": "Cheffe des Éclaireurs Hors-Frontière",
		"path_en": "res://assets/audio/tts/en/alert_prey_crisis.wav",
		"path_fr": "res://assets/audio/tts/alert_prey_crisis.wav",
		"text_en": "Ecological alert! Our spells have decimated the herbivore prey! Without deer or rabbits, famine looms and the predators are going berserk!",
		"text_fr": "Alerte écologique ! Nos sorts ont décimé le gibier herbivore ! Sans biches ni lapins, la famine menace et les prédateurs deviennent fous !",
	},
	"alert_relic_found": {
		"key": "alert_relic_found",
		"act": 0,
		"speaker": "Aldric",
		"voice": "Fenrir",
		"role_en": "Master Biologist & Bastion Forgemaster",
		"role_fr": "Maître Biologiste & Forgeron du Bastion",
		"path_en": "res://assets/audio/tts/en/alert_relic_found.wav",
		"path_fr": "res://assets/audio/tts/alert_relic_found.wav",
		"text_en": "Eden Relic Fragment recovered! Gather all three ancient fragments to raise the Solar Shield Dome across the entire island!",
		"text_fr": "Fragment de Relique d'Éden récupéré ! Rassemble les trois fragments anciens pour ériger le Dôme-Bouclier Solaire sur toute l'île !",
	},
	"alert_island_victory": {
		"key": "alert_island_victory",
		"act": 0,
		"speaker": "Aldric",
		"voice": "Fenrir",
		"role_en": "Master Biologist & Bastion Forgemaster",
		"role_fr": "Maître Biologiste & Forgeron du Bastion",
		"path_en": "res://assets/audio/tts/en/alert_island_victory.wav",
		"path_fr": "res://assets/audio/tts/alert_island_victory.wav",
		"text_en": "Victory! The Shield of Eden shines across the entire island and purifies the ecosystem! Our Bastion is unbreakable: prepare to set sail for the next island!",
		"text_fr": "Victoire ! Le Bouclier d'Éden rayonne sur toute l'île et purifie l'écosystème ! Notre Bastion est inviolable : prépare-toi à voguer vers la prochaine île !",
	},
	"alert_gameover_requiem": {
		"key": "alert_gameover_requiem",
		"act": 0,
		"speaker": "Aldric",
		"voice": "Fenrir",
		"role_en": "Master Biologist & Bastion Forgemaster",
		"role_fr": "Maître Biologiste & Forgeron du Bastion",
		"path_en": "res://assets/audio/tts/en/alert_gameover_requiem.wav",
		"path_fr": "res://assets/audio/tts/alert_gameover_requiem.wav",
		"text_en": "The Guardian has fallen, and shadows close in upon the Bastion. In this unforgiving world, every death seals the fate of an expedition. Will you start anew for a fresh lineage, or invoke the Sanctuary's Grace to carry on?",
		"text_fr": "Le Gardien est tombé et les ombres se referment sur le Bastion. Dans ce monde impitoyable, toute mort scelle le destin d'une expédition. Veux-tu repartir à zéro pour une nouvelle lignée, ou invoquer la Grâce du Sanctuaire pour continuer ?",
	},
}

var language: String = "en"
var muted: bool = false
var music_volume: float = 0.85
var voice_volume: float = 1.0
var sfx_volume: float = 0.90

var active_stem: String = "explore"
var current_voice_key: String = "act1_aldric"
var last_played_voice_key: String = "act1_aldric"
var is_voice_speaking: bool = false
var is_game_over_requiem: bool = false
var in_combat_state: bool = false
var dragon_wrath_state: bool = false
var hp_ratio_state: float = 1.0

var _stem_players: Dictionary = {}
var _stem_linear_gains: Dictionary = {
	"explore": 0.65,
	"combat": 0.0,
	"requiem": 0.0,
}
var _voice_player: AudioStreamPlayer = null
var _sfx_player: AudioStreamPlayer = null
var _sfx_generator: AudioStreamGenerator = null
var _sfx_playback: AudioStreamGeneratorPlayback = null
var _stream_cache: Dictionary = {}
var _sfx_phase: float = 0.0
var _active_sfx_queue: Array = []


## Initializes Lyria music players, Gemini TTS voice player, and procedural SFX generator.
func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_setup_music_players()
	_setup_voice_player()
	_setup_sfx_generator()
	print(
		"[INFO][AUDIO] AudioDirector ready (default language=%s, TTS tracks=%d, Lyria stems=3)"
		% [language, VOICE_CATALOG.size()]
	)


## Releases cached audio resources on tree exit for zero leak warnings in headless runs.
func _exit_tree() -> void:
	_stream_cache.clear()
	_active_sfx_queue.clear()
	_stem_players.clear()
	_sfx_playback = null
	_sfx_generator = null
	_sfx_player = null
	_voice_player = null


## Per-frame adaptive crossfading for Lyria stems, voice ducking, and procedural SFX synthesis.
func _process(delta: float) -> void:
	_update_music_crossfade(delta)
	_pump_procedural_sfx_buffer()


## Creates the 3 core Lyria `AudioStreamPlayer` nodes (`explore`, `combat`, `requiem`).
func _setup_music_players() -> void:
	for stem_id in ["explore", "combat", "requiem"]:
		var player := AudioStreamPlayer.new()
		player.name = "LyriaStem_" + stem_id
		var path: String = LYRIA_STEM_PATHS.get(stem_id, "")
		var stream: AudioStream = _load_wav_stream(path, true)
		if stream != null:
			player.stream = stream
		var init_gain: float = 0.45 * music_volume if (stem_id == "explore" and not muted) else 0.0001
		player.volume_db = _linear_to_db_safe(init_gain)
		add_child(player)
		if stream != null and not muted and stem_id == "explore":
			player.play()
		_stem_players[stem_id] = player


## Creates the `AudioStreamPlayer` dedicated to bilingual Gemini TTS voiceovers.
func _setup_voice_player() -> void:
	_voice_player = AudioStreamPlayer.new()
	_voice_player.name = "GeminiTTSPlayer"
	_voice_player.finished.connect(_on_voice_finished)
	add_child(_voice_player)


## Creates the `AudioStreamGenerator` player for zero-latency procedural combat & world SFX.
func _setup_sfx_generator() -> void:
	_sfx_player = AudioStreamPlayer.new()
	_sfx_player.name = "ProceduralSFXGenerator"
	_sfx_generator = AudioStreamGenerator.new()
	_sfx_generator.mix_rate = 22050.0
	_sfx_generator.buffer_length = 0.25
	_sfx_player.stream = _sfx_generator
	_sfx_player.volume_db = _linear_to_db_safe(sfx_volume if not muted else 0.0)
	add_child(_sfx_player)
	_sfx_player.play()
	if _sfx_player.has_stream_playback():
		_sfx_playback = _sfx_player.get_stream_playback() as AudioStreamGeneratorPlayback


## Safely converts linear amplitude `[0..1]` to decibels (`-80 dB` floor).
func _linear_to_db_safe(lin: float) -> float:
	if lin <= 0.0005 or muted:
		return -80.0
	return clampf(linear_to_db(clampf(lin, 0.0005, 1.5)), -80.0, 6.0)


## Loads a `.wav` file from `res://` using `ResourceLoader` or raw RIFF WAVE PCM fallback.
func _load_wav_stream(path: String, loop_enabled: bool = false) -> AudioStream:
	if path.is_empty():
		return null
	var cache_key: String = "%s|%s" % [path, "loop" if loop_enabled else "oneshot"]
	if _stream_cache.has(cache_key):
		return _stream_cache[cache_key]

	if ResourceLoader.exists(path):
		var loaded: Resource = ResourceLoader.load(path)
		if loaded is AudioStreamWAV:
			var wav_copy: AudioStreamWAV = (loaded as AudioStreamWAV).duplicate()
			wav_copy.loop_mode = (
				AudioStreamWAV.LOOP_FORWARD if loop_enabled else AudioStreamWAV.LOOP_DISABLED
			)
			if loop_enabled and wav_copy.data.size() > 2:
				wav_copy.loop_begin = 0
				wav_copy.loop_end = int(wav_copy.data.size() / 2)
			_stream_cache[cache_key] = wav_copy
			return wav_copy
		elif loaded is AudioStream:
			_stream_cache[cache_key] = loaded
			return loaded as AudioStream

	if FileAccess.file_exists(path):
		var raw: PackedByteArray = FileAccess.get_file_as_bytes(path)
		if raw.size() > 44:
			var wav := AudioStreamWAV.new()
			wav.format = AudioStreamWAV.FORMAT_16_BITS
			wav.mix_rate = 24000
			wav.stereo = false
			wav.data = raw.slice(44)
			wav.loop_mode = (
				AudioStreamWAV.LOOP_FORWARD if loop_enabled else AudioStreamWAV.LOOP_DISABLED
			)
			if loop_enabled:
				wav.loop_begin = 0
				wav.loop_end = int(wav.data.size() / 2)
			_stream_cache[cache_key] = wav
			return wav
	return null


## Resolves an act number (`1..7`) or voice key (`"act1_aldric"`, `"alert_patient_zero"`, etc.)
## into a localized dictionary for `lang` (`"en"` default or `"fr"`).
func get_voice_entry(key_or_act: Variant, lang: String = "") -> Dictionary:
	var target_lang: String = language if lang.is_empty() else lang
	target_lang = "fr" if target_lang.to_lower().begins_with("fr") else "en"

	var resolved_key: String = ""
	if typeof(key_or_act) == TYPE_INT:
		var act_map: Dictionary = {
			1: "act1_aldric",
			2: "act2_aldric",
			3: "act3_aldric",
			4: "act4_aldric",
			5: "act5_kaelen",
			6: "act6_kaelen",
			7: "act7_kaelen",
		}
		resolved_key = act_map.get(int(key_or_act), "act1_aldric")
	else:
		var raw_key: String = str(key_or_act).strip_edges().to_lower()
		if VOICE_CATALOG.has(raw_key):
			resolved_key = raw_key
		elif VOICE_CATALOG.has("alert_" + raw_key):
			resolved_key = "alert_" + raw_key
		elif raw_key in ["1", "2", "3", "4", "5", "6", "7"]:
			return get_voice_entry(int(raw_key), target_lang)
		elif raw_key in ["gameover", "game_over", "requiem"]:
			resolved_key = "alert_gameover_requiem"

	if not VOICE_CATALOG.has(resolved_key):
		return {}

	var base: Dictionary = VOICE_CATALOG[resolved_key]
	var is_fr: bool = target_lang == "fr"
	return {
		"key": resolved_key,
		"act": base.get("act", 0),
		"speaker": base.get("speaker", "Aldric"),
		"voice": base.get("voice", "Fenrir"),
		"language": target_lang,
		"role": base.get("role_fr" if is_fr else "role_en", ""),
		"path": base.get("path_fr" if is_fr else "path_en", ""),
		"text": base.get("text_fr" if is_fr else "text_en", ""),
		"path_en": base.get("path_en", ""),
		"path_fr": base.get("path_fr", ""),
		"text_en": base.get("text_en", ""),
		"text_fr": base.get("text_fr", ""),
	}


## Sets the active voiceover & UI telemetry language (`"en"` default or `"fr"` 2nd option).
## If a voice line is currently speaking and `replay_if_speaking` is true, immediately switches playback.
func set_language(lang: String, replay_if_speaking: bool = true) -> String:
	var normalized: String = "fr" if lang.strip_edges().to_lower().begins_with("fr") else "en"
	var prev_lang: String = language
	language = normalized
	print(
		"[INFO][AUDIO][LLM Gemini TTS] Language switched: %s -> %s"
		% [prev_lang, language]
	)
	audio_settings_changed.emit(get_audio_settings())
	if replay_if_speaking and is_voice_speaking and not current_voice_key.is_empty():
		play_voice(current_voice_key, true)
	return language


## Returns the active voiceover language (`"en"` or `"fr"`).
func get_language() -> String:
	return language


## Plays a Gemini TTS voiceover in the active language (`"en"` default or `"fr"` 2nd option).
func play_voice(key: Variant, force_replay: bool = false) -> Dictionary:
	var entry: Dictionary = get_voice_entry(key, language)
	if entry.is_empty():
		print("[WARN][AUDIO] Unknown TTS voice key: %s" % str(key))
		return {}

	var resolved_key: String = entry.get("key", "act1_aldric")
	if is_voice_speaking and current_voice_key == resolved_key and not force_replay:
		return entry

	current_voice_key = resolved_key
	last_played_voice_key = resolved_key

	print(
		"[INFO][AUDIO][LLM Gemini TTS] Playing %s voice '%s' (speaker=%s, voice=%s, path=%s): \"%s\""
		% [
			language.to_upper(),
			resolved_key,
			entry.get("speaker", ""),
			entry.get("voice", ""),
			entry.get("path", ""),
			entry.get("text", ""),
		]
	)

	if _voice_player == null or muted or voice_volume <= 0.001:
		is_voice_speaking = false
		voice_state_changed.emit(false, entry)
		return entry

	var stream: AudioStream = _load_wav_stream(entry.get("path", ""), false)
	if stream != null:
		_voice_player.stop()
		_voice_player.stream = stream
		_voice_player.volume_db = _linear_to_db_safe(0.96 * voice_volume)
		_voice_player.play()
		is_voice_speaking = true
		voice_state_changed.emit(true, entry)
	else:
		is_voice_speaking = false
		voice_state_changed.emit(false, entry)

	return entry


## Alias for `play_voice` to match `SoundManager.playTutorialVoice` callers.
func play_tutorial_voice(key_or_act: Variant, force_replay: bool = false) -> Dictionary:
	return play_voice(key_or_act, force_replay)


## Replays the most recently triggered tutorial or alert voiceover in the active language.
func replay_current_voice() -> Dictionary:
	var key_to_play: String = (
		current_voice_key if not current_voice_key.is_empty() else "act1_aldric"
	)
	return play_voice(key_to_play, true)


## Stops any active Gemini TTS voiceover immediately.
func stop_voice() -> void:
	if _voice_player != null and _voice_player.playing:
		_voice_player.stop()
	if is_voice_speaking:
		is_voice_speaking = false
		voice_state_changed.emit(false, get_voice_entry(current_voice_key, language))


func _on_voice_finished() -> void:
	is_voice_speaking = false
	voice_state_changed.emit(false, get_voice_entry(current_voice_key, language))


## Updates the target Lyria stem based on combat intensity, player HP, Dragon Wrath, and Game Over.
func update_adaptive_music(state: Dictionary, _delta: float = 0.016) -> void:
	is_game_over_requiem = bool(state.get("is_game_over", state.get("isGameOver", false)))
	in_combat_state = bool(state.get("in_combat", state.get("inCombat", false)))
	dragon_wrath_state = bool(state.get("dragon_wrath_active", state.get("dragonWrathActive", false)))
	hp_ratio_state = clampf(float(state.get("hp_ratio", state.get("hpRatio", 1.0))), 0.0, 1.0)
	var nearby_enemies: int = int(state.get("nearby_enemies", state.get("nearbyEnemyCount", 0)))
	if nearby_enemies > 0 or dragon_wrath_state:
		in_combat_state = true

	var target_stem: String = "explore"
	if is_game_over_requiem:
		target_stem = "requiem"
	elif dragon_wrath_state or in_combat_state or hp_ratio_state < 0.30:
		target_stem = "combat"

	if target_stem != active_stem:
		var prev_stem: String = active_stem
		active_stem = target_stem
		var bpm: int = int(LYRIA_STEM_BPM.get(active_stem, 92))
		print(
			"[INFO][AUDIO][LLM Lyria 3] Stem transition: %s -> %s (%d BPM, hp=%.2f, dragon_wrath=%s)"
			% [prev_stem, active_stem, bpm, hp_ratio_state, str(dragon_wrath_state)]
		)
		music_stem_changed.emit(active_stem, bpm)


## Smoothly crossfades the 3 Lyria `AudioStreamPlayer` stems and applies `-12 dB` voice ducking.
func _update_music_crossfade(delta: float) -> void:
	var duck_mult: float = 0.24 if is_voice_speaking else 1.0
	var base_stem_vol: float = 0.52 * music_volume * duck_mult

	for stem_id in ["explore", "combat", "requiem"]:
		var player: AudioStreamPlayer = _stem_players.get(stem_id, null)
		if player == null:
			continue
		var is_target: bool = (stem_id == active_stem) and not muted and music_volume > 0.001
		var target_lin: float = base_stem_vol if is_target else 0.0
		var current_lin: float = float(_stem_linear_gains.get(stem_id, 0.0))
		var next_lin: float = move_toward(current_lin, target_lin, delta * 0.85)
		_stem_linear_gains[stem_id] = next_lin

		player.volume_db = _linear_to_db_safe(next_lin)
		if is_target and not player.playing and player.stream != null:
			player.play()
		elif not is_target and next_lin <= 0.002 and player.playing:
			player.stop()


## Triggers the D-Minor Game Over Requiem stem + solemn funeral chord + Aldric's Requiem voiceover.
func play_game_over_requiem(play_voice_line: bool = true) -> void:
	is_game_over_requiem = true
	active_stem = "requiem"
	print("[INFO][AUDIO][LLM Lyria 3] Activating Game Over Requiem (64 BPM D-Minor)")
	music_stem_changed.emit("requiem", 64)
	play_sfx("game_over")
	if play_voice_line:
		play_voice("alert_gameover_requiem", true)


## Returns from Game Over Requiem to peaceful exploration with a celestial harp chord.
func play_revive_grace() -> void:
	stop_voice()
	is_game_over_requiem = false
	active_stem = "explore"
	music_stem_changed.emit("explore", 92)
	play_sfx("level_up")


## Resets audio state for a brand new Roguelike run from Level 1, Island #1.
func play_new_run_reset() -> void:
	stop_voice()
	is_game_over_requiem = false
	active_stem = "explore"
	music_stem_changed.emit("explore", 92)
	play_sfx("build")


## Queues a procedural WebAudio-style SFX burst in the `AudioStreamGenerator` buffer.
func play_sfx(sfx_name: String) -> void:
	if muted or sfx_volume <= 0.001:
		return

	var key: String = sfx_name.strip_edges().to_lower()
	var spec: Dictionary = _build_sfx_spec(key)
	_active_sfx_queue.append(spec)
	if _active_sfx_queue.size() > 8:
		_active_sfx_queue.pop_front()


func _build_sfx_spec(key: String) -> Dictionary:
	match key:
		"sword_slash", "sword_cleave", "attack":
			return {"freq_start": 360.0, "freq_end": 125.0, "duration": 0.14, "noise": 0.35, "gain": 0.42}
		"hit", "hit_impact", "crit":
			return {"freq_start": 195.0, "freq_end": 58.0, "duration": 0.11, "noise": 0.25, "gain": 0.40}
		"dash":
			return {"freq_start": 240.0, "freq_end": 540.0, "duration": 0.15, "noise": 0.40, "gain": 0.34}
		"spell_cast", "runic_bolt", "frost_nova", "flame_wave", "nature_thorns":
			return {"freq_start": 523.25, "freq_end": 1046.5, "duration": 0.22, "noise": 0.15, "gain": 0.40}
		"harvest", "harvest_wood", "harvest_stone", "harvest_crystal":
			return {"freq_start": 659.25, "freq_end": 1318.5, "duration": 0.18, "noise": 0.08, "gain": 0.36}
		"rescue", "cage_rescue", "build", "upgrade", "weapon_forge":
			return {"freq_start": 440.0, "freq_end": 880.0, "duration": 0.26, "noise": 0.05, "gain": 0.42}
		"level_up", "island_victory", "shield_activation":
			return {"freq_start": 523.25, "freq_end": 1567.98, "duration": 0.34, "noise": 0.04, "gain": 0.45}
		"dragon_roar", "dragon_wrath", "shark_landing", "mole_eruption":
			return {"freq_start": 146.83, "freq_end": 55.0, "duration": 0.38, "noise": 0.45, "gain": 0.50}
		"relic_pickup", "relic_resonance":
			return {"freq_start": 783.99, "freq_end": 1567.98, "duration": 0.30, "noise": 0.02, "gain": 0.42}
		"game_over", "requiem":
			return {"freq_start": 146.83, "freq_end": 73.42, "duration": 0.45, "noise": 0.05, "gain": 0.46}
		_:
			return {"freq_start": 440.0, "freq_end": 660.0, "duration": 0.15, "noise": 0.10, "gain": 0.32}


## Pushes synthesized PCM frames into `_sfx_playback` when procedural SFX are queued.
func _pump_procedural_sfx_buffer() -> void:
	if _sfx_playback == null:
		if _sfx_player != null and _sfx_player.has_stream_playback():
			_sfx_playback = _sfx_player.get_stream_playback() as AudioStreamGeneratorPlayback
		else:
			return

	var frames_available: int = _sfx_playback.get_frames_available()
	if frames_available <= 0:
		return

	if _active_sfx_queue.is_empty():
		for _i in range(frames_available):
			_sfx_playback.push_frame(Vector2.ZERO)
		return

	var current_sfx: Dictionary = _active_sfx_queue[0]
	var mix_rate: float = _sfx_generator.mix_rate if _sfx_generator != null else 22050.0
	var duration: float = maxf(0.05, float(current_sfx.get("duration", 0.16)))
	var elapsed: float = float(current_sfx.get("elapsed", 0.0))
	var f0: float = float(current_sfx.get("freq_start", 440.0))
	var f1: float = float(current_sfx.get("freq_end", 220.0))
	var noise_mix: float = float(current_sfx.get("noise", 0.15))
	var base_gain: float = float(current_sfx.get("gain", 0.35)) * sfx_volume

	for _i in range(frames_available):
		if elapsed >= duration:
			_active_sfx_queue.pop_front()
			if _active_sfx_queue.is_empty():
				_sfx_playback.push_frame(Vector2.ZERO)
				continue
			current_sfx = _active_sfx_queue[0]
			duration = maxf(0.05, float(current_sfx.get("duration", 0.16)))
			elapsed = float(current_sfx.get("elapsed", 0.0))
			f0 = float(current_sfx.get("freq_start", 440.0))
			f1 = float(current_sfx.get("freq_end", 220.0))
			noise_mix = float(current_sfx.get("noise", 0.15))
			base_gain = float(current_sfx.get("gain", 0.35)) * sfx_volume

		var t: float = clampf(elapsed / duration, 0.0, 1.0)
		var env: float = sin(t * PI) * (1.0 - 0.35 * t)
		var freq: float = lerpf(f0, f1, t)
		_sfx_phase = fmod(_sfx_phase + freq / mix_rate, 1.0)
		var tone: float = sin(_sfx_phase * TAU)
		var noise: float = randf_range(-1.0, 1.0)
		var sample: float = ((1.0 - noise_mix) * tone + noise_mix * noise) * env * base_gain
		_sfx_playback.push_frame(Vector2(sample, sample))
		elapsed += 1.0 / mix_rate

	if not _active_sfx_queue.is_empty():
		_active_sfx_queue[0]["elapsed"] = elapsed


# --- Settings Mixer Getters & Setters ---

## Toggles master mute state.
func toggle_mute() -> bool:
	return set_muted(not muted)


## Explicitly sets master mute state (`true` or `false`).
func set_muted(m: bool) -> bool:
	muted = m
	if muted:
		stop_voice()
	if _sfx_player != null:
		_sfx_player.volume_db = _linear_to_db_safe(sfx_volume if not muted else 0.0)
	audio_settings_changed.emit(get_audio_settings())
	return muted


## Sets the Lyria music volume multiplier (`0.0` to `1.0`).
func set_music_volume(v: float) -> float:
	music_volume = clampf(v, 0.0, 1.0)
	audio_settings_changed.emit(get_audio_settings())
	return music_volume


## Sets the Gemini TTS voiceover volume multiplier (`0.0` to `1.0`).
func set_voice_volume(v: float) -> float:
	voice_volume = clampf(v, 0.0, 1.0)
	if _voice_player != null and _voice_player.playing:
		_voice_player.volume_db = _linear_to_db_safe(0.96 * voice_volume)
	audio_settings_changed.emit(get_audio_settings())
	return voice_volume


## Sets the procedural SFX volume multiplier (`0.0` to `1.0`).
func set_sfx_volume(v: float) -> float:
	sfx_volume = clampf(v, 0.0, 1.0)
	if _sfx_player != null:
		_sfx_player.volume_db = _linear_to_db_safe(sfx_volume if not muted else 0.0)
	audio_settings_changed.emit(get_audio_settings())
	return sfx_volume


## Applies a dictionary of audio settings (`muted`, `language`, `music_volume`, `voice_volume`, `sfx_volume`).
func set_audio_settings(cfg: Dictionary) -> Dictionary:
	if cfg.has("muted"):
		set_muted(bool(cfg["muted"]))
	if cfg.has("music_volume") or cfg.has("musicVolume"):
		set_music_volume(float(cfg.get("music_volume", cfg.get("musicVolume", music_volume))))
	if cfg.has("voice_volume") or cfg.has("voiceVolume"):
		set_voice_volume(float(cfg.get("voice_volume", cfg.get("voiceVolume", voice_volume))))
	if cfg.has("sfx_volume") or cfg.has("sfxVolume"):
		set_sfx_volume(float(cfg.get("sfx_volume", cfg.get("sfxVolume", sfx_volume))))
	if cfg.has("language"):
		set_language(str(cfg["language"]))
	return get_audio_settings()


## Returns the current audio settings dictionary for the Settings Modal (`[O]`).
func get_audio_settings() -> Dictionary:
	return {
		"muted": muted,
		"language": language,
		"music_volume": music_volume,
		"voice_volume": voice_volume,
		"sfx_volume": sfx_volume,
		"musicVolume": music_volume,
		"voiceVolume": voice_volume,
		"sfxVolume": sfx_volume,
	}


## Returns live adaptive music & voice telemetry for HUD status display.
func get_music_telemetry() -> Dictionary:
	var bpm: int = int(LYRIA_STEM_BPM.get(active_stem, 92))
	var is_fr: bool = (language == "fr")
	var label: String = ""
	if muted:
		label = "🔇 Audio Muet" if is_fr else "🔇 Audio Muted"
	elif active_stem == "requiem":
		label = (
			"🕯️ Requiem des Cendres (64 BPM)"
			if is_fr
			else "🕯️ Requiem of Ashes (64 BPM)"
		)
	elif active_stem == "combat":
		label = (
			"⚔️ Lyria Combat (%d BPM)" % bpm
			if is_fr
			else "⚔️ Lyria Combat (%d BPM)" % bpm
		)
	else:
		label = (
			"🌿 Paix du Bastion (%d BPM)" % bpm
			if is_fr
			else "🌿 Bastion Peace (%d BPM)" % bpm
		)
	return {
		"muted": muted,
		"language": language,
		"active_stem": active_stem,
		"bpm": bpm,
		"status_label": label,
		"is_voice_speaking": is_voice_speaking,
		"current_voice_key": current_voice_key,
	}
