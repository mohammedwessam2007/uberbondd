#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root on a fresh Oracle Always Free Ubuntu ARM64 VM.' >&2; exit 2; }
[[ $# -le 1 ]] || { echo 'usage: bootstrap-oracle-always-free-air-node.sh [UBERBOND_GIT_REF]' >&2; exit 2; }
REF="${1:-main}"
[[ "$REF" =~ ^[A-Za-z0-9._/-]{1,200}$ ]] || { echo 'REFUSED: invalid UberBond Git ref.' >&2; exit 2; }

ARCH="$(uname -m)"
[[ "$ARCH" == 'aarch64' || "$ARCH" == 'arm64' ]] || { echo "REFUSED: this free bootstrap targets Oracle Ampere A1 ARM64; observed $ARCH." >&2; exit 2; }
MEM_KB="$(awk '/^MemTotal:/{print $2}' /proc/meminfo)"
[[ "$MEM_KB" =~ ^[0-9]+$ && "$MEM_KB" -ge 10000000 ]] || { echo 'REFUSED: allocate the Always Free A1 VM with about 12 GB RAM.' >&2; exit 2; }
[[ -r /etc/os-release ]] || { echo 'REFUSED: Linux os-release required.' >&2; exit 2; }
. /etc/os-release
[[ "${ID:-}" == 'ubuntu' ]] || { echo 'REFUSED: this bootstrap currently supports Ubuntu on Oracle A1.' >&2; exit 2; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git xz-utils tar jq util-linux build-essential python3

WORK=/var/lib/uberbond-free-bootstrap
install -d -m 0700 "$WORK"

# Pinned Node.js 24 ARM64. UberBond requires Node >=20.
NODE_VERSION=24.20.0
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-arm64.tar.xz"
NODE_SHA256=5f4ddab610c1ab2016b3c227cebdbf6d9495161487e4739c7b90090595f465f7
curl --fail --location --proto '=https' --tlsv1.2 --output "$WORK/$NODE_ARCHIVE" "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
echo "$NODE_SHA256  $WORK/$NODE_ARCHIVE" | sha256sum -c -
rm -rf "/opt/node-v${NODE_VERSION}-linux-arm64"
tar -xJf "$WORK/$NODE_ARCHIVE" -C /opt
for tool in node npm npx corepack; do ln -sfn "/opt/node-v${NODE_VERSION}-linux-arm64/bin/$tool" "/usr/local/bin/$tool"; done
node --version
npm --version

# Tailscale is transport only. Install from its signed Ubuntu repository, then
# deliberately stop at the founder authorization URL instead of fabricating an
# account/session. Personal tailnets are $0; no Funnel/public exposure is used.
CODENAME="${VERSION_CODENAME:-}"
[[ "$CODENAME" =~ ^[a-z0-9]+$ ]] || { echo 'REFUSED: Ubuntu codename unavailable.' >&2; exit 2; }
install -d -m 0755 /usr/share/keyrings
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://pkgs.tailscale.com/stable/ubuntu/${CODENAME}.noarmor.gpg" -o /usr/share/keyrings/tailscale-archive-keyring.gpg
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://pkgs.tailscale.com/stable/ubuntu/${CODENAME}.tailscale-keyring.list" -o /etc/apt/sources.list.d/tailscale.list
apt-get update
apt-get install -y --no-install-recommends tailscale
systemctl enable --now tailscaled

# Exact public UberBond checkout. The chosen ref is resolved to one immutable SHA
# before installation; the authoring installer later re-verifies clean Git truth.
rm -rf "$WORK/uberbondd"
git -c advice.detachedHead=false clone --filter=blob:none --no-checkout https://github.com/mohammedwessam2007/uberbondd.git "$WORK/uberbondd"
RESOLVED="$(git -C "$WORK/uberbondd" rev-parse --verify "origin/${REF}^{commit}" 2>/dev/null || git -C "$WORK/uberbondd" rev-parse --verify "${REF}^{commit}" 2>/dev/null || true)"
if [[ ! "$RESOLVED" =~ ^[0-9a-f]{40}$ ]]; then
  git -C "$WORK/uberbondd" fetch --depth=1 origin "$REF"
  RESOLVED="$(git -C "$WORK/uberbondd" rev-parse FETCH_HEAD)"
fi
[[ "$RESOLVED" =~ ^[0-9a-f]{40}$ ]] || { echo 'REFUSED: exact UberBond source commit could not be resolved.' >&2; exit 2; }
git -C "$WORK/uberbondd" checkout --detach "$RESOLVED"
[[ -z "$(git -C "$WORK/uberbondd" status --porcelain)" ]] || { echo 'REFUSED: downloaded UberBond checkout is not clean.' >&2; exit 2; }

# Production dependencies are enough to run the sovereign brainstem. Development
# test dependencies remain a separate verification substrate and are not required
# merely to make the founder portal live.
cd "$WORK/uberbondd"
npm ci --omit=dev --ignore-scripts
[[ -d node_modules ]] || { echo 'REFUSED: production dependency preparation failed.' >&2; exit 2; }

# Pinned llama.cpp ARM64 release binary.
LLAMA_TAG=b10516
LLAMA_ARCHIVE="llama-${LLAMA_TAG}-bin-ubuntu-arm64.tar.gz"
LLAMA_SHA256=e7491dca79c9799fc3ae169675a79f5777d3027e31ffb08ae679e5e0a7ae3c97
curl --fail --location --proto '=https' --tlsv1.2 --output "$WORK/$LLAMA_ARCHIVE" "https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/${LLAMA_ARCHIVE}"
echo "$LLAMA_SHA256  $WORK/$LLAMA_ARCHIVE" | sha256sum -c -
rm -rf "$WORK/llama"
install -d -m 0700 "$WORK/llama"
tar -xzf "$WORK/$LLAMA_ARCHIVE" -C "$WORK/llama"
LLAMA_SERVER="$(find "$WORK/llama" -type f -name llama-server -perm -u+x -print -quit)"
[[ -n "$LLAMA_SERVER" && -f "$LLAMA_SERVER" && ! -L "$LLAMA_SERVER" ]] || { echo 'REFUSED: verified llama.cpp archive did not contain llama-server.' >&2; exit 2; }

# Pinned Apache-2.0 Qwen coder model. This is deliberately small enough for the
# Always Free A1 memory budget. It is a bootstrap brain, not a claim of frontier IQ.
MODEL_FILE="$WORK/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
MODEL_SHA256=cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046
MODEL_URL='https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf?download=true'
curl --fail --location --proto '=https' --tlsv1.2 --output "$MODEL_FILE" "$MODEL_URL"
echo "$MODEL_SHA256  $MODEL_FILE" | sha256sum -c -
[[ "$(head -c 4 "$MODEL_FILE")" == 'GGUF' ]] || { echo 'REFUSED: model GGUF magic missing after checksum verification.' >&2; exit 2; }

# Human-account boundary: `tailscale up` prints a one-time authorization URL.
# The script may not accept terms, impersonate the founder, or create an account.
if ! tailscale status --json | node --input-type=module -e "let s='';for await(const c of process.stdin)s+=c;const j=JSON.parse(s);process.exit(j?.BackendState==='Running'?0:2)"; then
  echo
  echo 'ONE OWNER ACTION REQUIRED: authorize this free Air Node in your Tailscale account.'
  echo 'Open the URL printed by the next command on your iPad, approve this machine, then rerun this script.'
  tailscale up || true
  exit 3
fi

"$WORK/uberbondd/ops/sovereign/activate-air-node.sh" \
  "$LLAMA_SERVER" "$MODEL_FILE" 'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M'

cat <<EOF
UBERBOND ZERO-COST AIR BOOTSTRAP COMPLETE
Source commit: $RESOLVED
Host class: Oracle Always Free Ampere A1 ARM64
Local model: Qwen2.5-Coder-1.5B-Instruct Q4_K_M (Apache-2.0)
Model cost: $0
Tunnel plan: Tailscale Personal $0

The Communication Center URL and founder token were printed by the sovereign Air Node activation above.
This bootstrap creates no paid cloud resource and performs no purchase. Oracle account/VM creation itself remains outside this host script and must be Always Free-eligible.
EOF
