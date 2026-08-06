import { Component, signal } from '@angular/core';
import { EditorToolbar } from './editor-toolbar/editor-toolbar';
import { EditorState, INITIAL_EDITOR_STATE } from './game/editor/editor.types';
import { GameViewport } from './game/viewport/game-viewport';
import { WORLD_CONFIG } from './game/world/world.config';

@Component({
  selector: 'app-root',
  imports: [EditorToolbar, GameViewport],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly editorState = signal<EditorState>(INITIAL_EDITOR_STATE);
  protected readonly worldWidthKilometres = WORLD_CONFIG.width / 1_000;
  protected readonly worldDepthKilometres = WORLD_CONFIG.depth / 1_000;
}
