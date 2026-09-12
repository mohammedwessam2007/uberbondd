import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const runner=path.resolve(here,'../scripts/c21-current-head.mjs');
const FROZEN='2026-09-12T20:00:00Z';
const SALT='1'.repeat(64);

function git(cwd,args){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function repo(){
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'uberbond-c21-head-'));
  git(cwd,['init','-q']);
  git(cwd,['config','user.email','c21-test@uberbond.invalid']);
  git(cwd,['config','user.name','UberBond C21 Test']);
  fs.writeFileSync(path.join(cwd,'seed.txt'),'seed\n');
  git(cwd,['add','seed.txt']);
  git(cwd,['commit','-q','-m','seed']);
  return cwd;
}
function run(cwd,extra=[]){return spawnSync(process.execPath,[runner,`--frozen-at=${FROZEN}`,`--observed-at=${FROZEN}`,`--rotation-salt-digest=${SALT}`,...extra],{cwd,encoding:'utf8'});}

test('runner derives candidate revision from actual clean HEAD',()=>{
  const cwd=repo();
  try{
    const head=git(cwd,['rev-parse','HEAD']).toLowerCase();
    const result=run(cwd);
    assert.equal(result.status,0,result.stderr||result.stdout);
    const body=JSON.parse(result.stdout);
    assert.equal(body.schemaVersion,'uberbond.c21-current-head-runner.v2');
    assert.equal(body.candidateRevision,head);
    assert.equal(body.actualHead,head);
    assert.equal(body.worktreeClean,true);
    assert.equal(body.result.evaluation.counts.evidencedDimensions,0);
  }finally{fs.rmSync(cwd,{recursive:true,force:true});}
});

test('runner refuses a caller-supplied revision that differs from actual HEAD',()=>{
  const cwd=repo();
  try{
    const result=run(cwd,[`--candidate-revision=${'a'.repeat(40)}`]);
    assert.equal(result.status,2);
    assert.match(result.stderr,/candidate revision mismatch/);
  }finally{fs.rmSync(cwd,{recursive:true,force:true});}
});

test('runner accepts an explicitly supplied revision only when it equals actual HEAD',()=>{
  const cwd=repo();
  try{
    const head=git(cwd,['rev-parse','HEAD']).toLowerCase();
    const result=run(cwd,[`--candidate-revision=${head}`]);
    assert.equal(result.status,0,result.stderr||result.stdout);
    assert.equal(JSON.parse(result.stdout).candidateRevision,head);
  }finally{fs.rmSync(cwd,{recursive:true,force:true});}
});

test('runner refuses a dirty worktree',()=>{
  const cwd=repo();
  try{
    fs.writeFileSync(path.join(cwd,'dirty.txt'),'uncommitted\n');
    const result=run(cwd);
    assert.equal(result.status,2);
    assert.match(result.stderr,/refuses a dirty worktree/);
  }finally{fs.rmSync(cwd,{recursive:true,force:true});}
});
