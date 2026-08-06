import { Component, input, output } from '@angular/core';
import { EditorState, EditorTool } from '../game/editor/editor.types';

@Component({
  selector: 'app-editor-toolbar',
  templateUrl: './editor-toolbar.html',
  styleUrl: './editor-toolbar.scss',
})
export class EditorToolbar {
  readonly state = input.required<EditorState>();
  readonly toolChange = output<EditorTool>();
  readonly deleteSelected = output<void>();

  protected chooseTool(tool: EditorTool): void {
    this.toolChange.emit(tool);
  }
}
