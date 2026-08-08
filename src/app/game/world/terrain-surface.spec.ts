import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERRAIN_SURFACE,
  TERRAIN_SURFACE_INDEX,
  TERRAIN_SURFACES,
  terrainSurfaceById,
} from './terrain-surface.types';

describe('terrain surface catalog', () => {
  it('contains the complete authored palette with stable atlas indices', () => {
    expect(TERRAIN_SURFACES).toHaveLength(24);
    expect(new Set(TERRAIN_SURFACES.map((surface) => surface.id)).size).toBe(24);
    expect(TERRAIN_SURFACES.map((surface) => surface.atlasIndex)).toEqual(
      Array.from({ length: 24 }, (_, index) => index),
    );
    expect(terrainSurfaceById('asphalt').name).toBe('Asphalt');
    expect(terrainSurfaceById('cobblestone').family).toBe('paving');
    expect(terrainSurfaceById('shallow-water').water).toBe(true);
  });

  it('starts with a fully weighted meadow grass layer', () => {
    expect(DEFAULT_TERRAIN_SURFACE).toBe('meadow-grass');
    expect(TERRAIN_SURFACE_INDEX[DEFAULT_TERRAIN_SURFACE]).toBe(0);
  });
});
