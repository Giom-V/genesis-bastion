class_name PlayerCharacter
extends CharacterBody3D
## PlayerCharacter.gd
## Action-Roguelike Guardian Hero Controller for **Genesis Bastion (Godot 4.3 Edition)**.
##
## Features:
## 1. **Dual 3D Model Pipeline (`[J]` Toggle)**:
##    - Loads `res://assets/models/hero_guardian.glb` (Blender 5.0 PBR model) by default,
##      and seamlessly toggles to an articulated procedural Three-style mesh hierarchy on `[J]`.
## 2. **Strict Input Separation (`[E]` Harvest/Interact vs `[R]/[F]` Camera Orbit)**:
##    - Movement: `WASD` / `ZQSD` / `Arrow Keys`, Sprint/Dash: `Shift`.
##    - Camera Orbit: Strictly `R` / `F` keys (or `PageUp`/`PageDown` or `Right-Click + Drag`) + Mouse Wheel zoom.
##      **`[E]` NEVER rotates the camera!**
##    - Contextual Action (`[E]`): Harvests Wood/Stone/Crystal nodes, rescues captive Survivors,
##      collects Ancient Relic Fragments (`0..3`), and activates Sanctuary/Weapon Shrines.
## 3. **Dual Combat Modes (`[C]` Toggle)**:
##    - `"diablo_action"` (Active ARPG): Manual sword cleave (`Left Click` / `Space`) and `[1]-[4]` active spells.
##    - `"vampire_survivors"` (Auto-Battler): Automatic melee cleave and auto-cast spells on cooldown.
## 4. **Phase 11 Balanced Progression (`<= 1%` per Monster with Rapid Diminishing Returns)**:
##    - Kills 1..5: `+1.0%` per monster (`1%..5%`)
##    - Kills 6..15: `+0.5%` per monster (`5.5%..10%`)
##    - Kills 16..35: `+0.25%` per monster (hard-capped at `+15.0%` max).
##    - Passive level-up upgrades grant grounded `+8%` to `+12%` bonuses; spells scale `+8%/level`.
## 5. **Bilingual Contextual 3D Prompts (`"en"` Default, `"fr"` 2nd Choice)**:
##    - `get_contextual_prompt(lang)` returns localized world interaction hints.

signal hp_changed(current_hp: float, max_hp: float)
signal xp_changed(xp: int, next_level_xp: int, level: int)
signal leveled_up(new_level: int)
signal level_up(new_level: int)
signal resources_changed(resources: Dictionary)
signal resource_harvested(resource_type: String, amount: int)
signal weapon_equipped(weapon_id: String)
signal combat_mode_changed(mode: String)
signal relic_collected(relic_count: int, max_relics: int)
signal cage_rescued(rescued_count: int)
signal player_died()
signal spell_cast(spell_id: String, origin: Vector3, radius: float, damage: float)
signal melee_attacked(world_pos: Vector3, facing_dir: Vector3)

# --- Core Stats & Progression ---
var hp: float = 160.0
var max_hp: float = 160.0
var level: int = 1
var xp: int = 0
var next_level_xp: int = 60
var pending_level_ups: int = 0
var is_dead: bool = false
var last_killer_name: String = ""

# --- Movement & Combat Tuning ---
var base_speed: float = 13.5
var sprint_multiplier: float = 1.45
var base_cleave_damage: float = 32.0
var cleave_range: float = 5.4
var cleave_cooldown: float = 0.0
var cleave_anim_timer: float = 0.0
var dash_cooldown: float = 0.0
var dash_timer: float = 0.0
var dash_dir: Vector3 = Vector3.FORWARD
var facing_angle: float = 0.0
var anim_time: float = 0.0

# --- Phase 11 Balanced Multipliers (+8% to +12% per card) ---
var damage_multiplier: float = 1.0
var speed_multiplier: float = 1.0
var attack_speed_multiplier: float = 1.0
var mutant_damage_multiplier: float = 1.0
var fire_damage_multiplier: float = 1.0
var ice_slow_factor: float = 1.0
var lightning_chain_bonus: int = 0
var poison_dps_bonus: float = 0.0
var knockback_multiplier: float = 1.0
var damage_reduction: float = 0.0
var regen_per_sec: float = 1.4

# --- Dual Combat Mode & Elemental Weapon Arsenal ---
var combat_mode: String = "diablo_action" # "diablo_action" | "vampire_survivors" | "auto" | "active"
var use_blender_models: bool = true
var equipped_weapon: String = "runic_steel"
var equipped_weapon_id: String = "runic_steel"
var unlocked_weapons: Array[String] = [
	"runic_steel",
	"frost_blade",
	"inferno_greatblade",
	"emerald_scythe",
]

# --- Resources, Relics & Telemetry ---
var resources: Dictionary = {
	"wood": 40,
	"stone": 25,
	"crystal": 20,
	"biomass": 15,
	"food": 85,
}
var wood: int = 40
var stone: int = 25
var crystal: int = 20
var biomass: int = 15
var food: int = 85
var relic_fragments: int = 0
var relic_fragments_collected: int = 0
var max_relic_fragments: int = 3
var cages_rescued: int = 0
var total_kills: int = 0
var mutants_slain: int = 0
var prey_slain: int = 0
var species_kills: Dictionary = {}
var mutation_kills: Dictionary = {}
var hits_taken_by_type: Dictionary = {
	"physical": 0,
	"elemental": 0,
}
var upgrades: Array[String] = []

# --- Onboarding Telemetry Flags ---
var has_moved: bool = false
var distance_moved: float = 0.0
var has_rotated_camera: bool = false
var has_harvested: bool = false
var harvest_count: int = 0
var has_attacked: bool = false
var attack_swings: int = 0

# --- 4-Slot Evolvable Spell Arsenal (+8% Damage / +4% Range per Level) ---
var spell_order: Array[String] = [
	"runic_bolt",
	"frost_nova",
	"flame_wave",
	"nature_thorns",
]
var spell_levels: Dictionary = {
	"runic_bolt": 1,
	"frost_nova": 1,
	"flame_wave": 1,
	"nature_thorns": 1,
}
var spell_cooldowns: Dictionary = {
	"runic_bolt": 0.0,
	"frost_nova": 0.0,
	"flame_wave": 0.0,
	"nature_thorns": 0.0,
}
var spell_max_cooldowns: Dictionary = {
	"runic_bolt": 2.2,
	"frost_nova": 5.2,
	"flame_wave": 4.0,
	"nature_thorns": 5.8,
}

# --- External System References (supporting both direct property names & _ref aliases) ---
var terrain_ref: Node = null
var enemy_manager_ref: Node = null
var ecosystem_ref: Node = null
var audio_ref: Node = null
var model_loader_ref: RefCounted = null

var terrain: Node = null:
	set(v):
		terrain = v
		terrain_ref = v
var enemy_manager: Node = null:
	set(v):
		enemy_manager = v
		enemy_manager_ref = v
var ecosystem: Node = null:
	set(v):
		ecosystem = v
		ecosystem_ref = v
var audio_director: Node = null:
	set(v):
		audio_director = v
		audio_ref = v
var model_loader: RefCounted = null:
	set(v):
		model_loader = v
		model_loader_ref = v

# --- 3D Scene Nodes ---
var visual_root: Node3D = null
var blender_model_node: Node3D = null
var procedural_model_node: Node3D = null
var proc_body: Node3D = null
var proc_left_arm: Node3D = null
var proc_right_arm: Node3D = null
var proc_left_leg: Node3D = null
var proc_right_leg: Node3D = null
var proc_blade_mesh: MeshInstance3D = null
var slash_arc_mesh: MeshInstance3D = null
var attack_ring_mesh: MeshInstance3D = null
var spell_vfx_ring: MeshInstance3D = null
var spell_vfx_timer: float = 0.0

# --- Orbit Camera Rig ([R]/[F] or Right-Click Drag — NEVER [E]!) ---
var camera_pivot: Node3D = null
var camera_3d: Camera3D = null
var camera: Camera3D = null
var camera_yaw: float = 0.0
var camera_pitch: float = -0.62
var camera_distance: float = 22.0
var _rmb_dragging: bool = false

# --- Cached Contextual Prompt ---
var nearest_prompt_en: String = ""
var nearest_prompt_fr: String = ""
var _prompt_timer: float = 0.0


func _ready() -> void:
	name = "PlayerCharacter"
	position = Vector3(0.0, 2.5, 6.5)
	_sync_resource_fields()
	_build_collision_shape()
	_build_visual_hierarchy()
	_build_camera_rig()
	_apply_weapon_visuals()


func _sync_resource_fields() -> void:
	wood = int(resources.get("wood", 40))
	stone = int(resources.get("stone", 25))
	crystal = int(resources.get("crystal", 20))
	biomass = int(resources.get("biomass", 15))
	food = int(resources.get("food", 85))


## Injects references to Terrain, EnemySwarmManager, GeneticEcosystem, AudioDirector, and ModelLoader.
func setup(
	p_terrain: Node = null,
	p_enemy_manager: Node = null,
	p_ecosystem: Node = null,
	p_audio: Node = null,
	p_model_loader: RefCounted = null
) -> void:
	if p_terrain != null:
		terrain = p_terrain
	if p_enemy_manager != null:
		enemy_manager = p_enemy_manager
	if p_ecosystem != null:
		ecosystem = p_ecosystem
	if p_audio != null:
		audio_director = p_audio
	if p_model_loader != null:
		model_loader = p_model_loader
	_snap_to_terrain()


func _build_collision_shape() -> void:
	var col := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.55
	capsule.height = 1.9
	col.shape = capsule
	col.position = Vector3(0.0, 0.95, 0.0)
	add_child(col)


func _build_visual_hierarchy() -> void:
	visual_root = Node3D.new()
	visual_root.name = "VisualRoot"
	add_child(visual_root)

	# 1. Procedural Articulated Guardian Mesh (always available for instant [J] toggle)
	procedural_model_node = _create_procedural_hero_mesh()
	visual_root.add_child(procedural_model_node)

	# 2. Blender 5.0 .glb Hero Model (`res://assets/models/hero_guardian.glb`)
	blender_model_node = _load_blender_hero_mesh()
	if blender_model_node != null:
		visual_root.add_child(blender_model_node)

	# 3. 3D Ground Cleave Range Ring & Animated Slash Arc
	attack_ring_mesh = MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = cleave_range - 0.12
	torus.outer_radius = cleave_range
	torus.rings = 24
	torus.ring_segments = 8
	attack_ring_mesh.mesh = torus
	var ring_mat := StandardMaterial3D.new()
	ring_mat.albedo_color = Color(0.28, 0.86, 0.98, 0.38)
	ring_mat.emission_enabled = true
	ring_mat.emission = Color(0.28, 0.86, 0.98)
	ring_mat.emission_energy_multiplier = 1.4
	ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	attack_ring_mesh.material_override = ring_mat
	attack_ring_mesh.position = Vector3(0.0, 0.12, 0.0)
	add_child(attack_ring_mesh)

	slash_arc_mesh = MeshInstance3D.new()
	var arc_cyl := CylinderMesh.new()
	arc_cyl.top_radius = cleave_range * 0.62
	arc_cyl.bottom_radius = cleave_range * 0.62
	arc_cyl.height = 0.08
	arc_cyl.radial_segments = 16
	slash_arc_mesh.mesh = arc_cyl
	var slash_mat := StandardMaterial3D.new()
	slash_mat.albedo_color = Color(0.55, 0.92, 1.0, 0.65)
	slash_mat.emission_enabled = true
	slash_mat.emission = Color(0.25, 0.78, 1.0)
	slash_mat.emission_energy_multiplier = 2.2
	slash_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	slash_arc_mesh.material_override = slash_mat
	slash_arc_mesh.position = Vector3(0.0, 0.95, 2.35)
	slash_arc_mesh.scale = Vector3(1.12, 1.0, 0.42)
	slash_arc_mesh.visible = false
	visual_root.add_child(slash_arc_mesh)

	# 4. 3D Spell Cast Shockwave Ring
	spell_vfx_ring = MeshInstance3D.new()
	var spell_torus := TorusMesh.new()
	spell_torus.inner_radius = 1.2
	spell_torus.outer_radius = 1.65
	spell_torus.rings = 20
	spell_torus.ring_segments = 8
	spell_vfx_ring.mesh = spell_torus
	var spell_mat := StandardMaterial3D.new()
	spell_mat.albedo_color = Color(0.35, 0.85, 1.0, 0.75)
	spell_mat.emission_enabled = true
	spell_mat.emission = Color(0.35, 0.85, 1.0)
	spell_mat.emission_energy_multiplier = 2.5
	spell_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	spell_vfx_ring.material_override = spell_mat
	spell_vfx_ring.position = Vector3(0.0, 0.35, 0.0)
	spell_vfx_ring.visible = false
	add_child(spell_vfx_ring)

	_refresh_model_visibility()


func _load_blender_hero_mesh() -> Node3D:
	if DisplayServer.get_name() == "headless":
		return null
	var candidate_paths: Array[String] = [
		"res://assets/models/hero_guardian.glb",
		"res://assets/models/player_warden.glb",
	]
	for path in candidate_paths:
		if ResourceLoader.exists(path):
			var packed := load(path) as PackedScene
			if packed != null:
				var inst := packed.instantiate()
				if inst is Node3D:
					inst.name = "BlenderHeroMesh"
					return inst as Node3D
	return null


func _create_procedural_hero_mesh() -> Node3D:
	var root := Node3D.new()
	root.name = "ProceduralHeroMesh"

	var armor_mat := StandardMaterial3D.new()
	armor_mat.albedo_color = Color(0.16, 0.24, 0.34)
	armor_mat.metallic = 0.65
	armor_mat.roughness = 0.35

	var gold_mat := StandardMaterial3D.new()
	gold_mat.albedo_color = Color(0.92, 0.68, 0.26)
	gold_mat.metallic = 0.8
	gold_mat.roughness = 0.25

	var cape_mat := StandardMaterial3D.new()
	cape_mat.albedo_color = Color(0.72, 0.16, 0.18)
	cape_mat.roughness = 0.75

	var blade_mat := StandardMaterial3D.new()
	blade_mat.albedo_color = Color(0.53, 0.93, 1.0)
	blade_mat.emission_enabled = true
	blade_mat.emission = Color(0.12, 0.56, 1.0)
	blade_mat.emission_energy_multiplier = 1.8

	proc_body = Node3D.new()
	proc_body.name = "Body"
	proc_body.position = Vector3(0.0, 1.05, 0.0)
	root.add_child(proc_body)

	var torso := MeshInstance3D.new()
	var torso_box := BoxMesh.new()
	torso_box.size = Vector3(0.76, 0.92, 0.46)
	torso.mesh = torso_box
	torso.material_override = armor_mat
	torso.position = Vector3(0.0, 0.12, 0.0)
	proc_body.add_child(torso)

	var head := MeshInstance3D.new()
	var head_sphere := SphereMesh.new()
	head_sphere.radius = 0.26
	head_sphere.height = 0.52
	head.mesh = head_sphere
	head.material_override = gold_mat
	head.position = Vector3(0.0, 0.78, 0.0)
	proc_body.add_child(head)

	var cape := MeshInstance3D.new()
	var cape_box := BoxMesh.new()
	cape_box.size = Vector3(0.72, 1.15, 0.06)
	cape.mesh = cape_box
	cape.material_override = cape_mat
	cape.position = Vector3(0.0, -0.05, -0.28)
	cape.rotation.x = 0.18
	proc_body.add_child(cape)

	proc_left_arm = Node3D.new()
	proc_left_arm.position = Vector3(-0.52, 0.36, 0.0)
	var l_arm_mesh := MeshInstance3D.new()
	var arm_box := BoxMesh.new()
	arm_box.size = Vector3(0.22, 0.62, 0.22)
	l_arm_mesh.mesh = arm_box
	l_arm_mesh.material_override = armor_mat
	l_arm_mesh.position = Vector3(0.0, -0.25, 0.0)
	proc_left_arm.add_child(l_arm_mesh)
	proc_body.add_child(proc_left_arm)

	proc_right_arm = Node3D.new()
	proc_right_arm.position = Vector3(0.52, 0.36, 0.0)
	var r_arm_mesh := MeshInstance3D.new()
	r_arm_mesh.mesh = arm_box
	r_arm_mesh.material_override = armor_mat
	r_arm_mesh.position = Vector3(0.0, -0.25, 0.0)
	proc_right_arm.add_child(r_arm_mesh)

	proc_blade_mesh = MeshInstance3D.new()
	var blade_box := BoxMesh.new()
	blade_box.size = Vector3(0.12, 1.45, 0.24)
	proc_blade_mesh.mesh = blade_box
	proc_blade_mesh.material_override = blade_mat
	proc_blade_mesh.position = Vector3(0.0, -0.45, 0.65)
	proc_blade_mesh.rotation.x = 1.25
	proc_right_arm.add_child(proc_blade_mesh)
	proc_body.add_child(proc_right_arm)

	proc_left_leg = Node3D.new()
	proc_left_leg.position = Vector3(-0.2, 0.68, 0.0)
	var leg_box := BoxMesh.new()
	leg_box.size = Vector3(0.25, 0.68, 0.26)
	var l_leg_mesh := MeshInstance3D.new()
	l_leg_mesh.mesh = leg_box
	l_leg_mesh.material_override = armor_mat
	l_leg_mesh.position = Vector3(0.0, -0.34, 0.0)
	proc_left_leg.add_child(l_leg_mesh)
	root.add_child(proc_left_leg)

	proc_right_leg = Node3D.new()
	proc_right_leg.position = Vector3(0.2, 0.68, 0.0)
	var r_leg_mesh := MeshInstance3D.new()
	r_leg_mesh.mesh = leg_box
	r_leg_mesh.material_override = armor_mat
	r_leg_mesh.position = Vector3(0.0, -0.34, 0.0)
	proc_right_leg.add_child(r_leg_mesh)
	root.add_child(proc_right_leg)

	return root


func _build_camera_rig() -> void:
	camera_pivot = Node3D.new()
	camera_pivot.name = "CameraPivot"
	camera_pivot.top_level = true
	add_child(camera_pivot)

	camera_3d = Camera3D.new()
	camera_3d.name = "HeroOrbitCamera"
	camera_3d.fov = 52.0
	camera_3d.near = 0.2
	camera_3d.far = 420.0
	camera_3d.current = true
	camera = camera_3d
	camera_pivot.add_child(camera_3d)
	_update_camera_transform()


func _update_camera_transform() -> void:
	if camera_pivot == null or camera_3d == null:
		return
	camera_pivot.global_position = global_position + Vector3(0.0, 1.4, 0.0)
	var horiz_dist := cos(-camera_pitch) * camera_distance
	var vert_dist := sin(-camera_pitch) * camera_distance
	var cam_offset := Vector3(
		sin(camera_yaw) * horiz_dist,
		maxf(3.0, vert_dist),
		cos(camera_yaw) * horiz_dist
	)
	camera_3d.global_position = camera_pivot.global_position + cam_offset
	camera_3d.look_at(camera_pivot.global_position, Vector3.UP)


func _unhandled_input(event: InputEvent) -> void:
	if is_dead:
		return
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_RIGHT:
			_rmb_dragging = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			camera_distance = clampf(camera_distance - 1.8, 10.0, 42.0)
			has_rotated_camera = true
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			camera_distance = clampf(camera_distance + 1.8, 10.0, 42.0)
			has_rotated_camera = true
		elif mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
			perform_melee_cleave()
	elif event is InputEventMouseMotion and _rmb_dragging:
		var mm := event as InputEventMouseMotion
		camera_yaw -= mm.relative.x * 0.0065
		camera_pitch = clampf(camera_pitch - mm.relative.y * 0.0045, -1.25, -0.25)
		has_rotated_camera = true
	elif event is InputEventKey and event.pressed and not event.echo:
		var ke := event as InputEventKey
		match ke.keycode:
			KEY_SPACE:
				perform_melee_cleave()
			KEY_SHIFT:
				perform_dash()
			KEY_E:
				# Strictly Contextual Harvest / Rescue / Sanctuary / Shrine Interaction — NEVER rotates camera!
				interact_nearest()
			KEY_1:
				cast_spell_slot(0)
			KEY_2:
				cast_spell_slot(1)
			KEY_3:
				cast_spell_slot(2)
			KEY_4:
				cast_spell_slot(3)


func _process(delta: float) -> void:
	anim_time += delta
	if is_dead:
		_update_camera_transform()
		return

	# 1. Camera Orbit Rotation strictly via [R] / [F] or PageUp / PageDown (NEVER [E] or [Q]!)
	var cam_rot_dir := 0.0
	if Input.is_key_pressed(KEY_R) or Input.is_key_pressed(KEY_PAGEUP):
		cam_rot_dir -= 1.0
	if Input.is_key_pressed(KEY_F) or Input.is_key_pressed(KEY_PAGEDOWN):
		cam_rot_dir += 1.0
	if absf(cam_rot_dir) > 0.01:
		camera_yaw += cam_rot_dir * 1.85 * delta
		has_rotated_camera = true

	# 2. Movement Input (WASD + ZQSD + Arrow Keys) relative to camera_yaw
	var input_x := 0.0
	var input_z := 0.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_Z) or Input.is_key_pressed(KEY_UP):
		input_z -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		input_z += 1.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_Q) or Input.is_key_pressed(KEY_LEFT):
		input_x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		input_x += 1.0

	var forward := Vector3(sin(camera_yaw), 0.0, cos(camera_yaw))
	var right := Vector3(cos(camera_yaw), 0.0, -sin(camera_yaw))
	var move_dir := (right * input_x + forward * input_z)
	if move_dir.length_squared() > 0.001:
		move_dir = move_dir.normalized()

	cleave_cooldown = maxf(0.0, cleave_cooldown - delta)
	cleave_anim_timer = maxf(0.0, cleave_anim_timer - delta)
	dash_cooldown = maxf(0.0, dash_cooldown - delta)

	for s_id in spell_cooldowns.keys():
		spell_cooldowns[s_id] = maxf(0.0, float(spell_cooldowns[s_id]) - delta)

	var current_speed := base_speed * speed_multiplier
	if dash_timer > 0.0:
		dash_timer = maxf(0.0, dash_timer - delta)
		velocity.x = dash_dir.x * base_speed * 2.35
		velocity.z = dash_dir.z * base_speed * 2.35
	elif move_dir.length_squared() > 0.001:
		if Input.is_key_pressed(KEY_SHIFT):
			current_speed *= sprint_multiplier
		velocity.x = move_dir.x * current_speed
		velocity.z = move_dir.z * current_speed
		facing_angle = atan2(move_dir.x, move_dir.z)
		dash_dir = move_dir
		var step_dist := Vector2(velocity.x, velocity.z).length() * delta
		distance_moved += step_dist
		if distance_moved >= 1.5:
			has_moved = true
	else:
		velocity.x = move_toward(velocity.x, 0.0, 45.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 45.0 * delta)

	position.x = clampf(position.x + velocity.x * delta, -112.0, 112.0)
	position.z = clampf(position.z + velocity.z * delta, -112.0, 112.0)
	_snap_to_terrain()

	if visual_root != null:
		visual_root.rotation.y = facing_angle

	# 3. Passive HP Regeneration (boosted near Bastion Sanctuary center and by herbivore balance)
	var eco_regen_mult := 1.0
	if ecosystem_ref != null and ecosystem_ref.has_method("get_hp_regen_multiplier"):
		eco_regen_mult = float(ecosystem_ref.call("get_hp_regen_multiplier"))
	var dist_center := Vector2(position.x, position.z).length()
	var sanctuary_bonus := 4.5 if dist_center <= 14.0 else 0.0
	if hp < max_hp:
		hp = minf(max_hp, hp + (regen_per_sec * eco_regen_mult + sanctuary_bonus) * delta)

	# 4. Auto-Combat Mode ("vampire_survivors"): auto-cleave & auto-cast ready spells
	if combat_mode == "vampire_survivors" or combat_mode == "auto":
		if cleave_cooldown <= 0.0 and enemy_manager_ref != null and enemy_manager_ref.has_method("find_nearest_hostile"):
			var near_target: Dictionary = enemy_manager_ref.call("find_nearest_hostile", position, cleave_range + 0.5, false, false)
			if not near_target.is_empty():
				perform_melee_cleave()
		for i in range(spell_order.size()):
			var s_id := spell_order[i]
			if float(spell_cooldowns.get(s_id, 0.0)) <= 0.0:
				if enemy_manager_ref != null and enemy_manager_ref.has_method("find_nearest_hostile"):
					var spell_target: Dictionary = enemy_manager_ref.call("find_nearest_hostile", position, 18.0, false, false)
					if not spell_target.is_empty():
						cast_spell(s_id)
						break

	# 5. Animate Hero Limbs, Slash Arc & Spell Ring
	_animate_hero_visuals(delta)
	_update_camera_transform()

	# 6. Refresh Contextual 3D World Prompts at ~15 Hz
	_prompt_timer -= delta
	if _prompt_timer <= 0.0:
		_prompt_timer = 0.065
		_refresh_contextual_prompts()


func _snap_to_terrain() -> void:
	var ground_y := 1.8
	if terrain_ref != null and terrain_ref.has_method("get_height_at"):
		ground_y = float(terrain_ref.call("get_height_at", position.x, position.z))
	position.y = maxf(ground_y, -0.25)


func _animate_hero_visuals(delta: float) -> void:
	var planar_speed := Vector2(velocity.x, velocity.z).length()
	var is_moving := planar_speed > 0.35
	var phase := anim_time * maxf(5.0, planar_speed * 0.95)

	if proc_body != null:
		proc_body.position.y = 1.05 + (absf(sin(phase)) * 0.09 if is_moving else sin(anim_time * 2.4) * 0.03)
	if proc_left_leg != null and proc_right_leg != null:
		if is_moving:
			proc_left_leg.rotation.x = sin(phase) * 0.58
			proc_right_leg.rotation.x = -sin(phase) * 0.58
			if proc_left_arm != null:
				proc_left_arm.rotation.x = -sin(phase) * 0.45
		else:
			proc_left_leg.rotation.x = lerpf(proc_left_leg.rotation.x, 0.0, delta * 10.0)
			proc_right_leg.rotation.x = lerpf(proc_right_leg.rotation.x, 0.0, delta * 10.0)
			if proc_left_arm != null:
				proc_left_arm.rotation.x = lerpf(proc_left_arm.rotation.x, 0.0, delta * 10.0)

	var p := clampf(1.0 - (cleave_anim_timer / 0.24), 0.0, 1.0) if cleave_anim_timer > 0.0 else 0.0
	if proc_right_arm != null:
		if cleave_anim_timer > 0.0:
			proc_right_arm.rotation.x = -0.22 + sin(p * PI) * 0.95
			proc_right_arm.rotation.y = -cos(p * PI) * 0.55
			proc_right_arm.rotation.z = -sin(p * PI) * 0.32
		else:
			proc_right_arm.rotation.x = lerpf(proc_right_arm.rotation.x, 0.0, delta * 10.0)
			proc_right_arm.rotation.y = lerpf(proc_right_arm.rotation.y, 0.0, delta * 10.0)
			proc_right_arm.rotation.z = lerpf(proc_right_arm.rotation.z, 0.0, delta * 10.0)

	if blender_model_node != null:
		var b_right_arm := blender_model_node.find_child("RightArm", true, false) as Node3D
		if b_right_arm != null:
			if cleave_anim_timer > 0.0:
				b_right_arm.rotation.x = -0.22 + sin(p * PI) * 0.95
				b_right_arm.rotation.y = -cos(p * PI) * 0.55
				b_right_arm.rotation.z = -sin(p * PI) * 0.32
			else:
				b_right_arm.rotation.x = lerpf(b_right_arm.rotation.x, sin(phase) * 0.45 if is_moving else 0.0, delta * 10.0)
				b_right_arm.rotation.y = lerpf(b_right_arm.rotation.y, 0.0, delta * 10.0)
				b_right_arm.rotation.z = lerpf(b_right_arm.rotation.z, 0.0, delta * 10.0)

	if slash_arc_mesh != null:
		slash_arc_mesh.visible = cleave_anim_timer > 0.0
		if slash_arc_mesh.visible:
			slash_arc_mesh.rotation.y = (0.5 - p) * 0.56
		else:
			slash_arc_mesh.rotation.y = 0.0

	if spell_vfx_ring != null:
		if spell_vfx_timer > 0.0:
			spell_vfx_timer = maxf(0.0, spell_vfx_timer - delta)
			spell_vfx_ring.visible = true
			var s := 1.0 + (0.45 - spell_vfx_timer) * 14.0
			spell_vfx_ring.scale = Vector3(s, 1.0, s)
		else:
			spell_vfx_ring.visible = false


## Toggles between Blender 5.0 (.glb) and Procedural 3D meshes (`[J]`).
func set_model_mode(use_blender: bool) -> void:
	use_blender_models = use_blender
	_refresh_model_visibility()


func refresh_model(use_blender: bool) -> void:
	set_model_mode(use_blender)


func refresh_models(use_blender: bool) -> void:
	set_model_mode(use_blender)


func toggle_model_mode() -> bool:
	set_model_mode(not use_blender_models)
	return use_blender_models


func _refresh_model_visibility() -> void:
	if blender_model_node != null and procedural_model_node != null:
		blender_model_node.visible = use_blender_models
		procedural_model_node.visible = not use_blender_models
	elif procedural_model_node != null:
		procedural_model_node.visible = true


## Toggles between Active ARPG (`"diablo_action"`) and Auto-Battler (`"vampire_survivors"`) (`[C]`).
func toggle_combat_mode() -> String:
	if combat_mode == "diablo_action" or combat_mode == "active":
		combat_mode = "vampire_survivors"
	else:
		combat_mode = "diablo_action"
	emit_signal("combat_mode_changed", combat_mode)
	return combat_mode


func set_combat_mode(mode: String) -> void:
	combat_mode = mode
	emit_signal("combat_mode_changed", combat_mode)


## Equips an Elemental Weapon (`runic_steel`, `frost_blade`, `inferno_greatblade`, `emerald_scythe`).
func equip_weapon(weapon_id: String) -> Dictionary:
	var canonical := weapon_id
	if weapon_id == "ice_greatsword":
		canonical = "frost_blade"
	elif weapon_id == "fire_greatsword":
		canonical = "inferno_greatblade"
	elif weapon_id == "venom_greatsword":
		canonical = "emerald_scythe"
	elif weapon_id == "runic_sword":
		canonical = "runic_steel"

	equipped_weapon = canonical
	equipped_weapon_id = canonical
	if not unlocked_weapons.has(canonical):
		unlocked_weapons.append(canonical)
	_apply_weapon_visuals()
	emit_signal("weapon_equipped", canonical)
	return get_equipped_weapon_spec("en")


func get_equipped_weapon_spec(lang: String = "en") -> Dictionary:
	var is_fr := (lang == "fr")
	match equipped_weapon:
		"frost_blade":
			return {
				"id": "frost_blade",
				"name": "Lame de Givre Cryo" if is_fr else "Cryo Frost Blade",
				"damage_multiplier": 1.10,
				"clade_bonus_multiplier": 1.15,
				"target_clade": "aquatic_pyro",
				"spares_herbivores": false,
				"color": Color(0.0, 0.88, 1.0),
				"summary": "+10% Dégâts, +15% vs Requin/Pyro, Ralentit -40%" if is_fr else "+10% Damage, +15% vs Shark/Pyro, 40% Cryo Slow",
			}
		"inferno_greatblade":
			return {
				"id": "inferno_greatblade",
				"name": "Espadon Solaire Inferno" if is_fr else "Inferno Solar Greatblade",
				"damage_multiplier": 1.12,
				"clade_bonus_multiplier": 1.15,
				"target_clade": "beast_subterranean",
				"spares_herbivores": false,
				"color": Color(1.0, 0.32, 0.18),
				"summary": "+12% Dégâts, +15% vs Bêtes/Taupes, Brûlure Solaire" if is_fr else "+12% Damage, +15% vs Beasts/Moles, Solar Burn",
			}
		"emerald_scythe":
			return {
				"id": "emerald_scythe",
				"name": "Faux Symbiotique d'Émeraude" if is_fr else "Symbiotic Emerald Scythe",
				"damage_multiplier": 1.10,
				"clade_bonus_multiplier": 1.15,
				"target_clade": "mutant",
				"spares_herbivores": true,
				"color": Color(0.18, 0.88, 0.48),
				"summary": "+10% Dégâts, Épargne 100% des Herbivores, Drain de Vie 8%" if is_fr else "+10% Damage, 100% Herbivore Immunity, 8% Lifesteal",
			}
		_:
			return {
				"id": "runic_steel",
				"name": "Espadon d'Acier Runique" if is_fr else "Runic Steel Greatsword",
				"damage_multiplier": 1.0,
				"clade_bonus_multiplier": 1.0,
				"target_clade": "none",
				"spares_herbivores": false,
				"color": Color(0.53, 0.93, 1.0),
				"summary": "Lame équilibrée des Gardiens" if is_fr else "Balanced Guardian Greatsword",
			}


func _apply_weapon_visuals() -> void:
	var spec := get_equipped_weapon_spec("en")
	var col: Color = spec.get("color", Color(0.53, 0.93, 1.0))
	if proc_blade_mesh != null and proc_blade_mesh.material_override is StandardMaterial3D:
		var mat := proc_blade_mesh.material_override as StandardMaterial3D
		mat.albedo_color = col
		mat.emission = col
	if slash_arc_mesh != null and slash_arc_mesh.material_override is StandardMaterial3D:
		var smat := slash_arc_mesh.material_override as StandardMaterial3D
		smat.albedo_color = Color(col.r, col.g, col.b, 0.65)
		smat.emission = col


## Performs a wide 3D Cleave Attack (`Left Click` / `Space` or Auto-Melee) oriented along +Z local forward.
func perform_melee_cleave() -> int:
	if is_dead or cleave_cooldown > 0.0:
		return 0
	cleave_cooldown = maxf(0.18, 0.46 / maxf(0.5, attack_speed_multiplier))
	cleave_anim_timer = 0.24
	attack_swings += 1
	has_attacked = true

	if audio_ref != null and audio_ref.has_method("play_sfx"):
		audio_ref.call("play_sfx", "sword_slash")

	if enemy_manager_ref != null and enemy_manager_ref.has_method("find_nearest_hostile"):
		var near_target: Dictionary = enemy_manager_ref.call("find_nearest_hostile", global_position, cleave_range + 0.8, false, false)
		if not near_target.is_empty() and near_target.has("position"):
			var t_pos: Vector3 = near_target.get("position", global_position)
			var dx := t_pos.x - global_position.x
			var dz := t_pos.z - global_position.z
			if dx * dx + dz * dz > 0.01:
				facing_angle = atan2(dx, dz)
				if visual_root != null:
					visual_root.rotation.y = facing_angle

	var forward_dir := Vector3(sin(facing_angle), 0.0, cos(facing_angle)).normalized()
	emit_signal("melee_attacked", global_position, forward_dir)

	if enemy_manager_ref == null or not enemy_manager_ref.has_method("damage_creatures_in_radius"):
		return 0

	var w_spec := get_equipped_weapon_spec("en")
	var spares_prey := bool(w_spec.get("spares_herbivores", false))
	var base_dmg := base_cleave_damage * damage_multiplier * float(w_spec.get("damage_multiplier", 1.0))
	var status := ""
	if equipped_weapon == "frost_blade":
		status = "slow"
	elif equipped_weapon == "inferno_greatblade":
		status = "burn"
	elif equipped_weapon == "emerald_scythe":
		status = "lifesteal"

	var hit_center := global_position + forward_dir * 1.6
	var hit_count: int = int(enemy_manager_ref.call(
		"damage_creatures_in_radius",
		hit_center,
		cleave_range,
		base_dmg,
		spares_prey,
		status
	))
	if hit_count > 0 and equipped_weapon == "emerald_scythe":
		hp = minf(max_hp, hp + base_dmg * 0.08 * float(hit_count))
	return hit_count


## Casts one of the 4 equipped spells by slot index (`0..3` -> keys `[1]..[4]`).
func cast_spell_slot(slot_index: int) -> bool:
	if slot_index < 0 or slot_index >= spell_order.size():
		return false
	return cast_spell(spell_order[slot_index])


## Casts a 3D Roguelike Spell with Phase 11 `+8%/level` damage & `+4%/level` range scaling.
func cast_spell(spell_id: String) -> bool:
	if is_dead:
		return false
	var rem_cd := float(spell_cooldowns.get(spell_id, 0.0))
	if rem_cd > 0.0:
		return false

	var lvl := int(spell_levels.get(spell_id, 1))
	var steps := maxf(0.0, float(lvl - 1))
	var dmg_scale := 1.0 + steps * 0.08
	var range_scale := 1.0 + steps * 0.04
	var cd_scale := maxf(0.65, 1.0 - steps * 0.04)

	var base_cd := float(spell_max_cooldowns.get(spell_id, 4.0))
	spell_cooldowns[spell_id] = base_cd * cd_scale

	var base_dmg := 38.0
	var base_radius := 7.5
	var vfx_color := Color(0.35, 0.85, 1.0)
	var status := ""

	match spell_id:
		"runic_bolt", "chain_lightning":
			base_dmg = 36.0
			base_radius = 9.0
			vfx_color = Color(0.45, 0.78, 1.0)
		"frost_nova", "frost_spear":
			base_dmg = 34.0
			base_radius = 8.5
			vfx_color = Color(0.0, 0.92, 1.0)
			status = "slow"
		"flame_wave", "pyro_nova":
			base_dmg = 44.0 * fire_damage_multiplier
			base_radius = 8.0
			vfx_color = Color(1.0, 0.36, 0.12)
			status = "burn"
		"nature_thorns", "venom_volley":
			base_dmg = 35.0 + poison_dps_bonus
			base_radius = 8.5
			vfx_color = Color(0.22, 0.92, 0.48)
			status = "poison"

	var final_dmg := base_dmg * dmg_scale * damage_multiplier
	var final_radius := base_radius * range_scale
	var spares_prey := (equipped_weapon == "emerald_scythe" or spell_id == "nature_thorns")

	if spell_vfx_ring != null and spell_vfx_ring.material_override is StandardMaterial3D:
		var smat := spell_vfx_ring.material_override as StandardMaterial3D
		smat.albedo_color = Color(vfx_color.r, vfx_color.g, vfx_color.b, 0.75)
		smat.emission = vfx_color
	spell_vfx_timer = 0.42

	if audio_ref != null and audio_ref.has_method("play_sfx"):
		audio_ref.call("play_sfx", "spell_cast")

	if enemy_manager_ref != null and enemy_manager_ref.has_method("damage_creatures_in_radius"):
		enemy_manager_ref.call(
			"damage_creatures_in_radius",
			global_position,
			final_radius,
			final_dmg,
			spares_prey,
			status
		)

	has_attacked = true
	emit_signal("spell_cast", spell_id, global_position, final_radius, final_dmg)
	return true


## Executes a quick evasive Dodge / Dash (`Shift`).
func perform_dash() -> bool:
	if is_dead or dash_cooldown > 0.0:
		return false
	dash_timer = 0.22
	dash_cooldown = 1.25
	if audio_ref != null and audio_ref.has_method("play_sfx"):
		audio_ref.call("play_sfx", "dash")
	return true


## Contextual interaction bound strictly to `[E]` (Harvest Wood/Stone/Crystal, Rescue Cage, Collect Relic, Shrine).
func interact_nearest(lang: String = "en") -> Dictionary:
	# 1. Check IslandTerrain.interact_at(world_pos, max_dist)
	if terrain_ref != null and terrain_ref.has_method("interact_at"):
		var res_at: Variant = terrain_ref.call("interact_at", global_position, 8.5)
		if res_at is Dictionary and bool(res_at.get("ok", false)):
			var kind := String(res_at.get("kind", "resource"))
			if kind == "resource":
				var r_type := String(res_at.get("type", "wood"))
				var amount := int(res_at.get("amount", 10))
				resources[r_type] = int(resources.get(r_type, 0)) + amount
				_sync_resource_fields()
				has_harvested = true
				harvest_count += 1
				emit_signal("resource_harvested", r_type, amount)
				emit_signal("resources_changed", resources)
			elif kind == "relic":
				relic_fragments = mini(max_relic_fragments, int(res_at.get("total_claimed", relic_fragments + 1)))
				relic_fragments_collected = relic_fragments
				resources["crystal"] = int(resources.get("crystal", 0)) + 15
				_sync_resource_fields()
				emit_signal("relic_collected", relic_fragments, max_relic_fragments)
				emit_signal("resources_changed", resources)
			elif kind == "cage":
				cages_rescued += 1
				emit_signal("cage_rescued", cages_rescued)
			elif kind == "shrine":
				var w_id := String(res_at.get("weapon_id", "frost_blade"))
				equip_weapon(w_id)
			if audio_ref != null and audio_ref.has_method("play_sfx"):
				audio_ref.call("play_sfx", "harvest")
			return res_at

	# 2. Check legacy interact_at_position if present
	if terrain_ref != null and terrain_ref.has_method("interact_at_position"):
		var res: Variant = terrain_ref.call("interact_at_position", global_position, 8.5)
		if res is Dictionary and bool(res.get("handled", false)):
			var kind := String(res.get("type", "harvest"))
			if kind == "harvest":
				var r_type := String(res.get("resource_type", "wood"))
				var amount := int(res.get("amount", 10))
				resources[r_type] = int(resources.get(r_type, 0)) + amount
				_sync_resource_fields()
				has_harvested = true
				harvest_count += 1
				emit_signal("resource_harvested", r_type, amount)
				emit_signal("resources_changed", resources)
			elif kind == "relic":
				relic_fragments = mini(max_relic_fragments, relic_fragments + 1)
				relic_fragments_collected = relic_fragments
				resources["crystal"] = int(resources.get("crystal", 0)) + 15
				_sync_resource_fields()
				emit_signal("relic_collected", relic_fragments, max_relic_fragments)
				emit_signal("resources_changed", resources)
			elif kind == "cage" or kind == "rescue":
				cages_rescued += 1
				emit_signal("cage_rescued", cages_rescued)
			elif kind == "weapon_shrine":
				var w_id := String(res.get("weapon_id", "frost_blade"))
				equip_weapon(w_id)
			if audio_ref != null and audio_ref.has_method("play_sfx"):
				audio_ref.call("play_sfx", "harvest")
			return res

	# 3. Fallback direct harvest if no nearby node was within range
	resources["wood"] = int(resources.get("wood", 0)) + 8
	resources["stone"] = int(resources.get("stone", 0)) + 5
	resources["crystal"] = int(resources.get("crystal", 0)) + 4
	_sync_resource_fields()
	has_harvested = true
	harvest_count += 1
	if audio_ref != null and audio_ref.has_method("play_sfx"):
		audio_ref.call("play_sfx", "harvest")
	emit_signal("resource_harvested", "wood", 8)
	emit_signal("resources_changed", resources)
	return {
		"ok": true,
		"handled": true,
		"kind": "resource",
		"type": "harvest",
		"resource_type": "wood",
		"amount": 8,
		"language": lang,
	}


## Giom's Phase 11 Balanced Diminishing-Returns Mastery Formula (`<= 1%` per monster, max `+15%`).
static func compute_species_slayer_bonus_pct(kills: int) -> float:
	if kills <= 0:
		return 0.0
	var k1 := mini(kills, 5)
	var k2 := clampi(kills - 5, 0, 10)
	var k3 := maxi(0, kills - 15)
	var pct := float(k1) * 1.0 + float(k2) * 0.5 + float(k3) * 0.25
	return minf(15.0, snappedf(pct, 0.1))


func get_species_mastery_bonus(species_id: String) -> float:
	var kills := int(species_kills.get(species_id, 0))
	return compute_species_slayer_bonus_pct(kills) / 100.0


func get_total_damage_against(base_dmg: float, creature: Dictionary) -> float:
	var sp_id := String(creature.get("species_id", "scavenger_goblin"))
	var mut_id := String(creature.get("mutation_id", ""))
	var sp_bonus := get_species_mastery_bonus(sp_id)
	var mut_kills := int(mutation_kills.get(mut_id, 0)) if not mut_id.is_empty() else 0
	var mut_bonus := compute_species_slayer_bonus_pct(mut_kills) / 100.0
	var adaptive_mult := minf(1.30, 1.0 + sp_bonus + mut_bonus)

	var clade_mult := 1.0
	if equipped_weapon == "frost_blade" and (sp_id.find("shark") >= 0 or mut_id == "pyro_gland"):
		clade_mult = 1.15
	elif equipped_weapon == "inferno_greatblade" and (sp_id.find("wolf") >= 0 or sp_id.find("mole") >= 0):
		clade_mult = 1.15
	elif equipped_weapon == "emerald_scythe" and not mut_id.is_empty():
		clade_mult = 1.15

	return base_dmg * adaptive_mult * clade_mult


## Records a monster kill, increments Adaptive Mastery (`<= 1%` per monster), and awards XP.
func record_kill(species_id: String, xp_reward: int = 20, is_mutant: bool = false, mutation_id: String = "") -> Dictionary:
	total_kills += 1
	species_kills[species_id] = int(species_kills.get(species_id, 0)) + 1
	if is_mutant:
		mutants_slain += 1
		var m_key := mutation_id if not mutation_id.is_empty() else "mutant"
		mutation_kills[m_key] = int(mutation_kills.get(m_key, 0)) + 1
		resources["biomass"] = int(resources.get("biomass", 0)) + 4
		_sync_resource_fields()
		emit_signal("resources_changed", resources)

	gain_xp(xp_reward)
	var new_kills := int(species_kills[species_id])
	return {
		"species_id": species_id,
		"kills": new_kills,
		"bonus_pct": compute_species_slayer_bonus_pct(new_kills),
	}


func add_xp(amount: int) -> void:
	gain_xp(amount)


func gain_xp(amount: int) -> void:
	if amount <= 0:
		return
	xp += amount
	while xp >= next_level_xp:
		xp -= next_level_xp
		level += 1
		next_level_xp = int(round(float(next_level_xp) * 1.35))
		max_hp += 15.0
		hp = minf(max_hp, hp + 30.0)
		pending_level_ups += 1
		if audio_ref != null and audio_ref.has_method("play_sfx"):
			audio_ref.call("play_sfx", "level_up")
		emit_signal("leveled_up", level)
		emit_signal("level_up", level)
	emit_signal("xp_changed", xp, next_level_xp, level)


## Applies a Phase 11 balanced upgrade (`+8%` to `+12%` passive card or `+8%/lvl` spell evolution).
func apply_upgrade(upgrade_id: String) -> void:
	upgrades.append(upgrade_id)
	if pending_level_ups > 0:
		pending_level_ups -= 1

	if spell_levels.has(upgrade_id):
		spell_levels[upgrade_id] = mini(5, int(spell_levels[upgrade_id]) + 1)
		return

	match upgrade_id:
		"cleave_damage", "melee_damage", "pyrophage_blade":
			damage_multiplier = snappedf(damage_multiplier * 1.10, 0.0001)
			mutant_damage_multiplier = snappedf(mutant_damage_multiplier * 1.10, 0.0001)
		"move_speed", "strider_boots":
			speed_multiplier = snappedf(speed_multiplier + 0.08, 0.0001)
		"attack_speed", "swift_strikes":
			attack_speed_multiplier = snappedf(attack_speed_multiplier + 0.10, 0.0001)
		"max_hp", "max_hp_regen", "amber_blood_vigor":
			max_hp += 15.0
			hp = minf(max_hp, hp + 20.0)
			regen_per_sec += 0.8
		"fire_damage", "solar_affinity":
			fire_damage_multiplier = snappedf(fire_damage_multiplier + 0.12, 0.0001)
		"ice_slow", "cryo_affinity":
			ice_slow_factor = snappedf(ice_slow_factor * 0.88, 0.0001)
		"lightning_chain", "storm_affinity":
			lightning_chain_bonus += 1
		"poison_dps", "venom_affinity":
			poison_dps_bonus += 4.0
		"knockback", "seismic_impact":
			knockback_multiplier = snappedf(knockback_multiplier + 0.15, 0.0001)
		_:
			damage_multiplier = snappedf(damage_multiplier * 1.10, 0.0001)


## Applies incoming damage mitigated by Phase 11 Adaptive Resistance (`<= 10%` elemental / `<= 6%` physical).
func take_damage(amount: float, attacker_name: String = "Wild Creature", is_elemental: bool = false) -> void:
	if is_dead or dash_timer > 0.0:
		return
	var bucket := "elemental" if is_elemental else "physical"
	hits_taken_by_type[bucket] = int(hits_taken_by_type.get(bucket, 0)) + 1
	var hits := int(hits_taken_by_type[bucket])
	var adaptive_res := minf(0.10, float(hits) * 0.005) if is_elemental else minf(0.06, float(hits) * 0.004)
	var total_red := clampf(damage_reduction + adaptive_res, 0.0, 0.55)
	var final_dmg := maxf(1.0, amount * (1.0 - total_red))

	hp = maxf(0.0, hp - final_dmg)
	emit_signal("hp_changed", hp, max_hp)

	if hp <= 0.0:
		hp = 0.0
		is_dead = true
		last_killer_name = attacker_name
		emit_signal("player_died")


func revive_at_sanctuary() -> void:
	revive_with_grace()


func revive_with_grace() -> void:
	is_dead = false
	hp = max_hp
	position = Vector3(0.0, 2.5, 5.5)
	_snap_to_terrain()
	resources["food"] = maxi(85, int(resources.get("food", 0)) + 50)
	_sync_resource_fields()
	emit_signal("hp_changed", hp, max_hp)
	emit_signal("resources_changed", resources)


func reset_for_new_run() -> void:
	is_dead = false
	level = 1
	xp = 0
	next_level_xp = 60
	pending_level_ups = 0
	max_hp = 160.0
	hp = max_hp
	damage_multiplier = 1.0
	speed_multiplier = 1.0
	attack_speed_multiplier = 1.0
	mutant_damage_multiplier = 1.0
	fire_damage_multiplier = 1.0
	ice_slow_factor = 1.0
	lightning_chain_bonus = 0
	poison_dps_bonus = 0.0
	knockback_multiplier = 1.0
	damage_reduction = 0.0
	regen_per_sec = 1.4
	equipped_weapon = "runic_steel"
	equipped_weapon_id = "runic_steel"
	relic_fragments = 0
	relic_fragments_collected = 0
	cages_rescued = 0
	total_kills = 0
	mutants_slain = 0
	species_kills.clear()
	mutation_kills.clear()
	upgrades.clear()
	resources = {
		"wood": 40,
		"stone": 25,
		"crystal": 20,
		"biomass": 15,
		"food": 85,
	}
	_sync_resource_fields()
	for s_id in spell_levels.keys():
		spell_levels[s_id] = 1
		spell_cooldowns[s_id] = 0.0
	position = Vector3(0.0, 2.5, 6.5)
	_snap_to_terrain()
	_apply_weapon_visuals()
	emit_signal("hp_changed", hp, max_hp)
	emit_signal("xp_changed", xp, next_level_xp, level)
	emit_signal("resources_changed", resources)


func _refresh_contextual_prompts() -> void:
	# Default Sanctuary / Field prompt
	var dist_center := Vector2(position.x, position.z).length()
	if dist_center <= 11.0:
		nearest_prompt_en = "[E] Activate Sanctuary / [H] Bastion Architect"
		nearest_prompt_fr = "[E] Activer le Sanctuaire / [H] Architecte du Bastion"
	else:
		nearest_prompt_en = "[E] Harvest (Wood / Stone / Crystal) • [Left Click / Space] Strike!"
		nearest_prompt_fr = "[E] Récolter (Bois / Pierre / Cristal) • [Clic Gauche / Espace] Frapper !"

	# Check IslandTerrain.find_nearest_interactable(world_pos, max_dist)
	if terrain_ref != null and terrain_ref.has_method("find_nearest_interactable"):
		var near_obj: Variant = terrain_ref.call("find_nearest_interactable", global_position, 9.5)
		if near_obj is Dictionary and not near_obj.is_empty():
			var kind := String(near_obj.get("kind", "resource"))
			var item: Dictionary = near_obj.get("data", {})
			if kind == "relic":
				nearest_prompt_en = "💎 [E] Claim Ancient Relic Fragment (Solar Aegis Monolith)"
				nearest_prompt_fr = "💎 [E] Réclamer le Fragment de Relique Ancienne (Monolithe Égide)"
				return
			elif kind == "cage":
				nearest_prompt_en = "🗝️ [E] Rescue Captive Bastion Scout"
				nearest_prompt_fr = "🗝️ [E] Libérer l'Éclaireur Captif du Bastion"
				return
			elif kind == "shrine":
				var w_id := String(item.get("weapon_id", "frost_blade"))
				nearest_prompt_en = "⚔️ [E] Attune Elemental Weapon Shrine (%s)" % w_id
				nearest_prompt_fr = "⚔️ [E] Harmoniser le Sanctuaire d'Arme Élémentaire (%s)" % w_id
				return
			elif kind == "resource":
				var r_type := String(item.get("type", "wood")).capitalize()
				nearest_prompt_en = "🌲 [E] Harvest %s Node" % r_type
				nearest_prompt_fr = "🌲 [E] Récolter le Gisement (%s)" % r_type
				return

	# Check nearby creatures (Peaceful Dragon warning, Herbivore Prey, or Hostile strike reach)
	if enemy_manager_ref != null and enemy_manager_ref.has_method("find_nearest_creature"):
		var near_c: Dictionary = enemy_manager_ref.call("find_nearest_creature", global_position, 14.0)
		if not near_c.is_empty():
			var d := global_position.distance_to(near_c.get("position", global_position))
			if bool(near_c.get("is_peaceful_dragon", false)) and not bool(near_c.get("enraged", false)):
				nearest_prompt_en = "⚠️ [Peaceful Dragon — Do Not Attack!] Provoking it unleashes Dragon Wrath!"
				nearest_prompt_fr = "⚠️ [Dragon Souverain — Pacifique !] L'attaquer déclenchera le Courroux Draconique !"
			elif bool(near_c.get("is_prey", false)) and d <= 9.5:
				if equipped_weapon == "emerald_scythe":
					nearest_prompt_en = "🧪 [Emerald Scythe] Herbivore Prey protected from collateral damage!"
					nearest_prompt_fr = "🧪 [Faux d'Émeraude] Proie herbivore protégée des dégâts collatéraux !"
				else:
					nearest_prompt_en = "🦌 Herbivore Prey (+Food / +HP — Beware extinction!)"
					nearest_prompt_fr = "🦌 Proie Herbivore (+Vivres / +PV — Attention à l'extinction !)"
			elif d <= cleave_range + 2.0:
				nearest_prompt_en = "[Left Click / Space] Strike! • [1-4] Cast Spells"
				nearest_prompt_fr = "[Clic Gauche / Espace] Frapper ! • [1-4] Lancer Sorts"


## Returns the localized 3D world contextual interaction prompt (`"en"` default, `"fr"` 2nd option).
func get_contextual_prompt(lang: String = "en") -> String:
	if nearest_prompt_en.is_empty():
		_refresh_contextual_prompts()
	return nearest_prompt_fr if lang == "fr" else nearest_prompt_en


## Returns a structured snapshot of the Hero's state for `HUDController.gd`.
func get_hud_state(lang: String = "en") -> Dictionary:
	return {
		"hp": hp,
		"max_hp": max_hp,
		"level": level,
		"xp": xp,
		"next_level_xp": next_level_xp,
		"combat_mode": combat_mode,
		"use_blender_models": use_blender_models,
		"equipped_weapon": equipped_weapon,
		"weapon_spec": get_equipped_weapon_spec(lang),
		"resources": resources.duplicate(),
		"relic_fragments": relic_fragments,
		"max_relic_fragments": max_relic_fragments,
		"cages_rescued": cages_rescued,
		"total_kills": total_kills,
		"mutants_slain": mutants_slain,
		"species_kills": species_kills.duplicate(),
		"spell_levels": spell_levels.duplicate(),
		"spell_cooldowns": spell_cooldowns.duplicate(),
		"spell_max_cooldowns": spell_max_cooldowns.duplicate(),
		"contextual_prompt": get_contextual_prompt(lang),
	}
