/**
 * HallucinationGate - Step 6 of the 7-step loop.
 *
 * Runs the active ContextPath's gates against assistant output (or input).
 * Each fired gate produces a GateViolation which SessionState persists and
 * EntropyMonitor consumes as gate_pressure signal.
 *
 * Warmup bypass (Failure Mode #3): violations at turn <= WARMUP_TURNS are
 * flagged so ContextInjector can force anchor re-inject even without
 * EntropyMonitor hysteresis clearing.
 */

import type { ContextPath, Gate, GateContext, GateViolation } from "../types/ContextPath";
import { WARMUP_TURNS } from "../types/Entropy";
import { countMatches } from "../utils/regex";

export interface GateScanResult {
  readonly violations: readonly GateViolation[];
  readonly warmupBypass: boolean;
}

export class HallucinationGate {
  private path: ContextPath | null = null;

  activate(path: ContextPath | null): void {
    this.path = path;
  }

  scan(
    text: string,
    opts: { turn: number; context: Extract<GateContext, "output" | "input"> },
  ): GateScanResult {
    if (this.path === null) {
      return { violations: [], warmupBypass: false };
    }
    const violations: GateViolation[] = [];
    for (const gate of this.path.gates) {
      if (!this.matchesContext(gate, opts.context)) continue;
      const hits = countMatches(text, gate.pattern);
      if (hits === 0) continue;
      const match = text.match(gate.pattern);
      violations.push({
        ruleId: gate.id,
        severity: gate.severity,
        message: gate.message,
        turn: opts.turn,
        violatingText: match ? match[0] : undefined,
        correctionMessage: gate.suggest,
      });
    }
    const warmupBypass = opts.turn <= WARMUP_TURNS && violations.length > 0;
    return { violations, warmupBypass };
  }

  get patternCount(): number {
    return this.path?.gates.length ?? 0;
  }

  private matchesContext(gate: Gate, context: "output" | "input"): boolean {
    return gate.context === "both" || gate.context === context;
  }
}

/**
 * Default (domain-neutral) Hallucination patterns. Phase A ships a small
 * curated set - Phase B extends this with per-domain patterns via
 * community paths.
 */
export const BUILTIN_GATE_PATTERNS: ReadonlyArray<
  Omit<Gate, "pattern"> & { pattern: RegExp }
> = [
  {
    id: "todo-stub",
    pattern: /(?:TODO|FIXME|XXX):\s*implement/i,
    severity: "warn",
    message: "Unimplemented stub - flesh out or remove.",
    context: "output",
  },
  {
    id: "placeholder-value",
    pattern: /["'](?:YOUR_|INSERT_|REPLACE_|CHANGE_ME|TODO_)[A-Z_]+["']/,
    severity: "warn",
    message: "Placeholder literal left in code.",
    context: "output",
  },
  {
    id: "made-up-api-key",
    pattern: /(?:sk|pk|api)_[a-z]{3,10}_[a-zA-Z0-9]{8,}/,
    severity: "critical",
    message: "Looks like a fabricated API key. Use env vars, not inline literals.",
    context: "output",
  },
  {
    id: "nonexistent-flag",
    pattern: /--(?:please|might-work|experimental-unsafe)/,
    severity: "error",
    message: "Flag name looks invented.",
    context: "output",
  },
] as const;
