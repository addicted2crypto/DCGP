// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
/**
 * Rule: hardcoded-credentials
 *
 * Critical-severity. Catches the worst common AI vibe-bug: a fabricated
 * API key, password, or token left in the source. Each pattern targets
 * a known shape (provider key prefixes, AWS access key format, JWT
 * three-segment shape, generic `password = "..."` literals).
 *
 * Cost of false positive: low (annoying, but easy to ignore via
 * `// @dcgp-audit-ignore-next-line hardcoded-credentials`).
 * Cost of false negative: catastrophic (a published repo leaks a key).
 */

import type { Finding, Rule, RuleContext } from "../types";

interface CredPattern {
  readonly id: string;
  readonly re: RegExp;
  readonly description: string;
}

const PATTERNS: readonly CredPattern[] = [
  {
    id: "openai-key",
    re: /\bsk-[A-Za-z0-9]{20,}\b/g,
    description: "OpenAI-style API key literal (sk-...)",
  },
  {
    id: "anthropic-key",
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    description: "Anthropic-style API key literal (sk-ant-...)",
  },
  {
    id: "aws-access-key",
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    description: "AWS access key id",
  },
  {
    id: "aws-secret-key",
    re: /aws_secret_access_key\s*[:=]\s*["'][A-Za-z0-9/+=]{40}["']/gi,
    description: "AWS secret access key literal",
  },
  {
    id: "github-token",
    re: /\bghp_[A-Za-z0-9]{36}\b|\bgho_[A-Za-z0-9]{36}\b|\bghs_[A-Za-z0-9]{36}\b/g,
    description: "GitHub personal access token",
  },
  {
    id: "google-api-key",
    re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    description: "Google API key",
  },
  {
    id: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    description: "JSON Web Token literal",
  },
  {
    id: "password-literal",
    re: /\b(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{8,}["']/gi,
    description: "Hardcoded password literal",
  },
  {
    id: "api-key-literal",
    re: /\b(?:api_?key|apikey|secret_?key)\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["']/gi,
    description: "Hardcoded api/secret key literal",
  },
  {
    id: "bearer-token",
    re: /Bearer\s+[A-Za-z0-9_.~+/=-]{20,}/g,
    description: "Bearer token literal",
  },
];

export const hardcodedCredentialsRule: Rule = {
  id: "hardcoded-credentials",
  severity: "critical",
  description:
    "Source contains a hardcoded credential (API key, AWS key, JWT, password literal). Move to env vars or a secrets manager.",
  regex(ctx: RuleContext): readonly Finding[] {
    const findings: Finding[] = [];
    const lines = ctx.source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      // Allow placeholder examples (clearly fake).
      if (/(?:YOUR_|EXAMPLE_|PLACEHOLDER|TODO_|REPLACE_|XXXXXXXX)/i.test(line)) continue;
      for (const pat of PATTERNS) {
        pat.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pat.re.exec(line)) !== null) {
          findings.push({
            ruleId: "hardcoded-credentials",
            severity: "critical",
            message: `${pat.description} (${pat.id}). Move to env var or secret manager.`,
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
};
