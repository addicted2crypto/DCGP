import { describe, it, expect } from "vitest";
import {
  RetentionScorer,
  PruneIntensity,
  PRUNE_INTENSITY_FLOOR,
  type RetentionDirective,
} from "../src";

function directive(intensity: PruneIntensity, protectedPaths: string[] = []): RetentionDirective {
  return {
    intensity,
    globalFloor: PRUNE_INTENSITY_FLOOR[intensity],
    protectedPaths,
    reason: "test",
    turn: 1,
    score: 0,
  };
}

describe("Pruning Nexus equation: Keep(block) := score(block) >= globalFloor \\/ protected(block)", () => {
  it("keeps a high-score block at NOMINAL (floor = 0.20)", () => {
    const scorer = new RetentionScorer(directive(PruneIntensity.PASSIVE));
    scorer.setTurn(1);
    const keep = scorer.shouldKeep({
      id: "hot",
      path: "src/fresh.ts",
      kind: "tool_output",
      createdAtTurn: 1,
    });
    expect(keep).toBe(true);
  });

  it("prunes the same block at CRITICAL (floor = 0.90, only anchors survive)", () => {
    const scorer = new RetentionScorer(directive(PruneIntensity.NUCLEAR));
    scorer.setTurn(200);
    const keep = scorer.shouldKeep({
      id: "cold",
      path: "tool/ancient.out",
      kind: "tool_output",
      createdAtTurn: 0,
    });
    expect(keep).toBe(false);
  });

  it("protectedPaths override the score check at any intensity", () => {
    const scorer = new RetentionScorer(
      directive(PruneIntensity.NUCLEAR, ["contracts/**"]),
    );
    scorer.setTurn(1);
    const keep = scorer.shouldKeep({
      id: "critical",
      path: "contracts/Vault.sol",
      kind: "tool_output",
      createdAtTurn: 0,
    });
    expect(keep).toBe(true);
  });

  it("anchors always score above the NUCLEAR floor at creation", () => {
    const scorer = new RetentionScorer(directive(PruneIntensity.NUCLEAR));
    scorer.setTurn(1);
    const keep = scorer.shouldKeep({
      id: "anchor-stack",
      path: "anchors/stack.md",
      kind: "anchor",
      createdAtTurn: 1,
    });
    expect(keep).toBe(true);
  });

  it("floor escalates monotonically PASSIVE -> TIGHTEN -> AGGRESSIVE -> NUCLEAR", () => {
    const floors = [
      PRUNE_INTENSITY_FLOOR[PruneIntensity.PASSIVE],
      PRUNE_INTENSITY_FLOOR[PruneIntensity.TIGHTEN],
      PRUNE_INTENSITY_FLOOR[PruneIntensity.AGGRESSIVE],
      PRUNE_INTENSITY_FLOOR[PruneIntensity.NUCLEAR],
    ];
    expect(floors[0]).toBe(0.2);
    expect(floors[1]).toBe(0.4);
    expect(floors[2]).toBe(0.65);
    expect(floors[3]).toBe(0.9);
    // Higher floor = stricter pruning.
    for (let i = 1; i < floors.length; i++) {
      expect(floors[i]!).toBeGreaterThan(floors[i - 1]!);
    }
  });

  it("applyDirective swaps the enforcement floor mid-session", () => {
    const scorer = new RetentionScorer(directive(PruneIntensity.PASSIVE));
    scorer.setTurn(1);
    const block = {
      id: "mid",
      path: "log/session.txt",
      kind: "tool_output" as const,
      createdAtTurn: 1,
    };
    expect(scorer.shouldKeep(block)).toBe(true);
    scorer.applyDirective(directive(PruneIntensity.NUCLEAR));
    // Same block, tighter floor - now should NOT survive.
    expect(scorer.shouldKeep(block)).toBe(false);
  });
});
