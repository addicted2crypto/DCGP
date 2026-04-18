import { describe, it, expect } from "vitest";
import { WARMUP_TURNS, EntropyMonitor, HallucinationGate, definePath } from "../src";

describe("Warmup blindspot bypass (Failure Mode #3)", () => {
  it("WARMUP_TURNS is 3", () => {
    expect(WARMUP_TURNS).toBe(3);
  });

  it("gate violation at turn <= WARMUP_TURNS forces anchor reinject action", () => {
    const m = new EntropyMonitor();
    // Turn 1 with a single gate violation should fire reinject despite being NOMINAL.
    const event = m.record({
      turn: 1,
      gateViolations: 1,
      driftEvents: 0,
      confidence: 0.95,
      anchorCitation: true,
    });
    expect(event.actions.find((a) => a.kind === "reinject_anchors")).toBeDefined();
  });

  it("gate violation at turn > WARMUP_TURNS does not force reinject by itself", () => {
    const m = new EntropyMonitor();
    for (let t = 1; t <= WARMUP_TURNS; t++) {
      m.record({
        turn: t,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.9,
        anchorCitation: true,
      });
    }
    const post = m.record({
      turn: WARMUP_TURNS + 1,
      gateViolations: 1,
      driftEvents: 0,
      confidence: 0.9,
      anchorCitation: true,
    });
    // At NOMINAL post-warmup, one gate hit alone should not trigger reinject.
    expect(post.actions.find((a) => a.kind === "reinject_anchors")).toBeUndefined();
  });

  it("HallucinationGate flags warmupBypass when violation fires in warmup", () => {
    const path = definePath({
      id: "test",
      name: "test",
      signals: {},
      gates: [
        {
          id: "no-console",
          pattern: "console\\.log",
          severity: "warn",
          message: "no",
          context: "output",
        },
      ],
    });
    const gate = new HallucinationGate();
    gate.activate(path);
    const result = gate.scan('console.log("bad")', { turn: 2, context: "output" });
    expect(result.warmupBypass).toBe(true);
    expect(result.violations).toHaveLength(1);
  });

  it("HallucinationGate does not flag warmupBypass after WARMUP_TURNS", () => {
    const path = definePath({
      id: "test",
      name: "test",
      signals: {},
      gates: [
        {
          id: "no-console",
          pattern: "console\\.log",
          severity: "warn",
          message: "no",
          context: "output",
        },
      ],
    });
    const gate = new HallucinationGate();
    gate.activate(path);
    const result = gate.scan('console.log("late")', { turn: 10, context: "output" });
    expect(result.warmupBypass).toBe(false);
  });
});
