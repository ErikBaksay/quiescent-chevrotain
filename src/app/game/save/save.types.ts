export type SaveVector3 = readonly [number, number, number];
export type SaveQuaternion = readonly [number, number, number, number];

export interface SaveWorldConfig {
  readonly width: number;
  readonly depth: number;
  readonly sampleSpacing: number;
}

export interface SaveEnvironmentState {
  readonly timeOfDayMinutes: number;
}

export interface SaveCameraState {
  readonly position: SaveVector3;
  readonly target: SaveVector3;
}

export interface SaveObjectRecord {
  readonly assetId: string;
  readonly shapeId: string;
  readonly paletteId: string;
  readonly position: SaveVector3;
  readonly quaternion: SaveQuaternion;
  readonly scale: SaveVector3;
  readonly materialOverrides: Readonly<Record<string, string | number>>;
}

export interface SaveVegetationRecord {
  readonly assetId: string;
  readonly position: SaveVector3;
  readonly quaternion: SaveQuaternion;
  readonly scale: SaveVector3;
  readonly variantIndex: number;
  readonly tint: SaveVector3;
}

export type TerrainHeightChange = readonly [index: number, height: number];
export type TerrainSurfaceChange = readonly [
  index: number,
  id0: number,
  id1: number,
  id2: number,
  id3: number,
  weight0: number,
  weight1: number,
  weight2: number,
  weight3: number,
];

export interface SaveTerrainData {
  readonly heightChanges: readonly TerrainHeightChange[];
  readonly surfaceChanges: readonly TerrainSurfaceChange[];
}

export interface WorldSaveV2 {
  readonly format: 'quiescent-chevrotain-save';
  readonly version: 2;
  readonly savedAt: string;
  readonly world: SaveWorldConfig;
  readonly camera: SaveCameraState;
  readonly objects: readonly SaveObjectRecord[];
  readonly vegetation: readonly SaveVegetationRecord[];
  readonly terrain: SaveTerrainData;
}

export interface WorldSaveV3 extends Omit<WorldSaveV2, 'version'> {
  readonly version: 3;
  readonly environment: SaveEnvironmentState;
}

export type WorldSave = WorldSaveV3;

export interface SaveLoadWarning {
  readonly assetIds: readonly string[];
  readonly message: string;
}
