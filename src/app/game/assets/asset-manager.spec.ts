import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
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

  it('selects named shape roots and shares cached palette materials', async () => {
    const source = new Group();
    const gable = new Group();
    gable.name = 'Shape_Gable';
    const walls = new MeshStandardMaterial({ color: 0xffffff });
    const sharedTexture = new Texture();
    walls.map = sharedTexture;
    walls.name = 'Walls';
    gable.add(new Mesh(new BoxGeometry(1, 1, 1), walls));
    const paired = new Group();
    paired.name = 'Shape_Paired';
    paired.add(new Mesh(new BoxGeometry(2, 1, 1), walls));
    source.add(gable, paired);
    const loadAsync = vi.fn(async () => ({ scene: source }));
    const manager = new AssetManager({ loadAsync } as unknown as GLTFLoader);
    const variantAsset: ResolvedAssetDefinition = {
      ...asset,
      appearance: {
        defaultShapeId: 'gable',
        defaultPaletteId: 'warm',
        shapes: [
          { id: 'gable', name: 'Gable', root: 'Shape_Gable' },
          { id: 'paired', name: 'Paired', root: 'Shape_Paired' },
        ],
        palettes: [
          { id: 'warm', name: 'Warm', colors: { Walls: '#aa5533' } },
          { id: 'cool', name: 'Cool', colors: { Walls: '#335577' } },
        ],
      },
    };

    const first = await manager.createInstance(variantAsset, 'gable', 'warm');
    const second = await manager.createInstance(variantAsset, 'gable', 'warm');
    const pairedInstance = await manager.createInstance(variantAsset, 'paired', 'cool');
    const coolInstance = await manager.createInstance(variantAsset, 'gable', 'cool');
    const firstMaterial = (first.children[0] as Mesh).material;
    const secondMaterial = (second.children[0] as Mesh).material;
    const coolMaterial = (coolInstance.children[0] as Mesh).material;

    expect(first.name).toBe('Courthouse');
    expect(first.userData['shapeId']).toBe('gable');
    expect(first.userData['paletteId']).toBe('warm');
    expect(first.children[0]).toBeInstanceOf(Mesh);
    expect((pairedInstance.children[0] as Mesh).geometry).not.toBe(
      (first.children[0] as Mesh).geometry,
    );
    expect(firstMaterial).toBe(secondMaterial);
    expect(coolMaterial).not.toBe(firstMaterial);
    expect((firstMaterial as MeshStandardMaterial).map).toBe(sharedTexture);
    expect((coolMaterial as MeshStandardMaterial).map).toBe(sharedTexture);
    expect((firstMaterial as MeshStandardMaterial).color.getHexString()).toBe('aa5533');
    expect(walls.color.getHexString()).toBe('ffffff');
    manager.dispose();
  });

  it('creates every shape and palette combination without changing selections', async () => {
    const source = new Group();
    const shapeIds = ['gable', 'cornice', 'paired'];
    const paletteIds = ['brick-cream', 'painted-blue', 'ochre-green', 'stone-brown'];
    for (const [index, shapeId] of shapeIds.entries()) {
      const shape = new Group();
      shape.name = `Shape_${shapeId[0].toUpperCase()}${shapeId.slice(1)}`;
      const material = new MeshStandardMaterial({ color: 0xffffff });
      material.name = 'Walls';
      shape.add(new Mesh(new BoxGeometry(index + 1, 1, 1), material));
      source.add(shape);
    }
    const loadAsync = vi.fn(async () => ({ scene: source }));
    const manager = new AssetManager({ loadAsync } as unknown as GLTFLoader);
    const variantAsset: ResolvedAssetDefinition = {
      ...asset,
      appearance: {
        defaultShapeId: 'gable',
        defaultPaletteId: 'brick-cream',
        shapes: shapeIds.map((id) => ({
          id,
          name: id,
          root: `Shape_${id[0].toUpperCase()}${id.slice(1)}`,
        })),
        palettes: paletteIds.map((id) => ({ id, name: id, colors: { Walls: '#aabbcc' } })),
      },
    };

    const instances = await Promise.all(
      shapeIds.flatMap((shapeId) =>
        paletteIds.map((paletteId) => manager.createInstance(variantAsset, shapeId, paletteId)),
      ),
    );

    expect(instances).toHaveLength(12);
    expect(new Set(instances.map((instance) => instance.userData['shapeId']))).toEqual(
      new Set(shapeIds),
    );
    expect(new Set(instances.map((instance) => instance.userData['paletteId']))).toEqual(
      new Set(paletteIds),
    );
    manager.dispose();
  });

  it('resolves palette material variants while preserving source materials', async () => {
    const source = new Group();
    const gable = new Group();
    gable.name = 'Shape_Gable';
    const walls = new MeshStandardMaterial({ color: 0xffffff });
    walls.name = 'Walls';
    const brickTexture = new Texture();
    const brickWalls = new MeshStandardMaterial({ color: 0xffffff, map: brickTexture });
    brickWalls.name = 'WallsBrick';
    gable.add(new Mesh(new BoxGeometry(1, 1, 1), walls));
    source.add(gable);
    source.add(new Mesh(new BoxGeometry(0.01, 0.01, 0.01), brickWalls));
    const loadAsync = vi.fn(async () => ({ scene: source }));
    const manager = new AssetManager({ loadAsync } as unknown as GLTFLoader);
    const variantAsset: ResolvedAssetDefinition = {
      ...asset,
      appearance: {
        defaultShapeId: 'gable',
        defaultPaletteId: 'brick',
        shapes: [{ id: 'gable', name: 'Gable', root: 'Shape_Gable' }],
        palettes: [
          {
            id: 'brick',
            name: 'Brick',
            colors: { Walls: '#aa5533' },
            materialVariants: { Walls: 'WallsBrick' },
          },
        ],
      },
    };

    const instance = await manager.createInstance(variantAsset, 'gable', 'brick');
    const resolved = (instance.children[0] as Mesh).material as MeshStandardMaterial;

    expect(resolved.map).toBe(brickTexture);
    expect(resolved.color.getHexString()).toBe('aa5533');
    expect(walls.color.getHexString()).toBe('ffffff');
    expect(walls.map).toBeNull();
    manager.dispose();
  });
});
