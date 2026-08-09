"""Normalize a chroma-removed 4x3 foliage plate into a tight alpha atlas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def prepare(
    input_path: Path,
    output_path: Path,
    tile_size: int = 384,
    rows: int = 3,
    tile_height: int | None = None,
) -> None:
    source = Image.open(input_path).convert("RGBA")
    columns = 4
    output_tile_height = tile_height or tile_size
    tile_width = source.width // columns
    source_tile_height = source.height // rows
    atlas = Image.new(
        "RGBA", (columns * tile_size, rows * output_tile_height), (0, 0, 0, 0)
    )

    for row in range(rows):
        for column in range(columns):
            tile = source.crop(
                (
                    column * tile_width,
                    row * source_tile_height,
                    (column + 1) * tile_width,
                    (row + 1) * source_tile_height,
                )
            )
            seam = max(2, round(min(tile.width, tile.height) * 0.025))
            tile = tile.crop((seam, seam, tile.width - seam, tile.height - seam))
            alpha = tile.getchannel("A")
            bounds = alpha.getbbox()
            if bounds is None:
                raise ValueError(f"Tile {column},{row} contains no opaque content")

            content = tile.crop(bounds)
            target_width = int(tile_size * 0.9)
            target_height = int(output_tile_height * 0.9)
            scale = min(target_width / content.width, target_height / content.height)
            resized = content.resize(
                (max(1, round(content.width * scale)), max(1, round(content.height * scale))),
                Image.Resampling.LANCZOS,
            )
            x = column * tile_size + (tile_size - resized.width) // 2
            y = row * output_tile_height + (output_tile_height - resized.height) // 2
            atlas.alpha_composite(resized, (x, y))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output_path, format="PNG", optimize=True)
    print(f"Wrote {output_path} ({atlas.width}x{atlas.height})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--tile-size", type=int, default=384)
    parser.add_argument("--rows", type=int, default=3)
    parser.add_argument("--tile-height", type=int)
    args = parser.parse_args()
    prepare(args.input, args.output, args.tile_size, args.rows, args.tile_height)


if __name__ == "__main__":
    main()
