# Terrain surface materials

The editor ships a project-owned 24-material terrain palette. The runtime atlases live in
`public/assets/textures/terrain/` and are sampled by the tiled terrain material.

## Authorship and processing

The source images were generated specifically for this project with the built-in image
generation workflow using evenly lit, top-down, tileable material prompts. No third-party
texture library or downloaded reference image is used.

`tools/generate-terrain-atlas.py` downsamples the sources, builds a six-by-four atlas, derives
height-based tangent normals, and produces roughness, ambient-occlusion, and UI swatch atlases.
The runtime keeps the compact processed atlases rather than loading 24 independent texture sets.

## Runtime files

- `terrain-albedo-atlas.webp`
- `terrain-normal-atlas.webp`
- `terrain-roughness-atlas.webp`
- `terrain-ao-atlas.webp`
- `terrain-swatches.webp`
- `terrain-atlas.json`

The atlas index order is the stable order in `src/app/game/world/terrain-surface.types.ts`.
Surface painting stores four normalized material layers per terrain sample and updates only the
affected terrain tiles.
