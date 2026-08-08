import { DecimalPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { EditorState, EditorTool } from '../game/editor/editor.types';
import { TerrainBrushSettings, TerrainSculptTool } from '../game/world/terrain-sculpt.types';
import {
  TERRAIN_SURFACE_FAMILIES,
  TERRAIN_SURFACES,
  TerrainSurfaceFamily,
  TerrainSurfaceId,
} from '../game/world/terrain-surface.types';

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
  readonly surfaceChange = output<TerrainSurfaceId>();
  readonly brushChange = output<TerrainBrushSettings>();
  readonly undoTerrain = output<void>();
  readonly redoTerrain = output<void>();

  protected readonly surfaceFamilies = TERRAIN_SURFACE_FAMILIES;
  protected readonly surfaces = TERRAIN_SURFACES;

  protected chooseTool(tool: EditorTool): void {
    this.toolChange.emit(tool);
  }

  protected chooseSculptTool(tool: TerrainSculptTool): void {
    this.sculptToolChange.emit(tool);
  }

  protected chooseSurface(surface: TerrainSurfaceId): void {
    this.surfaceChange.emit(surface);
  }

  protected activeSurfaceName(): string {
    return (
      this.surfaces.find((surface) => surface.id === this.state().surfaceId)?.name ?? 'Surface'
    );
  }

  protected surfacesInFamily(family: TerrainSurfaceFamily) {
    return this.surfaces.filter((surface) => surface.family === family);
  }

  protected familyLabel(family: TerrainSurfaceFamily): string {
    return family === 'aggregate' ? 'Aggregate' : family[0].toUpperCase() + family.slice(1);
  }

  protected surfaceSwatchStyle(surface: (typeof TERRAIN_SURFACES)[number]): Record<string, string> {
    const column = surface.atlasIndex % 6;
    const row = Math.floor(surface.atlasIndex / 6);
    return {
      'background-image': "url('assets/textures/terrain/terrain-swatches.webp')",
      'background-position': `${(column / 5) * 100}% ${(row / 3) * 100}%`,
      'background-size': '600% 400%',
    };
  }

  protected brushValue(setting: keyof TerrainBrushSettings): number {
    const brush = this.state().tool === 'paint' ? this.state().paintBrush : this.state().brush;
    return brush[setting];
  }

  protected setBrushSetting(setting: keyof TerrainBrushSettings, value: string): void {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;
    const brush = this.state().tool === 'paint' ? this.state().paintBrush : this.state().brush;
    this.brushChange.emit({ ...brush, [setting]: nextValue });
  }
}
