import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('UberLit service is non-root, restartable, and filesystem-bounded',()=>{
  const unit=read('ops/sovereign/uberlit.service');
  assert.match(unit,/User=uberlit/);assert.match(unit,/Group=uberlit/);
  assert.match(unit,/Restart=on-failure/);assert.match(unit,/NoNewPrivileges=true/);
  assert.match(unit,/ProtectSystem=strict/);assert.match(unit,/ProtectHome=true/);
  assert.match(unit,/ReadOnlyPaths=\/opt\/uberlit\/source/);
  assert.match(unit,/ReadWritePaths=\/var\/lib\/uberlit/);
  assert.match(unit,/uberlit-supervisor\.mjs --keep-running/);
});

test('installer copies exact local Git source and does not require a cloud provider',()=>{
  const script=read('ops/sovereign/install-uberlit.sh');
  assert.match(script,/git clone --quiet --no-hardlinks --no-checkout/);
  assert.match(script,/SOURCE_SHA=.*rev-parse HEAD/);assert.match(script,/SOURCE_TREE=.*HEAD\^\{tree\}/);
  assert.match(script,/remote remove origin/);assert.match(script,/tracked tree must be clean/);
  assert.doesNotMatch(script,/vercel|replit|macaly|railway|render|fly\.io/i);
  assert.match(script,/\[\[ "\$\{2:-\}" == "--start" \]\]/);
});

test('production supervisor owns local Postgres without leaking its credential',()=>{
  const supervisor=read('scripts/uberlit-supervisor.mjs');
  assert.match(supervisor,/persistent:true/);
  assert.match(supervisor,/path\.join\(runtimeRoot,'secrets'\)/);
  assert.match(supervisor,/path\.join\(secretDir,'postgres\.json'\)/);
  assert.match(supervisor,/mode:0o600/);assert.match(supervisor,/DATABASE_URL:databaseUrl/);
  assert.doesNotMatch(supervisor,/console\.log\(.*password|process\.stdout.*password/);
  assert.match(supervisor,/OUTBOUND_ENABLED:process\.env\.OUTBOUND_ENABLED\|\|'false'/);
  assert.match(supervisor,/DISCOVERY_ENABLED:process\.env\.DISCOVERY_ENABLED\|\|'false'/);
});

test('UberBond build seals dependencies instead of trusting symlink targets',()=>{
  const build=read('scripts/uberlit-build-uberbond.mjs');
  assert.match(build,/--bin-links=false/);assert.match(build,/--include=dev/);
  assert.match(build,/uberlit-build-symlink-escape-refused/);
  assert.match(build,/flattenSymlinks/);
});
