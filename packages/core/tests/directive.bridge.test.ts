import { describe, it, expect } from "vitest";
import {
  EntropyMonitor,
  EntropyLevel,
  PRUNE_INTENSITY_FLOOR,
  PruneIntensity,
} from "../src";

describe("Retention Bridge (DCGP-SPEC.md § 7.7) - Nexus lock-in", () => {
  it("currentDirective() is always readable, PASSIVE before any record()", () => {
    const m = new EntropyMonitor();
    const directive = m.currentDirective();
    expect(directive.intensity).toBe(PruneIntensity.PASSIVE);
    expect(directive.globalFloor).toBe(0.2);
  });

  it("maps NOMINAL -> PASSIVE (globalFloor = 0.20, lenient)", () => {
    const m = new EntropyMonitor();
    const event = m.record({
      turn: 1,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.95,
      anchorCitation: true,
    });
    expect(event.level).toBe(EntropyLevel.NOMINAL);
    expect(event.directive.intensity).toBe(PruneIntensity.PASSIVE);
    expect(event.directive.globalFloor).toBe(PRUNE_INTENSITY_FLOOR[PruneIntensity.PASSIVE]);
  });

  it("maps CRITICAL -> NUCLEAR (globalFloor = 0.90, strict)", () => {
    const m = new EntropyMonitor({ windowSize: 1 });
    // Seed peak so confidence_decay can reach near-full drop.
    m.record({
      turn: 1,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.95,
      anchorCitation: true,
    });
    const event = m.record({
      turn: 2,
      gateViolations: 999,
      driftEvents: 999,
      confidence: 0.01,
      anchorCitation: false,
    });
    expect(event.level).toBe(EntropyLevel.CRITICAL);
    expect(event.directive.intensity).toBe(PruneIntensity.NUCLEAR);
    expect(event.directive.globalFloor).toBe(PRUNE_INTENSITY_FLOOR[PruneIntensity.NUCLEAR]);
  });

  it("directive is attached to every EntropyEvent", () => {
    const m = new EntropyMonitor();
    for (let t = 1; t <= 10; t++) {
      const event = m.record({
        turn: t,
        gateViolations: t % 3,
        driftEvents: 0,
        confidence: 0.85,
        anchorCitation: t % 2 === 0,
      });
      expect(event.directive).toBeDefined();
      expect(event.directive.globalFloor).toBeGreaterThanOrEqual(0.2);
      expect(event.directive.globalFloor).toBeLessThanOrEqual(0.9);
      expect(event.directive.turn).toBe(t);
      expect(event.directive.score).toBe(event.score);
    }
  });

  it("protectedPaths are forwarded from constructor to every directive", () => {
    const m = new EntropyMonitor({
      protectedPaths: ["contracts/**", "src/core/**"],
    });
    const event = m.record({
      turn: 1,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.9,
      anchorCitation: true,
    });
    expect(event.directive.protectedPaths).toEqual(["contracts/**", "src/core/**"]);
  });

  it("directive.reason includes level and score for audit traceability", () => {
    const m = new EntropyMonitor();
    const event = m.record({
      turn: 1,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.9,
      anchorCitation: true,
    });
    expect(event.directive.reason).toMatch(/NOMINAL|ELEVATED|HIGH|CRITICAL/);
    expect(event.directive.reason).toMatch(/score=/);
  });
});
