import { Object3D, PerspectiveCamera, Scene, Vector2 } from 'three';
import { ResolvedAssetDefinition } from '../../assets/asset.types';
import { AssetManager } from '../assets/asset-manager';
import { EditorState, EditorTool, INITIAL_EDITOR_STATE } from './editor.types';
import { PlacementSystem } from './placement-system';
import { SelectionSystem } from './selection-system';
import { TransformSystem } from './transform-system';
import { VegetationSystem } from '../vegetation/vegetation-system';
import { VegetationQuality } from '../vegetation/vegetation-quality';
import { TerrainSystem } from '../world/terrain-system';
import { TerrainBrushSettings, TerrainSculptTool } from '../world/terrain-sculpt.types';
import { TerrainSculptSystem } from '../world/terrain-sculpt-system';

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
  private readonly pointer = new Vector2();
  private activeTool: EditorTool = INITIAL_EDITOR_STATE.tool;
  private pointerStart: PointerStart | undefined;
  private sculptPointerId: number | undefined;
  private pendingSculptPointer: { readonly pointer: Vector2; readonly time: number } | undefined;
  private sculptFrameId: number | undefined;
  private gridSnapEnabled = false;
  private rotationSnapEnabled = false;

  constructor(
    scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    terrain: Object3D,
    assets: AssetManager,
    private readonly onStateChange: (state: EditorState) => void,
    private readonly setCameraNavigationEnabled: (enabled: boolean) => void,
    terrainSystem?: TerrainSystem,
  ) {
    this.placementSystem = new PlacementSystem(scene, terrain, assets, () => this.emitState());
    this.selectionSystem = new SelectionSystem(scene);
    this.vegetationSystem = new VegetationSystem(scene, assets);
    if (terrainSystem) {
      this.terrainSculptSystem = new TerrainSculptSystem(terrainSystem);
      scene.add(this.terrainSculptSystem.preview);
    }
    this.transformSystem = new TransformSystem(
      scene,
      camera,
      canvas,
      (dragging) => this.setCameraNavigationEnabled(!dragging),
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
      canUndoTerrain: this.terrainSculptSystem?.canUndo ?? false,
      canRedoTerrain: this.terrainSculptSystem?.canRedo ?? false,
    };
  }

  beginAssetPlacement(asset: ResolvedAssetDefinition): void {
    this.stopSculpt(false);
    this.activeTool = 'place';
    this.transformSystem.detach();
    this.selectionSystem.select(undefined);
    this.vegetationSystem.select(undefined);
    this.canvas.style.cursor = 'crosshair';
    void this.placementSystem.begin(asset);
    this.emitState();
  }

  setTool(tool: EditorTool): void {
    if (tool === 'sculpt') {
      this.setSculptTool(this.terrainSculptSystem?.tool ?? 'raise');
      return;
    }
    if ((tool === 'move' || tool === 'rotate' || tool === 'scale') && !this.selectedObject) return;
    if (tool === 'place' && !this.state.activeAssetId) return;
    this.stopSculpt(false);
    if (this.activeTool === 'place' && tool !== 'place') this.placementSystem.cancel();
    this.activeTool = tool;
    this.transformSystem.setTool(tool, this.selectedObject);
    this.canvas.style.cursor = tool === 'place' ? 'crosshair' : '';
    this.emitState();
  }

  setSculptTool(tool: TerrainSculptTool): void {
    if (!this.terrainSculptSystem) return;
    if (this.activeTool === 'sculpt' && this.terrainSculptSystem.tool !== tool)
      this.stopSculpt(false);
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
    this.emitState();
  }

  undoTerrain(): void {
    if (this.transformSystem.isDragging || this.sculptPointerId !== undefined) return;
    if (this.terrainSculptSystem?.undo()) this.emitState();
  }

  redoTerrain(): void {
    if (this.transformSystem.isDragging || this.sculptPointerId !== undefined) return;
    if (this.terrainSculptSystem?.redo()) this.emitState();
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
    this.emitState();
  }

  deleteSelected(): void {
    if (this.transformSystem.isDragging || !this.selectedObject) return;
    this.transformSystem.detach();
    if (this.vegetationSystem.selectedRecordId) this.vegetationSystem.removeSelected();
    else this.selectionSystem.removeSelected();
    this.activeTool = 'select';
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
    this.stopSculpt(false);
    this.terrainSculptSystem?.dispose();
    this.vegetationSystem.dispose();
    this.selectionSystem.dispose();
    this.placementSystem.dispose();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.transformSystem.isDragging) return;
    if (this.activeTool === 'sculpt' && this.terrainSculptSystem && this.updatePointer(event)) {
      if (this.terrainSculptSystem.beginStroke(this.pointer, this.camera)) {
        this.sculptPointerId = event.pointerId;
        this.canvas.setPointerCapture?.(event.pointerId);
        this.setCameraNavigationEnabled(false);
        event.preventDefault();
      }
      return;
    }
    if (this.activeTool !== 'sculpt')
      this.pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.activeTool === 'sculpt' && this.terrainSculptSystem) {
      const pointer = this.pointerFromEvent(event);
      if (this.sculptPointerId === event.pointerId) {
        this.terrainSculptSystem.updatePointer(pointer, this.camera);
        this.queueSculptStroke(pointer);
        event.preventDefault();
      } else {
        this.terrainSculptSystem.updatePointer(pointer, this.camera);
      }
      this.emitState();
    } else if (this.activeTool === 'place' && this.updatePointer(event)) {
      this.placementSystem.updatePointer(this.pointer, this.camera);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.sculptPointerId === event.pointerId) {
      this.queueSculptStroke(this.pointerFromEvent(event));
      this.flushSculptStroke();
      this.terrainSculptSystem?.endStroke(true);
      this.canvas.releasePointerCapture?.(event.pointerId);
      this.sculptPointerId = undefined;
      this.setCameraNavigationEnabled(true);
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
    if (this.sculptPointerId !== undefined && event.type === 'pointercancel') {
      this.clearPendingSculptStroke();
      this.terrainSculptSystem?.endStroke(false);
      this.canvas.releasePointerCapture?.(this.sculptPointerId);
      this.sculptPointerId = undefined;
      this.setCameraNavigationEnabled(true);
      this.emitState();
    } else if (this.sculptPointerId === undefined) {
      this.terrainSculptSystem?.clearPointer();
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

  private stopSculpt(commit: boolean): void {
    if (!this.terrainSculptSystem) return;
    this.clearPendingSculptStroke();
    if (this.sculptPointerId !== undefined) {
      this.terrainSculptSystem.endStroke(commit);
      this.canvas.releasePointerCapture?.(this.sculptPointerId);
      this.sculptPointerId = undefined;
      this.setCameraNavigationEnabled(true);
    }
    this.terrainSculptSystem.clearPointer();
  }

  private async duplicateSelectedVegetation(): Promise<void> {
    if (!(await this.vegetationSystem.duplicateSelected())) return;
    this.activeTool = 'select';
    this.transformSystem.detach();
    this.emitState();
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

  private queueSculptStroke(pointer: Vector2, time = performance.now()): void {
    this.pendingSculptPointer = { pointer: pointer.clone(), time };
    if (typeof requestAnimationFrame !== 'function') {
      this.flushSculptStroke();
      return;
    }
    if (this.sculptFrameId !== undefined) return;
    this.sculptFrameId = requestAnimationFrame(() => {
      this.sculptFrameId = undefined;
      this.flushSculptStroke();
    });
  }

  private flushSculptStroke(): void {
    if (this.sculptFrameId !== undefined) {
      cancelAnimationFrame(this.sculptFrameId);
      this.sculptFrameId = undefined;
    }
    const pending = this.pendingSculptPointer;
    this.pendingSculptPointer = undefined;
    if (pending) this.terrainSculptSystem?.updateStroke(pending.pointer, this.camera, pending.time);
  }

  private clearPendingSculptStroke(): void {
    this.pendingSculptPointer = undefined;
    if (this.sculptFrameId !== undefined) {
      cancelAnimationFrame(this.sculptFrameId);
      this.sculptFrameId = undefined;
    }
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }

  private emitState(): void {
    this.onStateChange(this.state);
  }
}
