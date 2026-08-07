import { Object3D, PerspectiveCamera, Scene, Vector2 } from 'three';
import { ResolvedAssetDefinition } from '../../assets/asset.types';
import { AssetManager } from '../assets/asset-manager';
import { EditorState, EditorTool, INITIAL_EDITOR_STATE } from './editor.types';
import { PlacementSystem } from './placement-system';
import { SelectionSystem } from './selection-system';
import { TransformSystem } from './transform-system';

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
  private readonly pointer = new Vector2();
  private activeTool: EditorTool = INITIAL_EDITOR_STATE.tool;
  private pointerStart: PointerStart | undefined;
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
  ) {
    this.placementSystem = new PlacementSystem(scene, terrain, assets, () => this.emitState());
    this.selectionSystem = new SelectionSystem(scene);
    this.transformSystem = new TransformSystem(
      scene,
      camera,
      canvas,
      (dragging) => this.setCameraNavigationEnabled(!dragging),
      () => this.selectionSystem.update(),
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
      hasSelection: this.selectionSystem.selectedObject !== undefined,
      objectCount: this.selectionSystem.objectCount,
      activeAssetId: placement.activeAssetId,
      placementStatus: placement.status,
      placementError: placement.error,
      gridSnapEnabled: this.gridSnapEnabled,
      rotationSnapEnabled: this.rotationSnapEnabled,
    };
  }

  beginAssetPlacement(asset: ResolvedAssetDefinition): void {
    this.activeTool = 'place';
    this.transformSystem.detach();
    this.selectionSystem.select(undefined);
    this.canvas.style.cursor = 'crosshair';
    void this.placementSystem.begin(asset);
    this.emitState();
  }

  setTool(tool: EditorTool): void {
    if (
      (tool === 'move' || tool === 'rotate' || tool === 'scale') &&
      !this.selectionSystem.selectedObject
    )
      return;
    if (tool === 'place' && !this.state.activeAssetId) return;
    if (this.activeTool === 'place' && tool !== 'place') this.placementSystem.cancel();
    this.activeTool = tool;
    this.transformSystem.setTool(tool, this.selectionSystem.selectedObject);
    this.canvas.style.cursor = tool === 'place' ? 'crosshair' : '';
    this.emitState();
  }

  duplicateSelected(): void {
    if (this.transformSystem.isDragging) return;
    const duplicate = this.selectionSystem.duplicateSelected();
    if (!duplicate) return;
    this.activeTool = 'select';
    this.transformSystem.detach();
    this.emitState();
  }

  deleteSelected(): void {
    if (this.transformSystem.isDragging || !this.selectionSystem.selectedObject) return;
    this.transformSystem.detach();
    this.selectionSystem.removeSelected();
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
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown, true);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove, true);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp, true);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel, true);
    this.canvas.removeEventListener('pointerleave', this.handlePointerCancel, true);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.transformSystem.dispose();
    this.selectionSystem.dispose();
    this.placementSystem.dispose();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button === 0 && !this.transformSystem.isDragging)
      this.pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.activeTool === 'place' && this.updatePointer(event))
      this.placementSystem.updatePointer(this.pointer, this.camera);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
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
      this.selectObject(this.selectionSystem.pick(this.pointer, this.camera));
    }
  };

  private readonly handlePointerCancel = (): void => {
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
    else if (event.ctrlKey || event.metaKey) return;
    else if (key === 'escape') {
      if (this.activeTool !== 'select') this.setTool('select');
      else this.selectObject(undefined);
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
    this.selectionSystem.register(object);
    this.emitState();
  }

  private selectObject(object: Object3D | undefined): void {
    this.selectionSystem.select(object);
    if (!object && ['move', 'rotate', 'scale'].includes(this.activeTool))
      this.activeTool = 'select';
    this.transformSystem.setTool(this.activeTool, object);
    this.emitState();
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

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }

  private emitState(): void {
    this.onStateChange(this.state);
  }
}
