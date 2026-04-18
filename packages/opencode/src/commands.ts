/**
 * /dcgp slash commands - renders text-only output suitable for injection
 * into a chat transcript. Decoupled from any host rendering API so the
 * same commands work in OpenCode, CLI, or any tool that can emit text.
 */

import { ALL_PATHS } from "@dcgp/paths";
import { EntropyLevel, type ContextPath, type EntropyEvent } from "@dcgp/core";

import type { DCGPRuntime } from "./runtime";

type CommandHandler = (runtime: DCGPRuntime, args: string[]) => string;

export const SLASH_COMMANDS: Readonly<Record<string, CommandHandler>> = {
  status: cmdStatus,
  domain: cmdDomain,
  paths: cmdPaths,
  set: cmdSet,
  gates: cmdGates,
  entropy: cmdEntropy,
  export: cmdExport,
  help: cmdHelp,
};

export function dispatch(runtime: DCGPRuntime, input: string): string {
  const trimmed = input.trim().replace(/^\/dcgp\s*/, "");
  const [name, ...rest] = trimmed.split(/\s+/);
  const handler = name !== undefined && name in SLASH_COMMANDS ? SLASH_COMMANDS[name] : cmdHelp;
  return handler!(runtime, rest);
}

function cmdStatus(runtime: DCGPRuntime): string {
  const state = runtime.snapshotState();
  const level = runtime.monitor.currentLevel();
  const score = runtime.monitor.currentScore();
  const directive = runtime.monitor.currentDirective();
  const bar = renderEntropyBar(score);
  return [
    `DCGP status`,
    `  Domain      : ${state.activeDomainId ?? "(unclassified)"}`,
    `  Confidence  : ${formatConf(state.classificationConfidence)}`,
    `  Entropy     : ${level.toUpperCase()} ${bar} ${(score * 100).toFixed(0)}%`,
    `  Directive   : ${directive.intensity} (floor=${directive.globalFloor.toFixed(2)})`,
    `  Turn        : ${state.currentTurn}`,
    `  Gate hits   : ${state.stats.totalGateViolations}`,
    `  Drift hits  : ${state.stats.totalDriftEvents}`,
    `  Corrections : ${state.stats.totalCorrectionsInjected}`,
  ].join("\n");
}

function cmdDomain(runtime: DCGPRuntime): string {
  const shifts = runtime.state.snapshot().domainShiftLog;
  if (shifts.length === 0) return "No domain shifts recorded this session.";
  const rows = shifts.map(
    (s) => `  turn ${s.turn.toString().padStart(4)}  ${s.fromDomainId ?? "?"} -> ${s.toDomainId ?? "?"}${s.suppressed ? "  (suppressed)" : ""}`,
  );
  return `Domain shift log (${shifts.length}):\n${rows.join("\n")}`;
}

function cmdPaths(runtime: DCGPRuntime): string {
  const ids = runtime.classifier.registeredIds;
  return `Registered paths (${ids.length}):\n${ids.map((i) => `  - ${i}`).join("\n")}`;
}

function cmdSet(runtime: DCGPRuntime, args: string[]): string {
  const target = args[0];
  if (target === undefined) return "Usage: /dcgp set <domain-id>";
  const path: ContextPath | undefined = [...ALL_PATHS].find((p) => p.id === target);
  if (path === undefined) return `No such registered path: ${target}`;
  runtime.state.setActiveDomain(target, 1.0, runtime.state.snapshot().currentTurn);
  return `Active domain manually set to ${target}.`;
}

function cmdGates(runtime: DCGPRuntime): string {
  const violations = runtime.state.snapshot().gateViolations;
  if (violations.length === 0) return "No gate violations this session.";
  return [
    `Gate violations (${violations.length}):`,
    ...violations
      .slice(-10)
      .map(
        (v) =>
          `  turn ${v.turn.toString().padStart(4)}  [${v.severity}] ${v.ruleId}: ${v.message}`,
      ),
  ].join("\n");
}

function cmdEntropy(runtime: DCGPRuntime): string {
  const score = runtime.monitor.currentScore();
  const level = runtime.monitor.currentLevel();
  const directive = runtime.monitor.currentDirective();
  return [
    `Entropy health: ${level.toUpperCase()} @ ${(score * 100).toFixed(1)}%`,
    `Directive: ${directive.reason}`,
    `Floor: ${directive.globalFloor.toFixed(2)}  (consumers keep blocks scoring >= floor)`,
    `See DCGP-SPEC.md § 7 for the full formula.`,
  ].join("\n");
}

function cmdExport(runtime: DCGPRuntime, args: string[]): string {
  const formatArg = args[0] ?? "openai";
  const validFormats = ["openai", "anthropic", "huggingface"] as const;
  const format = validFormats.find((f) => f === formatArg);
  if (format === undefined) {
    return `Unknown format '${formatArg}'. Options: ${validFormats.join(", ")}.`;
  }
  const state = runtime.state.snapshot();
  const examples = runtime.exporter.buildExamples({
    gateViolations: state.gateViolations,
    driftEvents: state.driftEvents,
    entropyEvents: state.entropyEvents as EntropyEvent[],
    activeDomainId: state.activeDomainId,
  });
  const summary = runtime.exporter.summarize(examples);
  const jsonl = runtime.exporter.serialize(examples, format);
  return [
    `Exported ${summary.total} training examples (${format}).`,
    `  Gate: ${summary.bySource.gate}  Drift: ${summary.bySource.drift}  Entropy: ${summary.bySource.entropy}`,
    ``,
    jsonl,
  ].join("\n");
}

function cmdHelp(): string {
  return [
    "DCGP slash commands:",
    "  /dcgp status              Domain, confidence, entropy bar, directive",
    "  /dcgp domain              Shift history this session",
    "  /dcgp paths               List registered community paths",
    "  /dcgp set <domain-id>     Manually override active domain",
    "  /dcgp gates               Gate violation history",
    "  /dcgp entropy             Health score + factor breakdown",
    "  /dcgp export [format]     Emit training examples (openai|anthropic|huggingface)",
    "  /dcgp help                This message",
  ].join("\n");
}

function formatConf(c: number): string {
  return c < 0 ? "unknown (-1)" : `${(c * 100).toFixed(1)}%`;
}

function renderEntropyBar(score: number): string {
  const total = 20;
  const filled = Math.min(total, Math.max(0, Math.round(score * total)));
  return `[${"=".repeat(filled)}${".".repeat(total - filled)}]`;
}

export function levelColor(level: EntropyLevel): string {
  switch (level) {
    case EntropyLevel.NOMINAL:
      return "green";
    case EntropyLevel.ELEVATED:
      return "yellow";
    case EntropyLevel.HIGH:
      return "red";
    case EntropyLevel.CRITICAL:
      return "magenta";
  }
}
