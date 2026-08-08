import { decodeWorldSave, encodeWorldSave } from './save-codec';
import { WorldSaveV1 } from './save.types';

export const WORLD_SAVE_STORAGE_KEY = 'quiescent-chevrotain.world-save-v1';

export function loadLocalWorldSave(storage: Pick<Storage, 'getItem'>): WorldSaveV1 | undefined {
  const text = storage.getItem(WORLD_SAVE_STORAGE_KEY);
  return text ? decodeWorldSave(text) : undefined;
}

export function saveLocalWorldSave(storage: Pick<Storage, 'setItem'>, save: WorldSaveV1): void {
  storage.setItem(WORLD_SAVE_STORAGE_KEY, encodeWorldSave(save, false));
}
