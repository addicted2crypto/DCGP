// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
/**
 * Public types for @dcgp/vibe-audit.
 *
 * `Severity` mirrors @dcgp/core's runtime gate severity so audit findings
 * and runtime gate violations share one tier system.
 */

import type { Severity } from "@dcgp/core";

export type { Severity };

export type RuleId =
  | "stub-markers"
  | "type-safety-bypasses"
  | "hardcoded-credentials"
  | "command-injection"
  | "test-theater"
  | "predictable-randomness"
  | "regex-redos-risk"
  | "comment-density-imbalance";

/**
 * One finding from one rule applied to one file. File paths are repository-
 * relative (forward-slash form) so reports diff cleanly across platforms.
 */
export interface Finding {
  readonly ruleId: RuleId;
  readonly severity: Severity;
  readonly message: string;
  readonly file: string;
  readonly line: number;
  readonly col: number;
  /** The matched text or short context excerpt. */
  readonly snippet: string;
}

/**
 * Inputs a rule receives when scanning a file. Rules are pure functions
 * over this context: no I/O, no globals, no shared state.
 */
export interface RuleContext {
  readonly file: string;
  readonly source: string;
  /** Lazy access to the TypeScript AST when available; null in regex-only mode. */
  readonly tsAst: TsAstHandle | null;
  /** Parsed ignore directives from source comments. */
  readonly ignoreDirectives: readonly IgnoreDirective[];
}

/**
 * Opaque handle to a typescript SourceFile. Rules cast this through
 * `getSourceFile()` to avoid pulling typescript types into the public API
 * surface (typescript is a peer dep, optional).
 */
export interface TsAstHandle {
  /** SourceFile from the typescript compiler API. Typed as unknown for export. */
  readonly sourceFile: unknown;
  /** The typescript module itself, for `forEachChild` and `SyntaxKind` access. */
  readonly ts: unknown;
}

/** Per-file ignore directive parsed from source comments. */
export interface IgnoreDirective {
  /** Either a specific rule id, or "*" for all rules. */
  readonly ruleId: RuleId | "*";
  /** "file" disables for whole file; "next-line" disables only the line below. */
  readonly scope: "file" | "next-line";
  /** Line number of the directive comment (1-based). */
  readonly line: number;
}

/** A rule definition. Most rules need only `regex`; AST rules also set `ast`. */
export interface Rule {
  readonly id: RuleId;
  readonly severity: Severity;
  readonly description: string;
  /**
   * The regex-mode detector. Always present so the rule degrades gracefully
   * when typescript is not installed.
   */
  regex(ctx: RuleContext): readonly Finding[];
  /**
   * Optional AST-mode detector. Used when `ctx.tsAst !== null`. May produce
   * findings the regex pass cannot see; should NOT duplicate regex findings.
   */
  ast?(ctx: RuleContext): readonly Finding[];
}

/** Inputs to the top-level auditor. */
export interface AuditOptions {
  /** Directory to scan. Default: cwd. */
  readonly dir?: string;
  /** Restrict to a single rule id. Default: all enabled rules. */
  readonly rule?: RuleId;
  /** Drop findings below this severity. Default: include all. */
  readonly minSeverity?: Severity;
  /** Force regex-only mode even when typescript is installed. Default: false. */
  readonly noTs?: boolean;
  /**
   * Glob patterns of files to scan. Default: typical source extensions
   * (`**\/*.ts`, `**\/*.tsx`, `**\/*.js`, `**\/*.jsx`, `**\/*.mjs`, `**\/*.cjs`).
   */
  readonly include?: readonly string[];
  /**
   * Glob patterns to exclude on top of the always-ignored directory list.
   * Default: none.
   */
  readonly exclude?: readonly string[];
}

/** Audit run result. */
export interface AuditReport {
  readonly findings: readonly Finding[];
  readonly stats: {
    readonly filesScanned: number;
    readonly rulesRun: number;
    readonly tsAstAvailable: boolean;
    readonly elapsedMs: number;
    readonly bySeverity: Readonly<Record<Severity, number>>;
    readonly byRule: Readonly<Partial<Record<RuleId, number>>>;
  };
}

/** Project-level config from `.dcgp/audit.config.json`. */
export interface AuditConfig {
  /** Disable specific rules entirely for the whole repo. */
  readonly disabled?: readonly RuleId[];
  /** Disable rules per glob pattern. */
  readonly perGlob?: readonly { readonly glob: string; readonly disabled: readonly RuleId[] }[];
  /** Override the default include/exclude globs. */
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
}
