import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../lite/scripts/build-visual-cortex.mjs',import.meta.url),'utf8');

test('lite visual-cortex hydrates pinned embedded Postgres before rebuild and prepare',()=>{
  const hydrate=source.indexOf("scripts/hydrate-embedded-postgres-fixture.mjs");
  const rebuild=source.indexOf("rebuild', '@embedded-postgres/linux-x64");
  const prepare=source.indexOf("scripts/prepare-embedded-postgres-fixture.mjs");
  assert.ok(hydrate>=0,'hydration step is present');
  assert.ok(rebuild>hydrate,'rebuild follows hydration');
  assert.ok(prepare>rebuild,'prepare/probe follows rebuild');
});
