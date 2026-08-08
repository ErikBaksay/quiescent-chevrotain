import { Color, Group, Material, Mesh, Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  ObjectPaletteDefinition,
  ResolvedAssetDefinition,
  isVegetationAsset,
} from '../../assets/asset.types';

/** Loads each GLB once and creates instances that share immutable render resources. */
export class AssetManager {
  private readonly loader: GLTFLoader;
  private readonly sources = new Map<string, Promise<Object3D>>();
  private readonly sourceMaterials = new Map<string, ReadonlyMap<string, Material>>();
  private readonly paletteMaterials = new Map<string, Material>();

  constructor(loader = new GLTFLoader()) {
    this.loader = loader;
  }

  load(asset: ResolvedAssetDefinition): Promise<Object3D> {
    const cached = this.sources.get(asset.modelUrl);
    if (cached) return cached;

    const promise = this.loader.loadAsync(asset.modelUrl).then(({ scene }) => {
      if (!scene.getObjectByProperty('isMesh', true)) {
        throw new Error(`${asset.name} does not contain renderable geometry.`);
      }
      const materials = new Map<string, Material>();
      scene.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        const meshMaterials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of meshMaterials) {
          if (!materials.has(material.name)) materials.set(material.name, material);
        }
      });
      this.sourceMaterials.set(asset.modelUrl, materials);
      scene.name = `${asset.name} Source`;
      return scene;
    });
    this.sources.set(asset.modelUrl, promise);
    promise.catch(() => {
      this.sources.delete(asset.modelUrl);
      this.sourceMaterials.delete(asset.modelUrl);
    });
    return promise;
  }

  async createInstance(
    asset: ResolvedAssetDefinition,
    shapeId = this.defaultShapeId(asset),
    paletteId = this.defaultPaletteId(asset),
  ): Promise<Object3D> {
    const source = await this.load(asset);
    const instance = clone(this.resolveShapeRoot(source, asset, shapeId));
    instance.name = asset.name;
    instance.userData['assetId'] = asset.id;
    instance.userData['shapeId'] = shapeId;
    instance.userData['paletteId'] = paletteId;
    instance.scale.setScalar(asset.defaultScale);
    this.applyPalette(instance, asset, paletteId);
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
    shapeId = this.defaultShapeId(asset),
    paletteId = this.defaultPaletteId(asset),
  ): Promise<Object3D> {
    if (!isVegetationAsset(asset)) return this.createInstance(asset, shapeId, paletteId);
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

  private shapeFor(asset: ResolvedAssetDefinition, shapeId: string) {
    if (isVegetationAsset(asset)) return undefined;
    return asset.appearance?.shapes.find((shape) => shape.id === shapeId);
  }

  private resolveShapeRoot(
    source: Object3D,
    asset: ResolvedAssetDefinition,
    shapeId: string,
  ): Object3D {
    const shape = this.shapeFor(asset, shapeId);
    if (isVegetationAsset(asset) || !asset.appearance) return source;
    if (!shape) throw new Error(`${asset.name} is missing shape ${shapeId}.`);
    return this.requireNode(source, shape.root, asset.name);
  }

  private defaultShapeId(asset: ResolvedAssetDefinition): string {
    return isVegetationAsset(asset) ? 'default' : (asset.appearance?.defaultShapeId ?? 'default');
  }

  private defaultPaletteId(asset: ResolvedAssetDefinition): string {
    return isVegetationAsset(asset) ? 'default' : (asset.appearance?.defaultPaletteId ?? 'default');
  }

  private requireNode(source: Object3D, root: string, assetName: string): Object3D {
    const node = root ? source.getObjectByName(root) : undefined;
    if (!node) throw new Error(`${assetName} is missing appearance root ${root}.`);
    return node;
  }

  private applyPalette(
    instance: Object3D,
    asset: ResolvedAssetDefinition,
    paletteId: string,
  ): void {
    if (isVegetationAsset(asset) || !asset.appearance) return;
    const palette = asset.appearance.palettes.find((candidate) => candidate.id === paletteId);
    if (!palette) throw new Error(`${asset.name} is missing palette ${paletteId}.`);
    const sourceMaterials = this.sourceMaterials.get(asset.modelUrl) ?? new Map<string, Material>();
    instance.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const resolved = materials.map((material) =>
        this.paletteMaterial(asset, palette, material, sourceMaterials),
      );
      child.material = Array.isArray(child.material) ? resolved : resolved[0];
    });
  }

  private paletteMaterial(
    asset: ResolvedAssetDefinition,
    palette: ObjectPaletteDefinition,
    source: Material,
    sourceMaterials: ReadonlyMap<string, Material>,
  ): Material {
    const variantName = palette.materialVariants?.[source.name] ?? source.name;
    const resolvedSource = sourceMaterials.get(variantName);
    if (!resolvedSource) {
      throw new Error(`${asset.name} is missing palette material ${variantName}.`);
    }
    const color = palette.colors[source.name];
    if (!color) return resolvedSource;
    const key = `${asset.modelUrl}:${palette.id}:${source.name}:${variantName}`;
    const cached = this.paletteMaterials.get(key);
    if (cached) return cached;
    const material = resolvedSource.clone();
    if ('color' in material && material.color instanceof Color) material.color.set(color);
    this.paletteMaterials.set(key, material);
    return material;
  }

  dispose(): void {
    const geometries = new Set<object>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    for (const material of this.paletteMaterials.values()) material.dispose();
    this.paletteMaterials.clear();
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
    this.sourceMaterials.clear();
  }
}
