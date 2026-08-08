import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import {
  ASSET_CATEGORIES,
  AssetCatalog,
  AssetDefinition,
  ObjectAssetDefinition,
  ResolvedAssetDefinition,
  isVegetationAsset,
} from './asset.types';

@Injectable({ providedIn: 'root' })
export class AssetCatalogService {
  private readonly document = inject(DOCUMENT);
  private readonly cache = new Map<string, Promise<readonly ResolvedAssetDefinition[]>>();

  async load(catalogPath = 'assets/catalog.json'): Promise<readonly ResolvedAssetDefinition[]> {
    const cached = this.cache.get(catalogPath);
    if (cached) return cached;

    const loading = this.loadUncached(catalogPath);
    this.cache.set(catalogPath, loading);
    loading.catch(() => this.cache.delete(catalogPath));
    return loading;
  }

  private async loadUncached(catalogPath: string): Promise<readonly ResolvedAssetDefinition[]> {
    const catalogUrl = new URL(catalogPath, this.document.baseURI).href;
    const catalog = await this.fetchJson<AssetCatalog>(catalogUrl);
    if (catalog.version !== 1 || !Array.isArray(catalog.manifests)) {
      throw new Error('The asset catalogue has an unsupported format.');
    }

    return Promise.all(
      catalog.manifests.map(async (path) => {
        const manifestUrl = new URL(path, catalogUrl).href;
        const definition = await this.fetchJson<AssetDefinition>(manifestUrl);
        this.validate(definition);
        return {
          ...definition,
          manifestUrl,
          modelUrl: new URL(definition.model, manifestUrl).href,
          thumbnailUrl: new URL(definition.thumbnail, manifestUrl).href,
        };
      }),
    );
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unable to load ${url} (${response.status}).`);
    }
    return (await response.json()) as T;
  }

  private validate(asset: AssetDefinition): void {
    if (
      !asset ||
      typeof asset.id !== 'string' ||
      typeof asset.name !== 'string' ||
      !ASSET_CATEGORIES.includes(asset.category) ||
      typeof asset.model !== 'string' ||
      typeof asset.thumbnail !== 'string' ||
      !(asset.defaultScale > 0)
    ) {
      throw new Error('An asset manifest is malformed.');
    }

    if (isVegetationAsset(asset)) {
      const { bounds, variants } = asset.vegetation ?? {};
      if (
        asset.category !== 'nature' ||
        !bounds ||
        !(bounds.radius > 0) ||
        !(bounds.height > 0) ||
        !Array.isArray(variants) ||
        variants.length === 0 ||
        variants.some(
          (variant) =>
            !variant ||
            typeof variant.id !== 'string' ||
            !Array.isArray(variant.lod0) ||
            variant.lod0.length === 0 ||
            !Array.isArray(variant.lod1) ||
            variant.lod1.length === 0 ||
            typeof variant.impostor !== 'string' ||
            typeof variant.shadow !== 'string',
        )
      ) {
        throw new Error('A vegetation asset manifest is malformed.');
      }
    } else if (asset.appearance) {
      this.validateAppearance(asset);
    }
  }

  private validateAppearance(asset: ObjectAssetDefinition): void {
    const appearance = asset.appearance;
    if (
      !appearance ||
      typeof appearance.defaultShapeId !== 'string' ||
      typeof appearance.defaultPaletteId !== 'string' ||
      !Array.isArray(appearance.shapes) ||
      appearance.shapes.length === 0 ||
      !Array.isArray(appearance.palettes) ||
      appearance.palettes.length === 0
    ) {
      throw new Error(`${asset.name} has a malformed appearance definition.`);
    }

    const shapeIds = new Set<string>();
    for (const shape of appearance.shapes) {
      if (
        !shape ||
        typeof shape.id !== 'string' ||
        typeof shape.name !== 'string' ||
        typeof shape.root !== 'string' ||
        shapeIds.has(shape.id)
      ) {
        throw new Error(`${asset.name} has malformed shape variants.`);
      }
      shapeIds.add(shape.id);
    }

    const paletteIds = new Set<string>();
    for (const palette of appearance.palettes) {
      if (
        !palette ||
        typeof palette.id !== 'string' ||
        typeof palette.name !== 'string' ||
        !palette.colors ||
        typeof palette.colors !== 'object' ||
        Array.isArray(palette.colors) ||
        paletteIds.has(palette.id) ||
        Object.values(palette.colors).some(
          (color) => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color),
        )
      ) {
        throw new Error(`${asset.name} has malformed material palettes.`);
      }
      if (
        palette.materialVariants !== undefined &&
        (!palette.materialVariants ||
          typeof palette.materialVariants !== 'object' ||
          Array.isArray(palette.materialVariants) ||
          Object.values(palette.materialVariants).some(
            (material) => typeof material !== 'string' || material.trim().length === 0,
          ))
      ) {
        throw new Error(`${asset.name} has malformed material palette variants.`);
      }
      paletteIds.add(palette.id);
    }

    if (!shapeIds.has(appearance.defaultShapeId) || !paletteIds.has(appearance.defaultPaletteId)) {
      throw new Error(`${asset.name} has an invalid appearance default.`);
    }
  }
}
