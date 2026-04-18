#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# install.sh - add DCGP to any existing project in one line
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/addicted2crypto/DCGP/${DCGP_VERSION}/scripts/install.sh | bash
#
# Env vars:
#   DCGP_VERSION  - git ref to pin to (tag, branch, or SHA). Default: "main".
#                   Pinning to a tag is STRONGLY recommended in production;
#                   unpinned installs silently drift if upstream governance
#                   files change.
#   DCGP_FORCE    - set to "1" to overwrite existing mount files. Default: off.
#                   By default, install.sh REFUSES to overwrite any existing
#                   AGENTS.md / CLAUDE.md / .cursorrules etc., and exits with
#                   code 2 so you see the conflict. This prevents silent
#                   install failures on repos that have AGENTS.md for other
#                   reasons.
#   DCGP_INSTALL_CLI - set to "yes" to also install @dcgp/cli globally.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DCGP_VERSION="${DCGP_VERSION:-main}"
DCGP_FORCE="${DCGP_FORCE:-0}"
RAW="https://raw.githubusercontent.com/addicted2crypto/DCGP/${DCGP_VERSION}"
DOMAIN_ID="${1:-$(basename "$(pwd)")}"
CONFLICTS=0

echo "Installing DCGP ${DCGP_VERSION} into $(pwd) with domain id: ${DOMAIN_ID}"
echo ""

# ── Step 1: Scaffold project config ────────────────────────────────────────
# Co-locate with DCP (@tarquinen/opencode-dcp) when possible. DCP reads its
# config from .opencode/dcp.jsonc; we put dcgp.jsonc alongside it so a single
# directory holds both tools' config.
if [ -d .opencode ] || [ ! -d .dcgp ]; then
  CONFIG_DIR=".opencode"
  CONFIG_FILE="${CONFIG_DIR}/dcgp.jsonc"
else
  CONFIG_DIR=".dcgp"
  CONFIG_FILE="${CONFIG_DIR}/${DOMAIN_ID}.dcgp.json"
fi
mkdir -p "${CONFIG_DIR}"
if [ ! -f "${CONFIG_FILE}" ]; then
  curl -fsSL "${RAW}/templates/project.dcgp.jsonc" \
    | sed "s/\"id\": \"my-project\"/\"id\": \"${DOMAIN_ID}\"/" \
    > "${CONFIG_FILE}"
  echo "  [PASS] Scaffolded ${CONFIG_FILE}"
else
  echo "  -  ${CONFIG_FILE} already exists - leaving untouched"
fi

# ── Step 1b: HARDRULES.md - user-owned, NEVER overwrite ───────────────────
if [ ! -f HARDRULES.md ]; then
  curl -fsSL "${RAW}/HARDRULES.md" > HARDRULES.md
  echo "  [PASS] Scaffolded HARDRULES.md (edit this: user-owned override rules)"
else
  echo "  -  HARDRULES.md already exists - NEVER overwritten by install.sh"
fi

# ── Step 2: Drop universal AI-tool mount files (with conflict detection) ──
# Coverage: Claude, Cursor, Cline, Windsurf, Zed, Aider, Continue, Copilot,
# plus the generic AGENTS.md (OpenAI / OpenCode / any tool following that conv).
MOUNTS=(AGENTS.md CLAUDE.md .cursorrules .clinerules .windsurfrules .zedrules)

drop_mount() {
  local src="$1"
  local target="${2:-$1}"
  if [ -f "$target" ] && [ "$DCGP_FORCE" != "1" ]; then
    echo "  WARN: ${target} exists - leaving untouched. Set DCGP_FORCE=1 to overwrite."
    CONFLICTS=$((CONFLICTS + 1))
    return
  fi
  mkdir -p "$(dirname "$target")"
  curl -fsSL "${RAW}/${src}" > "${target}"
  local sha
  sha="$(sha256sum "${target}" 2>/dev/null | awk '{print $1}' || shasum -a 256 "${target}" | awk '{print $1}')"
  echo "  [PASS] Installed ${target}  (sha256: ${sha:0:16}...)"
}

for f in "${MOUNTS[@]}"; do
  drop_mount "$f"
done

# Copilot, Aider, Continue: each has a different canonical location.
drop_mount "CLAUDE.md" ".github/copilot-instructions.md"
drop_mount ".aider.conf.yml" ".aider.conf.yml"
drop_mount ".continue/rules/dcgp.md" ".continue/rules/dcgp.md"

# ── Step 3: Install npm package if package.json present ────────────────────
if [ -f package.json ]; then
  if command -v pnpm > /dev/null 2>&1; then
    pnpm add -D @dcgp/core
    echo "  [PASS] Installed @dcgp/core via pnpm"
  elif command -v npm > /dev/null 2>&1; then
    npm install --save-dev @dcgp/core
    echo "  [PASS] Installed @dcgp/core via npm"
  fi
fi

# ── Step 4: Install CLI globally if requested ──────────────────────────────
if [ "${DCGP_INSTALL_CLI:-no}" = "yes" ]; then
  if command -v pnpm > /dev/null 2>&1; then
    pnpm add -g @dcgp/cli
  elif command -v npm > /dev/null 2>&1; then
    npm install -g @dcgp/cli
  fi
  echo "  [PASS] Installed @dcgp/cli globally - run 'dcgp status' to verify"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
if [ "$CONFLICTS" -gt 0 ]; then
  echo "  WARN: DCGP installed with ${CONFLICTS} mount-file conflict(s)."
  echo "    Existing files were NOT overwritten. Governance may be incomplete."
  echo "    To force overwrite: DCGP_FORCE=1 curl … | bash"
  echo ""
fi

echo "Next steps:"
echo "  1. Edit ${CONFIG_FILE} - add your stack signals and anchors"
echo "  2. Edit HARDRULES.md - add your project-absolute rules (git push, npm publish, etc.)"
echo "  3. Review AGENTS.md - DCGP operational spec; do not delete, only amend"
echo ""
echo "Pairs with DCP (@tarquinen/opencode-dcp):"
echo "  If DCP is installed, it reads .opencode/dcp.jsonc from the same dir."
echo "  DCGP emits RetentionDirectives; translate via @dcgp/opencode's"
echo "  CONFIG_TRANSLATION table, or let DCP run its own default policy."
echo ""
echo "  Pinned version: ${DCGP_VERSION}"
echo "  For production, pin DCGP_VERSION to a tag (e.g. DCGP_VERSION=v1.0.0-rc)"
echo ""

exit $([ "$CONFLICTS" -gt 0 ] && echo 2 || echo 0)
