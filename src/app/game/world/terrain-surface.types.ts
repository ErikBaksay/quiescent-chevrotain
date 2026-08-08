export const TERRAIN_SURFACE_FAMILIES = [
  'grass',
  'earth',
  'sand',
  'aggregate',
  'stone',
  'paving',
  'water',
] as const;
export type TerrainSurfaceFamily = (typeof TERRAIN_SURFACE_FAMILIES)[number];

export const TERRAIN_SURFACE_IDS = [
  'meadow-grass',
  'short-mown-grass',
  'dry-meadow-grass',
  'mossy-ground',
  'leaf-litter',
  'dark-loam',
  'red-clay',
  'muddy-earth',
  'pale-sand',
  'beach-sand',
  'river-sand',
  'fine-gravel',
  'river-pebbles',
  'crushed-limestone',
  'slate-chips',
  'exposed-rock',
  'granite-slabs',
  'cobblestone',
  'brick-pavers',
  'concrete',
  'asphalt',
  'worn-asphalt',
  'gravel-shoulder',
  'shallow-water',
] as const;
export type TerrainSurfaceId = (typeof TERRAIN_SURFACE_IDS)[number];

export const TERRAIN_SURFACE_LAYER_COUNT = 4;
export const TERRAIN_SURFACE_ATLAS_COLUMNS = 6;
export const TERRAIN_SURFACE_ATLAS_ROWS = 4;
export const DEFAULT_TERRAIN_SURFACE: TerrainSurfaceId = 'meadow-grass';

export interface TerrainSurfaceDefinition {
  readonly id: TerrainSurfaceId;
  readonly name: string;
  readonly family: TerrainSurfaceFamily;
  readonly atlasIndex: number;
  /** World metres covered by one material repeat. */
  readonly tiling: number;
  readonly roughness: number;
  readonly normalStrength: number;
  readonly tint: number;
  readonly water: boolean;
}

export interface TerrainSurfaceLayers {
  readonly ids: readonly [number, number, number, number];
  readonly weights: readonly [number, number, number, number];
}

const surface = (
  id: TerrainSurfaceId,
  name: string,
  family: TerrainSurfaceFamily,
  atlasIndex: number,
  tiling: number,
  roughness: number,
  normalStrength: number,
  tint: number,
  water = false,
): TerrainSurfaceDefinition => ({
  id,
  name,
  family,
  atlasIndex,
  tiling,
  roughness,
  normalStrength,
  tint,
  water,
});

export const TERRAIN_SURFACES: readonly TerrainSurfaceDefinition[] = [
  surface('meadow-grass', 'Meadow grass', 'grass', 0, 7, 0.96, 0.5, 0x8ea96a),
  surface('short-mown-grass', 'Short grass', 'grass', 1, 5, 0.92, 0.38, 0x98ad70),
  surface('dry-meadow-grass', 'Dry meadow', 'grass', 2, 6, 0.94, 0.45, 0xb3a06a),
  surface('mossy-ground', 'Mossy ground', 'grass', 3, 4.5, 0.9, 0.6, 0x6e956b),
  surface('leaf-litter', 'Leaf litter', 'earth', 4, 3.5, 0.86, 0.48, 0x806248),
  surface('dark-loam', 'Dark loam', 'earth', 5, 3.2, 0.98, 0.32, 0x4b3826),
  surface('red-clay', 'Red clay', 'earth', 6, 3.8, 0.93, 0.42, 0x9e5a3f),
  surface('muddy-earth', 'Muddy earth', 'earth', 7, 3.2, 0.72, 0.3, 0x5d513d),
  surface('pale-sand', 'Pale sand', 'sand', 8, 4.5, 0.9, 0.3, 0xd8c795),
  surface('beach-sand', 'Beach sand', 'sand', 9, 5, 0.82, 0.28, 0xcaa968),
  surface('river-sand', 'River sand', 'sand', 10, 4, 0.8, 0.35, 0xa9a28d),
  surface('fine-gravel', 'Fine gravel', 'aggregate', 11, 3.2, 0.88, 0.58, 0x918c7f),
  surface('river-pebbles', 'River pebbles', 'aggregate', 12, 2.5, 0.58, 0.7, 0x96917e),
  surface('crushed-limestone', 'Crushed limestone', 'aggregate', 13, 3, 0.9, 0.55, 0xbab5a5),
  surface('slate-chips', 'Slate chips', 'stone', 14, 2.6, 0.64, 0.72, 0x595b5a),
  surface('exposed-rock', 'Exposed rock', 'stone', 15, 5, 0.62, 0.78, 0x777872),
  surface('granite-slabs', 'Granite slabs', 'paving', 16, 3.8, 0.52, 0.62, 0x99978e),
  surface('cobblestone', 'Cobblestone', 'paving', 17, 2.2, 0.66, 0.62, 0x77756b),
  surface('brick-pavers', 'Brick pavers', 'paving', 18, 2.4, 0.8, 0.55, 0x9d5948),
  surface('concrete', 'Concrete', 'paving', 19, 5, 0.82, 0.38, 0x9d9c93),
  surface('asphalt', 'Asphalt', 'paving', 20, 5.5, 0.9, 0.3, 0x454744),
  surface('worn-asphalt', 'Worn asphalt', 'paving', 21, 5.5, 0.86, 0.32, 0x696860),
  surface('gravel-shoulder', 'Gravel shoulder', 'aggregate', 22, 3.8, 0.9, 0.54, 0x958b74),
  surface('shallow-water', 'Shallow water', 'water', 23, 3.5, 0.18, 0.16, 0x72a99e, true),
];

export const TERRAIN_SURFACE_INDEX: Readonly<Record<TerrainSurfaceId, number>> = Object.fromEntries(
  TERRAIN_SURFACES.map((item) => [item.id, item.atlasIndex]),
) as Record<TerrainSurfaceId, number>;

export function terrainSurfaceById(id: TerrainSurfaceId): TerrainSurfaceDefinition {
  return TERRAIN_SURFACES[TERRAIN_SURFACE_INDEX[id]];
}

export function terrainSurfaceIdFromIndex(index: number): TerrainSurfaceId {
  return TERRAIN_SURFACES[Math.max(0, Math.min(TERRAIN_SURFACES.length - 1, Math.round(index)))].id;
}
