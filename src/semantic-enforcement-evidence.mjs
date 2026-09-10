const norm=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const uniq=value=>[...new Set((Array.isArray(value)?value:[]).map(String).map(v=>v.trim()).filter(Boolean))];

export const SEMANTIC_ENFORCEMENT_EVIDENCE_VERSION='uberbond.semantic-enforcement-evidence.v1.1';

// These are exact, reviewed equivalences between canonical law phrasings that
// already exist in repository truth. They are intentionally finite and
// bidirectional. Do not replace this with fuzzy/semantic similarity: a model or
// approximate matcher must never be able to make one law inherit another law's
// enforcement evidence.
const EXACT_CANONICAL_EQUIVALENCES=Object.freeze([
  Object.freeze([
    'Never delete a named historical initiative from memory merely because its branch or implementation is superseded; mark its reconciliation status instead.',
    'Never delete a named historical initiative from memory merely because its branch or implementation was superseded. Preserve what it donated and what replaced it.'
  ])
]);

const equivalentKeys=new Map();
for(const group of EXACT_CANONICAL_EQUIVALENCES){
  const keys=uniq(group.map(norm));
  for(const key of keys)equivalentKeys.set(key,new Set(keys));
}

function exactIdentityKeys(value){
  const key=norm(value);
  if(!key)return[];
  return [...(equivalentKeys.get(key)||new Set([key]))];
}

/**
 * Carry already-verified law enforcement declarations into the semantic row
 * evidence consumed by the behavior tribunal.
 *
 * This does not grant ENFORCED_BY_CODE or VERIFIED_CURRENT. The coverage
 * compiler is the authority for currentState and verifies declarations against
 * the exact repository tree before a law can receive enforcement credit. A law
 * can also already be VERIFIED_CURRENT through stronger independently-derived
 * source/test/reachability evidence; that stronger state must not make the next
 * tribunal forget the same separately verified enforcement declaration.
 *
 * This helper therefore augments evidence only for rows whose state is already
 * ENFORCED_BY_CODE or VERIFIED_CURRENT, and only on exact normalized identity or
 * a finite reviewed canonical-equivalence pair carrying both source and test
 * references. It never changes state and performs no fuzzy matching.
 */
export function bindVerifiedEnforcementEvidence({coverage={},enforcementEntries=[]}={}){
  const rows=Array.isArray(coverage?.rows)?coverage.rows:[];
  const byName=new Map();
  for(const entry of Array.isArray(enforcementEntries)?enforcementEntries:[]){
    const keys=exactIdentityKeys(entry?.concept);
    if(keys.length===0)continue;
    const sources=uniq(entry?.sources),tests=uniq(entry?.tests);
    if(sources.length===0||tests.length===0)continue;
    for(const key of keys)byName.set(key,{sources,tests});
  }
  return{
    ...coverage,
    rows:rows.map(row=>{
      if(!['ENFORCED_BY_CODE','VERIFIED_CURRENT'].includes(row?.currentState))return row;
      const names=uniq(row?.literalNames);
      const declaration=names.flatMap(exactIdentityKeys).map(key=>byName.get(key)).find(Boolean);
      if(!declaration)return row;
      const evidence=row.currentEvidence||{};
      return{
        ...row,
        currentEvidence:{
          ...evidence,
          sourceModules:uniq([...(evidence.sourceModules||[]),...declaration.sources]),
          testModules:uniq([...(evidence.testModules||[]),...declaration.tests]),
          enforcementEvidenceBound:true
        }
      };
    })
  };
}
