import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_EQUIVALENCE_SOURCES,
  evaluateSourceGroundedEquivalence
} from '../src/achieved-opus-equivalence-island.mjs';

export function runAchievedOpusEquivalenceDoctor({root=process.cwd()}={}){
  const sourceDocuments={};
  for(const relative of DEFAULT_EQUIVALENCE_SOURCES){
    const full=path.join(root,relative);
    sourceDocuments[relative]=JSON.parse(fs.readFileSync(full,'utf8'));
  }
  const market=sourceDocuments['config/infinite-opus-live-market-candidates.json'];
  const opus=(market?.candidates||[]).find(row=>row?.model==='anthropic/claude-opus-5.5');
  if(!opus)throw new Error('current-opus-reference-candidate-required');
  return evaluateSourceGroundedEquivalence({
    sourceDocuments,
    referenceModel:opus.model,
    inputUsdPerMillion:Number(opus.inputUsdPerMillion),
    outputUsdPerMillion:Number(opus.outputUsdPerMillion)
  });
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const result=runAchievedOpusEquivalenceDoctor();
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
}
