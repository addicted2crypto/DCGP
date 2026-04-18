import { describe, it, expect } from "vitest";
import { CLASSIFIER_TTL_TURNS, EntropyMonitor } from "../src";

describe("Classifier TTL (DCGP-SPEC.md § 7.6-bis, Failure Mode #6)", () => {
  it("CLASSIFIER_TTL_TURNS is 20", () => {
    expect(CLASSIFIER_TTL_TURNS).toBe(20);
  });

  it("emits force_reclassify + invalidate_fingerprint after 20 turns without a CRITICAL", () => {
    const m = new EntropyMonitor();
    for (let t = 1; t <= CLASSIFIER_TTL_TURNS - 1; t++) {
      const event = m.record({
        turn: t,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.9,
        anchorCitation: true,
      });
      expect(event.actions.find((a) => a.kind === "force_reclassify")).toBeUndefined();
    }
    const ttlTurn = m.record({
      turn: CLASSIFIER_TTL_TURNS,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.9,
      anchorCitation: true,
    });
    expect(ttlTurn.actions.find((a) => a.kind === "force_reclassify")).toBeDefined();
    expect(ttlTurn.actions.find((a) => a.kind === "invalidate_fingerprint")).toBeDefined();
  });

  it("resets the TTL timer so the next forced reclassify is 20 turns later", () => {
    const m = new EntropyMonitor();
    for (let t = 1; t <= CLASSIFIER_TTL_TURNS; t++) {
      m.record({
        turn: t,
        gateViolations: 0,
        driftEvents: 0,
        confidence: 0.9,
        anchorCitation: true,
      });
    }
    // Next turn should NOT fire again (just reset).
    const next = m.record({
      turn: CLASSIFIER_TTL_TURNS + 1,
      gateViolations: 0,
      driftEvents: 0,
      confidence: 0.9,
      anchorCitation: true,
    });
    expect(next.actions.find((a) => a.kind === "force_reclassify")).toBeUndefined();
  });
});
