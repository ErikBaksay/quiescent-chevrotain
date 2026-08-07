import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { ResolvedAssetDefinition } from '../../assets/asset.types';
import { AssetManager } from './asset-manager';

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

describe('AssetManager', () => {
  it('deduplicates concurrent loads, clones roots, shares resources, and disposes once', async () => {
    const source = new Group();
    const geometry = new BoxGeometry();
    const material = new MeshStandardMaterial();
    source.add(new Mesh(geometry, material));
    const loadAsync = vi.fn(async () => ({ scene: source }));
    const manager = new AssetManager({ loadAsync } as unknown as GLTFLoader);

    const [first, second] = await Promise.all([
      manager.createInstance(asset),
      manager.createInstance(asset),
    ]);
    const firstMesh = first.children[0] as Mesh;
    const secondMesh = second.children[0] as Mesh;
    expect(loadAsync).toHaveBeenCalledOnce();
    expect(first).not.toBe(second);
    expect(firstMesh.geometry).toBe(secondMesh.geometry);
    expect(firstMesh.material).toBe(secondMesh.material);
    expect(first.userData['assetId']).toBe('courthouse');

    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    manager.dispose();
    await Promise.resolve();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
