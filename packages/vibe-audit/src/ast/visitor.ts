/**
 * Generic AST visitor used by AST-augmented rules. Wraps `ts.forEachChild`
 * with a callback that receives both the node and its line/col, and
 * supports early termination by returning `true`.
 */

import type { TypeScriptModule } from "./ts-loader";

export interface NodeWithLocation {
  readonly node: unknown;
  readonly line: number;
  readonly col: number;
  /** Source-text excerpt for the node (first 80 chars). */
  readonly snippet: string;
}

/**
 * Walk every node of `sourceFile` in depth-first order. The visitor may
 * return `true` from the callback to short-circuit deeper traversal of
 * the current branch.
 */
export function walkNodes(
  ts: TypeScriptModule,
  sourceFile: unknown,
  source: string,
  visit: (info: NodeWithLocation) => boolean | void,
): void {
  function recur(node: unknown): void {
    const pos = (node as { pos?: number }).pos ?? 0;
    const end = (node as { end?: number }).end ?? pos;
    const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, pos);
    const snippet = source.slice(pos, Math.min(end, pos + 80)).replace(/\n/g, " ").trim();
    const stop = visit({ node, line: line + 1, col: character + 1, snippet });
    if (stop === true) return;
    ts.forEachChild(node, recur);
  }
  ts.forEachChild(sourceFile, recur);
}
