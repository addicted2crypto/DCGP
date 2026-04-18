import { describe, it, expect } from "vitest";
import { EntropyMonitor } from "../src";

describe("EntropyMonitor long-tail stability (verification baseline 4)", () => {
  it("score stays in [0, 1] over 500 turns of mixed input", () => {
    const m = new EntropyMonitor({ windowSize: 10 });
    for (let t = 1; t <= 500; t++) {
      const event = m.record({
        turn: t,
        gateViolations: t % 4,
        driftEvents: t % 3,
        confidence: 0.6 + 0.3 * Math.sin(t / 10),
        anchorCitation: t % 5 !== 0,
      });
      expect(event.score).toBeGreaterThanOrEqual(0);
      expect(event.score).toBeLessThanOrEqual(1);
    }
  });

  it("session_age saturates at 1.0 after turn 50 (default saturation)", () => {
    const m = new EntropyMonitor({ windowSize: 10, ageSaturationTurn: 50 });
    let event;
    for (let t = 1; t <= 200; t++) {
      event = m.record({
        turn: t,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.9,
        anchorCitation: true,
      });
    }
    const age = event!.factors.find((f) => f.name === "session_age")!;
    expect(age.normalized).toBeCloseTo(1, 5);
  });

  it("peak confidence is tracked correctly", () => {
    const m = new EntropyMonitor({ windowSize: 5 });
    m.record({ turn: 1, gateViolations: 0, driftEvents: 0, confidence: 0.95, anchorCitation: true });
    // Subsequent lower confidences should create a decay factor.
    const lower = m.record({
      turn: 2,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.3,
      anchorCitation: true,
    });
    const decay = lower.factors.find((f) => f.name === "confidence_decay")!;
    expect(decay.normalized).toBeGreaterThan(0);
  });
});
