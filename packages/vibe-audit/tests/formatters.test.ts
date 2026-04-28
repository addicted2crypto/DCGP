// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
import { describe, it, expect } from "vitest";
import { formatJson, formatTty, formatMarkdown, formatSarif } from "../src";
import type { AuditReport } from "../src";

const sampleReport: AuditReport = {
  findings: [
    {
      ruleId: "stub-markers",
      severity: "warn",
      message: "TODO marker",
      file: "src/x.ts",
      line: 4,
      col: 3,
      snippet: "// TODO: thing",
    },
    {
      ruleId: "hardcoded-credentials",
      severity: "critical",
      message: "API key literal",
      file: "src/config.ts",
      line: 12,
      col: 7,
      snippet: 'const k = "sk-..."',
    },
  ],
  stats: {
    filesScanned: 5,
    rulesRun: 8,
    tsAstAvailable: true,
    elapsedMs: 42,
    bySeverity: { critical: 1, error: 0, warn: 1, info: 0 },
    byRule: { "stub-markers": 1, "hardcoded-credentials": 1 },
  },
};

describe("Formatters", () => {
  it("json: round-trips via JSON.parse", () => {
    const out = formatJson(sampleReport);
    const parsed = JSON.parse(out) as AuditReport;
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.stats.filesScanned).toBe(5);
  });

  it("tty: includes file:line:col format and severity labels", () => {
    const out = formatTty(sampleReport);
    expect(out).toContain("src/x.ts:4:3");
    expect(out).toContain("CRIT");
    expect(out).toContain("TypeScript AST: available");
  });

  it("markdown: includes table headers and counts section", () => {
    const out = formatMarkdown(sampleReport);
    expect(out).toContain("# DCGP vibe-audit report");
    expect(out).toContain("| Severity | Rule | Location | Message |");
    expect(out).toContain("CRITICAL");
    expect(out).toContain("## Counts");
  });

  it("sarif: produces valid SARIF 2.1.0 with results array", () => {
    const out = formatSarif(sampleReport);
    const parsed = JSON.parse(out) as {
      version: string;
      runs: { tool: { driver: { name: string; rules: unknown[] } }; results: unknown[] }[];
    };
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.runs[0]!.tool.driver.name).toBe("dcgp-vibe-audit");
    expect(parsed.runs[0]!.tool.driver.rules.length).toBeGreaterThanOrEqual(8);
    expect(parsed.runs[0]!.results).toHaveLength(2);
  });

  it("markdown: empty report shows no-findings message", () => {
    const empty: AuditReport = {
      findings: [],
      stats: {
        filesScanned: 1,
        rulesRun: 8,
        tsAstAvailable: false,
        elapsedMs: 5,
        bySeverity: { critical: 0, error: 0, warn: 0, info: 0 },
        byRule: {},
      },
    };
    expect(formatMarkdown(empty)).toContain("No findings");
  });
});
