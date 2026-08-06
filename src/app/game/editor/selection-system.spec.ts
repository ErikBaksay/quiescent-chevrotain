import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { SelectionSystem } from './selection-system';

describe('SelectionSystem', () => {
  it('resolves a child-mesh hit to its registered placeable root', () => {
    const scene = new Scene();
    const system = new SelectionSystem(scene);
    const root = new Group();
    const nestedGroup = new Group();
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    nestedGroup.add(mesh);
    root.add(nestedGroup);

    system.register(root);

    expect(system.resolvePlaceableRoot(mesh)).toBe(root);
    expect(system.objectCount).toBe(1);

    system.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it('removes only the selected object', () => {
    const scene = new Scene();
    const system = new SelectionSystem(scene);
    const first = system.register(new Group());
    system.register(new Group());
    system.select(first);

    expect(system.removeSelected()).toBe(first);
    expect(system.objectCount).toBe(1);
    expect(system.selectedObject).toBeUndefined();

    system.dispose();
  });
});
