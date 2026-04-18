import { describe, it, expect } from "vitest";
import { kahanSum } from "../src";

describe("Kahan compensated summation (Failure Mode #5: Numerical Drift)", () => {
  it("standard summation accumulates error over 1000 small additions", () => {
    const eps = 1e-7;
    let standard = 0;
    for (let i = 0; i < 1000; i++) standard += eps;
    const ideal = eps * 1000;
    const standardError = Math.abs(standard - ideal);
    expect(standardError).toBeGreaterThan(0);
  });

  it("kahanSum is accurate to 10 decimals over 1000 small additions", () => {
    const eps = 1e-7;
    const values = Array.from({ length: 1000 }, () => eps);
    const sum = kahanSum(values);
    const ideal = eps * 1000;
    expect(sum).toBeCloseTo(ideal, 10);
  });

  it("kahanSum beats standard summation over 10,000 mixed-magnitude terms", () => {
    const values = Array.from({ length: 10_000 }, (_, i) =>
      i % 2 === 0 ? 0.1 : 0.2,
    );
    const ideal = 1500;
    let standard = 0;
    for (const v of values) standard += v;
    const kahan = kahanSum(values);
    expect(Math.abs(kahan - ideal)).toBeLessThanOrEqual(
      Math.abs(standard - ideal),
    );
  });

  it("kahanSum returns 0 for empty array", () => {
    expect(kahanSum([])).toBe(0);
  });

  it("kahanSum handles a single value", () => {
    expect(kahanSum([0.42])).toBeCloseTo(0.42, 15);
  });
});
