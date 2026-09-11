#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { prepareEmbeddedPostgresFixture } from './prepare-embedded-postgres-fixture.mjs';

const install=spawnSync('npm',['ci','--bin-links=false','--include=dev'],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
if((install.status??1)!==0)process.exit(install.status??1);
const prepared=await prepareEmbeddedPostgresFixture();
if(prepared.status!=='READY'&&prepared.status!=='NOT_APPLICABLE')throw new Error(`uberlit-postgres-fixture-not-ready:${prepared.status}`);
process.stdout.write(`${JSON.stringify({ok:true,status:'UBERLIT_UBERBOND_BUILD_READY',postgresFixture:prepared.status,postgresExecutionMode:prepared.executionMode||null,businessEffectAuthority:'NONE'})}\n`);
