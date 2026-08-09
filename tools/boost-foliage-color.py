"""Brighten and enrich a foliage or impostor atlas without changing alpha."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageEnhance


def boost(input_path: Path, output_path: Path, brightness: float, saturation: float) -> None:
    source = Image.open(input_path).convert("RGBA")
    alpha = source.getchannel("A")
    rgb = source.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(saturation)
    rgb = ImageEnhance.Brightness(rgb).enhance(brightness)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.06)
    rgb.putalpha(alpha)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rgb.save(output_path, format="PNG", optimize=True)
    print(f"Wrote {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--brightness", type=float, default=1.18)
    parser.add_argument("--saturation", type=float, default=1.2)
    args = parser.parse_args()
    boost(args.input, args.output, args.brightness, args.saturation)


if __name__ == "__main__":
    main()
