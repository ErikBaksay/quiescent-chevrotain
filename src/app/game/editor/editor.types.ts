import {
  DEFAULT_TERRAIN_BRUSH,
  TerrainBrushSettings,
  TerrainSculptTool,
} from '../world/terrain-sculpt.types';

export type EditorTool = 'select' | 'place' | 'move' | 'rotate' | 'scale' | 'sculpt';
export type PlacementStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface EditorState {
  readonly tool: EditorTool;
  readonly hasSelection: boolean;
  readonly objectCount: number;
  readonly activeAssetId: string | null;
  readonly placementStatus: PlacementStatus;
  readonly placementError: string | null;
  readonly gridSnapEnabled: boolean;
  readonly rotationSnapEnabled: boolean;
  readonly sculptTool: TerrainSculptTool;
  readonly brush: TerrainBrushSettings;
  readonly canUndoTerrain: boolean;
  readonly canRedoTerrain: boolean;
}

export const INITIAL_EDITOR_STATE: EditorState = {
  tool: 'select',
  hasSelection: false,
  objectCount: 0,
  activeAssetId: null,
  placementStatus: 'idle',
  placementError: null,
  gridSnapEnabled: false,
  rotationSnapEnabled: false,
  sculptTool: 'raise',
  brush: DEFAULT_TERRAIN_BRUSH,
  canUndoTerrain: false,
  canRedoTerrain: false,
};
