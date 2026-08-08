import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
} from 'three';
import { WorldConfig } from './world.config';
import {
  DEFAULT_TERRAIN_SURFACE,
  TERRAIN_SURFACE_INDEX,
  TERRAIN_SURFACE_LAYER_COUNT,
  TerrainSurfaceLayers,
} from './terrain-surface.types';
import {
  createFallbackTerrainSurfaceTextures,
  createTerrainSurfaceMaterial,
  loadTerrainSurfaceTextures,
  TerrainSurfaceTextureSet,
} from './terrain-surface-material';

interface TerrainTile {
  readonly mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  readonly startCellX: number;
  readonly startCellZ: number;
  readonly cellsX: number;
  readonly cellsZ: number;
  readonly surfaceIds: Uint8Array;
  readonly surfaceWeights: Uint8Array;
  readonly surfaceIdTexture: DataTexture;
  readonly surfaceWeightTexture: DataTexture;
}

export interface TerrainSampleCoordinate {
  readonly x: number;
  readonly z: number;
}

/** Owns the editable logical heightfield and its local render tiles. */
export class TerrainSystem {
  readonly root = new Group();

  readonly sampleSpacing: number;
  readonly sampleCountX: number;
  readonly sampleCountZ: number;

  private readonly heights: Float32Array;
  private readonly surfaceIds: Uint8Array;
  private readonly surfaceWeights: Uint8Array;
  private readonly tiles: TerrainTile[] = [];
  private surfaceTextures: TerrainSurfaceTextureSet;
  private readonly width: number;
  private readonly depth: number;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly minHeight: number;
  private readonly maxHeight: number;
  private disposed = false;

  constructor(private readonly config: WorldConfig) {
    this.width = config.width;
    this.depth = config.depth;
    this.sampleSpacing = config.terrain.sampleSpacing;
    this.sampleCountX = Math.round(this.width / this.sampleSpacing) + 1;
    this.sampleCountZ = Math.round(this.depth / this.sampleSpacing) + 1;
    this.minX = -this.width / 2;
    this.minZ = -this.depth / 2;
    this.minHeight = config.terrain.minHeight;
    this.maxHeight = config.terrain.maxHeight;
    this.heights = new Float32Array(this.sampleCountX * this.sampleCountZ);
    this.heights.fill(config.terrain.baseHeight);
    this.surfaceIds = new Uint8Array(this.heights.length * TERRAIN_SURFACE_LAYER_COUNT);
    this.surfaceWeights = new Uint8Array(this.heights.length * TERRAIN_SURFACE_LAYER_COUNT);
    this.surfaceTextures = createFallbackTerrainSurfaceTextures();
    this.surfaceIds.fill(TERRAIN_SURFACE_INDEX[DEFAULT_TERRAIN_SURFACE]);
    for (let index = 0; index < this.heights.length; index += 1) {
      this.surfaceWeights[index * TERRAIN_SURFACE_LAYER_COUNT] = 255;
    }

    this.root.name = 'Terrain';

    this.createTiles();
  }

  get heightData(): Float32Array {
    return this.heights;
  }

  get tileCount(): number {
    return this.tiles.length;
  }

  get surfaceLayerCount(): number {
    return TERRAIN_SURFACE_LAYER_COUNT;
  }

  async loadSurfaceTextures(maxAnisotropy = 1): Promise<void> {
    try {
      const textures = await loadTerrainSurfaceTextures(maxAnisotropy);
      if (this.disposed) {
        disposeTextureSet(textures);
        return;
      }
      const previous = this.surfaceTextures;
      this.surfaceTextures = textures;
      for (const tile of this.tiles) {
        tile.mesh.material.dispose();
        tile.mesh.material = this.createTileMaterial(tile);
      }
      disposeTextureSet(previous);
    } catch {
      // The generated fallback atlas remains usable when static assets are unavailable.
    }
  }

  getHeightAtSample(x: number, z: number): number {
    const sampleX = this.clampSampleX(Math.round(x));
    const sampleZ = this.clampSampleZ(Math.round(z));
    return this.heights[this.sampleIndex(sampleX, sampleZ)];
  }

  getHeightAtIndex(index: number): number {
    return this.heights[Math.max(0, Math.min(this.heights.length - 1, index))];
  }

  setHeightAtIndex(index: number, height: number): void {
    const safeIndex = Math.max(0, Math.min(this.heights.length - 1, index));
    this.heights[safeIndex] = Math.min(this.maxHeight, Math.max(this.minHeight, height));
  }

  sampleIndex(x: number, z: number): number {
    return this.sampleIndexInternal(Math.round(x), Math.round(z));
  }

  indexToSample(index: number): TerrainSampleCoordinate {
    const safeIndex = Math.max(0, Math.min(this.heights.length - 1, Math.round(index)));
    return {
      x: safeIndex % this.sampleCountX,
      z: Math.floor(safeIndex / this.sampleCountX),
    };
  }

  setHeightAtSample(x: number, z: number, height: number): void {
    const sampleX = this.clampSampleX(Math.round(x));
    const sampleZ = this.clampSampleZ(Math.round(z));
    this.heights[this.sampleIndex(sampleX, sampleZ)] = Math.min(
      this.maxHeight,
      Math.max(this.minHeight, height),
    );
  }

  getSurfaceLayers(index: number): TerrainSurfaceLayers {
    const safeIndex = Math.max(0, Math.min(this.heights.length - 1, Math.round(index)));
    const offset = safeIndex * TERRAIN_SURFACE_LAYER_COUNT;
    return {
      ids: [
        this.surfaceIds[offset],
        this.surfaceIds[offset + 1],
        this.surfaceIds[offset + 2],
        this.surfaceIds[offset + 3],
      ],
      weights: [
        this.surfaceWeights[offset],
        this.surfaceWeights[offset + 1],
        this.surfaceWeights[offset + 2],
        this.surfaceWeights[offset + 3],
      ],
    };
  }

  setSurfaceLayers(index: number, layers: TerrainSurfaceLayers): void {
    const safeIndex = Math.max(0, Math.min(this.heights.length - 1, Math.round(index)));
    const offset = safeIndex * TERRAIN_SURFACE_LAYER_COUNT;
    for (let layer = 0; layer < TERRAIN_SURFACE_LAYER_COUNT; layer += 1) {
      this.surfaceIds[offset + layer] = Math.max(0, Math.min(255, layers.ids[layer]));
      this.surfaceWeights[offset + layer] = Math.max(0, Math.min(255, layers.weights[layer]));
    }
  }

  /** Refreshes only paint textures belonging to the changed sample rectangle. */
  updateSurfaceRegion(
    minSampleX: number,
    maxSampleX: number,
    minSampleZ: number,
    maxSampleZ: number,
  ): void {
    for (const tile of this.tiles) {
      const tileMaxX = tile.startCellX + tile.cellsX;
      const tileMaxZ = tile.startCellZ + tile.cellsZ;
      if (
        tileMaxX < minSampleX ||
        tile.startCellX > maxSampleX ||
        tileMaxZ < minSampleZ ||
        tile.startCellZ > maxSampleZ
      ) {
        continue;
      }
      this.updateSurfaceTile(tile);
    }
  }

  getHeightAtWorld(x: number, z: number): number {
    const coordinate = this.worldToSample({ x, z });
    const x0 = Math.floor(coordinate.x);
    const z0 = Math.floor(coordinate.z);
    const x1 = Math.min(this.sampleCountX - 1, x0 + 1);
    const z1 = Math.min(this.sampleCountZ - 1, z0 + 1);
    const tx = coordinate.x - x0;
    const tz = coordinate.z - z0;
    const top = this.getHeightAtSample(x0, z0) * (1 - tx) + this.getHeightAtSample(x1, z0) * tx;
    const bottom = this.getHeightAtSample(x0, z1) * (1 - tx) + this.getHeightAtSample(x1, z1) * tx;
    return top * (1 - tz) + bottom * tz;
  }

  worldToSample(point: TerrainSampleCoordinate): TerrainSampleCoordinate {
    return {
      x: this.clampSampleCoordinate((point.x - this.minX) / this.sampleSpacing, this.sampleCountX),
      z: this.clampSampleCoordinate((point.z - this.minZ) / this.sampleSpacing, this.sampleCountZ),
    };
  }

  sampleToWorld(x: number, z: number): TerrainSampleCoordinate {
    return {
      x: this.minX + this.clampSampleX(x) * this.sampleSpacing,
      z: this.minZ + this.clampSampleZ(z) * this.sampleSpacing,
    };
  }

  /** Refreshes only tiles intersecting the changed sample rectangle. */
  updateRegion(
    minSampleX: number,
    maxSampleX: number,
    minSampleZ: number,
    maxSampleZ: number,
  ): void {
    const expandedMinX = this.clampSampleX(Math.floor(minSampleX) - 1);
    const expandedMaxX = this.clampSampleX(Math.ceil(maxSampleX) + 1);
    const expandedMinZ = this.clampSampleZ(Math.floor(minSampleZ) - 1);
    const expandedMaxZ = this.clampSampleZ(Math.ceil(maxSampleZ) + 1);

    for (const tile of this.tiles) {
      const tileMaxX = tile.startCellX + tile.cellsX;
      const tileMaxZ = tile.startCellZ + tile.cellsZ;
      if (
        tileMaxX < expandedMinX ||
        tile.startCellX > expandedMaxX ||
        tileMaxZ < expandedMinZ ||
        tile.startCellZ > expandedMaxZ
      ) {
        continue;
      }
      this.updateTile(tile);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.root.removeFromParent();
    for (const tile of this.tiles) {
      tile.mesh.geometry.dispose();
      tile.mesh.material.dispose();
      tile.surfaceIdTexture.dispose();
      tile.surfaceWeightTexture.dispose();
    }
    disposeTextureSet(this.surfaceTextures);
    this.root.clear();
  }

  private createTiles(): void {
    const cellsPerTile = Math.max(1, Math.round(this.config.terrain.tileSize / this.sampleSpacing));
    const cellCountX = this.sampleCountX - 1;
    const cellCountZ = this.sampleCountZ - 1;

    for (let startCellZ = 0; startCellZ < cellCountZ; startCellZ += cellsPerTile) {
      for (let startCellX = 0; startCellX < cellCountX; startCellX += cellsPerTile) {
        const cellsX = Math.min(cellsPerTile, cellCountX - startCellX);
        const cellsZ = Math.min(cellsPerTile, cellCountZ - startCellZ);
        const geometry = this.createTileGeometry(startCellX, startCellZ, cellsX, cellsZ);
        const surfaceIds = new Uint8Array(
          (cellsX + 1) * (cellsZ + 1) * TERRAIN_SURFACE_LAYER_COUNT,
        );
        const surfaceWeights = new Uint8Array(
          (cellsX + 1) * (cellsZ + 1) * TERRAIN_SURFACE_LAYER_COUNT,
        );
        const surfaceIdTexture = this.createSurfaceTexture(
          surfaceIds,
          cellsX + 1,
          cellsZ + 1,
          NearestFilter,
        );
        const surfaceWeightTexture = this.createSurfaceTexture(
          surfaceWeights,
          cellsX + 1,
          cellsZ + 1,
          LinearMipmapLinearFilter,
        );
        const tile: TerrainTile = {
          mesh: new Mesh(geometry, new MeshStandardMaterial()),
          startCellX,
          startCellZ,
          cellsX,
          cellsZ,
          surfaceIds,
          surfaceWeights,
          surfaceIdTexture,
          surfaceWeightTexture,
        };
        tile.mesh.material.dispose();
        tile.mesh.material = this.createTileMaterial(tile);
        const origin = this.sampleToWorld(startCellX, startCellZ);
        tile.mesh.position.set(origin.x, 0, origin.z);
        tile.mesh.name = `Terrain tile ${this.tiles.length + 1}`;
        tile.mesh.receiveShadow = true;
        this.root.add(tile.mesh);
        this.tiles.push(tile);
        this.updateSurfaceTile(tile);
      }
    }
  }

  private createTileGeometry(
    startCellX: number,
    startCellZ: number,
    cellsX: number,
    cellsZ: number,
  ): BufferGeometry {
    const verticesX = cellsX + 1;
    const verticesZ = cellsZ + 1;
    const vertexCount = verticesX * verticesZ;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(cellsX * cellsZ * 6);

    for (let localZ = 0; localZ < verticesZ; localZ += 1) {
      for (let localX = 0; localX < verticesX; localX += 1) {
        const sampleX = startCellX + localX;
        const sampleZ = startCellZ + localZ;
        const vertex = localZ * verticesX + localX;
        const positionOffset = vertex * 3;
        positions[positionOffset] = localX * this.sampleSpacing;
        positions[positionOffset + 1] = this.getHeightAtSample(sampleX, sampleZ);
        positions[positionOffset + 2] = localZ * this.sampleSpacing;
        this.writeNormal(normals, positionOffset, sampleX, sampleZ);
        uvs[vertex * 2] = cellsX > 0 ? localX / cellsX : 0;
        uvs[vertex * 2 + 1] = cellsZ > 0 ? localZ / cellsZ : 0;
      }
    }

    let index = 0;
    for (let localZ = 0; localZ < cellsZ; localZ += 1) {
      for (let localX = 0; localX < cellsX; localX += 1) {
        const topLeft = localZ * verticesX + localX;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + verticesX;
        const bottomRight = bottomLeft + 1;
        indices[index++] = topLeft;
        indices[index++] = bottomLeft;
        indices[index++] = topRight;
        indices[index++] = topRight;
        indices[index++] = bottomLeft;
        indices[index++] = bottomRight;
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }

  private updateTile(tile: TerrainTile): void {
    const position = tile.mesh.geometry.getAttribute('position') as BufferAttribute;
    const normal = tile.mesh.geometry.getAttribute('normal') as BufferAttribute;
    const verticesX = tile.cellsX + 1;

    for (let localZ = 0; localZ <= tile.cellsZ; localZ += 1) {
      for (let localX = 0; localX <= tile.cellsX; localX += 1) {
        const sampleX = tile.startCellX + localX;
        const sampleZ = tile.startCellZ + localZ;
        const vertex = localZ * verticesX + localX;
        position.setY(vertex, this.getHeightAtSample(sampleX, sampleZ));
        this.writeNormal(normal.array as Float32Array, vertex * 3, sampleX, sampleZ);
      }
    }

    position.needsUpdate = true;
    normal.needsUpdate = true;
    tile.mesh.geometry.computeBoundingSphere();
  }

  private updateSurfaceTile(tile: TerrainTile): void {
    const verticesX = tile.cellsX + 1;
    for (let localZ = 0; localZ <= tile.cellsZ; localZ += 1) {
      for (let localX = 0; localX <= tile.cellsX; localX += 1) {
        const sourceIndex = this.sampleIndex(tile.startCellX + localX, tile.startCellZ + localZ);
        const sourceOffset = sourceIndex * TERRAIN_SURFACE_LAYER_COUNT;
        const localOffset = (localZ * verticesX + localX) * TERRAIN_SURFACE_LAYER_COUNT;
        for (let layer = 0; layer < TERRAIN_SURFACE_LAYER_COUNT; layer += 1) {
          tile.surfaceIds[localOffset + layer] = this.surfaceIds[sourceOffset + layer];
          tile.surfaceWeights[localOffset + layer] = this.surfaceWeights[sourceOffset + layer];
        }
      }
    }
    tile.surfaceIdTexture.needsUpdate = true;
    tile.surfaceWeightTexture.needsUpdate = true;
  }

  private createSurfaceTexture(
    data: Uint8Array,
    width: number,
    height: number,
    filter: typeof LinearFilter | typeof LinearMipmapLinearFilter | typeof NearestFilter,
  ): DataTexture {
    const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
    texture.flipY = false;
    texture.minFilter = filter;
    texture.magFilter = filter === NearestFilter ? NearestFilter : LinearFilter;
    texture.generateMipmaps = filter === LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  private createTileMaterial(tile: TerrainTile): MeshStandardMaterial {
    return createTerrainSurfaceMaterial({
      textures: this.surfaceTextures,
      layerIds: tile.surfaceIdTexture,
      layerWeights: tile.surfaceWeightTexture,
      tileWorldSize: new Vector2(
        tile.cellsX * this.sampleSpacing,
        tile.cellsZ * this.sampleSpacing,
      ),
    });
  }

  private writeNormal(
    target: Float32Array,
    offset: number,
    sampleX: number,
    sampleZ: number,
  ): void {
    const left = this.getHeightAtSample(sampleX - 1, sampleZ);
    const right = this.getHeightAtSample(sampleX + 1, sampleZ);
    const top = this.getHeightAtSample(sampleX, sampleZ - 1);
    const bottom = this.getHeightAtSample(sampleX, sampleZ + 1);
    const dx = (right - left) / (2 * this.sampleSpacing);
    const dz = (bottom - top) / (2 * this.sampleSpacing);
    const length = Math.sqrt(dx * dx + dz * dz + 1);
    target[offset] = -dx / length;
    target[offset + 1] = 1 / length;
    target[offset + 2] = -dz / length;
  }

  private sampleIndexInternal(x: number, z: number): number {
    return this.clampSampleZ(z) * this.sampleCountX + this.clampSampleX(x);
  }

  private clampSampleX(value: number): number {
    return Math.max(0, Math.min(this.sampleCountX - 1, value));
  }

  private clampSampleZ(value: number): number {
    return Math.max(0, Math.min(this.sampleCountZ - 1, value));
  }

  private clampSampleCoordinate(value: number, count: number): number {
    return Math.max(0, Math.min(count - 1, value));
  }
}

function disposeTextureSet(textures: TerrainSurfaceTextureSet): void {
  const disposed = new Set<unknown>();
  for (const texture of [
    textures.albedo,
    textures.normal,
    textures.roughness,
    textures.ao,
    textures.parameters,
  ]) {
    if (disposed.has(texture)) continue;
    disposed.add(texture);
    texture.dispose();
  }
}
