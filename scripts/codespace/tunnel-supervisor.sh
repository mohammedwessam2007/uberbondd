#!/usr/bin/env bash
# Generic tunnel supervisor: restart a tunnel/connector command when it dies or its health check fails.
# Configure via env (no defaults are assumed about the connector itself):
#   COS_TUNNEL_CMD        required. Command that runs the tunnel/connector in the foreground.
#   COS_HEALTH_URL        optional. URL that must return 2xx/3xx (e.g. a local connector health endpoint).
#   COS_HEALTH_INTERVAL   seconds between health probes (default 20)
#   COS_HEALTH_FAILS      consecutive failures before restart (default 3)
#   COS_BACKOFF_MAX       max restart backoff seconds (default 120)
#   COS_MAX_RESTARTS      0 = unlimited (default 0)
set -uo pipefail
umask 077
: "${COS_TUNNEL_CMD:?set COS_TUNNEL_CMD to the foreground tunnel command}"
INTERVAL="${COS_HEALTH_INTERVAL:-20}"; FAILS="${COS_HEALTH_FAILS:-3}"
BMAX="${COS_BACKOFF_MAX:-120}"; MAXR="${COS_MAX_RESTARTS:-0}"
for n in "$INTERVAL" "$FAILS" "$BMAX" "$MAXR"; do [[ "$n" =~ ^[0-9]{1,5}$ ]] || { echo 'invalid numeric supervisor setting' >&2; exit 2; }; done
[ "$INTERVAL" -gt 0 ] && [ "$FAILS" -gt 0 ] && [ "$BMAX" -ge 2 ] || exit 2
command -v flock >/dev/null && command -v setsid >/dev/null || { echo 'flock and setsid required' >&2; exit 2; }
if [ -n "${COS_HEALTH_URL:-}" ]; then
  [[ "$COS_HEALTH_URL" =~ ^http://127\.0\.0\.1:[0-9]+/ ]] || { echo 'health URL must be loopback HTTP' >&2; exit 2; }
fi
state="${XDG_STATE_HOME:-$HOME/.local/state}/uberbond"; mkdir -p "$state"
log="$state/tunnel-supervisor.log"; pidf="$state/tunnel.pid"
say() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$log"; }

exec 9>"$state/tunnel.lock"
if ! flock -n 9; then say "another supervisor holds the lock; exiting"; exit 0; fi
[ -f "$log" ] && [ "$(wc -c <"$log")" -gt 1048576 ] && mv "$log" "$log.1"

child=0
stop_child() { if [ "$child" -gt 0 ]; then kill -- -"$child" 2>/dev/null || true; sleep 1; kill -KILL -- -"$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; child=0; fi; }
cleanup() { stop_child; rm -f "$pidf"; say "supervisor stopped"; exit 0; }
trap cleanup TERM INT

healthy() { [ -z "${COS_HEALTH_URL:-}" ] && return 0; local code; code=$(curl -sS -o /dev/null --max-time 8 -w '%{http_code}' "$COS_HEALTH_URL" 2>/dev/null) || return 1; [[ "$code" =~ ^2[0-9][0-9]$ ]]; }

restarts=0; backoff=2
while :; do
  say "starting tunnel (restart #$restarts)"
  setsid bash -c "$COS_TUNNEL_CMD" 9>&- >>"$log" 2>&1 & child=$!
  echo $$ >"$pidf"; started=$(date +%s); bad=0
  while kill -0 "$child" 2>/dev/null; do
    sleep "$INTERVAL"
    if healthy; then bad=0; else bad=$((bad+1)); say "health probe failed ($bad/$FAILS)"; fi
    [ "$bad" -ge "$FAILS" ] && { say "unhealthy; killing tunnel"; stop_child; break; }
  done
  stop_child
  # Stable run (>2 min) resets backoff; flapping grows it with jitter.
  [ $(( $(date +%s) - started )) -gt 120 ] && backoff=2
  restarts=$((restarts+1))
  [ "$MAXR" -gt 0 ] && [ "$restarts" -ge "$MAXR" ] && { say "max restarts reached"; break; }
  sleep $(( backoff + RANDOM % 3 )); backoff=$(( backoff*2 > BMAX ? BMAX : backoff*2 ))
done
rm -f "$pidf"

