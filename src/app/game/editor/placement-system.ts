import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  Color,
} from 'three';
import {
  ResolvedAssetDefinition,
  ResolvedVegetationAssetDefinition,
  isVegetationAsset,
} from '../../assets/asset.types';
import { AssetManager } from '../assets/asset-manager';
import { PlacementStatus } from './editor.types';

export interface PlacementState {
  readonly activeAssetId: string | null;
  readonly status: PlacementStatus;
  readonly error: string | null;
}

export type PlacementCommit =
  | { readonly kind: 'object'; readonly object: Object3D }
  | {
      readonly kind: 'vegetation';
      readonly asset: ResolvedVegetationAssetDefinition;
      readonly position: Vector3;
      readonly yaw: number;
      readonly scale: number;
      readonly variantIndex: number;
      readonly tint: Color;
    };

/** Owns terrain-only placement, asynchronous ghost loading, and continuous instances. */
export class PlacementSystem {
  private readonly raycaster = new Raycaster();
  private readonly placementPoint = new Vector3();
  private readonly ghostMaterial = new MeshBasicMaterial({
    color: 0xffd37a,
    opacity: 0.42,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  private activeAsset: ResolvedAssetDefinition | undefined;
  private ghost: Object3D | undefined;
  private hasPlacementPoint = false;
  private requestSequence = 0;
  private placementState: PlacementState = { activeAssetId: null, status: 'idle', error: null };
  private gridSnapEnabled = false;
  private variation = { variantIndex: 0, yaw: 0, scale: 1, tint: new Color(1, 1, 1) };

  constructor(
    private readonly scene: Scene,
    private readonly terrain: Object3D,
    private readonly assets: AssetManager,
    private readonly onStateChange: () => void,
  ) {}

  get state(): PlacementState {
    return this.placementState;
  }

  async begin(asset: ResolvedAssetDefinition): Promise<void> {
    const request = ++this.requestSequence;
    this.removeGhost();
    this.activeAsset = asset;
    this.setState(asset.id, 'loading', null);
    this.variation = this.nextVariation(asset);
    try {
      const ghost = await this.assets.createPlacementPreview(asset, this.variation.variantIndex);
      if (request !== this.requestSequence || this.activeAsset?.id !== asset.id) return;
      ghost.name = `${asset.name} Placement Ghost`;
      ghost.visible = false;
      if (isVegetationAsset(asset)) {
        ghost.rotation.y = this.variation.yaw;
        ghost.scale.multiplyScalar(this.variation.scale);
      }
      ghost.traverse((child) => {
        if (child instanceof Mesh) child.material = this.ghostMaterial;
      });
      this.ghost = ghost;
      this.scene.add(ghost);
      this.setState(asset.id, 'ready', null);
    } catch (error) {
      if (request !== this.requestSequence) return;
      this.activeAsset = undefined;
      this.setState(
        null,
        'error',
        error instanceof Error ? error.message : `Unable to load ${asset.name}.`,
      );
    }
  }

  cancel(): void {
    ++this.requestSequence;
    this.activeAsset = undefined;
    this.clearPlacementPoint();
    this.removeGhost();
    this.setState(null, 'idle', null);
  }

  setGridSnapEnabled(enabled: boolean): void {
    this.gridSnapEnabled = enabled;
    if (this.hasPlacementPoint) this.positionGhost();
  }

  updatePointer(pointer: Vector2, camera: PerspectiveCamera): boolean {
    if (!this.ghost || this.placementState.status !== 'ready') return false;
    this.terrain.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    this.raycaster.setFromCamera(pointer, camera);
    const intersection = this.raycaster.intersectObject(this.terrain, false)[0];
    if (!intersection) {
      this.clearPlacementPoint();
      return false;
    }
    this.placementPoint.copy(intersection.point);
    this.hasPlacementPoint = true;
    this.positionGhost();
    this.ghost.visible = true;
    return true;
  }

  async createAtCurrentPoint(): Promise<PlacementCommit | undefined> {
    if (!this.activeAsset || !this.hasPlacementPoint || this.placementState.status !== 'ready')
      return undefined;
    if (isVegetationAsset(this.activeAsset)) {
      const commit: PlacementCommit = {
        kind: 'vegetation',
        asset: this.activeAsset,
        position: this.snappedPoint(),
        yaw: this.variation.yaw,
        scale: this.variation.scale * this.activeAsset.defaultScale,
        variantIndex: this.variation.variantIndex,
        tint: this.variation.tint.clone(),
      };
      void this.begin(this.activeAsset);
      return commit;
    }
    const instance = await this.assets.createInstance(this.activeAsset);
    instance.position.copy(this.snappedPoint());
    return { kind: 'object', object: instance };
  }

  clearPlacementPoint(): void {
    this.hasPlacementPoint = false;
    if (this.ghost) this.ghost.visible = false;
  }

  dispose(): void {
    this.cancel();
    this.ghostMaterial.dispose();
  }

  private setState(
    activeAssetId: string | null,
    status: PlacementStatus,
    error: string | null,
  ): void {
    this.placementState = { activeAssetId, status, error };
    this.onStateChange();
  }

  private snappedPoint(): Vector3 {
    const point = this.placementPoint.clone();
    if (this.gridSnapEnabled) {
      point.x = Math.round(point.x);
      point.z = Math.round(point.z);
    }
    return point;
  }

  private positionGhost(): void {
    this.ghost?.position.copy(this.snappedPoint());
  }

  private removeGhost(): void {
    this.ghost?.removeFromParent();
    this.ghost = undefined;
  }

  private nextVariation(asset: ResolvedAssetDefinition): typeof this.variation {
    if (!isVegetationAsset(asset)) {
      return { variantIndex: 0, yaw: 0, scale: 1, tint: new Color(1, 1, 1) };
    }
    const tintOffset = (Math.random() - 0.5) * 0.055;
    return {
      variantIndex: Math.floor(Math.random() * asset.vegetation.variants.length),
      yaw: Math.random() * Math.PI * 2,
      scale: 0.9 + Math.random() * 0.2,
      tint: new Color().setHSL(0.29 + tintOffset, 0.38, 0.92 + tintOffset * 0.2),
    };
  }
}
