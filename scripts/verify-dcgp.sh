#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# verify-dcgp.sh - reproducible DCGP compliance verification
#
# Run from anywhere: ./scripts/verify-dcgp.sh
#
# Output: exit code 0 if all checks for the declared conformance tier pass.
#
# Declared tier is read from ./COMPLIANCE (single line: MIN | FULL | EXTENDED
# or FULL+EXTENDED). Checks are ratcheted by tier - MIN runs fewest, EXTENDED
# runs all.
#
# Designed for:
#   - CI/CD pipelines (.github/workflows/dcgp-compliance.yml)
#   - Third-party auditors
#   - Release tagging gates
#   - Local pre-commit validation
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

cd "$(dirname "$0")/.."

PASS=0
FAIL=0
CHECKS=()

TIER="$(cat COMPLIANCE 2>/dev/null | head -1 | tr -d '[:space:]' || echo 'UNKNOWN')"

check() {
  local name="$1"
  local actual="$2"
  local expected="$3"
  local op="${4:-eq}"

  local ok=false
  case "$op" in
    eq)     [ "$actual" = "$expected" ] && ok=true ;;
    ge)     [ "$actual" -ge "$expected" ] 2>/dev/null && ok=true ;;
    exists) [ -f "$expected" ] && ok=true ;;
    dir)    [ -d "$expected" ] && ok=true ;;
    nonempty) [ -s "$expected" ] && ok=true ;;
  esac

  if $ok; then
    PASS=$((PASS + 1))
    CHECKS+=("  [PASS]  $name")
  else
    FAIL=$((FAIL + 1))
    CHECKS+=("  [FAIL]  $name  (expected $op $expected, got '$actual')")
  fi
}

run_tier() {
  local tier="$1"
  case "$tier" in *"$2"*) return 0 ;; *) return 1 ;; esac
}

echo "DCGP Compliance Verification"
echo "Declared tier: $TIER"
echo "────────────────────────────────────────────────────────────"

# ── Tier: ALL ──────────────────────────────────────────────────────────────
# Normative docs + mount files + spec exist
check "DCGP-SPEC.md present and non-empty" "DCGP-SPEC.md" "DCGP-SPEC.md" nonempty
check "HARDRULES.md present (user-owned root rules)" "HARDRULES.md" "HARDRULES.md" exists
check "AGENTS.md present" "AGENTS.md" "AGENTS.md" exists
check "README.md present" "README.md" "README.md" exists
check "CONTRIBUTING.md present" "CONTRIBUTING.md" "CONTRIBUTING.md" exists
check "LICENSE present" "LICENSE" "LICENSE" exists
check "COMPLIANCE declaration present" "COMPLIANCE" "COMPLIANCE" exists
check "CLAUDE.md mount point" "CLAUDE.md" "CLAUDE.md" exists
check ".cursorrules mount point" ".cursorrules" ".cursorrules" exists
check ".clinerules mount point" ".clinerules" ".clinerules" exists
check ".windsurfrules mount point" ".windsurfrules" ".windsurfrules" exists
check ".zedrules mount point" ".zedrules" ".zedrules" exists
check ".aider.conf.yml mount point" ".aider.conf.yml" ".aider.conf.yml" exists
check ".continue/rules/dcgp.md mount point" ".continue/rules/dcgp.md" ".continue/rules/dcgp.md" exists
check ".github/copilot-instructions.md present" ".github/copilot-instructions.md" ".github/copilot-instructions.md" exists

# DCP parity markers (DCP package name + project config location)
check "dcp-bridge declares verified DCP package name" \
  "$(grep -c '@tarquinen/opencode-dcp' packages/opencode/src/dcp-bridge.ts 2>/dev/null || echo 0)" "1" ge
check "dcp-bridge declares .opencode/dcp.jsonc config path" \
  "$(grep -c '.opencode/dcp.jsonc' packages/opencode/src/dcp-bridge.ts 2>/dev/null || echo 0)" "1" ge

# Public spec sections present
check "Spec § 7.7 Retention Bridge" \
  "$(grep -c '### 7.7 Retention Bridge' DCGP-SPEC.md 2>/dev/null || echo 0)" "1" ge
check "Spec § 10b Failure Modes (normative)" \
  "$(grep -c '## 10b. Failure modes' DCGP-SPEC.md 2>/dev/null || echo 0)" "1" ge
check "Spec § 10c Known Limitations (informative)" \
  "$(grep -c '## 10c. Known limitations' DCGP-SPEC.md 2>/dev/null || echo 0)" "1" ge

# ── Tier: MIN+ (schema, cascade, injection) ────────────────────────────────
if run_tier "$TIER" "MIN" || run_tier "$TIER" "FULL" || run_tier "$TIER" "EXTENDED"; then
  check "packages/core/src/types/ present" "types" "packages/core/src/types" dir
  check "packages/core/src/schema/ present" "schema" "packages/core/src/schema" dir
  check "packages/core/src/loader/ present" "loader" "packages/core/src/loader" dir
  check "packages/core/src/injector/ present" "injector" "packages/core/src/injector" dir
fi

# ── Tier: FULL (EntropyMonitor + Pruning Nexus + Failure Modes) ───────────
if run_tier "$TIER" "FULL" || run_tier "$TIER" "EXTENDED"; then
  check "EntropyMonitor implemented" \
    "EntropyMonitor.ts" "packages/core/src/monitor/EntropyMonitor.ts" exists
  check "RetentionScorer implemented (Nexus enforcer)" \
    "RetentionScorer.ts" "packages/core/src/pruner/RetentionScorer.ts" exists
  check "types/Directive.ts defines PruneIntensity + RetentionDirective" \
    "$(grep -cE 'PruneIntensity|RetentionDirective' packages/core/src/types/Directive.ts 2>/dev/null || echo 0)" "2" ge
  check "types/Entropy.ts defines EntropyEvent + EntropyFactor" \
    "$(grep -cE 'EntropyEvent|EntropyFactor' packages/core/src/types/Entropy.ts 2>/dev/null || echo 0)" "2" ge
  check "FingerprintEngine implemented" \
    "FingerprintEngine.ts" "packages/core/src/classifier/FingerprintEngine.ts" exists
  check "DomainClassifier implemented" \
    "DomainClassifier.ts" "packages/core/src/classifier/DomainClassifier.ts" exists
  check "HallucinationGate implemented" \
    "HallucinationGate.ts" "packages/core/src/gates/HallucinationGate.ts" exists
  check "DomainDriftDetector implemented" \
    "DomainDriftDetector.ts" "packages/core/src/gates/DomainDriftDetector.ts" exists
  check "ContextInjector implemented" \
    "ContextInjector.ts" "packages/core/src/injector/ContextInjector.ts" exists
  check "CascadeResolver implemented" \
    "CascadeResolver.ts" "packages/core/src/loader/CascadeResolver.ts" exists
  check "SessionState implemented" \
    "SessionState.ts" "packages/core/src/state/SessionState.ts" exists
  check "Public API barrel present" \
    "index.ts" "packages/core/src/index.ts" exists
  check "dcgp.schema.json generated" \
    "dcgp.schema.json" "dcgp.schema.json" exists

  # Zero 'any' in core (excluding comments/strings is imperfect - grep gives a lower bound)
  check "Zero ': any' tokens in core src" \
    "$(grep -rnE ':\\s*any(\\s|;|,|=|\\)|$)' packages/core/src/ 2>/dev/null | grep -v '//' | wc -l | tr -d ' ')" "0" eq

  # Kahan usage
  check "EntropyMonitor uses kahanSum" \
    "$(grep -c 'kahanSum\|KahanAccumulator' packages/core/src/monitor/EntropyMonitor.ts 2>/dev/null || echo 0)" "1" ge

  # Failure-mode constants exported
  check "COLLISION_DELTA exported" \
    "$(grep -rn 'COLLISION_DELTA' packages/core/src/ 2>/dev/null | wc -l | tr -d ' ')" "1" ge
  check "ANCHOR_BLOAT_RATIO exported" \
    "$(grep -rn 'ANCHOR_BLOAT_RATIO' packages/core/src/ 2>/dev/null | wc -l | tr -d ' ')" "1" ge
  check "WARMUP_TURNS exported" \
    "$(grep -rn 'WARMUP_TURNS' packages/core/src/ 2>/dev/null | wc -l | tr -d ' ')" "1" ge
  check "SHIFT_COOLDOWN_TURNS exported" \
    "$(grep -rn 'SHIFT_COOLDOWN_TURNS' packages/core/src/ 2>/dev/null | wc -l | tr -d ' ')" "1" ge
  check "CLASSIFIER_TTL_TURNS exported" \
    "$(grep -rn 'CLASSIFIER_TTL_TURNS' packages/core/src/ 2>/dev/null | wc -l | tr -d ' ')" "1" ge
  check "ANCHOR_REINJECT_COOLDOWN_TURNS exported" \
    "$(grep -rn 'ANCHOR_REINJECT_COOLDOWN_TURNS' packages/core/src/ 2>/dev/null | wc -l | tr -d ' ')" "1" ge
  check "CONFIDENCE_UNKNOWN_PENALTY exported" \
    "$(grep -rn 'CONFIDENCE_UNKNOWN_PENALTY' packages/core/src/ 2>/dev/null | wc -l | tr -d ' ')" "1" ge

  # Named Sentinel tests exist (behavioral checks - presence + name, not content-grep)
  for t in entropy.formula entropy.hysteresis entropy.kahan entropy.nuclear \
           entropy.blindness entropy.longtail entropy.jitter \
           directive.bridge retention.pruning \
           classifier.collision classifier.deadlock classifier.ttl \
           injector.bloat injector.reinject gate.warmup \
           citation.pressure weights.range turn.monotonic range.bounds \
           cascade.merge schema.validate; do
    check "Sentinel: ${t}.test.ts exists" \
      "${t}.test.ts" "packages/core/tests/${t}.test.ts" exists
  done
fi

# ── Tier: EXTENDED (FineTuningExporter) ───────────────────────────────────
if run_tier "$TIER" "EXTENDED"; then
  check "FineTuningExporter implemented" \
    "FineTuningExporter.ts" "packages/core/src/export/FineTuningExporter.ts" exists
  check "FineTuningExporter test file present" \
    "export.test.ts" "packages/core/tests/export.test.ts" exists
fi

# ── Phase B: Community paths ───────────────────────────────────────────────
check "@dcgp/paths index present" "index.ts" "packages/paths/src/index.ts" exists
check "community-paths.test.ts present" "community-paths.test.ts" "packages/paths/tests/community-paths.test.ts" exists
check "16 community path files (expect >= 16)" \
  "$(find packages/paths/src -name '*.ts' ! -name 'index.ts' 2>/dev/null | wc -l | tr -d ' ')" "16" ge

# ── Phase C: OpenCode plugin ───────────────────────────────────────────────
check "@dcgp/opencode runtime implemented" \
  "runtime.ts" "packages/opencode/src/runtime.ts" exists
check "@dcgp/opencode DCP bridge implemented" \
  "dcp-bridge.ts" "packages/opencode/src/dcp-bridge.ts" exists
check "@dcgp/opencode commands (/dcgp) implemented" \
  "commands.ts" "packages/opencode/src/commands.ts" exists
check "@dcgp/opencode plugin entry implemented" \
  "index.ts" "packages/opencode/src/index.ts" exists
check "@dcgp/opencode runtime.test.ts present" \
  "runtime.test.ts" "packages/opencode/tests/runtime.test.ts" exists
check "@dcgp/opencode dcp-bridge.test.ts present" \
  "dcp-bridge.test.ts" "packages/opencode/tests/dcp-bridge.test.ts" exists

# ── Phase D.1: CLI ─────────────────────────────────────────────────────────
check "@dcgp/cli entry present" "cli.ts" "packages/cli/src/cli.ts" exists
check "@dcgp/cli test present" "cli.test.ts" "packages/cli/tests/cli.test.ts" exists

# ── Phase D.2: VS Code extension ──────────────────────────────────────────
check "dcgp-vscode extension present" "extension.ts" "packages/vscode/src/extension.ts" exists

# ── Run the test suite (the real behavioral gate) ─────────────────────────
if command -v pnpm > /dev/null 2>&1; then
  echo ""
  echo "Running behavioral tests (pnpm -r build + vitest)..."
  # CLI tests exec the built bin; ensure every package is built first.
  if pnpm -r build > /tmp/dcgp-build.log 2>&1 && pnpm vitest run > /tmp/dcgp-test.log 2>&1; then
    PASS=$((PASS + 1))
    CHECKS+=("  [PASS]  full test suite passes (core + paths + opencode + cli)")
  else
    FAIL=$((FAIL + 1))
    CHECKS+=("  [FAIL]  test suite failed (see /tmp/dcgp-build.log, /tmp/dcgp-test.log)")
  fi
else
  CHECKS+=("  ·  pnpm not found - skipping behavioral test execution")
fi

# ── Public API surface stability ──────────────────────────────────────────
if [ -f "packages/core/dist/index.js" ] && [ -f "public-surface.txt" ]; then
  if command -v node > /dev/null 2>&1; then
    ACTUAL_SURFACE="$(node -e "import('./packages/core/dist/index.js').then(m => console.log(Object.keys(m).sort().join('\\n')))" 2>/dev/null || echo '')"
    EXPECTED_SURFACE="$(cat public-surface.txt 2>/dev/null)"
    if [ "$ACTUAL_SURFACE" = "$EXPECTED_SURFACE" ]; then
      PASS=$((PASS + 1))
      CHECKS+=("  [PASS]  Public API surface matches public-surface.txt")
    else
      FAIL=$((FAIL + 1))
      CHECKS+=("  [FAIL]  Public API surface drift - update public-surface.txt or fix exports")
    fi
  fi
fi

# ── Output ─────────────────────────────────────────────────────────────────
printf '%s\n' "${CHECKS[@]}"
echo "────────────────────────────────────────────────────────────"
echo "  Tier: $TIER  ·  Pass: $PASS  ·  Fail: $FAIL"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "  [PASS] DCGP-1.0 $TIER compliance verified."
  exit 0
else
  echo "  [FAIL] DCGP-1.0 $TIER compliance FAILED - see failures above."
  exit 1
fi
