# DCGP - Agent Mounting Guide

**Dynamic Context Guidance Paths** is the semantic operating system for LLM agents. This file is the single source of truth for any agent operating in this repository. Mount it via `AGENTS.md` (OpenAI / generic), `CLAUDE.md` (Claude), `.cursorrules` (Cursor), `.clinerules` (Cline), `.windsurfrules` (Windsurf), or `.github/copilot-instructions.md` (Copilot) - the content is identical; the filename is an accommodation to each tool's conventions.

**Live implementation state is defined by `./scripts/verify-dcgp.sh`.** If this document claims a feature the script does not verify, the script wins. Re-read this file only after `verify-dcgp.sh` exits 0.

---

## Conformance tier claimed by this repo

```
DCGP-1.0-FULL + EXTENDED
```

Phase A ships the governance kernel plus the FineTuningExporter. Phases B-D (16 community paths, OpenCode plugin, CLI, VS Code extension) are explicitly deferred and their absence is not a bug.

---

## What this system does

DCGP prevents context decay in long LLM sessions by running a closed-loop control system around the model. It is not a context pruner. It is not a summarizer. It is a **governance layer** - a kernel that manages what the model knows, how certain it is about its domain, when to intervene before hallucinations begin, and how much of the working context survives pruning.

Every agent operating in this codebase operates inside this loop. There are no exceptions.

---

## The 7-step Circular Intelligence Loop

```
Sense -> Classify -> Predict -> Orchestrate -> Execute -> Verify -> Refine -> (back to Sense)
```

**Step 1 - Sense** (`FingerprintEngine`): Reads the workspace before you type. Parses packages, env vars, git branch, config files. 30s TTL cache. 16 ignored dirs. Zero shell calls.

**Step 2 - Classify** (`DomainClassifier`): Scores all registered domain paths by weighted signal match. Confidence 0.0-1.0. Signal weights: packages(0.95) > files(0.90) = gitBranch(0.90) > env(0.85) > tools(0.75) > keywords(0.60). Session keywords capped at 500. Detects **collision** (top-two confidences within `COLLISION_DELTA = 0.10`) and **deadlock** (A->B->A within `SHIFT_COOLDOWN_TURNS = 3`). Forced reclassification every `CLASSIFIER_TTL_TURNS = 20` turns regardless of entropy state (stale-classifier blind spot).

**Step 3 - Predict** (`EntropyMonitor`): The only proactive step. Computes a health score every turn from **five** factors. Emits `RetentionDirective` on every level transition and exposes `currentDirective()` as an always-readable synchronous accessor.

**Step 4 - Orchestrate** (`ContextInjector` + `CascadeResolver`): Injects verified domain truth into the system prompt as structured XML anchors. Five-level cascade: global -> vscode -> workspace -> project -> subpath. **Anchor bloat mitigation**: when cumulative anchor tokens exceed `ANCHOR_BLOAT_RATIO = 0.20` × contextWindow, anchors with `priority < ANCHOR_DEMOTION_PRIORITY = 70` are demoted to label-only. Re-injection rate-limited to once per `ANCHOR_REINJECT_COOLDOWN_TURNS = 3`.

**Step 5 - Execute** (LLM): The model performs its task. DCGP does not intercept inference. It only shapes the context window the model sees.

**Step 6 - Verify** (`HallucinationGate` + `DomainDriftDetector`): Validates every assistant message. Gates block and inject corrections. Drift detector scans for foreign-domain bleed. Gate violations at `turn ≤ WARMUP_TURNS = 3` bypass hysteresis (warmup blindspot).

**Step 7 - Refine** (`RetentionScorer` + `SessionState`): `RetentionScorer` consumes the current `RetentionDirective` and enforces `Keep(block) := score(block) ≥ directive.globalFloor ∨ matches(block.path, directive.protectedPaths)`. `SessionState` persists health record atomically.

---

## The EntropyMonitor formula

The mathematical core. Every number below is real, implemented, and tested.

```
score = gate_pressure       × 0.30
      + drift_pressure      × 0.25
      + confidence_decay    × 0.20
      + citation_pressure   × 0.20
      + session_age         × 0.05
```

**Constraints (enforced in constructor):**
- Weights must sum to 1.0 ± 0.001 AND each weight ∈ [0, 1] - throws `Error` if either is violated
- Score range is always [0.0, 1.0] - clamped after summation
- Summation uses Kahan compensated algorithm - no floating-point drift over long sessions
- `turn` is monotonic - `record()` throws on regression

**Factor definitions:**

| Factor | Formula | Saturates at |
|---|---|---|
| `gate_pressure` | `min(1.0, violations_in_window / (windowSize × 3))` | 3 violations/turn × window |
| `drift_pressure` | `min(1.0, drift_events_in_window / (windowSize × 2))` | 2 events/turn × window |
| `confidence_decay` | `max(0, (peak_conf − current_conf) / peak_conf)` | Full drop from peak |
| `citation_pressure` | `min(1.0, uncited_turns_in_window / windowSize)` | Every turn anchor-silent |
| `session_age` | `min(1.0, ln(turn+1) / ln(ageSaturationTurn+1))` | Turn 50 by default |

**Confidence blindness protection.** If the classifier returns `-1` (unknown) for `≥50%` (not strict `>`) of recent readings, a neutral penalty of `0.15` is applied to the confidence factor. Prevents the score from appearing artificially healthy when classification has silently failed.

**Citation pressure.** A turn is "uncited" when the assistant output contains no substring match (normalized: lowercased, whitespace-collapsed, min 8 chars) against any active anchor's `content`. Closes the silent-hallucination blind spot where clean-but-wrong outputs produced no signal.

**Graduated response (left-inclusive, right-exclusive ranges):**

| Level | Score | Directive | Actions |
|---|---|---|---|
| NOMINAL | `[0.00, 0.40)` | `PASSIVE` (floor=0.20) | None. Passive monitoring |
| ELEVATED | `[0.40, 0.70)` | `TIGHTEN` (floor=0.40) | Re-inject anchors (cooldown-gated) |
| HIGH | `[0.70, 0.90)` | `AGGRESSIVE` (floor=0.65) | Re-inject + suggest compression + inject `<dcgp-entropy-correction>` |
| CRITICAL | `[0.90, 1.00]` | `NUCLEAR` (floor=0.90) | Force re-classify + `fingerprinter.invalidate()` + inject correction |

**Stability mechanisms:**
- Hysteresis: score must exceed threshold for 2 consecutive turns before firing (CRITICAL fires immediately - 1 turn)
- Cooldowns: ELEVATED 5 turns · HIGH 3 turns · CRITICAL 1 turn
- Anchor re-injection cooldown: `ANCHOR_REINJECT_COOLDOWN_TURNS = 3`
- Classifier TTL: `CLASSIFIER_TTL_TURNS = 20`

**Reset semantics:**
- `resetPartial()` - on domain shift: clears confidence history + citation window + peak confidence, retains gate/drift windows to prevent Context Shock
- `reset()` - on CRITICAL or full session restart: wipes all rolling state

---

## The Retention Bridge (Pruning Nexus)

The context pruning point is the `RetentionDirective` - the sole wire between `EntropyMonitor` (the decider) and any retention consumer (internal `RetentionScorer` or external DCP plugin).

```typescript
enum PruneIntensity { PASSIVE, TIGHTEN, AGGRESSIVE, NUCLEAR }

interface RetentionDirective {
  readonly intensity: PruneIntensity
  readonly globalFloor: number        // τ ∈ [0, 1]
  readonly protectedPaths: string[]   // activePath.compression.neverPrune
  readonly reason: string
  readonly turn: number
  readonly score: number
}
```

Consumer MUST enforce:

```
Keep(block) := score(block) ≥ directive.globalFloor
            ∨  matches(block.path, directive.protectedPaths)
```

See [`DCGP-SPEC.md § 7.7`](./DCGP-SPEC.md) for the full normative contract.

---

## What agents must never do

These are hard constraints. Any agent output that violates these should be flagged as a hallucination.

**Architecture:**
- Do not add threading primitives (mutexes, locks, atomic operations). The entire stack runs in the Node.js event loop - single-threaded by design. Race conditions on EntropyMonitor state are not physically possible.
- Do not call the entropy score a "probability". It is a Health Index - a measure of system stress. Probabilities obey Kolmogorov axioms; this does not.
- Do not bypass `resetPartial()` in favour of `reset()` on domain shifts. Wiping the gate/drift windows on every domain change causes Context Shock.

**Code:**
- Do not use `+` operator for cumulative score tracking. Use `kahanSum()`.
- Do not pass custom weights to `EntropyMonitor` without verifying they sum to 1.0 AND each is in [0, 1]. The constructor enforces this at runtime but TypeScript won't catch it.
- Do not add external dependencies to `@dcgp/core`. It has zero runtime deps by design - every consumer (opencode, vscode, cli) depends on it.
- Do not use `any` in core source. Use `unknown` at boundaries; narrow with type guards.

**Testing:**
- Do not write tests that mock `EntropyMonitor` state. Drive it deterministically with explicit inputs. Mocking produces tests that pass while the real math breaks.
- Do not assert on exact entropy scores without accounting for `session_age`. Age is always non-zero after warmup and will shift scores by up to 0.05.

---

## Failure modes (enforced)

| # | Mode | Constant | Behavior |
|---|---|---|---|
| 1 | Signal Collision | `COLLISION_DELTA = 0.10` | Classifier returns `collision: true`; EntropyMonitor treats as ELEVATED trigger |
| 2 | Anchor Bloat | `ANCHOR_BLOAT_RATIO = 0.20`, `ANCHOR_DEMOTION_PRIORITY = 70` | Low-priority anchors demoted to labels |
| 3 | Warmup Blindspot | `WARMUP_TURNS = 3` | Early violations bypass hysteresis |
| 4 | Domain Deadlock | `SHIFT_COOLDOWN_TURNS = 3` | A->B->A suppressed |
| 5 | Numerical Drift | `kahanSum` | Kahan compensated summation everywhere |
| 6 | Stale Classifier | `CLASSIFIER_TTL_TURNS = 20` | Forced reclassify regardless of entropy |
| 7 | Anchor Reinject Loop | `ANCHOR_REINJECT_COOLDOWN_TURNS = 3` | Re-injection rate-limited |

Residual limitations (out of scope for DCGP-1.0) are in `DCGP-SPEC.md § 10c`.

---

## The .dcgp.json format

Place at `.dcgp/<your-project-id>.dcgp.json` in any project root. Schema enforced by Zod at runtime and by `dcgp.schema.json` for editor IntelliSense. Full reference in [`DCGP-SPEC.md § 3`](./DCGP-SPEC.md).

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/addicted2crypto/DCGP/main/dcgp.schema.json",
  "id": "my-project",
  "version": "1.0.0",
  "name": "My Project",
  "extends": "nodejs",
  "signals": {
    "packages": ["@my/core"],
    "files": ["my.config.ts"],
    "keywords": ["my-project"],
    "gitBranch": ["feat/*"]
  },
  "anchors": [
    { "id": "stack", "label": "Stack identity", "priority": 100,
      "content": "Precise factual description of your tech stack." }
  ],
  "gates": [
    { "id": "no-console", "pattern": "console\\.log", "severity": "warn",
      "message": "Use project logger - not console.log", "context": "output" }
  ],
  "driftRules": [
    { "sourceDomain": "python", "pattern": "pip install|requirements\\.txt",
      "severity": "error", "correction": "Node.js project - use npm/pnpm, not pip" }
  ],
  "compression": {
    "summarizeAs": "my-project development session",
    "neverPrune": ["src/core/**"],
    "retention": [{ "pattern": "read:src/**", "score": 0.8 }]
  }
}
```

---

## Verification baseline

A DCGP-1.0-FULL implementation is considered healthy when all five conditions in `DCGP-SPEC.md § 7.6` hold:

1. **Determinism** - identical input sequences produce identical entropy scores
2. **Monotonicity** - scores transition through ELEVATED before reaching HIGH
3. **Hysteresis** - single-turn spikes do not fire non-CRITICAL events
4. **Stability** - score remains in [0, 1] after 200+ turns of mixed input
5. **Partial reset** - `resetPartial()` preserves gate/drift windows

Each is backed by a named Sentinel test and asserted by `scripts/verify-dcgp.sh`.

---

## Package structure (actual, not aspirational)

```
packages/
  core/                    @dcgp/core - zero runtime deps - Phase A FULL+EXTENDED
    src/
      types/               ContextPath · Entropy · Directive · Session
      schema/              validate.ts (Zod + definePath)
      classifier/          FingerprintEngine.ts · DomainClassifier.ts
      loader/              CascadeResolver.ts
      gates/               HallucinationGate.ts · DomainDriftDetector.ts
      pruner/              RetentionScorer.ts (τ-enforcer)
      injector/            ContextInjector.ts (bloat + cooldown)
      monitor/             EntropyMonitor.ts (5-factor, Directive emitter)
      state/               SessionState.ts
      export/              FineTuningExporter.ts (EXTENDED)
      utils/               clamp · kahan · regex
      index.ts             Public API barrel
    tests/                 Sentinel suite

  paths/                   Phase B (deferred)
  opencode/                Phase C (deferred)
  vscode/                  Phase D (deferred)
  cli/                     Phase D (deferred)

DCGP-SPEC.md               Normative specification - single source of truth
COMPLIANCE                 Single line: FULL+EXTENDED
dcgp.schema.json           JSON Schema generated from Zod
scripts/verify-dcgp.sh     Executable compliance - run it, not this doc
```

---

*DCGP v1.0.0-rc · @addicted2crypto · MIT License*
