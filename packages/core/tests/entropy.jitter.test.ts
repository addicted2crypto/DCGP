import { describe, it, expect } from "vitest";
import { EntropyMonitor, EntropyLevel } from "../src";

describe("EntropyMonitor jitter guard (hysteresis prevents fire-per-turn)", () => {
  it("oscillating score near the ELEVATED boundary does not fire every turn", () => {
    const m = new EntropyMonitor({ windowSize: 10 });
    let transitions = 0;
    m.on("transition", () => transitions++);

    // Alternate between above and below threshold over 30 turns. Each above
    // is a single-turn spike that hysteresis must absorb.
    for (let t = 1; t <= 30; t++) {
      m.record({
        turn: t,
        gateViolations: t % 2 === 0 ? 12 : 0,
        driftEvents: t % 2 === 0 ? 8 : 0,
        confidence: 0.9,
        anchorCitation: true,
      });
    }

    // Without hysteresis we'd fire 15+ times. With 2-turn hysteresis we
    // should fire far fewer, if any.
    expect(transitions).toBeLessThan(5);
  });

  it("sustained above-threshold for 2 turns fires exactly once per upgrade", () => {
    const m = new EntropyMonitor({ windowSize: 5 });
    let transitions = 0;
    m.on("transition", () => transitions++);

    // Sustained drive up.
    for (let t = 1; t <= 5; t++) {
      m.record({
        turn: t,
        gateViolations: 9,
        driftEvents: 9,
        confidence: -1,
        anchorCitation: false,
      });
    }
    // Recovery.
    for (let t = 6; t <= 10; t++) {
      m.record({
        turn: t,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.95,
        anchorCitation: true,
      });
    }

    // Up + down transitions = at least 2, but bounded.
    expect(transitions).toBeGreaterThanOrEqual(2);
    expect(transitions).toBeLessThan(10);
  });

  it("current level reflects emission, not raw score, during hysteresis", () => {
    const m = new EntropyMonitor({ windowSize: 3 });
    m.record({
      turn: 1,
      gateViolations: 9,
      driftEvents: 9,
      confidence: -1,
      anchorCitation: false,
    });
    // Single above-threshold turn. Still NOMINAL due to hysteresis.
    expect(m.currentLevel()).toBe(EntropyLevel.NOMINAL);
  });
});
