/**
 * Types for the .dcgp.json schema (DCGP-SPEC.md § 3) and related runtime
 * event records. These are pure type declarations - no runtime behavior.
 * All validation happens in ../schema/validate.ts via Zod.
 *
 * Two variants exist for patterns:
 *   - *Input types  - what users write in .dcgp.json (pattern: string | RegExp)
 *   - "final" types - post-validation, normalized shape (pattern: RegExp)
 */

export type Severity = "info" | "warn" | "error" | "critical";
export type GateContext = "output" | "input" | "both";

export interface SignalsInput {
  readonly files?: readonly string[];
  readonly packages?: readonly string[];
  readonly keywords?: readonly string[];
  readonly tools?: readonly string[];
  readonly env?: readonly string[];
  readonly gitBranch?: readonly string[];
  readonly weights?: Partial<SignalWeights>;
}

export type Signals = SignalsInput;

export interface SignalWeights {
  readonly packages: number;
  readonly files: number;
  readonly gitBranch: number;
  readonly env: number;
  readonly tools: number;
  readonly keywords: number;
}

export const DEFAULT_SIGNAL_WEIGHTS: SignalWeights = {
  packages: 0.95,
  files: 0.9,
  gitBranch: 0.9,
  env: 0.85,
  tools: 0.75,
  keywords: 0.6,
} as const;

export interface AnchorInput {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly priority: number;
  readonly whenSignals?: readonly string[];
}

export type Anchor = AnchorInput;

export interface GateInput {
  readonly id: string;
  readonly pattern: string | RegExp;
  readonly severity: Severity;
  readonly message: string;
  readonly suggest?: string;
  readonly context: GateContext;
}

export interface Gate extends Omit<GateInput, "pattern"> {
  readonly pattern: RegExp;
}

export interface DriftRuleInput {
  readonly sourceDomain: string;
  readonly pattern: string | RegExp;
  readonly severity: Severity;
  readonly correction: string;
}

export interface DriftRule extends Omit<DriftRuleInput, "pattern"> {
  readonly pattern: RegExp;
}

export interface RetentionRule {
  readonly pattern: string;
  readonly score: number;
  readonly reason?: string;
}

export interface Compression {
  readonly protectedTerms?: readonly string[];
  readonly neverPrune?: readonly string[];
  readonly summarizeAs?: string;
  readonly retention?: readonly RetentionRule[];
}

export interface ContextPathInput {
  readonly id: string;
  readonly version?: string;
  readonly name: string;
  readonly description?: string;
  readonly extends?: string;
  readonly tags?: readonly string[];
  readonly signals: SignalsInput;
  readonly anchors?: readonly AnchorInput[];
  readonly gates?: readonly GateInput[];
  readonly driftRules?: readonly DriftRuleInput[];
  readonly compression?: Compression;
}

export interface ContextPath {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description?: string;
  readonly extends?: string;
  readonly tags: readonly string[];
  readonly signals: Signals;
  readonly anchors: readonly Anchor[];
  readonly gates: readonly Gate[];
  readonly driftRules: readonly DriftRule[];
  readonly compression: Compression;
}

/* ── Runtime event records ──────────────────────────────────────────────── */

/**
 * A record appended to SessionState whenever HallucinationGate fires.
 * The exporter consumes these to build training examples.
 */
export interface GateViolation {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly message: string;
  readonly turn: number;
  readonly violatingText?: string;
  readonly correctionMessage?: string;
}

/**
 * A record appended to SessionState whenever DomainDriftDetector fires.
 */
export interface DriftEvent {
  readonly sourceDomain: string;
  readonly matched: string;
  readonly correctionInjected: boolean;
  readonly turn: number;
  readonly correction?: string;
}
