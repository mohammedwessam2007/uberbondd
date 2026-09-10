#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 2; }
for cmd in node npm git systemctl unshare install useradd usermod groupadd getent cp realpath mv rm chown chmod; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
if [[ -e /etc/uberbond/release-private.pem ]]; then echo "REFUSED: release signing authority must not live on the authoring/runtime control node." >&2; exit 2; fi

SOURCE="${1:-}"
[[ -n "$SOURCE" ]] || { echo "usage: install-authoring-node.sh /path/to/clean/uberbond-checkout" >&2; exit 2; }
SOURCE="$(realpath "$SOURCE")"
[[ -d "$SOURCE/.git" && ! -L "$SOURCE" ]] || { echo "A real Git checkout is required." >&2; exit 2; }
[[ -z "$(git -C "$SOURCE" status --porcelain)" ]] || { echo "Source checkout must be clean." >&2; exit 2; }
[[ -d "$SOURCE/node_modules" && ! -L "$SOURCE/node_modules" ]] || { echo "Prepared node_modules is required; run the deliberate dependency seed first." >&2; exit 2; }
SOURCE_HEAD="$(git -C "$SOURCE" rev-parse HEAD)"; [[ "$SOURCE_HEAD" =~ ^[0-9a-f]{40}$ ]] || { echo "Exact source commit required." >&2; exit 2; }

getent group uberbond-autonomy >/dev/null || groupadd --system uberbond-autonomy
getent group uberbond-promotion >/dev/null || groupadd --system uberbond-promotion
getent group uberbond-model >/dev/null || groupadd --system uberbond-model
for account in uberbond-author uberbond-worker uberbond-promoter; do
  getent group "$account" >/dev/null || groupadd --system "$account"
  if ! id -u "$account" >/dev/null 2>&1; then
    useradd --system --gid "$account" --home-dir "/var/lib/$account" --create-home --shell /usr/sbin/nologin "$account"
  fi
done
if ! id -u uberbond-model-proxy >/dev/null 2>&1; then
  useradd --system --gid uberbond-model --home-dir /var/lib/uberbond-model-proxy --create-home --shell /usr/sbin/nologin uberbond-model-proxy
fi
usermod -g uberbond-author -a -G uberbond-autonomy,uberbond-promotion uberbond-author
usermod -g uberbond-worker -a -G uberbond-autonomy,uberbond-model uberbond-worker
usermod -g uberbond-promoter -a -G uberbond-autonomy,uberbond-promotion uberbond-promoter

install -d -m 0755 /opt/uberbond /opt/uberbond/control
install -d -m 0700 -o uberbond-author -g uberbond-author /var/lib/uberbond-control /var/lib/uberbond-control/autonomy /var/lib/uberbond-control/founder-intents /var/lib/uberbond-control/founder-dialogue
install -d -m 0750 -o root -g uberbond-autonomy /var/lib/uberbond-evidence
install -d -m 0750 -o uberbond-author -g uberbond-autonomy /var/lib/uberbond-worker/inbox
install -d -m 0750 -o uberbond-worker -g uberbond-autonomy /var/lib/uberbond-worker/outbox
install -d -m 2770 -o uberbond-author -g uberbond-promotion /var/lib/uberbond-governance /var/lib/uberbond-governance/inbox
install -d -m 0750 -o uberbond-promoter -g uberbond-promotion /var/lib/uberbond-promotion /var/lib/uberbond-promotion/consumed
install -d -m 0700 /etc/uberbond

STAGE="/opt/uberbond/.source-stage.$$"; PREVIOUS="/opt/uberbond/.source-previous.$$"
cleanup(){ rm -rf "$STAGE" "$PREVIOUS"; }; trap cleanup EXIT
rm -rf "$STAGE" "$PREVIOUS"; cp -a "$SOURCE" "$STAGE"
[[ -d "$STAGE/.git" && ! -L "$STAGE" ]] || { echo "Staged source lost Git identity." >&2; exit 2; }
[[ "$(git -C "$STAGE" rev-parse HEAD)" == "$SOURCE_HEAD" ]] || { echo "Staged source commit mismatch." >&2; exit 2; }
[[ -z "$(git -C "$STAGE" status --porcelain)" ]] || { echo "Staged source is not clean." >&2; exit 2; }
# Trusted source belongs to the promotion identity. Author and worker identities
# can read/execute it through uberbond-autonomy but cannot rewrite trusted main.
chown -R uberbond-promoter:uberbond-autonomy "$STAGE"
if [[ -e /opt/uberbond/source ]]; then mv /opt/uberbond/source "$PREVIOUS"; fi
mv "$STAGE" /opt/uberbond/source
if [[ "$(git -C /opt/uberbond/source rev-parse HEAD)" != "$SOURCE_HEAD" ]]; then rm -rf /opt/uberbond/source; [[ ! -e "$PREVIOUS" ]] || mv "$PREVIOUS" /opt/uberbond/source; echo "Installed source identity verification failed; prior source restored." >&2; exit 2; fi
rm -rf "$PREVIOUS"; trap - EXIT

for tool in uberbond-authorctl uberbond-founder-console uberbond-local-promoter uberbond-native-local-worker uberbond-local-model-proxy configure-local-model.sh configure-founder-console-private.sh import-sovereign-evidence.sh; do
  install -m 0755 "/opt/uberbond/source/ops/sovereign/$tool" "/opt/uberbond/control/$tool"
done
for unit in uberbond-authoring.service uberbond-authoring.timer uberbond-local-worker.service uberbond-local-worker.path uberbond-autonomy-verify.service uberbond-autonomy-verify.path uberbond-founder-console.service uberbond-local-promote.service uberbond-local-promote.path uberbond-authoring-after-promotion.path uberbond-local-model-proxy.service; do
  install -m 0644 "/opt/uberbond/source/ops/sovereign/$unit" "/etc/systemd/system/$unit"
done

cat > /etc/uberbond/authoring.env <<EOF
UBERBOND_SOURCE_ROOT=/opt/uberbond/source
UBERBOND_CONTROL_DIR=/var/lib/uberbond-control
UBERBOND_SOVEREIGN_EVIDENCE_ROOT=/var/lib/uberbond-evidence
UBERBOND_NODE_EXECUTABLE=$(command -v node)
UBERBOND_REPOSITORY=local/uberbond
UBERBOND_ISOLATED_WORKER_ENABLED=false
UBERBOND_WORKER_INBOX_ROOT=/var/lib/uberbond-worker/inbox
UBERBOND_WORKER_TASK_PATH=/var/lib/uberbond-worker/inbox/task.json
UBERBOND_WORKER_OUTBOX_ROOT=/var/lib/uberbond-worker/outbox
UBERBOND_WORKER_RESULT_PATH=/var/lib/uberbond-worker/outbox/result.json
UBERBOND_GOVERNANCE_INBOX_ROOT=/var/lib/uberbond-governance/inbox
UBERBOND_GOVERNANCE_VERIFIED_PATH=/var/lib/uberbond-governance/inbox/verified.json
EOF
chown root:uberbond-author /etc/uberbond/authoring.env; chmod 0640 /etc/uberbond/authoring.env

cat > /etc/uberbond/worker.env <<EOF
UBERBOND_SOURCE_ROOT=/opt/uberbond/source
UBERBOND_WORKER_TASK_PATH=/var/lib/uberbond-worker/inbox/task.json
UBERBOND_WORKER_OUTBOX_ROOT=/var/lib/uberbond-worker/outbox
UBERBOND_WORKER_RESULT_PATH=/var/lib/uberbond-worker/outbox/result.json
UBERBOND_LOCAL_WORKER_EXECUTABLE=/opt/uberbond/control/uberbond-native-local-worker
UBERBOND_LOCAL_WORKER_TIMEOUT_MS=2700000
EOF
chown root:uberbond-worker /etc/uberbond/worker.env; chmod 0640 /etc/uberbond/worker.env

cat > /etc/uberbond/promotion.env <<EOF
UBERBOND_SOURCE_ROOT=/opt/uberbond/source
UBERBOND_PROMOTION_DIR=/var/lib/uberbond-promotion
UBERBOND_GOVERNANCE_VERIFIED_PATH=/var/lib/uberbond-governance/inbox/verified.json
UBERBOND_NODE_EXECUTABLE=$(command -v node)
UBERBOND_GIT_EXECUTABLE=$(command -v git)
UBERBOND_NPM_EXECUTABLE=$(command -v npm)
HOME=/var/lib/uberbond-promoter
EOF
chown root:uberbond-promotion /etc/uberbond/promotion.env; chmod 0640 /etc/uberbond/promotion.env

cat > /etc/uberbond/founder-console.env <<EOF
UBERBOND_FOUNDER_CONSOLE_HOST=127.0.0.1
UBERBOND_FOUNDER_CONSOLE_PORT=8787
UBERBOND_FOUNDER_CONSOLE_TOKEN=
UBERBOND_AUTHORCTL=/opt/uberbond/control/uberbond-authorctl
UBERBOND_PROMOTION_DIR=/var/lib/uberbond-promotion
UBERBOND_FOUNDER_DIALOGUE_ENABLED=false
UBERBOND_FOUNDER_DIALOGUE_MAX_TOKENS=4096
UBERBOND_FOUNDER_DIALOGUE_MAX_COST_CENTS=25
OPEN_MODEL_AGENT_ENABLED=false
OPEN_MODEL_RUNTIME=
OPEN_MODEL_MODEL=
OPEN_MODEL_ENDPOINT=
OPEN_MODEL_API_STYLE=CHAT_COMPLETIONS
OPEN_MODEL_API_KEY=
OPEN_MODEL_INPUT_USD_PER_MILLION=
OPEN_MODEL_OUTPUT_USD_PER_MILLION=
OPEN_MODEL_INFRASTRUCTURE_USD_PER_REQUEST=
OPEN_MODEL_PRICING_SOURCE=
OPEN_MODEL_PRICING_VERIFIED_AT=
EOF
chown root:uberbond-author /etc/uberbond/founder-console.env; chmod 0640 /etc/uberbond/founder-console.env

systemctl daemon-reload
systemctl enable --now uberbond-authoring.timer uberbond-local-worker.path uberbond-autonomy-verify.path uberbond-local-promote.path uberbond-authoring-after-promotion.path uberbond-founder-console.service

cat <<EOF
UberBond sovereign authoring node installed.
Source commit:      ${SOURCE_HEAD}
Founder console:    http://127.0.0.1:8787/
Founder control:    /opt/uberbond/control/uberbond-authorctl
Author state:       /var/lib/uberbond-control/autonomy
Founder intents:    /var/lib/uberbond-control/founder-intents
Dialogue receipts: /var/lib/uberbond-control/founder-dialogue
Evidence ingress:  /var/lib/uberbond-evidence
Evidence importer: /opt/uberbond/control/import-sovereign-evidence.sh {signer|courier|runtime} RECEIPT
Worker inbox:       /var/lib/uberbond-worker/inbox
Worker outbox:      /var/lib/uberbond-worker/outbox
Governance inbox:   /var/lib/uberbond-governance/inbox
Promotion state:    /var/lib/uberbond-promotion
Native worker:      /opt/uberbond/control/uberbond-native-local-worker
Private console:    /opt/uberbond/control/configure-founder-console-private.sh PRIVATE_RFC1918_IPV4

Default console binding is loopback-only and cloud-independent. To make the
console reachable from an iPad or another founder device on the same trusted
private RFC1918 network, use the installed configurator above. It generates a
strong token transactionally and refuses wildcard/public addresses. The console
never reads the Personal Civilization vault.

A native code-writing worker is installed but intentionally disabled until an
owner-controlled local model runtime is named. Activate both direct dialogue and
the isolated worker with:
  sudo /opt/uberbond/control/configure-local-model.sh RUNTIME MODEL http://127.0.0.1:PORT
The worker keeps PrivateNetwork=true and AF_UNIX-only access. A separate model
proxy may reach host loopback only; it cannot reach public network addresses.
There is no silent cloud fallback.

The evidence importer is root-only. It stages a bounded regular receipt into the
root-owned evidence ingress, validates it against this exact clean source commit,
and only then atomically publishes one fixed signer/courier/runtime evidence name.
It cannot sign, deploy, send, spend, change DNS/credentials, or mint missing proof.

Worker, verifier, promoter, release signer and runtime deployment remain separate
authorities. The promoter has zero network and refuses sovereignty/build/control
surfaces and existing-test rewrites. A successful low-risk local promotion emits
an offline release request and immediately wakes truth-first authoring on the new
exact base. Release signing remains separate and this node refuses to hold its key.
EOF
