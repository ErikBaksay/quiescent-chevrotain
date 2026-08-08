import {
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
} from 'three';
import { TerrainHistory, TerrainHeightChange } from './terrain-history';
import { TerrainSystem } from './terrain-system';
import {
  DEFAULT_TERRAIN_BRUSH,
  TERRAIN_BRUSH_LIMITS,
  TerrainBrushSettings,
  TerrainSculptTool,
} from './terrain-sculpt.types';

interface ActiveStroke {
  readonly changes: Map<number, number>;
  readonly targetHeight: number;
  lastPoint: Vector3;
  lastTime: number;
}

interface SampleUpdate {
  readonly x: number;
  readonly z: number;
  readonly height: number;
}

/** Owns brush preview, pointer strokes, terrain mutation, and terrain history. */
export class TerrainSculptSystem {
  readonly preview = new Group();

  private readonly raycaster = new Raycaster();
  private readonly pointerPoint = new Vector3();
  private readonly history: TerrainHistory;
  private readonly previewFill: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly previewRing: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly previewFalloff: Mesh<RingGeometry, MeshBasicMaterial>;
  private activeTool: TerrainSculptTool = 'raise';
  private brush: TerrainBrushSettings = DEFAULT_TERRAIN_BRUSH;
  private stroke: ActiveStroke | undefined;
  private hasPointerPoint = false;

  constructor(private readonly terrain: TerrainSystem) {
    this.history = new TerrainHistory(terrain);

    this.previewFill = new Mesh(
      new CircleGeometry(1, 64),
      new MeshBasicMaterial({
        color: 0xffd37a,
        opacity: 0.08,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.previewRing = new Mesh(
      new RingGeometry(0.985, 1, 64),
      new MeshBasicMaterial({
        color: 0xffd37a,
        opacity: 0.85,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.previewFalloff = new Mesh(
      new RingGeometry(0.985, 1, 64),
      new MeshBasicMaterial({
        color: 0xfff0bd,
        opacity: 0.42,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.previewFill.rotation.x = -Math.PI / 2;
    this.previewRing.rotation.x = -Math.PI / 2;
    this.previewFalloff.rotation.x = -Math.PI / 2;
    this.preview.add(this.previewFill, this.previewRing, this.previewFalloff);
    this.preview.name = 'Terrain sculpt brush';
    this.preview.renderOrder = 8;
    this.preview.visible = false;
    this.updatePreviewGeometry();
  }

  get tool(): TerrainSculptTool {
    return this.activeTool;
  }

  get brushSettings(): TerrainBrushSettings {
    return this.brush;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  setTool(tool: TerrainSculptTool): void {
    if (this.stroke && this.activeTool !== tool) this.endStroke(false);
    this.activeTool = tool;
    this.updatePreviewGeometry();
  }

  setBrush(settings: TerrainBrushSettings): void {
    this.brush = {
      size: this.clamp(settings.size, TERRAIN_BRUSH_LIMITS.minSize, TERRAIN_BRUSH_LIMITS.maxSize),
      strength: this.clamp(
        settings.strength,
        TERRAIN_BRUSH_LIMITS.minStrength,
        TERRAIN_BRUSH_LIMITS.maxStrength,
      ),
      falloff: this.clamp(
        settings.falloff,
        TERRAIN_BRUSH_LIMITS.minFalloff,
        TERRAIN_BRUSH_LIMITS.maxFalloff,
      ),
    };
    this.updatePreviewGeometry();
  }

  updatePointer(pointer: Vector2, camera: PerspectiveCamera): boolean {
    const point = this.raycast(pointer, camera);
    if (!point) {
      this.hasPointerPoint = false;
      if (!this.stroke) this.preview.visible = false;
      return false;
    }

    this.pointerPoint.copy(point);
    this.hasPointerPoint = true;
    this.updatePreview();
    return true;
  }

  beginStroke(pointer: Vector2, camera: PerspectiveCamera, time = performance.now()): boolean {
    if (this.stroke || !this.updatePointer(pointer, camera)) return false;
    const targetHeight = this.terrain.getHeightAtWorld(this.pointerPoint.x, this.pointerPoint.z);
    this.stroke = {
      changes: new Map(),
      targetHeight,
      lastPoint: this.pointerPoint.clone(),
      lastTime: time,
    };
    this.preview.visible = true;
    this.applySegment(this.pointerPoint, this.pointerPoint, 1 / 60);
    return true;
  }

  updateStroke(pointer: Vector2, camera: PerspectiveCamera, time = performance.now()): boolean {
    if (!this.stroke || !this.updatePointer(pointer, camera)) return false;
    const elapsed = Math.min(0.1, Math.max(0, (time - this.stroke.lastTime) / 1_000));
    this.applySegment(this.stroke.lastPoint, this.pointerPoint, elapsed || 1 / 60);
    this.stroke.lastPoint.copy(this.pointerPoint);
    this.stroke.lastTime = time;
    return true;
  }

  endStroke(commit = true): boolean {
    const stroke = this.stroke;
    this.stroke = undefined;
    if (!stroke) return false;

    if (!commit) {
      this.restoreChanges(stroke.changes);
      return true;
    }

    const changes: TerrainHeightChange[] = [];
    for (const [index, before] of stroke.changes) {
      const after = this.terrain.getHeightAtIndex(index);
      if (Math.abs(after - before) > 0.00001) changes.push({ index, before, after });
    }
    this.history.push(changes);
    return true;
  }

  clearPointer(): void {
    this.hasPointerPoint = false;
    if (!this.stroke) this.preview.visible = false;
  }

  undo(): boolean {
    return this.history.undo();
  }

  redo(): boolean {
    return this.history.redo();
  }

  dispose(): void {
    this.endStroke(false);
    this.preview.removeFromParent();
    this.previewFill.geometry.dispose();
    this.previewRing.geometry.dispose();
    this.previewFalloff.geometry.dispose();
    this.previewFill.material.dispose();
    this.previewRing.material.dispose();
    this.previewFalloff.material.dispose();
    this.history.clear();
  }

  private raycast(pointer: Vector2, camera: PerspectiveCamera): Vector3 | undefined {
    this.terrain.root.updateWorldMatrix(true, true);
    camera.updateWorldMatrix(true, false);
    this.raycaster.setFromCamera(pointer, camera);
    return this.raycaster.intersectObject(this.terrain.root, true)[0]?.point;
  }

  private applySegment(start: Vector3, end: Vector3, elapsed: number): void {
    const distance = start.distanceTo(end);
    const spacing = Math.max(this.terrain.sampleSpacing, this.brush.size * 0.25);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    const secondsPerStep = elapsed / steps;

    for (let step = 0; step < steps; step += 1) {
      const amount = (step + 1) / steps;
      const point = start.clone().lerp(end, amount);
      this.applyStamp(point, secondsPerStep);
    }
  }

  private applyStamp(point: Vector3, elapsed: number): void {
    const center = this.terrain.worldToSample({ x: point.x, z: point.z });
    const radius = this.brush.size / 2;
    const sampleRadius = radius / this.terrain.sampleSpacing;
    const minX = Math.max(0, Math.floor(center.x - sampleRadius));
    const maxX = Math.min(this.terrain.sampleCountX - 1, Math.ceil(center.x + sampleRadius));
    const minZ = Math.max(0, Math.floor(center.z - sampleRadius));
    const maxZ = Math.min(this.terrain.sampleCountZ - 1, Math.ceil(center.z + sampleRadius));
    const updates: SampleUpdate[] = [];

    for (let sampleZ = minZ; sampleZ <= maxZ; sampleZ += 1) {
      for (let sampleX = minX; sampleX <= maxX; sampleX += 1) {
        const world = this.terrain.sampleToWorld(sampleX, sampleZ);
        const distance = Math.hypot(world.x - point.x, world.z - point.z);
        const weight = this.falloffWeight(distance, radius);
        if (weight <= 0) continue;

        const current = this.terrain.getHeightAtSample(sampleX, sampleZ);
        const target = this.targetHeightFor(sampleX, sampleZ, current);
        const next = this.nextHeight(current, target, weight, elapsed);
        if (Math.abs(next - current) > 0.000001) {
          const index = this.terrain.sampleIndex(sampleX, sampleZ);
          const stroke = this.stroke;
          if (stroke && !stroke.changes.has(index)) stroke.changes.set(index, current);
          updates.push({ x: sampleX, z: sampleZ, height: next });
        }
      }
    }

    for (const update of updates) this.terrain.setHeightAtSample(update.x, update.z, update.height);
    if (updates.length > 0) this.terrain.updateRegion(minX, maxX, minZ, maxZ);
  }

  private targetHeightFor(sampleX: number, sampleZ: number, current: number): number {
    if (this.activeTool === 'flatten') return this.stroke?.targetHeight ?? current;
    if (this.activeTool !== 'smooth') return current;

    let total = 0;
    let weight = 0;
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    let kernelIndex = 0;
    for (let z = -1; z <= 1; z += 1) {
      for (let x = -1; x <= 1; x += 1) {
        const sampleWeight = kernel[kernelIndex++];
        total += this.terrain.getHeightAtSample(sampleX + x, sampleZ + z) * sampleWeight;
        weight += sampleWeight;
      }
    }
    return total / weight;
  }

  private nextHeight(current: number, target: number, weight: number, elapsed: number): number {
    const rate = 6 * this.brush.strength * elapsed * weight;
    if (this.activeTool === 'raise') return current + rate;
    if (this.activeTool === 'lower') return current - rate;
    return current + (target - current) * (1 - Math.exp(-rate));
  }

  private falloffWeight(distance: number, radius: number): number {
    if (distance >= radius) return 0;
    const innerRadius = radius * (1 - this.brush.falloff);
    if (distance <= innerRadius) return 1;
    const normalized = (distance - innerRadius) / Math.max(0.0001, radius - innerRadius);
    return 1 - normalized * normalized * (3 - 2 * normalized);
  }

  private restoreChanges(changes: ReadonlyMap<number, number>): void {
    let minX = this.terrain.sampleCountX - 1;
    let maxX = 0;
    let minZ = this.terrain.sampleCountZ - 1;
    let maxZ = 0;
    for (const [index, height] of changes) {
      this.terrain.setHeightAtIndex(index, height);
      const coordinate = this.terrain.indexToSample(index);
      minX = Math.min(minX, coordinate.x);
      maxX = Math.max(maxX, coordinate.x);
      minZ = Math.min(minZ, coordinate.z);
      maxZ = Math.max(maxZ, coordinate.z);
    }
    if (changes.size > 0) this.terrain.updateRegion(minX, maxX, minZ, maxZ);
  }

  private updatePreview(): void {
    this.preview.visible = this.hasPointerPoint;
    this.preview.position.set(
      this.pointerPoint.x,
      this.terrain.getHeightAtWorld(this.pointerPoint.x, this.pointerPoint.z) + 0.08,
      this.pointerPoint.z,
    );
  }

  private updatePreviewGeometry(): void {
    const radius = this.brush.size / 2;
    this.preview.scale.set(radius, radius, radius);
    this.previewFalloff.scale.set(
      Math.max(0.01, 1 - this.brush.falloff),
      Math.max(0.01, 1 - this.brush.falloff),
      Math.max(0.01, 1 - this.brush.falloff),
    );
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }
}
