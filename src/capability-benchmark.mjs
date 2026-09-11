import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const CAPABILITY_BENCHMARK_ATOM_ID='capability.benchmark';
export const compileCapabilityBenchmark=input=>compileUberSkillAtomPlan({...input,atomId:CAPABILITY_BENCHMARK_ATOM_ID});
export const executeCapabilityBenchmark=input=>executeUberSkillAtom(input);
