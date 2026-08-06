import { Object3D, PerspectiveCamera, Scene, Vector2 } from 'three';
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

/** Coordinates editor modes and browser input while delegating focused Three.js concerns. */
export class EditorSystem {
  private readonly placementSystem: PlacementSystem;
  private readonly selectionSystem: SelectionSystem;
  private readonly transformSystem: TransformSystem;
  private readonly pointer = new Vector2();

  private activeTool: EditorTool = INITIAL_EDITOR_STATE.tool;
  private pointerStart: PointerStart | undefined;

  constructor(
    scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    terrain: Object3D,
    private readonly onStateChange: (state: EditorState) => void,
    private readonly setCameraNavigationEnabled: (enabled: boolean) => void,
  ) {
    this.placementSystem = new PlacementSystem(scene, terrain);
    this.selectionSystem = new SelectionSystem(scene);
    this.transformSystem = new TransformSystem(
      scene,
      camera,
      canvas,
      (dragging) => this.setCameraNavigationEnabled(!dragging),
      () => this.selectionSystem.update(),
    );

    this.canvas.addEventListener('pointerdown', this.handlePointerDown, true);
    this.canvas.addEventListener('pointermove', this.handlePointerMove, true);
    this.canvas.addEventListener('pointerup', this.handlePointerUp, true);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel, true);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave, true);
    window.addEventListener('keydown', this.handleKeyDown);

    this.emitState();
  }

  get state(): EditorState {
    return {
      tool: this.activeTool,
      hasSelection: this.selectionSystem.selectedObject !== undefined,
      objectCount: this.selectionSystem.objectCount,
    };
  }

  get selectedObject(): Object3D | undefined {
    return this.selectionSystem.selectedObject;
  }

  setTool(tool: EditorTool): void {
    if ((tool === 'move' || tool === 'rotate') && !this.selectionSystem.selectedObject) {
      return;
    }

    this.activeTool = tool;
    this.placementSystem.setActive(tool === 'place');
    this.transformSystem.setTool(tool, this.selectionSystem.selectedObject);
    this.canvas.style.cursor = tool === 'place' ? 'crosshair' : '';
    this.emitState();
  }

  deleteSelected(): void {
    if (this.transformSystem.isDragging || !this.selectionSystem.selectedObject) {
      return;
    }

    this.transformSystem.detach();
    this.selectionSystem.removeSelected();
    this.activeTool = 'select';
    this.placementSystem.setActive(false);
    this.canvas.style.cursor = '';
    this.emitState();
  }

  update(): void {
    this.placementSystem.update(this.camera);
    this.selectionSystem.update();
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown, true);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove, true);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp, true);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel, true);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave, true);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.style.cursor = '';
    this.transformSystem.dispose();
    this.selectionSystem.dispose();
    this.placementSystem.dispose();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.transformSystem.isDragging) {
      return;
    }

    this.pointerStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.activeTool !== 'place' || !this.updatePointerCoordinates(event)) {
      return;
    }

    this.placementSystem.updatePointer(this.pointer, this.camera);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = undefined;

    if (
      !start ||
      start.id !== event.pointerId ||
      this.transformSystem.isDragging ||
      this.pointerMovedBeyondClickThreshold(start, event) ||
      !this.updatePointerCoordinates(event)
    ) {
      return;
    }

    if (this.activeTool === 'place') {
      this.placeAtPointer();
      return;
    }

    this.selectAtPointer();
  };

  private readonly handlePointerCancel = (): void => {
    this.pointerStart = undefined;
    this.placementSystem.clearPlacementPoint();
  };

  private readonly handlePointerLeave = (): void => {
    this.pointerStart = undefined;
    this.placementSystem.clearPlacementPoint();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      this.transformSystem.isDragging ||
      this.isEditableTarget(event.target)
    ) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === 'escape') {
      if (this.activeTool !== 'select') {
        this.setTool('select');
      } else if (this.selectionSystem.selectedObject) {
        this.selectObject(undefined);
      } else {
        return;
      }
    } else if (key === 'g' && this.selectionSystem.selectedObject) {
      this.setTool('move');
    } else if (key === 'r' && this.selectionSystem.selectedObject) {
      this.setTool('rotate');
    } else if ((key === 'delete' || key === 'backspace') && this.selectionSystem.selectedObject) {
      this.deleteSelected();
    } else {
      return;
    }

    event.preventDefault();
  };

  private placeAtPointer(): void {
    if (!this.placementSystem.updatePointer(this.pointer, this.camera)) {
      return;
    }

    const cube = this.placementSystem.createPrototypeCubeAtCurrentPoint();
    if (!cube) {
      return;
    }

    this.selectionSystem.register(cube);
    this.selectionSystem.select(cube);
    this.activeTool = 'select';
    this.placementSystem.setActive(false);
    this.transformSystem.detach();
    this.canvas.style.cursor = '';
    this.emitState();
  }

  private selectAtPointer(): void {
    const selected = this.selectionSystem.pick(this.pointer, this.camera);
    this.selectObject(selected);
  }

  private selectObject(object: Object3D | undefined): void {
    this.selectionSystem.select(object);

    if (!object && (this.activeTool === 'move' || this.activeTool === 'rotate')) {
      this.activeTool = 'select';
    }

    this.transformSystem.setTool(this.activeTool, object);
    this.emitState();
  }

  private updatePointerCoordinates(event: PointerEvent): boolean {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return false;
    }

    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    return true;
  }

  private pointerMovedBeyondClickThreshold(start: PointerStart, event: PointerEvent): boolean {
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    return deltaX * deltaX + deltaY * deltaY > CLICK_MOVEMENT_THRESHOLD ** 2;
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const tagName = target.tagName;
    return (
      target.isContentEditable ||
      tagName === 'INPUT' ||
      tagName === 'TEXTAREA' ||
      tagName === 'SELECT'
    );
  }

  private emitState(): void {
    this.onStateChange(this.state);
  }
}
