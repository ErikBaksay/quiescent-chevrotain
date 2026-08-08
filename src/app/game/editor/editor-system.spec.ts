import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three';
import { ResolvedAssetDefinition } from '../../assets/asset.types';
import { AssetManager } from '../assets/asset-manager';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorSystem } from './editor-system';
import { EditorState } from './editor.types';

const asset: ResolvedAssetDefinition = {
  id: 'courthouse',
  name: 'Courthouse',
  category: 'civic',
  model: 'model.glb',
  thumbnail: 'thumbnail.webp',
  defaultScale: 1,
  manifestUrl: 'https://example.test/asset.json',
  modelUrl: 'https://example.test/model.glb',
  thumbnailUrl: 'https://example.test/thumbnail.webp',
};

describe('EditorSystem', () => {
  let canvas: HTMLCanvasElement;
  let scene: Scene;
  let terrain: Mesh<PlaneGeometry, MeshStandardMaterial>;
  let camera: PerspectiveCamera;
  let editor: EditorSystem;
  let states: EditorState[];

  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.append(canvas);
    Object.defineProperty(canvas, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(canvas, 'releasePointerCapture', { value: vi.fn() });
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    scene = new Scene();
    terrain = new Mesh(
      new PlaneGeometry(2_000, 2_000),
      new MeshStandardMaterial({ color: 0x558844 }),
    );
    terrain.rotation.x = -Math.PI / 2;
    scene.add(terrain);

    camera = new PerspectiveCamera(45, 2, 0.1, 2_000);
    camera.position.set(0, 80, 80);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    scene.updateMatrixWorld(true);

    states = [];
    const assetManager = {
      createInstance: vi.fn(async () => {
        const root = new Group();
        root.add(new Mesh(new PlaneGeometry(2, 2)));
        return root;
      }),
      createPlacementPreview: vi.fn(async () => {
        const root = new Group();
        root.add(new Mesh(new PlaneGeometry(2, 2)));
        return root;
      }),
    } as unknown as AssetManager;
    editor = new EditorSystem(
      scene,
      camera,
      canvas,
      terrain,
      assetManager,
      (state) => states.push(state),
      vi.fn(),
    );
  });

  afterEach(() => {
    editor.dispose();
    terrain.geometry.dispose();
    terrain.material.dispose();
    canvas.remove();
  });

  it('performs continuous asset placement without selecting the new object', async () => {
    editor.beginAssetPlacement(asset);
    await Promise.resolve();
    dispatchPointer('pointermove', 100, 50);
    dispatchPointer('pointerdown', 100, 50);
    dispatchPointer('pointerup', 100, 50);
    await vi.waitFor(() =>
      expect(editor.state).toMatchObject({
        tool: 'place',
        hasSelection: false,
        objectCount: 1,
        placementStatus: 'ready',
      }),
    );
  });

  it('does not treat a camera drag as a placement click', async () => {
    editor.beginAssetPlacement(asset);
    await Promise.resolve();
    dispatchPointer('pointermove', 100, 50);
    dispatchPointer('pointerdown', 100, 50);
    dispatchPointer('pointerup', 120, 50);

    expect(editor.state).toMatchObject({ tool: 'place', hasSelection: false, objectCount: 0 });
  });

  it('does not activate transform tools without a selection', () => {
    editor.setTool('move');
    editor.setTool('rotate');
    editor.setTool('scale');

    expect(editor.state).toMatchObject({ tool: 'select', hasSelection: false, objectCount: 0 });
    expect(states.at(-1)).toEqual(editor.state);
  });

  function dispatchPointer(type: string, clientX: number, clientY: number): void {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX,
      clientY,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: 'mouse' },
    });
    canvas.dispatchEvent(event);
  }
});
