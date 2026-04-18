# Contributing to DCGP

DCGP is built to be forked, extended, and embedded. This document is the fork-owner's map.

**The single rule:** `./scripts/verify-dcgp.sh` must exit 0 before any PR lands. If your change breaks a compliance check, either fix the regression or amend `DCGP-SPEC.md` with justification in the same PR. Prose and code never drift.

---

## Repository layout

```
packages/
  core/         @dcgp/core      zero-dep governance kernel
  paths/        @dcgp/paths     16 community domain paths
  opencode/     @dcgp/opencode  OpenCode plugin (hooks + DCP bridge)
  cli/          @dcgp/cli       dcgp command-line tool
  vscode/       dcgp-vscode     VS Code extension

DCGP-SPEC.md        Normative specification (conformance tier source of truth)
AGENTS.md           Agent-facing operational spec
README.md           Public overview
COMPLIANCE          Declared conformance tier (single line)
public-surface.txt  Snapshot of @dcgp/core public API (diffed by verify-dcgp.sh)
dcgp.schema.json    JSON Schema for .dcgp.json

scripts/
  verify-dcgp.sh    Executable compliance gate (62+ checks)
  install.sh        One-line install for any target project
  lint-unicode.mjs  Strips em dashes and emojis from source + docs

.github/workflows/dcgp-compliance.yml   CI gate across ubuntu/windows/macos
```

---

## Common tasks

### Add a new community path

1. Create `packages/paths/src/<category>/<id>.ts` (category: web, blockchain, data, mobile, systems, or a new one).
2. Export a `definePath(...)` call with at minimum: `id`, `name`, `signals` (at least one non-empty signal category), and one anchor with `priority >= 70`.
3. Re-export from `packages/paths/src/index.ts` and add to `PATH_CATEGORIES`.
4. Run `pnpm vitest run packages/paths/tests`. The invariants in `community-paths.test.ts` will fail if you miss a required field.

Minimal template:

```ts
import { definePath } from "@dcgp/core";

export const myPath = definePath({
  id: "my-domain",
  version: "1.0.0",
  name: "My Domain",
  signals: {
    packages: ["my-marker-package"],
    files: ["my-config.toml"],
    keywords: ["my-domain"],
  },
  anchors: [
    {
      id: "stack",
      label: "Stack identity",
      priority: 100,
      content: "Factual description of the stack and non-negotiable constraints.",
    },
  ],
  gates: [],
  driftRules: [],
  compression: { summarizeAs: "my-domain session", neverPrune: [] },
});
```

### Add a new Failure Mode

Failure Modes are normative (`DCGP-SPEC.md` section 10b). Adding one is a spec amendment:

1. Propose a named exported constant in `@dcgp/core` (e.g., `MY_NEW_THRESHOLD = 0.x`).
2. Implement enforcement in the relevant module.
3. Add a Sentinel test under `packages/core/tests/` that fails if the enforcement is disabled.
4. Add a row to `DCGP-SPEC.md` section 10b with the constant, trigger, and required behavior.
5. Add a grep check for the constant to `scripts/verify-dcgp.sh`.

### Mount file convention (canonical source)

`AGENTS.md` is the single long-form governance document. `HARDRULES.md` sits above it with user-owned absolute rules.

Every editor-specific mount file (`CLAUDE.md`, `.cursorrules`, `.clinerules`, `.windsurfrules`, `.zedrules`, `.aider.conf.yml`, `.continue/rules/dcgp.md`, `.github/copilot-instructions.md`) is a THIN POINTER that tells the host tool to read `HARDRULES.md` then `AGENTS.md`. They are byte-identical (modulo `.aider.conf.yml`, which uses Aider's YAML format) and regenerated from `CLAUDE.md`:

```bash
cp CLAUDE.md .cursorrules
cp CLAUDE.md .clinerules
cp CLAUDE.md .windsurfrules
cp CLAUDE.md .zedrules
cp CLAUDE.md .github/copilot-instructions.md
cp CLAUDE.md .continue/rules/dcgp.md
```

**Rule:** edit `AGENTS.md` for real content. Edit `CLAUDE.md` only to adjust the pointer stub. Never edit the per-tool mount files by hand.

### Add a new editor or agent mount

1. Copy the content of `CLAUDE.md` to the target editor's expected location (e.g., `.myeditorrules` or `~/.myeditor/config.toml`).
2. Add the file to the `MOUNTS` array in `scripts/install.sh`.
3. Add a presence check to `scripts/verify-dcgp.sh`.

The content is identical across all mount files. The filename is a concession to each tool's conventions.

### Propose a new conformance tier

Tiers are pinned in `DCGP-SPEC.md` section 1. A new tier requires:

1. A named requirement set (e.g., all of FULL plus feature X).
2. A corresponding `if run_tier "$TIER" "<NAME>"` block in `scripts/verify-dcgp.sh` with the tier's required checks.
3. Update `COMPLIANCE` file documentation.

Do not fragment the tier model without strong justification. MIN / FULL / EXTENDED covers the canonical adoption path.

---

## Guardrails when working in this repo

These are the same rules that bind AI agents inside the repo. Contributors must follow them too:

- **No runtime dependencies in `@dcgp/core`.** Zero. The value of a governance library is that it cannot itself be the source of supply-chain surprise. If you need Zod-style validation, hand-roll it in `packages/core/src/schema/validate.ts`.
- **No `any` types in core.** Use `unknown` at boundaries; narrow with type guards.
- **No emojis or em dashes in source or docs.** Run `node scripts/lint-unicode.mjs --dry` to check, `node scripts/lint-unicode.mjs` to fix.
- **No `tx.origin`-level footguns** in community paths. If a gate in your new path would miss a critical safety pattern, add it and add a test.
- **No `+` operator for cumulative score tracking.** Use `kahanSum` everywhere. `entropy.kahan.test.ts` proves why.
- **No hard `reset()` on domain shift.** Use `resetPartial()`. The gate/drift windows are the baseline of noise; wiping them causes Context Shock.

---

## Running the full test matrix locally

```bash
pnpm install
pnpm -r typecheck            # all packages
pnpm -r build                # all packages
pnpm test                    # vitest across packages/*/tests/**
./scripts/verify-dcgp.sh     # full compliance gate

node scripts/lint-unicode.mjs --dry    # check for banned unicode
```

Expected output from `verify-dcgp.sh`:

```
DCGP-1.0 FULL+EXTENDED compliance verified.
```

CI reproduces this on `ubuntu-latest`, `windows-latest`, and `macos-latest`.

---

## Authoring style

- **No trailing summaries** in file docstrings. State the purpose in one sentence, then code.
- **No em dashes.** Use `.` or `,` or `:` in prose. Use `-` in lists.
- **No emojis.** Anywhere. `scripts/lint-unicode.mjs` enforces this.
- **Comments only when the why is non-obvious.** Don't restate what well-named code already says.
- **Defensive checks only at system boundaries** (user input, external APIs, filesystem). Trust internal invariants the test suite enforces.

---

## Release checklist (maintainers)

- [ ] `pnpm -r build` clean
- [ ] `pnpm test` green, minimum 112 core + 10 paths + 9 opencode + 7 cli tests
- [ ] `./scripts/verify-dcgp.sh` exits 0
- [ ] `public-surface.txt` matches `Object.keys(require('@dcgp/core'))`
- [ ] `CHANGELOG.md` updated with every API-visible change
- [ ] Tag `v1.x.y` and publish `@dcgp/*` packages together
- [ ] Update `DCGP_VERSION` example in README to the new tag

---

*By contributing you agree that your contributions are licensed under the MIT License.*
