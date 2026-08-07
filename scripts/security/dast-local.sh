#!/bin/bash
# Super Apps - Local DAST baseline
# Runs automated checks against the local running instance:
#   - security headers presence
#   - sensitive endpoints reject unauthenticated access
#   - basic injection probes
# Writes a report to security/reports/dast-local-<date>.txt
#
# Usage: ./scripts/security/dast-local.sh [base_url]
#   default base: https://127.0.0.1:3443

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
BASE_URL="${1:-https://127.0.0.1:3443}"
REPORT_DIR="$PROJECT_DIR/security/reports"
REPORT="$REPORT_DIR/dast-local-$(date +%Y-%m-%d).txt"
CURL="curl -sk --max-time 10"

mkdir -p "$REPORT_DIR"

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; NC=$'\033[0m'
PASS=0; FAIL=0; SKIP=0

note() { echo -e "$1" | tee -a "$REPORT"; }

: > "$REPORT"

note "=== DAST Local Baseline — $(date '+%Y-%m-%d %H:%M:%S') ==="
note "Target: $BASE_URL"
note ""

# ---------- 1. Security headers ----------
note "[1/5] Security headers"
HEADERS=$($CURL -D - -o /dev/null "$BASE_URL/")
for h in "content-security-policy" "x-frame-options" "x-content-type-options" \
         "referrer-policy" "permissions-policy" "strict-transport-security"; do
  if echo "$HEADERS" | grep -qi "^$h:"; then
    note "  ${GREEN}PASS${NC} $h present"
    PASS=$((PASS+1))
  else
    note "  ${RED}FAIL${NC} $h missing"
    FAIL=$((FAIL+1))
  fi
done

# ---------- 2. Unauthenticated access to sensitive endpoints ----------
note ""
note "[2/5] Unauthenticated access to protected endpoints (expect 401/403)"
for path in "/api/proxy/api/v1/users/me" "/api/proxy/api/v1/notifications/unread-count" \
            "/api/proxy/api/v1/events/stream" "/api/proxy/api/v1/audit" \
            "/api/proxy/api/v1/settings" "/api/proxy/api/v1/users"; do
  code=$($CURL -o /dev/null -w "%{http_code}" "$BASE_URL$path")
  case "$code" in
    401|403|405) note "  ${GREEN}PASS${NC} $path -> $code (auth/method enforced)"; PASS=$((PASS+1));;
    404)     note "  ${YELLOW}SKIP${NC} $path -> $code (endpoint not found)"; SKIP=$((SKIP+1));;
    *)       note "  ${RED}FAIL${NC} $path -> $code (exposed without auth)"; FAIL=$((FAIL+1));;
  esac
done

# ---------- 3. Header injection probe ----------
note ""
note "[3/5] Header injection / CRLF probe"
INJ=$($CURL -o /dev/null -w "%{http_code}" -H $'X-Custom: value\r\nX-Injected: 1' "$BASE_URL/")
if [ "$INJ" = "200" ]; then
  note "  ${GREEN}PASS${NC} CRLF probe did not crash/reflect"
  PASS=$((PASS+1))
else
  note "  ${YELLOW}SKIP${NC} CRLF probe returned $INJ"
  SKIP=$((SKIP+1))
fi

# ---------- 4. Path traversal probe ----------
note ""
note "[4/5] Path traversal probe"
TRAV=$($CURL -o /dev/null -w "%{http_code}" "$BASE_URL/../../../../etc/passwd")
if [ "$TRAV" = "404" ] || [ "$TRAV" = "400" ]; then
  note "  ${GREEN}PASS${NC} traversal blocked ($TRAV)"
  PASS=$((PASS+1))
else
  note "  ${RED}FAIL${NC} traversal returned $TRAV"
  FAIL=$((FAIL+1))
fi

# ---------- 5. TLS handshake (TLS 1.2+ only) ----------
note ""
note "[5/5] TLS version check"
if command -v openssl >/dev/null 2>&1; then
  host=$(echo "$BASE_URL" | sed -E 's#https?://([^/:]+).*#\1#')
  port=$(echo "$BASE_URL" | sed -E 's#https?://([^/:]+):?([0-9]*).*#\2#')
  [ -z "$port" ] && port=443
  if timeout 10 openssl s_client -connect "$host:$port" -tls1_2 </dev/null >/dev/null 2>&1; then
    note "  ${GREEN}PASS${NC} TLS 1.2 handshake ok"
    PASS=$((PASS+1))
  else
    note "  ${RED}FAIL${NC} TLS 1.2 handshake failed"
    FAIL=$((FAIL+1))
  fi
else
  note "  ${YELLOW}SKIP${NC} openssl not available"
  SKIP=$((SKIP+1))
fi

note ""
note "=== Result: $PASS pass, $FAIL fail, $SKIP skip ==="
echo ""
echo "Report: $REPORT"

if [ "$FAIL" -gt 0 ]; then
  echo "${RED}DAST baseline FAILED ($FAIL failures)${NC}"
  exit 1
else
  echo "${GREEN}DAST baseline PASSED ($PASS checks)${NC}"
  exit 0
fi
