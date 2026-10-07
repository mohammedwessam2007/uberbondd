import { redactSecrets } from './secret-patterns.mjs';
import { auditCrownCapitalization } from './crown-capitalization-audit.mjs';
import { validateCrownSemanticPatch } from './crown-output-surgery.mjs';
import { planCrownSuccession,applySuccession } from './crown-succession.mjs';
import { compileDirectFrontierCounterfactual } from './frontier-counterfactual-compiler.mjs';
import { compileModelUnderstanding,modelPriorForTask,chooseAnalyticLane,noRetestAuthority,estimateModelTariffMicrousd } from './infinite-opus-model-understanding.mjs';
import { closeInterpretation } from './interpretation-closure.mjs';
import { planLivingEvidenceDelta,modelLivingEvidenceDeltaCompression } from './living-evidence-graph.mjs';
import { verifyRenderedSurface } from './proof-carrying-renderer.mjs';
import { buildRecurrenceMap } from './recurrence-map.mjs';
import { validateSemanticProgram } from './semantic-isa-v2.mjs';
import { partialEvaluateSemanticProgram,verifySpecialization,buildVerifiedSemanticEGraph,selectActiveBoundaryCases,microcodeVerdict } from './semantic-reuse-foundry.mjs';
import { admitVerifierEvidence,verifierMayCertify } from './verifier-trust.mjs';

export const INFINITE_OPUS_SEMANTIC_HOST_VERSION='uberbond.infinite-opus.semantic-closure-host.v1';

const ACTIONS=Object.freeze({
 'semantic.isa.validate':'DETERMINISTIC',
 'semantic.specialize':'DETERMINISTIC',
 'semantic.specialization.verify':'DETERMINISTIC',
 'semantic.egraph.build':'DETERMINISTIC_INTERNAL_EVIDENCE',
 'semantic.boundary.select':'DETERMINISTIC_NONAUTHORITATIVE',
 'semantic.microcode.verdict':'DETERMINISTIC_BOUNDED',
 'recurrence.map':'DETERMINISTIC',
 'model.registry.compile':'NONAUTHORITATIVE_PRIOR',
 'model.prior':'NONAUTHORITATIVE_PRIOR',
 'model.lane.choose':'NONAUTHORITATIVE_ROUTING_PRIOR',
 'model.no-retest.evaluate':'BY_CONSTRUCTION_ONLY_IF_INPUT_PROOF_IS_ALREADY_TRUSTED',
 'model.tariff.estimate':'ARITHMETIC_NOT_BILL',
 'crown.capitalization.audit':'LINKAGE_AUDIT_ONLY',
 'crown.patch.validate':'STRUCTURE_VALIDATION_ONLY',
 'crown.succession.plan':'PLAN_ONLY',
 'crown.succession.apply-current-general':'CURRENT_VERIFIED_CROWN_REQUIRED__DERIVED_OUTPUT_ONLY',
 'interpretation.close':'NO_SELF_ATTESTED_CROWN_OR_COMPILER_AUTHORITY',
 'evidence.graph.plan':'EXACT_INVALIDATION_ONLY',
 'evidence.delta.model':'CAPACITY_MODEL_ONLY',
 'renderer.verify':'TRUSTED_REVERSE_PARSE_VERIFIER_REQUIRED',
 'verifier.evidence.evaluate':'INTERNAL_EVIDENCE_ONLY',
 'frontier.counterfactual.compile':'TRUSTED_TOKENIZER_AND_PRICE_RECEIPTS_REQUIRED'
});

const safe=value=>{
 const encoded=JSON.stringify(value??{});
 if(Buffer.byteLength(encoded)>250000)throw new Error('semantic-host-payload-too-large');
 if(encoded!==redactSecrets(encoded))throw new Error('semantic-host-secret-bearing-payload-refused');
 return value??{};
};
const wrap=(action,result)=>({
 ok:result?.ok!==false,
 status:result?.status??'SEMANTIC_HOST_RESULT',
 action,
 result,
 hostSemanticAuthority:'NONE',
 providerCallsPerformed:0,
 spendUsd:0,
 businessEffectAuthority:'NONE',
 externalEffectAuthority:'NONE',
 persisted:false,
 truthBoundary:'The semantic host exposes deterministic/internal closure machinery only. A returned internal proof or plan does not create provider, customer, spend or external-effect authority, and operator-supplied evidence is not upgraded into trusted reality evidence.'
});

export function createInfiniteOpusSemanticClosureHost({currentCrownAdmission=null,trustedTokenizerEvidenceRefs=[],trustedPriceEvidenceRefs=[],trustedReverseParseEvidenceRefs=[]}={}){
 const tokenizerRefs=new Set(trustedTokenizerEvidenceRefs),priceRefs=new Set(trustedPriceEvidenceRefs),reverseRefs=new Set(trustedReverseParseEvidenceRefs);
 const crownCurrent=Boolean(currentCrownAdmission?.semanticAuthority==='CURRENT_TASK_CLASS_CROWN'&&currentCrownAdmission?.receiptHash&&currentCrownAdmission?.exactModelId);
 return {
  manifest(){
   return {
    ok:true,status:'INFINITE_OPUS_SEMANTIC_CLOSURE_HOST_READY',
    schemaVersion:INFINITE_OPUS_SEMANTIC_HOST_VERSION,
    actions:ACTIONS,
    currentGeneralCrownPresent:crownCurrent,
    trustedTokenizerReceiptCount:tokenizerRefs.size,
    trustedPriceReceiptCount:priceRefs.size,
    trustedReverseParseReceiptCount:reverseRefs.size,
    providerCallsPerformed:0,spendUsd:0,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',
    truthBoundary:'Host availability is not semantic authority. Authority-bearing transformations remain bound to independently trusted evidence or a verified current Crown admission.'
   };
  },
  execute(action,payload={}){
   safe({action,payload});
   if(!Object.hasOwn(ACTIONS,action))return wrap(action,{ok:false,status:'SEMANTIC_HOST_ACTION_REFUSED'});
   switch(action){
    case 'semantic.isa.validate': return wrap(action,validateSemanticProgram(payload.program));
    case 'semantic.specialize': return wrap(action,{ok:true,status:'SEMANTIC_SPECIALIZATION_DERIVED',specialized:partialEvaluateSemanticProgram(payload.program,payload.stableBindings)});
    case 'semantic.specialization.verify': return wrap(action,verifySpecialization(payload));
    case 'semantic.egraph.build': return wrap(action,{ok:true,...buildVerifiedSemanticEGraph(payload)});
    case 'semantic.boundary.select': return wrap(action,{ok:true,...selectActiveBoundaryCases(payload.cases,payload.options)});
    case 'semantic.microcode.verdict': return wrap(action,microcodeVerdict(payload.program));
    case 'recurrence.map': return wrap(action,{ok:true,status:'RECURRENCE_MAP_DERIVED',map:buildRecurrenceMap(payload.records)});
    case 'model.registry.compile': return wrap(action,{ok:true,status:'MODEL_UNDERSTANDING_COMPILED_NONAUTHORITATIVE',registry:compileModelUnderstanding(payload.config,{now:payload.now??Date.now()})});
    case 'model.prior': return wrap(action,modelPriorForTask(payload));
    case 'model.lane.choose': return wrap(action,{ok:true,status:'ANALYTIC_LANE_DERIVED',lane:chooseAnalyticLane(payload)});
    case 'model.no-retest.evaluate': return wrap(action,noRetestAuthority(payload));
    case 'model.tariff.estimate': return wrap(action,estimateModelTariffMicrousd(payload));
    case 'crown.capitalization.audit': return wrap(action,{ok:true,...auditCrownCapitalization(payload)});
    case 'crown.patch.validate': return wrap(action,validateCrownSemanticPatch(payload.patch));
    case 'crown.succession.plan': return wrap(action,planCrownSuccession(payload));
    case 'crown.succession.apply-current-general':{
      if(!crownCurrent)return wrap(action,{ok:false,status:'CURRENT_VERIFIED_GENERAL_CROWN_REQUIRED'});
      const candidate=currentCrownAdmission.exactModelId;
      const currentRoles=payload.currentRoles??{};
      const out=applySuccession({currentRoles,tournamentRoles:{GENERAL_CROWN:candidate},admissionReceipts:{GENERAL_CROWN:currentCrownAdmission}});
      return wrap(action,{...out,sourceCrownReceiptHash:currentCrownAdmission.receiptHash});
    }
    case 'interpretation.close':
      return wrap(action,closeInterpretation({rawTaskHash:payload.rawTaskHash,parses:payload.parses,crownResolution:null,typedCompilerCertificate:null,verifyTypedCompilerCertificate:null}));
    case 'evidence.graph.plan': return wrap(action,{ok:true,...planLivingEvidenceDelta(payload)});
    case 'evidence.delta.model': return wrap(action,{ok:true,...modelLivingEvidenceDeltaCompression(payload)});
    case 'renderer.verify':{
      const admitted=payload.verifierEvidence?admitVerifierEvidence(payload.verifierEvidence):null;
      const trusted=Boolean(admitted?.ok&&verifierMayCertify(admitted,'REVERSE_PARSE_EQUIVALENCE')&&reverseRefs.has(payload.reverseParseAdmission?.evidenceRef));
      return wrap(action,verifyRenderedSurface({...payload,verifyReverseParseAdmission:()=>trusted}));
    }
    case 'verifier.evidence.evaluate':{
      const result=admitVerifierEvidence(payload);
      return wrap(action,{...result,trustedProducer:false,externalProof:false});
    }
    case 'frontier.counterfactual.compile':{
      const tokenizerTrusted=tokenizerRefs.has(payload.tokenizerReceipt?.evidenceRef);
      const priceTrusted=priceRefs.has(payload.priceReceipt?.evidenceRef);
      return wrap(action,compileDirectFrontierCounterfactual({...payload,
        verifyTokenizerReceipt:()=>tokenizerTrusted,
        verifyPriceReceipt:()=>priceTrusted
      }));
    }
    default:return wrap(action,{ok:false,status:'SEMANTIC_HOST_ACTION_REFUSED'});
   }
  }
 };
}
