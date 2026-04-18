import { describe, it, expect } from "vitest";
import {
  ContextInjector,
  ANCHOR_BLOAT_RATIO,
  ANCHOR_DEMOTION_PRIORITY,
  definePath,
} from "../src";

describe("Anchor Bloat mitigation (Failure Mode #2)", () => {
  it("ANCHOR_BLOAT_RATIO is 0.20 and demotion priority is 70", () => {
    expect(ANCHOR_BLOAT_RATIO).toBe(0.2);
    expect(ANCHOR_DEMOTION_PRIORITY).toBe(70);
  });

  it("does not demote when all anchors fit within 20% budget", () => {
    const path = definePath({
      id: "small",
      name: "small",
      signals: {},
      anchors: [
        { id: "one", label: "L1", priority: 100, content: "short content" },
        { id: "two", label: "L2", priority: 50, content: "short content" },
      ],
    });
    const injector = new ContextInjector();
    const result = injector.inject(path, { contextWindowTokens: 10_000 });
    expect(result.bloatTriggered).toBe(false);
    expect(result.demotedAnchorIds).toHaveLength(0);
  });

  it("demotes low-priority anchors when cumulative exceeds budget", () => {
    // 5 anchors, each ~500 chars (~125 tokens). Budget @ 1500 tokens = 300.
    const bigContent = "x".repeat(2000);
    const path = definePath({
      id: "big",
      name: "big",
      signals: {},
      anchors: [
        { id: "high", label: "H", priority: 100, content: bigContent },
        { id: "low-a", label: "A", priority: 50, content: bigContent },
        { id: "low-b", label: "B", priority: 40, content: bigContent },
        { id: "low-c", label: "C", priority: 30, content: bigContent },
      ],
    });
    const injector = new ContextInjector();
    const result = injector.inject(path, { contextWindowTokens: 1000 });
    expect(result.bloatTriggered).toBe(true);
    for (const id of result.demotedAnchorIds) {
      const anchor = path.anchors.find((a) => a.id === id);
      expect(anchor!.priority).toBeLessThan(ANCHOR_DEMOTION_PRIORITY);
    }
  });

  it("never demotes anchors with priority >= 70", () => {
    const bigContent = "y".repeat(2000);
    const path = definePath({
      id: "all-high",
      name: "all-high",
      signals: {},
      anchors: [
        { id: "h1", label: "H1", priority: 100, content: bigContent },
        { id: "h2", label: "H2", priority: 90, content: bigContent },
        { id: "h3", label: "H3", priority: 70, content: bigContent },
      ],
    });
    const injector = new ContextInjector();
    const result = injector.inject(path, { contextWindowTokens: 1000 });
    // All priorities >= 70; none should be demoted.
    expect(result.demotedAnchorIds).toHaveLength(0);
  });
});
