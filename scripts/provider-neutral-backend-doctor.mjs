import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const requiredFiles = ['Dockerfile', 'server.mjs', 'worker.mjs', 'scripts/migrate.mjs', 'docker-compose.yml'];
const requiredComposeMarkers = ['postgres:', 'migrate:', 'web:', 'worker:', 'service_completed_successfully', '/api/health'];

export function inspectPortableBackend({ repoRoot = root, env = process.env } = {}) {
  const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(repoRoot, file)));
  const compose = fs.existsSync(path.join(repoRoot, 'docker-compose.yml'))
    ? fs.readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf8') : '';
  const missingComposeMarkers = requiredComposeMarkers.filter(marker => !compose.includes(marker));
  const requiredEnv = ['POSTGRES_PASSWORD', 'APP_BASE_URL', 'ADMIN_TOKEN', 'TOKEN_ENCRYPTION_KEY'];
  const missingEnv = requiredEnv.filter(name => !String(env[name] || '').trim());
  const reasons = [];
  if (missingFiles.length) reasons.push('required-runtime-file-missing');
  if (missingComposeMarkers.length) reasons.push('compose-contract-incomplete');
  if (missingEnv.length) reasons.push('deployment-environment-incomplete');
  if (String(env.APP_BASE_URL || '').trim() && !String(env.APP_BASE_URL).startsWith('https://')) reasons.push('APP_BASE_URL-must-use-https');
  return {
    schema: 'uberbond.provider-neutral-backend-doctor.v1',
    status: reasons.length ? 'REFUSED' : 'READY_FOR_HOST_REHEARSAL',
    reasons,
    missingFiles,
    missingComposeMarkers,
    missingEnv,
    runtimeProof: 'NONE',
    businessEffectAuthority: 'NONE',
    note: 'Static packaging/preflight evidence does not prove host startup, provider validity, customer demand, payment, or unattended operation.'
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = inspectPortableBackend();
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'REFUSED') process.exitCode = 1;
}
