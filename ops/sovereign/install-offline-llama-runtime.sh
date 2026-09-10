#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 2; }
[[ $# -eq 3 ]] || { echo "usage: install-offline-llama-runtime.sh /path/to/llama-server /path/to/model.gguf MODEL_ID" >&2; exit 2; }
for cmd in sha256sum head stat install mv rm chown chmod systemctl useradd id getent awk realpath seq sleep node mktemp; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
BINARY_INPUT="$1"; MODEL_FILE_INPUT="$2"; MODEL_ID="$3"
[[ -f "$BINARY_INPUT" && -x "$BINARY_INPUT" && ! -L "$BINARY_INPUT" ]] || { echo "llama-server must be a real executable file, not a symlink." >&2; exit 2; }
[[ -f "$MODEL_FILE_INPUT" && ! -L "$MODEL_FILE_INPUT" ]] || { echo "GGUF model must be a real file, not a symlink." >&2; exit 2; }
BINARY="$(realpath "$BINARY_INPUT")"; MODEL_FILE="$(realpath "$MODEL_FILE_INPUT")"
[[ -f "$BINARY" && ! -L "$BINARY" && -x "$BINARY" ]] || { echo "Resolved llama-server must remain a real executable file." >&2; exit 2; }
[[ -f "$MODEL_FILE" && ! -L "$MODEL_FILE" ]] || { echo "Resolved GGUF model must remain a real file." >&2; exit 2; }
[[ -f /etc/uberbond/authoring.env && ! -L /etc/uberbond/authoring.env ]] || { echo "Install the sovereign authoring node first." >&2; exit 2; }
[[ "$(head -c 4 "$MODEL_FILE")" == "GGUF" ]] || { echo "Model does not have the GGUF magic header." >&2; exit 2; }
[[ "$MODEL_ID" =~ ^[A-Za-z0-9._:/+@=-]{1,400}$ ]] || { echo "Model identity contains unsupported characters." >&2; exit 2; }
getent group uberbond-model >/dev/null || { echo "uberbond-model group missing; reinstall the sovereign authoring node." >&2; exit 2; }
NODE="$(command -v node)"; [[ -x "$NODE" ]] || { echo "Node.js required." >&2; exit 2; }
[[ -x /opt/uberbond/control/configure-local-model.sh ]] || { echo "configure-local-model.sh missing from sovereign control tools." >&2; exit 2; }

BINARY_SHA="$(sha256sum "$BINARY" | awk '{print $1}')"; MODEL_SHA="$(sha256sum "$MODEL_FILE" | awk '{print $1}')"
[[ "$BINARY_SHA" =~ ^[0-9a-f]{64}$ && "$MODEL_SHA" =~ ^[0-9a-f]{64}$ ]] || { echo "SHA-256 calculation failed." >&2; exit 2; }
MODEL_BYTES="$(stat -c %s "$MODEL_FILE")"; [[ "$MODEL_BYTES" =~ ^[0-9]+$ && "$MODEL_BYTES" -ge 1048576 ]] || { echo "GGUF model is implausibly small." >&2; exit 2; }

if ! id -u uberbond-local-model >/dev/null 2>&1; then
  useradd --system --gid uberbond-model --home-dir /var/lib/uberbond-model-runtime --no-create-home --shell /usr/sbin/nologin uberbond-local-model
fi
install -d -m 0750 -o root -g uberbond-model /opt/uberbond/model-runtime /var/lib/uberbond-model-runtime
install -d -m 0700 -o root -g root /var/lib/uberbond-control
BINARY_STAGE="/opt/uberbond/model-runtime/.llama-server.$$"; MODEL_STAGE="/var/lib/uberbond-model-runtime/.model.gguf.$$"
cleanup(){ rm -f "$BINARY_STAGE" "$MODEL_STAGE"; }; trap cleanup EXIT
install -m 0550 -o root -g uberbond-model "$BINARY" "$BINARY_STAGE"
install -m 0440 -o root -g uberbond-model "$MODEL_FILE" "$MODEL_STAGE"
[[ "$(sha256sum "$BINARY_STAGE" | awk '{print $1}')" == "$BINARY_SHA" ]] || { echo "Installed llama-server checksum mismatch." >&2; exit 2; }
[[ "$(sha256sum "$MODEL_STAGE" | awk '{print $1}')" == "$MODEL_SHA" ]] || { echo "Installed GGUF checksum mismatch." >&2; exit 2; }

# Admission is transactional. A candidate that fails to start, attest, configure,
# or persist its receipt must not destroy a previously working sovereign runtime.
BACKUP_DIR="$(mktemp -d /var/lib/uberbond-control/.offline-llama-backup.XXXXXX)"
HAD_BINARY=false; HAD_MODEL=false; HAD_RUNTIME_ENV=false; HAD_RUNTIME_UNIT=false; HAD_MODEL_ENV=false
if [[ -f /opt/uberbond/model-runtime/llama-server && ! -L /opt/uberbond/model-runtime/llama-server ]]; then install -m 0550 -o root -g uberbond-model /opt/uberbond/model-runtime/llama-server "$BACKUP_DIR/llama-server"; HAD_BINARY=true; fi
if [[ -f /var/lib/uberbond-model-runtime/model.gguf && ! -L /var/lib/uberbond-model-runtime/model.gguf ]]; then install -m 0440 -o root -g uberbond-model /var/lib/uberbond-model-runtime/model.gguf "$BACKUP_DIR/model.gguf"; HAD_MODEL=true; fi
if [[ -f /etc/uberbond/offline-llama-runtime.env && ! -L /etc/uberbond/offline-llama-runtime.env ]]; then install -m 0640 -o root -g uberbond-model /etc/uberbond/offline-llama-runtime.env "$BACKUP_DIR/offline-llama-runtime.env"; HAD_RUNTIME_ENV=true; fi
if [[ -f /etc/systemd/system/uberbond-offline-llama-runtime.service && ! -L /etc/systemd/system/uberbond-offline-llama-runtime.service ]]; then install -m 0644 -o root -g root /etc/systemd/system/uberbond-offline-llama-runtime.service "$BACKUP_DIR/offline-llama-runtime.service"; HAD_RUNTIME_UNIT=true; fi
if [[ -f /etc/uberbond/model.env && ! -L /etc/uberbond/model.env ]]; then install -m 0640 -o root -g uberbond-model /etc/uberbond/model.env "$BACKUP_DIR/model.env"; HAD_MODEL_ENV=true; fi
install -m 0640 -o root -g uberbond-author /etc/uberbond/authoring.env "$BACKUP_DIR/authoring.env"
PREV_RUNTIME_ACTIVE=false; PREV_RUNTIME_ENABLED=false; PREV_PROXY_ACTIVE=false; PREV_FOUNDER_ACTIVE=false; PREV_AUTHORING_ACTIVE=false
if systemctl is-active --quiet uberbond-offline-llama-runtime.service; then PREV_RUNTIME_ACTIVE=true; fi
if systemctl is-enabled --quiet uberbond-offline-llama-runtime.service; then PREV_RUNTIME_ENABLED=true; fi
if systemctl is-active --quiet uberbond-local-model-proxy.service; then PREV_PROXY_ACTIVE=true; fi
if systemctl is-active --quiet uberbond-founder-console.service; then PREV_FOUNDER_ACTIVE=true; fi
if systemctl is-active --quiet uberbond-authoring.service; then PREV_AUTHORING_ACTIVE=true; fi
rollback(){
  local rc=$?
  trap - ERR EXIT
  set +e
  systemctl stop uberbond-offline-llama-runtime.service uberbond-local-model-proxy.service >/dev/null 2>&1
  if [[ "$HAD_BINARY" == true ]]; then install -m 0550 -o root -g uberbond-model "$BACKUP_DIR/llama-server" /opt/uberbond/model-runtime/llama-server; else rm -f /opt/uberbond/model-runtime/llama-server; fi
  if [[ "$HAD_MODEL" == true ]]; then install -m 0440 -o root -g uberbond-model "$BACKUP_DIR/model.gguf" /var/lib/uberbond-model-runtime/model.gguf; else rm -f /var/lib/uberbond-model-runtime/model.gguf; fi
  if [[ "$HAD_RUNTIME_ENV" == true ]]; then install -m 0640 -o root -g uberbond-model "$BACKUP_DIR/offline-llama-runtime.env" /etc/uberbond/offline-llama-runtime.env; else rm -f /etc/uberbond/offline-llama-runtime.env; fi
  if [[ "$HAD_RUNTIME_UNIT" == true ]]; then install -m 0644 -o root -g root "$BACKUP_DIR/offline-llama-runtime.service" /etc/systemd/system/uberbond-offline-llama-runtime.service; else rm -f /etc/systemd/system/uberbond-offline-llama-runtime.service; fi
  if [[ "$HAD_MODEL_ENV" == true ]]; then install -m 0640 -o root -g uberbond-model "$BACKUP_DIR/model.env" /etc/uberbond/model.env; else rm -f /etc/uberbond/model.env; fi
  install -m 0640 -o root -g uberbond-author "$BACKUP_DIR/authoring.env" /etc/uberbond/authoring.env
  systemctl daemon-reload
  if [[ "$PREV_RUNTIME_ENABLED" == true ]]; then systemctl enable uberbond-offline-llama-runtime.service >/dev/null 2>&1; else systemctl disable uberbond-offline-llama-runtime.service >/dev/null 2>&1; fi
  if [[ "$PREV_RUNTIME_ACTIVE" == true ]]; then systemctl start uberbond-offline-llama-runtime.service >/dev/null 2>&1; fi
  if [[ "$PREV_PROXY_ACTIVE" == true ]]; then systemctl start uberbond-local-model-proxy.service >/dev/null 2>&1; fi
  if [[ "$PREV_FOUNDER_ACTIVE" == true ]]; then systemctl restart uberbond-founder-console.service >/dev/null 2>&1; else systemctl stop uberbond-founder-console.service >/dev/null 2>&1; fi
  if [[ "$PREV_AUTHORING_ACTIVE" == true ]]; then systemctl start uberbond-authoring.service >/dev/null 2>&1; else systemctl stop uberbond-authoring.service >/dev/null 2>&1; fi
  rm -rf "$BACKUP_DIR"
  echo "Offline llama runtime admission failed; previous local runtime/configuration restored." >&2
  exit "$rc"
}
trap rollback ERR

systemctl stop uberbond-offline-llama-runtime.service >/dev/null 2>&1 || true
mv -f "$BINARY_STAGE" /opt/uberbond/model-runtime/llama-server
mv -f "$MODEL_STAGE" /var/lib/uberbond-model-runtime/model.gguf
trap - EXIT
chown root:uberbond-model /opt/uberbond/model-runtime/llama-server /var/lib/uberbond-model-runtime/model.gguf
chmod 0550 /opt/uberbond/model-runtime/llama-server; chmod 0440 /var/lib/uberbond-model-runtime/model.gguf

install -m 0644 /opt/uberbond/source/ops/sovereign/uberbond-offline-llama-runtime.service /etc/systemd/system/uberbond-offline-llama-runtime.service
cat > /etc/uberbond/offline-llama-runtime.env <<EOF
UBERBOND_LOCAL_MODEL_ID=$MODEL_ID
EOF
chown root:uberbond-model /etc/uberbond/offline-llama-runtime.env; chmod 0640 /etc/uberbond/offline-llama-runtime.env

systemctl daemon-reload
systemctl enable --now uberbond-offline-llama-runtime.service

READY=false
for _ in $(seq 1 300); do
  systemctl is-active --quiet uberbond-offline-llama-runtime.service || { echo "Offline llama runtime stopped before readiness." >&2; false; }
  if EXPECTED_MODEL_ID="$MODEL_ID" "$NODE" --input-type=module - <<'NODE' >/dev/null 2>&1
const expected=process.env.EXPECTED_MODEL_ID;
try{
  const response=await fetch('http://127.0.0.1:11439/v1/models',{signal:AbortSignal.timeout(1800)});
  if(!response.ok) process.exit(2);
  const payload=await response.json();
  if(payload?.data?.[0]?.id!==expected) process.exit(3);
}catch{process.exit(2);}
NODE
  then READY=true; break; fi
  sleep 2
done
[[ "$READY" == true ]] || { echo "Offline llama runtime did not attest the configured model alias before timeout." >&2; false; }

/opt/uberbond/control/configure-local-model.sh LLAMA_CPP "$MODEL_ID" http://127.0.0.1:11439

BINARY_SHA="$BINARY_SHA" MODEL_SHA="$MODEL_SHA" MODEL_BYTES="$MODEL_BYTES" MODEL_ID="$MODEL_ID" "$NODE" --input-type=module - <<'NODE'
import fs from 'node:fs';
const receipt={
  schemaVersion:'uberbond.offline-local-model-runtime.v1',status:'OFFLINE_LOCAL_MODEL_RUNTIME_INSTALLED_AND_LOOPBACK_ATTESTED',
  runtime:'LLAMA_CPP',modelId:process.env.MODEL_ID,endpoint:'http://127.0.0.1:11439',
  binarySha256:process.env.BINARY_SHA,modelSha256:process.env.MODEL_SHA,modelBytes:Number(process.env.MODEL_BYTES),
  observedModelId:process.env.MODEL_ID,observedAt:new Date().toISOString(),networkSeedCalls:0,cloudProviderCalls:0,
  businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',
  truthBoundary:'This proves only that owner-supplied offline llama-server and GGUF artifacts were checksum-preserved, started on host loopback, and reported the configured API alias. It does not prove model quality, autonomous closure, deployment, customer, payment, life-outcome, or ASI evidence.'
};
fs.writeFileSync('/var/lib/uberbond-control/local-model-runtime-receipt.json',`${JSON.stringify(receipt,null,2)}\n`,{mode:0o600});
NODE
chown uberbond-author:uberbond-author /var/lib/uberbond-control/local-model-runtime-receipt.json; chmod 0600 /var/lib/uberbond-control/local-model-runtime-receipt.json

trap - ERR
rm -rf "$BACKUP_DIR"
cat <<EOF
UberBond offline local model runtime activated.
Runtime:      LLAMA_CPP
Model ID:     $MODEL_ID
Binary SHA:   $BINARY_SHA
Model SHA:    $MODEL_SHA
Model bytes:  $MODEL_BYTES
Endpoint:     http://127.0.0.1:11439
Worker path:  AF_UNIX /run/uberbond-model/proxy.sock

No binary/model download or cloud-provider call was performed. The supplied artifacts are now
local, checksum-bound, root-owned, and the runtime is systemd-denied from public IP traffic.
UberBond's worker remains proposal-only and separate from verifier, promoter, signer and deployer.
EOF
