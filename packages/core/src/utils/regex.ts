// @dcgp-audit-ignore-file regex-redos-risk - utility wrappers; SAFETY (length cap, nested-quantifier heuristic) is enforced upstream in @dcgp/core's validate.ts before any user pattern reaches this file.
export function toGlobalPattern(pattern: string | RegExp): RegExp {
  if (typeof pattern === "string") {
    return new RegExp(pattern, "g");
  }
  if (pattern.global) {
    return pattern;
  }
  return new RegExp(pattern.source, pattern.flags + "g");
}

/**
 * Compile a glob pattern (with ** for any-depth, * for single-segment,
 * ? for single char) to an anchored RegExp for path matching.
 *
 * Supports:
 *   **   zero-or-more path segments
 *   *    zero-or-more non-/ chars
 *   ?    single non-/ char
 *
 * Other regex metacharacters are escaped.
 */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::GS::")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/::GS::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function findAllMatches(text: string, pattern: RegExp): RegExpMatchArray[] {
  const global = toGlobalPattern(pattern);
  const results: RegExpMatchArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = global.exec(text)) !== null) {
    results.push(match);
    if (match[0].length === 0) {
      global.lastIndex++;
    }
  }
  return results;
}

export function countMatches(text: string, pattern: RegExp): number {
  return findAllMatches(text, pattern).length;
}
