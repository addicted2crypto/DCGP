/**
 * Markdown formatter. Suitable for PR comments / GitHub Issue bodies.
 */

import type { AuditReport, Severity } from "../types";

const SEVERITY_BADGE: Readonly<Record<Severity, string>> = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  critical: "CRITICAL",
};

export function formatMarkdown(report: AuditReport): string {
  const lines: string[] = [];
  lines.push("# DCGP vibe-audit report");
  lines.push("");
  const s = report.stats;
  lines.push(
    `Scanned **${s.filesScanned}** files with **${s.rulesRun}** rules in ${s.elapsedMs}ms. ` +
      `TypeScript AST: ${s.tsAstAvailable ? "available" : "regex-only fallback"}.`,
  );
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("No findings. Clean scan.");
    return lines.join("\n");
  }

  lines.push("## Findings");
  lines.push("");
  lines.push("| Severity | Rule | Location | Message |");
  lines.push("|---|---|---|---|");
  for (const f of report.findings) {
    const loc = `\`${f.file}:${f.line}:${f.col}\``;
    const safeMsg = f.message.replace(/\|/g, "\\|");
    lines.push(`| ${SEVERITY_BADGE[f.severity]} | \`${f.ruleId}\` | ${loc} | ${safeMsg} |`);
  }
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(
    `- critical: ${s.bySeverity.critical ?? 0}` +
      `\n- error: ${s.bySeverity.error ?? 0}` +
      `\n- warn: ${s.bySeverity.warn ?? 0}` +
      `\n- info: ${s.bySeverity.info ?? 0}`,
  );
  return lines.join("\n");
}
