// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
/**
 * Rule: stub-markers
 *
 * Catches the most common AI-generated leftover: explicit "I haven't
 * finished this" markers that survived to commit. Real codebases have
 * a small natural population of these (10-20 across a large repo);
 * AI-vibed repos often have many more, and they almost always indicate
 * unimplemented behavior.
 */

import type { Finding, Rule, RuleContext } from "../types";

const PATTERNS: ReadonlyArray<{ readonly re: RegExp; readonly tag: string }> = [
  { re: /\bTODO\b\s*[:(]/g, tag: "TODO" },
  { re: /\bFIXME\b\s*[:(]/g, tag: "FIXME" },
  { re: /\bXXX\b\s*[:(]/g, tag: "XXX" },
  { re: /\bHACK\b\s*[:(]/g, tag: "HACK" },
  { re: /throw\s+new\s+Error\s*\(\s*["'`](?:not\s+implemented|TODO|FIXME|unimplemented)/gi, tag: "throw-not-implemented" },
];

export const stubMarkersRule: Rule = {
  id: "stub-markers",
  severity: "warn",
  description:
    "Source contains stub markers (TODO/FIXME/XXX/HACK) or `throw new Error(\"not implemented\")` style placeholders.",
  regex(ctx: RuleContext): readonly Finding[] {
    return scanStubs(ctx);
  },
};

function scanStubs(ctx: RuleContext): Finding[] {
  const findings: Finding[] = [];
  const lines = ctx.source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    for (const { re, tag } of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        findings.push({
          ruleId: "stub-markers",
          severity: "warn",
          message: `Stub marker (${tag}) - implement or remove before shipping.`,
          file: ctx.file,
          line: i + 1,
          col: m.index + 1,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }
  return findings;
}
