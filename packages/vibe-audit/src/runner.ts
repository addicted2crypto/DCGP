/**
 * Audit runner. Walks files, applies rules, collects findings, applies
 * ignore directives + per-glob disabling. Pure orchestration; rules
 * themselves do all detection.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type {
  AuditOptions,
  AuditReport,
  Finding,
  Rule,
  RuleContext,
  RuleId,
  Severity,
} from "./types";
import { walkSourceFiles, DEFAULT_EXTENSIONS } from "./file-walker";
import { loadAuditConfig, parseIgnoreDirectives, isIgnored } from "./config";
import { tryLoadTypeScript, parseSourceFile } from "./ast/ts-loader";

/**
 * Maximum file size we will read in bytes. Files larger than this are
 * skipped to avoid OOM on a malicious or generated multi-GB file. Same
 * principle as @dcgp/core's SessionState size cap.
 */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  info: 0,
  warn: 1,
  error: 2,
  critical: 3,
};

export async function auditWorkspace(
  rules: readonly Rule[],
  options: AuditOptions = {},
): Promise<AuditReport> {
  const start = Date.now();
  const dir = options.dir ?? process.cwd();
  const config = loadAuditConfig(dir);

  const include = options.include ?? config.include ?? DEFAULT_EXTENSIONS;
  const exclude = [...(options.exclude ?? []), ...(config.exclude ?? [])];

  const enabledRules = filterEnabledRules(rules, config.disabled, options.rule);

  const ts = options.noTs === true ? null : tryLoadTypeScript();

  const findings: Finding[] = [];
  let filesScanned = 0;

  for (const rel of walkSourceFiles(dir, { extensions: [...include], exclude })) {
    const abs = join(dir, rel);

    let size: number;
    try {
      size = statSync(abs).size;
    } catch {
      continue;
    }
    if (size > MAX_FILE_SIZE_BYTES) continue;

    let source: string;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      continue;
    }

    filesScanned += 1;
    const ignoreDirectives = parseIgnoreDirectives(source);

    const tsAst =
      ts === null
        ? null
        : { sourceFile: parseSourceFile(ts, rel, source), ts };

    const rulesForFile = filterRulesForGlob(enabledRules, rel, config.perGlob);

    for (const rule of rulesForFile) {
      const ctx: RuleContext = {
        file: rel,
        source,
        tsAst,
        ignoreDirectives,
      };
      try {
        for (const finding of rule.regex(ctx)) {
          if (!isIgnored(finding.ruleId, finding.line, ignoreDirectives)) {
            findings.push(finding);
          }
        }
        if (rule.ast !== undefined && tsAst !== null) {
          for (const finding of rule.ast(ctx)) {
            if (!isIgnored(finding.ruleId, finding.line, ignoreDirectives)) {
              findings.push(finding);
            }
          }
        }
      } catch {
        // A rule throwing must NEVER abort the whole audit. Drop and
        // continue. Worth surfacing in v2 as a warning channel.
      }
    }
  }

  const filtered =
    options.minSeverity === undefined
      ? findings
      : findings.filter((f) => SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER[options.minSeverity!]);

  return {
    findings: filtered,
    stats: {
      filesScanned,
      rulesRun: enabledRules.length,
      tsAstAvailable: ts !== null,
      elapsedMs: Date.now() - start,
      bySeverity: countBy(filtered, (f) => f.severity),
      byRule: countBy(filtered, (f) => f.ruleId),
    },
  };
}

function filterEnabledRules(
  rules: readonly Rule[],
  disabled: readonly RuleId[] | undefined,
  singleRule: RuleId | undefined,
): readonly Rule[] {
  let out = rules;
  if (singleRule !== undefined) out = out.filter((r) => r.id === singleRule);
  if (disabled !== undefined && disabled.length > 0) {
    out = out.filter((r) => !disabled.includes(r.id));
  }
  return out;
}

function filterRulesForGlob(
  rules: readonly Rule[],
  rel: string,
  perGlob: readonly { readonly glob: string; readonly disabled: readonly RuleId[] }[] | undefined,
): readonly Rule[] {
  if (perGlob === undefined || perGlob.length === 0) return rules;
  const disabledHere = new Set<RuleId>();
  for (const entry of perGlob) {
    if (matchesGlobLite(rel, entry.glob)) {
      for (const id of entry.disabled) disabledHere.add(id);
    }
  }
  if (disabledHere.size === 0) return rules;
  return rules.filter((r) => !disabledHere.has(r.id));
}

/**
 * Lightweight glob: only `*` (within a path segment) and `**` (across
 * segments) are supported. Matches the same intent as @dcgp/core's
 * `globToRegExp`. Defining inline keeps this file zero cross-package edge
 * cases.
 */
function matchesGlobLite(path: string, glob: string): boolean {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::GS::")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/::GS::/g, ".*");
  return new RegExp(`^${escaped}$`).test(path);
}

function countBy<T, K extends string>(
  items: readonly T[],
  key: (item: T) => K,
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
