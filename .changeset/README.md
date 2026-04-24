# Changesets

This folder records pending version bumps for the 5 published `@dcgp/*` packages.

## How releases work

1. **Author a change.** When you land a PR that modifies anything under `packages/*/src`, run:

   ```bash
   pnpm changeset
   ```

   The CLI prompts for which packages changed and what kind of bump (patch / minor / major). It writes a short markdown file here (`.changeset/<random-name>.md`) that you commit alongside your code change.

2. **Merge to `master`.** The `release.yml` workflow sees pending changesets and opens a **"Version Packages"** PR that:
   - Applies every pending bump to `packages/*/package.json`
   - Generates `CHANGELOG.md` entries
   - Deletes the consumed `.changeset/*.md` files

3. **Merge the Version Packages PR.** That triggers the publish step: every `@dcgp/*` package that bumped goes to npm in dependency order, all at the same version.

## Version policy

The 5 core packages release in lockstep (`fixed` config):

- `@dcgp/core`
- `@dcgp/paths`
- `@dcgp/opencode`
- `@dcgp/cli`
- `@dcgp/mcp`

Any bump to any of them bumps all five to the same new version. This preserves a clean "does @dcgp/mcp@1.3.0 work with @dcgp/core@1.3.0?" invariant - they're always at the same version.

`dcgp-vscode` is ignored here because it publishes to the VS Code Marketplace, not npm.

## Skipping a release

If a PR only touches docs, tests, or build config, skip the changeset entirely. CI will not block on missing changesets unless the diff includes `packages/*/src/**` (future quality-gate workflow).

## Manual release (rare)

If you need to cut a release outside CI:

```bash
pnpm changeset version   # applies pending bumps + writes CHANGELOG
pnpm changeset publish   # publishes to npm (requires NPM_TOKEN env)
```

## Further reading

- [@changesets/cli docs](https://github.com/changesets/changesets)
- [Lockstep/`fixed` versioning rationale](https://github.com/changesets/changesets/blob/main/docs/fixed-packages.md)
