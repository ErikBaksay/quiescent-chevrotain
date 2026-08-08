import {
  BoxGeometry,
  Color,
  DataTexture,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ResolvedVegetationAssetDefinition } from '../../assets/asset.types';
import { AssetManager } from '../assets/asset-manager';
import { VegetationSystem } from './vegetation-system';

const asset: ResolvedVegetationAssetDefinition = {
  id: 'test-oak',
  name: 'Test Oak',
  category: 'nature',
  model: 'model.glb',
  thumbnail: 'thumbnail.webp',
  defaultScale: 1,
  renderMode: 'vegetation',
  vegetation: {
    bounds: { radius: 6, height: 14 },
    variants: [
      {
        id: 'mature',
        lod0: ['Mature_LOD0_Trunk', 'Mature_LOD0_Foliage'],
        lod1: ['Mature_LOD1_Trunk', 'Mature_LOD1_Foliage'],
        impostor: 'Mature_Impostor',
        shadow: 'Mature_ShadowProxy',
      },
    ],
  },
  manifestUrl: 'https://example.test/asset.json',
  modelUrl: 'https://example.test/model.glb',
  thumbnailUrl: 'https://example.test/thumbnail.webp',
};

describe('VegetationSystem', () => {
  it('keeps logical records editable while rendering consolidated instances', async () => {
    const scene = new Scene();
    const source = createSource();
    const manager = { load: vi.fn(async () => source) } as unknown as AssetManager;
    const system = new VegetationSystem(scene, manager);
    const id = await system.add({
      asset,
      position: new Vector3(),
      yaw: 0.35,
      scale: 1,
      variantIndex: 0,
      tint: new Color(0xf2fff0),
    });

    const camera = new PerspectiveCamera(45, 1, 0.1, 1_000);
    camera.position.set(0, 14, 30);
    camera.lookAt(0, 7, 0);
    camera.updateProjectionMatrix();
    system.update(camera, 1_000);

    const populated = scene
      .getObjectByName('Instanced vegetation')
      ?.children.filter((child) => child instanceof InstancedMesh && child.count > 0);
    expect(populated?.length).toBeGreaterThan(0);
    expect(system.count).toBe(1);

    system.select(id);
    expect(system.selectedObject).toBeTruthy();
    system.selectedObject?.position.set(8, 0, 4);
    system.syncSelectedProxy();
    expect(await system.duplicateSelected()).toBeTruthy();
    expect(system.count).toBe(2);
    expect(system.removeSelected()).toBeTruthy();
    expect(system.count).toBe(1);

    system.dispose();
    source.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
  });
});

function createSource(): Group {
  const source = new Group();
  const map = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  map.needsUpdate = true;
  for (const name of [
    'Mature_LOD0_Trunk',
    'Mature_LOD0_Foliage',
    'Mature_LOD1_Trunk',
    'Mature_LOD1_Foliage',
    'Mature_Impostor',
    'Mature_ShadowProxy',
  ]) {
    const material = new MeshStandardMaterial({ map: name.includes('Impostor') ? map : null });
    const mesh = new Mesh(new BoxGeometry(2, 14, 2), material);
    mesh.name = name;
    source.add(mesh);
  }
  return source;
}
