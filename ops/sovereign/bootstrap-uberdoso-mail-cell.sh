#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 2; }
[[ $# -ge 1 && $# -le 2 ]] || {
  echo 'usage: bootstrap-uberdoso-mail-cell.sh /path/to/clean/uberbond-checkout [--skip-package-install]' >&2
  exit 2
}

SOURCE_INPUT="$1"
SKIP_PACKAGES=false
[[ "${2:-}" == "--skip-package-install" ]] && SKIP_PACKAGES=true
[[ -d "$SOURCE_INPUT/.git" && ! -L "$SOURCE_INPUT" ]] || { echo 'REFUSED: source must be a real Git checkout.' >&2; exit 2; }
SOURCE="$(realpath "$SOURCE_INPUT")"
[[ -z "$(git -C "$SOURCE" status --porcelain --untracked-files=no)" ]] || { echo 'REFUSED: tracked source tree must be clean.' >&2; exit 2; }
SOURCE_SHA="$(git -C "$SOURCE" rev-parse HEAD)"
LOCK="$SOURCE/config/uberdoso-source-lock.json"
PROVISIONER="$SOURCE/scripts/uberdoso-postal-provision.rb"
[[ -f "$LOCK" && -f "$PROVISIONER" ]] || { echo 'REFUSED: UberDoso source lock/provisioner missing.' >&2; exit 2; }

UBERDOSO_ADMIN_EMAIL="${UBERDOSO_ADMIN_EMAIL:-}"
UBERDOSO_ADMIN_FIRST_NAME="${UBERDOSO_ADMIN_FIRST_NAME:-Mohamed}"
UBERDOSO_ADMIN_LAST_NAME="${UBERDOSO_ADMIN_LAST_NAME:-Wessam}"
[[ "$UBERDOSO_ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || { echo 'REFUSED: set UBERDOSO_ADMIN_EMAIL to the founder-controlled admin email.' >&2; exit 2; }
# Optional outreach-fleet sender domains (comma-separated, e.g. uberbondhq.site,uberbondlabs.site).
# The two outreach roots are always provisioned; these add more of the verified fleet to spread reputation.
UBERDOSO_POSTAL_SENDER_DOMAINS="${UBERDOSO_POSTAL_SENDER_DOMAINS:-}"
[[ -z "$UBERDOSO_POSTAL_SENDER_DOMAINS" || "$UBERDOSO_POSTAL_SENDER_DOMAINS" =~ ^[a-z0-9.-]+(,[a-z0-9.-]+)*$ ]] || { echo 'REFUSED: UBERDOSO_POSTAL_SENDER_DOMAINS must be a comma-separated list of lowercase domain names.' >&2; exit 2; }

if ! $SKIP_PACKAGES; then
  command -v apt-get >/dev/null 2>&1 || { echo 'REFUSED: automatic package installation supports Ubuntu/Debian only.' >&2; exit 2; }
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y git curl jq openssl ca-certificates docker.io docker-compose-v2 dnsutils netcat-openbsd nodejs
  systemctl enable --now docker
fi
for cmd in git curl jq openssl docker node; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
docker compose version >/dev/null 2>&1 || { echo 'Missing Docker Compose v2.' >&2; exit 2; }

ARCH="$(uname -m)"
[[ "$ARCH" == 'x86_64' || "$ARCH" == 'amd64' ]] || { echo "REFUSED: current source lock is pinned for linux/amd64, observed $ARCH." >&2; exit 2; }

POSTAL_VERSION="$(node -e "const x=require(process.argv[1]);process.stdout.write(String(x.postal.version))" "$LOCK")"
POSTAL_REPO="$(node -e "const x=require(process.argv[1]);process.stdout.write(String(x.postal.containerRepository))" "$LOCK")"
POSTAL_DIGEST="$(node -e "const x=require(process.argv[1]);process.stdout.write(String(x.postal.runtimeImageDigest))" "$LOCK")"
POSTAL_HELPER_COMMIT="$(node -e "const x=require(process.argv[1]);process.stdout.write(String(x.postalInstallHelper.gitCommit))" "$LOCK")"
MARIADB_IMAGE="$(node -e "const x=require(process.argv[1]);process.stdout.write(String(x.mariaDb.runtimeImage))" "$LOCK")"
MARIADB_DIGEST="$(node -e "const x=require(process.argv[1]);process.stdout.write(String(x.mariaDb.runtimeImageDigest))" "$LOCK")"
[[ "$POSTAL_VERSION" == '3.3.7' ]] || { echo 'REFUSED: unexpected Postal version.' >&2; exit 2; }
[[ "$POSTAL_DIGEST" =~ ^sha256:[0-9a-f]{64}$ && "$MARIADB_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo 'REFUSED: immutable runtime digests are missing.' >&2; exit 2; }
POSTAL_IMAGE="${POSTAL_REPO}@${POSTAL_DIGEST}"
MARIADB_REPO="${MARIADB_IMAGE%%:*}"
MARIADB_PIN="${MARIADB_REPO}@${MARIADB_DIGEST}"

install -d -m 0700 /etc/uberdoso /var/lib/uberdoso /opt/postal
DB_PASSWORD_FILE=/etc/uberdoso/mariadb-root-password
if [[ ! -s "$DB_PASSWORD_FILE" ]]; then
  openssl rand -hex 32 > "$DB_PASSWORD_FILE"
  chmod 0600 "$DB_PASSWORD_FILE"
fi
DB_PASSWORD="$(cat "$DB_PASSWORD_FILE")"

if ! docker inspect postal-mariadb >/dev/null 2>&1; then
  docker pull "$MARIADB_PIN"
  docker run -d \
    --name postal-mariadb \
    -p 127.0.0.1:3306:3306 \
    --restart always \
    -e MARIADB_DATABASE=postal \
    -e MARIADB_ROOT_PASSWORD="$DB_PASSWORD" \
    "$MARIADB_PIN"
fi

for _ in $(seq 1 60); do
  if docker exec postal-mariadb mariadb-admin ping -uroot -p"$DB_PASSWORD" --silent >/dev/null 2>&1; then break; fi
  sleep 2
done
docker exec postal-mariadb mariadb-admin ping -uroot -p"$DB_PASSWORD" --silent >/dev/null 2>&1 || { echo 'MariaDB did not become ready.' >&2; exit 3; }

if [[ ! -d /opt/postal/install/.git ]]; then
  git clone https://github.com/postalserver/install /opt/postal/install
fi
git -C /opt/postal/install fetch --tags origin
git -C /opt/postal/install checkout --detach "$POSTAL_HELPER_COMMIT"
[[ "$(git -C /opt/postal/install rev-parse HEAD)" == "$POSTAL_HELPER_COMMIT" ]] || { echo 'Postal helper commit mismatch.' >&2; exit 3; }
ln -sfn /opt/postal/install/bin/postal /usr/local/bin/postal

postal bootstrap --version "$POSTAL_VERSION" mta.uberbond.cloud
postal set-version "$POSTAL_VERSION"

node --input-type=module - /opt/postal/config/postal.yml "$DB_PASSWORD" <<'NODE'
import fs from 'node:fs';
const [path,password]=process.argv.slice(2);
let s=fs.readFileSync(path,'utf8');
s=s.replace(/password:\s*postal/g, `password: ${password}`)
 .replace(/mx\.postal\.yourdomain\.com/g, 'mta.uberbond.cloud')
 .replace(/spf\.postal\.yourdomain\.com/g, 'spf.uberbond.cloud')
 .replace(/rp\.postal\.yourdomain\.com/g, 'rp.uberbond.cloud')
 .replace(/routes\.postal\.yourdomain\.com/g, 'routes.uberbond.cloud')
 .replace(/track\.postal\.yourdomain\.com/g, 'link.uberbond.cloud')
 .replace(/postal@yourdomain\.com/g, 'postal@uberbond.cloud');
fs.writeFileSync(path,s,{mode:0o600});
NODE

COMPOSE=/opt/postal/install/docker-compose.yml
POSTAL_IMAGE="$POSTAL_IMAGE" node --input-type=module - "$COMPOSE" <<'NODE'
import fs from 'node:fs';
const path=process.argv[2];
const image=process.env.POSTAL_IMAGE;
let s=fs.readFileSync(path,'utf8');
s=s.replace(/^\s*image:\s*ghcr\.io\/postalserver\/postal:[^\s]+\s*$/gm, line => `${line.match(/^\s*/)[0]}image: ${image}`);
if(!s.includes(image)) throw new Error('failed-to-pin-postal-compose-image');
fs.writeFileSync(path,s);
NODE

docker pull "$POSTAL_IMAGE"
postal initialize
postal start
postal status

ADMIN_SECRET_FILE=/var/lib/uberdoso/postal-admin-bootstrap.txt
if [[ ! -s "$ADMIN_SECRET_FILE" ]]; then
  ADMIN_PASSWORD="$(openssl rand -base64 36 | tr -d '\n' | tr '/+' '_-')"
  {
    printf '%s\n' "$UBERDOSO_ADMIN_EMAIL"
    printf '%s\n' "$UBERDOSO_ADMIN_FIRST_NAME"
    printf '%s\n' "$UBERDOSO_ADMIN_LAST_NAME"
    printf '%s\n' "$ADMIN_PASSWORD"
  } | postal make-user
  {
    printf 'email=%s\n' "$UBERDOSO_ADMIN_EMAIL"
    printf 'password=%s\n' "$ADMIN_PASSWORD"
    printf 'delete_after_first_login=true\n'
  } > "$ADMIN_SECRET_FILE"
  chmod 0600 "$ADMIN_SECRET_FILE"
fi

install -m 0600 "$PROVISIONER" /opt/postal/config/uberdoso-postal-provision.rb
RECEIPT=/var/lib/uberdoso/postal-provision-receipt.json
UBERDOSO_POSTAL_OWNER_EMAIL="$UBERDOSO_ADMIN_EMAIL" postal dc run --rm \
  -e UBERDOSO_POSTAL_OWNER_EMAIL="$UBERDOSO_ADMIN_EMAIL" \
  -e UBERDOSO_POSTAL_SENDER_DOMAINS="$UBERDOSO_POSTAL_SENDER_DOMAINS" \
  runner bundle exec rails runner /config/uberdoso-postal-provision.rb > "$RECEIPT"
chmod 0600 "$RECEIPT"

node --input-type=module - "$RECEIPT" "$SOURCE_SHA" "$UBERDOSO_POSTAL_SENDER_DOMAINS" <<'NODE'
import fs from 'node:fs';
const [path,sourceCommit,senderList]=process.argv.slice(2);
const x=JSON.parse(fs.readFileSync(path,'utf8'));
const expected=2+String(senderList||'').split(',').map(s=>s.trim()).filter(Boolean).length;
if(x.ok!==true||x.status!=='UBERDOSO_POSTAL_PROVISIONED_UNVERIFIED'||!Array.isArray(x.domains)||x.domains.length!==expected) process.exit(2);
process.stdout.write(JSON.stringify({
  ok:true,
  status:'UBERDOSO_MAIL_CELL_SOFTWARE_BOOTSTRAPPED',
  sourceCommit,
  postalStatus:x.status,
  roots:x.domains.map(d=>({root:d.root,role:d.role,verified:d.verified,dkimRecordHost:d.dkimRecordHost,dkimRecordValue:d.dkimRecordValue,spfRecordValue:d.spfRecordValue,returnPathHost:d.returnPathHost,returnPathTarget:d.returnPathTarget,mxRecords:d.mxRecords,postalSpfInclude:d.postalSpfInclude,verificationTxtValue:d.verificationTxtValue})),
  adminCredentialFile:'/var/lib/uberdoso/postal-admin-bootstrap.txt',
  provisionReceipt:path,
  externalEffectAuthority:'LOCAL_HOST_ONLY',
  sendAuthority:'NONE_UNTIL_PUBLIC_DNS_PTR_PORT25_AND_UBERBOND_GATES_PASS'
},null,2)+'\n');
NODE
