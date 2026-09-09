#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOVEREIGN_SELF_HOST_DOCTOR_VERSION = 'uberbond.sovereign-self-host-doctor.v1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZERO = Object.freeze({ customerMessages:0, providerCalls:0, spendCents:0, deployments:0, dnsChanges:0, credentialChanges:0, paymentMutations:0, productionMutations:0 });

const required = Object.freeze([
  'Dockerfile',
  'docker-compose.sovereign.yml',
  'portable-server.mjs',
  'ops/sovereign/uberbondctl',
  'ops/sovereign/install-host.sh',
  'ops/sovereign/uberbond-reconcile.service',
  'ops/sovereign/uberbond-reconcile.timer'
]);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

export function inspectSovereignSelfHost({ repoRoot = root } = {}) {
  const reasons = [];
  const missingFiles = required.filter(rel => !fs.existsSync(path.join(repoRoot, rel)));
  if (missingFiles.length) reasons.push('required-sovereign-host-files-missing');
  if (missingFiles.length) return {
    ok:false, version:SOVEREIGN_SELF_HOST_DOCTOR_VERSION, status:'SOVEREIGN_SELF_HOST_SOURCE_REFUSED',
    reasonCodes:reasons, missingFiles, businessEffectAuthority:'NONE', externalEffectLedger:{...ZERO}
  };

  const compose = fs.readFileSync(path.join(repoRoot, 'docker-compose.sovereign.yml'), 'utf8');
  const ctl = fs.readFileSync(path.join(repoRoot, 'ops/sovereign/uberbondctl'), 'utf8');
  const install = fs.readFileSync(path.join(repoRoot, 'ops/sovereign/install-host.sh'), 'utf8');
  const service = fs.readFileSync(path.join(repoRoot, 'ops/sovereign/uberbond-reconcile.service'), 'utf8');
  const timer = fs.readFileSync(path.join(repoRoot, 'ops/sovereign/uberbond-reconcile.timer'), 'utf8');

  const requiredCompose = [
    'image: ${UBERBOND_RELEASE:', 'container_name: uberbond-postgres', 'container_name: uberbond-web',
    'container_name: uberbond-worker', 'service_healthy', '/api/health', '${HOST_BIND:-127.0.0.1}'
  ];
  for (const marker of requiredCompose) if (!compose.includes(marker)) reasons.push(`compose-marker-missing:${marker}`);
  if (/^\s*build\s*:/m.test(compose)) reasons.push('runtime-compose-must-not-build');
  if (/pull_policy\s*:/m.test(compose)) reasons.push('runtime-compose-must-not-pull');

  const requiredCtl = [
    'docker load -i', 'sha256sum -c SHA256SUMS', 'release signature verification failed',
    'backup_db', 'restore_db', 'restore_drill', 'promotion refused and rollback attempted',
    'reconciler will not download replacements', 'npm run check:syntax', 'npm run test:deterministic',
    'docker build --pull=false', 'flock -n'
  ];
  for (const marker of requiredCtl) if (!ctl.includes(marker)) reasons.push(`control-marker-missing:${marker}`);
  for (const forbidden of ['docker pull', 'git pull', 'vercel ', 'api.vercel.com', 'api.github.com', 'curl ', 'wget ']) {
    if (ctl.toLowerCase().includes(forbidden.toLowerCase())) reasons.push(`runtime-network-dependency-forbidden:${forbidden.trim()}`);
  }

  if (!install.includes('AUTOPILOT_ENABLED=false') || !install.includes('OUTBOUND_ENABLED=false') || !install.includes('HOST_BIND=127.0.0.1')) {
    reasons.push('bootstrap-must-default-to-local-fail-closed-posture');
  }
  if (!service.includes('ExecStart=/opt/uberbond/control/uberbondctl reconcile')) reasons.push('independent-supervisor-entrypoint-required');
  if (!timer.includes('OnUnitActiveSec=60s') || !timer.includes('Persistent=true')) reasons.push('durable-minute-reconciliation-required');

  return {
    ok: reasons.length === 0,
    version:SOVEREIGN_SELF_HOST_DOCTOR_VERSION,
    status: reasons.length ? 'SOVEREIGN_SELF_HOST_SOURCE_REFUSED' : 'SOVEREIGN_SELF_HOST_SOURCE_COMPLETE_RUNTIME_UNPROVEN',
    reasonCodes:[...new Set(reasons)],
    missingFiles,
    properties:{
      runtimeNeedsVercel:false,
      runtimeNeedsGitHub:false,
      runtimeMayDownloadReplacement:false,
      immutableOfflineReleaseBundle:true,
      preMigrationBackup:true,
      automaticFailedPromotionRollback:true,
      restoreDrillImplemented:true,
      recoverySupervisorOutsideAppProcess:true,
      reconciliationIntervalSeconds:60,
      defaultExternalEffects:'DISABLED',
      defaultBind:'127.0.0.1'
    },
    proofBoundary:'SOURCE INSPECTION ONLY. A REAL OWNED/AUTHORIZED HOST MUST STILL EXECUTE PACK, INSTALL, DEPLOY, CRASH/RESTART, RESTORE-DRILL AND ROLLBACK BEFORE RUNTIME SOVEREIGNTY IS CLAIMED.',
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO}
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectSovereignSelfHost();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
