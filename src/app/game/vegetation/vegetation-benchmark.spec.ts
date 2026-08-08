import { describe, expect, it } from 'vitest';
import { createVegetationBenchmarkLayout } from './vegetation-benchmark';

describe('vegetation benchmark layout', () => {
  it('creates a deterministic 10k layout with a dense 3k camera-local population', () => {
    const first = createVegetationBenchmarkLayout();
    const second = createVegetationBenchmarkLayout();
    expect(first).toHaveLength(10_000);
    expect(first.slice(0, 3_000).every((tree) => Math.hypot(tree.x, tree.z) <= 340)).toBe(true);
    expect(first.slice(0, 20)).toEqual(second.slice(0, 20));
    expect(first.every((tree) => tree.scale >= 0.9 && tree.scale <= 1.1)).toBe(true);
  });
});
