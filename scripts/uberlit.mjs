#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildUberLitRelease,
  compileUberLitRelease,
  promoteUberLitRelease,
  readUberLitPointer,
  readUberLitProcess,
  rollbackUberLitRelease,
  stageUberLitRelease,
  startUberLitRelease,
  stopUberLitProcess,
  tailUberLitLog,
  verifyStagedUberLitRelease,
  waitForUberLitHealth
} from '../src/uberlit-runtime.mjs';

const scriptRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const command=String(process.argv[2]||'status').trim().toLowerCase();
const args=process.argv.slice(3);
const value=name=>{const i=args.indexOf(`--${name}`);return i>=0?String(args[i+1]||''):'';};
const flag=name=>args.includes(`--${name}`);
const json=value=>process.stdout.write(`${JSON.stringify(value,null,2)}\n`);
const rootDir=path.resolve(value('root')||process.env.UBERLIT_ROOT||path.join(scriptRoot,'.uberlit'));
const repoDir=path.resolve(value('repo')||scriptRoot);
const sourceCommit=(value('commit')||(()=>{try{return execFileSync('git',['rev-parse','HEAD'],{cwd:repoDir,encoding:'utf8'}).trim();}catch{return'';}})()).toLowerCase();
const port=Number(value('port')||process.env.PORT||3100);
const releaseId=value('release');
function releaseConfig(){
  return compileUberLitRelease({
    sourceCommit,
    buildArgv:flag('no-build')?[]:['npm','ci'],
    startArgv:['node','server.mjs'],
    healthPath:value('health')||'/api/health',
    envAllowlist:(value('env-allow')||'ADMIN_TOKEN,OUTBOUND_ENABLED,DISCOVERY_ENABLED,APP_BASE_URL,DATABASE_URL').split(',').map(x=>x.trim()).filter(Boolean),
    processRole:value('role')||'web'
  });
}
async function main(){
  if(command==='stage'){const manifest=releaseConfig();return json({manifest,result:stageUberLitRelease({rootDir,repoDir,manifest})});}
  if(command==='build')return json(buildUberLitRelease({rootDir,releaseId,port,env:process.env}));
  if(command==='start')return json(startUberLitRelease({rootDir,releaseId,port,env:process.env}));
  if(command==='health'){
    const verified=verifyStagedUberLitRelease({rootDir,releaseId});if(!verified.ok)throw new Error('uberlit-health-release-invalid');
    return json(await waitForUberLitHealth({port,healthPath:verified.manifest.healthPath,timeoutMs:Number(value('timeout')||30_000)}));
  }
  if(command==='promote')return json(await promoteUberLitRelease({rootDir,releaseId,port,env:process.env,healthTimeoutMs:Number(value('timeout')||30_000)}));
  if(command==='rollback')return json(await rollbackUberLitRelease({rootDir,env:process.env,healthTimeoutMs:Number(value('timeout')||30_000)}));
  if(command==='stop')return json(await stopUberLitProcess({rootDir}));
  if(command==='logs')return process.stdout.write(tailUberLitLog({rootDir,releaseId:releaseId||readUberLitPointer({rootDir})?.releaseId,maxBytes:Number(value('bytes')||64_000)}));
  if(command==='status')return json({ok:true,status:'UBERLIT_STATUS',rootDir,pointer:readUberLitPointer({rootDir}),process:readUberLitProcess({rootDir})});
  if(command==='run'){
    const manifest=releaseConfig();const staged=stageUberLitRelease({rootDir,repoDir,manifest});
    buildUberLitRelease({rootDir,releaseId:manifest.releaseId,port,env:process.env});
    const promoted=await promoteUberLitRelease({rootDir,releaseId:manifest.releaseId,port,env:process.env,healthTimeoutMs:Number(value('timeout')||30_000)});
    return json({ok:true,status:'UBERLIT_RUN_READY',staged,promoted});
  }
  throw new Error(`unknown UberLit command: ${command}`);
}
main().catch(error=>{process.stderr.write(`${JSON.stringify({ok:false,status:'UBERLIT_COMMAND_REFUSED',reason:String(error?.message||error),detail:error?.health||null},null,2)}\n`);process.exitCode=1;});
