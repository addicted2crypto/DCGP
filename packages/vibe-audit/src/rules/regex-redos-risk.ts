// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
/**
 * Rule: regex-redos-risk
 *
 * Source-level mirror of the runtime guard already in @dcgp/core's
 * validate.ts. Flags `new RegExp(stringExpression)` calls that do NOT
 * have a length cap before them, AND flags regex literals containing
 * the classic catastrophic-backtracking shapes.
 *
 * Threshold constant intentionally matches @dcgp/core so source-time
 * and runtime rules stay in lockstep.
 */

import type { Finding, Rule, RuleContext } from "../types";
import { MAX_REGEX_PATTERN_LENGTH } from "@dcgp/core";

const NEW_REGEXP_DYNAMIC = /\bnew\s+RegExp\s*\(\s*[^"`'/)][^)]*\)/g;
const CATASTROPHIC_SHAPES: readonly RegExp[] = [
  /\(\s*[^)]*[+*][^)]*\)\s*[+*?]/, // (a+)+, (a*)*, (a+)?
  /\(\s*\w\s*\|\s*\w\s*\)\s*[+*]/, // (a|a)+
];

export const regexRedosRiskRule: Rule = {
  id: "regex-redos-risk",
  severity: "warn",
  description: `\`new RegExp(...)\` from a non-literal source without a length cap, or a literal regex with nested-quantifier shapes that risk catastrophic backtracking. Add a length cap (matches @dcgp/core's MAX_REGEX_PATTERN_LENGTH = ${MAX_REGEX_PATTERN_LENGTH}) or refactor the pattern.`,
  regex(ctx: RuleContext): readonly Finding[] {
    const findings: Finding[] = [];
    const lines = ctx.source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;

      NEW_REGEXP_DYNAMIC.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = NEW_REGEXP_DYNAMIC.exec(line)) !== null) {
        // Heuristic: look for `length` check in the previous 3 lines.
        if (hasNearbyLengthCheck(lines, i)) continue;
        findings.push({
          ruleId: "regex-redos-risk",
          severity: "warn",
          message: `\`new RegExp(...)\` from a dynamic source. Cap input length (e.g., MAX_REGEX_PATTERN_LENGTH = ${MAX_REGEX_PATTERN_LENGTH}) before compilation to prevent ReDoS.`,
          file: ctx.file,
          line: i + 1,
          col: m.index + 1,
          snippet: line.trim().slice(0, 120),
        });
      }

      for (const shape of CATASTROPHIC_SHAPES) {
        // Only flag inside an actual /regex/ literal context to avoid
        // matching prose or HTML.
        const literalMatch = line.match(/\/[^/\n]*\/[gimsuy]*/);
        if (literalMatch !== null && shape.test(literalMatch[0])) {
          findings.push({
            ruleId: "regex-redos-risk",
            severity: "warn",
            message:
              "Regex literal contains nested-quantifier shape suggestive of catastrophic backtracking.",
            file: ctx.file,
            line: i + 1,
            col: (literalMatch.index ?? 0) + 1,
            snippet: line.trim().slice(0, 120),
          });
          break;
        }
      }
    }
    return findings;
  },
};

function hasNearbyLengthCheck(lines: readonly string[], idx: number): boolean {
  for (let j = Math.max(0, idx - 3); j <= idx; j++) {
    const l = lines[j];
    if (l === undefined) continue;
    if (/\.length\s*[<>=!]/.test(l)) return true;
    if (/MAX_REGEX_PATTERN_LENGTH/.test(l)) return true;
  }
  return false;
}
