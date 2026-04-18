import { describe, it, expect } from "vitest";
import { CONFIDENCE_UNKNOWN_PENALTY, EntropyMonitor } from "../src";

describe("Confidence blindness protection (DCGP-SPEC.md § 7.2)", () => {
  it("applies 0.15 penalty when >= 50% of window is unknown (-1)", () => {
    const m = new EntropyMonitor({ windowSize: 4 });
    // Fill window with -1 readings.
    for (let t = 1; t <= 4; t++) {
      m.record({
        turn: t,
        gateViolations: 0,
        driftEvents: 0,
        confidence: -1,
        anchorCitation: true,
      });
    }
    const event = m.record({
      turn: 5,
      gateViolations: 0,
      driftEvents: 0,
      confidence: -1,
      anchorCitation: true,
    });
    const conf = event.factors.find((f) => f.name === "confidence_decay")!;
    expect(conf.normalized).toBe(CONFIDENCE_UNKNOWN_PENALTY);
  });

  it("does NOT apply penalty when < 50% of window is unknown", () => {
    const m = new EntropyMonitor({ windowSize: 4 });
    m.record({ turn: 1, gateViolations: 0, driftEvents: 0, confidence: 0.9, anchorCitation: true });
    m.record({ turn: 2, gateViolations: 0, driftEvents: 0, confidence: 0.9, anchorCitation: true });
    m.record({ turn: 3, gateViolations: 0, driftEvents: 0, confidence: 0.9, anchorCitation: true });
    const event = m.record({
      turn: 4,
      gateViolations: 0,
      driftEvents: 0,
      confidence: -1,
      anchorCitation: true,
    });
    const conf = event.factors.find((f) => f.name === "confidence_decay")!;
    // Not penalty; could be decay-from-peak or 0 - but NOT exactly the penalty value.
    expect(conf.normalized).not.toBe(CONFIDENCE_UNKNOWN_PENALTY);
  });

  it("triggers at exactly 50% (>=, not strict >)", () => {
    const m = new EntropyMonitor({ windowSize: 4 });
    m.record({ turn: 1, gateViolations: 0, driftEvents: 0, confidence: 0.9, anchorCitation: true });
    m.record({ turn: 2, gateViolations: 0, driftEvents: 0, confidence: 0.9, anchorCitation: true });
    m.record({ turn: 3, gateViolations: 0, driftEvents: 0, confidence: -1, anchorCitation: true });
    const event = m.record({
      turn: 4,
      gateViolations: 0,
      driftEvents: 0,
      confidence: -1,
      anchorCitation: true,
    });
    const conf = event.factors.find((f) => f.name === "confidence_decay")!;
    // Exactly half of window is -1; penalty must fire.
    expect(conf.normalized).toBe(CONFIDENCE_UNKNOWN_PENALTY);
  });
});
