import { MOUSE, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WorldConfig } from '../world/world.config';
import { SaveCameraState } from '../save/save.types';

const MOVEMENT_KEYS = new Set([
  'w',
  'a',
  's',
  'd',
  'arrowup',
  'arrowleft',
  'arrowdown',
  'arrowright',
]);
const KEYBOARD_MOVE_SPEED = 0.5;

/** Owns the editor camera and management-game-style navigation. */
export class CameraSystem {
  readonly camera: PerspectiveCamera;

  private readonly controls: OrbitControls;
  private readonly keyTarget: Window | undefined;
  private readonly targetBoundaryX: number;
  private readonly targetBoundaryZ: number;
  private readonly clampedTarget = new Vector3();
  private readonly movement = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly pressedMovementKeys = new Set<string>();
  private lastUpdateTime = typeof performance === 'undefined' ? 0 : performance.now();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    config: WorldConfig,
    private readonly onChange: () => void = () => {},
  ) {
    this.camera = new PerspectiveCamera(45, 1, config.camera.near, config.camera.far);
    this.camera.position.fromArray(config.camera.initialPosition);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.fromArray(config.camera.initialTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = true;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: MOUSE.ROTATE,
      RIGHT: MOUSE.PAN,
    };
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = config.camera.minDistance;
    this.controls.maxDistance = config.camera.maxDistance;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.panSpeed = 1.1;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.9;
    this.controls.update();

    const edgePadding = 40;
    this.targetBoundaryX = config.width / 2 - edgePadding;
    this.targetBoundaryZ = config.depth / 2 - edgePadding;
    this.controls.addEventListener('change', this.handleChange);

    this.keyTarget = canvas.ownerDocument.defaultView ?? undefined;
    this.keyTarget?.addEventListener('keydown', this.handleKeyDown);
    this.keyTarget?.addEventListener('keyup', this.handleKeyUp);
    this.keyTarget?.addEventListener('blur', this.clearPressedMovementKeys);
    canvas.addEventListener('blur', this.clearPressedMovementKeys);
  }

  createSaveState(): SaveCameraState {
    return {
      position: this.camera.position.toArray() as [number, number, number],
      target: this.controls.target.toArray() as [number, number, number],
    };
  }

  loadSaveState(state: SaveCameraState): void {
    this.camera.position.fromArray(state.position);
    this.controls.target.fromArray(state.target);
    this.keepTargetInsideWorld();
    this.controls.update();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(): number {
    const now = typeof performance === 'undefined' ? this.lastUpdateTime : performance.now();
    const deltaSeconds = Math.min(Math.max((now - this.lastUpdateTime) / 1_000, 0), 0.1);
    this.lastUpdateTime = now;

    if (this.controls.enabled) this.moveWithKeyboard(deltaSeconds);
    this.controls.update();
    this.keepTargetInsideWorld();
    return deltaSeconds;
  }

  setNavigationEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  dispose(): void {
    this.controls.removeEventListener('change', this.handleChange);
    this.controls.dispose();
    this.keyTarget?.removeEventListener('keydown', this.handleKeyDown);
    this.keyTarget?.removeEventListener('keyup', this.handleKeyUp);
    this.keyTarget?.removeEventListener('blur', this.clearPressedMovementKeys);
    this.canvas.removeEventListener('blur', this.clearPressedMovementKeys);
    this.pressedMovementKeys.clear();
  }

  private readonly handleChange = (): void => {
    this.onChange();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (
      !MOVEMENT_KEYS.has(key) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !this.isCanvasFocused() ||
      this.isEditableTarget(event.target)
    ) {
      return;
    }

    this.pressedMovementKeys.add(key);
    event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedMovementKeys.delete(event.key.toLowerCase());
  };

  private readonly clearPressedMovementKeys = (): void => {
    this.pressedMovementKeys.clear();
  };

  private moveWithKeyboard(deltaSeconds: number): void {
    if (deltaSeconds <= 0 || this.pressedMovementKeys.size === 0 || !this.isCanvasFocused()) return;

    this.forward.subVectors(this.controls.target, this.camera.position);
    this.forward.y = 0;
    if (this.forward.lengthSq() === 0) this.forward.set(0, 0, -1);
    else this.forward.normalize();
    this.right.crossVectors(this.forward, this.up).normalize();

    this.movement.set(0, 0, 0);
    if (this.isMovementKeyPressed('w', 'arrowup')) this.movement.add(this.forward);
    if (this.isMovementKeyPressed('s', 'arrowdown')) this.movement.sub(this.forward);
    if (this.isMovementKeyPressed('a', 'arrowleft')) this.movement.sub(this.right);
    if (this.isMovementKeyPressed('d', 'arrowright')) this.movement.add(this.right);
    if (this.movement.lengthSq() === 0) return;

    const speed = Math.max(20, this.controls.getDistance() * KEYBOARD_MOVE_SPEED);
    this.movement.normalize().multiplyScalar(speed * deltaSeconds);
    this.camera.position.add(this.movement);
    this.controls.target.add(this.movement);
  }

  private isMovementKeyPressed(...keys: string[]): boolean {
    return keys.some((key) => this.pressedMovementKeys.has(key));
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }

  private isCanvasFocused(): boolean {
    return this.keyTarget?.document.activeElement === this.canvas;
  }

  private keepTargetInsideWorld(): void {
    this.clampedTarget.set(
      MathUtils.clamp(this.controls.target.x, -this.targetBoundaryX, this.targetBoundaryX),
      0,
      MathUtils.clamp(this.controls.target.z, -this.targetBoundaryZ, this.targetBoundaryZ),
    );

    if (!this.clampedTarget.equals(this.controls.target)) {
      this.camera.position.add(this.clampedTarget.clone().sub(this.controls.target));
      this.controls.target.copy(this.clampedTarget);
    }
  }
}
