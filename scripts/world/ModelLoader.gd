## scripts/world/ModelLoader.gd
## Blender 5.0 `.glb` & Procedural 3D Mesh Loader, Cache, and Live Mode Switcher (`[J]`)
## for Genesis Bastion (Godot 4.3 Engine Edition).
##
## Responsibilities:
## - Preloads, caches, and instantiates the 14 low-poly smooth-shaded PBR `.glb` models from
##   `res://assets/models/<key>.glb` when `use_blender_models == true`.
## - Generates clean, articulated procedural `MeshInstance3D` hierarchies (`Body`, `Head`,
##   `LeftArm`, `RightArm`, `LeftLeg`, `RightLeg`, `LeftWing`, `RightWing`, `Tail`, `Weapon`)
##   when `use_blender_models == false` or as a fallback.
## - Supports instant runtime toggling (`[J]`) across all live entities in the scene tree.
class_name ModelLoader
extends RefCounted

## Global toggle state (`true` = Blender 5.0 `.glb` models, `false` = Procedural 3D meshes).
static var _global_use_blender_models: bool = true
var use_blender_models: bool = true:
	set(value):
		ModelLoader.set_use_blender_models(value)
	get:
		return _global_use_blender_models

## Cached PackedScene / GLTF templates keyed by normalized model key.
static var _scene_cache: Dictionary = {}

## Cached StandardMaterial3D instances keyed by `"%s|%s" % [model_key, color.to_html()]`.
static var _material_cache: Dictionary = {}

## WeakRef list of active dual-mode visual root nodes for instant `[J]` toggling.
static var _registered_roots: Array = []

## Canonical mapping from species/entity keys to `.glb` filenames in `res://assets/models/`.
const MODEL_MANIFEST: Dictionary = {
	"hero_guardian": "res://assets/models/hero_guardian.glb",
	"player_warden": "res://assets/models/player_warden.glb",
	"player": "res://assets/models/player_warden.glb",
	"npc_survivor": "res://assets/models/npc_survivor.glb",
	"npc": "res://assets/models/npc_survivor.glb",
	"goblin": "res://assets/models/goblin.glb",
	"scavenger_goblin": "res://assets/models/scavenger_goblin.glb",
	"beach_crab": "res://assets/models/beach_crab.glb",
	"orc": "res://assets/models/orc.glb",
	"carrion_beetle": "res://assets/models/carrion_beetle.glb",
	"troll": "res://assets/models/troll.glb",
	"wolf": "res://assets/models/wolf.glb",
	"forest_wolf": "res://assets/models/forest_wolf.glb",
	"lion": "res://assets/models/lion.glb",
	"vulture": "res://assets/models/vulture.glb",
	"sky_harpy": "res://assets/models/sky_harpy.glb",
	"dragon": "res://assets/models/dragon.glb",
	"sovereign_dragon": "res://assets/models/sovereign_dragon.glb",
	"shark": "res://assets/models/shark.glb",
	"abyssal_shark": "res://assets/models/abyssal_shark.glb",
	"giant_mole": "res://assets/models/giant_mole.glb",
	"tunnel_mole": "res://assets/models/tunnel_mole.glb",
	"deer": "res://assets/models/deer.glb",
	"glimmer_elk": "res://assets/models/glimmer_elk.glb",
	"rabbit": "res://assets/models/rabbit.glb",
	"meadow_hare": "res://assets/models/meadow_hare.glb",
	"bastion_monolith": "res://assets/models/bastion_monolith.glb",
	"bastion_sanctuary": "res://assets/models/bastion_sanctuary.glb",
	"relic_monolith": "res://assets/models/relic_monolith.glb",
}


## Resolves any model key, species ID, or `res://` path to a normalized key.
static func resolve_model_key(key_or_path: String) -> String:
	var cleaned: String = key_or_path.strip_edges()
	if cleaned.begins_with("res://"):
		cleaned = cleaned.get_file().get_basename()
	elif cleaned.ends_with(".glb"):
		cleaned = cleaned.get_file().get_basename()
	if MODEL_MANIFEST.has(cleaned):
		return cleaned
	return "scavenger_goblin"


## Resolves any model key or path to a valid `res://assets/models/<name>.glb` path.
static func resolve_model_path(key_or_path: String) -> String:
	if key_or_path.begins_with("res://") and key_or_path.ends_with(".glb"):
		return key_or_path
	var key: String = resolve_model_key(key_or_path)
	return MODEL_MANIFEST.get(key, "res://assets/models/goblin.glb")


## Preloads all manifest `.glb` scenes into `_scene_cache`.
static func preload_all() -> int:
	var loaded_count: int = 0
	for key in MODEL_MANIFEST.keys():
		var path: String = MODEL_MANIFEST[key]
		var scene_res: Variant = _load_glb_resource(path)
		if scene_res != null:
			_scene_cache[key] = scene_res
			loaded_count += 1
	return loaded_count


## Internal helper to load a `.glb` via `ResourceLoader` or `GLTFDocument` fallback.
static func _load_glb_resource(res_path: String) -> Variant:
	if _scene_cache.has(res_path):
		return _scene_cache[res_path]

	if ResourceLoader.exists(res_path):
		var packed: Resource = ResourceLoader.load(res_path)
		if packed is PackedScene:
			_scene_cache[res_path] = packed
			return packed

	var abs_path: String = ProjectSettings.globalize_path(res_path)
	if FileAccess.file_exists(abs_path):
		var gltf_doc := GLTFDocument.new()
		var gltf_state := GLTFState.new()
		var err: Error = gltf_doc.append_from_file(abs_path, gltf_state)
		if err == OK:
			var generated_root: Node = gltf_doc.generate_scene(gltf_state)
			if generated_root != null:
				var packed := PackedScene.new()
				if packed.pack(generated_root) == OK:
					generated_root.free()
					_scene_cache[res_path] = packed
					return packed
				return generated_root
	return null


## Returns whether Blender `.glb` 3D model mode is currently active.
static func is_blender_mode_enabled() -> bool:
	return _global_use_blender_models


## Sets the global 3D model rendering mode (`true` = Blender `.glb`, `false` = Procedural)
## and updates all live registered entity visual nodes in real time.
static func set_use_blender_models(enabled: bool) -> bool:
	_global_use_blender_models = enabled
	var alive_refs: Array = []
	for ref in _registered_roots:
		var root: Node3D = ref.get_ref() if ref is WeakRef else null
		if root != null and is_instance_valid(root):
			_apply_mode_to_root(root)
			alive_refs.append(ref)
	_registered_roots = alive_refs
	return _global_use_blender_models


## Toggles between Blender `.glb` models and Procedural 3D meshes (`[J]`).
static func toggle_blender_models() -> bool:
	return set_use_blender_models(not _global_use_blender_models)


## Instance-method forwarders so callers can use either `ModelLoader.func()` or `loader.func()`.
func preload_all_models() -> int:
	return ModelLoader.preload_all()


func set_blender_mode(enabled: bool) -> bool:
	return ModelLoader.set_use_blender_models(enabled)


func toggle_blender_mode() -> bool:
	return ModelLoader.toggle_blender_models()


func is_blender_mode() -> bool:
	return ModelLoader.is_blender_mode_enabled()


## Instantiates a dual-mode (`BlenderModelRoot` + `ProceduralModelRoot`) 3D visual hierarchy
## for any creature, player, NPC, or structure key.
static func instantiate_model(
	key_or_path: String,
	tint_color: Color = Color(1.0, 1.0, 1.0, 1.0),
	scale_factor: float = 1.0,
	apply_tint_to_glb: bool = false
) -> Node3D:
	var model_key: String = resolve_model_key(key_or_path)
	var res_path: String = resolve_model_path(key_or_path)

	var container := Node3D.new()
	container.name = "VisualModel_%s" % model_key
	container.set_meta("model_key", model_key)
	container.scale = Vector3.ONE * clampf(scale_factor, 0.25, 4.5)

	# 1. Build Blender `.glb` branch
	var blender_root := Node3D.new()
	blender_root.name = "BlenderModelRoot"
	var glb_instance: Node3D = _instantiate_glb_node(res_path, model_key, tint_color, apply_tint_to_glb)
	if glb_instance != null:
		blender_root.add_child(glb_instance)
		container.set_meta("has_glb_instance", true)
	else:
		container.set_meta("has_glb_instance", false)
	container.add_child(blender_root)

	# 2. Build Procedural 3D fallback/classic branch
	var proc_root: Node3D = build_procedural_model(model_key, tint_color)
	proc_root.name = "ProceduralModelRoot"
	container.add_child(proc_root)

	_apply_mode_to_root(container)
	_registered_roots.append(weakref(container))
	return container


## Instance wrapper for `instantiate_model`.
func create_model_instance(
	key_or_path: String,
	tint_color: Color = Color(1.0, 1.0, 1.0, 1.0),
	scale_factor: float = 1.0,
	apply_tint_to_glb: bool = false
) -> Node3D:
	return ModelLoader.instantiate_model(key_or_path, tint_color, scale_factor, apply_tint_to_glb)


## Alias for `instantiate_model` used by entity spawners.
static func load_model(
	key_or_path: String,
	tint_color: Color = Color(1.0, 1.0, 1.0, 1.0),
	scale_factor: float = 1.0
) -> Node3D:
	return instantiate_model(key_or_path, tint_color, scale_factor, false)


## Internal helper that instantiates a `.glb` scene and applies the sub-mesh shadow diet.
static func _instantiate_glb_node(
	res_path: String,
	model_key: String,
	tint_color: Color,
	apply_tint: bool
) -> Node3D:
	var res: Variant = _scene_cache.get(model_key, null)
	if res == null:
		res = _load_glb_resource(res_path)
		if res != null:
			_scene_cache[model_key] = res

	var inst: Node3D = null
	if res is PackedScene:
		var raw: Node = (res as PackedScene).instantiate()
		if raw is Node3D:
			inst = raw as Node3D
	elif res is Node3D:
		inst = (res as Node3D).duplicate() as Node3D

	if inst == null:
		return null

	inst.name = "GLBScene_%s" % model_key
	_configure_glb_meshes_recursive(inst, model_key, tint_color, apply_tint)
	return inst


## Applies 60 FPS shadow diet (`Body` casts shadow, tiny sub-meshes do not) and optional tint.
static func _configure_glb_meshes_recursive(
	node: Node,
	model_key: String,
	tint_color: Color,
	apply_tint: bool
) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		var is_body: bool = (
			mi.name == "Body"
			or mi.name.begins_with("Body")
			or (mi.get_parent() != null and mi.get_parent().name == "Body")
		)
		mi.cast_shadow = (
			GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			if is_body
			else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		)
		if apply_tint and tint_color != Color(1.0, 1.0, 1.0, 1.0):
			var mat_key := "%s|%s" % [model_key, tint_color.to_html()]
			var cached_mat: StandardMaterial3D = _material_cache.get(mat_key, null)
			if cached_mat == null:
				cached_mat = StandardMaterial3D.new()
				cached_mat.albedo_color = tint_color
				cached_mat.roughness = 0.55
				cached_mat.metallic = 0.15
				_material_cache[mat_key] = cached_mat
			mi.material_override = cached_mat

	for child in node.get_children():
		_configure_glb_meshes_recursive(child, model_key, tint_color, apply_tint)


## Applies visibility to `BlenderModelRoot` vs `ProceduralModelRoot` based on `use_blender_models`.
static func _apply_mode_to_root(container: Node3D) -> void:
	if container == null or not is_instance_valid(container):
		return
	var blender_root: Node3D = container.get_node_or_null("BlenderModelRoot") as Node3D
	var proc_root: Node3D = container.get_node_or_null("ProceduralModelRoot") as Node3D
	var has_glb: bool = bool(container.get_meta("has_glb_instance", false)) and blender_root != null and blender_root.get_child_count() > 0
	var show_blender: bool = _global_use_blender_models and has_glb
	if blender_root != null:
		blender_root.visible = show_blender
	if proc_root != null:
		proc_root.visible = not show_blender


## Builds a stylized articulated procedural 3D mesh hierarchy (`Body`, `Head`, `LeftArm`,
## `RightArm`, `LeftLeg`, `RightLeg`, `LeftWing`, `RightWing`, `Tail`, `Weapon`) for `[J]`
## procedural mode or headless fallback.
static func build_procedural_model(model_key: String, primary_color: Color = Color(0.38, 0.58, 0.28)) -> Node3D:
	var root := Node3D.new()
	root.name = "ProceduralModelRoot"

	var base_col: Color = primary_color
	if base_col == Color(1.0, 1.0, 1.0, 1.0):
		base_col = _default_color_for_key(model_key)
	var accent_col: Color = base_col.lightened(0.28)
	var dark_col: Color = base_col.darkened(0.35)

	var mat_body := _get_or_create_material("proc_body_%s" % base_col.to_html(), base_col, 0.55, 0.18)
	var mat_accent := _get_or_create_material("proc_acc_%s" % accent_col.to_html(), accent_col, 0.35, 0.35, accent_col * 0.25)
	var mat_dark := _get_or_create_material("proc_dark_%s" % dark_col.to_html(), dark_col, 0.65, 0.25)

	# Structure / Monolith / Sanctuary special geometry
	if model_key in ["bastion_monolith", "bastion_sanctuary", "relic_monolith"]:
		var base_pedestal := MeshInstance3D.new()
		base_pedestal.name = "Body"
		var cyl := CylinderMesh.new()
		cyl.top_radius = 1.1
		cyl.bottom_radius = 1.45
		cyl.height = 1.6
		cyl.radial_segments = 8
		base_pedestal.mesh = cyl
		base_pedestal.position = Vector3(0.0, 0.8, 0.0)
		base_pedestal.material_override = mat_dark
		root.add_child(base_pedestal)

		var crystal := MeshInstance3D.new()
		crystal.name = "Head"
		var prism := PrismMesh.new()
		prism.size = Vector3(0.95, 1.85, 0.95)
		crystal.mesh = prism
		crystal.position = Vector3(0.0, 1.65, 0.0)
		crystal.material_override = _get_or_create_material(
			"proc_crystal_cyan",
			Color(0.20, 0.88, 1.0),
			0.15,
			0.85,
			Color(0.10, 0.65, 0.95)
		)
		base_pedestal.add_child(crystal)
		return root

	var is_quadruped: bool = model_key in [
		"wolf", "forest_wolf", "lion", "deer", "glimmer_elk",
		"rabbit", "meadow_hare", "shark", "abyssal_shark", "beach_crab"
	]
	var is_winged: bool = model_key in ["vulture", "sky_harpy", "dragon", "sovereign_dragon"]
	var is_colossus: bool = model_key in ["dragon", "sovereign_dragon", "troll", "giant_mole", "tunnel_mole"]

	# 1. Body
	var body := MeshInstance3D.new()
	body.name = "Body"
	var body_cap := CapsuleMesh.new()
	body_cap.radius = 0.42 if is_colossus else 0.28
	body_cap.height = 1.25 if is_colossus else 0.92
	body_cap.radial_segments = 8
	body_cap.rings = 4
	body.mesh = body_cap
	body.position = Vector3(0.0, 0.88 if not is_quadruped else 0.68, 0.0)
	if is_quadruped:
		body.rotation_degrees.x = 75.0
	body.material_override = mat_body
	body.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	root.add_child(body)

	# 2. Head
	var head := MeshInstance3D.new()
	head.name = "Head"
	var head_sphere := SphereMesh.new()
	head_sphere.radius = 0.26 if is_colossus else 0.20
	head_sphere.height = head_sphere.radius * 2.0
	head_sphere.radial_segments = 8
	head_sphere.rings = 4
	head.mesh = head_sphere
	head.position = Vector3(0.0, 0.56, 0.14)
	head.material_override = mat_accent
	head.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	body.add_child(head)

	# 3. Left & Right Arms
	var arm_mesh := BoxMesh.new()
	arm_mesh.size = Vector3(0.16, 0.52, 0.16)

	var left_arm := MeshInstance3D.new()
	left_arm.name = "LeftArm"
	left_arm.mesh = arm_mesh
	left_arm.position = Vector3(-0.36, 0.18, 0.0)
	left_arm.material_override = mat_dark
	left_arm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	body.add_child(left_arm)

	var right_arm := MeshInstance3D.new()
	right_arm.name = "RightArm"
	right_arm.mesh = arm_mesh
	right_arm.position = Vector3(0.36, 0.18, 0.0)
	right_arm.material_override = mat_dark
	right_arm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	body.add_child(right_arm)

	# 4. Weapon on RightArm for bipeds / hero / goblins / orcs
	if not is_quadruped:
		var weapon := MeshInstance3D.new()
		weapon.name = "Weapon"
		var w_box := BoxMesh.new()
		w_box.size = Vector3(0.08, 0.85, 0.12)
		weapon.mesh = w_box
		weapon.position = Vector3(0.0, -0.32, 0.22)
		weapon.material_override = mat_accent
		weapon.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		right_arm.add_child(weapon)

	# 5. Wings for flying creatures (`vulture`, `sky_harpy`, `dragon`, `sovereign_dragon`)
	if is_winged:
		var wing_box := BoxMesh.new()
		wing_box.size = Vector3(1.35 if is_colossus else 0.95, 0.06, 0.48)

		var left_wing := MeshInstance3D.new()
		left_wing.name = "LeftWing"
		left_wing.mesh = wing_box
		left_wing.position = Vector3(-0.55, 0.26, -0.08)
		left_wing.material_override = mat_accent
		left_wing.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		body.add_child(left_wing)

		var right_wing := MeshInstance3D.new()
		right_wing.name = "RightWing"
		right_wing.mesh = wing_box
		right_wing.position = Vector3(0.55, 0.26, -0.08)
		right_wing.material_override = mat_accent
		right_wing.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		body.add_child(right_wing)

	# 6. Tail
	var tail := MeshInstance3D.new()
	tail.name = "Tail"
	var tail_box := BoxMesh.new()
	tail_box.size = Vector3(0.14, 0.14, 0.48)
	tail.mesh = tail_box
	tail.position = Vector3(0.0, -0.15, -0.32)
	tail.material_override = mat_dark
	tail.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	body.add_child(tail)

	# 7. Left & Right Legs
	var leg_box := BoxMesh.new()
	leg_box.size = Vector3(0.18, 0.56, 0.18)

	var left_leg := MeshInstance3D.new()
	left_leg.name = "LeftLeg"
	left_leg.mesh = leg_box
	left_leg.position = Vector3(-0.18, 0.30, 0.0)
	left_leg.material_override = mat_dark
	left_leg.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(left_leg)

	var right_leg := MeshInstance3D.new()
	right_leg.name = "RightLeg"
	right_leg.mesh = leg_box
	right_leg.position = Vector3(0.18, 0.30, 0.0)
	right_leg.material_override = mat_dark
	right_leg.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(right_leg)

	return root


## Animates the articulated limb nodes (`Body`, `LeftLeg`, `RightLeg`, `LeftArm`, `RightArm`,
## `LeftWing`, `RightWing`, `Tail`) of whichever visual branch (`BlenderModelRoot` or
## `ProceduralModelRoot`) is currently visible.
static func animate_model(
	container: Node3D,
	anim_phase: float,
	is_moving: bool = true,
	is_attacking: bool = false,
	is_flying: bool = false
) -> void:
	if container == null or not is_instance_valid(container):
		return

	var active_branch: Node = null
	var blender_root: Node3D = container.get_node_or_null("BlenderModelRoot") as Node3D
	var proc_root: Node3D = container.get_node_or_null("ProceduralModelRoot") as Node3D
	if blender_root != null and blender_root.visible and blender_root.get_child_count() > 0:
		active_branch = blender_root.get_child(0)
	elif proc_root != null:
		active_branch = proc_root
	else:
		active_branch = container

	var left_leg: Node3D = active_branch.find_child("LeftLeg", true, false) as Node3D
	var right_leg: Node3D = active_branch.find_child("RightLeg", true, false) as Node3D
	var left_arm: Node3D = active_branch.find_child("LeftArm", true, false) as Node3D
	var right_arm: Node3D = active_branch.find_child("RightArm", true, false) as Node3D
	var left_wing: Node3D = active_branch.find_child("LeftWing", true, false) as Node3D
	var right_wing: Node3D = active_branch.find_child("RightWing", true, false) as Node3D
	var tail: Node3D = active_branch.find_child("Tail", true, false) as Node3D

	var stride: float = sin(anim_phase) * (0.55 if is_moving else 0.05)
	if left_leg != null:
		left_leg.rotation.x = stride
	if right_leg != null:
		right_leg.rotation.x = -stride
	if left_arm != null:
		left_arm.rotation.x = -stride * 0.75
	if right_arm != null:
		if is_attacking:
			right_arm.rotation.x = -1.35 + sin(anim_phase * 2.5) * 1.15
		else:
			right_arm.rotation.x = stride * 0.75

	if left_wing != null and right_wing != null:
		var flap: float = sin(anim_phase * (1.8 if is_flying else 1.1)) * 0.48
		left_wing.rotation.z = flap
		right_wing.rotation.z = -flap

	if tail != null:
		tail.rotation.y = sin(anim_phase * 0.85) * 0.25


## Shared material cache helper.
static func _get_or_create_material(
	key: String,
	albedo: Color,
	roughness_val: float = 0.55,
	metallic_val: float = 0.15,
	emission_col: Color = Color(0, 0, 0, 1)
) -> StandardMaterial3D:
	if _material_cache.has(key):
		return _material_cache[key]
	var mat := StandardMaterial3D.new()
	mat.albedo_color = albedo
	mat.roughness = roughness_val
	mat.metallic = metallic_val
	if emission_col.r > 0.01 or emission_col.g > 0.01 or emission_col.b > 0.01:
		mat.emission_enabled = true
		mat.emission = emission_col
		mat.emission_energy_multiplier = 1.35
	_material_cache[key] = mat
	return mat


## Default species/entity color palette for procedural mode.
static func _default_color_for_key(model_key: String) -> Color:
	match model_key:
		"hero_guardian", "player_warden", "player":
			return Color(0.18, 0.34, 0.58)
		"npc_survivor", "npc":
			return Color(0.18, 0.68, 0.52)
		"glimmer_elk", "deer":
			return Color(0.76, 0.52, 0.26)
		"meadow_hare", "rabbit":
			return Color(0.92, 0.88, 0.80)
		"beach_crab":
			return Color(0.84, 0.36, 0.24)
		"scavenger_goblin", "goblin":
			return Color(0.36, 0.56, 0.24)
		"forest_wolf", "wolf":
			return Color(0.42, 0.46, 0.52)
		"sky_harpy", "vulture":
			return Color(0.48, 0.32, 0.56)
		"abyssal_shark", "shark":
			return Color(0.18, 0.36, 0.62)
		"tunnel_mole", "giant_mole":
			return Color(0.44, 0.30, 0.22)
		"carrion_beetle", "orc":
			return Color(0.28, 0.44, 0.22)
		"sovereign_dragon", "dragon":
			return Color(0.78, 0.16, 0.14)
		"troll":
			return Color(0.30, 0.38, 0.34)
		_:
			return Color(0.45, 0.58, 0.35)
