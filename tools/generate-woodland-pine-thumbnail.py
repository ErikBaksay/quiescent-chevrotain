"""Build a catalogue thumbnail from the generated runtime impostor atlas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("atlas", type=Path)
    parser.add_argument("output", type=Path)
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    atlas = Image.open(arguments.atlas).convert("RGBA")
    tile = atlas.crop((0, 0, atlas.width // 4, atlas.height // 2))
    tree_height = 492
    tree_width = round(tile.width / tile.height * tree_height)
    tree = tile.resize((tree_width, tree_height), Image.Resampling.LANCZOS)
    thumbnail = Image.new("RGBA", (512, 512), (185, 182, 174, 255))
    thumbnail.alpha_composite(tree, ((512 - tree_width) // 2, 10))
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    thumbnail.convert("RGB").save(arguments.output, "WEBP", quality=92, method=6)


if __name__ == "__main__":
    main()
