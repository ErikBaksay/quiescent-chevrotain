import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WorldConfig } from '../world/world.config';

/** Owns the editor camera and management-game-style navigation. */
export class CameraSystem {
  readonly camera: PerspectiveCamera;

  private readonly controls: OrbitControls;
  private readonly targetBoundaryX: number;
  private readonly targetBoundaryZ: number;
  private readonly clampedTarget = new Vector3();

  constructor(canvas: HTMLCanvasElement, config: WorldConfig) {
    this.camera = new PerspectiveCamera(45, 1, config.camera.near, config.camera.far);
    this.camera.position.fromArray(config.camera.initialPosition);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.fromArray(config.camera.initialTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = true;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
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
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(): void {
    this.controls.update();
    this.keepTargetInsideWorld();
  }

  setNavigationEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  dispose(): void {
    this.controls.dispose();
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
