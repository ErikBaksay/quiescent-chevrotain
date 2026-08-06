import { Object3D, PerspectiveCamera, Scene } from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { EditorTool } from './editor.types';

/** Wraps TransformControls and coordinates it with camera navigation. */
export class TransformSystem {
  private readonly controls: TransformControls;
  private readonly helper: Object3D;
  private dragging = false;

  constructor(
    private readonly scene: Scene,
    camera: PerspectiveCamera,
    canvas: HTMLCanvasElement,
    private readonly onDraggingChange: (dragging: boolean) => void,
    private readonly onObjectChange: () => void,
  ) {
    this.controls = new TransformControls(camera, canvas);
    this.controls.enabled = true;
    this.controls.setSize(0.82);
    this.helper = this.controls.getHelper();
    this.helper.name = 'Transform controls';
    this.scene.add(this.helper);

    this.controls.addEventListener('dragging-changed', this.handleDraggingChanged);
    this.controls.addEventListener('objectChange', this.handleObjectChanged);
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  setTool(tool: EditorTool, object: Object3D | undefined): void {
    this.controls.detach();

    if (!object || (tool !== 'move' && tool !== 'rotate')) {
      return;
    }

    if (tool === 'move') {
      this.controls.setMode('translate');
      this.controls.setSpace('world');
    } else {
      this.controls.setMode('rotate');
      this.controls.setSpace('local');
    }

    this.controls.attach(object);
  }

  detach(): void {
    this.controls.detach();
  }

  dispose(): void {
    if (this.dragging) {
      this.onDraggingChange(false);
    }
    this.controls.removeEventListener('dragging-changed', this.handleDraggingChanged);
    this.controls.removeEventListener('objectChange', this.handleObjectChanged);
    this.scene.remove(this.helper);
    this.controls.dispose();
  }

  private readonly handleDraggingChanged = (event: { value: unknown }): void => {
    this.dragging = Boolean(event.value);
    this.onDraggingChange(this.dragging);
  };

  private readonly handleObjectChanged = (): void => {
    this.onObjectChange();
  };
}
