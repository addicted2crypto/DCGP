/**
 * DomainDriftDetector - catches foreign-domain bleed in assistant output.
 *
 * Unlike HallucinationGate (which runs the active path's gates), this
 * detector runs driftRules from the ACTIVE path to detect when the model
 * is drifting toward a different domain (e.g., using Python idioms while
 * the active domain is Node.js).
 *
 * Lexical only. Semantic paradigm drift is a known limitation
 * (DCGP-SPEC.md § 10c).
 */

import type { ContextPath, DriftRule, DriftEvent } from "../types/ContextPath";
import { findAllMatches } from "../utils/regex";

export class DomainDriftDetector {
  private path: ContextPath | null = null;

  activate(path: ContextPath | null): void {
    this.path = path;
  }

  scan(text: string, opts: { turn: number }): readonly DriftEvent[] {
    if (this.path === null) return [];
    const events: DriftEvent[] = [];
    for (const rule of this.path.driftRules) {
      const matches = findAllMatches(text, rule.pattern);
      if (matches.length === 0) continue;
      const firstMatch = matches[0]?.[0] ?? "";
      events.push({
        sourceDomain: rule.sourceDomain,
        matched: firstMatch,
        correctionInjected: true,
        turn: opts.turn,
        correction: rule.correction,
      });
    }
    return events;
  }

  getCorrections(rules: readonly DriftRule[] = []): readonly string[] {
    const source = rules.length > 0 ? rules : (this.path?.driftRules ?? []);
    return source.map((r) => r.correction);
  }
}
