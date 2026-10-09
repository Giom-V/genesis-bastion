class_name EnemySwarmManager
extends Node3D
## EnemySwarmManager.gd
## 10-Species Genetic Ecosystem Swarm & AI Manager for **Genesis Bastion (Godot 4.3 Edition)**.
##
## Features:
## 1. **10-Species Ecological & Genetic Roster**:
##    - Peaceful Herbivore Prey (`glimmer_elk` -> `deer.glb`, `meadow_hare` -> `rabbit.glb`, `beach_crab` -> `goblin.glb`)
##    - Hostile/Territorial Packs (`scavenger_goblin` -> `goblin.glb`, `forest_wolf` -> `wolf.glb`,
##      `sky_harpy` -> `vulture.glb`, `carrion_beetle` -> `orc.glb` / `troll.glb`)
##    - Progressive Emerging Threats (`abyssal_shark` -> `shark.glb`, `tunnel_mole` -> `giant_mole.glb`)
##    - Peaceful Apex Sovereign (`sovereign_dragon` -> `dragon.glb`): Peaceful unless attacked by the player;
##      provoking any Dragon triggers collective **Dragon Wrath** (`dragon_wrath_active = true`)!
## 2. **Individual Gestation & Juvenile-to-Adult Maturation**:
##    - Each species reproduces according to its biological gestation timer (`4.5s` for Goblins vs `58.0s` for Dragons)
##      and Conway fertility window, birthing `0.55x` scale juveniles that mature into adults.
## 3. **Dual 3D Model Pipeline (`[J]` Toggle)**:
##    - Instantiates cached Blender 5.0 `.glb` templates from `res://assets/models/*.glb` when
##      `use_blender_models == true`, and switches to articulated procedural meshes when `false`.
## 4. **Ultra 60 FPS Distance Culling & 4x Animation LOD**:
##    - `d_player > 95.0m` (unless `spotted_by_scout` or `is_patient_zero`): sets `node.visible = false`
##      and skips limb animation completely.
##    - `d_player > 48.0m`: runs limb animation only every 4th frame (`((i + frame_tick) & 3) == 0`).
##    - Herbivore prey threat scans are throttled to once every `0.25s` (`flee_timer`).

signal creature_spawned(creature: Dictionary)
signal creature_killed(species_id: String, is_mutant: bool)
signal dragon_provoked()
signal dragon_wrath_triggered(dragon_name: String)
signal patient_zero_spotted(species_id: String, pos: Vector3)
signal shark_landing_triggered(count: int)
signal mole_eruption_triggered(count: int)
signal lineage_eradicated(species_id: String)

# --- Species Catalog Mapping (Supports both Phase 14 and Classic Species IDs) ---
const SPECIES_DEFAULTS: Dictionary = {
	"glimmer_elk": {
		"name_en": "Glimmer Elk",
		"name_fr": "Cerf Luminescent",
		"clade": "herbivore",
		"is_prey": true,
		"is_peaceful_dragon": false,
		"aggression": 0.0,
		"gestation_sec": 14.0,
		"maturation_sec": 14.0,
		"min_population": 3,
		"base_hp": 48.0,
		"base_speed": 7.8,
		"base_damage": 0.0,
		"xp_reward": 15,
		"model_file": "res://assets/models/deer.glb",
		"tint_color": Color(0.82, 0.58, 0.34),
	},
	"meadow_hare": {
		"name_en": "Meadow Hare",
		"name_fr": "Lièvre des Prairies",
		"clade": "herbivore",
		"is_prey": true,
		"is_peaceful_dragon": false,
		"aggression": 0.0,
		"gestation_sec": 8.0,
		"maturation_sec": 8.0,
		"min_population": 4,
		"base_hp": 26.0,
		"base_speed": 9.2,
		"base_damage": 0.0,
		"xp_reward": 10,
		"model_file": "res://assets/models/rabbit.glb",
		"tint_color": Color(0.92, 0.88, 0.82),
	},
	"beach_crab": {
		"name_en": "Armored Beach Crab",
		"name_fr": "Crabe Littoral",
		"clade": "herbivore",
		"is_prey": true,
		"is_peaceful_dragon": false,
		"aggression": 0.05,
		"gestation_sec": 11.0,
		"maturation_sec": 10.0,
		"min_population": 3,
		"base_hp": 35.0,
		"base_speed": 5.6,
		"base_damage": 0.0,
		"xp_reward": 12,
		"model_file": "res://assets/models/goblin.glb",
		"tint_color": Color(0.92, 0.38, 0.24),
	},
	"scavenger_goblin": {
		"name_en": "Scavenger Goblin",
		"name_fr": "Gobelin Pillard",
		"clade": "greenskin",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.72,
		"gestation_sec": 4.5,
		"maturation_sec": 11.0,
		"min_population": 4,
		"base_hp": 52.0,
		"base_speed": 7.4,
		"base_damage": 7.5,
		"xp_reward": 22,
		"model_file": "res://assets/models/goblin.glb",
		"tint_color": Color(0.36, 0.72, 0.28),
	},
	"forest_wolf": {
		"name_en": "Timber Wolf",
		"name_fr": "Loup Sylvestre",
		"clade": "beast",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.78,
		"gestation_sec": 13.0,
		"maturation_sec": 14.0,
		"min_population": 4,
		"base_hp": 68.0,
		"base_speed": 8.8,
		"base_damage": 10.0,
		"xp_reward": 26,
		"model_file": "res://assets/models/wolf.glb",
		"tint_color": Color(0.48, 0.52, 0.58),
	},
	"sky_harpy": {
		"name_en": "Razorwing Vulture",
		"name_fr": "Vautour Rémige",
		"clade": "avian",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.68,
		"gestation_sec": 15.0,
		"maturation_sec": 16.0,
		"min_population": 3,
		"base_hp": 62.0,
		"base_speed": 8.4,
		"base_damage": 9.5,
		"xp_reward": 28,
		"model_file": "res://assets/models/vulture.glb",
		"tint_color": Color(0.58, 0.36, 0.68),
	},
	"carrion_beetle": {
		"name_en": "Ironhide Troll",
		"name_fr": "Troll Cuirassé",
		"clade": "colossus",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.82,
		"gestation_sec": 26.0,
		"maturation_sec": 28.0,
		"min_population": 3,
		"base_hp": 135.0,
		"base_speed": 5.4,
		"base_damage": 16.0,
		"xp_reward": 42,
		"model_file": "res://assets/models/troll.glb",
		"tint_color": Color(0.38, 0.46, 0.36),
	},
	"abyssal_shark": {
		"name_en": "Amphibious Land-Shark",
		"name_fr": "Requin Amphibie",
		"clade": "aquatic",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.88,
		"gestation_sec": 20.0,
		"maturation_sec": 20.0,
		"min_population": 2,
		"base_hp": 115.0,
		"base_speed": 7.8,
		"base_damage": 14.5,
		"xp_reward": 38,
		"model_file": "res://assets/models/shark.glb",
		"tint_color": Color(0.18, 0.56, 0.78),
	},
	"tunnel_mole": {
		"name_en": "Subterranean Giant Mole",
		"name_fr": "Taupe Géante Fouisseuse",
		"clade": "subterranean",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.76,
		"gestation_sec": 19.0,
		"maturation_sec": 19.0,
		"min_population": 2,
		"base_hp": 108.0,
		"base_speed": 6.6,
		"base_damage": 13.5,
		"xp_reward": 36,
		"model_file": "res://assets/models/giant_mole.glb",
		"tint_color": Color(0.52, 0.36, 0.24),
	},
	"sovereign_dragon": {
		"name_en": "Sovereign Caldera Dragon",
		"name_fr": "Dragon Souverain de la Caldeira",
		"clade": "draconic",
		"is_prey": false,
		"is_peaceful_dragon": true,
		"aggression": 0.05,
		"gestation_sec": 58.0,
		"maturation_sec": 50.0,
		"min_population": 2,
		"base_hp": 320.0,
		"base_speed": 7.2,
		"base_damage": 28.0,
		"xp_reward": 95,
		"model_file": "res://assets/models/dragon.glb",
		"tint_color": Color(0.88, 0.22, 0.16),
	},
}

const CLASSIC_SPECIES_ALIASES: Dictionary = {
	"deer": "glimmer_elk",
	"rabbit": "meadow_hare",
	"goblin": "scavenger_goblin",
	"wolf": "forest_wolf",
	"vulture": "sky_harpy",
	"troll": "carrion_beetle",
	"orc": "carrion_beetle",
	"lion": "forest_wolf",
	"shark": "abyssal_shark",
	"giant_mole": "tunnel_mole",
	"dragon": "sovereign_dragon",
}

# --- Runtime Swarm State ---
var creatures: Array[Dictionary] = []
var next_creature_id: int = 1
var use_blender_models: bool = true
var frame_tick: int = 0
var elapsed_time: float = 0.0
var survival_elapsed: float = 0.0
var repopulate_timer: float = 0.0

var dragon_wrath_active: bool = false
var dragon_wrath_timer: float = 0.0
var sharks_landed: bool = false
var moles_erupted: bool = false

# --- External References (supporting both direct property names & _ref aliases) ---
var terrain_ref: Node = null
var ecosystem_ref: Node = null
var player_ref: Node = null
var audio_ref: Node = null
var model_loader_ref: RefCounted = null

var terrain: Node = null:
	set(v):
		terrain = v
		terrain_ref = v
var ecosystem: Node = null:
	set(v):
		ecosystem = v
		ecosystem_ref = v
var player: Node = null:
	set(v):
		player = v
		player_ref = v
var audio_director: Node = null:
	set(v):
		audio_director = v
		audio_ref = v
var model_loader: RefCounted = null:
	set(v):
		model_loader = v
		model_loader_ref = v

# --- Cached PackedScene Templates & Shared Materials ---
var _packed_cache: Dictionary = {}
var _shared_mat_cache: Dictionary = {}


func _ready() -> void:
	name = "EnemySwarmManager"


## Injects references to IslandTerrain, GeneticEcosystem, PlayerCharacter, AudioDirector, and ModelLoader.
func setup(
	p_terrain: Variant = null,
	p_ecosystem: Variant = null,
	p_player: Variant = null,
	p_fourth: Variant = null,
	p_fifth: Variant = null
) -> void:
	if p_terrain is Node:
		terrain = p_terrain
	if p_ecosystem is Node:
		ecosystem = p_ecosystem
	if p_player is Node:
		player = p_player
	if p_fourth is RefCounted:
		model_loader = p_fourth
	elif p_fourth is Node:
		audio_director = p_fourth
	if p_fifth is RefCounted:
		model_loader = p_fifth
	elif p_fifth is Node:
		audio_director = p_fifth
	if creatures.is_empty():
		spawn_initial_population(36)


static func resolve_species_id(raw_id: String) -> String:
	if SPECIES_DEFAULTS.has(raw_id):
		return raw_id
	if CLASSIC_SPECIES_ALIASES.has(raw_id):
		return String(CLASSIC_SPECIES_ALIASES[raw_id])
	return "scavenger_goblin"


## Spawns the initial balanced island population across all ecological niches, plus 1 Mutant Patient Zero.
func spawn_initial_population(count: int = 36) -> void:
	clear_all_creatures()

	var initial_distribution: Array[Dictionary] = [
		{ "id": "glimmer_elk", "count": 4, "min_r": 32.0, "max_r": 68.0 },
		{ "id": "meadow_hare", "count": 5, "min_r": 26.0, "max_r": 62.0 },
		{ "id": "beach_crab", "count": 3, "min_r": 76.0, "max_r": 96.0 },
		{ "id": "scavenger_goblin", "count": 6, "min_r": 42.0, "max_r": 74.0 },
		{ "id": "forest_wolf", "count": 5, "min_r": 46.0, "max_r": 78.0 },
		{ "id": "sky_harpy", "count": 4, "min_r": 54.0, "max_r": 84.0 },
		{ "id": "carrion_beetle", "count": 4, "min_r": 58.0, "max_r": 86.0 },
		{ "id": "sovereign_dragon", "count": 2, "min_r": 74.0, "max_r": 94.0 },
		{ "id": "abyssal_shark", "count": 3, "min_r": 88.0, "max_r": 100.0, "is_aquatic": true },
	]

	var spawned := 0
	var patient_zero_seeded := false

	for group in initial_distribution:
		var sp_id := String(group.get("id", "scavenger_goblin"))
		var group_count := int(group.get("count", 3))
		var min_r := float(group.get("min_r", 40.0))
		var max_r := float(group.get("max_r", 80.0))
		var is_aq := bool(group.get("is_aquatic", false))

		for i in range(group_count):
			if spawned >= count and patient_zero_seeded:
				break
			var angle := (float(spawned) * 0.6180339887 * TAU) + randf_range(-0.2, 0.2)
			var dist := randf_range(min_r, max_r)
			var pos := Vector3(cos(angle) * dist, 1.5, sin(angle) * dist)
			var opts := {
				"is_aquatic": is_aq,
				"is_adult": true,
			}
			if sp_id == "carrion_beetle" and not patient_zero_seeded:
				opts["is_patient_zero"] = true
				opts["mutation_id"] = "pyro_gland"
				opts["spotted_by_scout"] = true
				patient_zero_seeded = true
			spawn_creature(sp_id, pos, {}, opts)
			spawned += 1


## Spawns a single creature with diploid genetic traits, 3D Blender (.glb) + Procedural meshes, and AI state.
func spawn_creature(
	raw_species_id: String,
	world_pos: Vector3,
	genome: Dictionary = {},
	options: Dictionary = {}
) -> Dictionary:
	var species_id := resolve_species_id(raw_species_id)
	var spec: Dictionary = SPECIES_DEFAULTS.get(species_id, SPECIES_DEFAULTS["scavenger_goblin"])

	var speed_gene := float(genome.get("speed_gene", randf_range(0.92, 1.10)))
	var hp_gene := float(genome.get("hp_gene", randf_range(0.92, 1.12)))
	var strength_gene := float(genome.get("strength_gene", randf_range(0.92, 1.12)))
	var size_gene := float(genome.get("size_gene", randf_range(0.92, 1.10)))
	var aggression_score := float(genome.get("aggression_score", spec.get("aggression", 0.7)))

	var is_patient_zero := bool(options.get("is_patient_zero", false))
	var mutation_id := String(options.get("mutation_id", genome.get("mutation_id", "")))
	if is_patient_zero and mutation_id.is_empty():
		mutation_id = "pyro_gland"
	var is_mutant := is_patient_zero or not mutation_id.is_empty()

	var is_adult := bool(options.get("is_adult", true))
	var is_prey := bool(spec.get("is_prey", false))
	var is_peaceful_dragon := bool(spec.get("is_peaceful_dragon", false))
	var is_aquatic := bool(options.get("is_aquatic", false))
	var enraged := bool(options.get("enraged", dragon_wrath_active and is_peaceful_dragon))

	var mut_hp_mult := 1.25 if is_mutant else 1.0
	var mut_dmg_mult := 1.22 if is_mutant else 1.0
	var baby_mult := 1.0 if is_adult else 0.55

	var max_hp := maxf(14.0, float(spec.get("base_hp", 60.0)) * hp_gene * mut_hp_mult * baby_mult)
	var damage := 0.0 if is_prey else float(spec.get("base_damage", 10.0)) * strength_gene * mut_dmg_mult * baby_mult
	var speed := float(spec.get("base_speed", 6.8)) * speed_gene * (1.25 if enraged else 1.0)
	var adult_scale := clampf(size_gene * (1.22 if is_mutant else 1.0), 0.7, 1.85)

	var ground_y := _sample_ground_y(world_pos.x, world_pos.z, is_aquatic)
	var spawn_pos := Vector3(world_pos.x, ground_y, world_pos.z)

	var c_id := next_creature_id
	next_creature_id += 1

	var root_node := Node3D.new()
	root_node.name = "Creature_%d_%s" % [c_id, species_id]
	root_node.position = spawn_pos
	var current_scale := adult_scale * (1.0 if is_adult else 0.55)
	root_node.scale = Vector3.ONE * current_scale

	var blender_node := _instantiate_blender_species_mesh(species_id, spec)
	var proc_node := _create_procedural_species_mesh(species_id, spec, is_mutant)
	root_node.add_child(proc_node)
	if blender_node != null:
		root_node.add_child(blender_node)
		blender_node.visible = use_blender_models
		proc_node.visible = not use_blender_models
	else:
		proc_node.visible = true

	# Floating mutant / Patient Zero beacon crystal overhead
	if is_mutant:
		var beacon := MeshInstance3D.new()
		var oct := SphereMesh.new()
		oct.radius = 0.24
		oct.height = 0.48
		oct.radial_segments = 6
		oct.rings = 4
		beacon.mesh = oct
		beacon.material_override = _get_shared_material("mutant_beacon", Color(1.0, 0.28, 0.08), true)
		beacon.position = Vector3(0.0, 2.35, 0.0)
		root_node.add_child(beacon)

	add_child(root_node)

	var creature := {
		"id": c_id,
		"species_id": species_id,
		"name_en": String(spec.get("name_en", species_id)),
		"name_fr": String(spec.get("name_fr", species_id)),
		"clade": String(spec.get("clade", "beast")),
		"position": spawn_pos,
		"x": spawn_pos.x,
		"z": spawn_pos.z,
		"velocity": Vector3.ZERO,
		"home_pos": spawn_pos,
		"hp": max_hp,
		"max_hp": max_hp,
		"adult_max_hp": float(spec.get("base_hp", 60.0)) * hp_gene * mut_hp_mult,
		"damage": damage,
		"adult_damage": 0.0 if is_prey else float(spec.get("base_damage", 10.0)) * strength_gene * mut_dmg_mult,
		"speed": speed,
		"xp_reward": int(spec.get("xp_reward", 22)) * (2 if is_mutant else 1),
		"is_prey": is_prey,
		"is_peaceful_dragon": is_peaceful_dragon,
		"is_aquatic": is_aquatic,
		"enraged": enraged,
		"is_adult": is_adult,
		"age": float(spec.get("maturation_sec", 15.0)) if is_adult else 0.0,
		"maturation_sec": float(spec.get("maturation_sec", 15.0)),
		"gestation_sec": float(spec.get("gestation_sec", 15.0)),
		"repro_timer": randf_range(1.5, float(spec.get("gestation_sec", 15.0)) * 0.65) if is_adult else 0.0,
		"adult_scale": adult_scale,
		"is_mutant": is_mutant,
		"is_patient_zero": is_patient_zero,
		"mutation_id": mutation_id,
		"spotted_by_scout": bool(options.get("spotted_by_scout", is_patient_zero)),
		"genome": {
			"speed_gene": speed_gene,
			"hp_gene": hp_gene,
			"strength_gene": strength_gene,
			"size_gene": size_gene,
			"aggression_score": aggression_score,
			"mutation_id": mutation_id,
		},
		"state": "graze" if is_prey else ("swim" if is_aquatic else ("wrath_raid" if enraged else "patrol")),
		"wander_angle": randf() * TAU,
		"wander_timer": randf_range(1.5, 4.0),
		"attack_cooldown": 0.0,
		"slow_timer": 0.0,
		"burn_timer": 0.0,
		"poison_timer": 0.0,
		"flee_timer": randf_range(0.0, 0.25),
		"cached_flee_angle": 0.0,
		"cached_threat_count": 0,
		"node": root_node,
		"blender_node": blender_node,
		"proc_node": proc_node,
	}

	creatures.append(creature)
	emit_signal("creature_spawned", creature)
	if is_patient_zero:
		emit_signal("patient_zero_spotted", species_id, spawn_pos)
	return creature


## Alias for compatibility with scripts calling `spawn_enemy`.
func spawn_enemy(raw_species_id: String, world_pos: Vector3, genome: Dictionary = {}, options: Dictionary = {}) -> Dictionary:
	return spawn_creature(raw_species_id, world_pos, genome, options)


## Spawns a Mutant Patient Zero carrier for testing or Eco-Lab events.
func force_spawn_mutant(species_id: String = "carrion_beetle", mutation_id: String = "pyro_gland") -> Dictionary:
	var angle := randf() * TAU
	var pos := Vector3(cos(angle) * 58.0, 2.0, sin(angle) * 58.0)
	return spawn_creature(species_id, pos, {}, {
		"is_patient_zero": true,
		"mutation_id": mutation_id,
		"spotted_by_scout": true,
	})


## Progressive Emergence Event 1: Amphibious Land-Sharks storming the beaches (`~40s`).
func trigger_shark_landing(count: int = 3) -> Array:
	sharks_landed = true
	var landed: Array = []
	for c in creatures:
		if String(c.get("species_id", "")) == "abyssal_shark" and bool(c.get("is_aquatic", false)):
			c["is_aquatic"] = false
			c["state"] = "chase"
			landed.append(c)
	while landed.size() < count:
		var angle := randf() * TAU
		var pos := Vector3(cos(angle) * 68.0, 1.5, sin(angle) * 68.0)
		var sc := spawn_creature("abyssal_shark", pos, {}, { "is_aquatic": false })
		landed.append(sc)
	emit_signal("shark_landing_triggered", landed.size())
	return landed


## Progressive Emergence Event 2: Subterranean Giant Moles erupting inland (`~65s`).
func trigger_mole_eruption(count: int = 3) -> Array:
	moles_erupted = true
	var spawned: Array = []
	for i in range(count):
		var angle := randf() * TAU
		var dist := randf_range(36.0, 66.0)
		var pos := Vector3(cos(angle) * dist, 2.0, sin(angle) * dist)
		spawned.append(spawn_creature("tunnel_mole", pos, {}, { "is_adult": true }))
	emit_signal("mole_eruption_triggered", spawned.size())
	return spawned


## Provokes all Sovereign Dragons on the island into collective Dragon Wrath!
func provoke_dragon_species() -> void:
	var was_active := dragon_wrath_active
	dragon_wrath_active = true
	dragon_wrath_timer = 45.0
	if ecosystem_ref != null and ecosystem_ref.has_method("provoke_dragon_species"):
		ecosystem_ref.call("provoke_dragon_species")
	for c in creatures:
		if bool(c.get("is_peaceful_dragon", false)):
			c["enraged"] = true
			c["state"] = "wrath_raid"
			c["speed"] = float(SPECIES_DEFAULTS["sovereign_dragon"]["base_speed"]) * 1.3
	if not was_active:
		if audio_ref != null and audio_ref.has_method("play_sfx"):
			audio_ref.call("play_sfx", "dragon_roar")
		emit_signal("dragon_provoked")
		emit_signal("dragon_wrath_triggered", "Sovereign Caldera Dragon")


func _process(delta: float) -> void:
	elapsed_time += delta
	survival_elapsed += delta
	frame_tick = (frame_tick + 1) & 0x7fffffff

	if not sharks_landed and survival_elapsed >= 40.0:
		trigger_shark_landing(3)
	if not moles_erupted and survival_elapsed >= 65.0:
		trigger_mole_eruption(3)

	if dragon_wrath_active:
		dragon_wrath_timer = maxf(0.0, dragon_wrath_timer - delta)
		if dragon_wrath_timer <= 0.0:
			dragon_wrath_active = false
			for c in creatures:
				if bool(c.get("is_peaceful_dragon", false)):
					c["enraged"] = false
					c["state"] = "patrol"

	# Extinction Protection & Refuge Re-Immigration check every 6.0s
	repopulate_timer += delta
	if repopulate_timer >= 6.0:
		repopulate_timer = 0.0
		_check_species_refuge_repopulation()

	var player_pos := Vector3.ZERO
	if player_ref != null and player_ref is Node3D:
		player_pos = (player_ref as Node3D).global_position

	for i in range(creatures.size() - 1, -1, -1):
		var c: Dictionary = creatures[i]
		var pos: Vector3 = c.get("position", Vector3.ZERO)
		var d_player := pos.distance_to(player_pos)

		# 1. Status Effects (Burn, Poison, Slow)
		var burn_t := float(c.get("burn_timer", 0.0))
		var poison_t := float(c.get("poison_timer", 0.0))
		if burn_t > 0.0 or poison_t > 0.0:
			c["burn_timer"] = maxf(0.0, burn_t - delta)
			c["poison_timer"] = maxf(0.0, poison_t - delta)
			var dot_dmg := (10.0 if burn_t > 0.0 else 0.0) + (8.0 if poison_t > 0.0 else 0.0)
			c["hp"] = float(c.get("hp", 10.0)) - dot_dmg * delta
			if float(c["hp"]) <= 0.0:
				_kill_creature_at_index(i, true)
				continue

		var slow_t := float(c.get("slow_timer", 0.0))
		if slow_t > 0.0:
			c["slow_timer"] = maxf(0.0, slow_t - delta)
		var slow_mult := 0.55 if slow_t > 0.0 else 1.0

		# 2. Juvenile-to-Adult Maturation & Individual Gestation Breeding
		var is_adult := bool(c.get("is_adult", true))
		if not is_adult:
			var age := float(c.get("age", 0.0)) + delta
			var mat_sec := maxf(5.0, float(c.get("maturation_sec", 15.0)))
			c["age"] = age
			if age >= mat_sec:
				c["is_adult"] = true
				is_adult = true
				c["max_hp"] = float(c.get("adult_max_hp", 60.0))
				c["hp"] = float(c["max_hp"])
				c["damage"] = float(c.get("adult_damage", 10.0))
		elif creatures.size() < 78 and not bool(c.get("is_aquatic", false)):
			var repro_t := float(c.get("repro_timer", 0.0)) + delta
			var gest_sec := maxf(4.0, float(c.get("gestation_sec", 16.0)))
			c["repro_timer"] = repro_t
			if repro_t >= gest_sec:
				c["repro_timer"] = 0.0
				_try_gestation_birth(c)

		# 3. AI Movement & Combat Behavior
		c["attack_cooldown"] = maxf(0.0, float(c.get("attack_cooldown", 0.0)) - delta)
		var move_speed := float(c.get("speed", 6.5)) * slow_mult
		var vel := Vector3.ZERO
		var is_prey := bool(c.get("is_prey", false))
		var is_peaceful_dragon := bool(c.get("is_peaceful_dragon", false))
		var enraged := bool(c.get("enraged", false))

		if bool(c.get("is_aquatic", false)):
			var angle := atan2(pos.z, pos.x) + (move_speed * 0.012) * delta
			var rad := 92.0 + sin(elapsed_time * 0.8 + float(i)) * 3.5
			var next_pos := Vector3(cos(angle) * rad, -0.35, sin(angle) * rad)
			vel = (next_pos - pos) / maxf(delta, 0.016)
			pos = next_pos
		elif is_prey:
			# Throttled Herbivore Threat Scan (every 0.25s for 60 FPS performance)
			var f_timer := float(c.get("flee_timer", 0.0)) - delta
			if f_timer <= 0.0:
				f_timer = 0.25
				var threats := 0
				var flee_vec := Vector2.ZERO
				if d_player <= 11.0:
					flee_vec += Vector2(pos.x - player_pos.x, pos.z - player_pos.z).normalized()
					threats += 1
				c["cached_threat_count"] = threats
				if threats > 0:
					c["cached_flee_angle"] = atan2(flee_vec.y, flee_vec.x)
			c["flee_timer"] = f_timer

			if int(c.get("cached_threat_count", 0)) > 0:
				var fa := float(c.get("cached_flee_angle", 0.0))
				vel = Vector3(cos(fa), 0.0, sin(fa)) * (move_speed * 1.15)
			else:
				vel = _step_wander(c, pos, move_speed * 0.38, delta)
			pos += vel * delta
		elif is_peaceful_dragon and not enraged:
			# Peaceful Sovereign Dragon glides majestically around caldera unless provoked
			vel = _step_wander(c, pos, move_speed * 0.45, delta)
			pos += vel * delta
		else:
			# Hostile Creature or Enraged Dragon
			var aggro_range := 42.0 if enraged else 20.0
			if d_player <= aggro_range and player_ref != null:
				if d_player <= 2.6:
					vel = Vector3.ZERO
					if float(c.get("attack_cooldown", 0.0)) <= 0.0:
						c["attack_cooldown"] = 1.25
						if player_ref.has_method("take_damage"):
							var is_elem := is_peaceful_dragon or String(c.get("mutation_id", "")) == "pyro_gland"
							player_ref.call("take_damage", float(c.get("damage", 8.0)), String(c.get("name_en", "Monster")), is_elem)
				else:
					var dir := (player_pos - pos).normalized()
					vel = Vector3(dir.x, 0.0, dir.z) * move_speed
			else:
				vel = _step_wander(c, pos, move_speed * 0.48, delta)
			pos += vel * delta

		if not bool(c.get("is_aquatic", false)):
			pos.x = clampf(pos.x, -108.0, 108.0)
			pos.z = clampf(pos.z, -108.0, 108.0)
			# Keep wild patrolling creatures outside the central Sanctuary ring unless chasing
			var dist_bastion := Vector2(pos.x, pos.z).length()
			if dist_bastion < 13.5 and not enraged and d_player > 16.0:
				var push := Vector2(pos.x, pos.z).normalized()
				pos.x = push.x * 14.0
				pos.z = push.y * 14.0
			pos.y = _sample_ground_y(pos.x, pos.z, false)

		c["position"] = pos
		c["x"] = pos.x
		c["z"] = pos.z
		c["velocity"] = vel

		# 4. Sync 3D Node with Phase 12 Distance Culling (> 95m) & 4x Animation LOD (> 48m)
		var node: Node3D = c.get("node")
		if node != null and is_instance_valid(node):
			node.position = pos
			var spotted := bool(c.get("spotted_by_scout", false)) or bool(c.get("is_patient_zero", false))
			if d_player > 95.0 and not spotted:
				node.visible = false
			else:
				node.visible = true
				if vel.length_squared() > 0.05:
					node.rotation.y = atan2(vel.x, vel.z)
				var should_animate := (d_player <= 48.0) or (((i + frame_tick) & 3) == 0)
				if should_animate:
					var growth := 1.0 if is_adult else clampf(float(c.get("age", 0.0)) / maxf(1.0, float(c.get("maturation_sec", 15.0))), 0.0, 1.0)
					var cur_scale := float(c.get("adult_scale", 1.0)) * (1.0 if is_adult else lerpf(0.55, 1.0, growth))
					var bob := absf(sin(elapsed_time * 5.5 + float(i))) * 0.06 if vel.length_squared() > 0.1 else 0.0
					node.scale = Vector3(cur_scale, cur_scale + bob, cur_scale)


func _step_wander(c: Dictionary, pos: Vector3, speed: float, delta: float) -> Vector3:
	var w_timer := float(c.get("wander_timer", 0.0)) - delta
	var w_angle := float(c.get("wander_angle", 0.0))
	if w_timer <= 0.0:
		w_timer = randf_range(2.0, 4.2)
		var home: Vector3 = c.get("home_pos", pos)
		if pos.distance_to(home) > 22.0:
			w_angle = atan2(home.z - pos.z, home.x - pos.x) + randf_range(-0.4, 0.4)
		else:
			w_angle += randf_range(-1.2, 1.2)
	c["wander_timer"] = w_timer
	c["wander_angle"] = w_angle
	return Vector3(cos(w_angle) * speed, 0.0, sin(w_angle) * speed)


func _try_gestation_birth(parent_a: Dictionary) -> void:
	var sp_id := String(parent_a.get("species_id", "scavenger_goblin"))
	var pos_a: Vector3 = parent_a.get("position", Vector3.ZERO)
	for other in creatures:
		if int(other.get("id", -1)) == int(parent_a.get("id", -2)):
			continue
		if not bool(other.get("is_adult", false)):
			continue
		if String(other.get("species_id", "")) == sp_id:
			var d := pos_a.distance_to(other.get("position", Vector3.ZERO))
			if d <= 24.0:
				var g_a: Dictionary = parent_a.get("genome", {})
				var g_b: Dictionary = other.get("genome", {})
				var child_genome := {
					"speed_gene": lerpf(float(g_a.get("speed_gene", 1.0)), float(g_b.get("speed_gene", 1.0)), randf()) * randf_range(0.90, 1.10),
					"hp_gene": lerpf(float(g_a.get("hp_gene", 1.0)), float(g_b.get("hp_gene", 1.0)), randf()) * randf_range(0.90, 1.10),
					"strength_gene": lerpf(float(g_a.get("strength_gene", 1.0)), float(g_b.get("strength_gene", 1.0)), randf()) * randf_range(0.90, 1.10),
					"size_gene": lerpf(float(g_a.get("size_gene", 1.0)), float(g_b.get("size_gene", 1.0)), randf()) * randf_range(0.90, 1.10),
					"mutation_id": String(parent_a.get("mutation_id", other.get("mutation_id", ""))),
				}
				var offset := Vector3(randf_range(-2.5, 2.5), 0.0, randf_range(-2.5, 2.5))
				spawn_creature(sp_id, (pos_a + Vector3(other.get("position", pos_a))) * 0.5 + offset, child_genome, {
					"is_adult": false,
					"mutation_id": String(child_genome["mutation_id"]),
				})
				return


func _check_species_refuge_repopulation() -> void:
	if creatures.size() >= 76:
		return
	var counts: Dictionary = {}
	for sp_id in SPECIES_DEFAULTS.keys():
		counts[sp_id] = 0
	for c in creatures:
		var sp_id := String(c.get("species_id", ""))
		counts[sp_id] = int(counts.get(sp_id, 0)) + 1

	for sp_id in SPECIES_DEFAULTS.keys():
		var spec: Dictionary = SPECIES_DEFAULTS[sp_id]
		if bool(spec.get("is_prey", false)):
			continue # Herbivore prey can go extinct if over-hunted!
		if sp_id == "abyssal_shark" and not sharks_landed:
			continue
		if sp_id == "tunnel_mole" and not moles_erupted:
			continue
		var min_pop := int(spec.get("min_population", 2))
		if int(counts.get(sp_id, 0)) < min_pop:
			var angle := randf() * TAU
			var dist := randf_range(58.0, 88.0)
			spawn_creature(sp_id, Vector3(cos(angle) * dist, 2.0, sin(angle) * dist), {}, { "is_adult": true })
			break


## Damages a specific creature by ID, handling Peaceful Dragon provocation and Herbivore Prey rewards.
func damage_creature(
	creature_id: int,
	amount: float,
	attacker_is_player: bool = true,
	_is_spell: bool = false,
	knockback_dir: Vector3 = Vector3.ZERO
) -> Dictionary:
	for i in range(creatures.size() - 1, -1, -1):
		var c: Dictionary = creatures[i]
		if int(c.get("id", -1)) == creature_id:
			if bool(c.get("is_peaceful_dragon", false)) and attacker_is_player:
				provoke_dragon_species()

			var final_dmg := amount
			if attacker_is_player and player_ref != null and player_ref.has_method("get_total_damage_against"):
				final_dmg = float(player_ref.call("get_total_damage_against", amount, c))

			c["hp"] = float(c.get("hp", 10.0)) - final_dmg
			if knockback_dir.length_squared() > 0.01:
				var p: Vector3 = c.get("position", Vector3.ZERO) + knockback_dir.normalized() * 1.1
				p.y = _sample_ground_y(p.x, p.z, bool(c.get("is_aquatic", false)))
				c["position"] = p
				c["x"] = p.x
				c["z"] = p.z

			if float(c["hp"]) <= 0.0:
				var killed_info := _kill_creature_at_index(i, attacker_is_player)
				return { "killed": true, "damage": final_dmg, "creature": killed_info }
			return { "killed": false, "damage": final_dmg, "creature": c }
	return { "killed": false, "damage": 0.0 }


func damage_enemy(creature_id: int, amount: float) -> Dictionary:
	return damage_creature(creature_id, amount, true)


## Damages all creatures within `radius` of `center` (respecting `spares_herbivores` for Emerald Scythe).
func damage_creatures_in_radius(
	center: Vector3,
	radius: float,
	damage: float,
	spares_herbivores: bool = false,
	status_effect: String = ""
) -> int:
	var hits := 0
	for i in range(creatures.size() - 1, -1, -1):
		if i >= creatures.size():
			continue
		var c: Dictionary = creatures[i]
		if spares_herbivores and bool(c.get("is_prey", false)):
			continue
		var pos: Vector3 = c.get("position", Vector3.ZERO)
		if pos.distance_to(center) <= radius:
			if status_effect == "slow":
				c["slow_timer"] = 3.5
			elif status_effect == "burn":
				c["burn_timer"] = 4.0
			elif status_effect == "poison":
				c["poison_timer"] = 4.5
			var kb := (pos - center).normalized()
			damage_creature(int(c.get("id", -1)), damage, true, false, kb)
			hits += 1
	return hits


## Adapter called by `MainGame._on_player_spell_cast(spell_id, origin, radius, damage)`.
func apply_aoe_spell_damage(spell_id: String, origin: Vector3, radius: float, damage: float) -> int:
	var status := ""
	if spell_id.find("frost") >= 0:
		status = "slow"
	elif spell_id.find("flame") >= 0 or spell_id.find("pyro") >= 0:
		status = "burn"
	elif spell_id.find("nature") >= 0 or spell_id.find("venom") >= 0:
		status = "poison"
	var spares_prey := (spell_id == "nature_thorns")
	if player_ref != null and "equipped_weapon" in player_ref and String(player_ref.get("equipped_weapon")) == "emerald_scythe":
		spares_prey = true
	return damage_creatures_in_radius(origin, radius, damage, spares_prey, status)


func _kill_creature_at_index(index: int, by_player: bool) -> Dictionary:
	var c: Dictionary = creatures[index]
	var node: Node3D = c.get("node")
	if node != null and is_instance_valid(node):
		node.queue_free()
	creatures.remove_at(index)

	var sp_id := String(c.get("species_id", "scavenger_goblin"))
	var is_mut := bool(c.get("is_mutant", false))
	var mut_id := String(c.get("mutation_id", ""))

	if by_player and player_ref != null:
		if bool(c.get("is_prey", false)):
			if "resources" in player_ref:
				player_ref.resources["food"] = mini(150, int(player_ref.resources.get("food", 80)) + 25)
				if player_ref.has_method("_sync_resource_fields"):
					player_ref.call("_sync_resource_fields")
			if "hp" in player_ref and "max_hp" in player_ref:
				player_ref.hp = minf(float(player_ref.max_hp), float(player_ref.hp) + 18.0)
		if player_ref.has_method("record_kill"):
			player_ref.call("record_kill", sp_id, int(c.get("xp_reward", 22)), is_mut, mut_id)

	if is_mut:
		var remaining_mutants := 0
		for other in creatures:
			if bool(other.get("is_mutant", false)):
				remaining_mutants += 1
		if remaining_mutants == 0:
			emit_signal("lineage_eradicated", mut_id if not mut_id.is_empty() else sp_id)

	emit_signal("creature_killed", sp_id, is_mut)
	return c


func find_nearest_hostile(
	origin: Vector3,
	max_range: float = 50.0,
	include_peaceful_dragon: bool = false,
	include_prey: bool = false
) -> Dictionary:
	var best: Dictionary = {}
	var best_dist := max_range
	for c in creatures:
		if not include_prey and bool(c.get("is_prey", false)):
			continue
		if not include_peaceful_dragon and bool(c.get("is_peaceful_dragon", false)) and not bool(c.get("enraged", false)):
			continue
		if bool(c.get("is_aquatic", false)):
			continue
		var d := origin.distance_to(c.get("position", origin))
		if d <= best_dist:
			best_dist = d
			best = c
	return best


func find_nearest_creature(origin: Vector3, max_range: float = 30.0) -> Dictionary:
	var best: Dictionary = {}
	var best_dist := max_range
	for c in creatures:
		var d := origin.distance_to(c.get("position", origin))
		if d <= best_dist:
			best_dist = d
			best = c
	return best


## Switches all live creatures between Blender 5.0 (.glb) and Procedural 3D meshes (`[J]`).
func set_model_mode(use_blender: bool) -> void:
	use_blender_models = use_blender
	for c in creatures:
		var b_node: Node3D = c.get("blender_node")
		var p_node: Node3D = c.get("proc_node")
		if b_node != null and p_node != null and is_instance_valid(b_node) and is_instance_valid(p_node):
			b_node.visible = use_blender_models
			p_node.visible = not use_blender_models


func refresh_models(use_blender: bool) -> void:
	set_model_mode(use_blender)


func toggle_model_mode() -> bool:
	set_model_mode(not use_blender_models)
	return use_blender_models


func get_active_enemy_count() -> int:
	return creatures.size()


func get_enemies() -> Array:
	return creatures


func get_creatures() -> Array:
	return creatures


func get_population_summary(lang: String = "en") -> Dictionary:
	var is_fr := (lang == "fr")
	var total := creatures.size()
	var adults := 0
	var babies := 0
	var mutants := 0
	var prey_count := 0
	var by_species: Dictionary = {}

	for c in creatures:
		if bool(c.get("is_adult", true)):
			adults += 1
		else:
			babies += 1
		if bool(c.get("is_mutant", false)):
			mutants += 1
		if bool(c.get("is_prey", false)):
			prey_count += 1
		var sp_id := String(c.get("species_id", "scavenger_goblin"))
		by_species[sp_id] = int(by_species.get(sp_id, 0)) + 1

	return {
		"total": total,
		"adults": adults,
		"babies": babies,
		"mutants": mutants,
		"prey_count": prey_count,
		"dragon_wrath_active": dragon_wrath_active,
		"sharks_landed": sharks_landed,
		"moles_erupted": moles_erupted,
		"by_species": by_species,
		"status_label": ("Population : %d (%d Ad / %d Bb)" % [total, adults, babies]) if is_fr else ("Population: %d (%d Ad / %d Bb)" % [total, adults, babies]),
	}


func clear_all_creatures() -> void:
	for c in creatures:
		var node: Node3D = c.get("node")
		if node != null and is_instance_valid(node):
			node.queue_free()
	creatures.clear()


func reset_swarm() -> void:
	reset_for_new_run()


func spawn_island_wave(island_level: int = 1) -> void:
	var wave_size := clampi(34 + island_level * 4, 36, 68)
	spawn_initial_population(wave_size)


func reset_for_new_run() -> void:
	dragon_wrath_active = false
	dragon_wrath_timer = 0.0
	sharks_landed = false
	moles_erupted = false
	survival_elapsed = 0.0
	spawn_initial_population(36)


func _sample_ground_y(x: float, z: float, is_aquatic: bool) -> float:
	if is_aquatic:
		return -0.35
	if terrain_ref != null and terrain_ref.has_method("get_height_at"):
		return maxf(0.15, float(terrain_ref.call("get_height_at", x, z)))
	return 1.2


func _instantiate_blender_species_mesh(species_id: String, spec: Dictionary) -> Node3D:
	if DisplayServer.get_name() == "headless":
		return null
	var model_path := String(spec.get("model_file", "res://assets/models/goblin.glb"))
	if not _packed_cache.has(model_path):
		if ResourceLoader.exists(model_path):
			_packed_cache[model_path] = load(model_path)
		else:
			_packed_cache[model_path] = null
	var packed: PackedScene = _packed_cache.get(model_path) as PackedScene
	if packed != null:
		var inst := packed.instantiate()
		if inst is Node3D:
			inst.name = "BlenderMesh_" + species_id
			return inst as Node3D
	return null


func _create_procedural_species_mesh(species_id: String, spec: Dictionary, is_mutant: bool) -> Node3D:
	var root := Node3D.new()
	root.name = "ProceduralMesh_" + species_id

	var base_col: Color = spec.get("tint_color", Color(0.45, 0.65, 0.35))
	var mat_key := "%s_%d" % [species_id, 1 if is_mutant else 0]
	var body_mat := _get_shared_material(mat_key, base_col.lightened(0.15) if is_mutant else base_col, is_mutant)

	var body := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.42
	capsule.height = 1.25
	capsule.radial_segments = 8
	capsule.rings = 4
	body.mesh = capsule
	body.material_override = body_mat
	body.position = Vector3(0.0, 0.72, 0.0)
	root.add_child(body)

	var head := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.28
	sphere.height = 0.56
	sphere.radial_segments = 8
	sphere.rings = 4
	head.mesh = sphere
	head.material_override = body_mat
	head.position = Vector3(0.0, 1.42, 0.22)
	root.add_child(head)

	return root


func _get_shared_material(key: String, color: Color, emissive: bool = false) -> StandardMaterial3D:
	if _shared_mat_cache.has(key):
		return _shared_mat_cache[key] as StandardMaterial3D
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.55
	if emissive:
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = 1.6
	_shared_mat_cache[key] = mat
	return mat
