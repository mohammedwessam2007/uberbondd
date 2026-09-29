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

// Machine-originated compilers never parse ambiguous prose or invent a policy.
export function executeTypedTaskCompiler(task) {
  if (task?.schemaVersion !== 'uberbond.exact-task.v1' || task.sideEffectClass !== 'NONE') throw new Error('machine-task-schema-or-effect-drift');
  const payload = task.payload;
  switch (task.taskClass) {
    case 'RESEARCH_SOURCE_DELTA': return impactedSemanticNodes(payload.nodes, payload.changedIds);
    case 'BUSINESS_EXACT_INTEGER_TOTAL': return { total: executeExactOpcode('SUM_INTEGER', payload.values) };
    case 'REPLY_FINITE_POLICY': return executeExactOpcode('LOOKUP', [payload.admittedRows, payload.typedReply]);
    case 'OUTREACH_STRUCTURED_ENVELOPE': return compileExactVerifier(payload.admittedSemantics).verify(payload.candidate);
    case 'CODE_CANDIDATE_EXACT_OBLIGATIONS': return compileExactVerifier(payload.admittedResults).verify(payload.observedResults);
    case 'SOLVER_FINITE_CONSTRAINT': return solveFiniteSpecification(payload);
    default: throw new Error('novel-task-class-crown-page-fault');
  }
}
