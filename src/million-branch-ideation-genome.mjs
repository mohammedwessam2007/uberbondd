// Public compatibility entrypoint stays founder-generic. Personalization remains behind a separately authorized private context.
// Re-exported activation paths preserve businessEffectAuthority:'NONE' and externalEffectAuthority:'NONE'.
export * from './million-branch-ideation-compat.mjs';
import { compileMillionBranchIdeationGenome as compileCore } from './uber-genesis-foundry.mjs';
export function compileMillionBranchIdeationGenome(input={}){return compileCore(input);}
