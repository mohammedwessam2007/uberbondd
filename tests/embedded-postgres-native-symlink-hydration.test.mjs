import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { materializeDeclaredNativeSymlinks } from '../scripts/prepare-embedded-postgres-fixture.mjs';

function fixture(rows){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ub-pg-links-'));const native=path.join(root,'native');fs.mkdirSync(path.join(native,'lib'),{recursive:true});fs.writeFileSync(path.join(native,'lib','libpq.so.5.18'),'fixture');fs.writeFileSync(path.join(native,'pg-symlinks.json'),JSON.stringify(rows));return root;}
const good=[{source:'native/lib/libpq.so.5.18',target:'native/lib/libpq.so.5'}];

test('declared native symlink is materialized exactly and idempotently',async()=>{const root=fixture(good);try{const first=await materializeDeclaredNativeSymlinks({packageRoot:root});assert.equal(first.declared,1);assert.equal(first.created,1);const target=path.join(root,'native/lib/libpq.so.5');assert.equal((await fsp.lstat(target)).isSymbolicLink(),true);assert.equal(await fsp.realpath(target),await fsp.realpath(path.join(root,'native/lib/libpq.so.5.18')));const second=await materializeDeclaredNativeSymlinks({packageRoot:root});assert.equal(second.created,0);}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('occupied declared target fails closed instead of being replaced',async()=>{const root=fixture(good);try{fs.writeFileSync(path.join(root,'native/lib/libpq.so.5'),'poison');await assert.rejects(()=>materializeDeclaredNativeSymlinks({packageRoot:root}),/target is occupied/);}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('mismatched preexisting symlink fails closed',async()=>{const root=fixture(good);try{fs.writeFileSync(path.join(root,'native/lib/other.so'),'other');fs.symlinkSync('other.so',path.join(root,'native/lib/libpq.so.5'));await assert.rejects(()=>materializeDeclaredNativeSymlinks({packageRoot:root}),/target mismatch/);}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('manifest path traversal is refused',async()=>{const root=fixture([{source:'native/lib/libpq.so.5.18',target:'../escaped.so'}]);try{await assert.rejects(()=>materializeDeclaredNativeSymlinks({packageRoot:root}),/escapes native root/);assert.equal(fs.existsSync(path.join(path.dirname(root),'escaped.so')),false);}finally{fs.rmSync(root,{recursive:true,force:true});}});
