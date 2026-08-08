"""Generate the approved Civic Hall and its final-review package."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))

from asset_blender import (
    add_box,
    add_camera,
    add_cylinder,
    add_cylinder_between,
    add_fluted_column,
    add_hip_roof,
    add_lathe,
    add_prism,
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


ASSET_ID = "civic-hall"
ASSET_NAME = "Civic Hall"
FOOTPRINT = (34.0, 23.0)


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
    parser.add_argument("--skip-renders", action="store_true", help="Build and export without the review package.")
    parser.add_argument("--preview-only", action="store_true", help="Render only the beauty view before export.")
    return parser.parse_args(arguments)


def make_materials(texture_directory: Path, quick: bool) -> dict[str, bpy.types.Material]:
    hero_size = 512 if quick else 1024
    standard_size = 256 if quick else 512
    textures = {
        "stucco": create_texture_set(
            texture_directory,
            "stucco",
            (0.91, 0.84, 0.70),
            0.82,
            size=hero_size,
            seed=41,
            variation=0.055,
            grain="mineral",
        ),
        "limestone": create_texture_set(
            texture_directory,
            "limestone",
            (0.78, 0.70, 0.57),
            0.78,
            size=hero_size,
            seed=73,
            variation=0.07,
            grain="stone",
        ),
        "roof": create_texture_set(
            texture_directory,
            "roof",
            (0.055, 0.065, 0.066),
            0.45,
            metallic=0.32,
            size=standard_size,
            seed=17,
            variation=0.028,
            grain="metal",
        ),
        "wood": create_texture_set(
            texture_directory,
            "painted_wood",
            (0.045, 0.082, 0.072),
            0.58,
            size=standard_size,
            seed=91,
            variation=0.04,
            grain="wood",
        ),
        "copper": create_texture_set(
            texture_directory,
            "aged_copper_v2",
            (0.075, 0.14, 0.115),
            0.56,
            metallic=0.72,
            size=standard_size,
            seed=108,
            variation=0.025,
            grain="metal",
        ),
    }
    return {
        "Stucco": pbr_material(
            "Walls",
            (0.91, 0.84, 0.70),
            0.82,
            textures=textures["stucco"],
            normal_strength=0.28,
        ),
        "Limestone": pbr_material(
            "Trim",
            (0.78, 0.70, 0.57),
            0.78,
            textures=textures["limestone"],
            normal_strength=0.34,
        ),
        "Roof": pbr_material(
            "Roof",
            (0.055, 0.065, 0.066),
            0.45,
            metallic=0.32,
            textures=textures["roof"],
            normal_strength=0.2,
        ),
        "Door": pbr_material(
            "Door",
            (0.045, 0.082, 0.072),
            0.58,
            textures=textures["wood"],
            normal_strength=0.22,
        ),
        "Wood": pbr_material(
            "Wood",
            (0.64, 0.58, 0.47),
            0.68,
            textures=textures["wood"],
            normal_strength=0.18,
        ),
        "Copper": pbr_material(
            "Metal_Copper",
            (0.075, 0.14, 0.115),
            0.56,
            metallic=0.72,
            textures=textures["copper"],
            normal_strength=0.18,
        ),
        "Iron": pbr_material("Metal", (0.035, 0.043, 0.043), 0.38, metallic=0.82),
        "Glass": pbr_material("WindowGlass", (0.19, 0.31, 0.34), 0.18, metallic=0.08, alpha=0.42),
        "Interior": pbr_material("WindowInterior", (0.012, 0.015, 0.014), 0.96),
        "Curtain": pbr_material("Curtains", (0.55, 0.47, 0.36), 0.92),
        "Clock": pbr_material("ClockFace", (0.77, 0.73, 0.63), 0.72),
    }


def add_ruled_wall_fields(asset, materials) -> None:
    limestone = materials["Limestone"]
    for z in (3.2, 4.55, 5.9, 7.25, 8.6, 9.95):
        add_box(asset, "AshlarRuleFront", (0, -5.535, z), (33.4, 0.035, 0.025), limestone)
        add_box(asset, "AshlarRuleRear", (0, 11.535, z), (33.4, 0.035, 0.025), limestone)
    for x in (-17.035, 17.035):
        for z in (3.2, 4.55, 5.9, 7.25, 8.6, 9.95):
            add_box(asset, "AshlarRuleSide", (x, 3.0, z), (0.035, 16.4, 0.025), limestone)


def add_window(asset, materials, axis: str, wall: float, along: float, z: float, outward: float) -> None:
    trim = materials["Limestone"]
    wood = materials["Wood"]
    glass = materials["Glass"]
    interior = materials["Interior"]
    curtain = materials["Curtain"]
    width = 1.72
    height = 2.62
    depth_positions = (wall + outward * 0.022, wall + outward * 0.052, wall + outward * 0.082)

    if axis == "Y":
        add_box(asset, "WindowInteriorCard", (along, depth_positions[0], z), (width, 0.045, height), interior)
        add_box(asset, "WindowCurtainLeft", (along - 0.52, depth_positions[1], z), (0.44, 0.025, height * 0.88), curtain)
        add_box(asset, "WindowCurtainRight", (along + 0.52, depth_positions[1], z), (0.44, 0.025, height * 0.88), curtain)
        add_box(asset, "WindowGlass", (along, depth_positions[2], z), (width * 0.88, 0.025, height * 0.9), glass)
        add_box(asset, "WindowLintel", (along, wall + outward * 0.12, z + height / 2 + 0.2), (width + 0.52, 0.28, 0.3), trim, 0.035)
        add_box(asset, "WindowSill", (along, wall + outward * 0.15, z - height / 2 - 0.13), (width + 0.42, 0.38, 0.22), trim, 0.035)
        for offset in (-width / 2 - 0.12, width / 2 + 0.12):
            add_box(asset, "WindowJamb", (along + offset, wall + outward * 0.105, z), (0.22, 0.25, height + 0.28), trim, 0.025)
        for offset in (-width * 0.24, 0.0, width * 0.24):
            add_box(asset, "WindowMuntin", (along + offset, wall + outward * 0.105, z), (0.045, 0.055, height * 0.88), wood, 0.008)
        add_box(asset, "WindowMeetingRail", (along, wall + outward * 0.108, z), (width * 0.88, 0.06, 0.07), wood, 0.008)
    else:
        add_box(asset, "WindowInteriorCard", (depth_positions[0], along, z), (0.045, width, height), interior)
        add_box(asset, "WindowCurtainLeft", (depth_positions[1], along - 0.52, z), (0.025, 0.44, height * 0.88), curtain)
        add_box(asset, "WindowCurtainRight", (depth_positions[1], along + 0.52, z), (0.025, 0.44, height * 0.88), curtain)
        add_box(asset, "WindowGlass", (depth_positions[2], along, z), (0.025, width * 0.88, height * 0.9), glass)
        add_box(asset, "WindowLintel", (wall + outward * 0.12, along, z + height / 2 + 0.2), (0.28, width + 0.52, 0.3), trim, 0.035)
        add_box(asset, "WindowSill", (wall + outward * 0.15, along, z - height / 2 - 0.13), (0.38, width + 0.42, 0.22), trim, 0.035)
        for offset in (-width / 2 - 0.12, width / 2 + 0.12):
            add_box(asset, "WindowJamb", (wall + outward * 0.105, along + offset, z), (0.25, 0.22, height + 0.28), trim, 0.025)
        for offset in (-width * 0.24, 0.0, width * 0.24):
            add_box(asset, "WindowMuntin", (wall + outward * 0.105, along + offset, z), (0.055, 0.045, height * 0.88), wood, 0.008)
        add_box(asset, "WindowMeetingRail", (wall + outward * 0.108, along, z), (0.06, width * 0.88, 0.07), wood, 0.008)


def add_door(asset, materials) -> None:
    trim = materials["Limestone"]
    door = materials["Door"]
    glass = materials["Glass"]
    iron = materials["Iron"]
    y = -5.69
    add_box(asset, "CivicDoor", (0, y, 4.02), (2.35, 0.18, 3.24), door, 0.035)
    for x in (-0.57, 0.57):
        add_box(asset, "DoorLeafRail", (x, y - 0.105, 4.02), (0.055, 0.055, 3.0), trim, 0.008)
        for z in (3.3, 4.05, 4.8):
            add_box(asset, "DoorPanel", (x, y - 0.12, z), (0.82, 0.04, 0.5), door, 0.025)
    add_box(asset, "DoorTransom", (0, y - 0.12, 5.55), (2.12, 0.035, 0.62), glass)
    for x in (-1.38, 1.38):
        add_box(asset, "DoorSurround", (x, y + 0.02, 4.18), (0.36, 0.34, 3.78), trim, 0.035)
    add_box(asset, "DoorEntablature", (0, y - 0.01, 6.18), (3.32, 0.5, 0.38), trim, 0.05)
    add_box(asset, "DoorPediment", (0, y - 0.03, 6.48), (3.75, 0.42, 0.2), trim, 0.04)
    for x in (-0.14, 0.14):
        add_uv_sphere(asset, "DoorKnob", (x, y - 0.23, 3.88), (0.07, 0.045, 0.07), iron, 16, 8)


def add_civic_balcony(asset, materials) -> None:
    trim = materials["Limestone"]
    door = materials["Door"]
    glass = materials["Glass"]
    interior = materials["Interior"]
    iron = materials["Iron"]
    wall = -5.54
    add_box(asset, "UpperCivicInterior", (0, wall - 0.025, 8.98), (2.1, 0.045, 2.78), interior)
    add_box(asset, "UpperCivicGlass", (0, wall - 0.085, 8.98), (1.96, 0.025, 2.62), glass)
    for x in (-0.52, 0.0, 0.52):
        add_box(asset, "UpperCivicMuntin", (x, wall - 0.115, 8.98), (0.055, 0.055, 2.64), door, 0.008)
    add_box(asset, "UpperCivicRail", (0, wall - 0.12, 8.98), (1.98, 0.06, 0.07), door, 0.008)
    for x in (-1.28, 1.28):
        add_box(asset, "UpperCivicJamb", (x, wall - 0.06, 8.98), (0.34, 0.3, 3.08), trim, 0.035)
    add_box(asset, "UpperCivicLintel", (0, wall - 0.07, 10.58), (3.05, 0.36, 0.35), trim, 0.045)
    add_box(asset, "BalconySlab", (0, -6.12, 7.55), (3.7, 1.28, 0.28), trim, 0.045)
    add_cylinder_between(asset, "BalconyTopRail", (-1.63, -6.68, 8.62), (1.63, -6.68, 8.62), 0.065, iron, 12)
    add_cylinder_between(asset, "BalconyBottomRail", (-1.63, -6.68, 7.86), (1.63, -6.68, 7.86), 0.05, iron, 12)
    for x in (-1.62, -1.22, -0.81, -0.4, 0.0, 0.4, 0.81, 1.22, 1.62):
        add_cylinder(asset, "BalconyBaluster", (x, -6.68, 8.23), 0.045, 0.82, iron, 10)


def add_foundation_and_body(asset, materials) -> None:
    stucco = materials["Stucco"]
    trim = materials["Limestone"]
    iron = materials["Iron"]
    interior = materials["Interior"]

    add_box(asset, "Foundation", (0, 3.0, 1.1), (34.0, 17.0, 2.2), trim, 0.04)
    add_box(asset, "MainWallMass", (0, 3.0, 6.95), (33.5, 16.5, 9.5), stucco, 0.055)
    add_box(asset, "WaterTable", (0, -5.46, 2.28), (34.15, 0.45, 0.42), trim, 0.045)
    add_box(asset, "RearWaterTable", (0, 11.46, 2.28), (34.15, 0.45, 0.42), trim, 0.045)
    for x in (-17.0, 17.0):
        add_box(asset, "SideWaterTable", (x, 3.0, 2.28), (0.45, 16.9, 0.42), trim, 0.045)
    add_box(asset, "BeltCourseFront", (0, -5.49, 7.05), (34.0, 0.32, 0.28), trim, 0.035)
    add_box(asset, "BeltCourseRear", (0, 11.49, 7.05), (34.0, 0.32, 0.28), trim, 0.035)
    for x in (-16.92, 16.92):
        add_box(asset, "BeltCourseSide", (x, 3.0, 7.05), (0.32, 16.8, 0.28), trim, 0.035)

    for x in (-16.7, -7.1, 7.1, 16.7):
        add_box(asset, "FacadePilaster", (x, -5.57, 7.08), (0.48, 0.38, 9.15), trim, 0.035)
        add_box(asset, "RearPilaster", (x, 11.57, 7.08), (0.48, 0.38, 9.15), trim, 0.035)
    for x in (-17.08, 17.08):
        for y in (-5.15, 2.95, 11.05):
            add_box(asset, "SidePilaster", (x, y, 7.08), (0.38, 0.48, 9.15), trim, 0.035)

    add_ruled_wall_fields(asset, materials)

    for x in (-13.0, -9.35, 9.35, 13.0):
        for z in (4.62, 9.02):
            add_window(asset, materials, "Y", -5.54, x, z, -1.0)
    for x in (-13.0, -8.7, -4.35, 4.35, 8.7, 13.0):
        for z in (4.62, 9.02):
            add_window(asset, materials, "Y", 11.54, x, z, 1.0)
    for x, outward in ((-17.04, -1.0), (17.04, 1.0)):
        for y in (-2.7, 1.15, 5.0, 8.85):
            for z in (4.62, 9.02):
                add_window(asset, materials, "X", x, y, z, outward)

    for x in (-13.0, -9.35, 9.35, 13.0):
        add_box(asset, "FoundationVent", (x, -5.75, 1.18), (1.34, 0.12, 0.72), interior, 0.03)
        for offset in (-0.42, -0.14, 0.14, 0.42):
            add_box(asset, "VentBar", (x + offset, -5.83, 1.18), (0.035, 0.045, 0.65), iron)
    add_door(asset, materials)
    add_civic_balcony(asset, materials)


def add_stairs_and_portico(asset, materials) -> None:
    trim = materials["Limestone"]
    iron = materials["Iron"]
    copper = materials["Copper"]
    glass = materials["Glass"]

    step_count = 12
    for index in range(step_count):
        front = -11.5 + index * 0.5
        back = -5.35
        height = (index + 1) * 0.2
        add_box(
            asset,
            "BroadCivicStair",
            (0, (front + back) / 2.0, height / 2.0),
            (12.4, back - front, height),
            trim,
            0.025,
        )
    add_box(asset, "PorticoPlatform", (0, -7.15, 2.31), (14.3, 3.8, 0.32), trim, 0.04)
    for x in (-6.55, 6.55):
        add_box(asset, "StairCheek", (x, -8.45, 1.18), (0.7, 6.15, 2.36), trim, 0.05)
        add_box(asset, "StairPierCap", (x, -11.03, 1.25), (0.95, 0.95, 0.28), trim, 0.04)

    column_y = -8.48
    for x in (-5.1, -1.7, 1.7, 5.1):
        add_cylinder(asset, "ColumnPlinth", (x, column_y, 2.58), 0.67, 0.32, trim, 32, bevel=0.035)
        add_cylinder(asset, "ColumnBaseLower", (x, column_y, 2.82), 0.57, 0.2, trim, 32, bevel=0.025)
        add_torus(asset, "ColumnBaseTorus", (x, column_y, 3.0), 0.46, 0.105, trim, major_segments=32)
        add_fluted_column(asset, "FlutedColumnShaft", (x, column_y, 6.38), 0.43, 6.55, trim, 20)
        add_torus(asset, "CapitalNecking", (x, column_y, 9.7), 0.45, 0.09, trim, major_segments=32)
        add_box(asset, "CapitalEchinus", (x, column_y, 9.92), (1.05, 0.9, 0.32), trim, 0.08,)
        add_box(asset, "CapitalAbacus", (x, column_y, 10.15), (1.24, 1.02, 0.18), trim, 0.045)
        for offset in (-0.37, 0.37):
            add_torus(
                asset,
                "ColumnVolute",
                (x + offset, column_y - 0.47, 9.98),
                0.19,
                0.055,
                trim,
                rotation=(math.pi / 2, 0, 0),
                major_segments=20,
                minor_segments=7,
            )

    add_box(asset, "PorticoArchitrave", (0, -8.48, 10.43), (13.8, 1.05, 0.4), trim, 0.04)
    add_box(asset, "PorticoFrieze", (0, -8.48, 10.79), (14.15, 1.12, 0.32), trim, 0.04)
    add_box(asset, "PorticoCornice", (0, -8.48, 11.12), (14.65, 1.28, 0.34), trim, 0.05)
    add_prism(
        asset,
        "PedimentTympanum",
        ((-7.0, 11.28), (7.0, 11.28), (0.0, 13.25)),
        -9.03,
        -8.0,
        trim,
    )
    add_prism(
        asset,
        "PorticoGableRoof",
        ((-7.3, 11.2), (7.3, 11.2), (0.0, 13.46)),
        -8.96,
        -5.18,
        materials["Roof"],
    )
    add_cylinder(
        asset,
        "PedimentOculus",
        (0, -9.08, 11.92),
        0.42,
        0.09,
        materials["Interior"],
        32,
        rotation=(math.pi / 2, 0, 0),
    )
    add_torus(
        asset,
        "PedimentOculusTrim",
        (0, -9.15, 11.92),
        0.45,
        0.09,
        trim,
        rotation=(math.pi / 2, 0, 0),
        major_segments=32,
    )
    for start, end in (
        ((-7.15, -9.12, 11.2), (0, -9.12, 13.42)),
        ((0, -9.12, 13.42), (7.15, -9.12, 11.2)),
    ):
        add_cylinder_between(asset, "PedimentRakingCornice", start, end, 0.13, trim, 12)

    for x in (-5.72, 5.72):
        for z in (1.25, 1.95, 2.55):
            add_cylinder_between(asset, "StairRail", (x, -10.95, z - 0.25), (x, -6.0, z + 1.45), 0.045, iron, 12)
        for y in (-10.8, -9.55, -8.3, -7.05, -5.9):
            z = 0.78 + (y + 11.5) * 0.4
            add_cylinder(asset, "StairRailPost", (x, y, z + 0.65), 0.055, 1.3, iron, 12)

    for x in (-6.6, 6.6):
        add_cylinder(asset, "EntranceLampPost", (x, -11.1, 2.1), 0.08, 1.45, iron, 14)
        add_box(asset, "EntranceLantern", (x, -11.1, 3.0), (0.38, 0.38, 0.62), glass, 0.035)
        add_cylinder(asset, "EntranceLanternCap", (x, -11.1, 3.36), 0.28, 0.12, copper, 16)


def add_cornice_roof_and_balustrade(asset, materials) -> None:
    trim = materials["Limestone"]
    roof = materials["Roof"]
    copper = materials["Copper"]

    add_box(asset, "UpperArchitrave", (0, 3.0, 11.42), (34.1, 17.1, 0.32), trim, 0.04)
    add_box(asset, "DentilBand", (0, 3.0, 11.73), (34.55, 17.55, 0.28), trim, 0.045)
    add_box(asset, "CrownCornice", (0, 3.0, 12.06), (35.0, 18.0, 0.38), trim, 0.055)
    for x in [value * 0.8 for value in range(-20, 21)]:
        add_box(asset, "DentilFront", (x, -6.1, 11.52), (0.34, 0.24, 0.34), trim, 0.015)
        add_box(asset, "DentilRear", (x, 12.1, 11.52), (0.34, 0.24, 0.34), trim, 0.015)

    add_hip_roof(asset, "HippedRoof", 15.8, -4.7, 10.7, 12.0, 14.45, 8.6, roof)
    for x in (-15.8, 15.8):
        ridge_x = (-1 if x < 0 else 1) * 8.6
        add_cylinder_between(asset, "RoofHip", (x, -4.7, 12.04), (ridge_x, 3.0, 14.47), 0.045, roof, 10)
        add_cylinder_between(asset, "RoofHip", (x, 10.7, 12.04), (ridge_x, 3.0, 14.47), 0.045, roof, 10)
    add_cylinder_between(asset, "RoofRidge", (-8.6, 3.0, 14.47), (8.6, 3.0, 14.47), 0.05, roof, 10)

    for y, outside in ((-6.08, -1), (12.08, 1)):
        add_cylinder_between(asset, "Gutter", (-16.8, y, 12.02), (16.8, y, 12.02), 0.075, copper, 12)
    for x, outside in ((-17.48, -1), (17.48, 1)):
        add_cylinder_between(asset, "SideGutter", (x, -5.7, 12.02), (x, 11.7, 12.02), 0.075, copper, 12)
    for x, y in ((-16.55, -5.7), (16.55, -5.7), (-16.55, 11.7), (16.55, 11.7)):
        add_cylinder(asset, "Downpipe", (x, y, 6.3), 0.065, 11.3, copper, 12)
        add_torus(asset, "DownpipeCollar", (x, y, 2.0), 0.08, 0.018, copper, major_segments=16, minor_segments=6)

    def balustrade_run(start, end, count):
        start_vector = Vector(start)
        end_vector = Vector(end)
        add_cylinder_between(asset, "BalustradeTopRail", start_vector, end_vector, 0.095, trim, 12)
        add_cylinder_between(
            asset,
            "BalustradeBottomRail",
            start_vector - Vector((0, 0, 0.72)),
            end_vector - Vector((0, 0, 0.72)),
            0.075,
            trim,
            12,
        )
        for index in range(count + 1):
            point = start_vector.lerp(end_vector, index / count)
            add_cylinder(asset, "StoneBaluster", (point.x, point.y, point.z - 0.36), 0.075, 0.72, trim, 10)
        for point in (start_vector, end_vector):
            add_box(asset, "BalustradePier", (point.x, point.y, point.z - 0.36), (0.34, 0.34, 1.02), trim, 0.025)
            add_uv_sphere(asset, "BalustradeFinial", (point.x, point.y, point.z + 0.28), (0.13, 0.13, 0.16), trim, 16, 8)

    balustrade_run((-16.3, -5.84, 13.25), (-7.5, -5.84, 13.25), 14)
    balustrade_run((7.5, -5.84, 13.25), (16.3, -5.84, 13.25), 14)
    balustrade_run((-16.3, 11.84, 13.25), (16.3, 11.84, 13.25), 32)


def add_clock_face(asset, materials, axis: str, coordinate: float, center: tuple[float, float, float], outward: float) -> None:
    trim = materials["Limestone"]
    face = materials["Clock"]
    iron = materials["Iron"]
    x, y, z = center
    if axis == "Y":
        rotation = (math.pi / 2, 0, 0)
        position = (x, coordinate, z)
        add_cylinder(asset, "ClockFace", position, 0.87, 0.08, face, 48, rotation)
        add_torus(asset, "ClockRim", (x, coordinate + outward * 0.06, z), 0.89, 0.085, trim, rotation, 40, 8)
        for index in range(12):
            angle = index / 12 * math.tau
            add_box(
                asset,
                "ClockHourMark",
                (x + math.sin(angle) * 0.66, coordinate + outward * 0.105, z + math.cos(angle) * 0.66),
                (0.065, 0.035, 0.18),
                iron,
                0.008,
            ).rotation_euler.y = angle
        minute = add_box(asset, "ClockMinuteHand", (x, coordinate + outward * 0.125, z + 0.28), (0.07, 0.035, 0.65), iron, 0.012)
        minute.rotation_euler.y = math.radians(-8)
        hour = add_box(asset, "ClockHourHand", (x + 0.17, coordinate + outward * 0.13, z - 0.04), (0.07, 0.035, 0.48), iron, 0.012)
        hour.rotation_euler.y = math.radians(48)
    else:
        rotation = (0, math.pi / 2, 0)
        position = (coordinate, y, z)
        add_cylinder(asset, "ClockFace", position, 0.87, 0.08, face, 48, rotation)
        add_torus(asset, "ClockRim", (coordinate + outward * 0.06, y, z), 0.89, 0.085, trim, rotation, 40, 8)
        for index in range(12):
            angle = index / 12 * math.tau
            mark = add_box(
                asset,
                "ClockHourMark",
                (coordinate + outward * 0.105, y + math.sin(angle) * 0.66, z + math.cos(angle) * 0.66),
                (0.035, 0.065, 0.18),
                iron,
                0.008,
            )
            mark.rotation_euler.x = -angle
        minute = add_box(asset, "ClockMinuteHand", (coordinate + outward * 0.125, y, z + 0.28), (0.035, 0.07, 0.65), iron, 0.012)
        minute.rotation_euler.x = math.radians(8)
        hour = add_box(asset, "ClockHourHand", (coordinate + outward * 0.13, y + 0.17, z - 0.04), (0.035, 0.07, 0.48), iron, 0.012)
        hour.rotation_euler.x = math.radians(-48)


def add_cupola(asset, materials) -> None:
    trim = materials["Limestone"]
    roof = materials["Roof"]
    interior = materials["Interior"]
    copper = materials["Copper"]
    iron = materials["Iron"]
    cx, cy = 0.0, 3.0

    add_box(asset, "CupolaPlinthLower", (cx, cy, 14.38), (5.3, 5.3, 0.42), trim, 0.06)
    add_box(asset, "CupolaPlinthUpper", (cx, cy, 14.75), (4.75, 4.75, 0.34), trim, 0.045)
    add_box(asset, "CupolaBase", (cx, cy, 15.5), (4.25, 4.25, 1.28), trim, 0.045)

    for side in (-1, 1):
        for offset in (-1.25, -0.42, 0.42, 1.25):
            add_box(asset, "CupolaLouver", (offset, cy + side * 2.14, 15.5), (0.54, 0.055, 0.65), interior, 0.018)
            for strip in (-0.22, 0.0, 0.22):
                add_box(asset, "LouverSlat", (offset, cy + side * 2.19, 15.5 + strip), (0.5, 0.04, 0.045), iron)
        for offset in (-1.25, -0.42, 0.42, 1.25):
            add_box(asset, "CupolaLouver", (side * 2.14, cy + offset, 15.5), (0.055, 0.54, 0.65), interior, 0.018)

    add_box(asset, "ClockStage", (cx, cy, 17.08), (3.85, 3.85, 2.0), trim, 0.05)
    for x in (-1.78, 1.78):
        for y in (1.22, 4.78):
            add_box(asset, "CupolaPilaster", (x, y, 17.06), (0.3, 0.3, 2.25), trim, 0.025)
    add_clock_face(asset, materials, "Y", 1.04, (cx, cy, 17.18), -1)
    add_clock_face(asset, materials, "Y", 4.96, (cx, cy, 17.18), 1)
    add_clock_face(asset, materials, "X", -1.96, (cx, cy, 17.18), -1)
    add_clock_face(asset, materials, "X", 1.96, (cx, cy, 17.18), 1)
    add_box(asset, "CupolaCornice", (cx, cy, 18.25), (4.45, 4.45, 0.38), trim, 0.055)
    add_lathe(
        asset,
        "CupolaDome",
        (cx, cy, 18.28),
        ((2.05, 0.0), (2.0, 0.25), (1.78, 0.7), (1.35, 1.15), (0.72, 1.55), (0.22, 1.78), (0.0, 1.83)),
        roof,
        40,
    )
    for index in range(12):
        angle = index / 12 * math.tau
        start = (math.cos(angle) * 1.98, cy + math.sin(angle) * 1.98, 18.43)
        end = (math.cos(angle) * 0.12, cy + math.sin(angle) * 0.12, 20.13)
        add_cylinder_between(asset, "DomeRib", start, end, 0.032, roof, 10)
    add_uv_sphere(asset, "CupolaFinialBall", (cx, cy, 20.38), (0.24, 0.24, 0.24), copper, 20, 10)
    add_cylinder(asset, "CupolaFinialStem", (cx, cy, 20.72), 0.065, 0.55, iron, 12)
    add_lathe(asset, "CupolaFinial", (cx, cy, 20.94), ((0.16, 0.0), (0.08, 0.28), (0.0, 0.52)), copper, 20)


def add_review_environment(review, materials) -> None:
    ground = pbr_material("ReviewGround", (0.29, 0.32, 0.24), 0.94)
    add_box(review, "ReviewGround", (0, 2, -0.18), (90, 90, 0.34), ground, 0.08)

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.23, 0.31, 0.38, 1.0)
    background.inputs["Strength"].default_value = 0.62

    sun_data = bpy.data.lights.new("ReviewSun", "SUN")
    sun_data.energy = 2.8
    sun_data.angle = math.radians(4.0)
    sun = bpy.data.objects.new("ReviewSun", sun_data)
    review.objects.link(sun)
    sun.rotation_euler = (math.radians(34), math.radians(-24), math.radians(-28))

    area_data = bpy.data.lights.new("SkyFill", "AREA")
    area_data.energy = 2600
    area_data.shape = "DISK"
    area_data.size = 18
    area = bpy.data.objects.new("SkyFill", area_data)
    review.objects.link(area)
    area.location = (-20, -22, 30)
    direction = Vector((0, 2, 8)) - area.location
    area.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_package(output_root: Path, review, joined, materials, quick: bool, preview_only: bool = False) -> None:
    review_directory = output_root / "review"
    review_directory.mkdir(parents=True, exist_ok=True)
    width = 960 if quick else 1600
    height = 720 if quick else 1200
    samples = 16 if quick else 24

    cameras = {
        "beauty": add_camera(review, "BeautyCamera", (37, -46, 18), (0, 1.0, 7.5), 56),
        "management": add_camera(review, "ManagementCamera", (46, -52, 48), (0, 2.5, 6.8), 58),
        "front": add_camera(review, "FrontCamera", (0, -70, 9.2), (0, 1.0, 9.2), orthographic_scale=31),
        "side": add_camera(review, "SideCamera", (-60, 3, 9.2), (0, 3, 9.2), orthographic_scale=27),
        "rear": add_camera(review, "RearCamera", (0, 72, 9.2), (0, 3, 9.2), orthographic_scale=31),
        "top": add_camera(review, "TopCamera", (0, 3, 65), (0, 3, 0), orthographic_scale=40),
        "portico": add_camera(review, "PorticoDetailCamera", (12, -23, 11), (1.4, -6.6, 8.0), 68),
        "cupola": add_camera(review, "CupolaDetailCamera", (16, -15, 21), (0, 3, 17.4), 78),
        "window": add_camera(review, "WindowDetailCamera", (20, -17, 8.5), (11, -5.3, 7.3), 82),
    }
    beauty_width = 960 if quick else 2048
    beauty_height = 720 if quick else 1536
    render(
        cameras["beauty"],
        review_directory / "beauty.png",
        beauty_width,
        beauty_height,
        samples=samples,
    )
    if preview_only:
        return
    render(cameras["management"], review_directory / "management-distance.png", width, height, samples=samples)
    for name in ("front", "side", "rear", "top"):
        render(cameras[name], review_directory / f"orthographic-{name}.png", width, height, samples=samples)
    for name in ("portico", "cupola", "window"):
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
        modifier.thickness = 0.012
        modifier.use_even_offset = True
        modifier.use_replace = True
        obj.hide_render = True
        wire_copies.append(duplicate)
    render(cameras["beauty"], review_directory / "wireframe.png", width, height, samples=samples)
    for obj in joined:
        obj.hide_render = False
    for duplicate in wire_copies:
        bpy.data.objects.remove(duplicate, do_unlink=True)

    thumbnail_size = 480 if quick else 768
    render(
        cameras["beauty"],
        review_directory / "thumbnail.webp",
        thumbnail_size,
        thumbnail_size,
        samples=samples,
        file_format="WEBP",
    )


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

| Portico | Cupola | Window depth |
| --- | --- | --- |
| ![Portico](review/detail-portico.png) | ![Cupola](review/detail-cupola.png) | ![Window](review/detail-window.png) |

## Wireframe and audit

![Wireframe](review/wireframe.png)

- Bounds: `{stats['boundsMetresBlender']['dimensions']}` m in Blender X/Y/Z.
- Triangles: `{stats['triangles']:,}` / 180,000 review threshold.
- Draw calls: `{stats['drawCalls']}` / 15 review threshold.
- Materials: `{', '.join(stats['materials'])}`.
- Ground aligned: `{stats['groundAligned']}`.
- Invalid numeric values: `{len(stats['invalidValues'])}`.
- GLB size: `{stats['glbBytes'] / 1_000_000:.2f} MB` / approximately 25 MB review threshold.

The candidate has not been added to the runtime catalogue. Final approval authorizes that integration and unlocks concept work on the Porch Residence.
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
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.look = "AgX - Medium High Contrast"

    asset = collection("Asset")
    review_collection = collection("Review")
    root = bpy.data.objects.new("CivicHall", None)
    asset.objects.link(root)
    root["assetId"] = ASSET_ID
    root["assetName"] = ASSET_NAME
    root["facadeAxis"] = "+Z in Three.js / -Y in Blender"

    materials = make_materials(texture_directory, args.quick)
    add_foundation_and_body(asset, materials)
    add_stairs_and_portico(asset, materials)
    add_cornice_roof_and_balustrade(asset, materials)
    add_cupola(asset, materials)

    joined = join_by_material(asset, root)
    smart_uv(joined)
    for obj in joined:
        obj["assetId"] = ASSET_ID
        obj.visible_shadow = True

    add_review_environment(review_collection, materials)
    if not args.skip_renders:
        render_package(output_root, review_collection, joined, materials, args.quick, args.preview_only)

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
