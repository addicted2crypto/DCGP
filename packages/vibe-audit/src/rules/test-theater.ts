// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
/**
 * Rule: test-theater
 *
 * AI tools commonly emit test files that pass without actually testing
 * anything. We catch four shapes:
 *
 *   1. File matches *.test.* but has describe(...) and zero
 *      expect/assert/should calls.
 *   2. expect(literal).toBe(literal) - asserts a constant equals itself.
 *   3. .skip( or .todo( left in committed code (test that never runs).
 *   4. (AST mode) it/test bodies that contain only console.log calls
 *      or no statements at all.
 */

import type { Finding, Rule, RuleContext } from "../types";

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(file);
}

const ASSERTION_TOKENS = ["expect(", "assert(", "assert.", "should.", ".should"];
const FORBIDDEN_LITERAL_ASSERTIONS: readonly RegExp[] = [
  /expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/g,
  /expect\(\s*false\s*\)\.toBe\(\s*false\s*\)/g,
  /expect\(\s*1\s*\)\.toBe\(\s*1\s*\)/g,
  /expect\(\s*null\s*\)\.toBe\(\s*null\s*\)/g,
  /expect\(\s*undefined\s*\)\.toBe\(\s*undefined\s*\)/g,
];
const SKIP_OR_TODO = /\b(?:it|test|describe)\.(?:skip|todo)\s*\(/g;

export const testTheaterRule: Rule = {
  id: "test-theater",
  severity: "error",
  description:
    "Test file contains describe() but no real assertions, OR asserts a literal equals itself, OR has .skip/.todo blocks committed to source.",
  regex(ctx: RuleContext): readonly Finding[] {
    if (!isTestFile(ctx.file)) return [];
    const findings: Finding[] = [];
    const lines = ctx.source.split("\n");

    // Whole-file check: describe present but no assertion tokens anywhere.
    const hasDescribe = /\bdescribe\s*\(/.test(ctx.source);
    const hasAnyAssertion = ASSERTION_TOKENS.some((tok) => ctx.source.includes(tok));
    if (hasDescribe && !hasAnyAssertion) {
      findings.push({
        ruleId: "test-theater",
        severity: "error",
        message:
          "Test file has describe() blocks but zero assertion calls (no expect / assert / should). Empty test scaffold.",
        file: ctx.file,
        line: 1,
        col: 1,
        snippet: "(file-level: describe without assertions)",
      });
    }

    // Per-line checks for literal assertions and skip/todo.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      for (const re of FORBIDDEN_LITERAL_ASSERTIONS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          findings.push({
            ruleId: "test-theater",
            severity: "error",
            message:
              "Test asserts a literal equals itself (e.g., expect(true).toBe(true)). This passes regardless of code under test.",
            file: ctx.file,
            line: i + 1,
            col: m.index + 1,
            snippet: line.trim().slice(0, 120),
          });
        }
      }
      SKIP_OR_TODO.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = SKIP_OR_TODO.exec(line)) !== null) {
        findings.push({
          ruleId: "test-theater",
          severity: "error",
          message: ".skip / .todo left in committed test code. The test does not run.",
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
