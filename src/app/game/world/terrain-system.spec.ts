import { BufferAttribute, BufferGeometry, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { TerrainSystem } from './terrain-system';
import { WorldConfig } from './world.config';

const config: WorldConfig = {
  width: 100,
  depth: 100,
  terrain: {
    sampleSpacing: 2,
    tileSize: 50,
    minHeight: -100,
    maxHeight: 100,
    baseHeight: 0,
  },
  camera: {
    near: 0.5,
    far: 500,
    initialPosition: [40, 40, 40],
    initialTarget: [0, 0, 0],
    minDistance: 8,
    maxDistance: 200,
  },
};

describe('TerrainSystem', () => {
  it('creates a shared logical grid and tiled render surface', () => {
    const terrain = new TerrainSystem(config);

    expect(terrain.sampleCountX).toBe(51);
    expect(terrain.sampleCountZ).toBe(51);
    expect(terrain.heightData).toHaveLength(51 * 51);
    expect(terrain.tileCount).toBe(4);
    expect(terrain.getHeightAtWorld(0, 0)).toBe(0);

    terrain.dispose();
  });

  it('maps world coordinates and clamps heightfield edges', () => {
    const terrain = new TerrainSystem(config);

    expect(terrain.worldToSample({ x: 0, z: 0 })).toEqual({ x: 25, z: 25 });
    expect(terrain.sampleToWorld(25, 25)).toEqual({ x: 0, z: 0 });
    expect(terrain.worldToSample({ x: -1_000, z: 1_000 })).toEqual({ x: 0, z: 50 });

    terrain.setHeightAtSample(0, 0, 150);
    terrain.setHeightAtSample(50, 50, -150);
    expect(terrain.getHeightAtSample(0, 0)).toBe(100);
    expect(terrain.getHeightAtSample(50, 50)).toBe(-100);

    terrain.dispose();
  });

  it('refreshes terrain tiles after a local height edit', () => {
    const terrain = new TerrainSystem(config);
    const tileMeshes = terrain.root.children;
    const firstPosition = (tileMeshes[0] as Mesh<BufferGeometry>).geometry.getAttribute(
      'position',
    ) as BufferAttribute;
    const original = firstPosition.getY(0);

    terrain.setHeightAtSample(0, 0, 12);
    terrain.updateRegion(0, 0, 0, 0);

    expect(firstPosition.getY(0)).toBe(12);
    expect(firstPosition.getY(0)).not.toBe(original);
    terrain.dispose();
  });
});
