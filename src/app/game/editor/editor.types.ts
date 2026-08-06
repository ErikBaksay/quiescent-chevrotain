export type EditorTool = 'select' | 'place' | 'move' | 'rotate';

export interface EditorState {
  readonly tool: EditorTool;
  readonly hasSelection: boolean;
  readonly objectCount: number;
}

export const INITIAL_EDITOR_STATE: EditorState = {
  tool: 'select',
  hasSelection: false,
  objectCount: 0,
};
