"""Generate the approved three-variant Mature Broadleaf Tree vegetation package."""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))

from asset_blender import add_camera, collection, look_at, move_to_collection, reset_scene


ASSET_ID = "mature-broadleaf-tree"
ASSET_NAME = "Mature Broadleaf Tree"
VARIANTS = ("Courtyard", "Windswept", "LowSpreading")
PROJECT_ROOT = Path(__file__).resolve().parents[2]
FOLIAGE_SOURCE = PROJECT_ROOT / "docs/assets/concepts/mature-broadleaf-tree/source/foliage-alpha-v1.png"
BARK_SOURCE = PROJECT_ROOT / "docs/assets/concepts/mature-broadleaf-tree/source/bark-source-v1.png"


def parse_arguments() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-root",
        type=Path,
        default=PROJECT_ROOT / ".artifacts" / "blender" / ASSET_ID,
    )
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--skip-renders", action="store_true")
    parser.add_argument("--reuse-frames", action="store_true")
    return parser.parse_args(arguments)


def image_material(
    name: str,
    image_path: Path,
    roughness: float,
    alpha: bool = False,
    normal_path: Path | None = None,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Specular IOR Level"].default_value = 0.28
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(image_path), check_existing=True)
    texture.image.pack()
    links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    if alpha:
        links.new(texture.outputs["Alpha"], principled.inputs["Alpha"])
        material.surface_render_method = "DITHERED"
        material.use_transparency_overlap = False
        material.diffuse_color = (0.22, 0.34, 0.11, 1.0)
    if normal_path:
        normal_texture = nodes.new("ShaderNodeTexImage")
        normal_texture.image = bpy.data.images.load(str(normal_path), check_existing=True)
        normal_texture.image.colorspace_settings.name = "Non-Color"
        normal_texture.image.pack()
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 0.65
        links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material


def plain_material(name: str, color: tuple[float, float, float], roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    return material


def join_objects(objects: list[bpy.types.Object], name: str, parent: bpy.types.Object) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    result = objects[0]
    result.name = name
    result.data.name = f"{name}Geometry"
    result.parent = parent
    return result


def add_tapered_between(
    target: bpy.types.Collection,
    name: str,
    start: tuple[float, float, float] | Vector,
    end: tuple[float, float, float] | Vector,
    radius_start: float,
    radius_end: float,
    material: bpy.types.Material,
    vertices: int,
) -> bpy.types.Object:
    start_vector, end_vector = Vector(start), Vector(end)
    direction = end_vector - start_vector
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_start,
        radius2=radius_end,
        depth=direction.length,
        location=(start_vector + end_vector) / 2,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    move_to_collection(obj, target)
    return obj


def branch_paths(variant: str) -> list[list[tuple[float, float, float]]]:
    if variant == "Courtyard":
        return [
            [(0, 0, 0), (0.15, 0.05, 3.2), (-0.2, 0.15, 6.2), (0.35, 0, 9.3), (0.1, 0.1, 14.8)],
            [(-0.1, 0.1, 4.8), (-3.0, -0.4, 7.0), (-7.0, -1.4, 8.7), (-10.5, -2.2, 9.2)],
            [(0.0, 0.0, 5.6), (3.1, 0.8, 7.6), (7.2, 2.2, 9.1), (10.5, 3.0, 9.6)],
            [(0.0, 0.1, 7.2), (-2.0, 2.2, 9.7), (-4.8, 5.6, 11.1), (-7.5, 8.0, 11.5)],
            [(0.2, 0.0, 8.0), (2.4, -2.4, 10.2), (5.2, -5.6, 11.8), (7.8, -7.2, 12.1)],
        ]
    if variant == "Windswept":
        return [
            [(0, 0, 0), (-0.3, 0.1, 3.0), (-0.8, 0.2, 6.0), (0.2, 0.0, 9.0), (-1.3, 0.5, 14.2)],
            [(-0.5, 0.1, 4.6), (2.0, -0.4, 6.4), (6.0, -1.3, 7.8), (10.8, -1.8, 8.0), (13.0, -1.4, 8.8)],
            [(-0.6, 0.2, 6.2), (2.1, 2.3, 8.2), (6.2, 4.4, 9.0), (10.5, 5.4, 9.4)],
            [(-0.1, 0.1, 8.1), (-3.0, -1.2, 9.8), (-5.2, -3.0, 10.4)],
            [(-0.3, 0.3, 9.0), (2.0, 0.0, 11.3), (5.4, -0.4, 13.0), (8.5, 0.0, 13.7)],
        ]
    return [
        [(0, 0, 0), (0.2, 0.0, 2.5), (-0.1, 0.2, 4.8), (0.4, 0.0, 7.3), (0.1, 0.0, 11.8)],
        [(0.0, 0.1, 3.8), (-3.4, -0.5, 5.0), (-8.0, -1.1, 5.8), (-12.2, -1.4, 6.3)],
        [(0.0, 0.0, 4.2), (3.7, 0.3, 5.2), (8.2, 1.2, 5.9), (12.5, 2.2, 6.1)],
        [(0.0, 0.2, 5.0), (-2.8, 2.8, 6.3), (-7.0, 6.2, 7.1), (-10.2, 8.1, 7.4)],
        [(0.1, 0.0, 5.4), (3.1, -2.8, 6.8), (7.2, -6.0, 7.4), (10.4, -8.2, 7.7)],
        [(0.0, 0.1, 6.5), (-1.5, -0.5, 8.8), (-3.0, -0.6, 11.1)],
    ]


def interpolate(a: tuple[float, float, float], b: tuple[float, float, float], t: float) -> tuple[float, float, float]:
    return tuple(a[index] + (b[index] - a[index]) * t for index in range(3))


def build_branches(
    target: bpy.types.Collection,
    root: bpy.types.Object,
    variant: str,
    lod: int,
    bark: bpy.types.Material,
) -> bpy.types.Object:
    paths = branch_paths(variant)
    rng = random.Random(4201 + VARIANTS.index(variant) * 137 + lod * 19)
    objects: list[bpy.types.Object] = []
    sides = 12 if lod == 0 else 7
    selected_paths = paths if lod == 0 else paths[: max(3, len(paths) - 2)]
    for path_index, path in enumerate(selected_paths):
        for index in range(len(path) - 1):
            start, end = path[index], path[index + 1]
            progress_start = index / (len(path) - 1)
            progress_end = (index + 1) / (len(path) - 1)
            base = 0.94 if path_index == 0 else 0.48
            tip = 0.12 if path_index == 0 else 0.065
            radius_start = base + (tip - base) * progress_start
            radius_end = base + (tip - base) * progress_end
            objects.append(
                add_tapered_between(
                    target,
                    "Branch",
                    start,
                    end,
                    radius_start,
                    radius_end,
                    bark,
                    sides,
                )
            )
            if lod == 0 and path_index > 0:
                segment = Vector(end) - Vector(start)
                direction = segment.normalized()
                horizontal = Vector((-direction.y, direction.x, 0.0))
                if horizontal.length_squared < 0.01:
                    horizontal = Vector((1.0, 0.0, 0.0))
                horizontal.normalize()
                for twig_index, along in enumerate((0.52, 0.78)):
                    twig_start = Vector(interpolate(start, end, along))
                    side = -1 if (index + twig_index) % 2 else 1
                    twig_direction = (
                        direction * rng.uniform(0.35, 0.65)
                        + horizontal * side * rng.uniform(0.65, 1.0)
                        + Vector((0, 0, rng.uniform(0.35, 0.7)))
                    ).normalized()
                    twig_end = twig_start + twig_direction * rng.uniform(1.25, 2.15)
                    objects.append(
                        add_tapered_between(
                            target,
                            "FineBranch",
                            twig_start,
                            twig_end,
                            0.055,
                            0.012,
                            bark,
                            6,
                        )
                    )
        if lod == 0 and path_index > 0:
            end = Vector(path[-1])
            previous = Vector(path[-2])
            direction = (end - previous).normalized()
            for fork in (-1, 1):
                lateral = Vector((-direction.y, direction.x, 0.25 * fork)).normalized()
                fork_end = end + direction * 2.2 + lateral * (1.4 * fork) + Vector((0, 0, 1.1))
                objects.append(add_tapered_between(target, "FineBranch", end, fork_end, 0.09, 0.018, bark, 7))
    mesh = join_objects(objects, f"{variant}_LOD{lod}_Trunk", root)
    for polygon in mesh.data.polygons:
        polygon.use_smooth = True
    return mesh


def canopy_profile(variant: str) -> tuple[Vector, Vector, float]:
    if variant == "Courtyard":
        return Vector((0, 0, 10.4)), Vector((11.7, 9.5, 5.2)), 0.0
    if variant == "Windswept":
        return Vector((3.3, 0.8, 9.8)), Vector((13.3, 8.0, 4.9)), 0.32
    return Vector((0, 0, 7.5)), Vector((14.0, 11.0, 4.1)), -0.12


def random_canopy_point(rng: random.Random, variant: str) -> Vector:
    center, radii, bias = canopy_profile(variant)
    while True:
        point = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
        if point.length_squared <= 1.0:
            point.x += bias * max(0.0, 1.0 - abs(point.x))
            return center + Vector((point.x * radii.x, point.y * radii.y, point.z * radii.z))


def random_branch_foliage_point(rng: random.Random, variant: str, lod: int) -> Vector:
    paths = branch_paths(variant)[1:]
    path = rng.choice(paths if lod == 0 else paths[: max(2, len(paths) - 1)])
    segment_index = rng.randrange(len(path) - 1)
    # Bias cards toward the outer half of major limbs, including their exposed tips.
    along = rng.uniform(0.25, 1.0)
    if segment_index == len(path) - 2:
        along = rng.uniform(0.48, 1.18)
    start = Vector(path[segment_index])
    end = Vector(path[segment_index + 1])
    center = start.lerp(end, along)
    spread = 0.8 if lod == 0 else 1.15
    return center + Vector(
        (
            rng.gauss(0.0, spread),
            rng.gauss(0.0, spread),
            rng.gauss(0.3, spread * 0.7),
        )
    )


def build_foliage(
    target: bpy.types.Collection,
    root: bpy.types.Object,
    variant: str,
    lod: int,
    foliage: bpy.types.Material,
) -> bpy.types.Object:
    rng = random.Random(9107 + VARIANTS.index(variant) * 173 + lod * 29)
    card_count = 960 if lod == 0 else 240
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    uvs: list[tuple[float, float]] = []
    for card in range(card_count):
        branch_weight = 0.64 if lod == 0 else 0.72
        center = (
            random_branch_foliage_point(rng, variant, lod)
            if rng.random() < branch_weight
            else random_canopy_point(rng, variant)
        )
        width = rng.uniform(1.75, 3.15) * (1.32 if lod else 1.0)
        height = rng.uniform(1.2, 2.05) * (1.28 if lod else 1.0)
        yaw = rng.random() * math.tau
        tilt = rng.uniform(-0.32, 0.32)
        right = Vector((math.cos(yaw), math.sin(yaw), 0)) * (width / 2)
        up = Vector((-math.sin(yaw) * math.sin(tilt), math.cos(yaw) * math.sin(tilt), math.cos(tilt))) * (height / 2)
        base = len(vertices)
        vertices.extend((center - right - up, center + right - up, center + right + up, center - right + up))
        faces.append((base, base + 1, base + 2, base + 3))
        column = rng.randrange(4)
        row = rng.randrange(2)
        u0, u1 = column / 4, (column + 1) / 4
        v0, v1 = row / 3, (row + 1) / 3
        uvs.extend(((u0, v0), (u1, v0), (u1, v1), (u0, v1)))

    mesh_data = bpy.data.meshes.new(f"{variant}_LOD{lod}_FoliageGeometry")
    mesh_data.from_pydata(vertices, [], faces)
    mesh_data.materials.append(foliage)
    uv_layer = mesh_data.uv_layers.new(name="FoliageAtlas")
    for polygon in mesh_data.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh_data.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uvs[vertex_index]
    obj = bpy.data.objects.new(f"{variant}_LOD{lod}_Foliage", mesh_data)
    target.objects.link(obj)
    obj.parent = root
    return obj


def build_shadow_proxy(target: bpy.types.Collection, root: bpy.types.Object, variant: str, material: bpy.types.Material) -> bpy.types.Object:
    center, radii, _ = canopy_profile(variant)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=center)
    proxy = bpy.context.object
    proxy.name = f"{variant}_ShadowProxy"
    proxy.scale = (radii.x * 0.85, radii.y * 0.85, radii.z * 0.75)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    proxy.data.materials.append(material)
    move_to_collection(proxy, target)
    proxy.parent = root
    return proxy


def render_frame(
    camera: bpy.types.Object,
    path: Path,
    size: int,
    transparent: bool,
    webp: bool = False,
    samples: int = 16,
) -> None:
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples = samples
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "WEBP" if webp else "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    if webp:
        scene.render.image_settings.quality = 92
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def set_variant_visibility(objects: dict[str, list[bpy.types.Object]], visible: str) -> None:
    for variant, members in objects.items():
        for obj in members:
            helper = "LOD1" in obj.name or "Impostor" in obj.name or "ShadowProxy" in obj.name
            obj.hide_render = variant != visible or helper


def save_pixels(output: Path, pixels: np.ndarray) -> None:
    height, width, _ = pixels.shape
    image = bpy.data.images.new(output.stem, width=width, height=height, alpha=True)
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(output)
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def compose_atlas(frames: list[Path], output: Path, normal_output: Path, frame_size: int) -> None:
    atlas = np.zeros((frame_size * 2, frame_size * 4, 4), dtype=np.float32)
    normal_atlas = np.zeros_like(atlas)
    for index, path in enumerate(frames):
        image = bpy.data.images.load(str(path), check_existing=False)
        pixels = np.empty(frame_size * frame_size * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        pixels = pixels.reshape((frame_size, frame_size, 4))
        row, column = divmod(index, 4)
        atlas[row * frame_size : (row + 1) * frame_size, column * frame_size : (column + 1) * frame_size] = pixels
        height_field = (
            pixels[:, :, 0] * 0.2126 + pixels[:, :, 1] * 0.7152 + pixels[:, :, 2] * 0.0722
        ) * pixels[:, :, 3]
        gradient_y, gradient_x = np.gradient(height_field)
        nx, ny, nz = -gradient_x * 1.8, -gradient_y * 1.8, np.ones_like(gradient_x)
        length = np.sqrt(nx * nx + ny * ny + nz * nz)
        normals = np.stack((nx / length * 0.5 + 0.5, ny / length * 0.5 + 0.5, nz / length * 0.5 + 0.5, pixels[:, :, 3]), axis=2)
        normal_atlas[row * frame_size : (row + 1) * frame_size, column * frame_size : (column + 1) * frame_size] = normals
        bpy.data.images.remove(image)
    save_pixels(output, atlas)
    save_pixels(normal_output, normal_atlas)


def render_impostors(
    output_root: Path,
    camera: bpy.types.Object,
    objects: dict[str, list[bpy.types.Object]],
    quick: bool,
    reuse_frames: bool,
) -> dict[str, tuple[Path, Path]]:
    frame_size = 192 if quick else 384
    result: dict[str, tuple[Path, Path]] = {}
    frame_directory = output_root / "impostor-frames"
    frame_directory.mkdir(parents=True, exist_ok=True)
    for variant in VARIANTS:
        set_variant_visibility(objects, variant)
        frames: list[Path] = []
        _, _, center_height = (0, 0, canopy_profile(variant)[0].z)
        for index in range(8):
            angle = index / 8 * math.tau
            camera.location = (math.sin(angle) * 42, -math.cos(angle) * 42, center_height)
            look_at(camera, (0, 0, center_height * 0.85))
            path = frame_directory / f"{variant.lower()}-{index}.png"
            if not reuse_frames or not path.exists():
                render_frame(camera, path, frame_size, True, samples=4 if quick else 16)
            frames.append(path)
        atlas = output_root / f"impostor-{variant.lower()}.png"
        normal_atlas = output_root / f"impostor-{variant.lower()}-normal.png"
        compose_atlas(frames, atlas, normal_atlas, frame_size)
        result[variant] = (atlas, normal_atlas)
    return result


def build_impostor(
    target: bpy.types.Collection,
    root: bpy.types.Object,
    variant: str,
    atlas: Path,
    normal_atlas: Path,
) -> bpy.types.Object:
    _, radii, _ = canopy_profile(variant)
    height = 18.0 if variant != "LowSpreading" else 13.0
    width = radii.x * 2.05
    vertices = [(-width / 2, 0, 0), (width / 2, 0, 0), (width / 2, 0, height), (-width / 2, 0, height)]
    mesh = bpy.data.meshes.new(f"{variant}_ImpostorGeometry")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new(name="ImpostorAtlas")
    for loop_index, coordinate in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[loop_index].uv = coordinate
    mesh.materials.append(image_material(f"{variant}_ImpostorMaterial", atlas, 0.9, True, normal_atlas))
    obj = bpy.data.objects.new(f"{variant}_Impostor", mesh)
    target.objects.link(obj)
    obj.parent = root
    return obj


def add_review_environment(target: bpy.types.Collection) -> bpy.types.Object:
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.48, 0.53, 0.43, 1.0)
    background.inputs["Strength"].default_value = 0.75
    sun_data = bpy.data.lights.new("ReviewSun", "SUN")
    sun_data.energy = 2.5
    sun_data.angle = math.radians(12)
    sun = bpy.data.objects.new("ReviewSun", sun_data)
    target.objects.link(sun)
    sun.rotation_euler = (math.radians(28), math.radians(-24), math.radians(-32))
    area_data = bpy.data.lights.new("ReviewFill", "AREA")
    area_data.energy = 1_250
    area_data.shape = "DISK"
    area_data.size = 18
    area = bpy.data.objects.new("ReviewFill", area_data)
    target.objects.link(area)
    area.location = (-12, -18, 24)
    look_at(area, (0, 0, 8))
    camera = add_camera(target, "ReviewCamera", (0, -42, 9), (0, 0, 8), orthographic_scale=32)
    return camera


def render_review(output_root: Path, camera: bpy.types.Object, objects: dict[str, list[bpy.types.Object]], quick: bool) -> None:
    review = output_root / "review"
    review.mkdir(parents=True, exist_ok=True)
    size = 480 if quick else 900
    for variant in VARIANTS:
        set_variant_visibility(objects, variant)
        camera.location = (24, -34, 15)
        look_at(camera, (0, 0, 8))
        render_frame(camera, review / f"beauty-{variant.lower()}.png", size, False, samples=8 if quick else 24)
        camera.location = (0, -45, 8)
        look_at(camera, (0, 0, 8))
        render_frame(camera, review / f"front-{variant.lower()}.png", size, False, samples=8 if quick else 24)
    set_variant_visibility(objects, "Courtyard")
    camera.location = (0, -45, 8)
    look_at(camera, (0, 0, 8))
    render_frame(camera, review / "thumbnail.webp", 512, False, webp=True, samples=8 if quick else 24)


def mesh_stats(root: bpy.types.Object) -> dict:
    by_variant: dict[str, dict[str, int]] = {}
    total_triangles = 0
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        obj.data.calc_loop_triangles()
        triangles = len(obj.data.loop_triangles)
        total_triangles += triangles
        variant = next((name for name in VARIANTS if obj.name.startswith(name)), "Shared")
        level = "lod0" if "LOD0" in obj.name else "lod1" if "LOD1" in obj.name else "impostor" if "Impostor" in obj.name else "shadow"
        by_variant.setdefault(variant, {}).setdefault(level, 0)
        by_variant[variant][level] += triangles
    return {"triangles": total_triangles, "variants": by_variant}


def write_candidate(output_root: Path, stats: dict, glb_path: Path) -> None:
    manifest = {
        "id": ASSET_ID,
        "name": ASSET_NAME,
        "category": "nature",
        "model": "model.glb",
        "thumbnail": "thumbnail.webp",
        "defaultScale": 1,
        "renderMode": "vegetation",
        "vegetation": {
            "bounds": {"radius": 14, "height": 18},
            "variants": [
                {
                    "id": "courtyard",
                    "lod0": ["Courtyard_LOD0_Trunk", "Courtyard_LOD0_Foliage"],
                    "lod1": ["Courtyard_LOD1_Trunk", "Courtyard_LOD1_Foliage"],
                    "impostor": "Courtyard_Impostor",
                    "shadow": "Courtyard_ShadowProxy",
                },
                {
                    "id": "windswept",
                    "lod0": ["Windswept_LOD0_Trunk", "Windswept_LOD0_Foliage"],
                    "lod1": ["Windswept_LOD1_Trunk", "Windswept_LOD1_Foliage"],
                    "impostor": "Windswept_Impostor",
                    "shadow": "Windswept_ShadowProxy",
                },
                {
                    "id": "low-spreading",
                    "lod0": ["LowSpreading_LOD0_Trunk", "LowSpreading_LOD0_Foliage"],
                    "lod1": ["LowSpreading_LOD1_Trunk", "LowSpreading_LOD1_Foliage"],
                    "impostor": "LowSpreading_Impostor",
                    "shadow": "LowSpreading_ShadowProxy",
                },
            ],
        },
    }
    (output_root / "asset.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
    thumbnail = output_root / "review" / "thumbnail.webp"
    if thumbnail.exists():
        (output_root / "thumbnail.webp").write_bytes(thumbnail.read_bytes())
    stats["glbBytes"] = glb_path.stat().st_size
    (output_root / "audit.json").write_text(json.dumps(stats, indent=2) + "\n", encoding="utf8")
    (output_root / "FINAL_REVIEW.md").write_text(
        f"""# {ASSET_NAME} — final review candidate

Status: **Awaiting final approval**

The package contains the approved Courtyard, Windswept, and Low Spreading silhouettes, two geometry LODs, eight-view impostor atlases, and shadow proxies.

| Courtyard | Windswept | Low spreading |
| --- | --- | --- |
| ![Courtyard](review/beauty-courtyard.png) | ![Windswept](review/beauty-windswept.png) | ![Low spreading](review/beauty-lowspreading.png) |

- Total package triangles across every variant and LOD: `{stats['triangles']:,}`.
- Per-variant statistics: `{json.dumps(stats['variants'])}`.
- GLB size: `{stats['glbBytes'] / 1_000_000:.2f} MB`.
- Runtime catalogue integration remains intentionally blocked until this candidate is approved.
""",
        encoding="utf8",
    )


def export_runtime_glb(root: bpy.types.Object, output: Path) -> None:
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
        # Impostor normal atlases require explicit tangent space. Extra tangents on the
        # tiny trunk/card meshes are cheaper than validator warnings and driver variation.
        export_tangents=True,
    )


def main() -> None:
    args = parse_arguments()
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    if not FOLIAGE_SOURCE.exists() or not BARK_SOURCE.exists():
        raise FileNotFoundError("Approved foliage and bark sources are required before modeling.")

    reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.view_settings.look = "AgX - Medium High Contrast"
    asset = collection("Asset")
    review = collection("Review")
    root = bpy.data.objects.new("MatureBroadleafTree", None)
    asset.objects.link(root)
    root["assetId"] = ASSET_ID
    root["approvedConcept"] = "docs/assets/concepts/mature-broadleaf-tree/concept-v1.png"

    bark = image_material("Bark", BARK_SOURCE, 0.91)
    foliage = image_material("Foliage", FOLIAGE_SOURCE, 0.78, True)
    shadow = plain_material("ShadowProxy", (0.12, 0.18, 0.08), 1.0)
    objects: dict[str, list[bpy.types.Object]] = {}
    for variant in VARIANTS:
        members = [
            build_branches(asset, root, variant, 0, bark),
            build_foliage(asset, root, variant, 0, foliage),
            build_branches(asset, root, variant, 1, bark),
            build_foliage(asset, root, variant, 1, foliage),
        ]
        members[2].hide_render = True
        members[3].hide_render = True
        objects[variant] = members

    camera = add_review_environment(review)
    atlases = render_impostors(output_root, camera, objects, args.quick, args.reuse_frames)
    for variant in VARIANTS:
        impostor = build_impostor(asset, root, variant, *atlases[variant])
        proxy = build_shadow_proxy(asset, root, variant, shadow)
        impostor.hide_render = True
        proxy.hide_render = True
        objects[variant].extend((impostor, proxy))

    if not args.skip_renders:
        render_review(output_root, camera, objects, args.quick)

    for obj in root.children_recursive:
        if obj.type == "MESH":
            modifier = obj.modifiers.new("Export triangulation", "TRIANGULATE")
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)

    bpy.ops.wm.save_as_mainfile(filepath=str(output_root / f"{ASSET_ID}.blend"), check_existing=False)
    glb_path = output_root / "model.glb"
    export_runtime_glb(root, glb_path)
    stats = mesh_stats(root)
    write_candidate(output_root, stats, glb_path)
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
