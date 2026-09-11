import crypto from 'node:crypto';
import { buildUberBondFeatureGenome, validateUberBondFeatureGenome } from './uberbond-feature-genome.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERDNA_SOFTWARE_GENOME_VERSION='uberbond.uberdna-software-genome.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(reasonCodes,extra={})=>({ok:false,status:'UBERDNA_BLOCKED',reasonCodes:[...new Set(reasonCodes)],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});

/** Machine-readable repository genotype built from the existing Feature Genome. */
export function compileUberDnaSoftwareGenome({root=process.cwd(),sourceRevision=process.env.GITHUB_SHA||null}={}){
  const genome=buildUberBondFeatureGenome({root,sourceRevision});
  if(!genome?.ok)return fail(['feature-genome-required',...(genome?.reasonCodes||[])]);
  const integrity=validateUberBondFeatureGenome(genome);
  if(!integrity?.ok)return fail(['feature-genome-integrity-required',...(integrity?.reasonCodes||[])]);
  const genotype={
    schemaVersion:'uberbond.uberdna.genotype.v1',sourceRevision:genome.sourceRevision||sourceRevision||null,genomeDigest:genome.genomeDigest,
    repositoryArtifactCount:genome.repositoryArtifactCount,sourceDependencyEdgeCount:genome.sourceDependencyEdgeCount,
    operatorScriptCount:genome.operatorScriptCount,readinessCapabilityCount:genome.readinessCapabilityCount,
    reachabilityModuleCount:genome.reachabilityModuleCount,activationGateCount:genome.activationGateCount,
    familyCounts:genome.familyCounts,fallbackArtifacts:genome.fallbackArtifacts,
    law:'GENOTYPE_DESCRIBES_SOURCE_STRUCTURE; IT DOES_NOT_PROVE_RUNTIME_OR_EXTERNAL_EFFECTS'
  };
  return {ok:true,status:'UBERDNA_GENOTYPE_READY',genotype,genotypeDigest:digest(genotype),featureGenome:genome,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

/**
 * Evidence-gates a mutation candidate. This does not apply the mutation: it
 * merely says whether the candidate has the minimum sandbox/adversarial/
 * independent-verifier/rollback evidence required to become promotable.
 */
export function evaluateSoftwareMutation({genotypeResult,changedPaths=[],sandboxReceipt=null,adversarialEvidenceRefs=[],independentVerifierRef=null,rollbackRef=null}={}){
  if(!genotypeResult?.ok||!genotypeResult.genotype||!genotypeResult.genotypeDigest)return fail(['verified-genotype-required']);
  if(digest(genotypeResult.genotype)!==genotypeResult.genotypeDigest)return fail(['genotype-digest-mismatch']);
  const paths=[...new Set((Array.isArray(changedPaths)?changedPaths:[]).map(v=>text(v,500)).filter(Boolean))];
  if(!paths.length||paths.length>100)return fail(['bounded-changed-paths-required']);
  const sandboxOk=sandboxReceipt?.ok===true&&text(sandboxReceipt?.status,100)?.includes('VERIFIED');
  const adversarial=[...new Set((Array.isArray(adversarialEvidenceRefs)?adversarialEvidenceRefs:[]).map(v=>text(v,1000)).filter(Boolean))];
  const verifier=text(independentVerifierRef,1000),rollback=text(rollbackRef,1000);
  const reasons=[];
  if(!sandboxOk)reasons.push('verified-sandbox-evidence-required');
  if(!adversarial.length)reasons.push('adversarial-evidence-required');
  if(!verifier)reasons.push('independent-verifier-required');
  if(!rollback)reasons.push('rollback-evidence-required');
  if(reasons.length)return fail(reasons,{changedPaths:paths,promotionAuthority:'NONE'});
  const candidate={schemaVersion:'uberbond.uberdna.mutation-candidate.v1',baseGenotypeDigest:genotypeResult.genotypeDigest,changedPaths:paths,sandboxEvidenceRef:text(sandboxReceipt.evidenceRef,1000)||'INLINE_VERIFIED_SANDBOX_RECEIPT',adversarialEvidenceRefs:adversarial,independentVerifierRef:verifier,rollbackRef:rollback,promotionAuthority:'SEPARATE_TRUSTED_PROMOTER_REQUIRED'};
  return {ok:true,status:'UBERDNA_MUTATION_EVIDENCE_READY',candidate,candidateDigest:digest(candidate),promotionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}
