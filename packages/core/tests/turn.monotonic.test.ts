import { describe, it, expect } from "vitest";
import { EntropyMonitor } from "../src";

describe("EntropyMonitor turn monotonicity", () => {
  it("accepts strictly increasing turns", () => {
    const m = new EntropyMonitor();
    for (let t = 1; t <= 10; t++) {
      expect(() =>
        m.record({
          turn: t,
          gateViolations: 0,
          driftEvents: 0,
          confidence: 0.8,
          anchorCitation: true,
        }),
      ).not.toThrow();
    }
  });

  it("throws on turn regression", () => {
    const m = new EntropyMonitor();
    m.record({
      turn: 10,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.8,
      anchorCitation: true,
    });
    expect(() =>
      m.record({
        turn: 5,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.8,
        anchorCitation: true,
      }),
    ).toThrow(/monotonic/);
  });

  it("throws on duplicate turn", () => {
    const m = new EntropyMonitor();
    m.record({
      turn: 3,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.8,
      anchorCitation: true,
    });
    expect(() =>
      m.record({
        turn: 3,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.8,
        anchorCitation: true,
      }),
    ).toThrow(/monotonic/);
  });

  it("accepts turn=1 as the first valid turn", () => {
    const m = new EntropyMonitor();
    expect(() =>
      m.record({
        turn: 1,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.8,
        anchorCitation: true,
      }),
    ).not.toThrow();
  });
});
