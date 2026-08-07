#!/bin/bash
# lb-check.sh — Verify the API-proxy load balancing across backend workers.
#
# What it checks (non-destructive, read-only GETs):
#   1. Distribution  — a request with cookie sa_worker=<n> is routed to worker <n>
#                      (proves traffic can spread across all workers 8001-8005).
#   2. Pinning       — pinned paths (/ai/*, /token) always go to worker-1 (index 0)
#                      regardless of the cookie.
#   3. Auto-assign   — a request with no cookie gets a Set-Cookie: sa_worker=<n>
#                      (sticky session assignment for new browsers).
#
# Optional:
#   --failover       — stop one worker, confirm a GET fails over to another
#                      (a live response, not 502), then restart it. Uses PM2.
#
# Usage:
#   ./scripts/lb-check.sh [--failover]
#
# Env overrides:
#   SA_URL   base URL (default https://127.0.0.1:3443)
#
# Routing is read from the frontend proxy log, which prints one
# "Forwarding to worker <n> (<url>): <path>" line per proxied request.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${SA_URL:-https://127.0.0.1:3443}"
API="$BASE_URL/api/proxy/api/v1"
ORIGIN="$BASE_URL"
LOG="$ROOT/frontend/logs/frontend-out.log"
PROBE="/notifications/unread-count"   # auth-protected GET; still logged even at 401

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS=0; FAIL=0
ok()   { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
bad()  { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }

# Pool size = number of entries in BACKEND_URLS (frontend/.env.local), else 5.
POOL_SIZE=5
ENVF="$ROOT/frontend/.env.local"
if [ -f "$ENVF" ]; then
    line="$(grep -E '^BACKEND_URLS=' "$ENVF" | head -1 | cut -d= -f2-)"
    if [ -n "$line" ]; then
        POOL_SIZE=$(awk -F, '{print NF}' <<<"$line")
    fi
fi

if [ ! -f "$LOG" ]; then
    echo -e "${RED}Error:${NC} proxy log not found at $LOG"
    echo "Is the frontend running under PM2 (superapps-frontend)?"
    exit 2
fi

# Send one request and return the worker index it was forwarded to (via the log).
# Args: <cookie-or-empty> <path>
route_of() {
    local cookie="$1" path="$2" mark got
    mark=$(wc -l < "$LOG")
    if [ -n "$cookie" ]; then
        curl -k -s -o /dev/null -H "Origin: $ORIGIN" -H "Cookie: sa_worker=$cookie" "$API$path"
    else
        curl -k -s -o /dev/null -H "Origin: $ORIGIN" "$API$path"
    fi
    sleep 0.3
    got=$(tail -n +$((mark+1)) "$LOG" | grep -F "$path" | grep -oE "Forwarding to worker [0-9]+" | tail -1 | grep -oE "[0-9]+$")
    echo "$got"
}

echo -e "${BLUE}== Load-balancing check ==${NC}  target: $BASE_URL  |  pool size: $POOL_SIZE"
echo

echo -e "${YELLOW}[1] Distribution (cookie sa_worker=n -> worker n)${NC}"
for ((n=0; n<POOL_SIZE; n++)); do
    got="$(route_of "$n" "$PROBE")"
    if [ "$got" = "$n" ]; then ok "sa_worker=$n -> worker $got"; else bad "sa_worker=$n -> worker '${got:-none}' (expected $n)"; fi
done
echo

echo -e "${YELLOW}[2] Pinning (must stay on worker 0)${NC}"
last=$((POOL_SIZE-1))
for p in "/ai/status" "/token"; do
    got="$(route_of "$last" "$p")"
    if [ "$got" = "0" ]; then ok "$p (cookie=$last) -> worker 0"; else bad "$p -> worker '${got:-none}' (expected 0)"; fi
done
echo

echo -e "${YELLOW}[3] Auto-assign sticky cookie (no cookie -> Set-Cookie)${NC}"
setc=$(curl -k -s -D - -o /dev/null -H "Origin: $ORIGIN" "$API$PROBE" | grep -i "set-cookie: sa_worker")
if [ -n "$setc" ]; then ok "issued -> ${setc#*set-cookie: }"; else bad "no sa_worker cookie issued"; fi
echo

# ── Optional failover check ─────────────────────────────────────────────────
if [ "${1:-}" = "--failover" ]; then
    echo -e "${YELLOW}[4] Failover (stop a worker, GET must still succeed)${NC}"
    PM2="pm2"; command -v pm2 >/dev/null 2>&1 || PM2="npx pm2"
    victim="superapps-backend-$POOL_SIZE"   # last worker (index POOL_SIZE-1)
    restore() { $PM2 restart "$victim" >/dev/null 2>&1 && echo -e "  ${BLUE}restored $victim${NC}"; }
    trap restore EXIT
    echo -e "  stopping $victim ..."
    if $PM2 stop "$victim" >/dev/null 2>&1; then
        sleep 1
        mark=$(wc -l < "$LOG")
        code=$(curl -k -s -o /dev/null -w '%{http_code}' -H "Origin: $ORIGIN" -H "Cookie: sa_worker=$last" "$API$PROBE")
        tried=$(tail -n +$((mark+1)) "$LOG" | grep -cE "Forwarding to worker")
        if [ "$code" != "502" ] && [ "$code" != "000" ]; then
            ok "worker $last down -> GET returned HTTP $code via failover ($tried worker attempt(s))"
        else
            bad "GET returned HTTP $code (no failover)"
        fi
    else
        bad "could not stop $victim (PM2 unavailable?)"
    fi
    trap - EXIT
    restore
    echo
fi

echo -e "${BLUE}== Summary ==${NC}  ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
[ "$FAIL" -eq 0 ] && echo -e "${GREEN}Load balancing is working.${NC}" || echo -e "${RED}Some checks failed — see above.${NC}"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
