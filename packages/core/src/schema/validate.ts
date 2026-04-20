/**
 * Hand-rolled validator for ContextPath - keeps @dcgp/core zero-runtime-dep.
 * DCGP-SPEC.md § 3 defines the schema; this module enforces it at load time
 * via definePath(). JSON Schema (`dcgp.schema.json` at repo root) is
 * hand-maintained alongside and must stay in sync - see schema.validate.test.ts.
 */

import type {
  ContextPath,
  ContextPathInput,
  Anchor,
  AnchorInput,
  Gate,
  GateInput,
  DriftRule,
  DriftRuleInput,
  Signals,
  SignalsInput,
  Compression,
  GateContext,
  Severity,
} from "../types/ContextPath";

const VALID_SEVERITIES: readonly Severity[] = ["info", "warn", "error", "critical"];
const VALID_CONTEXTS: readonly GateContext[] = ["output", "input", "both"];
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export class DCGPValidationError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`.dcgp.json${path}: ${message}`);
    this.name = "DCGPValidationError";
  }
}

function assertString(v: unknown, path: string): string {
  if (typeof v !== "string") {
    throw new DCGPValidationError(path, `must be a string (got ${typeOf(v)})`);
  }
  return v;
}

function assertNumber(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new DCGPValidationError(path, `must be a finite number (got ${typeOf(v)})`);
  }
  return v;
}

function assertNonEmptyString(v: unknown, path: string): string {
  const s = assertString(v, path);
  if (s.length === 0) throw new DCGPValidationError(path, "must be non-empty");
  return s;
}

function assertArray<T>(v: unknown, path: string, check: (item: unknown, p: string) => T): readonly T[] {
  if (!Array.isArray(v)) throw new DCGPValidationError(path, `must be an array (got ${typeOf(v)})`);
  return v.map((item, i) => check(item, `${path}[${i}]`));
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * Maximum length of a user-provided regex source string. Patterns longer than
 * this are refused to bound ReDoS attack surface.
 */
export const MAX_REGEX_PATTERN_LENGTH = 300;

/**
 * Heuristic for catastrophic backtracking. Rejects the classic polynomial /
 * exponential shapes like (a+)+, (a*)*, (a+)*, (a|a)+, (.+)*.
 * Imperfect but catches the well-known ReDoS footguns. Legitimate patterns
 * that trip this can bypass by passing a RegExp object directly.
 */
const NESTED_QUANTIFIER_RE = /\([^)]*[+*][^)]*\)[+*?]/;
const ALTERNATION_QUANTIFIER_RE = /\(\s*\w\s*\|\s*\w\s*\)[+*]/;

function toRegExp(raw: unknown, path: string): RegExp {
  if (raw instanceof RegExp) return raw;
  if (typeof raw === "string") {
    if (raw.length > MAX_REGEX_PATTERN_LENGTH) {
      throw new DCGPValidationError(
        path,
        `regex pattern too long (${raw.length} > ${MAX_REGEX_PATTERN_LENGTH} chars); potential ReDoS. Split into multiple gates or pass a pre-compiled RegExp.`,
      );
    }
    if (NESTED_QUANTIFIER_RE.test(raw) || ALTERNATION_QUANTIFIER_RE.test(raw)) {
      throw new DCGPValidationError(
        path,
        `regex pattern has nested quantifiers suggestive of catastrophic backtracking (ReDoS risk). Refactor or pass a pre-compiled RegExp if this is intentional.`,
      );
    }
    try {
      return new RegExp(raw);
    } catch (err) {
      throw new DCGPValidationError(
        path,
        `invalid regex pattern: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  throw new DCGPValidationError(path, `must be a string or RegExp (got ${typeOf(raw)})`);
}

function compileGlob(globPattern: string, path: string): void {
  // Validate the glob by attempting a translation. We don't need the result
  // here - toGlobalPattern in utils/regex is the canonical compiler - but
  // catching syntax errors at load time is cheaper than at runtime.
  try {
    // Minimal glob-to-regex used for validation only.
    const re = globPattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "::GLOBSTAR::")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/::GLOBSTAR::/g, ".*");
    new RegExp(`^${re}$`);
  } catch (err) {
    throw new DCGPValidationError(
      path,
      `invalid glob pattern: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function validateSignals(raw: unknown): SignalsInput {
  if (raw == null || typeof raw !== "object") {
    throw new DCGPValidationError(".signals", "must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const out: {
    files?: readonly string[];
    packages?: readonly string[];
    keywords?: readonly string[];
    tools?: readonly string[];
    env?: readonly string[];
    gitBranch?: readonly string[];
  } = {};

  for (const key of ["files", "packages", "keywords", "tools", "env", "gitBranch"] as const) {
    const v = obj[key];
    if (v !== undefined) {
      out[key] = assertArray(v, `.signals.${key}`, (item, p) => assertNonEmptyString(item, p));
    }
  }
  return out as Signals;
}

function validateAnchor(raw: unknown, path: string): Anchor {
  if (raw == null || typeof raw !== "object") {
    throw new DCGPValidationError(path, "must be an object");
  }
  const r = raw as Record<string, unknown>;
  const anchor: AnchorInput = {
    id: assertNonEmptyString(r.id, `${path}.id`),
    label: assertNonEmptyString(r.label, `${path}.label`),
    content: assertNonEmptyString(r.content, `${path}.content`),
    priority: assertNumber(r.priority, `${path}.priority`),
    whenSignals:
      r.whenSignals === undefined
        ? undefined
        : assertArray(r.whenSignals, `${path}.whenSignals`, (it, p) => assertString(it, p)),
  };
  if (anchor.priority < 0 || anchor.priority > 100) {
    throw new DCGPValidationError(`${path}.priority`, "must be in [0, 100]");
  }
  return anchor;
}

function validateGate(raw: unknown, path: string): Gate {
  if (raw == null || typeof raw !== "object") {
    throw new DCGPValidationError(path, "must be an object");
  }
  const r = raw as Record<string, unknown>;
  const sev = assertString(r.severity, `${path}.severity`);
  if (!VALID_SEVERITIES.includes(sev as Severity)) {
    throw new DCGPValidationError(
      `${path}.severity`,
      `must be one of ${VALID_SEVERITIES.join(", ")} (got "${sev}")`,
    );
  }
  const ctx = assertString(r.context, `${path}.context`);
  if (!VALID_CONTEXTS.includes(ctx as GateContext)) {
    throw new DCGPValidationError(
      `${path}.context`,
      `must be one of ${VALID_CONTEXTS.join(", ")} (got "${ctx}")`,
    );
  }
  const gate: GateInput = {
    id: assertNonEmptyString(r.id, `${path}.id`),
    pattern: toRegExp(r.pattern, `${path}.pattern`),
    severity: sev as Severity,
    message: assertNonEmptyString(r.message, `${path}.message`),
    suggest: r.suggest === undefined ? undefined : assertString(r.suggest, `${path}.suggest`),
    context: ctx as GateContext,
  };
  return { ...gate, pattern: gate.pattern as RegExp };
}

function validateDriftRule(raw: unknown, path: string): DriftRule {
  if (raw == null || typeof raw !== "object") {
    throw new DCGPValidationError(path, "must be an object");
  }
  const r = raw as Record<string, unknown>;
  const sev = assertString(r.severity, `${path}.severity`);
  if (!VALID_SEVERITIES.includes(sev as Severity)) {
    throw new DCGPValidationError(
      `${path}.severity`,
      `must be one of ${VALID_SEVERITIES.join(", ")}`,
    );
  }
  const rule: DriftRuleInput = {
    sourceDomain: assertNonEmptyString(r.sourceDomain, `${path}.sourceDomain`),
    pattern: toRegExp(r.pattern, `${path}.pattern`),
    severity: sev as Severity,
    correction: assertNonEmptyString(r.correction, `${path}.correction`),
  };
  return { ...rule, pattern: rule.pattern as RegExp };
}

function validateCompression(raw: unknown, path: string): Compression {
  if (raw == null || typeof raw !== "object") {
    throw new DCGPValidationError(path, "must be an object");
  }
  const r = raw as Record<string, unknown>;
  const out: Compression = {
    protectedTerms:
      r.protectedTerms === undefined
        ? undefined
        : assertArray(r.protectedTerms, `${path}.protectedTerms`, (i, p) => assertString(i, p)),
    neverPrune:
      r.neverPrune === undefined
        ? undefined
        : assertArray(r.neverPrune, `${path}.neverPrune`, (i, p) => {
            const s = assertNonEmptyString(i, p);
            compileGlob(s, p);
            return s;
          }),
    summarizeAs:
      r.summarizeAs === undefined ? undefined : assertString(r.summarizeAs, `${path}.summarizeAs`),
    retention:
      r.retention === undefined
        ? undefined
        : assertArray(r.retention, `${path}.retention`, (it, p) => {
            if (it == null || typeof it !== "object") {
              throw new DCGPValidationError(p, "must be an object");
            }
            const ri = it as Record<string, unknown>;
            const pat = assertNonEmptyString(ri.pattern, `${p}.pattern`);
            const score = assertNumber(ri.score, `${p}.score`);
            if (score < 0 || score > 1) {
              throw new DCGPValidationError(`${p}.score`, "must be in [0, 1]");
            }
            return {
              pattern: pat,
              score,
              reason:
                ri.reason === undefined
                  ? undefined
                  : assertString(ri.reason, `${p}.reason`),
            };
          }),
  };
  return out;
}

export function definePath(raw: ContextPathInput | Record<string, unknown>): ContextPath {
  if (raw == null || typeof raw !== "object") {
    throw new DCGPValidationError("", "must be an object");
  }
  const r = raw as Record<string, unknown>;

  const id = assertNonEmptyString(r.id, ".id");
  if (!ID_PATTERN.test(id)) {
    throw new DCGPValidationError(
      ".id",
      `must match ${ID_PATTERN} (lowercase, hyphen-separated, starting with a letter); got "${id}"`,
    );
  }

  const version = r.version === undefined ? "1.0.0" : assertNonEmptyString(r.version, ".version");
  const name = assertNonEmptyString(r.name, ".name");
  const description =
    r.description === undefined ? undefined : assertString(r.description, ".description");
  const extendsField =
    r.extends === undefined ? undefined : assertNonEmptyString(r.extends, ".extends");
  const tags =
    r.tags === undefined
      ? []
      : assertArray(r.tags, ".tags", (it, p) => assertNonEmptyString(it, p));

  const signals = validateSignals(r.signals);
  const anchors =
    r.anchors === undefined
      ? []
      : assertArray(r.anchors, ".anchors", (it, p) => validateAnchor(it, p));
  const gates =
    r.gates === undefined ? [] : assertArray(r.gates, ".gates", (it, p) => validateGate(it, p));
  const driftRules =
    r.driftRules === undefined
      ? []
      : assertArray(r.driftRules, ".driftRules", (it, p) => validateDriftRule(it, p));
  const compression = r.compression === undefined ? {} : validateCompression(r.compression, ".compression");

  // Anchor id uniqueness.
  const anchorIds = new Set<string>();
  for (const a of anchors) {
    if (anchorIds.has(a.id)) {
      throw new DCGPValidationError(".anchors", `duplicate anchor id "${a.id}"`);
    }
    anchorIds.add(a.id);
  }
  // Gate id uniqueness.
  const gateIds = new Set<string>();
  for (const g of gates) {
    if (gateIds.has(g.id)) {
      throw new DCGPValidationError(".gates", `duplicate gate id "${g.id}"`);
    }
    gateIds.add(g.id);
  }

  return {
    id,
    version,
    name,
    description,
    extends: extendsField,
    tags,
    signals,
    anchors,
    gates,
    driftRules,
    compression,
  };
}
