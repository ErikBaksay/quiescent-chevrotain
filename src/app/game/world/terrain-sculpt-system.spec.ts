import { PerspectiveCamera, Scene, Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import { TerrainSculptSystem } from './terrain-sculpt-system';
import { TerrainSystem } from './terrain-system';
import { WorldConfig } from './world.config';

const config: WorldConfig = {
  width: 100,
  depth: 100,
  terrain: {
    sampleSpacing: 2,
    tileSize: 50,
    minHeight: -100,
    maxHeight: 100,
    baseHeight: 0,
  },
  camera: {
    near: 0.5,
    far: 500,
    initialPosition: [0, 50, 50],
    initialTarget: [0, 0, 0],
    minDistance: 8,
    maxDistance: 200,
  },
};

function createFixture(): {
  readonly terrain: TerrainSystem;
  readonly sculpt: TerrainSculptSystem;
  readonly camera: PerspectiveCamera;
} {
  const terrain = new TerrainSystem(config);
  const scene = new Scene();
  scene.add(terrain.root);
  const camera = new PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(0, 50, 50);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  return { terrain, sculpt: new TerrainSculptSystem(terrain), camera };
}

describe('TerrainSculptSystem', () => {
  it('raises and lowers terrain through a stroke', () => {
    const { terrain, sculpt, camera } = createFixture();
    const pointer = new Vector2(0, 0);

    sculpt.setBrush({ size: 8, strength: 1, falloff: 0 });
    sculpt.setTool('raise');
    expect(sculpt.beginStroke(pointer, camera, 0)).toBe(true);
    sculpt.updateStroke(pointer, camera, 1_000);
    sculpt.endStroke(true);
    expect(terrain.getHeightAtWorld(0, 0)).toBeGreaterThan(0);

    const raised = terrain.getHeightAtWorld(0, 0);
    sculpt.setTool('lower');
    expect(sculpt.beginStroke(pointer, camera, 2_000)).toBe(true);
    sculpt.updateStroke(pointer, camera, 3_000);
    sculpt.endStroke(true);
    expect(terrain.getHeightAtWorld(0, 0)).toBeLessThan(raised);

    sculpt.dispose();
    terrain.dispose();
  });

  it('flattens toward the height captured at stroke start', () => {
    const { terrain, sculpt, camera } = createFixture();
    terrain.setHeightAtSample(25, 25, 12);
    terrain.setHeightAtSample(26, 25, 0);
    terrain.updateRegion(25, 26, 25, 25);
    sculpt.setBrush({ size: 8, strength: 1, falloff: 0 });
    sculpt.setTool('flatten');

    expect(sculpt.beginStroke(new Vector2(0, 0), camera, 0)).toBe(true);
    sculpt.updateStroke(new Vector2(0.05, 0), camera, 1_000);
    sculpt.endStroke(true);

    expect(terrain.getHeightAtSample(26, 25)).toBeGreaterThan(0);
    expect(terrain.getHeightAtSample(26, 25)).toBeLessThan(12);

    sculpt.dispose();
    terrain.dispose();
  });

  it('smooths a local peak and supports stroke undo/redo', () => {
    const { terrain, sculpt, camera } = createFixture();
    terrain.setHeightAtSample(25, 25, 20);
    terrain.updateRegion(25, 25, 25, 25);
    sculpt.setBrush({ size: 8, strength: 1, falloff: 0 });
    sculpt.setTool('smooth');

    expect(sculpt.beginStroke(new Vector2(0, 0), camera, 0)).toBe(true);
    sculpt.updateStroke(new Vector2(0, 0), camera, 1_000);
    sculpt.endStroke(true);
    expect(terrain.getHeightAtSample(25, 25)).toBeLessThan(20);
    expect(sculpt.canUndo).toBe(true);

    expect(sculpt.undo()).toBe(true);
    expect(terrain.getHeightAtSample(25, 25)).toBe(20);
    expect(sculpt.canRedo).toBe(true);
    expect(sculpt.redo()).toBe(true);
    expect(terrain.getHeightAtSample(25, 25)).toBeLessThan(20);

    sculpt.dispose();
    terrain.dispose();
  });
});
