#!/usr/bin/env node
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildUberLitRelease, compileUberLitRelease, promoteUberLitRelease, stageUberLitRelease } from '../src/uberlit-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/tmp/uberlit-uberbond');
const port=Number(arg('port')||process.env.PORT||32123);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim().toLowerCase();
const dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim();
if(dirty)throw new Error('uberlit-uberbond-source-must-be-clean');
const manifest=compileUberLitRelease({
  sourceCommit,
  buildArgv:['npm','ci','--bin-links=false'],
  startArgv:['node','server.mjs'],
  healthPath:'/api/health',
  envAllowlist:['ADMIN_TOKEN','APP_BASE_URL','DATABASE_URL','DISCOVERY_ENABLED','OUTBOUND_ENABLED','STORE_BACKEND'],
  processRole:'web'
});
const staged=stageUberLitRelease({rootDir:runtimeRoot,repoDir:root,manifest});
const built=buildUberLitRelease({rootDir:runtimeRoot,releaseId:manifest.releaseId,port,env:process.env});
const promoted=await promoteUberLitRelease({rootDir:runtimeRoot,releaseId:manifest.releaseId,port,env:process.env,healthTimeoutMs:Number(arg('timeout')||30_000)});
process.stdout.write(`${JSON.stringify({ok:true,status:'UBERLIT_UBERBOND_RUNNING',sourceCommit,releaseId:manifest.releaseId,runtimeRoot,stagedStatus:staged.status,buildReceiptDigest:built.receipt.receiptDigest,health:promoted.health,pointer:promoted.pointer,businessEffectAuthority:'LOCAL_RUNTIME_ONLY'},null,2)}\n`);
