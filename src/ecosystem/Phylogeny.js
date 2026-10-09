/**
 * @fileoverview Phylogenetic Tree, Evolutionary Distance Matrix & Inter-Species Hybridization Engine.
 *
 * This module manages evolutionary relationships across the 7 foundational species of Genesis Bastion
 * (`goblin`, `orc`, `troll`, `wolf`, `lion`, `vulture`, `dragon`) grouped into three major clades
 * (`greenskin`, `beast`, `apex`).
 *
 * Primary Use Cases:
 * 1. Computing symmetric phylogenetic distance between any two species or existing hybrids.
 * 2. Determining reproductive compatibility (`canHybridize`) based on `CONFIG.ECO.HYBRID_MAX_DIST`.
 * 3. Calculating distance-weighted inter-species hybridization probabilities (`getHybridProbability`)
 *    that exceed spontaneous de novo mutation rates when compatible sister species share an optimal
 *    ecological niche.
 * 4. Synthesizing hybrid species definitions (`createHybridSpec`) with curated French dark-fantasy
 *    lore nomenclature (e.g., `"Goblorc"`, `"Olog-Troll"`, `"Griffon Sauvage"`, `"Drak-Troll"`) and
 *    blended morphological/combat traits.
 * 5. Exporting structured graph topology (`getPhylogenyGraphData`), species catalogs (`getAllSpecies`),
 *    and Mendelian dominant mutation catalogs (`getMutationsCatalog`) for the UI Phylogenetic Codex.
 */

import { CONFIG } from '../config.js';

/**
 * Canonical ordering of the 7 foundational species for deterministic pair keys.
 * @type {readonly string[]}
 */
const CANONICAL_SPECIES_ORDER = Object.freeze([
  'goblin',
  'orc',
  'troll',
  'wolf',
  'lion',
  'vulture',
  'dragon',
]);

/**
 * Built-in fallback phylogenetic distance matrix matching the Genesis Bastion evolutionary specification.
 * Used as a safety fallback if `CONFIG.PHYLOGENY_DIST` omits a symmetric entry.
 * @type {Readonly<Record<string, Readonly<Record<string, number>>>>}
 */
const FALLBACK_PHYLOGENY_DIST = Object.freeze({
  goblin: { goblin: 0.0, orc: 0.18, troll: 0.32, wolf: 0.62, lion: 0.72, vulture: 0.78, dragon: 0.85 },
  orc: { goblin: 0.18, orc: 0.0, troll: 0.22, wolf: 0.44, lion: 0.60, vulture: 0.72, dragon: 0.75 },
  troll: { goblin: 0.32, orc: 0.22, troll: 0.0, wolf: 0.58, lion: 0.64, vulture: 0.68, dragon: 0.42 },
  wolf: { goblin: 0.62, orc: 0.44, troll: 0.58, wolf: 0.0, lion: 0.20, vulture: 0.40, dragon: 0.74 },
  lion: { goblin: 0.72, orc: 0.60, troll: 0.64, wolf: 0.20, lion: 0.0, vulture: 0.35, dragon: 0.62 },
  vulture: { goblin: 0.78, orc: 0.72, troll: 0.68, wolf: 0.40, lion: 0.35, vulture: 0.0, dragon: 0.38 },
  dragon: { goblin: 0.85, orc: 0.75, troll: 0.42, wolf: 0.74, lion: 0.62, vulture: 0.38, dragon: 0.0 },
});

/**
 * Built-in fallback species metadata if `CONFIG.SPECIES` is partially populated during isolated tests.
 * @type {Readonly<Record<string, object>>}
 */
const FALLBACK_SPECIES = Object.freeze({
  goblin: {
    id: 'goblin',
    name: 'Gobelin',
    clade: 'greenskin',
    baseHp: 48,
    baseSpeed: 8.8,
    baseDamage: 8,
    baseSize: 0.78,
    baseGestationTime: 9,
    baseMaturationTime: 12,
    baseAggressiveness: 0.75,
    aggroStance: 'hostile',
    repopulationCooldown: 8,
    repopulationHabitatLabel: 'terriers forestiers',
    color: '#5a8f3d',
    accentColor: '#9ccf63',
    preferredBiome: 'forest',
    metabolism: 3.2,
    fertility: 1.25,
    aggroRadius: 18,
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    clade: 'greenskin',
    baseHp: 95,
    baseSpeed: 6.8,
    baseDamage: 15,
    baseSize: 1.08,
    baseGestationTime: 18,
    baseMaturationTime: 22,
    baseAggressiveness: 0.88,
    aggroStance: 'hostile',
    repopulationCooldown: 16,
    repopulationHabitatLabel: 'campements des plaines',
    color: '#3f6a34',
    accentColor: '#c87d32',
    preferredBiome: 'plains',
    metabolism: 4.8,
    fertility: 1.05,
    aggroRadius: 22,
  },
  troll: {
    id: 'troll',
    name: 'Troll',
    clade: 'greenskin',
    baseHp: 175,
    baseSpeed: 5.1,
    baseDamage: 24,
    baseSize: 1.52,
    baseGestationTime: 30,
    baseMaturationTime: 34,
    baseAggressiveness: 0.48,
    aggroStance: 'territorial',
    repopulationCooldown: 18,
    repopulationHabitatLabel: 'cavernes des hautes terres',
    color: '#4e635e',
    accentColor: '#8ba89c',
    preferredBiome: 'highlands',
    metabolism: 7.2,
    fertility: 0.85,
    aggroRadius: 24,
  },
  wolf: {
    id: 'wolf',
    name: 'Loup',
    clade: 'beast',
    baseHp: 58,
    baseSpeed: 9.6,
    baseDamage: 11,
    baseSize: 0.88,
    baseGestationTime: 13,
    baseMaturationTime: 15,
    baseAggressiveness: 0.82,
    aggroStance: 'hostile',
    repopulationCooldown: 12,
    repopulationHabitatLabel: 'tanières sylvestres',
    color: '#6e7785',
    accentColor: '#b8c4d4',
    preferredBiome: 'forest',
    metabolism: 3.8,
    fertility: 1.2,
    aggroRadius: 25,
  },
  lion: {
    id: 'lion',
    name: 'Lion',
    clade: 'beast',
    baseHp: 110,
    baseSpeed: 8.2,
    baseDamage: 18,
    baseSize: 1.15,
    baseGestationTime: 24,
    baseMaturationTime: 26,
    baseAggressiveness: 0.70,
    aggroStance: 'hostile',
    repopulationCooldown: 16,
    repopulationHabitatLabel: 'hautes herbes dorées',
    color: '#c8963e',
    accentColor: '#7a491b',
    preferredBiome: 'plains',
    metabolism: 5.4,
    fertility: 1.0,
    aggroRadius: 26,
  },
  vulture: {
    id: 'vulture',
    name: 'Vautour',
    clade: 'beast',
    baseHp: 64,
    baseSpeed: 10.2,
    baseDamage: 13,
    baseSize: 0.92,
    baseGestationTime: 15,
    baseMaturationTime: 17,
    baseAggressiveness: 0.38,
    aggroStance: 'territorial',
    repopulationCooldown: 12,
    repopulationHabitatLabel: 'falaises rocheuses',
    color: '#5c4938',
    accentColor: '#d96b43',
    preferredBiome: 'highlands',
    metabolism: 3.5,
    fertility: 1.1,
    aggroRadius: 28,
  },
  dragon: {
    id: 'dragon',
    name: 'Dragon',
    clade: 'apex',
    baseHp: 680,
    baseSpeed: 8.2,
    baseDamage: 58,
    baseSize: 2.05,
    baseGestationTime: 65,
    baseMaturationTime: 50,
    baseAggressiveness: 0.08,
    aggroStance: 'pacifist_apex',
    repopulationCooldown: 28,
    repopulationHabitatLabel: 'sommets de la caldeira volcanique',
    color: '#8f2424',
    accentColor: '#ff7b29',
    preferredBiome: 'volcanic',
    metabolism: 10.5,
    fertility: 0.65,
    aggroRadius: 34,
    xpReward: 180,
  },
});

/**
 * Curated lore names for sister-species and cross-clade hybrids keyed by sorted pair `spA_spB`.
 * @type {Readonly<Record<string, string>>}
 */
const CURATED_HYBRID_NAMES = Object.freeze({
  goblin_orc: 'Goblorc',
  orc_troll: 'Olog-Troll',
  goblin_troll: 'Traque-Troll',
  wolf_lion: 'Warg-Lion',
  lion_vulture: 'Griffon Sauvage',
  wolf_vulture: 'Lycan-Rapace',
  vulture_dragon: 'Wyverne Cendrée',
  troll_dragon: 'Drak-Troll',
  orc_wolf: 'Chevaucheur Garou',
});

/**
 * Normalizes a species identifier or species object into a lowercase species ID string.
 * If a hybrid ID (e.g. `'goblin_orc'` or `'hybrid_goblin_orc'`) is passed, returns the normalized string.
 *
 * @param {string|object} speciesOrId - Species ID string or species/genome object.
 * @returns {string} Normalized species identifier.
 */
function normalizeSpeciesId(speciesOrId) {
  if (!speciesOrId) return '';
  if (typeof speciesOrId === 'string') {
    return speciesOrId.trim().toLowerCase();
  }
  if (typeof speciesOrId === 'object') {
    if (typeof speciesOrId.speciesId === 'string') {
      return speciesOrId.speciesId.trim().toLowerCase();
    }
    if (typeof speciesOrId.id === 'string') {
      return speciesOrId.id.trim().toLowerCase();
    }
  }
  return '';
}

/**
 * Extracts constituent base species IDs from a base or hybrid species identifier.
 * For example, `'goblin'` -> `['goblin']`, `'goblin_orc'` -> `['goblin', 'orc']`.
 *
 * @param {string|object} speciesOrId - Species ID string or object.
 * @returns {string[]} Array of 1 or 2 base species IDs.
 */
function extractBaseSpeciesIds(speciesOrId) {
  if (speciesOrId && typeof speciesOrId === 'object') {
    if (Array.isArray(speciesOrId.hybridParents) && speciesOrId.hybridParents.length >= 2) {
      return speciesOrId.hybridParents.slice(0, 2).map((s) => normalizeSpeciesId(s));
    }
    if (Array.isArray(speciesOrId.parentSpecies) && speciesOrId.parentSpecies.length >= 2) {
      return speciesOrId.parentSpecies.slice(0, 2).map((s) => normalizeSpeciesId(s));
    }
  }

  const rawId = normalizeSpeciesId(speciesOrId).replace(/^hybrid_/, '');
  if (!rawId) return [];

  const catalog = CONFIG?.SPECIES || FALLBACK_SPECIES;
  if (catalog[rawId] || FALLBACK_SPECIES[rawId]) {
    return [rawId];
  }

  const parts = rawId.split(/[_-]+/).filter(Boolean);
  const validParts = parts.filter((p) => Boolean(catalog[p] || FALLBACK_SPECIES[p]));
  if (validParts.length >= 2) {
    return [validParts[0], validParts[1]];
  }
  return [rawId];
}

/**
 * Sorts two base species IDs into canonical order so `(A, B)` and `(B, A)` map identically.
 *
 * @param {string} spA - First base species ID.
 * @param {string} spB - Second base species ID.
 * @returns {[string, string]} Canonically ordered pair `[first, second]`.
 */
function sortSpeciesPair(spA, spB) {
  const idxA = CANONICAL_SPECIES_ORDER.indexOf(spA);
  const idxB = CANONICAL_SPECIES_ORDER.indexOf(spB);
  if (idxA !== -1 && idxB !== -1) {
    return idxA <= idxB ? [spA, spB] : [spB, spA];
  }
  return spA <= spB ? [spA, spB] : [spB, spA];
}

/**
 * Parses a CSS hex color string (`'#rrggbb'`) or numeric hex (`0xrrggbb`) into RGB `[r, g, b]`.
 *
 * @param {string|number} color - Input color in hex string or number format.
 * @returns {[number, number, number]} RGB components in `[0..255]`.
 */
function parseColorToRgb(color) {
  if (typeof color === 'number' && Number.isFinite(color)) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return [r, g, b];
  }
  if (typeof color === 'string') {
    const clean = color.replace(/^#/, '').trim();
    if (clean.length === 6) {
      const num = parseInt(clean, 16);
      if (!Number.isNaN(num)) {
        return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
      }
    }
  }
  return [120, 140, 100];
}

/**
 * Blends two colors (`#rrggbb` or numeric `0xrrggbb`) and returns the result in the same format
 * as `colorA`, along with both string and numeric representations.
 *
 * @param {string|number} colorA - First parent color.
 * @param {string|number} colorB - Second parent color.
 * @param {number} [t=0.5] - Interpolation factor in `[0, 1]`.
 * @returns {{ primary: string|number, hexString: string, hexNumber: number }} Blended color representations.
 */
function blendSpeciesColors(colorA, colorB, t = 0.5) {
  const [r1, g1, b1] = parseColorToRgb(colorA);
  const [r2, g2, b2] = parseColorToRgb(colorB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  const hexNumber = (r << 16) | (g << 8) | b;
  const hexString = `#${hexNumber.toString(16).padStart(6, '0')}`;
  const primary = typeof colorA === 'number' ? hexNumber : hexString;
  return { primary, hexString, hexNumber };
}

/**
 * Looks up base species metadata from `CONFIG.SPECIES` with fallback to `FALLBACK_SPECIES`.
 *
 * @param {string} speciesId - Base species identifier.
 * @returns {object} Species configuration object.
 */
function getBaseSpeciesSpec(speciesId) {
  const catalog = CONFIG?.SPECIES || FALLBACK_SPECIES;
  return catalog[speciesId] || FALLBACK_SPECIES[speciesId] || FALLBACK_SPECIES.goblin;
}

/**
 * Computes the evolutionary phylogenetic distance between two species (`0.0` for identical species,
 * up to `1.0` for maximally distant lineages). Uses `CONFIG.PHYLOGENY_DIST` with symmetric fallback.
 * Also supports hybrid identifiers by averaging constituent parent distances.
 *
 * @param {string|object} speciesA - First species ID or object.
 * @param {string|object} speciesB - Second species ID or object.
 * @returns {number} Phylogenetic distance in `[0.0, 1.0]`.
 */
export function getPhylogeneticDistance(speciesA, speciesB) {
  const idA = normalizeSpeciesId(speciesA);
  const idB = normalizeSpeciesId(speciesB);
  if (!idA || !idB) return 1.0;
  if (idA === idB) return 0.0;

  const matrix = CONFIG?.PHYLOGENY_DIST || FALLBACK_PHYLOGENY_DIST;

  // Direct lookup in CONFIG.PHYLOGENY_DIST or fallback matrix
  const directAB = matrix?.[idA]?.[idB];
  if (typeof directAB === 'number') return directAB;
  const directBA = matrix?.[idB]?.[idA];
  if (typeof directBA === 'number') return directBA;

  const fallbackAB = FALLBACK_PHYLOGENY_DIST?.[idA]?.[idB] ?? FALLBACK_PHYLOGENY_DIST?.[idB]?.[idA];
  if (typeof fallbackAB === 'number') return fallbackAB;

  // Handle hybrid species IDs (e.g. 'goblin_orc' vs 'orc' or 'goblin_orc' vs 'orc_troll')
  const basesA = extractBaseSpeciesIds(speciesA);
  const basesB = extractBaseSpeciesIds(speciesB);
  if (basesA.length > 1 || basesB.length > 1) {
    const sortedKeyA = basesA.length === 2 ? sortSpeciesPair(basesA[0], basesA[1]).join('_') : basesA[0];
    const sortedKeyB = basesB.length === 2 ? sortSpeciesPair(basesB[0], basesB[1]).join('_') : basesB[0];
    if (sortedKeyA === sortedKeyB) return 0.0;

    let totalDist = 0;
    let count = 0;
    for (const bA of basesA) {
      for (const bB of basesB) {
        const d =
          matrix?.[bA]?.[bB] ??
          matrix?.[bB]?.[bA] ??
          FALLBACK_PHYLOGENY_DIST?.[bA]?.[bB] ??
          FALLBACK_PHYLOGENY_DIST?.[bB]?.[bA] ??
          0.85;
        totalDist += d;
        count += 1;
      }
    }
    return count > 0 ? Number((totalDist / count).toFixed(3)) : 0.85;
  }

  return 0.85;
}

/**
 * Determines whether two distinct species are evolutionarily close enough to interbreed
 * and produce viable hybrid offspring (`speciesA !== speciesB` and distance `<= CONFIG.ECO.HYBRID_MAX_DIST`).
 *
 * @param {string|object} speciesA - First species ID or object.
 * @param {string|object} speciesB - Second species ID or object.
 * @returns {boolean} True if the two species can hybridize.
 */
export function canHybridize(speciesA, speciesB) {
  const idA = normalizeSpeciesId(speciesA).replace(/^hybrid_/, '');
  const idB = normalizeSpeciesId(speciesB).replace(/^hybrid_/, '');
  if (!idA || !idB || idA === idB) {
    return false;
  }

  const basesA = extractBaseSpeciesIds(speciesA);
  const basesB = extractBaseSpeciesIds(speciesB);
  if (basesA.length === 2 && basesB.length === 2) {
    const pairA = sortSpeciesPair(basesA[0], basesA[1]).join('_');
    const pairB = sortSpeciesPair(basesB[0], basesB[1]).join('_');
    if (pairA === pairB) return false;
  }

  const maxDist = CONFIG?.ECO?.HYBRID_MAX_DIST ?? 0.45;
  const dist = getPhylogeneticDistance(speciesA, speciesB);
  return dist > 0 && dist <= maxDist;
}

/**
 * Computes the probability `[0.0, 1.0]` that two adjacent creatures of different species will
 * hybridize during an optimal reproduction tick.
 *
 * When compatible (`canHybridize(speciesA, speciesB) === true`), the hybridization probability is
 * strictly higher than the spontaneous de novo mutation rate (`CONFIG.ECO.MUTATION_RATE = 0.08`)
 * and scales inversely with phylogenetic distance:
 * - Close sister species (e.g., `goblin` + `orc`, dist `0.18`) -> `~0.22` (22%)
 * - `wolf` + `lion` (dist `0.20`) -> `~0.21` (21%)
 * - `orc` + `troll` (dist `0.22`) -> `~0.20` (20%)
 * - Cross-clade boundary pairs (e.g., `orc` + `wolf`, dist `0.44`) -> `~0.11` (11%, still > 8% mutation rate)
 * - Incompatible distant pairs (e.g., `goblin` + `dragon`, dist `0.85`) -> `0.0` (0%)
 *
 * @param {string|object} speciesA - First species ID or object.
 * @param {string|object} speciesB - Second species ID or object.
 * @returns {number} Hybridization probability in `[0.0, 1.0]`.
 */
export function getHybridProbability(speciesA, speciesB) {
  if (!canHybridize(speciesA, speciesB)) {
    return 0.0;
  }

  const dist = getPhylogeneticDistance(speciesA, speciesB);
  const maxDist = CONFIG?.ECO?.HYBRID_MAX_DIST ?? 0.45;
  const baseChance = CONFIG?.ECO?.HYBRID_BASE_CHANCE ?? 0.22;
  const mutationRate = CONFIG?.ECO?.MUTATION_RATE ?? 0.08;

  // Floor for valid hybrids is strictly above spontaneous mutation rate (e.g. 0.11 > 0.08)
  const minHybridChance = Math.max(mutationRate + 0.03, baseChance * 0.5);
  // Reference closest sister distance is 0.18 (goblin + orc), where probability equals baseChance (0.22)
  const minRefDist = 0.18;
  const normalizedSpan = Math.max(0.01, maxDist - minRefDist);
  const t = Math.max(0, Math.min(1, (dist - minRefDist) / normalizedSpan));

  const probability = baseChance - t * (baseChance - minHybridChance);
  return Number(Math.max(minHybridChance, Math.min(0.45, probability)).toFixed(4));
}

/**
 * Generates a complete hybrid species specification combining the morphology, colors, and base stats
 * of `speciesA` and `speciesB`, with curated lore names for sister-species and cross-clade hybrids.
 *
 * Also supports passing a single hybrid key (e.g., `createHybridSpec('goblin_orc')`) for convenience.
 *
 * @param {string|object} speciesA - First parent species ID/object (or combined `'spA_spB'` hybrid ID).
 * @param {string|object} [speciesB] - Second parent species ID/object.
 * @returns {{
 *   id: string,
 *   name: string,
 *   parentSpecies: [string, string],
 *   clade: string,
 *   color: string|number,
 *   colorHex: string,
 *   accentColor: string|number,
 *   accentColorHex: string,
 *   baseHp: number,
 *   baseSpeed: number,
 *   baseDamage: number,
 *   baseSize: number,
 *   metabolism: number,
 *   aggroRadius: number,
 *   preferredBiome: string,
 *   phylogeneticDistance: number,
 *   isHybrid: boolean
 * }} Synthesized hybrid metadata object.
 */
export function createHybridSpec(speciesA, speciesB) {
  let baseA = '';
  let baseB = '';

  if (!speciesB) {
    const extracted = extractBaseSpeciesIds(speciesA);
    baseA = extracted[0] || 'goblin';
    baseB = extracted[1] || 'orc';
  } else {
    const extractedA = extractBaseSpeciesIds(speciesA);
    const extractedB = extractBaseSpeciesIds(speciesB);
    baseA = extractedA[0] || 'goblin';
    baseB = extractedB[0] === baseA && extractedB[1] ? extractedB[1] : extractedB[0] || 'orc';
  }

  const [sortedA, sortedB] = sortSpeciesPair(baseA, baseB);
  const pairKey = `${sortedA}_${sortedB}`;

  const specA = getBaseSpeciesSpec(sortedA);
  const specB = getBaseSpeciesSpec(sortedB);

  // Curated lore name or deterministic portmanteau combiner
  let loreName = CURATED_HYBRID_NAMES[pairKey];
  if (!loreName) {
    const nameA = specA.name || sortedA;
    const nameB = specB.name || sortedB;
    const prefixA = nameA.slice(0, Math.max(3, Math.ceil(nameA.length * 0.6)));
    loreName = `${prefixA}-${nameB}`;
  }

  const blendedPrimary = blendSpeciesColors(specA.color, specB.color, 0.5);
  const blendedAccent = blendSpeciesColors(
    specA.accentColor || specA.color,
    specB.accentColor || specB.color,
    0.5
  );

  // Hybrid vigor ("hétérosis"): slight boost (+6% HP/Damage, +3% Speed/Size) over arithmetic parent mean
  const baseHp = Math.round(((specA.baseHp + specB.baseHp) * 0.5) * 1.06);
  const baseSpeed = Number((((specA.baseSpeed + specB.baseSpeed) * 0.5) * 1.03).toFixed(2));
  const baseDamage = Math.round(((specA.baseDamage + specB.baseDamage) * 0.5) * 1.06);
  const baseSize = Number((((specA.baseSize + specB.baseSize) * 0.5) * 1.04).toFixed(2));
  const baseGestationTime = Number(
    (
      ((specA.baseGestationTime ?? FALLBACK_SPECIES[sortedA]?.baseGestationTime ?? 18) +
        (specB.baseGestationTime ?? FALLBACK_SPECIES[sortedB]?.baseGestationTime ?? 18)) *
      0.5
    ).toFixed(1)
  );
  const baseMaturationTime = Number(
    (
      ((specA.baseMaturationTime ?? FALLBACK_SPECIES[sortedA]?.baseMaturationTime ?? 20) +
        (specB.baseMaturationTime ?? FALLBACK_SPECIES[sortedB]?.baseMaturationTime ?? 20)) *
      0.5
    ).toFixed(1)
  );
  const baseAggressiveness = Number(
    (
      ((specA.baseAggressiveness ?? FALLBACK_SPECIES[sortedA]?.baseAggressiveness ?? 0.65) +
        (specB.baseAggressiveness ?? FALLBACK_SPECIES[sortedB]?.baseAggressiveness ?? 0.65)) *
      0.5
    ).toFixed(2)
  );
  const aggroStance =
    specA.aggroStance === 'hostile' || specB.aggroStance === 'hostile'
      ? 'hostile'
      : specA.aggroStance === 'territorial' || specB.aggroStance === 'territorial'
        ? 'territorial'
        : specA.aggroStance || 'hostile';
  const metabolism = Number(
    ((((specA.metabolism ?? 4.0) + (specB.metabolism ?? 4.0)) * 0.5) * 1.05).toFixed(2)
  );
  const fertility = Number(
    ((((specA.fertility ?? 1.0) + (specB.fertility ?? 1.0)) * 0.5) * 1.02).toFixed(2)
  );
  const aggroRadius = Math.round(((specA.aggroRadius ?? 20) + (specB.aggroRadius ?? 20)) * 0.5);
  const xpReward = Math.round((((specA.xpReward ?? 25) + (specB.xpReward ?? 25)) * 0.5) * 1.25);

  const clade =
    specA.clade === specB.clade ? specA.clade : `${specA.clade}/${specB.clade}`;

  return {
    id: pairKey,
    name: loreName,
    parentSpecies: [sortedA, sortedB],
    clade,
    color: blendedPrimary.hexString,
    colorCss: blendedPrimary.hexString,
    colorHex: blendedPrimary.hexNumber,
    accentColor: blendedAccent.hexString,
    accentCss: blendedAccent.hexString,
    accentHex: blendedAccent.hexNumber,
    baseHp,
    baseSpeed,
    baseDamage,
    baseSize,
    baseGestationTime,
    baseMaturationTime,
    baseAggressiveness,
    aggroStance,
    metabolism,
    fertility,
    aggroRadius,
    xpReward,
    preferredBiome: specA.preferredBiome || specB.preferredBiome || 'plains',
    phylogeneticDistance: getPhylogeneticDistance(sortedA, sortedB),
    isHybrid: true,
  };
}

/**
 * Returns the complete list of foundational species metadata objects in canonical phylogenetic order.
 *
 * @returns {Array<object>} Array of species configuration objects.
 */
export function getAllSpecies() {
  const catalog = CONFIG?.SPECIES || FALLBACK_SPECIES;
  const keys = Object.keys(catalog);
  const orderedKeys = [
    ...CANONICAL_SPECIES_ORDER.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !CANONICAL_SPECIES_ORDER.includes(k)),
  ];
  return orderedKeys.map((id) => ({
    ...FALLBACK_SPECIES[id],
    ...catalog[id],
    id,
  }));
}

/**
 * Returns the catalog of all Mendelian dominant mutations from `CONFIG.MUTATIONS`.
 *
 * @returns {Array<object>} Array of mutation definition objects.
 */
export function getMutationsCatalog() {
  const mutations = CONFIG?.MUTATIONS || {};
  return Object.entries(mutations).map(([key, mut]) => ({
    id: key,
    ...mut,
    dominant: mut.dominant !== undefined ? mut.dominant : true,
  }));
}

/**
 * Builds and returns the complete phylogenetic network graph data (nodes, weighted distance edges,
 * viable hybrid specs, and clade groupings) for rendering the UI Phylogenetic Tree & Codex modal.
 *
 * @returns {{
 *   nodes: Array<object>,
 *   edges: Array<object>,
 *   links: Array<object>,
 *   hybrids: Array<object>,
 *   clades: Record<string, Array<string>>,
 *   maxHybridDistance: number
 * }} Phylogenetic graph topology and hybrid catalog.
 */
export function getPhylogenyGraphData() {
  const speciesList = getAllSpecies();
  const maxHybridDistance = CONFIG?.ECO?.HYBRID_MAX_DIST ?? 0.45;

  const nodes = speciesList.map((sp, index) => ({
    id: sp.id,
    name: sp.name,
    label: sp.name,
    clade: sp.clade,
    color: sp.color,
    accentColor: sp.accentColor,
    baseHp: sp.baseHp,
    baseSpeed: sp.baseSpeed,
    baseDamage: sp.baseDamage,
    baseSize: sp.baseSize,
    baseGestationTime: sp.baseGestationTime,
    baseMaturationTime: sp.baseMaturationTime,
    baseAggressiveness: sp.baseAggressiveness,
    aggroStance: sp.aggroStance,
    repopulationCooldown: sp.repopulationCooldown,
    repopulationHabitatLabel: sp.repopulationHabitatLabel,
    preferredBiome: sp.preferredBiome,
    orderIndex: index,
  }));

  const edges = [];
  const hybrids = [];

  for (let i = 0; i < speciesList.length; i += 1) {
    for (let j = i + 1; j < speciesList.length; j += 1) {
      const spA = speciesList[i].id;
      const spB = speciesList[j].id;
      const distance = getPhylogeneticDistance(spA, spB);
      const hybridizable = canHybridize(spA, spB);
      const probability = getHybridProbability(spA, spB);
      const hybridSpec = hybridizable ? createHybridSpec(spA, spB) : null;

      if (hybridSpec) {
        hybrids.push(hybridSpec);
      }

      edges.push({
        id: `${spA}__${spB}`,
        source: spA,
        target: spB,
        speciesA: spA,
        speciesB: spB,
        distance,
        weight: Number((1 - Math.min(1, distance)).toFixed(3)),
        canHybridize: hybridizable,
        hybridProbability: probability,
        hybridId: hybridSpec ? hybridSpec.id : null,
        hybridName: hybridSpec ? hybridSpec.name : null,
        hybridSpec,
        sameClade: speciesList[i].clade === speciesList[j].clade,
      });
    }
  }

  const clades = {
    greenskin: speciesList.filter((s) => s.clade === 'greenskin').map((s) => s.id),
    beast: speciesList.filter((s) => s.clade === 'beast').map((s) => s.id),
    apex: speciesList.filter((s) => s.clade === 'apex').map((s) => s.id),
  };

  return {
    nodes,
    edges,
    links: edges,
    hybrids,
    clades,
    maxHybridDistance,
  };
}
