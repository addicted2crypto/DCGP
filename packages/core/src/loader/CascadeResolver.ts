// CascadeResolver - merges .dcgp.json files across the 5-level cascade
// (DCGP-SPEC.md § 5):
//
//   Level 0: Global     ~/.dcgp/paths/              lowest priority
//   Level 1: Editor     ~/.vscode/dcgp/
//   Level 2: Workspace  <workspace>/.dcgp/
//   Level 3: Project    <project-root>/.dcgp/
//   Level 4: Subpath    <packages>/<pkg>/.dcgp/     highest priority
//
// Merge semantics (§ 5):
//   - Scalars: deeper level wins
//   - Arrays with `id` field (anchors, gates): deep-merged by id
//   - Arrays without `id` (drift rules, retention): concat + dedup
//   - `extends`: resolved last, after all levels have merged

import type {
  ContextPath,
  ContextPathInput,
  Anchor,
  Gate,
  DriftRule,
} from "../types/ContextPath";
import { definePath } from "../schema/validate";

export type CascadeLevel = 0 | 1 | 2 | 3 | 4;

export interface CascadeEntry {
  readonly level: CascadeLevel;
  readonly path: ContextPathInput;
  /** Source file path, for audit traces. */
  readonly source: string;
}

export class CascadeResolver {
  /**
   * Resolve a cascade into a single validated ContextPath.
   * `registered` is the pool for `extends` resolution.
   */
  resolve(
    entries: readonly CascadeEntry[],
    registered: ReadonlyMap<string, ContextPath> = new Map(),
  ): ContextPath {
    if (entries.length === 0) {
      throw new Error("CascadeResolver: cannot resolve an empty cascade");
    }
    // Sort by level ascending (Level 0 first so deeper levels overwrite).
    const sorted = [...entries].sort((a, b) => a.level - b.level);

    let merged: ContextPathInput = sorted[0]!.path;
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      if (next === undefined) continue;
      merged = this.mergeTwo(merged, next.path);
    }

    // Resolve `extends` last - parent provides defaults, current wins on conflicts.
    if (merged.extends !== undefined) {
      const parent = registered.get(merged.extends);
      if (parent !== undefined) {
        merged = this.mergeTwo(this.contextPathAsInput(parent), merged);
      }
    }

    return definePath(merged);
  }

  private contextPathAsInput(p: ContextPath): ContextPathInput {
    return {
      id: p.id,
      version: p.version,
      name: p.name,
      description: p.description,
      tags: p.tags,
      signals: p.signals,
      anchors: p.anchors,
      gates: p.gates,
      driftRules: p.driftRules,
      compression: p.compression,
    };
  }

  private mergeTwo(base: ContextPathInput, overlay: ContextPathInput): ContextPathInput {
    return {
      id: overlay.id ?? base.id,
      version: overlay.version ?? base.version,
      name: overlay.name ?? base.name,
      description: overlay.description ?? base.description,
      extends: overlay.extends ?? base.extends,
      tags: this.dedupStrings([...(base.tags ?? []), ...(overlay.tags ?? [])]),
      signals: this.mergeSignals(base.signals, overlay.signals),
      anchors: this.mergeArrayById(
        base.anchors ?? [],
        overlay.anchors ?? [],
      ) as readonly Anchor[],
      gates: this.mergeArrayById(
        base.gates ?? [],
        overlay.gates ?? [],
      ) as readonly Gate[],
      driftRules: this.concatDedup(base.driftRules ?? [], overlay.driftRules ?? []) as readonly DriftRule[],
      compression: {
        ...(base.compression ?? {}),
        ...(overlay.compression ?? {}),
        neverPrune: this.dedupStrings([
          ...(base.compression?.neverPrune ?? []),
          ...(overlay.compression?.neverPrune ?? []),
        ]),
        retention: [
          ...(base.compression?.retention ?? []),
          ...(overlay.compression?.retention ?? []),
        ],
      },
    };
  }

  private mergeArrayById<T extends { id: string }>(
    base: readonly T[],
    overlay: readonly T[],
  ): readonly T[] {
    const result = new Map<string, T>();
    for (const item of base) result.set(item.id, item);
    for (const item of overlay) {
      const existing = result.get(item.id);
      if (existing === undefined) {
        result.set(item.id, item);
      } else {
        result.set(item.id, { ...existing, ...item });
      }
    }
    return Array.from(result.values());
  }

  private concatDedup<T>(base: readonly T[], overlay: readonly T[]): readonly T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const item of [...base, ...overlay]) {
      const key = JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
    return result;
  }

  private dedupStrings(arr: readonly string[]): readonly string[] {
    return Array.from(new Set(arr));
  }

  private mergeSignals(
    base: ContextPathInput["signals"] | undefined,
    overlay: ContextPathInput["signals"] | undefined,
  ): ContextPathInput["signals"] {
    const b = base ?? {};
    const o = overlay ?? {};
    const concat = (
      a: readonly string[] | undefined,
      c: readonly string[] | undefined,
    ): readonly string[] | undefined => {
      if (a === undefined && c === undefined) return undefined;
      return this.dedupStrings([...(a ?? []), ...(c ?? [])]);
    };
    return {
      packages: concat(b.packages, o.packages),
      files: concat(b.files, o.files),
      keywords: concat(b.keywords, o.keywords),
      tools: concat(b.tools, o.tools),
      env: concat(b.env, o.env),
      gitBranch: concat(b.gitBranch, o.gitBranch),
      weights: o.weights ?? b.weights,
    };
  }
}
