#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 2; }
[[ $# -ge 3 && $# -le 4 ]] || { echo 'usage: configure-local-model.sh RUNTIME MODEL LOOPBACK_HTTP_ENDPOINT [CHAT_COMPLETIONS]' >&2; exit 2; }
RUNTIME="${1^^}"; MODEL="$2"; ENDPOINT="$3"; API_STYLE="${4:-CHAT_COMPLETIONS}"; API_STYLE="${API_STYLE^^}"
case "$RUNTIME" in VLLM|SGLANG|LLAMA_CPP|OLLAMA|MLX_LM|TGI|TRANSFORMERS_HTTP|CUSTOM_OPENAI_COMPATIBLE) ;; *) echo 'Unsupported local runtime.' >&2; exit 2;; esac
[[ "$API_STYLE" == CHAT_COMPLETIONS ]] || { echo 'Native sovereign worker currently requires CHAT_COMPLETIONS.' >&2; exit 2; }
[[ "$MODEL" =~ ^[A-Za-z0-9._:/+@=-]{1,400}$ ]] || { echo 'Model identity contains unsupported characters.' >&2; exit 2; }
[[ "$ENDPOINT" =~ ^http://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]{1,5})?(/[^[:space:]]*)?$ ]] || { echo 'Endpoint must be owner-host loopback HTTP.' >&2; exit 2; }
[[ -f /etc/uberbond/authoring.env && ! -L /etc/uberbond/authoring.env ]] || { echo 'Authoring node must be installed first.' >&2; exit 2; }
NODE="$(command -v node)"; [[ -x "$NODE" ]] || { echo 'Node.js required.' >&2; exit 2; }
# The founder console may read the local-model identity/config only after the
# owner explicitly activates a model. The worker itself never receives this
# file or any optional local runtime credential.
usermod -a -G uberbond-model uberbond-author
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TMP="/etc/uberbond/model.env.tmp.$$"
{
  printf 'OPEN_MODEL_AGENT_ENABLED=true\n'
  printf 'OPEN_MODEL_RUNTIME=%q\n' "$RUNTIME"
  printf 'OPEN_MODEL_MODEL=%q\n' "$MODEL"
  printf 'OPEN_MODEL_ENDPOINT=%q\n' "$ENDPOINT"
  printf 'OPEN_MODEL_API_STYLE=CHAT_COMPLETIONS\n'
  printf 'OPEN_MODEL_API_KEY=\n'
  printf 'OPEN_MODEL_INPUT_USD_PER_MILLION=0\n'
  printf 'OPEN_MODEL_OUTPUT_USD_PER_MILLION=0\n'
  printf 'OPEN_MODEL_INFRASTRUCTURE_USD_PER_REQUEST=0\n'
  printf 'OPEN_MODEL_PRICING_SOURCE=%q\n' "owner-controlled-local-runtime:${RUNTIME}:${MODEL}"
  printf 'OPEN_MODEL_PRICING_VERIFIED_AT=%q\n' "$NOW"
  printf 'UBERBOND_FOUNDER_DIALOGUE_ENABLED=true\n'
} > "$TMP"
chown root:uberbond-model "$TMP"; chmod 0640 "$TMP"; mv -f "$TMP" /etc/uberbond/model.env
AUTH_TMP="/etc/uberbond/authoring.env.tmp.$$"
awk 'BEGIN{done=0} /^UBERBOND_ISOLATED_WORKER_ENABLED=/{print "UBERBOND_ISOLATED_WORKER_ENABLED=true";done=1;next} {print} END{if(!done)print "UBERBOND_ISOLATED_WORKER_ENABLED=true"}' /etc/uberbond/authoring.env > "$AUTH_TMP"
chown root:uberbond-author "$AUTH_TMP"; chmod 0640 "$AUTH_TMP"; mv -f "$AUTH_TMP" /etc/uberbond/authoring.env
systemctl daemon-reload
systemctl enable --now uberbond-local-model-proxy.service
systemctl restart uberbond-founder-console.service
systemctl start uberbond-authoring.service
cat <<EOF
UberBond local sovereign model enabled.
Runtime: ${RUNTIME}
Model:   ${MODEL}
Endpoint class: HOST_LOOPBACK_ONLY
Worker transport: AF_UNIX /run/uberbond-model/proxy.sock

The coding worker still has no IP network, merge, signing, deployment, payment,
message, credential or DNS authority. The proxy is systemd-restricted to host
localhost. A failing/unavailable model produces evidence and does not widen authority.
EOF
