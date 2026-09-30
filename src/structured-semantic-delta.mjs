import { semanticHash } from './semantic-closure-kernel.mjs';

export const STRUCTURED_SEMANTIC_DELTA_SCHEMA='uberbond.structured-semantic-delta.v1';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:/-]{1,240}$/.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);

function index(rows,label,{verifyParserReceipt,verifyTokenizerReceipt}){
  if(!Array.isArray(rows)||rows.length>100000)throw new Error(label+'-bounded-records-required');
  const map=new Map();
  for(const row of rows){
    if(!plain(row)||!id(row.id)||map.has(row.id)||!digest(row.rawContentHash))
      throw new Error(label+'-unique-raw-record-required');
    if(!row.parserReceipt||row.parserReceipt.rawContentHash!==row.rawContentHash||
       row.parserReceipt.parsedValueHash!==semanticHash(row.parsedValue)||
       typeof row.parserReceipt.parserId!=='string'||!row.parserReceipt.parserId||
       typeof row.parserReceipt.verifierRef!=='string'||!row.parserReceipt.verifierRef||
       typeof verifyParserReceipt!=='function'||verifyParserReceipt({row,receipt:row.parserReceipt})!==true)
      throw new Error(label+'-independently-verified-parser-receipt-required:'+row.id);
    if(!row.tokenizerReceipt||row.tokenizerReceipt.rawContentHash!==row.rawContentHash||
       !Number.isSafeInteger(row.tokenizerReceipt.tokenCount)||row.tokenizerReceipt.tokenCount<0||
       typeof row.tokenizerReceipt.verifierRef!=='string'||!row.tokenizerReceipt.verifierRef||
       typeof verifyTokenizerReceipt!=='function'||verifyTokenizerReceipt({row,receipt:row.tokenizerReceipt})!==true)
      throw new Error(label+'-independently-verified-tokenizer-receipt-required:'+row.id);
    map.set(row.id,{...structuredClone(row),semanticValueHash:semanticHash(row.parsedValue)});
  }
  return map;
}

export function compileStructuredSemanticDelta({
  previousRecords=[],currentRecords=[],verifyParserReceipt,verifyTokenizerReceipt
}={}){
  try{
    const previous=index(previousRecords,'previous',{verifyParserReceipt,verifyTokenizerReceipt});
    const current=index(currentRecords,'current',{verifyParserReceipt,verifyTokenizerReceipt});
    const rawChangedIds=[],semanticChangedIds=[],semanticallyEquivalentRawChangeIds=[],removedIds=[];
    let totalCurrentTokens=0,rawChangedTokens=0,semanticChangedTokens=0;

    for(const [recordId,row] of current){
      totalCurrentTokens+=row.tokenizerReceipt.tokenCount;
      if(!Number.isSafeInteger(totalCurrentTokens))throw new Error('token-count-overflow');
      const old=previous.get(recordId);
      if(!old||old.rawContentHash!==row.rawContentHash){
        rawChangedIds.push(recordId);
        rawChangedTokens+=row.tokenizerReceipt.tokenCount;
        if(!old||old.semanticValueHash!==row.semanticValueHash){
          semanticChangedIds.push(recordId);
          semanticChangedTokens+=row.tokenizerReceipt.tokenCount;
        }else semanticallyEquivalentRawChangeIds.push(recordId);
      }
    }
    for(const recordId of previous.keys())if(!current.has(recordId))removedIds.push(recordId);

    return {
      ok:true,status:'STRUCTURED_SEMANTIC_DELTA_COMPILED',schemaVersion:STRUCTURED_SEMANTIC_DELTA_SCHEMA,
      rawChangedIds:rawChangedIds.sort(),
      semanticChangedIds:semanticChangedIds.sort(),
      semanticallyEquivalentRawChangeIds:semanticallyEquivalentRawChangeIds.sort(),
      removedIds:removedIds.sort(),
      totalCurrentTokens,rawChangedTokens,semanticChangedTokens,
      exactSemanticElidedTokens:Math.max(0,rawChangedTokens-semanticChangedTokens),
      semanticDeltaFraction:totalCurrentTokens?semanticChangedTokens/totalCurrentTokens:0,
      authority:'E2_VERIFIED_STRUCTURED_NORMALIZATION_ONLY',
      claimBoundary:'Only independently verified parser-equivalent structured values are elided. Arbitrary prose/format meaning is not normalized.',
      effectAuthority:'NONE'
    };
  }catch(error){
    return {ok:false,status:'STRUCTURED_SEMANTIC_DELTA_REFUSED',reasons:[String(error.message||error)],authority:'NONE',effectAuthority:'NONE'};
  }
}
