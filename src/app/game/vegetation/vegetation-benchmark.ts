export interface VegetationBenchmarkTransform {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
  readonly variantIndex: number;
}

/** Deterministic 10k-tree layout used for repeatable browser/GPU profiling. */
export function createVegetationBenchmarkLayout(
  count = 10_000,
  denseCount = 3_000,
  seed = 0x51a7e,
): readonly VegetationBenchmarkTransform[] {
  let state = seed >>> 0;
  const random = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  return Array.from({ length: count }, (_, index) => {
    const dense = index < denseCount;
    const radius = Math.sqrt(random()) * (dense ? 340 : 950);
    const angle = random() * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      yaw: random() * Math.PI * 2,
      scale: 0.9 + random() * 0.2,
      variantIndex: index % 3,
    };
  });
}
