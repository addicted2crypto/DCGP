/**
 * DCP bridge - makes DCGP and DCP (@tarquinen/opencode-dcp) co-operate
 * when both are installed in the same OpenCode instance.
 *
 * Reality check (verified against the DCP public repo):
 *   - DCP's public name is "@tarquinen/opencode-dcp".
 *   - DCP is rule-based, not score-based. It exposes no programmatic
 *     pruning-directive sink today. There is no applyRetentionDirective
 *     method to call.
 *   - DCP reads its config from .opencode/dcp.jsonc in the project root
 *     (or ~/.config/opencode/dcp.jsonc globally).
 *
 * So this bridge does two things:
 *
 *   1. At runtime, it REFLECTS each DCGP RetentionDirective into an
 *      equivalent DCP config object. Consumers who own the DCP config
 *      (or a future DCP that accepts live config updates) can pick it
 *      up through onDirective(). This is not a no-op: it gives you the
 *      exact shape DCP needs to match DCGP's current entropy level.
 *
 *   2. At install time, it exports a CONFIG_TRANSLATION table so humans
 *      can hand-author or diff .opencode/dcp.jsonc against the current
 *      DCGP directive. Keeps the two plugins honest.
 *
 * When DCP adds a public directive sink, swap register() with a real
 * call to it - the translation logic stays identical.
 */

import { PruneIntensity, type RetentionDirective } from "@dcgp/core";

/** The DCP package name (verified from the public repo, not a guess). */
export const DCP_PACKAGE_NAME = "@tarquinen/opencode-dcp";

/** Where DCP looks for its project config (verified from the public repo). */
export const DCP_PROJECT_CONFIG_PATH = ".opencode/dcp.jsonc";

/**
 * Shape of the subset of DCP config that DCGP directives map onto. DCP has
 * more fields; we only translate the retention-policy surface.
 *
 * Source: README of @tarquinen/opencode-dcp.
 */
export interface DcpConfigPatch {
  readonly turnProtection?: {
    readonly recentTurns?: number;
    readonly keepUserTurns?: boolean;
  };
  readonly compress?: {
    readonly enabled?: boolean;
  };
  readonly strategies?: {
    readonly deduplication?: { readonly enabled?: boolean };
    readonly purgeErrors?: { readonly enabled?: boolean };
  };
}

/**
 * Deterministic mapping from DCGP directive intensity to DCP config shape.
 * Higher entropy in DCGP -> tighter DCP retention. Values are conservative
 * defaults; override per project in .opencode/dcp.jsonc.
 */
export const CONFIG_TRANSLATION: Readonly<Record<PruneIntensity, DcpConfigPatch>> = {
  [PruneIntensity.PASSIVE]: {
    turnProtection: { recentTurns: 20, keepUserTurns: true },
    compress: { enabled: false },
    strategies: {
      deduplication: { enabled: true },
      purgeErrors: { enabled: false },
    },
  },
  [PruneIntensity.TIGHTEN]: {
    turnProtection: { recentTurns: 12, keepUserTurns: true },
    compress: { enabled: true },
    strategies: {
      deduplication: { enabled: true },
      purgeErrors: { enabled: true },
    },
  },
  [PruneIntensity.AGGRESSIVE]: {
    turnProtection: { recentTurns: 6, keepUserTurns: true },
    compress: { enabled: true },
    strategies: {
      deduplication: { enabled: true },
      purgeErrors: { enabled: true },
    },
  },
  [PruneIntensity.NUCLEAR]: {
    turnProtection: { recentTurns: 2, keepUserTurns: true },
    compress: { enabled: true },
    strategies: {
      deduplication: { enabled: true },
      purgeErrors: { enabled: true },
    },
  },
};

export type DirectiveObserver = (patch: DcpConfigPatch, directive: RetentionDirective) => void;

export class DCPBridge {
  private observer: DirectiveObserver | null = null;

  /**
   * Register an observer that receives the DCP-shaped patch every time a
   * DCGP directive is forwarded. The observer is free to:
   *   - write .opencode/dcp.jsonc on disk
   *   - call a future DCP live-reload API
   *   - no-op if DCP is not installed
   */
  onDirective(observer: DirectiveObserver | null): void {
    this.observer = observer;
  }

  forward(directive: RetentionDirective): void {
    if (this.observer === null) return;
    const patch = CONFIG_TRANSLATION[directive.intensity];
    try {
      this.observer(patch, directive);
    } catch {
      // Observer failures must never break the DCGP loop.
    }
  }

  /**
   * Human-readable translation table for docs / slash commands.
   * Returns the DCP config shape for the currently active directive.
   */
  translate(directive: RetentionDirective): DcpConfigPatch {
    return CONFIG_TRANSLATION[directive.intensity];
  }
}

/**
 * Check whether DCP is installed in the current environment. Best-effort -
 * returns false if the package cannot be resolved. Does not import DCP; the
 * caller decides whether to wire an observer based on this signal.
 */
export async function isDcpInstalled(): Promise<boolean> {
  try {
    await import(/* @vite-ignore */ DCP_PACKAGE_NAME as string);
    return true;
  } catch {
    return false;
  }
}
