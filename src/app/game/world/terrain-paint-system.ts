import {
  CircleGeometry,
  Color,
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
import { TerrainHistory } from './terrain-history';
import {
  DEFAULT_TERRAIN_SURFACE,
  TERRAIN_SURFACE_INDEX,
  TERRAIN_SURFACE_LAYER_COUNT,
  TerrainSurfaceId,
  TerrainSurfaceLayers,
  terrainSurfaceById,
} from './terrain-surface.types';
import {
  DEFAULT_TERRAIN_BRUSH,
  TERRAIN_BRUSH_LIMITS,
  TerrainBrushSettings,
} from './terrain-sculpt.types';
import { TerrainSystem } from './terrain-system';

interface ActiveStroke {
  readonly changes: Map<number, TerrainSurfaceLayers>;
  lastPoint: Vector3;
  lastTime: number;
}

interface SurfaceLayer {
  id: number;
  weight: number;
}

/** Owns soft surface paint strokes, brush preview, and surface-layer history. */
export class TerrainPaintSystem {
  readonly preview = new Group();

  private readonly raycaster = new Raycaster();
  private readonly pointerPoint = new Vector3();
  private readonly history: TerrainHistory;
  private readonly previewFill: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly previewRing: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly previewFalloff: Mesh<RingGeometry, MeshBasicMaterial>;
  private activeSurface: TerrainSurfaceId = DEFAULT_TERRAIN_SURFACE;
  private brush: TerrainBrushSettings = DEFAULT_TERRAIN_BRUSH;
  private stroke: ActiveStroke | undefined;
  private hasPointerPoint = false;

  constructor(
    private readonly terrain: TerrainSystem,
    history = new TerrainHistory(),
  ) {
    this.history = history;
    this.previewFill = new Mesh(
      new CircleGeometry(1, 64),
      new MeshBasicMaterial({
        color: 0x8ea96a,
        opacity: 0.16,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.previewRing = new Mesh(
      new RingGeometry(0.985, 1, 64),
      new MeshBasicMaterial({
        color: 0x8ea96a,
        opacity: 0.92,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.previewFalloff = new Mesh(
      new RingGeometry(0.985, 1, 64),
      new MeshBasicMaterial({
        color: 0xdbe2b2,
        opacity: 0.5,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.previewFill.rotation.x = -Math.PI / 2;
    this.previewRing.rotation.x = -Math.PI / 2;
    this.previewFalloff.rotation.x = -Math.PI / 2;
    this.preview.add(this.previewFill, this.previewRing, this.previewFalloff);
    this.preview.name = 'Terrain surface brush';
    this.preview.renderOrder = 8;
    this.preview.visible = false;
    this.updatePreviewMaterial();
    this.updatePreviewGeometry();
  }

  get surface(): TerrainSurfaceId {
    return this.activeSurface;
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

  setSurface(surface: TerrainSurfaceId): void {
    if (this.stroke && this.activeSurface !== surface) this.endStroke(false);
    this.activeSurface = surface;
    this.updatePreviewMaterial();
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
    this.stroke = {
      changes: new Map(),
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

    const changes: Array<{
      readonly index: number;
      readonly before: TerrainSurfaceLayers;
      readonly after: TerrainSurfaceLayers;
    }> = [];
    for (const [index, before] of stroke.changes) {
      const after = this.terrain.getSurfaceLayers(index);
      if (!sameLayers(before, after)) changes.push({ index, before, after });
    }
    if (changes.length > 0) {
      this.history.push({
        undo: () => this.applyChanges(changes, 'before'),
        redo: () => this.applyChanges(changes, 'after'),
      });
    }
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

    for (let sampleZ = minZ; sampleZ <= maxZ; sampleZ += 1) {
      for (let sampleX = minX; sampleX <= maxX; sampleX += 1) {
        const world = this.terrain.sampleToWorld(sampleX, sampleZ);
        const falloff = this.falloffWeight(
          Math.hypot(world.x - point.x, world.z - point.z),
          radius,
        );
        if (falloff <= 0) continue;

        const index = this.terrain.sampleIndex(sampleX, sampleZ);
        const current = this.terrain.getSurfaceLayers(index);
        if (!this.stroke?.changes.has(index)) this.stroke?.changes.set(index, current);
        const amount = 1 - Math.exp(-8 * this.brush.strength * elapsed * falloff);
        this.terrain.setSurfaceLayers(index, this.paintLayers(current, amount));
      }
    }
    this.terrain.updateSurfaceRegion(minX, maxX, minZ, maxZ);
  }

  private paintLayers(current: TerrainSurfaceLayers, amount: number): TerrainSurfaceLayers {
    const selectedIndex = TERRAIN_SURFACE_INDEX[this.activeSurface];
    const layers: SurfaceLayer[] = current.ids.map((id, index) => ({
      id,
      weight: current.weights[index],
    }));
    let selectedLayer = layers.findIndex((layer) => layer.id === selectedIndex);
    if (selectedLayer < 0) {
      selectedLayer = layers.reduce(
        (lowest, layer, index) => (layer.weight < layers[lowest].weight ? index : lowest),
        0,
      );
      layers[selectedLayer] = { id: selectedIndex, weight: 0 };
    }

    const nextSelectedWeight =
      layers[selectedLayer].weight + (255 - layers[selectedLayer].weight) * amount;
    const otherWeight = layers.reduce(
      (total, layer, index) => (index === selectedLayer ? total : total + layer.weight),
      0,
    );
    layers.forEach((layer, index) => {
      layer.weight =
        index === selectedLayer
          ? nextSelectedWeight
          : otherWeight > 0
            ? (layer.weight / otherWeight) * (255 - nextSelectedWeight)
            : 0;
    });
    layers.sort((left, right) => left.id - right.id);
    return normalizeLayers(layers);
  }

  private restoreChanges(changes: ReadonlyMap<number, TerrainSurfaceLayers>): void {
    const list = [...changes].map(([index, before]) => ({ index, before, after: before }));
    this.applyChanges(list, 'before');
  }

  private applyChanges(
    changes: readonly {
      readonly index: number;
      readonly before: TerrainSurfaceLayers;
      readonly after: TerrainSurfaceLayers;
    }[],
    side: 'before' | 'after',
  ): void {
    let minX = this.terrain.sampleCountX - 1;
    let maxX = 0;
    let minZ = this.terrain.sampleCountZ - 1;
    let maxZ = 0;
    for (const change of changes) {
      this.terrain.setSurfaceLayers(change.index, change[side]);
      const coordinate = this.terrain.indexToSample(change.index);
      minX = Math.min(minX, coordinate.x);
      maxX = Math.max(maxX, coordinate.x);
      minZ = Math.min(minZ, coordinate.z);
      maxZ = Math.max(maxZ, coordinate.z);
    }
    if (changes.length > 0) this.terrain.updateSurfaceRegion(minX, maxX, minZ, maxZ);
  }

  private updatePreview(): void {
    this.preview.visible = this.hasPointerPoint;
    this.preview.position.set(
      this.pointerPoint.x,
      this.terrain.getHeightAtWorld(this.pointerPoint.x, this.pointerPoint.z) + 0.1,
      this.pointerPoint.z,
    );
  }

  private updatePreviewMaterial(): void {
    const color = new Color(terrainSurfaceById(this.activeSurface).tint);
    this.previewFill.material.color.copy(color);
    this.previewRing.material.color.copy(color);
    this.previewFalloff.material.color.copy(color).lerp(new Color(0xffffff), 0.45);
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

  private falloffWeight(distance: number, radius: number): number {
    if (distance >= radius) return 0;
    const innerRadius = radius * (1 - this.brush.falloff);
    if (distance <= innerRadius) return 1;
    const normalized = (distance - innerRadius) / Math.max(0.0001, radius - innerRadius);
    return 1 - normalized * normalized * (3 - 2 * normalized);
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }
}

function normalizeLayers(layers: readonly SurfaceLayer[]): TerrainSurfaceLayers {
  const normalized = layers.slice(0, TERRAIN_SURFACE_LAYER_COUNT);
  const rounded = normalized.map((layer) => ({
    id: layer.id,
    weight: Math.max(0, Math.round(layer.weight)),
  }));
  let difference = 255 - rounded.reduce((total, layer) => total + layer.weight, 0);
  const strongest = rounded.reduce(
    (index, layer, candidate) => (layer.weight > rounded[index].weight ? candidate : index),
    0,
  );
  rounded[strongest].weight = Math.max(0, rounded[strongest].weight + difference);
  difference = 255 - rounded.reduce((total, layer) => total + layer.weight, 0);
  if (difference !== 0) rounded[0].weight = Math.max(0, rounded[0].weight + difference);
  return {
    ids: [rounded[0].id, rounded[1].id, rounded[2].id, rounded[3].id],
    weights: [rounded[0].weight, rounded[1].weight, rounded[2].weight, rounded[3].weight],
  };
}

function sameLayers(left: TerrainSurfaceLayers, right: TerrainSurfaceLayers): boolean {
  for (let index = 0; index < TERRAIN_SURFACE_LAYER_COUNT; index += 1) {
    if (left.ids[index] !== right.ids[index] || left.weights[index] !== right.weights[index]) {
      return false;
    }
  }
  return true;
}
