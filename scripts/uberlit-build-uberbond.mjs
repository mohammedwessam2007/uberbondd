#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareEmbeddedPostgresFixture } from './prepare-embedded-postgres-fixture.mjs';

async function flattenSymlinks(root){
  const boundary=`${path.resolve(root)}${path.sep}`;
  let count=0;
  async function visit(dir){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      const stat=await fs.lstat(file);
      if(stat.isSymbolicLink()){
        const real=await fs.realpath(file);
        if(real!==path.resolve(root)&&!real.startsWith(boundary))throw new Error(`uberlit-build-symlink-escape-refused:${path.relative(root,file)}`);
        const target=await fs.stat(real);
        await fs.rm(file,{recursive:true,force:true});
        if(target.isDirectory())await fs.cp(real,file,{recursive:true,dereference:true});
        else if(target.isFile())await fs.copyFile(real,file);
        else throw new Error(`uberlit-build-special-symlink-target-refused:${path.relative(root,file)}`);
        count+=1;
        continue;
      }
      if(stat.isDirectory())await visit(file);
    }
  }
  await visit(root);
  return count;
}

const install=spawnSync('npm',['ci','--bin-links=false','--include=dev'],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
if((install.status??1)!==0)process.exit(install.status??1);
const prepared=await prepareEmbeddedPostgresFixture();
if(prepared.status!=='READY'&&prepared.status!=='NOT_APPLICABLE')throw new Error(`uberlit-postgres-fixture-not-ready:${prepared.status}`);
const nodeModules=path.resolve('node_modules');
const flattened=await flattenSymlinks(nodeModules);
process.stdout.write(`${JSON.stringify({ok:true,status:'UBERLIT_UBERBOND_BUILD_READY',postgresFixture:prepared.status,postgresExecutionMode:prepared.executionMode||null,flattenedSymlinkCount:flattened,businessEffectAuthority:'NONE'})}\n`);
