import { describe, it, expect } from "vitest";
import {
  EntropyMonitor,
  EntropyLevel,
  DEFAULT_ENTROPY_WEIGHTS,
} from "../src";

const healthy = {
  turn: 1,
  gateViolations: 0,
  driftEvents: 0,
  confidence: 0.9,
  anchorCitation: true,
};

describe("EntropyMonitor formula", () => {
  it("produces score in [0, 1] on healthy input", () => {
    const m = new EntropyMonitor();
    const event = m.record(healthy);
    expect(event.score).toBeGreaterThanOrEqual(0);
    expect(event.score).toBeLessThanOrEqual(1);
  });

  it("starts at NOMINAL with no violations", () => {
    const m = new EntropyMonitor();
    const event = m.record(healthy);
    expect(event.level).toBe(EntropyLevel.NOMINAL);
  });

  it("attaches a PASSIVE directive at NOMINAL", () => {
    const m = new EntropyMonitor();
    const event = m.record(healthy);
    expect(event.directive.globalFloor).toBe(0.2);
  });

  it("records five factors per event", () => {
    const m = new EntropyMonitor();
    const event = m.record(healthy);
    expect(event.factors).toHaveLength(5);
    const names = event.factors.map((f) => f.name).sort();
    expect(names).toEqual([
      "citation_pressure",
      "confidence_decay",
      "drift_pressure",
      "gate_pressure",
      "session_age",
    ]);
  });

  it("contribution is normalized times weight for every factor", () => {
    const m = new EntropyMonitor();
    const event = m.record(healthy);
    for (const f of event.factors) {
      expect(f.contribution).toBeCloseTo(f.normalized * f.weight, 10);
    }
  });

  it("uses the default weights when none are provided", () => {
    const m = new EntropyMonitor();
    const event = m.record(healthy);
    const gate = event.factors.find((f) => f.name === "gate_pressure")!;
    const drift = event.factors.find((f) => f.name === "drift_pressure")!;
    const conf = event.factors.find((f) => f.name === "confidence_decay")!;
    const cite = event.factors.find((f) => f.name === "citation_pressure")!;
    const age = event.factors.find((f) => f.name === "session_age")!;
    expect(gate.weight).toBe(DEFAULT_ENTROPY_WEIGHTS.gate_pressure);
    expect(drift.weight).toBe(DEFAULT_ENTROPY_WEIGHTS.drift_pressure);
    expect(conf.weight).toBe(DEFAULT_ENTROPY_WEIGHTS.confidence_decay);
    expect(cite.weight).toBe(DEFAULT_ENTROPY_WEIGHTS.citation_pressure);
    expect(age.weight).toBe(DEFAULT_ENTROPY_WEIGHTS.session_age);
  });

  it("gate_pressure saturates at 3 violations/turn over window", () => {
    const m = new EntropyMonitor({ windowSize: 5 });
    let event;
    for (let t = 1; t <= 5; t++) {
      event = m.record({ ...healthy, turn: t, gateViolations: 15 });
    }
    const gate = event!.factors.find((f) => f.name === "gate_pressure")!;
    expect(gate.normalized).toBe(1);
  });

  it("drift_pressure saturates at 2 events/turn over window", () => {
    const m = new EntropyMonitor({ windowSize: 5 });
    let event;
    for (let t = 1; t <= 5; t++) {
      event = m.record({ ...healthy, turn: t, driftEvents: 10 });
    }
    const drift = event!.factors.find((f) => f.name === "drift_pressure")!;
    expect(drift.normalized).toBe(1);
  });

  it("score is deterministic for identical input sequences (verification baseline 1)", () => {
    const run = () => {
      const m = new EntropyMonitor();
      const scores: number[] = [];
      for (let t = 1; t <= 20; t++) {
        const e = m.record({ ...healthy, turn: t, gateViolations: t % 3 });
        scores.push(e.score);
      }
      return scores;
    };
    expect(run()).toEqual(run());
  });
});
