import { Group, Material, Mesh, Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ResolvedAssetDefinition, isVegetationAsset } from '../../assets/asset.types';

/** Loads each GLB once and creates instances that share immutable render resources. */
export class AssetManager {
  private readonly loader: GLTFLoader;
  private readonly sources = new Map<string, Promise<Object3D>>();

  constructor(loader = new GLTFLoader()) {
    this.loader = loader;
  }

  load(asset: ResolvedAssetDefinition): Promise<Object3D> {
    const cached = this.sources.get(asset.id);
    if (cached) return cached;

    const promise = this.loader.loadAsync(asset.modelUrl).then(({ scene }) => {
      if (!scene.getObjectByProperty('isMesh', true)) {
        throw new Error(`${asset.name} does not contain renderable geometry.`);
      }
      scene.name = `${asset.name} Source`;
      return scene;
    });
    this.sources.set(asset.id, promise);
    promise.catch(() => this.sources.delete(asset.id));
    return promise;
  }

  async createInstance(asset: ResolvedAssetDefinition): Promise<Object3D> {
    const source = await this.load(asset);
    const instance = clone(source);
    instance.name = asset.name;
    instance.userData['assetId'] = asset.id;
    instance.scale.setScalar(asset.defaultScale);
    instance.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return instance;
  }

  async createPlacementPreview(
    asset: ResolvedAssetDefinition,
    vegetationVariant = 0,
  ): Promise<Object3D> {
    if (!isVegetationAsset(asset)) return this.createInstance(asset);
    const source = await this.load(asset);
    const variant = asset.vegetation.variants[vegetationVariant % asset.vegetation.variants.length];
    const preview = new Group();
    preview.name = `${asset.name} Preview`;
    for (const name of variant.lod0) {
      const node = source.getObjectByName(name);
      if (!node) throw new Error(`${asset.name} is missing preview node ${name}.`);
      preview.add(node.clone(true));
    }
    preview.scale.setScalar(asset.defaultScale);
    return preview;
  }

  dispose(): void {
    const geometries = new Set<object>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    for (const promise of this.sources.values()) {
      void promise.then((source) => {
        source.traverse((child) => {
          if (!(child instanceof Mesh)) return;
          if (!geometries.has(child.geometry)) {
            geometries.add(child.geometry);
            child.geometry.dispose();
          }
          const meshMaterials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of meshMaterials) {
            if (materials.has(material)) continue;
            materials.add(material);
            for (const value of Object.values(material)) {
              if (value instanceof Texture && !textures.has(value)) {
                textures.add(value);
                value.dispose();
              }
            }
            material.dispose();
          }
        });
      });
    }
    this.sources.clear();
  }
}
