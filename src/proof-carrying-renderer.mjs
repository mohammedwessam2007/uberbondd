import crypto from 'node:crypto';
const hash=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sorted=x=>[...new Set(Array.isArray(x)?x.map(String):[])].sort();
export function verifyRenderedSurface({semanticEnvelope,rendered,reverseParse,reverseParseAdmission=null,verifyReverseParseAdmission=null}={}){
  if(!semanticEnvelope||typeof rendered!=='string'||!reverseParse) return {ok:false,status:'RENDER_VERIFICATION_INPUT_REQUIRED'};
  if(typeof verifyReverseParseAdmission!=='function'||verifyReverseParseAdmission(reverseParseAdmission)!==true) return {ok:false,status:'REVERSE_PARSE_AUTHORITY_REQUIRED'};
  const expected={claims:sorted(semanticEnvelope.claims),numbers:sorted(semanticEnvelope.numbers),citations:sorted(semanticEnvelope.citations),constraints:sorted(semanticEnvelope.constraints)};
  const got={claims:sorted(reverseParse.claims),numbers:sorted(reverseParse.numbers),citations:sorted(reverseParse.citations),constraints:sorted(reverseParse.constraints)};
  const mismatches=Object.keys(expected).filter(k=>hash(expected[k])!==hash(got[k]));
  return mismatches.length?{ok:false,status:'RENDER_SEMANTIC_DRIFT',mismatches}:{ok:true,status:'PROOF_CARRYING_RENDER_PASS',renderHash:hash(rendered),envelopeHash:hash(expected)};
}
