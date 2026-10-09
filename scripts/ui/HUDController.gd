## HUDController.gd
## Complete Godot 4.3 CanvasLayer + Control HUD & Modal System for Genesis Bastion.
##
## Features:
## - Bilingual UI & Voice integration: English ("en") by default, French ("fr") as 2nd choice.
## - Top Telemetry Bar with Island Tier, Day/Night Clock, Eco-Tick progress, Population & Prey health,
##   Lyria 3 Adaptive Music status, Combat Mode [C], Blender 5.0 (.glb) toggle [J], and Settings [O].
## - 7-Act Onboarding Banner with Nano Banana Character Portraits (Commander Aldric & Scout Chief Kaelen)
##   and Gemini TTS Voice replay / Next Act [N] controls + temporary Narrative Alert Banner.
## - Left Panel: Guardian HP/XP, Bastion HP, Resources (Wood, Stone, Crystal, Biomass, Rations),
##   Elemental Weapon [K], Relics (0/3), Ecosystem & Diploid Genetics summary, and Adaptive Mastery
##   (<=1%/kill diminishing returns, capped at +15%).
## - Right Panel: Custom 2D Tactical Minimap (`Control._draw()`), Dynamic Quest tracker, and Bastion Buildings.
## - Bottom Bar: Contextual 3D Interaction Prompt, 4-Slot 3D Spell Bar ([1-4] / AUTO), and Hotkey Reference.
## - 7 Interactive Modals: Settings [O], Bastion Architect [H], Weapon Forge [K], Planetary Shield [V],
##   Level-Up Choice Cards, Phylogenetic Codex [Tab], and Game Over Requiem [X].
class_name HUDController
extends CanvasLayer

signal language_change_requested(lang: String)
signal preview_voice_requested(lang: String)
signal replay_act_voice_requested(act_num: int)
signal next_onboarding_act_requested()
signal combat_mode_toggled(mode: String)
signal models_mode_toggled(use_blender: bool)
signal bloom_toggled(enabled: bool)
signal conway_overlay_toggled(visible: bool)
signal audio_mute_toggled(muted: bool)
signal audio_volume_changed(channel: String, volume: float)
signal spell_cast_requested(slot_index: int)
signal building_upgrade_requested(building_id: String)
signal weapon_equip_requested(weapon_id: String)
signal activate_shield_requested()
signal advance_next_island_requested()
signal level_up_choice_selected(choice_id: String)
signal game_over_restart_requested()
signal game_over_continue_requested()
signal reintroduce_prey_requested()
signal force_eco_tick_requested()

## Current UI & Voice language ("en" default, "fr" 2nd option)
var current_language: String = "en"

## References to sibling systems (populated via setup())
var main_game: Node = null
var i18n_manager: Node = null
var audio_director: Node = null
var terrain_ref: Node = null
var ecosystem_ref: Node = null
var player_ref: Node = null
var enemy_manager_ref: Node = null

## Cached UI state flags
var combat_mode: String = "auto" # "auto" (Vampire Survivors) or "active" (Diablo [1-4])
var use_blender_models: bool = true
var bloom_enabled: bool = false
var conway_overlay_visible: bool = false
var is_audio_muted: bool = false
var music_volume: float = 0.75
var voice_volume: float = 1.0
var sfx_volume: float = 0.75

## Modal open states
var is_settings_open: bool = false
var is_bastion_open: bool = false
var is_weapon_open: bool = false
var is_shield_open: bool = false
var is_levelup_open: bool = false
var is_codex_open: bool = false
var is_gameover_open: bool = false

## Cached telemetry dictionary from latest update_hud(state)
var last_state: Dictionary = {}
var current_onboarding_act: int = 1
var _last_onboarding_act_rendered: int = -1
var _last_onboarding_lang_rendered: String = ""
var alert_timer: float = 0.0
var _slow_ui_accum: float = 0.0
var _portrait_cache: Dictionary = {}

## Root Control & Main Containers
var root_control: Control
var top_bar_panel: PanelContainer
var onboarding_panel: PanelContainer
var alert_banner_panel: PanelContainer
var left_panel: PanelContainer
var right_panel: PanelContainer
var bottom_stack: VBoxContainer

## Top Bar Widgets
var brand_label: Label
var island_badge_label: Label
var clock_badge_label: Label
var eco_tick_bar: ProgressBar
var eco_tick_label: Label
var force_tick_btn: Button
var pop_badge_label: Label
var prey_badge_label: Label
var reintroduce_prey_btn: Button
var lyria_status_label: Label
var mute_btn: Button
var combat_mode_btn: Button
var blender_mode_btn: Button
var settings_btn: Button

## Onboarding Banner Widgets
var onboarding_portrait_rect: TextureRect
var onboarding_speaker_label: Label
var onboarding_act_badge: Label
var onboarding_title_label: Label
var onboarding_desc_label: Label
var onboarding_quote_label: Label
var onboarding_obj_bar: ProgressBar
var onboarding_obj_label: Label
var onboarding_voice_btn: Button
var onboarding_next_btn: Button

## Narrative Alert Banner Widgets
var alert_portrait_rect: TextureRect
var alert_title_label: Label
var alert_body_label: Label
var alert_close_btn: Button

## Left Panel Widgets
var guardian_section_title: Label
var hp_bar: ProgressBar
var hp_value_label: Label
var bastion_hp_bar: ProgressBar
var bastion_hp_label: Label
var xp_bar: ProgressBar
var xp_value_label: Label
var res_wood_label: Label
var res_stone_label: Label
var res_crystal_label: Label
var res_biomass_label: Label
var res_food_label: Label
var equipped_weapon_btn: Button
var relic_status_btn: Button
var eco_section_title: Label
var eco_summary_label: Label
var dragon_status_label: Label
var mastery_section_title: Label
var mastery_list_box: VBoxContainer

## Right Panel Widgets
var minimap_title_label: Label
var minimap_compass_label: Label
var minimap_canvas: MinimapCanvas
var minimap_legend_label: Label
var quest_section_title: Label
var quest_title_label: Label
var quest_step_label: Label
var buildings_section_title: Label
var buildings_summary_box: VBoxContainer
var quick_bastion_btn: Button
var quick_weapon_btn: Button
var quick_shield_btn: Button
var quick_codex_btn: Button

## Bottom Stack Widgets
var context_prompt_panel: PanelContainer
var context_prompt_label: Label
var spell_slot_buttons: Array[Button] = []
var hotkey_bar_label: Label

## Modal Backdrops & Content Containers
var modal_backdrop: ColorRect
var settings_modal: PanelContainer
var settings_body_box: VBoxContainer
var bastion_modal: PanelContainer
var bastion_body_box: VBoxContainer
var weapon_modal: PanelContainer
var weapon_body_box: VBoxContainer
var shield_modal: PanelContainer
var shield_body_box: VBoxContainer
var levelup_modal: PanelContainer
var levelup_body_box: VBoxContainer
var codex_modal: PanelContainer
var codex_body_box: VBoxContainer
var gameover_modal: PanelContainer
var gameover_body_box: VBoxContainer


## ============================================================================
## INNER CLASS: 2D TACTICAL MINIMAP (`Control._draw()`)
## ============================================================================
class MinimapCanvas extends Control:
	var hud_ref: HUDController = null
	var map_state: Dictionary = {}
	var world_radius: float = 135.0

	func _init(p_hud: HUDController = null) -> void:
		hud_ref = p_hud
		custom_minimum_size = Vector2(204, 204)

	func set_map_state(p_state: Dictionary) -> void:
		map_state = p_state
		queue_redraw()

	func _world_to_map(wx: float, wz: float, center: Vector2, radius_px: float) -> Vector2:
		var scale_f: float = radius_px / maxf(1.0, world_radius)
		var mx: float = center.x + wx * scale_f
		var my: float = center.y + wz * scale_f
		var offset: Vector2 = Vector2(mx, my) - center
		if offset.length() > radius_px - 3.0:
			offset = offset.normalized() * (radius_px - 3.0)
		return center + offset

	func _draw() -> void:
		var rect_size: Vector2 = size
		if rect_size.x <= 10.0 or rect_size.y <= 10.0:
			rect_size = custom_minimum_size
		var center: Vector2 = rect_size * 0.5
		var radius_px: float = minf(rect_size.x, rect_size.y) * 0.46

		# 1. Deep ocean background & island landmass disc
		draw_rect(Rect2(Vector2.ZERO, rect_size), Color(0.03, 0.07, 0.11, 0.95), true)
		draw_circle(center, radius_px, Color(0.09, 0.18, 0.13, 0.95))
		draw_arc(center, radius_px, 0.0, TAU, 48, Color(0.90, 0.63, 0.27, 0.75), 2.0)

		# 2. Sanctuary safe frontier ring (42m) & mid-biome ring (85m)
		var r_safe: float = (42.0 / world_radius) * radius_px
		var r_mid: float = (85.0 / world_radius) * radius_px
		draw_circle(center, r_safe, Color(0.16, 0.34, 0.23, 0.35))
		draw_arc(center, r_safe, 0.0, TAU, 36, Color(0.22, 0.76, 0.45, 0.65), 1.2)
		draw_arc(center, r_mid, 0.0, TAU, 36, Color(0.90, 0.63, 0.27, 0.28), 1.0)

		# 3. Crosshairs
		draw_line(Vector2(center.x - radius_px, center.y), Vector2(center.x + radius_px, center.y), Color(1, 1, 1, 0.08), 1.0)
		draw_line(Vector2(center.x, center.y - radius_px), Vector2(center.x, center.y + radius_px), Color(1, 1, 1, 0.08), 1.0)

		# 4. Central Bastion Sanctuary core
		draw_circle(center, 5.5, Color(0.24, 0.85, 0.52, 1.0))
		draw_arc(center, 8.0, 0.0, TAU, 20, Color(0.95, 0.78, 0.32, 0.9), 1.5)

		# 5. Relic monoliths (3 positions around island if not provided)
		var relics: Array = map_state.get("relic_positions", [
			Vector3(58.0, 0.0, -45.0),
			Vector3(-64.0, 0.0, 38.0),
			Vector3(12.0, 0.0, -78.0),
		])
		for rel in relics:
			if rel is Vector3:
				var rp: Vector2 = _world_to_map(rel.x, rel.z, center, radius_px)
				draw_circle(rp, 4.0, Color(0.35, 0.92, 0.98, 0.95))
			elif rel is Dictionary and not bool(rel.get("collected", false)):
				var rp2: Vector2 = _world_to_map(float(rel.get("x", 0.0)), float(rel.get("z", 0.0)), center, radius_px)
				draw_circle(rp2, 4.0, Color(0.35, 0.92, 0.98, 0.95))

		# 6. Creatures & Enemies
		var creatures: Array = map_state.get("creatures", [])
		for c in creatures:
			if not (c is Dictionary):
				continue
			if bool(c.get("dead", false)):
				continue
			var cx: float = float(c.get("x", 0.0))
			var cz: float = float(c.get("z", 0.0))
			var mp: Vector2 = _world_to_map(cx, cz, center, radius_px)
			var is_dragon: bool = bool(c.get("is_peaceful_dragon", false)) or String(c.get("species_id", "")) == "sovereign_dragon"
			var is_prey: bool = bool(c.get("is_prey", false))
			var is_mutant: bool = bool(c.get("is_mutant", false)) or int(c.get("mutation_count", 0)) > 0

			if is_dragon:
				draw_circle(mp, 4.6, Color(1.0, 0.55, 0.12, 1.0))
				draw_arc(mp, 6.5, 0.0, TAU, 16, Color(1.0, 0.25, 0.15, 0.9), 1.4)
			elif is_mutant:
				draw_circle(mp, 3.6, Color(1.0, 0.22, 0.35, 1.0))
				draw_arc(mp, 5.5, 0.0, TAU, 14, Color(1.0, 0.78, 0.22, 0.85), 1.2)
			elif is_prey:
				draw_circle(mp, 2.5, Color(0.64, 0.85, 0.28, 0.90))
			else:
				draw_circle(mp, 2.8, Color(0.92, 0.34, 0.26, 0.88))

		# 7. Player position & facing indicator
		var px: float = float(map_state.get("player_x", 0.0))
		var pz: float = float(map_state.get("player_z", 10.0))
		var pyaw: float = float(map_state.get("player_yaw", 0.0))
		var pp: Vector2 = _world_to_map(px, pz, center, radius_px)
		var dir_vec: Vector2 = Vector2(sin(pyaw), cos(pyaw)).normalized()
		draw_line(pp, pp + dir_vec * 9.0, Color(1.0, 0.95, 0.65, 0.95), 2.2)
		draw_circle(pp, 4.2, Color(1.0, 0.98, 0.90, 1.0))
		draw_arc(pp, 5.5, 0.0, TAU, 16, Color(0.20, 0.85, 0.98, 0.95), 1.5)


## ============================================================================
## LIFECYCLE & SETUP
## ============================================================================
func _ready() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	if root_control == null:
		_build_entire_hud()
	refresh_language(current_language)


func setup(
	p_main_game: Node = null,
	p_i18n: Node = null,
	p_audio: Node = null,
	p_terrain: Node = null,
	p_eco: Node = null,
	p_player: Node = null,
	p_enemies: Node = null
) -> void:
	main_game = p_main_game
	i18n_manager = p_i18n
	audio_director = p_audio
	terrain_ref = p_terrain
	ecosystem_ref = p_eco
	player_ref = p_player
	enemy_manager_ref = p_enemies

	if i18n_manager != null and i18n_manager.has_method("get_language"):
		current_language = String(i18n_manager.call("get_language"))
	if root_control != null:
		refresh_language(current_language)


func _process(delta: float) -> void:
	if alert_timer > 0.0:
		alert_timer -= delta
		if alert_timer <= 0.0 and is_instance_valid(alert_banner_panel):
			alert_banner_panel.visible = false

	_slow_ui_accum += delta
	if _slow_ui_accum >= 0.14:
		_slow_ui_accum = 0.0
		if is_instance_valid(minimap_canvas):
			minimap_canvas.queue_redraw()


## ============================================================================
## BILINGUAL I18N HELPERS (ENGLISH DEFAULT "en", FRENCH 2ND "fr")
## ============================================================================
func tr_ui(en_text: String, fr_text: String) -> String:
	if is_instance_valid(i18n_manager) and i18n_manager.has_method("tr_text"):
		return String(i18n_manager.call("tr_text", en_text, fr_text))
	return fr_text if current_language == "fr" else en_text


func get_language() -> String:
	if is_instance_valid(i18n_manager) and i18n_manager.has_method("get_language"):
		current_language = String(i18n_manager.call("get_language"))
	return current_language


func set_language(lang: String) -> void:
	var normalized: String = "fr" if lang.to_lower().begins_with("fr") else "en"
	var changed: bool = (current_language != normalized)
	current_language = normalized

	if is_instance_valid(i18n_manager) and i18n_manager.has_method("set_language"):
		if String(i18n_manager.call("get_language")) != normalized:
			i18n_manager.call("set_language", normalized)
	if is_instance_valid(audio_director) and audio_director.has_method("set_language"):
		audio_director.call("set_language", normalized, true)

	refresh_language(normalized)
	if changed:
		language_change_requested.emit(normalized)


func is_any_modal_open() -> bool:
	return (
		is_settings_open
		or is_bastion_open
		or is_weapon_open
		or is_shield_open
		or is_levelup_open
		or is_codex_open
		or is_gameover_open
	)


## ============================================================================
## STYLING & TEXTURE HELPERS
## ============================================================================
func _make_panel_style(bg: Color, border: Color, corner_radius: int = 8, border_width: int = 1) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(border_width)
	sb.set_corner_radius_all(corner_radius)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	return sb


func _load_portrait_texture(path: String) -> Texture2D:
	if path.is_empty():
		return null
	if _portrait_cache.has(path):
		return _portrait_cache[path]
	if ResourceLoader.exists(path):
		var tex = load(path)
		if tex is Texture2D:
			_portrait_cache[path] = tex
			return tex
	var abs_path: String = ProjectSettings.globalize_path(path)
	if FileAccess.file_exists(abs_path):
		var img := Image.load_from_file(abs_path)
		if img != null and not img.is_empty():
			var itex := ImageTexture.create_from_image(img)
			_portrait_cache[path] = itex
			return itex
	return null


## ============================================================================
## UI CONSTRUCTION
## ============================================================================
func _build_entire_hud() -> void:
	root_control = Control.new()
	root_control.name = "HUDRoot"
	root_control.set_anchors_preset(Control.PRESET_FULL_RECT)
	root_control.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(root_control)

	_build_top_bar()
	_build_onboarding_and_alert_banners()
	_build_left_panel()
	_build_right_panel()
	_build_bottom_stack()
	_build_modals_layer()


func _build_top_bar() -> void:
	top_bar_panel = PanelContainer.new()
	top_bar_panel.name = "TopBarPanel"
	top_bar_panel.anchor_left = 0.0
	top_bar_panel.anchor_right = 1.0
	top_bar_panel.anchor_top = 0.0
	top_bar_panel.anchor_bottom = 0.0
	top_bar_panel.offset_left = 10
	top_bar_panel.offset_right = -10
	top_bar_panel.offset_top = 8
	top_bar_panel.offset_bottom = 52
	top_bar_panel.add_theme_stylebox_override(
		"panel",
		_make_panel_style(Color(0.05, 0.08, 0.12, 0.92), Color(0.90, 0.63, 0.27, 0.55), 8, 1)
	)
	root_control.add_child(top_bar_panel)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 8)
	top_bar_panel.add_child(hbox)

	brand_label = Label.new()
	brand_label.text = "🏰 GENESIS BASTION [Godot 4.3]"
	brand_label.add_theme_color_override("font_color", Color(0.95, 0.78, 0.35))
	brand_label.add_theme_font_size_override("font_size", 13)
	hbox.add_child(brand_label)

	island_badge_label = Label.new()
	island_badge_label.text = "🏝️ Island #1"
	island_badge_label.add_theme_color_override("font_color", Color(0.45, 0.92, 0.68))
	island_badge_label.add_theme_font_size_override("font_size", 12)
	hbox.add_child(island_badge_label)

	clock_badge_label = Label.new()
	clock_badge_label.text = "☀️ Day 1"
	clock_badge_label.add_theme_font_size_override("font_size", 12)
	hbox.add_child(clock_badge_label)

	# Eco-Tick progress & button
	var eco_box := HBoxContainer.new()
	eco_box.add_theme_constant_override("separation", 4)
	eco_tick_label = Label.new()
	eco_tick_label.text = "🧬 Eco-Tick: 12.0s"
	eco_tick_label.add_theme_font_size_override("font_size", 12)
	eco_box.add_child(eco_tick_label)

	eco_tick_bar = ProgressBar.new()
	eco_tick_bar.custom_minimum_size = Vector2(60, 14)
	eco_tick_bar.max_value = 100.0
	eco_tick_bar.value = 0.0
	eco_tick_bar.show_percentage = false
	eco_box.add_child(eco_tick_bar)

	force_tick_btn = Button.new()
	force_tick_btn.text = "[T]"
	force_tick_btn.pressed.connect(func() -> void:
		if is_instance_valid(main_game) and main_game.has_method("force_conway_eco_tick"):
			main_game.call("force_conway_eco_tick")
		force_eco_tick_requested.emit()
	)
	eco_box.add_child(force_tick_btn)
	hbox.add_child(eco_box)

	pop_badge_label = Label.new()
	pop_badge_label.text = "🐾 Pop: 42"
	pop_badge_label.add_theme_font_size_override("font_size", 12)
	hbox.add_child(pop_badge_label)

	prey_badge_label = Label.new()
	prey_badge_label.text = "🦌 Prey: 8"
	prey_badge_label.add_theme_color_override("font_color", Color(0.64, 0.90, 0.35))
	prey_badge_label.add_theme_font_size_override("font_size", 12)
	hbox.add_child(prey_badge_label)

	reintroduce_prey_btn = Button.new()
	reintroduce_prey_btn.text = "🌿 +Prey"
	reintroduce_prey_btn.pressed.connect(func() -> void:
		if is_instance_valid(ecosystem_ref) and ecosystem_ref.has_method("reintroduce_herbivore_prey"):
			ecosystem_ref.call("reintroduce_herbivore_prey")
		reintroduce_prey_requested.emit()
	)
	hbox.add_child(reintroduce_prey_btn)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hbox.add_child(spacer)

	lyria_status_label = Label.new()
	lyria_status_label.text = "🎵 Lyria 3: Sanctuary"
	lyria_status_label.add_theme_color_override("font_color", Color(0.55, 0.85, 1.0))
	lyria_status_label.add_theme_font_size_override("font_size", 12)
	hbox.add_child(lyria_status_label)

	mute_btn = Button.new()
	mute_btn.text = "🔊 [M]"
	mute_btn.pressed.connect(func() -> void:
		is_audio_muted = not is_audio_muted
		if is_instance_valid(audio_director) and audio_director.has_method("set_muted"):
			audio_director.call("set_muted", is_audio_muted)
		_refresh_top_bar_buttons()
		audio_mute_toggled.emit(is_audio_muted)
	)
	hbox.add_child(mute_btn)

	combat_mode_btn = Button.new()
	combat_mode_btn.text = "⚡ Mode: Auto [C]"
	combat_mode_btn.pressed.connect(func() -> void:
		combat_mode = "active" if combat_mode == "auto" else "auto"
		if is_instance_valid(player_ref) and "combat_mode" in player_ref:
			player_ref.set("combat_mode", combat_mode)
		_refresh_top_bar_buttons()
		combat_mode_toggled.emit(combat_mode)
	)
	hbox.add_child(combat_mode_btn)

	blender_mode_btn = Button.new()
	blender_mode_btn.text = "🎨 3D: Blender 5.0 [J]"
	blender_mode_btn.pressed.connect(func() -> void:
		if is_instance_valid(main_game) and main_game.has_method("toggle_blender_models"):
			use_blender_models = bool(main_game.call("toggle_blender_models"))
		else:
			use_blender_models = not use_blender_models
		_refresh_top_bar_buttons()
		models_mode_toggled.emit(use_blender_models)
	)
	hbox.add_child(blender_mode_btn)

	settings_btn = Button.new()
	settings_btn.text = "⚙️ Settings [O]"
	settings_btn.pressed.connect(func() -> void: toggle_settings_modal())
	hbox.add_child(settings_btn)


func _build_onboarding_and_alert_banners() -> void:
	# 1. 7-Act Onboarding Banner with Nano Banana Character Portrait
	onboarding_panel = PanelContainer.new()
	onboarding_panel.name = "OnboardingBanner"
	onboarding_panel.anchor_left = 0.21
	onboarding_panel.anchor_right = 0.79
	onboarding_panel.anchor_top = 0.0
	onboarding_panel.anchor_bottom = 0.0
	onboarding_panel.offset_top = 58
	onboarding_panel.offset_bottom = 172
	onboarding_panel.add_theme_stylebox_override(
		"panel",
		_make_panel_style(Color(0.06, 0.10, 0.15, 0.93), Color(0.92, 0.70, 0.28, 0.82), 10, 2)
	)
	root_control.add_child(onboarding_panel)

	var ob_hbox := HBoxContainer.new()
	ob_hbox.add_theme_constant_override("separation", 12)
	onboarding_panel.add_child(ob_hbox)

	onboarding_portrait_rect = TextureRect.new()
	onboarding_portrait_rect.custom_minimum_size = Vector2(78, 78)
	onboarding_portrait_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	onboarding_portrait_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	var default_portrait := _load_portrait_texture("res://assets/portraits/aldric_neutral.png")
	if default_portrait != null:
		onboarding_portrait_rect.texture = default_portrait
	ob_hbox.add_child(onboarding_portrait_rect)

	var ob_vbox := VBoxContainer.new()
	ob_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ob_vbox.add_theme_constant_override("separation", 3)
	ob_hbox.add_child(ob_vbox)

	var ob_top_row := HBoxContainer.new()
	ob_top_row.add_theme_constant_override("separation", 8)
	onboarding_act_badge = Label.new()
	onboarding_act_badge.text = "ACT 1 / 7"
	onboarding_act_badge.add_theme_color_override("font_color", Color(0.98, 0.78, 0.30))
	onboarding_act_badge.add_theme_font_size_override("font_size", 11)
	ob_top_row.add_child(onboarding_act_badge)

	onboarding_speaker_label = Label.new()
	onboarding_speaker_label.text = "Commander Aldric — Master Biologist & Runic Blacksmith"
	onboarding_speaker_label.add_theme_color_override("font_color", Color(0.65, 0.88, 1.0))
	onboarding_speaker_label.add_theme_font_size_override("font_size", 11)
	onboarding_speaker_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ob_top_row.add_child(onboarding_speaker_label)

	onboarding_voice_btn = Button.new()
	onboarding_voice_btn.text = "🔈 Voice"
	onboarding_voice_btn.pressed.connect(func() -> void:
		if is_instance_valid(audio_director) and audio_director.has_method("play_voice"):
			var act_d: Dictionary = GameDesignData.get_onboarding_act(current_onboarding_act, current_language)
			audio_director.call("play_voice", String(act_d.get("voice_key", "act1_aldric")), true)
		replay_act_voice_requested.emit(current_onboarding_act)
	)
	ob_top_row.add_child(onboarding_voice_btn)

	onboarding_next_btn = Button.new()
	onboarding_next_btn.text = "Next Act [N] ➔"
	onboarding_next_btn.pressed.connect(func() -> void:
		if is_instance_valid(main_game) and main_game.has_method("advance_onboarding_act"):
			main_game.call("advance_onboarding_act")
		next_onboarding_act_requested.emit()
	)
	ob_top_row.add_child(onboarding_next_btn)
	ob_vbox.add_child(ob_top_row)

	onboarding_title_label = Label.new()
	onboarding_title_label.text = "Act 1 — Awakening at the Bastion & Bearings"
	onboarding_title_label.add_theme_color_override("font_color", Color(1.0, 0.95, 0.82))
	onboarding_title_label.add_theme_font_size_override("font_size", 14)
	ob_vbox.add_child(onboarding_title_label)

	onboarding_desc_label = Label.new()
	onboarding_desc_label.text = "Walk to the golden beacon near the campfire with WASD and rotate the tactical camera with [R] / [F] or Right-Click drag."
	onboarding_desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	onboarding_desc_label.add_theme_font_size_override("font_size", 12)
	ob_vbox.add_child(onboarding_desc_label)

	var ob_prog_row := HBoxContainer.new()
	ob_prog_row.add_theme_constant_override("separation", 8)
	onboarding_obj_bar = ProgressBar.new()
	onboarding_obj_bar.custom_minimum_size = Vector2(140, 14)
	onboarding_obj_bar.max_value = 100.0
	onboarding_obj_bar.value = 35.0
	onboarding_obj_bar.show_percentage = false
	ob_prog_row.add_child(onboarding_obj_bar)

	onboarding_obj_label = Label.new()
	onboarding_obj_label.text = "Objective: Reach the Golden Beacon near the Bastion (0, 12)"
	onboarding_obj_label.add_theme_color_override("font_color", Color(0.55, 0.95, 0.68))
	onboarding_obj_label.add_theme_font_size_override("font_size", 11)
	ob_prog_row.add_child(onboarding_obj_label)
	ob_vbox.add_child(ob_prog_row)

	# 2. Narrative Alert Banner (below Onboarding Banner when active)
	alert_banner_panel = PanelContainer.new()
	alert_banner_panel.name = "AlertBannerPanel"
	alert_banner_panel.visible = false
	alert_banner_panel.anchor_left = 0.24
	alert_banner_panel.anchor_right = 0.76
	alert_banner_panel.anchor_top = 0.0
	alert_banner_panel.anchor_bottom = 0.0
	alert_banner_panel.offset_top = 178
	alert_banner_panel.offset_bottom = 248
	alert_banner_panel.add_theme_stylebox_override(
		"panel",
		_make_panel_style(Color(0.20, 0.05, 0.07, 0.94), Color(1.0, 0.32, 0.28, 0.90), 8, 2)
	)
	root_control.add_child(alert_banner_panel)

	var al_hbox := HBoxContainer.new()
	al_hbox.add_theme_constant_override("separation", 10)
	alert_banner_panel.add_child(al_hbox)

	alert_portrait_rect = TextureRect.new()
	alert_portrait_rect.custom_minimum_size = Vector2(54, 54)
	alert_portrait_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	alert_portrait_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	al_hbox.add_child(alert_portrait_rect)

	var al_vbox := VBoxContainer.new()
	al_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	alert_title_label = Label.new()
	alert_title_label.add_theme_color_override("font_color", Color(1.0, 0.75, 0.32))
	alert_title_label.add_theme_font_size_override("font_size", 13)
	al_vbox.add_child(alert_title_label)

	alert_body_label = Label.new()
	alert_body_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	alert_body_label.add_theme_font_size_override("font_size", 12)
	al_vbox.add_child(alert_body_label)
	al_hbox.add_child(al_vbox)

	alert_close_btn = Button.new()
	alert_close_btn.text = "✕"
	alert_close_btn.pressed.connect(func() -> void: alert_banner_panel.visible = false)
	al_hbox.add_child(alert_close_btn)


func _build_left_panel() -> void:
	left_panel = PanelContainer.new()
	left_panel.name = "LeftHUDPanel"
	left_panel.anchor_left = 0.0
	left_panel.anchor_right = 0.0
	left_panel.anchor_top = 0.0
	left_panel.anchor_bottom = 1.0
	left_panel.offset_left = 10
	left_panel.offset_right = 290
	left_panel.offset_top = 58
	left_panel.offset_bottom = -95
	left_panel.add_theme_stylebox_override(
		"panel",
		_make_panel_style(Color(0.05, 0.08, 0.12, 0.88), Color(0.35, 0.55, 0.72, 0.45), 8, 1)
	)
	root_control.add_child(left_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 5)
	left_panel.add_child(vbox)

	guardian_section_title = Label.new()
	guardian_section_title.text = "🛡️ GUARDIAN & RESOURCES"
	guardian_section_title.add_theme_color_override("font_color", Color(0.95, 0.78, 0.35))
	guardian_section_title.add_theme_font_size_override("font_size", 13)
	vbox.add_child(guardian_section_title)

	# Guardian HP Bar
	var hp_row := HBoxContainer.new()
	hp_value_label = Label.new()
	hp_value_label.text = "❤️ HP: 160/160"
	hp_value_label.add_theme_font_size_override("font_size", 12)
	hp_value_label.custom_minimum_size = Vector2(115, 0)
	hp_row.add_child(hp_value_label)

	hp_bar = ProgressBar.new()
	hp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hp_bar.custom_minimum_size = Vector2(105, 14)
	hp_bar.max_value = 160.0
	hp_bar.value = 160.0
	hp_bar.show_percentage = false
	hp_row.add_child(hp_bar)
	vbox.add_child(hp_row)

	# Bastion HP Bar
	var bhp_row := HBoxContainer.new()
	bastion_hp_label = Label.new()
	bastion_hp_label.text = "🏰 Bastion: 500/500"
	bastion_hp_label.add_theme_font_size_override("font_size", 12)
	bastion_hp_label.custom_minimum_size = Vector2(115, 0)
	bhp_row.add_child(bastion_hp_label)

	bastion_hp_bar = ProgressBar.new()
	bastion_hp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bastion_hp_bar.custom_minimum_size = Vector2(105, 14)
	bastion_hp_bar.max_value = 500.0
	bastion_hp_bar.value = 500.0
	bastion_hp_bar.show_percentage = false
	bhp_row.add_child(bastion_hp_bar)
	vbox.add_child(bhp_row)

	# XP Bar
	var xp_row := HBoxContainer.new()
	xp_value_label = Label.new()
	xp_value_label.text = "⭐ Lv.1 (0/100 XP)"
	xp_value_label.add_theme_font_size_override("font_size", 12)
	xp_value_label.custom_minimum_size = Vector2(115, 0)
	xp_row.add_child(xp_value_label)

	xp_bar = ProgressBar.new()
	xp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	xp_bar.custom_minimum_size = Vector2(105, 12)
	xp_bar.max_value = 100.0
	xp_bar.value = 0.0
	xp_bar.show_percentage = false
	xp_row.add_child(xp_bar)
	vbox.add_child(xp_row)

	# Resource Grid
	var res_grid := GridContainer.new()
	res_grid.columns = 2
	res_grid.add_theme_constant_override("h_separation", 8)
	res_grid.add_theme_constant_override("v_separation", 2)

	res_wood_label = Label.new()
	res_wood_label.text = "🪵 Wood: 40"
	res_wood_label.add_theme_font_size_override("font_size", 12)
	res_grid.add_child(res_wood_label)

	res_stone_label = Label.new()
	res_stone_label.text = "🪨 Stone: 25"
	res_stone_label.add_theme_font_size_override("font_size", 12)
	res_grid.add_child(res_stone_label)

	res_crystal_label = Label.new()
	res_crystal_label.text = "💎 Crystal: 20"
	res_crystal_label.add_theme_font_size_override("font_size", 12)
	res_grid.add_child(res_crystal_label)

	res_biomass_label = Label.new()
	res_biomass_label.text = "🌿 Biomass: 30"
	res_biomass_label.add_theme_font_size_override("font_size", 12)
	res_grid.add_child(res_biomass_label)
	vbox.add_child(res_grid)

	res_food_label = Label.new()
	res_food_label.text = "🍖 Rations: 60 / 150 (Well-Fed)"
	res_food_label.add_theme_color_override("font_color", Color(0.58, 0.92, 0.52))
	res_food_label.add_theme_font_size_override("font_size", 12)
	vbox.add_child(res_food_label)

	equipped_weapon_btn = Button.new()
	equipped_weapon_btn.text = "⚔️ Weapon: Runic Steel [K]"
	equipped_weapon_btn.pressed.connect(func() -> void: toggle_weapon_modal())
	vbox.add_child(equipped_weapon_btn)

	relic_status_btn = Button.new()
	relic_status_btn.text = "🧩 Eden Relics: 0 / 3 [V]"
	relic_status_btn.pressed.connect(func() -> void: toggle_shield_modal())
	vbox.add_child(relic_status_btn)

	vbox.add_child(HSeparator.new())

	# Ecosystem & Diploid Genetics Section
	eco_section_title = Label.new()
	eco_section_title.text = "🧬 DIPLOID ECOSYSTEM & CONWAY"
	eco_section_title.add_theme_color_override("font_color", Color(0.45, 0.92, 0.68))
	eco_section_title.add_theme_font_size_override("font_size", 12)
	vbox.add_child(eco_section_title)

	eco_summary_label = Label.new()
	eco_summary_label.text = "Conway Gen #1 · Alive Cells: 180\nInheritance: [Dad, Mom] ± 10%"
	eco_summary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	eco_summary_label.add_theme_font_size_override("font_size", 11)
	vbox.add_child(eco_summary_label)

	dragon_status_label = Label.new()
	dragon_status_label.text = "🐉 Sovereign Dragons: Peaceful (Do not provoke!)"
	dragon_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dragon_status_label.add_theme_color_override("font_color", Color(0.95, 0.80, 0.38))
	dragon_status_label.add_theme_font_size_override("font_size", 11)
	vbox.add_child(dragon_status_label)

	vbox.add_child(HSeparator.new())

	# Adaptive Mastery Section (<= 1% per monster with diminishing returns, max +15%)
	mastery_section_title = Label.new()
	mastery_section_title.text = "🎯 ADAPTIVE MASTERY (<=1%/kill, max +15%)"
	mastery_section_title.add_theme_color_override("font_color", Color(0.95, 0.78, 0.35))
	mastery_section_title.add_theme_font_size_override("font_size", 12)
	vbox.add_child(mastery_section_title)

	mastery_list_box = VBoxContainer.new()
	mastery_list_box.add_theme_constant_override("separation", 2)
	vbox.add_child(mastery_list_box)


func _build_right_panel() -> void:
	right_panel = PanelContainer.new()
	right_panel.name = "RightHUDPanel"
	right_panel.anchor_left = 1.0
	right_panel.anchor_right = 1.0
	right_panel.anchor_top = 0.0
	right_panel.anchor_bottom = 1.0
	right_panel.offset_left = -280
	right_panel.offset_right = -10
	right_panel.offset_top = 58
	right_panel.offset_bottom = -95
	right_panel.add_theme_stylebox_override(
		"panel",
		_make_panel_style(Color(0.05, 0.08, 0.12, 0.88), Color(0.35, 0.55, 0.72, 0.45), 8, 1)
	)
	root_control.add_child(right_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 5)
	right_panel.add_child(vbox)

	minimap_title_label = Label.new()
	minimap_title_label.text = "🧭 TACTICAL RADAR & MINIMAP"
	minimap_title_label.add_theme_color_override("font_color", Color(0.95, 0.78, 0.35))
	minimap_title_label.add_theme_font_size_override("font_size", 13)
	vbox.add_child(minimap_title_label)

	minimap_canvas = MinimapCanvas.new(self)
	minimap_canvas.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	vbox.add_child(minimap_canvas)

	minimap_compass_label = Label.new()
	minimap_compass_label.text = "X: 0  Z: 10 · Sanctuary"
	minimap_compass_label.horizontal_alignment = HorizontalAlignment.HORIZONTAL_ALIGNMENT_CENTER
	minimap_compass_label.add_theme_font_size_override("font_size", 11)
	vbox.add_child(minimap_compass_label)

	minimap_legend_label = Label.new()
	minimap_legend_label.text = "🟢 Bastion  🔴 Mutant  🟠 Dragon  🟢 Prey  🔵 Relic"
	minimap_legend_label.horizontal_alignment = HorizontalAlignment.HORIZONTAL_ALIGNMENT_CENTER
	minimap_legend_label.add_theme_font_size_override("font_size", 10)
	vbox.add_child(minimap_legend_label)

	vbox.add_child(HSeparator.new())

	quest_section_title = Label.new()
	quest_section_title.text = "📜 ACTIVE OPERATION"
	quest_section_title.add_theme_color_override("font_color", Color(0.45, 0.92, 0.68))
	quest_section_title.add_theme_font_size_override("font_size", 12)
	vbox.add_child(quest_section_title)

	quest_title_label = Label.new()
	quest_title_label.text = "Track Patient Zero & Gather 3 Eden Relics"
	quest_title_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	quest_title_label.add_theme_color_override("font_color", Color(1.0, 0.92, 0.72))
	quest_title_label.add_theme_font_size_override("font_size", 12)
	vbox.add_child(quest_title_label)

	quest_step_label = Label.new()
	quest_step_label.text = "• Harvest resources [E] & build Watchtower [H]\n• Collect 3 Relic Monoliths to raise the Solar Aegis [V]"
	quest_step_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	quest_step_label.add_theme_font_size_override("font_size", 11)
	vbox.add_child(quest_step_label)

	vbox.add_child(HSeparator.new())

	buildings_section_title = Label.new()
	buildings_section_title.text = "🏰 BASTION INFRASTRUCTURE [H]"
	buildings_section_title.add_theme_color_override("font_color", Color(0.95, 0.78, 0.35))
	buildings_section_title.add_theme_font_size_override("font_size", 12)
	vbox.add_child(buildings_section_title)

	buildings_summary_box = VBoxContainer.new()
	buildings_summary_box.add_theme_constant_override("separation", 2)
	vbox.add_child(buildings_summary_box)

	var quick_grid := GridContainer.new()
	quick_grid.columns = 2
	quick_grid.add_theme_constant_override("h_separation", 6)
	quick_grid.add_theme_constant_override("v_separation", 4)

	quick_bastion_btn = Button.new()
	quick_bastion_btn.text = "🏰 Bastion [H]"
	quick_bastion_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quick_bastion_btn.pressed.connect(func() -> void: toggle_bastion_modal())
	quick_grid.add_child(quick_bastion_btn)

	quick_weapon_btn = Button.new()
	quick_weapon_btn.text = "⚔️ Forge [K]"
	quick_weapon_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quick_weapon_btn.pressed.connect(func() -> void: toggle_weapon_modal())
	quick_grid.add_child(quick_weapon_btn)

	quick_shield_btn = Button.new()
	quick_shield_btn.text = "🛡️ Shield [V]"
	quick_shield_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quick_shield_btn.pressed.connect(func() -> void: toggle_shield_modal())
	quick_grid.add_child(quick_shield_btn)

	quick_codex_btn = Button.new()
	quick_codex_btn.text = "🧬 Codex [Tab]"
	quick_codex_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quick_codex_btn.pressed.connect(func() -> void: toggle_codex_modal())
	quick_grid.add_child(quick_codex_btn)

	vbox.add_child(quick_grid)


func _build_bottom_stack() -> void:
	bottom_stack = VBoxContainer.new()
	bottom_stack.name = "BottomHUDStack"
	bottom_stack.anchor_left = 0.18
	bottom_stack.anchor_right = 0.82
	bottom_stack.anchor_top = 1.0
	bottom_stack.anchor_bottom = 1.0
	bottom_stack.offset_top = -90
	bottom_stack.offset_bottom = -6
	bottom_stack.add_theme_constant_override("separation", 4)
	root_control.add_child(bottom_stack)

	# 1. Contextual 3D Interaction Prompt Bar
	context_prompt_panel = PanelContainer.new()
	context_prompt_panel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	context_prompt_panel.add_theme_stylebox_override(
		"panel",
		_make_panel_style(Color(0.08, 0.14, 0.18, 0.90), Color(0.45, 0.92, 0.68, 0.70), 6, 1)
	)
	context_prompt_label = Label.new()
	context_prompt_label.text = "🌲 Move near a Resource, Survivor Cage, or Relic Monolith and press [E] (Rotate camera: [R]/[F])"
	context_prompt_label.add_theme_color_override("font_color", Color(0.85, 0.98, 0.88))
	context_prompt_label.add_theme_font_size_override("font_size", 12)
	context_prompt_panel.add_child(context_prompt_label)
	bottom_stack.add_child(context_prompt_panel)

	# 2. 4-Slot 3D Spell Bar ([1][2][3][4] / AUTO)
	var spell_hbox := HBoxContainer.new()
	spell_hbox.alignment = BoxContainer.ALIGNMENT_CENTER
	spell_hbox.add_theme_constant_override("separation", 10)
	spell_slot_buttons.clear()

	var default_spells := [
		{"icon": "⚡", "en": "Runic Bolt", "fr": "Trait Runique"},
		{"icon": "❄️", "en": "Frost Nova", "fr": "Nova de Givre"},
		{"icon": "🔥", "en": "Flame Wave", "fr": "Vague Ignée"},
		{"icon": "🌿", "en": "Nature Thorns", "fr": "Ronces Sylvestres"},
	]
	for i in range(4):
		var slot_idx: int = i
		var spell_btn := Button.new()
		spell_btn.custom_minimum_size = Vector2(155, 32)
		spell_btn.text = "%s [%d] %s Lv.1" % [default_spells[i]["icon"], i + 1, default_spells[i]["en"]]
		spell_btn.pressed.connect(func() -> void:
			if is_instance_valid(player_ref) and player_ref.has_method("cast_spell_slot"):
				player_ref.call("cast_spell_slot", slot_idx)
			spell_cast_requested.emit(slot_idx)
		)
		spell_hbox.add_child(spell_btn)
		spell_slot_buttons.append(spell_btn)
	bottom_stack.add_child(spell_hbox)

	# 3. Hotkey Reference Bar
	hotkey_bar_label = Label.new()
	hotkey_bar_label.horizontal_alignment = HorizontalAlignment.HORIZONTAL_ALIGNMENT_CENTER
	hotkey_bar_label.add_theme_color_override("font_color", Color(0.78, 0.84, 0.90))
	hotkey_bar_label.add_theme_font_size_override("font_size", 11)
	hotkey_bar_label.text = "[WASD/ZQSD] Move · [R/F] Rotate Camera · [E] Harvest/Interact · [1-4] Spells · [C] Auto/Active · [H] Bastion · [K] Weapons · [V] Shield · [Tab] Codex · [O] Settings/Lang · [J] Blender .glb"
	bottom_stack.add_child(hotkey_bar_label)


## ============================================================================
## MODALS LAYER (SETTINGS [O], BASTION [H], WEAPONS [K], SHIELD [V], LEVEL-UP, CODEX [Tab], GAME OVER [X])
## ============================================================================
func _build_modals_layer() -> void:
	modal_backdrop = ColorRect.new()
	modal_backdrop.name = "ModalBackdrop"
	modal_backdrop.visible = false
	modal_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	modal_backdrop.color = Color(0.01, 0.02, 0.04, 0.78)
	root_control.add_child(modal_backdrop)

	settings_modal = _create_modal_shell("SettingsModal", Vector2(760, 560))
	settings_body_box = settings_modal.get_node("BodyScroll/BodyVBox") as VBoxContainer

	bastion_modal = _create_modal_shell("BastionModal", Vector2(780, 520))
	bastion_body_box = bastion_modal.get_node("BodyScroll/BodyVBox") as VBoxContainer

	weapon_modal = _create_modal_shell("WeaponModal", Vector2(780, 520))
	weapon_body_box = weapon_modal.get_node("BodyScroll/BodyVBox") as VBoxContainer

	shield_modal = _create_modal_shell("ShieldModal", Vector2(720, 460))
	shield_body_box = shield_modal.get_node("BodyScroll/BodyVBox") as VBoxContainer

	levelup_modal = _create_modal_shell("LevelUpModal", Vector2(760, 460))
	levelup_body_box = levelup_modal.get_node("BodyScroll/BodyVBox") as VBoxContainer

	codex_modal = _create_modal_shell("CodexModal", Vector2(860, 580))
	codex_body_box = codex_modal.get_node("BodyScroll/BodyVBox") as VBoxContainer

	gameover_modal = _create_modal_shell("GameOverModal", Vector2(780, 520))
	gameover_body_box = gameover_modal.get_node("BodyScroll/BodyVBox") as VBoxContainer


func _create_modal_shell(modal_name: String, min_sz: Vector2) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = modal_name
	panel.visible = false
	panel.custom_minimum_size = min_sz
	panel.anchor_left = 0.5
	panel.anchor_right = 0.5
	panel.anchor_top = 0.5
	panel.anchor_bottom = 0.5
	panel.offset_left = -min_sz.x * 0.5
	panel.offset_right = min_sz.x * 0.5
	panel.offset_top = -min_sz.y * 0.5
	panel.offset_bottom = min_sz.y * 0.5
	panel.add_theme_stylebox_override(
		"panel",
		_make_panel_style(Color(0.06, 0.09, 0.14, 0.97), Color(0.92, 0.68, 0.28, 0.90), 12, 2)
	)
	root_control.add_child(panel)

	var scroll := ScrollContainer.new()
	scroll.name = "BodyScroll"
	scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	panel.add_child(scroll)

	var vbox := VBoxContainer.new()
	vbox.name = "BodyVBox"
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.add_theme_constant_override("separation", 10)
	scroll.add_child(vbox)
	return panel


func close_all_modals() -> void:
	is_settings_open = false
	is_bastion_open = false
	is_weapon_open = false
	is_shield_open = false
	is_levelup_open = false
	is_codex_open = false
	is_gameover_open = false
	if is_instance_valid(settings_modal):
		settings_modal.visible = false
	if is_instance_valid(bastion_modal):
		bastion_modal.visible = false
	if is_instance_valid(weapon_modal):
		weapon_modal.visible = false
	if is_instance_valid(shield_modal):
		shield_modal.visible = false
	if is_instance_valid(levelup_modal):
		levelup_modal.visible = false
	if is_instance_valid(codex_modal):
		codex_modal.visible = false
	if is_instance_valid(gameover_modal):
		gameover_modal.visible = false
	if is_instance_valid(modal_backdrop):
		modal_backdrop.visible = false


## ============================================================================
## 1. SETTINGS MODAL [O] (LANGUAGE EN/FR, VOICE PREVIEW, AUDIO MIXER, 3D GRAPHICS)
## ============================================================================
func toggle_settings_modal(force_state: Variant = null) -> bool:
	var target: bool = bool(force_state) if typeof(force_state) == TYPE_BOOL else not is_settings_open
	close_all_modals()
	is_settings_open = target
	modal_backdrop.visible = target
	settings_modal.visible = target
	if target:
		_render_settings_modal()
	return is_settings_open


func _render_settings_modal() -> void:
	for child in settings_body_box.get_children():
		child.queue_free()

	var header := HBoxContainer.new()
	var title := Label.new()
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_color_override("font_color", Color(0.98, 0.82, 0.38))
	title.add_theme_font_size_override("font_size", 18)
	title.text = tr_ui(
		"⚙️ SETTINGS — LANGUAGE, VOICES, AUDIO & 3D GRAPHICS [O]",
		"⚙️ PARAMÈTRES — LANGUE, VOIX, AUDIO & GRAPHISMES 3D [O]"
	)
	header.add_child(title)

	var close_btn := Button.new()
	close_btn.text = tr_ui("✕ Close [O / Esc]", "✕ Fermer [O / Échap]")
	close_btn.pressed.connect(func() -> void: toggle_settings_modal(false))
	header.add_child(close_btn)
	settings_body_box.add_child(header)

	settings_body_box.add_child(HSeparator.new())

	# Section 1: Interface & Voice Language (English Default, French 2nd)
	var lang_title := Label.new()
	lang_title.add_theme_color_override("font_color", Color(0.48, 0.94, 0.70))
	lang_title.add_theme_font_size_override("font_size", 15)
	lang_title.text = tr_ui(
		"🌐 1. Interface & Gemini TTS Voice Language (English Default • French 2nd)",
		"🌐 1. Langue de l'Interface & des Voix Gemini TTS (Anglais par défaut • Français 2e)"
	)
	settings_body_box.add_child(lang_title)

	var lang_row := HBoxContainer.new()
	lang_row.add_theme_constant_override("separation", 12)

	var en_btn := Button.new()
	en_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	en_btn.custom_minimum_size = Vector2(220, 44)
	en_btn.text = "🇬🇧 English (Default)%s" % ("  ✅ ACTIVE" if current_language == "en" else "")
	en_btn.pressed.connect(func() -> void:
		if is_instance_valid(main_game) and main_game.has_method("set_active_language"):
			main_game.call("set_active_language", "en")
		else:
			set_language("en")
		_render_settings_modal()
	)
	lang_row.add_child(en_btn)

	var fr_btn := Button.new()
	fr_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	fr_btn.custom_minimum_size = Vector2(220, 44)
	fr_btn.text = "🇫🇷 Français (2nd Choice)%s" % ("  ✅ ACTIF" if current_language == "fr" else "")
	fr_btn.pressed.connect(func() -> void:
		if is_instance_valid(main_game) and main_game.has_method("set_active_language"):
			main_game.call("set_active_language", "fr")
		else:
			set_language("fr")
		_render_settings_modal()
	)
	lang_row.add_child(fr_btn)
	settings_body_box.add_child(lang_row)

	var preview_voice_btn := Button.new()
	preview_voice_btn.text = tr_ui(
		"🔈 Preview Gemini TTS Voiceover (Commander Aldric & Kaelen — EN)",
		"🔈 Tester la Voix Gemini TTS (Commandant Aldric & Kaelen — FR)"
	)
	preview_voice_btn.pressed.connect(func() -> void:
		if is_instance_valid(audio_director) and audio_director.has_method("play_voice"):
			var act_d: Dictionary = GameDesignData.get_onboarding_act(current_onboarding_act, current_language)
			audio_director.call("play_voice", String(act_d.get("voice_key", "act1_aldric")), true)
		preview_voice_requested.emit(current_language)
		replay_act_voice_requested.emit(current_onboarding_act)
	)
	settings_body_box.add_child(preview_voice_btn)

	settings_body_box.add_child(HSeparator.new())

	# Section 2: Audio Mixer (Lyria 3 Adaptive Music, Gemini TTS Voices, Procedural SFX)
	var audio_title := Label.new()
	audio_title.add_theme_color_override("font_color", Color(0.48, 0.94, 0.70))
	audio_title.add_theme_font_size_override("font_size", 15)
	audio_title.text = tr_ui(
		"🔊 2. Audio Mixer — Lyria 3 Stems, Gemini TTS Voices & Combat SFX",
		"🔊 2. Mixeur Audio — Musique Lyria 3, Voix Gemini TTS & Effets SFX"
	)
	settings_body_box.add_child(audio_title)

	var mute_toggle_btn := Button.new()
	mute_toggle_btn.text = (
		tr_ui("🔇 Audio is MUTED — Click to Unmute [M]", "🔇 Audio MUET — Cliquer pour Réactiver [M]")
		if is_audio_muted
		else tr_ui("🔊 Audio is ACTIVE — Click to Mute [M]", "🔊 Audio ACTIF — Cliquer pour Couper [M]")
	)
	mute_toggle_btn.pressed.connect(func() -> void:
		is_audio_muted = not is_audio_muted
		if is_instance_valid(audio_director) and audio_director.has_method("set_muted"):
			audio_director.call("set_muted", is_audio_muted)
		_refresh_top_bar_buttons()
		audio_mute_toggled.emit(is_audio_muted)
		_render_settings_modal()
	)
	settings_body_box.add_child(mute_toggle_btn)

	var channels := [
		{"id": "music", "val": music_volume, "en": "🎵 Music Volume (Lyria 3):", "fr": "🎵 Volume Musique (Lyria 3) :"},
		{"id": "voice", "val": voice_volume, "en": "🎙️ Voiceover Volume (Gemini TTS):", "fr": "🎙️ Volume Voix (Gemini TTS) :"},
		{"id": "sfx", "val": sfx_volume, "en": "⚔️ Combat & World SFX Volume:", "fr": "⚔️ Volume Effets Sonores (SFX) :"},
	]
	var steps := [0.0, 0.25, 0.50, 0.75, 1.0]
	for ch in channels:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		var lbl := Label.new()
		lbl.custom_minimum_size = Vector2(250, 0)
		lbl.text = tr_ui(String(ch["en"]), String(ch["fr"]))
		row.add_child(lbl)

		var cur_v: float = float(ch["val"])
		var ch_id: String = String(ch["id"])
		for st in steps:
			var step_val: float = float(st)
			var pct: int = int(round(step_val * 100.0))
			var is_sel: bool = absf(cur_v - step_val) < 0.08
			var v_btn := Button.new()
			v_btn.text = "%s%d%%" % [("✅ " if is_sel else ""), pct]
			v_btn.pressed.connect(func() -> void:
				if ch_id == "music":
					music_volume = step_val
					if is_instance_valid(audio_director) and audio_director.has_method("set_music_volume"):
						audio_director.call("set_music_volume", step_val)
				elif ch_id == "voice":
					voice_volume = step_val
					if is_instance_valid(audio_director) and audio_director.has_method("set_voice_volume"):
						audio_director.call("set_voice_volume", step_val)
				else:
					sfx_volume = step_val
					if is_instance_valid(audio_director) and audio_director.has_method("set_sfx_volume"):
						audio_director.call("set_sfx_volume", step_val)
				audio_volume_changed.emit(ch_id, step_val)
				_render_settings_modal()
			)
			row.add_child(v_btn)
		settings_body_box.add_child(row)

	settings_body_box.add_child(HSeparator.new())

	# Section 3: Gameplay & 3D Graphics Toggles
	var gfx_title := Label.new()
	gfx_title.add_theme_color_override("font_color", Color(0.48, 0.94, 0.70))
	gfx_title.add_theme_font_size_override("font_size", 15)
	gfx_title.text = tr_ui(
		"🎮 3. Gameplay & 3D Graphics Options",
		"🎮 3. Options de Gameplay & Graphismes 3D"
	)
	settings_body_box.add_child(gfx_title)

	var toggles_grid := GridContainer.new()
	toggles_grid.columns = 2
	toggles_grid.add_theme_constant_override("h_separation", 10)
	toggles_grid.add_theme_constant_override("v_separation", 8)

	var c_btn := Button.new()
	c_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	c_btn.text = (
		tr_ui("⚡ Combat: Auto (Vampire Survivors) [C]", "⚡ Combat : Auto (Vampire Survivors) [C]")
		if combat_mode == "auto"
		else tr_ui("⚔️ Combat: Active (Diablo [1-4]) [C]", "⚔️ Combat : Actif (Diablo [1-4]) [C]")
	)
	c_btn.pressed.connect(func() -> void:
		combat_mode = "active" if combat_mode == "auto" else "auto"
		if is_instance_valid(player_ref) and "combat_mode" in player_ref:
			player_ref.set("combat_mode", combat_mode)
		_refresh_top_bar_buttons()
		combat_mode_toggled.emit(combat_mode)
		_render_settings_modal()
	)
	toggles_grid.add_child(c_btn)

	var m_btn := Button.new()
	m_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m_btn.text = (
		tr_ui("🎨 3D Models: Blender 5.0 (.glb) [J]", "🎨 Modèles 3D : Blender 5.0 (.glb) [J]")
		if use_blender_models
		else tr_ui("📐 3D Models: Procedural Classic [J]", "📐 Modèles 3D : Procédural Classique [J]")
	)
	m_btn.pressed.connect(func() -> void:
		if is_instance_valid(main_game) and main_game.has_method("toggle_blender_models"):
			use_blender_models = bool(main_game.call("toggle_blender_models"))
		else:
			use_blender_models = not use_blender_models
		_refresh_top_bar_buttons()
		models_mode_toggled.emit(use_blender_models)
		_render_settings_modal()
	)
	toggles_grid.add_child(m_btn)

	var b_btn := Button.new()
	b_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b_btn.text = (
		tr_ui("✨ Glow / Bloom: ON", "✨ Glow / Bloom : ACTIVÉ")
		if bloom_enabled
		else tr_ui("⚡ Glow / Bloom: OFF (Direct 60FPS)", "⚡ Glow / Bloom : DÉSACTIVÉ (60FPS)")
	)
	b_btn.pressed.connect(func() -> void:
		if is_instance_valid(main_game) and main_game.has_method("toggle_bloom"):
			bloom_enabled = bool(main_game.call("toggle_bloom"))
		else:
			bloom_enabled = not bloom_enabled
		bloom_toggled.emit(bloom_enabled)
		_render_settings_modal()
	)
	toggles_grid.add_child(b_btn)

	var g_btn := Button.new()
	g_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	g_btn.text = (
		tr_ui("🧬 Conway 3D Grid Overlay: ON [G]", "🧬 Grille 3D Conway : ACTIVÉE [G]")
		if conway_overlay_visible
		else tr_ui("🧬 Conway 3D Grid Overlay: OFF [G]", "🧬 Grille 3D Conway : MASQUÉE [G]")
	)
	g_btn.pressed.connect(func() -> void:
		if is_instance_valid(main_game) and main_game.has_method("toggle_conway_overlay"):
			conway_overlay_visible = bool(main_game.call("toggle_conway_overlay"))
		else:
			conway_overlay_visible = not conway_overlay_visible
		conway_overlay_toggled.emit(conway_overlay_visible)
		_render_settings_modal()
	)
	toggles_grid.add_child(g_btn)

	settings_body_box.add_child(toggles_grid)


## ============================================================================
## 2. BASTION ARCHITECT MODAL [H]
## ============================================================================
func toggle_build_modal(force_state: Variant = null) -> bool:
	return toggle_bastion_modal(force_state)


func toggle_bastion_modal(force_state: Variant = null) -> bool:
	var target: bool = bool(force_state) if typeof(force_state) == TYPE_BOOL else not is_bastion_open
	close_all_modals()
	is_bastion_open = target
	modal_backdrop.visible = target
	bastion_modal.visible = target
	if target:
		_render_bastion_modal()
	return is_bastion_open


func _render_bastion_modal() -> void:
	for child in bastion_body_box.get_children():
		child.queue_free()

	var header := HBoxContainer.new()
	var title := Label.new()
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_color_override("font_color", Color(0.98, 0.82, 0.38))
	title.add_theme_font_size_override("font_size", 18)
	title.text = tr_ui(
		"🏰 BASTION ARCHITECT — SANCTUARY INFRASTRUCTURE [H]",
		"🏰 ARCHITECTE DU BASTION — INFRASTRUCTURES DU SANCTUAIRE [H]"
	)
	header.add_child(title)

	var close_btn := Button.new()
	close_btn.text = tr_ui("✕ Close [H / Esc]", "✕ Fermer [H / Échap]")
	close_btn.pressed.connect(func() -> void: toggle_bastion_modal(false))
	header.add_child(close_btn)
	bastion_body_box.add_child(header)
	bastion_body_box.add_child(HSeparator.new())

	var buildings: Array = GameDesignData.get_buildings_catalog(current_language)
	var levels_map: Dictionary = last_state.get("building_levels", {})

	for b in buildings:
		if not (b is Dictionary):
			continue
		var b_id: String = String(b.get("id", "watchtower"))
		var lvl: int = int(levels_map.get(b_id, b.get("level", 1)))
		var b_name: String = String(b.get("name", b_id))
		var b_desc: String = String(b.get("description", b.get("effect", "")))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)

		var info := Label.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		info.text = "%s %s (Lv. %d/3) — %s" % [String(b.get("icon", "🏰")), b_name, lvl, b_desc]
		row.add_child(info)

		var upg_btn := Button.new()
		upg_btn.disabled = lvl >= 3
		upg_btn.text = tr_ui("✅ MAX (3/3)", "✅ MAX (3/3)") if lvl >= 3 else tr_ui("⬆️ Build / Upgrade", "⬆️ Bâtir / Améliorer")
		upg_btn.pressed.connect(func() -> void:
			if is_instance_valid(main_game) and "building_levels" in main_game:
				var bl: Dictionary = main_game.get("building_levels")
				bl[b_id] = mini(3, int(bl.get(b_id, 1)) + 1)
			levels_map[b_id] = mini(3, lvl + 1)
			building_upgrade_requested.emit(b_id)
			_render_bastion_modal()
		)
		row.add_child(upg_btn)
		bastion_body_box.add_child(row)


## ============================================================================
## 3. ELEMENTAL WEAPON FORGE MODAL [K]
## ============================================================================
func toggle_weapon_modal(force_state: Variant = null) -> bool:
	var target: bool = bool(force_state) if typeof(force_state) == TYPE_BOOL else not is_weapon_open
	close_all_modals()
	is_weapon_open = target
	modal_backdrop.visible = target
	weapon_modal.visible = target
	if target:
		_render_weapon_modal()
	return is_weapon_open


func _render_weapon_modal() -> void:
	for child in weapon_body_box.get_children():
		child.queue_free()

	var header := HBoxContainer.new()
	var title := Label.new()
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_color_override("font_color", Color(0.98, 0.82, 0.38))
	title.add_theme_font_size_override("font_size", 18)
	title.text = tr_ui(
		"⚔️ ELEMENTAL WEAPON FORGE & EDEN RELICS [K]",
		"⚔️ FORGE DES ARMES ÉLÉMENTAIRES & RELIQUES D'ÉDEN [K]"
	)
	header.add_child(title)

	var close_btn := Button.new()
	close_btn.text = tr_ui("✕ Close [K / Esc]", "✕ Fermer [K / Échap]")
	close_btn.pressed.connect(func() -> void: toggle_weapon_modal(false))
	header.add_child(close_btn)
	weapon_body_box.add_child(header)
	weapon_body_box.add_child(HSeparator.new())

	var equipped_id: String = String(last_state.get("equipped_weapon", last_state.get("equipped_weapon_id", "frost_blade")))
	var weapons: Array = GameDesignData.get_weapons_catalog(current_language)

	for w in weapons:
		if not (w is Dictionary):
			continue
		var w_id: String = String(w.get("id", "frost_blade"))
		var is_eq: bool = (w_id == equipped_id)
		var row := HBoxContainer.new()
		var lbl := Label.new()
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		lbl.text = "%s %s — %s" % [String(w.get("icon", "⚔️")), String(w.get("name", w_id)), String(w.get("description", ""))]
		row.add_child(lbl)

		var eq_btn := Button.new()
		eq_btn.text = tr_ui("✅ Equipped", "✅ Équipée") if is_eq else tr_ui("⚔️ Equip", "⚔️ Équiper")
		eq_btn.pressed.connect(func() -> void:
			last_state["equipped_weapon"] = w_id
			if is_instance_valid(player_ref) and "equipped_weapon" in player_ref:
				player_ref.set("equipped_weapon", w_id)
			weapon_equip_requested.emit(w_id)
			_render_weapon_modal()
		)
		row.add_child(eq_btn)
		weapon_body_box.add_child(row)


## ============================================================================
## 4. PLANETARY SHIELD DOME & ISLAND VICTORY MODAL [V]
## ============================================================================
func show_island_victory_modal(p_island_level: int = 1) -> void:
	last_state["island_level"] = p_island_level
	toggle_shield_modal(true)


func toggle_shield_modal(force_state: Variant = null) -> bool:
	var target: bool = bool(force_state) if typeof(force_state) == TYPE_BOOL else not is_shield_open
	close_all_modals()
	is_shield_open = target
	modal_backdrop.visible = target
	shield_modal.visible = target
	if target:
		_render_shield_modal()
	return is_shield_open


func _render_shield_modal() -> void:
	for child in shield_body_box.get_children():
		child.queue_free()

	var relics: int = int(last_state.get("relic_fragments", last_state.get("relics_collected", 0)))
	var island_num: int = int(last_state.get("island_level", last_state.get("island_number", 1)))

	var header := HBoxContainer.new()
	var title := Label.new()
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_color_override("font_color", Color(0.48, 0.94, 0.70))
	title.add_theme_font_size_override("font_size", 18)
	title.text = tr_ui(
		"🛡️ SOLAR AEGIS PLANETARY SHIELD DOME & ARCHIPELAGO [V]",
		"🛡️ DÔME-BOUCLIER PLANÉTAIRE ÉGIDE SOLAIRE & ARCHIPEL [V]"
	)
	header.add_child(title)

	var close_btn := Button.new()
	close_btn.text = tr_ui("✕ Close [V / Esc]", "✕ Fermer [V / Échap]")
	close_btn.pressed.connect(func() -> void: toggle_shield_modal(false))
	header.add_child(close_btn)
	shield_body_box.add_child(header)
	shield_body_box.add_child(HSeparator.new())

	var status_lbl := Label.new()
	status_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_lbl.text = tr_ui(
		"Island #%d — Eden Relic Fragments Collected: %d / 3.\nThe Solar Aegis Planetary Shield Dome sanctuarizes this island's ecosystem and unlocks the voyage to Island #%d!",
		"Île #%d — Fragments de Relique d'Éden collectés : %d / 3.\nLe Dôme-Bouclier Planétaire sanctuarise l'écosystème de cette île et débloque le voyage vers l'Île #%d !"
	) % [island_num, relics, island_num + 1]
	shield_body_box.add_child(status_lbl)

	var sail_btn := Button.new()
	sail_btn.custom_minimum_size = Vector2(0, 44)
	sail_btn.text = tr_ui(
		"⛵ Set Sail for Next Island (Island #%d) ➔" % (island_num + 1),
		"⛵ Cap sur l'Île Suivante (Île #%d) ➔" % (island_num + 1)
	)
	sail_btn.pressed.connect(func() -> void:
		toggle_shield_modal(false)
		if is_instance_valid(main_game) and main_game.has_method("advance_to_next_island"):
			main_game.call("advance_to_next_island")
		advance_next_island_requested.emit()
	)
	shield_body_box.add_child(sail_btn)


## ============================================================================
## 5. LEVEL-UP ROGUELIKE MODAL
## ============================================================================
func show_level_up_modal(arg: Variant = null) -> void:
	close_all_modals()
	is_levelup_open = true
	modal_backdrop.visible = true
	levelup_modal.visible = true

	for child in levelup_body_box.get_children():
		child.queue_free()

	var title := Label.new()
	title.add_theme_color_override("font_color", Color(0.98, 0.82, 0.38))
	title.add_theme_font_size_override("font_size", 18)
	title.text = tr_ui(
		"⚡ LEVEL UP — CHOOSE A 3D SPELL UPGRADE (+8%/LVL) OR ADAPTATION",
		"⚡ MONTÉE DE NIVEAU — CHOISISSEZ UN SORT 3D (+8%/NIV.) OU UNE ADAPTATION"
	)
	levelup_body_box.add_child(title)
	levelup_body_box.add_child(HSeparator.new())

	var default_choices: Array = GameDesignData.get_spells_catalog(current_language)
	var active_choices: Array = arg if (arg is Array and not (arg as Array).is_empty()) else default_choices

	for c in active_choices:
		if not (c is Dictionary):
			continue
		var c_id: String = String(c.get("id", "runic_bolt"))
		var c_btn := Button.new()
		c_btn.custom_minimum_size = Vector2(0, 50)
		c_btn.text = "%s %s (+8%%/Lv) — %s" % [
			String(c.get("icon", "⚡")),
			String(c.get("name", c_id)),
			String(c.get("description", ""))
		]
		c_btn.pressed.connect(func() -> void:
			close_all_modals()
			level_up_choice_selected.emit(c_id)
		)
		levelup_body_box.add_child(c_btn)


## ============================================================================
## 6. PHYLOGENETIC & MENDELIAN CODEX MODAL [Tab]
## ============================================================================
func toggle_codex_modal(force_state: Variant = null) -> bool:
	var target: bool = bool(force_state) if typeof(force_state) == TYPE_BOOL else not is_codex_open
	close_all_modals()
	is_codex_open = target
	modal_backdrop.visible = target
	codex_modal.visible = target
	if target:
		_render_codex_modal()
	return is_codex_open


func _render_codex_modal() -> void:
	for child in codex_body_box.get_children():
		child.queue_free()

	var header := HBoxContainer.new()
	var title := Label.new()
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_color_override("font_color", Color(0.98, 0.82, 0.38))
	title.add_theme_font_size_override("font_size", 18)
	title.text = tr_ui(
		"🧬 PHYLOGENETIC CODEX — DIPLOID [DAD, MOM] ± 10% & 10 SPECIES [Tab]",
		"🧬 CODEX PHYLOGÉNÉTIQUE — HÉRÉDITÉ [PAPA, MAMAN] ± 10% & 10 ESPÈCES [Tab]"
	)
	header.add_child(title)

	var close_btn := Button.new()
	close_btn.text = tr_ui("✕ Close [Tab / Esc]", "✕ Fermer [Tab / Échap]")
	close_btn.pressed.connect(func() -> void: toggle_codex_modal(false))
	header.add_child(close_btn)
	codex_body_box.add_child(header)
	codex_body_box.add_child(HSeparator.new())

	var laws := Label.new()
	laws.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	laws.text = tr_ui(
		"• Diploid Crossover: Offspring inherit quantitative genes in [Parent A, Parent B] * [0.90, 1.10] (±10% mutation drift).\n• Sovereign Dragons (58s gestation): Peaceful unless attacked — provoking even one triggers species-wide Draconic Wrath!\n• Herbivore Prey (Glimmer Elk & Meadow Hare): Hunting them yields +25 Rations, but extinction halts natural HP regeneration.",
		"• Croisement Diploïde : Les enfants héritent de gènes dans [Parent A, Parent B] * [0.90, 1.10] (dérive ±10%).\n• Dragons Souverains (gestation 58s) : Pacifiques tant qu'ils ne sont pas attaqués — en blesser un seul déclenche le Courroux Draconique de toute l'espèce !\n• Gibier Herbivore (Cerf Luminescent & Lièvre des Prés) : +25 Rations par chasse, mais leur extinction bloque la régénération naturelle de PV."
	)
	codex_body_box.add_child(laws)
	codex_body_box.add_child(HSeparator.new())

	var sp_catalog: Dictionary = GameDesignData.get_species_catalog(current_language)
	for sp_id in sp_catalog.keys():
		var sp: Dictionary = sp_catalog[sp_id]
		var lbl := Label.new()
		lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		lbl.add_theme_font_size_override("font_size", 12)
		lbl.text = "• %s (%s) — HP %d · Dmg %d · Spd %.1f · Gestation %.1fs" % [
			String(sp.get("name", sp_id)),
			String(sp.get("clade", "Fauna")),
			int(sp.get("base_hp", 60)),
			int(sp.get("base_damage", 10)),
			float(sp.get("base_speed", 6.0)),
			float(sp.get("gestation_sec", 12.0)),
		]
		codex_body_box.add_child(lbl)


## ============================================================================
## 7. GAME OVER ROGUELIKE REQUIEM MODAL [X]
## ============================================================================
func show_game_over_modal(reason_or_summary: Variant = "", summary: Dictionary = {}) -> void:
	close_all_modals()
	is_gameover_open = true
	modal_backdrop.visible = true
	gameover_modal.visible = true

	for child in gameover_body_box.get_children():
		child.queue_free()

	var title := Label.new()
	title.add_theme_color_override("font_color", Color(1.0, 0.35, 0.32))
	title.add_theme_font_size_override("font_size", 20)
	title.text = tr_ui(
		"💀 GAME OVER — EXPEDITION FALLEN (LYRIA REQUIEM 64 BPM)",
		"💀 GAME OVER — FIN DE L'EXPÉDITION (REQUIEM LYRIA 64 BPM)"
	)
	gameover_body_box.add_child(title)

	if typeof(reason_or_summary) == TYPE_STRING and not String(reason_or_summary).is_empty():
		var reason_lbl := Label.new()
		reason_lbl.text = "⚔️ %s" % String(reason_or_summary)
		reason_lbl.add_theme_color_override("font_color", Color(1.0, 0.78, 0.42))
		gameover_body_box.add_child(reason_lbl)

	var quote := Label.new()
	quote.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	quote.text = tr_ui(
		"Commander Aldric: \"Even the greatest Wardens fall beneath Darwin's law, my friend. Will you restart from zero by the sacred roguelike rule, or let the Flame of Eden raise you to continue this expedition?\"",
		"Commandant Aldric : « Même les plus grands Gardiens tombent parfois sous la loi de Darwin, mon ami. Veux-tu repartir à zéro selon la règle sacrée du roguelike, ou laisser la flamme d'Éden te relever pour continuer cette expédition ? »"
	)
	gameover_body_box.add_child(quote)
	gameover_body_box.add_child(HSeparator.new())

	var restart_btn := Button.new()
	restart_btn.custom_minimum_size = Vector2(0, 48)
	restart_btn.text = tr_ui(
		"🔄 Restart from Zero (Pure Roguelike Run — Lv. 1, Island #1)",
		"🔄 Repartir à Zéro (Nouvelle Run Roguelike — Niv. 1, Île #1)"
	)
	restart_btn.pressed.connect(func() -> void:
		close_all_modals()
		if is_instance_valid(main_game) and main_game.has_method("restart_from_zero"):
			main_game.call("restart_from_zero")
		game_over_restart_requested.emit()
	)
	gameover_body_box.add_child(restart_btn)

	var cont_btn := Button.new()
	cont_btn.custom_minimum_size = Vector2(0, 48)
	cont_btn.text = tr_ui(
		"✨ Continue Anyway (Sanctuary Grace — 100% HP & Keep Progress)",
		"✨ Continuer quand même (Grâce du Sanctuaire — 100% PV & Progression conservée)"
	)
	cont_btn.pressed.connect(func() -> void:
		close_all_modals()
		if is_instance_valid(main_game) and main_game.has_method("continue_with_sanctuary_grace"):
			main_game.call("continue_with_sanctuary_grace")
		game_over_continue_requested.emit()
	)
	gameover_body_box.add_child(cont_btn)


## ============================================================================
## NARRATIVE ALERT BANNER & ONBOARDING BANNER UPDATES
## ============================================================================
func show_alert_banner(
	arg1: String = "",
	arg2: String = "",
	arg3: String = "",
	arg4: String = "",
	arg5: String = "",
	arg6: String = "res://assets/portraits/kaelen_shocked.png"
) -> void:
	if not is_instance_valid(alert_banner_panel):
		return

	# Support both 2-arg call `show_alert_banner(msg, alert_key)` and 6-arg call
	if arg3.is_empty() and arg4.is_empty():
		alert_title_label.text = tr_ui("⚠️ TACTICAL ECOSYSTEM ALERT", "⚠️ ALERTE ÉCOSYSTÈME TACTIQUE")
		alert_body_label.text = arg1
		var p_path := "res://assets/portraits/specimen_dragon_sovereign.png" if "dragon" in arg2 else "res://assets/portraits/kaelen_shocked.png"
		var tex0 := _load_portrait_texture(p_path)
		if tex0 != null:
			alert_portrait_rect.texture = tex0
	else:
		alert_title_label.text = tr_ui(arg2, arg3)
		alert_body_label.text = tr_ui(arg4, arg5)
		var tex := _load_portrait_texture(arg6)
		if tex != null:
			alert_portrait_rect.texture = tex

	alert_banner_panel.visible = true
	alert_timer = 7.5


func update_onboarding_banner(act_data: Dictionary) -> void:
	update_onboarding_act_ui(act_data)


func update_onboarding_act_ui(act_data: Dictionary) -> void:
	if act_data.is_empty() or not is_instance_valid(onboarding_panel):
		return
	current_onboarding_act = int(act_data.get("act_num", act_data.get("act_number", act_data.get("act", current_onboarding_act))))
	_last_onboarding_act_rendered = current_onboarding_act
	_last_onboarding_lang_rendered = current_language

	var total_acts: int = int(act_data.get("total_acts", 7))
	onboarding_act_badge.text = tr_ui(
		"ACT %d / %d" % [current_onboarding_act, total_acts],
		"ACTE %d / %d" % [current_onboarding_act, total_acts]
	)
	var spk_name: String = String(act_data.get("speaker_name", act_data.get("speaker", "Commander Aldric")))
	var spk_title: String = String(act_data.get("speaker_title", ""))
	var emo: String = String(act_data.get("emotion_label", ""))
	onboarding_speaker_label.text = "%s — %s %s" % [spk_name, spk_title, ("(%s)" % emo if not emo.is_empty() else "")]
	onboarding_title_label.text = String(act_data.get("title", ""))
	onboarding_desc_label.text = String(act_data.get("instruction_text", act_data.get("instruction", act_data.get("quote", ""))))
	onboarding_obj_label.text = "🎯 %s" % String(act_data.get("objective", act_data.get("key_hints", "")))
	onboarding_obj_bar.value = clampf(float(current_onboarding_act) / float(maxi(1, total_acts)) * 100.0, 14.0, 100.0)

	var p_path: String = String(act_data.get("portrait_path", "res://assets/portraits/aldric_neutral.png"))
	var tex := _load_portrait_texture(p_path)
	if tex != null:
		onboarding_portrait_rect.texture = tex


## ============================================================================
## REAL-TIME LANGUAGE REFRESH & HUD STATE UPDATE
## ============================================================================
func _refresh_top_bar_buttons() -> void:
	if is_instance_valid(mute_btn):
		mute_btn.text = "🔇 [M]" if is_audio_muted else "🔊 [M]"
	if is_instance_valid(combat_mode_btn):
		combat_mode_btn.text = (
			tr_ui("⚡ Mode: Auto [C]", "⚡ Mode : Auto [C]")
			if combat_mode == "auto"
			else tr_ui("⚔️ Mode: Active [1-4] [C]", "⚔️ Mode : Actif [1-4] [C]")
		)
	if is_instance_valid(blender_mode_btn):
		blender_mode_btn.text = (
			tr_ui("🎨 3D: Blender 5.0 [J]", "🎨 3D : Blender 5.0 [J]")
			if use_blender_models
			else tr_ui("📐 3D: Procedural [J]", "📐 3D : Procédural [J]")
		)
	if is_instance_valid(settings_btn):
		settings_btn.text = tr_ui("⚙️ Settings [O]", "⚙️ Paramètres [O]")


func refresh_language(lang: String = "") -> void:
	if not lang.is_empty():
		current_language = "fr" if lang.to_lower().begins_with("fr") else "en"

	_refresh_top_bar_buttons()

	if is_instance_valid(reintroduce_prey_btn):
		reintroduce_prey_btn.text = tr_ui("🌿 +Prey", "🌿 +Gibier")
	if is_instance_valid(onboarding_voice_btn):
		onboarding_voice_btn.text = tr_ui("🔈 Voice", "🔈 Voix")
	if is_instance_valid(onboarding_next_btn):
		onboarding_next_btn.text = tr_ui("Next Act [N] ➔", "Acte Suiv. [N] ➔")

	if is_instance_valid(guardian_section_title):
		guardian_section_title.text = tr_ui("🛡️ GUARDIAN & RESOURCES", "🛡️ GARDIEN & RESSOURCES")
	if is_instance_valid(eco_section_title):
		eco_section_title.text = tr_ui("🧬 DIPLOID ECOSYSTEM & CONWAY", "🧬 ÉCOSYSTÈME DIPLOÏDE & CONWAY")
	if is_instance_valid(mastery_section_title):
		mastery_section_title.text = tr_ui("🎯 ADAPTIVE MASTERY (<=1%/kill, max +15%)", "🎯 MAÎTRISES ADAPTATIVES (<=1%/tué, max +15%)")

	if is_instance_valid(minimap_title_label):
		minimap_title_label.text = tr_ui("🧭 TACTICAL RADAR & MINIMAP", "🧭 RADAR TACTIQUE & MINICARTE")
	if is_instance_valid(minimap_legend_label):
		minimap_legend_label.text = tr_ui(
			"🟢 Bastion  🔴 Mutant  🟠 Dragon  🟢 Prey  🔵 Relic",
			"🟢 Bastion  🔴 Mutant  🟠 Dragon  🟢 Gibier  🔵 Relique"
		)
	if is_instance_valid(quest_section_title):
		quest_section_title.text = tr_ui("📜 ACTIVE OPERATION", "📜 OPÉRATION ACTIVE")
	if is_instance_valid(quest_title_label):
		quest_title_label.text = tr_ui(
			"Track Patient Zero & Gather 3 Eden Relics",
			"Traquer le Patient Zéro & Réunir 3 Reliques d'Éden"
		)
	if is_instance_valid(quest_step_label):
		quest_step_label.text = tr_ui(
			"• Harvest resources [E] & build Watchtower [H]\n• Collect 3 Relic Monoliths to raise the Solar Aegis [V]",
			"• Récoltez des ressources [E] & bâtissez la Tour de Guet [H]\n• Collectez 3 Monolithes de Relique pour ériger l'Égide Solaire [V]"
		)
	if is_instance_valid(buildings_section_title):
		buildings_section_title.text = tr_ui("🏰 BASTION INFRASTRUCTURE [H]", "🏰 INFRASTRUCTURES BASTION [H]")

	if is_instance_valid(quick_bastion_btn):
		quick_bastion_btn.text = tr_ui("🏰 Bastion [H]", "🏰 Bastion [H]")
	if is_instance_valid(quick_weapon_btn):
		quick_weapon_btn.text = tr_ui("⚔️ Forge [K]", "⚔️ Forge [K]")
	if is_instance_valid(quick_shield_btn):
		quick_shield_btn.text = tr_ui("🛡️ Shield [V]", "🛡️ Bouclier [V]")
	if is_instance_valid(quick_codex_btn):
		quick_codex_btn.text = tr_ui("🧬 Codex [Tab]", "🧬 Codex [Tab]")

	if is_instance_valid(hotkey_bar_label):
		hotkey_bar_label.text = tr_ui(
			"[WASD] Move · [R/F] Rotate Camera · [E] Harvest/Interact · [1-4] Spells · [C] Auto/Active · [H] Bastion · [K] Weapons · [V] Shield · [Tab] Codex · [O] Settings/Lang · [J] Blender .glb",
			"[ZQSD/WASD] Déplacer · [R/F] Caméra · [E] Récolter/Interagir · [1-4] Sorts · [C] Auto/Actif · [H] Bastion · [K] Armes · [V] Bouclier · [Tab] Codex · [O] Paramètres/Langue · [J] Blender .glb"
		)

	# Refresh 4 spell slot labels
	var spells_cat: Array = GameDesignData.get_spells_catalog(current_language)
	for i in range(mini(spell_slot_buttons.size(), spells_cat.size())):
		var sp: Dictionary = spells_cat[i]
		spell_slot_buttons[i].text = "%s [%d] %s" % [
			String(sp.get("icon", "⚡")),
			i + 1,
			String(sp.get("name", "Spell"))
		]

	# Refresh onboarding banner in current language
	var act_data: Dictionary = GameDesignData.get_onboarding_act(current_onboarding_act, current_language)
	update_onboarding_act_ui(act_data)

	if not last_state.is_empty():
		update_hud(last_state)

	if is_settings_open:
		_render_settings_modal()
	elif is_bastion_open:
		_render_bastion_modal()
	elif is_weapon_open:
		_render_weapon_modal()
	elif is_shield_open:
		_render_shield_modal()
	elif is_codex_open:
		_render_codex_modal()


func refresh_from_state(state: Dictionary) -> void:
	update_hud(state)


func update_hud(state: Dictionary) -> void:
	last_state = state

	if state.has("language"):
		var st_lang: String = String(state["language"])
		if st_lang != current_language:
			current_language = st_lang
			_refresh_top_bar_buttons()

	if state.has("combat_mode"):
		combat_mode = String(state["combat_mode"])
		_refresh_top_bar_buttons()
	if state.has("use_blender_models"):
		use_blender_models = bool(state["use_blender_models"])
		_refresh_top_bar_buttons()
	if state.has("is_bloom_enabled") or state.has("bloom_enabled"):
		bloom_enabled = bool(state.get("is_bloom_enabled", state.get("bloom_enabled", false)))
	if state.has("is_conway_overlay_visible") or state.has("conway_overlay_visible"):
		conway_overlay_visible = bool(state.get("is_conway_overlay_visible", state.get("conway_overlay_visible", false)))

	# 1. Top Bar telemetry
	var island_num: int = int(state.get("island_level", state.get("island_number", 1)))
	island_badge_label.text = tr_ui("🏝️ Island #%d" % island_num, "🏝️ Île #%d" % island_num)

	var day_num: int = int(state.get("day_number", 1))
	clock_badge_label.text = tr_ui("☀️ Day %d" % day_num, "☀️ Jour %d" % day_num)

	var total_pop: int = int(state.get("population", state.get("total_population", 42)))
	pop_badge_label.text = tr_ui("🐾 Pop: %d" % total_pop, "🐾 Pop : %d" % total_pop)

	var prey_pop: int = int(state.get("prey_population", 8))
	if is_instance_valid(ecosystem_ref) and "prey_population" in ecosystem_ref:
		prey_pop = int(ecosystem_ref.get("prey_population"))
	prey_badge_label.text = (
		tr_ui("🚨 Prey: %d (CRISIS!)" % prey_pop, "🚨 Gibier : %d (CRISE !)" % prey_pop)
		if prey_pop < 2
		else tr_ui("🦌 Prey: %d" % prey_pop, "🦌 Gibier : %d" % prey_pop)
	)

	# 2. Guardian & Bastion Vitals + Resources
	var hp: int = int(round(float(state.get("player_hp", 160.0))))
	var max_hp: int = maxi(1, int(round(float(state.get("player_max_hp", 160.0)))))
	hp_bar.max_value = float(max_hp)
	hp_bar.value = float(hp)
	hp_value_label.text = tr_ui("❤️ HP: %d/%d" % [hp, max_hp], "❤️ PV : %d/%d" % [hp, max_hp])

	var bhp: int = int(round(float(state.get("bastion_hp", 500.0))))
	var bmax_hp: int = maxi(1, int(round(float(state.get("bastion_max_hp", 500.0)))))
	bastion_hp_bar.max_value = float(bmax_hp)
	bastion_hp_bar.value = float(bhp)
	bastion_hp_label.text = tr_ui("🏰 Bastion: %d/%d" % [bhp, bmax_hp], "🏰 Bastion : %d/%d" % [bhp, bmax_hp])

	var lvl: int = int(state.get("player_level", 1))
	xp_value_label.text = tr_ui("⭐ Lv. %d" % lvl, "⭐ Niv. %d" % lvl)

	res_wood_label.text = tr_ui("🪵 Wood: %d" % int(state.get("wood", 40)), "🪵 Bois : %d" % int(state.get("wood", 40)))
	res_stone_label.text = tr_ui("🪨 Stone: %d" % int(state.get("stone", 25)), "🪨 Pierre : %d" % int(state.get("stone", 25)))
	res_crystal_label.text = tr_ui("💎 Crystal: %d" % int(state.get("crystal", 20)), "💎 Cristal : %d" % int(state.get("crystal", 20)))
	res_biomass_label.text = tr_ui("🌿 Biomass: %d" % int(state.get("biomass", 30)), "🌿 Biomasse : %d" % int(state.get("biomass", 30)))

	var w_id: String = String(state.get("equipped_weapon", state.get("equipped_weapon_id", "runic_steel")))
	equipped_weapon_btn.text = tr_ui("⚔️ Weapon: %s [K]" % w_id, "⚔️ Arme : %s [K]" % w_id)

	var relics: int = int(state.get("relic_fragments", state.get("relics_collected", 0)))
	var max_relics: int = int(state.get("max_relic_fragments", 3))
	relic_status_btn.text = tr_ui(
		"🧩 Eden Relics: %d / %d [V]" % [relics, max_relics],
		"🧩 Reliques d'Éden : %d / %d [V]" % [relics, max_relics]
	)

	# 3. Ecosystem & Dragon Status
	var conway_gen: int = int(state.get("conway_generation", 1))
	var alive_cells: int = int(state.get("conway_alive_cells", 180))
	eco_summary_label.text = tr_ui(
		"Conway Gen #%d · Alive Cells: %d\nDiploid Crossover: [Dad, Mom] ± 10%%" % [conway_gen, alive_cells],
		"Conway Gén. #%d · Cellules : %d\nCroisement Diploïde : [Papa, Maman] ± 10%%" % [conway_gen, alive_cells]
	)

	var dragon_wrath: bool = bool(state.get("dragon_wrath_active", false))
	if is_instance_valid(ecosystem_ref) and "dragon_wrath_active" in ecosystem_ref:
		dragon_wrath = bool(ecosystem_ref.get("dragon_wrath_active"))
	dragon_status_label.text = (
		tr_ui("🔥 DRACONIC WRATH ACTIVE! All Dragons attacking!", "🔥 COURROUX DRACONIQUE ACTIF ! Tous les Dragons attaquent !")
		if dragon_wrath
		else tr_ui("🐉 Sovereign Dragons: Peaceful (Do not provoke!)", "🐉 Dragons Souverains : Pacifiques (Ne pas provoquer !)")
	)
	dragon_status_label.add_theme_color_override(
		"font_color",
		Color(1.0, 0.30, 0.25) if dragon_wrath else Color(0.95, 0.80, 0.38)
	)

	# 4. Adaptive Mastery list (from mastery_kills Dictionary or mastery_summary Array)
	for child in mastery_list_box.get_children():
		child.queue_free()
	var m_kills: Dictionary = state.get("mastery_kills", {})
	if m_kills.is_empty():
		var empty_lbl := Label.new()
		empty_lbl.add_theme_font_size_override("font_size", 11)
		empty_lbl.text = tr_ui(
			"Slay monsters to adapt (+1%/kill -> max +15%)",
			"Éliminez des monstres (+1%/tué -> max +15%)"
		)
		mastery_list_box.add_child(empty_lbl)
	else:
		var shown: int = 0
		for sp_key in m_kills.keys():
			if shown >= 4:
				break
			var k_count: int = int(m_kills[sp_key])
			var bonus_ratio: float = GameDesignData.compute_mastery_bonus(k_count)
			var ml := Label.new()
			ml.add_theme_font_size_override("font_size", 11)
			ml.text = "🗡️ %s: +%.1f%% (%d)" % [String(sp_key), bonus_ratio * 100.0, k_count]
			mastery_list_box.add_child(ml)
			shown += 1

	# 5. Minimap & Contextual Prompt
	var map_dict: Dictionary = state.duplicate()
	if is_instance_valid(player_ref) and player_ref is Node3D:
		var p3d := player_ref as Node3D
		var p_pos: Vector3 = p3d.global_position if p3d.is_inside_tree() else p3d.position
		map_dict["player_x"] = p_pos.x
		map_dict["player_z"] = p_pos.z
		map_dict["player_yaw"] = p3d.rotation.y
	if is_instance_valid(enemy_manager_ref) and enemy_manager_ref.has_method("get_minimap_snapshots"):
		map_dict["creatures"] = enemy_manager_ref.call("get_minimap_snapshots")

	if is_instance_valid(minimap_canvas):
		minimap_canvas.set_map_state(map_dict)
	var px: int = int(round(float(map_dict.get("player_x", 0.0))))
	var pz: int = int(round(float(map_dict.get("player_z", 10.0))))
	minimap_compass_label.text = "X: %d  Z: %d · %s" % [px, pz, tr_ui("Island #", "Île #") + str(island_num)]

	if state.has("contextual_prompt"):
		var cp: String = String(state["contextual_prompt"])
		if not cp.is_empty():
			context_prompt_label.text = cp

	if state.has("onboarding_act"):
		if state["onboarding_act"] is Dictionary:
			update_onboarding_act_ui(state["onboarding_act"])
		elif typeof(state["onboarding_act"]) == TYPE_INT:
			var act_n: int = int(state["onboarding_act"])
			if act_n != _last_onboarding_act_rendered or current_language != _last_onboarding_lang_rendered:
				var act_d: Dictionary = GameDesignData.get_onboarding_act(act_n, current_language)
				update_onboarding_act_ui(act_d)
