/**
 * File walker for the audit.
 *
 * Mirrors the safety semantics already proven in @dcgp/core's
 * FingerprintEngine.walkFiles (lstat-based symlink protection, ALWAYS_IGNORE
 * directories, depth + count caps) but exposes a simple iterator instead of
 * collecting into a Set.
 */

import { readdirSync, lstatSync } from "node:fs";
import { join, sep } from "node:path";
import { ALWAYS_IGNORE } from "@dcgp/core";

const MAX_DEPTH = 16;
const MAX_FILES = 50_000;

export interface WalkOptions {
  /** Allowed file extensions (with leading dot). */
  readonly extensions: readonly string[];
  /** Glob-like substrings to exclude. Simple substring match for v1. */
  readonly exclude?: readonly string[];
}

const DEFAULT_EXTENSIONS: readonly string[] = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

/**
 * Yields repository-relative file paths (forward-slash form) for every file
 * matching the extension allowlist under `root`. Symlinks are NEVER followed.
 */
export function* walkSourceFiles(
  root: string,
  options: WalkOptions = { extensions: DEFAULT_EXTENSIONS },
): Generator<string> {
  let count = 0;
  const exclude = options.exclude ?? [];

  function* walk(dir: string, depth: number): Generator<string> {
    if (depth > MAX_DEPTH) return;
    if (count >= MAX_FILES) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (count >= MAX_FILES) return;
      if (ALWAYS_IGNORE.includes(entry)) continue;

      const abs = join(dir, entry);
      let info;
      try {
        info = lstatSync(abs);
      } catch {
        continue;
      }
      if (info.isSymbolicLink()) continue;

      if (info.isDirectory()) {
        yield* walk(abs, depth + 1);
      } else if (info.isFile()) {
        if (!hasAllowedExtension(entry, options.extensions)) continue;
        const rel = abs.slice(root.length + 1).split(sep).join("/");
        if (isExcluded(rel, exclude)) continue;
        count += 1;
        yield rel;
      }
    }
  }

  yield* walk(root, 0);
}

function hasAllowedExtension(entry: string, extensions: readonly string[]): boolean {
  for (const ext of extensions) {
    if (entry.endsWith(ext)) return true;
  }
  return false;
}

function isExcluded(rel: string, exclude: readonly string[]): boolean {
  for (const pattern of exclude) {
    // v1: substring match. Globs come in v2 with proper minimatch.
    if (rel.includes(pattern)) return true;
  }
  return false;
}

export { DEFAULT_EXTENSIONS };
