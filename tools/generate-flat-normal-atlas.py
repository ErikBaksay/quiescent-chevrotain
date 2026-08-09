"""Create a flat normal atlas that reuses the color atlas alpha."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def generate(color_path: Path, output_path: Path) -> None:
    color = Image.open(color_path).convert("RGBA")
    normal = Image.new("RGBA", color.size, (128, 164, 255, 255))
    normal.putalpha(color.getchannel("A"))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    normal.save(output_path, format="PNG", optimize=True)
    print(f"Wrote {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("color", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    generate(args.color, args.output)


if __name__ == "__main__":
    main()
