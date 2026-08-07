export const ASSET_CATEGORIES = [
  'civic',
  'residential',
  'commercial',
  'nature',
  'street-furniture',
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export interface AssetDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: AssetCategory;
  readonly model: string;
  readonly thumbnail: string;
  readonly defaultScale: number;
}

export interface ResolvedAssetDefinition extends AssetDefinition {
  readonly manifestUrl: string;
  readonly modelUrl: string;
  readonly thumbnailUrl: string;
}

export interface AssetCatalog {
  readonly version: 1;
  readonly manifests: readonly string[];
}
