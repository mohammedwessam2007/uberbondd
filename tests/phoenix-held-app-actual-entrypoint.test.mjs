import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { once } from 'node:events';
import { verifiedHeldPgOptions } from '../src/phoenix-held-restore-probe.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const monitor = `import net from 'node:net';
const originalConnect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){process.stderr.write('PHOENIX_UNEXPECTED_NETWORK_SOCKET\\n');throw new Error('unexpected-network-socket')};
globalThis.fetch=async()=>{process.stderr.write('PHOENIX_UNEXPECTED_FETCH\\n');throw new Error('unexpected-fetch')};`;

function spawnActualHeldEntrypoint(overrides = {}) {
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin', HOME: process.env.HOME || '/tmp',
    NODE_ENV:'production',PROCESS_ROLE:'web',STORE_BACKEND:'postgres',
    DATABASE_SSL:'true',
    DATABASE_URL:'postgresql://held:dummy@127.0.0.1:59999/forbidden',
    PORT:'28994',APP_BASE_URL:'https://held-restoration.local',
    ADMIN_TOKEN:'h'.repeat(48),TOKEN_ENCRYPTION_KEY:'a'.repeat(64),
    OUTBOUND_ENABLED:'false',OUTBOUND_DRY_RUN:'true',OUTBOUND_EMERGENCY_STOP:'true',
    AUTOPILOT_ENABLED:'false',PUBLIC_AUDIT_ENABLED:'false',
    PHOENIX_HELD_RESTORE_PROBE:'1',
    ...overrides
  };
  return spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(monitor),'server.mjs'],
    {cwd:root,env,encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
}

test('actual server.mjs entrypoint refuses wrong recovered database BEFORE network, migration or worker boot', () => {
  const run=spawnActualHeldEntrypoint();
  assert.equal(run.error,undefined,run.error?.message);
  assert.notEqual(run.status,0,'invalid held-target process must fail');
  assert.match(run.stderr,/PHOENIX_HELD_RESTORE_REFUSED:ISOLATED_DATABASE_IDENTITY/);
  assert.doesNotMatch(run.stderr,/PHOENIX_UNEXPECTED_FETCH|PHOENIX_UNEXPECTED_NETWORK_SOCKET/);
  assert.doesNotMatch(run.stdout,/UBERMIND_JEV_PRICE_SOURCE_DIAGNOSTIC|UBERMIND_SOURCE_WORK|PHOENIX_RUNTIME_DOCTOR|Revenue Engine running/);
});

test('actual held app entrypoint rejects disabled TLS without even attempting a PostgreSQL socket', () => {
  const run=spawnActualHeldEntrypoint({
    DATABASE_URL:'postgresql://held:dummy@ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech:5432/uberbond_phoenix_rehearsal_20261014_v2',
    DATABASE_SSL:'false'
  });
  assert.equal(run.error,undefined,run.error?.message);
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/PHOENIX_HELD_RESTORE_REFUSED:TLS_VERIFY_FULL_REQUIRED/);
  assert.doesNotMatch(run.stderr,/PHOENIX_UNEXPECTED_FETCH|PHOENIX_UNEXPECTED_NETWORK_SOCKET/);
});

test('real TLS stack refuses a self-signed endpoint with the protected verifier TLS options', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-held-tls-'));
  try {
    const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,
      '-days','1','-subj','/CN=ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech'],{stdio:'ignore',timeout:15000});
    const server=tls.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
    try {
      const options=verifiedHeldPgOptions('postgresql://held:dummy@ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech/uberbond_phoenix_rehearsal_20261014_v2');
      assert.equal(options.ssl.rejectUnauthorized,true);
      const failure=await new Promise(resolve=>{
        const socket=tls.connect({host:'127.0.0.1',port:server.address().port,...options.ssl});
        socket.once('error',error=>resolve(error));
        socket.once('secureConnect',()=>{socket.destroy();resolve(null)});
        socket.setTimeout(5000,()=>{socket.destroy();resolve(new Error('TLS_TIMEOUT'))});
      });
      assert.ok(failure,'untrusted TLS certificate must never connect');
      assert.match(String(failure.code||failure.message),/SELF_SIGNED|UNABLE_TO_VERIFY|CERT_/);
    } finally {await new Promise(resolve=>server.close(resolve))}
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
