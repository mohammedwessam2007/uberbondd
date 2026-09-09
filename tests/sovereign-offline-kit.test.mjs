import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const parse=rel=>spawnSync('bash',['-n',path.join(root,rel)],{encoding:'utf8'});

test('sovereign kit scripts parse and contain no network-fetch primitive',()=>{
  for(const rel of ['ops/sovereign/export-sovereign-kit.sh','ops/sovereign/import-sovereign-kit.sh']){
    const result=parse(rel);assert.equal(result.status,0,result.stderr);
    const source=read(rel);
    assert.doesNotMatch(source,/\b(?:curl|wget)\b|docker\s+pull|git\s+fetch|npm\s+(?:ci|install)/i);
  }
});

test('export kit preserves complete source history dependency bytes and build images under signature',()=>{
  const source=read('ops/sovereign/export-sovereign-kit.sh');
  assert.match(source,/git bundle create .* --all/);
  assert.match(source,/git bundle verify/);
  assert.match(source,/npm ls --all/);
  assert.match(source,/tar -cf .*node_modules\.tar.*node_modules/);
  assert.match(source,/docker save -o .*build-images\.oci\.tar/);
  assert.match(source,/PACKAGE_LOCK_SHA256/);
  assert.match(source,/openssl dgst -sha256 -sign/);
});

test('import kit authenticates before loading or extracting and restores exact source identity',()=>{
  const source=read('ops/sovereign/import-sovereign-kit.sh');
  const checksum=source.indexOf('sha256sum -c SHA256SUMS');
  const signature=source.indexOf('openssl dgst -sha256 -verify');
  const load=source.indexOf('docker load -i');
  const clone=source.indexOf('git clone');
  const extract=source.indexOf('tar -xf');
  assert.ok(checksum>=0&&signature>checksum&&load>signature&&clone>signature&&extract>clone,'kit bytes must authenticate before use');
  assert.match(source,/git checkout --detach "\$SOURCE"/);
  assert.match(source,/git rev-parse HEAD/);
  assert.match(source,/PACKAGE_LOCK_SHA256/);
  assert.match(source,/npm ls --all/);
});

test('import refuses architecture drift image substitution and archive path traversal',()=>{
  const source=read('ops/sovereign/import-sovereign-kit.sh');
  assert.match(source,/does not match this host/);
  assert.match(source,/Base image identity mismatch after load/);
  assert.match(source,/Postgres image identity mismatch after load/);
  assert.match(source,/Unsafe dependency archive member/);
  assert.match(source,/Dependency archive traversal refused/);
});
