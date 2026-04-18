/**
 * EntropyMonitor - the proactive heart of DCGP.
 *
 * Computes a per-turn health score from five factors (DCGP-SPEC.md § 7.1):
 *
 *   score = gate_pressure     × 0.30
 *         + drift_pressure    × 0.25
 *         + confidence_decay  × 0.20
 *         + citation_pressure × 0.20
 *         + session_age       × 0.05
 *
 * Emits a RetentionDirective on every call to record() (the Retention
 * Bridge, § 7.7), and an EntropyEvent for every turn (transition status
 * attached). Subscribers to on('transition') are called only on level
 * changes; callers that want every-turn state should use record()'s return.
 *
 * Zero external imports. Single-threaded (Node.js event loop). All
 * cumulative float math via Kahan compensated summation.
 */

import {
  type EntropyEvent,
  type EntropyFactor,
  type EntropyAction,
  type EntropyTurnInput,
  type EntropyWeights,
  type EntropyState,
  EntropyLevel,
  DEFAULT_ENTROPY_WEIGHTS,
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
  CONFIDENCE_UNKNOWN_PENALTY,
} from "../types/Entropy";
import {
  type RetentionDirective,
  PruneIntensity,
  PRUNE_INTENSITY_FLOOR,
} from "../types/Directive";
import { clamp } from "../utils/clamp";
import { kahanSum } from "../utils/kahan";

const LEVELS_ASCENDING: readonly EntropyLevel[] = [
  EntropyLevel.NOMINAL,
  EntropyLevel.ELEVATED,
  EntropyLevel.HIGH,
  EntropyLevel.CRITICAL,
];

const LEVEL_RANK: Readonly<Record<EntropyLevel, number>> = {
  [EntropyLevel.NOMINAL]: 0,
  [EntropyLevel.ELEVATED]: 1,
  [EntropyLevel.HIGH]: 2,
  [EntropyLevel.CRITICAL]: 3,
};

const LEVEL_INTENSITY: Readonly<Record<EntropyLevel, PruneIntensity>> = {
  [EntropyLevel.NOMINAL]: PruneIntensity.PASSIVE,
  [EntropyLevel.ELEVATED]: PruneIntensity.TIGHTEN,
  [EntropyLevel.HIGH]: PruneIntensity.AGGRESSIVE,
  [EntropyLevel.CRITICAL]: PruneIntensity.NUCLEAR,
};

const COOLDOWN_TURNS: Readonly<Record<EntropyLevel, number>> = {
  [EntropyLevel.NOMINAL]: 0,
  [EntropyLevel.ELEVATED]: COOLDOWN_ELEVATED_TURNS,
  [EntropyLevel.HIGH]: COOLDOWN_HIGH_TURNS,
  [EntropyLevel.CRITICAL]: COOLDOWN_CRITICAL_TURNS,
};

export interface EntropyMonitorOptions {
  readonly weights?: EntropyWeights;
  readonly windowSize?: number;
  readonly ageSaturationTurn?: number;
  readonly thresholds?: {
    readonly elevated: number;
    readonly high: number;
    readonly critical: number;
  };
  /** Globs for protectedPaths attached to every RetentionDirective. */
  readonly protectedPaths?: readonly string[];
}

type TransitionHandler = (event: EntropyEvent) => void;

export class EntropyMonitor {
  private readonly weights: EntropyWeights;
  private readonly windowSize: number;
  private readonly ageSaturationTurn: number;
  private readonly thresholds: {
    readonly elevated: number;
    readonly high: number;
    readonly critical: number;
  };
  private readonly protectedPaths: readonly string[];

  private gateWindow: number[] = [];
  private driftWindow: number[] = [];
  private confidenceWindow: number[] = [];
  private citationWindow: boolean[] = [];

  private peakConfidence = 0;
  private lastTurn = -1;
  private currentTurn = 0;
  private currentScoreValue = 0;
  private previousScoreValue = 0;
  private emittedLevel: EntropyLevel = EntropyLevel.NOMINAL;
  private consecutiveAbove: Record<EntropyLevel, number> = {
    [EntropyLevel.NOMINAL]: 0,
    [EntropyLevel.ELEVATED]: 0,
    [EntropyLevel.HIGH]: 0,
    [EntropyLevel.CRITICAL]: 0,
  };
  private lastFiredTurnAt: Record<EntropyLevel, number> = {
    [EntropyLevel.NOMINAL]: -Infinity,
    [EntropyLevel.ELEVATED]: -Infinity,
    [EntropyLevel.HIGH]: -Infinity,
    [EntropyLevel.CRITICAL]: -Infinity,
  };
  private lastReinjectTurn = -Infinity;
  private lastClassifyTurn = 0;
  private currentDirectiveValue: RetentionDirective;
  private readonly transitionHandlers = new Set<TransitionHandler>();

  constructor(options: EntropyMonitorOptions = {}) {
    const weights = options.weights ?? DEFAULT_ENTROPY_WEIGHTS;
    this.validateWeights(weights);
    this.weights = weights;

    this.windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
    if (!Number.isInteger(this.windowSize) || this.windowSize < 1) {
      throw new Error(
        `EntropyMonitor: windowSize must be an integer >= 1 (got ${this.windowSize})`,
      );
    }

    this.ageSaturationTurn = options.ageSaturationTurn ?? DEFAULT_AGE_SATURATION_TURN;
    if (!Number.isInteger(this.ageSaturationTurn) || this.ageSaturationTurn < 2) {
      throw new Error(
        `EntropyMonitor: ageSaturationTurn must be an integer >= 2 (got ${this.ageSaturationTurn})`,
      );
    }

    this.thresholds = options.thresholds ?? {
      elevated: THRESHOLD_ELEVATED,
      high: THRESHOLD_HIGH,
      critical: THRESHOLD_CRITICAL,
    };
    this.validateThresholds();

    this.protectedPaths = options.protectedPaths ?? [];
    this.currentDirectiveValue = this.buildDirective(
      EntropyLevel.NOMINAL,
      0,
      0,
      "Initialization",
    );
  }

  /* ── Public API ─────────────────────────────────────────────────────── */

  record(input: EntropyTurnInput): EntropyEvent {
    if (input.turn <= this.lastTurn) {
      throw new Error(
        `EntropyMonitor: turn must be monotonic. Got turn=${input.turn}, last=${this.lastTurn}.`,
      );
    }
    if (input.gateViolations < 0 || !Number.isFinite(input.gateViolations)) {
      throw new Error(`EntropyMonitor: gateViolations must be >= 0 (got ${input.gateViolations})`);
    }
    if (input.driftEvents < 0 || !Number.isFinite(input.driftEvents)) {
      throw new Error(`EntropyMonitor: driftEvents must be >= 0 (got ${input.driftEvents})`);
    }

    this.lastTurn = input.turn;
    this.currentTurn = input.turn;

    // Update rolling windows (bounded at windowSize - oldest drops).
    this.pushBounded(this.gateWindow, input.gateViolations);
    this.pushBounded(this.driftWindow, input.driftEvents);
    this.pushBounded(this.confidenceWindow, input.confidence);
    this.pushBoundedBool(this.citationWindow, input.anchorCitation);

    if (input.confidence >= 0 && input.confidence > this.peakConfidence) {
      this.peakConfidence = input.confidence;
    }

    // Decrement cooldown counters (they are turn-based, not absolute).
    for (const level of LEVELS_ASCENDING) {
      if (this.lastFiredTurnAt[level] === -Infinity) continue;
      // cooldown is expressed in turns since last fire - handled in canFire()
    }

    // Compute factors.
    const factors = this.computeFactors(input);
    this.previousScoreValue = this.currentScoreValue;
    const rawScore = clamp(
      kahanSum(factors.map((f) => f.contribution)),
      0,
      1,
    );
    this.currentScoreValue = rawScore;

    const rawLevel = this.levelFromScore(rawScore);
    const previousEmittedLevel = this.emittedLevel;

    // Hysteresis counters (per level, based on raw level).
    for (const level of LEVELS_ASCENDING) {
      if (LEVEL_RANK[rawLevel] >= LEVEL_RANK[level] && level !== EntropyLevel.NOMINAL) {
        this.consecutiveAbove[level] += 1;
      } else {
        this.consecutiveAbove[level] = 0;
      }
    }

    // Transition policy:
    //  - Upgrades (rawLevel > emittedLevel) require hysteresis + cooldown,
    //    EXCEPT CRITICAL which may fire in 1 turn.
    //  - Downgrades (rawLevel < emittedLevel) are immediate (safe recovery).
    if (LEVEL_RANK[rawLevel] > LEVEL_RANK[this.emittedLevel]) {
      const targetLevel = rawLevel;
      if (this.canFire(targetLevel)) {
        this.emittedLevel = targetLevel;
        this.lastFiredTurnAt[targetLevel] = input.turn;
      }
    } else if (LEVEL_RANK[rawLevel] < LEVEL_RANK[this.emittedLevel]) {
      this.emittedLevel = rawLevel;
    }

    const transitioned = this.emittedLevel !== previousEmittedLevel;

    // Assemble per-turn actions. Respects reinject cooldown + classifier TTL +
    // warmup bypass. These are orthogonal to level transitions - they can
    // fire on non-transition turns too.
    const actions = this.computeActions(input, transitioned);

    // Context correction: null at NOMINAL/ELEVATED, generated at HIGH/CRITICAL.
    const contextCorrection = this.buildContextCorrection(this.emittedLevel, rawScore);

    // Directive - always emitted, bound to emittedLevel (§ 7.7).
    this.currentDirectiveValue = this.buildDirective(
      this.emittedLevel,
      input.turn,
      rawScore,
      `Level ${this.emittedLevel.toUpperCase()} (score=${rawScore.toFixed(3)})`,
    );

    const event: EntropyEvent = {
      level: this.emittedLevel,
      score: rawScore,
      previousScore: this.previousScoreValue,
      factors,
      actions,
      contextCorrection,
      turn: input.turn,
      message: this.buildMessage(input.turn, this.emittedLevel, rawScore, transitioned),
      directive: this.currentDirectiveValue,
    };

    if (transitioned) {
      for (const handler of this.transitionHandlers) {
        handler(event);
      }
    }

    return event;
  }

  currentScore(): number {
    return this.currentScoreValue;
  }

  currentLevel(): EntropyLevel {
    return this.emittedLevel;
  }

  currentDirective(): RetentionDirective {
    return this.currentDirectiveValue;
  }

  /** Partial reset on domain shift - preserves gate/drift windows. */
  resetPartial(): void {
    this.confidenceWindow = [];
    this.citationWindow = [];
    this.peakConfidence = 0;
  }

  /** Full reset on CRITICAL or session restart. */
  reset(): void {
    this.gateWindow = [];
    this.driftWindow = [];
    this.confidenceWindow = [];
    this.citationWindow = [];
    this.peakConfidence = 0;
    this.lastTurn = -1;
    this.currentTurn = 0;
    this.currentScoreValue = 0;
    this.previousScoreValue = 0;
    this.emittedLevel = EntropyLevel.NOMINAL;
    this.consecutiveAbove = {
      [EntropyLevel.NOMINAL]: 0,
      [EntropyLevel.ELEVATED]: 0,
      [EntropyLevel.HIGH]: 0,
      [EntropyLevel.CRITICAL]: 0,
    };
    this.lastFiredTurnAt = {
      [EntropyLevel.NOMINAL]: -Infinity,
      [EntropyLevel.ELEVATED]: -Infinity,
      [EntropyLevel.HIGH]: -Infinity,
      [EntropyLevel.CRITICAL]: -Infinity,
    };
    this.lastReinjectTurn = -Infinity;
    this.lastClassifyTurn = 0;
    this.currentDirectiveValue = this.buildDirective(
      EntropyLevel.NOMINAL,
      0,
      0,
      "Reset",
    );
  }

  on(_event: "transition", handler: TransitionHandler): () => void {
    this.transitionHandlers.add(handler);
    return () => this.transitionHandlers.delete(handler);
  }

  snapshot(): EntropyState {
    return {
      turn: this.currentTurn,
      score: this.currentScoreValue,
      level: this.emittedLevel,
      peakConfidence: this.peakConfidence,
      gateWindow: [...this.gateWindow],
      driftWindow: [...this.driftWindow],
      confidenceWindow: [...this.confidenceWindow],
      citationWindow: [...this.citationWindow],
    };
  }

  /* ── Internal ───────────────────────────────────────────────────────── */

  private validateWeights(w: EntropyWeights): void {
    const values = [
      w.gate_pressure,
      w.drift_pressure,
      w.confidence_decay,
      w.citation_pressure,
      w.session_age,
    ];
    for (const v of values) {
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(
          `EntropyMonitor: every weight must lie in [0, 1]. Got ${JSON.stringify(w)}`,
        );
      }
    }
    const sum = kahanSum(values);
    if (Math.abs(sum - 1) > 0.001) {
      throw new Error(
        `EntropyMonitor: weights must sum to 1.0 ± 0.001. Got sum=${sum} for ${JSON.stringify(w)}`,
      );
    }
  }

  private validateThresholds(): void {
    const { elevated, high, critical } = this.thresholds;
    if (!(elevated > 0 && elevated < high && high < critical && critical <= 1)) {
      throw new Error(
        `EntropyMonitor: thresholds must be 0 < elevated < high < critical <= 1 (got ${JSON.stringify(this.thresholds)})`,
      );
    }
  }

  private pushBounded(window: number[], value: number): void {
    window.push(value);
    if (window.length > this.windowSize) window.shift();
  }

  private pushBoundedBool(window: boolean[], value: boolean): void {
    window.push(value);
    if (window.length > this.windowSize) window.shift();
  }

  private computeFactors(input: EntropyTurnInput): EntropyFactor[] {
    const gateSum = kahanSum(this.gateWindow);
    const driftSum = kahanSum(this.driftWindow);

    const gateNorm = Math.min(1, gateSum / (this.windowSize * 3));
    const driftNorm = Math.min(1, driftSum / (this.windowSize * 2));

    // Confidence decay - with blind-spot penalty.
    const unknownCount = this.confidenceWindow.reduce(
      (acc, v) => (v === -1 ? acc + 1 : acc),
      0,
    );
    const confNorm =
      this.confidenceWindow.length > 0 &&
      unknownCount / this.confidenceWindow.length >= 0.5
        ? CONFIDENCE_UNKNOWN_PENALTY
        : input.confidence < 0 || this.peakConfidence <= 0
          ? 0
          : Math.max(0, (this.peakConfidence - input.confidence) / this.peakConfidence);

    // Citation pressure - fraction of window turns where output was anchor-silent.
    const uncitedCount = this.citationWindow.reduce(
      (acc, v) => (v ? acc : acc + 1),
      0,
    );
    const citationNorm =
      this.citationWindow.length > 0
        ? Math.min(1, uncitedCount / this.windowSize)
        : 0;

    // Session age - logarithmic saturation at ageSaturationTurn.
    const ageNorm = Math.min(
      1,
      Math.log(input.turn + 1) / Math.log(this.ageSaturationTurn + 1),
    );

    return [
      this.factor("gate_pressure", gateSum, gateNorm, this.weights.gate_pressure),
      this.factor("drift_pressure", driftSum, driftNorm, this.weights.drift_pressure),
      this.factor(
        "confidence_decay",
        input.confidence,
        confNorm,
        this.weights.confidence_decay,
      ),
      this.factor(
        "citation_pressure",
        uncitedCount,
        citationNorm,
        this.weights.citation_pressure,
      ),
      this.factor("session_age", input.turn, ageNorm, this.weights.session_age),
    ];
  }

  private factor(
    name: EntropyFactor["name"],
    rawValue: number,
    normalized: number,
    weight: number,
  ): EntropyFactor {
    return {
      name,
      rawValue,
      normalized,
      weight,
      contribution: normalized * weight,
    };
  }

  private levelFromScore(score: number): EntropyLevel {
    if (score >= this.thresholds.critical) return EntropyLevel.CRITICAL;
    if (score >= this.thresholds.high) return EntropyLevel.HIGH;
    if (score >= this.thresholds.elevated) return EntropyLevel.ELEVATED;
    return EntropyLevel.NOMINAL;
  }

  private canFire(target: EntropyLevel): boolean {
    // CRITICAL fires immediately (no hysteresis).
    if (target !== EntropyLevel.CRITICAL) {
      if (this.consecutiveAbove[target] < HYSTERESIS_TURNS) return false;
    }

    const last = this.lastFiredTurnAt[target];
    if (last === -Infinity) return true;
    const elapsed = this.currentTurn - last;
    return elapsed >= COOLDOWN_TURNS[target];
  }

  private computeActions(
    input: EntropyTurnInput,
    transitioned: boolean,
  ): EntropyAction[] {
    const actions: EntropyAction[] = [];
    const rank = LEVEL_RANK[this.emittedLevel];

    // Anchor re-injection at ELEVATED+ or during warmup with a gate hit.
    // Warmup bypasses hysteresis (Failure Mode #3) but still honors the
    // reinject cooldown so we do not spam tokens.
    const warmupGateHit = input.turn <= WARMUP_TURNS && input.gateViolations > 0;
    const reinjectCooldownExpired =
      this.currentTurn - this.lastReinjectTurn >= ANCHOR_REINJECT_COOLDOWN_TURNS;
    const reinjectEligible =
      warmupGateHit || rank >= LEVEL_RANK[EntropyLevel.ELEVATED];

    if (reinjectEligible && reinjectCooldownExpired) {
      actions.push({ kind: "reinject_anchors" });
      this.lastReinjectTurn = input.turn;
    }

    // Compression suggestion at HIGH+.
    if (rank >= LEVEL_RANK[EntropyLevel.HIGH] && transitioned) {
      actions.push({ kind: "suggest_compression" });
    }

    // Context correction at HIGH+.
    if (rank >= LEVEL_RANK[EntropyLevel.HIGH] && transitioned) {
      const correction = this.buildContextCorrection(this.emittedLevel, this.currentScoreValue);
      if (correction !== null) {
        actions.push({ kind: "inject_correction", text: correction });
      }
    }

    // CRITICAL forces reclassify + invalidate (same turn as fire).
    if (this.emittedLevel === EntropyLevel.CRITICAL && transitioned) {
      actions.push({ kind: "force_reclassify" });
      actions.push({ kind: "invalidate_fingerprint" });
      this.lastClassifyTurn = input.turn;
    }

    // Classifier TTL - forced reclassify every CLASSIFIER_TTL_TURNS turns
    // regardless of level (Failure Mode #6).
    if (input.turn - this.lastClassifyTurn >= CLASSIFIER_TTL_TURNS) {
      if (!actions.some((a) => a.kind === "force_reclassify")) {
        actions.push({ kind: "force_reclassify" });
      }
      if (!actions.some((a) => a.kind === "invalidate_fingerprint")) {
        actions.push({ kind: "invalidate_fingerprint" });
      }
      this.lastClassifyTurn = input.turn;
    }

    return actions;
  }

  private buildContextCorrection(level: EntropyLevel, score: number): string | null {
    if (level !== EntropyLevel.HIGH && level !== EntropyLevel.CRITICAL) return null;
    const pct = Math.round(score * 100);
    return (
      `<dcgp-entropy-correction level="${level}" score="${pct}%">\n` +
      `Context health has degraded. Re-ground your response in the active domain's anchors. ` +
      `Avoid introducing new concepts, tools, or libraries outside the anchored stack until health recovers.\n` +
      `</dcgp-entropy-correction>`
    );
  }

  private buildDirective(
    level: EntropyLevel,
    turn: number,
    score: number,
    reason: string,
  ): RetentionDirective {
    const intensity = LEVEL_INTENSITY[level];
    return {
      intensity,
      globalFloor: PRUNE_INTENSITY_FLOOR[intensity],
      protectedPaths: this.protectedPaths,
      reason,
      turn,
      score,
    };
  }

  private buildMessage(
    turn: number,
    level: EntropyLevel,
    score: number,
    transitioned: boolean,
  ): string {
    const pct = Math.round(score * 100);
    const tag = transitioned ? ">" : "·";
    return `Turn ${turn} ${tag} ${level.toUpperCase()} (${pct}%)`;
  }
}
