import { describe, it, expect } from "vitest";
import { EntropyMonitor, EntropyLevel } from "../src";

describe("EntropyMonitor hysteresis (verification baseline 3)", () => {
  it("does not fire ELEVATED on a single-turn spike", () => {
    const m = new EntropyMonitor({ windowSize: 3 });
    // Single spike: high gate violations one turn only.
    m.record({ turn: 1, gateViolations: 0, driftEvents: 0, confidence: 0.9, anchorCitation: true });
    const spike = m.record({
      turn: 2,
      gateViolations: 9,
      driftEvents: 0,
      confidence: 0.9,
      anchorCitation: true,
    });
    expect(spike.level).toBe(EntropyLevel.NOMINAL);
  });

  it("fires ELEVATED on two consecutive above-threshold turns", () => {
    const m = new EntropyMonitor({ windowSize: 3 });
    m.record({ turn: 1, gateViolations: 9, driftEvents: 9, confidence: -1, anchorCitation: false });
    m.record({ turn: 2, gateViolations: 9, driftEvents: 9, confidence: -1, anchorCitation: false });
    const third = m.record({
      turn: 3,
      gateViolations: 9,
      driftEvents: 9,
      confidence: -1,
      anchorCitation: false,
    });
    expect([EntropyLevel.ELEVATED, EntropyLevel.HIGH, EntropyLevel.CRITICAL]).toContain(
      third.level,
    );
  });

  it("CRITICAL fires without waiting for hysteresis (only 1 turn required)", () => {
    const m = new EntropyMonitor({ windowSize: 1 });
    // Seed with healthy peak.
    m.record({
      turn: 1,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.95,
      anchorCitation: true,
    });
    // Single crash turn: every factor saturates with confidence drop from peak.
    const crit = m.record({
      turn: 2,
      gateViolations: 999,
      driftEvents: 999,
      confidence: 0.01,
      anchorCitation: false,
    });
    expect(crit.level).toBe(EntropyLevel.CRITICAL);
  });

  it("downgrades happen without hysteresis once windows clear", () => {
    const m = new EntropyMonitor({ windowSize: 2 });
    // Drive into HIGH/CRITICAL.
    m.record({ turn: 1, gateViolations: 0, driftEvents: 0, confidence: 0.95, anchorCitation: true });
    m.record({ turn: 2, gateViolations: 9, driftEvents: 9, confidence: 0.1, anchorCitation: false });
    m.record({ turn: 3, gateViolations: 9, driftEvents: 9, confidence: 0.1, anchorCitation: false });
    // Three clean turns: sliding windows flush out the violations.
    m.record({ turn: 4, gateViolations: 0, driftEvents: 0, confidence: 0.95, anchorCitation: true });
    m.record({ turn: 5, gateViolations: 0, driftEvents: 0, confidence: 0.95, anchorCitation: true });
    const recovered = m.record({
      turn: 6,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.95,
      anchorCitation: true,
    });
    expect(recovered.level).toBe(EntropyLevel.NOMINAL);
  });
});
