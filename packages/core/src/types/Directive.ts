/**
 * The Retention Bridge - DCGP-SPEC.md § 7.7.
 *
 * RetentionDirective is the sole wire between EntropyMonitor (the decider)
 * and any retention consumer (internal RetentionScorer or external DCP
 * plugin). Consumer must enforce:
 *
 *     Keep(block) := score(block) >= directive.globalFloor
 *                 \/ matches(block.path, directive.protectedPaths)
 */

export enum PruneIntensity {
  /** NOMINAL  - standard retention; floor = 0.20 (almost everything stays) */
  PASSIVE = 0,
  /** ELEVATED - raise the bar; floor = 0.40 (mid-value content drops) */
  TIGHTEN = 1,
  /** HIGH     - aggressive; floor = 0.65 (only hot anchors and recent tools) */
  AGGRESSIVE = 2,
  /** CRITICAL - near-total wipe; floor = 0.90 (anchors alone survive) */
  NUCLEAR = 3,
}

/**
 * Deterministic mapping from PruneIntensity to the retention threshold
 * (globalFloor). Higher floor = stricter pruning = less content survives.
 *
 *   Keep(block) := score(block) >= globalFloor \/ protected(block.path)
 *
 * DCGP-SPEC.md § 7.7 pins these values - implementations may add
 * intermediate intensities but these four MUST remain reachable and unchanged.
 */
export const PRUNE_INTENSITY_FLOOR: Readonly<Record<PruneIntensity, number>> = {
  [PruneIntensity.PASSIVE]: 0.2,
  [PruneIntensity.TIGHTEN]: 0.4,
  [PruneIntensity.AGGRESSIVE]: 0.65,
  [PruneIntensity.NUCLEAR]: 0.9,
};

export interface RetentionDirective {
  readonly intensity: PruneIntensity;
  /** τ ∈ [0, 1]. Blocks with score below this are eligible for pruning. */
  readonly globalFloor: number;
  /** Globs - matching paths are never pruned regardless of score. */
  readonly protectedPaths: readonly string[];
  /** Human-readable; includes score and triggering level for audit logs. */
  readonly reason: string;
  /** Turn at which this directive was issued. */
  readonly turn: number;
  /** Entropy score at issuance - for correlation with event logs. */
  readonly score: number;
}
