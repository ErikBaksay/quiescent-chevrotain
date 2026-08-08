# Instanced vegetation

Vegetation remains logically individual but is rendered in shared GPU batches. Buildings continue through the ordinary `Object3D` asset path.

## Runtime contract

- `renderMode: "vegetation"` selects the vegetation renderer.
- Each manifest declares stable variant IDs, LOD0/LOD1 mesh names, an eight-view impostor mesh, a shadow-proxy mesh, and conservative selection bounds.
- Tree records retain ID, asset, variant, transform, and foliage tint. A 100 m spatial grid supplies distance/frustum candidates.
- Only the selected tree receives a temporary scene-graph proxy for `TransformControls`; committing a transform updates the logical record and its next instance batch.
- Near foliage uses alpha clipping and depth writing. Performance and High settle on simplified LOD1 trees at long range instead of removing them; Ultra keeps LOD0 geometry at every visible distance. Distant detailed trees use non-shadow-casting batches, while mid-distance LOD1 trees can use colorless instanced shadow proxies.

## Quality profiles

| Profile     | Pixel ratio cap | LOD0 range | Terminal representation | Detailed / proxy shadows |
| ----------- | --------------: | ---------: | ----------------------- | -----------------------: |
| Performance |             1.0 |       22 m | LOD1, never culled      |               30 / 110 m |
| High        |             1.5 |       40 m | LOD1, never culled      |               55 / 180 m |
| Ultra       |             2.0 |  Unlimited | LOD0, never culled      |               90 / 300 m |

Ultra is the default. The player-facing selector persists its value under the versioned `quiescent-chevrotain.vegetation-quality-v3` key; no unreliable GPU-name auto-detection is used.

## Performance verification

`createVegetationBenchmarkLayout()` produces the stable 10,000-tree distribution used for browser profiling, with its first 3,000 trees concentrated within 340 m. The formal Performance-mode gate is a 60 FPS median at 1080p on Intel Iris Xe after warm-up, with 1% lows of at least 50 FPS and stable memory. Hardware results must record browser, GPU/driver, resolution, pixel ratio, duration, median, 1% low, and peak renderer memory.

The deterministic layout is implemented and unit-tested. Formal Iris Xe numbers require running the approved runtime asset on that physical hardware; they cannot be inferred from unit tests or Blender statistics.
