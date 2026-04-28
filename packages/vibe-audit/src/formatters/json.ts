import type { AuditReport } from "../types";

export function formatJson(report: AuditReport, opts: { indent?: number } = {}): string {
  return JSON.stringify(report, null, opts.indent ?? 2);
}
