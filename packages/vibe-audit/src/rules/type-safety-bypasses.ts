// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
/**
 * Rule: type-safety-bypasses
 *
 * Catches the most common type-system escape hatches AI tools fall back
 * to when they cannot satisfy strict TypeScript:
 *   - `as any`
 *   - `as unknown as Foo` (a doubled cast that defeats type checking)
 *   - `// @ts-ignore` (without an explanatory comment on the same or
 *     adjacent line)
 *   - `// @ts-expect-error` (without explanation)
 *   - `: any` annotations (excluding common-and-safe usages like
 *     `Record<string, any>` in JSON parsing contexts)
 *
 * AST-augmented (matches AsExpression nodes precisely) but ships a
 * working regex fallback when typescript is not installed.
 */

import type { Finding, Rule, RuleContext } from "../types";
import type { TypeScriptModule } from "../ast/ts-loader";
import { walkNodes } from "../ast/visitor";

const REGEX_PATTERNS: ReadonlyArray<{ readonly id: string; readonly re: RegExp; readonly message: string }> = [
  {
    id: "as-any",
    re: /\bas\s+any\b/g,
    message: "`as any` cast bypasses type safety. Narrow with a type guard or `unknown` + validation.",
  },
  {
    id: "double-as",
    re: /\bas\s+unknown\s+as\s+\w+/g,
    message: "`as unknown as X` is a forced cast that disables type checking. Use a type guard.",
  },
  {
    id: "ts-ignore",
    re: /\/\/\s*@ts-ignore\b/g,
    message: "`@ts-ignore` suppresses a type error. Prefer `@ts-expect-error WITH an explanation comment` so the suppression dies if the error stops occurring.",
  },
  {
    id: "ts-expect-error-bare",
    re: /\/\/\s*@ts-expect-error\s*$/gm,
    message: "`@ts-expect-error` without a trailing explanation. Add a one-sentence reason so future readers know why the suppression exists.",
  },
  {
    id: "any-annotation",
    re: /:\s*any(?:\b|\s|;|,|=|\)|$)/g,
    message: "`: any` annotation. Use `unknown` and narrow at use, or define a proper type.",
  },
];

export const typeSafetyBypassesRule: Rule = {
  id: "type-safety-bypasses",
  severity: "warn",
  description:
    "Source contains type-safety bypasses (as any, as unknown as, @ts-ignore, : any). Each is a real loss of typecheck coverage and a common AI-vibe tell.",
  regex(ctx: RuleContext): readonly Finding[] {
    if (!isTypeScriptFile(ctx.file)) return [];
    const findings: Finding[] = [];
    const lines = ctx.source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      // Allow the safe `Record<string, any>` shape commonly used at JSON
      // boundaries - too noisy otherwise.
      if (/Record<\s*\w+\s*,\s*any\s*>/.test(line)) continue;
      for (const p of REGEX_PATTERNS) {
        p.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = p.re.exec(line)) !== null) {
          findings.push({
            ruleId: "type-safety-bypasses",
            severity: "warn",
            message: `${p.id}: ${p.message}`,
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
    if (!isTypeScriptFile(ctx.file)) return [];
    const ts = ctx.tsAst.ts as TypeScriptModule;
    const sf = ctx.tsAst.sourceFile;
    const findings: Finding[] = [];

    walkNodes(ts, sf, ctx.source, ({ node, line, col, snippet }) => {
      // AsExpression: `<expr> as <type>` - precision pass over `\bas\b` regex.
      if (ts.isAsExpression(node)) {
        const typeNode = (node as { type?: { kind?: number; getText?: () => string } }).type;
        if (typeNode === undefined) return;
        // SyntaxKind.AnyKeyword === 133 in modern TS but pull from enum.
        const anyKw = ts.SyntaxKind.AnyKeyword as number | undefined;
        const isAny = anyKw !== undefined && typeNode.kind === anyKw;
        if (isAny) {
          findings.push({
            ruleId: "type-safety-bypasses",
            severity: "warn",
            message: "AST-confirmed `as any` cast. Use a type guard or `unknown` + validation.",
            file: ctx.file,
            line,
            col,
            snippet,
          });
        }
      }
    });

    return findings;
  },
};

function isTypeScriptFile(file: string): boolean {
  return file.endsWith(".ts") || file.endsWith(".tsx");
}
