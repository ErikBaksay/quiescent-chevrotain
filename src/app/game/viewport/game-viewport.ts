import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { GameEngine } from '../engine/game-engine';
import { EditorState, EditorTool } from '../editor/editor.types';

type ViewportState = 'initializing' | 'running' | 'unsupported' | 'context-lost' | 'error';

@Component({
  selector: 'app-game-viewport',
  templateUrl: './game-viewport.html',
  styleUrl: './game-viewport.scss',
})
export class GameViewport implements AfterViewInit, OnDestroy {
  readonly editorStateChange = output<EditorState>();

  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('viewport', { static: true }) private viewportRef!: ElementRef<HTMLElement>;

  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly state = signal<ViewportState>('initializing');
  private engine: GameEngine | undefined;
  private resizeObserver: ResizeObserver | undefined;

  protected readonly errorMessage = computed(() => {
    switch (this.state()) {
      case 'unsupported':
        return 'This browser does not appear to support WebGL.';
      case 'context-lost':
        return 'The graphics context was interrupted. Waiting for it to recover…';
      case 'error':
        return 'The 3D world could not be started on this device.';
      default:
        return '';
    }
  });

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId) || typeof WebGLRenderingContext === 'undefined') {
      this.state.set('unsupported');
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      try {
        const canvas = this.canvasRef.nativeElement;
        const viewport = this.viewportRef.nativeElement;

        this.engine = new GameEngine(canvas, {
          onStateChange: (state) => this.state.set(state),
          onEditorStateChange: (state) => this.editorStateChange.emit(state),
        });
        this.resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            this.engine?.resize(entry.contentRect.width, entry.contentRect.height);
          }
        });
        this.resizeObserver.observe(viewport);

        const bounds = viewport.getBoundingClientRect();
        this.engine.resize(bounds.width, bounds.height);
        this.engine.start();
      } catch (error) {
        console.error('Unable to initialize the Three.js world.', error);
        this.state.set('error');
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.engine?.dispose();
  }

  setEditorTool(tool: EditorTool): void {
    this.engine?.setEditorTool(tool);
  }

  deleteSelected(): void {
    this.engine?.deleteSelected();
  }

  protected focusCanvas(): void {
    this.canvasRef.nativeElement.focus({ preventScroll: true });
  }
}
