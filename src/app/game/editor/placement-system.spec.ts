import { Group, Mesh, PlaneGeometry, PerspectiveCamera, Scene, Vector2 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ResolvedAssetDefinition } from '../../assets/asset.types';
import { AssetManager } from '../assets/asset-manager';
import { PlacementSystem } from './placement-system';
import { TerrainSystem } from '../world/terrain-system';
import { WorldConfig } from '../world/world.config';

const terrainConfig: WorldConfig = {
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
    initialPosition: [0, 20, 20],
    initialTarget: [0, 0, 0],
    minDistance: 8,
    maxDistance: 200,
  },
};

const asset: ResolvedAssetDefinition = {
  id: 'courthouse',
  name: 'Courthouse',
  category: 'civic',
  model: 'model.glb',
  thumbnail: 'thumbnail.webp',
  defaultScale: 1,
  manifestUrl: 'https://example.test/asset.json',
  modelUrl: 'https://example.test/model.glb',
  thumbnailUrl: 'https://example.test/thumbnail.webp',
};

describe('PlacementSystem', () => {
  it('loads a ghost, snaps placement, and remains ready for continuous placement', async () => {
    const scene = new Scene();
    const terrain = new Mesh(new PlaneGeometry(100, 100));
    terrain.rotation.x = -Math.PI / 2;
    scene.add(terrain);
    const camera = new PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(0.4, 20, 20.4);
    camera.lookAt(0.4, 0, 0.4);
    scene.updateMatrixWorld(true);
    const createInstance = vi.fn(async () => {
      const root = new Group();
      root.add(new Mesh(new PlaneGeometry(1, 1)));
      return root;
    });
    const createPlacementPreview = vi.fn(async () => {
      const root = new Group();
      root.add(new Mesh(new PlaneGeometry(1, 1)));
      return root;
    });
    const manager = { createInstance, createPlacementPreview } as unknown as AssetManager;
    const system = new PlacementSystem(scene, terrain, manager, vi.fn());

    await system.begin(asset);
    system.setGridSnapEnabled(true);
    expect(system.updatePointer(new Vector2(0, 0), camera)).toBe(true);
    const placed = await system.createAtCurrentPoint();

    expect(system.state).toMatchObject({ activeAssetId: 'courthouse', status: 'ready' });
    expect(placed?.kind).toBe('object');
    if (placed?.kind === 'object') {
      expect(placed.object.position.x).toBe(Math.round(placed.object.position.x));
    }
    expect(createPlacementPreview).toHaveBeenCalledTimes(1);
    expect(createInstance).toHaveBeenCalledTimes(1);
    system.dispose();
    terrain.geometry.dispose();
  });

  it('places objects at the sculpted terrain height', async () => {
    const scene = new Scene();
    const terrain = new TerrainSystem(terrainConfig);
    scene.add(terrain.root);
    terrain.setHeightAtSample(25, 25, 10);
    terrain.updateRegion(25, 25, 25, 25);
    const camera = new PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(0, 20, 20);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    scene.updateMatrixWorld(true);
    const manager = {
      createInstance: vi.fn(async () => new Group()),
      createPlacementPreview: vi.fn(async () => new Group()),
    } as unknown as AssetManager;
    const system = new PlacementSystem(scene, terrain.root, manager, vi.fn());

    await system.begin(asset);
    expect(system.updatePointer(new Vector2(0, 0), camera)).toBe(true);
    const placed = await system.createAtCurrentPoint();

    expect(placed?.kind).toBe('object');
    if (placed?.kind === 'object') expect(placed.object.position.y).toBeGreaterThan(0);
    system.dispose();
    terrain.dispose();
  });
});
