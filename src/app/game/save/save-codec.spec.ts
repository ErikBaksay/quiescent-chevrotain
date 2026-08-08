import { describe, expect, it } from 'vitest';
import { decodeWorldSave, encodeWorldSave, SaveValidationError } from './save-codec';
import { WorldSaveV2 } from './save.types';

const save: WorldSaveV2 = {
  format: 'quiescent-chevrotain-save',
  version: 2,
  savedAt: '2026-08-08T12:00:00.000Z',
  world: { width: 100, depth: 100, sampleSpacing: 2 },
  camera: {
    position: [10, 20, 30],
    target: [1, 2, 3],
  },
  objects: [
    {
      assetId: 'house',
      shapeId: 'default',
      paletteId: 'default',
      position: [1, 2, 3],
      quaternion: [0, 0.25, 0, 0.9682458],
      scale: [1, 1, 1],
      materialOverrides: {},
    },
  ],
  vegetation: [
    {
      assetId: 'oak',
      position: [4, 0, 5],
      quaternion: [0, 0.5, 0, 0.8660254],
      scale: [1.1, 1.1, 1.1],
      variantIndex: 1,
      tint: [0.9, 1, 0.92],
    },
  ],
  terrain: {
    heightChanges: [[12, 4.5]],
    surfaceChanges: [[20, 0, 20, 0, 0, 220, 35, 0, 0]],
  },
};

describe('world save codec', () => {
  it('round-trips a versioned logical world save', () => {
    expect(decodeWorldSave(encodeWorldSave(save))).toEqual(save);
  });

  it('rejects unsupported versions and malformed vectors', () => {
    expect(() => decodeWorldSave(JSON.stringify({ ...save, version: 1 }))).toThrow(
      SaveValidationError,
    );
    expect(() =>
      decodeWorldSave(
        JSON.stringify({
          ...save,
          camera: { ...save.camera, position: [0, Number.NaN, 0] },
        }),
      ),
    ).toThrow(SaveValidationError);
  });

  it('rejects invalid terrain tuple lengths and negative indices', () => {
    expect(() =>
      decodeWorldSave(
        JSON.stringify({
          ...save,
          terrain: { heightChanges: [[-1, 2]], surfaceChanges: [] },
        }),
      ),
    ).toThrow(SaveValidationError);
    expect(() =>
      decodeWorldSave(
        JSON.stringify({
          ...save,
          terrain: { heightChanges: [], surfaceChanges: [[1, 2]] },
        }),
      ),
    ).toThrow(SaveValidationError);
  });
});
