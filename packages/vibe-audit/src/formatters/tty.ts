/**
 * TTY formatter. Plain ASCII, no color codes (HARDRULES no-emoji + slim).
 * Format: `<file>:<line>:<col> [<severity>] <ruleId>: <message>`
 */

import type { AuditReport, Severity } from "../types";

const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  info: "info ",
  warn: "warn ",
  error: "error",
  critical: "CRIT ",
};

export function formatTty(report: AuditReport): string {
  const lines: string[] = [];
  for (const f of report.findings) {
    lines.push(
      `${f.file}:${f.line}:${f.col}  [${SEVERITY_LABEL[f.severity]}]  ${f.ruleId}: ${f.message}`,
    );
    if (f.snippet.length > 0) lines.push(`    | ${f.snippet}`);
  }
  lines.push("");
  lines.push(formatStats(report));
  return lines.join("\n");
}

function formatStats(report: AuditReport): string {
  const s = report.stats;
  const sev = s.bySeverity;
  return [
    `Scanned ${s.filesScanned} files with ${s.rulesRun} rules in ${s.elapsedMs}ms`,
    `Findings: critical=${sev.critical ?? 0}  error=${sev.error ?? 0}  warn=${sev.warn ?? 0}  info=${sev.info ?? 0}`,
    `TypeScript AST: ${s.tsAstAvailable ? "available" : "not installed (regex-only mode)"}`,
  ].join("\n");
}
