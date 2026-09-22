import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_SYSTEM_ONE_CRITIC_VERSION='uberbond.genesis-system-one-critic.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
const text=(v,m=8000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const list=(v,n=64,m=1000)=>Array.isArray(v)&&v.length<=n?[...new Set(v.map(x=>text(x,m)).filter(Boolean))]:[];

function candidateFrom(job){
  const c=job?.prompt?.candidate;
  if(!c||typeof c!=='object'||Array.isArray(c)) return null;
  const candidateId=text(c.candidateId,240),title=text(c.title,500),hypothesis=text(c.hypothesis),mechanism=text(c.mechanism),falsifier=text(c.falsifier,6000),nextProbe=text(c.nextProbe,6000);
  const moonshotAffinity=list(c.moonshotAffinity,32,120),substrateNeeds=list(c.substrateNeeds,32,120);
  if(!candidateId||!/^genesis-candidate-[a-z0-9-]+$/.test(candidateId)||!title||!hypothesis||!mechanism||!falsifier||!nextProbe||!moonshotAffinity.length||!substrateNeeds.length) return null;
  return {candidateId,title,hypothesis,mechanism,falsifier,nextProbe,moonshotAffinity,substrateNeeds};
}

function counterexamples(c){
  const out=[
    'The mechanism may restate the desired outcome without identifying a causal lever that survives a controlled baseline.',
    'A measured improvement may come from easier task selection, hidden assistance, or changed evaluation conditions rather than the proposed mechanism.'
  ];
  const needs=new Set(c.substrateNeeds.map(String));
  if([...needs].some(x=>/UBERWATT|THERMAL|TELEMETRY|ENERGY/i.test(x))) out.push('The idea may depend on energy or thermal measurements that are not yet observed, so simulated efficiency gains could disappear on real hardware.');
  if([...needs].some(x=>/LOCAL_COMPUTE|SOVEREIGN_COMPUTE|JEV|MODEL/i.test(x))) out.push('Coordination, context-transfer, model-loading, or retry overhead may erase the apparent advantage of distributing cognition to cheaper layers.');
  if([...needs].some(x=>/HUMAN_APPROVAL|DECISION|OPTION/i.test(x))) out.push('A simulated decision benefit may not preserve the human preferences, uncertainty, or reversibility that the idea claims to protect.');
  if([...needs].some(x=>/RESEARCH|EVIDENCE|EXPERIMENT/i.test(x))) out.push('The experiment may optimize an internal proxy that does not transfer to the real target phenomenon.');
  return [...new Set(out)].slice(0,5);
}

function unresolved(c){
  const out=['Whether the stated mechanism causes the claimed benefit on a fixed held-out task population.'];
  const needs=new Set(c.substrateNeeds.map(String));
  if([...needs].some(x=>/UBERWATT|THERMAL|TELEMETRY|ENERGY/i.test(x))) out.push('Real measured energy/thermal evidence is still required.');
  if([...needs].some(x=>/HUMAN_APPROVAL/i.test(x))) out.push('Human approval cannot be simulated or inherited from model output.');
  if([...needs].some(x=>/MODEL|JEV|LOCAL_COMPUTE|SOVEREIGN_COMPUTE/i.test(x))) out.push('Supplier quality, latency, and coordination overhead must be measured on the actual runtime.');
  return out.slice(0,6);
}

export function compileGenesisSystemOneCritique({job}={}){
  const c=candidateFrom(job);
  if(!c) return envelope({ok:false,status:'GENESIS_SYSTEM_ONE_CRITIQUE_BLOCKED',reasonCodes:['valid-cognition-job-candidate-required']});
  if(String(job?.kind||'')!=='CANDIDATE_CRITIQUE') return envelope({ok:false,status:'GENESIS_SYSTEM_ONE_CRITIQUE_BLOCKED',reasonCodes:['candidate-critique-job-required']});
  if(Number(job?.max_cost_microusd??job?.maxCostMicrousd??0)!==0) return envelope({ok:false,status:'GENESIS_SYSTEM_ONE_CRITIQUE_BLOCKED',reasonCodes:['system-one-zero-cost-jobs-only']});

  const strongestCounterexamples=counterexamples(c);
  const riskCount=strongestCounterexamples.length;
  const confidence=Math.max(.35,Math.min(.72,Number((.68-(riskCount-2)*.06).toFixed(2))));
  const result={
    thesis:`The ${c.title} hypothesis is worth an internal falsification pass only if its claimed benefit survives a fixed baseline, identical evaluation conditions, and explicit accounting for hidden assistance and coordination overhead.`,
    strongestCounterexamples,
    falsifierRefinement:`${c.falsifier} Strengthen this by pre-registering the same task population, baseline, acceptance metric, hidden-intervention count, retry count, latency/cost inputs, and a stop rule before comparing the candidate mechanism.`,
    minimumExperiment:{
      objective:`Try to falsify ${c.title} before allocating broader cognition or implementation effort.`,
      procedure:[
        'Freeze the exact candidate, baseline, task population, metrics, and stop rule.',
        `Execute the smallest internal version of the proposed probe: ${c.nextProbe}`,
        'Record accepted outcomes, failures, retries, hidden assistance, latency, and any required substrate evidence.',
        'Compare candidate and baseline under identical scoring and reject the hypothesis if the pre-registered failure condition is met.'
      ],
      successCriterion:'The candidate improves the declared primary metric without worse acceptance, hidden intervention, defect/retry burden, or missing substrate evidence.',
      failureCriterion:'The candidate fails to beat baseline, requires hidden assistance, worsens reliability, or depends on unavailable evidence or authority.'
    },
    implementationSketch:{
      internalOnly:true,
      steps:[
        'Represent the experiment as a bounded internal task with immutable baseline and candidate arms.',
        'Collect machine-readable receipts for every compared outcome and resource input.',
        'Run the declared falsifier before any promotion or broader rollout.',
        'Escalate only unresolved semantic or causal uncertainty to a stronger supplier.'
      ],
      dependencies:[...new Set(['fixed baseline','held-out task set','receipt ledger',...c.substrateNeeds])].slice(0,16),
      risks:strongestCounterexamples.slice(0,5)
    },
    confidence,
    unresolved:unresolved(c)
  };

  return envelope({
    ok:true,
    status:'GENESIS_SYSTEM_ONE_CRITIQUE_READY',
    version:GENESIS_SYSTEM_ONE_CRITIC_VERSION,
    candidateId:c.candidateId,
    supplierClass:'DETERMINISTIC',
    provider:'uberbond',
    model:'jev-system-one-v1',
    result,
    costMicrousd:0,
    promotionAuthority:'NONE',
    escalationPolicy:'ESCALATE_ONLY_AFTER_SYSTEM_ONE_LEAVES_MATERIAL_UNRESOLVED_CAUSAL_OR_SEMANTIC_UNCERTAINTY',
    truthBoundary:'SYSTEM_ONE_IS_A_DETERMINISTIC_PREFILTER__ITS_CRITIQUE_IS_RESEARCH_EVIDENCE_NOT_NOVEL_MODEL_REASONING_FEASIBILITY_PROOF_OR_IMPLEMENTATION_AUTHORITY.'
  });
}
