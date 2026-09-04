import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mandatory startup memory reaches the cloud fabric and September 5 closure checkpoint', async () => {
  const [bootstrap, orchestration, cloud, checkpoint] = await Promise.all([
    read('UBERBOND_BOOTSTRAP.json'),
    read('docs/UBERBOND_TOTAL_BRAIN_ORCHESTRATION_ADDENDUM.md'),
    read('docs/UBERBOND_TOTAL_BRAIN_CLOUD_FABRIC_ADDENDUM.md'),
    read('docs/memory/UBERBOND_CLOSURE_CHECKPOINT_2026-09-05.md')
  ]);
  assert.match(bootstrap, /docs\/UBERBOND_TOTAL_BRAIN_ORCHESTRATION_ADDENDUM\.md/);
  assert.match(orchestration, /docs\/UBERBOND_TOTAL_BRAIN_CLOUD_FABRIC_ADDENDUM\.md/);
  assert.match(orchestration, /docs\/memory\/UBERBOND_CLOSURE_CHECKPOINT_2026-09-05\.md/);
  assert.match(cloud, /CLOUD_WAKE_PLAN_COMPILED_NOT_PUBLISHED/);
  assert.match(cloud, /cache hit is claimed only from observed provider usage fields/i);
  assert.match(cloud, /not a claim that Safari, the OS, network infrastructure/i);
  assert.match(checkpoint, /95%\+ claimed -> chat\/session crashes/);
  assert.match(checkpoint, /new optional frontier capabilities may grow in parallel/i);
});

test('cloud fabric memory preserves authority and commercial-proof boundaries', async () => {
  const cloud = await read('docs/UBERBOND_TOTAL_BRAIN_CLOUD_FABRIC_ADDENDUM.md');
  assert.match(cloud, /Capability never creates authority/);
  assert.match(cloud, /cloud publish authority `NONE`/i);
  assert.match(cloud, /A compiled plan is not a live cloud worker receipt/);
  assert.match(cloud, /cost savings are claimed only when both cache-read usage and verified cache-read pricing exist/i);
  assert.match(cloud, /Public capability tokens.*separate evidence class/i);
});
