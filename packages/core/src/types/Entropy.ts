// @dcgp-audit-ignore-file comment-density-imbalance - public type file with spec-contract JSDoc on every constant.
/**
 * Types for the EntropyMonitor (DCGP-SPEC.md § 7).
 *
 * Five-factor health formula (§ 7.1 amended):
 *   score = gate_pressure     × 0.30
 *         + drift_pressure    × 0.25
 *         + confidence_decay  × 0.20
 *         + citation_pressure × 0.20
 *         + session_age       × 0.05
 */

import type { RetentionDirective } from "./Directive";

export enum EntropyLevel {
  NOMINAL = "nominal",
  ELEVATED = "elevated",
  HIGH = "high",
  CRITICAL = "critical",
}

export type EntropyFactorName =
  | "gate_pressure"
  | "drift_pressure"
  | "confidence_decay"
  | "citation_pressure"
  | "session_age";

export interface EntropyWeights {
  readonly gate_pressure: number;
  readonly drift_pressure: number;
  readonly confidence_decay: number;
  readonly citation_pressure: number;
  readonly session_age: number;
}

export const DEFAULT_ENTROPY_WEIGHTS: EntropyWeights = {
  gate_pressure: 0.3,
  drift_pressure: 0.25,
  confidence_decay: 0.2,
  citation_pressure: 0.2,
  session_age: 0.05,
} as const;

/**
 * Per-factor breakdown recorded on every EntropyEvent. Enables per-domain
 * analysis and is consumed by FineTuningExporter to label training examples
 * with the primary driver of each entropy correction.
 */
export interface EntropyFactor {
  readonly name: EntropyFactorName;
  /** The raw signal count (e.g., number of violations in window). */
  readonly rawValue: number;
  /** Raw normalized to [0, 1] per the factor formula (§ 7.2). */
  readonly normalized: number;
  /** The weight applied to this factor (per EntropyWeights). */
  readonly weight: number;
  /** normalized × weight - the factor's contribution to the final score. */
  readonly contribution: number;
}

export type EntropyAction =
  | { readonly kind: "reinject_anchors" }
  | { readonly kind: "suggest_compression" }
  | { readonly kind: "force_reclassify" }
  | { readonly kind: "invalidate_fingerprint" }
  | { readonly kind: "inject_correction"; readonly text: string };

/**
 * Emitted by EntropyMonitor on every level transition. The Directive is
 * always attached - this binds the context-pruning point to every entropy
 * event and closes the "thermometer vs thermostat" gap.
 */
export interface EntropyEvent {
  readonly level: EntropyLevel;
  readonly score: number;
  readonly previousScore: number;
  readonly factors: readonly EntropyFactor[];
  readonly actions: readonly EntropyAction[];
  /** Non-null at HIGH and CRITICAL; null at NOMINAL and ELEVATED. */
  readonly contextCorrection: string | null;
  readonly turn: number;
  readonly message: string;
  readonly directive: RetentionDirective;
}

/**
 * Per-turn input to EntropyMonitor.record().
 *
 * - gateViolations/driftEvents are non-negative counts over the turn
 * - confidence is [0, 1] from DomainClassifier, or -1 when unknown
 * - anchorCitation is true iff the assistant output substring-matches at
 *   least one active anchor's content (normalized). Closes the silent-
 *   hallucination blind spot (§ 7.1 amendment history).
 */
export interface EntropyTurnInput {
  readonly turn: number;
  readonly gateViolations: number;
  readonly driftEvents: number;
  readonly confidence: number;
  readonly anchorCitation: boolean;
}

/**
 * Snapshot of EntropyMonitor internal state - exported for tests and for
 * SessionState persistence. Consumers should not mutate this object.
 */
export interface EntropyState {
  readonly turn: number;
  readonly score: number;
  readonly level: EntropyLevel;
  readonly peakConfidence: number;
  readonly gateWindow: readonly number[];
  readonly driftWindow: readonly number[];
  readonly confidenceWindow: readonly number[];
  readonly citationWindow: readonly boolean[];
}

/* ── Exported constants (DCGP-SPEC.md § 7) ─────────────────────────────── */

/**
 * Applied to the confidence factor when >= 50% of the confidence window
 * reads -1 (unknown). Prevents a blind spot where a silently failing
 * classifier looks healthy.
 * DCGP-SPEC.md § 7.2 (amended: "≥ 50%", not strict ">").
 */
export const CONFIDENCE_UNKNOWN_PENALTY = 0.15;

/** Default rolling window size for gate/drift/confidence/citation. */
export const DEFAULT_WINDOW_SIZE = 10;

/** Turn at which session_age saturates to 1.0. */
export const DEFAULT_AGE_SATURATION_TURN = 50;

/** Hysteresis: consecutive turns required before firing non-CRITICAL. */
export const HYSTERESIS_TURNS = 2;

/** Same-level emission cooldowns (§ 7.5). */
export const COOLDOWN_ELEVATED_TURNS = 5;
export const COOLDOWN_HIGH_TURNS = 3;
export const COOLDOWN_CRITICAL_TURNS = 1;

/** Anchor re-injection rate limit (§ 7.5, Failure Mode #7). */
export const ANCHOR_REINJECT_COOLDOWN_TURNS = 3;

/** Forced reclassify cadence (§ 7.6-bis, Failure Mode #6). */
export const CLASSIFIER_TTL_TURNS = 20;

/** Warmup blindspot bypass window (Failure Mode #3). */
export const WARMUP_TURNS = 3;

/** Level-entry thresholds. Ranges are [entry, nextEntry). CRITICAL closes. */
export const THRESHOLD_ELEVATED = 0.4;
export const THRESHOLD_HIGH = 0.7;
export const THRESHOLD_CRITICAL = 0.9;

/** Minimum substring length when matching anchor content for citation. */
export const CITATION_MIN_MATCH_LENGTH = 8;
