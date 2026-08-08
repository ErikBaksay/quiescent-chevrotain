import {
  BoxGeometry,
  BoxHelper,
  Color,
  DoubleSide,
  Frustum,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  UniformsLib,
  UniformsUtils,
} from 'three';
import { ResolvedVegetationAssetDefinition } from '../../assets/asset.types';
import { AssetManager } from '../assets/asset-manager';
import {
  VEGETATION_QUALITY_PROFILES,
  VegetationQuality,
  VegetationQualityProfile,
} from './vegetation-quality';

type VegetationLod = 'lod0' | 'lod1' | 'impostor';

export interface VegetationPlacement {
  readonly asset: ResolvedVegetationAssetDefinition;
  readonly position: Vector3;
  readonly yaw: number;
  readonly scale: number;
  readonly variantIndex: number;
  readonly tint: Color;
}

export interface VegetationPick {
  readonly id: string;
  readonly distance: number;
}

interface TreeRecord {
  readonly id: string;
  readonly asset: ResolvedVegetationAssetDefinition;
  readonly variantIndex: number;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly scale: Vector3;
  readonly tint: Color;
  lod: VegetationLod | undefined;
}

interface Batch {
  readonly mesh: InstancedMesh;
  ids: string[];
}

interface VariantBatches {
  readonly lod0: readonly Batch[];
  readonly lod0NoShadow: readonly Batch[];
  readonly lod1: readonly Batch[];
  readonly impostor: readonly Batch[];
  readonly shadow: readonly Batch[];
}

interface SpeciesState {
  readonly variants: readonly VariantBatches[];
}

const MAX_INSTANCES = 10_000;
const GRID_SIZE = 100;
const LOD_INTERVAL_MS = 200;
const LOD_HYSTERESIS = 0.1;

/** Renders individually editable trees without allocating one scene graph per tree. */
export class VegetationSystem {
  private readonly root = new Group();
  private readonly records = new Map<string, TreeRecord>();
  private readonly species = new Map<string, Promise<SpeciesState>>();
  private readonly cells = new Map<string, Set<string>>();
  private readonly recordCells = new Map<string, string>();
  private readonly raycaster = new Raycaster();
  private readonly projection = new Matrix4();
  private readonly frustum = new Frustum();
  private readonly sphere = new Sphere();
  private readonly matrix = new Matrix4();
  private readonly selectionProxy = new Group();
  private readonly selectionMaterial = new MeshBasicMaterial({ visible: false });
  private readonly selectionBox = new BoxHelper(this.selectionProxy, 0xffd77d);

  private selectedId: string | undefined;
  private sequence = 0;
  private lastLodUpdate = -Infinity;
  private dirty = false;
  private quality: VegetationQuality = 'ultra';

  constructor(
    private readonly scene: Scene,
    private readonly assets: AssetManager,
  ) {
    this.root.name = 'Instanced vegetation';
    this.selectionProxy.name = 'Vegetation transform proxy';
    this.selectionProxy.visible = false;
    this.selectionBox.name = 'Vegetation selection outline';
    this.selectionBox.material.depthTest = false;
    this.selectionBox.material.depthWrite = false;
    this.selectionBox.material.transparent = true;
    this.selectionBox.renderOrder = 9;
    this.selectionBox.visible = false;
    this.scene.add(this.root, this.selectionProxy, this.selectionBox);
  }

  get count(): number {
    return this.records.size;
  }

  get selectedObject(): Object3D | undefined {
    return this.selectedId ? this.selectionProxy : undefined;
  }

  get selectedRecordId(): string | undefined {
    return this.selectedId;
  }

  setQuality(quality: VegetationQuality): void {
    this.quality = quality;
    const farFrameDistance = VEGETATION_QUALITY_PROFILES[quality].impostorDistance;
    for (const state of this.resolvedSpecies.values()) {
      for (const variant of state.variants) {
        for (const batch of variant.impostor) {
          if (batch.mesh.material instanceof ShaderMaterial) {
            batch.mesh.material.uniforms['farFrameDistance'].value = farFrameDistance;
          }
        }
      }
    }
    this.dirty = true;
  }

  async add(placement: VegetationPlacement): Promise<string> {
    await this.ensureSpecies(placement.asset);
    const id = `tree-${++this.sequence}`;
    const record: TreeRecord = {
      id,
      asset: placement.asset,
      variantIndex: placement.variantIndex % placement.asset.vegetation.variants.length,
      position: placement.position.clone(),
      quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), placement.yaw),
      scale: new Vector3(placement.scale, placement.scale, placement.scale),
      tint: placement.tint.clone(),
      lod: undefined,
    };
    this.records.set(id, record);
    this.indexRecord(record);
    this.dirty = true;
    return id;
  }

  async duplicateSelected(): Promise<string | undefined> {
    const selected = this.selectedId ? this.records.get(this.selectedId) : undefined;
    if (!selected) return undefined;
    const duplicate = await this.add({
      asset: selected.asset,
      position: selected.position.clone().add(new Vector3(2, 0, 2)),
      yaw: new Vector3(1, 0, 0).applyQuaternion(selected.quaternion).angleTo(new Vector3(1, 0, 0)),
      scale: selected.scale.x,
      variantIndex: selected.variantIndex,
      tint: selected.tint,
    });
    const record = this.records.get(duplicate);
    if (record) record.quaternion.copy(selected.quaternion);
    this.select(duplicate);
    return duplicate;
  }

  removeSelected(): string | undefined {
    const id = this.selectedId;
    if (!id) return undefined;
    this.unindexRecord(id);
    this.records.delete(id);
    this.select(undefined);
    this.dirty = true;
    return id;
  }

  select(id: string | undefined): void {
    this.selectedId = id && this.records.has(id) ? id : undefined;
    const record = this.selectedId ? this.records.get(this.selectedId) : undefined;
    for (const child of this.selectionProxy.children) {
      if (child instanceof Mesh) child.geometry.dispose();
    }
    this.selectionProxy.clear();
    if (!record) {
      this.selectionProxy.visible = false;
      this.selectionBox.visible = false;
      return;
    }

    const { radius, height } = record.asset.vegetation.bounds;
    const bounds = new Mesh(
      new BoxGeometry(radius * 2, height, radius * 2),
      this.selectionMaterial,
    );
    bounds.position.y = height / 2;
    this.selectionProxy.add(bounds);
    this.selectionProxy.position.copy(record.position);
    this.selectionProxy.quaternion.copy(record.quaternion);
    this.selectionProxy.scale.copy(record.scale);
    this.selectionProxy.visible = true;
    this.selectionProxy.updateWorldMatrix(true, true);
    this.selectionBox.setFromObject(this.selectionProxy);
    this.selectionBox.visible = true;
  }

  syncSelectedProxy(): void {
    const record = this.selectedId ? this.records.get(this.selectedId) : undefined;
    if (!record) return;
    this.unindexRecord(record.id);
    record.position.copy(this.selectionProxy.position);
    record.quaternion.copy(this.selectionProxy.quaternion);
    record.scale.copy(this.selectionProxy.scale);
    this.indexRecord(record);
    this.selectionBox.update();
    this.dirty = true;
  }

  pick(pointer: Vector2, camera: PerspectiveCamera): VegetationPick | undefined {
    camera.updateWorldMatrix(true, false);
    this.raycaster.setFromCamera(pointer, camera);
    let closest: VegetationPick | undefined;

    for (const state of this.resolvedSpecies.values()) {
      for (const variant of state.variants) {
        for (const batch of [
          ...variant.lod0,
          ...variant.lod0NoShadow,
          ...variant.lod1,
          ...variant.impostor,
        ]) {
          for (const hit of this.raycaster.intersectObject(batch.mesh, false)) {
            if (hit.instanceId === undefined) continue;
            const id = batch.ids[hit.instanceId];
            if (id && (!closest || hit.distance < closest.distance)) {
              closest = { id, distance: hit.distance };
            }
          }
        }
      }
    }
    return closest;
  }

  update(camera: PerspectiveCamera, now: number): void {
    if (!this.dirty && now - this.lastLodUpdate < LOD_INTERVAL_MS) {
      if (this.selectedId) this.selectionBox.update();
      return;
    }
    this.lastLodUpdate = now;
    this.dirty = false;
    camera.updateWorldMatrix(true, false);
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const profile = VEGETATION_QUALITY_PROFILES[this.quality];
    this.clearBatchCounts();

    for (const record of this.records.values()) {
      const distance = record.position.distanceTo(camera.position);
      this.sphere.center.set(
        record.position.x,
        record.position.y + record.asset.vegetation.bounds.height / 2,
        record.position.z,
      );
      this.sphere.radius =
        record.asset.vegetation.bounds.radius *
        Math.max(record.scale.x, record.scale.y, record.scale.z);
      if (!this.frustum.intersectsSphere(this.sphere)) continue;

      record.lod = this.chooseLod(record.lod, distance, profile);
      const state = this.resolvedSpecies.get(record.asset.id);
      const variant = state?.variants[record.variantIndex];
      if (!variant || !record.lod) continue;
      if (record.lod === 'lod0') {
        const batches =
          distance <= profile.detailedShadowDistance ? variant.lod0 : variant.lod0NoShadow;
        this.append(batches, record, record.tint);
      } else {
        this.append(
          variant[record.lod],
          record,
          record.lod === 'impostor' ? record.tint : undefined,
        );
      }
      if (
        record.lod !== 'lod0' &&
        distance > profile.detailedShadowDistance &&
        distance <= profile.proxyShadowDistance
      ) {
        this.append(variant.shadow, record);
      }
    }
    this.commitBatchCounts();
    if (this.selectedId) this.selectionBox.update();
  }

  dispose(): void {
    this.select(undefined);
    for (const state of this.resolvedSpecies.values()) {
      for (const variant of state.variants) {
        for (const batch of [
          ...variant.lod0,
          ...variant.lod0NoShadow,
          ...variant.lod1,
          ...variant.impostor,
          ...variant.shadow,
        ]) {
          (batch.mesh.material as Material).dispose();
          batch.mesh.dispose();
        }
      }
    }
    this.selectionProxy.traverse((child) => {
      if (child instanceof Mesh) child.geometry.dispose();
    });
    this.selectionMaterial.dispose();
    this.selectionBox.dispose();
    this.scene.remove(this.root, this.selectionProxy, this.selectionBox);
    this.records.clear();
    this.cells.clear();
    this.species.clear();
    this.resolvedSpecies.clear();
  }

  private readonly resolvedSpecies = new Map<string, SpeciesState>();

  private async ensureSpecies(asset: ResolvedVegetationAssetDefinition): Promise<SpeciesState> {
    const existing = this.species.get(asset.id);
    if (existing) return existing;
    const loading = this.assets.load(asset).then((source) => {
      const state: SpeciesState = {
        variants: asset.vegetation.variants.map((variant) => ({
          lod0: variant.lod0.map((name) => this.createBatch(source, name, true)),
          lod0NoShadow: variant.lod0.map((name) => this.createBatch(source, name, false)),
          lod1: variant.lod1.map((name) => this.createBatch(source, name, false)),
          impostor: [this.createBatch(source, variant.impostor, false)],
          shadow: [this.createBatch(source, variant.shadow, true, true)],
        })),
      };
      this.resolvedSpecies.set(asset.id, state);
      return state;
    });
    this.species.set(asset.id, loading);
    loading.catch(() => this.species.delete(asset.id));
    return loading;
  }

  private createBatch(
    source: Object3D,
    name: string,
    castShadow: boolean,
    shadowOnly = false,
  ): Batch {
    const mesh = source.getObjectByName(name);
    if (!(mesh instanceof Mesh)) throw new Error(`Vegetation model is missing mesh ${name}.`);
    const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const material = shadowOnly
      ? new MeshBasicMaterial({ colorWrite: false, depthWrite: false })
      : name.includes('Impostor')
        ? this.createImpostorMaterial(sourceMaterial)
        : sourceMaterial.clone();
    if (!shadowOnly && 'alphaTest' in material && name.toLowerCase().includes('foliage')) {
      Object.assign(material, {
        alphaHash: true,
        alphaTest: 0.45,
        transparent: false,
        depthWrite: true,
      });
    }
    const batchMesh = new InstancedMesh(mesh.geometry, material, MAX_INSTANCES);
    batchMesh.name = `Batch ${name}`;
    batchMesh.count = 0;
    batchMesh.castShadow = castShadow;
    batchMesh.receiveShadow = !shadowOnly;
    batchMesh.frustumCulled = false;
    this.root.add(batchMesh);
    return { mesh: batchMesh, ids: [] };
  }

  private createImpostorMaterial(source: Material): ShaderMaterial {
    const map = source instanceof MeshStandardMaterial ? source.map : null;
    const normalMap = source instanceof MeshStandardMaterial ? source.normalMap : null;
    if (!map) throw new Error('Vegetation impostor material is missing its atlas texture.');
    return new ShaderMaterial({
      name: 'Eight-view vegetation impostor',
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          map: { value: map },
          normalMap: { value: normalMap ?? map },
          farFrameDistance: {
            value: VEGETATION_QUALITY_PROFILES[this.quality].impostorDistance,
          },
        },
      ]),
      fog: true,
      side: DoubleSide,
      depthWrite: true,
      transparent: false,
      vertexShader: `
        attribute vec3 instanceColor;
        varying vec2 vAtlasUv;
        varying vec3 vInstanceColor;
        varying float vFogDepth;
        uniform float farFrameDistance;

        void main() {
          vec3 center = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 toCamera = normalize(cameraPosition - center);
          vec3 right = normalize(vec3(toCamera.z, 0.0, -toCamera.x));
          float scaleX = length(instanceMatrix[0].xyz);
          float scaleY = length(instanceMatrix[1].xyz);
          vec3 worldPosition = center + right * position.x * scaleX + vec3(0.0, position.y * scaleY, 0.0);

          float objectYaw = atan(instanceMatrix[0].z, instanceMatrix[0].x);
          float cameraYaw = atan(toCamera.x, toCamera.z);
          float cameraDistance = length(cameraPosition - center);
          float frame = cameraDistance > farFrameDistance
            ? 0.0
            : mod(floor(mod(cameraYaw - objectYaw + 6.2831853, 6.2831853) / 6.2831853 * 8.0 + 0.5), 8.0);
          vAtlasUv = (uv + vec2(mod(frame, 4.0), floor(frame / 4.0))) / vec2(4.0, 2.0);
          vInstanceColor = instanceColor;
          vec4 viewPosition = viewMatrix * vec4(worldPosition, 1.0);
          vFogDepth = -viewPosition.z;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform sampler2D normalMap;
        uniform vec3 fogColor;
        uniform float fogDensity;
        varying vec2 vAtlasUv;
        varying vec3 vInstanceColor;
        varying float vFogDepth;

        void main() {
          vec4 sampled = texture2D(map, vAtlasUv);
          if (sampled.a < 0.45) discard;
          vec3 normal = texture2D(normalMap, vAtlasUv).xyz * 2.0 - 1.0;
          float diffuse = 0.82 + max(normal.z, 0.0) * 0.18;
          vec3 color = sampled.rgb * vInstanceColor * diffuse;
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          gl_FragColor = vec4(mix(color, fogColor, clamp(fogFactor, 0.0, 1.0)), sampled.a);
        }
      `,
    });
  }

  private append(batches: readonly Batch[], record: TreeRecord, tint?: Color): void {
    this.matrix.compose(record.position, record.quaternion, record.scale);
    for (const batch of batches) {
      const index = batch.ids.length;
      if (index >= MAX_INSTANCES) continue;
      batch.mesh.setMatrixAt(index, this.matrix);
      if (tint) batch.mesh.setColorAt(index, tint);
      batch.ids.push(record.id);
    }
  }

  private clearBatchCounts(): void {
    for (const state of this.resolvedSpecies.values()) {
      for (const variant of state.variants) {
        for (const batch of [
          ...variant.lod0,
          ...variant.lod0NoShadow,
          ...variant.lod1,
          ...variant.impostor,
          ...variant.shadow,
        ]) {
          batch.ids = [];
        }
      }
    }
  }

  private commitBatchCounts(): void {
    for (const state of this.resolvedSpecies.values()) {
      for (const variant of state.variants) {
        for (const batch of [
          ...variant.lod0,
          ...variant.lod0NoShadow,
          ...variant.lod1,
          ...variant.impostor,
          ...variant.shadow,
        ]) {
          batch.mesh.count = batch.ids.length;
          batch.mesh.instanceMatrix.needsUpdate = true;
          if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  private chooseLod(
    previous: VegetationLod | undefined,
    distance: number,
    profile: VegetationQualityProfile,
  ): VegetationLod {
    if (this.quality === 'ultra') return 'lod0';
    const multiplier = previous ? 1 + LOD_HYSTERESIS : 1;
    if (distance <= profile.lod0Distance * (previous === 'lod0' ? multiplier : 1)) return 'lod0';
    return 'lod1';
  }

  private indexRecord(record: TreeRecord): void {
    const key = this.cellKey(record.position);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    cell.add(record.id);
    this.recordCells.set(record.id, key);
  }

  private unindexRecord(id: string): void {
    const key = this.recordCells.get(id);
    if (!key) return;
    const cell = this.cells.get(key);
    cell?.delete(id);
    if (cell?.size === 0) this.cells.delete(key);
    this.recordCells.delete(id);
  }

  private cellKey(position: Vector3): string {
    return `${Math.floor(position.x / GRID_SIZE)},${Math.floor(position.z / GRID_SIZE)}`;
  }
}
