export const VEGETATION_QUALITIES = ['performance', 'high', 'ultra'] as const;
export type VegetationQuality = (typeof VEGETATION_QUALITIES)[number];

export interface VegetationQualityProfile {
  readonly pixelRatio: number;
  readonly lod0Distance: number;
  readonly lod1Distance: number;
  readonly impostorDistance: number;
  readonly cullDistance: number;
  readonly detailedShadowDistance: number;
  readonly proxyShadowDistance: number;
}

export const VEGETATION_QUALITY_PROFILES: Record<VegetationQuality, VegetationQualityProfile> = {
  performance: {
    pixelRatio: 1,
    lod0Distance: 22,
    lod1Distance: 70,
    impostorDistance: 350,
    cullDistance: Number.POSITIVE_INFINITY,
    detailedShadowDistance: 30,
    proxyShadowDistance: 110,
  },
  high: {
    pixelRatio: 1.5,
    lod0Distance: 40,
    lod1Distance: 120,
    impostorDistance: 500,
    cullDistance: Number.POSITIVE_INFINITY,
    detailedShadowDistance: 55,
    proxyShadowDistance: 180,
  },
  ultra: {
    pixelRatio: 2,
    lod0Distance: 70,
    lod1Distance: 200,
    impostorDistance: 700,
    cullDistance: Number.POSITIVE_INFINITY,
    detailedShadowDistance: 90,
    proxyShadowDistance: 300,
  },
};

export const DEFAULT_VEGETATION_QUALITY: VegetationQuality = 'ultra';
export const VEGETATION_QUALITY_STORAGE_KEY = 'quiescent-chevrotain.vegetation-quality-v2';

export function loadVegetationQuality(storage: Pick<Storage, 'getItem'>): VegetationQuality {
  const stored = storage.getItem(VEGETATION_QUALITY_STORAGE_KEY);
  return VEGETATION_QUALITIES.includes(stored as VegetationQuality)
    ? (stored as VegetationQuality)
    : DEFAULT_VEGETATION_QUALITY;
}

export function saveVegetationQuality(
  storage: Pick<Storage, 'setItem'>,
  quality: VegetationQuality,
): void {
  storage.setItem(VEGETATION_QUALITY_STORAGE_KEY, quality);
}
