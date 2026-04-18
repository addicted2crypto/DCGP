# DCGP - Dynamic Context Guidance Paths

**The Semantic Operating System for LLM Agents** · v1.0.0-rc · MIT

[![Spec](https://img.shields.io/badge/spec-DCGP--1.0-0f6e56)](./DCGP-SPEC.md)
[![Conformance](https://img.shields.io/badge/conformance-FULL%2BEXTENDED-0f6e56)](./COMPLIANCE)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Zero deps](https://img.shields.io/badge/@dcgp/core-0%20runtime%20deps-success)](./packages/core/package.json)

DCGP is a closed-loop governance layer that eliminates context decay and hallucinations in long-running LLM sessions. It monitors context health per turn and orchestrates interventions, predicting degradation before the model begins to hallucinate.

**Live state of this repo is defined by `./scripts/verify-dcgp.sh`.** It is the single source of truth for what is implemented. The prose below describes intent; the script enforces reality.

> **Relationship to DCP ([@tarquinen/opencode-dcp](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning)):** DCP manages context *quantity* (token budget, rule-based pruning of stale outputs). DCGP manages context *quality* (domain grounding, entropy prediction, hallucination blocking). Run both, they are orthogonal and additive.
>
> DCGP does not reimplement DCP's pruning. DCGP emits a `RetentionDirective` on every entropy-level transition (see [Pruning Nexus](#the-pruning-nexus)); `@dcgp/opencode` translates each directive into a DCP-shaped config patch (`turnProtection`, `compress`, `strategies`) so DCP's pruning tightens as entropy rises. The translation table is `CONFIG_TRANSLATION` in `@dcgp/opencode`.
>
> Config files sit side by side in `.opencode/`:
>
> ```
> .opencode/dcp.jsonc    <- DCP reads this (rule-based pruning config)
> .opencode/dcgp.jsonc   <- DCGP reads this (domain signals, gates, anchors)
> ```

---

## Quick start (fork or clone it into your repo)

Three ways to adopt DCGP, ordered from fastest to most integrated:

### 1. One-line install into an existing project

```bash
DCGP_VERSION=v1.0.0-rc curl -fsSL https://raw.githubusercontent.com/addicted2crypto/DCGP/${DCGP_VERSION}/scripts/install.sh | bash
```

This drops the universal mount files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.clinerules`, `.windsurfrules`, `.github/copilot-instructions.md`) into your repo, scaffolds `.dcgp/<your-project>.dcgp.json`, and optionally installs `@dcgp/core` if you have a `package.json`. Every AI tool that touches your repo now operates inside the 7-step loop.

**Pin `DCGP_VERSION` to a tag in production.** Unpinned installs silently drift if upstream governance files change.

### 2. Library integration

```bash
pnpm add @dcgp/core @dcgp/paths          # governance kernel + 16 community paths
pnpm add @dcgp/opencode                  # only if you use OpenCode
pnpm add -g @dcgp/cli                    # optional CLI (dcgp classify, dcgp status, ...)
```

Use the runtime directly:

```ts
import { DCGPRuntime } from "@dcgp/opencode";

const dcgp = new DCGPRuntime({ workspacePath: process.cwd() });
dcgp.classify(0);

// Per-turn:
const result = dcgp.processTurn({
  turn: 1,
  userMessage: "how do I set this up?",
  assistantMessage: modelOutput,
});

// result.directive is the RetentionDirective (Pruning Nexus).
// result.injection is the XML block to prepend to the next system prompt.
// result.gateViolations, result.driftEvents are the Sentinel-1 hit list.
```

### 3. Fork and extend

```bash
git clone https://github.com/addicted2crypto/DCGP.git
cd dcgp
pnpm install
pnpm -r build
pnpm test
./scripts/verify-dcgp.sh            # 62+ checks pass at FULL+EXTENDED
```

Then:
- **Add a new community path** to `packages/paths/src/<category>/<name>.ts` and re-export from `packages/paths/src/index.ts`. The `community-paths.test.ts` invariants fail closed if you miss a required field.
- **Extend the gate corpus** in each path's `gates: [...]` or contribute domain-neutral patterns to `packages/core/src/gates/HallucinationGate.ts`.
- **Add a new editor mount** by mirroring `CLAUDE.md` into that editor's config location. `scripts/install.sh` is the canonical drop-list.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full fork workflow, including how to propose a new conformance level or add a Failure Mode constant.

---

## Conformance

This repo claims:

```
DCGP-1.0-FULL + EXTENDED
```

Verify from a cold clone:

```bash
pnpm install
pnpm --filter @dcgp/core test
./scripts/verify-dcgp.sh       # exits 0 with "DCGP-1.0 FULL+EXTENDED verified"
```

### Tier summary

| Tier | Scope | Status |
|---|---|---|
| **MIN** | Schema + cascade + injection (§ 3, 4, 5, 6) | Phase A |
| **FULL** | MIN + EntropyMonitor + Pruning Nexus + Failure Modes (§ 7, 7.7, 10b) | Phase A |
| **EXTENDED** | FULL + FineTuningExporter (§ 9) | Phase A |

---

## The Pruning Nexus

The context pruning point. `EntropyMonitor` does not prune - it emits a `RetentionDirective` that binds retention policy to context health. Any consumer (internal `RetentionScorer`, external DCP plugin) enforces:

```
Keep(block) := score(block) ≥ directive.globalFloor
            ∨  matches(block.path, directive.protectedPaths)
```

The deterministic mapping from entropy level to retention floor. Higher floor = stricter pruning (blocks must score >= floor to survive):

```
NOMINAL   -> PASSIVE    · floor = 0.20   Keep most blocks
ELEVATED  -> TIGHTEN    · floor = 0.40   Raise the bar; mid-value content drops
HIGH      -> AGGRESSIVE · floor = 0.65   Only hot anchors and recent tools
CRITICAL  -> NUCLEAR    · floor = 0.90   Anchors alone survive (anchors score 1.0)
```

Full normative spec at [`DCGP-SPEC.md § 7.7`](./DCGP-SPEC.md).

---

## The 7-Step Circular Intelligence Loop

Every turn follows this sequence - no exceptions.

```
Sense -> Classify -> Predict -> Orchestrate -> Execute -> Verify -> Refine -> (repeat)
```

| Step | Component | Responsibility |
|---|---|---|
| 1 · Sense | `FingerprintEngine` | Workspace scan - packages, env, git. 30s TTL cache. |
| 2 · Classify | `DomainClassifier` | Weighted signal match -> confidence 0.0-1.0. |
| 3 · Predict | `EntropyMonitor` | Health score per turn -> graduated `RetentionDirective` emission. |
| 4 · Orchestrate | `ContextInjector` | XML anchors injected via 5-level cascade. Anchor bloat mitigation. |
| 5 · Execute | LLM | Model performs task in shaped context window. |
| 6 · Verify | `HallucinationGate` + `DomainDriftDetector` | Output validated. Bleed detected. |
| 7 · Refine | `RetentionScorer` + `SessionState` | Directive-driven retention. Session health persisted. |

---

## The EntropyMonitor - Mathematical Core

```
score = gate_pressure       × 0.30
      + drift_pressure      × 0.25
      + confidence_decay    × 0.20
      + citation_pressure   × 0.20
      + session_age         × 0.05
```

| Factor | Formula | Saturates at |
|---|---|---|
| `gate_pressure` | `min(1, violations_in_window / (windowSize × 3))` | 3 violations/turn |
| `drift_pressure` | `min(1, drift_events_in_window / (windowSize × 2))` | 2 events/turn |
| `confidence_decay` | `max(0, (peak − current) / peak)` | Full drop from peak |
| `citation_pressure` | `min(1, uncited_turns_in_window / windowSize)` | Every turn anchor-silent |
| `session_age` | `min(1, ln(turn+1) / ln(51))` | Turn 50 |

**Why `citation_pressure`?** It closes the *silent hallucination* blind spot - a syntactically clean, factually wrong output that matches no gate and no drift pattern. If the assistant produces content that never substring-matches any active anchor, pressure rises. Not a perfect detector, but a signal where there was none.

**Constraints enforced in constructor:**
- Weights must sum to 1.0 ± 0.001 AND each weight ∈ [0, 1] - throws `Error` if either violated
- Score always clamped to [0.0, 1.0]
- Summation uses Kahan compensated algorithm - no float drift over 200+ turns
- Unknown confidence (`-1`) applies `CONFIDENCE_UNKNOWN_PENALTY = 0.15` if **≥50%** of readings - no blind spots
- `turn` counter monotonic - throws on regression

**Graduated response (left-inclusive, right-exclusive ranges):**

| Level | Score | Directive emitted | Actions |
|---|---|---|---|
| NOMINAL | `[0.00, 0.40)` | `PASSIVE` (floor=0.20) | Passive monitoring |
| ELEVATED | `[0.40, 0.70)` | `TIGHTEN` (floor=0.40) | Re-inject anchors (throttled by cooldown) |
| HIGH | `[0.70, 0.90)` | `AGGRESSIVE` (floor=0.65) | Re-inject · suggest compression · `<dcgp-entropy-correction>` |
| CRITICAL | `[0.90, 1.00]` | `NUCLEAR` (floor=0.90) | Force re-classify · `fingerprinter.invalidate()` · full correction |

**Stability mechanics:**
- Hysteresis: 2 consecutive turns above threshold before firing (CRITICAL: 1 turn)
- Cooldowns: ELEVATED 5t · HIGH 3t · CRITICAL 1t
- Anchor re-injection cooldown: `ANCHOR_REINJECT_COOLDOWN_TURNS = 3` - prevents token-waste loops
- Classifier TTL: `CLASSIFIER_TTL_TURNS = 20` - forced invalidate+reclassify closes stale-classifier blind spot
- `resetPartial()` on domain shift: clears confidence + citation + peak, retains gate/drift windows (prevents Context Shock)
- `reset()` on CRITICAL or session restart: wipes all state

---

## Failure Modes (enforced)

Every mode below has an exported named constant and a passing Sentinel test:

| # | Failure mode | Constant | Test |
|---|---|---|---|
| 1 | Signal Collision | `COLLISION_DELTA = 0.10` | `classifier.collision.test.ts` |
| 2 | Anchor Bloat | `ANCHOR_BLOAT_RATIO = 0.20`, `ANCHOR_DEMOTION_PRIORITY = 70` | `injector.bloat.test.ts` |
| 3 | Warmup Blindspot | `WARMUP_TURNS = 3` | `gate.warmup.test.ts` |
| 4 | Domain Deadlock | `SHIFT_COOLDOWN_TURNS = 3` | `classifier.deadlock.test.ts` |
| 5 | Numerical Drift | `kahanSum` | `entropy.kahan.test.ts` |
| 6 | Stale Classifier | `CLASSIFIER_TTL_TURNS = 20` | `classifier.ttl.test.ts` |
| 7 | Anchor Reinject Loop | `ANCHOR_REINJECT_COOLDOWN_TURNS = 3` | `injector.reinject.test.ts` |

Known residual leakage vectors are documented in [`DCGP-SPEC.md § 10c`](./DCGP-SPEC.md) - semantic paradigm drift, stale anchor content, markdown code-fence false positives, and cross-session memory. These are out of scope for DCGP-1.0 and surface explicitly rather than hide behind "all spec gaps closed."

---

## FineTuningExporter - runtime governance as training data

Every correction DCGP injects is a labeled training example. Gate violation -> corrected output is a `(prompt, completion)` pair. Drift event -> domain-anchored correction is another. The `FineTuningExporter` walks a session event log and emits JSONL in OpenAI, Anthropic, or HuggingFace SFT formats.

```ts
import { FineTuningExporter } from '@dcgp/core'

const exporter = new FineTuningExporter()
exporter.activate(activePath)
const examples = exporter.buildExamples(sessionState.eventLog)
const jsonl = exporter.serialize(examples, 'openai')
```

Your runtime governance becomes your training data. See [`DCGP-SPEC.md § 9`](./DCGP-SPEC.md) for the normative schema.

---

## Quick Start - Project path

Create `.dcgp/<your-project-id>.dcgp.json`:

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
    {
      "id": "stack",
      "label": "Stack identity",
      "priority": 100,
      "content": "Factual description of your stack, versions, and constraints."
    }
  ],
  "gates": [
    {
      "id": "no-console",
      "pattern": "console\\.log",
      "severity": "warn",
      "message": "Use project logger, not console.log",
      "context": "output"
    }
  ],
  "driftRules": [
    {
      "sourceDomain": "python",
      "pattern": "pip install|requirements\\.txt",
      "severity": "error",
      "correction": "Node.js project. Use npm/pnpm."
    }
  ],
  "compression": {
    "summarizeAs": "my-project development session",
    "neverPrune": ["src/core/**"],
    "retention": [{ "pattern": "read:src/**", "score": 0.8 }]
  }
}
```

---

## Installation

```bash
pnpm add @dcgp/core
```

One-line repo onboarding (drops universal AI-tool mount files + scaffolded `.dcgp/`):

```bash
DCGP_VERSION=v1.0.0-rc curl -fsSL https://raw.githubusercontent.com/addicted2crypto/DCGP/${DCGP_VERSION}/scripts/install.sh | bash
```

Pinning `DCGP_VERSION` to a tag is strongly recommended in production - unpinned installs silently drift if upstream governance files change.

---

## Engineering constraints - absolute rules

**Never do this:**

```
NO threading primitives    - single-threaded Node.js, race conditions impossible
NO probability logic       - entropy score is a Health Index, not a probability
NO hard reset on shift     - use resetPartial(), not reset(), on domain shifts
NO standard + summation    - use kahanSum() for all cumulative score tracking
NO any types in core       - strict explicit types only
NO external deps in core   - @dcgp/core has zero runtime dependencies
```

**Always do this:**

```
DO run both DCGP + DCP     - they are complementary, not competing
DO use definePath()        - it validates against Zod at module load
DO write deterministic tests - no mocks on EntropyMonitor
```

---

## Verification baseline (§ 7.6)

A DCGP-1.0-FULL implementation is healthy when all five conditions hold:

1. **Determinism** - identical input sequences produce identical entropy scores
2. **Monotonicity** - scores ramp through ELEVATED before reaching HIGH
3. **Hysteresis** - single-turn spikes do not fire events (except CRITICAL)
4. **Stability** - score stays in [0,1] after 200+ turns of mixed input
5. **Partial reset** - `resetPartial()` clears confidence but preserves gate/drift windows

Each is covered by a named Sentinel test and asserted by `scripts/verify-dcgp.sh`.

---

## Package structure (current, not aspirational)

```
packages/
  core/                    @dcgp/core - zero runtime deps - Phase A FULL+EXTENDED
    src/
      types/               ContextPath, Entropy, Directive, Session
      schema/              validate.ts (Zod + definePath)
      classifier/          FingerprintEngine.ts · DomainClassifier.ts
      loader/              CascadeResolver.ts
      gates/               HallucinationGate.ts · DomainDriftDetector.ts
      pruner/              RetentionScorer.ts (Pruning Nexus enforcer)
      injector/            ContextInjector.ts (with bloat mitigation)
      monitor/             EntropyMonitor.ts (Directive emitter)
      state/               SessionState.ts
      export/              FineTuningExporter.ts (EXTENDED tier)
      utils/               clamp.ts · kahan.ts · regex.ts
      index.ts             Public API barrel
    tests/                 Sentinel suite

  paths/                   @dcgp/paths - Phase B (deferred)
  opencode/                @dcgp/opencode - Phase C (deferred)
  vscode/                  dcgp-vscode - Phase D (deferred)
  cli/                     @dcgp/cli - Phase D (deferred)

DCGP-SPEC.md               Normative specification
AGENTS.md                  Agent mounting guide
dcgp.schema.json           JSON Schema for VS Code IntelliSense
scripts/verify-dcgp.sh     Executable compliance check
COMPLIANCE                 Single line: FULL+EXTENDED
```

Phase B, C, D are explicitly deferred. This README does not claim what is not built.

---

## Mount point for agents

If you are an AI agent operating in this codebase, read [`AGENTS.md`](./AGENTS.md). It contains the operational specification, the formula constants, the never-list, and the verification baseline. It is the single source of truth for agent behavior.

---

*DCGP v1.0.0-rc · @addicted2crypto · MIT License*
