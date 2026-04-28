/**
 * SARIF v2.1.0 formatter. Output uploadable to GitHub Code Scanning.
 *
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 * Minimal implementation: tool, rules, results. No fixes / artifacts arrays.
 */

import type { AuditReport, Severity } from "../types";
import { BUILTIN_RULES } from "../rules";

const SEVERITY_TO_LEVEL: Readonly<Record<Severity, "note" | "warning" | "error">> = {
  info: "note",
  warn: "warning",
  error: "error",
  critical: "error",
};

export function formatSarif(report: AuditReport): string {
  const sarif = {
    version: "2.1.0",
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "dcgp-vibe-audit",
            version: "1.0.0-rc.0",
            informationUri: "https://github.com/addicted2crypto/DCGP",
            rules: BUILTIN_RULES.map((r) => ({
              id: r.id,
              name: r.id,
              shortDescription: { text: r.description.split(".")[0] ?? r.description },
              fullDescription: { text: r.description },
              defaultConfiguration: { level: SEVERITY_TO_LEVEL[r.severity] },
            })),
          },
        },
        results: report.findings.map((f) => ({
          ruleId: f.ruleId,
          level: SEVERITY_TO_LEVEL[f.severity],
          message: { text: f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.file },
                region: {
                  startLine: f.line,
                  startColumn: f.col,
                  snippet: { text: f.snippet },
                },
              },
            },
          ],
        })),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}
