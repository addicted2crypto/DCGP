/**
 * @dcgp/core - public API barrel.
 *
 * This file is the ONLY module consumers should import from. Deep imports
 * (e.g., `@dcgp/core/src/monitor/EntropyMonitor`) are not part of the public
 * surface and may change between minor versions. The set of names exported
 * here is snapshot-tested - see `public-surface.txt`.
 *
 * Conformance: DCGP-1.0-FULL + EXTENDED. See ./DCGP-SPEC.md.
 */

/* ── Types ──────────────────────────────────────────────────────────────── */

export type {
  Severity,
  GateContext,
  SignalsInput,
  Signals,
  SignalWeights,
  AnchorInput,
  Anchor,
  GateInput,
  Gate,
  DriftRuleInput,
  DriftRule,
  RetentionRule,
  Compression,
  ContextPathInput,
  ContextPath,
  GateViolation,
  DriftEvent,
} from "./types/ContextPath";
export { DEFAULT_SIGNAL_WEIGHTS } from "./types/ContextPath";

export type {
  EntropyFactorName,
  EntropyWeights,
  EntropyFactor,
  EntropyAction,
  EntropyEvent,
  EntropyTurnInput,
  EntropyState,
} from "./types/Entropy";
export {
  EntropyLevel,
  DEFAULT_ENTROPY_WEIGHTS,
  CONFIDENCE_UNKNOWN_PENALTY,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_AGE_SATURATION_TURN,
  HYSTERESIS_TURNS,
  COOLDOWN_ELEVATED_TURNS,
  COOLDOWN_HIGH_TURNS,
  COOLDOWN_CRITICAL_TURNS,
  ANCHOR_REINJECT_COOLDOWN_TURNS,
  CLASSIFIER_TTL_TURNS,
  WARMUP_TURNS,
  THRESHOLD_ELEVATED,
  THRESHOLD_HIGH,
  THRESHOLD_CRITICAL,
  CITATION_MIN_MATCH_LENGTH,
} from "./types/Entropy";

export type { RetentionDirective } from "./types/Directive";
export { PruneIntensity, PRUNE_INTENSITY_FLOOR } from "./types/Directive";

export type {
  DomainShift,
  TurnRecord,
  SessionStats,
  DCGPSessionState,
} from "./types/Session";
export { emptySessionState } from "./types/Session";

/* ── Utilities ──────────────────────────────────────────────────────────── */

export { clamp } from "./utils/clamp";
export { KahanAccumulator, kahanSum } from "./utils/kahan";
export { toGlobalPattern, globToRegExp, findAllMatches, countMatches } from "./utils/regex";

/* ── Core engine ────────────────────────────────────────────────────────── */

export { EntropyMonitor } from "./monitor/EntropyMonitor";
export { FingerprintEngine, ALWAYS_IGNORE } from "./classifier/FingerprintEngine";
export { DomainClassifier, COLLISION_DELTA, SHIFT_COOLDOWN_TURNS } from "./classifier/DomainClassifier";
export { RetentionScorer } from "./pruner/RetentionScorer";
export { HallucinationGate } from "./gates/HallucinationGate";
export { DomainDriftDetector } from "./gates/DomainDriftDetector";
export {
  ContextInjector,
  ANCHOR_BLOAT_RATIO,
  ANCHOR_DEMOTION_PRIORITY,
} from "./injector/ContextInjector";
export { CascadeResolver } from "./loader/CascadeResolver";
export { SessionState } from "./state/SessionState";

/* ── Schema validation ──────────────────────────────────────────────────── */

export { definePath, DCGPValidationError, MAX_REGEX_PATTERN_LENGTH } from "./schema/validate";

/* ── EXTENDED: Fine-tuning export ───────────────────────────────────────── */

export { FineTuningExporter } from "./export/FineTuningExporter";
export type {
  ExportFormat,
  TrainingExample,
  SessionEventLog,
} from "./export/FineTuningExporter";
