import { Group, Scene } from 'three';
import { TerrainSystem } from './terrain-system';
import { WorldConfig } from './world.config';

/** Owns the finite world root and the initial terrain surface. */
export class WorldSystem {
  readonly terrain: Group;
  readonly terrainSystem: TerrainSystem;

  private readonly root = new Group();

  constructor(
    private readonly scene: Scene,
    config: WorldConfig,
  ) {
    this.root.name = 'World';

    this.terrainSystem = new TerrainSystem(config);
    this.terrain = this.terrainSystem.root;

    this.root.add(this.terrain);
    this.scene.add(this.root);
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.terrainSystem.dispose();
  }
}
