import { Component, signal } from '@angular/core';
import { AssetBrowser } from './asset-browser/asset-browser';
import { EditorToolbar } from './editor-toolbar/editor-toolbar';
import { EditorState, INITIAL_EDITOR_STATE } from './game/editor/editor.types';
import { GameViewport } from './game/viewport/game-viewport';
import { WORLD_CONFIG } from './game/world/world.config';
import {
  DEFAULT_VEGETATION_QUALITY,
  VEGETATION_QUALITIES,
  VegetationQuality,
  loadVegetationQuality,
  saveVegetationQuality,
} from './game/vegetation/vegetation-quality';

@Component({
  selector: 'app-root',
  imports: [AssetBrowser, EditorToolbar, GameViewport],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly editorState = signal<EditorState>(INITIAL_EDITOR_STATE);
  protected readonly vegetationQualities = VEGETATION_QUALITIES;
  protected readonly vegetationQuality = signal<VegetationQuality>(this.initialQuality());
  protected readonly worldWidthKilometres = WORLD_CONFIG.width / 1_000;
  protected readonly worldDepthKilometres = WORLD_CONFIG.depth / 1_000;

  protected setVegetationQuality(value: string, world: GameViewport): void {
    if (!VEGETATION_QUALITIES.includes(value as VegetationQuality)) return;
    const quality = value as VegetationQuality;
    this.vegetationQuality.set(quality);
    world.setVegetationQuality(quality);
    try {
      saveVegetationQuality(localStorage, quality);
    } catch {
      // Storage may be unavailable in privacy modes; the active session still updates.
    }
  }

  private initialQuality(): VegetationQuality {
    try {
      return loadVegetationQuality(localStorage);
    } catch {
      return DEFAULT_VEGETATION_QUALITY;
    }
  }
}
