import { describe, expect, it, vi } from 'vitest';
import { loadLocalWorldSave, saveLocalWorldSave, WORLD_SAVE_STORAGE_KEY } from './save-storage';
import { WorldSaveV1 } from './save.types';

const save: WorldSaveV1 = {
  format: 'quiescent-chevrotain-save',
  version: 1,
  savedAt: '2026-08-08T12:00:00.000Z',
  world: {
    width: 100,
    depth: 100,
    sampleSpacing: 2,
  },
  camera: { position: [1, 2, 3], target: [0, 0, 0] },
  objects: [],
  vegetation: [],
  terrain: { heightChanges: [], surfaceChanges: [] },
};

describe('world save storage', () => {
  it('writes and reads the stable localStorage key', () => {
    let value: string | null = null;
    const setItem = vi.fn((_key: string, next: string) => (value = next));
    const getItem = vi.fn(() => value);

    saveLocalWorldSave({ setItem }, save);

    expect(setItem).toHaveBeenCalledWith(WORLD_SAVE_STORAGE_KEY, expect.any(String));
    expect(loadLocalWorldSave({ getItem })).toEqual(save);
  });

  it('does not swallow storage quota errors', () => {
    expect(() =>
      saveLocalWorldSave(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        save,
      ),
    ).toThrow('quota');
  });
});
