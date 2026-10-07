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
  const reference=sourceDocuments['config/opus-equivalence-reference-2026-10-07.json'];
  if(reference?.model!=='anthropic/claude-opus-5.5')throw new Error('current-opus-reference-candidate-required');
  if(!Number.isFinite(Date.parse(reference.expiresAt))||Date.parse(reference.expiresAt)<=Date.now())throw new Error('fresh-opus-reference-evidence-required');
  return evaluateSourceGroundedEquivalence({
    sourceDocuments,
    referenceModel:reference.model,
    inputUsdPerMillion:Number(reference.pricing?.inputUsdPerMillion),
    outputUsdPerMillion:Number(reference.pricing?.outputUsdPerMillion)
  });
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const result=runAchievedOpusEquivalenceDoctor();
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
}
