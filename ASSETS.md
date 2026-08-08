# Asset authoring standard

Stage 3 assets are original, exterior-focused environment pieces authored for Quiescent Chevrotain. The Blender Python scripts under `tools/blender/` are the durable source. Local `.blend` derivations belong under `.artifacts/blender/` and are ignored by Git.

## Coordinate contract

- One Blender and Three.js unit represents approximately one metre.
- Use a right-handed, Y-up runtime coordinate system.
- Place the asset origin at the bottom-centre of its ground contact area.
- The principal facade faces local `+Z` in Three.js.
- Apply object rotation and scale before export. Runtime roots begin at rotation `(0, 0, 0)` and scale `(1, 1, 1)` before `defaultScale` is applied.
- Geometry may not extend below the intended ground plane except for deliberately documented foundation or root details.

## Runtime package

Each approved asset has a self-contained folder under `public/assets/models/<asset-id>/`:

```text
<asset-id>/
├── asset.json
├── model.glb
└── thumbnail.webp
```

`public/assets/catalog.json` contains relative paths to the manifests. Model and thumbnail paths are relative to their own `asset.json`, never to the site root, so deployment beneath a GitHub Pages base path remains valid.

An asset manifest follows this initial contract:

```ts
interface AssetDefinition {
  id: string;
  name: string;
  category: 'civic' | 'residential' | 'commercial' | 'nature' | 'street-furniture';
  model: string;
  thumbnail: string;
  defaultScale: number;
}
```

Legacy manifests omit `renderMode` and resolve as ordinary object assets. Instanced vegetation uses `renderMode: "vegetation"`, remains in the `nature` category, and adds positive radius/height bounds plus one or more variants. Each variant names its LOD0 meshes, LOD1 meshes, eight-view impostor mesh, and shadow-proxy mesh inside the GLB. Paths retain the same safe package-relative rules as ordinary assets.

Vegetation export names are stable runtime interfaces. A variant named `Courtyard` uses names such as `Courtyard_LOD0_Trunk`, `Courtyard_LOD0_Foliage`, `Courtyard_LOD1_Trunk`, `Courtyard_LOD1_Foliage`, `Courtyard_Impostor`, and `Courtyard_ShadowProxy`.

IDs and folder names use lowercase kebab case. Paths must be relative, use forward slashes, and remain inside the asset's folder. `defaultScale` must be positive.

## Scene and naming conventions

- Export one asset root named for the asset in PascalCase, for example `NeoclassicalCourthouse`.
- Name meshes by function and location, such as `Walls_Main`, `Trim_Portico`, or `Roof_Cupola`.
- Use the shared material vocabulary where applicable: `Walls`, `Trim`, `Roof`, `Door`, `WindowGlass`, `Metal`, and `Wood`.
- Suffix genuine variants only when their shader inputs differ, for example `Metal_Copper` and `Metal_Iron`.
- Do not export cameras, lights, hidden reference geometry, unsupported constraints, or unused materials.
- Keep glass in a separate material and use the least expensive transparency mode that preserves the approved appearance.

## Geometry and shading

- Model the silhouette and important construction details: columns, capitals, mouldings, sills, cornices, railings, gutters, doors, shutters, steps, roof edges, and visible hardware.
- Bake smaller relief and surface variation into PBR textures.
- Use small, consistent bevels and weighted/custom normals so exposed edges react naturally to light.
- Prefer purposeful topology and instancing over invisible or microscopic geometry.
- Buildings remain exterior-only. Window depth is created with glazing, restrained curtains, and shallow dark interior cards.
- Meshes intended to meet the ground must pass the ground-alignment audit after export.

## Materials and textures

- Use glTF-compatible metallic/roughness PBR materials.
- Supply base colour, normal, and packed occlusion/roughness/metallic data where the material needs them.
- Use 2K maps by default. A single 4K hero atlas is permitted for the courthouse only when its final review demonstrates a visible benefit.
- Use lossless source textures during authoring and embed runtime-ready textures in the GLB.
- Keep texel density visually consistent across the collection and leave adequate UV padding for mipmaps.
- Patina must read as maintained age: subtle wear, oxidation, rain marks, and material variation, never generalized dirt or abandonment.

## Review thresholds

These are review thresholds, not automatic reasons to reduce approved visual quality:

| Asset class    | Triangles | Draw calls | Approximate GLB size |
| -------------- | --------: | ---------: | -------------------: |
| Courthouse     |   180,000 |         15 |                25 MB |
| Other building |   120,000 |         12 |                25 MB |
| Tree           |    80,000 |          8 |                15 MB |
| Street prop    |    30,000 |          5 |                 5 MB |

Any exception must be explained in the asset's final review notes with the visible reason for retaining it.

## Approval and export checklist

1. Approve the concept sheet before modeling starts.
2. Generate the model reproducibly from its Blender Python entry point.
3. Audit dimensions, origin, ground alignment, transforms, material names, triangles, draw calls, file size, NaNs, and accidental cameras or lights.
4. Validate the final GLB with the official Khronos glTF Validator.
5. Render the beauty image, four-view sheet, close-up sheet, wireframe/statistics sheet, catalogue thumbnail, and close/management-distance in-game screenshots.
6. Approve the final package before adding the asset to the runtime catalogue or beginning the next asset.
