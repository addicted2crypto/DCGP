/**
 * Optional TypeScript compiler API loader.
 *
 * `typescript` is a peer dep, marked optional. When present, AST-augmented
 * rules get full SyntaxKind precision. When absent, every rule falls back
 * to its regex implementation.
 */

import { createRequire } from "node:module";

/**
 * Subset of the typescript module surface we actually use. Typed as a
 * narrow opaque shape so consumers do not need typescript's enormous
 * type tree to consume our public API.
 */
export interface TypeScriptModule {
  readonly SyntaxKind: Record<string, number>;
  readonly ScriptTarget: Record<string, number>;
  createSourceFile(
    fileName: string,
    sourceText: string,
    languageVersion: number,
    setParentNodes?: boolean,
  ): unknown;
  forEachChild(node: unknown, callback: (child: unknown) => void): void;
  getLineAndCharacterOfPosition(
    sourceFile: unknown,
    position: number,
  ): { line: number; character: number };
  isCallExpression(node: unknown): boolean;
  isIdentifier(node: unknown): boolean;
  isPropertyAccessExpression(node: unknown): boolean;
  isStringLiteral(node: unknown): boolean;
  isAsExpression(node: unknown): boolean;
  isTypeReferenceNode(node: unknown): boolean;
  isVariableDeclaration(node: unknown): boolean;
}

let cached: TypeScriptModule | null | undefined = undefined;

/**
 * Returns the typescript module if installed, or null. Result is cached
 * for the lifetime of the process so we only attempt the require once.
 */
export function tryLoadTypeScript(): TypeScriptModule | null {
  if (cached !== undefined) return cached;
  try {
    const require = createRequire(import.meta.url);
    const ts = require("typescript") as TypeScriptModule;
    cached = ts;
    return ts;
  } catch {
    cached = null;
    return null;
  }
}

/**
 * Parse source into a TypeScript SourceFile. Caller is responsible for
 * checking `tryLoadTypeScript()` is not null before calling this.
 */
export function parseSourceFile(
  ts: TypeScriptModule,
  fileName: string,
  source: string,
): unknown {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022 ?? 99, true);
}
