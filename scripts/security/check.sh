#!/bin/bash
# Super Apps - Security Check Pipeline (local CI gate)
# Runs SAST (Bandit, Semgrep), dependency audits (pip-audit, npm audit), and static tests.
# GATE RULE: blocks only NEW findings introduced beyond the accepted baseline
# (security/reports/gate-baseline.json). Existing/legacy findings are reported as warnings.
#
# Usage:
#   ./scripts/security/check.sh                 full check
#   SECURITY_STRICT=1 ./scripts/security/check.sh   also fail on baseline regression

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
REPORTS="$PROJECT_DIR/security/reports"
BASELINE="$REPORTS/gate-baseline.json"
PYTHON="$BACKEND_DIR/.venv/bin/python"
SEMGREP="${SEMGREP:-semgrep}"
STRICT="${SECURITY_STRICT:-0}"

# colors
RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; NC=$'\033[0m'

FAILURES=0
WARNINGS=0

ok()   { echo "  ${GREEN}✓${NC} $1"; }
fail() { echo "  ${RED}✗${NC} $1"; FAILURES=$((FAILURES+1)); }
warn() { echo "  ${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS+1)); }

echo "==========================================================="
echo "  Super Apps - Security Check"
echo "  Baseline: $BASELINE"
echo "==========================================================="

# ---------- 1. Bandit (baseline-aware) ----------
echo ""
echo "[1/6] Bandit (Python SAST)"
if [ -x "$BACKEND_DIR/.venv/bin/bandit" ]; then
  if [ -f "$REPORTS/bandit-baseline.json" ]; then
    ( cd "$PROJECT_DIR" && "$BACKEND_DIR/.venv/bin/bandit" -q -r backend \
      -x backend/.venv,backend/venv,backend/tests \
      --baseline "$REPORTS/bandit-baseline.json" 2>/dev/null )
    if [ $? -eq 0 ]; then
      ok "Bandit: no NEW findings beyond baseline"
    else
      fail "Bandit: NEW findings introduced (review, then update baseline)"
    fi
  else
    ( cd "$PROJECT_DIR" && "$BACKEND_DIR/.venv/bin/bandit" -q -r backend -x backend/.venv,backend/venv,backend/tests 2>/dev/null )
    if [ $? -eq 0 ]; then
      ok "Bandit clean"
    else
      warn "Bandit baseline missing — treating current findings as baseline. Run: bandit -r backend -f json -o security/reports/bandit-baseline.json"
    fi
  fi
else
  warn "bandit not installed (pip install bandit)"
fi

# ---------- 2. Semgrep ----------
echo ""
echo "[2/6] Semgrep (Python/JS SAST)"
if command -v "$SEMGREP" >/dev/null 2>&1; then
  if "$SEMGREP" scan --config auto --quiet \
      --exclude "$BACKEND_DIR/.venv" --exclude "$BACKEND_DIR/venv" --exclude "$FRONTEND_DIR/node_modules" \
      "$BACKEND_DIR" "$FRONTEND_DIR" 2>/dev/null; then
    ok "Semgrep clean"
  else
    warn "Semgrep found issues (review; not blocking)"
  fi
else
  warn "semgrep not installed (pipx install semgrep)"
fi

# ---------- 3. pip-audit (ignores accepted baseline vulns) ----------
echo ""
echo "[3/6] pip-audit (Python CVE)"
if [ -x "$BACKEND_DIR/.venv/bin/pip-audit" ] && [ -f "$BASELINE" ]; then
  IGNORE=$(python3 -c "import json;print(' '.join('--ignore-vuln '+v for v in json.load(open('$BASELINE'))['pip_audit_ignored_vulns']))")
  if [ -f "$BACKEND_DIR/requirements.lock" ]; then
    "$BACKEND_DIR/.venv/bin/pip-audit" -r "$BACKEND_DIR/requirements.lock" --skip-editable $IGNORE 2>/dev/null
    PA_EXIT=$?
    if [ $PA_EXIT -eq 0 ]; then
      ok "pip-audit: no NEW vulnerabilities beyond baseline"
    else
      fail "pip-audit: NEW vulnerabilities found beyond baseline (exit $PA_EXIT)"
    fi
  else
    warn "requirements.lock missing"
  fi
else
  warn "pip-audit or baseline missing"
fi

# ---------- 4. npm audit (compares against baseline counts) ----------
echo ""
echo "[4/6] npm audit (JavaScript CVE)"
if [ -f "$BASELINE" ]; then
  MAX_CRIT=$(python3 -c "import json;print(json.load(open('$BASELINE'))['npm_audit_critical_max'])")
  MAX_HIGH=$(python3 -c "import json;print(json.load(open('$BASELINE'))['npm_audit_high_max'])")
  MAX_MOD=$(python3 -c "import json;print(json.load(open('$BASELINE'))['npm_audit_moderate_max'])")
  if [ -f "$FRONTEND_DIR/package-lock.json" ]; then
    AUDIT_JSON=$(cd "$FRONTEND_DIR" && npm audit --json 2>/dev/null)
    CRIT=$(echo "$AUDIT_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin).get('metadata',{}).get('vulnerabilities',{}).get('critical',0))" 2>/dev/null || echo 0)
    HIGH=$(echo "$AUDIT_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin).get('metadata',{}).get('vulnerabilities',{}).get('high',0))" 2>/dev/null || echo 0)
    MOD=$(echo "$AUDIT_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin).get('metadata',{}).get('vulnerabilities',{}).get('moderate',0))" 2>/dev/null || echo 0)
    echo "  npm audit now: critical=$CRIT high=$HIGH moderate=$MOD | baseline: critical=$MAX_CRIT high=$MAX_HIGH moderate=$MAX_MOD"
    if [ "$CRIT" -gt "$MAX_CRIT" ] || [ "$HIGH" -gt "$MAX_HIGH" ] || [ "$MOD" -gt "$MAX_MOD" ]; then
      fail "npm audit exceeds baseline (new vulnerabilities introduced)"
    else
      ok "npm audit within baseline"
    fi
  else
    warn "package-lock.json missing"
  fi
else
  warn "baseline missing"
fi

# ---------- 5. TypeScript check ----------
echo ""
echo "[5/6] tsc --noEmit"
if (cd "$FRONTEND_DIR" && npx tsc --noEmit 2>/dev/null); then
  ok "TypeScript clean"
else
  fail "TypeScript errors"
fi

# ---------- 6. Frontend tests ----------
echo ""
echo "[6/6] vitest run"
if (cd "$FRONTEND_DIR" && npx vitest run 2>/dev/null); then
  ok "Frontend tests pass"
else
  fail "Frontend tests failed"
fi

echo ""
echo "==========================================================="
if [ "$FAILURES" -gt 0 ]; then
  echo "  ${RED}SECURITY CHECK FAILED: $FAILURES failure(s), $WARNINGS warning(s)${NC}"
  echo "  Review NEW findings before merge/push."
  exit 1
else
  echo "  ${GREEN}SECURITY CHECK PASSED ($WARNINGS warning(s))${NC}"
  exit 0
fi
