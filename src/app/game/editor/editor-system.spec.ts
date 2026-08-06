import { Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorSystem } from './editor-system';
import { EditorState } from './editor.types';
import { PROTOTYPE_CUBE_SIZE } from './placement-system';

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
    editor = new EditorSystem(
      scene,
      camera,
      canvas,
      terrain,
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

  it('performs one-shot placement and selects the new cube', () => {
    editor.setTool('place');
    dispatchPointer('pointermove', 100, 50);
    dispatchPointer('pointerdown', 100, 50);
    dispatchPointer('pointerup', 100, 50);

    expect(editor.state).toEqual({ tool: 'select', hasSelection: true, objectCount: 1 });
    expect(editor.selectedObject?.position.y).toBeCloseTo(PROTOTYPE_CUBE_SIZE / 2);
  });

  it('does not treat a camera drag as a placement click', () => {
    editor.setTool('place');
    dispatchPointer('pointermove', 100, 50);
    dispatchPointer('pointerdown', 100, 50);
    dispatchPointer('pointerup', 120, 50);

    expect(editor.state).toEqual({ tool: 'place', hasSelection: false, objectCount: 0 });
  });

  it('supports selection, tool shortcuts, staged Escape behavior, and deletion', () => {
    placeCube();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
    expect(editor.state.tool).toBe('move');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(editor.state).toMatchObject({ tool: 'select', hasSelection: true });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(editor.state.hasSelection).toBe(false);

    dispatchPointer('pointerdown', 100, 50);
    dispatchPointer('pointerup', 100, 50);
    expect(editor.state.hasSelection).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    expect(editor.state.tool).toBe('rotate');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(editor.state).toEqual({ tool: 'select', hasSelection: false, objectCount: 0 });
  });

  it('does not activate transform tools without a selection', () => {
    editor.setTool('move');
    editor.setTool('rotate');

    expect(editor.state).toEqual({ tool: 'select', hasSelection: false, objectCount: 0 });
    expect(states.at(-1)).toEqual(editor.state);
  });

  function placeCube(): void {
    editor.setTool('place');
    dispatchPointer('pointermove', 100, 50);
    dispatchPointer('pointerdown', 100, 50);
    dispatchPointer('pointerup', 100, 50);
  }

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
