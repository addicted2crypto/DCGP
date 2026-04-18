import { describe, it, expect, beforeEach } from "vitest";
import {
  FineTuningExporter,
  EntropyLevel,
  PruneIntensity,
  definePath,
  type SessionEventLog,
  type TrainingExample,
  type EntropyEvent,
} from "../src";

const testPath = definePath({
  id: "test-domain",
  name: "Test Domain",
  signals: {},
  gates: [
    {
      id: "no-console",
      pattern: /console\.log/,
      severity: "warn",
      message: "Use logger, not console.log",
      suggest: "Replace with logger.info()",
      context: "output",
    },
    {
      id: "no-eval",
      pattern: /\beval\s*\(/,
      severity: "critical",
      message: "eval() is dangerous",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "python",
      pattern: /pip install/,
      severity: "error",
      correction: "This is Node.js. Use npm/pnpm instead.",
    },
  ],
  compression: {},
});

function entropyEvent(over: Partial<EntropyEvent> = {}): EntropyEvent {
  return {
    level: EntropyLevel.HIGH,
    score: 0.75,
    previousScore: 0.5,
    factors: [
      { name: "gate_pressure", rawValue: 3, normalized: 0.8, weight: 0.3, contribution: 0.24 },
      { name: "drift_pressure", rawValue: 2, normalized: 0.6, weight: 0.25, contribution: 0.15 },
      { name: "confidence_decay", rawValue: 0.4, normalized: 0.4, weight: 0.2, contribution: 0.08 },
      { name: "citation_pressure", rawValue: 5, normalized: 0.5, weight: 0.2, contribution: 0.1 },
      { name: "session_age", rawValue: 20, normalized: 0.35, weight: 0.05, contribution: 0.0175 },
    ],
    actions: [],
    contextCorrection: "<dcgp-entropy-correction>High entropy detected.</dcgp-entropy-correction>",
    turn: 20,
    message: "Turn 20 HIGH (75%)",
    directive: {
      intensity: PruneIntensity.AGGRESSIVE,
      globalFloor: 0.2,
      protectedPaths: [],
      reason: "test",
      turn: 20,
      score: 0.75,
    },
    ...over,
  };
}

function emptyLog(overrides: Partial<SessionEventLog> = {}): SessionEventLog {
  return {
    gateViolations: [],
    driftEvents: [],
    entropyEvents: [],
    activeDomainId: "test-domain",
    ...overrides,
  };
}

describe("FineTuningExporter", () => {
  let exporter: FineTuningExporter;

  beforeEach(() => {
    exporter = new FineTuningExporter();
    exporter.activate(testPath);
  });

  describe("buildExamples()", () => {
    it("returns empty array for empty log", () => {
      expect(exporter.buildExamples(emptyLog())).toEqual([]);
    });

    it("extracts gate violation as training example", () => {
      const log = emptyLog({
        gateViolations: [
          {
            ruleId: "no-console",
            severity: "warn",
            message: "Use logger, not console.log",
            turn: 5,
            violatingText: 'console.log("debug")',
            correctionMessage: "Replace with logger.info()",
          },
        ],
      });

      const examples = exporter.buildExamples(log);
      expect(examples).toHaveLength(1);
      expect(examples[0]!.source).toBe("gate");
      expect(examples[0]!.severity).toBe("warn");
      expect(examples[0]!.label).toBe("gate:no-console");
      expect(examples[0]!.violatingOutput).toContain("console.log");
    });

    it("extracts drift event as training example", () => {
      const log = emptyLog({
        driftEvents: [
          {
            sourceDomain: "python",
            matched: "pip install django",
            correctionInjected: true,
            turn: 10,
            correction: "This is Node.js. Use npm/pnpm instead.",
          },
        ],
      });

      const examples = exporter.buildExamples(log);
      expect(examples).toHaveLength(1);
      expect(examples[0]!.source).toBe("drift");
      expect(examples[0]!.label).toBe("drift:python");
      expect(examples[0]!.correction).toContain("npm/pnpm");
    });

    it("extracts entropy event with contextCorrection", () => {
      const log = emptyLog({ entropyEvents: [entropyEvent()] });
      const examples = exporter.buildExamples(log);
      expect(examples).toHaveLength(1);
      expect(examples[0]!.source).toBe("entropy");
      expect(examples[0]!.severity).toBe("error"); // HIGH maps to error
      expect(examples[0]!.label).toBe("entropy:high");
    });

    it("skips entropy events without contextCorrection", () => {
      const log = emptyLog({
        entropyEvents: [
          entropyEvent({
            level: EntropyLevel.ELEVATED,
            score: 0.5,
            contextCorrection: null,
          }),
        ],
      });
      expect(exporter.buildExamples(log)).toHaveLength(0);
    });

    it("combines all three sources in one log", () => {
      const log = emptyLog({
        gateViolations: [
          { ruleId: "no-console", severity: "warn", message: "m", turn: 1, violatingText: "x" },
          { ruleId: "no-eval", severity: "critical", message: "m", turn: 2, violatingText: "y" },
        ],
        driftEvents: [
          {
            sourceDomain: "python",
            matched: "pip",
            correctionInjected: true,
            turn: 3,
            correction: "c",
          },
        ],
        entropyEvents: [
          entropyEvent({
            level: EntropyLevel.CRITICAL,
            score: 0.95,
            previousScore: 0.85,
            factors: [],
            contextCorrection:
              "<dcgp-entropy-correction>critical</dcgp-entropy-correction>",
            turn: 4,
          }),
        ],
      });

      const examples = exporter.buildExamples(log);
      expect(examples).toHaveLength(4);
      expect(examples.map((e) => e.source).sort()).toEqual([
        "drift",
        "entropy",
        "gate",
        "gate",
      ]);
    });
  });

  describe("serialize() - OpenAI format", () => {
    it("produces valid chat completion messages", () => {
      const ex: TrainingExample = {
        domainId: "test-domain",
        source: "gate",
        severity: "warn",
        turn: 1,
        violatingOutput: 'console.log("x")',
        correction: "Use logger.info()",
        label: "gate:no-console",
      };
      const jsonl = exporter.serialize([ex], "openai");
      const parsed = JSON.parse(jsonl);
      expect(parsed.messages).toHaveLength(3);
      expect(parsed.messages[0]!.role).toBe("system");
      expect(parsed.messages[1]!.role).toBe("user");
      expect(parsed.messages[2]!.role).toBe("assistant");
      expect(parsed.messages[2]!.content).toBe("Use logger.info()");
    });

    it("system message references the active domain", () => {
      const ex: TrainingExample = {
        domainId: "my-custom-domain",
        source: "gate",
        severity: "warn",
        turn: 1,
        violatingOutput: "x",
        correction: "y",
        label: "gate:g",
      };
      const parsed = JSON.parse(exporter.serialize([ex], "openai"));
      expect(parsed.messages[0]!.content).toContain("my-custom-domain");
    });

    it("includes DCGP metadata for filtering", () => {
      const ex: TrainingExample = {
        domainId: "test-domain",
        source: "drift",
        severity: "error",
        turn: 7,
        violatingOutput: "pip install",
        correction: "use npm",
        label: "drift:python",
      };
      const parsed = JSON.parse(exporter.serialize([ex], "openai"));
      expect(parsed.metadata.dcgp_source).toBe("drift");
      expect(parsed.metadata.dcgp_severity).toBe("error");
    });

    it("produces one line per example", () => {
      const exs: TrainingExample[] = [
        {
          domainId: "a",
          source: "gate",
          severity: "warn",
          turn: 1,
          violatingOutput: "x",
          correction: "y",
          label: "a",
        },
        {
          domainId: "b",
          source: "drift",
          severity: "error",
          turn: 2,
          violatingOutput: "x",
          correction: "y",
          label: "b",
        },
      ];
      const out = exporter.serialize(exs, "openai");
      const lines = out.split("\n");
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });
  });

  describe("serialize() - Anthropic format", () => {
    it("produces prompt/completion pairs", () => {
      const ex: TrainingExample = {
        domainId: "test",
        source: "gate",
        severity: "warn",
        turn: 1,
        violatingOutput: "bad",
        correction: "good",
        label: "gate:g",
      };
      const parsed = JSON.parse(exporter.serialize([ex], "anthropic"));
      expect(parsed.prompt).toContain("Human:");
      expect(parsed.prompt).toContain("Assistant:");
      expect(parsed.completion).toContain("good");
    });
  });

  describe("serialize() - HuggingFace format", () => {
    it("produces instruction/input/output", () => {
      const ex: TrainingExample = {
        domainId: "test",
        source: "gate",
        severity: "warn",
        turn: 1,
        violatingOutput: "bad",
        correction: "good",
        label: "gate:g",
      };
      const parsed = JSON.parse(exporter.serialize([ex], "huggingface"));
      expect(parsed.instruction).toBeDefined();
      expect(parsed.input).toBe("bad");
      expect(parsed.output).toBe("good");
      expect(parsed.domain).toBe("test");
    });
  });

  describe("groupBySeverity()", () => {
    it("buckets examples by severity", () => {
      const exs: TrainingExample[] = [
        {
          domainId: "a",
          source: "gate",
          severity: "critical",
          turn: 1,
          violatingOutput: "x",
          correction: "y",
          label: "l",
        },
        {
          domainId: "a",
          source: "gate",
          severity: "critical",
          turn: 2,
          violatingOutput: "x",
          correction: "y",
          label: "l",
        },
        {
          domainId: "a",
          source: "gate",
          severity: "warn",
          turn: 3,
          violatingOutput: "x",
          correction: "y",
          label: "l",
        },
      ];
      const groups = exporter.groupBySeverity(exs);
      expect(groups.critical).toHaveLength(2);
      expect(groups.warn).toHaveLength(1);
      expect(groups.error).toHaveLength(0);
    });
  });

  describe("summarize()", () => {
    it("counts by source, severity, and domain", () => {
      const exs: TrainingExample[] = [
        {
          domainId: "a",
          source: "gate",
          severity: "warn",
          turn: 1,
          violatingOutput: "",
          correction: "",
          label: "l",
        },
        {
          domainId: "a",
          source: "gate",
          severity: "critical",
          turn: 2,
          violatingOutput: "",
          correction: "",
          label: "l",
        },
        {
          domainId: "b",
          source: "drift",
          severity: "error",
          turn: 3,
          violatingOutput: "",
          correction: "",
          label: "l",
        },
      ];
      const sum = exporter.summarize(exs);
      expect(sum.total).toBe(3);
      expect(sum.bySource.gate).toBe(2);
      expect(sum.bySource.drift).toBe(1);
      expect(sum.byDomain.a).toBe(2);
      expect(sum.byDomain.b).toBe(1);
    });
  });
});
