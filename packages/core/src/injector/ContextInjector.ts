/**
 * ContextInjector - Step 4 of the 7-step loop.
 *
 * Assembles XML anchor blocks for system-prompt injection (DCGP-SPEC.md § 6).
 * Enforces Anchor Bloat mitigation (Failure Mode #2): when cumulative
 * anchor tokens exceed ANCHOR_BLOAT_RATIO × contextWindow, anchors with
 * priority < ANCHOR_DEMOTION_PRIORITY are demoted to label-only output.
 *
 * Token counting is char-based (chars/4 heuristic). Precise tokenization
 * is the caller's responsibility if needed.
 */

import type { Anchor, ContextPath } from "../types/ContextPath";

/** Fraction of contextWindow above which anchor bloat mitigation kicks in. */
export const ANCHOR_BLOAT_RATIO = 0.2;

/** Anchors with priority strictly below this are demoted under bloat. */
export const ANCHOR_DEMOTION_PRIORITY = 70;

/** Heuristic for char -> token estimate. */
const CHARS_PER_TOKEN = 4;

export interface InjectionOptions {
  /** Context window in tokens (default 128k). */
  readonly contextWindowTokens?: number;
  /** Set of active signal keys for `whenSignals` conditional injection. */
  readonly activeSignals?: ReadonlySet<string>;
}

export interface InjectionResult {
  readonly xml: string;
  readonly injectedAnchorIds: readonly string[];
  readonly demotedAnchorIds: readonly string[];
  readonly estimatedTokens: number;
  readonly bloatTriggered: boolean;
}

export class ContextInjector {
  inject(path: ContextPath, opts: InjectionOptions = {}): InjectionResult {
    const contextWindow = opts.contextWindowTokens ?? 128_000;
    const budget = Math.floor(contextWindow * ANCHOR_BLOAT_RATIO);
    const activeSignals = opts.activeSignals ?? new Set<string>();

    // Filter by whenSignals and sort by priority desc.
    const eligible = path.anchors
      .filter((a) => this.whenSignalsMatches(a, activeSignals))
      .slice()
      .sort((a, b) => b.priority - a.priority);

    const injectedAnchorIds: string[] = [];
    const demotedAnchorIds: string[] = [];
    const blocks: string[] = [];
    let tokens = 0;

    for (const anchor of eligible) {
      const fullBlock = this.renderAnchor(anchor);
      const labelBlock = this.renderAnchorLabel(anchor);
      const fullCost = this.estimateTokens(fullBlock);
      const labelCost = this.estimateTokens(labelBlock);

      const wouldExceed = tokens + fullCost > budget;
      const shouldDemote = wouldExceed && anchor.priority < ANCHOR_DEMOTION_PRIORITY;

      if (shouldDemote) {
        blocks.push(labelBlock);
        tokens += labelCost;
        demotedAnchorIds.push(anchor.id);
      } else {
        blocks.push(fullBlock);
        tokens += fullCost;
        injectedAnchorIds.push(anchor.id);
      }
    }

    const compressionBlock = this.renderCompression(path);
    if (compressionBlock.length > 0) {
      blocks.push(compressionBlock);
      tokens += this.estimateTokens(compressionBlock);
    }

    const xml =
      `<dcgp-context domain="${path.id}" version="${path.version}">\n` +
      `  <domain-identity>\n    Name: ${path.name}\n  </domain-identity>\n` +
      blocks.map((b) => b.split("\n").map((l) => `  ${l}`).join("\n")).join("\n") +
      `\n</dcgp-context>`;

    return {
      xml,
      injectedAnchorIds,
      demotedAnchorIds,
      estimatedTokens: this.estimateTokens(xml),
      bloatTriggered: demotedAnchorIds.length > 0,
    };
  }

  private whenSignalsMatches(anchor: Anchor, activeSignals: ReadonlySet<string>): boolean {
    if (anchor.whenSignals === undefined || anchor.whenSignals.length === 0) return true;
    for (const req of anchor.whenSignals) {
      if (!activeSignals.has(req)) return false;
    }
    return true;
  }

  private renderAnchor(anchor: Anchor): string {
    return (
      `<anchor id="${anchor.id}" label="${anchor.label}" priority="${anchor.priority}">\n` +
      anchor.content +
      `\n</anchor>`
    );
  }

  private renderAnchorLabel(anchor: Anchor): string {
    return `<anchor-label id="${anchor.id}" priority="${anchor.priority}">${anchor.label}</anchor-label>`;
  }

  private renderCompression(path: ContextPath): string {
    const c = path.compression;
    const lines: string[] = [];
    if (c.summarizeAs) {
      lines.push(`When compressing this session, summarize as: "${c.summarizeAs}"`);
    }
    if (c.protectedTerms && c.protectedTerms.length > 0) {
      lines.push(`Always preserve these terms: ${c.protectedTerms.join(", ")}`);
    }
    if (lines.length === 0) return "";
    return `<compression-guidance>\n${lines.join("\n")}\n</compression-guidance>`;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
}
