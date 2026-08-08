import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VEGETATION_QUALITY,
  VEGETATION_QUALITY_PROFILES,
  VEGETATION_QUALITY_STORAGE_KEY,
  loadVegetationQuality,
  saveVegetationQuality,
} from './vegetation-quality';

describe('vegetation quality persistence', () => {
  it('defaults to uncapped-distance Ultra vegetation', () => {
    expect(DEFAULT_VEGETATION_QUALITY).toBe('ultra');
    expect(
      Object.values(VEGETATION_QUALITY_PROFILES).every(
        ({ cullDistance }) => cullDistance === Number.POSITIVE_INFINITY,
      ),
    ).toBe(true);
  });

  it('loads supported values and rejects stale values', () => {
    expect(loadVegetationQuality({ getItem: () => 'performance' })).toBe('performance');
    expect(loadVegetationQuality({ getItem: () => 'cinematic' })).toBe(DEFAULT_VEGETATION_QUALITY);
  });

  it('writes the stable storage key', () => {
    const setItem = vi.fn();
    saveVegetationQuality({ setItem }, 'ultra');
    expect(setItem).toHaveBeenCalledWith(VEGETATION_QUALITY_STORAGE_KEY, 'ultra');
  });
});
