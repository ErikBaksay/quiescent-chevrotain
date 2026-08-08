import { AgXToneMapping, PCFSoftShadowMap, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { ResolvedAssetDefinition } from '../../assets/asset.types';
import { AssetManager } from '../assets/asset-manager';
import { EditorSystem } from '../editor/editor-system';
import { EditorState, EditorTool } from '../editor/editor.types';
import { WORLD_CONFIG } from '../world/world.config';
import { WorldSystem } from '../world/world-system';
import { CameraSystem } from './camera-system';
import { EnvironmentSystem } from './environment-system';
import { VEGETATION_QUALITY_PROFILES, VegetationQuality } from '../vegetation/vegetation-quality';

export type GameEngineState = 'running' | 'context-lost';

export interface GameEngineCallbacks {
  readonly onStateChange: (state: GameEngineState) => void;
  readonly onEditorStateChange: (state: EditorState) => void;
}

/** Coordinates the Three.js lifecycle without exposing scene objects to Angular. */
export class GameEngine {
  private readonly scene = new Scene();
  private readonly renderer: WebGLRenderer;
  private readonly cameraSystem: CameraSystem;
  private readonly environmentSystem: EnvironmentSystem;
  private readonly worldSystem: WorldSystem;
  private readonly editorSystem: EditorSystem;
  private readonly assetManager = new AssetManager();

  private animationFrameId: number | undefined;
  private width = 1;
  private height = 1;
  private vegetationQuality: VegetationQuality = 'ultra';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: GameEngineCallbacks,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = AgXToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.cameraSystem = new CameraSystem(canvas, WORLD_CONFIG);
    this.environmentSystem = new EnvironmentSystem(this.scene);
    this.worldSystem = new WorldSystem(this.scene, WORLD_CONFIG);
    this.editorSystem = new EditorSystem(
      this.scene,
      this.cameraSystem.camera,
      canvas,
      this.worldSystem.terrain,
      this.assetManager,
      callbacks.onEditorStateChange,
      (enabled) => this.cameraSystem.setNavigationEnabled(enabled),
    );

    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  beginAssetPlacement(asset: ResolvedAssetDefinition): void {
    this.editorSystem.beginAssetPlacement(asset);
  }

  start(): void {
    if (this.animationFrameId === undefined) {
      this.callbacks.onStateChange('running');
      this.animationFrameId = requestAnimationFrame(this.renderFrame);
    }
  }

  setEditorTool(tool: EditorTool): void {
    this.editorSystem.setTool(tool);
  }

  setVegetationQuality(quality: VegetationQuality): void {
    this.vegetationQuality = quality;
    this.editorSystem.setVegetationQuality(quality);
    this.updateRendererSize();
  }

  deleteSelected(): void {
    this.editorSystem.deleteSelected();
  }

  duplicateSelected(): void {
    this.editorSystem.duplicateSelected();
  }
  setGridSnapEnabled(enabled: boolean): void {
    this.editorSystem.setGridSnapEnabled(enabled);
  }
  setRotationSnapEnabled(enabled: boolean): void {
    this.editorSystem.setRotationSnapEnabled(enabled);
  }

  resize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));

    if (nextWidth === this.width && nextHeight === this.height) {
      return;
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.updateRendererSize();
    this.cameraSystem.resize(this.width, this.height);
  }

  dispose(): void {
    this.stop();
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.editorSystem.dispose();
    this.assetManager.dispose();
    this.cameraSystem.dispose();
    this.environmentSystem.dispose();
    this.worldSystem.dispose();
    this.scene.clear();
    this.renderer.dispose();
  }

  private readonly renderFrame = (): void => {
    this.cameraSystem.update();
    this.editorSystem.update();
    this.environmentSystem.update(this.cameraSystem.camera);
    this.renderer.render(this.scene, this.cameraSystem.camera);
    this.animationFrameId = requestAnimationFrame(this.renderFrame);
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.stop();
    this.callbacks.onStateChange('context-lost');
  };

  private readonly handleContextRestored = (): void => {
    this.start();
  };

  private stop(): void {
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
  }

  private updateRendererSize(): void {
    const maximum = VEGETATION_QUALITY_PROFILES[this.vegetationQuality].pixelRatio;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maximum));
    this.renderer.setSize(this.width, this.height, false);
  }
}
