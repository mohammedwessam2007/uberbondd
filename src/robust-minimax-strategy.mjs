import crypto from 'node:crypto';

export const ROBUST_MINIMAX_STRATEGY_VERSION='uberbond.robust-minimax-strategy.v1';
const text=(v,n=500)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null;};
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const fail=(codes,extra={})=>({ok:false,status:'MINIMAX_STRATEGY_REFUSED',reasonCodes:[...new Set(codes.filter(Boolean))],externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',...extra});

function interval(raw){
  if(Number.isFinite(Number(raw))) { const x=Number(raw); return{low:x,high:x}; }
  const low=finite(raw?.low),high=finite(raw?.high);
  return low!=null&&high!=null&&low<=high?{low,high}:null;
}

export function selectMinimaxRegretStrategy({scenarios=[],strategies=[]}={}){
  const sc=(Array.isArray(scenarios)?scenarios:[]).map(row=>({id:text(row?.id,160),evidenceRefs:Array.isArray(row?.evidenceRefs)?row.evidenceRefs.map(v=>text(v,1000)).filter(Boolean):[],status:(text(row?.status,40)||'ESTIMATED').toUpperCase()}));
  const st=(Array.isArray(strategies)?strategies:[]).map(row=>({id:text(row?.id,160),outcomes:row?.outcomes&&typeof row.outcomes==='object'?row.outcomes:{},reversible:row?.reversible!==false,cost:finite(row?.cost)??0,evidenceRefs:Array.isArray(row?.evidenceRefs)?row.evidenceRefs.map(v=>text(v,1000)).filter(Boolean):[]}));
  const reasons=[];
  if(!sc.length||sc.some(row=>!row.id))reasons.push('valid-scenarios-required');
  if(!st.length||st.some(row=>!row.id))reasons.push('valid-strategies-required');
  if(new Set(sc.map(x=>x.id)).size!==sc.length)reasons.push('scenario-ids-must-be-unique');
  if(new Set(st.map(x=>x.id)).size!==st.length)reasons.push('strategy-ids-must-be-unique');
  const table=[];
  for(const strategy of st){
    const cells={};
    for(const scenario of sc){
      const iv=interval(strategy.outcomes?.[scenario.id]);
      if(!iv)reasons.push(`valid-outcome-interval-required:${strategy.id}:${scenario.id}`);
      else cells[scenario.id]=iv;
    }
    table.push({...strategy,cells});
  }
  if(reasons.length)return fail(reasons);

  const bestUpper={};
  for(const scenario of sc)bestUpper[scenario.id]=Math.max(...table.map(row=>row.cells[scenario.id].high));
  const evaluated=table.map(row=>{
    const regrets=sc.map(scenario=>({scenarioId:scenario.id,regret:bestUpper[scenario.id]-row.cells[scenario.id].low,bestPossibleUtility:bestUpper[scenario.id],strategyWorstCaseUtility:row.cells[scenario.id].low}));
    const maxRegret=Math.max(...regrets.map(r=>r.regret));
    const meanRegret=regrets.reduce((s,r)=>s+r.regret,0)/regrets.length;
    const worstUtility=Math.min(...sc.map(s=>row.cells[s.id].low));
    return{id:row.id,maxRegret,meanRegret,worstUtility,reversible:row.reversible,cost:row.cost,evidenceRefs:row.evidenceRefs,regrets};
  });
  evaluated.sort((a,b)=>a.maxRegret-b.maxRegret||a.meanRegret-b.meanRegret||b.worstUtility-a.worstUtility||Number(b.reversible)-Number(a.reversible)||a.cost-b.cost||a.id.localeCompare(b.id));
  const winner=evaluated[0];
  const basis={scenarios:sc.map(row=>({id:row.id,status:row.status,evidenceRefs:row.evidenceRefs})),winnerId:winner.id,maxRegret:winner.maxRegret,meanRegret:winner.meanRegret,worstUtility:winner.worstUtility};
  return{ok:true,status:'MINIMAX_REGRET_STRATEGY_SELECTED',version:ROBUST_MINIMAX_STRATEGY_VERSION,winner,evaluated,basisDigest:`sha256:${hash(basis)}`,truthBoundary:'ROBUST_SELECTION_OVER_SUPPLIED_OUTCOME_INTERVALS__NOT_A_PROBABILITY_OR_OUTCOME_GUARANTEE',externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}
