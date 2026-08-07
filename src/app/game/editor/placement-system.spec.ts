import { Group, Mesh, PlaneGeometry, PerspectiveCamera, Scene, Vector2 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ResolvedAssetDefinition } from '../../assets/asset.types';
import { AssetManager } from '../assets/asset-manager';
import { PlacementSystem } from './placement-system';

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
    const manager = { createInstance } as unknown as AssetManager;
    const system = new PlacementSystem(scene, terrain, manager, vi.fn());

    await system.begin(asset);
    system.setGridSnapEnabled(true);
    expect(system.updatePointer(new Vector2(0, 0), camera)).toBe(true);
    const placed = await system.createAtCurrentPoint();

    expect(system.state).toMatchObject({ activeAssetId: 'courthouse', status: 'ready' });
    expect(placed?.position.x).toBe(Math.round(placed?.position.x ?? 0));
    expect(createInstance).toHaveBeenCalledTimes(2);
    system.dispose();
    terrain.geometry.dispose();
  });
});
