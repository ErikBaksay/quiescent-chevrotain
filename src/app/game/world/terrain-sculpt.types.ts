export type TerrainSculptTool = 'raise' | 'lower' | 'smooth' | 'flatten';

export interface TerrainBrushSettings {
  readonly size: number;
  readonly strength: number;
  readonly falloff: number;
}

export const DEFAULT_TERRAIN_BRUSH: TerrainBrushSettings = {
  size: 32,
  strength: 0.35,
  falloff: 0.75,
};

export const TERRAIN_BRUSH_LIMITS = {
  minSize: 4,
  maxSize: 200,
  minStrength: 0.05,
  maxStrength: 1,
  minFalloff: 0,
  maxFalloff: 1,
} as const;
