import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('Railway UberWarm image copies every direct monitor and doctor local module import',()=>{
  const docker = read('../Dockerfile.uberwarm-read-monitor');
  const sources = [
    ['../scripts/uberwarm2-live-read-doctor.mjs', '../src/uberwarm2-winnr-token-permissions.mjs'],
    ['../scripts/uberwarm2-railway-read-monitor.mjs', '../src/uberwarm2-operational-journal.mjs']
  ];
  for (const [script, module] of sources){
    const name = module.split('/').at(-1);
    assert.ok(read(script).includes(name), `expected ${script} to import ${name}`);
    assert.ok(docker.includes(`COPY src/${name} ./src/`), `Docker image missing ${name}`);
  }
  assert.match(docker, /RUN test -f src\/uberwarm2-winnr-token-permissions\.mjs/);
});
