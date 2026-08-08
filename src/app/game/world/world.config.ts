export interface WorldConfig {
  readonly width: number;
  readonly depth: number;
  readonly terrain: {
    readonly sampleSpacing: number;
    readonly tileSize: number;
    readonly minHeight: number;
    readonly maxHeight: number;
    readonly baseHeight: number;
  };
  readonly camera: {
    readonly near: number;
    readonly far: number;
    readonly initialPosition: readonly [number, number, number];
    readonly initialTarget: readonly [number, number, number];
    readonly minDistance: number;
    readonly maxDistance: number;
  };
}

/** World measurements use metres: one Three.js unit is approximately one metre. */
export const WORLD_CONFIG = {
  width: 2_000,
  depth: 2_000,
  terrain: {
    sampleSpacing: 2,
    tileSize: 250,
    minHeight: -100,
    maxHeight: 100,
    baseHeight: 0,
  },
  camera: {
    near: 0.5,
    far: 5_000,
    initialPosition: [165, 130, 210],
    initialTarget: [0, 0, 0],
    minDistance: 8,
    maxDistance: 900,
  },
} as const satisfies WorldConfig;
