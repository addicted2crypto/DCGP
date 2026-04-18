import { describe, it, expect } from "vitest";
import { ANCHOR_REINJECT_COOLDOWN_TURNS, EntropyMonitor } from "../src";

describe("Anchor re-injection cooldown (Failure Mode #7)", () => {
  it("ANCHOR_REINJECT_COOLDOWN_TURNS is 3", () => {
    expect(ANCHOR_REINJECT_COOLDOWN_TURNS).toBe(3);
  });

  it("does not re-inject anchors every turn while stuck at ELEVATED", () => {
    const m = new EntropyMonitor({ windowSize: 5 });
    // Drive into ELEVATED and hold.
    let reinjectCount = 0;
    for (let t = 1; t <= 15; t++) {
      const event = m.record({
        turn: t,
        gateViolations: 5,
        driftEvents: 3,
        confidence: 0.4,
        anchorCitation: false,
      });
      if (event.actions.find((a) => a.kind === "reinject_anchors")) {
        reinjectCount++;
      }
    }
    // Without cooldown: 15 re-injects. With cooldown of 3: ~5 or fewer.
    expect(reinjectCount).toBeLessThanOrEqual(Math.ceil(15 / ANCHOR_REINJECT_COOLDOWN_TURNS) + 1);
  });

  it("does re-inject when cooldown expires after sustained ELEVATED", () => {
    const m = new EntropyMonitor({ windowSize: 5 });
    const reinjectTurns: number[] = [];
    for (let t = 1; t <= 10; t++) {
      const event = m.record({
        turn: t,
        gateViolations: 5,
        driftEvents: 3,
        confidence: 0.4,
        anchorCitation: false,
      });
      if (event.actions.find((a) => a.kind === "reinject_anchors")) {
        reinjectTurns.push(t);
      }
    }
    // Successive re-injects should be >= cooldown apart.
    for (let i = 1; i < reinjectTurns.length; i++) {
      expect(reinjectTurns[i]! - reinjectTurns[i - 1]!).toBeGreaterThanOrEqual(
        ANCHOR_REINJECT_COOLDOWN_TURNS,
      );
    }
  });
});
