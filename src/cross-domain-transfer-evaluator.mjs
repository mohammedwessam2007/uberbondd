import crypto from 'node:crypto';

export const CROSS_DOMAIN_TRANSFER_EVALUATOR_VERSION = 'uberbond.cross-domain-transfer-evaluator.v1';

const ZERO_EFFECTS = Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const text=(value,max=1000)=>{const out=String(value??'').trim();return out&&out.length<=max?out:null;};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(status,reasonCodes,extra={})=>({ok:false,status,reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EFFECTS},...extra});
const number=(value,min=0,max=1)=>{const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;};

function normalizeArm(arm={}){
  const score=number(arm.score,0,1);
  const computeUnits=number(arm.computeUnits,0,1e12);
  const toolBudgetRef=text(arm.toolBudgetRef,500);
  if(score===null||computeUnits===null||!toolBudgetRef)return null;
  return {score,computeUnits,toolBudgetRef};
}

export function evaluateCrossDomainTransfer({
  experimentId=null,
  evaluatorContractHash=null,
  holdoutProtocolHash=null,
  minimumMeaningfulGain=0.05,
  maxAllowedRegression=0.02,
  families=[]
}={}){
  const id=text(experimentId,200);
  const evaluatorHash=text(evaluatorContractHash,200);
  const holdoutHash=text(holdoutProtocolHash,200);
  const minGain=number(minimumMeaningfulGain,0,1);
  const maxRegression=number(maxAllowedRegression,0,1);
  if(!id||!evaluatorHash||!holdoutHash||minGain===null||maxRegression===null)return fail('TRANSFER_PROTOCOL_INVALID',['experiment-evaluator-holdout-and-thresholds-required']);
  const rows=[];
  for(const raw of Array.isArray(families)?families:[]){
    const familyId=text(raw?.familyId,200);
    const baseline=normalizeArm(raw?.baseline);
    const current=normalizeArm(raw?.current);
    const candidate=normalizeArm(raw?.candidate);
    if(!familyId||!baseline||!current||!candidate)return fail('TRANSFER_PROTOCOL_INVALID',['valid-family-and-three-arms-required']);
    rows.push({familyId,baseline,current,candidate,protectedGate:raw?.protectedGate===true});
  }
  if(rows.length<3||new Set(rows.map(row=>row.familyId)).size!==rows.length)return fail('TRANSFER_PROTOCOL_INVALID',['at-least-three-unique-task-families-required']);

  const budgetViolations=[];
  for(const row of rows){
    const compute=[row.baseline.computeUnits,row.current.computeUnits,row.candidate.computeUnits];
    const tool=[row.baseline.toolBudgetRef,row.current.toolBudgetRef,row.candidate.toolBudgetRef];
    if(new Set(compute).size!==1)budgetViolations.push({familyId:row.familyId,reason:'compute-budget-mismatch',computeUnits:compute});
    if(new Set(tool).size!==1)budgetViolations.push({familyId:row.familyId,reason:'tool-budget-mismatch',toolBudgetRefs:tool});
  }
  if(budgetViolations.length)return fail('TRANSFER_BUDGET_MISMATCH',['matched-compute-and-tool-budget-required'],{budgetViolations});

  const outcomes=rows.map(row=>{
    const gainVsCurrent=row.candidate.score-row.current.score;
    const gainVsBaseline=row.candidate.score-row.baseline.score;
    return {
      familyId:row.familyId,
      baselineScore:row.baseline.score,
      currentScore:row.current.score,
      candidateScore:row.candidate.score,
      gainVsCurrent,
      gainVsBaseline,
      meaningfulImprovement:gainVsCurrent>=minGain,
      regression:gainVsCurrent<0?Math.abs(gainVsCurrent):0,
      protectedGate:row.protectedGate
    };
  });
  const protectedRegressions=outcomes.filter(row=>row.protectedGate&&row.regression>0);
  if(protectedRegressions.length)return fail('TRANSFER_REFUSED',['protected-gate-regression-zero-tolerance'],{protectedRegressions});
  const excessiveRegressions=outcomes.filter(row=>row.regression>maxRegression);
  if(excessiveRegressions.length)return fail('TRANSFER_REFUSED',['family-regression-exceeds-tolerance'],{excessiveRegressions});

  const improved=outcomes.filter(row=>row.meaningfulImprovement).length;
  const requiredImproved=Math.ceil(rows.length*2/3);
  const supported=improved>=requiredImproved;
  const receipt={experimentId:id,evaluatorContractHash:evaluatorHash,holdoutProtocolHash:holdoutHash,minimumMeaningfulGain:minGain,maxAllowedRegression:maxRegression,outcomes};
  return {
    ok:true,
    status:supported?'CROSS_DOMAIN_TRANSFER_FEASIBILITY_SUPPORTED':'CROSS_DOMAIN_TRANSFER_NOT_SUPPORTED',
    supported,
    improvedFamilies:improved,
    requiredImprovedFamilies:requiredImproved,
    outcomes,
    receiptHash:hash(receipt),
    generalityClaim:'WITHHELD__A_BOUNDED_MULTI_DOMAIN_PANEL_CAN_SUPPORT_TRANSFER_FEASIBILITY_NOT_A_GENERAL_INTELLIGENCE_CLAIM',
    computeBoundary:'EXTRA_COMPUTE_OR_TOOL_BUDGET_INVALIDATES_THE_TRANSFER_COMPARISON',
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO_EFFECTS}
  };
}
