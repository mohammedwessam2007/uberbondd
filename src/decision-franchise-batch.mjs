import crypto from 'node:crypto';
import { compileDecisionFranchiseExecutor } from './decision-franchise.mjs';
import { semanticHash } from './semantic-closure-kernel.mjs';

const sha=x=>crypto.createHash('sha256').update(x).digest('hex');

export function executeSequentialDecisionFranchiseFanout({
  record,trustPin,currentContext,count,taskIdPrefix='fanout-',taskFactory,now=Date.now(),maxConsumers=2_000_000
}={}){
  if(!Number.isSafeInteger(count)||count<1||count>maxConsumers)throw new Error('bounded-positive-fanout-count-required');
  if(typeof taskIdPrefix!=='string'||!taskIdPrefix||typeof taskFactory!=='function')throw new Error('task-id-prefix-and-factory-required');
  const compiled=compileDecisionFranchiseExecutor({record,trustPin,currentContext,now});
  if(!compiled.ok)return {...compiled,executedCount:0,providerCallsPerformed:0};
  let receiptRoot=sha('uberbond.decision-franchise-fanout.v1'),providerCalls=0;
  const projectedStates=new Set();
  let firstTaskId=null,lastTaskId=null;
  for(let i=0;i<count;i++){
    const task=taskFactory(i);
    const expected=taskIdPrefix+i;
    if(task?.taskId!==expected)throw new Error('sequential-distinct-task-id-required:'+i);
    const out=compiled.execute(task,{includeTaskHash:false});
    if(!out.ok)return {ok:false,status:'FANOUT_EXECUTION_REFUSED',failedIndex:i,failedTaskId:task?.taskId??null,reasons:out.reasons,executedCount:i,providerCallsPerformed:providerCalls};
    if(out.providerCallsPerformed!==0)throw new Error('decision-franchise-hit-must-be-zero-model-call');
    if(i===0)firstTaskId=task.taskId;
    lastTaskId=task.taskId;
    projectedStates.add(out.projectedStateHash);
    providerCalls+=out.providerCallsPerformed;
    receiptRoot=sha(receiptRoot+'|'+i+'|'+task.taskId+'|'+out.projectedStateHash+'|'+semanticHash(out.decision)+'|'+out.franchiseHash);
  }
  return {
    ok:true,status:'DISTINCT_DECISION_FRANCHISE_FANOUT_EXECUTED',
    executedCount:count,firstTaskId,lastTaskId,uniqueTaskIdsByConstruction:count,
    uniqueProjectedStateCount:projectedStates.size,providerCallsPerformed:providerCalls,
    receiptRoot:'sha256:'+receiptRoot,franchiseHash:semanticHash(record),proofClass:record.proofClass,
    semanticAuthority:'CERTIFIED_BOUNDED_POLICY',
    claimBoundary:'Every sequentially distinct task was actually executed through the admitted Decision Franchise. This receipt proves deterministic fanout execution, not demand, production traffic, direct-Opus counterfactual cost, or all-in economic spend.'
  };
}

export function modelFanoutReferenceEconomics({executionReceipt,directOpusUnitUsd,actualAllInEnvelopeUsd=30}={}){
  if(!executionReceipt?.ok||executionReceipt.status!=='DISTINCT_DECISION_FRANCHISE_FANOUT_EXECUTED')throw new Error('executed-fanout-receipt-required');
  if(!(directOpusUnitUsd>0)||!(actualAllInEnvelopeUsd>0))throw new Error('positive-economic-assumptions-required');
  const directReferenceUsd=executionReceipt.executedCount*directOpusUnitUsd;
  return {
    status:'EXECUTED_FANOUT_PLUS_MODELED_COUNTERFACTUAL',
    executedConsumers:executionReceipt.executedCount,
    directOpusUnitUsd,directReferenceUsd,actualAllInEnvelopeUsd,
    multiplier:directReferenceUsd/actualAllInEnvelopeUsd,
    millionDollarReferenceThresholdMet:directReferenceUsd>=1_000_000,
    target33333xMet:directReferenceUsd/actualAllInEnvelopeUsd>=33333.333333333336,
    executionReceiptRoot:executionReceipt.receiptRoot,
    qualityBasis:executionReceipt.semanticAuthority,
    claimBoundary:'Fanout execution is measured. Direct-Opus unit cost and the $30 all-in envelope remain modeled assumptions until bound to real task/reference and observed spend receipts.'
  };
}
