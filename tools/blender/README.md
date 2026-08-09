# Blender asset scripts

Each approved Stage 3 asset receives a self-contained Blender Python entry point in this directory. Scripts must create their scene from a clean Blender file, apply the conventions in `ASSETS.md`, render the review package, and export the runtime GLB without relying on workstation-specific paths.

No asset script is added before its concept is approved. Generated `.blend` files and intermediate bakes go under `.artifacts/blender/<asset-id>/`.

The intended portable command shape is:

```sh
/path/to/blender --background --factory-startup --python tools/blender/<asset-id>.py -- --output-root .artifacts/blender/<asset-id>
```

The exact Blender 4.5 LTS executable path will be supplied at invocation time rather than stored in project files.

The approved Mature Broadleaf Tree is generated with:

```sh
/path/to/blender --background --factory-startup --python tools/blender/mature_broadleaf_tree.py -- --output-root .artifacts/blender/mature-broadleaf-tree
```

Its script writes three variants, two geometry LODs, eight-view color/normal impostor atlases, shadow proxies, review renders, a GLB, an audit, and a candidate manifest. The checked-in runtime package preserves the existing IDs and mesh-name contract while using the refreshed dense foliage sources.

The approved Woodland Pine is generated with:

```sh
/path/to/blender --background --factory-startup --python tools/blender/woodland_pine.py -- --output-root .artifacts/blender/woodland-pine
```

It writes Upright, Open Crown, and Asymmetric variants with two geometry LODs,
eight-view color/normal impostor atlases, shadow proxies, review renders, a GLB,
an audit, and a candidate manifest.

When Blender is unavailable, the deterministic local generators are artifact-only
by default. `npm run assets:generate:mature-broadleaf:runtime` and
`npm run assets:generate:woodland-pine:runtime` are emergency development
fallbacks that preserve the same manifest and mesh-name contracts; they are not
the canonical authoring source. Final production review and export remain the
Blender 4.5 LTS commands above. The vegetation audit can be run with
`npm run assets:audit:vegetation`.
