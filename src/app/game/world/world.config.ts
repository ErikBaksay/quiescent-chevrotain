export interface WorldConfig {
  readonly width: number;
  readonly depth: number;
  readonly terrainSegments: number;
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
  terrainSegments: 128,
  camera: {
    near: 0.5,
    far: 5_000,
    initialPosition: [165, 130, 210],
    initialTarget: [0, 0, 0],
    minDistance: 8,
    maxDistance: 900,
  },
} as const satisfies WorldConfig;
