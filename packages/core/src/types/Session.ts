/**
 * Session state shape - DCGP-SPEC.md § 8.
 *
 * Persisted atomically (tmp-then-rename) by SessionState. Shape is
 * serialization-stable: no Dates, no RegExps, no class instances.
 */

import type { EntropyLevel, EntropyEvent } from "./Entropy";
import type { GateViolation, DriftEvent } from "./ContextPath";

export interface DomainShift {
  readonly fromDomainId: string | null;
  readonly toDomainId: string | null;
  readonly turn: number;
  readonly timestamp: number;
  /** True if this shift was suppressed by SHIFT_COOLDOWN_TURNS (deadlock guard). */
  readonly suppressed: boolean;
}

export interface TurnRecord {
  readonly turn: number;
  readonly timestamp: number;
  readonly activeDomainId: string | null;
  readonly score: number;
  readonly level: EntropyLevel;
}

export interface SessionStats {
  readonly totalGateViolations: number;
  readonly totalDriftEvents: number;
  readonly totalCorrectionsInjected: number;
  readonly totalEntropyEvents: number;
  readonly domainSwitches: number;
}

export interface DCGPSessionState {
  readonly sessionId: string | null;
  readonly activeDomainId: string | null;
  readonly classificationConfidence: number;
  readonly currentTurn: number;
  readonly domainShiftLog: readonly DomainShift[];
  readonly gateViolations: readonly GateViolation[];
  readonly driftEvents: readonly DriftEvent[];
  readonly entropyEvents: readonly EntropyEvent[];
  readonly stats: SessionStats;
}

export function emptySessionState(sessionId: string | null = null): DCGPSessionState {
  return {
    sessionId,
    activeDomainId: null,
    classificationConfidence: -1,
    currentTurn: 0,
    domainShiftLog: [],
    gateViolations: [],
    driftEvents: [],
    entropyEvents: [],
    stats: {
      totalGateViolations: 0,
      totalDriftEvents: 0,
      totalCorrectionsInjected: 0,
      totalEntropyEvents: 0,
      domainSwitches: 0,
    },
  };
}
