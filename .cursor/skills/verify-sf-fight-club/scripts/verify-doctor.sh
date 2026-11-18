#!/bin/bash
# verify-doctor.sh — read-only health check for an SF Fight Club web instance.
# Usage: verify-doctor.sh BASE_URL [--pid-file FILE]
# Exit 0 means the instance is worth driving; nonzero names the failed check.
# Makes no state-changing requests.
set -u

BASE="${1:-}"
PID_FILE=""

shift 2>/dev/null || true
while [ $# -gt 0 ]; do
  case "$1" in
    --pid-file) PID_FILE="${2:-}"; shift 2 ;;
    *) echo "FAIL: unknown argument $1" >&2; exit 2 ;;
  esac
done

if [ -z "$BASE" ]; then
  echo "FAIL: usage: verify-doctor.sh BASE_URL [--pid-file FILE]" >&2
  exit 2
fi

fail=0

code="$(curl -s -o /tmp/sf-verify-doctor.body -w '%{http_code}' --max-time 10 "$BASE/")" || code="000"
if [ "$code" != 200 ]; then
  echo "FAIL: GET $BASE/ returned HTTP $code (want 200)"
  fail=1
elif ! grep -q 'id="root"' /tmp/sf-verify-doctor.body; then
  echo "FAIL: GET $BASE/ has no app root element (not the SF Fight Club client?)"
  fail=1
else
  echo "PASS: $BASE/ serves the app shell (HTTP 200, #root present)"
fi

# Ownership signal: this repo's Vite dev server resolves its own bootstrap
# module; its production build serves hashed assets instead.
if curl -s --max-time 10 "$BASE/src/main.tsx" | grep -q 'AppProviders'; then
  echo "PASS: dev bootstrap resolves (/src/main.tsx mounts the app)"
elif curl -s --max-time 10 "$BASE/" | grep -q '/assets/'; then
  echo "PASS: production bundle referenced (/assets/ in index)"
else
  echo "FAIL: neither dev bootstrap (/src/main.tsx) nor preview bundle (/assets/) found — not our instance?"
  fail=1
fi

if [ -n "$PID_FILE" ]; then
  if [ ! -f "$PID_FILE" ]; then
    echo "FAIL: pid file $PID_FILE missing (server not started by this run?)"
    fail=1
  else
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "PASS: recorded server process $pid is alive"
    else
      echo "FAIL: recorded server process $pid is not alive"
      fail=1
    fi
  fi
fi

rm -f /tmp/sf-verify-doctor.body
[ "$fail" = 0 ] && echo "DOCTOR OK: $BASE is worth driving"
exit "$fail"
