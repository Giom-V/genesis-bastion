## @file scripts/core/GameConfig.gd
## @description Centralized configuration module for Genesis Bastion (Godot 4.3 Engine Edition).
## Groups all world dimensions, Conway cellular automaton parameters, diploid genetics & mutation bounds,
## balanced <=1%/monster mastery curve constants, Bastion sanctuary coordinates, and asset paths.
class_name GameConfig
extends RefCounted

# ==============================================================================
# 1. WORLD & TERRAIN DIMENSIONS
# ==============================================================================
const WORLD_SIZE: float = 270.0
const ISLAND_RADIUS: float = 135.0
const WATER_LEVEL: float = -1.2
const SANCTUARY_RADIUS: float = 18.0
const HEIGHT_GRID_RESOLUTION: int = 257
const BIOME_GRID_RESOLUTION: int = 129

# ==============================================================================
# 2. CONWAY CELLULAR AUTOMATON & DARWINIAN GENETICS
# ==============================================================================
const CONWAY_GRID_SIZE: int = 32
const ECO_TICK_INTERVAL_SEC: float = 10.0
const MUTATION_FACTOR_MIN: float = 0.90
const MUTATION_FACTOR_MAX: float = 1.10
const INITIAL_WORLD_POPULATION: int = 44
const MAX_WORLD_POPULATION: int = 96

# ==============================================================================
# 3. PLAYER, BASTION & BALANCED MASTERY (<= 1%/MONSTER DIMINISHING RETURNS)
# ==============================================================================
const PLAYER_BASE_HP: float = 160.0
const PLAYER_BASE_SPEED: float = 14.5
const PLAYER_SPRINT_MULTIPLIER: float = 1.48
const PLAYER_BASE_MELEE_DAMAGE: float = 24.0
const PLAYER_MELEE_RANGE: float = 6.2
const BASTION_INITIAL_HP: float = 500.0
const MAX_RELIC_FRAGMENTS: int = 3

## Mastery diminishing returns constants (Giom's Phase 11 rule: <= 1% per monster, max +15% per species)
const MASTERY_TIER1_MAX_KILLS: int = 5
const MASTERY_TIER1_BONUS_PER_KILL: float = 0.01     # +1.0% per kill (1..5 -> +5.0%)
const MASTERY_TIER2_MAX_KILLS: int = 15
const MASTERY_TIER2_BONUS_PER_KILL: float = 0.005    # +0.5% per kill (6..15 -> +10.0%)
const MASTERY_TIER3_BONUS_PER_KILL: float = 0.0025   # +0.25% per kill (16..35 -> +15.0%)
const MASTERY_MAX_SPECIES_BONUS: float = 0.15        # +15.0% hard cap per species
const MASTERY_MAX_TOTAL_BONUS: float = 0.30          # +30.0% global cap

# ==============================================================================
# 4. 60 FPS LOD & CULLING THRESHOLDS
# ==============================================================================
const ENEMY_ANIM_LOD_DISTANCE: float = 48.0
const ENEMY_CULL_DISTANCE: float = 95.0

# ==============================================================================
# 5. ASSET PATHS (BLENDER 5.0 .GLB, LYRIA 3 STEMS, BILINGUAL TTS & PORTRAITS)
# ==============================================================================
const MODEL_PATHS: Dictionary = {
	"player_warden": "res://assets/models/player_warden.glb",
	"hero_guardian": "res://assets/models/hero_guardian.glb",
	"npc_survivor": "res://assets/models/npc_survivor.glb",
	"bastion_sanctuary": "res://assets/models/bastion_sanctuary.glb",
	"relic_monolith": "res://assets/models/relic_monolith.glb",
	"glimmer_elk": "res://assets/models/glimmer_elk.glb",
	"meadow_hare": "res://assets/models/meadow_hare.glb",
	"beach_crab": "res://assets/models/beach_crab.glb",
	"scavenger_goblin": "res://assets/models/scavenger_goblin.glb",
	"forest_wolf": "res://assets/models/forest_wolf.glb",
	"sky_harpy": "res://assets/models/sky_harpy.glb",
	"abyssal_shark": "res://assets/models/abyssal_shark.glb",
	"tunnel_mole": "res://assets/models/tunnel_mole.glb",
	"carrion_beetle": "res://assets/models/carrion_beetle.glb",
	"sovereign_dragon": "res://assets/models/sovereign_dragon.glb",
	"goblin": "res://assets/models/goblin.glb",
	"orc": "res://assets/models/orc.glb",
	"troll": "res://assets/models/troll.glb",
	"wolf": "res://assets/models/wolf.glb",
	"lion": "res://assets/models/lion.glb",
	"vulture": "res://assets/models/vulture.glb",
	"dragon": "res://assets/models/dragon.glb",
	"shark": "res://assets/models/shark.glb",
	"giant_mole": "res://assets/models/giant_mole.glb",
	"deer": "res://assets/models/deer.glb",
	"rabbit": "res://assets/models/rabbit.glb",
}

const LYRIA_TRACK_PATHS: Dictionary = {
	"explore": "res://assets/audio/lyria/explore_lyria.wav",
	"combat": "res://assets/audio/lyria/combat_lyria.wav",
	"requiem": "res://assets/audio/lyria/requiem_gameover_lyria.wav",
}

const PORTRAIT_PATHS: Dictionary = {
	"aldric_neutral": "res://assets/portraits/aldric_neutral.png",
	"aldric_combat": "res://assets/portraits/aldric_combat.png",
	"aldric_scholar": "res://assets/portraits/aldric_scholar.png",
	"kaelen_scout": "res://assets/portraits/kaelen_scout.png",
	"kaelen_shocked": "res://assets/portraits/kaelen_shocked.png",
	"kaelen_proud": "res://assets/portraits/kaelen_proud.png",
	"specimen_fire_troll": "res://assets/portraits/specimen_fire_troll.png",
	"specimen_dragon_sovereign": "res://assets/portraits/specimen_dragon_sovereign.png",
	"specimen_land_shark": "res://assets/portraits/specimen_land_shark.png",
	"specimen_giant_mole": "res://assets/portraits/specimen_giant_mole.png",
}

## Computes the diminishing-returns mastery bonus fraction (`0.0 .. 0.15`) for `kills` kills.
static func compute_mastery_bonus(kills: int) -> float:
	if kills <= 0:
		return 0.0
	var tier1: int = mini(kills, MASTERY_TIER1_MAX_KILLS)
	var tier2: int = clampi(kills - MASTERY_TIER1_MAX_KILLS, 0, MASTERY_TIER2_MAX_KILLS - MASTERY_TIER1_MAX_KILLS)
	var tier3: int = maxi(0, kills - MASTERY_TIER2_MAX_KILLS)
	var bonus: float = float(tier1) * MASTERY_TIER1_BONUS_PER_KILL \
		+ float(tier2) * MASTERY_TIER2_BONUS_PER_KILL \
		+ float(tier3) * MASTERY_TIER3_BONUS_PER_KILL
	return minf(MASTERY_MAX_SPECIES_BONUS, bonus)
