import { semanticHash } from './semantic-closure-kernel.mjs';

export const CROWN_BOUNDARY_QUERY_SCHEMA='uberbond.crown-boundary-query.v1';

export function compileCrownBoundaryQuery({
  passportVerification,circuitId,taskArchetype,boundaryQuestion,
  exactSourceExcerpt,exactSourceExcerptHash,jevDecision,
  tokenizerReceipt,verifyTokenizerReceipt,maxInputTokens=400
}={}){
  const reasons=[];
  try{
    if(passportVerification?.ok!==true||passportVerification.authority!=='Q_CERTIFIED_BOUNDED')
      throw new Error('current-certified-jev-passport-required');
    if(typeof circuitId!=='string'||!circuitId||typeof taskArchetype!=='string'||!taskArchetype)
      throw new Error('bounded-circuit-identity-required');
    if(typeof boundaryQuestion!=='string'||!boundaryQuestion||boundaryQuestion.length>500)
      throw new Error('bounded-boundary-question-required');
    if(typeof exactSourceExcerpt!=='string'||!exactSourceExcerpt)
      throw new Error('exact-source-excerpt-required');
    if(exactSourceExcerptHash!==semanticHash(exactSourceExcerpt))
      throw new Error('source-excerpt-hash-mismatch');
    if(jevDecision!=='RELEVANT'&&jevDecision!=='IRRELEVANT')
      throw new Error('bounded-jev-relevance-decision-required');

    const messages=[
      {role:'system',content:'Audit one certified Jev relevance boundary. Reply A if the Jev decision is correct, B if it is wrong. No explanation.'},
      {role:'user',content:JSON.stringify({
        v:1,c:circuitId,t:taskArchetype,q:boundaryQuestion,
        source:exactSourceExcerpt,jev:jevDecision
      })}
    ];
    const payloadHash=semanticHash(messages);
    if(!tokenizerReceipt||tokenizerReceipt.payloadHash!==payloadHash||
       !Number.isSafeInteger(tokenizerReceipt.inputTokens)||tokenizerReceipt.inputTokens<1||
       tokenizerReceipt.inputTokens>maxInputTokens||typeof tokenizerReceipt.verifierRef!=='string'||!tokenizerReceipt.verifierRef)
      throw new Error('bounded-tokenizer-receipt-required');
    if(typeof verifyTokenizerReceipt!=='function'||verifyTokenizerReceipt({receipt:tokenizerReceipt,messages})!==true)
      throw new Error('independent-tokenizer-verification-required');
    return {
      ok:true,status:'CROWN_BOUNDARY_QUERY_COMPILED',schemaVersion:CROWN_BOUNDARY_QUERY_SCHEMA,
      messages,maxTokens:1,inputTokens:tokenizerReceipt.inputTokens,payloadHash,
      outputAlphabet:['A','B'],semanticAuthority:'NONE',
      purpose:'SAMPLED_JEV_BOUNDARY_AUDIT_ONLY',
      effectAuthority:'NONE'
    };
  }catch(error){reasons.push(String(error.message||error));}
  return {ok:false,status:'CROWN_BOUNDARY_QUERY_REFUSED',reasons,semanticAuthority:'NONE',effectAuthority:'NONE'};
}
