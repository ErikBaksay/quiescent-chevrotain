import {
  BoxGeometry,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  Vector2,
  Vector3,
} from 'three';

export const PROTOTYPE_CUBE_SIZE = 8;

/** Owns terrain hit testing, the placement marker, and prototype cube resources. */
export class PlacementSystem {
  private readonly raycaster = new Raycaster();
  private readonly placementPoint = new Vector3();
  private readonly markerGeometry = new RingGeometry(1.15, 1.6, 48);
  private readonly markerMaterial = new MeshBasicMaterial({
    color: 0xffcf70,
    depthWrite: false,
    opacity: 0.92,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
  });
  private readonly marker = new Mesh(this.markerGeometry, this.markerMaterial);
  private readonly cubeGeometry = new BoxGeometry(
    PROTOTYPE_CUBE_SIZE,
    PROTOTYPE_CUBE_SIZE,
    PROTOTYPE_CUBE_SIZE,
  );
  private readonly cubeMaterial = new MeshStandardMaterial({
    color: 0xc9784d,
    metalness: 0,
    roughness: 0.72,
  });

  private active = false;
  private hasPlacementPoint = false;
  private cubeSequence = 0;

  constructor(
    private readonly scene: Scene,
    private readonly terrain: Object3D,
  ) {
    this.marker.name = 'Placement point';
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 8;
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.clearPlacementPoint();
    }
  }

  updatePointer(pointer: Vector2, camera: PerspectiveCamera): boolean {
    if (!this.active) {
      return false;
    }

    this.terrain.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    this.raycaster.setFromCamera(pointer, camera);
    const intersection = this.raycaster.intersectObject(this.terrain, false)[0];

    if (!intersection) {
      this.clearPlacementPoint();
      return false;
    }

    this.placementPoint.copy(intersection.point);
    this.marker.position.copy(intersection.point);
    this.marker.position.y += 0.08;
    this.marker.visible = true;
    this.hasPlacementPoint = true;
    this.updateMarkerScale(camera);
    return true;
  }

  update(camera: PerspectiveCamera): void {
    if (this.marker.visible) {
      this.updateMarkerScale(camera);
    }
  }

  clearPlacementPoint(): void {
    this.marker.visible = false;
    this.hasPlacementPoint = false;
  }

  createPrototypeCubeAt(point: Vector3): Group {
    this.cubeSequence += 1;

    const root = new Group();
    root.name = `Prototype Cube ${this.cubeSequence}`;
    root.position.set(point.x, point.y + PROTOTYPE_CUBE_SIZE / 2, point.z);

    const cube = new Mesh(this.cubeGeometry, this.cubeMaterial);
    cube.name = 'Prototype Cube Mesh';
    cube.castShadow = true;
    cube.receiveShadow = true;
    root.add(cube);

    return root;
  }

  createPrototypeCubeAtCurrentPoint(): Group | undefined {
    if (!this.hasPlacementPoint) {
      return undefined;
    }

    return this.createPrototypeCubeAt(this.placementPoint);
  }

  dispose(): void {
    this.scene.remove(this.marker);
    this.markerGeometry.dispose();
    this.markerMaterial.dispose();
    this.cubeGeometry.dispose();
    this.cubeMaterial.dispose();
  }

  private updateMarkerScale(camera: PerspectiveCamera): void {
    const distance = camera.position.distanceTo(this.placementPoint);
    const scale = MathUtils.clamp(distance / 180, 0.7, 5);
    this.marker.scale.setScalar(scale);
  }
}
