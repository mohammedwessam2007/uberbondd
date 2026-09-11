#!/usr/bin/env node
import { MILLION_WORMHOLE_CANDIDATE_COUNT, MILLION_WORMHOLE_SHARD_COUNT, MILLION_WORMHOLE_SHARD_SIZE, decodeMillionWormholeIndex, encodeMillionWormholeIndex } from '../src/million-wormhole-universe.mjs';
import { compileRecursiveWormholeRound } from '../src/million-wormhole-tournament.mjs';

const probes=[0,1,255,256,65535,736291,MILLION_WORMHOLE_CANDIDATE_COUNT-1];
const bijection=probes.every(index=>encodeMillionWormholeIndex(decodeMillionWormholeIndex(index))===index);
const first=compileRecursiveWormholeRound({shardIndex:0,topK:16,target:'SEARCH_POLICY'});
const healthy=MILLION_WORMHOLE_CANDIDATE_COUNT===1_048_576&&MILLION_WORMHOLE_SHARD_COUNT===4096&&MILLION_WORMHOLE_SHARD_SIZE===256&&bijection&&first.ok&&first.promotionAuthority==='NONE'&&first.externalEffectAuthority==='NONE';
const result={ok:healthy,status:healthy?'MILLION_WORMHOLE_SEARCH_HEALTHY':'MILLION_WORMHOLE_SEARCH_INVALID',candidateCount:MILLION_WORMHOLE_CANDIDATE_COUNT,shardCount:MILLION_WORMHOLE_SHARD_COUNT,shardSize:MILLION_WORMHOLE_SHARD_SIZE,bijection,firstRound:{status:first.status,recursiveTarget:first.recursiveTarget,selectedCount:first.selected?.length||0,promotionAuthority:first.promotionAuthority,truthBoundary:first.truthBoundary},businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
if(!healthy)process.exitCode=1;
