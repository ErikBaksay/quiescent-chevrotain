import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import {
  ASSET_CATEGORIES,
  AssetCatalog,
  AssetDefinition,
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
    }
  }
}
