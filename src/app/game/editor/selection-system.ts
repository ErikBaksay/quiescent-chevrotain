import { BoxHelper, Group, Object3D, PerspectiveCamera, Raycaster, Scene, Vector2 } from 'three';

const PLACEABLE_ROOT_KEY = 'quiescentChevrotainPlaceableRoot';

/** Owns the placeable-object root, single selection, picking, and its visual highlight. */
export class SelectionSystem {
  readonly objectsRoot = new Group();

  private readonly raycaster = new Raycaster();
  private readonly selectionBox = new BoxHelper(new Group(), 0xffd77d);
  private selected: Object3D | undefined;
  private objectSequence = 0;

  constructor(private readonly scene: Scene) {
    this.objectsRoot.name = 'World Objects';
    this.selectionBox.name = 'Selection outline';
    this.selectionBox.material.depthTest = false;
    this.selectionBox.material.depthWrite = false;
    this.selectionBox.material.opacity = 0.9;
    this.selectionBox.material.transparent = true;
    this.selectionBox.renderOrder = 9;
    this.selectionBox.visible = false;
    this.scene.add(this.objectsRoot, this.selectionBox);
  }

  get selectedObject(): Object3D | undefined {
    return this.selected;
  }

  get objectCount(): number {
    return this.objectsRoot.children.length;
  }

  register(object: Object3D): Object3D {
    this.objectSequence += 1;
    object.userData[PLACEABLE_ROOT_KEY] = true;
    object.userData['editorObjectId'] = `prototype-${this.objectSequence}`;
    this.objectsRoot.add(object);
    object.updateWorldMatrix(true, true);
    return object;
  }

  pick(pointer: Vector2, camera: PerspectiveCamera): Object3D | undefined {
    camera.updateWorldMatrix(true, false);
    this.raycaster.setFromCamera(pointer, camera);
    const intersection = this.raycaster.intersectObjects(this.objectsRoot.children, true)[0];
    return intersection ? this.resolvePlaceableRoot(intersection.object) : undefined;
  }

  resolvePlaceableRoot(object: Object3D): Object3D | undefined {
    let current: Object3D | null = object;

    while (current && current !== this.objectsRoot) {
      if (current.userData[PLACEABLE_ROOT_KEY] === true) {
        return current;
      }
      current = current.parent;
    }

    return undefined;
  }

  select(object: Object3D | undefined): void {
    this.selected = object;

    if (object) {
      this.selectionBox.setFromObject(object);
      this.selectionBox.visible = true;
    } else {
      this.selectionBox.visible = false;
    }
  }

  removeSelected(): Object3D | undefined {
    const removed = this.selected;
    if (!removed) {
      return undefined;
    }

    removed.removeFromParent();
    this.select(undefined);
    return removed;
  }

  update(): void {
    if (this.selected) {
      this.selectionBox.update();
    }
  }

  dispose(): void {
    this.select(undefined);
    this.scene.remove(this.objectsRoot, this.selectionBox);
    this.objectsRoot.clear();
    this.selectionBox.dispose();
  }
}
