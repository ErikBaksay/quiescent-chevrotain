# Quiescent Chevrotain

Quiescent Chevrotain is a relaxing, browser-first 3D world builder focused on free-form building, decorating, landscaping, and enjoying the result.

The project has completed **Stage 2: Placement Proof**. It provides a responsive Angular application shell with a Three.js-rendered grassy world, warm outdoor lighting, camera navigation, and a primitive cube placement/editing loop.

## Stack

- Angular 21
- Three.js
- TypeScript
- SCSS
- Vitest

There is no runtime backend. The game is intended to remain statically hostable, including on GitHub Pages, with browser-local persistence added in a later stage.

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

- Primary-button drag: orbit camera
- Secondary-button drag: pan camera
- Wheel or middle-button drag: zoom camera
- **Place Cube**, then click the terrain: place and select one prototype cube
- `G`: move the selected cube
- `R`: rotate the selected cube
- `Delete` or `Backspace`: delete the selected cube
- `Escape`: leave the active tool, then deselect

## Commands

```bash
npm start        # Run the development server
npm run build    # Create a production build in dist/
npm run build:pages # Build with the GitHub Pages repository base path
npm test         # Run unit tests
npm run format   # Format source and documentation
npm run format:check
```

## Project structure

```text
src/app/
  game/
    editor/      # Placement, selection, transform, and input systems
    engine/      # Three.js lifecycle, camera, and environment systems
    viewport/    # Angular-to-Three.js canvas boundary
    world/       # World configuration and terrain
  app.*          # Angular application shell
public/          # Static files and, later, the asset catalogue
PROJECT.md       # Long-term product and architecture source of truth
```

See [PROJECT.md](PROJECT.md) for the vision, constraints, architecture, and roadmap.
