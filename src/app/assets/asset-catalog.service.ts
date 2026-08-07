import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import {
  ASSET_CATEGORIES,
  AssetCatalog,
  AssetDefinition,
  ResolvedAssetDefinition,
} from './asset.types';

@Injectable({ providedIn: 'root' })
export class AssetCatalogService {
  private readonly document = inject(DOCUMENT);

  async load(catalogPath = 'assets/catalog.json'): Promise<readonly ResolvedAssetDefinition[]> {
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
  }
}
