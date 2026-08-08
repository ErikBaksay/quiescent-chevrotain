import { decodeWorldSave, encodeWorldSave } from './save-codec';
import { WorldSaveV2 } from './save.types';

export const WORLD_SAVE_STORAGE_KEY = 'quiescent-chevrotain.world-save-v2';

export function loadLocalWorldSave(storage: Pick<Storage, 'getItem'>): WorldSaveV2 | undefined {
  const text = storage.getItem(WORLD_SAVE_STORAGE_KEY);
  return text ? decodeWorldSave(text) : undefined;
}

export function saveLocalWorldSave(storage: Pick<Storage, 'setItem'>, save: WorldSaveV2): void {
  storage.setItem(WORLD_SAVE_STORAGE_KEY, encodeWorldSave(save, false));
}
