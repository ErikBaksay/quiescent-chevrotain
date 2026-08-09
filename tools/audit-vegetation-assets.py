"""Audit the checked-in vegetation GLBs without requiring Blender."""

from __future__ import annotations

import io
import json
import math
import struct
import sys
from pathlib import Path
from typing import Any

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSETS_ROOT = PROJECT_ROOT / "public" / "assets"
EXPECTED_TRIANGLES = {"lod0": 7000, "lod1": 2500}
BOUNDS_TOLERANCE = 1.25
GROUND_TOLERANCE = 0.1


class AuditFailure(Exception):
    """Raised when one asset fails a required audit."""


def fail(scope: str, message: str) -> None:
    raise AuditFailure(f"{scope}: {message}")


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        fail(str(path), "missing GLB header")
    version, declared_length = struct.unpack_from("<II", data, 4)
    if version != 2:
        fail(str(path), f"uses glTF version {version}, expected 2")
    if declared_length != len(data):
        fail(str(path), "GLB header length does not match the file")

    cursor = 12
    document: dict[str, Any] | None = None
    binary = b""
    while cursor + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, cursor)
        cursor += 8
        chunk = data[cursor : cursor + chunk_length]
        if len(chunk) != chunk_length:
            fail(str(path), "contains a truncated GLB chunk")
        cursor += chunk_length
        if chunk_type == b"JSON":
            try:
                document = json.loads(chunk.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                fail(str(path), f"contains invalid JSON: {error}")
        elif chunk_type == b"BIN\0":
            binary = chunk

    if document is None or not binary:
        fail(str(path), "must contain JSON and BIN chunks")
    return document, binary


def matrix_multiply(left: list[list[float]], right: list[list[float]]) -> list[list[float]]:
    return [
        [sum(left[row][index] * right[index][column] for index in range(4)) for column in range(4)]
        for row in range(4)
    ]


def identity_matrix() -> list[list[float]]:
    return [[1.0 if row == column else 0.0 for column in range(4)] for row in range(4)]


def local_matrix(node: dict[str, Any]) -> list[list[float]]:
    if "matrix" in node:
        values = node["matrix"]
        return [[float(values[column * 4 + row]) for column in range(4)] for row in range(4)]

    translation = node.get("translation", [0.0, 0.0, 0.0])
    scale = node.get("scale", [1.0, 1.0, 1.0])
    quaternion = node.get("rotation", [0.0, 0.0, 0.0, 1.0])
    x, y, z, w = (float(value) for value in quaternion)
    return [
        [
            (1 - 2 * (y * y + z * z)) * scale[0],
            (2 * (x * y - z * w)) * scale[1],
            (2 * (x * z + y * w)) * scale[2],
            float(translation[0]),
        ],
        [
            (2 * (x * y + z * w)) * scale[0],
            (1 - 2 * (x * x + z * z)) * scale[1],
            (2 * (y * z - x * w)) * scale[2],
            float(translation[1]),
        ],
        [
            (2 * (x * z - y * w)) * scale[0],
            (2 * (y * z + x * w)) * scale[1],
            (1 - 2 * (x * x + y * y)) * scale[2],
            float(translation[2]),
        ],
        [0.0, 0.0, 0.0, 1.0],
    ]


def transform_point(matrix: list[list[float]], point: tuple[float, float, float]) -> tuple[float, float, float]:
    homogeneous = (*point, 1.0)
    return tuple(
        sum(matrix[row][column] * homogeneous[column] for column in range(4))
        for row in range(3)
    )


def accessor_values(document: dict[str, Any], binary: bytes, accessor_index: int) -> list[tuple[float, ...]]:
    accessor = document["accessors"][accessor_index]
    if accessor.get("componentType") != 5126 or accessor.get("type") not in {"VEC2", "VEC3", "VEC4"}:
        fail("GLB accessor", "position data must be float vectors")
    components = int(accessor["type"][-1])
    view = document["bufferViews"][accessor["bufferView"]]
    stride = int(view.get("byteStride", components * 4))
    start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
    values: list[tuple[float, ...]] = []
    for index in range(int(accessor["count"])):
        offset = start + index * stride
        values.append(struct.unpack_from(f"<{components}f", binary, offset))
    return values


def image_bytes(document: dict[str, Any], binary: bytes, image_index: int) -> bytes:
    image = document["images"][image_index]
    if "bufferView" not in image:
        fail("GLB image", f"{image.get('name', image_index)} is not embedded")
    view = document["bufferViews"][image["bufferView"]]
    start = int(view.get("byteOffset", 0))
    return binary[start : start + int(view["byteLength"])]


def texture_image_index(document: dict[str, Any], texture_index: int, scope: str) -> int:
    textures = document.get("textures", [])
    if not isinstance(texture_index, int) or texture_index < 0 or texture_index >= len(textures):
        fail(scope, "references a missing texture")
    source = textures[texture_index].get("source")
    if not isinstance(source, int) or source < 0 or source >= len(document.get("images", [])):
        fail(scope, "references a texture without an embedded image")
    return source


def alpha_stats(image: Image.Image) -> tuple[float, float, tuple[int, int, int, int] | None]:
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    total = image.width * image.height
    nonzero = (total - histogram[0]) / total
    opaque = histogram[255] / total
    thresholded = alpha.point(lambda value: 255 if value > 12 else 0)
    return nonzero, opaque, thresholded.getbbox()


def audit_texture(document: dict[str, Any], binary: bytes, texture_index: int, scope: str) -> Image.Image:
    image_index = texture_image_index(document, texture_index, scope)
    try:
        return Image.open(io.BytesIO(image_bytes(document, binary, image_index))).convert("RGBA")
    except Exception as error:  # Pillow uses several exception types for malformed images.
        fail(scope, f"embedded image does not decode: {error}")


def mesh_for_name(document: dict[str, Any], name: str) -> tuple[int, dict[str, Any], int]:
    for node_index, node in enumerate(document.get("nodes", [])):
        if node.get("name") == name and isinstance(node.get("mesh"), int):
            mesh_index = node["mesh"]
            return mesh_index, document["meshes"][mesh_index], node_index
    for mesh_index, mesh in enumerate(document.get("meshes", [])):
        if mesh.get("name") == name:
            node_index = next(
                (index for index, node in enumerate(document.get("nodes", [])) if node.get("mesh") == mesh_index),
                -1,
            )
            return mesh_index, mesh, node_index
    fail("GLB mesh contract", f"missing {name}")


def world_matrices(document: dict[str, Any]) -> dict[int, list[list[float]]]:
    parents: dict[int, int] = {}
    for parent_index, node in enumerate(document.get("nodes", [])):
        for child_index in node.get("children", []):
            parents[int(child_index)] = parent_index

    cache: dict[int, list[list[float]]] = {}

    def resolve(index: int) -> list[list[float]]:
        if index in cache:
            return cache[index]
        node = document["nodes"][index]
        parent = resolve(parents[index]) if index in parents else identity_matrix()
        cache[index] = matrix_multiply(parent, local_matrix(node))
        return cache[index]

    for index in range(len(document.get("nodes", []))):
        resolve(index)
    return cache


def mesh_triangles(document: dict[str, Any], mesh: dict[str, Any]) -> int:
    return sum(
        int(document["accessors"][primitive["indices"]]["count"]) // 3
        for primitive in mesh.get("primitives", [])
    )


def mesh_points(
    document: dict[str, Any], binary: bytes, mesh: dict[str, Any], node_matrix: list[list[float]]
) -> list[tuple[float, float, float]]:
    points: list[tuple[float, float, float]] = []
    for primitive in mesh.get("primitives", []):
        position_accessor = primitive.get("attributes", {}).get("POSITION")
        if position_accessor is None:
            continue
        for position in accessor_values(document, binary, position_accessor):
            points.append(transform_point(node_matrix, position[:3]))
    return points


def audit_asset(manifest_path: Path) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("renderMode") != "vegetation":
        return {}
    asset_id = manifest["id"]
    scope = f"{asset_id}/model.glb"
    glb_path = manifest_path.parent / manifest["model"]
    document, binary = read_glb(glb_path)
    if not isinstance(document.get("images"), list) or len(document["images"]) < 2:
        fail(scope, "must embed its foliage and impostor images")

    for image_index in range(len(document["images"])):
        try:
            Image.open(io.BytesIO(image_bytes(document, binary, image_index))).convert("RGBA")
        except Exception as error:
            fail(scope, f"image {image_index} does not decode: {error}")

    materials = {material.get("name"): material for material in document.get("materials", [])}
    foliage = materials.get("Foliage")
    if not foliage:
        fail(scope, "is missing the Foliage material")
    for material_name, material in materials.items():
        if material_name != "Foliage" and "ImpostorMaterial" not in material_name:
            continue
        pbr = material.get("pbrMetallicRoughness", {})
        base_texture = pbr.get("baseColorTexture", {}).get("index")
        if material.get("alphaMode") != "MASK" or material.get("doubleSided") is not True:
            fail(scope, f"{material_name} must be double-sided alpha masked")
        if material.get("alphaCutoff", 1.0) > 0.25:
            fail(scope, f"{material_name} alpha cutoff is too high")
        if not isinstance(base_texture, int):
            fail(scope, f"{material_name} is missing an embedded color texture")
        color_image = audit_texture(document, binary, base_texture, f"{scope} {material_name} color")
        nonzero, opaque, bbox = alpha_stats(color_image)
        minimum_nonzero = 0.25 if material_name == "Foliage" else 0.12
        minimum_opaque = 0.18 if material_name == "Foliage" else 0.1
        if nonzero < minimum_nonzero or opaque < minimum_opaque:
            fail(scope, f"{material_name} alpha coverage is too sparse ({nonzero:.2%} nonzero)")
        if bbox:
            margins = (
                bbox[0] / color_image.width,
                bbox[1] / color_image.height,
                (color_image.width - bbox[2]) / color_image.width,
                (color_image.height - bbox[3]) / color_image.height,
            )
            if max(margins) > 0.2:
                fail(scope, f"{material_name} has excessive transparent padding")
        if "ImpostorMaterial" in material_name:
            normal_texture = material.get("normalTexture", {}).get("index")
            if not isinstance(normal_texture, int):
                fail(scope, f"{material_name} is missing an embedded normal texture")
            normal_image = audit_texture(
                document, binary, normal_texture, f"{scope} {material_name} normal"
            )
            if color_image.size != normal_image.size:
                fail(scope, f"{material_name} color and normal atlases have different dimensions")
            if color_image.getchannel("A").tobytes() != normal_image.getchannel("A").tobytes():
                fail(scope, f"{material_name} color and normal atlases have different alpha framing")

    matrices = world_matrices(document)
    result: dict[str, Any] = {"asset": asset_id, "variants": []}
    for variant in manifest["vegetation"]["variants"]:
        variant_result: dict[str, Any] = {
            "id": variant["id"],
            "triangles": {},
            "foliageTriangles": {},
            "bounds": {},
        }
        all_points: list[tuple[float, float, float]] = []
        for level in ("lod0", "lod1"):
            triangles = 0
            foliage_triangles = 0
            points: list[tuple[float, float, float]] = []
            for name in variant[level]:
                _, mesh, node_index = mesh_for_name(document, name)
                mesh_triangle_count = mesh_triangles(document, mesh)
                triangles += mesh_triangle_count
                if "Foliage" in name:
                    foliage_triangles += mesh_triangle_count
                node_matrix = matrices[node_index] if node_index >= 0 else identity_matrix()
                points.extend(mesh_points(document, binary, mesh, node_matrix))
            if foliage_triangles < EXPECTED_TRIANGLES[level]:
                fail(scope, f"{variant['id']} {level} has only {foliage_triangles} foliage triangles")
            if points:
                all_points.extend(points)
                variant_result["triangles"][level] = triangles
                variant_result["foliageTriangles"][level] = foliage_triangles

        if not all_points:
            fail(scope, f"{variant['id']} has no measurable geometry")
        min_y = min(point[1] for point in all_points)
        max_y = max(point[1] for point in all_points)
        horizontal_radius = max(math.hypot(point[0], point[2]) for point in all_points)
        declared_bounds = manifest["vegetation"]["bounds"]
        if min_y < -GROUND_TOLERANCE:
            fail(scope, f"{variant['id']} is not ground aligned (minimum Y {min_y:.3f})")
        if max_y > declared_bounds["height"] + 1.0:
            fail(scope, f"{variant['id']} exceeds declared height ({max_y:.3f})")
        if horizontal_radius > declared_bounds["radius"] * BOUNDS_TOLERANCE:
            fail(scope, f"{variant['id']} exceeds declared radius ({horizontal_radius:.3f})")
        variant_result["bounds"] = {
            "minY": round(min_y, 4),
            "maxY": round(max_y, 4),
            "horizontalRadius": round(horizontal_radius, 4),
        }
        result["variants"].append(variant_result)
    return result


def main() -> None:
    catalog = json.loads((ASSETS_ROOT / "catalog.json").read_text())
    failures: list[str] = []
    results: list[dict[str, Any]] = []
    for relative_manifest in catalog.get("manifests", []):
        manifest_path = ASSETS_ROOT / relative_manifest
        try:
            result = audit_asset(manifest_path)
            if result:
                results.append(result)
        except (AuditFailure, OSError, KeyError, TypeError, ValueError) as error:
            failures.append(str(error))

    output = PROJECT_ROOT / ".artifacts" / "vegetation-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"assets": results, "failures": failures}, indent=2) + "\n")
    if failures:
        print(f"Vegetation audit failed with {len(failures)} error(s):")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)
    print(f"Vegetation audit passed for {len(results)} asset(s).")


if __name__ == "__main__":
    main()
