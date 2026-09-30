import { semanticHash, impactedSemanticNodes } from './semantic-closure-kernel.mjs';

export const LIVING_EVIDENCE_DELTA_SCHEMA='uberbond.living-evidence-delta.v1';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:/-]{1,240}$/.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);

function indexChunks(chunks,label){
  if(!Array.isArray(chunks)||chunks.length>100000)throw new Error(label+'-bounded-chunks-required');
  const map=new Map();
  for(const chunk of chunks){
    if(!plain(chunk)||!id(chunk.id)||map.has(chunk.id)||!digest(chunk.contentHash))
      throw new Error(label+'-unique-content-addressed-chunks-required');
    map.set(chunk.id,structuredClone(chunk));
  }
  return map;
}

export function compileLivingEvidenceDelta({
  previousChunks=[],currentChunks=[],nodes=[],verifyTokenizerReceipt
}={}){
  try{
    const previous=indexChunks(previousChunks,'previous');
    const current=indexChunks(currentChunks,'current');
    if(typeof verifyTokenizerReceipt!=='function')throw new Error('independent-tokenizer-verifier-required');

    let totalCurrentTokens=0;
    for(const chunk of current.values()){
      if(!chunk.tokenizerReceipt||chunk.tokenizerReceipt.chunkHash!==chunk.contentHash||
         !Number.isSafeInteger(chunk.tokenizerReceipt.tokenCount)||chunk.tokenizerReceipt.tokenCount<0||
         typeof chunk.tokenizerReceipt.verifierRef!=='string'||!chunk.tokenizerReceipt.verifierRef||
         verifyTokenizerReceipt({chunk,receipt:chunk.tokenizerReceipt})!==true)
        throw new Error('verified-current-chunk-token-count-required:'+chunk.id);
      totalCurrentTokens+=chunk.tokenizerReceipt.tokenCount;
      if(!Number.isSafeInteger(totalCurrentTokens))throw new Error('token-count-overflow');
    }

    const changedChunkIds=[],removedChunkIds=[],unchangedChunkIds=[];
    for(const [chunkId,chunk] of current){
      const old=previous.get(chunkId);
      if(!old||old.contentHash!==chunk.contentHash)changedChunkIds.push(chunkId);
      else unchangedChunkIds.push(chunkId);
    }
    for(const chunkId of previous.keys())if(!current.has(chunkId))removedChunkIds.push(chunkId);

    const semanticNodes=nodes.map(node=>{
      if(!plain(node)||!id(node.id)||!Array.isArray(node.dependencies)||!Array.isArray(node.sourceChunkIds))
        throw new Error('living-evidence-node-contract-required');
      if(node.sourceChunkIds.some(x=>!id(x)))throw new Error('living-evidence-source-id-required');
      return {id:node.id,dependencies:[...node.dependencies]};
    });
    if(new Set(semanticNodes.map(x=>x.id)).size!==semanticNodes.length)throw new Error('unique-living-evidence-node-id-required');

    const dirtySources=new Set([...changedChunkIds,...removedChunkIds]);
    const directlyDirtyNodeIds=nodes.filter(n=>n.sourceChunkIds.some(x=>dirtySources.has(x))).map(n=>n.id);
    const impact=directlyDirtyNodeIds.length
      ? impactedSemanticNodes(semanticNodes,directlyDirtyNodeIds)
      : {affectedIds:[],recomputeFraction:0};

    const scanTokens=changedChunkIds.reduce((sum,chunkId)=>{
      const n=current.get(chunkId)?.tokenizerReceipt?.tokenCount??0;
      const next=sum+n;if(!Number.isSafeInteger(next))throw new Error('delta-token-overflow');return next;
    },0);

    return {
      ok:true,status:'LIVING_EVIDENCE_DELTA_COMPILED',schemaVersion:LIVING_EVIDENCE_DELTA_SCHEMA,
      previousStateHash:semanticHash(previousChunks.map(({id,contentHash})=>({id,contentHash}))),
      currentStateHash:semanticHash(currentChunks.map(({id,contentHash})=>({id,contentHash}))),
      changedChunkIds:changedChunkIds.sort(),
      removedChunkIds:removedChunkIds.sort(),
      unchangedChunkIds:unchangedChunkIds.sort(),
      directlyDirtyNodeIds:directlyDirtyNodeIds.sort(),
      affectedNodeIds:impact.affectedIds,
      recomputeFraction:impact.recomputeFraction,
      totalCurrentTokens,scanTokens,
      tokenDeltaFraction:totalCurrentTokens?scanTokens/totalCurrentTokens:0,
      reusableCurrentTokens:Math.max(0,totalCurrentTokens-scanTokens),
      semanticAuthority:'INVALIDATION_AND_RECOMPUTE_PLAN_ONLY',
      exactReuseAuthority:'UNCHANGED_CONTENT_HASH_ONLY',
      effectAuthority:'NONE'
    };
  }catch(error){
    return {ok:false,status:'LIVING_EVIDENCE_DELTA_REFUSED',reasons:[String(error.message||error)],
      semanticAuthority:'NONE',effectAuthority:'NONE'};
  }
}
