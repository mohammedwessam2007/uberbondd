import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  APPROVED_EMBEDDED_POSTGRES_VERSION,
  approvedEmbeddedPostgresBuildScripts,
  resolveEmbeddedPostgresPlatform
} from '../src/embedded-postgres-platform.mjs';
import { prepareEmbeddedPostgresFixture } from '../scripts/prepare-embedded-postgres-fixture.mjs';

test('reviewed embedded Postgres platforms are exactly Linux x64 and Linux ARM64 at one pinned version',()=>{
  assert.equal(APPROVED_EMBEDDED_POSTGRES_VERSION,'18.4.0-beta.17');
  assert.equal(resolveEmbeddedPostgresPlatform({platform:'linux',arch:'x64',cwd:'/tmp'}).packageName,'@embedded-postgres/linux-x64');
  assert.equal(resolveEmbeddedPostgresPlatform({platform:'linux',arch:'arm64',cwd:'/tmp'}).packageName,'@embedded-postgres/linux-arm64');
  assert.equal(resolveEmbeddedPostgresPlatform({platform:'darwin',arch:'arm64',cwd:'/tmp'}).supported,false);
  assert.equal(resolveEmbeddedPostgresPlatform({platform:'linux',arch:'ppc64',cwd:'/tmp'}).supported,false);
  assert.deepEqual(approvedEmbeddedPostgresBuildScripts(),{
    '@embedded-postgres/linux-x64@18.4.0-beta.17':true,
    '@embedded-postgres/linux-arm64@18.4.0-beta.17':true
  });
});

test('ARM64 fixture path uses the same fail-closed executable preparation contract',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'uberbond-pg-arm64-fixture-'));
  const packageRoot=path.join(root,'linux-arm64');
  const binDir=path.join(packageRoot,'native','bin');
  fs.mkdirSync(binDir,{recursive:true});
  fs.writeFileSync(path.join(packageRoot,'package.json'),JSON.stringify({version:'18.4.0-beta.17'}));
  for(const executable of ['initdb','pg_ctl','postgres']){
    const file=path.join(binDir,executable);
    fs.writeFileSync(file,'#!/bin/sh\nprintf "fake-postgres-version\\n"\n');
    fs.chmodSync(file,0o755);
  }
  try{
    const result=await prepareEmbeddedPostgresFixture({
      packageRoot,
      platform:'linux',
      arch:'arm64',
      probeIdentity:null
    });
    assert.equal(result.status,'READY');
    assert.equal(result.package,'@embedded-postgres/linux-arm64');
    assert.equal(result.arch,'arm64');
    assert.equal(result.executionProbe,'PASSED');
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});


test('lockfile and UberLit supervisor remain architecture-aware',()=>{
  const lock=JSON.parse(fs.readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
  const arm=lock.packages['node_modules/@embedded-postgres/linux-arm64'];
  const x64=lock.packages['node_modules/@embedded-postgres/linux-x64'];
  assert.equal(arm?.version,'18.4.0-beta.17');
  assert.deepEqual(arm?.cpu,['arm64']);
  assert.deepEqual(arm?.os,['linux']);
  assert.equal(x64?.version,'18.4.0-beta.17');
  const supervisor=fs.readFileSync(new URL('../scripts/uberlit-supervisor.mjs',import.meta.url),'utf8');
  assert.match(supervisor,/resolveEmbeddedPostgresPlatform/);
  assert.doesNotMatch(supervisor,/node_modules','@embedded-postgres','linux-x64'/);
  assert.match(supervisor,/embeddedPostgresPackage:postgresPlatform\.packageName/);
});
