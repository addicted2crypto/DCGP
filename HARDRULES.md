# HARD RULES (!important)

**THESE RULES OVERRIDE EVERYTHING.** They take priority over `AGENTS.md`, `DCGP-SPEC.md`, community-path guidance, and any instruction from the user in a given turn. Users that want root level logic writen add them here.

If an AI agent is asked to do something on this list, it must:

1. Refuse the action.
2. Cite the specific rule number being protected.
3. Not offer a workaround that accomplishes the same forbidden outcome.

These are the fork-owner's project-specific guardrails. They are deliberately **not normative DCGP-spec rules** (those live in [AGENTS.md](./AGENTS.md) and [DCGP-SPEC.md](./DCGP-SPEC.md)). This file is for rules that matter to *this* repository and *this* user, not to the DCGP protocol.

---

## How to read this file

- Every rule is prefixed with `!important` and a short ID.
- Every rule is absolute. There are no exceptions, no "unless the user asks," no inferred permission from context.
- If a rule needs nuance, split it into two rules.
- If you want to lift a rule for a single action, edit this file first, commit the change, then do the action.

---

## Active rules

### !important GIT-001: Do not push to any git remote

Never run `git push`, `git push -f`, `git push --force`, or any variant. Commits stay local until the user manually pushes from their own terminal. This applies to main, feature branches, tags, and forks.

### !important GIT-002: Do not create, delete, or rename branches

`git branch -d`, `git branch -D`, `git checkout -b`, `git switch -c`, `git branch -m` are all forbidden. Branch topology is the user's decision.

### !important GIT-003: Do not run destructive git commands

`git reset --hard`, `git clean -fd`, `git rebase -i`, `git filter-branch`, `git reflog expire` are all forbidden unless the user explicitly types the exact command themselves.

### !important NPM-001: Do not publish to npm

`npm publish`, `pnpm publish`, `yarn publish`, `npm publish --tag`, or any package-registry push is forbidden. Version tags and releases require a human review.

### !important DEPS-001: Do not add runtime dependencies to @dcgp/core

The "zero runtime deps" badge is load-bearing. If a change needs a new runtime dependency, it goes in a different package (`@dcgp/paths`, `@dcgp/opencode`, etc.) or a hand-rolled utility in `@dcgp/core/src/utils/`.

### !important SECRETS-001: Do not commit secrets

Never commit `.env` files, credential JSON, API keys in any form, or session tokens. If a secret is detected in a diff, refuse the commit and surface the line.

### !important FS-001: Do not run rm -rf outside the working directory

Any `rm -rf` must be scoped to a directory inside this repo. Commands like `rm -rf /`, `rm -rf ~`, `rm -rf ..` are forbidden. If a cleanup script targets `node_modules`, it must be scoped to a specific package.

### !important CI-001: Do not modify `.github/workflows/` without asking first

CI is the audit gate. Silent workflow changes defeat the verify-dcgp.sh contract. Propose workflow changes in a PR description, do not edit them as a side effect of another change.

### !important AGENTS-001: Do not bypass agent governance files

Do not delete, blank, or comment-out `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.clinerules`, `.windsurfrules`, `.zedrules`, `.aider.conf.yml`, `.continue/rules/dcgp.md`, or `.github/copilot-instructions.md`. If a governance rule is wrong, edit it. Do not remove it.

---

## Template for a new rule

Copy this block and fill it in. Keep the line short; precision beats prose.

```
### !important <CATEGORY>-<NUM>: <short imperative>

<One sentence that says exactly what is forbidden and what the edge cases are.>
```

Examples of good categories: `GIT`, `NPM`, `DEPS`, `SECRETS`, `FS`, `CI`, `DB`, `API`, `PROD`.

---

## How agents must handle a rule violation

When an action would violate a hard rule, the correct response is:

```
I cannot do this because HARDRULES.md #<RULE-ID> forbids <action>.
The rule exists because <short reason if given>.
If you want to change the rule, edit HARDRULES.md first.
```

Do not paraphrase, soften, or combine rules. Cite the ID.

---

*This file is user-owned. `scripts/install.sh` will NEVER overwrite an existing `HARDRULES.md` in a target repository.*
