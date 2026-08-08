import { DecimalPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { EditorState, EditorTool } from '../game/editor/editor.types';
import { TerrainBrushSettings, TerrainSculptTool } from '../game/world/terrain-sculpt.types';

@Component({
  selector: 'app-editor-toolbar',
  imports: [DecimalPipe],
  templateUrl: './editor-toolbar.html',
  styleUrl: './editor-toolbar.scss',
})
export class EditorToolbar {
  readonly state = input.required<EditorState>();
  readonly toolChange = output<EditorTool>();
  readonly deleteSelected = output<void>();
  readonly duplicateSelected = output<void>();
  readonly gridSnapChange = output<boolean>();
  readonly rotationSnapChange = output<boolean>();
  readonly sculptToolChange = output<TerrainSculptTool>();
  readonly brushChange = output<TerrainBrushSettings>();
  readonly undoTerrain = output<void>();
  readonly redoTerrain = output<void>();

  protected chooseTool(tool: EditorTool): void {
    this.toolChange.emit(tool);
  }

  protected chooseSculptTool(tool: TerrainSculptTool): void {
    this.sculptToolChange.emit(tool);
  }

  protected setBrushSetting(setting: keyof TerrainBrushSettings, value: string): void {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;
    this.brushChange.emit({ ...this.state().brush, [setting]: nextValue });
  }
}
