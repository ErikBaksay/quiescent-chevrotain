#!/usr/bin/env python3
"""Build the compact terrain material atlases from project-owned source images."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


SURFACE_IDS = [
    "meadow-grass",
    "short-mown-grass",
    "dry-meadow-grass",
    "mossy-ground",
    "leaf-litter",
    "dark-loam",
    "red-clay",
    "muddy-earth",
    "pale-sand",
    "beach-sand",
    "river-sand",
    "fine-gravel",
    "river-pebbles",
    "crushed-limestone",
    "slate-chips",
    "exposed-rock",
    "granite-slabs",
    "cobblestone",
    "brick-pavers",
    "concrete",
    "asphalt",
    "worn-asphalt",
    "gravel-shoulder",
    "shallow-water",
]

ROUGHNESS = {
    "meadow-grass": 0.96,
    "short-mown-grass": 0.92,
    "dry-meadow-grass": 0.94,
    "mossy-ground": 0.9,
    "leaf-litter": 0.86,
    "dark-loam": 0.98,
    "red-clay": 0.93,
    "muddy-earth": 0.72,
    "pale-sand": 0.9,
    "beach-sand": 0.82,
    "river-sand": 0.8,
    "fine-gravel": 0.88,
    "river-pebbles": 0.58,
    "crushed-limestone": 0.9,
    "slate-chips": 0.64,
    "exposed-rock": 0.62,
    "granite-slabs": 0.52,
    "cobblestone": 0.66,
    "brick-pavers": 0.8,
    "concrete": 0.82,
    "asphalt": 0.9,
    "worn-asphalt": 0.86,
    "gravel-shoulder": 0.9,
    "shallow-water": 0.18,
}


def clamp(value: float) -> int:
    return max(0, min(255, round(value)))


def normal_map(image: Image.Image, strength: float = 4.0) -> Image.Image:
    gray = image.convert("L")
    pixels = gray.load()
    width, height = gray.size
    output = Image.new("RGB", gray.size)
    target = output.load()

    for y in range(height):
        for x in range(width):
            left = pixels[(x - 1) % width, y]
            right = pixels[(x + 1) % width, y]
            up = pixels[x, (y - 1) % height]
            down = pixels[x, (y + 1) % height]
            dx = (right - left) / 255.0 * strength
            dy = (down - up) / 255.0 * strength
            nx, ny, nz = -dx, -dy, 1.0
            length = (nx * nx + ny * ny + nz * nz) ** 0.5
            target[x, y] = (
                clamp((nx / length * 0.5 + 0.5) * 255),
                clamp((ny / length * 0.5 + 0.5) * 255),
                clamp((nz / length * 0.5 + 0.5) * 255),
            )
    return output


def roughness_map(image: Image.Image, surface_id: str) -> Image.Image:
    gray = image.convert("L")
    base = ROUGHNESS[surface_id] * 255
    pixels = gray.load()
    result = Image.new("L", gray.size)
    target = result.load()
    for y in range(gray.height):
        for x in range(gray.width):
            variation = (pixels[x, y] - 128) * 0.14
            target[x, y] = clamp(base + variation)
    return result


def make_atlas(source_dir: Path, output_dir: Path, tile_size: int) -> None:
    columns = 6
    rows = 4
    atlas_size = (columns * tile_size, rows * tile_size)
    atlases = {
        "albedo": Image.new("RGB", atlas_size),
        "normal": Image.new("RGB", atlas_size),
        "roughness": Image.new("L", atlas_size),
        "ao": Image.new("L", atlas_size),
    }

    for index, surface_id in enumerate(SURFACE_IDS):
        source_path = source_dir / f"{surface_id}.png"
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        source = Image.open(source_path).convert("RGB")
        source = ImageOps.fit(source, (tile_size, tile_size), method=Image.Resampling.LANCZOS)
        source = ImageEnhance.Color(source).enhance(0.92)
        source = ImageEnhance.Contrast(source).enhance(1.06)
        x = (index % columns) * tile_size
        y = (index // columns) * tile_size
        atlases["albedo"].paste(source, (x, y))
        atlases["normal"].paste(normal_map(source), (x, y))
        atlases["roughness"].paste(roughness_map(source, surface_id), (x, y))
        ao = ImageOps.autocontrast(source.convert("L").filter(ImageFilter.GaussianBlur(1.5)))
        atlases["ao"].paste(ao, (x, y))

    output_dir.mkdir(parents=True, exist_ok=True)
    atlases["albedo"].save(output_dir / "terrain-albedo-atlas.webp", "WEBP", quality=88, method=6)
    atlases["normal"].save(output_dir / "terrain-normal-atlas.webp", "WEBP", quality=92, method=6)
    atlases["roughness"].save(output_dir / "terrain-roughness-atlas.webp", "WEBP", quality=92, method=6)
    atlases["ao"].save(output_dir / "terrain-ao-atlas.webp", "WEBP", quality=92, method=6)
    atlases["albedo"].resize((columns * 64, rows * 64), Image.Resampling.LANCZOS).save(
        output_dir / "terrain-swatches.webp", "WEBP", quality=86, method=6
    )
    (output_dir / "terrain-atlas.json").write_text(
        json.dumps(
            {
                "tileSize": tile_size,
                "columns": columns,
                "rows": rows,
                "surfaces": [
                    {"id": surface_id, "index": index}
                    for index, surface_id in enumerate(SURFACE_IDS)
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--tile-size", type=int, default=256)
    args = parser.parse_args()
    make_atlas(args.source_dir, args.output_dir, args.tile_size)


if __name__ == "__main__":
    main()
