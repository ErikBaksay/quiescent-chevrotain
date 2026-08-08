import { AgXToneMapping, PCFSoftShadowMap, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { AssetPlacementSelection, ResolvedAssetDefinition } from '../../assets/asset.types';
import { AssetManager } from '../assets/asset-manager';
import { EditorSystem } from '../editor/editor-system';
import { EditorState, EditorTool } from '../editor/editor.types';
import { WORLD_CONFIG } from '../world/world.config';
import { WorldSystem } from '../world/world-system';
import { TerrainBrushSettings, TerrainSculptTool } from '../world/terrain-sculpt.types';
import { TerrainSurfaceId } from '../world/terrain-surface.types';
import { CameraSystem } from './camera-system';
import { EnvironmentSystem } from './environment-system';
import { VEGETATION_QUALITY_PROFILES, VegetationQuality } from '../vegetation/vegetation-quality';
import { SaveLoadWarning, WorldSaveV2 } from '../save/save.types';

export type GameEngineState = 'running' | 'context-lost';

export interface GameEngineCallbacks {
  readonly onStateChange: (state: GameEngineState) => void;
  readonly onEditorStateChange: (state: EditorState) => void;
  readonly onWorldChange: () => void;
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
  private loadingSave = false;

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

    this.cameraSystem = new CameraSystem(canvas, WORLD_CONFIG, () => {
      if (!this.loadingSave) callbacks.onWorldChange();
    });
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
      this.worldSystem.terrainSystem,
      () => {
        if (!this.loadingSave) callbacks.onWorldChange();
      },
    );
    void this.worldSystem.terrainSystem.loadSurfaceTextures(
      this.renderer.capabilities.getMaxAnisotropy(),
    );

    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  beginAssetPlacement(selection: AssetPlacementSelection | ResolvedAssetDefinition): void {
    this.editorSystem.beginAssetPlacement(selection);
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

  setSculptTool(tool: TerrainSculptTool): void {
    this.editorSystem.setSculptTool(tool);
  }

  setTerrainBrush(settings: TerrainBrushSettings): void {
    this.editorSystem.setTerrainBrush(settings);
  }

  setTerrainSurface(surface: TerrainSurfaceId): void {
    this.editorSystem.setTerrainSurface(surface);
  }

  undoTerrain(): void {
    this.editorSystem.undoTerrain();
  }

  redoTerrain(): void {
    this.editorSystem.redoTerrain();
  }

  createSave(): WorldSaveV2 {
    const editor = this.editorSystem.createSaveData();
    return {
      format: 'quiescent-chevrotain-save',
      version: 2,
      savedAt: new Date().toISOString(),
      world: {
        width: WORLD_CONFIG.width,
        depth: WORLD_CONFIG.depth,
        sampleSpacing: WORLD_CONFIG.terrain.sampleSpacing,
      },
      camera: this.cameraSystem.createSaveState(),
      objects: editor.objects,
      vegetation: editor.vegetation,
      terrain: editor.terrain,
    };
  }

  async loadSave(
    save: WorldSaveV2,
    assets: ReadonlyMap<string, ResolvedAssetDefinition>,
  ): Promise<SaveLoadWarning | undefined> {
    if (
      save.world.width !== WORLD_CONFIG.width ||
      save.world.depth !== WORLD_CONFIG.depth ||
      save.world.sampleSpacing !== WORLD_CONFIG.terrain.sampleSpacing
    ) {
      throw new Error('This save uses a different world size or terrain resolution.');
    }

    this.loadingSave = true;
    try {
      const warning = await this.editorSystem.loadSaveData(save, assets);
      this.cameraSystem.loadSaveState(save.camera);
      return warning;
    } finally {
      this.loadingSave = false;
    }
  }

  async resetWorld(): Promise<void> {
    await this.loadSave(
      {
        format: 'quiescent-chevrotain-save',
        version: 2,
        savedAt: new Date().toISOString(),
        world: {
          width: WORLD_CONFIG.width,
          depth: WORLD_CONFIG.depth,
          sampleSpacing: WORLD_CONFIG.terrain.sampleSpacing,
        },
        camera: {
          position: WORLD_CONFIG.camera.initialPosition,
          target: WORLD_CONFIG.camera.initialTarget,
        },
        objects: [],
        vegetation: [],
        terrain: { heightChanges: [], surfaceChanges: [] },
      },
      new Map(),
    );
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
