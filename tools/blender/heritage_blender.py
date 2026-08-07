"""Shared, dependency-free Blender helpers for the Southern Heritage Collection."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable, Sequence

import bpy
import numpy as np
from mathutils import Vector


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def collection(name: str) -> bpy.types.Collection:
    result = bpy.data.collections.get(name)
    if result is None:
        result = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(result)
    return result


def move_to_collection(obj: bpy.types.Object, target: bpy.types.Collection) -> None:
    for source in list(obj.users_collection):
        source.objects.unlink(obj)
    target.objects.link(obj)


def _save_rgba(path: Path, pixels: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    height, width, _ = pixels.shape
    image = bpy.data.images.new(path.stem, width=width, height=height, alpha=True, float_buffer=False)
    image.pixels.foreach_set(np.flipud(pixels).astype(np.float32).ravel())
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def _smooth_noise(noise: np.ndarray, passes: int) -> np.ndarray:
    result = noise
    for _ in range(passes):
        result = (
            result
            + np.roll(result, 1, 0)
            + np.roll(result, -1, 0)
            + np.roll(result, 1, 1)
            + np.roll(result, -1, 1)
        ) / 5.0
    return result


def create_texture_set(
    directory: Path,
    name: str,
    base_color: Sequence[float],
    roughness: float,
    metallic: float = 0.0,
    size: int = 1024,
    seed: int = 1,
    variation: float = 0.06,
    grain: str = "mineral",
) -> dict[str, Path]:
    """Create a compact, tileable base-colour/normal/ORM texture set."""

    directory.mkdir(parents=True, exist_ok=True)
    paths = {
        "base": directory / f"{name}_basecolor.png",
        "normal": directory / f"{name}_normal.png",
        "orm": directory / f"{name}_orm.png",
    }
    if all(path.exists() for path in paths.values()):
        existing = bpy.data.images.load(str(paths["base"]), check_existing=False)
        existing_size = tuple(existing.size)
        bpy.data.images.remove(existing)
        if existing_size == (size, size):
            return paths

    rng = np.random.default_rng(seed)
    fine = rng.random((size, size), dtype=np.float32) - 0.5
    broad = _smooth_noise(rng.random((size, size), dtype=np.float32) - 0.5, 14)

    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    xx /= size
    yy /= size

    if grain == "stone":
        height = broad * 0.75 + fine * 0.18
        veins = np.sin((xx * 5.0 + yy * 2.2 + broad * 2.0) * math.tau) * 0.08
        height += veins
    elif grain == "wood":
        waves = np.sin((xx * 12.0 + broad * 2.5) * math.tau)
        height = waves * 0.22 + fine * 0.09 + broad * 0.35
    elif grain == "metal":
        height = fine * 0.07 + np.sin(xx * math.tau * 96.0) * 0.018
    else:
        height = broad * 0.8 + fine * 0.14

    height -= height.mean()
    color = np.asarray(base_color, dtype=np.float32)[None, None, :]
    rgb = np.clip(color + height[:, :, None] * variation, 0.0, 1.0)
    alpha = np.ones((size, size, 1), dtype=np.float32)
    _save_rgba(paths["base"], np.concatenate((rgb, alpha), axis=2))

    gradient_y, gradient_x = np.gradient(height)
    strength = 3.2 if grain in {"stone", "mineral"} else 2.2
    nx = -gradient_x * strength
    ny = -gradient_y * strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal_rgb = np.stack(
        (nx / length * 0.5 + 0.5, ny / length * 0.5 + 0.5, nz / length * 0.5 + 0.5),
        axis=2,
    )
    _save_rgba(paths["normal"], np.concatenate((normal_rgb, alpha), axis=2))

    ao = np.clip(0.96 - np.abs(broad) * 0.18, 0.75, 1.0)
    rough = np.clip(roughness + broad * 0.16 + fine * 0.035, 0.05, 1.0)
    metal = np.full_like(rough, metallic)
    orm = np.stack((ao, rough, metal), axis=2)
    _save_rgba(paths["orm"], np.concatenate((orm, alpha), axis=2))
    return paths


def pbr_material(
    name: str,
    base_color: Sequence[float],
    roughness: float,
    metallic: float = 0.0,
    textures: dict[str, Path] | None = None,
    alpha: float = 1.0,
    normal_strength: float = 0.35,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*base_color, alpha)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Base Color"].default_value = (*base_color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Alpha"].default_value = alpha
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    if textures:
        base_image = bpy.data.images.load(str(textures["base"]), check_existing=True)
        base_node = nodes.new("ShaderNodeTexImage")
        base_node.image = base_image
        base_node.label = f"{name} Base Color"
        links.new(base_node.outputs["Color"], principled.inputs["Base Color"])

        normal_image = bpy.data.images.load(str(textures["normal"]), check_existing=True)
        normal_image.colorspace_settings.name = "Non-Color"
        normal_node = nodes.new("ShaderNodeTexImage")
        normal_node.image = normal_image
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = normal_strength
        links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

        orm_image = bpy.data.images.load(str(textures["orm"]), check_existing=True)
        orm_image.colorspace_settings.name = "Non-Color"
        orm_node = nodes.new("ShaderNodeTexImage")
        orm_node.image = orm_image
        separate = nodes.new("ShaderNodeSeparateColor")
        links.new(orm_node.outputs["Color"], separate.inputs["Color"])
        links.new(separate.outputs["Green"], principled.inputs["Roughness"])
        links.new(separate.outputs["Blue"], principled.inputs["Metallic"])

    if alpha < 1.0:
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
        material.use_transparency_overlap = False

    return material


def apply_bevel(obj: bpy.types.Object, width: float, segments: int = 2) -> None:
    if width <= 0:
        return
    modifier = obj.modifiers.new("Edge softness", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def add_box(
    target: bpy.types.Collection,
    name: str,
    location: Sequence[float],
    dimensions: Sequence[float],
    material: bpy.types.Material,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        apply_bevel(obj, bevel)
    obj.data.materials.append(material)
    move_to_collection(obj, target)
    return obj


def add_cylinder(
    target: bpy.types.Collection,
    name: str,
    location: Sequence[float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    vertices: int = 24,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    if bevel:
        apply_bevel(obj, bevel)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    move_to_collection(obj, target)
    return obj


def add_fluted_column(
    target: bpy.types.Collection,
    name: str,
    location: Sequence[float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    flutes: int = 20,
) -> bpy.types.Object:
    segments = flutes * 2
    vertices = []
    faces = []
    for z in (-depth / 2.0, depth / 2.0):
        for index in range(segments):
            angle = index / segments * math.tau
            local_radius = radius * (0.955 if index % 2 else 1.0)
            vertices.append((
                location[0] + math.cos(angle) * local_radius,
                location[1] + math.sin(angle) * local_radius,
                location[2] + z,
            ))
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.append((index, nxt, segments + nxt, segments + index))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple(range(segments, segments * 2)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    return obj


def add_uv_sphere(
    target: bpy.types.Collection,
    name: str,
    location: Sequence[float],
    scale: Sequence[float],
    material: bpy.types.Material,
    segments: int = 24,
    rings: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    move_to_collection(obj, target)
    return obj


def add_torus(
    target: bpy.types.Collection,
    name: str,
    location: Sequence[float],
    major_radius: float,
    minor_radius: float,
    material: bpy.types.Material,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    major_segments: int = 24,
    minor_segments: int = 8,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    move_to_collection(obj, target)
    return obj


def add_cylinder_between(
    target: bpy.types.Collection,
    name: str,
    start: Sequence[float],
    end: Sequence[float],
    radius: float,
    material: bpy.types.Material,
    vertices: int = 16,
) -> bpy.types.Object:
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    obj = add_cylinder(
        target,
        name,
        (start_vector + end_vector) / 2.0,
        radius,
        direction.length,
        material,
        vertices=vertices,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def add_prism(
    target: bpy.types.Collection,
    name: str,
    profile: Sequence[tuple[float, float]],
    y_front: float,
    y_back: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    vertices = [(x, y_front, z) for x, z in profile] + [(x, y_back, z) for x, z in profile]
    count = len(profile)
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, count + index, count + nxt, nxt))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    return obj


def add_hip_roof(
    target: bpy.types.Collection,
    name: str,
    x_half: float,
    y_front: float,
    y_back: float,
    z_eave: float,
    z_ridge: float,
    ridge_half: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    vertices = [
        (-x_half, y_front, z_eave),
        (x_half, y_front, z_eave),
        (x_half, y_back, z_eave),
        (-x_half, y_back, z_eave),
        (-ridge_half, 0.5 * (y_front + y_back), z_ridge),
        (ridge_half, 0.5 * (y_front + y_back), z_ridge),
    ]
    faces = [
        (0, 1, 5, 4),
        (1, 2, 5),
        (2, 3, 4, 5),
        (3, 0, 4),
        (3, 2, 1, 0),
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    return obj


def add_lathe(
    target: bpy.types.Collection,
    name: str,
    location: Sequence[float],
    profile: Sequence[tuple[float, float]],
    material: bpy.types.Material,
    segments: int = 32,
) -> bpy.types.Object:
    vertices = []
    for radius, z in profile:
        for index in range(segments):
            angle = index / segments * math.tau
            vertices.append((
                location[0] + radius * math.cos(angle),
                location[1] + radius * math.sin(angle),
                location[2] + z,
            ))
    faces = []
    for row in range(len(profile) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            a = row * segments + index
            b = row * segments + nxt
            c = (row + 1) * segments + nxt
            d = (row + 1) * segments + index
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def join_by_material(target: bpy.types.Collection, parent: bpy.types.Object) -> list[bpy.types.Object]:
    groups: dict[str, list[bpy.types.Object]] = {}
    for obj in list(target.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        groups.setdefault(obj.data.materials[0].name, []).append(obj)

    joined = []
    for material_name, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        if len(objects) > 1:
            bpy.ops.object.join()
        active.name = material_name
        active.data.name = f"{material_name}Geometry"
        active.parent = parent
        joined.append(active)
    return joined


def smart_uv(objects: Iterable[bpy.types.Object]) -> None:
    for obj in objects:
        if obj.type != "MESH":
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.012)
        bpy.ops.object.mode_set(mode="OBJECT")


def look_at(obj: bpy.types.Object, target: Sequence[float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_camera(
    target: bpy.types.Collection,
    name: str,
    location: Sequence[float],
    aim: Sequence[float],
    lens: float = 52.0,
    orthographic_scale: float | None = None,
) -> bpy.types.Object:
    camera_data = bpy.data.cameras.new(name)
    camera = bpy.data.objects.new(name, camera_data)
    target.objects.link(camera)
    camera.location = location
    if orthographic_scale is not None:
        camera_data.type = "ORTHO"
        camera_data.ortho_scale = orthographic_scale
    else:
        camera_data.lens = lens
    look_at(camera, aim)
    return camera


def render(
    camera: bpy.types.Object,
    output: Path,
    width: int,
    height: int,
    samples: int = 64,
    transparent: bool = False,
    file_format: str = "PNG",
) -> None:
    scene = bpy.context.scene
    scene.camera = camera
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = samples
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = file_format
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render.film_transparent = transparent
    scene.render.filepath = str(output)
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 35
    scene.render.filepath = str(output)
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = file_format
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.filepath = str(output)
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    if file_format == "WEBP":
        scene.render.image_settings.quality = 92
    bpy.context.scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def export_glb(root: bpy.types.Object, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
    )


def audit(root: bpy.types.Object, output: Path, expected_dimensions: Sequence[float]) -> dict:
    meshes = [obj for obj in root.children_recursive if obj.type == "MESH"]
    triangles = 0
    vertices = 0
    material_slots = 0
    invalid_values = []
    world_corners = []

    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        vertices += len(obj.data.vertices)
        material_slots += len(obj.data.materials)
        for vertex in obj.data.vertices:
            world_vertex = obj.matrix_world @ vertex.co
            world_corners.append(world_vertex)
            if not all(math.isfinite(value) for value in world_vertex):
                invalid_values.append(f"{obj.name}:{vertex.index}")

    minimum = Vector((min(v.x for v in world_corners), min(v.y for v in world_corners), min(v.z for v in world_corners)))
    maximum = Vector((max(v.x for v in world_corners), max(v.y for v in world_corners), max(v.z for v in world_corners)))
    dimensions = maximum - minimum
    result = {
        "asset": root.name,
        "expectedFootprintMetres": list(expected_dimensions),
        "boundsMetresBlender": {
            "minimum": [round(value, 4) for value in minimum],
            "maximum": [round(value, 4) for value in maximum],
            "dimensions": [round(value, 4) for value in dimensions],
        },
        "meshObjects": len(meshes),
        "vertices": vertices,
        "triangles": triangles,
        "drawCalls": material_slots,
        "materials": sorted({material.name for obj in meshes for material in obj.data.materials}),
        "camerasExported": 0,
        "lightsExported": 0,
        "invalidValues": invalid_values,
        "groundAligned": abs(minimum.z) < 0.001,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf8")
    return result
