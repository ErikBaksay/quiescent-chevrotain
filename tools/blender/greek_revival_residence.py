"""Generate the approved Greek Revival Residence and its final-review package."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))

from heritage_blender import (
    add_box,
    add_camera,
    add_cylinder,
    add_cylinder_between,
    add_fluted_column,
    add_hip_roof,
    add_lathe,
    add_torus,
    add_uv_sphere,
    audit,
    collection,
    create_texture_set,
    export_glb,
    join_by_material,
    move_to_collection,
    pbr_material,
    render,
    reset_scene,
    smart_uv,
)


ASSET_ID = "greek-revival-residence"
ASSET_NAME = "Greek Revival Residence"
FOOTPRINT = (24.0, 17.0)

BODY_X_HALF = 11.2
BODY_FRONT = -3.8
BODY_REAR = 7.3
ROOF_X_HALF = 12.0
ROOF_FRONT = -8.0
ROOF_REAR = 8.0
ROOF_EAVE = 9.15
ROOF_RIDGE = 11.45
ROOF_RIDGE_HALF = 4.4


def parse_arguments() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[2]
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-root",
        type=Path,
        default=project_root / ".artifacts" / "blender" / ASSET_ID,
    )
    parser.add_argument("--quick", action="store_true", help="Use smaller textures and renders.")
    parser.add_argument("--skip-renders", action="store_true", help="Build and export without review renders.")
    parser.add_argument("--preview-only", action="store_true", help="Render only the beauty view before export.")
    return parser.parse_args(arguments)


def make_materials(texture_directory: Path, quick: bool) -> dict[str, bpy.types.Material]:
    hero_size = 512 if quick else 1024
    standard_size = 256 if quick else 512
    textures = {
        "clapboard": create_texture_set(
            texture_directory,
            "warm_ivory_clapboard",
            (0.79, 0.75, 0.65),
            0.72,
            size=hero_size,
            seed=137,
            variation=0.038,
            grain="wood",
        ),
        "trim": create_texture_set(
            texture_directory,
            "soft_white_painted_trim",
            (0.84, 0.82, 0.74),
            0.68,
            size=standard_size,
            seed=191,
            variation=0.03,
            grain="wood",
        ),
        "roof": create_texture_set(
            texture_directory,
            "charcoal_standing_seam_metal",
            (0.075, 0.083, 0.082),
            0.43,
            metallic=0.54,
            size=standard_size,
            seed=223,
            variation=0.022,
            grain="metal",
        ),
        "green": create_texture_set(
            texture_directory,
            "deep_muted_green_painted_wood_v2",
            (0.075, 0.125, 0.09),
            0.62,
            size=standard_size,
            seed=251,
            variation=0.032,
            grain="wood",
        ),
        "brick": create_texture_set(
            texture_directory,
            "red_brown_handmade_brick",
            (0.43, 0.19, 0.105),
            0.84,
            size=standard_size,
            seed=283,
            variation=0.075,
            grain="stone",
        ),
        "stone": create_texture_set(
            texture_directory,
            "grey_foundation_stone",
            (0.47, 0.45, 0.40),
            0.82,
            size=standard_size,
            seed=317,
            variation=0.06,
            grain="stone",
        ),
    }
    return {
        "Walls": pbr_material(
            "Walls",
            (0.79, 0.75, 0.65),
            0.72,
            textures=textures["clapboard"],
            normal_strength=0.2,
        ),
        "Trim": pbr_material(
            "Trim",
            (0.84, 0.82, 0.74),
            0.68,
            textures=textures["trim"],
            normal_strength=0.18,
        ),
        "Roof": pbr_material(
            "Roof",
            (0.075, 0.083, 0.082),
            0.43,
            metallic=0.54,
            textures=textures["roof"],
            normal_strength=0.16,
        ),
        "Door": pbr_material(
            "Door",
            (0.075, 0.125, 0.09),
            0.62,
            textures=textures["green"],
            normal_strength=0.18,
        ),
        "Brick": pbr_material(
            "Brick",
            (0.43, 0.19, 0.105),
            0.84,
            textures=textures["brick"],
            normal_strength=0.34,
        ),
        "Stone": pbr_material(
            "Stone",
            (0.47, 0.45, 0.40),
            0.82,
            textures=textures["stone"],
            normal_strength=0.3,
        ),
        "Metal": pbr_material("Metal", (0.045, 0.05, 0.048), 0.4, metallic=0.78),
        "Glass": pbr_material("WindowGlass", (0.16, 0.27, 0.29), 0.17, metallic=0.06, alpha=0.28),
        "Interior": pbr_material("WindowInterior", (0.01, 0.013, 0.012), 0.98),
        "Curtains": pbr_material("Curtains", (0.76, 0.69, 0.57), 0.94),
        "Wood": pbr_material("Wood", (0.65, 0.61, 0.51), 0.78),
    }


def add_clapboard_courses(asset, materials) -> None:
    walls = materials["Walls"]
    for index, z in enumerate([1.08 + step * 0.205 for step in range(37)]):
        projection = 0.028 + (index % 3) * 0.002
        add_box(
            asset,
            "ClapboardCourseFront",
            (0, BODY_FRONT - projection, z),
            (21.95, 0.035, 0.038),
            walls,
        )
        add_box(
            asset,
            "ClapboardCourseRear",
            (0, BODY_REAR + projection, z),
            (21.95, 0.035, 0.038),
            walls,
        )
        for x in (-BODY_X_HALF - projection, BODY_X_HALF + projection):
            add_box(
                asset,
                "ClapboardCourseSide",
                (x, (BODY_FRONT + BODY_REAR) * 0.5, z),
                (0.035, BODY_REAR - BODY_FRONT - 0.32, 0.038),
                walls,
            )


def add_vent(asset, materials, axis: str, wall: float, along: float, outward: float) -> None:
    interior = materials["Interior"]
    metal = materials["Metal"]
    stone = materials["Stone"]
    width = 0.86
    height = 0.38
    surface = wall + outward * 0.045
    if axis == "Y":
        add_box(asset, "FoundationVentRecess", (along, surface, 0.43), (width, 0.035, height), interior, 0.02)
        add_box(asset, "FoundationVentLintel", (along, surface + outward * 0.035, 0.68), (1.02, 0.08, 0.12), stone, 0.02)
        for offset in (-0.3, -0.15, 0, 0.15, 0.3):
            add_box(asset, "FoundationVentBar", (along + offset, surface + outward * 0.055, 0.43), (0.024, 0.025, 0.33), metal)
        for offset in (-0.1, 0.1):
            add_box(asset, "FoundationVentBar", (along, surface + outward * 0.058, 0.43 + offset), (0.78, 0.025, 0.022), metal)
    else:
        add_box(asset, "FoundationVentRecess", (surface, along, 0.43), (0.035, width, height), interior, 0.02)
        add_box(asset, "FoundationVentLintel", (surface + outward * 0.035, along, 0.68), (0.08, 1.02, 0.12), stone, 0.02)
        for offset in (-0.3, -0.15, 0, 0.15, 0.3):
            add_box(asset, "FoundationVentBar", (surface + outward * 0.055, along + offset, 0.43), (0.025, 0.024, 0.33), metal)
        for offset in (-0.1, 0.1):
            add_box(asset, "FoundationVentBar", (surface + outward * 0.058, along, 0.43 + offset), (0.025, 0.78, 0.022), metal)


def add_louvered_shutter(
    asset,
    materials,
    axis: str,
    wall: float,
    along: float,
    z: float,
    outward: float,
    hinge_side: float,
) -> None:
    door = materials["Door"]
    metal = materials["Metal"]
    width = 0.62
    height = 2.42
    surface = wall + outward * 0.145
    if axis == "Y":
        add_box(asset, "LouveredShutter", (along, surface, z), (width, 0.09, height), door, 0.012)
        add_box(asset, "ShutterStile", (along - width * 0.4, surface + outward * 0.055, z), (0.09, 0.035, height - 0.08), door)
        add_box(asset, "ShutterStile", (along + width * 0.4, surface + outward * 0.055, z), (0.09, 0.035, height - 0.08), door)
        for offset in (-0.72, -0.48, -0.24, 0, 0.24, 0.48, 0.72):
            louver = add_box(
                asset,
                "ShutterLouver",
                (along, surface + outward * 0.068, z + offset),
                (width - 0.16, 0.035, 0.065),
                door,
            )
            louver.rotation_euler.x = math.radians(outward * 12)
        inner_x = along + hinge_side * width * 0.5
        for offset in (-0.72, 0.72):
            add_box(asset, "ShutterHinge", (inner_x, surface + outward * 0.09, z + offset), (0.22, 0.035, 0.05), metal)
        add_uv_sphere(
            asset,
            "ShutterHoldback",
            (along - hinge_side * 0.18, surface + outward * 0.105, z - height * 0.54),
            (0.055, 0.035, 0.075),
            metal,
            8,
            4,
        )
    else:
        add_box(asset, "LouveredShutter", (surface, along, z), (0.09, width, height), door, 0.012)
        add_box(asset, "ShutterStile", (surface + outward * 0.055, along - width * 0.4, z), (0.035, 0.09, height - 0.08), door)
        add_box(asset, "ShutterStile", (surface + outward * 0.055, along + width * 0.4, z), (0.035, 0.09, height - 0.08), door)
        for offset in (-0.72, -0.48, -0.24, 0, 0.24, 0.48, 0.72):
            louver = add_box(
                asset,
                "ShutterLouver",
                (surface + outward * 0.068, along, z + offset),
                (0.035, width - 0.16, 0.065),
                door,
            )
            louver.rotation_euler.y = math.radians(-outward * 12)
        inner_y = along + hinge_side * width * 0.5
        for offset in (-0.72, 0.72):
            add_box(asset, "ShutterHinge", (surface + outward * 0.09, inner_y, z + offset), (0.035, 0.22, 0.05), metal)
        add_uv_sphere(
            asset,
            "ShutterHoldback",
            (surface + outward * 0.105, along - hinge_side * 0.18, z - height * 0.54),
            (0.035, 0.055, 0.075),
            metal,
            8,
            4,
        )


def add_window(
    asset,
    materials,
    axis: str,
    wall: float,
    along: float,
    z: float,
    outward: float,
    shutters: bool = True,
) -> None:
    trim = materials["Trim"]
    glass = materials["Glass"]
    interior = materials["Interior"]
    curtains = materials["Curtains"]
    width = 1.48
    height = 2.34
    depth = [wall + outward * value for value in (0.035, 0.065, 0.095, 0.135)]

    if axis == "Y":
        add_box(asset, "WindowInteriorCard", (along, depth[0], z), (width * 0.94, 0.03, height * 0.96), interior)
        for side in (-1, 1):
            curtain_x = along + side * width * 0.32
            add_box(
                asset,
                "WindowCurtain",
                (curtain_x, depth[1], z),
                (width * 0.28, 0.025, height * 0.9),
                curtains,
            )
            for fold in (-0.075, 0.075):
                add_box(
                    asset,
                    "WindowCurtainFold",
                    (curtain_x + fold, depth[1] + outward * 0.012, z),
                    (0.045, 0.025, height * 0.86),
                    curtains,
                )
        add_box(asset, "WindowGlass", (along, depth[2], z), (width * 0.9, 0.018, height * 0.91), glass)
        add_box(asset, "WindowLintel", (along, depth[3], z + height * 0.5 + 0.18), (width + 0.4, 0.22, 0.24), trim, 0.025)
        add_box(asset, "WindowSill", (along, depth[3] + outward * 0.035, z - height * 0.5 - 0.12), (width + 0.34, 0.31, 0.17), trim, 0.025)
        for side in (-1, 1):
            add_box(asset, "WindowJamb", (along + side * (width * 0.5 + 0.085), depth[3], z), (0.16, 0.18, height + 0.2), trim, 0.018)
        for offset in (-width * 0.17, width * 0.17):
            add_box(asset, "WindowMuntin", (along + offset, depth[3] + outward * 0.012, z), (0.036, 0.035, height * 0.89), trim)
        for offset in (-height * 0.225, 0, height * 0.225):
            thickness = 0.075 if offset == 0 else 0.036
            add_box(asset, "WindowMeetingRail" if offset == 0 else "WindowMuntin", (along, depth[3] + outward * 0.014, z + offset), (width * 0.88, 0.038, thickness), trim)
    else:
        add_box(asset, "WindowInteriorCard", (depth[0], along, z), (0.03, width * 0.94, height * 0.96), interior)
        for side in (-1, 1):
            curtain_y = along + side * width * 0.32
            add_box(
                asset,
                "WindowCurtain",
                (depth[1], curtain_y, z),
                (0.025, width * 0.28, height * 0.9),
                curtains,
            )
            for fold in (-0.075, 0.075):
                add_box(
                    asset,
                    "WindowCurtainFold",
                    (depth[1] + outward * 0.012, curtain_y + fold, z),
                    (0.025, 0.045, height * 0.86),
                    curtains,
                )
        add_box(asset, "WindowGlass", (depth[2], along, z), (0.018, width * 0.9, height * 0.91), glass)
        add_box(asset, "WindowLintel", (depth[3], along, z + height * 0.5 + 0.18), (0.22, width + 0.4, 0.24), trim, 0.025)
        add_box(asset, "WindowSill", (depth[3] + outward * 0.035, along, z - height * 0.5 - 0.12), (0.31, width + 0.34, 0.17), trim, 0.025)
        for side in (-1, 1):
            add_box(asset, "WindowJamb", (depth[3], along + side * (width * 0.5 + 0.085), z), (0.18, 0.16, height + 0.2), trim, 0.018)
        for offset in (-width * 0.17, width * 0.17):
            add_box(asset, "WindowMuntin", (depth[3] + outward * 0.012, along + offset, z), (0.035, 0.036, height * 0.89), trim)
        for offset in (-height * 0.225, 0, height * 0.225):
            thickness = 0.075 if offset == 0 else 0.036
            add_box(asset, "WindowMeetingRail" if offset == 0 else "WindowMuntin", (depth[3] + outward * 0.014, along, z + offset), (0.038, width * 0.88, thickness), trim)

    if shutters:
        offset = width * 0.5 + 0.42
        add_louvered_shutter(asset, materials, axis, wall, along - offset, z, outward, 1)
        add_louvered_shutter(asset, materials, axis, wall, along + offset, z, outward, -1)


def add_raised_door_panel(asset, material, name: str, x: float, y: float, z: float, width: float, height: float, outward: float) -> None:
    add_box(asset, name, (x, y + outward * 0.08, z), (width, 0.05, height), material, 0.025)


def add_formal_entrance(asset, materials) -> None:
    trim = materials["Trim"]
    door = materials["Door"]
    glass = materials["Glass"]
    interior = materials["Interior"]
    metal = materials["Metal"]
    y = BODY_FRONT - 0.16

    add_box(asset, "FormalEntranceInterior", (0, y + 0.08, 2.65), (3.5, 0.035, 3.55), interior)
    for side in (-1, 1):
        leaf_x = side * 0.5
        add_box(asset, "FormalDoorLeaf", (leaf_x, y - 0.035, 2.44), (0.95, 0.16, 2.92), door, 0.025)
        for panel_z, panel_height in ((1.62, 0.66), (2.45, 0.62), (3.27, 0.64)):
            add_raised_door_panel(asset, door, "FormalDoorRaisedPanel", leaf_x, y - 0.06, panel_z, 0.69, panel_height, -1)
    for side in (-1, 1):
        x = side * 1.29
        add_box(asset, "EntranceSidelight", (x, y - 0.08, 2.57), (0.42, 0.025, 2.48), glass)
        add_box(asset, "EntranceSidelightMuntin", (x, y - 0.115, 2.57), (0.035, 0.035, 2.42), trim)
        for z in (1.95, 2.57, 3.19):
            add_box(asset, "EntranceSidelightMuntin", (x, y - 0.116, z), (0.38, 0.035, 0.035), trim)
        add_box(asset, "EntrancePilaster", (side * 1.66, y - 0.01, 2.68), (0.28, 0.28, 3.52), trim, 0.025)
        add_box(asset, "EntrancePilasterCapital", (side * 1.66, y - 0.04, 4.31), (0.44, 0.34, 0.2), trim, 0.025)
    add_box(asset, "EntranceTransom", (0, y - 0.09, 4.13), (2.05, 0.025, 0.52), glass)
    for x in (-0.68, 0, 0.68):
        add_box(asset, "EntranceTransomMuntin", (x, y - 0.12, 4.13), (0.035, 0.035, 0.48), trim)
    add_box(asset, "EntranceLintel", (0, y - 0.015, 4.5), (3.72, 0.38, 0.3), trim, 0.035)
    add_box(asset, "EntranceCornice", (0, y - 0.08, 4.72), (4.05, 0.5, 0.18), trim, 0.035)
    for x in (-0.13, 0.13):
        add_uv_sphere(asset, "DoorKnob", (x, y - 0.155, 2.45), (0.065, 0.045, 0.065), metal, 12, 6)
        add_box(asset, "DoorEscutcheon", (x, y - 0.135, 2.45), (0.12, 0.035, 0.24), metal, 0.018)
    for side in (-1, 1):
        for z in (1.48, 3.4):
            add_box(asset, "DoorHinge", (side * 0.93, y - 0.14, z), (0.18, 0.04, 0.08), metal, 0.01)


def add_upper_gallery_door(asset, materials) -> None:
    trim = materials["Trim"]
    door = materials["Door"]
    glass = materials["Glass"]
    interior = materials["Interior"]
    metal = materials["Metal"]
    y = BODY_FRONT - 0.15
    add_box(asset, "GalleryDoorInterior", (0, y + 0.07, 6.73), (2.04, 0.035, 2.74), interior)
    for side in (-1, 1):
        x = side * 0.49
        add_box(asset, "GalleryDoorLeaf", (x, y - 0.03, 6.73), (0.92, 0.14, 2.62), door, 0.022)
        add_box(asset, "GalleryDoorGlass", (x, y - 0.115, 7.03), (0.68, 0.022, 1.52), glass)
        add_box(asset, "GalleryDoorLowerPanel", (x, y - 0.13, 5.74), (0.68, 0.045, 0.55), door, 0.02)
        add_box(asset, "GalleryDoorMuntin", (x, y - 0.145, 7.03), (0.035, 0.03, 1.48), trim)
        for z in (6.65, 7.41):
            add_box(asset, "GalleryDoorMuntin", (x, y - 0.146, z), (0.64, 0.03, 0.035), trim)
    for side in (-1, 1):
        add_box(asset, "GalleryDoorJamb", (side * 1.08, y - 0.015, 6.73), (0.2, 0.22, 2.82), trim, 0.02)
    add_box(asset, "GalleryDoorLintel", (0, y - 0.02, 8.19), (2.48, 0.28, 0.24), trim, 0.025)
    add_uv_sphere(asset, "GalleryDoorKnob", (0.12, y - 0.17, 6.2), (0.055, 0.04, 0.055), metal, 14, 7)


def add_service_entrance(asset, materials) -> None:
    trim = materials["Trim"]
    door = materials["Door"]
    glass = materials["Glass"]
    interior = materials["Interior"]
    metal = materials["Metal"]
    roof = materials["Roof"]
    stone = materials["Stone"]
    y = BODY_REAR + 0.14

    add_box(asset, "ServiceDoorInterior", (0, y - 0.07, 2.38), (1.45, 0.03, 2.95), interior)
    add_box(asset, "ServiceDoor", (0, y + 0.025, 2.36), (1.28, 0.15, 2.78), door, 0.025)
    for z in (1.65, 2.45, 3.18):
        add_box(asset, "ServiceDoorRaisedPanel", (0, y + 0.125, z), (0.92, 0.045, 0.5), door, 0.02)
    for x in (-0.78, 0.78):
        add_box(asset, "ServiceDoorJamb", (x, y + 0.01, 2.42), (0.2, 0.24, 3.0), trim, 0.02)
    add_box(asset, "ServiceDoorTransom", (0, y + 0.11, 3.94), (1.28, 0.022, 0.42), glass)
    for x in (-0.4, 0, 0.4):
        add_box(asset, "ServiceTransomMuntin", (x, y + 0.14, 3.94), (0.028, 0.03, 0.38), trim)
    add_box(asset, "ServiceDoorLintel", (0, y + 0.02, 4.23), (1.88, 0.3, 0.24), trim, 0.025)
    add_uv_sphere(asset, "ServiceDoorKnob", (0.34, y + 0.13, 2.42), (0.06, 0.045, 0.06), metal, 14, 7)

    for index in range(4):
        front = 8.55 - index * 0.25
        back = 7.32
        height = (index + 1) * 0.2
        add_box(asset, "RearStoneStep", (0, (front + back) * 0.5, height * 0.5), (2.3, front - back, height), stone, 0.018)
    for x in (-1.35, 1.35):
        add_box(asset, "RearCanopyPost", (x, 8.28, 2.38), (0.16, 0.16, 3.05), trim, 0.018)
        add_cylinder_between(asset, "RearCanopyBracket", (x, 8.28, 3.58), (x, 7.48, 4.18), 0.045, trim, 10)
    canopy = add_box(asset, "RearCanopyRoof", (0, 7.99, 4.43), (3.25, 1.45, 0.11), roof, 0.015)
    canopy.rotation_euler.x = math.radians(-8)
    for x in (-1.2, -0.6, 0, 0.6, 1.2):
        seam = add_box(asset, "RearCanopyStandingSeam", (x, 7.99, 4.49), (0.035, 1.36, 0.035), roof)
        seam.rotation_euler.x = math.radians(-8)
    add_box(asset, "RearCanopyWallFlashing", (0, 7.39, 4.53), (3.35, 0.08, 0.18), metal, 0.012)
    add_cylinder_between(asset, "RearCanopyGutter", (-1.58, 8.7, 4.29), (1.58, 8.7, 4.29), 0.045, metal, 10)


def add_foundation_body_and_openings(asset, materials) -> None:
    walls = materials["Walls"]
    brick = materials["Brick"]
    stone = materials["Stone"]
    trim = materials["Trim"]

    add_box(
        asset,
        "RaisedBrickFoundation",
        (0, (BODY_FRONT + BODY_REAR) * 0.5, 0.42),
        (22.55, BODY_REAR - BODY_FRONT + 0.18, 0.84),
        brick,
        0.025,
    )
    add_box(
        asset,
        "MainWallMass",
        (0, (BODY_FRONT + BODY_REAR) * 0.5, 4.78),
        (22.4, BODY_REAR - BODY_FRONT, 7.86),
        walls,
        0.035,
    )
    add_clapboard_courses(asset, materials)

    add_box(asset, "FrontWaterTable", (0, BODY_FRONT - 0.12, 0.9), (22.75, 0.32, 0.3), stone, 0.03)
    add_box(asset, "RearWaterTable", (0, BODY_REAR + 0.12, 0.9), (22.75, 0.32, 0.3), stone, 0.03)
    for x in (-BODY_X_HALF - 0.12, BODY_X_HALF + 0.12):
        add_box(asset, "SideWaterTable", (x, (BODY_FRONT + BODY_REAR) * 0.5, 0.9), (0.32, BODY_REAR - BODY_FRONT + 0.2, 0.3), stone, 0.03)

    for x in (-BODY_X_HALF - 0.08, BODY_X_HALF + 0.08):
        add_box(asset, "CornerBoard", (x, BODY_FRONT - 0.04, 4.78), (0.34, 0.24, 7.88), trim, 0.02)
        add_box(asset, "CornerBoard", (x, BODY_REAR + 0.04, 4.78), (0.34, 0.24, 7.88), trim, 0.02)
    for y in (BODY_FRONT + 0.15, BODY_REAR - 0.15):
        for x in (-BODY_X_HALF - 0.08, BODY_X_HALF + 0.08):
            add_box(asset, "SideCornerBoard", (x, y, 4.78), (0.24, 0.34, 7.88), trim, 0.02)

    add_box(asset, "FloorBeltCourseFront", (0, BODY_FRONT - 0.14, 4.75), (22.6, 0.27, 0.2), trim, 0.02)
    add_box(asset, "FloorBeltCourseRear", (0, BODY_REAR + 0.14, 4.75), (22.6, 0.27, 0.2), trim, 0.02)
    for x in (-BODY_X_HALF - 0.14, BODY_X_HALF + 0.14):
        add_box(asset, "FloorBeltCourseSide", (x, (BODY_FRONT + BODY_REAR) * 0.5, 4.75), (0.27, BODY_REAR - BODY_FRONT, 0.2), trim, 0.02)

    for x in (-8.0, -4.0, 4.0, 8.0):
        add_window(asset, materials, "Y", BODY_FRONT, x, 2.72, -1)
        add_window(asset, materials, "Y", BODY_FRONT, x, 6.7, -1)
        add_window(asset, materials, "Y", BODY_REAR, x, 2.72, 1)
        add_window(asset, materials, "Y", BODY_REAR, x, 6.7, 1)
    add_window(asset, materials, "Y", BODY_REAR, 0, 6.7, 1)

    for x, outward in ((-BODY_X_HALF, -1), (BODY_X_HALF, 1)):
        for y in (-1.45, 2.35, 5.85):
            add_window(asset, materials, "X", x, y, 2.72, outward)
            add_window(asset, materials, "X", x, y, 6.7, outward)

    for x in (-8.0, -4.0, 4.0, 8.0):
        add_vent(asset, materials, "Y", BODY_REAR + 0.1, x, 1)
    for x in (-8.0, -4.0, 4.0, 8.0):
        add_vent(asset, materials, "Y", -7.76, x, -1)
    for x, outward in ((-BODY_X_HALF - 0.1, -1), (BODY_X_HALF + 0.1, 1)):
        for y in (-0.5, 4.7):
            add_vent(asset, materials, "X", x, y, outward)

    add_formal_entrance(asset, materials)
    add_upper_gallery_door(asset, materials)
    add_service_entrance(asset, materials)


def add_railing_run(asset, materials, start, end, gap: float = 0.34) -> None:
    trim = materials["Trim"]
    start_vector = Vector(start)
    end_vector = Vector(end)
    length = (end_vector - start_vector).length
    add_box(
        asset,
        "GalleryTopRail",
        ((start_vector + end_vector) * 0.5),
        (abs(end_vector.x - start_vector.x) + 0.1, abs(end_vector.y - start_vector.y) + 0.1, 0.12),
        trim,
        0.0,
    ) if abs(end_vector.x - start_vector.x) > abs(end_vector.y - start_vector.y) else add_box(
        asset,
        "GalleryTopRail",
        ((start_vector + end_vector) * 0.5),
        (0.1, abs(end_vector.y - start_vector.y) + 0.1, 0.12),
        trim,
        0.018,
    )
    lower_start = start_vector - Vector((0, 0, 0.75))
    lower_end = end_vector - Vector((0, 0, 0.75))
    if abs(end_vector.x - start_vector.x) > abs(end_vector.y - start_vector.y):
        add_box(asset, "GalleryBottomRail", ((lower_start + lower_end) * 0.5), (length + 0.08, 0.09, 0.1), trim)
    else:
        add_box(asset, "GalleryBottomRail", ((lower_start + lower_end) * 0.5), (0.09, length + 0.08, 0.1), trim)
    count = max(2, int(length / gap))
    for index in range(count + 1):
        point = lower_start.lerp(lower_end, index / count)
        add_box(asset, "GalleryBaluster", (point.x, point.y, point.z + 0.375), (0.065, 0.065, 0.74), trim)


def add_galleries_columns_and_stairs(asset, materials) -> None:
    brick = materials["Brick"]
    stone = materials["Stone"]
    trim = materials["Trim"]
    wood = materials["Wood"]
    metal = materials["Metal"]

    add_box(asset, "FrontPorchBrickSkirt", (0, -7.56, 0.42), (22.55, 0.38, 0.84), brick, 0.025)
    for x in (-11.08, 11.08):
        add_box(asset, "FrontPorchSideBrickSkirt", (x, -5.7, 0.42), (0.38, 3.92, 0.84), brick, 0.025)
    add_box(asset, "FrontPorchStoneCap", (0, -7.57, 0.89), (22.78, 0.48, 0.25), stone, 0.025)

    plank_count = 52
    plank_width = 22.28 / plank_count
    for index in range(plank_count):
        x = -11.14 + plank_width * (index + 0.5)
        add_box(asset, "PorchFloorBoard", (x, -5.72, 0.965), (plank_width - 0.014, 3.7, 0.15), wood)
        add_box(asset, "UpperGalleryFloorBoard", (x, -5.72, 4.72), (plank_width - 0.014, 3.7, 0.16), wood)
    add_box(asset, "PorchFrontFascia", (0, -7.62, 0.98), (22.7, 0.22, 0.42), trim, 0.025)
    add_box(asset, "UpperGalleryFrontFascia", (0, -7.62, 4.7), (22.7, 0.24, 0.42), trim, 0.025)
    add_box(asset, "GalleryCeiling", (0, -5.78, 8.73), (22.6, 3.7, 0.14), wood, 0.02)
    for x in (-9.7, -6.4, -3.2, 0, 3.2, 6.4, 9.7):
        add_box(asset, "GalleryCeilingBeam", (x, -5.78, 8.61), (0.14, 3.72, 0.18), trim)

    column_y = -7.42
    column_positions = (-10.15, -6.1, -2.03, 2.03, 6.1, 10.15)
    for x in column_positions:
        add_box(asset, "ColumnStonePlinth", (x, column_y, 1.1), (0.92, 0.92, 0.28), stone, 0.035)
        add_box(asset, "DoricColumnBase", (x, column_y, 1.31), (0.72, 0.72, 0.16), trim, 0.025)
        add_torus(asset, "DoricColumnLowerMoulding", (x, column_y, 1.43), 0.43, 0.075, trim, major_segments=28)
        add_fluted_column(asset, "DoricFlutedShaft", (x, column_y, 4.86), 0.405, 6.78, trim, 20)
        add_torus(asset, "DoricCapitalNecking", (x, column_y, 8.27), 0.42, 0.07, trim, major_segments=28)
        add_lathe(
            asset,
            "DoricCapitalEchinus",
            (x, column_y, 8.31),
            ((0.42, 0), (0.46, 0.08), (0.53, 0.18), (0.6, 0.28)),
            trim,
            32,
        )
        add_box(asset, "DoricCapitalAbacus", (x, column_y, 8.68), (1.24, 1.05, 0.2), trim, 0.03)

    add_box(asset, "PorticoArchitrave", (0, column_y, 8.92), (23.25, 1.05, 0.3), trim, 0.03)
    add_box(asset, "PorticoPlainFrieze", (0, column_y, 9.16), (23.5, 1.08, 0.26), trim, 0.035)
    add_box(asset, "PorticoCornice", (0, column_y - 0.03, 9.4), (23.85, 1.28, 0.24), trim, 0.04)
    for x in [value * 0.58 for value in range(-19, 20)]:
        add_box(asset, "PorticoMutule", (x, column_y - 0.62, 9.22), (0.28, 0.24, 0.12), trim)

    front_runs = [(-10.05, -6.2), (-6.0, -2.13), (-2.0, -1.15), (1.15, 2.0), (2.13, 6.0), (6.2, 10.05)]
    for x_start, x_end in front_runs:
        add_railing_run(asset, materials, (x_start, -6.94, 5.76), (x_end, -6.94, 5.76))
    add_railing_run(asset, materials, (-10.03, -6.94, 5.76), (-10.03, -4.08, 5.76))
    add_railing_run(asset, materials, (10.03, -6.94, 5.76), (10.03, -4.08, 5.76))

    step_count = 6
    for index in range(step_count):
        front = -8.58 + index * 0.19
        back = -7.48
        height = (index + 1) * 0.16
        add_box(asset, "BroadEntranceStep", (0, (front + back) * 0.5, height * 0.5), (4.45, back - front, height), stone, 0.018)
    for x in (-2.36, 2.36):
        add_box(asset, "StairCheek", (x, -8.04, 0.5), (0.35, 1.28, 1.0), stone, 0.025)
        add_cylinder_between(asset, "StairHandrail", (x, -8.55, 0.76), (x, -7.48, 1.62), 0.04, metal, 12)
        for y, z in ((-8.5, 0.6), (-8.0, 1.0), (-7.52, 1.4)):
            add_cylinder(asset, "StairRailPost", (x, y, z), 0.045, 1.0, metal, 12)


def roof_surface_height(x: float) -> float:
    absolute_x = abs(x)
    if absolute_x <= ROOF_RIDGE_HALF:
        return ROOF_RIDGE
    ratio = (ROOF_X_HALF - absolute_x) / (ROOF_X_HALF - ROOF_RIDGE_HALF)
    return ROOF_EAVE + max(0.0, min(1.0, ratio)) * (ROOF_RIDGE - ROOF_EAVE)


def add_roof_seams(asset, materials) -> None:
    roof = materials["Roof"]
    for index in range(-19, 20):
        x = index * 0.6
        absolute_x = abs(x)
        if absolute_x <= ROOF_RIDGE_HALF:
            y_front_end = 0
            y_rear_end = 0
            z_end = ROOF_RIDGE
        else:
            ratio = (ROOF_X_HALF - absolute_x) / (ROOF_X_HALF - ROOF_RIDGE_HALF)
            if ratio <= 0:
                continue
            y_front_end = ROOF_FRONT + ratio * (0 - ROOF_FRONT)
            y_rear_end = ROOF_REAR + ratio * (0 - ROOF_REAR)
            z_end = ROOF_EAVE + ratio * (ROOF_RIDGE - ROOF_EAVE)
        add_cylinder_between(
            asset,
            "StandingSeamFront",
            (x, ROOF_FRONT, ROOF_EAVE + 0.035),
            (x, y_front_end, z_end + 0.035),
            0.022,
            roof,
            8,
        )
        add_cylinder_between(
            asset,
            "StandingSeamRear",
            (x, ROOF_REAR, ROOF_EAVE + 0.035),
            (x, y_rear_end, z_end + 0.035),
            0.022,
            roof,
            8,
        )

    for side in (-1, 1):
        for index in range(-6, 7):
            y = index * 1.1
            add_cylinder_between(
                asset,
                "StandingSeamSide",
                (side * ROOF_X_HALF, y, ROOF_EAVE + 0.035),
                (side * ROOF_RIDGE_HALF, 0, ROOF_RIDGE + 0.035),
                0.022,
                roof,
                8,
            )


def add_chimney(asset, materials, x: float, y: float) -> None:
    brick = materials["Brick"]
    stone = materials["Stone"]
    metal = materials["Metal"]
    roof_height = roof_surface_height(x)
    add_box(asset, "InteriorBrickChimney", (x, y, 9.75), (1.05, 0.8, 4.3), brick, 0.025)
    add_box(asset, "ChimneyCorbelLower", (x, y, 11.74), (1.2, 0.94, 0.18), brick, 0.025)
    add_box(asset, "ChimneyCorbelUpper", (x, y, 11.92), (1.34, 1.04, 0.18), brick, 0.025)
    add_box(asset, "ChimneyCap", (x, y, 12.09), (1.46, 1.14, 0.16), stone, 0.03)

    slope = math.atan((ROOF_RIDGE - ROOF_EAVE) / (ROOF_X_HALF - ROOF_RIDGE_HALF))
    flashing = add_box(asset, "ChimneyApronFlashing", (x, y, roof_height + 0.055), (1.58, 1.3, 0.065), metal, 0.008)
    flashing.rotation_euler.y = slope if x > 0 else -slope
    for side in (-1, 1):
        add_box(asset, "ChimneyCounterflashing", (x + side * 0.55, y, roof_height + 0.13), (0.06, 0.96, 0.16), metal, 0.006)
        add_box(asset, "ChimneyCounterflashing", (x, y + side * 0.42, roof_height + 0.13), (1.12, 0.06, 0.16), metal, 0.006)


def add_downspout(asset, materials, x: float, y: float, x_out: float, y_out: float) -> None:
    metal = materials["Metal"]
    stone = materials["Stone"]
    top = (x, y, 9.03)
    gutter_x = -12.08 if x < 0 else 12.08
    add_cylinder_between(asset, "DownspoutGutterLeader", (gutter_x, y, 9.04), top, 0.057, metal, 12)
    shoulder = (x - x_out * 0.18, y - y_out * 0.18, 8.78)
    vertical_top = (shoulder[0], shoulder[1], 8.55)
    vertical_bottom = (shoulder[0], shoulder[1], 0.62)
    add_cylinder_between(asset, "DownspoutOffset", top, shoulder, 0.057, metal, 12)
    add_cylinder_between(asset, "Downspout", vertical_top, vertical_bottom, 0.057, metal, 12)
    add_cylinder_between(
        asset,
        "DownspoutKick",
        vertical_bottom,
        (vertical_bottom[0] + x_out * 0.32, vertical_bottom[1] + y_out * 0.32, 0.25),
        0.057,
        metal,
        12,
    )
    for z in (2.2, 5.1, 7.8):
        add_torus(asset, "DownspoutStrap", (shoulder[0], shoulder[1], z), 0.073, 0.014, metal, major_segments=14, minor_segments=5)
    add_box(
        asset,
        "DownspoutSplashBlock",
        (vertical_bottom[0] + x_out * 0.4, vertical_bottom[1] + y_out * 0.4, 0.08),
        (0.68 if x_out else 0.34, 0.68 if y_out else 0.34, 0.14),
        stone,
        0.025,
    )


def add_main_roof_chimneys_and_drainage(asset, materials) -> None:
    roof = materials["Roof"]
    trim = materials["Trim"]
    metal = materials["Metal"]
    add_box(asset, "UpperWallArchitrave", (0, (BODY_FRONT + BODY_REAR) * 0.5, 8.72), (22.65, 11.36, 0.24), trim, 0.025)
    add_box(asset, "UpperWallFrieze", (0, (BODY_FRONT + BODY_REAR) * 0.5, 8.95), (22.82, 11.54, 0.24), trim, 0.03)
    add_box(asset, "UpperWallCornice", (0, (BODY_FRONT + BODY_REAR) * 0.5, 9.18), (23.2, 11.92, 0.25), trim, 0.035)

    add_hip_roof(
        asset,
        "StandingSeamHippedRoof",
        ROOF_X_HALF,
        ROOF_FRONT,
        ROOF_REAR,
        ROOF_EAVE,
        ROOF_RIDGE,
        ROOF_RIDGE_HALF,
        roof,
    )
    add_roof_seams(asset, materials)
    for start, end in (
        ((-ROOF_X_HALF, ROOF_FRONT, ROOF_EAVE + 0.045), (-ROOF_RIDGE_HALF, 0, ROOF_RIDGE + 0.045)),
        ((ROOF_X_HALF, ROOF_FRONT, ROOF_EAVE + 0.045), (ROOF_RIDGE_HALF, 0, ROOF_RIDGE + 0.045)),
        ((-ROOF_X_HALF, ROOF_REAR, ROOF_EAVE + 0.045), (-ROOF_RIDGE_HALF, 0, ROOF_RIDGE + 0.045)),
        ((ROOF_X_HALF, ROOF_REAR, ROOF_EAVE + 0.045), (ROOF_RIDGE_HALF, 0, ROOF_RIDGE + 0.045)),
    ):
        add_cylinder_between(asset, "FoldedHipCap", start, end, 0.055, roof, 10)
    add_cylinder_between(
        asset,
        "FoldedRidgeCap",
        (-ROOF_RIDGE_HALF, 0, ROOF_RIDGE + 0.055),
        (ROOF_RIDGE_HALF, 0, ROOF_RIDGE + 0.055),
        0.065,
        roof,
        10,
    )
    add_cylinder_between(asset, "FrontHalfRoundGutter", (-11.9, -8.08, 9.04), (11.9, -8.08, 9.04), 0.07, metal, 12)
    add_cylinder_between(asset, "RearHalfRoundGutter", (-11.9, 8.08, 9.04), (11.9, 8.08, 9.04), 0.07, metal, 12)
    add_cylinder_between(asset, "SideHalfRoundGutter", (-12.08, -7.9, 9.04), (-12.08, 7.9, 9.04), 0.07, metal, 12)
    add_cylinder_between(asset, "SideHalfRoundGutter", (12.08, -7.9, 9.04), (12.08, 7.9, 9.04), 0.07, metal, 12)

    for x in (-8.35, 8.35):
        add_chimney(asset, materials, x, 2.05)
    for x, y, x_out, y_out in (
        (-11.33, -3.92, -1, -1),
        (11.33, -3.92, 1, -1),
        (-11.33, 7.42, -1, 1),
        (11.33, 7.42, 1, 1),
    ):
        add_downspout(asset, materials, x, y, x_out, y_out)


def apply_rotation_and_scale(asset) -> None:
    for obj in list(asset.objects):
        if obj.type != "MESH":
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def add_review_environment(review) -> None:
    ground = pbr_material("ReviewGround", (0.29, 0.32, 0.24), 0.94)
    add_box(review, "ReviewGround", (0, 0, -0.18), (74, 74, 0.34), ground, 0.08)

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.24, 0.31, 0.37, 1.0)
    background.inputs["Strength"].default_value = 0.62

    sun_data = bpy.data.lights.new("WarmSouthernSun", "SUN")
    sun_data.energy = 2.65
    sun_data.angle = math.radians(4.5)
    sun = bpy.data.objects.new("WarmSouthernSun", sun_data)
    review.objects.link(sun)
    sun.rotation_euler = (math.radians(33), math.radians(-22), math.radians(-30))

    area_data = bpy.data.lights.new("SkyFill", "AREA")
    area_data.energy = 2200
    area_data.shape = "DISK"
    area_data.size = 16
    area = bpy.data.objects.new("SkyFill", area_data)
    review.objects.link(area)
    area.location = (-18, -20, 26)
    direction = Vector((0, -0.5, 5.5)) - area.location
    area.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    porch_fill_data = bpy.data.lights.new("PorchReviewFill", "AREA")
    porch_fill_data.energy = 520
    porch_fill_data.shape = "DISK"
    porch_fill_data.size = 6.5
    porch_fill = bpy.data.objects.new("PorchReviewFill", porch_fill_data)
    review.objects.link(porch_fill)
    porch_fill.location = (0, -13, 6.5)
    porch_direction = Vector((0, -3.7, 3.5)) - porch_fill.location
    porch_fill.rotation_euler = porch_direction.to_track_quat("-Z", "Y").to_euler()


def render_package(output_root: Path, review, joined, quick: bool, preview_only: bool = False) -> None:
    review_directory = output_root / "review"
    review_directory.mkdir(parents=True, exist_ok=True)
    width = 960 if quick else 1600
    height = 720 if quick else 1200
    samples = 16 if quick else 28
    cameras = {
        "beauty": add_camera(review, "BeautyCamera", (30, -37, 11.5), (0, -0.7, 4.9), 58),
        "management": add_camera(review, "ManagementCamera", (38, -43, 33), (0, 0, 4.6), 58),
        "front": add_camera(review, "FrontCamera", (0, -52, 5.8), (0, 0, 5.8), orthographic_scale=19.2),
        "side": add_camera(review, "SideCamera", (-46, 0, 5.8), (0, 0, 5.8), orthographic_scale=16.8),
        "rear": add_camera(review, "RearCamera", (0, 52, 5.8), (0, 0, 5.8), orthographic_scale=19.2),
        "top": add_camera(review, "TopCamera", (0, 0, 48), (0, 0, 0), orthographic_scale=21.5),
        "portico": add_camera(review, "PorticoDetailCamera", (11, -20, 9.5), (4.0, -6.5, 6.2), 72),
        "entrance": add_camera(review, "EntranceDetailCamera", (0, -15.5, 3.4), (0, -3.75, 2.8), 78),
        "window": add_camera(review, "WindowDetailCamera", (17, -13, 7.2), (8.0, -3.65, 6.5), 82),
        "roof": add_camera(review, "RoofDetailCamera", (18, -13, 13.0), (8.2, 1.6, 10.5), 82),
        "foundation": add_camera(review, "FoundationDetailCamera", (13, -16, 2.4), (8.2, -7.2, 1.1), 78),
    }
    render(cameras["beauty"], review_directory / "beauty.png", 960 if quick else 2048, 720 if quick else 1536, samples=samples)
    if preview_only:
        return
    render(cameras["management"], review_directory / "management-distance.png", width, height, samples=samples)
    for name in ("front", "side", "rear", "top"):
        render(cameras[name], review_directory / f"orthographic-{name}.png", width, height, samples=samples)
    for name in ("portico", "entrance", "window", "roof", "foundation"):
        render(cameras[name], review_directory / f"detail-{name}.png", width, height, samples=samples)

    wire = pbr_material("WireframeReview", (0.008, 0.012, 0.013), 0.5, metallic=0.18)
    wire_copies = []
    for obj in joined:
        duplicate = obj.copy()
        duplicate.data = obj.data.copy()
        duplicate.name = f"Wire_{obj.name}"
        review.objects.link(duplicate)
        duplicate.parent = None
        duplicate.data.materials.clear()
        duplicate.data.materials.append(wire)
        modifier = duplicate.modifiers.new("Technical wireframe", "WIREFRAME")
        modifier.thickness = 0.009
        modifier.use_even_offset = True
        modifier.use_replace = True
        obj.hide_render = True
        wire_copies.append(duplicate)
    render(cameras["beauty"], review_directory / "wireframe.png", width, height, samples=samples)
    for obj in joined:
        obj.hide_render = False
    for duplicate in wire_copies:
        bpy.data.objects.remove(duplicate, do_unlink=True)

    render(cameras["beauty"], review_directory / "thumbnail.webp", 768 if not quick else 480, 768 if not quick else 480, samples=samples, file_format="WEBP")


def write_review(output_root: Path, stats: dict, glb_path: Path) -> None:
    stats["glbBytes"] = glb_path.stat().st_size
    (output_root / "audit.json").write_text(json.dumps(stats, indent=2) + "\n", encoding="utf8")
    review = f"""# {ASSET_NAME} — final review candidate

Status: **Awaiting final approval**

## Beauty and management distance

| Close presentation | Management camera |
| --- | --- |
| ![Beauty](review/beauty.png) | ![Management](review/management-distance.png) |

## Four-view presentation

| Front | Side |
| --- | --- |
| ![Front](review/orthographic-front.png) | ![Side](review/orthographic-side.png) |
| Rear | Top |
| ![Rear](review/orthographic-rear.png) | ![Top](review/orthographic-top.png) |

## Material and architectural details

| Doric colonnade | Formal entrance | Window depth and shutters |
| --- | --- | --- |
| ![Doric colonnade](review/detail-portico.png) | ![Formal entrance](review/detail-entrance.png) | ![Window](review/detail-window.png) |

| Roof and drainage | Foundation and porch |
| --- | --- |
| ![Roof and drainage](review/detail-roof.png) | ![Foundation and porch](review/detail-foundation.png) |

## In-game verification

| Close camera | Management distance |
| --- | --- |
| ![In-game close](review/in-game-close.png) | ![In-game management distance](review/in-game-management.png) |

## Wireframe and audit

![Wireframe](review/wireframe.png)

- Bounds: `{stats['boundsMetresBlender']['dimensions']}` m in Blender X/Y/Z.
- Approximate design footprint: `24 × 17` m; fixed stair and drainage projections are included in audited bounds.
- Triangles: `{stats['triangles']:,}` / 120,000 review threshold.
- Draw calls: `{stats['drawCalls']}` / 12 review threshold.
- Materials: `{', '.join(stats['materials'])}`.
- Ground aligned: `{stats['groundAligned']}`.
- Invalid numeric values: `{len(stats['invalidValues'])}`.
- Cameras exported: `{stats['camerasExported']}`; lights exported: `{stats['lightsExported']}`.
- GLB size: `{stats['glbBytes'] / 1_000_000:.2f} MB` / approximately 25 MB review threshold.

The candidate remains outside the runtime catalogue. Final approval authorizes runtime integration and unlocks work on the next collection asset.
"""
    (output_root / "FINAL_REVIEW.md").write_text(review, encoding="utf8")


def main() -> None:
    args = parse_arguments()
    output_root = args.output_root.resolve()
    texture_directory = output_root / "textures"
    output_root.mkdir(parents=True, exist_ok=True)

    reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.look = "AgX - Medium High Contrast"

    asset = collection("Asset")
    review_collection = collection("Review")
    root = bpy.data.objects.new("GreekRevivalResidence", None)
    asset.objects.link(root)
    root["assetId"] = ASSET_ID
    root["assetName"] = ASSET_NAME
    root["facadeAxis"] = "+Z in Three.js / -Y in Blender"

    materials = make_materials(texture_directory, args.quick)
    add_foundation_body_and_openings(asset, materials)
    add_galleries_columns_and_stairs(asset, materials)
    add_main_roof_chimneys_and_drainage(asset, materials)
    apply_rotation_and_scale(asset)

    joined = join_by_material(asset, root)
    smart_uv(joined)
    for obj in joined:
        obj["assetId"] = ASSET_ID
        obj.visible_shadow = True

    add_review_environment(review_collection)
    if not args.skip_renders:
        render_package(output_root, review_collection, joined, args.quick, args.preview_only)

    for obj in joined:
        modifier = obj.modifiers.new("Export triangulation", "TRIANGULATE")
        modifier.keep_custom_normals = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    blend_path = output_root / f"{ASSET_ID}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)
    glb_path = output_root / "model.glb"
    export_glb(root, glb_path)
    stats = audit(root, output_root / "audit.json", FOOTPRINT)
    write_review(output_root, stats, glb_path)
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
