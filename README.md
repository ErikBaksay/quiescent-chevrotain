# Quiescent Chevrotain

Quiescent Chevrotain is a relaxing, browser-first 3D world builder focused on free-form building, decorating, landscaping, and enjoying the result.

The project is implementing **Stage 3: Asset Catalogue and Real Asset System**. It now has a data-driven GLB catalogue, continuous placement ghosts, cached instances, full transforms, duplication, optional snapping, and selectable building appearances. The approved runtime collection currently includes Civic Hall, Porch Residence, Mature Broadleaf Tree, Woodland Pine, and Narrow-front Residence Set.

## Stack

- Angular 21
- Three.js
- TypeScript
- SCSS
- Vitest

There is no runtime backend. The game is intended to remain statically hostable, including on GitHub Pages, with browser-local persistence and portable JSON saves.

## Requirements

- Node.js 20.19+, 22.12+, or 24+
- npm 8+
- A browser with WebGL support

## Get started

```bash
npm install
npm start
```

Open `http://localhost:4200`.

## Controls

- `W`, `A`, `S`, `D` or arrow keys: move camera
- Middle-button drag: orbit camera
- Secondary-button drag: pan camera
- Wheel: zoom camera
- Select an asset card, then click the terrain: place instances continuously
- Appearance selectors: choose a shape and palette before placing variant-enabled buildings
- `G`: move the selected asset
- `R`: rotate the selected asset
- `Shift + S`: scale the selected asset
- `Ctrl/Cmd + D`: duplicate the selected asset with a 2 m X/Z offset
- `Delete` or `Backspace`: delete the selected asset
- `Escape`: cancel placement or the active transform tool, then deselect
- Terrain tools: Raise, Lower, Smooth, and Flatten with left-drag sculpting
- Terrain brush controls: size, strength, and falloff; `Ctrl/Cmd + Z` and `Ctrl/Cmd + Y` undo or redo terrain strokes
- Surface painting: choose from 24 grass, earth, sand, gravel, stone, paving, asphalt, and shallow-water materials, then paint with a soft brush
- Toolbar toggles: optional 1 m placement/movement grid and 15° rotation snapping
- Time of day: open the top-right time control to scrub from midnight to midnight, pause the clock, or choose 0.25×, 1×, and 4× playback; the world transitions through blue hour, dramatic sunrise, golden hour, sunset, and moonlit night
- Saves: automatic local saving/restoration plus JSON `.qcsave` export and import

## Commands

```bash
npm start        # Run the development server
npm run build    # Create a production build in dist/
npm run build:pages # Build with the GitHub Pages repository base path
npm test         # Run unit tests
npm run assets:validate # Validate the catalogue, manifests, GLB headers, and thumbnails
npm run assets:audit:vegetation # Audit vegetation density, materials, atlases, and bounds
npm run format   # Format source and documentation
npm run format:check
```

## Contribution workflow

When staged changes are reviewed for handoff, include a concise suggested commit message. Do not
create the commit unless it is explicitly requested.

## Project structure

```text
src/app/
  assets/         # Catalogue contracts and base-path-safe manifest loading
  asset-browser/  # Angular catalogue browser
  game/
    assets/       # Cached GLB loading, cloning, and disposal
    editor/      # Placement, selection, transform, and input systems
    engine/      # Three.js lifecycle, camera, and environment systems
    viewport/    # Angular-to-Three.js canvas boundary
    world/       # World configuration and terrain
  app.*          # Angular application shell
public/assets/   # Static catalogue and self-contained runtime asset folders
tools/blender/   # Reproducible Blender asset generators
ASSETS.md        # Asset authoring and export contract
PROJECT.md       # Long-term product and architecture source of truth
```

See [PROJECT.md](PROJECT.md) for the vision, constraints, architecture, and roadmap.

## Deployment

Pushes to `main` are built and deployed to GitHub Pages by
[the Pages workflow](.github/workflows/deploy-pages.yml). The workflow can also be run manually
from the repository's **Actions** tab.

For the first deployment, set **Settings → Pages → Build and deployment → Source** to
**GitHub Actions**. The game will then be published at
`https://erikbaksay.github.io/quiescent-chevrotain/`.
