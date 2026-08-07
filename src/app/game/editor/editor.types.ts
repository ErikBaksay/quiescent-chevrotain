export type EditorTool = 'select' | 'place' | 'move' | 'rotate' | 'scale';
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
};
