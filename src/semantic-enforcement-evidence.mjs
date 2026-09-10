const norm=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const uniq=value=>[...new Set((Array.isArray(value)?value:[]).map(String).map(v=>v.trim()).filter(Boolean))];

export const SEMANTIC_ENFORCEMENT_EVIDENCE_VERSION='uberbond.semantic-enforcement-evidence.v1';

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
 * ENFORCED_BY_CODE or VERIFIED_CURRENT, and only on an exact normalized literal
 * name match carrying both source and test references. It never changes state.
 */
export function bindVerifiedEnforcementEvidence({coverage={},enforcementEntries=[]}={}){
  const rows=Array.isArray(coverage?.rows)?coverage.rows:[];
  const byName=new Map();
  for(const entry of Array.isArray(enforcementEntries)?enforcementEntries:[]){
    const key=norm(entry?.concept);
    if(!key)continue;
    const sources=uniq(entry?.sources),tests=uniq(entry?.tests);
    if(sources.length===0||tests.length===0)continue;
    byName.set(key,{sources,tests});
  }
  return{
    ...coverage,
    rows:rows.map(row=>{
      if(!['ENFORCED_BY_CODE','VERIFIED_CURRENT'].includes(row?.currentState))return row;
      const names=uniq(row?.literalNames);
      const declaration=names.map(name=>byName.get(norm(name))).find(Boolean);
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
