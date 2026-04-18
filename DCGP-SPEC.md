# DCGP Specification v1.0

**Dynamic Context Guidance Paths** - a closed-loop governance protocol for LLM context management.

Status: **Public Review** · Target ratification: 2026 Q3

---

## Abstract

This document specifies the interfaces, data formats, and runtime semantics required for an implementation to claim DCGP-1.0 conformance. Any programming language and any LLM host environment may implement this specification. The reference implementation is `@dcgp/core` in TypeScript.

## 1. Conformance levels

| Level | Requirement |
|---|---|
| **DCGP-1.0-MIN** | Implements Sections 3, 4, 5. Can load `.dcgp.json` files and inject anchors. |
| **DCGP-1.0-FULL** | Implements all sections including EntropyMonitor (Section 7) and the Retention Bridge (Section 7.7). |
| **DCGP-1.0-EXTENDED** | FULL plus FineTuningExporter (Section 9). |

A conformant implementation must document which level it supports in a single-line `COMPLIANCE` file at the repository root.

## 2. Terminology

- **Context Path** - a domain definition file (`.dcgp.json`) containing signals, anchors, gates, and drift rules
- **Anchor** - a piece of verified factual content injected into the system prompt
- **Gate** - a regex pattern matched against model output; fires a correction if matched
- **Drift rule** - a pattern that detects foreign-domain knowledge bleeding into the current session
- **Entropy Score** - a real number in [0.0, 1.0] representing aggregate context health
- **Retention Directive** - a structured emission from EntropyMonitor that binds retention policy to context health
- **Turn** - one request-response cycle between user and model

## 3. The Context Path schema

A Context Path is a JSON document matching this schema (see `dcgp.schema.json` for the formal JSON Schema):

```typescript
interface ContextPath {
  id: string               // lowercase, hyphen-separated, unique per project
  version: string          // semver; defaults to "1.0.0"
  name: string             // human-readable display name
  description?: string
  extends?: string         // id of parent path to inherit from
  tags?: string[]

  signals: {
    files?: string[]       // glob patterns - weight 0.90
    packages?: string[]    // package.json/requirements.txt/etc - weight 0.95
    keywords?: string[]    // content keywords - weight 0.60
    tools?: string[]       // CLI tools in PATH - weight 0.75
    env?: string[]         // environment variable names - weight 0.85
    gitBranch?: string[]   // branch glob patterns - weight 0.90
    weights?: { ... }      // optional override
  }

  anchors: Array<{
    id: string
    label: string
    content: string        // injected into system prompt as <anchor>
    priority: number       // 0-100, higher = earlier in prompt
    whenSignals?: string[] // conditional injection
  }>

  gates: Array<{
    id: string
    pattern: string | RegExp
    severity: 'info' | 'warn' | 'error' | 'critical'
    message: string
    suggest?: string
    context: 'output' | 'input' | 'both'
  }>

  driftRules: Array<{
    sourceDomain: string   // the domain bleeding in
    pattern: string | RegExp
    severity: 'info' | 'warn' | 'error' | 'critical'
    correction: string     // injected when detected
  }>

  compression?: {
    protectedTerms?: string[]
    neverPrune?: string[]
    summarizeAs?: string
    retention?: Array<{ pattern: string; score: number; reason?: string }>
  }
}
```

## 4. The 7-Step Loop

Every turn must execute these steps in order. Steps 1-2 may be skipped if a fingerprint exists in cache (30s TTL recommended).

1. **Sense** - Extract workspace signals (files, packages, env vars, git branch)
2. **Classify** - Score all registered paths; select the highest-confidence above threshold (default 0.35)
3. **Predict** - Compute entropy score (Section 7); emit events on threshold crossings; emit Retention Directive (Section 7.7)
4. **Orchestrate** - Inject active path's anchors into system prompt; apply entropy actions
5. **Execute** - Defer to the LLM (not governed by DCGP)
6. **Verify** - Run gate rules against model output; run drift detection on assistant messages
7. **Refine** - Score tool outputs for retention using the current Directive; persist session state

## 5. Cascade resolution

When multiple `.dcgp.json` files exist, they must be merged in this priority order:

```
Level 0: Global     (~/.dcgp/paths/)          lowest priority
Level 1: Editor     (~/.vscode/dcgp/)
Level 2: Workspace  (<workspace>/.dcgp/)      (only when .code-workspace present)
Level 3: Project    (<project-root>/.dcgp/)
Level 4: Subpath    (<packages>/*/.dcgp/)     highest priority
```

Merge semantics:
- **Scalars** - deeper level wins
- **Arrays with `id` field** (anchors, gates) - deep-merged by id
- **Arrays without `id`** (drift rules, retention) - concatenated and deduplicated
- **`extends`** - resolved last, after all levels have merged

A DCGP-1.0-FULL implementation must scan `packages/`, `apps/`, `services/`, `libs/`, `modules/`, `crates/` two levels deep for monorepo support.

## 6. System prompt injection format

Active anchors are injected as structured XML:

```xml
<dcgp-context domain="DOMAIN_ID" version="PATH_VERSION">
  <domain-identity>
    Name: PATH_NAME
    [Additional identity content]
  </domain-identity>
  <anchor id="ANCHOR_ID" label="ANCHOR_LABEL">
    ANCHOR_CONTENT
  </anchor>
  <!-- ...more anchors in priority order... -->
  <compression-guidance>
    When compressing this session, summarize as: "SUMMARIZE_AS"
    Always preserve these terms: TERM1, TERM2, ...
  </compression-guidance>
</dcgp-context>
```

A conformant LLM host may display this block to the user but must inject it verbatim into the model's system prompt.

## 7. The EntropyMonitor (FULL only)

### 7.1 Score formula (five factors)

```
score = (gate_pressure       × 0.30)
      + (drift_pressure      × 0.25)
      + (confidence_decay    × 0.20)
      + (citation_pressure   × 0.20)
      + (session_age         × 0.05)
```

Weights are configurable but **must sum to 1.0 ± 0.001**, AND **each individual weight must lie in [0, 1]**. Implementations must validate both conditions at initialization and throw if either is violated. (Sum-only validation is insufficient: negative and super-unit weights can sum to 1.0 while being nonsense.)

> **Spec history:** DCGP-1.0 shipped a four-factor formula. The five-factor formula closes the *silent hallucination* blind spot - a syntactically clean but factually wrong output with no gate hit and no drift match produced zero signal under four factors. See § 10c known limitations for the residual cases.

### 7.2 Factor definitions

| Factor | Formula |
|---|---|
| `gate_pressure` | `min(1, violations_in_window / (windowSize × 3))` |
| `drift_pressure` | `min(1, drift_events_in_window / (windowSize × 2))` |
| `confidence_decay` | `max(0, (peak − current) / peak)` - or `0.15` neutral penalty if `≥ 50%` of window is unknown |
| `citation_pressure` | `min(1, uncited_turns_in_window / windowSize)` - a turn is "uncited" if the assistant output contains no substring match against any active anchor's `content` (normalized: lowercased, whitespace-collapsed, min match length 8 chars). Anchor-silent output is a hallucination-leakage signal. |
| `session_age` | `min(1, ln(turn+1) / ln(saturationTurn+1))` - default saturationTurn = 50 |

**Note on the 50% confidence-unknown threshold.** The comparison is `≥ 0.5` (half or more of the window is `-1`), not strict `>`. This avoids a silent blind spot at exactly 50% unknown.

### 7.3 Numerical stability

All cumulative score tracking **must use Kahan compensated summation** to prevent floating-point drift across long sessions:

```typescript
function kahanSum(values: number[]): number {
  let sum = 0, compensation = 0
  for (const v of values) {
    const y = v - compensation
    const t = sum + y
    compensation = (t - sum) - y
    sum = t
  }
  return sum
}
```

### 7.4 Graduated response

Level ranges are **left-inclusive, right-exclusive** except CRITICAL which is closed on both ends:

| Level | Score range | Required actions |
|---|---|---|
| NOMINAL | `[0.00, 0.40)` | None. Emit Directive(PASSIVE, globalFloor=0.20) |
| ELEVATED | `[0.40, 0.70)` | Re-inject anchors (subject to cooldown, § 7.5) · emit Directive(TIGHTEN, globalFloor=0.40) |
| HIGH | `[0.70, 0.90)` | Re-inject · suggest compression · inject `<dcgp-entropy-correction>` · emit Directive(AGGRESSIVE, globalFloor=0.65) |
| CRITICAL | `[0.90, 1.00]` | Force re-classify · invalidate fingerprint · inject correction · emit Directive(NUCLEAR, globalFloor=0.90) |

Higher `globalFloor` means stricter pruning: a block must score >= floor to survive. NUCLEAR at 0.90 means only anchors (which always score 1.0) and protected paths survive.

### 7.5 Stability requirements

- **Hysteresis** - score must exceed threshold for ≥2 consecutive turns before firing (CRITICAL may fire at 1 turn)
- **Cooldowns** - ELEVATED ≥5 turns, HIGH ≥3 turns, CRITICAL ≥1 turn between same-level emissions
- **Anchor re-injection cooldown** - when ELEVATED/HIGH/CRITICAL persists, anchors must not be re-injected more than once per `ANCHOR_REINJECT_COOLDOWN_TURNS = 3` turns. Prevents token-waste loops when score sits just above a threshold.
- **Partial reset** on domain shift - clear confidence history + citation window + peak confidence, retain gate/drift windows to prevent Context Shock
- **Turn monotonicity** - implementations must assert `turn > lastRecordedTurn` on every `record()` call and throw on regression. Session resume from persisted state must advance, never rewind.

### 7.6-bis Classifier liveness (normative)

A DCGP-1.0-FULL implementation MUST force a fingerprint invalidation and re-classification at least every `CLASSIFIER_TTL_TURNS = 20` turns, even when no entropy event has fired. This closes the *stale-classifier hallucination* blind spot - a classifier returning high confidence for a domain that no longer matches actual work never triggers confidence decay on its own.

Implementations MAY re-classify more frequently on classifier-owned heuristics (file change events, branch changes, env-var changes).

### 7.6 Verification baseline

A conformant DCGP-1.0-FULL implementation must pass:

1. **Determinism** - identical input sequences produce identical scores
2. **Monotonicity** - scores transition through ELEVATED before reaching HIGH
3. **Hysteresis** - single-turn spikes do not fire non-CRITICAL events
4. **Stability** - score remains in [0, 1] after 200+ turns of mixed input
5. **Partial reset** - `resetPartial()` preserves gate/drift windows

### 7.7 Retention Bridge (normative)

A DCGP-1.0-FULL implementation MUST:
1. Emit a `RetentionDirective` on every transition of EntropyLevel (event-driven).
2. Expose a synchronous accessor (`currentDirective()` or equivalent) that returns the active Directive at any time, including when the EntropyLevel is NOMINAL (returns a `PASSIVE` Directive with `globalFloor = 0.50`).

The Directive is the sole contract between `EntropyMonitor` and any consumer (internal `RetentionScorer`, external DCP plugin, or custom integration) that enforces context retention.

**Directive shape (normative):**

```typescript
enum PruneIntensity {
  PASSIVE = 0,      // NOMINAL
  TIGHTEN = 1,      // ELEVATED
  AGGRESSIVE = 2,   // HIGH
  NUCLEAR = 3,      // CRITICAL
}

interface RetentionDirective {
  readonly intensity: PruneIntensity
  readonly globalFloor: number          // τ ∈ [0, 1]
  readonly protectedPaths: string[]     // activePath.compression.neverPrune
  readonly reason: string               // includes score and triggering level
  readonly turn: number
  readonly score: number
}
```

**Deterministic mapping (normative):**

```
NOMINAL   -> PASSIVE    · globalFloor = 0.20   (lenient; keeps most blocks)
ELEVATED  -> TIGHTEN    · globalFloor = 0.40   (raises the bar)
HIGH      -> AGGRESSIVE · globalFloor = 0.65   (only hot anchors + recent tools)
CRITICAL  -> NUCLEAR    · globalFloor = 0.90   (anchors alone survive)
```

**Consumer contract (normative):**

A conformant consumer of the Directive MUST enforce the retention equation:

```
Keep(block) := score(block) ≥ directive.globalFloor
            ∨  matches(block.path, directive.protectedPaths)
```

The `score(block)` function is implementation-defined but MUST be deterministic for a given block and session state.

Implementations MAY expose additional intermediate intensities via custom integrations, but the four canonical `PruneIntensity` values and their `globalFloor` mappings MUST remain reachable and unchanged.

## 8. Session state

Implementations must persist the following per session, keyed by session ID:

```typescript
interface DCGPSessionState {
  sessionId: string | null
  activeDomainId: string | null
  classificationConfidence: number
  currentTurn: number
  domainShiftLog: DomainShift[]
  gateViolations: GateViolationRecord[]
  driftEvents: DriftRecord[]
  stats: {
    totalGateViolations: number
    totalDriftEvents: number
    totalCorrectionsInjected: number
    totalEntropyEvents: number
    domainSwitches: number
  }
}
```

Recommended path: `$XDG_DATA_HOME/opencode/storage/plugin/dcgp/{sessionId}.json`. Writes must be atomic (temp-file-then-rename).

## 9. Fine-tuning export (EXTENDED only)

An EXTENDED implementation must expose a method to convert session event logs into labeled training examples in at least one of:

- **OpenAI chat completions** - `{messages: [{role, content}, ...], metadata}`
- **Anthropic completion** - `{prompt, completion, metadata}`
- **HuggingFace SFT** - `{instruction, input, output, domain, source, severity}`

Each example must include:
- `domainId` - the active domain at time of violation
- `source` - one of `gate`, `drift`, `entropy`
- `severity` - one of `info`, `warn`, `error`, `critical`
- `violatingOutput` - the text that triggered the intervention
- `correction` - the guidance DCGP injected
- `label` - human-readable identifier (`gate:no-console`, `drift:python`, `entropy:critical`)

## 10. Engineering constraints

The following are normative for all conformance levels:

- No threading primitives (mutexes, atomics). Implementations must document their concurrency model.
- Entropy score is a Health Index, not a probability. Bayesian reasoning against thresholds is explicitly out of scope.
- Core library must not introduce external runtime dependencies beyond the target language's stdlib and its schema validator of choice.

## 10b. Failure modes (normative)

A DCGP-1.0-FULL implementation MUST define and enforce the following failure modes. Each has a named constant (the threshold) and a required behavior. Named constants must be exported from the public API.

| # | Failure mode | Trigger | Required constant | Required behavior |
|---|---|---|---|---|
| 1 | Signal Collision | Top-two classification confidences differ by less than `COLLISION_DELTA` | `COLLISION_DELTA = 0.10` | Classifier returns `collision: true`; EntropyMonitor treats as ELEVATED trigger on the next turn |
| 2 | Anchor Bloat | Cumulative anchor tokens exceed `ANCHOR_BLOAT_RATIO × contextWindow` | `ANCHOR_BLOAT_RATIO = 0.20`, `ANCHOR_DEMOTION_PRIORITY = 70` | Anchors with `priority < ANCHOR_DEMOTION_PRIORITY` demoted to label-only injection |
| 3 | Warmup Blindspot | Gate violation at `turn ≤ WARMUP_TURNS` | `WARMUP_TURNS = 3` | Violation bypasses EntropyMonitor hysteresis; immediate anchor re-inject |
| 4 | Domain Deadlock | Oscillation A->B->A within `SHIFT_COOLDOWN_TURNS` | `SHIFT_COOLDOWN_TURNS = 3` | Pending shift suppressed; current domain forced until cooldown expires |
| 5 | Numerical Drift | Cumulative score tracking over a long session | (see § 7.3) | Kahan compensated summation for all score aggregation |
| 6 | Stale Classifier | No reclassification for `CLASSIFIER_TTL_TURNS` turns | `CLASSIFIER_TTL_TURNS = 20` | Forced `fingerprinter.invalidate()` + reclassify regardless of entropy state |
| 7 | Anchor Reinject Loop | Entropy at ELEVATED or above for consecutive turns | `ANCHOR_REINJECT_COOLDOWN_TURNS = 3` | Re-injection may occur at most once per cooldown window |

An implementation claiming FULL conformance but omitting any of these enforcements SHOULD explicitly state the omission in its conformance documentation.

## 10c. Known limitations (informative)

These are residual hallucination-leakage vectors not fully closed by DCGP-1.0. They are acknowledged here so audits can flag them and future revisions can address them.

| Limitation | Leakage vector | Current mitigation |
|---|---|---|
| **Semantic drift (paradigm)** | A model using one language's idioms (e.g., Python list comprehensions in Rust, OOP patterns in Haskell) emits no regex match | Pattern-based DriftDetector catches lexical drift only. Semantic drift requires LLM-as-judge or AST analysis - out of scope for DCGP-1.0 |
| **Stale anchor content** | An anchor with outdated content (wrong API version, removed method) is injected verbatim; model hallucinates *from* the anchor | Optional `anchor.ttl` and `anchor.verifiedAt` fields MAY be defined; ContextInjector MAY warn on expired anchors. Not normative. |
| **Code-fence false-positives** | A gate pattern matches inside a markdown code block or comment discussing the anti-pattern (e.g., "we removed `console.log`") | HallucinationGate runs on raw text. Context-aware extraction (strip markdown, ignore comments) is recommended for Phase B+. |
| **Cross-session memory** | Corrections fired in session N are invisible to session N+1 | FineTuningExporter (§ 9) converts corrections to training data at fine-tune time, not runtime. Persistent cross-session learning is out of scope. |
| **Mount conflict silence** | `install.sh` skips overwriting an existing `AGENTS.md` or similar mount file with no warning emitted | Implementations SHOULD emit a visible warning and non-zero exit code on mount conflicts; end-user MUST set `DCGP_FORCE=1` to overwrite. |

Future revisions (DCGP-1.1+) may promote any of these to normative requirements.

## 11. Extensions

Implementations may add fields to `ContextPath` under an `x-` prefix (e.g. `x-my-company`). Unrecognized `x-` fields must be preserved by validators and not cause errors.

## 12. Changelog

- **1.0** - Initial specification, derived from `@dcgp/core` v1.0.0-rc. Adds § 7.7 Retention Bridge and § 10b Failure Modes as normative.

---

*Maintained by the DCGP working group. File issues at https://github.com/addicted2crypto/DCGP/issues.*
