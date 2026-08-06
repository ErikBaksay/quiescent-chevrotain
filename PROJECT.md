# Quiescent Chevrotain — Project Guide

This document is the long-term source of truth for the project. Update it when a development decision materially changes the game's direction, constraints, architecture, or roadmap.

## Vision

Quiescent Chevrotain is a relaxing, realistic-to-semi-realistic 3D creative world-building game. It should make it pleasant to create properties, villages, towns, and eventually large cities from a continually growing library of custom assets.

The core loop is intentionally simple:

> build → decorate → landscape → admire → continue building

The experience takes inspiration from the building and decorating in Planet Zoo, Planet Coaster, The Sims, Cities: Skylines, Minecraft, and Tiny Glade. It is not initially a management or simulation game.

## Product principles

- Prioritize creative freedom, manual control, pleasant editing, attractive environments, and easy asset expansion.
- Prefer visual manipulation over CAD-like precision, while allowing optional accuracy helpers.
- Avoid artificial placement restrictions. Intentional overlap is valid.
- Add procedural tools only when they save repetitive clicks; manual placement must remain available and generated content should remain editable.
- Build incrementally. Prove each interaction before adding breadth.
- Aim for large-world compatibility without prematurely building a complicated streaming engine.

## Explicit non-goals

The initial game does not require an economy, citizens, traffic, population, jobs, resource management, objectives, achievements, multiplayer, combat, interiors, building physics, realistic water physics, accounts, or server persistence.

Buildings are primarily finished GLB/glTF assets. Sims-style construction, Tiny-Glade-style procedural architecture, reusable blueprint libraries, infinite terrain, and user-expandable maps are not planned for the initial product.

First-person exploration may be considered later but is outside the initial development scope.

## Technology and delivery

- **Application:** Angular, Three.js, TypeScript, and SCSS.
- **Platform:** Browser first, desktop-oriented editor controls initially.
- **Hosting:** Static output suitable for GitHub Pages; no Node server at runtime.
- **Persistence:** Browser-local storage, with IndexedDB preferred as worlds grow.
- **Portability:** Explicit world export/import will eventually complement local saves.
- **PWA:** Optional later enhancement, not a foundation requirement.

Angular owns the application shell, menus, toolbar, asset browser, settings, panels, and UI state. Three.js owns rendering, the scene, camera, terrain, world objects, raycasting, placement, transforms, and environment. Three.js scene objects should not become Angular components.

## World and scale

One Three.js world unit represents approximately one metre. Visual realism is more important than CAD-level accuracy.

The world is finite. The initial configuration targets a 2 km × 2 km map, but dimensions belong in centralized world configuration rather than being repeated throughout the application. Infinite terrain and runtime map expansion are not goals.

Important systems should leave room for future spatial partitioning, internal chunks, culling, instancing, LODs, optimized vegetation, shared GLTF resources, bounded shadow distance, and efficient scene queries. These are compatibility concerns, not current implementation requirements.

## Visual direction

The target is warm, believable realism or semi-realism—not a low-poly style and not a rendering technology demonstration. Priorities include attractive lighting, useful shadows, pleasant materials, vegetation, atmospheric depth, a good sky, and subtle fog.

Potential environment presets are Sunny, Overcast, Golden Hour, Foggy, and Night. Stage 1 establishes a warm sunny baseline; a preset system can wait until presentation work warrants it.

## Camera and controls

The primary camera should resemble a polished creative or management game camera and support comfortable angled and near-top-down building views.

Camera controls:

- Primary-button drag: orbit
- Secondary-button drag: pan
- Middle-button drag or wheel: zoom
- Touch: one-finger orbit, two-finger pan/zoom

Stage 2 editing shortcuts:

- `G`: move
- `R`: rotate
- `Delete`: delete
- `Escape`: leave the active tool, then deselect

Planned editing shortcuts:

- `S`: scale
- `Ctrl/Cmd + D`: duplicate
- `Ctrl/Cmd + Z`: undo
- `Ctrl/Cmd + Y` or `Shift + Ctrl/Cmd + Z`: redo

Selection should eventually enable move, rotate, scale, duplicate, delete, and exposed material customization. Multi-selection can come later.

## Asset model and pipeline

Most content should use one generic placeable-asset system. Houses, apartments, garages, churches, shops, warehouses, vegetation, rocks, benches, lights, cars, signs, fences, and decorations should differ mainly through data and model content rather than engine-specific classes.

GLB/glTF is the preferred model format. A likely asset folder is:

```text
public/assets/models/house-01/
  model.glb
  asset.json
  thumbnail.webp
```

The exact manifest will evolve from real needs. An initial definition may contain only an ID, display name, category, model path, thumbnail path, and default scale. Adding a prepared asset should require little or no core engine modification.

Expected top-level catalogue areas include Buildings, Nature, Vehicles, Street, Fences, Infrastructure, Decoration, and Miscellaneous, with nested categories where useful.

### Material customization

Asset metadata will eventually identify named model materials that the player may edit. A house could expose walls, roof, frames, and door; a car could expose its body. Other materials remain untouched. World data stores overrides separately from shared source assets so cached geometry and materials can be reused safely.

## Placement and editing

Placement is deliberately permissive. Ground, grid, and rotation snapping are optional helpers, not collision rules. Free rotation, movement, scale, duplicate, and delete are fundamental. Numerical position, rotation, and scale fields can later complement direct manipulation.

The Stage 2 interaction proof uses a one-shot prototype cube workflow before real assets. A terrain marker identifies the placement point; the placed cube is automatically selected and can be freely moved or rotated with TransformControls. Selection is single-object and placement remains permissive.

## Terrain, surfaces, roads, and water

Terrain is a major creative system. Planned sculpt tools are Raise, Lower, Smooth, and Flatten with brush size, strength, and falloff. Set Height, Slope, and Noise are optional future tools.

Surface painting should grow to cover grass, dirt, gravel, asphalt, sand, rock, and water. In the first terrain version, asphalt painting is sufficient for roads. A road network is not required; spline-based visual roads, curbs, sidewalks, and markings are later possibilities and still need no traffic simulation.

Water begins as a visual surface or painting treatment. Lakes, rivers, animation, reflections, and shoreline blending may follow, but water physics should not block useful creative tools.

## Procedural helpers

Later tools may include vegetation scatter with randomized variants, rotation, scale, and density; line/spline tools for fences and hedges; and streetlight distribution along a line or future road. Their purpose is acceleration, not automation that removes manual control.

## Persistence and logical world data

Do not serialize Three.js object graphs. Save logical data and reconstruct render objects from asset definitions.

```json
{
  "version": 1,
  "objects": [
    {
      "assetId": "house-01",
      "position": [12, 0, 48],
      "rotation": [0, 1.2, 0],
      "scale": [1, 1, 1],
      "materialOverrides": {}
    }
  ]
}
```

Versioning belongs in the save envelope from the first persistence implementation so migrations remain possible. Terrain and surface data will need a compact representation designed when those systems exist.

## Architecture direction

Keep core editor systems modular and strongly typed without creating abstractions solely for future possibilities. Likely responsibilities include:

- `SceneSystem`: scene ownership and shared scene concerns
- `CameraSystem`: camera and navigation controls
- `WorldSystem`: finite-world root and configuration
- `TerrainSystem`, `TerrainPaintSystem`, `TerrainSculptSystem`
- `EnvironmentSystem`: sky, fog, lighting, and presets
- `AssetManager`: definitions, loading, caching, and instantiation
- `PlacementSystem`, `SelectionSystem`, `TransformSystem`
- `MaterialCustomizationSystem`
- `UndoRedoSystem`
- `SaveSystem`

Stage 1 uses only the systems justified by its scope: a small engine coordinator, camera navigation, environment, world terrain, and an Angular viewport boundary. Systems should communicate through narrow APIs and logical data rather than reaching through each other's internals.

Development should favor understandable, sensibly scoped files, strict TypeScript, explicit cleanup, and documented non-obvious decisions. Avoid god services, speculative frameworks, and hidden coupling.

## Performance direction

The initial scene should remain simple. As object counts become meaningful, measure before choosing optimizations. Expected tools include shared GLTF geometry/materials, `InstancedMesh` for repeated simple assets, LODs, frustum/distance culling, bounded shadow coverage, vegetation-specific strategies, and spatial indexes for editor queries.

The finite 2 km map may be internally partitioned later even though it presents as one continuous world. Chunking must not leak into asset authoring or player workflows unnecessarily.

## Incremental roadmap

### Stage 1 — Foundation (complete)

- Angular application and clean project structure
- Responsive Three.js canvas and render lifecycle
- Orbit, pan, and zoom camera
- Finite flat grassy terrain
- Pleasant lighting, sky, fog, and basic shadows
- Documentation and validation scripts

Completion means a stable, attractive, interactive empty world. No editor interactions are included.

### Stage 2 — Placement proof (current, complete)

- Raycast onto terrain and show a placement point
- Place and select a primitive cube
- Move, rotate, and delete the selected cube

Completion means the primitive place/select/transform/delete loop is stable without introducing the asset catalogue or persistence concerns.

### Stage 3 — Real asset system (next)

- GLB loading, generic definitions, and catalogue
- Placement ghost and a small sample library
- Duplicate, scale, and optional snapping

### Stage 4 — Editor robustness

- Undo/redo and improved selection
- IndexedDB save/load plus explicit export/import
- Properties panel and material customization

### Stage 5 — Terrain

- Grass, dirt, gravel, asphalt, water, and other surface painting
- Basic interactive sculpting

### Stage 6 — Presentation

- Lighting, shadows, atmosphere, vegetation presentation, UI, and control polish

### Stage 7 and later

- Vegetation scatter and repetition tools
- Instancing and measured large-world optimization
- Spline-based visual roads and fences
- Advanced terrain and environment presets
- Optional first-person exploration

## MVP

The first meaningful playable target is a beautiful grassy 3D world where the player can choose several believable houses, trees, bushes, cars, and decorations; freely place and transform them; customize exposed colors; sculpt terrain; paint surfaces including simple roads and water; and save/load locally.

The MVP is a sequence of stable stages, not a mandate to build all features at once.
