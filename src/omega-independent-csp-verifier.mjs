import crypto from 'node:crypto';

export const OMEGA_INDEPENDENT_CSP_VERIFIER_VERSION='uberbond.omega-independent-csp-verifier.v1';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const result=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{providerCalls:0,messages:0,purchases:0,deployments:0,credentialChanges:0,dnsChanges:0,productionMutations:0,spendCents:0},...extra});

export function independentlyVerifyCsp({problem,assignment}={}){
  let workUnits=0;
  if(!problem||typeof problem!=='object'||!assignment||typeof assignment!=='object'||Array.isArray(assignment)) return result({ok:false,valid:false,status:'OMEGA_INDEPENDENT_VERIFIER_REFUSED',version:OMEGA_INDEPENDENT_CSP_VERIFIER_VERSION,workUnits:1});
  const variables=Array.isArray(problem.variables)?problem.variables:[];
  const constraints=Array.isArray(problem.constraints)?problem.constraints:[];
  const ids=variables.map(v=>String(v.id));
  const expected=new Set(ids),actual=Object.keys(assignment);
  workUnits+=actual.length+ids.length;
  const exactKeys=actual.length===ids.length&&actual.every(k=>expected.has(k));
  let domainValid=exactKeys;
  if(domainValid){
    for(const variable of variables){ workUnits++; if(!Array.isArray(variable.domain)||!variable.domain.some(value=>Object.is(value,assignment[variable.id]))){domainValid=false;break;} }
  }
  let givensValid=true;
  for(const [id,value] of Object.entries(problem.givens??{})){workUnits++;if(!Object.is(assignment[id],value)){givensValid=false;break;}}
  let constraintsValid=exactKeys&&domainValid;
  if(constraintsValid){
    for(const constraint of constraints){
      workUnits++;
      const vars=Array.isArray(constraint.vars)?constraint.vars:[]; const values=vars.map(id=>assignment[id]);
      let valid=false;
      if(constraint.type==='neq'&&values.length===2) valid=!Object.is(values[0],values[1]);
      else if(constraint.type==='eq'&&values.length===2) valid=Object.is(values[0],values[1]);
      else if(constraint.type==='lt'&&values.length===2) valid=Number(values[0])<Number(values[1]);
      else if(constraint.type==='sumEq'&&values.length>0){workUnits+=values.length;valid=values.reduce((s,v)=>s+Number(v),0)===Number(constraint.target);}
      else if(constraint.type==='allDifferent'&&values.length>1){workUnits+=values.length;valid=new Set(values.map(JSON.stringify)).size===values.length;}
      if(!valid){constraintsValid=false;break;}
    }
  }
  const valid=Boolean(exactKeys&&domainValid&&givensValid&&constraintsValid);
  const receiptCore={problemId:String(problem.id??''),assignmentHash:hash(assignment),exactKeys,domainValid,givensValid,constraintsValid,valid,workUnits};
  return result({ok:true,valid,status:valid?'OMEGA_INDEPENDENT_CSP_VERIFIED':'OMEGA_INDEPENDENT_CSP_REJECTED',version:OMEGA_INDEPENDENT_CSP_VERIFIER_VERSION,checks:{exactKeys,domainValid,givensValid,constraintsValid},workUnits,receiptHash:hash(receiptCore),truthBoundary:'This verifier is implementation-separated from the Omega solver and meta-learner, but it still evaluates the same bounded finite-CSP semantics. It is not an external-world oracle.'});
}
