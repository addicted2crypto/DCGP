import { describe, it, expect } from "vitest";
import { definePath, MAX_REGEX_PATTERN_LENGTH } from "../src";

describe("Security: ReDoS guard in definePath()", () => {
  it("accepts short, benign regex strings", () => {
    expect(() =>
      definePath({
        id: "safe",
        name: "safe",
        signals: {},
        gates: [
          {
            id: "g1",
            pattern: "console\\.log",
            severity: "warn",
            message: "use logger",
            context: "output",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects a pattern longer than MAX_REGEX_PATTERN_LENGTH", () => {
    const tooLong = "a".repeat(MAX_REGEX_PATTERN_LENGTH + 1);
    expect(() =>
      definePath({
        id: "long",
        name: "long",
        signals: {},
        gates: [
          {
            id: "g",
            pattern: tooLong,
            severity: "warn",
            message: "m",
            context: "output",
          },
        ],
      }),
    ).toThrow(/ReDoS|too long/);
  });

  it("rejects classic nested-quantifier patterns ((a+)+)", () => {
    expect(() =>
      definePath({
        id: "nested",
        name: "nested",
        signals: {},
        gates: [
          {
            id: "g",
            pattern: "(a+)+",
            severity: "warn",
            message: "m",
            context: "output",
          },
        ],
      }),
    ).toThrow(/nested quantifiers|catastrophic|ReDoS/);
  });

  it("rejects (.+)* pattern", () => {
    expect(() =>
      definePath({
        id: "dot-star",
        name: "dot-star",
        signals: {},
        driftRules: [
          {
            sourceDomain: "other",
            pattern: "(.+)*",
            severity: "error",
            correction: "x",
          },
        ],
      }),
    ).toThrow(/nested quantifiers|catastrophic|ReDoS/);
  });

  it("rejects alternation-with-quantifier like (a|a)+", () => {
    expect(() =>
      definePath({
        id: "alt-quant",
        name: "alt-quant",
        signals: {},
        gates: [
          {
            id: "g",
            pattern: "(a|a)+",
            severity: "warn",
            message: "m",
            context: "output",
          },
        ],
      }),
    ).toThrow(/nested quantifiers|catastrophic|ReDoS/);
  });

  it("allows a pre-compiled RegExp to bypass the heuristic (escape hatch)", () => {
    // Users with legit nested-quantifier needs can pre-compile and pass the
    // RegExp object directly. The heuristic only fires on string patterns.
    expect(() =>
      definePath({
        id: "precompiled",
        name: "precompiled",
        signals: {},
        gates: [
          {
            id: "g",
            pattern: /(a+)+/,
            severity: "warn",
            message: "m",
            context: "output",
          },
        ],
      }),
    ).not.toThrow();
  });
});
