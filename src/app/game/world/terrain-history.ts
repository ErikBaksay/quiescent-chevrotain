export interface TerrainEditCommand {
  readonly undo: () => void;
  readonly redo: () => void;
}

export interface TerrainHeightChange {
  readonly index: number;
  readonly before: number;
  readonly after: number;
}

/** Bounded undo/redo history shared by terrain sculpt and surface paint strokes. */
export class TerrainHistory {
  private readonly undoStack: TerrainEditCommand[] = [];
  private readonly redoStack: TerrainEditCommand[] = [];

  constructor(private readonly maximumEntries = 100) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  push(command: TerrainEditCommand | undefined): void {
    if (!command) return;
    this.undoStack.push(command);
    if (this.undoStack.length > this.maximumEntries) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(): boolean {
    const changes = this.undoStack.pop();
    if (!changes) return false;
    changes.undo();
    this.redoStack.push(changes);
    return true;
  }

  redo(): boolean {
    const changes = this.redoStack.pop();
    if (!changes) return false;
    changes.redo();
    this.undoStack.push(changes);
    return true;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
