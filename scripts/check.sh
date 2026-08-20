#!/usr/bin/env bash
# Deterministic verification for cartas-tseyor.
#
# Usage:
#   ./scripts/check.sh fast   # syntax + smoke tests (seconds)
#   ./scripts/check.sh full   # fast + YAML validation + deploy artifact checks
#   ./scripts/check.sh        # same as full
#
# Exit code 0 = all checks passed. Non-zero = at least one check failed.
# This script is the deterministic gate: if it passes, the app is healthy
# at the static-verification level. Manual device checks still live in
# verify/checklist.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="${1:-full}"
FAILED=0

step() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
ok()   { printf '\033[1;32mPASS\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mFAIL\033[0m %s\n' "$*"; FAILED=1; }

run() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "$label"; else fail "$label"; fi
}

step "JavaScript syntax (node --check)"
for f in app.js deck.js verify/smoke.mjs verify/mini-deck.mjs; do
  run "syntax: $f" node --check "$f"
done

step "Smoke suite (verify/smoke.mjs)"
if node verify/smoke.mjs; then ok "89 smoke checks"; else fail "smoke suite"; fi

if [[ "$MODE" == "fast" ]]; then
  printf '\n\033[1;32mFAST CHECKS DONE (exit %s)\033[0m\n' "$FAILED"
  exit "$FAILED"
fi

step "Shell syntax (bash -n)"
run "syntax: deploy-caddy.sh" bash -n deploy-caddy.sh
run "syntax: scripts/check.sh" bash -n scripts/check.sh

step "YAML validation (python3 + PyYAML)"
if python3 -c "import yaml,sys; yaml.safe_load(open('openspec/config.yaml'))" 2>/dev/null; then
  ok "openspec/config.yaml parses"
else
  fail "openspec/config.yaml invalid YAML"
fi

step "Caddyfile validation (caddy validate)"
if command -v caddy >/dev/null 2>&1 && [[ -f Caddyfile.new ]]; then
  if caddy validate --config Caddyfile.new --adapter caddyfile >/dev/null 2>&1; then
    ok "Caddyfile.new valid"
  else
    fail "Caddyfile.new invalid"
  fi
elif [[ -f Caddyfile.new ]]; then
  fail "caddy binary not found; Caddyfile.new not validated"
else
  ok "no Caddyfile.new present (skip)"
fi

step "Deck data sanity (deck.js format)"
if node -e "
global.window = {};
require('./deck.js');
const deck = window.Cartas && window.Cartas.deck;
if (!deck || !Array.isArray(deck.cards) || deck.cards.length === 0) {
  console.error('no card array'); process.exit(1);
}
const bad = deck.cards.filter(c => !c || typeof c.title !== 'string' || !c.title.trim());
if (bad.length) { console.error('bad cards:', bad.length); process.exit(1); }
if (!Array.isArray(deck.positions) || deck.positions.length !== 3) {
  console.error('positions must have 3 entries'); process.exit(1);
}
console.error('deck ok, cards =', deck.cards.length, ', positions =', deck.positions.length);
" 2>/dev/null; then
  ok "deck data readable"
else
  fail "deck data check"
fi

printf '\n\033[1;32mFULL CHECKS DONE (exit %s)\033[0m\n' "$FAILED"
exit "$FAILED"
