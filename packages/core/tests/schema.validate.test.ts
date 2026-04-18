import { describe, it, expect } from "vitest";
import { definePath, DCGPValidationError } from "../src";

describe("Schema validator (DCGP-SPEC.md § 3)", () => {
  it("accepts a minimal valid path", () => {
    const path = definePath({
      id: "my-project",
      name: "My Project",
      signals: {},
    });
    expect(path.id).toBe("my-project");
    expect(path.version).toBe("1.0.0");
    expect(path.anchors).toHaveLength(0);
  });

  it("rejects ids that do not match lowercase-hyphen pattern", () => {
    expect(() =>
      definePath({
        id: "My_Project",
        name: "X",
        signals: {},
      }),
    ).toThrow(DCGPValidationError);
  });

  it("rejects missing name", () => {
    expect(() =>
      definePath({
        id: "proj",
        signals: {},
      } as any),
    ).toThrow(DCGPValidationError);
  });

  it("rejects anchor priority outside [0, 100]", () => {
    expect(() =>
      definePath({
        id: "proj",
        name: "P",
        signals: {},
        anchors: [{ id: "a", label: "A", priority: 150, content: "c" }],
      }),
    ).toThrow(/priority/);
  });

  it("rejects invalid gate severity", () => {
    expect(() =>
      definePath({
        id: "proj",
        name: "P",
        signals: {},
        gates: [
          {
            id: "g",
            pattern: "x",
            severity: "weird" as any,
            message: "m",
            context: "output",
          },
        ],
      }),
    ).toThrow(/severity/);
  });

  it("rejects duplicate anchor ids", () => {
    expect(() =>
      definePath({
        id: "proj",
        name: "P",
        signals: {},
        anchors: [
          { id: "dup", label: "A", priority: 10, content: "c" },
          { id: "dup", label: "B", priority: 20, content: "c" },
        ],
      }),
    ).toThrow(/duplicate anchor/);
  });

  it("normalizes string patterns to RegExp for gates and drift rules", () => {
    const path = definePath({
      id: "p",
      name: "p",
      signals: {},
      gates: [
        {
          id: "g",
          pattern: "console\\.log",
          severity: "warn",
          message: "m",
          context: "output",
        },
      ],
      driftRules: [
        {
          sourceDomain: "python",
          pattern: "pip install",
          severity: "error",
          correction: "use npm",
        },
      ],
    });
    expect(path.gates[0]!.pattern).toBeInstanceOf(RegExp);
    expect(path.driftRules[0]!.pattern).toBeInstanceOf(RegExp);
  });

  it("preserves RegExp patterns when provided directly", () => {
    const path = definePath({
      id: "p",
      name: "p",
      signals: {},
      gates: [
        {
          id: "g",
          pattern: /console\.log/,
          severity: "warn",
          message: "m",
          context: "output",
        },
      ],
    });
    expect(path.gates[0]!.pattern.source).toBe("console\\.log");
  });

  it("rejects retention rule score outside [0, 1]", () => {
    expect(() =>
      definePath({
        id: "p",
        name: "p",
        signals: {},
        compression: {
          retention: [{ pattern: "src/**", score: 1.5 }],
        },
      }),
    ).toThrow(/score/);
  });
});
