export const ASSET_CATEGORIES = [
  'civic',
  'residential',
  'commercial',
  'nature',
  'street-furniture',
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type AssetRenderMode = 'object' | 'vegetation';

interface BaseAssetDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: AssetCategory;
  readonly model: string;
  readonly thumbnail: string;
  readonly defaultScale: number;
}

export interface ObjectAssetDefinition extends BaseAssetDefinition {
  /** Omitted by legacy manifests. */
  readonly renderMode?: 'object';
}

export interface VegetationVariantDefinition {
  readonly id: string;
  readonly lod0: readonly string[];
  readonly lod1: readonly string[];
  readonly impostor: string;
  readonly shadow: string;
}

export interface VegetationDefinition {
  readonly bounds: {
    readonly radius: number;
    readonly height: number;
  };
  readonly variants: readonly VegetationVariantDefinition[];
}

export interface VegetationAssetDefinition extends BaseAssetDefinition {
  readonly category: 'nature';
  readonly renderMode: 'vegetation';
  readonly vegetation: VegetationDefinition;
}

export type AssetDefinition = ObjectAssetDefinition | VegetationAssetDefinition;

interface ResolvedUrls {
  readonly manifestUrl: string;
  readonly modelUrl: string;
  readonly thumbnailUrl: string;
}

export type ResolvedAssetDefinition = AssetDefinition & ResolvedUrls;
export type ResolvedVegetationAssetDefinition = VegetationAssetDefinition & ResolvedUrls;

export function isVegetationAsset(
  asset: AssetDefinition | ResolvedAssetDefinition,
): asset is VegetationAssetDefinition | ResolvedVegetationAssetDefinition {
  return asset.renderMode === 'vegetation';
}

export interface AssetCatalog {
  readonly version: 1;
  readonly manifests: readonly string[];
}
