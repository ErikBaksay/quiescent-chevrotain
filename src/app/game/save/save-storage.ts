import { decodeWorldSave, encodeWorldSave } from './save-codec';
import { WorldSaveV3 } from './save.types';

export const WORLD_SAVE_STORAGE_KEY = 'quiescent-chevrotain.world-save-v3';
export const LEGACY_WORLD_SAVE_STORAGE_KEY = 'quiescent-chevrotain.world-save-v2';

export function loadLocalWorldSave(storage: Pick<Storage, 'getItem'>): WorldSaveV3 | undefined {
  const text =
    storage.getItem(WORLD_SAVE_STORAGE_KEY) ?? storage.getItem(LEGACY_WORLD_SAVE_STORAGE_KEY);
  return text ? decodeWorldSave(text) : undefined;
}

export function saveLocalWorldSave(storage: Pick<Storage, 'setItem'>, save: WorldSaveV3): void {
  storage.setItem(WORLD_SAVE_STORAGE_KEY, encodeWorldSave(save, false));
}
