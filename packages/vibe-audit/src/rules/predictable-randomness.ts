// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
/**
 * Rule: predictable-randomness
 *
 * Catches `Math.random()` used in security-adjacent contexts: token
 * generation, id generation, secret/key/nonce naming. `Math.random()`
 * is fine for shuffling, animations, and temp file naming - and we
 * deliberately do NOT flag those.
 *
 * Heuristic: scan back ~3 lines + check the same line for any of the
 * security-related variable names (token, secret, key, nonce, id, password,
 * auth, session, csrf). If found, flag.
 *
 * AST-augmented mode: walk VariableDeclaration nodes whose name matches
 * the security tokens AND whose initializer contains a CallExpression
 * to Math.random.
 */

import type { Finding, Rule, RuleContext } from "../types";
import type { TypeScriptModule } from "../ast/ts-loader";
import { walkNodes } from "../ast/visitor";

const SECURITY_NAMES = [
  "token",
  "secret",
  "key",
  "nonce",
  "password",
  "passwd",
  "auth",
  "session",
  "csrf",
  "apikey",
];
const SECURITY_NAME_RE = new RegExp(`\\b(?:${SECURITY_NAMES.join("|")})\\w*`, "i");
const MATH_RANDOM_RE = /\bMath\.random\s*\(/g;

export const predictableRandomnessRule: Rule = {
  id: "predictable-randomness",
  severity: "error",
  description:
    "Math.random() used in a security-adjacent context (token, secret, key, nonce, password, auth, session, csrf). Math.random is NOT cryptographically random. Use crypto.randomBytes / crypto.randomUUID / crypto.getRandomValues.",
  regex(ctx: RuleContext): readonly Finding[] {
    const findings: Finding[] = [];
    const lines = ctx.source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      MATH_RANDOM_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = MATH_RANDOM_RE.exec(line)) !== null) {
        if (looksSecurityContext(lines, i, line, m.index)) {
          findings.push({
            ruleId: "predictable-randomness",
            severity: "error",
            message:
              "Math.random() in security context. Use `crypto.randomBytes(n).toString('hex')` or `crypto.randomUUID()` for tokens / ids / nonces.",
            file: ctx.file,
            line: i + 1,
            col: m.index + 1,
            snippet: line.trim().slice(0, 120),
          });
        }
      }
    }
    return findings;
  },
  ast(ctx: RuleContext): readonly Finding[] {
    if (ctx.tsAst === null) return [];
    const ts = ctx.tsAst.ts as TypeScriptModule;
    const sf = ctx.tsAst.sourceFile;
    const findings: Finding[] = [];

    walkNodes(ts, sf, ctx.source, ({ node, line, col, snippet }) => {
      if (!ts.isVariableDeclaration(node)) return;
      const decl = node as {
        name?: { getText?: () => string; escapedText?: string };
        initializer?: { getText?: () => string };
      };
      const nameText = decl.name?.escapedText ?? decl.name?.getText?.() ?? "";
      if (!SECURITY_NAME_RE.test(nameText)) return;
      const initText = decl.initializer?.getText?.() ?? "";
      if (!/\bMath\.random\s*\(/.test(initText)) return;
      findings.push({
        ruleId: "predictable-randomness",
        severity: "error",
        message: `AST-confirmed: variable \`${nameText}\` initialized from Math.random(). Use crypto-strength randomness.`,
        file: ctx.file,
        line,
        col,
        snippet,
      });
    });

    return findings;
  },
};

function looksSecurityContext(
  lines: readonly string[],
  idx: number,
  currentLine: string,
  matchCol: number,
): boolean {
  // Same line, before the Math.random call: variable name on the LHS?
  const before = currentLine.slice(0, matchCol);
  if (SECURITY_NAME_RE.test(before)) return true;

  // Look back up to 3 lines for a containing context.
  for (let j = Math.max(0, idx - 3); j < idx; j++) {
    const l = lines[j];
    if (l === undefined) continue;
    if (SECURITY_NAME_RE.test(l)) return true;
  }
  return false;
}
