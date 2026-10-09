## scripts/world/IslandTerrain.gd
## 3D Island Terrain ArrayMesh Generator, O(1) 257x257 Bilinear Heightmap & Biome Cache,
## Animated Ocean Plane, Bastion Sanctuary, Harvestable Resource Nodes (Wood/Stone/Crystal),
## Survivor Cages, 3 Ancient Relic Monoliths (`relic_monolith.glb`), Elemental Weapon Shrines,
## and 3D MultiMesh Conway Automaton Overlay for Genesis Bastion (Godot 4.3 Engine Edition).
class_name IslandTerrain
extends Node3D

signal resource_harvested(resource_type: String, amount: int, world_pos: Vector3)
signal survivor_rescued(cage_id: String, role: String, world_pos: Vector3)
signal relic_claimed(monolith_id: String, total_claimed: int, world_pos: Vector3)
signal weapon_shrine_activated(weapon_id: String, world_pos: Vector3)

const WORLD_SIZE: float = 270.0
const ISLAND_RADIUS: float = 135.0
const WATER_LEVEL: float = -1.2
const SANCTUARY_RADIUS: float = 18.0
const MESH_SEGMENTS: int = 96
const HEIGHT_RES: int = 257
const BIOME_RES: int = 129
const CONWAY_SIZE: int = 32

## O(1) precomputed 257x257 height grid (`PackedFloat32Array`) and 129x129 biome grid (`PackedStringArray`).
var _height_grid: PackedFloat32Array = PackedFloat32Array()
var _biome_grid: PackedStringArray = PackedStringArray()
var _noise_primary: FastNoiseLite = FastNoiseLite.new()
var _noise_detail: FastNoiseLite = FastNoiseLite.new()
var _noise_biome: FastNoiseLite = FastNoiseLite.new()
var _caches_built: bool = false

## External reference to ModelLoader
var model_loader: RefCounted = null

## Scene visual nodes
var terrain_mesh_instance: MeshInstance3D = null
var ocean_mesh_instance: MeshInstance3D = null
var sanctuary_root: Node3D = null
var shield_dome_mesh: MeshInstance3D = null
var buildings_root: Node3D = null
var props_root: Node3D = null
var conway_multimesh_instance: MultiMeshInstance3D = null
var conway_overlay_visible: bool = false

## Interactive world collections
var resource_nodes: Array[Dictionary] = []
var survivor_cages: Array[Dictionary] = []
var relic_monoliths: Array[Dictionary] = []
var weapon_shrines: Array[Dictionary] = []
var rescued_scouts: Array[Dictionary] = []
var constructed_buildings: Dictionary = {}

var _elapsed_time: float = 0.0


func _init() -> void:
	_configure_noise()
	_build_lookup_caches()


func _ready() -> void:
	if not _caches_built:
		_configure_noise()
		_build_lookup_caches()
	_build_island_mesh()
	_build_ocean_plane()
	_build_bastion_sanctuary()
	_populate_world_nodes()
	_build_conway_overlay()


func _process(delta: float) -> void:
	_elapsed_time += delta
	_animate_ocean_and_landmarks(delta)


## Configures deterministic FastNoiseLite generators for terrain elevation and biome temperature/moisture.
func _configure_noise() -> void:
	_noise_primary.seed = 1337
	_noise_primary.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_noise_primary.frequency = 0.012
	_noise_primary.fractal_type = FastNoiseLite.FRACTAL_FBM
	_noise_primary.fractal_octaves = 4

	_noise_detail.seed = 7331
	_noise_detail.noise_type = FastNoiseLite.TYPE_PERLIN
	_noise_detail.frequency = 0.038
	_noise_detail.fractal_type = FastNoiseLite.FRACTAL_FBM
	_noise_detail.fractal_octaves = 2

	_noise_biome.seed = 4242
	_noise_biome.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_noise_biome.frequency = 0.015


## Precomputes the 257x257 `PackedFloat32Array` height grid and 129x129 `PackedStringArray` biome grid.
func _build_lookup_caches() -> void:
	_height_grid.resize(HEIGHT_RES * HEIGHT_RES)
	var half: float = WORLD_SIZE * 0.5
	var step_h: float = WORLD_SIZE / float(HEIGHT_RES - 1)

	for iz in range(HEIGHT_RES):
		var wz: float = -half + float(iz) * step_h
		var row_offset: int = iz * HEIGHT_RES
		for ix in range(HEIGHT_RES):
			var wx: float = -half + float(ix) * step_h
			_height_grid[row_offset + ix] = _compute_analytical_height_at(wx, wz)

	_caches_built = true

	_biome_grid.resize(BIOME_RES * BIOME_RES)
	var step_b: float = WORLD_SIZE / float(BIOME_RES - 1)
	for iz in range(BIOME_RES):
		var wz: float = -half + float(iz) * step_b
		var row_offset: int = iz * BIOME_RES
		for ix in range(BIOME_RES):
			var wx: float = -half + float(ix) * step_b
			_biome_grid[row_offset + ix] = _compute_analytical_biome_at(wx, wz)


## Analytical island height function used once at startup to populate `_height_grid`.
func _compute_analytical_height_at(x: float, z: float) -> float:
	var dist: float = sqrt(x * x + z * z)
	var norm_r: float = dist / ISLAND_RADIUS
	if norm_r >= 1.18:
		return -5.5

	# Smooth central Sanctuary plateau around (0, 0)
	var sanctuary_blend: float = smoothstep(SANCTUARY_RADIUS * 0.65, SANCTUARY_RADIUS * 1.45, dist)

	# Radial island falloff towards shoreline and seabed
	var radial_falloff: float = clampf(1.0 - pow(norm_r, 2.15), -0.65, 1.0)
	var n_main: float = _noise_primary.get_noise_2d(x, z) * 0.5 + 0.5
	var n_det: float = _noise_detail.get_noise_2d(x, z)

	# Volcanic caldera ridge in the northern/northeastern sector
	var ridge_factor: float = smoothstep(0.38, 0.78, norm_r) * (1.0 - smoothstep(0.78, 1.02, norm_r))
	var raw_height: float = -2.2 + radial_falloff * (4.2 + n_main * 8.5 + n_det * 1.8) + ridge_factor * 4.6

	# Flatten central Bastion plateau to y = 3.2m
	var plateau_height: float = 3.2 + n_det * 0.12
	var final_h: float = lerpf(plateau_height, raw_height, sanctuary_blend)
	return clampf(final_h, -5.5, 18.5)


## Analytical biome classifier used once at startup to populate `_biome_grid`.
func _compute_analytical_biome_at(x: float, z: float) -> String:
	var dist: float = sqrt(x * x + z * z)
	if dist <= SANCTUARY_RADIUS * 1.15:
		return "sanctuary"
	var h: float = get_height_at(x, z)
	if h < WATER_LEVEL + 1.05 or dist > ISLAND_RADIUS * 0.88:
		return "beach"
	if h > 8.2:
		return "volcanic"
	var moisture: float = _noise_biome.get_noise_2d(x + 120.0, z - 85.0)
	if moisture > 0.08:
		return "forest"
	return "plains"


## O(1) bilinear heightmap lookup at world coordinates `(x, z)`.
func get_height_at(x: float, z: float) -> float:
	if not _caches_built:
		_build_lookup_caches()
	var half: float = WORLD_SIZE * 0.5
	if x <= -half or x >= half or z <= -half or z >= half:
		return -5.5

	var u: float = ((x + half) / WORLD_SIZE) * float(HEIGHT_RES - 1)
	var v: float = ((z + half) / WORLD_SIZE) * float(HEIGHT_RES - 1)
	var ix: int = clampi(int(floor(u)), 0, HEIGHT_RES - 2)
	var iz: int = clampi(int(floor(v)), 0, HEIGHT_RES - 2)
	var fx: float = u - float(ix)
	var fz: float = v - float(iz)

	var idx00: int = iz * HEIGHT_RES + ix
	var h00: float = _height_grid[idx00]
	var h10: float = _height_grid[idx00 + 1]
	var h01: float = _height_grid[idx00 + HEIGHT_RES]
	var h11: float = _height_grid[idx00 + HEIGHT_RES + 1]

	var h0: float = h00 + (h10 - h00) * fx
	var h1: float = h01 + (h11 - h01) * fx
	return h0 + (h1 - h0) * fz


## O(1) biome lookup at world coordinates `(x, z)` returning `"sanctuary" | "beach" | "plains" | "forest" | "volcanic"`.
func get_biome_at(x: float, z: float) -> String:
	if not _caches_built:
		_build_lookup_caches()
	var half: float = WORLD_SIZE * 0.5
	if x <= -half or x >= half or z <= -half or z >= half:
		return "beach"
	var ix: int = clampi(int(round(((x + half) / WORLD_SIZE) * float(BIOME_RES - 1))), 0, BIOME_RES - 1)
	var iz: int = clampi(int(round(((z + half) / WORLD_SIZE) * float(BIOME_RES - 1))), 0, BIOME_RES - 1)
	return _biome_grid[iz * BIOME_RES + ix]


## Computes vertex color for a given elevation and biome.
func _get_vertex_color(x: float, z: float, h: float, biome: String) -> Color:
	if h < WATER_LEVEL:
		return Color(0.14, 0.32, 0.42)
	match biome:
		"sanctuary":
			var ring_dist: float = absf(sqrt(x * x + z * z) - SANCTUARY_RADIUS * 0.85)
			if ring_dist < 1.2:
				return Color(0.28, 0.78, 0.84)
			return Color(0.38, 0.66, 0.42)
		"beach":
			return Color(0.84, 0.76, 0.54)
		"forest":
			return Color(0.16, 0.44, 0.24)
		"volcanic":
			if h > 11.2:
				return Color(0.68, 0.26, 0.14)
			return Color(0.26, 0.22, 0.24)
		_:
			return Color(0.26, 0.58, 0.30)


## Builds the 3D Island Terrain `ArrayMesh` with smooth vertex normals and vertex colors.
func _build_island_mesh() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var half: float = WORLD_SIZE * 0.5
	var step: float = WORLD_SIZE / float(MESH_SEGMENTS)

	for iz in range(MESH_SEGMENTS):
		var z0: float = -half + float(iz) * step
		var z1: float = z0 + step
		for ix in range(MESH_SEGMENTS):
			var x0: float = -half + float(ix) * step
			var x1: float = x0 + step

			var h00: float = get_height_at(x0, z0)
			var h10: float = get_height_at(x1, z0)
			var h01: float = get_height_at(x0, z1)
			var h11: float = get_height_at(x1, z1)

			var c00: Color = _get_vertex_color(x0, z0, h00, get_biome_at(x0, z0))
			var c10: Color = _get_vertex_color(x1, z0, h10, get_biome_at(x1, z0))
			var c01: Color = _get_vertex_color(x0, z1, h01, get_biome_at(x0, z1))
			var c11: Color = _get_vertex_color(x1, z1, h11, get_biome_at(x1, z1))

			var v00 := Vector3(x0, h00, z0)
			var v10 := Vector3(x1, h10, z0)
			var v01 := Vector3(x0, h01, z1)
			var v11 := Vector3(x1, h11, z1)

			# Triangle 1 (v00, v10, v01)
			st.set_color(c00)
			st.add_vertex(v00)
			st.set_color(c10)
			st.add_vertex(v10)
			st.set_color(c01)
			st.add_vertex(v01)

			# Triangle 2 (v10, v11, v01)
			st.set_color(c10)
			st.add_vertex(v10)
			st.set_color(c11)
			st.add_vertex(v11)
			st.set_color(c01)
			st.add_vertex(v01)

	st.generate_normals()
	var array_mesh: ArrayMesh = st.commit()

	terrain_mesh_instance = MeshInstance3D.new()
	terrain_mesh_instance.name = "IslandTerrainMesh"
	terrain_mesh_instance.mesh = array_mesh
	terrain_mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	var terrain_mat := StandardMaterial3D.new()
	terrain_mat.vertex_color_use_as_albedo = true
	terrain_mat.roughness = 0.86
	terrain_mat.metallic = 0.06
	terrain_mesh_instance.material_override = terrain_mat
	add_child(terrain_mesh_instance)


## Builds the stylized Ocean Water Plane at `y = WATER_LEVEL`.
func _build_ocean_plane() -> void:
	ocean_mesh_instance = MeshInstance3D.new()
	ocean_mesh_instance.name = "OceanWaterPlane"
	var plane := PlaneMesh.new()
	plane.size = Vector2(680.0, 680.0)
	plane.subdivide_width = 36
	plane.subdivide_depth = 36
	ocean_mesh_instance.mesh = plane
	ocean_mesh_instance.position = Vector3(0.0, WATER_LEVEL, 0.0)
	ocean_mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	var water_mat := StandardMaterial3D.new()
	water_mat.albedo_color = Color(0.08, 0.46, 0.62, 0.88)
	water_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	water_mat.roughness = 0.16
	water_mat.metallic = 0.35
	water_mat.emission_enabled = true
	water_mat.emission = Color(0.04, 0.22, 0.34)
	water_mat.emission_energy_multiplier = 0.45
	ocean_mesh_instance.material_override = water_mat
	add_child(ocean_mesh_instance)


## Builds the Central Bastion Sanctuary (`bastion_sanctuary.glb`), runic aura ring, and Solar Aegis Shield Dome.
func _build_bastion_sanctuary() -> void:
	sanctuary_root = Node3D.new()
	sanctuary_root.name = "BastionSanctuaryRoot"
	var center_y: float = get_height_at(0.0, 0.0)
	sanctuary_root.position = Vector3(0.0, center_y, 0.0)
	add_child(sanctuary_root)

	var citadel_model: Node3D = ModelLoader.instantiate_model(
		"bastion_sanctuary",
		Color(0.28, 0.86, 1.0),
		1.85
	)
	citadel_model.name = "SanctuaryCoreModel"
	sanctuary_root.add_child(citadel_model)

	# Glowing runic Sanctuary perimeter ring
	var ring_mi := MeshInstance3D.new()
	ring_mi.name = "SanctuaryPerimeterRing"
	var torus := TorusMesh.new()
	torus.inner_radius = SANCTUARY_RADIUS - 0.35
	torus.outer_radius = SANCTUARY_RADIUS + 0.35
	torus.rings = 36
	torus.ring_segments = 8
	ring_mi.mesh = torus
	ring_mi.position = Vector3(0.0, 0.25, 0.0)
	ring_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var ring_mat := StandardMaterial3D.new()
	ring_mat.albedo_color = Color(0.20, 0.90, 1.0, 0.78)
	ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring_mat.emission_enabled = true
	ring_mat.emission = Color(0.15, 0.78, 0.98)
	ring_mat.emission_energy_multiplier = 1.65
	ring_mi.material_override = ring_mat
	sanctuary_root.add_child(ring_mi)

	# Solar Aegis Shield Dome (hidden until forged with `[V]`)
	shield_dome_mesh = MeshInstance3D.new()
	shield_dome_mesh.name = "SolarAegisShieldDome"
	var sphere := SphereMesh.new()
	sphere.radius = SANCTUARY_RADIUS
	sphere.height = SANCTUARY_RADIUS
	sphere.is_hemisphere = true
	sphere.radial_segments = 24
	sphere.rings = 12
	shield_dome_mesh.mesh = sphere
	shield_dome_mesh.visible = false
	shield_dome_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var dome_mat := StandardMaterial3D.new()
	dome_mat.albedo_color = Color(0.25, 0.92, 1.0, 0.26)
	dome_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dome_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	dome_mat.emission_enabled = true
	dome_mat.emission = Color(0.20, 0.85, 1.0)
	dome_mat.emission_energy_multiplier = 1.8
	shield_dome_mesh.material_override = dome_mat
	sanctuary_root.add_child(shield_dome_mesh)

	buildings_root = Node3D.new()
	buildings_root.name = "BastionBuildingsRoot"
	sanctuary_root.add_child(buildings_root)


## Populates harvestable Resource Nodes (Wood, Stone, Crystal), Survivor Cages,
## 3 Ancient Relic Monoliths, and 3 Elemental Weapon Shrines.
func _populate_world_nodes() -> void:
	props_root = Node3D.new()
	props_root.name = "WorldPropsRoot"
	add_child(props_root)

	var rng := RandomNumberGenerator.new()
	rng.seed = 9001

	# 1. Harvestable Resource Nodes (Wood trees, Stone boulders, Mana Crystals)
	var total_resources: int = 84
	for i in range(total_resources):
		var angle: float = rng.randf_range(0.0, TAU)
		var dist: float = rng.randf_range(SANCTUARY_RADIUS + 5.0, ISLAND_RADIUS * 0.84)
		var wx: float = cos(angle) * dist
		var wz: float = sin(angle) * dist
		var wy: float = get_height_at(wx, wz)
		if wy < WATER_LEVEL + 0.45:
			continue

		var r_type: String = "wood"
		if i % 4 == 0:
			r_type = "stone"
		elif i % 5 == 0:
			r_type = "crystal"

		var node_visual := _create_resource_node_visual(r_type)
		node_visual.position = Vector3(wx, wy, wz)
		node_visual.rotation.y = rng.randf_range(0.0, TAU)
		props_root.add_child(node_visual)

		var max_amt: int = 3 if r_type != "crystal" else 2
		resource_nodes.append({
			"id": "res_%d" % i,
			"type": r_type,
			"position": Vector3(wx, wy, wz),
			"x": wx,
			"y": wy,
			"z": wz,
			"amount": max_amt,
			"max_amount": max_amt,
			"depleted": false,
			"respawn_timer": 0.0,
			"node_3d": node_visual,
		})

	# 2. Captive Survivor Cages (6 cages around mid-island)
	var roles: Array[String] = ["scout", "guard", "harvester", "scout", "guard", "harvester"]
	for i in range(6):
		var angle: float = (float(i) / 6.0) * TAU + 0.35
		var dist: float = 38.0 + float(i % 2) * 18.0
		var wx: float = cos(angle) * dist
		var wz: float = sin(angle) * dist
		var wy: float = get_height_at(wx, wz)

		var cage_root := Node3D.new()
		cage_root.name = "SurvivorCage_%d" % i
		cage_root.position = Vector3(wx, wy, wz)

		var npc_vis: Node3D = ModelLoader.instantiate_model("npc_survivor", Color(0.25, 0.88, 0.65), 1.0)
		cage_root.add_child(npc_vis)

		var bars_mi := MeshInstance3D.new()
		bars_mi.name = "CageBars"
		var cyl := CylinderMesh.new()
		cyl.top_radius = 1.05
		cyl.bottom_radius = 1.05
		cyl.height = 2.1
		cyl.radial_segments = 8
		bars_mi.mesh = cyl
		bars_mi.position = Vector3(0.0, 1.05, 0.0)
		var cage_mat := StandardMaterial3D.new()
		cage_mat.albedo_color = Color(0.95, 0.72, 0.18, 0.42)
		cage_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		cage_mat.emission_enabled = true
		cage_mat.emission = Color(0.85, 0.55, 0.12)
		bars_mi.material_override = cage_mat
		cage_root.add_child(bars_mi)
		props_root.add_child(cage_root)

		survivor_cages.append({
			"id": "cage_%d" % i,
			"role": roles[i],
			"position": Vector3(wx, wy, wz),
			"x": wx,
			"y": wy,
			"z": wz,
			"rescued": false,
			"node_3d": cage_root,
		})

	# 3. 3 Ancient Relic Monoliths (`relic_monolith.glb`)
	var monolith_angles: Array[float] = [deg_to_rad(30.0), deg_to_rad(150.0), deg_to_rad(270.0)]
	for i in range(3):
		var angle: float = monolith_angles[i]
		var dist: float = 74.0
		var wx: float = cos(angle) * dist
		var wz: float = sin(angle) * dist
		var wy: float = get_height_at(wx, wz)

		var mono_vis: Node3D = ModelLoader.instantiate_model("relic_monolith", Color(0.22, 0.92, 1.0), 1.55)
		mono_vis.name = "RelicMonolith_%d" % i
		mono_vis.position = Vector3(wx, wy, wz)
		props_root.add_child(mono_vis)

		relic_monoliths.append({
			"id": "monolith_%d" % (i + 1),
			"index": i,
			"position": Vector3(wx, wy, wz),
			"x": wx,
			"y": wy,
			"z": wz,
			"claimed": false,
			"node_3d": mono_vis,
		})

	# 4. 3 Elemental Weapon Shrines (`frost_blade`, `inferno_greatblade`, `emerald_scythe`)
	var shrine_specs: Array[Dictionary] = [
		{"id": "frost_blade", "angle": deg_to_rad(85.0), "color": Color(0.25, 0.82, 1.0)},
		{"id": "inferno_greatblade", "angle": deg_to_rad(205.0), "color": Color(1.0, 0.38, 0.12)},
		{"id": "emerald_scythe", "angle": deg_to_rad(325.0), "color": Color(0.22, 0.92, 0.48)},
	]
	for spec in shrine_specs:
		var angle: float = float(spec["angle"])
		var dist: float = 29.0
		var wx: float = cos(angle) * dist
		var wz: float = sin(angle) * dist
		var wy: float = get_height_at(wx, wz)

		var shrine_node := _create_weapon_shrine_visual(spec["id"], spec["color"])
		shrine_node.position = Vector3(wx, wy, wz)
		props_root.add_child(shrine_node)

		weapon_shrines.append({
			"id": spec["id"],
			"weapon_id": spec["id"],
			"position": Vector3(wx, wy, wz),
			"x": wx,
			"y": wy,
			"z": wz,
			"unlocked": false,
			"node_3d": shrine_node,
		})


## Creates a low-poly 3D mesh for a Wood tree, Stone boulder, or Mana Crystal cluster.
func _create_resource_node_visual(r_type: String) -> Node3D:
	var root := Node3D.new()
	if r_type == "wood":
		var trunk := MeshInstance3D.new()
		var cyl := CylinderMesh.new()
		cyl.top_radius = 0.22
		cyl.bottom_radius = 0.34
		cyl.height = 1.8
		cyl.radial_segments = 6
		trunk.mesh = cyl
		trunk.position = Vector3(0.0, 0.9, 0.0)
		trunk.material_override = ModelLoader._get_or_create_material("tree_trunk", Color(0.38, 0.24, 0.14), 0.85, 0.05)
		trunk.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(trunk)

		var crown := MeshInstance3D.new()
		var cone := CylinderMesh.new()
		cone.top_radius = 0.05
		cone.bottom_radius = 1.35
		cone.height = 2.8
		cone.radial_segments = 7
		crown.mesh = cone
		crown.position = Vector3(0.0, 2.5, 0.0)
		crown.material_override = ModelLoader._get_or_create_material("tree_crown", Color(0.18, 0.56, 0.28), 0.75, 0.08)
		crown.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		root.add_child(crown)
	elif r_type == "stone":
		var rock := MeshInstance3D.new()
		var sphere := SphereMesh.new()
		sphere.radius = 0.95
		sphere.height = 1.45
		sphere.radial_segments = 7
		sphere.rings = 4
		rock.mesh = sphere
		rock.position = Vector3(0.0, 0.55, 0.0)
		rock.material_override = ModelLoader._get_or_create_material("rock_stone", Color(0.48, 0.50, 0.54), 0.82, 0.15)
		rock.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		root.add_child(rock)
	else:
		var crystal := MeshInstance3D.new()
		var prism := PrismMesh.new()
		prism.size = Vector3(0.85, 1.95, 0.85)
		crystal.mesh = prism
		crystal.position = Vector3(0.0, 0.95, 0.0)
		crystal.material_override = ModelLoader._get_or_create_material(
			"mana_crystal_node",
			Color(0.28, 0.88, 1.0),
			0.18,
			0.75,
			Color(0.18, 0.72, 1.0)
		)
		crystal.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		root.add_child(crystal)
	return root


## Creates a glowing pedestal + floating blade visual for an Elemental Weapon Shrine.
func _create_weapon_shrine_visual(weapon_id: String, glow_color: Color) -> Node3D:
	var root := Node3D.new()
	root.name = "WeaponShrine_%s" % weapon_id
	var altar := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.95
	cyl.bottom_radius = 1.2
	cyl.height = 1.1
	cyl.radial_segments = 8
	altar.mesh = cyl
	altar.position = Vector3(0.0, 0.55, 0.0)
	altar.material_override = ModelLoader._get_or_create_material("shrine_base", Color(0.22, 0.26, 0.32), 0.65, 0.45)
	root.add_child(altar)

	var blade := MeshInstance3D.new()
	blade.name = "FloatingBlade"
	var box := BoxMesh.new()
	box.size = Vector3(0.22, 1.85, 0.08)
	blade.mesh = box
	blade.position = Vector3(0.0, 2.15, 0.0)
	blade.material_override = ModelLoader._get_or_create_material(
		"shrine_blade_%s" % weapon_id,
		glow_color,
		0.20,
		0.85,
		glow_color
	)
	root.add_child(blade)
	return root


## Builds the single-draw-call `MultiMeshInstance3D` 3D Conway Automaton Grid Overlay (`32x32`).
func _build_conway_overlay() -> void:
	conway_multimesh_instance = MultiMeshInstance3D.new()
	conway_multimesh_instance.name = "ConwayGridOverlay3D"
	conway_multimesh_instance.visible = conway_overlay_visible
	conway_multimesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.instance_count = CONWAY_SIZE * CONWAY_SIZE

	var cell_box := BoxMesh.new()
	cell_box.size = Vector3(3.2, 0.22, 3.2)
	var cell_mat := StandardMaterial3D.new()
	cell_mat.vertex_color_use_as_albedo = true
	cell_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	cell_mat.emission_enabled = true
	cell_mat.emission = Color(0.18, 0.85, 0.52)
	cell_mat.emission_energy_multiplier = 0.85
	cell_box.material = cell_mat
	mm.mesh = cell_box

	var half_span: float = ISLAND_RADIUS * 0.85
	var step: float = (half_span * 2.0) / float(CONWAY_SIZE)
	for gz in range(CONWAY_SIZE):
		for gx in range(CONWAY_SIZE):
			var idx: int = gz * CONWAY_SIZE + gx
			var wx: float = -half_span + (float(gx) + 0.5) * step
			var wz: float = -half_span + (float(gz) + 0.5) * step
			var wy: float = maxf(WATER_LEVEL + 0.2, get_height_at(wx, wz) + 0.32)
			var xform := Transform3D(Basis.IDENTITY, Vector3(wx, wy, wz))
			mm.set_instance_transform(idx, xform)
			mm.set_instance_color(idx, Color(0.20, 0.92, 0.55, 0.35))

	conway_multimesh_instance.multimesh = mm
	add_child(conway_multimesh_instance)


## Sets visibility of the 3D Conway Cellular Automaton overlay (`[G]`).
func set_conway_overlay_visible(visible_state: bool) -> void:
	conway_overlay_visible = visible_state
	if conway_multimesh_instance != null:
		conway_multimesh_instance.visible = conway_overlay_visible


## Toggles the 3D Conway Cellular Automaton overlay (`[G]`).
func toggle_conway_overlay() -> bool:
	set_conway_overlay_visible(not conway_overlay_visible)
	return conway_overlay_visible


## Updates the 3D Conway MultiMesh cell colors & scales from a `ConwayGrid` instance.
func update_conway_overlay(conway_grid: Variant) -> void:
	if conway_multimesh_instance == null or conway_multimesh_instance.multimesh == null or conway_grid == null:
		return
	var mm: MultiMesh = conway_multimesh_instance.multimesh
	var cells_arr: Variant = conway_grid.get("cells") if conway_grid is Object else null
	if cells_arr == null:
		return

	var count: int = mini(mm.instance_count, cells_arr.size())
	for idx in range(count):
		var alive: int = int(cells_arr[idx])
		if alive > 0:
			mm.set_instance_color(idx, Color(0.22, 0.98, 0.56, 0.68))
		else:
			mm.set_instance_color(idx, Color(0.12, 0.28, 0.38, 0.12))


## Activates or deactivates the Solar Aegis Sanctuary Shield Dome (`[V]`).
func set_shield_active(active: bool) -> void:
	if shield_dome_mesh != null:
		shield_dome_mesh.visible = active


## Adds or upgrades a visual structure around the Central Bastion Sanctuary (`[H]`).
func add_or_upgrade_building_visual(building_id: String, level: int = 1) -> void:
	constructed_buildings[building_id] = level
	if buildings_root == null:
		return
	var node_name := "Building_%s" % building_id
	var existing: Node3D = buildings_root.get_node_or_null(node_name) as Node3D
	if existing == null:
		existing = Node3D.new()
		existing.name = node_name
		var idx: int = buildings_root.get_child_count()
		var angle: float = float(idx) * (TAU / 4.0) + 0.4
		var b_pos := Vector3(cos(angle) * 9.5, 0.0, sin(angle) * 9.5)
		existing.position = b_pos

		var tower := MeshInstance3D.new()
		var cyl := CylinderMesh.new()
		cyl.top_radius = 1.1
		cyl.bottom_radius = 1.45
		cyl.height = 3.2
		cyl.radial_segments = 8
		tower.mesh = cyl
		tower.position = Vector3(0.0, 1.6, 0.0)
		tower.material_override = ModelLoader._get_or_create_material(
			"bldg_%s" % building_id,
			Color(0.28, 0.62, 0.88),
			0.45,
			0.40,
			Color(0.14, 0.48, 0.78)
		)
		existing.add_child(tower)
		buildings_root.add_child(existing)

	var scale_mult: float = 1.0 + float(maxi(0, level - 1)) * 0.18
	existing.scale = Vector3.ONE * scale_mult


## Finds the nearest interactive world object (resource node, survivor cage, relic monolith, or weapon shrine)
## within `max_dist` of `world_pos`.
func find_nearest_interactable(world_pos: Vector3, max_dist: float = 7.8) -> Dictionary:
	var best_dist: float = max_dist
	var best_result: Dictionary = {}

	for mono in relic_monoliths:
		if bool(mono.get("claimed", false)):
			continue
		var d: float = Vector2(world_pos.x - float(mono["x"]), world_pos.z - float(mono["z"])).length()
		if d < best_dist:
			best_dist = d
			best_result = {"kind": "relic", "distance": d, "data": mono}

	for cage in survivor_cages:
		if bool(cage.get("rescued", false)):
			continue
		var d: float = Vector2(world_pos.x - float(cage["x"]), world_pos.z - float(cage["z"])).length()
		if d < best_dist:
			best_dist = d
			best_result = {"kind": "cage", "distance": d, "data": cage}

	for shrine in weapon_shrines:
		var d: float = Vector2(world_pos.x - float(shrine["x"]), world_pos.z - float(shrine["z"])).length()
		if d < best_dist:
			best_dist = d
			best_result = {"kind": "shrine", "distance": d, "data": shrine}

	for node in resource_nodes:
		if bool(node.get("depleted", false)):
			continue
		var d: float = Vector2(world_pos.x - float(node["x"]), world_pos.z - float(node["z"])).length()
		if d < best_dist:
			best_dist = d
			best_result = {"kind": "resource", "distance": d, "data": node}

	return best_result


## Executes an interaction (`[E]`) at `world_pos` and returns a summary dictionary.
func interact_at(world_pos: Vector3, max_dist: float = 7.8) -> Dictionary:
	var target: Dictionary = find_nearest_interactable(world_pos, max_dist)
	if target.is_empty():
		return {"ok": false, "kind": "none"}

	var kind: String = String(target.get("kind", "none"))
	var item: Dictionary = target.get("data", {})
	if kind == "resource":
		var r_type: String = String(item.get("type", "wood"))
		var rem: int = int(item.get("amount", 1)) - 1
		item["amount"] = rem
		if rem <= 0:
			item["depleted"] = true
			item["respawn_timer"] = 25.0
			var n3d: Node3D = item.get("node_3d", null) as Node3D
			if n3d != null:
				n3d.visible = false
		var gain: int = 12 if r_type != "crystal" else 8
		resource_harvested.emit(r_type, gain, item.get("position", world_pos))
		return {"ok": true, "kind": "resource", "type": r_type, "amount": gain, "position": item.get("position", world_pos)}

	elif kind == "cage":
		item["rescued"] = true
		var n3d: Node3D = item.get("node_3d", null) as Node3D
		if n3d != null:
			var bars: Node3D = n3d.get_node_or_null("CageBars") as Node3D
			if bars != null:
				bars.visible = false
		var role: String = String(item.get("role", "scout"))
		rescued_scouts.append(item)
		survivor_rescued.emit(String(item.get("id", "cage")), role, item.get("position", world_pos))
		return {"ok": true, "kind": "cage", "role": role, "position": item.get("position", world_pos)}

	elif kind == "relic":
		item["claimed"] = true
		var n3d: Node3D = item.get("node_3d", null) as Node3D
		if n3d != null:
			n3d.scale = Vector3.ONE * 1.15
		var total_claimed: int = 0
		for m in relic_monoliths:
			if bool(m.get("claimed", false)):
				total_claimed += 1
		relic_claimed.emit(String(item.get("id", "monolith")), total_claimed, item.get("position", world_pos))
		return {"ok": true, "kind": "relic", "total_claimed": total_claimed, "position": item.get("position", world_pos)}

	elif kind == "shrine":
		item["unlocked"] = true
		var w_id: String = String(item.get("weapon_id", "frost_blade"))
		weapon_shrine_activated.emit(w_id, item.get("position", world_pos))
		return {"ok": true, "kind": "shrine", "weapon_id": w_id, "position": item.get("position", world_pos)}

	return {"ok": false, "kind": "none"}


## Gently animates ocean waves, floating shrine blades, relic monolith crystals, and resource respawns.
func _animate_ocean_and_landmarks(delta: float) -> void:
	if ocean_mesh_instance != null:
		ocean_mesh_instance.position.y = WATER_LEVEL + sin(_elapsed_time * 1.6) * 0.14

	for shrine in weapon_shrines:
		var n3d: Node3D = shrine.get("node_3d", null) as Node3D
		if n3d != null:
			var blade: Node3D = n3d.get_node_or_null("FloatingBlade") as Node3D
			if blade != null:
				blade.rotation.y = _elapsed_time * 1.8
				blade.position.y = 2.15 + sin(_elapsed_time * 2.4) * 0.18

	for mono in relic_monoliths:
		var n3d: Node3D = mono.get("node_3d", null) as Node3D
		if n3d != null:
			n3d.rotation.y = _elapsed_time * 0.45

	for node in resource_nodes:
		if bool(node.get("depleted", false)):
			var timer: float = float(node.get("respawn_timer", 0.0)) - delta
			node["respawn_timer"] = timer
			if timer <= 0.0:
				node["depleted"] = false
				node["amount"] = int(node.get("max_amount", 3))
				var n3d: Node3D = node.get("node_3d", null) as Node3D
				if n3d != null:
					n3d.visible = true


## Alias used by headless verification runner (`headless_dry_run.gd`).
func _build_height_and_biome_grids() -> void:
	if not _caches_built:
		_build_lookup_caches()


## Refreshes all world `.glb` vs Procedural models (`bastion_sanctuary`, `relic_monolith`, `npc_survivor`) on `[J]`.
func refresh_models(use_blender: bool) -> void:
	ModelLoader.set_use_blender_models(use_blender)


## Executes contextual interaction (`[E]`) at `world_pos` and returns the dictionary format expected by `PlayerCharacter.gd`.
func interact_at_position(world_pos: Vector3, max_dist: float = 8.5) -> Dictionary:
	var raw: Dictionary = interact_at(world_pos, max_dist)
	if not bool(raw.get("ok", false)):
		return {"handled": false, "type": "none"}

	var kind: String = String(raw.get("kind", "resource"))
	if kind == "resource":
		return {
			"handled": true,
			"type": "harvest",
			"resource_type": String(raw.get("type", "wood")),
			"amount": int(raw.get("amount", 10)),
			"position": raw.get("position", world_pos),
		}
	elif kind == "relic":
		return {
			"handled": true,
			"type": "relic",
			"total_claimed": int(raw.get("total_claimed", 1)),
			"position": raw.get("position", world_pos),
		}
	elif kind == "cage":
		return {
			"handled": true,
			"type": "cage",
			"role": String(raw.get("role", "scout")),
			"position": raw.get("position", world_pos),
		}
	elif kind == "shrine":
		return {
			"handled": true,
			"type": "weapon_shrine",
			"weapon_id": String(raw.get("weapon_id", "frost_blade")),
			"position": raw.get("position", world_pos),
		}
	return {"handled": false, "type": "none"}


## Returns a localized 3D world contextual interaction prompt (`"en"` default, `"fr"` 2nd choice) when near an interactable.
func get_nearest_interactable_prompt(world_pos: Vector3, lang: String = "en") -> String:
	var is_fr: bool = lang.to_lower().begins_with("fr")
	var nearest: Dictionary = find_nearest_interactable(world_pos, 8.5)
	if nearest.is_empty():
		return ""

	var kind: String = String(nearest.get("kind", ""))
	var item: Dictionary = nearest.get("data", {})
	match kind:
		"relic":
			return "🏛️ [E] Réclamer le Fragment de Relique d'Éden (+15 Cristal)" if is_fr else "🏛️ [E] Claim Eden Relic Monolith Fragment (+15 Crystal)"
		"cage":
			var role_str: String = String(item.get("role", "scout")).capitalize()
			return "🗝️ [E] Libérer le Survivant Captif (%s)" % role_str if is_fr else "🗝️ [E] Rescue Captive Survivor (%s)" % role_str
		"shrine":
			var w_id: String = String(item.get("weapon_id", "frost_blade"))
			return "⚔️ [E] Sanctuaire d'Arme Élémentaire (%s)" % w_id if is_fr else "⚔️ [E] Elemental Weapon Shrine (%s)" % w_id
		"resource":
			var r_type: String = String(item.get("type", "wood"))
			if r_type == "crystal":
				return "💎 [E] Récolter Cristal de Mana (+8)" if is_fr else "💎 [E] Harvest Mana Crystal Node (+8)"
			elif r_type == "stone":
				return "🪨 [E] Récolter Rocher de Pierre (+12)" if is_fr else "🪨 [E] Harvest Stone Boulder (+12)"
			else:
				return "🌲 [E] Récolter Arbre Sylvestre (+12 Bois)" if is_fr else "🌲 [E] Harvest Ancient Tree (+12 Wood)"
	return ""

