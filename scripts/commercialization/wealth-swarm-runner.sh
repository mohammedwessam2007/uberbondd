#!/usr/bin/env bash
set -euo pipefail
SETUP="${UBERBOND_SWARM_SETUP:-/tmp/uberbond-wealth-swarm-setup-20261023}"
MANIFEST="$SETUP/artifacts/commercialization/swarm/COORDINATOR/swarm_manifest.json"
RECEIPT="$SETUP/artifacts/commercialization/swarm/COORDINATOR/worktree_provision_receipt.json"
LOGROOT="${UBERBOND_SWARM_LOGROOT:-/tmp/uberbond-wealth-swarm-logs-20261023}"
MODE="${1:-status}"; TARGET="${2:-all}"
if [[ "$MODE" != status && "$MODE" != run ]]; then echo 'Usage: wealth-swarm-runner.sh status | run [all|A01..A20]'; exit 2; fi
python3 - "$MANIFEST" "$RECEIPT" "$TARGET" <<'PY'
import json,sys,pathlib,re
m=json.load(open(sys.argv[1]));r=json.load(open(sys.argv[2]));target=sys.argv[3]
assert len(m['agents'])==len(r['results'])==r['created']==20
assert target=='all' or re.fullmatch(r'A(?:0[1-9]|1[0-9]|20)',target)
for a in m['agents']:
 p=pathlib.Path(a['worktree']);assert p.is_dir() and (p/a['agent_file']).is_file(),a['id']
print('Verified 20 distinct agent specifications and worktrees; NOT 20 active sessions.')
PY
if [[ "$MODE" == status ]]; then
 if command -v claude >/dev/null 2>&1; then
  claude auth status 2>/dev/null | python3 -c 'import json,sys;d=json.load(sys.stdin);print("Claude loggedIn:",d.get("loggedIn",False),"authMethod:",d.get("authMethod","UNKNOWN"))' || echo 'Claude auth unknown'
 else echo 'Claude CLI unavailable'; fi
 exit 0
fi
if [[ "${UBERBOND_INCLUDED_PLAN_VERIFIED:-}" != yes ]]; then
 echo 'BLOCKED: account owner has not verified pre-existing included subscription. No model call made.';exit 3
fi
if [[ -n "${ANTHROPIC_API_KEY:-}" || -n "${CLAUDE_CODE_USE_BEDROCK:-}" || -n "${CLAUDE_CODE_USE_VERTEX:-}" ]]; then
 echo 'BLOCKED: metered API-key/cloud credentials in environment. No new spend allowed.';exit 3
fi
command -v claude >/dev/null || { echo 'BLOCKED: Claude CLI unavailable';exit 3; }
auth="$(claude auth status 2>/dev/null)" || { echo 'BLOCKED: Claude auth unavailable';exit 3; }
printf '%s' "$auth" | python3 -c 'import json,sys;d=json.load(sys.stdin);assert d.get("loggedIn") is True and d.get("authMethod") not in ("none","apiKey","api_key","api-key")' || { echo 'BLOCKED: no verified included-plan login';exit 3; }
mkdir -p "$LOGROOT"
exec 9>"$LOGROOT/launch.lock"
flock -n 9 || { echo 'BLOCKED: another swarm runner active';exit 4; }
mapfile -t jobs < <(python3 - "$MANIFEST" "$TARGET" <<'PY'
import json,sys
m=json.load(open(sys.argv[1])); target=sys.argv[2]
for a in m['agents']:
 if target=='all' or a['id']==target: print('|'.join([a['id'],a['name'],a['worktree'],a['branch']]))
PY
)
for job in "${jobs[@]}";do
 IFS='|' read -r id name path branch <<< "$job"
 [[ "$(git -C "$path" branch --show-current)" == "$branch" ]] || { echo "BLOCKED: $id branch mismatch";exit 5; }
 logfile="$LOGROOT/$id.json"
 [[ ! -e "$logfile" ]] || { echo "BLOCKED: $id exists; inspect idempotency before replay";exit 5; }
 prompt="Execute your entire native $id agent contract and eight phases, truthfully, within only this worktree and $branch. No new spend, external customer effects, live charge, DNS, production deployment or main merge. Run tests, commit isolated results and write PHOENIX handoff to A20. Historical buyer and bank-cleared profit defaults remain $0 without external receipts."
 echo "START $id model=opus effort=max in $path"
 set +e
 (cd "$path" && claude -p --agent "$name" --model opus --effort max --max-turns 40 --output-format json "$prompt") >"$logfile" 2>"$LOGROOT/$id.stderr"
 rc=$?
 set -e
 echo "$id model process exit $rc; log $logfile"
 [[ $rc == 0 ]] || { echo "STOP: $id failed, no automatic replay";exit "$rc"; }
done
