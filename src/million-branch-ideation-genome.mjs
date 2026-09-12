export * from './million-branch-ideation-compat.mjs';
import { compileMillionBranchIdeationGenome as compileCore } from './uber-genesis-foundry.mjs';
export function compileMillionBranchIdeationGenome(input={}){return compileCore(input);}
