#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  buildUberLitRelease,
  compileUberLitRelease,
  promoteUberLitRelease,
  stageUberLitRelease,
  stopUberLitProcess
} from '../src/uberlit-runtime.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const flag=name=>process.argv.includes(`--${name}`);
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
const webPort=Number(arg('port')||process.env.PORT||32123);
const dbPort=Number(arg('db-port')||35432);
const tlsPort=Number(process.env.UBERLIT_TLS_PORT||32443);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim().toLowerCase();
const dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:repoRoot,encoding:'utf8'}).trim();
if(dirty)throw new Error('uberlit-supervisor-source-must-be-clean');

const manifest=compileUberLitRelease({
  sourceCommit,
  buildArgv:['node','scripts/uberlit-build-uberbond.mjs'],
  startArgv:['node','server.mjs'],
  healthPath:'/api/health',
  envAllowlist:['ADMIN_TOKEN','APP_BASE_URL','DATABASE_SSL','DATABASE_URL','DISCOVERY_ENABLED','OUTBOUND_ENABLED','STORE_BACKEND','TRUST_PROXY_HOPS'],
  processRole:'web'
});
const staged=stageUberLitRelease({rootDir:runtimeRoot,repoDir:repoRoot,manifest});
const built=buildUberLitRelease({rootDir:runtimeRoot,releaseId:manifest.releaseId,port:webPort,env:process.env});
const releaseSource=path.join(runtimeRoot,'releases',manifest.releaseId,'source');
const requireFromRelease=createRequire(path.join(releaseSource,'package.json'));
const embeddedEntry=requireFromRelease.resolve('embedded-postgres');
const embeddedModule=await import(pathToFileURL(embeddedEntry).href);
const EmbeddedPostgres=embeddedModule.default||embeddedModule;
const pgEntry=requireFromRelease.resolve('pg');
const pgModule=await import(pathToFileURL(pgEntry).href);
const {Client}=pgModule.default||pgModule;

const secretDir=path.join(runtimeRoot,'secrets');fs.mkdirSync(secretDir,{recursive:true,mode:0o700});
function loadOrCreateSecret(file,key,bytes){
  if(fs.existsSync(file)){
    const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error(`uberlit-${key}-secret-file-unsafe`);
    const value=String(JSON.parse(fs.readFileSync(file,'utf8'))[key]||'');if(value.length<32)throw new Error(`uberlit-${key}-secret-invalid`);return value;
  }
  const value=crypto.randomBytes(bytes).toString('base64url');fs.writeFileSync(file,`${JSON.stringify({[key]:value})}\n`,{mode:0o600});return value;
}
const password=loadOrCreateSecret(path.join(secretDir,'postgres.json'),'password',32);
const persistedAdminToken=loadOrCreateSecret(path.join(secretDir,'admin.json'),'token',32);

const pgRoot=path.join(runtimeRoot,'postgres');const databaseDir=path.join(pgRoot,'data');fs.mkdirSync(databaseDir,{recursive:true,mode:0o700});
const pgLib=path.join(releaseSource,'node_modules','@embedded-postgres','linux-x64','native','lib');
process.env.LANG='C';process.env.LC_ALL='C';process.env.LC_CTYPE='C';process.env.LC_MESSAGES='C';process.env.LC_COLLATE='C';
if(fs.existsSync(pgLib))process.env.LD_LIBRARY_PATH=[pgLib,process.env.LD_LIBRARY_PATH||''].filter(Boolean).join(':');
const runningAsRoot=typeof process.getuid==='function'&&process.getuid()===0;
const postgres=new EmbeddedPostgres({databaseDir,user:'postgres',password,port:dbPort,persistent:true,createPostgresUser:runningAsRoot,onLog:()=>{},onError:message=>process.stderr.write(`[uberlit-postgres] ${String(message)}\n`)});
let postgresStarted=false;
let webPromoted=false;
const databaseName='uberbond';
const databaseUrl=`postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${dbPort}/${databaseName}`;
const adminDatabaseUrl=`postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${dbPort}/postgres`;
try{
  const initialized=fs.existsSync(path.join(databaseDir,'PG_VERSION'));
  if(!initialized)await postgres.initialise();
  await postgres.start();postgresStarted=true;
  const adminClient=new Client({connectionString:adminDatabaseUrl,ssl:false});
  try{
    await adminClient.connect();
    const existing=await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1',[databaseName]);
    if(existing.rowCount===0)await adminClient.query(`CREATE DATABASE ${databaseName}`);
  }finally{await adminClient.end().catch(()=>{});}
  const runtimeEnv={...process.env,DATABASE_URL:databaseUrl,DATABASE_SSL:'false',STORE_BACKEND:'postgres',OUTBOUND_ENABLED:process.env.OUTBOUND_ENABLED||'false',DISCOVERY_ENABLED:process.env.DISCOVERY_ENABLED||'false',ADMIN_TOKEN:process.env.ADMIN_TOKEN||persistedAdminToken,APP_BASE_URL:process.env.APP_BASE_URL||`https://127.0.0.1:${tlsPort}`,TRUST_PROXY_HOPS:process.env.TRUST_PROXY_HOPS||'1'};
  const migration=spawnSync(process.execPath,['scripts/migrate.mjs'],{cwd:releaseSource,env:runtimeEnv,encoding:'utf8',maxBuffer:16*1024*1024});
  if((migration.status??1)!==0)throw new Error(`uberlit-migration-failed:${String(migration.stderr||migration.stdout||'').slice(0,1000)}`);
  const promoted=await promoteUberLitRelease({rootDir:runtimeRoot,releaseId:manifest.releaseId,port:webPort,env:runtimeEnv,healthTimeoutMs:Number(arg('timeout')||30_000)});webPromoted=true;
  const receipt={ok:true,status:'UBERLIT_PRODUCTION_RUNTIME_READY',sourceCommit,releaseId:manifest.releaseId,runtimeRoot,webPort,dbPort,storeBackend:'postgres',postgresPersistent:true,adminCredentialPersistent:!process.env.ADMIN_TOKEN,stagedStatus:staged.status,buildReceiptDigest:built.receipt.receiptDigest,health:promoted.health,externalEffectsDisabled:runtimeEnv.OUTBOUND_ENABLED!=='true'&&runtimeEnv.DISCOVERY_ENABLED!=='true',businessEffectAuthority:'LOCAL_RUNTIME_ONLY'};
  process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
  if(flag('keep-running'))await new Promise(resolve=>{const done=()=>resolve();process.once('SIGTERM',done);process.once('SIGINT',done);});
}finally{
  if(webPromoted){try{await stopUberLitProcess({rootDir:runtimeRoot});}catch{}}
  if(postgresStarted){try{await postgres.stop();}catch{}}
}
