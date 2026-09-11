import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyContextSourceAncestryReceipt } from '../src/context-source-ancestry.mjs';
import { probeContextSourceAncestry } from '../scripts/sovereign-context-source-ancestry.mjs';

function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();}
function repo(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'uberbond-ancestry-'));git(root,'init','-q');git(root,'config','user.email','test@uberbond.local');git(root,'config','user.name','UberBond Test');fs.writeFileSync(path.join(root,'state.txt'),'one\n');git(root,'add','.');git(root,'commit','-qm','one');const one=git(root,'rev-parse','HEAD');fs.writeFileSync(path.join(root,'state.txt'),'two\n');git(root,'commit','-qam','two');const two=git(root,'rev-parse','HEAD');git(root,'checkout','-qb','fork',one);fs.writeFileSync(path.join(root,'fork.txt'),'fork\n');git(root,'add','.');git(root,'commit','-qm','fork');const fork=git(root,'rev-parse','HEAD');git(root,'checkout','-q','master');return{root,one,two,fork};}

test('local Git probe admits exact fast-forward ancestry',()=>{const r=repo();try{const out=probeContextSourceAncestry({repoRoot:r.root,currentSourceCommit:r.one,candidateSourceCommit:r.two});assert.equal(out.ok,true);assert.equal(out.receipt.relation,'FAST_FORWARD');assert.equal(out.receipt.mergeBase,r.one);assert.equal(verifyContextSourceAncestryReceipt(out.receipt,{currentSourceCommit:r.one,candidateSourceCommit:r.two}).ok,true);}finally{fs.rmSync(r.root,{recursive:true,force:true});}});

test('rollback is observed but refused for import',()=>{const r=repo();try{const out=probeContextSourceAncestry({repoRoot:r.root,currentSourceCommit:r.two,candidateSourceCommit:r.one});assert.equal(out.ok,true);assert.equal(out.receipt.relation,'ROLLBACK');const checked=verifyContextSourceAncestryReceipt(out.receipt);assert.equal(checked.ok,false);assert.equal(checked.status,'CONTEXT_SOURCE_ROLLBACK_REFUSED');}finally{fs.rmSync(r.root,{recursive:true,force:true});}});

test('diverged history is refused rather than chosen by timestamp or height',()=>{const r=repo();try{const out=probeContextSourceAncestry({repoRoot:r.root,currentSourceCommit:r.two,candidateSourceCommit:r.fork});assert.equal(out.ok,true);assert.equal(out.receipt.relation,'DIVERGED');const checked=verifyContextSourceAncestryReceipt(out.receipt);assert.equal(checked.ok,false);assert.equal(checked.status,'CONTEXT_SOURCE_DIVERGENCE_REFUSED');}finally{fs.rmSync(r.root,{recursive:true,force:true});}});

test('receipt tampering and source substitution fail closed',()=>{const r=repo();try{const out=probeContextSourceAncestry({repoRoot:r.root,currentSourceCommit:r.one,candidateSourceCommit:r.two});const tampered=structuredClone(out.receipt);tampered.candidateSourceCommit=r.fork;assert.equal(verifyContextSourceAncestryReceipt(tampered).ok,false);assert.equal(verifyContextSourceAncestryReceipt(out.receipt,{candidateSourceCommit:r.fork}).ok,false);}finally{fs.rmSync(r.root,{recursive:true,force:true});}});

test('probe refuses commits absent from the local trusted object graph',()=>{const r=repo();try{const out=probeContextSourceAncestry({repoRoot:r.root,currentSourceCommit:r.one,candidateSourceCommit:'f'.repeat(40)});assert.equal(out.ok,false);assert.equal(out.status,'CONTEXT_SOURCE_ANCESTRY_PROBE_FAILED');}finally{fs.rmSync(r.root,{recursive:true,force:true});}});
