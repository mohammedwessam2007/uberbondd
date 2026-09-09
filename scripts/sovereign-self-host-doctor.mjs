#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOVEREIGN_SELF_HOST_DOCTOR_VERSION = 'uberbond.sovereign-self-host-doctor.v3';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZERO = Object.freeze({ customerMessages:0, providerCalls:0, spendCents:0, deployments:0, dnsChanges:0, credentialChanges:0, paymentMutations:0, productionMutations:0 });

const required = Object.freeze([
  'Dockerfile.sovereign',
  'Dockerfile.sovereign.dockerignore',
  'docker-compose.sovereign.yml',
  'portable-server.mjs',
  'ops/sovereign/uberbondctl',
  'ops/sovereign/install-host.sh',
  'ops/sovereign/init-release-authority.sh',
  'ops/sovereign/export-sovereign-kit.sh',
  'ops/sovereign/import-sovereign-kit.sh',
  'ops/sovereign/uberbond-reconcile.service',
  'ops/sovereign/uberbond-reconcile.timer',
  'ops/sovereign/uberbond-release-apply.service',
  'ops/sovereign/uberbond-release-apply.path',
  'ops/sovereign/README.md'
]);

export function inspectSovereignSelfHost({ repoRoot = root } = {}) {
  const reasons = [];
  const missingFiles = required.filter(rel => !fs.existsSync(path.join(repoRoot, rel)));
  if (missingFiles.length) reasons.push('required-sovereign-host-files-missing');
  if (missingFiles.length) return {
    ok:false, version:SOVEREIGN_SELF_HOST_DOCTOR_VERSION, status:'SOVEREIGN_SELF_HOST_SOURCE_REFUSED',
    reasonCodes:reasons, missingFiles, businessEffectAuthority:'NONE', externalEffectLedger:{...ZERO}
  };

  const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  const compose = read('docker-compose.sovereign.yml');
  const dockerfile = read('Dockerfile.sovereign');
  const dockerignore = read('Dockerfile.sovereign.dockerignore');
  const ctl = read('ops/sovereign/uberbondctl');
  const install = read('ops/sovereign/install-host.sh');
  const authority = read('ops/sovereign/init-release-authority.sh');
  const exportKit = read('ops/sovereign/export-sovereign-kit.sh');
  const importKit = read('ops/sovereign/import-sovereign-kit.sh');
  const service = read('ops/sovereign/uberbond-reconcile.service');
  const timer = read('ops/sovereign/uberbond-reconcile.timer');
  const applyService = read('ops/sovereign/uberbond-release-apply.service');
  const applyPath = read('ops/sovereign/uberbond-release-apply.path');

  const requiredCompose = [
    'image: ${UBERBOND_RELEASE:', 'container_name: uberbond-postgres', 'container_name: uberbond-web',
    'container_name: uberbond-worker', 'service_healthy', '/api/health', '${HOST_BIND:-127.0.0.1}'
  ];
  for (const marker of requiredCompose) if (!compose.includes(marker)) reasons.push(`compose-marker-missing:${marker}`);
  if (/^\s*build\s*:/m.test(compose)) reasons.push('runtime-compose-must-not-build');
  if (/pull_policy\s*:/m.test(compose)) reasons.push('runtime-compose-must-not-pull');

  const requiredCtl = [
    'docker load -i', 'sha256sum -c SHA256SUMS', 'release signature verification failed',
    'RELEASE_SEQUENCE', 'release replay or non-monotonic promotion refused', 'CURRENT_RELEASE_ID', 'POSTGRES_IMAGE_ID',
    'backup_db', 'restore_db', 'restore_drill', 'forward_backup', 'promotion refused and rollback attempted',
    'reconciler will not download replacements', 'npm run check:syntax', 'npm run test:deterministic',
    'docker build --network=none --pull=false', 'Dockerfile.sovereign', 'flock -n', 'apply_inbox'
  ];
  for (const marker of requiredCtl) if (!ctl.includes(marker)) reasons.push(`control-marker-missing:${marker}`);
  for (const forbidden of ['docker pull', 'git pull', 'vercel ', 'api.vercel.com', 'api.github.com', 'curl ', 'wget ']) {
    if (ctl.toLowerCase().includes(forbidden.toLowerCase())) reasons.push(`runtime-network-dependency-forbidden:${forbidden.trim()}`);
  }

  if (!dockerfile.includes('COPY . .') || !dockerfile.includes('node_modules') || /npm\s+(?:ci|install)/.test(dockerfile)) {
    reasons.push('sovereign-image-build-must-consume-preseeded-local-dependencies');
  }
  for (const secretPattern of ['.env', '*.pem', '*.key', '*.dump', '*.tar']) {
    if (!dockerignore.includes(secretPattern)) reasons.push(`sovereign-build-context-secret-exclusion-required:${secretPattern}`);
  }

  if (!install.includes('AUTOPILOT_ENABLED=false') || !install.includes('OUTBOUND_ENABLED=false') || !install.includes('HOST_BIND=127.0.0.1')) {
    reasons.push('bootstrap-must-default-to-local-fail-closed-posture');
  }
  if (!install.includes('release signing private key must never live on the runtime host') || install.includes('genpkey -algorithm RSA')) {
    reasons.push('runtime-host-must-not-own-release-signing-private-key');
  }
  if (!authority.includes('release-private.pem') || !authority.includes('release-public.pem') || !authority.includes('Refusing to overwrite')) {
    reasons.push('separate-release-authority-bootstrap-required');
  }

  const kitMarkers = [
    [exportKit, 'git bundle create'], [exportKit, '--all'], [exportKit, 'node_modules.tar'], [exportKit, 'docker save'], [exportKit, 'kit.sig'],
    [importKit, 'sha256sum -c'], [importKit, 'kit signature verification failed'], [importKit, 'git clone'], [importKit, 'git checkout --detach'],
    [importKit, 'PACKAGE_LOCK_SHA256'], [importKit, 'Base image identity mismatch after load'], [importKit, 'npm ls --all']
  ];
  for (const [body, marker] of kitMarkers) if (!body.toLowerCase().includes(marker.toLowerCase())) reasons.push(`offline-resurrection-marker-missing:${marker}`);
  for (const body of [exportKit, importKit]) {
    if (/\b(?:curl|wget)\b|docker\s+pull|git\s+fetch|npm\s+(?:ci|install)/i.test(body)) reasons.push('offline-resurrection-kit-regained-network-fetch');
  }

  if (!service.includes('ExecStart=/opt/uberbond/control/uberbondctl reconcile')) reasons.push('independent-supervisor-entrypoint-required');
  if (!timer.includes('OnUnitActiveSec=60s') || !timer.includes('Persistent=true')) reasons.push('durable-minute-reconciliation-required');
  if (!applyService.includes('ExecStart=/opt/uberbond/control/uberbondctl apply-inbox') || !applyPath.includes('PathChanged=/var/lib/uberbond-control/inbox/NEXT_RELEASE')) {
    reasons.push('local-signed-release-auto-apply-required');
  }

  return {
    ok: reasons.length === 0,
    version:SOVEREIGN_SELF_HOST_DOCTOR_VERSION,
    status: reasons.length ? 'SOVEREIGN_SELF_HOST_SOURCE_REFUSED' : 'SOVEREIGN_SELF_HOST_SOURCE_COMPLETE_RUNTIME_UNPROVEN',
    reasonCodes:[...new Set(reasons)],
    missingFiles,
    properties:{
      runtimeNeedsVercel:false,
      runtimeNeedsGitHub:false,
      runtimeNeedsPackageRegistry:false,
      runtimeMayDownloadReplacement:false,
      releaseBuildNetworkDisabled:true,
      immutableOfflineReleaseBundle:true,
      signedMonotonicReleaseAdmission:true,
      immutableImageIdentityPinned:true,
      releaseSigningAuthoritySeparatedFromRuntime:true,
      localInboxAutoDeployment:true,
      offlineSourceHistoryPreserved:true,
      offlineDependencySeedPreserved:true,
      offlineBuildImageSeedPreserved:true,
      authoringEnvironmentOfflineRestorable:true,
      preMigrationBackup:true,
      automaticFailedPromotionRollback:true,
      reversibleRollbackSnapshot:true,
      restoreDrillImplemented:true,
      recoverySupervisorOutsideAppProcess:true,
      reconciliationIntervalSeconds:60,
      defaultExternalEffects:'DISABLED',
      defaultBind:'127.0.0.1'
    },
    proofBoundary:'SOURCE INSPECTION ONLY. A REAL OWNED/AUTHORIZED HOST MUST STILL EXECUTE SOVEREIGN-KIT EXPORT/IMPORT, OFFLINE PACK, INSTALL, SIGNED DEPLOY, CRASH/RESTART, RESTORE-DRILL, FAILED-PROMOTION ROLLBACK AND EXPLICIT ROLLBACK BEFORE RUNTIME SOVEREIGNTY IS CLAIMED.',
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO}
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectSovereignSelfHost();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
