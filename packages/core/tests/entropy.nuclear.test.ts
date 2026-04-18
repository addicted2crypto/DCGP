import { describe, it, expect } from "vitest";
import {
  EntropyMonitor,
  EntropyLevel,
  PruneIntensity,
  RetentionScorer,
} from "../src";

describe("EntropyMonitor NUCLEAR directive (Pruning Nexus end-to-end)", () => {
  it("CRITICAL level emits NUCLEAR directive with globalFloor = 0.90", () => {
    const m = new EntropyMonitor({ windowSize: 1 });
    // Seed a peak confidence so the decay factor can saturate.
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
    expect(event.directive.globalFloor).toBe(0.9);
  });

  it("100 turns of sustained noise culminate in CRITICAL and purge low-score blocks", () => {
    const monitor = new EntropyMonitor({ windowSize: 5 });
    let last;
    for (let t = 1; t <= 100; t++) {
      last = monitor.record({
        turn: t,
        gateViolations: 999,
        driftEvents: 999,
        // Seed peak on turn 1, collapse thereafter.
        confidence: t === 1 ? 0.95 : 0.02,
        anchorCitation: false,
      });
    }
    expect(last!.level).toBe(EntropyLevel.CRITICAL);

    const scorer = new RetentionScorer(last!.directive);
    scorer.setTurn(last!.turn);

    // Anchors always score 1.0 and clear the 0.90 NUCLEAR floor.
    const kept = scorer.shouldKeep({
      id: "anchor-1",
      path: "anchors/stack.md",
      kind: "anchor",
      createdAtTurn: 0,
    });
    expect(kept).toBe(true);

    // Old tool output: base 0.7 times age-decay towards 0 at age 100 -> far below floor.
    const pruned = scorer.shouldKeep({
      id: "noisy-tool",
      path: "tool/noisy-output.txt",
      kind: "tool_output",
      createdAtTurn: 0,
    });
    expect(pruned).toBe(false);
  });
});
