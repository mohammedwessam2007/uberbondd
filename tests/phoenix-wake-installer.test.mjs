import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const installer='scripts/codespace/install-existing-recovery.sh';
function fixture(source='exec /opt/cos-runtime/chat-on-steroids --no-sandbox\n') {
 const home=mkdtempSync(join(tmpdir(),'wake-install-'));
 const donor=join(home,'donor');writeFileSync(donor,source);
 mkdirSync(join(home,'.fluxbox'));
 writeFileSync(join(home,'.bashrc'),'case $- in *i*) '+donor+' ;; esac\n');
 writeFileSync(join(home,'.fluxbox/startup'),'#!/bin/sh\nexec fluxbox\n');
 return {home,donor,run:()=>spawnSync('bash',[installer,donor],{env:{...process.env,HOME:home},encoding:'utf8'})};
}
test('installer clears inherited Electron Node mode and preserves donor',()=>{
 const x=fixture();const original=readFileSync(x.donor,'utf8');assert.equal(x.run().status,0);
 const target=join(x.home,'.local/bin/phoenix-recover-existing');
 assert.match(readFileSync(target,'utf8'),/exec env -u ELECTRON_RUN_AS_NODE/);
 assert.equal(statSync(target).mode & 0o777,0o700);
 assert.equal(readFileSync(x.donor,'utf8'),original);
 assert.match(readFileSync(join(x.home,'.bashrc'),'utf8'),/\.local\/bin\/phoenix-recover-existing/);
 assert.match(readFileSync(join(x.home,'.fluxbox/startup'),'utf8'),/phoenix-recover-existing &/);
});
test('repeated installer preserves original backups and creates no duplicate hook',()=>{
 const x=fixture();assert.equal(x.run().status,0);const p=join(x.home,'.fluxbox/startup');
 const before=readFileSync(p,'utf8'),backup=readFileSync(p+'.before-wake-20261024','utf8');
 assert.equal(x.run().status,0);assert.equal(readFileSync(p,'utf8'),before);assert.equal(readFileSync(p+'.before-wake-20261024','utf8'),backup);
});
test('changed donor refuses instead of guessing at startup configuration',()=>{
 const x=fixture('echo different donor\n');const r=x.run();assert.notEqual(r.status,0);assert.match(r.stderr,/BLOCKED/);
});
