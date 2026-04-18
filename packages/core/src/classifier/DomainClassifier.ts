/**
 * DomainClassifier - Step 2 of the 7-step loop.
 *
 * Scores registered ContextPaths against a Fingerprint. Returns the top
 * match above threshold, or `{ domain: null, confidence: -1 }` when no
 * path clears. That -1 is the sentinel EntropyMonitor's blind-spot guard
 * looks for (DCGP-SPEC.md § 7.2 amendment).
 *
 * Enforces two Failure Modes (DCGP-SPEC.md § 10b):
 *   - Signal Collision: top two confidences within COLLISION_DELTA
 *   - Domain Deadlock: A->B->A within SHIFT_COOLDOWN_TURNS is suppressed
 */

import { DEFAULT_SIGNAL_WEIGHTS, type ContextPath, type SignalWeights } from "../types/ContextPath";
import type { Fingerprint } from "./FingerprintEngine";

/** Top-two confidence delta below which classification is flagged ambiguous. */
export const COLLISION_DELTA = 0.1;

/** Minimum turns between A->B->A domain shifts. Suppresses oscillation. */
export const SHIFT_COOLDOWN_TURNS = 3;

/** Session keyword cap (FIFO eviction). Prevents unbounded memory growth. */
export const MAX_SESSION_KEYWORDS = 500;

/** Minimum confidence required to select a domain. */
export const CLASSIFICATION_THRESHOLD = 0.35;

export interface SignalBreakdown {
  readonly packages: number;
  readonly files: number;
  readonly gitBranch: number;
  readonly env: number;
  readonly tools: number;
  readonly keywords: number;
}

export interface ClassificationResult {
  readonly domain: string | null;
  /** [0, 1] when a domain cleared threshold; -1 when unknown (blind spot). */
  readonly confidence: number;
  readonly breakdown: SignalBreakdown | null;
  /** True when top two confidences differ by less than COLLISION_DELTA. */
  readonly collision: boolean;
  /** True when this shift was suppressed by the deadlock guard. */
  readonly shiftSuppressed: boolean;
  readonly candidates: readonly { domain: string; confidence: number }[];
}

interface DomainShiftRecord {
  readonly fromDomainId: string | null;
  readonly toDomainId: string;
  readonly turn: number;
}

export class DomainClassifier {
  private readonly paths = new Map<string, ContextPath>();
  private readonly sessionKeywords: string[] = [];
  private readonly sessionKeywordSet = new Set<string>();
  private activeDomainId: string | null = null;
  private readonly domainShiftLog: DomainShiftRecord[] = [];

  register(path: ContextPath): void {
    this.paths.set(path.id, path);
  }

  registerMany(paths: readonly ContextPath[]): void {
    for (const p of paths) this.register(p);
  }

  get registeredIds(): readonly string[] {
    return Array.from(this.paths.keys());
  }

  addSessionKeyword(keyword: string): void {
    const normalized = keyword.trim().toLowerCase();
    if (normalized.length === 0 || this.sessionKeywordSet.has(normalized)) return;
    this.sessionKeywords.push(normalized);
    this.sessionKeywordSet.add(normalized);
    while (this.sessionKeywords.length > MAX_SESSION_KEYWORDS) {
      const evicted = this.sessionKeywords.shift();
      if (evicted !== undefined) this.sessionKeywordSet.delete(evicted);
    }
  }

  get sessionKeywordCount(): number {
    return this.sessionKeywords.length;
  }

  /**
   * Classify a fingerprint. Pass `turn` to engage the deadlock guard.
   */
  classify(fingerprint: Fingerprint, turn = 0): ClassificationResult {
    if (this.paths.size === 0) {
      return {
        domain: null,
        confidence: -1,
        breakdown: null,
        collision: false,
        shiftSuppressed: false,
        candidates: [],
      };
    }

    const scored = Array.from(this.paths.values())
      .map((p) => ({
        domain: p.id,
        confidence: this.scorePath(p, fingerprint),
        breakdown: this.computeBreakdown(p, fingerprint),
      }))
      .sort((a, b) => b.confidence - a.confidence);

    const top = scored[0];
    if (top === undefined || top.confidence < CLASSIFICATION_THRESHOLD) {
      return {
        domain: null,
        confidence: -1,
        breakdown: null,
        collision: false,
        shiftSuppressed: false,
        candidates: scored.map((s) => ({ domain: s.domain, confidence: s.confidence })),
      };
    }

    const second = scored[1];
    const collision =
      second !== undefined && top.confidence - second.confidence < COLLISION_DELTA;

    const shiftSuppressed = this.wouldCauseDeadlock(top.domain, turn);
    const effectiveDomain = shiftSuppressed ? this.activeDomainId : top.domain;
    const effectiveConfidence = shiftSuppressed
      ? this.activeDomainId === null
        ? top.confidence
        : (scored.find((s) => s.domain === this.activeDomainId)?.confidence ?? top.confidence)
      : top.confidence;

    // Record shift if domain is actually changing and not suppressed.
    if (!shiftSuppressed && effectiveDomain !== this.activeDomainId) {
      this.domainShiftLog.push({
        fromDomainId: this.activeDomainId,
        toDomainId: effectiveDomain ?? top.domain,
        turn,
      });
      this.activeDomainId = effectiveDomain;
    }

    return {
      domain: effectiveDomain,
      confidence: effectiveConfidence,
      breakdown: top.breakdown,
      collision,
      shiftSuppressed,
      candidates: scored.map((s) => ({ domain: s.domain, confidence: s.confidence })),
    };
  }

  get activeDomain(): string | null {
    return this.activeDomainId;
  }

  get shifts(): readonly DomainShiftRecord[] {
    return this.domainShiftLog;
  }

  /* ── Internal ───────────────────────────────────────────────────────── */

  private scorePath(path: ContextPath, fp: Fingerprint): number {
    const breakdown = this.computeBreakdown(path, fp);
    const weights = this.resolveWeights(path);

    // Weighted mean over ONLY the signal categories this path declares.
    // A path that cares only about packages must not be diluted by the
    // (unused) weights for files, gitBranch, etc.
    let totalWeight = 0;
    let weighted = 0;
    const has = (field: readonly string[] | undefined): boolean =>
      field !== undefined && field.length > 0;

    if (has(path.signals.packages)) {
      totalWeight += weights.packages;
      weighted += breakdown.packages * weights.packages;
    }
    if (has(path.signals.files)) {
      totalWeight += weights.files;
      weighted += breakdown.files * weights.files;
    }
    if (has(path.signals.gitBranch)) {
      totalWeight += weights.gitBranch;
      weighted += breakdown.gitBranch * weights.gitBranch;
    }
    if (has(path.signals.env)) {
      totalWeight += weights.env;
      weighted += breakdown.env * weights.env;
    }
    if (has(path.signals.tools)) {
      totalWeight += weights.tools;
      weighted += breakdown.tools * weights.tools;
    }
    if (has(path.signals.keywords)) {
      totalWeight += weights.keywords;
      weighted += breakdown.keywords * weights.keywords;
    }

    if (totalWeight === 0) return 0;
    return Math.min(1, weighted / totalWeight);
  }

  private resolveWeights(path: ContextPath): SignalWeights {
    const override = path.signals.weights;
    return {
      packages: override?.packages ?? DEFAULT_SIGNAL_WEIGHTS.packages,
      files: override?.files ?? DEFAULT_SIGNAL_WEIGHTS.files,
      gitBranch: override?.gitBranch ?? DEFAULT_SIGNAL_WEIGHTS.gitBranch,
      env: override?.env ?? DEFAULT_SIGNAL_WEIGHTS.env,
      tools: override?.tools ?? DEFAULT_SIGNAL_WEIGHTS.tools,
      keywords: override?.keywords ?? DEFAULT_SIGNAL_WEIGHTS.keywords,
    };
  }

  private computeBreakdown(path: ContextPath, fp: Fingerprint): SignalBreakdown {
    return {
      packages: this.matchRatio(path.signals.packages, fp.packages),
      files: this.matchRatioFiles(path.signals.files, fp.files),
      gitBranch: this.matchBranch(path.signals.gitBranch, fp.gitBranch),
      env: this.matchRatio(path.signals.env, fp.envVars),
      tools: this.matchRatio(path.signals.tools, fp.tools),
      keywords: this.matchRatio(path.signals.keywords, this.sessionKeywordSet),
    };
  }

  private matchRatio(
    declared: readonly string[] | undefined,
    observed: ReadonlySet<string>,
  ): number {
    if (declared === undefined || declared.length === 0) return 0;
    let hits = 0;
    for (const d of declared) {
      if (observed.has(d)) hits += 1;
    }
    return hits > 0 ? 1 : 0;
  }

  private matchRatioFiles(
    declared: readonly string[] | undefined,
    observed: ReadonlySet<string>,
  ): number {
    if (declared === undefined || declared.length === 0) return 0;
    for (const pattern of declared) {
      const re = this.globToRegex(pattern);
      for (const file of observed) {
        if (re.test(file)) return 1;
      }
    }
    return 0;
  }

  private matchBranch(declared: readonly string[] | undefined, branch: string | null): number {
    if (declared === undefined || declared.length === 0 || branch === null) return 0;
    for (const pattern of declared) {
      const re = this.globToRegex(pattern);
      if (re.test(branch)) return 1;
    }
    return 0;
  }

  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "::GS::")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/::GS::/g, ".*");
    return new RegExp(`^${escaped}$`);
  }

  private wouldCauseDeadlock(proposed: string, turn: number): boolean {
    if (this.activeDomainId === null || proposed === this.activeDomainId) return false;
    // Look for A->B where current is B and we'd go back to A within cooldown.
    for (let i = this.domainShiftLog.length - 1; i >= 0; i--) {
      const rec = this.domainShiftLog[i];
      if (rec === undefined) break;
      if (turn - rec.turn > SHIFT_COOLDOWN_TURNS) break;
      if (rec.fromDomainId === proposed && rec.toDomainId === this.activeDomainId) {
        return true;
      }
    }
    return false;
  }
}
