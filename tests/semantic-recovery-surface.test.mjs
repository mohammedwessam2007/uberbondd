import test from 'node:test';
import assert from 'node:assert/strict';
import { hasConcreteRecoverySurface, detectConcreteRecoverySurfaces } from '../src/semantic-recovery-surface.mjs';

test('semantic vocabulary alone cannot manufacture durable recovery ownership', () => {
  for (const source of [
    'const persistsAcrossContexts = true; export const ledger = [];',
    "return fail(['queue-worker-checkpoint-required']);",
    "function assessMemorySovereignty(){ return { state: 'SAFE' }; }",
    "const recoveryPolicy = 'documented in canon';"
  ]) assert.equal(hasConcreteRecoverySurface(source), false, source);
});

test('real filesystem mutation is stateful', () => {
  assert.equal(hasConcreteRecoverySurface("await writeFile(path, body, 'utf8');"), true);
  assert.equal(hasConcreteRecoverySurface('renameSync(tmp, target);'), true);
});

test('real server, scheduler and worker processes are long-running recovery surfaces', () => {
  assert.equal(hasConcreteRecoverySurface('const s=createServer(handler); s.listen(8787);'), true);
  assert.equal(hasConcreteRecoverySurface('setInterval(tick, 60000);'), true);
  assert.equal(hasConcreteRecoverySurface('spawn(workerExecutable, args);'), true);
});

test('database use remains stateful', () => {
  assert.equal(hasConcreteRecoverySurface('const pool = new Pool({ connectionString });'), true);
  assert.equal(hasConcreteRecoverySurface("await sql('INSERT INTO jobs(id) VALUES($1)');"), true);
});

test('surface detector is deterministic and bounded to concrete families', () => {
  const out = detectConcreteRecoverySurfaces('writeFileSync(a,b); setInterval(tick, 10);');
  assert.deepEqual(out, ['surface-1', 'surface-3']);
});
