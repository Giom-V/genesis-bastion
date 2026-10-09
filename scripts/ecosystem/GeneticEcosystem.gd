## GeneticEcosystem.gd
## ============================================================================
## Diploid Genetic Algorithm, Mendelian Mutations, Gestation Queue, Extinction
## Refuge Re-Immigration, Sovereign Dragon Wrath, Emerging Threats, and Herbivore
## Conservation Manager for Genesis Bastion (Godot 4.3 Engine Edition).
##
## Responsibilities:
## - Creates diploid creature genomes (`speed_gene`, `hp_gene`, `strength_gene`,
##   `aggression_score`, `size_gene`) with species-specific baselines.
## - Performs scope-expanding diploid parent crossover:
##   `lerpf(a, b, randf()) * randf_range(0.90, 1.10)` (`±10%` mutation drift)
##   plus Mendelian dominant mutation inheritance (78% / 92%) and inter-species
##   hybridization.
## - Manages per-species gestation queues (`4.5s` for goblins vs `58.0s` for
##   Sovereign Dragons) and juvenile maturation.
## - Guarantees extinction protection & ecological refuge re-immigration so
##   every species (including hidden/rare clades) always returns.
## - Tracks Sovereign Dragon peaceful-unless-provoked state (`dragon_wrath_active`,
##   `provoke_dragon_species()`), emerging threats (`shark_invasion_active`,
##   `mole_eruption_active`), and herbivore prey conservation (`prey_population`,
##   `prey_crisis_active`, `get_hp_regen_multiplier()`).
## ============================================================================
class_name GeneticEcosystem
extends Node

signal generation_advanced(gen_number: int, summary: Dictionary)
signal offspring_born(offspring_entry: Dictionary)
signal mutation_discovered(mutation_id: String, species_id: String, genome: Dictionary)
signal dragon_wrath_triggered()
signal shark_invasion_triggered()
signal shark_invasion_started()
signal mole_eruption_triggered()
signal mole_eruption_started()
signal prey_crisis_changed(is_active: bool, prey_count: int)
signal prey_crisis_started()
signal species_reimmigrated(species_id: String, count: int)

const MUTATION_FACTOR_MIN: float = 0.90
const MUTATION_FACTOR_MAX: float = 1.10
const GENE_MIN_CLAMP: float = 0.40
const GENE_MAX_CLAMP: float = 4.20
const PREY_CRISIS_THRESHOLD: int = 2

## Authoritative species baselines supporting both Godot 4 species IDs and Three.js legacy aliases
const SPECIES_BASELINES: Dictionary = {
	"glimmer_elk": {
		"name_en": "Glimmer Elk",
		"name_fr": "Cerf Sylvestre",
		"clade": "herbivore",
		"is_prey": true,
		"is_peaceful_dragon": false,
		"aggression": 0.0,
		"gestation_sec": 6.5,
		"min_population": 3,
		"base_hp": 78.0,
		"base_speed": 12.2,
		"base_damage": 0.0
	},
	"meadow_hare": {
		"name_en": "Meadow Hare",
		"name_fr": "Lapin des Plaines",
		"clade": "herbivore",
		"is_prey": true,
		"is_peaceful_dragon": false,
		"aggression": 0.0,
		"gestation_sec": 3.2,
		"min_population": 4,
		"base_hp": 36.0,
		"base_speed": 14.0,
		"base_damage": 0.0
	},
	"beach_crab": {
		"name_en": "Armored Beach Crab",
		"name_fr": "Crabe Cuirassé",
		"clade": "herbivore",
		"is_prey": true,
		"is_peaceful_dragon": false,
		"aggression": 0.05,
		"gestation_sec": 4.0,
		"min_population": 3,
		"base_hp": 52.0,
		"base_speed": 7.8,
		"base_damage": 0.0
	},
	"scavenger_goblin": {
		"name_en": "Scavenger Goblin",
		"name_fr": "Gobelin Éclaireur",
		"clade": "goblinoid",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.68,
		"gestation_sec": 4.5,
		"min_population": 4,
		"base_hp": 64.0,
		"base_speed": 10.6,
		"base_damage": 9.0
	},
	"forest_wolf": {
		"name_en": "Dire Forest Wolf",
		"name_fr": "Loup Sauvage",
		"clade": "therian",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.74,
		"gestation_sec": 9.5,
		"min_population": 3,
		"base_hp": 96.0,
		"base_speed": 12.4,
		"base_damage": 14.0
	},
	"sky_harpy": {
		"name_en": "Storm Sky Harpy",
		"name_fr": "Vautour / Harpie des Cieux",
		"clade": "avian",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.70,
		"gestation_sec": 12.0,
		"min_population": 2,
		"base_hp": 88.0,
		"base_speed": 13.0,
		"base_damage": 13.0
	},
	"abyssal_shark": {
		"name_en": "Abyssal Land-Shark",
		"name_fr": "Requin Marcheur des Abysses",
		"clade": "abyssal",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.85,
		"gestation_sec": 18.0,
		"min_population": 2,
		"base_hp": 195.0,
		"base_speed": 11.2,
		"base_damage": 24.0
	},
	"tunnel_mole": {
		"name_en": "Subterranean Giant Mole",
		"name_fr": "Taupe Géante Fouisseuse",
		"clade": "subterranean",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.78,
		"gestation_sec": 15.0,
		"min_population": 2,
		"base_hp": 175.0,
		"base_speed": 8.6,
		"base_damage": 21.0
	},
	"carrion_beetle": {
		"name_en": "Obsidian Carrion Beetle",
		"name_fr": "Scarabée d'Obsidienne",
		"clade": "goblinoid",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.65,
		"gestation_sec": 5.0,
		"min_population": 3,
		"base_hp": 125.0,
		"base_speed": 8.4,
		"base_damage": 15.0
	},
	"sovereign_dragon": {
		"name_en": "Caldera Sovereign Dragon",
		"name_fr": "Dragon Souverain de la Caldeira",
		"clade": "draconic",
		"is_prey": false,
		"is_peaceful_dragon": true,
		"aggression": 0.05,
		"gestation_sec": 58.0,
		"min_population": 1,
		"base_hp": 680.0,
		"base_speed": 9.8,
		"base_damage": 58.0
	},
	# Legacy aliases for seamless cross-module compatibility
	"goblin": {
		"name_en": "Scavenger Goblin",
		"name_fr": "Gobelin Éclaireur",
		"clade": "goblinoid",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.68,
		"gestation_sec": 4.5,
		"min_population": 4,
		"base_hp": 64.0,
		"base_speed": 10.6,
		"base_damage": 9.0
	},
	"orc": {
		"name_en": "Marauder Orc",
		"name_fr": "Orc Maraudeur",
		"clade": "goblinoid",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.78,
		"gestation_sec": 8.0,
		"min_population": 2,
		"base_hp": 135.0,
		"base_speed": 9.2,
		"base_damage": 18.0
	},
	"troll": {
		"name_en": "Magma Cavern Troll",
		"name_fr": "Troll des Cavernes",
		"clade": "goblinoid",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.80,
		"gestation_sec": 24.0,
		"min_population": 1,
		"base_hp": 290.0,
		"base_speed": 7.0,
		"base_damage": 32.0
	},
	"wolf": {
		"name_en": "Dire Forest Wolf",
		"name_fr": "Loup Sauvage",
		"clade": "therian",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.74,
		"gestation_sec": 9.5,
		"min_population": 3,
		"base_hp": 96.0,
		"base_speed": 12.4,
		"base_damage": 14.0
	},
	"lion": {
		"name_en": "Highland Mane Lion",
		"name_fr": "Lion des Hautes-Terres",
		"clade": "therian",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.79,
		"gestation_sec": 11.5,
		"min_population": 2,
		"base_hp": 145.0,
		"base_speed": 11.8,
		"base_damage": 20.0
	},
	"vulture": {
		"name_en": "Storm Sky Harpy",
		"name_fr": "Vautour Charognard",
		"clade": "avian",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.70,
		"gestation_sec": 12.0,
		"min_population": 2,
		"base_hp": 88.0,
		"base_speed": 13.0,
		"base_damage": 13.0
	},
	"dragon": {
		"name_en": "Caldera Sovereign Dragon",
		"name_fr": "Dragon Souverain de la Caldeira",
		"clade": "draconic",
		"is_prey": false,
		"is_peaceful_dragon": true,
		"aggression": 0.05,
		"gestation_sec": 58.0,
		"min_population": 1,
		"base_hp": 680.0,
		"base_speed": 9.8,
		"base_damage": 58.0
	},
	"shark": {
		"name_en": "Abyssal Land-Shark",
		"name_fr": "Requin Marcheur des Abysses",
		"clade": "abyssal",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.85,
		"gestation_sec": 18.0,
		"min_population": 2,
		"base_hp": 195.0,
		"base_speed": 11.2,
		"base_damage": 24.0
	},
	"giant_mole": {
		"name_en": "Subterranean Giant Mole",
		"name_fr": "Taupe Géante Fouisseuse",
		"clade": "subterranean",
		"is_prey": false,
		"is_peaceful_dragon": false,
		"aggression": 0.78,
		"gestation_sec": 15.0,
		"min_population": 2,
		"base_hp": 175.0,
		"base_speed": 8.6,
		"base_damage": 21.0
	},
	"deer": {
		"name_en": "Glimmer Elk",
		"name_fr": "Cerf Sylvestre",
		"clade": "herbivore",
		"is_prey": true,
		"is_peaceful_dragon": false,
		"aggression": 0.0,
		"gestation_sec": 6.5,
		"min_population": 3,
		"base_hp": 78.0,
		"base_speed": 12.2,
		"base_damage": 0.0
	},
	"rabbit": {
		"name_en": "Meadow Hare",
		"name_fr": "Lapin des Plaines",
		"clade": "herbivore",
		"is_prey": true,
		"is_peaceful_dragon": false,
		"aggression": 0.0,
		"gestation_sec": 3.2,
		"min_population": 4,
		"base_hp": 36.0,
		"base_speed": 14.0,
		"base_damage": 0.0
	}
}

const MUTATION_CATALOG: Dictionary = {
	"osteo_plating": {
		"name_en": "Osteoderm Carapace",
		"name_fr": "Carapace Ostéoderme",
		"hp_bonus": 0.22,
		"speed_bonus": -0.04,
		"strength_bonus": 0.08
	},
	"adrenal_surge": {
		"name_en": "Adrenal Hyper-Metabolism",
		"name_fr": "Surcharge Surrénale",
		"hp_bonus": 0.0,
		"speed_bonus": 0.20,
		"strength_bonus": 0.12
	},
	"venom_glands": {
		"name_en": "Neurotoxic Venom Glands",
		"name_fr": "Glandes Neurotoxiques",
		"hp_bonus": 0.05,
		"speed_bonus": 0.05,
		"strength_bonus": 0.18
	},
	"amphibious_lungs": {
		"name_en": "Amphibious Gill-Lungs",
		"name_fr": "Poumons Amphibies",
		"hp_bonus": 0.15,
		"speed_bonus": 0.16,
		"strength_bonus": 0.10
	},
	"subterranean_claws": {
		"name_en": "Tectonic Drill Claws",
		"name_fr": "Griffes Foreuses Tectoniques",
		"hp_bonus": 0.14,
		"speed_bonus": 0.04,
		"strength_bonus": 0.20
	},
	"thermal_scales": {
		"name_en": "Pyroclastic Magma Scales",
		"name_fr": "Écailles Pyroclastiques",
		"hp_bonus": 0.20,
		"speed_bonus": 0.0,
		"strength_bonus": 0.16
	}
}

const CORE_TEN_SPECIES: Array[String] = [
	"glimmer_elk",
	"meadow_hare",
	"beach_crab",
	"scavenger_goblin",
	"forest_wolf",
	"sky_harpy",
	"abyssal_shark",
	"tunnel_mole",
	"carrion_beetle",
	"sovereign_dragon"
]

const ConwayGridScript = preload("res://scripts/ecosystem/ConwayGrid.gd")

var conway_grid: RefCounted = ConwayGridScript.new()
var generation: int = 1
var eco_tick_count: int = 0
var island_number: int = 1

var dragon_wrath_active: bool = false
var dragon_provocation_count: int = 0
var shark_invasion_active: bool = false
var mole_eruption_active: bool = false
var shark_landings_count: int = 0
var mole_eruptions_count: int = 0

var prey_population: int = 10
var predator_population: int = 18
var total_population: int = 28
var prey_crisis_active: bool = false

var species_counts: Dictionary = {}
var gestation_queue: Array[Dictionary] = []
var active_genomes: Array[Dictionary] = []
var discovered_mutations: Array[String] = []
var patient_zero_registry: Dictionary = {}

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
var _next_genome_uid: int = 1


func _init() -> void:
	_rng.seed = 424242
	_init_default_species_counts()


func _ready() -> void:
	if conway_grid == null:
		conway_grid = ConwayGridScript.new()


func _init_default_species_counts() -> void:
	species_counts.clear()
	for sp_id in CORE_TEN_SPECIES:
		var spec: Dictionary = get_species_baseline(sp_id)
		species_counts[sp_id] = int(spec.get("min_population", 2))
	_recompute_population_totals()


## Attaches an external ConwayGrid instance if provided by MainGame.
func set_conway_grid(grid: Variant) -> void:
	if grid != null:
		conway_grid = grid


## Returns the baseline dictionary for a species ID (falling back to scavenger_goblin).
func get_species_baseline(species_id: String) -> Dictionary:
	if SPECIES_BASELINES.has(species_id):
		return SPECIES_BASELINES[species_id]
	return SPECIES_BASELINES["scavenger_goblin"]


## Returns the biological gestation duration in seconds for a species (e.g. 4.5s goblin vs 58.0s dragon).
func get_species_gestation_sec(species_id: String) -> float:
	var base: Dictionary = get_species_baseline(species_id)
	return float(base.get("gestation_sec", 8.0))


## Creates a Generation-1 (or specified generation) diploid genome for `species_id`.
func create_initial_genome(species_id: String = "scavenger_goblin", gen: int = 1) -> Dictionary:
	var base: Dictionary = get_species_baseline(species_id)
	var is_prey: bool = bool(base.get("is_prey", false))
	var is_dragon: bool = bool(base.get("is_peaceful_dragon", false)) or species_id == "sovereign_dragon" or species_id == "dragon"

	var speed_a1: float = _rng.randf_range(0.92, 1.08)
	var speed_a2: float = _rng.randf_range(0.92, 1.08)
	var hp_a1: float = _rng.randf_range(0.92, 1.08)
	var hp_a2: float = _rng.randf_range(0.92, 1.08)
	var str_a1: float = _rng.randf_range(0.92, 1.08)
	var str_a2: float = _rng.randf_range(0.92, 1.08)
	var size_a1: float = _rng.randf_range(0.94, 1.06)
	var size_a2: float = _rng.randf_range(0.94, 1.06)

	var speed_gene: float = (speed_a1 + speed_a2) * 0.5
	var hp_gene: float = (hp_a1 + hp_a2) * 0.5
	var strength_gene: float = (str_a1 + str_a2) * 0.5
	var size_gene: float = (size_a1 + size_a2) * 0.5

	var base_aggro: float = float(base.get("aggression", 0.65))
	var aggression_score: float = 0.0
	if is_prey:
		aggression_score = 0.0
	elif is_dragon:
		aggression_score = 1.0 if dragon_wrath_active else 0.05
	else:
		aggression_score = clampf(base_aggro * _rng.randf_range(0.90, 1.10), 0.05, 1.0)

	var mutations: Array[String] = []
	if species_id == "abyssal_shark" or species_id == "shark":
		if shark_invasion_active or _rng.randf() < 0.35:
			mutations.append("amphibious_lungs")
	elif species_id == "tunnel_mole" or species_id == "giant_mole":
		if mole_eruption_active or _rng.randf() < 0.35:
			mutations.append("subterranean_claws")

	var genome: Dictionary = {
		"uid": _next_genome_uid,
		"species_id": species_id,
		"species_name": String(base.get("name_en", species_id)),
		"species_name_fr": String(base.get("name_fr", species_id)),
		"clade": String(base.get("clade", "therian")),
		"generation": maxi(1, gen),
		"is_hybrid": false,
		"hybrid_parents": [],
		"is_prey": is_prey,
		"is_peaceful_dragon": is_dragon and not dragon_wrath_active,
		"speed_gene": speed_gene,
		"hp_gene": hp_gene,
		"strength_gene": strength_gene,
		"aggression_score": aggression_score,
		"size_gene": size_gene,
		"fertility_gene": _rng.randf_range(0.92, 1.12),
		"metabolism_gene": _rng.randf_range(0.90, 1.10),
		"speed_alleles": [speed_a1, speed_a2],
		"hp_alleles": [hp_a1, hp_a2],
		"strength_alleles": [str_a1, str_a2],
		"size_alleles": [size_a1, size_a2],
		"gestation_sec": float(base.get("gestation_sec", 8.0)),
		"maturation_sec": maxf(3.0, float(base.get("gestation_sec", 8.0)) * 0.65),
		"mutations": mutations,
		"is_patient_zero": false,
		"is_juvenile": false,
		"maturity_progress": 1.0
	}
	_next_genome_uid += 1
	_recompute_derived_stats(genome)
	return genome


## Alias for create_initial_genome().
func create_genome(species_id: String = "scavenger_goblin", gen: int = 1) -> Dictionary:
	return create_initial_genome(species_id, gen)


## Performs diploid gene crossover with ±10% mutation factor:
## `lerpf(a, b, randf()) * randf_range(0.90, 1.10)` clamped to [GENE_MIN_CLAMP, GENE_MAX_CLAMP].
func crossover_gene_value(gene_a: float, gene_b: float) -> float:
	var blended: float = lerpf(gene_a, gene_b, _rng.randf())
	var mutated: float = blended * _rng.randf_range(MUTATION_FACTOR_MIN, MUTATION_FACTOR_MAX)
	return clampf(mutated, GENE_MIN_CLAMP, GENE_MAX_CLAMP)


## Crosses two parent genomes to produce a child diploid genome with ±10% mutation drift,
## Mendelian dominant mutation inheritance (78% / 92%), and optional inter-species hybridization.
func crossover_genomes(parent_a: Dictionary, parent_b: Dictionary = {}) -> Dictionary:
	var pa: Dictionary = parent_a if not parent_a.is_empty() else create_initial_genome("scavenger_goblin", generation)
	var pb: Dictionary = parent_b if not parent_b.is_empty() else pa

	var sp_a: String = String(pa.get("species_id", "scavenger_goblin"))
	var sp_b: String = String(pb.get("species_id", sp_a))
	var base_a: Dictionary = get_species_baseline(sp_a)
	var base_b: Dictionary = get_species_baseline(sp_b)

	var became_hybrid: bool = sp_a != sp_b
	var child_species_id: String = sp_a
	var child_name_en: String = String(base_a.get("name_en", sp_a))
	var child_name_fr: String = String(base_a.get("name_fr", sp_a))
	if became_hybrid:
		child_name_en = "%s-%s Hybrid" % [String(base_a.get("name_en", sp_a)).split(" ")[-1], String(base_b.get("name_en", sp_b)).split(" ")[-1]]
		child_name_fr = "Hybride %s-%s" % [String(base_a.get("name_fr", sp_a)).split(" ")[0], String(base_b.get("name_fr", sp_b)).split(" ")[0]]

	var child_gen: int = maxi(int(pa.get("generation", 1)), int(pb.get("generation", 1))) + 1
	generation = maxi(generation, child_gen)

	var speed_gene: float = crossover_gene_value(float(pa.get("speed_gene", 1.0)), float(pb.get("speed_gene", 1.0)))
	var hp_gene: float = crossover_gene_value(float(pa.get("hp_gene", 1.0)), float(pb.get("hp_gene", 1.0)))
	var strength_gene: float = crossover_gene_value(float(pa.get("strength_gene", 1.0)), float(pb.get("strength_gene", 1.0)))
	var size_gene: float = crossover_gene_value(float(pa.get("size_gene", 1.0)), float(pb.get("size_gene", 1.0)))

	var is_prey: bool = bool(pa.get("is_prey", false)) and bool(pb.get("is_prey", false))
	var is_dragon: bool = (sp_a == "sovereign_dragon" or sp_a == "dragon" or sp_b == "sovereign_dragon" or sp_b == "dragon")

	var aggression_score: float = 0.0
	if is_prey:
		aggression_score = 0.0
	elif is_dragon and not dragon_wrath_active:
		aggression_score = 0.05
	elif is_dragon and dragon_wrath_active:
		aggression_score = 1.0
	else:
		var agg_blend: float = lerpf(float(pa.get("aggression_score", 0.65)), float(pb.get("aggression_score", 0.65)), _rng.randf())
		aggression_score = clampf(agg_blend * _rng.randf_range(MUTATION_FACTOR_MIN, MUTATION_FACTOR_MAX), 0.05, 1.0)

	# Mendelian dominant inheritance of adaptive mutations (78% single parent, 92% both parents)
	var muts_a: Array = pa.get("mutations", [])
	var muts_b: Array = pb.get("mutations", [])
	var child_mutations: Array[String] = []
	var all_parent_muts: Dictionary = {}
	for m in muts_a:
		all_parent_muts[String(m)] = true
	for m in muts_b:
		all_parent_muts[String(m)] = true

	for mut_id in all_parent_muts.keys():
		var in_a: bool = muts_a.has(mut_id)
		var in_b: bool = muts_b.has(mut_id)
		var pass_prob: float = 0.92 if (in_a and in_b) else 0.78
		if _rng.randf() < pass_prob:
			child_mutations.append(String(mut_id))

	# Spontaneous de novo mutation (12% chance)
	var new_mutation_id: String = ""
	var is_patient_zero: bool = false
	if _rng.randf() < 0.12 and not is_prey:
		var keys: Array = MUTATION_CATALOG.keys()
		var candidate: String = String(keys[_rng.randi() % keys.size()])
		if not child_mutations.has(candidate):
			child_mutations.append(candidate)
			new_mutation_id = candidate
			if not discovered_mutations.has(candidate):
				discovered_mutations.append(candidate)
				is_patient_zero = true

	var child_gestation: float = lerpf(
		float(pa.get("gestation_sec", get_species_gestation_sec(sp_a))),
		float(pb.get("gestation_sec", get_species_gestation_sec(sp_b))),
		0.5
	)

	var child: Dictionary = {
		"uid": _next_genome_uid,
		"species_id": child_species_id,
		"species_name": child_name_en,
		"species_name_fr": child_name_fr,
		"clade": String(base_a.get("clade", "therian")),
		"generation": child_gen,
		"is_hybrid": became_hybrid,
		"hybrid_parents": [sp_a, sp_b] if became_hybrid else [],
		"is_prey": is_prey,
		"is_peaceful_dragon": is_dragon and not dragon_wrath_active,
		"speed_gene": speed_gene,
		"hp_gene": hp_gene,
		"strength_gene": strength_gene,
		"aggression_score": aggression_score,
		"size_gene": size_gene,
		"fertility_gene": crossover_gene_value(float(pa.get("fertility_gene", 1.0)), float(pb.get("fertility_gene", 1.0))),
		"metabolism_gene": crossover_gene_value(float(pa.get("metabolism_gene", 1.0)), float(pb.get("metabolism_gene", 1.0))),
		"speed_alleles": [float(pa.get("speed_gene", 1.0)), float(pb.get("speed_gene", 1.0))],
		"hp_alleles": [float(pa.get("hp_gene", 1.0)), float(pb.get("hp_gene", 1.0))],
		"strength_alleles": [float(pa.get("strength_gene", 1.0)), float(pb.get("strength_gene", 1.0))],
		"size_alleles": [float(pa.get("size_gene", 1.0)), float(pb.get("size_gene", 1.0))],
		"gestation_sec": child_gestation,
		"maturation_sec": maxf(3.0, child_gestation * 0.65),
		"mutations": child_mutations,
		"new_mutation_id": new_mutation_id,
		"is_patient_zero": is_patient_zero,
		"is_juvenile": true,
		"maturity_progress": 0.35
	}
	_next_genome_uid += 1
	_recompute_derived_stats(child)

	if is_patient_zero and new_mutation_id != "":
		patient_zero_registry[new_mutation_id] = child
		mutation_discovered.emit(new_mutation_id, child_species_id, child)

	return child


## Alias for crossover_genomes().
func crossover(parent_a: Dictionary, parent_b: Dictionary = {}) -> Dictionary:
	return crossover_genomes(parent_a, parent_b)


## Alias for crossover_genomes().
func breed_genomes(parent_a: Dictionary, parent_b: Dictionary = {}) -> Dictionary:
	return crossover_genomes(parent_a, parent_b)


## Computes derived combat/movement stats and Darwinian fitness_score on a genome dictionary.
func _recompute_derived_stats(genome: Dictionary) -> void:
	var sp_id: String = String(genome.get("species_id", "scavenger_goblin"))
	var base: Dictionary = get_species_baseline(sp_id)
	var is_prey: bool = bool(genome.get("is_prey", false))

	var hp_mult: float = float(genome.get("hp_gene", 1.0))
	var spd_mult: float = float(genome.get("speed_gene", 1.0))
	var str_mult: float = float(genome.get("strength_gene", 1.0))

	var muts: Array = genome.get("mutations", [])
	for m in muts:
		var m_key: String = String(m)
		if MUTATION_CATALOG.has(m_key):
			var m_spec: Dictionary = MUTATION_CATALOG[m_key]
			hp_mult += float(m_spec.get("hp_bonus", 0.0))
			spd_mult += float(m_spec.get("speed_bonus", 0.0))
			str_mult += float(m_spec.get("strength_bonus", 0.0))

	genome["max_hp"] = maxf(12.0, float(base.get("base_hp", 70.0)) * hp_mult)
	genome["move_speed"] = maxf(4.0, float(base.get("base_speed", 10.0)) * spd_mult)
	genome["attack_damage"] = 0.0 if is_prey else maxf(2.0, float(base.get("base_damage", 10.0)) * str_mult)
	genome["scale_factor"] = clampf(float(genome.get("size_gene", 1.0)), 0.55, 2.40)
	genome["fitness_score"] = (hp_mult * 0.35 + spd_mult * 0.30 + str_mult * 0.35) * (1.0 + float(muts.size()) * 0.14)


## Queues a pregnancy into `gestation_queue` with species-specific gestation time
## (e.g., 4.5s for scavenger_goblin vs 58.0s for sovereign_dragon).
func queue_gestation(species_or_parent_a, parent_b: Dictionary = {}, spawn_pos: Vector3 = Vector3.ZERO, custom_gestation_sec: float = -1.0) -> Dictionary:
	var pa: Dictionary = {}
	var sp_id: String = "scavenger_goblin"

	if typeof(species_or_parent_a) == TYPE_STRING:
		sp_id = String(species_or_parent_a)
		pa = create_initial_genome(sp_id, generation)
	elif typeof(species_or_parent_a) == TYPE_DICTIONARY:
		pa = species_or_parent_a
		sp_id = String(pa.get("species_id", "scavenger_goblin"))
	else:
		pa = create_initial_genome(sp_id, generation)

	var pb: Dictionary = parent_b if not parent_b.is_empty() else create_initial_genome(sp_id, int(pa.get("generation", generation)))
	var child_genome: Dictionary = crossover_genomes(pa, pb)
	var gest_sec: float = custom_gestation_sec if custom_gestation_sec > 0.0 else float(child_genome.get("gestation_sec", get_species_gestation_sec(sp_id)))

	var entry: Dictionary = {
		"species_id": String(child_genome.get("species_id", sp_id)),
		"parent_a": pa,
		"parent_b": pb,
		"child_genome": child_genome,
		"genome": child_genome,
		"remaining_sec": gest_sec,
		"total_sec": gest_sec,
		"spawn_pos": spawn_pos,
		"is_hybrid": bool(child_genome.get("is_hybrid", false)),
		"new_mutation_id": String(child_genome.get("new_mutation_id", ""))
	}
	gestation_queue.append(entry)
	return entry


## Alias for queue_gestation().
func enqueue_gestation(species_or_parent_a, parent_b: Dictionary = {}, spawn_pos: Vector3 = Vector3.ZERO, custom_gestation_sec: float = -1.0) -> Dictionary:
	return queue_gestation(species_or_parent_a, parent_b, spawn_pos, custom_gestation_sec)


## Advances all active pregnancies in `gestation_queue` by `delta` seconds and returns completed births.
func update_gestation(delta: float) -> Array[Dictionary]:
	var completed: Array[Dictionary] = []
	var remaining: Array[Dictionary] = []

	for entry in gestation_queue:
		var rem: float = float(entry.get("remaining_sec", 0.0)) - delta
		entry["remaining_sec"] = rem
		if rem <= 0.0:
			var sp_id: String = String(entry.get("species_id", "scavenger_goblin"))
			species_counts[sp_id] = int(species_counts.get(sp_id, 0)) + 1
			completed.append(entry)
			offspring_born.emit(entry)
		else:
			remaining.append(entry)

	gestation_queue = remaining
	if not completed.is_empty():
		_recompute_population_totals()
	return completed


## Evaluates extinction protection across all 10 species: if any species falls below its
## refuge minimum and has no active gestation, spawns refuge re-immigrants so hidden species always return.
func check_extinction_and_reimmigrate(live_counts: Dictionary = {}) -> Array[Dictionary]:
	if not live_counts.is_empty():
		for k in live_counts.keys():
			species_counts[String(k)] = int(live_counts[k])

	var pending_by_species: Dictionary = {}
	for entry in gestation_queue:
		var s: String = String(entry.get("species_id", ""))
		pending_by_species[s] = int(pending_by_species.get(s, 0)) + 1

	var reimmigrants: Array[Dictionary] = []
	for sp_id in CORE_TEN_SPECIES:
		var spec: Dictionary = get_species_baseline(sp_id)
		var min_pop: int = maxi(1, int(spec.get("min_population", 2)))
		var cur_pop: int = int(species_counts.get(sp_id, 0)) + int(pending_by_species.get(sp_id, 0))
		if cur_pop < min_pop:
			var needed: int = min_pop - cur_pop
			for _i in range(needed):
				var angle: float = _rng.randf() * TAU
				var dist: float = _rng.randf_range(58.0, 112.0)
				var refuge_pos: Vector3 = Vector3(cos(angle) * dist, 0.0, sin(angle) * dist)
				var genome: Dictionary = create_initial_genome(sp_id, generation)
				species_counts[sp_id] = int(species_counts.get(sp_id, 0)) + 1
				reimmigrants.append({
					"species_id": sp_id,
					"genome": genome,
					"spawn_pos": refuge_pos,
					"reason": "refuge_reimmigration"
				})
			species_reimmigrated.emit(sp_id, needed)

	_recompute_population_totals()
	return reimmigrants


## Alias for check_extinction_and_reimmigrate().
func enforce_extinction_protection(live_counts: Dictionary = {}) -> Array[Dictionary]:
	return check_extinction_and_reimmigrate(live_counts)


## Provokes the Sovereign Dragon clade! Once a single dragon is attacked by the player,
## all Sovereign Dragons permanently switch from peaceful majesty (`aggression_score = 0.05`)
## to relentless apex wrath (`dragon_wrath_active = true`, `aggression_score = 1.0`).
func provoke_dragon_species(_reason: String = "attacked_by_player") -> void:
	var was_active: bool = dragon_wrath_active
	dragon_wrath_active = true
	dragon_provocation_count += 1
	for g in active_genomes:
		var sp: String = String(g.get("species_id", ""))
		if sp == "sovereign_dragon" or sp == "dragon" or bool(g.get("is_peaceful_dragon", false)):
			g["is_peaceful_dragon"] = false
			g["aggression_score"] = 1.0
	if not was_active:
		dragon_wrath_triggered.emit()


## Alias for provoke_dragon_species().
func trigger_dragon_wrath() -> void:
	provoke_dragon_species("manual_trigger")


## Returns true if Sovereign Dragons have been provoked into Dragon Wrath.
func is_dragon_hostile() -> bool:
	return dragon_wrath_active


## Triggers or updates the Abyssal Land-Shark amphibious coastal invasion event.
func trigger_shark_invasion(active: bool = true) -> Dictionary:
	shark_invasion_active = active
	if active:
		shark_landings_count += 1
		if not discovered_mutations.has("amphibious_lungs"):
			discovered_mutations.append("amphibious_lungs")
		shark_invasion_triggered.emit()
		shark_invasion_started.emit()
	return {
		"shark_invasion_active": shark_invasion_active,
		"shark_landings_count": shark_landings_count,
		"genome": create_initial_genome("abyssal_shark", generation)
	}


## Triggers or updates the Subterranean Giant Mole tectonic eruption event.
func trigger_mole_eruption(active: bool = true) -> Dictionary:
	mole_eruption_active = active
	if active:
		mole_eruptions_count += 1
		if not discovered_mutations.has("subterranean_claws"):
			discovered_mutations.append("subterranean_claws")
		mole_eruption_triggered.emit()
		mole_eruption_started.emit()
	return {
		"mole_eruption_active": mole_eruption_active,
		"mole_eruptions_count": mole_eruptions_count,
		"genome": create_initial_genome("tunnel_mole", generation)
	}


## Updates the living herbivore prey population and evaluates ecological prey crisis status.
func update_prey_population(prey_count: int, pred_count: int = -1) -> void:
	prey_population = maxi(0, prey_count)
	if pred_count >= 0:
		predator_population = pred_count
	total_population = prey_population + predator_population
	var was_crisis: bool = prey_crisis_active
	prey_crisis_active = (prey_population <= PREY_CRISIS_THRESHOLD)
	if was_crisis != prey_crisis_active:
		prey_crisis_changed.emit(prey_crisis_active, prey_population)
		if prey_crisis_active:
			prey_crisis_started.emit()


## Alias for update_prey_population().
func set_prey_population(prey_count: int) -> void:
	update_prey_population(prey_count, predator_population)


## Returns the Player/Sanctuary natural HP regeneration multiplier based on herbivore conservation:
## - Thriving herbivore population (>= 8): 1.35x bonus regen
## - Healthy herbivore population (3..7): 1.00x normal regen
## - Prey extinction crisis (<= 2): 0.35x severe ecological famine penalty
func get_hp_regen_multiplier() -> float:
	if prey_crisis_active or prey_population <= PREY_CRISIS_THRESHOLD:
		return 0.35
	if prey_population >= 8:
		return 1.35
	return 1.0


## Recomputes `prey_population`, `predator_population`, and `total_population` from `species_counts`.
func _recompute_population_totals() -> void:
	var prey_sum: int = 0
	var pred_sum: int = 0
	for sp_id in species_counts.keys():
		var cnt: int = maxi(0, int(species_counts[sp_id]))
		var spec: Dictionary = get_species_baseline(String(sp_id))
		if bool(spec.get("is_prey", false)):
			prey_sum += cnt
		else:
			pred_sum += cnt
	update_prey_population(prey_sum, pred_sum)


## Setup hook called by MainGame._instantiate_subsystems().
func setup(grid: Variant = null) -> void:
	if grid != null:
		conway_grid = grid


## Callback invoked by MainGame.force_conway_eco_tick() after ConwayGrid.step_generation().
func on_conway_step(conway_summary: Dictionary = {}) -> Dictionary:
	eco_tick_count += 1
	if conway_summary.has("generation"):
		generation = maxi(generation, int(conway_summary.get("generation", generation)))
	else:
		generation += 1
	var newborns: Array[Dictionary] = update_gestation(10.0)
	var reimmigrants: Array[Dictionary] = check_extinction_and_reimmigrate()
	if eco_tick_count >= 2 and not shark_invasion_active and _rng.randf() < 0.35:
		trigger_shark_invasion(true)
	if eco_tick_count >= 3 and not mole_eruption_active and _rng.randf() < 0.35:
		trigger_mole_eruption(true)
	var summary: Dictionary = {
		"generation": generation,
		"eco_tick_count": eco_tick_count,
		"conway": conway_summary,
		"newborns": newborns,
		"reimmigrants": reimmigrants
	}
	generation_advanced.emit(generation, summary)
	return summary


## Advances one full Eco-Tick (steps Conway 32x32 grid, updates gestation timers,
## evaluates emerging threats, and enforces refuge re-immigration).
func step_ecosystem(delta_sec: float = 10.0, live_counts: Dictionary = {}) -> Dictionary:
	eco_tick_count += 1
	var conway_stats: Dictionary = conway_grid.step_generation()
	generation = maxi(generation, int(conway_stats.get("generation", generation)))

	var newborns: Array[Dictionary] = update_gestation(delta_sec)
	var reimmigrants: Array[Dictionary] = check_extinction_and_reimmigrate(live_counts)

	# Emerging ecological threats at generation milestones
	if eco_tick_count >= 2 and not shark_invasion_active and _rng.randf() < 0.35:
		trigger_shark_invasion(true)
	if eco_tick_count >= 3 and not mole_eruption_active and _rng.randf() < 0.35:
		trigger_mole_eruption(true)

	var summary: Dictionary = {
		"generation": generation,
		"eco_tick_count": eco_tick_count,
		"conway": conway_stats,
		"newborns": newborns,
		"reimmigrants": reimmigrants,
		"gestation_queue_size": gestation_queue.size(),
		"prey_population": prey_population,
		"predator_population": predator_population,
		"total_population": total_population,
		"prey_crisis_active": prey_crisis_active,
		"hp_regen_multiplier": get_hp_regen_multiplier(),
		"dragon_wrath_active": dragon_wrath_active,
		"shark_invasion_active": shark_invasion_active,
		"mole_eruption_active": mole_eruption_active,
		"discovered_mutations": discovered_mutations.duplicate()
	}
	generation_advanced.emit(generation, summary)
	return summary


## Alias for step_ecosystem().
func tick_ecosystem(delta_sec: float = 10.0, live_counts: Dictionary = {}) -> Dictionary:
	return step_ecosystem(delta_sec, live_counts)


## Resets the entire genetic & Conway ecosystem for a new Roguelike run or next island.
func reset_for_new_run(new_island_number: int = 1) -> void:
	island_number = maxi(1, new_island_number)
	generation = 1
	eco_tick_count = 0
	dragon_wrath_active = false
	dragon_provocation_count = 0
	shark_invasion_active = false
	mole_eruption_active = false
	shark_landings_count = 0
	mole_eruptions_count = 0
	prey_crisis_active = false
	gestation_queue.clear()
	active_genomes.clear()
	discovered_mutations.clear()
	patient_zero_registry.clear()
	conway_grid.seed_initial_pattern(1337 + island_number * 97)
	_init_default_species_counts()


## Alias for reset_for_new_run() called by MainGame.restart_from_zero().
func reset_ecosystem(new_island_number: int = 1) -> void:
	reset_for_new_run(new_island_number)


## Alias for reset_for_new_run().
func reset_for_next_island(next_island_number: int) -> void:
	reset_for_new_run(next_island_number)


## Returns localized summary telemetry for HUDController.gd.
func get_ecosystem_summary(lang: String = "en") -> Dictionary:
	var is_fr: bool = (lang == "fr")
	return {
		"generation": generation,
		"eco_tick_count": eco_tick_count,
		"island_number": island_number,
		"conway_alive_cells": conway_grid.get_alive_count(),
		"conway_fertility": conway_grid.get_average_fertility(),
		"prey_population": prey_population,
		"predator_population": predator_population,
		"total_population": total_population,
		"prey_crisis_active": prey_crisis_active,
		"hp_regen_multiplier": get_hp_regen_multiplier(),
		"dragon_wrath_active": dragon_wrath_active,
		"dragon_status_label": (
			("🔥 Colère Draconique !" if is_fr else "🔥 Dragon Wrath Active!")
			if dragon_wrath_active
			else ("🕊️ Souverain Pacifique" if is_fr else "🕊️ Peaceful Sovereign")
		),
		"shark_invasion_active": shark_invasion_active,
		"mole_eruption_active": mole_eruption_active,
		"gestating_count": gestation_queue.size(),
		"discovered_mutations": discovered_mutations.duplicate()
	}
