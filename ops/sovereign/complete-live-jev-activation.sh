#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root on the UberLit host.' >&2; exit 2; }
SOURCE=/opt/uberlit/source
ROOT=/var/lib/uberlit/uberbond
ENV_FILE=/etc/uberlit/uberlit.env
ARTIFACTS="$ROOT/artifacts/system-one"
AUTHORIZED_MAX=""
if [[ "${1:-}" == "--authorize-max-usd" ]]; then AUTHORIZED_MAX="${2:-}"; shift 2; fi
[[ $# -eq 0 ]] || { echo 'usage: complete-live-jev-activation.sh --authorize-max-usd 0.001' >&2; exit 2; }
[[ "$AUTHORIZED_MAX" == "0.001" ]] || { echo 'REFUSED: explicit --authorize-max-usd 0.001 required for the live canary.' >&2; exit 2; }
[[ -d "$SOURCE/.git" ]] || { echo 'REFUSED: canonical UberLit Git source missing.' >&2; exit 2; }
[[ -f "$ENV_FILE" ]] || { echo 'REFUSED: UberLit environment file missing.' >&2; exit 2; }
for cmd in node systemctl curl grep sed install find chown chmod seq; do command -v "$cmd" >/dev/null || { echo "REFUSED: missing $cmd" >&2; exit 2; }; done

node "$SOURCE/scripts/uberlit-typesafe-secret.mjs" status --root "$ROOT" |
  node --input-type=module -e "let s='';for await(const c of process.stdin)s+=c;const j=JSON.parse(s);if(j?.ok!==true||j?.keyReturned!==false)process.exit(2)" ||
  { echo 'REFUSED: protected TypeSafe key is not installed.' >&2; exit 2; }

ensure_env_value() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}
ACTIVATION_DONE=false
rollback_enable() {
  if [[ "$ACTIVATION_DONE" != "true" ]]; then
    ensure_env_value TYPESAFE_JEV_ENABLED false || true
    chown root:uberlit "$ENV_FILE" 2>/dev/null || true
    chmod 0640 "$ENV_FILE" 2>/dev/null || true
    systemctl restart uberlit.service uberlit-tls-edge.service uberlit-worker.service >/dev/null 2>&1 || true
  fi
}
trap rollback_enable EXIT

ensure_env_value TYPESAFE_JEV_ENABLED true
chown root:uberlit "$ENV_FILE"
chmod 0640 "$ENV_FILE"

set -a
. "$ENV_FILE"
set +a

[[ "${TYPESAFE_JEV_ENABLED:-}" == "true" ]] || { echo 'REFUSED: Jev enable flag did not persist.' >&2; exit 2; }
node --input-type=module - <<'NODE'
const n=Number(process.env.TYPESAFE_MAX_COST_USD_PER_CALL);
if(!Number.isFinite(n)||n<=0||n>0.001){console.error('REFUSED: TYPESAFE_MAX_COST_USD_PER_CALL must be >0 and <=0.001 USD.');process.exit(2)}
const t=Date.parse(String(process.env.TYPESAFE_PRICING_VERIFIED_AT||''));
if(!Number.isFinite(t)||Date.now()-t>30*24*60*60*1000){console.error('REFUSED: TypeSafe pricing evidence is absent or older than 30 days.');process.exit(2)}
if(!String(process.env.TYPESAFE_PRICING_SOURCE||'').startsWith('https://')){console.error('REFUSED: official pricing evidence URL required.');process.exit(2)}
NODE

install -d -o uberlit -g uberlit -m 0700 "$ARTIFACTS"

systemctl restart uberlit.service uberlit-tls-edge.service uberlit-worker.service
HEALTH=false
for _ in $(seq 1 60); do
  if curl --silent --show-error --fail --insecure --max-time 2 https://127.0.0.1:32443/api/health >/dev/null 2>&1; then
    HEALTH=true
    break
  fi
  sleep 1
done
$HEALTH || { echo 'REFUSED: UberLit local HTTPS health did not recover after Jev activation.' >&2; exit 2; }

CANARY="$ARTIFACTS/jev-live-canary.json"
ROUTE="$ARTIFACTS/jev-live-shadow-route.json"
CAL="$ARTIFACTS/jev-calibration.json"
FINAL="$ARTIFACTS/jev-live-activation.json"

UBERLIT_ROOT="$ROOT" node "$SOURCE/scripts/uberlit-jev-shadow-canary.mjs" --execute >"$CANARY"
node --input-type=module - "$CANARY" <<'NODE'
import fs from 'node:fs';
const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(j?.result?.ok!==true) process.exit(2);
if(!['SEMANTIC_SHADOW_OBSERVED','SEMANTIC_SHADOW_OBSERVED__FRONTIER_REVIEW_REQUIRED'].includes(j?.result?.status)) process.exit(2);
if(j?.result?.externalEffectAuthority!=='NONE'&&j?.externalEffectAuthority!=='NONE') process.exit(2);
if(Number(j?.result?.externalEffectLedger?.spendCents||0)>0.1) process.exit(2);
NODE

UBERLIT_ROOT="$ROOT" node "$SOURCE/scripts/jev-shadow-route.mjs" --execute --data-class INTERNAL_NON_SENSITIVE >"$ROUTE"
node --input-type=module - "$ROUTE" <<'NODE'
import fs from 'node:fs';
const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(j?.ok!==true||j?.shadowOnly!==true||j?.routingAuthority!=='NONE'||j?.canonicalRouteChanged!==false) process.exit(2);
if(!String(j?.observationId||'').startsWith('semobs_')) process.exit(2);
NODE

UBERLIT_ROOT="$ROOT" node "$SOURCE/scripts/jev-calibration-doctor.mjs" >"$CAL"

node --input-type=module - "$CANARY" "$ROUTE" "$CAL" "$FINAL" <<'NODE'
import fs from 'node:fs';
import crypto from 'node:crypto';
const [canaryPath,routePath,calPath,outPath]=process.argv.slice(2);
const canary=JSON.parse(fs.readFileSync(canaryPath,'utf8'));
const route=JSON.parse(fs.readFileSync(routePath,'utf8'));
const calibration=JSON.parse(fs.readFileSync(calPath,'utf8'));
const hash=p=>'sha256:'+crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const receipt={
 schema:'uberbond.jev-live-activation.v1',
 observedAt:new Date().toISOString(),
 status:'JEV_LIVE_SHADOW_READY',
 provider:canary?.result?.providerEvidence?.provider||null,
 requestedModel:canary?.result?.providerEvidence?.requestedModel||null,
 observedModel:canary?.result?.providerEvidence?.observedModel||null,
 latencyMs:canary?.result?.providerEvidence?.latencyMs??null,
 canaryCostUsd:canary?.result?.providerEvidence?.usage?.costUsd??null,
 routeObservationId:route?.observationId||null,
 calibrationOutcomeCount:calibration?.result?.count??0,
 receipts:{canary:hash(canaryPath),route:hash(routePath),calibration:hash(calPath)},
 secretIncluded:false,
 canonicalRoutingChanged:false,
 businessEffectAuthority:'NONE',
 externalEffectAuthority:'NONE',
 automaticPromotion:false
};
fs.writeFileSync(outPath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
NODE

chown -R uberlit:uberlit "$ARTIFACTS"
find "$ARTIFACTS" -type d -exec chmod 0700 {} +
find "$ARTIFACTS" -type f -exec chmod 0600 {} +

ACTIVATION_DONE=true
cat "$FINAL"
echo 'UBERBOND_JEV_LIVE_SHADOW_READY'
