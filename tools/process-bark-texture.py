"""Convert a gray bark plate into a warm, game-ready diffuse texture."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def process(input_path: Path, output_path: Path) -> None:
    source = Image.open(input_path).convert("RGBA")
    pixels = []
    for red, green, blue, alpha in source.getdata():
        luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255.0
        pixels.append(
            (
                round((0.08 + luminance * 0.72) * 255),
                round((0.04 + luminance * 0.42) * 255),
                round((0.018 + luminance * 0.22) * 255),
                alpha,
            )
        )
    source.putdata(pixels)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    source.save(output_path, format="PNG", optimize=True)
    print(f"Wrote {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    process(args.input, args.output)


if __name__ == "__main__":
    main()
