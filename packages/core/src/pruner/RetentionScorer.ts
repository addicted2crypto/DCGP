/**
 * RetentionScorer - the Pruning Nexus enforcer (DCGP-SPEC.md § 7.7).
 *
 * Consumes the current RetentionDirective from EntropyMonitor and enforces:
 *
 *   Keep(block) := score(block) >= directive.globalFloor
 *               \/ matches(block.path, directive.protectedPaths)
 *
 * score(block) is a deterministic function of block age, kind, and path
 * match against the active ContextPath's compression.retention rules.
 */

import { PruneIntensity, type RetentionDirective } from "../types/Directive";
import { globToRegExp } from "../utils/regex";
import { clamp } from "../utils/clamp";
import type { Compression } from "../types/ContextPath";

export interface RetentionBlock {
  readonly id: string;
  readonly path: string;
  readonly kind: "tool_output" | "assistant_message" | "user_message" | "anchor";
  /** Turn at which this block was created. */
  readonly createdAtTurn: number;
}

/**
 * Turns-old at which age-decay multiplier reaches 0. Beyond this the
 * block's score comes entirely from explicit retention rules or zero.
 */
export const AGE_DECAY_SATURATION_TURNS = 50;

/**
 * Per-kind base score (pre-age-decay). Higher = more resistant to pruning.
 * Anchors are always 1.0 because they are re-injected anyway.
 */
export const BASE_SCORE_BY_KIND: Readonly<Record<RetentionBlock["kind"], number>> = {
  anchor: 1.0,
  user_message: 0.85,
  tool_output: 0.7,
  assistant_message: 0.6,
};

export class RetentionScorer {
  private directive: RetentionDirective;
  private compression: Compression;
  private currentTurn = 0;

  constructor(initial: RetentionDirective, compression: Compression = {}) {
    this.directive = initial;
    this.compression = compression;
  }

  applyDirective(directive: RetentionDirective): void {
    this.directive = directive;
    this.currentTurn = Math.max(this.currentTurn, directive.turn);
  }

  setCompression(compression: Compression): void {
    this.compression = compression;
  }

  setTurn(turn: number): void {
    if (turn < this.currentTurn) {
      throw new Error(
        `RetentionScorer: turn must be monotonic (got ${turn}, was ${this.currentTurn})`,
      );
    }
    this.currentTurn = turn;
  }

  get currentDirective(): RetentionDirective {
    return this.directive;
  }

  /** Per-block relevance score - deterministic given block + current turn. */
  score(block: RetentionBlock): number {
    // Anchors always score 1.0: they are the hardened content.
    if (block.kind === "anchor") return 1.0;

    const base = BASE_SCORE_BY_KIND[block.kind];

    // Age decay - logarithmic, saturating to 0 at AGE_DECAY_SATURATION_TURNS.
    const age = Math.max(0, this.currentTurn - block.createdAtTurn);
    const ageDecay = Math.max(
      0,
      1 - Math.log(age + 1) / Math.log(AGE_DECAY_SATURATION_TURNS + 1),
    );

    // Explicit retention rules can override the age-decayed score.
    let effective = base * ageDecay;
    for (const rule of this.compression.retention ?? []) {
      if (this.pathMatches(block.path, rule.pattern)) {
        effective = Math.max(effective, rule.score);
      }
    }

    return clamp(effective, 0, 1);
  }

  /**
   * The Pruning Nexus equation (DCGP-SPEC.md § 7.7):
   *   Keep(b) := score(b) >= globalFloor  \/  matches(path, protectedPaths)
   */
  shouldKeep(block: RetentionBlock): boolean {
    if (this.isProtected(block.path)) return true;
    return this.score(block) >= this.directive.globalFloor;
  }

  isProtected(path: string): boolean {
    for (const glob of this.directive.protectedPaths) {
      if (this.pathMatches(path, glob)) return true;
    }
    for (const glob of this.compression.neverPrune ?? []) {
      if (this.pathMatches(path, glob)) return true;
    }
    return false;
  }

  /** Convenience: does the active directive warrant anchor-only mode? */
  isNuclear(): boolean {
    return this.directive.intensity === PruneIntensity.NUCLEAR;
  }

  private pathMatches(path: string, pattern: string): boolean {
    return globToRegExp(pattern).test(path);
  }
}
