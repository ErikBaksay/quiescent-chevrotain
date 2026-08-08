import {
  SaveCameraState,
  SaveObjectRecord,
  SaveTerrainData,
  SaveVegetationRecord,
  TerrainHeightChange,
  TerrainSurfaceChange,
  WorldSaveV2,
} from './save.types';
import { TERRAIN_SURFACES } from '../world/terrain-surface.types';

export class SaveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveValidationError';
  }
}

export function encodeWorldSave(save: WorldSaveV2, pretty = true): string {
  return pretty ? JSON.stringify(save, null, 2) : JSON.stringify(save);
}

export function decodeWorldSave(text: string): WorldSaveV2 {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SaveValidationError('The save file is not valid JSON.');
  }

  return readSave(value);
}

function readSave(value: unknown): WorldSaveV2 {
  const record = asRecord(value, 'The save file must contain an object.');
  if (record['format'] !== 'quiescent-chevrotain-save') {
    throw new SaveValidationError('This is not a Quiescent Chevrotain save file.');
  }
  if (record['version'] !== 2) {
    throw new SaveValidationError('This save version is not supported.');
  }

  return {
    format: 'quiescent-chevrotain-save',
    version: 2,
    savedAt: readString(record, 'savedAt'),
    world: readWorld(record['world']),
    camera: readCamera(record['camera']),
    objects: readObjects(record['objects']),
    vegetation: readVegetation(record['vegetation']),
    terrain: readTerrain(record['terrain']),
  };
}

function readWorld(value: unknown): WorldSaveV2['world'] {
  const record = asRecord(value, 'The save world metadata is invalid.');
  return {
    width: readPositiveNumber(record, 'width'),
    depth: readPositiveNumber(record, 'depth'),
    sampleSpacing: readPositiveNumber(record, 'sampleSpacing'),
  };
}

function readCamera(value: unknown): SaveCameraState {
  const record = asRecord(value, 'The save camera state is invalid.');
  return {
    position: readVector3(record['position'], 'camera position'),
    target: readVector3(record['target'], 'camera target'),
  };
}

function readObjects(value: unknown): readonly SaveObjectRecord[] {
  return readArray(value, 'objects').map((item, index) => {
    const record = asRecord(item, `Object ${index + 1} is invalid.`);
    return {
      assetId: readAssetId(record, index, 'object'),
      shapeId: readStringField(record, 'shapeId', `object ${index + 1}`),
      paletteId: readStringField(record, 'paletteId', `object ${index + 1}`),
      position: readVector3(record['position'], `object ${index + 1} position`),
      quaternion: readQuaternion(record['quaternion'], `object ${index + 1} rotation`),
      scale: readVector3(record['scale'], `object ${index + 1} scale`),
      materialOverrides: readMaterialOverrides(record['materialOverrides'], index),
    };
  });
}

function readVegetation(value: unknown): readonly SaveVegetationRecord[] {
  return readArray(value, 'vegetation').map((item, index) => {
    const record = asRecord(item, `Vegetation ${index + 1} is invalid.`);
    return {
      assetId: readAssetId(record, index, 'vegetation'),
      position: readVector3(record['position'], `vegetation ${index + 1} position`),
      quaternion: readQuaternion(record['quaternion'], `vegetation ${index + 1} rotation`),
      scale: readVector3(record['scale'], `vegetation ${index + 1} scale`),
      variantIndex: readNonNegativeInteger(record, 'variantIndex'),
      tint: readVector3(record['tint'], `vegetation ${index + 1} tint`),
    };
  });
}

function readTerrain(value: unknown): SaveTerrainData {
  const record = asRecord(value, 'The save terrain data is invalid.');
  const heightChanges = readArray(record['heightChanges'], 'terrain height changes').map(
    (item, index): TerrainHeightChange => {
      const values = readNumberTuple(item, 2, `terrain height change ${index + 1}`);
      return [readIntegerValue(values[0], `terrain height change ${index + 1} index`), values[1]];
    },
  );
  const surfaceChanges = readArray(record['surfaceChanges'], 'terrain surface changes').map(
    (item, index): TerrainSurfaceChange => {
      const values = readNumberTuple(item, 9, `terrain surface change ${index + 1}`);
      return [
        readIntegerValue(values[0], `terrain surface change ${index + 1} index`),
        ...values
          .slice(1, 5)
          .map((value, valueIndex) =>
            readIntegerValue(
              value,
              `terrain surface change ${index + 1} surface ID ${valueIndex + 1}`,
              0,
              TERRAIN_SURFACES.length - 1,
            ),
          ),
        ...values
          .slice(5)
          .map((value, valueIndex) =>
            readIntegerValue(
              value,
              `terrain surface change ${index + 1} weight ${valueIndex + 1}`,
              0,
              255,
            ),
          ),
      ] as unknown as TerrainSurfaceChange;
    },
  );
  return { heightChanges, surfaceChanges };
}

function readMaterialOverrides(
  value: unknown,
  index: number,
): Readonly<Record<string, string | number>> {
  const record = asRecord(value, `Object ${index + 1} material overrides are invalid.`);
  const overrides: Record<string, string | number> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'string' && (typeof item !== 'number' || !Number.isFinite(item))) {
      throw new SaveValidationError(`Object ${index + 1} has an invalid material override.`);
    }
    overrides[key] = item;
  }
  return overrides;
}

function readAssetId(record: Record<string, unknown>, index: number, kind: string): string {
  const assetId = record['assetId'];
  if (typeof assetId !== 'string' || assetId.trim().length === 0) {
    throw new SaveValidationError(`${kind} ${index + 1} has an invalid asset ID.`);
  }
  return assetId;
}

function readStringField(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SaveValidationError(`${label} has an invalid ${key}.`);
  }
  return value;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new SaveValidationError(`The save field ${key} is invalid.`);
  }
  return value;
}

function readPositiveNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new SaveValidationError(`The save field ${key} is invalid.`);
  }
  return value;
}

function readNonNegativeInteger(record: Record<string, unknown>, key: string): number {
  return readIntegerValue(record[key], key, 0);
}

function readIntegerValue(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = Number.POSITIVE_INFINITY,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new SaveValidationError(`${label} is invalid.`);
  }
  return value;
}

function readVector3(value: unknown, label: string): readonly [number, number, number] {
  const values = readNumberTuple(value, 3, label);
  return [values[0], values[1], values[2]];
}

function readQuaternion(value: unknown, label: string): readonly [number, number, number, number] {
  const values = readNumberTuple(value, 4, label);
  return [values[0], values[1], values[2], values[3]];
}

function readNumberTuple(value: unknown, length: number, label: string): number[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new SaveValidationError(`${label} must contain ${length} numbers.`);
  }
  return value.map((item) => {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      throw new SaveValidationError(`${label} contains a non-finite number.`);
    }
    return item;
  });
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new SaveValidationError(`The save field ${label} is invalid.`);
  return value;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SaveValidationError(message);
  }
  return value as Record<string, unknown>;
}
