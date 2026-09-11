import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRepositoryMemoryIngestion } from '../src/repository-memory-ingestion-law.mjs';

const valid=()=>({observedAt:'2026-09-11T12:00:00Z',provenanceRefs:['chat:material-source'],authorityClass:'CHAT_SPEC_GOAL',contentDigest:'sha256:'+'a'.repeat(64),bodyRef:'docs/memory/material-chat.md',shareUrl:'https://example.com/share',decisions:['keep sovereignty law'],contradictions:[],supersessionLinks:[]});

test('material memory ingestion binds provenance date authority digest decisions contradictions and supersession links',()=>{
  const out=compileRepositoryMemoryIngestion(valid());
  assert.equal(out.ok,true);assert.equal(out.status,'REPOSITORY_MEMORY_INGESTION_PACKET_READY');assert.equal(out.repositoryWriteAuthority,'NONE');assert.equal(out.packet.authorityClass,'CHAT_SPEC_GOAL');
});

test('a share URL alone is not durable repository-native memory',()=>{
  const out=compileRepositoryMemoryIngestion({...valid(),bodyRef:null,contentDigest:null});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('repository-native-memory-body-ref-required'));assert.ok(out.reasonCodes.includes('memory-content-digest-required'));assert.ok(out.reasonCodes.includes('share-url-alone-is-not-durable-memory'));assert.equal(out.repositoryWriteAuthority,'NONE');
});

test('missing provenance cannot be promoted into durable memory',()=>{
  const out=compileRepositoryMemoryIngestion({...valid(),provenanceRefs:[]});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('memory-provenance-required'));
});
