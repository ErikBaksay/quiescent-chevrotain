"""Generate the Narrow-front Residence Set runtime package."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))

from asset_blender import (
    add_beam_between,
    add_box,
    add_cylinder,
    add_cylinder_between,
    add_camera,
    add_prism,
    audit,
    collection,
    create_texture_set,
    export_glb,
    join_by_material,
    move_to_collection,
    metre_uv,
    pbr_material,
    render,
    reset_scene,
)


ASSET_ID = "narrow-front-residence"
ASSET_NAME = "Narrow-front Residence Set"
FOOTPRINT = (10.4, 12.0)
PALETTES = [
    {
        "id": "brick-cream",
        "name": "Brick and cream",
        "materialVariants": {
            "Walls": "WallsBrick",
            "Brick": "ChimneyBrick",
            "Stone": "FoundationStone",
            "Trim": "PaintedTrim",
            "Roof": "RoofShingle",
            "Door": "PaintedDoor",
            "Wood": "PaintedTrim",
            "Metal": "Iron",
        },
        "colors": {
            "Walls": "#a85a40",
            "Brick": "#7f3829",
            "Stone": "#b8a98d",
            "Trim": "#eadfc8",
            "Roof": "#252b2a",
            "Door": "#3c302b",
            "Wood": "#6b4d3b",
            "WindowGlass": "#24353a",
            "WindowInterior": "#080b0b",
            "Metal": "#2a2925",
        },
    },
    {
        "id": "painted-blue",
        "name": "Painted blue",
        "materialVariants": {
            "Walls": "WallsSiding",
            "Brick": "ChimneyBrick",
            "Stone": "FoundationStone",
            "Trim": "PaintedTrim",
            "Roof": "RoofShingle",
            "Door": "PaintedDoor",
            "Wood": "PaintedTrim",
            "Metal": "Iron",
        },
        "colors": {
            "Walls": "#617d8d",
            "Brick": "#645a50",
            "Stone": "#aaa79b",
            "Trim": "#e6decf",
            "Roof": "#303a40",
            "Door": "#30414d",
            "Wood": "#6b5c4b",
            "WindowGlass": "#20313a",
            "WindowInterior": "#080b0b",
            "Metal": "#292b2a",
        },
    },
    {
        "id": "ochre-green",
        "name": "Ochre and green",
        "materialVariants": {
            "Walls": "WallsPlaster",
            "Brick": "ChimneyBrick",
            "Stone": "FoundationStone",
            "Trim": "PaintedTrim",
            "Roof": "RoofShingle",
            "Door": "PaintedDoor",
            "Wood": "PaintedTrim",
            "Metal": "Iron",
        },
        "colors": {
            "Walls": "#b3914d",
            "Brick": "#866a36",
            "Stone": "#b5aa8c",
            "Trim": "#596644",
            "Roof": "#263a31",
            "Door": "#405943",
            "Wood": "#6e5837",
            "WindowGlass": "#26352e",
            "WindowInterior": "#080b0b",
            "Metal": "#29352d",
        },
    },
    {
        "id": "stone-brown",
        "name": "Stone and brown",
        "materialVariants": {
            "Walls": "WallsStone",
            "Brick": "ChimneyBrick",
            "Stone": "FoundationStone",
            "Trim": "PaintedTrim",
            "Roof": "RoofShingle",
            "Door": "PaintedDoor",
            "Wood": "PaintedTrim",
            "Metal": "Iron",
        },
        "colors": {
            "Walls": "#aaa294",
            "Brick": "#765343",
            "Stone": "#c4bca9",
            "Trim": "#6b5140",
            "Roof": "#36312c",
            "Door": "#5a4232",
            "Wood": "#765c45",
            "WindowGlass": "#2a302e",
            "WindowInterior": "#080b0b",
            "Metal": "#2d2a27",
        },
    },
]


def parse_arguments() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[2]
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-root",
        type=Path,
        default=project_root / ".artifacts" / "blender" / ASSET_ID,
    )
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--skip-renders", action="store_true")
    return parser.parse_args(arguments)


def make_materials(texture_directory: Path, quick: bool) -> dict[str, bpy.types.Material]:
    size = 448 if quick else 640
    textures = {
        "wall_brick": create_texture_set(
            texture_directory,
            "wall_brick",
            (0.62, 0.34, 0.23),
            0.88,
            size=size,
            seed=401,
            grain="brick",
            force=True,
        ),
        "wall_siding": create_texture_set(
            texture_directory,
            "wall_siding",
            (0.55, 0.58, 0.55),
            0.82,
            size=size,
            seed=407,
            grain="siding",
            force=True,
        ),
        "wall_plaster": create_texture_set(
            texture_directory,
            "wall_plaster",
            (0.72, 0.68, 0.58),
            0.9,
            size=size,
            seed=413,
            grain="plaster",
            force=True,
        ),
        "wall_stone": create_texture_set(
            texture_directory,
            "wall_stone",
            (0.6, 0.58, 0.52),
            0.9,
            size=size,
            seed=419,
            grain="stone",
            force=True,
        ),
        "foundation_stone": create_texture_set(
            texture_directory,
            "foundation_stone",
            (0.58, 0.56, 0.5),
            0.9,
            size=size,
            seed=423,
            grain="stone",
            force=True,
        ),
        "chimney_brick": create_texture_set(
            texture_directory,
            "chimney_brick",
            (0.46, 0.22, 0.15),
            0.9,
            size=size,
            seed=425,
            grain="brick",
            force=True,
        ),
        "roof": create_texture_set(
            texture_directory,
            "roof",
            (0.18, 0.2, 0.2),
            0.58,
            metallic=0.18,
            size=size,
            seed=431,
            grain="roof",
            force=True,
        ),
        "wood": create_texture_set(
            texture_directory,
            "wood",
            (0.45, 0.4, 0.31),
            0.78,
            size=size,
            seed=439,
            grain="wood",
            force=True,
        ),
        "door_wood": create_texture_set(
            texture_directory,
            "door_wood",
            (0.38, 0.27, 0.19),
            0.72,
            size=size,
            seed=441,
            grain="wood",
            force=True,
        ),
        "iron": create_texture_set(
            texture_directory,
            "iron",
            (0.08, 0.09, 0.085),
            0.42,
            metallic=0.7,
            size=size,
            seed=443,
            grain="metal",
            force=True,
        ),
    }

    wall_variants = {
        "WallsBrick": textures["wall_brick"],
        "WallsSiding": textures["wall_siding"],
        "WallsPlaster": textures["wall_plaster"],
        "WallsStone": textures["wall_stone"],
    }
    materials = {
        "Walls": pbr_material(
            "Walls", (0.62, 0.34, 0.23), 0.88, textures=textures["wall_brick"], normal_strength=0.32
        ),
        "Brick": pbr_material(
            "Brick", (0.5, 0.24, 0.18), 0.88, textures=textures["chimney_brick"], normal_strength=0.36
        ),
        "Stone": pbr_material(
            "Stone", (0.58, 0.56, 0.5), 0.9, textures=textures["foundation_stone"], normal_strength=0.3
        ),
        "Trim": pbr_material(
            "Trim", (0.82, 0.79, 0.68), 0.74, textures=textures["wood"], normal_strength=0.16
        ),
        "Roof": pbr_material(
            "Roof", (0.18, 0.2, 0.2), 0.58, metallic=0.18, textures=textures["roof"], normal_strength=0.12
        ),
        "Door": pbr_material(
            "Door", (0.18, 0.19, 0.17), 0.72, textures=textures["door_wood"], normal_strength=0.2
        ),
        "Wood": pbr_material(
            "Wood", (0.46, 0.4, 0.3), 0.78, textures=textures["wood"], normal_strength=0.18
        ),
        "WindowGlass": pbr_material(
            "WindowGlass", (0.045, 0.085, 0.095), 0.16, metallic=0.04, alpha=0.52
        ),
        "WindowInterior": pbr_material("WindowInterior", (0.008, 0.01, 0.009), 0.98),
        "Metal": pbr_material(
            "Metal", (0.04, 0.045, 0.042), 0.42, metallic=0.7, textures=textures["iron"], normal_strength=0.08
        ),
    }
    materials.update(
        {
            "ChimneyBrick": pbr_material(
                "ChimneyBrick", (0.46, 0.22, 0.15), 0.9, textures=textures["chimney_brick"], normal_strength=0.34
            ),
            "FoundationStone": pbr_material(
                "FoundationStone", (0.58, 0.56, 0.5), 0.9, textures=textures["foundation_stone"], normal_strength=0.3
            ),
            "PaintedTrim": pbr_material(
                "PaintedTrim", (0.82, 0.79, 0.68), 0.74, textures=textures["wood"], normal_strength=0.16
            ),
            "RoofShingle": pbr_material(
                "RoofShingle", (0.18, 0.2, 0.2), 0.78, textures=textures["roof"], normal_strength=0.16
            ),
            "PaintedDoor": pbr_material(
                "PaintedDoor", (0.18, 0.19, 0.17), 0.72, textures=textures["door_wood"], normal_strength=0.2
            ),
            "Iron": pbr_material(
                "Iron", (0.04, 0.045, 0.042), 0.42, metallic=0.7, textures=textures["iron"], normal_strength=0.08
            ),
        }
    )
    for name, texture in wall_variants.items():
        materials[name] = pbr_material(
            name,
            (0.7, 0.65, 0.56),
            0.86 if name != "WallsPlaster" else 0.92,
            textures=texture,
            normal_strength=0.28 if name == "WallsPlaster" else 0.34,
        )
    return materials


def add_material_library(root, asset, materials) -> None:
    """Embed palette source materials without putting them in selectable shapes."""
    library = bpy.data.collections.new("PaletteMaterialLibrary")
    bpy.context.scene.collection.children.link(library)
    library_root = bpy.data.objects.new("PaletteMaterialLibrary", None)
    asset.objects.link(library_root)
    library_root.parent = root
    library_root["purpose"] = "runtime palette material variants"
    library_names = (
        "WallsBrick",
        "WallsSiding",
        "WallsPlaster",
        "WallsStone",
        "ChimneyBrick",
        "FoundationStone",
        "PaintedTrim",
        "RoofShingle",
        "PaintedDoor",
        "Iron",
    )
    for index, name in enumerate(library_names):
        # Keep the source meshes inside the foundation volume. They are not cloned with a shape.
        marker = add_box(
            library,
            f"PaletteMaterial_{name}",
            (0.0, 0.0, 0.12 + index * 0.006),
            (0.02, 0.02, 0.02),
            materials[name],
        )
        marker.parent = library_root


def add_front_window(
    target,
    materials,
    x: float,
    y: float,
    z: float,
    width: float = 0.9,
    height: float = 1.58,
) -> None:
    trim = materials["Trim"]
    glass = materials["WindowGlass"]
    interior = materials["WindowInterior"]
    opening_width = width + 0.22
    opening_height = height + 0.22
    add_box(target, "WindowReveal", (x, y + 0.1, z), (opening_width, 0.3, opening_height), interior, 0.012)
    add_box(target, "WindowInterior", (x, y + 0.26, z), (width * 0.84, 0.045, height * 0.84), interior)
    add_box(target, "WindowGlass", (x, y - 0.015, z), (width * 0.82, 0.025, height * 0.84), glass)
    jamb_width = 0.13
    for offset in (-width / 2 - 0.075, width / 2 + 0.075):
        add_box(
            target,
            "WindowJamb",
            (x + offset, y - 0.09, z),
            (jamb_width, 0.16, height + 0.22),
            trim,
            0.025,
        )
    add_box(target, "WindowLintel", (x, y - 0.09, z + height / 2 + 0.13), (width + 0.32, 0.18, 0.17), trim, 0.025)
    add_box(target, "WindowSill", (x, y - 0.13, z - height / 2 - 0.11), (width + 0.34, 0.28, 0.15), trim, 0.025)
    add_box(target, "WindowSillDrip", (x, y - 0.28, z - height / 2 - 0.17), (width + 0.42, 0.08, 0.06), trim, 0.012)
    muntin = materials["Wood"]
    add_box(target, "WindowMuntin", (x, y - 0.12, z), (0.045, 0.04, height * 0.8), muntin)
    for row in (-0.18, 0.18):
        add_box(target, "WindowMuntin", (x, y - 0.12, z + height * row), (width * 0.72, 0.04, 0.04), muntin)


def add_side_window(target, materials, x: float, y: float, z: float, side: int) -> None:
    trim = materials["Trim"]
    glass = materials["WindowGlass"]
    interior = materials["WindowInterior"]
    width = 0.88
    height = 1.52
    add_box(target, "WindowReveal", (x - side * 0.1, y, z), (0.3, width + 0.22, height + 0.22), interior, 0.012)
    add_box(target, "WindowInterior", (x - side * 0.26, y, z), (0.045, width * 0.84, height * 0.84), interior)
    add_box(target, "WindowGlass", (x + side * 0.015, y, z), (0.025, width * 0.82, height * 0.84), glass)
    for offset in (-width / 2 - 0.075, width / 2 + 0.075):
        add_box(target, "WindowJamb", (x + side * 0.09, y + offset, z), (0.16, 0.13, height + 0.22), trim, 0.025)
    add_box(target, "WindowLintel", (x + side * 0.09, y, z + height / 2 + 0.13), (0.18, width + 0.32, 0.17), trim, 0.025)
    add_box(target, "WindowSill", (x + side * 0.13, y, z - height / 2 - 0.11), (0.28, width + 0.34, 0.15), trim, 0.025)
    add_box(target, "WindowMuntin", (x + side * 0.105, y, z), (0.04, 0.04, height * 0.8), materials["Wood"])
    for row in (-0.18, 0.18):
        add_box(target, "WindowMuntin", (x + side * 0.105, y, z + height * row), (0.04, width * 0.72, 0.04), materials["Wood"])


def add_entry(target, materials, x: float, y: float) -> None:
    trim = materials["Trim"]
    door = materials["Door"]
    metal = materials["Metal"]
    add_box(target, "DoorReveal", (x, y + 0.1, 2.15), (1.28, 0.3, 2.58), materials["WindowInterior"], 0.012)
    add_box(target, "EntryDoor", (x, y - 0.08, 2.15), (0.98, 0.18, 2.35), door, 0.035)
    for offset in (-0.38, 0.38):
        add_box(target, "EntryDoorStile", (x + offset, y - 0.2, 2.15), (0.08, 0.055, 2.12), materials["Wood"], 0.012)
    for z_panel in (1.55, 2.35):
        add_box(target, "EntryDoorRail", (x, y - 0.2, z_panel), (0.78, 0.055, 0.08), materials["Wood"], 0.012)
    add_box(target, "EntryDoorPanel", (x, y - 0.22, 1.78), (0.64, 0.055, 0.43), materials["Wood"], 0.02)
    add_box(target, "EntryDoorPanel", (x, y - 0.22, 2.52), (0.64, 0.055, 0.43), materials["Wood"], 0.02)
    add_box(target, "EntryTransom", (x, y - 0.12, 3.5), (0.82, 0.05, 0.34), materials["WindowGlass"], 0.012)
    add_box(target, "EntryTransomMuntin", (x, y - 0.16, 3.5), (0.04, 0.04, 0.27), materials["Wood"])
    for offset in (-0.61, 0.61):
        add_box(target, "EntryJamb", (x + offset, y - 0.1, 2.25), (0.17, 0.3, 2.65), trim, 0.035)
    add_box(target, "EntryHeader", (x, y - 0.1, 3.72), (1.55, 0.3, 0.26), trim, 0.035)
    add_box(target, "EntryThreshold", (x, y - 0.25, 0.99), (1.08, 0.28, 0.08), materials["Stone"], 0.015)
    add_box(target, "EntryKnob", (x + 0.24, y - 0.23, 2.13), (0.07, 0.05, 0.07), metal, 0.02)
    for z_hinge in (1.55, 2.72):
        add_box(target, "EntryHinge", (x - 0.43, y - 0.23, z_hinge), (0.06, 0.035, 0.12), metal, 0.012)


def add_stoop(target, materials, x: float, front: float, width: float = 1.55) -> None:
    stone = materials["Stone"]
    add_box(target, "EntryStepLower", (x, front - 0.88, 0.14), (width + 0.24, 0.68, 0.28), stone, 0.035)
    add_box(target, "EntryStepMiddle", (x, front - 0.58, 0.34), (width + 0.14, 0.42, 0.4), stone, 0.03)
    add_box(target, "EntryStepUpper", (x, front - 0.31, 0.57), (width, 0.34, 0.46), stone, 0.03)
    add_box(target, "EntryLanding", (x, front - 0.08, 0.82), (width, 0.42, 0.18), stone, 0.025)
    rail = materials["Metal"]
    for side in (-1, 1):
        rail_x = x + side * (width / 2 + 0.08)
        add_beam_between(target, "RailingPost", (rail_x, front - 0.2, 0.75), (rail_x, front - 0.2, 1.55), 0.055, rail)
        add_beam_between(target, "RailingPost", (rail_x, front - 1.12, 0.3), (rail_x, front - 1.12, 1.1), 0.055, rail)
        add_beam_between(target, "RailingTop", (rail_x, front - 0.2, 1.48), (rail_x, front - 1.12, 1.03), 0.065, rail)
        add_beam_between(target, "RailingMid", (rail_x, front - 0.48, 0.88), (rail_x, front - 0.48, 1.18), 0.04, rail)


def add_shed_roof(target, name: str, x_half: float, y_front: float, y_back: float, z_front: float, z_back: float, material) -> None:
    thickness = 0.14
    vertices = [
        (-x_half, y_front, z_front),
        (x_half, y_front, z_front),
        (x_half, y_back, z_back),
        (-x_half, y_back, z_back),
        (-x_half, y_front, z_front - thickness),
        (x_half, y_front, z_front - thickness),
        (x_half, y_back, z_back - thickness),
        (-x_half, y_back, z_back - thickness),
    ]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)


def add_porch_canopy(target, materials, center_x: float, front: float, width: float = 2.2) -> None:
    roof = materials["Roof"]
    trim = materials["Trim"]
    canopy_front = front - 1.12
    canopy_back = front + 0.12
    add_shed_roof(target, "EntryCanopy", width / 2 + 0.08, canopy_front, canopy_back, 3.82, 4.25, roof)
    add_box(target, "EntryCanopyFascia", (center_x, canopy_front - 0.03, 3.73), (width + 0.2, 0.14, 0.2), trim, 0.025)
    add_box(target, "EntryCanopySoffit", (center_x, front - 0.5, 4.08), (width + 0.08, 0.82, 0.08), trim, 0.015)
    for side in (-1, 1):
        post_x = center_x + side * (width / 2 - 0.18)
        add_box(target, "EntryCanopyPost", (post_x, front - 0.68, 2.55), (0.14, 0.14, 2.4), trim, 0.025)
        add_box(target, "EntryCanopyBase", (post_x, front - 0.68, 1.35), (0.28, 0.22, 0.12), trim, 0.02)
        add_beam_between(target, "EntryCanopyBracket", (post_x, front - 0.68, 3.62), (post_x, front - 0.18, 4.13), 0.12, trim)


def add_body(
    target,
    materials,
    width: float,
    depth: float,
    wall_height: float,
    openings: list[tuple[float, float, float, float]] | None = None,
) -> tuple[float, float]:
    foundation_top = 0.9
    front = -depth / 2
    back = depth / 2
    add_box(target, "FoundationCore", (0, 0, foundation_top / 2), (width + 0.18, depth + 0.18, foundation_top), materials["Stone"], 0.035)

    block_width = 1.3
    block_count = max(1, math.ceil(width / block_width))
    actual_block_width = width / block_count
    for index in range(block_count):
        x = -width / 2 + actual_block_width * (index + 0.5)
        add_box(target, "FoundationFrontBlock", (x, front - 0.11, 0.45), (actual_block_width - 0.035, 0.16, 0.72), materials["Stone"], 0.018)
        add_box(target, "FoundationRearBlock", (x, back + 0.11, 0.45), (actual_block_width - 0.035, 0.16, 0.72), materials["Stone"], 0.018)
    for side in (-1, 1):
        for index in range(max(1, math.ceil(depth / block_width))):
            y = -depth / 2 + (depth / max(1, math.ceil(depth / block_width))) * (index + 0.5)
            add_box(target, "FoundationSideBlock", (side * (width / 2 + 0.11), y, 0.45), (0.16, depth / max(1, math.ceil(depth / block_width)) - 0.035, 0.72), materials["Stone"], 0.018)
    add_box(target, "FoundationCap", (0, front - 0.11, 0.86), (width + 0.34, 0.18, 0.16), materials["Stone"], 0.018)
    for x in (-width * 0.27, width * 0.27):
        add_box(target, "FoundationVent", (x, front - 0.2, 0.5), (0.42, 0.035, 0.2), materials["WindowInterior"], 0.01)

    top = foundation_top + wall_height
    openings = openings or []
    front_thickness = 0.28
    core_depth = depth - front_thickness
    add_box(
        target,
        "BodyCore",
        (0, front + front_thickness + core_depth / 2, foundation_top + wall_height / 2),
        (width, core_depth, wall_height),
        materials["Walls"],
        0.035,
    )

    # Build the front wall as a set of panels around the openings. This leaves
    # a genuine shallow cavity behind every door and window instead of placing
    # dark cards on top of a solid facade cube.
    x_edges = sorted({-width / 2, width / 2, *[x - opening_width / 2 for x, _, opening_width, _ in openings], *[x + opening_width / 2 for x, _, opening_width, _ in openings]})
    z_edges = sorted({foundation_top, top, *[z - opening_height / 2 for _, z, _, opening_height in openings], *[z + opening_height / 2 for _, z, _, opening_height in openings]})
    for x0, x1 in zip(x_edges, x_edges[1:]):
        for z0, z1 in zip(z_edges, z_edges[1:]):
            center_x = (x0 + x1) / 2
            center_z = (z0 + z1) / 2
            inside_opening = any(
                abs(center_x - opening_x) < opening_width / 2
                and abs(center_z - opening_z) < opening_height / 2
                for opening_x, opening_z, opening_width, opening_height in openings
            )
            if inside_opening or x1 - x0 < 0.02 or z1 - z0 < 0.02:
                continue
            add_box(
                target,
                "FacadeWallSection",
                ((x0 + x1) / 2, front + front_thickness / 2, (z0 + z1) / 2),
                (x1 - x0, front_thickness, z1 - z0),
                materials["Walls"],
                0.0,
            )
    add_box(target, "CornerTrim", (-width / 2 - 0.07, 0, foundation_top + wall_height / 2), (0.14, depth + 0.12, wall_height + 0.08), materials["Trim"], 0.018)
    add_box(target, "CornerTrim", (width / 2 + 0.07, 0, foundation_top + wall_height / 2), (0.14, depth + 0.12, wall_height + 0.08), materials["Trim"], 0.018)
    return front, top


def add_roof_slope(target, name: str, x_eave: float, z_eave: float, x_ridge: float, z_ridge: float, y_front: float, y_back: float, material) -> None:
    thickness = 0.13
    vertices = [
        (x_eave, y_front, z_eave),
        (x_ridge, y_front, z_ridge),
        (x_ridge, y_back, z_ridge),
        (x_eave, y_back, z_eave),
        (x_eave, y_front, z_eave - thickness),
        (x_ridge, y_front, z_ridge - thickness),
        (x_ridge, y_back, z_ridge - thickness),
        (x_eave, y_back, z_eave - thickness),
    ]
    faces = [
        (0, 1, 2, 3),
        (7, 6, 5, 4),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)


def add_front_gable_wall(
    target,
    materials,
    center_x: float,
    half_width: float,
    eave: float,
    ridge: float,
    front: float,
    opening: tuple[float, float, float, float] | None = None,
) -> None:
    if opening is None:
        add_prism(
            target,
            "GableWall",
            [(center_x - half_width, eave), (center_x, ridge), (center_x + half_width, eave)],
            front - 0.035,
            front + 0.09,
            materials["Walls"],
        )
        return

    window_x, window_z, window_width, window_height = opening
    bottom = window_z - window_height / 2
    top = window_z + window_height / 2
    # Keep a shallow full-profile backing behind the cutout. The three front
    # pieces below form the real reveal, but a backing surface prevents tiny
    # gaps at the roof rake from exposing the review/world background.
    add_prism(
        target,
        "GableWallBacking",
        [(center_x - half_width, eave), (center_x, ridge), (center_x + half_width, eave)],
        front + 0.08,
        front + 0.14,
        materials["Walls"],
    )
    add_prism(
        target,
        "GableWallLower",
        [
            (center_x - half_width, eave),
            (center_x + half_width, eave),
            (window_x + window_width / 2, bottom),
            (window_x - window_width / 2, bottom),
        ],
        front - 0.035,
        front + 0.09,
        materials["Walls"],
    )
    add_prism(
        target,
        "GableWallLeft",
        [
            (center_x - half_width, eave),
            (window_x - window_width / 2, bottom),
            (window_x - window_width / 2, top),
            (center_x, ridge),
        ],
        front - 0.035,
        front + 0.09,
        materials["Walls"],
    )
    add_prism(
        target,
        "GableWallRight",
        [
            (window_x + window_width / 2, bottom),
            (center_x + half_width, eave),
            (center_x, ridge),
            (window_x + window_width / 2, top),
        ],
        front - 0.035,
        front + 0.09,
        materials["Walls"],
    )


def add_front_gable_roof(target, materials, name: str, center_x: float, half_width: float, eave: float, ridge: float, y_front: float, y_back: float) -> None:
    add_roof_slope(target, f"{name}Left", center_x - half_width, eave, center_x, ridge, y_front, y_back, materials["Roof"])
    add_roof_slope(target, f"{name}Right", center_x, ridge, center_x + half_width, eave, y_front, y_back, materials["Roof"])
    add_box(target, "RoofEave", (center_x, y_front, eave - 0.08), (half_width * 2 + 0.36, 0.18, 0.18), materials["Trim"], 0.02)
    add_box(target, "RoofRearEave", (center_x, y_back, eave - 0.08), (half_width * 2 + 0.36, 0.18, 0.18), materials["Trim"], 0.02)
    trim_y = y_front - 0.11
    add_beam_between(target, "GableTrim", (center_x - half_width, trim_y, eave), (center_x, trim_y, ridge), 0.14, materials["Trim"])
    add_beam_between(target, "GableTrim", (center_x, trim_y, ridge), (center_x + half_width, trim_y, eave), 0.14, materials["Trim"])
    rear_trim_y = y_back + 0.11
    add_beam_between(target, "GableTrimRear", (center_x - half_width, rear_trim_y, eave), (center_x, rear_trim_y, ridge), 0.12, materials["Trim"])
    add_beam_between(target, "GableTrimRear", (center_x, rear_trim_y, ridge), (center_x + half_width, rear_trim_y, eave), 0.12, materials["Trim"])
    add_beam_between(target, "RoofRidge", (center_x, y_front, ridge + 0.02), (center_x, y_back, ridge + 0.02), 0.12, materials["Trim"])
    add_box(target, "RoofRidgeCap", (center_x, (y_front + y_back) / 2, ridge + 0.06), (0.2, y_back - y_front + 0.18, 0.14), materials["Roof"], 0.025)
    for side in (-1, 1):
        eave_x = center_x + side * half_width
        add_box(target, "RoofSoffit", (eave_x, (y_front + y_back) / 2, eave - 0.08), (0.22, y_back - y_front, 0.1), materials["Trim"], 0.018)
        add_cylinder_between(
            target,
            "RoofGutter",
            (eave_x + side * 0.08, y_front + 0.1, eave - 0.19),
            (eave_x + side * 0.08, y_back - 0.1, eave - 0.19),
            0.055,
            materials["Metal"],
            vertices=12,
        )
        add_cylinder_between(
            target,
            "RoofDownspout",
            (eave_x + side * 0.08, y_back - 0.22, eave - 0.18),
            (eave_x + side * 0.08, y_back - 0.22, 0.95),
            0.045,
            materials["Metal"],
            vertices=12,
        )


def add_chimney(target, materials, x: float, y: float, bottom: float, height: float = 1.55) -> None:
    add_box(target, "ChimneyFlashing", (x, y, bottom + 0.04), (0.82, 0.82, 0.08), materials["Metal"], 0.018)
    add_box(target, "ChimneyBase", (x, y, bottom + 0.22), (0.7, 0.7, 0.35), materials["Brick"], 0.025)
    add_box(target, "Chimney", (x, y, bottom + 0.35 + height / 2), (0.56, 0.56, height), materials["Brick"], 0.025)
    crown_z = bottom + 0.35 + height
    add_box(target, "ChimneyCrown", (x, y, crown_z + 0.07), (0.72, 0.72, 0.14), materials["Trim"], 0.025)
    add_box(target, "ChimneyCap", (x, y, crown_z + 0.17), (0.84, 0.84, 0.08), materials["Trim"], 0.018)


def add_shape_gable(root, target, materials) -> None:
    width, depth = 7.6, 10.64
    openings = [
        (x, z, window_width + 0.22, window_height + 0.22)
        for z, window_width, window_height in ((3.55, 0.9, 1.58), (6.25, 0.9, 1.58))
        for x in (-2.1, 2.1)
    ]
    openings.append((0.0, 2.15, 1.34, 2.62))
    front, top = add_body(target, materials, width, depth, 7.5, openings)
    for z in (3.55, 6.25):
        for x in (-2.1, 2.1):
            add_front_window(target, materials, x, front - 0.11, z)
    add_entry(target, materials, 0, front - 0.11)
    add_stoop(target, materials, 0, front)
    add_porch_canopy(target, materials, 0, front, 2.2)
    add_front_gable_wall(target, materials, 0, 4.05, top, 11.35, front, (0, 9.55, 0.92, 1.14))
    add_front_gable_roof(target, materials, "GableRoof", 0, 4.2, top, 11.35, front - 0.22, depth / 2 + 0.08)
    add_front_window(target, materials, 0, front - 0.16, 9.55, width=0.7, height=0.92)
    add_chimney(target, materials, -2.45, 1.55, 9.0)


def add_shape_cornice(root, target, materials) -> None:
    width, depth = 7.8, 10.64
    openings = [(x, 6.7, 1.12, 1.8) for x in (-2.25, 0, 2.25)]
    openings.extend((x, 3.55, 1.12, 1.8) for x in (-2.25, 2.25))
    openings.append((0.0, 2.15, 1.34, 2.62))
    front, top = add_body(target, materials, width, depth, 8.5, openings)
    for x in (-2.25, 0, 2.25):
        add_front_window(target, materials, x, front - 0.11, 6.7)
    for x in (-2.25, 2.25):
        add_front_window(target, materials, x, front - 0.11, 3.55)
    add_entry(target, materials, 0, front - 0.11)
    add_stoop(target, materials, 0, front)
    add_porch_canopy(target, materials, 0, front, 2.05)
    add_box(target, "FlatRoof", (0, 0, top + 0.12), (width + 0.36, depth + 0.28, 0.24), materials["Roof"], 0.035)
    parapet_bottom = top + 0.2
    add_box(target, "FrontParapet", (0, front - 0.02, parapet_bottom + 0.38), (width + 0.4, 0.38, 0.76), materials["Walls"], 0.025)
    add_box(target, "CorniceFrieze", (0, front - 0.25, parapet_bottom + 0.18), (width + 0.5, 0.14, 0.22), materials["Trim"], 0.018)
    add_box(target, "CorniceLowerBand", (0, front - 0.28, parapet_bottom + 0.02), (width + 0.54, 0.16, 0.14), materials["Trim"], 0.018)
    add_box(target, "ParapetCap", (0, front - 0.18, parapet_bottom + 0.82), (width + 0.68, 0.28, 0.18), materials["Trim"], 0.02)
    add_box(target, "CorniceCoping", (0, 0, top + 0.33), (width + 0.58, depth + 0.42, 0.12), materials["Trim"], 0.018)
    add_box(target, "CorniceGutter", (0, front - 0.34, top + 0.3), (width + 0.7, 0.12, 0.1), materials["Metal"], 0.025)
    for x in (-3.05, -2.0, -0.95, 0.95, 2.0, 3.05):
        add_box(target, "CorniceBracket", (x, front - 0.23, parapet_bottom + 0.15), (0.18, 0.24, 0.38), materials["Trim"], 0.018)
    add_chimney(target, materials, -2.25, 1.55, top + 0.18, 1.45)


def add_shared_paired_roof(target, materials, width: float, front: float, back: float) -> None:
    start = front + 2.65
    end = back + 0.08
    profile = [(-width / 2 - 0.22, 8.42), (-2.35, 10.75), (2.35, 10.75), (width / 2 + 0.22, 8.42)]
    add_prism(target, "PairedSharedRearRoof", profile, start, end, materials["Roof"])
    add_box(target, "PairedRearEave", (0, end, 8.34), (width + 0.56, 0.18, 0.18), materials["Trim"], 0.02)
    add_box(target, "PairedRearSoffit", (0, end - 0.06, 8.26), (width + 0.42, 0.2, 0.1), materials["Trim"], 0.018)
    add_cylinder_between(target, "PairedRearGutter", (-width / 2 - 0.16, end + 0.08, 8.22), (width / 2 + 0.16, end + 0.08, 8.22), 0.055, materials["Metal"], vertices=12)
    for valley_x in (-2.35, 2.35):
        add_beam_between(target, "PairedValleyFlashing", (valley_x, start + 0.05, 8.48), (valley_x, end - 0.05, 8.48), 0.08, materials["Metal"])


def add_shape_paired(root, target, materials) -> None:
    width, depth = 9.5, 10.64
    openings = [(x, 6.25, 1.06, 1.8) for x in (-3.3, -1.1, 1.1, 3.3)]
    openings.extend((x, 3.55, 1.02, 1.8) for x in (-3.3, 3.3))
    openings.extend((x, 2.15, 1.34, 2.62) for x in (-1.7, 1.7))
    front, top = add_body(target, materials, width, depth, 7.5, openings)
    for x in (-3.3, -1.1, 1.1, 3.3):
        add_front_window(target, materials, x, front - 0.11, 6.25, width=0.84)
    for x in (-3.3, 3.3):
        add_front_window(target, materials, x, front - 0.11, 3.55, width=0.8)
    for x in (-1.7, 1.7):
        add_entry(target, materials, x, front - 0.11)
        add_stoop(target, materials, x, front, 1.42)
    add_porch_canopy(target, materials, 0, front, 5.15)

    for center_x in (-2.35, 2.35):
        add_front_gable_wall(target, materials, center_x, 2.35, top, 11.35, front, (center_x, 9.5, 0.9, 1.08))
        add_front_gable_roof(target, materials, f"PairedRoof{center_x}", center_x, 2.45, top, 11.35, front - 0.22, front + 2.85)
        add_front_window(target, materials, center_x, front - 0.16, 9.5, width=0.68, height=0.88)
    add_shared_paired_roof(target, materials, width, front, depth / 2)
    add_chimney(target, materials, -3.3, 1.2, 9.0)

    for side in (-1, 1):
        add_side_window(target, materials, side * (width / 2 + 0.11), -2.3, 3.7, side)
        add_side_window(target, materials, side * (width / 2 + 0.11), -2.3, 6.25, side)
        add_side_window(target, materials, side * (width / 2 + 0.11), 1.55, 3.7, side)


def create_shape(asset, name: str, builder, materials):
    root = bpy.data.objects.new(name, None)
    asset.objects.link(root)
    target = bpy.data.collections.new(f"{name}Geometry")
    bpy.context.scene.collection.children.link(target)
    builder(root, target, materials)
    joined = join_by_material(target, root)
    metre_uv(joined)
    for obj in joined:
        obj["shapeId"] = name.removeprefix("Shape_").lower()
        obj["assetId"] = ASSET_ID
    return root, joined


def add_review_environment(review) -> None:
    ground = pbr_material("ReviewGround", (0.29, 0.32, 0.24), 0.94)
    add_box(review, "ReviewGround", (0, 0, -0.18), (60, 60, 0.34), ground, 0.08)
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.24, 0.31, 0.37, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.62
    sun_data = bpy.data.lights.new("ReviewSun", "SUN")
    sun_data.energy = 2.4
    sun_data.angle = math.radians(5)
    sun = bpy.data.objects.new("ReviewSun", sun_data)
    review.objects.link(sun)
    sun.rotation_euler = (math.radians(32), math.radians(-24), math.radians(-28))
    area_data = bpy.data.lights.new("ReviewFill", "AREA")
    area_data.energy = 1400
    area_data.shape = "DISK"
    area_data.size = 14
    area = bpy.data.objects.new("ReviewFill", area_data)
    review.objects.link(area)
    area.location = (-14, -18, 22)
    area.rotation_euler = (Vector((0, 0, 4)) - area.location).to_track_quat("-Z", "Y").to_euler()


def hex_rgb(value: str) -> tuple[float, float, float]:
    value = value.removeprefix("#")
    return tuple(int(value[index : index + 2], 16) / 255.0 for index in (0, 2, 4))


def make_review_material(source, color: str):
    images = {
        node.label.lower(): node.image
        for node in source.node_tree.nodes
        if node.type == "TEX_IMAGE" and node.image
    }
    source_principled = next(node for node in source.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    material = bpy.data.materials.new(f"{source.name} Review")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    for socket_name in ("Roughness", "Metallic", "Alpha"):
        if socket_name in source_principled.inputs and socket_name in principled.inputs:
            principled.inputs[socket_name].default_value = source_principled.inputs[socket_name].default_value
    tint = (*hex_rgb(color), 1.0)
    if "base color" in images:
        base_node = nodes.new("ShaderNodeTexImage")
        base_node.image = images["base color"]
        tint_node = nodes.new("ShaderNodeRGB")
        tint_node.outputs["Color"].default_value = tint
        multiply = nodes.new("ShaderNodeMixRGB")
        multiply.blend_type = "MULTIPLY"
        multiply.inputs[0].default_value = 1.0
        links.new(tint_node.outputs["Color"], multiply.inputs[1])
        links.new(base_node.outputs["Color"], multiply.inputs[2])
        links.new(multiply.outputs["Color"], principled.inputs["Base Color"])
    else:
        principled.inputs["Base Color"].default_value = tint
    if "normal" in images:
        normal_node = nodes.new("ShaderNodeTexImage")
        normal_node.image = images["normal"]
        normal_node.image.colorspace_settings.name = "Non-Color"
        normal_map = nodes.new("ShaderNodeNormalMap")
        links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])
    if "orm" in images:
        orm_node = nodes.new("ShaderNodeTexImage")
        orm_node.image = images["orm"]
        orm_node.image.colorspace_settings.name = "Non-Color"
        separate = nodes.new("ShaderNodeSeparateColor")
        links.new(orm_node.outputs["Color"], separate.inputs["Color"])
        links.new(separate.outputs["Green"], principled.inputs["Roughness"])
        links.new(separate.outputs["Blue"], principled.inputs["Metallic"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material


def render_contact_sheet(output_root: Path, palette_ids: list[str], shape_ids: list[str]) -> None:
    paths = [output_root / "review" / palette / f"front-{shape}.png" for palette in palette_ids for shape in shape_ids]
    cell_width = 512
    cell_height = 512
    sheet = np.zeros((len(palette_ids) * cell_height, len(shape_ids) * cell_width, 4), dtype=np.float32)
    loaded = []
    try:
        for index, path in enumerate(paths):
            image = bpy.data.images.load(str(path), check_existing=False)
            image.scale(cell_width, cell_height)
            pixels = np.array(image.pixels[:], dtype=np.float32).reshape((cell_height, cell_width, 4))
            row, column = divmod(index, len(shape_ids))
            sheet[row * cell_height : (row + 1) * cell_height, column * cell_width : (column + 1) * cell_width] = pixels
            loaded.append(image)
        contact = bpy.data.images.new("front-contact-sheet", width=sheet.shape[1], height=sheet.shape[0], alpha=False)
        contact.pixels.foreach_set(sheet.ravel())
        contact.filepath_raw = str(output_root / "review" / "front-contact-sheet.png")
        contact.file_format = "PNG"
        contact.save()
        bpy.data.images.remove(contact)
    finally:
        for image in loaded:
            bpy.data.images.remove(image)


def render_package(output_root: Path, review, shape_roots, source_materials, quick: bool) -> None:
    directory = output_root / "review"
    directory.mkdir(parents=True, exist_ok=True)
    camera = add_camera(review, "BeautyCamera", (23, -28, 15), (0, 0, 5.1), 58)
    management = add_camera(review, "ManagementCamera", (28, -33, 26), (0, 0, 5), 58)
    front = add_camera(review, "FrontCamera", (0, -35, 6), (0, 0, 6), orthographic_scale=15.2)

    def set_shape_render_state(active_shape) -> None:
        for shape in shape_roots:
            hidden = shape is not active_shape
            shape.hide_render = hidden
            for child in shape.children_recursive:
                child.hide_render = hidden

    meshes = [child for shape in shape_roots for child in shape.children_recursive if child.type == "MESH"]
    original_materials = {mesh: mesh.data.materials[0] for mesh in meshes}
    shape_ids = [shape.name.removeprefix("Shape_").lower() for shape in shape_roots]
    palette_ids = [palette["id"] for palette in PALETTES]
    for palette in PALETTES:
        palette_directory = directory / palette["id"]
        palette_directory.mkdir(parents=True, exist_ok=True)
        semantic_sources = {}
        for mesh, original in original_materials.items():
            semantic_name = original.name
            target_name = palette.get("materialVariants", {}).get(semantic_name, semantic_name)
            semantic_sources[semantic_name] = source_materials[target_name]
        preview_materials = {
            semantic: make_review_material(source, palette["colors"].get(semantic, "#ffffff"))
            for semantic, source in semantic_sources.items()
        }
        for mesh, original in original_materials.items():
            mesh.data.materials.clear()
            mesh.data.materials.append(preview_materials[original.name])
        for shape in shape_roots:
            set_shape_render_state(shape)
            shape_id = shape.name.removeprefix("Shape_").lower()
            render(camera, palette_directory / f"beauty-{shape_id}.png", 960 if quick else 1280, 720 if quick else 960, samples=16 if quick else 28)
            render(front, palette_directory / f"front-{shape_id}.png", 512 if quick else 1024, 512 if quick else 1024, samples=16 if quick else 28)
            render(management, palette_directory / f"management-{shape_id}.png", 960 if quick else 1280, 720 if quick else 960, samples=16 if quick else 28)
        if palette["id"] == "brick-cream":
            set_shape_render_state(shape_roots[0])
            render(camera, output_root / "thumbnail.webp", 480 if quick else 768, 480 if quick else 768, samples=16 if quick else 28, file_format="WEBP")
    render_contact_sheet(output_root, palette_ids, shape_ids)
    for mesh, material in original_materials.items():
        mesh.data.materials.clear()
        mesh.data.materials.append(material)


def write_manifest(output_root: Path) -> None:
    manifest = {
        "id": ASSET_ID,
        "name": ASSET_NAME,
        "category": "residential",
        "model": "model.glb",
        "thumbnail": "thumbnail.webp",
        "defaultScale": 1,
        "appearance": {
            "defaultShapeId": "gable",
            "defaultPaletteId": "brick-cream",
            "shapes": [
                {"id": "gable", "name": "Gable", "root": "Shape_Gable"},
                {"id": "cornice", "name": "Cornice", "root": "Shape_Cornice"},
                {"id": "paired", "name": "Paired", "root": "Shape_Paired"},
            ],
            "palettes": PALETTES,
        },
    }
    (output_root / "asset.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")


def write_review(output_root: Path, stats: dict, glb_path: Path) -> None:
    stats["glbBytes"] = glb_path.stat().st_size
    (output_root / "audit.json").write_text(json.dumps(stats, indent=2) + "\n", encoding="utf8")
    review = (
        f"# {ASSET_NAME} — candidate\n\n"
        "Status: **Awaiting approval**\n\n"
        f"- Combined bounds: `{stats['boundsMetresBlender']['dimensions']}` m.\n"
        f"- Triangles: `{stats['triangles']:,}` / 120,000.\n"
        f"- Material slots: `{stats['drawCalls']}`.\n"
        f"- GLB size: `{stats['glbBytes'] / 1_000_000:.2f}` MB / 25 MB.\n"
        f"- Ground aligned: `{stats['groundAligned']}`.\n\n"
        "| Gable | Cornice | Paired |\n| --- | --- | --- |\n"
        "| ![Gable](review/brick-cream/beauty-gable.png) | ![Cornice](review/brick-cream/beauty-cornice.png) | ![Paired](review/brick-cream/beauty-paired.png) |\n\n"
        "The palette rows and front-view 3×4 contact sheet are under `review/`.\n"
    )
    (output_root / "FINAL_REVIEW.md").write_text(review, encoding="utf8")


def main() -> None:
    args = parse_arguments()
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.look = "AgX - Medium High Contrast"

    asset = collection("Asset")
    review = collection("Review")
    root = bpy.data.objects.new("NarrowFrontResidence", None)
    asset.objects.link(root)
    root["assetId"] = ASSET_ID
    root["facadeAxis"] = "+Z in Three.js / -Y in Blender"
    materials = make_materials(output_root / "textures", args.quick)
    shape_roots = []
    joined = []
    for name, builder in (("Shape_Gable", add_shape_gable), ("Shape_Cornice", add_shape_cornice), ("Shape_Paired", add_shape_paired)):
        shape, meshes = create_shape(asset, name, builder, materials)
        shape.parent = root
        shape_roots.append(shape)
        joined.extend(meshes)
    add_material_library(root, asset, materials)
    if not args.skip_renders:
        add_review_environment(review)
        render_package(output_root, review, shape_roots, materials, args.quick)
    for mesh in joined:
        mesh.select_set(False)
    glb_path = output_root / "model.glb"
    export_glb(root, glb_path)
    stats = audit(root, output_root / "audit.json", FOOTPRINT)
    write_manifest(output_root)
    write_review(output_root, stats, glb_path)
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
