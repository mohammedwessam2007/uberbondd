import { buildNativeCapacityPlan } from './uberbond-native-lead-ops.mjs';
import { semanticHash, executeExactOpcode, impactedSemanticNodes, canonicalSemanticJson } from './semantic-closure-kernel.mjs';

// Verifier foundry: strict typed equality, not a rubric or language-model judge.
export function compileExactVerifier(expected) {
  const digest = semanticHash(expected), admitted = canonicalSemanticJson(expected);
  return Object.freeze({ verifierId: digest, verify(candidate) {
    try { return { ok: canonicalSemanticJson(candidate) === admitted, verifierId: digest,
      semanticAuthority: 'NONE', scope: 'EXACT_TYPED_VALUE' }; }
    catch { return { ok: false, verifierId: digest, semanticAuthority: 'NONE' }; }
  } });
}

// Specification ambiguity must be settled before this bounded solver runs.
// The domain and accepted states are exact, independently admitted inputs.
export function solveFiniteSpecification({ domain, admissibleHashes, objective = 'FIRST' }) {
  if (!Array.isArray(domain) || !domain.length || domain.length > 4096 ||
      !Array.isArray(admissibleHashes) || objective !== 'FIRST') throw new Error('bounded-exact-solver-specification-required');
  const hashes = domain.map(semanticHash);
  if (new Set(hashes).size !== hashes.length || new Set(admissibleHashes).size !== admissibleHashes.length || admissibleHashes.some(h => !hashes.includes(h))) throw new Error('solver-domain-or-translation-mismatch');
  const index = hashes.findIndex(h => admissibleHashes.includes(h));
  return { status: index < 0 ? 'UNSAT_EXHAUSTIVE' : 'SAT_EXACT', result: index < 0 ? null : structuredClone(domain[index]),
    certificate: { specificationHash: semanticHash({ domain, admissibleHashes, objective }),
      enumeratedStates: domain.length, chosenIndex: index }, semanticAuthority: 'EXACT_SPECIFICATION_EXECUTION_ONLY' };
}

export function verifyFiniteSolution(specification, candidate) {
  try { return compileExactVerifier(solveFiniteSpecification(specification)).verify(candidate); }
  catch { return { ok: false, semanticAuthority: 'NONE' }; }
}

export const COGNITIVE_OPCODES = Object.freeze({
  IDENTITY: { arity: 1, output: 'SAME_TYPED_VALUE' },
  SUM_INTEGER: { arity: 'POSITIVE_BOUNDED', output: 'SAFE_INTEGER' },
  EQUAL: { arity: 2, output: 'BOOLEAN' },
  ALL: { arity: 'POSITIVE_BOUNDED', output: 'BOOLEAN' },
  PROJECT: { arity: 1, output: 'EXACT_OBJECT_PROJECTION' },
  LOOKUP: { arity: 2, output: 'UNIQUE_TABLE_VALUE' }
});

export function executeCognitiveBytecode({ instructions, inputs, programHash }) {
  if (!Array.isArray(instructions) || instructions.length > 4096 || semanticHash(instructions) !== programHash || !Array.isArray(inputs)) throw new Error('admitted-bytecode-required');
  const registers = structuredClone(inputs);
  for (const instruction of instructions) {
    if (!COGNITIVE_OPCODES[instruction.opcode] || !Array.isArray(instruction.registers) || instruction.registers.some(i => !Number.isSafeInteger(i) || i < 0 || i >= registers.length)) throw new Error('illegal-instruction-or-composition-precondition');
    registers.push(executeExactOpcode(instruction.opcode, instruction.registers.map(i => registers[i]), instruction.params ?? {}));
  }
  return { value: registers.at(-1) ?? null, programHash, semanticAuthority: 'EXACT_ADMITTED_PROGRAM_ONLY' };
}


const SHA256=/^sha256:[0-9a-f]{64}$/;
export function compileProviderScreeningWorkload(payload={}) {
  const reasons=[];
  if(typeof payload.providerId!=='string'||!payload.providerId.trim())reasons.push('provider-id-required');
  if(!Number.isFinite(Date.parse(String(payload.observedAt||''))))reasons.push('observed-at-required');
  if(!SHA256.test(String(payload.sourceStateHash||'')))reasons.push('source-state-hash-required');
  const facts=payload.facts;
  if(!facts||typeof facts!=='object'||Array.isArray(facts))reasons.push('typed-facts-required');
  const bools=['smtp','imap','incomingReplies','byoDomain','usableApiOrSmtp'];
  if(facts&&bools.some(k=>typeof facts[k]!=='boolean'))reasons.push('boolean-mail-capability-facts-required');
  if(facts&&(!Number.isFinite(Number(facts.monthlyMinimumUsd))||Number(facts.monthlyMinimumUsd)<0))reasons.push('nonnegative-monthly-minimum-required');
  const policy=String(facts?.unsolicitedOutreachPolicy||'UNKNOWN');
  if(!['ALLOWED','PROHIBITED','UNKNOWN'].includes(policy))reasons.push('policy-enum-invalid');
  if(reasons.length)return {ok:false,status:'PROVIDER_SCREENING_INPUT_REFUSED',reasons,semanticAuthority:'NONE'};
  const constraints={maxMonthlyUsd:Number(payload.maxMonthlyUsd??65),requires:{smtp:true,imap:true,incomingReplies:true,byoDomain:true,usableApiOrSmtp:true}};
  if(!Number.isFinite(constraints.maxMonthlyUsd)||constraints.maxMonthlyUsd<0)throw new Error('provider-screening-budget-bound-required');
  const elimination=[];
  if(Number(facts.monthlyMinimumUsd)>constraints.maxMonthlyUsd)elimination.push('MONTHLY_MINIMUM_EXCEEDS_BOUND');
  for(const [k,v] of Object.entries(constraints.requires))if(v&&facts[k]!==true)elimination.push(`MISSING_${k.toUpperCase()}`);
  if(policy==='PROHIBITED')elimination.push('UNSOLICITED_OUTREACH_EXPLICITLY_PROHIBITED');
  const unresolved=[];
  if(!elimination.length){
    if(policy==='UNKNOWN')unresolved.push({id:'cold-outreach-policy',qualityClass:'Q_FRONTIER',reason:'provider-policy-not-exactly-settled'});
    for(const id of ['actual-safe-daily-volume','ip-and-rdns-operational-quality','deliverability-reputation','support-reliability'])
      unresolved.push({id,qualityClass:'Q_FRONTIER',reason:'requires-current-external-evidence-or-frontier-judgment'});
  }
  return {ok:true,status:elimination.length?'PROVIDER_EXACTLY_ELIMINATED':'PROVIDER_SCREENING_FRONTIER_RESIDUAL_READY',
    providerId:payload.providerId,observedAt:payload.observedAt,sourceStateHash:payload.sourceStateHash,
    exactFacts:structuredClone(facts),exactConstraints:constraints,eliminationReasons:elimination,unresolvedSemanticLeaves:unresolved,
    sideEffectAuthority:'NONE',semanticAuthority:elimination.length?'E1_DETERMINISTIC_DERIVATION':'NONE',
    crownPacket:elimination.length?null:{taskClass:'PROVIDER_SCREENING',providerId:payload.providerId,unresolvedSemanticLeaves:unresolved,sourceStateHash:payload.sourceStateHash}};
}

// Machine-originated compilers never parse ambiguous prose or invent a policy.
export function executeTypedTaskCompiler(task) {
  if (task?.schemaVersion !== 'uberbond.exact-task.v1' || task.sideEffectClass !== 'NONE') throw new Error('machine-task-schema-or-effect-drift');
  const payload = task.payload;
  switch (task.taskClass) {
    case 'RESEARCH_SOURCE_DELTA': return impactedSemanticNodes(payload.nodes, payload.changedIds);
    case 'PROVIDER_SCREENING': return compileProviderScreeningWorkload(payload);
    case 'LEAD_CAPACITY_ARITHMETIC': return {...buildNativeCapacityPlan(payload), semanticAuthority:'PROPOSAL_ONLY', releaseAuthorized:false};
    case 'BUSINESS_EXACT_INTEGER_TOTAL': return { total: executeExactOpcode('SUM_INTEGER', payload.values) };
    case 'REPLY_FINITE_POLICY': return executeExactOpcode('LOOKUP', [payload.admittedRows, payload.typedReply]);
    case 'OUTREACH_STRUCTURED_ENVELOPE': return compileExactVerifier(payload.admittedSemantics).verify(payload.candidate);
    case 'CODE_CANDIDATE_EXACT_OBLIGATIONS': return compileExactVerifier(payload.admittedResults).verify(payload.observedResults);
    case 'SOLVER_FINITE_CONSTRAINT': return solveFiniteSpecification(payload);
    default: throw new Error('novel-task-class-crown-page-fault');
  }
}
