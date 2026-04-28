/**
 * Audit config loader + ignore-directive parser.
 *
 * Two surfaces:
 *   - `.dcgp/audit.config.json` at project root: globally disable rules,
 *     override include/exclude globs.
 *   - Source comments in individual files: `@dcgp-audit-ignore-file <ruleId>`
 *     and `@dcgp-audit-ignore-next-line <ruleId>` (also `<ruleId>=*`).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditConfig, IgnoreDirective, RuleId } from "./types";

export function loadAuditConfig(rootDir: string): AuditConfig {
  const candidates = [
    join(rootDir, ".dcgp", "audit.config.json"),
    join(rootDir, ".dcgp/audit.config.json"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      return normalizeConfig(parsed);
    } catch {
      // Corrupt config: fall back to defaults rather than crash the audit.
      return {};
    }
  }
  return {};
}

function normalizeConfig(raw: unknown): AuditConfig {
  if (raw === null || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: { -readonly [K in keyof AuditConfig]?: AuditConfig[K] } = {};
  if (Array.isArray(r.disabled)) {
    out.disabled = r.disabled.filter((v): v is RuleId => typeof v === "string") as readonly RuleId[];
  }
  if (Array.isArray(r.include)) {
    out.include = r.include.filter((v): v is string => typeof v === "string");
  }
  if (Array.isArray(r.exclude)) {
    out.exclude = r.exclude.filter((v): v is string => typeof v === "string");
  }
  if (Array.isArray(r.perGlob)) {
    const perGlob: { glob: string; disabled: readonly RuleId[] }[] = [];
    for (const item of r.perGlob) {
      if (item === null || typeof item !== "object") continue;
      const i = item as Record<string, unknown>;
      if (typeof i.glob !== "string" || !Array.isArray(i.disabled)) continue;
      perGlob.push({
        glob: i.glob,
        disabled: i.disabled.filter((v): v is RuleId => typeof v === "string"),
      });
    }
    out.perGlob = perGlob;
  }
  return out as AuditConfig;
}

/**
 * Scan source for ignore directives. Recognized forms:
 *   // @dcgp-audit-ignore-file <ruleId-or-*>
 *   // @dcgp-audit-ignore-next-line <ruleId-or-*>
 * Block-comment forms also accepted.
 */
export function parseIgnoreDirectives(source: string): IgnoreDirective[] {
  const directives: IgnoreDirective[] = [];
  const pattern = /@dcgp-audit-ignore-(file|next-line)\s+([A-Za-z0-9*-]+)/g;

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(line)) !== null) {
      const scope = m[1] === "file" ? "file" : "next-line";
      const ruleId = (m[2] ?? "*") as RuleId | "*";
      directives.push({ ruleId, scope, line: i + 1 });
    }
  }
  return directives;
}

/**
 * Decide whether a finding at `line` for `ruleId` is suppressed by any of
 * the parsed ignore directives.
 */
export function isIgnored(
  ruleId: RuleId,
  line: number,
  directives: readonly IgnoreDirective[],
): boolean {
  for (const d of directives) {
    if (d.ruleId !== ruleId && d.ruleId !== "*") continue;
    if (d.scope === "file") return true;
    if (d.scope === "next-line" && line === d.line + 1) return true;
  }
  return false;
}
