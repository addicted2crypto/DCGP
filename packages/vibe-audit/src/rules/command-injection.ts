// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
/**
 * Rule: command-injection
 *
 * Catches `execSync` / `exec` / `spawn` / `spawnSync` calls where the
 * first argument is a template literal containing `${...}` interpolation
 * that is NOT wrapped in `JSON.stringify(...)`. The JSON.stringify wrap
 * is the canonical safe pattern for spawning subprocesses with dynamic
 * arguments.
 *
 * Limitations: regex-only. Cannot follow variables - if the user builds
 * the command in a separate variable then passes it, this rule misses.
 * Trade-off: zero deps and fast. AST-based taint tracking is v3.
 */

import type { Finding, Rule, RuleContext } from "../types";

const EXEC_FUNCTIONS = ["execSync", "exec", "spawn", "spawnSync", "execFile", "execFileSync"];

// Match: execFn`...${...}...` OR execFn(`...${...}...`)
// The regex captures whether JSON.stringify wraps the interpolation.
const PATTERN = new RegExp(
  `\\b(?:${EXEC_FUNCTIONS.join("|")})\\s*\\(?\\s*\`[^\`]*\\$\\{[^\`]*\``,
  "g",
);

export const commandInjectionRule: Rule = {
  id: "command-injection",
  severity: "error",
  description:
    "execSync/exec/spawn called with a template literal containing un-escaped interpolation. Wrap dynamic args in JSON.stringify or use the array argv form.",
  regex(ctx: RuleContext): readonly Finding[] {
    const findings: Finding[] = [];
    const lines = ctx.source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      PATTERN.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = PATTERN.exec(line)) !== null) {
        // If every interpolation in the matched span is JSON.stringify-wrapped,
        // it's safe. Approximate: every `${` should be followed by `JSON.stringify`.
        const span = m[0];
        if (isFullyJsonStringified(span)) continue;
        findings.push({
          ruleId: "command-injection",
          severity: "error",
          message:
            "Subprocess call uses interpolated template literal. Wrap each dynamic value in JSON.stringify(...) or use the array argv form (e.g., spawn('cmd', [arg1, arg2])).",
          file: ctx.file,
          line: i + 1,
          col: m.index + 1,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
    return findings;
  },
};

function isFullyJsonStringified(span: string): boolean {
  // For each `${...}` token, check whether it begins with `JSON.stringify`.
  const interp = /\$\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  let foundAny = false;
  while ((m = interp.exec(span)) !== null) {
    foundAny = true;
    const inner = (m[1] ?? "").trim();
    if (!inner.startsWith("JSON.stringify")) return false;
  }
  return foundAny;
}
