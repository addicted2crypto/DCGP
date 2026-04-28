// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { auditWorkspace, BUILTIN_RULES } from "../src";

function tempRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dcgp-vibe-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body, "utf8");
  }
  return dir;
}

describe("auditWorkspace runner", () => {
  it("reports zero findings on a clean tiny workspace", async () => {
    const dir = tempRepo({
      "package.json": JSON.stringify({ name: "x" }),
      "src/clean.ts": `export function add(a: number, b: number): number { return a + b; }`,
    });
    const report = await auditWorkspace(BUILTIN_RULES, { dir });
    expect(report.findings).toHaveLength(0);
    expect(report.stats.filesScanned).toBe(1);
  });

  it("collects findings across multiple rules and files", async () => {
    const dir = tempRepo({
      "src/secrets.ts": `const k = "sk-abcd1234abcd1234abcd1234abcd1234";\nexport { k };`,
      "src/stubs.ts": `// TODO: implement\nexport function noop() {}`,
    });
    const report = await auditWorkspace(BUILTIN_RULES, { dir });
    expect(report.findings.length).toBeGreaterThanOrEqual(2);
    const ids = new Set(report.findings.map((f) => f.ruleId));
    expect(ids.has("hardcoded-credentials")).toBe(true);
    expect(ids.has("stub-markers")).toBe(true);
  });

  it("respects --rule filter (single rule)", async () => {
    const dir = tempRepo({
      "src/x.ts": `// TODO: thing\nconst k = "sk-abcd1234abcd1234abcd1234abcd1234";\nexport { k };`,
    });
    const report = await auditWorkspace(BUILTIN_RULES, { dir, rule: "stub-markers" });
    expect(report.findings.every((f) => f.ruleId === "stub-markers")).toBe(true);
    expect(report.stats.rulesRun).toBe(1);
  });

  it("respects minSeverity filter", async () => {
    const dir = tempRepo({
      "src/x.ts": `// TODO: thing\nconst k = "sk-abcd1234abcd1234abcd1234abcd1234";\nexport { k };`,
    });
    const report = await auditWorkspace(BUILTIN_RULES, { dir, minSeverity: "critical" });
    expect(report.findings.every((f) => f.severity === "critical")).toBe(true);
  });

  it("honors @dcgp-audit-ignore-file directive", async () => {
    const dir = tempRepo({
      "src/x.ts":
        `// @dcgp-audit-ignore-file stub-markers\n// TODO: this would normally fire\nexport function noop() {}`,
    });
    const report = await auditWorkspace(BUILTIN_RULES, { dir, rule: "stub-markers" });
    expect(report.findings).toHaveLength(0);
  });

  it("honors @dcgp-audit-ignore-next-line directive", async () => {
    const dir = tempRepo({
      "src/x.ts":
        `export function f() {\n  // @dcgp-audit-ignore-next-line stub-markers\n  // TODO: this is suppressed\n  // TODO: this is NOT suppressed\n  return 1;\n}`,
    });
    const report = await auditWorkspace(BUILTIN_RULES, { dir, rule: "stub-markers" });
    expect(report.findings).toHaveLength(1);
  });

  it("respects .dcgp/audit.config.json disabled list", async () => {
    const dir = tempRepo({
      ".dcgp/audit.config.json": JSON.stringify({ disabled: ["stub-markers"] }),
      "src/x.ts": `// TODO: thing\nexport function noop() {}`,
    });
    const report = await auditWorkspace(BUILTIN_RULES, { dir });
    expect(report.findings.every((f) => f.ruleId !== "stub-markers")).toBe(true);
  });

  it("skips files larger than the size cap", async () => {
    const dir = tempRepo({
      "src/x.ts": "x".repeat(6 * 1024 * 1024), // 6 MB > 5 MB cap
    });
    const report = await auditWorkspace(BUILTIN_RULES, { dir });
    // Either the cap blocked the read OR the file had no findings; either is fine
    // but the file count must reflect that nothing was scanned successfully.
    expect(report.stats.filesScanned).toBe(0);
  });

  it("returns elapsed time and per-rule counts", async () => {
    const dir = tempRepo({
      "src/x.ts": `// TODO: a\n// TODO: b`,
    });
    const report = await auditWorkspace(BUILTIN_RULES, { dir });
    expect(report.stats.elapsedMs).toBeGreaterThanOrEqual(0);
    expect((report.stats.byRule["stub-markers"] ?? 0)).toBeGreaterThanOrEqual(2);
  });
});
