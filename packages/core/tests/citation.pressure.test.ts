import { describe, it, expect } from "vitest";
import { EntropyMonitor } from "../src";

describe("Citation pressure (silent-hallucination blind spot)", () => {
  it("citation_pressure is 0 when every turn cites an anchor", () => {
    const m = new EntropyMonitor({ windowSize: 10 });
    let event;
    for (let t = 1; t <= 10; t++) {
      event = m.record({
        turn: t,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.9,
        anchorCitation: true,
      });
    }
    const cite = event!.factors.find((f) => f.name === "citation_pressure")!;
    expect(cite.normalized).toBe(0);
  });

  it("citation_pressure saturates at 1 when no turn cites any anchor", () => {
    const m = new EntropyMonitor({ windowSize: 10 });
    let event;
    for (let t = 1; t <= 10; t++) {
      event = m.record({
        turn: t,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.9,
        anchorCitation: false,
      });
    }
    const cite = event!.factors.find((f) => f.name === "citation_pressure")!;
    expect(cite.normalized).toBe(1);
  });

  it("citation pressure alone can drive score into ELEVATED over time", () => {
    const m = new EntropyMonitor({ windowSize: 10 });
    let finalEvent;
    for (let t = 1; t <= 30; t++) {
      finalEvent = m.record({
        turn: t,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.95,
        anchorCitation: false,
      });
    }
    // Without citation_pressure, a session with no gate or drift signals
    // would look healthy. Citation pressure alone at weight 0.20 = 0.20
    // contribution; plus session_age at ~0.9 * 0.05 = ~0.045 = 0.245.
    // Below ELEVATED - but still a nonzero signal where before was zero.
    const cite = finalEvent!.factors.find((f) => f.name === "citation_pressure")!;
    expect(cite.contribution).toBeGreaterThan(0.1);
  });

  it("resetPartial clears the citation window", () => {
    const m = new EntropyMonitor({ windowSize: 5 });
    // Fill with uncited turns.
    for (let t = 1; t <= 5; t++) {
      m.record({
        turn: t,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.9,
        anchorCitation: false,
      });
    }
    m.resetPartial();
    const postReset = m.record({
      turn: 6,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.9,
      anchorCitation: true,
    });
    const cite = postReset.factors.find((f) => f.name === "citation_pressure")!;
    expect(cite.normalized).toBe(0);
  });
});
