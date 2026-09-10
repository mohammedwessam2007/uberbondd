#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 2; }
[[ $# -ge 4 && $# -le 5 ]] || {
  echo 'usage: bootstrap-founder-node.sh /path/to/clean/uberbond-checkout /path/to/llama-server /path/to/model.gguf MODEL_ID [PRIVATE_RFC1918_IPV4]' >&2
  exit 2
}

for cmd in realpath node install mv rm chown chmod; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }
done

SOURCE="$(realpath "$1")"
LLAMA_SERVER="$(realpath "$2")"
MODEL_FILE="$(realpath "$3")"
MODEL_ID="$4"
PRIVATE_HOST="${5:-}"

AUTHOR_INSTALLER="$SOURCE/ops/sovereign/install-authoring-node.sh"
MODEL_INSTALLER_SOURCE="$SOURCE/ops/sovereign/install-offline-llama-runtime.sh"
[[ -x "$AUTHOR_INSTALLER" && ! -L "$AUTHOR_INSTALLER" ]] || { echo 'REFUSED: exact source authoring installer must be executable.' >&2; exit 2; }
[[ -x "$MODEL_INSTALLER_SOURCE" && ! -L "$MODEL_INSTALLER_SOURCE" ]] || { echo 'REFUSED: exact source offline-model installer must be executable.' >&2; exit 2; }
[[ -x "$LLAMA_SERVER" && -f "$LLAMA_SERVER" && ! -L "$LLAMA_SERVER" ]] || { echo 'REFUSED: owner-supplied llama-server must be a real executable file.' >&2; exit 2; }
[[ -f "$MODEL_FILE" && ! -L "$MODEL_FILE" ]] || { echo 'REFUSED: owner-supplied GGUF model must be a real file.' >&2; exit 2; }
[[ "$MODEL_ID" =~ ^[A-Za-z0-9._:/+@=-]{1,400}$ ]] || { echo 'REFUSED: invalid model identity.' >&2; exit 2; }

# Stage 1: install the exact clean source as the sovereign authoring root. This
# creates the separated author/worker/verifier/promoter identities and the
# loopback founder console, but leaves model execution disabled.
"$AUTHOR_INSTALLER" "$SOURCE"

# External release/runtime receipts must be readable by the founder doctor but
# not writable by the authoring identity. Root owns the evidence ingress; the
# autonomy group receives read/traverse only. A missing receipt remains unknown.
install -d -m 0750 -o root -g uberbond-autonomy /var/lib/uberbond-evidence

# Stage 2: admit only the owner-supplied offline llama.cpp binary + GGUF model.
# The existing installer checksum-binds both artifacts, attests the model on
# loopback, enables the AF_UNIX worker proxy, direct founder dialogue, and the
# isolated worker. It performs no model/binary download and has no cloud fallback.
/opt/uberbond/source/ops/sovereign/install-offline-llama-runtime.sh \
  "$LLAMA_SERVER" "$MODEL_FILE" "$MODEL_ID"

# Stage 3: optionally expose the founder console to one specific private-LAN
# address so an iPad/phone can reach it. The configurator refuses wildcard and
# public addresses and generates a strong founder token shown once.
if [[ -n "$PRIVATE_HOST" ]]; then
  /opt/uberbond/control/configure-founder-console-private.sh "$PRIVATE_HOST"
fi

# Stage 4: make the activation claim depend on the canonical doctor, not on the
# fact that installers returned zero. Persist the exact doctor receipt locally.
DOCTOR_PATH=/var/lib/uberbond-control/bootstrap-doctor.json
DOCTOR_TMP="${DOCTOR_PATH}.tmp.$$"
cleanup(){ rm -f "$DOCTOR_TMP" "${WAKE_TMP:-}"; }
trap cleanup EXIT
/opt/uberbond/control/uberbond-authorctl doctor > "$DOCTOR_TMP"
DOCTOR_FILE="$DOCTOR_TMP" node --input-type=module - <<'NODE'
import fs from 'node:fs';
const doc=JSON.parse(fs.readFileSync(process.env.DOCTOR_FILE,'utf8'));
if(doc?.ok!==true || doc?.stages?.sourceStackComplete!==true || doc?.stages?.authoringHostInstalled!==true || doc?.stages?.authoringAutomationActive!==true || doc?.stages?.directFounderControlReady!==true || doc?.stages?.localModelAttested!==true || doc?.stages?.isolatedWorkerReady!==true || doc?.stages?.directFounderDialogueReady!==true || doc?.stages?.selfCompletionLoopReady!==true){
  console.error(JSON.stringify({ok:false,status:'FOUNDER_FIRST_BOOT_NOT_READY',doctorStatus:doc?.status||null,stages:doc?.stages||null,reasonCodes:doc?.reasonCodes||[]},null,2));
  process.exit(2);
}
NODE
install -m 0600 -o uberbond-author -g uberbond-author "$DOCTOR_TMP" "$DOCTOR_PATH"
rm -f "$DOCTOR_TMP"

# Stage 5: issue one explicit wake. The model installer may already have started
# a pulse; continuation law therefore permits either a new dispatch or an exact
# resume/wait state, but never a duplicate same-base task.
WAKE_PATH=/var/lib/uberbond-control/bootstrap-first-wake.json
WAKE_TMP="${WAKE_PATH}.tmp.$$"
/opt/uberbond/control/uberbond-authorctl wake > "$WAKE_TMP"
WAKE_FILE="$WAKE_TMP" node --input-type=module - <<'NODE'
import fs from 'node:fs';
const doc=JSON.parse(fs.readFileSync(process.env.WAKE_FILE,'utf8'));
if(doc?.ok!==true){
  console.error(JSON.stringify({ok:false,status:'FOUNDER_FIRST_WAKE_REFUSED',wakeStatus:doc?.status||null,reasonCodes:doc?.reasonCodes||[]},null,2));
  process.exit(2);
}
NODE
install -m 0600 -o uberbond-author -g uberbond-author "$WAKE_TMP" "$WAKE_PATH"
rm -f "$WAKE_TMP"
trap - EXIT

CONSOLE_HOST="${PRIVATE_HOST:-127.0.0.1}"
cat <<EOF
UBERBOND FOUNDER NODE READY

Founder Console: http://${CONSOLE_HOST}:8787/
Doctor receipt:  ${DOCTOR_PATH}
First-wake receipt: ${WAKE_PATH}

Open the Founder Console and type ordinary language, including:
  Keep working.

The direct dialogue, finite self-completion worker, independent verifier and
local promoter are now active on this owned host. GitHub, Vercel and public-cloud
models are not required for this local brainstem.

Truth boundary: this proves founder dialogue + bounded local engineering
self-completion readiness on this exact installed source/model. It does not prove
signed runtime deployment, customer/payment outcomes, lived-life improvement,
or system-level ASI. Those remain separate evidence classes.
EOF
