// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
/**
 * Rule: comment-density-imbalance
 *
 * Info-severity. Counts comment lines vs code lines per file. Flags
 * files where the comment-to-code ratio exceeds 30%.
 *
 * Rationale: AI tools commonly emit verbose line-by-line comments that
 * restate what well-named code already says. A high comment ratio in
 * isolated files (vs JSDoc-heavy library files) is a tell.
 *
 * Excluded: standalone JSDoc/TSDoc blocks at the top of a file (the
 * file-level docstring), and `*.d.ts` declaration files where comment
 * density is structurally high.
 */

import type { Finding, Rule, RuleContext } from "../types";

export const COMMENT_DENSITY_THRESHOLD = 0.3;
export const MIN_FILE_LINES_FOR_CHECK = 30;

export const commentDensityRule: Rule = {
  id: "comment-density-imbalance",
  severity: "info",
  description: `File's comment-to-code ratio exceeds ${Math.round(COMMENT_DENSITY_THRESHOLD * 100)}%. Common tell that AI authored verbose explanatory comments. Review whether the comments are load-bearing or chatter.`,
  regex(ctx: RuleContext): readonly Finding[] {
    if (ctx.file.endsWith(".d.ts")) return [];

    const lines = ctx.source.split("\n");
    if (lines.length < MIN_FILE_LINES_FOR_CHECK) return [];

    const { commentLines, codeLines, leadingDocstringLines } = classifyLines(lines);

    // Subtract the leading file-level docstring from the comment count
    // since that's a legit pattern (and library files often have long ones).
    const adjustedComments = Math.max(0, commentLines - leadingDocstringLines);
    const denominator = codeLines + adjustedComments;
    if (denominator === 0) return [];
    const ratio = adjustedComments / denominator;

    if (ratio < COMMENT_DENSITY_THRESHOLD) return [];

    return [
      {
        ruleId: "comment-density-imbalance",
        severity: "info",
        message: `Comment-to-code ratio is ${(ratio * 100).toFixed(1)}% (${adjustedComments} comment lines / ${codeLines} code lines, excluding file-level docstring). Above ${Math.round(COMMENT_DENSITY_THRESHOLD * 100)}% often indicates AI-generated explanatory chatter. Trim comments that restate code.`,
        file: ctx.file,
        line: 1,
        col: 1,
        snippet: `${adjustedComments} comment / ${codeLines} code`,
      },
    ];
  },
};

interface LineCounts {
  commentLines: number;
  codeLines: number;
  leadingDocstringLines: number;
}

function classifyLines(lines: readonly string[]): LineCounts {
  let commentLines = 0;
  let codeLines = 0;
  let leadingDocstringLines = 0;

  let inBlockComment = false;
  let stillLeading = true;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    if (line.length === 0) continue;

    if (inBlockComment) {
      commentLines += 1;
      if (stillLeading) leadingDocstringLines += 1;
      if (line.includes("*/")) inBlockComment = false;
      continue;
    }

    if (line.startsWith("/*")) {
      commentLines += 1;
      if (stillLeading) leadingDocstringLines += 1;
      if (!line.includes("*/")) inBlockComment = true;
      continue;
    }

    if (line.startsWith("//")) {
      commentLines += 1;
      if (stillLeading) leadingDocstringLines += 1;
      continue;
    }

    // First non-comment, non-empty line ends the leading-docstring window.
    stillLeading = false;
    codeLines += 1;
  }

  return { commentLines, codeLines, leadingDocstringLines };
}
