import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionState } from "../src";
import { MAX_STATE_FILE_BYTES } from "../src/state/SessionState";

function tempPath(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dcgp-state-"));
  const path = join(dir, "session.json");
  writeFileSync(path, body, "utf8");
  return path;
}

describe("Security: SessionState state-file size cap", () => {
  it("MAX_STATE_FILE_BYTES is sized generously (10 MB)", () => {
    expect(MAX_STATE_FILE_BYTES).toBe(10 * 1024 * 1024);
  });

  it("loads a small, valid persisted state normally", () => {
    const path = tempPath(
      JSON.stringify({
        sessionId: "abc",
        activeDomainId: "nodejs",
        classificationConfidence: 0.9,
        currentTurn: 5,
        domainShiftLog: [],
        gateViolations: [],
        driftEvents: [],
        entropyEvents: [],
        stats: {
          totalGateViolations: 0,
          totalDriftEvents: 0,
          totalCorrectionsInjected: 0,
          totalEntropyEvents: 0,
          domainSwitches: 0,
        },
      }),
    );
    const state = new SessionState({}, path);
    expect(state.snapshot().activeDomainId).toBe("nodejs");
    expect(state.snapshot().currentTurn).toBe(5);
  });

  it("refuses to parse a persisted state file larger than the cap", () => {
    // Build a valid JSON document that is > MAX_STATE_FILE_BYTES.
    // Use a long padding string to push the file past the cap quickly.
    const padding = "x".repeat(1024 * 1024); // 1 MB of filler
    const rows = Array.from({ length: 12 }, (_, i) => ({
      ruleId: `pad-${i}`,
      severity: "warn",
      message: padding,
      turn: i,
    }));
    const oversized = JSON.stringify({
      sessionId: "oversized",
      activeDomainId: "nodejs",
      classificationConfidence: 1,
      currentTurn: 0,
      domainShiftLog: [],
      gateViolations: rows,
      driftEvents: [],
      entropyEvents: [],
      stats: {
        totalGateViolations: 0,
        totalDriftEvents: 0,
        totalCorrectionsInjected: 0,
        totalEntropyEvents: 0,
        domainSwitches: 0,
      },
    });

    const path = tempPath(oversized);
    // The oversized file exists on disk; SessionState must silently start
    // fresh rather than OOM-parse it.
    const state = new SessionState({ sessionId: "default" }, path);
    expect(state.snapshot().sessionId).toBe("default");
    expect(state.snapshot().activeDomainId).toBe(null);
    expect(state.snapshot().gateViolations).toHaveLength(0);
  });

  it("starts fresh when the persisted file is corrupt JSON", () => {
    const path = tempPath("{ not: valid json");
    const state = new SessionState({ sessionId: "fresh" }, path);
    expect(state.snapshot().sessionId).toBe("fresh");
    expect(state.snapshot().activeDomainId).toBe(null);
  });
});
