## @file scripts/core/MainGame.gd
## @description Root 3D scene orchestrator for Genesis Bastion (Godot 4.3 Engine Edition).
## Assembles and synchronizes:
## 1. WorldEnvironment (ProceduralSkyMaterial, DirectionalLight3D with shadows, toggleable Glow/Bloom)
## 2. I18nManager & GameDesignData (English "en" default, French "fr" 2nd option)
## 3. ConwayGrid (32x32 cellular automaton) & GeneticEcosystem (diploid genomes, gestation, Dragon Wrath, prey balance)
## 4. IslandTerrain & ModelLoader (O(1) 257x257 height grid, 14 Blender 5.0 .glb models + [J] procedural toggle)
## 5. PlayerCharacter ([R]/[F] camera rotation decoupled from [E] harvest/interact, [C] combat mode, [1-4] spells)
## 6. EnemySwarmManager (10 species, 48m animation LOD, 95m distance culling for 60 FPS)
## 7. AudioDirector (Lyria 3 adaptive music stems + 30 bilingual EN/FR Gemini TTS voiceovers + procedural SFX)
## 8. HUDController (Settings Modal [O], 7-Act Onboarding Banner with Nano Banana portraits, Minimap, Modals)
class_name MainGame
extends Node3D

var i18n: Node = null
var conway_grid: RefCounted = null
var ecosystem: Node = null
var model_loader: RefCounted = null
var terrain: Node3D = null
var player: CharacterBody3D = null
var enemy_manager: Node3D = null
var audio_director: Node = null
var hud: CanvasLayer = null

var world_env: WorldEnvironment = null
var sun_light: DirectionalLight3D = null

var current_onboarding_act: int = 1
var conway_tick_timer: float = 0.0
var hud_sync_timer: float = 0.0
var is_bloom_enabled: bool = false
var is_conway_overlay_visible: bool = false
var is_game_over: bool = false
var island_level: int = 1
var bastion_hp: float = GameConfig.BASTION_INITIAL_HP
var bastion_max_hp: float = GameConfig.BASTION_INITIAL_HP
var building_levels: Dictionary = {
	"watchtower": 1,
	"mana_well": 1,
	"palisade": 1,
	"gene_lab": 1,
}
var mastery_kills: Dictionary = {}

func _ready() -> void:
	print("[GODOT4-MAIN] Initializing Genesis Bastion — Godot 4.3 Engine Edition...")
	_setup_lighting_and_environment()
	_instantiate_subsystems()
	_wire_subsystem_signals()
	_start_onboarding_act(1)
	_sync_hud_immediately()
	print("[GODOT4-MAIN] Genesis Bastion ready (Default Language: %s)." % get_active_language())

func _setup_lighting_and_environment() -> void:
	var env := Environment.new()
	var sky := Sky.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.11, 0.22, 0.42)
	sky_mat.sky_horizon_color = Color(0.38, 0.56, 0.74)
	sky_mat.ground_bottom_color = Color(0.06, 0.10, 0.16)
	sky_mat.ground_horizon_color = Color(0.24, 0.36, 0.48)
	sky.sky_material = sky_mat
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_color = Color(0.76, 0.84, 0.96)
	env.ambient_light_energy = 0.85
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.glow_enabled = is_bloom_enabled
	env.glow_intensity = 0.65
	env.glow_bloom = 0.18
	env.fog_enabled = true
	env.fog_light_color = Color(0.42, 0.58, 0.74)
	env.fog_density = 0.0022

	world_env = WorldEnvironment.new()
	world_env.name = "WorldEnvironment"
	world_env.environment = env
	add_child(world_env)

	sun_light = DirectionalLight3D.new()
	sun_light.name = "SunDirectionalLight"
	sun_light.light_color = Color(1.0, 0.95, 0.84)
	sun_light.light_energy = 1.35
	sun_light.shadow_enabled = true
	sun_light.directional_shadow_max_distance = 110.0
	sun_light.rotation_degrees = Vector3(-48.0, -35.0, 0.0)
	add_child(sun_light)

func _instantiate_subsystems() -> void:
	# 1. Bilingual I18nManager ("en" default, "fr" 2nd option)
	var i18n_script = load("res://scripts/design/I18nManager.gd")
	if i18n_script:
		i18n = i18n_script.new()
		i18n.name = "I18nManager"
		add_child(i18n)
		if i18n.has_method("set_language"):
			i18n.set_language("en")

	# 2. Conway Cellular Automaton (32x32) & Diploid Genetic Ecosystem
	var conway_script = load("res://scripts/ecosystem/ConwayGrid.gd")
	if conway_script:
		conway_grid = conway_script.new()

	var eco_script = load("res://scripts/ecosystem/GeneticEcosystem.gd")
	if eco_script:
		ecosystem = eco_script.new()
		ecosystem.name = "GeneticEcosystem"
		add_child(ecosystem)
		if ecosystem.has_method("setup") and conway_grid != null:
			ecosystem.call("setup", conway_grid)

	# 3. Blender 5.0 .glb / Procedural ModelLoader & 3D IslandTerrain
	var loader_script = load("res://scripts/world/ModelLoader.gd")
	if loader_script:
		model_loader = loader_script.new()

	var terrain_script = load("res://scripts/world/IslandTerrain.gd")
	if terrain_script:
		terrain = terrain_script.new()
		terrain.name = "IslandTerrain"
		if "model_loader" in terrain and model_loader != null:
			terrain.set("model_loader", model_loader)
		add_child(terrain)

	# 4. AudioDirector (Lyria 3 Stems + 30 Bilingual Gemini TTS Voices + Procedural SFX)
	var audio_script = load("res://scripts/audio/AudioDirector.gd")
	if audio_script:
		audio_director = audio_script.new()
		audio_director.name = "AudioDirector"
		add_child(audio_director)
		if audio_director.has_method("set_language"):
			audio_director.call("set_language", "en", false)

	# 5. PlayerCharacter ([R]/[F] camera rotation decoupled from [E] harvest/interact)
	var player_script = load("res://scripts/entities/PlayerCharacter.gd")
	if player_script:
		player = player_script.new()
		player.name = "PlayerCharacter"
		if "terrain" in player:
			player.set("terrain", terrain)
		if "model_loader" in player and model_loader != null:
			player.set("model_loader", model_loader)
		if "audio_director" in player and audio_director != null:
			player.set("audio_director", audio_director)
		add_child(player)
		var start_y: float = 2.5
		if terrain != null and terrain.has_method("get_height_at"):
			start_y = float(terrain.call("get_height_at", 0.0, 10.0)) + 0.2
		player.position = Vector3(0.0, start_y, 10.0)

	# 6. EnemySwarmManager (10 Darwinian species, 48m LOD, 95m culling)
	var swarm_script = load("res://scripts/entities/EnemySwarmManager.gd")
	if swarm_script:
		enemy_manager = swarm_script.new()
		enemy_manager.name = "EnemySwarmManager"
		if "terrain" in enemy_manager:
			enemy_manager.set("terrain", terrain)
		if "ecosystem" in enemy_manager:
			enemy_manager.set("ecosystem", ecosystem)
		if "player" in enemy_manager:
			enemy_manager.set("player", player)
		if "model_loader" in enemy_manager and model_loader != null:
			enemy_manager.set("model_loader", model_loader)
		if "audio_director" in enemy_manager and audio_director != null:
			enemy_manager.set("audio_director", audio_director)
		add_child(enemy_manager)
		if enemy_manager.has_method("setup"):
			enemy_manager.call("setup", terrain, ecosystem, player, audio_director, model_loader)

	if player != null and "enemy_manager" in player:
		player.set("enemy_manager", enemy_manager)
	if player != null and "ecosystem" in player:
		player.set("ecosystem", ecosystem)

	# 7. HUDController (Bilingual EN/FR UI, Settings Modal [O], Minimap, Modals)
	var hud_script = load("res://scripts/ui/HUDController.gd")
	if hud_script:
		hud = hud_script.new()
		hud.name = "HUDController"
		add_child(hud)
		if hud.has_method("setup"):
			hud.call("setup", self, i18n, audio_director, terrain, ecosystem, player, enemy_manager)

func _wire_subsystem_signals() -> void:
	if i18n != null and i18n.has_signal("language_changed"):
		i18n.connect("language_changed", Callable(self, "_on_language_changed"))

	if player != null:
		if player.has_signal("spell_cast"):
			player.connect("spell_cast", Callable(self, "_on_player_spell_cast"))
		if player.has_signal("resource_harvested"):
			player.connect("resource_harvested", Callable(self, "_on_resource_harvested"))
		if player.has_signal("relic_collected"):
			player.connect("relic_collected", Callable(self, "_on_relic_collected"))
		if player.has_signal("player_died"):
			player.connect("player_died", Callable(self, "_on_player_died"))
		if player.has_signal("level_up"):
			player.connect("level_up", Callable(self, "_on_player_level_up"))

	if enemy_manager != null:
		if enemy_manager.has_signal("creature_killed"):
			enemy_manager.connect("creature_killed", Callable(self, "_on_creature_killed"))
		if enemy_manager.has_signal("dragon_provoked"):
			enemy_manager.connect("dragon_provoked", Callable(self, "_on_dragon_provoked"))
		if enemy_manager.has_signal("patient_zero_spotted"):
			enemy_manager.connect("patient_zero_spotted", Callable(self, "_on_patient_zero_spotted"))

	if ecosystem != null:
		if ecosystem.has_signal("dragon_wrath_triggered"):
			ecosystem.connect("dragon_wrath_triggered", Callable(self, "_on_dragon_provoked"))
		if ecosystem.has_signal("shark_invasion_started"):
			ecosystem.connect("shark_invasion_started", Callable(self, "_on_shark_invasion"))
		if ecosystem.has_signal("mole_eruption_started"):
			ecosystem.connect("mole_eruption_started", Callable(self, "_on_mole_eruption"))
		if ecosystem.has_signal("prey_crisis_started"):
			ecosystem.connect("prey_crisis_started", Callable(self, "_on_prey_crisis"))

	if hud != null:
		if hud.has_signal("language_change_requested"):
			hud.connect("language_change_requested", Callable(self, "set_active_language"))
		if hud.has_signal("next_onboarding_act_requested"):
			hud.connect("next_onboarding_act_requested", Callable(self, "advance_onboarding_act"))
		if hud.has_signal("models_mode_toggled"):
			hud.connect("models_mode_toggled", Callable(self, "_on_hud_models_toggled"))
		if hud.has_signal("bloom_toggled"):
			hud.connect("bloom_toggled", Callable(self, "toggle_bloom"))
		if hud.has_signal("conway_overlay_toggled"):
			hud.connect("conway_overlay_toggled", Callable(self, "toggle_conway_overlay"))
		if hud.has_signal("activate_shield_requested"):
			hud.connect("activate_shield_requested", Callable(self, "activate_solar_aegis_shield"))
		if hud.has_signal("advance_next_island_requested"):
			hud.connect("advance_next_island_requested", Callable(self, "advance_to_next_island"))
		if hud.has_signal("game_over_restart_requested"):
			hud.connect("game_over_restart_requested", Callable(self, "restart_from_zero"))
		if hud.has_signal("game_over_continue_requested"):
			hud.connect("game_over_continue_requested", Callable(self, "continue_with_sanctuary_grace"))
		if hud.has_signal("force_eco_tick_requested"):
			hud.connect("force_eco_tick_requested", Callable(self, "force_conway_eco_tick"))

func _on_hud_models_toggled(_use_blender: bool) -> void:
	toggle_blender_models()

func get_active_language() -> String:
	if i18n != null and i18n.has_method("get_language"):
		return String(i18n.call("get_language"))
	return "en"

func set_active_language(lang: String) -> void:
	var normalized: String = "fr" if lang.to_lower().begins_with("fr") else "en"
	if i18n != null and i18n.has_method("set_language"):
		i18n.call("set_language", normalized)
	else:
		_on_language_changed(normalized)

func _on_language_changed(new_lang: String) -> void:
	if audio_director != null and audio_director.has_method("set_language"):
		audio_director.call("set_language", new_lang, true)
	if hud != null and hud.has_method("set_language"):
		hud.call("set_language", new_lang)
	elif hud != null and hud.has_method("refresh_language"):
		hud.call("refresh_language", new_lang)
	_refresh_onboarding_ui()
	_sync_hud_immediately()

func _start_onboarding_act(act_num: int) -> void:
	current_onboarding_act = clampi(act_num, 1, 7)
	var lang: String = get_active_language()
	var act_data: Dictionary = GameDesignData.get_onboarding_act(current_onboarding_act, lang)
	var voice_key: String = String(act_data.get("voice_key", "act%d_aldric" % current_onboarding_act))
	if audio_director != null and audio_director.has_method("play_voice"):
		audio_director.call("play_voice", voice_key, false)
	_refresh_onboarding_ui()

func advance_onboarding_act() -> void:
	var next_act: int = (current_onboarding_act % 7) + 1
	_start_onboarding_act(next_act)

func _refresh_onboarding_ui() -> void:
	if hud == null:
		return
	var lang: String = get_active_language()
	var act_data: Dictionary = GameDesignData.get_onboarding_act(current_onboarding_act, lang)
	if hud.has_method("update_onboarding_banner"):
		hud.call("update_onboarding_banner", act_data)

func toggle_blender_models() -> bool:
	var next_mode: bool = true
	if model_loader != null:
		if model_loader.has_method("toggle_blender_models"):
			next_mode = bool(model_loader.call("toggle_blender_models"))
		elif "use_blender_models" in model_loader:
			next_mode = not bool(model_loader.get("use_blender_models"))
			model_loader.set("use_blender_models", next_mode)
	if terrain != null and terrain.has_method("refresh_models"):
		terrain.call("refresh_models", next_mode)
	if player != null and player.has_method("refresh_model"):
		player.call("refresh_model", next_mode)
	if enemy_manager != null and enemy_manager.has_method("refresh_models"):
		enemy_manager.call("refresh_models", next_mode)
	if audio_director != null and audio_director.has_method("play_sfx"):
		audio_director.call("play_sfx", "harvest")
	_sync_hud_immediately()
	return next_mode

func toggle_bloom(force_state: Variant = null) -> bool:
	if typeof(force_state) == TYPE_BOOL:
		is_bloom_enabled = bool(force_state)
	else:
		is_bloom_enabled = not is_bloom_enabled
	if world_env != null and world_env.environment != null:
		world_env.environment.glow_enabled = is_bloom_enabled
	_sync_hud_immediately()
	return is_bloom_enabled

func toggle_conway_overlay(force_state: Variant = null) -> bool:
	if typeof(force_state) == TYPE_BOOL:
		is_conway_overlay_visible = bool(force_state)
	else:
		is_conway_overlay_visible = not is_conway_overlay_visible
	if terrain != null and terrain.has_method("set_conway_overlay_visible"):
		terrain.call("set_conway_overlay_visible", is_conway_overlay_visible)
	if is_conway_overlay_visible and terrain != null and terrain.has_method("update_conway_overlay") and conway_grid != null:
		terrain.call("update_conway_overlay", conway_grid)
	_sync_hud_immediately()
	return is_conway_overlay_visible

func force_conway_eco_tick() -> Dictionary:
	var summary: Dictionary = {}
	if conway_grid != null and conway_grid.has_method("step_generation"):
		summary = conway_grid.call("step_generation")
	if ecosystem != null and ecosystem.has_method("on_conway_step"):
		ecosystem.call("on_conway_step", summary)
	if terrain != null and is_conway_overlay_visible and terrain.has_method("update_conway_overlay"):
		terrain.call("update_conway_overlay", conway_grid)
	_sync_hud_immediately()
	return summary

func trigger_game_over(reason_en: String = "The Sanctuary Hearth has fallen!", reason_fr: String = "Le Cœur du Sanctuaire est tombé !") -> void:
	is_game_over = true
	if audio_director != null:
		if audio_director.has_method("trigger_gameover_requiem"):
			audio_director.call("trigger_gameover_requiem")
		elif audio_director.has_method("play_voice"):
			audio_director.call("play_voice", "alert_gameover_requiem", true)
	if hud != null and hud.has_method("show_game_over_modal"):
		var lang: String = get_active_language()
		var reason: String = reason_fr if lang == "fr" else reason_en
		hud.call("show_game_over_modal", reason, build_hud_state())

func restart_from_zero() -> void:
	is_game_over = false
	island_level = 1
	bastion_hp = bastion_max_hp
	mastery_kills.clear()
	if conway_grid != null and conway_grid.has_method("randomize_initial_seed"):
		conway_grid.call("randomize_initial_seed")
	if ecosystem != null and ecosystem.has_method("reset_ecosystem"):
		ecosystem.call("reset_ecosystem")
	if player != null and player.has_method("reset_for_new_run"):
		player.call("reset_for_new_run")
	if enemy_manager != null and enemy_manager.has_method("reset_swarm"):
		enemy_manager.call("reset_swarm")
	_start_onboarding_act(1)
	_sync_hud_immediately()

func continue_with_sanctuary_grace() -> void:
	is_game_over = false
	bastion_hp = bastion_max_hp
	if player != null:
		if player.has_method("revive_at_sanctuary"):
			player.call("revive_at_sanctuary")
		elif "hp" in player and "max_hp" in player:
			player.set("hp", player.get("max_hp"))
	_sync_hud_immediately()

func activate_solar_aegis_shield() -> void:
	if audio_director != null and audio_director.has_method("play_voice"):
		audio_director.call("play_voice", "alert_island_victory", true)
	if hud != null and hud.has_method("show_island_victory_modal"):
		hud.call("show_island_victory_modal", island_level)

func advance_to_next_island() -> void:
	island_level += 1
	bastion_hp = bastion_max_hp
	if conway_grid != null and conway_grid.has_method("inject_life_burst"):
		conway_grid.call("inject_life_burst", 0.0, 0.0)
	if enemy_manager != null and enemy_manager.has_method("spawn_island_wave"):
		enemy_manager.call("spawn_island_wave", island_level)
	_sync_hud_immediately()

func _on_player_spell_cast(spell_id: String, origin: Vector3, radius: float, damage: float) -> void:
	if audio_director != null and audio_director.has_method("play_sfx"):
		audio_director.call("play_sfx", "spell_cast")
	if enemy_manager != null and enemy_manager.has_method("apply_aoe_spell_damage"):
		enemy_manager.call("apply_aoe_spell_damage", spell_id, origin, radius, damage)

func _on_resource_harvested(_res_type: String, _amount: int) -> void:
	if audio_director != null and audio_director.has_method("play_sfx"):
		audio_director.call("play_sfx", "harvest")
	_sync_hud_immediately()

func _on_relic_collected(collected_count: int, max_count: int) -> void:
	if audio_director != null:
		if audio_director.has_method("play_sfx"):
			audio_director.call("play_sfx", "relic_resonance")
		if audio_director.has_method("play_voice"):
			audio_director.call("play_voice", "alert_relic_found", true)
	if collected_count >= max_count:
		activate_solar_aegis_shield()
	_sync_hud_immediately()

func _on_player_died() -> void:
	trigger_game_over(
		"The Guardian fell in combat while defending the Bastion!",
		"Le Gardien est tombé au combat en défendant le Bastion !"
	)

func _on_player_level_up(new_level: int) -> void:
	if audio_director != null and audio_director.has_method("play_sfx"):
		audio_director.call("play_sfx", "level_up")
	if hud != null and hud.has_method("show_level_up_modal"):
		hud.call("show_level_up_modal", new_level)

func _on_creature_killed(species_id: String, is_mutant: bool) -> void:
	var prev: int = int(mastery_kills.get(species_id, 0))
	mastery_kills[species_id] = prev + 1
	if player != null and player.has_method("add_xp"):
		player.call("add_xp", 28 if is_mutant else 16)
	_sync_hud_immediately()

func _on_dragon_provoked() -> void:
	if audio_director != null:
		if audio_director.has_method("play_sfx"):
			audio_director.call("play_sfx", "dragon_roar")
		if audio_director.has_method("play_voice"):
			audio_director.call("play_voice", "alert_dragon_wrath", true)
	if hud != null and hud.has_method("show_alert_banner"):
		var lang: String = get_active_language()
		var msg: String = "🔥 DRAGON WRATH! The Sovereign Dragon species is converging on the Bastion!" if lang == "en" else "🔥 COURROUX DRACONIQUE ! Toute l'espèce des Dragons Souverains converge vers le Bastion !"
		hud.call("show_alert_banner", msg, "alert_dragon_wrath")

func _on_patient_zero_spotted(_species_id: String, _pos: Vector3) -> void:
	if audio_director != null and audio_director.has_method("play_voice"):
		audio_director.call("play_voice", "alert_patient_zero", false)

func _on_shark_invasion() -> void:
	if audio_director != null and audio_director.has_method("play_voice"):
		audio_director.call("play_voice", "alert_shark_landing", false)

func _on_mole_eruption() -> void:
	if audio_director != null and audio_director.has_method("play_voice"):
		audio_director.call("play_voice", "alert_mole_eruption", false)

func _on_prey_crisis() -> void:
	if audio_director != null and audio_director.has_method("play_voice"):
		audio_director.call("play_voice", "alert_prey_crisis", false)

func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey):
		return
	var key_event := event as InputEventKey
	if not key_event.pressed or key_event.echo:
		return

	match key_event.keycode:
		KEY_O:
			if hud != null and hud.has_method("toggle_settings_modal"):
				hud.call("toggle_settings_modal")
		KEY_TAB:
			if hud != null and hud.has_method("toggle_codex_modal"):
				hud.call("toggle_codex_modal")
		KEY_H:
			if hud != null and hud.has_method("toggle_build_modal"):
				hud.call("toggle_build_modal")
		KEY_K:
			if hud != null and hud.has_method("toggle_weapon_modal"):
				hud.call("toggle_weapon_modal")
		KEY_V:
			activate_solar_aegis_shield()
		KEY_J:
			toggle_blender_models()
		KEY_G:
			toggle_conway_overlay()
		KEY_T:
			force_conway_eco_tick()
		KEY_N:
			advance_onboarding_act()
		KEY_X:
			if is_game_over:
				continue_with_sanctuary_grace()
			else:
				trigger_game_over()

func _process(delta: float) -> void:
	if not is_game_over:
		conway_tick_timer += delta
		if conway_tick_timer >= GameConfig.ECO_TICK_INTERVAL_SEC:
			conway_tick_timer = 0.0
			force_conway_eco_tick()

	hud_sync_timer += delta
	if hud_sync_timer >= 0.14:
		hud_sync_timer = 0.0
		_sync_hud_immediately()

	if audio_director != null and audio_director.has_method("update_adaptive_state"):
		var dragon_wrath: bool = false
		if ecosystem != null and "dragon_wrath_active" in ecosystem:
			dragon_wrath = bool(ecosystem.get("dragon_wrath_active"))
		var nearby_enemies: int = 0
		if enemy_manager != null and enemy_manager.has_method("get_active_enemy_count"):
			nearby_enemies = int(enemy_manager.call("get_active_enemy_count"))
		var combat_intensity: float = clampf(float(nearby_enemies) / 25.0, 0.0, 1.0)
		var hp_ratio: float = 1.0
		if player != null and "hp" in player and "max_hp" in player:
			hp_ratio = float(player.get("hp")) / maxf(1.0, float(player.get("max_hp")))
		audio_director.call("update_adaptive_state", combat_intensity, hp_ratio, dragon_wrath, is_game_over)

func build_hud_state() -> Dictionary:
	var lang: String = get_active_language()
	var conway_gen: int = int(conway_grid.get("generation")) if conway_grid != null and "generation" in conway_grid else 1
	var alive_cells: int = int(conway_grid.call("get_alive_count")) if conway_grid != null and conway_grid.has_method("get_alive_count") else 0
	var pop_count: int = int(enemy_manager.call("get_active_enemy_count")) if enemy_manager != null and enemy_manager.has_method("get_active_enemy_count") else 42
	var use_blender: bool = bool(model_loader.get("use_blender_models")) if model_loader != null and "use_blender_models" in model_loader else true

	var p_hp: float = float(player.get("hp")) if player != null and "hp" in player else 160.0
	var p_max_hp: float = float(player.get("max_hp")) if player != null and "max_hp" in player else 160.0
	var p_lvl: int = int(player.get("level")) if player != null and "level" in player else 1
	var p_wood: int = int(player.get("wood")) if player != null and "wood" in player else 40
	var p_stone: int = int(player.get("stone")) if player != null and "stone" in player else 25
	var p_crystal: int = int(player.get("crystal")) if player != null and "crystal" in player else 20
	var p_relics: int = int(player.get("relic_fragments")) if player != null and "relic_fragments" in player else 0
	var p_combat_mode: String = String(player.get("combat_mode")) if player != null and "combat_mode" in player else "auto"
	var p_weapon: String = String(player.get("equipped_weapon")) if player != null and "equipped_weapon" in player else "runic_sword"
	var prompt_str: String = String(player.call("get_contextual_prompt", lang)) if player != null and player.has_method("get_contextual_prompt") else ""

	return {
		"language": lang,
		"island_level": island_level,
		"conway_generation": conway_gen,
		"conway_alive_cells": alive_cells,
		"population": pop_count,
		"bastion_hp": bastion_hp,
		"bastion_max_hp": bastion_max_hp,
		"player_hp": p_hp,
		"player_max_hp": p_max_hp,
		"player_level": p_lvl,
		"wood": p_wood,
		"stone": p_stone,
		"crystal": p_crystal,
		"relic_fragments": p_relics,
		"max_relic_fragments": GameConfig.MAX_RELIC_FRAGMENTS,
		"combat_mode": p_combat_mode,
		"equipped_weapon": p_weapon,
		"use_blender_models": use_blender,
		"is_bloom_enabled": is_bloom_enabled,
		"is_conway_overlay_visible": is_conway_overlay_visible,
		"onboarding_act": current_onboarding_act,
		"contextual_prompt": prompt_str,
		"building_levels": building_levels,
		"mastery_kills": mastery_kills,
	}

func _sync_hud_immediately() -> void:
	if hud == null:
		return
	var state: Dictionary = build_hud_state()
	if hud.has_method("update_hud"):
		hud.call("update_hud", state)
	elif hud.has_method("refresh_from_state"):
		hud.call("refresh_from_state", state)
