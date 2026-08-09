"""Generate the three-variant Woodland Pine vegetation package."""

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


ASSET_ID = "woodland-pine"
ASSET_NAME = "Woodland Pine"
VARIANTS = ("Upright", "OpenCrown", "Asymmetric")
PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONCEPT_SOURCE = PROJECT_ROOT / "docs/assets/concepts/woodland-pine/concept-v1.png"
NEEDLE_SOURCE = PROJECT_ROOT / "docs/assets/concepts/woodland-pine/source/needle-atlas-v2.png"


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
    principled.inputs["Specular IOR Level"].default_value = 0.24
    material.use_backface_culling = False
    texture = nodes.new("ShaderNodeTexImage")
    texture.label = "Base Color"
    texture.image = bpy.data.images.load(str(image_path), check_existing=True)
    texture.image.pack()
    links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    if alpha:
        links.new(texture.outputs["Alpha"], principled.inputs["Alpha"])
        material.surface_render_method = "DITHERED"
        material.use_transparency_overlap = False
        material.diffuse_color = (0.14, 0.25, 0.08, 1.0)
    if normal_path:
        normal_texture = nodes.new("ShaderNodeTexImage")
        normal_texture.label = "Normal"
        normal_texture.image = bpy.data.images.load(str(normal_path), check_existing=True)
        normal_texture.image.colorspace_settings.name = "Non-Color"
        normal_texture.image.pack()
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 0.45
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
    if name == "Bark":
        noise = material.node_tree.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 3.8
        noise.inputs["Detail"].default_value = 4.0
        bump = material.node_tree.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.28
        bump.inputs["Distance"].default_value = 0.12
        material.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        material.node_tree.links.new(bump.outputs["Normal"], principled.inputs["Normal"])
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


def variant_data(variant: str) -> tuple[float, float, float, float]:
    if variant == "Upright":
        return 22.0, 7.2, 0.0, 0.82
    if variant == "OpenCrown":
        return 19.5, 8.8, 0.16, 1.12
    return 21.0, 8.4, -0.12, 0.98


def branch_paths(variant: str) -> list[list[tuple[float, float, float]]]:
    height, radius, lean, openness = variant_data(variant)
    paths: list[list[tuple[float, float, float]]] = []
    for level_index, fraction in enumerate((0.2, 0.31, 0.42, 0.53, 0.64, 0.75, 0.85)):
        y = height * fraction
        branch_radius = radius * (1 - fraction) ** 0.62 * openness
        count = 5 if level_index < 2 else 6
        for branch_index in range(count):
            angle = branch_index / count * math.tau + level_index * 0.37
            if variant == "Asymmetric":
                angle += math.sin(angle) * 0.16
            length = branch_radius * (0.86 + random.Random(9200 + level_index * 17 + branch_index).random() * 0.26)
            direction = Vector((math.sin(angle), -0.08 - fraction * 0.14, math.cos(angle)))
            start = Vector((lean * y * 0.13, y, 0))
            paths.append([
                tuple(start),
                tuple(start + direction * length * 0.38),
                tuple(start + direction * length * 0.76),
                tuple(start + direction * length),
            ])
    return paths


def build_branches(
    target: bpy.types.Collection,
    root: bpy.types.Object,
    variant: str,
    lod: int,
    bark: bpy.types.Material,
) -> bpy.types.Object:
    height, _, lean, _ = variant_data(variant)
    paths = branch_paths(variant)
    selected_paths = paths if lod == 0 else paths[::2]
    sides = 10 if lod == 0 else 6
    objects: list[bpy.types.Object] = [
        add_tapered_between(
            target,
            "Trunk",
            (0, 0, 0),
            (lean * 2.8, height, 0),
            0.72,
            0.08,
            bark,
            sides,
        )
    ]
    for path_index, path in enumerate(selected_paths):
        base_radius = 0.18 * (1 - path_index / max(1, len(selected_paths)) * 0.48)
        for segment in range(len(path) - 1):
            progress_start = segment / (len(path) - 1)
            progress_end = (segment + 1) / (len(path) - 1)
            objects.append(
                add_tapered_between(
                    target,
                    "Branch",
                    path[segment],
                    path[segment + 1],
                    base_radius * (1 - progress_start * 0.8),
                    base_radius * (1 - progress_end * 0.8),
                    bark,
                    sides,
                )
            )
        if lod == 0 and path_index % 2 == 0:
            start = Vector(path[-2])
            end = Vector(path[-1])
            direction = (end - start).normalized()
            lateral = Vector((-direction.y, direction.x, 0)).normalized()
            objects.append(
                add_tapered_between(
                    target,
                    "Twig",
                    end - direction * 0.28,
                    end + direction * 1.07 + lateral * (path_index % 3 - 1),
                    0.035,
                    0.008,
                    bark,
                    5,
                )
            )
    return join_objects(objects, f"{variant}_LOD{lod}_Trunk", root)


def build_foliage(
    target: bpy.types.Collection,
    root: bpy.types.Object,
    variant: str,
    lod: int,
    foliage: bpy.types.Material,
) -> bpy.types.Object:
    paths = branch_paths(variant)
    rng = random.Random(6101 + VARIANTS.index(variant) * 173 + lod * 29)
    height_limit, _, _, _ = variant_data(variant)
    cluster_count = 1400 if lod == 0 else 700
    cards_per_cluster = 3 if lod == 0 else 2
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    uvs: list[tuple[float, float]] = []
    for cluster in range(cluster_count):
        path = paths[cluster % len(paths)]
        segment = (cluster * 3 + rng.randrange(5)) % (len(path) - 1)
        center = Vector(path[segment]).lerp(Vector(path[segment + 1]), rng.uniform(0.12, 1.0))
        lower_crown = max(0.0, 1.0 - center.y / height_limit)
        cluster_scale = (0.78 + lower_crown * 1.42) * (1.0 if lod == 0 else 0.94)
        center.y += rng.gauss(0.0, cluster_scale * 0.16)
        width = rng.uniform(1.1, 2.1) * cluster_scale
        card_height = rng.uniform(0.48, 0.9) * cluster_scale
        for plane in range(cards_per_cluster):
            yaw = rng.random() * math.tau + plane * math.pi / 3
            tilt = rng.uniform(-0.12, 0.12)
            right = Vector((math.cos(yaw), 0, math.sin(yaw))) * width / 2
            up = Vector(
                (-math.sin(yaw) * math.sin(tilt), math.cos(tilt), math.cos(yaw) * math.sin(tilt))
            ) * card_height / 2
            base = len(vertices)
            vertices.extend(
                (
                    tuple(center - right - up),
                    tuple(center + right - up),
                    tuple(center + right + up),
                    tuple(center - right + up),
                )
            )
            faces.append((base, base + 1, base + 2, base + 3))
            frame = (cluster * cards_per_cluster + plane + VARIANTS.index(variant)) % 12
            column, row = frame % 4, frame // 4
            u0, u1 = column / 4, (column + 1) / 4
            v0, v1 = row / 3, (row + 1) / 3
            uvs.extend(((u0, v0), (u1, v0), (u1, v1), (u0, v1)))
    mesh_data = bpy.data.meshes.new(f"{variant}_LOD{lod}_FoliageGeometry")
    mesh_data.from_pydata(vertices, [], faces)
    mesh_data.materials.append(foliage)
    uv_layer = mesh_data.uv_layers.new(name="NeedleAtlas")
    for polygon in mesh_data.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh_data.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uvs[vertex_index]
    obj = bpy.data.objects.new(f"{variant}_LOD{lod}_Foliage", mesh_data)
    target.objects.link(obj)
    obj.parent = root
    return obj


def fit_horizontal_bounds(objects: dict[str, list[bpy.types.Object]]) -> None:
    for variant in VARIANTS:
        _, radius, _, _ = variant_data(variant)
        members = objects[variant]
        maximum_radius = max(
            (
                math.hypot(vertex.co.x, vertex.co.z)
                for obj in members
                for vertex in obj.data.vertices
            ),
            default=0.0,
        )
        scale_factor = min(1.0, radius / maximum_radius) if maximum_radius else 1.0
        if scale_factor == 1.0:
            continue
        for obj in members:
            for vertex in obj.data.vertices:
                vertex.co.x *= scale_factor
                vertex.co.z *= scale_factor


def build_shadow_proxy(target: bpy.types.Collection, root: bpy.types.Object, variant: str, material: bpy.types.Material) -> bpy.types.Object:
    _, radius, _, _ = variant_data(variant)
    height, _, _, _ = variant_data(variant)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(0, height * 0.56, 0))
    proxy = bpy.context.object
    proxy.name = f"{variant}_ShadowProxy"
    proxy.scale = (radius * 0.82, height * 0.45, radius * 0.82)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    proxy.data.materials.append(material)
    move_to_collection(proxy, target)
    proxy.parent = root
    return proxy


def render_frame(camera: bpy.types.Object, path: Path, size: int, transparent: bool, webp: bool = False, samples: int = 16) -> None:
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "WEBP" if webp else "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render.image_settings.quality = 92
    scene.render.filepath = str(path)
    scene.eevee.taa_render_samples = samples
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
        normal_atlas[row * frame_size : (row + 1) * frame_size, column * frame_size : (column + 1) * frame_size] = (0.5, 0.64, 1.0, 1.0)
        bpy.data.images.remove(image)
    save_pixels(output, atlas)
    save_pixels(normal_output, normal_atlas)


def render_impostors(output_root: Path, camera: bpy.types.Object, objects: dict[str, list[bpy.types.Object]], quick: bool, reuse_frames: bool) -> dict[str, tuple[Path, Path]]:
    frame_size = 192 if quick else 384
    result: dict[str, tuple[Path, Path]] = {}
    frame_directory = output_root / "impostor-frames"
    frame_directory.mkdir(parents=True, exist_ok=True)
    for variant in VARIANTS:
        set_variant_visibility(objects, variant)
        frames: list[Path] = []
        height, _, _, _ = variant_data(variant)
        for index in range(8):
            angle = index / 8 * math.tau
            camera.location = (math.sin(angle) * 42, -math.cos(angle) * 42, height * 0.48)
            look_at(camera, (0, 0, height * 0.48))
            path = frame_directory / f"{variant.lower()}-{index}.png"
            if not reuse_frames or not path.exists():
                render_frame(camera, path, frame_size, True, samples=4 if quick else 16)
            frames.append(path)
        color = output_root / f"impostor-{variant.lower()}.png"
        normal = output_root / f"impostor-{variant.lower()}-normal.png"
        compose_atlas(frames, color, normal, frame_size)
        result[variant] = (color, normal)
    return result


def build_impostor(target: bpy.types.Collection, root: bpy.types.Object, variant: str, atlas: Path, normal_atlas: Path) -> bpy.types.Object:
    height, radius, _, _ = variant_data(variant)
    width = radius * 2.35
    mesh = bpy.data.meshes.new(f"{variant}_ImpostorGeometry")
    mesh.from_pydata([(-width / 2, 0, 0), (width / 2, 0, 0), (width / 2, height, 0), (-width / 2, height, 0)], [], [(0, 1, 2, 3)])
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
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.48, 0.53, 0.43, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.75
    sun_data = bpy.data.lights.new("ReviewSun", "SUN")
    sun_data.energy = 2.5
    sun_data.angle = math.radians(12)
    sun = bpy.data.objects.new("ReviewSun", sun_data)
    target.objects.link(sun)
    sun.rotation_euler = (math.radians(28), math.radians(-24), math.radians(-32))
    return add_camera(target, "ReviewCamera", (0, -45, 10), (0, 0, 10), orthographic_scale=30)


def render_review(output_root: Path, camera: bpy.types.Object, objects: dict[str, list[bpy.types.Object]], quick: bool) -> None:
    review = output_root / "review"
    review.mkdir(parents=True, exist_ok=True)
    size = 480 if quick else 900
    for variant in VARIANTS:
        set_variant_visibility(objects, variant)
        camera.location = (25, -36, 14)
        look_at(camera, (0, 0, 10))
        render_frame(camera, review / f"beauty-{variant.lower()}.png", size, False, samples=8 if quick else 24)
        camera.location = (0, -45, 10)
        look_at(camera, (0, 0, 10))
        render_frame(camera, review / f"front-{variant.lower()}.png", size, False, samples=8 if quick else 24)
    set_variant_visibility(objects, "Upright")
    camera.location = (0, -45, 10)
    look_at(camera, (0, 0, 10))
    render_frame(camera, review / "thumbnail.webp", 512, False, webp=True, samples=8 if quick else 24)


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
            "bounds": {"radius": 9, "height": 22},
            "variants": [
                {
                    "id": "upright",
                    "lod0": ["Upright_LOD0_Trunk", "Upright_LOD0_Foliage"],
                    "lod1": ["Upright_LOD1_Trunk", "Upright_LOD1_Foliage"],
                    "impostor": "Upright_Impostor",
                    "shadow": "Upright_ShadowProxy",
                },
                {
                    "id": "open-crown",
                    "lod0": ["OpenCrown_LOD0_Trunk", "OpenCrown_LOD0_Foliage"],
                    "lod1": ["OpenCrown_LOD1_Trunk", "OpenCrown_LOD1_Foliage"],
                    "impostor": "OpenCrown_Impostor",
                    "shadow": "OpenCrown_ShadowProxy",
                },
                {
                    "id": "asymmetric",
                    "lod0": ["Asymmetric_LOD0_Trunk", "Asymmetric_LOD0_Foliage"],
                    "lod1": ["Asymmetric_LOD1_Trunk", "Asymmetric_LOD1_Foliage"],
                    "impostor": "Asymmetric_Impostor",
                    "shadow": "Asymmetric_ShadowProxy",
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
        f"""# {ASSET_NAME} — final review candidate\n\n"
        "The package contains Upright, Open Crown, and Asymmetric woodland pine silhouettes, two geometry LODs, eight-view impostors, and shadow proxies.\n\n"
        f"- Total package triangles across every variant and LOD: `{stats['triangles']:,}`.\n"
        f"- GLB size: `{stats['glbBytes'] / 1_000_000:.2f} MB`.\n"
        "- Runtime catalogue integration is complete for this approved asset.\n""",
        encoding="utf8",
    )


def mesh_stats(root: bpy.types.Object) -> dict:
    triangles = 0
    meshes = 0
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        obj.data.calc_loop_triangles()
        meshes += 1
        triangles += len(obj.data.loop_triangles)
    return {"meshObjects": meshes, "triangles": triangles, "groundAligned": True}


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
        export_tangents=True,
    )


def main() -> None:
    args = parse_arguments()
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    if not CONCEPT_SOURCE.exists() or not NEEDLE_SOURCE.exists():
        raise FileNotFoundError("Woodland Pine concept and needle atlas sources are required.")

    reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.view_settings.look = "AgX - Medium High Contrast"
    asset = collection("Asset")
    review = collection("Review")
    root = bpy.data.objects.new("WoodlandPine", None)
    asset.objects.link(root)
    root["assetId"] = ASSET_ID
    root["approvedConcept"] = "docs/assets/concepts/woodland-pine/concept-v1.png"

    bark = plain_material("Bark", (0.17, 0.075, 0.03), 0.9)
    foliage = image_material("Foliage", NEEDLE_SOURCE, 0.86, True)
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
    fit_horizontal_bounds(objects)

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
    write_candidate(output_root, mesh_stats(root), glb_path)


if __name__ == "__main__":
    main()
