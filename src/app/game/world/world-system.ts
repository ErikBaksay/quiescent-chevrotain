import {
  BufferAttribute,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
} from 'three';
import { WorldConfig } from './world.config';

/** Owns the finite world root and the initial terrain surface. */
export class WorldSystem {
  readonly terrain: Mesh;

  private readonly root = new Group();
  private readonly terrainGeometry: PlaneGeometry;
  private readonly terrainMaterial: MeshStandardMaterial;

  constructor(
    private readonly scene: Scene,
    config: WorldConfig,
  ) {
    this.root.name = 'World';

    this.terrainGeometry = new PlaneGeometry(
      config.width,
      config.depth,
      config.terrainSegments,
      config.terrainSegments,
    );
    this.addTerrainColorVariation(this.terrainGeometry);

    this.terrainMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.96,
      vertexColors: true,
    });

    this.terrain = new Mesh(this.terrainGeometry, this.terrainMaterial);
    this.terrain.name = 'Terrain';
    this.terrain.rotation.x = -Math.PI / 2;
    this.terrain.receiveShadow = true;

    this.root.add(this.terrain);
    this.scene.add(this.root);
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.terrainGeometry.dispose();
    this.terrainMaterial.dispose();
  }

  private addTerrainColorVariation(geometry: PlaneGeometry): void {
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const color = new Color();

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getY(index);
      const broadVariation = Math.sin(x * 0.009) * 0.45 + Math.cos(z * 0.007) * 0.35;
      const fineVariation = this.hashPosition(x, z) - 0.5;
      const variation = broadVariation * 0.018 + fineVariation * 0.024;

      color.setHSL(0.255 + variation * 0.18, 0.34, 0.31 + variation);
      color.toArray(colors, index * 3);
    }

    geometry.setAttribute('color', new BufferAttribute(colors, 3));
  }

  private hashPosition(x: number, z: number): number {
    const value = Math.sin(x * 12.9898 + z * 78.233) * 43_758.5453;
    return value - Math.floor(value);
  }
}
