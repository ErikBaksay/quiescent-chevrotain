# Blender asset scripts

Each approved Stage 3 asset receives a self-contained Blender Python entry point in this directory. Scripts must create their scene from a clean Blender file, apply the conventions in `ASSETS.md`, render the review package, and export the runtime GLB without relying on workstation-specific paths.

No asset script is added before its concept is approved. Generated `.blend` files and intermediate bakes go under `.artifacts/blender/<asset-id>/`.

The intended portable command shape is:

```sh
/path/to/blender --background --factory-startup --python tools/blender/<asset-id>.py -- --output-root .artifacts/blender/<asset-id>
```

The exact Blender 4.5 LTS executable path will be supplied at invocation time rather than stored in project files.
