import { TerrainSystem } from './terrain-system';

export interface TerrainHeightChange {
  readonly index: number;
  readonly before: number;
  readonly after: number;
}

/** Bounded undo/redo history for sparse terrain stroke changes. */
export class TerrainHistory {
  private readonly undoStack: TerrainHeightChange[][] = [];
  private readonly redoStack: TerrainHeightChange[][] = [];

  constructor(
    private readonly terrain: TerrainSystem,
    private readonly maximumEntries = 100,
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  push(changes: readonly TerrainHeightChange[]): void {
    if (changes.length === 0) return;
    this.undoStack.push([...changes]);
    if (this.undoStack.length > this.maximumEntries) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(): boolean {
    const changes = this.undoStack.pop();
    if (!changes) return false;
    this.apply(changes, 'before');
    this.redoStack.push(changes);
    return true;
  }

  redo(): boolean {
    const changes = this.redoStack.pop();
    if (!changes) return false;
    this.apply(changes, 'after');
    this.undoStack.push(changes);
    return true;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private apply(changes: readonly TerrainHeightChange[], side: 'before' | 'after'): void {
    let minX = this.terrain.sampleCountX - 1;
    let maxX = 0;
    let minZ = this.terrain.sampleCountZ - 1;
    let maxZ = 0;

    for (const change of changes) {
      this.terrain.setHeightAtIndex(change.index, change[side]);
      const coordinate = this.terrain.indexToSample(change.index);
      minX = Math.min(minX, coordinate.x);
      maxX = Math.max(maxX, coordinate.x);
      minZ = Math.min(minZ, coordinate.z);
      maxZ = Math.max(maxZ, coordinate.z);
    }

    this.terrain.updateRegion(minX, maxX, minZ, maxZ);
  }
}
