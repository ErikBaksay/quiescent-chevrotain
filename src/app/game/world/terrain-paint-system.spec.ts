import { PerspectiveCamera, Scene, Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import { TerrainHistory } from './terrain-history';
import { TerrainPaintSystem } from './terrain-paint-system';
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

describe('TerrainPaintSystem', () => {
  it('blends a selected surface into four normalized layers and supports undo/redo', () => {
    const terrain = new TerrainSystem(config);
    const scene = new Scene();
    scene.add(terrain.root);
    const camera = createCamera(scene);
    const paint = new TerrainPaintSystem(terrain);
    const centerIndex = terrain.sampleIndex(25, 25);

    paint.setSurface('asphalt');
    paint.setBrush({ size: 8, strength: 1, falloff: 0.5 });
    expect(paint.beginStroke(new Vector2(0, 0), camera, 0)).toBe(true);
    paint.updateStroke(new Vector2(0, 0), camera, 1_000);
    paint.endStroke(true);

    const painted = terrain.getSurfaceLayers(centerIndex);
    expect(painted.ids).toContain(20);
    expect(painted.weights.reduce((total, weight) => total + weight, 0)).toBe(255);
    expect(painted.weights[painted.ids.indexOf(20)]).toBeGreaterThan(0);
    expect(paint.canUndo).toBe(true);

    expect(paint.undo()).toBe(true);
    expect(terrain.getSurfaceLayers(centerIndex)).toEqual({
      ids: [0, 0, 0, 0],
      weights: [255, 0, 0, 0],
    });
    expect(paint.redo()).toBe(true);
    expect(terrain.getSurfaceLayers(centerIndex)).toEqual(painted);

    paint.dispose();
    terrain.dispose();
  });

  it('shares undo history with sculpt strokes', () => {
    const terrain = new TerrainSystem(config);
    const scene = new Scene();
    scene.add(terrain.root);
    const camera = createCamera(scene);
    const history = new TerrainHistory();
    const sculpt = new TerrainSculptSystem(terrain, history);
    const paint = new TerrainPaintSystem(terrain, history);
    const pointer = new Vector2(0, 0);

    sculpt.setBrush({ size: 8, strength: 1, falloff: 0 });
    expect(sculpt.beginStroke(pointer, camera, 0)).toBe(true);
    sculpt.updateStroke(pointer, camera, 1_000);
    sculpt.endStroke(true);
    paint.setSurface('cobblestone');
    expect(paint.beginStroke(pointer, camera, 2_000)).toBe(true);
    paint.updateStroke(pointer, camera, 3_000);
    paint.endStroke(true);

    expect(history.undo()).toBe(true);
    expect(terrain.getSurfaceLayers(terrain.sampleIndex(25, 25)).weights).toEqual([255, 0, 0, 0]);
    expect(history.undo()).toBe(true);
    expect(terrain.getHeightAtWorld(0, 0)).toBe(0);

    paint.dispose();
    sculpt.dispose();
    terrain.dispose();
  });
});

function createCamera(scene: Scene): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(0, 50, 50);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  return camera;
}
