/**
 * SessionState - Step 7 of the 7-step loop.
 *
 * Atomic JSON persistence of DCGPSessionState (DCGP-SPEC.md § 8).
 * Atomicity via tmp-then-rename (POSIX atomic within same dir). Never
 * writes partial state on crash.
 *
 * Default storage location: $XDG_DATA_HOME/opencode/storage/plugin/dcgp/
 * but any caller-specified path works. History is bounded to prevent
 * unbounded growth.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { DCGPSessionState, DomainShift, SessionStats } from "../types/Session";
import { emptySessionState } from "../types/Session";
import type { GateViolation, DriftEvent } from "../types/ContextPath";
import type { EntropyEvent } from "../types/Entropy";

/** Max entries kept for each rolling log. Older entries drop FIFO. */
export const HISTORY_CAP = 500;

export class SessionState {
  private state: DCGPSessionState;
  private readonly path: string | null;

  constructor(initial?: Partial<DCGPSessionState>, persistPath?: string) {
    this.state = { ...emptySessionState(), ...initial } as DCGPSessionState;
    this.path = persistPath ?? null;
    if (this.path !== null && existsSync(this.path)) {
      try {
        const loaded = JSON.parse(readFileSync(this.path, "utf8")) as DCGPSessionState;
        this.state = loaded;
      } catch {
        /* ignore corrupt state - start fresh */
      }
    }
  }

  snapshot(): DCGPSessionState {
    return this.state;
  }

  setActiveDomain(id: string | null, confidence: number, turn: number): void {
    const shifted = id !== this.state.activeDomainId;
    if (shifted) {
      const shift: DomainShift = {
        fromDomainId: this.state.activeDomainId,
        toDomainId: id,
        turn,
        timestamp: Date.now(),
        suppressed: false,
      };
      const stats = this.bumpStats({ domainSwitches: this.state.stats.domainSwitches + 1 });
      this.state = {
        ...this.state,
        activeDomainId: id,
        classificationConfidence: confidence,
        domainShiftLog: this.capList([...this.state.domainShiftLog, shift]),
        stats,
      };
    } else {
      this.state = {
        ...this.state,
        classificationConfidence: confidence,
      };
    }
  }

  recordShiftSuppression(fromDomain: string | null, attempted: string, turn: number): void {
    const shift: DomainShift = {
      fromDomainId: fromDomain,
      toDomainId: attempted,
      turn,
      timestamp: Date.now(),
      suppressed: true,
    };
    this.state = {
      ...this.state,
      domainShiftLog: this.capList([...this.state.domainShiftLog, shift]),
    };
  }

  recordGateViolations(violations: readonly GateViolation[]): void {
    if (violations.length === 0) return;
    this.state = {
      ...this.state,
      gateViolations: this.capList([...this.state.gateViolations, ...violations]),
      stats: this.bumpStats({
        totalGateViolations: this.state.stats.totalGateViolations + violations.length,
      }),
    };
  }

  recordDriftEvents(events: readonly DriftEvent[]): void {
    if (events.length === 0) return;
    const injectedCount = events.reduce((acc, e) => acc + (e.correctionInjected ? 1 : 0), 0);
    this.state = {
      ...this.state,
      driftEvents: this.capList([...this.state.driftEvents, ...events]),
      stats: this.bumpStats({
        totalDriftEvents: this.state.stats.totalDriftEvents + events.length,
        totalCorrectionsInjected:
          this.state.stats.totalCorrectionsInjected + injectedCount,
      }),
    };
  }

  recordEntropyEvent(event: EntropyEvent): void {
    // Only persist events with actions (HIGH/CRITICAL). NOMINAL/ELEVATED
    // events are numerous and low-value for the session log.
    if (event.actions.length === 0 && event.contextCorrection === null) return;
    this.state = {
      ...this.state,
      currentTurn: Math.max(this.state.currentTurn, event.turn),
      entropyEvents: this.capList([...this.state.entropyEvents, event]),
      stats: this.bumpStats({
        totalEntropyEvents: this.state.stats.totalEntropyEvents + 1,
      }),
    };
  }

  setTurn(turn: number): void {
    if (turn < this.state.currentTurn) {
      throw new Error(
        `SessionState: turn must be monotonic (got ${turn}, was ${this.state.currentTurn})`,
      );
    }
    this.state = { ...this.state, currentTurn: turn };
  }

  persist(): void {
    if (this.path === null) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = join(dirname(this.path), `.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
    renameSync(tmp, this.path);
  }

  private capList<T>(arr: readonly T[]): readonly T[] {
    if (arr.length <= HISTORY_CAP) return arr;
    return arr.slice(arr.length - HISTORY_CAP);
  }

  private bumpStats(patch: Partial<SessionStats>): SessionStats {
    return { ...this.state.stats, ...patch };
  }
}
