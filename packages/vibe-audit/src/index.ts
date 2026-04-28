/**
 * @dcgp/vibe-audit - public API.
 *
 * Programmatic usage:
 *   import { auditWorkspace, BUILTIN_RULES } from "@dcgp/vibe-audit";
 *   const report = await auditWorkspace(BUILTIN_RULES, { dir: process.cwd() });
 *
 * CLI usage: see `dcgp audit` (provided by @dcgp/cli).
 * MCP usage: see `dcgp_audit_vibe` tool (provided by @dcgp/mcp).
 */

export { auditWorkspace, MAX_FILE_SIZE_BYTES } from "./runner";
export { BUILTIN_RULES } from "./rules";
export { tryLoadTypeScript } from "./ast/ts-loader";
export { walkSourceFiles, DEFAULT_EXTENSIONS } from "./file-walker";
export { loadAuditConfig, parseIgnoreDirectives, isIgnored } from "./config";

export { formatJson } from "./formatters/json";
export { formatTty } from "./formatters/tty";
export { formatMarkdown } from "./formatters/markdown";
export { formatSarif } from "./formatters/sarif";

export type {
  Finding,
  Rule,
  RuleId,
  RuleContext,
  Severity,
  AuditOptions,
  AuditReport,
  AuditConfig,
  IgnoreDirective,
  TsAstHandle,
} from "./types";
