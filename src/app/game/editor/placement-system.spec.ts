import { Mesh, MeshStandardMaterial, PlaneGeometry, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PlacementSystem, PROTOTYPE_CUBE_SIZE } from './placement-system';

describe('PlacementSystem', () => {
  it('places cubes with their base on the hit point and shares render resources', () => {
    const scene = new Scene();
    const terrain = new Mesh(new PlaneGeometry(100, 100));
    const system = new PlacementSystem(scene, terrain);
    const first = system.createPrototypeCubeAt(new Vector3(12, 3, -7));
    const second = system.createPrototypeCubeAt(new Vector3(-4, 0, 9));
    const firstMesh = first.children[0] as Mesh;
    const secondMesh = second.children[0] as Mesh;

    expect(first.position.toArray()).toEqual([12, 3 + PROTOTYPE_CUBE_SIZE / 2, -7]);
    expect(firstMesh.geometry).toBe(secondMesh.geometry);
    expect(firstMesh.material).toBe(secondMesh.material);
    expect(firstMesh.castShadow).toBe(true);

    system.dispose();
    terrain.geometry.dispose();
  });

  it('disposes shared cube resources exactly once', () => {
    const scene = new Scene();
    const terrain = new Mesh(new PlaneGeometry(100, 100));
    const system = new PlacementSystem(scene, terrain);
    const first = system.createPrototypeCubeAt(new Vector3());
    const mesh = first.children[0] as Mesh<PlaneGeometry, MeshStandardMaterial>;
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(mesh.material, 'dispose');

    system.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    terrain.geometry.dispose();
  });
});
