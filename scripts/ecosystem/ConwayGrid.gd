## ConwayGrid.gd
## ============================================================================
## 32x32 Cellular Automaton & Ecological Biomass Grid for Genesis Bastion (Godot 4.3).
##
## Responsibilities:
## - Maintains a 32x32 Conway's Game of Life grid (`cells: PackedInt32Array`) mapped
##   across the 3D island (`[-radius, +radius]` in X and Z).
## - Tracks continuous cell biomass (`biomass: PackedFloat32Array`) and local Moore
##   neighborhood counts (`neighbor_counts: PackedInt32Array`).
## - Evaluates Conway B3/S23 rules each generation (`step_generation()`) with ecological
##   carrying-capacity classification (`underpopulated`, `optimal`, `overpopulated`)
##   and automatic spore re-seeding if global biomass drops too low.
## - Queries world-space fertility (`get_fertility_at_world(x, z, radius)`) and allows
##   external ecological bursts (`inject_life_burst(world_x, world_z)`).
## ============================================================================
class_name ConwayGrid
extends RefCounted

const DEFAULT_GRID_SIZE: int = 32
const DEFAULT_WORLD_RADIUS: float = 135.0

var grid_size: int = DEFAULT_GRID_SIZE
var width: int = DEFAULT_GRID_SIZE
var height: int = DEFAULT_GRID_SIZE

## Flat 32x32 array (1024 ints): 1 = alive/fertile cell, 0 = dormant cell
var cells: PackedInt32Array = PackedInt32Array()

## Flat 32x32 array (1024 floats): continuous ecological biomass in [0.0, 100.0]
var biomass: PackedFloat32Array = PackedFloat32Array()

## Flat 32x32 array (1024 ints): cached 8-neighbor live count in [0, 8]
var neighbor_counts: PackedInt32Array = PackedInt32Array()

var generation: int = 1
var alive_count: int = 0
var births_last_step: int = 0
var deaths_last_step: int = 0
var optimal_cells_count: int = 0
var starving_cells_count: int = 0
var lonely_cells_count: int = 0

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


## Initializes the 32x32 Conway cellular automaton and seeds initial ecological clusters.
func _init(size: int = DEFAULT_GRID_SIZE, seed_val: int = 1337) -> void:
	grid_size = maxi(8, size)
	width = grid_size
	height = grid_size
	var total: int = grid_size * grid_size
	cells.resize(total)
	biomass.resize(total)
	neighbor_counts.resize(total)
	seed_initial_pattern(seed_val)


## Seeds the 32x32 grid with deterministic organic gliders, oscillators, and biome rings.
func seed_initial_pattern(seed_val: int = 1337) -> void:
	_rng.seed = seed_val
	generation = 1
	births_last_step = 0
	deaths_last_step = 0
	var total: int = grid_size * grid_size
	var center: float = float(grid_size - 1) * 0.5

	for gz in range(grid_size):
		for gx in range(grid_size):
			var idx: int = gz * grid_size + gx
			var dx: float = float(gx) - center
			var dz: float = float(gz) - center
			var dist: float = sqrt(dx * dx + dz * dz)
			# Fertile mid-island forest ring + scattered sanctuary glades
			var ring_prob: float = 0.36 if (dist >= 3.5 and dist <= 13.5) else 0.18
			var is_live: int = 1 if _rng.randf() < ring_prob else 0
			cells[idx] = is_live
			biomass[idx] = 72.0 if is_live == 1 else 28.0

	# Stamp classic R-pentomino & glider structures in the 4 quadrants for sustained dynamics
	_stamp_glider(6, 6)
	_stamp_glider(grid_size - 9, 6)
	_stamp_glider(6, grid_size - 9)
	_stamp_glider(grid_size - 9, grid_size - 9)
	_recompute_metrics()


## Alias for resetting the Conway grid to Generation 1.
func reset(seed_val: int = 1337) -> void:
	seed_initial_pattern(seed_val)


## Re-seeds the 32x32 Conway grid with a new randomized or specified seed (called by MainGame.restart_from_zero()).
func randomize_initial_seed(seed_val: int = -1) -> void:
	var next_seed: int = seed_val if seed_val >= 0 else int(Time.get_ticks_usec() & 0x7fffffff)
	seed_initial_pattern(next_seed)


## Stamps a 3x3 Conway glider at the given grid coordinates.
func _stamp_glider(gx: int, gz: int) -> void:
	var offsets: Array[Vector2i] = [
		Vector2i(1, 0),
		Vector2i(2, 1),
		Vector2i(0, 2),
		Vector2i(1, 2),
		Vector2i(2, 2)
	]
	for off in offsets:
		var x: int = posmod(gx + off.x, grid_size)
		var z: int = posmod(gz + off.y, grid_size)
		var idx: int = z * grid_size + x
		cells[idx] = 1
		biomass[idx] = 85.0


## Advances the Conway cellular automaton by 1 generation using B3/S23 rules + biomass dynamics.
## Returns a telemetry dictionary with generation, alive_count, births, deaths, and fertility_ratio.
func step_generation() -> Dictionary:
	var total: int = grid_size * grid_size
	var next_cells: PackedInt32Array = PackedInt32Array()
	next_cells.resize(total)

	var births: int = 0
	var deaths: int = 0
	var next_alive: int = 0

	for gz in range(grid_size):
		var z_up: int = posmod(gz - 1, grid_size)
		var z_dn: int = posmod(gz + 1, grid_size)
		for gx in range(grid_size):
			var x_lt: int = posmod(gx - 1, grid_size)
			var x_rt: int = posmod(gx + 1, grid_size)

			var n_count: int = (
				cells[z_up * grid_size + x_lt]
				+ cells[z_up * grid_size + gx]
				+ cells[z_up * grid_size + x_rt]
				+ cells[gz * grid_size + x_lt]
				+ cells[gz * grid_size + x_rt]
				+ cells[z_dn * grid_size + x_lt]
				+ cells[z_dn * grid_size + gx]
				+ cells[z_dn * grid_size + x_rt]
			)

			var idx: int = gz * grid_size + gx
			neighbor_counts[idx] = n_count
			var cur: int = cells[idx]
			var nxt: int = 0

			# Classic Conway B3/S23 + high-biomass ecological survival buffer
			if cur == 1:
				if n_count == 2 or n_count == 3:
					nxt = 1
				elif n_count == 4 and biomass[idx] > 80.0 and _rng.randf() < 0.22:
					nxt = 1
				else:
					nxt = 0
					deaths += 1
			else:
				if n_count == 3:
					nxt = 1
					births += 1
				elif n_count == 2 and biomass[idx] > 75.0 and _rng.randf() < 0.12:
					nxt = 1
					births += 1

			next_cells[idx] = nxt
			if nxt == 1:
				next_alive += 1
				biomass[idx] = clampf(biomass[idx] + 14.0, 10.0, 100.0)
			else:
				biomass[idx] = clampf(biomass[idx] - 4.5, 12.0, 100.0)

	cells = next_cells
	generation += 1
	births_last_step = births
	deaths_last_step = deaths
	alive_count = next_alive

	# Ecological homeostasis: if active cells drop below 12% of the grid, inject a natural spore wave
	var min_healthy_cells: int = int(float(total) * 0.12)
	if alive_count < min_healthy_cells:
		var angle: float = _rng.randf() * TAU
		var dist_world: float = _rng.randf_range(28.0, 85.0)
		inject_life_burst(cos(angle) * dist_world, sin(angle) * dist_world, DEFAULT_WORLD_RADIUS, 2)

	_recompute_metrics()

	return {
		"generation": generation,
		"alive_count": alive_count,
		"births": births_last_step,
		"deaths": deaths_last_step,
		"fertility_ratio": get_average_fertility(),
		"optimal_cells": optimal_cells_count,
		"starving_cells": starving_cells_count,
		"lonely_cells": lonely_cells_count
	}


## Alias for step_generation().
func step() -> Dictionary:
	return step_generation()


## Recomputes neighbor counts and Allee/Optimal/Overpopulated cell statistics.
func _recompute_metrics() -> void:
	var live: int = 0
	var opt: int = 0
	var starv: int = 0
	var lonely: int = 0

	for gz in range(grid_size):
		var z_up: int = posmod(gz - 1, grid_size)
		var z_dn: int = posmod(gz + 1, grid_size)
		for gx in range(grid_size):
			var x_lt: int = posmod(gx - 1, grid_size)
			var x_rt: int = posmod(gx + 1, grid_size)
			var idx: int = gz * grid_size + gx
			var n_count: int = (
				cells[z_up * grid_size + x_lt]
				+ cells[z_up * grid_size + gx]
				+ cells[z_up * grid_size + x_rt]
				+ cells[gz * grid_size + x_lt]
				+ cells[gz * grid_size + x_rt]
				+ cells[z_dn * grid_size + x_lt]
				+ cells[z_dn * grid_size + gx]
				+ cells[z_dn * grid_size + x_rt]
			)
			neighbor_counts[idx] = n_count
			if cells[idx] == 1:
				live += 1
			if n_count >= 2 and n_count <= 3:
				opt += 1
			elif n_count >= 4:
				starv += 1
			elif n_count == 1:
				lonely += 1

	alive_count = live
	optimal_cells_count = opt
	starving_cells_count = starv
	lonely_cells_count = lonely


## Converts world coordinates (x, z) to grid coordinates (gx, gz) in [0, grid_size - 1].
func world_to_grid(world_x: float, world_z: float, radius: float = DEFAULT_WORLD_RADIUS) -> Vector2i:
	var safe_radius: float = maxf(1.0, radius)
	var nx: float = clampf((world_x + safe_radius) / (2.0 * safe_radius), 0.0, 0.9999)
	var nz: float = clampf((world_z + safe_radius) / (2.0 * safe_radius), 0.0, 0.9999)
	return Vector2i(int(nx * float(grid_size)), int(nz * float(grid_size)))


## Converts grid coordinates (gx, gz) to world center coordinates (x, 0, z).
func get_cell_world_pos(gx: int, gz: int, radius: float = DEFAULT_WORLD_RADIUS) -> Vector3:
	var step_world: float = (2.0 * radius) / float(grid_size)
	var wx: float = -radius + (float(gx) + 0.5) * step_world
	var wz: float = -radius + (float(gz) + 0.5) * step_world
	return Vector3(wx, 0.0, wz)


## Returns normalized fertility [0.0, 1.0] at world coordinates (x, z) using a 3x3 neighborhood sample.
func get_fertility_at_world(x: float, z: float, radius: float = DEFAULT_WORLD_RADIUS) -> float:
	var gpos: Vector2i = world_to_grid(x, z, radius)
	var gx: int = gpos.x
	var gz: int = gpos.y
	var idx: int = gz * grid_size + gx

	var live_sum: int = 0
	for dz in range(-1, 2):
		var zz: int = posmod(gz + dz, grid_size)
		for dx in range(-1, 2):
			var xx: int = posmod(gx + dx, grid_size)
			live_sum += cells[zz * grid_size + xx]

	var local_live_ratio: float = float(live_sum) / 9.0
	var local_biomass_norm: float = biomass[idx] / 100.0
	return clampf(local_live_ratio * 0.65 + local_biomass_norm * 0.35, 0.05, 1.0)


## Alias for get_fertility_at_world().
func get_fertility_at(x: float, z: float, radius: float = DEFAULT_WORLD_RADIUS) -> float:
	return get_fertility_at_world(x, z, radius)


## Returns the ecological carrying-capacity state at world position (x, z):
## "optimal" (2..3 neighbors), "overpopulated" (>=4), "underpopulated" (1), or "empty" (0).
func get_density_state_at_world(x: float, z: float, radius: float = DEFAULT_WORLD_RADIUS) -> String:
	var gpos: Vector2i = world_to_grid(x, z, radius)
	var idx: int = gpos.y * grid_size + gpos.x
	var n: int = neighbor_counts[idx]
	if n >= 2 and n <= 3:
		return "optimal"
	elif n >= 4:
		return "overpopulated"
	elif n == 1:
		return "underpopulated"
	return "empty"


## Injects a cluster of living cells and biomass around (world_x, world_z).
func inject_life_burst(world_x: float, world_z: float, radius: float = DEFAULT_WORLD_RADIUS, burst_radius_cells: int = 2) -> void:
	var gpos: Vector2i = world_to_grid(world_x, world_z, radius)
	var r: int = maxi(1, burst_radius_cells)
	for dz in range(-r, r + 1):
		for dx in range(-r, r + 1):
			if abs(dx) + abs(dz) <= r + 1:
				var gx: int = posmod(gpos.x + dx, grid_size)
				var gz: int = posmod(gpos.y + dz, grid_size)
				var idx: int = gz * grid_size + gx
				cells[idx] = 1
				biomass[idx] = 100.0
	_recompute_metrics()


## Consumes or enriches biomass at world coordinates (world_x, world_z).
func modify_biomass_at_world(world_x: float, world_z: float, delta_biomass: float, radius: float = DEFAULT_WORLD_RADIUS) -> float:
	var gpos: Vector2i = world_to_grid(world_x, world_z, radius)
	var idx: int = gpos.y * grid_size + gpos.x
	biomass[idx] = clampf(biomass[idx] + delta_biomass, 5.0, 100.0)
	if biomass[idx] >= 80.0:
		cells[idx] = 1
	elif biomass[idx] <= 12.0:
		cells[idx] = 0
	return biomass[idx]


## Returns cell value (0 or 1) at grid coordinates (gx, gz).
func get_cell(gx: int, gz: int) -> int:
	if gx < 0 or gx >= grid_size or gz < 0 or gz >= grid_size:
		return 0
	return cells[gz * grid_size + gx]


## Sets cell value (0 or 1) at grid coordinates (gx, gz).
func set_cell(gx: int, gz: int, val: int) -> void:
	if gx < 0 or gx >= grid_size or gz < 0 or gz >= grid_size:
		return
	var idx: int = gz * grid_size + gx
	cells[idx] = 1 if val != 0 else 0
	if cells[idx] == 1:
		biomass[idx] = maxf(biomass[idx], 65.0)


## Returns true if the cell at (gx, gz) is currently alive.
func is_cell_alive(gx: int, gz: int) -> bool:
	return get_cell(gx, gz) == 1


## Returns continuous biomass [0.0, 100.0] at grid coordinates (gx, gz).
func get_cell_biomass(gx: int, gz: int) -> float:
	if gx < 0 or gx >= grid_size or gz < 0 or gz >= grid_size:
		return 0.0
	return biomass[gz * grid_size + gx]


## Returns the total number of living cells in the 32x32 grid.
func get_alive_count() -> int:
	return alive_count


## Returns the global fertility ratio [0.0, 1.0] across the 32x32 grid.
func get_average_fertility() -> float:
	var total: int = maxi(1, grid_size * grid_size)
	return clampf(float(alive_count) / float(total), 0.0, 1.0)


## Returns a complete snapshot dictionary for HUD and 3D overlay consumers.
func get_snapshot() -> Dictionary:
	return {
		"grid_size": grid_size,
		"generation": generation,
		"alive_count": alive_count,
		"births": births_last_step,
		"deaths": deaths_last_step,
		"fertility_ratio": get_average_fertility(),
		"optimal_cells": optimal_cells_count,
		"starving_cells": starving_cells_count,
		"lonely_cells": lonely_cells_count
	}
