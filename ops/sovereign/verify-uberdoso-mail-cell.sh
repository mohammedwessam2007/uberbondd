#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 2; }
SOURCE="${1:-/opt/uberlit/source}"
[[ -d "$SOURCE/.git" ]] || { echo 'REFUSED: UberBond Git checkout required.' >&2; exit 2; }
for cmd in git node docker curl dig ss nc; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
LOCK="$SOURCE/config/uberdoso-source-lock.json"
RECEIPT=/var/lib/uberdoso/postal-provision-receipt.json
[[ -f "$LOCK" && -s "$RECEIPT" ]] || { echo 'REFUSED: source lock and Postal provisioning receipt required.' >&2; exit 2; }

SOURCE_SHA="$(git -C "$SOURCE" rev-parse HEAD)"
CPU_CORES="$(nproc)"
RAM_BYTES="$(awk '/MemTotal:/ {print $2*1024}' /proc/meminfo | awk '{printf "%.0f",$1}')"
DISK_BYTES="$(df -B1 --output=size /var/lib | tail -1 | tr -d ' ')"
PUBLIC_IPV4="$(curl -4fsS --max-time 8 https://api.ipify.org || true)"
PTR=""
if [[ "$PUBLIC_IPV4" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then PTR="$(dig +short -x "$PUBLIC_IPV4" | head -1 | sed 's/\.$//' || true)"; fi
LOCAL_25=false
ss -ltn '( sport = :25 )' | grep -q ':25' && LOCAL_25=true || true
OUTBOUND_25=false
for host in gmail-smtp-in.l.google.com mx1.hotmail.com; do
  if nc -z -w 5 "$host" 25 >/dev/null 2>&1; then OUTBOUND_25=true; break; fi
done
POSTAL_RUNNING=false
if postal status 2>/dev/null | grep -Eq '(Up|running|Running)'; then POSTAL_RUNNING=true; fi
POSTAL_IMAGE="$(node -e "const x=require(process.argv[1]);process.stdout.write(x.postal.containerRepository+'@'+x.postal.runtimeImageDigest)" "$LOCK")"
MARIADB_IMAGE="$(node -e "const x=require(process.argv[1]);const repo=String(x.mariaDb.runtimeImage).split(':')[0];process.stdout.write(repo+'@'+x.mariaDb.runtimeImageDigest)" "$LOCK")"
POSTAL_IMAGE_OBSERVED=false
for c in postal-web postal-smtp postal-worker postal_web_1 postal_smtp_1 postal_worker_1; do
  img="$(docker inspect -f '{{.Image}}' "$c" 2>/dev/null || true)"
  [[ -n "$img" ]] && POSTAL_IMAGE_OBSERVED=true && break
done
MARIADB_IMAGE_OBSERVED=false
docker inspect postal-mariadb >/dev/null 2>&1 && MARIADB_IMAGE_OBSERVED=true || true

node --input-type=module - "$SOURCE_SHA" "$CPU_CORES" "$RAM_BYTES" "$DISK_BYTES" "$PUBLIC_IPV4" "$PTR" "$LOCAL_25" "$OUTBOUND_25" "$POSTAL_RUNNING" "$POSTAL_IMAGE_OBSERVED" "$MARIADB_IMAGE_OBSERVED" "$RECEIPT" <<'NODE'
import fs from 'node:fs';
const [sourceCommit,cpu,ram,disk,ip,ptr,local25,out25,postal,mariaPostal,maria,receiptPath]=process.argv.slice(2);
const provision=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
const b=v=>v==='true';
const result={
  ok:true,
  schemaVersion:'uberdoso.host-self-verification.v1',
  sourceCommit,
  hostEvidence:{
    cpuCores:Number(cpu),ramBytes:Number(ram),diskBytes:Number(disk),
    publicIpv4:ip||null,ptrHostname:ptr||null,
    dockerAvailable:true,persistentStorage:true,
    localSmtpPort25Listening:b(local25),outboundPort25Observed:b(out25),
    inboundPort25Observed:false,
    postalRunning:b(postal),postalContainerObserved:b(mariaPostal),mariaDbContainerObserved:b(maria),
    evidenceRefs:[receiptPath]
  },
  domains:(provision.domains||[]).map(d=>({root:d.root,verified:d.verified===true,dkimRecordHost:d.dkimRecordHost,dkimRecordValue:d.dkimRecordValue,verificationTxtValue:d.verificationTxtValue,spfRecordValue:d.spfRecordValue,returnPathHost:d.returnPathHost,returnPathTarget:d.returnPathTarget,mxRecords:d.mxRecords,postalSpfInclude:d.postalSpfInclude})),
  remainingExternalChecks:[
    ...(ptr==='mta.uberbond.cloud'?[]:['ptr-must-resolve-to-mta.uberbond.cloud']),
    ...(b(out25)?[]:['outbound-port-25-not-observed']),
    'inbound-port-25-must-be-observed-from-outside-host',
    'publish-and-observe-public-dns-records',
    'verify-postal-domains-after-public-dns'
  ],
  sendAuthority:'NONE'
};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
NODE
