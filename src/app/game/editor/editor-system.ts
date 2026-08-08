import { Object3D, PerspectiveCamera, Scene, Vector2 } from 'three';
import {
  AssetPlacementSelection,
  ResolvedAssetDefinition,
  isVegetationAsset,
} from '../../assets/asset.types';
import { AssetManager } from '../assets/asset-manager';
import { EditorState, EditorTool, INITIAL_EDITOR_STATE } from './editor.types';
import { PlacementSystem } from './placement-system';
import { SelectionSystem } from './selection-system';
import { TransformSystem } from './transform-system';
import { VegetationSystem } from '../vegetation/vegetation-system';
import { VegetationQuality } from '../vegetation/vegetation-quality';
import { TerrainSystem } from '../world/terrain-system';
import { TerrainHistory } from '../world/terrain-history';
import { TerrainPaintSystem } from '../world/terrain-paint-system';
import { TerrainBrushSettings, TerrainSculptTool } from '../world/terrain-sculpt.types';
import { DEFAULT_TERRAIN_SURFACE, TerrainSurfaceId } from '../world/terrain-surface.types';
import { TerrainSculptSystem } from '../world/terrain-sculpt-system';
import { SaveLoadWarning, WorldSaveV2 } from '../save/save.types';

interface PointerStart {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}
const CLICK_MOVEMENT_THRESHOLD = 6;

export class EditorSystem {
  private readonly placementSystem: PlacementSystem;
  private readonly selectionSystem: SelectionSystem;
  private readonly transformSystem: TransformSystem;
  private readonly vegetationSystem: VegetationSystem;
  private readonly terrainSculptSystem: TerrainSculptSystem | undefined;
  private readonly terrainPaintSystem: TerrainPaintSystem | undefined;
  private readonly terrainHistory: TerrainHistory | undefined;
  private readonly pointer = new Vector2();
  private activeTool: EditorTool = INITIAL_EDITOR_STATE.tool;
  private pointerStart: PointerStart | undefined;
  private terrainPointerId: number | undefined;
  private activeTerrainStroke: TerrainSculptSystem | TerrainPaintSystem | undefined;
  private pendingTerrainPointer: { readonly pointer: Vector2; readonly time: number } | undefined;
  private terrainFrameId: number | undefined;
  private gridSnapEnabled = false;
  private rotationSnapEnabled = false;

  constructor(
    scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    terrain: Object3D,
    private readonly assets: AssetManager,
    private readonly onStateChange: (state: EditorState) => void,
    private readonly setCameraNavigationEnabled: (enabled: boolean) => void,
    private readonly terrainSystem?: TerrainSystem,
    private readonly onWorldChange: () => void = () => {},
  ) {
    this.placementSystem = new PlacementSystem(scene, terrain, assets, () => this.emitState());
    this.selectionSystem = new SelectionSystem(scene);
    this.vegetationSystem = new VegetationSystem(scene, assets);
    if (terrainSystem) {
      this.terrainHistory = new TerrainHistory();
      this.terrainSculptSystem = new TerrainSculptSystem(terrainSystem, this.terrainHistory);
      this.terrainPaintSystem = new TerrainPaintSystem(terrainSystem, this.terrainHistory);
      scene.add(this.terrainSculptSystem.preview);
      scene.add(this.terrainPaintSystem.preview);
    }
    this.transformSystem = new TransformSystem(
      scene,
      camera,
      canvas,
      (dragging) => {
        this.setCameraNavigationEnabled(!dragging);
        if (!dragging) this.onWorldChange();
      },
      () => {
        this.selectionSystem.update();
        this.vegetationSystem.syncSelectedProxy();
      },
    );
    canvas.addEventListener('pointerdown', this.handlePointerDown, true);
    canvas.addEventListener('pointermove', this.handlePointerMove, true);
    canvas.addEventListener('pointerup', this.handlePointerUp, true);
    canvas.addEventListener('pointercancel', this.handlePointerCancel, true);
    canvas.addEventListener('pointerleave', this.handlePointerCancel, true);
    window.addEventListener('keydown', this.handleKeyDown);
    this.emitState();
  }

  get state(): EditorState {
    const placement = this.placementSystem.state;
    return {
      tool: this.activeTool,
      hasSelection: this.selectedObject !== undefined,
      objectCount: this.selectionSystem.objectCount + this.vegetationSystem.count,
      activeAssetId: placement.activeAssetId,
      placementStatus: placement.status,
      placementError: placement.error,
      gridSnapEnabled: this.gridSnapEnabled,
      rotationSnapEnabled: this.rotationSnapEnabled,
      sculptTool: this.terrainSculptSystem?.tool ?? INITIAL_EDITOR_STATE.sculptTool,
      brush: this.terrainSculptSystem?.brushSettings ?? INITIAL_EDITOR_STATE.brush,
      surfaceId: this.terrainPaintSystem?.surface ?? INITIAL_EDITOR_STATE.surfaceId,
      paintBrush: this.terrainPaintSystem?.brushSettings ?? INITIAL_EDITOR_STATE.paintBrush,
      canUndoTerrain: this.terrainHistory?.canUndo ?? false,
      canRedoTerrain: this.terrainHistory?.canRedo ?? false,
    };
  }

  createSaveData(): Pick<WorldSaveV2, 'objects' | 'vegetation' | 'terrain'> {
    return {
      objects: this.selectionSystem.createSaveRecords(),
      vegetation: this.vegetationSystem.createSaveRecords(),
      terrain: this.terrainSystem?.createSaveData() ?? {
        heightChanges: [],
        surfaceChanges: [],
      },
    };
  }

  async loadSaveData(
    save: Pick<WorldSaveV2, 'objects' | 'vegetation' | 'terrain'>,
    assets: ReadonlyMap<string, ResolvedAssetDefinition>,
  ): Promise<SaveLoadWarning | undefined> {
    const skippedAssetIds = new Set<string>();
    const availableAssets = new Map<string, ResolvedAssetDefinition>();
    const referencedAssetIds = new Set([
      ...save.objects.map((record) => record.assetId),
      ...save.vegetation.map((record) => record.assetId),
    ]);
    for (const assetId of referencedAssetIds) {
      const asset = assets.get(assetId);
      if (!asset) {
        skippedAssetIds.add(assetId);
        continue;
      }
      try {
        await this.assets.load(asset);
        availableAssets.set(assetId, asset);
      } catch {
        skippedAssetIds.add(assetId);
      }
    }

    this.stopTerrainStroke(false);
    this.placementSystem.cancel();
    this.transformSystem.detach();
    this.selectionSystem.clearObjects();
    this.vegetationSystem.clearRecords();
    this.terrainHistory?.clear();
    this.activeTool = 'select';
    this.canvas.style.cursor = '';

    for (const record of save.objects) {
      const asset = availableAssets.get(record.assetId);
      if (!asset || isVegetationAsset(asset)) {
        skippedAssetIds.add(record.assetId);
        continue;
      }
      try {
        const object = await this.createSavedObject(record, asset);
        this.selectionSystem.register(object);
      } catch {
        skippedAssetIds.add(record.assetId);
      }
    }
    for (const record of save.vegetation) {
      const asset = availableAssets.get(record.assetId);
      if (!asset || !isVegetationAsset(asset)) {
        skippedAssetIds.add(record.assetId);
        continue;
      }
      try {
        await this.vegetationSystem.addSaved(record, asset);
      } catch {
        skippedAssetIds.add(record.assetId);
      }
    }
    this.terrainSystem?.loadSaveData(save.terrain);
    this.clearSelection();

    if (skippedAssetIds.size === 0) {
      this.emitState();
      return undefined;
    }
    const assetIds = Array.from(skippedAssetIds).sort();
    this.emitState();
    return {
      assetIds,
      message: `Skipped ${assetIds.length} unavailable asset${assetIds.length === 1 ? '' : 's'}: ${assetIds.join(', ')}`,
    };
  }

  beginAssetPlacement(selection: AssetPlacementSelection | ResolvedAssetDefinition): void {
    this.stopTerrainStroke(false);
    this.activeTool = 'place';
    this.transformSystem.detach();
    this.selectionSystem.select(undefined);
    this.vegetationSystem.select(undefined);
    this.canvas.style.cursor = 'crosshair';
    void this.placementSystem.begin(selection);
    this.emitState();
  }

  setTool(tool: EditorTool): void {
    if (tool === 'sculpt') {
      this.setSculptTool(this.terrainSculptSystem?.tool ?? 'raise');
      return;
    }
    if (tool === 'paint') {
      this.setTerrainSurface(this.terrainPaintSystem?.surface ?? DEFAULT_TERRAIN_SURFACE);
      return;
    }
    if ((tool === 'move' || tool === 'rotate' || tool === 'scale') && !this.selectedObject) return;
    if (tool === 'place' && !this.state.activeAssetId) return;
    this.stopTerrainStroke(false);
    if (this.activeTool === 'place' && tool !== 'place') this.placementSystem.cancel();
    this.activeTool = tool;
    this.transformSystem.setTool(tool, this.selectedObject);
    this.canvas.style.cursor = tool === 'place' ? 'crosshair' : '';
    this.emitState();
  }

  setSculptTool(tool: TerrainSculptTool): void {
    if (!this.terrainSculptSystem) return;
    if (
      this.terrainPointerId !== undefined ||
      (this.activeTool === 'sculpt' && this.terrainSculptSystem.tool !== tool)
    )
      this.stopTerrainStroke(false);
    if (this.activeTool !== 'sculpt') {
      if (this.activeTool === 'place') this.placementSystem.cancel();
      this.transformSystem.detach();
      this.selectionSystem.select(undefined);
      this.vegetationSystem.select(undefined);
      this.activeTool = 'sculpt';
      this.canvas.style.cursor = 'crosshair';
    }
    this.terrainSculptSystem.setTool(tool);
    this.emitState();
  }

  setTerrainBrush(settings: TerrainBrushSettings): void {
    this.terrainSculptSystem?.setBrush(settings);
    this.terrainPaintSystem?.setBrush(settings);
    this.emitState();
  }

  setTerrainSurface(surface: TerrainSurfaceId): void {
    if (!this.terrainPaintSystem) return;
    if (
      this.terrainPointerId !== undefined ||
      (this.activeTool === 'paint' && this.terrainPaintSystem.surface !== surface)
    )
      this.stopTerrainStroke(false);
    if (this.activeTool !== 'paint') {
      if (this.activeTool === 'place') this.placementSystem.cancel();
      this.transformSystem.detach();
      this.selectionSystem.select(undefined);
      this.vegetationSystem.select(undefined);
      this.activeTool = 'paint';
      this.canvas.style.cursor = 'crosshair';
    }
    this.terrainPaintSystem.setSurface(surface);
    this.emitState();
  }

  undoTerrain(): void {
    if (this.transformSystem.isDragging || this.terrainPointerId !== undefined) return;
    if (this.terrainHistory?.undo()) {
      this.onWorldChange();
      this.emitState();
    }
  }

  redoTerrain(): void {
    if (this.transformSystem.isDragging || this.terrainPointerId !== undefined) return;
    if (this.terrainHistory?.redo()) {
      this.onWorldChange();
      this.emitState();
    }
  }

  duplicateSelected(): void {
    if (this.transformSystem.isDragging) return;
    if (this.vegetationSystem.selectedRecordId) {
      void this.duplicateSelectedVegetation();
      return;
    }
    const duplicate = this.selectionSystem.duplicateSelected();
    if (!duplicate) return;
    this.activeTool = 'select';
    this.transformSystem.detach();
    this.onWorldChange();
    this.emitState();
  }

  deleteSelected(): void {
    if (this.transformSystem.isDragging || !this.selectedObject) return;
    this.transformSystem.detach();
    if (this.vegetationSystem.selectedRecordId) this.vegetationSystem.removeSelected();
    else this.selectionSystem.removeSelected();
    this.activeTool = 'select';
    this.onWorldChange();
    this.emitState();
  }

  setGridSnapEnabled(enabled: boolean): void {
    this.gridSnapEnabled = enabled;
    this.transformSystem.setGridSnapEnabled(enabled);
    this.placementSystem.setGridSnapEnabled(enabled);
    this.emitState();
  }

  setRotationSnapEnabled(enabled: boolean): void {
    this.rotationSnapEnabled = enabled;
    this.transformSystem.setRotationSnapEnabled(enabled);
    this.emitState();
  }

  update(): void {
    this.selectionSystem.update();
    this.vegetationSystem.update(this.camera, performance.now());
  }

  setVegetationQuality(quality: VegetationQuality): void {
    this.vegetationSystem.setQuality(quality);
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown, true);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove, true);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp, true);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel, true);
    this.canvas.removeEventListener('pointerleave', this.handlePointerCancel, true);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.transformSystem.dispose();
    this.stopTerrainStroke(false);
    this.terrainSculptSystem?.dispose();
    this.terrainPaintSystem?.dispose();
    this.vegetationSystem.dispose();
    this.selectionSystem.dispose();
    this.placementSystem.dispose();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.transformSystem.isDragging) return;
    const terrainSystem = this.activeTerrainSystem;
    if (terrainSystem && this.updatePointer(event)) {
      if (terrainSystem.beginStroke(this.pointer, this.camera)) {
        this.terrainPointerId = event.pointerId;
        this.activeTerrainStroke = terrainSystem;
        this.canvas.setPointerCapture?.(event.pointerId);
        this.setCameraNavigationEnabled(false);
        event.preventDefault();
      }
      return;
    }
    if (!terrainSystem)
      this.pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const terrainSystem = this.activeTerrainStroke ?? this.activeTerrainSystem;
    if (terrainSystem) {
      const pointer = this.pointerFromEvent(event);
      if (this.terrainPointerId === event.pointerId) {
        terrainSystem.updatePointer(pointer, this.camera);
        this.queueTerrainStroke(pointer);
        event.preventDefault();
      } else {
        terrainSystem.updatePointer(pointer, this.camera);
      }
      this.emitState();
    } else if (this.activeTool === 'place' && this.updatePointer(event)) {
      this.placementSystem.updatePointer(this.pointer, this.camera);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.terrainPointerId === event.pointerId) {
      this.queueTerrainStroke(this.pointerFromEvent(event));
      this.flushTerrainStroke();
      this.activeTerrainStroke?.endStroke(true);
      this.canvas.releasePointerCapture?.(event.pointerId);
      this.terrainPointerId = undefined;
      this.activeTerrainStroke = undefined;
      this.setCameraNavigationEnabled(true);
      this.onWorldChange();
      event.preventDefault();
      this.emitState();
      return;
    }
    const start = this.pointerStart;
    this.pointerStart = undefined;
    if (
      !start ||
      start.id !== event.pointerId ||
      this.transformSystem.isDragging ||
      (event.clientX - start.x) ** 2 + (event.clientY - start.y) ** 2 >
        CLICK_MOVEMENT_THRESHOLD ** 2 ||
      !this.updatePointer(event)
    )
      return;
    if (this.activeTool === 'place') {
      void this.placeAtPointer();
    } else {
      this.selectAtPointer();
    }
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.terrainPointerId !== undefined && event.type === 'pointercancel') {
      this.clearPendingTerrainStroke();
      this.activeTerrainStroke?.endStroke(false);
      this.canvas.releasePointerCapture?.(this.terrainPointerId);
      this.terrainPointerId = undefined;
      this.activeTerrainStroke = undefined;
      this.setCameraNavigationEnabled(true);
      this.emitState();
    } else if (this.terrainPointerId === undefined) {
      this.terrainSculptSystem?.clearPointer();
      this.terrainPaintSystem?.clearPointer();
    }
    this.pointerStart = undefined;
    this.placementSystem.clearPlacementPoint();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      this.transformSystem.isDragging ||
      this.isEditableTarget(event.target)
    )
      return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'd') this.duplicateSelected();
    else if ((event.ctrlKey || event.metaKey) && key === 'z') {
      if (event.shiftKey) this.redoTerrain();
      else this.undoTerrain();
    } else if ((event.ctrlKey || event.metaKey) && key === 'y') this.redoTerrain();
    else if (event.ctrlKey || event.metaKey) return;
    else if (key === 'escape') {
      if (this.activeTool !== 'select') this.setTool('select');
      else this.clearSelection();
    } else if (key === 'g') this.setTool('move');
    else if (key === 'r') this.setTool('rotate');
    else if (key === 's') this.setTool('scale');
    else if (key === 'delete' || key === 'backspace') this.deleteSelected();
    else return;
    event.preventDefault();
  };

  private async placeAtPointer(): Promise<void> {
    if (!this.placementSystem.updatePointer(this.pointer, this.camera)) return;
    const object = await this.placementSystem.createAtCurrentPoint();
    if (!object || this.activeTool !== 'place') return;
    if (object.kind === 'vegetation') await this.vegetationSystem.add(object);
    else this.selectionSystem.register(object.object);
    this.onWorldChange();
    this.emitState();
  }

  private selectObject(object: Object3D | undefined): void {
    this.vegetationSystem.select(undefined);
    this.selectionSystem.select(object);
    if (!object && ['move', 'rotate', 'scale'].includes(this.activeTool))
      this.activeTool = 'select';
    this.transformSystem.setTool(this.activeTool, object);
    this.emitState();
  }

  private selectVegetation(id: string | undefined): void {
    this.selectionSystem.select(undefined);
    this.vegetationSystem.select(id);
    if (!id && ['move', 'rotate', 'scale'].includes(this.activeTool)) this.activeTool = 'select';
    this.transformSystem.setTool(this.activeTool, this.vegetationSystem.selectedObject);
    this.emitState();
  }

  private selectAtPointer(): void {
    const object = this.selectionSystem.pickHit(this.pointer, this.camera);
    const vegetation = this.vegetationSystem.pick(this.pointer, this.camera);
    if (vegetation && (!object || vegetation.distance < object.distance)) {
      this.selectVegetation(vegetation.id);
    } else {
      this.selectObject(object?.object);
    }
  }

  private clearSelection(): void {
    this.selectionSystem.select(undefined);
    this.vegetationSystem.select(undefined);
    if (['move', 'rotate', 'scale'].includes(this.activeTool)) this.activeTool = 'select';
    this.transformSystem.setTool(this.activeTool, undefined);
    this.emitState();
  }

  private stopTerrainStroke(commit: boolean): void {
    this.clearPendingTerrainStroke();
    if (this.terrainPointerId !== undefined) {
      this.activeTerrainStroke?.endStroke(commit);
      this.canvas.releasePointerCapture?.(this.terrainPointerId);
      this.terrainPointerId = undefined;
      this.activeTerrainStroke = undefined;
      this.setCameraNavigationEnabled(true);
    }
    this.terrainSculptSystem?.clearPointer();
    this.terrainPaintSystem?.clearPointer();
  }

  private async duplicateSelectedVegetation(): Promise<void> {
    if (!(await this.vegetationSystem.duplicateSelected())) return;
    this.activeTool = 'select';
    this.transformSystem.detach();
    this.onWorldChange();
    this.emitState();
  }

  private async createSavedObject(
    record: WorldSaveV2['objects'][number],
    asset: ResolvedAssetDefinition,
  ): Promise<Object3D> {
    const object = await this.assets.createInstance(asset, record.shapeId, record.paletteId);
    object.position.fromArray(record.position);
    object.quaternion.fromArray(record.quaternion);
    object.scale.fromArray(record.scale);
    return object;
  }

  private get selectedObject(): Object3D | undefined {
    return this.selectionSystem.selectedObject ?? this.vegetationSystem.selectedObject;
  }

  private updatePointer(event: PointerEvent): boolean {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return false;
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    return true;
  }

  private pointerFromEvent(event: PointerEvent): Vector2 {
    this.updatePointer(event);
    return this.pointer;
  }

  private queueTerrainStroke(pointer: Vector2, time = performance.now()): void {
    this.pendingTerrainPointer = { pointer: pointer.clone(), time };
    if (typeof requestAnimationFrame !== 'function') {
      this.flushTerrainStroke();
      return;
    }
    if (this.terrainFrameId !== undefined) return;
    this.terrainFrameId = requestAnimationFrame(() => {
      this.terrainFrameId = undefined;
      this.flushTerrainStroke();
    });
  }

  private flushTerrainStroke(): void {
    if (this.terrainFrameId !== undefined) {
      cancelAnimationFrame(this.terrainFrameId);
      this.terrainFrameId = undefined;
    }
    const pending = this.pendingTerrainPointer;
    this.pendingTerrainPointer = undefined;
    if (pending) this.activeTerrainStroke?.updateStroke(pending.pointer, this.camera, pending.time);
  }

  private clearPendingTerrainStroke(): void {
    this.pendingTerrainPointer = undefined;
    if (this.terrainFrameId !== undefined) {
      cancelAnimationFrame(this.terrainFrameId);
      this.terrainFrameId = undefined;
    }
  }

  private get activeTerrainSystem(): TerrainSculptSystem | TerrainPaintSystem | undefined {
    if (this.activeTool === 'sculpt') return this.terrainSculptSystem;
    if (this.activeTool === 'paint') return this.terrainPaintSystem;
    return undefined;
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }

  private emitState(): void {
    this.onStateChange(this.state);
  }
}
