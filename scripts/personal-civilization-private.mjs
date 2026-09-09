import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_PRIVATE_STATE_FILE,
  PRIVATE_LIFE_KEY_ENV,
  founderAuthorization,
  loadPrivateState,
  savePrivateState,
  runPrivateCommand
} from '../src/personal-civilization-private-operator.mjs';
import { appendPrivateRecord, founderAuthorized } from '../src/personal-civilization-core.mjs';
import {
  composeDecisionPacket,
  derivePacketAsPrivateRecord,
  recordPacketOutcomeForecast,
  closePacketLoop
} from '../src/personal-civilization-decision-loop.mjs';
import { compilePersonalScientificExperiment } from '../src/personal-civilization-scientific-experiment.mjs';

export const PRIVATE_OPERATOR_CONFIRMATION = 'OPEN MY PRIVATE LIFE STATE';
export const PERSONAL_CIVILIZATION_PRIVATE_REALITY_CYCLE_VERSION = 'uberbond.personal-civilization-private-reality-cycle.v1';
export const PERSONAL_CIVILIZATION_PRIVATE_REALITY_RUNTIME_VERSION = 'uberbond.personal-civilization-private-reality-runtime.v1';

const ZERO = Object.freeze({ customerMessages:0, providerCalls:0, spendCents:0, deployments:0, dnsChanges:0, credentialChanges:0, paymentMutations:0, productionMutations:0 });
const text=(value,max=4000)=>{const out=String(value??'').trim();return out&&out.length<=max?out:null;};
const iso=value=>{const date=value instanceof Date?value:new Date(String(value??''));return Number.isFinite(date.getTime())?date.toISOString():null;};
const realityFail=(status,reasonCodes,extra={})=>({ok:false,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],version:PERSONAL_CIVILIZATION_PRIVATE_REALITY_CYCLE_VERSION,businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO},...extra});

export function founderPresenceSatisfied({ stdinIsTTY = false, stdoutIsTTY = false, confirmation = '' } = {}) {
  return stdinIsTTY === true
    && stdoutIsTTY === true
    && String(confirmation || '').trim() === PRIVATE_OPERATOR_CONFIRMATION;
}

function compactPacket(packet){return{decision:packet.decision,composedAt:packet.composedAt,materiallyDistinctOptions:packet.materiallyDistinctOptions,recommendation:packet.recommendation,recommendationIsValueBoundary:packet.recommendationIsValueBoundary,sovereigntyStatement:packet.sovereigntyStatement};}
function appendJsonRecord({store,kind='DERIVED_MODEL',type,payload,derivedFrom,authorization,destination,occurredAt}){const body=JSON.stringify({type,payload});if(body.length>19000)return realityFail('PCE_PRIVATE_REALITY_RECORD_REFUSED',['private-cycle-record-too-large']);return appendPrivateRecord({store,authorization,destination,input:{kind,body,occurredAt,privacyClass:'PRIVATE_LIFE_DATA',subjectId:'FOUNDER',derivedFrom}});}
function requireSources(store,sourceRecordIds){const ids=[...new Set((Array.isArray(sourceRecordIds)?sourceRecordIds:[]).map(id=>text(id,80)).filter(Boolean))];if(!ids.length)return{ok:false,reasonCodes:['source-private-records-required']};const present=new Set((Array.isArray(store)?store:[]).map(row=>row?.id).filter(Boolean));const missing=ids.filter(id=>!present.has(id));if(missing.length)return{ok:false,reasonCodes:['source-private-records-missing'],missing};return{ok:true,ids};}

export function compilePrivateRealityCycle({store=[],authorization=null,privateDestination=null,sourceRecordIds=[],scientificExperiment={},decision={},founderChoice=null,choiceForecast=null,observedOutcome=null,now=new Date()}={}){
  if(!founderAuthorized(authorization))return realityFail('PCE_PRIVATE_REALITY_FOUNDER_AUTHORITY_REQUIRED',['founder-authorization-required']);
  const at=iso(now);if(!at)return realityFail('PCE_PRIVATE_REALITY_INVALID',['valid-clock-required']);
  const sourceCheck=requireSources(store,sourceRecordIds);if(!sourceCheck.ok)return realityFail('PCE_PRIVATE_REALITY_INVALID',sourceCheck.reasonCodes,{missingSourceRecordIds:sourceCheck.missing||[]});
  const experiment=compilePersonalScientificExperiment(scientificExperiment);if(!experiment.ok)return realityFail('PCE_PRIVATE_REALITY_EXPERIMENT_REFUSED',experiment.reasonCodes||['scientific-experiment-refused'],{scientificExperiment:experiment});
  const dossier=appendJsonRecord({store,type:'PCE_SCIENTIFIC_EXPERIMENT_DOSSIER_V1',payload:{founderSelection:experiment.founderSelection,capabilityAnalysis:experiment.capabilityAnalysis,status:experiment.status,experimentDossier:experiment.experimentDossier,valueOfInformation:{status:experiment.valueOfInformation?.status||null,decision:experiment.valueOfInformation?.decision||null},sovereigntyBoundary:experiment.sovereigntyBoundary,authorityBoundary:experiment.authorityBoundary},derivedFrom:sourceCheck.ids,authorization,destination:privateDestination,occurredAt:at});
  if(!dossier.ok)return realityFail('PCE_PRIVATE_REALITY_DOSSIER_REFUSED',dossier.reasonCodes||['dossier-private-record-refused']);
  const packetResult=composeDecisionPacket({decision:decision.statement,options:decision.options,forecasts:decision.forecasts,keyAssumptions:decision.keyAssumptions,whatCouldMakeThisWrong:decision.whatCouldMakeThisWrong,irreversibleConsequences:decision.irreversibleConsequences,unknownUnknowns:decision.unknownUnknowns,missingEvidence:decision.missingEvidence,highestValueExperiment:decision.highestValueExperiment||experiment.experiencePlan?.experience?.smallestReversibleExperience||experiment.experimentDossier?.wouldReveal||null,updateConditions:decision.updateConditions,now:at});
  if(!packetResult.ok)return realityFail('PCE_PRIVATE_REALITY_DECISION_REFUSED',packetResult.reasonCodes||['decision-packet-refused']);
  const derivedDecision=derivePacketAsPrivateRecord({store:dossier.store,packet:packetResult.packet,sourceRecordIds:[dossier.record.id],authorization,now:at});if(!derivedDecision.ok)return realityFail('PCE_PRIVATE_REALITY_DECISION_PERSISTENCE_REFUSED',derivedDecision.reasonCodes||['decision-private-record-refused']);
  const packetSnapshot=appendJsonRecord({store:derivedDecision.store,type:'PCE_DECISION_PACKET_SNAPSHOT_V1',payload:compactPacket(packetResult.packet),derivedFrom:[derivedDecision.record.id],authorization,destination:privateDestination,occurredAt:at});if(!packetSnapshot.ok)return realityFail('PCE_PRIVATE_REALITY_PACKET_SNAPSHOT_REFUSED',packetSnapshot.reasonCodes||['packet-snapshot-refused']);
  if(!founderChoice)return{ok:true,status:'PCE_PRIVATE_REALITY_READY_FOR_FOUNDER_CHOICE',version:PERSONAL_CIVILIZATION_PRIVATE_REALITY_CYCLE_VERSION,store:packetSnapshot.store,experiment,packet:packetResult.packet,recordIds:{dossier:dossier.record.id,decision:derivedDecision.record.id,packetSnapshot:packetSnapshot.record.id,forecast:null,outcome:null},truthBoundary:'NO FOUNDER CHOICE WAS SUPPLIED. THE SYSTEM STOPS BEFORE CHOICE, FORECAST, OUTCOME OR CALIBRATION.',businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
  const choiceAt=iso(founderChoice.chosenAt);const choiceEvidenceRef=text(founderChoice.evidenceRef,500);if(founderChoice.chosenByFounder!==true||!choiceAt||!choiceEvidenceRef)return realityFail('PCE_PRIVATE_REALITY_FOUNDER_CHOICE_REQUIRED',['explicit-founder-choice-with-provenance-required']);if(!choiceForecast||typeof choiceForecast!=='object')return realityFail('PCE_PRIVATE_REALITY_FORECAST_REQUIRED',['choice-forecast-required-after-founder-choice']);
  const forecasted=recordPacketOutcomeForecast({packet:packetResult.packet,chosenOption:founderChoice.option,probabilities:choiceForecast.probabilities,evidenceCutoff:choiceForecast.evidenceCutoff,method:choiceForecast.method,assumptions:choiceForecast.assumptions,at:choiceAt});if(!forecasted.ok)return realityFail('PCE_PRIVATE_REALITY_FORECAST_REFUSED',forecasted.reasonCodes||['choice-forecast-refused']);
  const forecastRecord=appendJsonRecord({store:packetSnapshot.store,type:'PCE_CHOSEN_FORECAST_V1',payload:{packet:compactPacket(packetResult.packet),chosenOption:forecasted.chosenOption,founderChoiceEvidenceRef:choiceEvidenceRef,forecast:forecasted.forecast},derivedFrom:[packetSnapshot.record.id],authorization,destination:privateDestination,occurredAt:choiceAt});if(!forecastRecord.ok)return realityFail('PCE_PRIVATE_REALITY_FORECAST_PERSISTENCE_REFUSED',forecastRecord.reasonCodes||['forecast-private-record-refused']);
  if(!observedOutcome)return{ok:true,status:'PCE_PRIVATE_REALITY_WAITING_FOR_OBSERVED_OUTCOME',version:PERSONAL_CIVILIZATION_PRIVATE_REALITY_CYCLE_VERSION,store:forecastRecord.store,experiment,packet:packetResult.packet,forecast:forecasted.forecast,recordIds:{dossier:dossier.record.id,decision:derivedDecision.record.id,packetSnapshot:packetSnapshot.record.id,forecast:forecastRecord.record.id,outcome:null},truthBoundary:'A FOUNDER CHOICE AND SEALED FORECAST EXIST, BUT NO OUTCOME OR CALIBRATION IS CLAIMED UNTIL REALITY IS OBSERVED.',businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
  return closePrivateRealityCycle({store:forecastRecord.store,authorization,privateDestination,forecastRecordId:forecastRecord.record.id,observedOutcome});
}

function parseTypedRecord(record,expectedType){if(!record||typeof record!=='object')return realityFail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED',['private-cycle-record-required']);let parsed;try{parsed=JSON.parse(String(record.body||''));}catch{return realityFail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED',['private-cycle-record-json-invalid']);}if(!parsed||parsed.type!==expectedType||!parsed.payload||typeof parsed.payload!=='object')return realityFail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED',['private-cycle-record-type-mismatch']);return{ok:true,payload:parsed.payload};}

export function closePrivateRealityCycle({store=[],authorization=null,privateDestination=null,forecastRecordId=null,observedOutcome=null}={}){
  if(!founderAuthorized(authorization))return realityFail('PCE_PRIVATE_REALITY_FOUNDER_AUTHORITY_REQUIRED',['founder-authorization-required']);
  const id=text(forecastRecordId,80);if(!id)return realityFail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED',['forecast-record-id-required']);const record=(Array.isArray(store)?store:[]).find(row=>row?.id===id);if(!record)return realityFail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED',['forecast-record-not-found']);if(!Array.isArray(record.derivedFrom)||record.derivedFrom.length===0)return realityFail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED',['forecast-record-provenance-required']);
  const parsed=parseTypedRecord(record,'PCE_CHOSEN_FORECAST_V1');if(!parsed.ok)return parsed;const packet=parsed.payload.packet;const sealedForecast=parsed.payload.forecast;if(!packet||!sealedForecast)return realityFail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED',['persisted-packet-and-forecast-required']);
  const observedAt=iso(observedOutcome?.observedAt);const outcome=text(observedOutcome?.value,240);const observationEvidenceRef=text(observedOutcome?.evidenceRef,500);if(!observedAt||!outcome||!observationEvidenceRef)return realityFail('PCE_PRIVATE_REALITY_OUTCOME_INVALID',['observed-outcome-with-time-and-provenance-required']);
  const closed=closePacketLoop({packet,chosenForecast:sealedForecast,outcome,observedAt,availableAtTime:observedOutcome?.availableAtTime});if(!closed.ok)return realityFail('PCE_PRIVATE_REALITY_OUTCOME_NOT_SCORABLE',[closed.status||'packet-loop-not-scorable'],{closeFailure:closed});
  const outcomeRecord=appendJsonRecord({store,kind:'OBSERVATION',type:'PCE_OUTCOME_CALIBRATION_V1',payload:{observationEvidenceRef,observedAt,score:closed.score,decisionQuality:closed.decisionQuality,separation:closed.separation},derivedFrom:[record.id],authorization,destination:privateDestination,occurredAt:observedAt});if(!outcomeRecord.ok)return realityFail('PCE_PRIVATE_REALITY_OUTCOME_PERSISTENCE_REFUSED',outcomeRecord.reasonCodes||['outcome-private-record-refused']);
  return{ok:true,status:'PCE_PRIVATE_REALITY_CYCLE_REHYDRATED_AND_CLOSED',version:PERSONAL_CIVILIZATION_PRIVATE_REALITY_CYCLE_VERSION,store:outcomeRecord.store,calibration:{score:closed.score,decisionQuality:closed.decisionQuality,separation:closed.separation},recordIds:{forecast:record.id,outcome:outcomeRecord.record.id},truthBoundary:'RESTART REHYDRATION PROVES ONLY THAT THE SEALED FORECAST CAN BE SCORED AGAINST THIS OBSERVATION. IT DOES NOT CREATE A GENERAL LIFE LAW.',sovereigntyBoundary:'THE FOUNDER SELECTED THE POSSIBILITY AND THE CHOICE. UBERBOND COMPOSED EVIDENCE AND LEARNING WITHOUT ACQUIRING CHOICE OR ACTION AUTHORITY.',businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
}

function safeRealityReceipt(result,persistedState){return{ok:true,status:result.status,version:PERSONAL_CIVILIZATION_PRIVATE_REALITY_RUNTIME_VERSION,persisted:true,encryption:'AES-256-GCM',recordIds:result.recordIds?structuredClone(result.recordIds):null,recordCount:Array.isArray(persistedState?.records)?persistedState.records.length:null,hypothesisCount:Array.isArray(persistedState?.hypotheses)?persistedState.hypotheses.length:null,edgeCount:Array.isArray(persistedState?.edges)?persistedState.edges.length:null,calibration:result.calibration?{observed:result.calibration.score?.observed||null,observedAt:result.calibration.score?.observedAt||null,assignedProbability:result.calibration.score?.assignedProbability??null,brierScore:result.calibration.score?.brierScore??null,decisionQuality:result.calibration.decisionQuality?.quality||null,separation:result.calibration.separation||null}:null,truthBoundary:result.truthBoundary||null,sovereigntyBoundary:result.sovereigntyBoundary||null,privateDataReturned:false,networkAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};}

export function runPrivateRealityCommand({command={},authorization=null,privateKey=null,filePath=DEFAULT_PRIVATE_STATE_FILE,repoRoot=undefined,now=new Date()}={}){
  const action=String(command?.action||'').trim().toUpperCase();if(!['START_REALITY_CYCLE','CLOSE_REALITY_CYCLE'].includes(action))return realityFail('PCE_PRIVATE_REALITY_RUNTIME_REFUSED',['action-must-be-start-or-close-reality-cycle']);
  const loadArgs={filePath,authorization,privateKey};if(repoRoot!==undefined)loadArgs.repoRoot=repoRoot;const loaded=loadPrivateState(loadArgs);if(!loaded.ok)return loaded;
  const result=action==='START_REALITY_CYCLE'?compilePrivateRealityCycle({store:loaded.state.records,authorization,privateDestination:loaded.filePath,sourceRecordIds:command.sourceRecordIds,scientificExperiment:command.scientificExperiment,decision:command.decision,founderChoice:command.founderChoice,choiceForecast:command.choiceForecast,observedOutcome:null,now}):closePrivateRealityCycle({store:loaded.state.records,authorization,privateDestination:loaded.filePath,forecastRecordId:command.forecastRecordId,observedOutcome:command.observedOutcome});
  if(!result.ok)return result;const nextState={...loaded.state,records:result.store};const saveArgs={state:nextState,filePath:loaded.filePath,authorization,privateKey,now};if(repoRoot!==undefined)saveArgs.repoRoot=repoRoot;const saved=savePrivateState(saveArgs);if(!saved.ok)return saved;return safeRealityReceipt(result,saved.state);
}

function publicView(result, action) {
  if (!result?.ok) return { ok: false, status: result?.status || 'PRIVATE_COMMAND_REFUSED', reasonCodes: result?.reasonCodes || ['private-command-failed'], businessEffectAuthority: 'NONE' };
  if (action === 'status') return { ok: true, status: result.status, summary: result.summary, businessEffectAuthority: 'NONE' };
  if (action === 'list') return { ok: true, status: result.status, records: result.records, hypotheses: result.hypotheses, edges: result.edges, businessEffectAuthority: 'NONE' };
  if (action === 'capture') return { ok: true, status: result.status, persisted: result.persisted, encryption: result.encryption, recordId: result.record?.id || null, willEventType: result.willEventType, promotionBoundary: result.promotionBoundary, businessEffectAuthority: 'NONE' };
  if (action === 'promote') return { ok: true, status: result.status, promotion: result.promotion, encryption: result.encryption, recordId: result.record?.id || null, promotionBoundary: result.promotionBoundary, businessEffectAuthority: 'NONE' };
  if (action === 'hypothesis') return { ok: true, status: result.status, hypothesis: result.hypothesis, encryption: result.encryption, businessEffectAuthority: 'NONE' };
  if (action === 'decision') return { ok: true, status: result.status, packet: result.packet, truthBoundary: result.truthBoundary, businessEffectAuthority: 'NONE' };
  if (action === 'delete') return { ok: true, status: result.status, encryption: result.encryption, deletedIds: result.deletedIds, derivedAlsoDeleted: result.derivedAlsoDeleted, prunedHypothesisCount: result.prunedHypothesisCount, prunedEdgeCount: result.prunedEdgeCount, guarantee: result.guarantee, businessEffectAuthority: 'NONE' };
  if (action === 'export') return { ok: true, status: result.status, exportWritten: result.exportWritten, exportDestination: result.exportDestination, encryption: result.encryption, recordCount: result.recordCount, hypothesisCount: result.hypothesisCount, edgeCount: result.edgeCount, stateDigest: result.stateDigest, completeness: result.completeness, businessEffectAuthority: 'NONE' };
  if (action === 'start_reality_cycle' || action === 'close_reality_cycle') return { ok:true,status:result.status,persisted:result.persisted,encryption:result.encryption,recordIds:result.recordIds,recordCount:result.recordCount,calibration:result.calibration,truthBoundary:result.truthBoundary,sovereigntyBoundary:result.sovereigntyBoundary,privateDataReturned:false,networkAuthority:'NONE',businessEffectAuthority:'NONE' };
  return { ok: true, status: result.status, businessEffectAuthority: 'NONE' };
}

export async function runFounderInteractiveSession({stdin=input,stdout=output,privateFilePath=process.env.UBERBOND_PRIVATE_LIFE_STORE||DEFAULT_PRIVATE_STATE_FILE,privateKey=process.env[PRIVATE_LIFE_KEY_ENV]||null,rlFactory=options=>readline.createInterface(options)}={}) {
  if (stdin?.isTTY !== true || stdout?.isTTY !== true) return { ok:false,status:'FOUNDER_PRESENCE_REQUIRED',reasonCodes:['interactive-tty-required'],businessEffectAuthority:'NONE' };
  const rl=rlFactory({input:stdin,output:stdout,terminal:true});
  try {
    stdout.write('UberBond private Personal Civilization operator. No network or autonomous entry point is authorized.\n');
    stdout.write('Durable private life state is authenticated ciphertext; the life key remains process-only.\n');
    stdout.write(`Type exactly: ${PRIVATE_OPERATOR_CONFIRMATION}\n`);
    const confirmation=await rl.question('> ');
    if(!founderPresenceSatisfied({stdinIsTTY:stdin.isTTY,stdoutIsTTY:stdout.isTTY,confirmation}))return{ok:false,status:'FOUNDER_PRESENCE_REQUIRED',reasonCodes:['founder-confirmation-mismatch'],businessEffectAuthority:'NONE'};
    const authorization=founderAuthorization(new Date());if(!authorization)return{ok:false,status:'FOUNDER_PRESENCE_REQUIRED',reasonCodes:['authorization-clock-invalid'],businessEffectAuthority:'NONE'};
    stdout.write('Authorized for this interactive process only. Enter one-line JSON commands. Actions: status, capture, promote, list, hypothesis, decision, start_reality_cycle, close_reality_cycle, delete, export. Type quit to close.\n');
    for(;;){const line=await rl.question('private> ');if(String(line).trim().toLowerCase()==='quit')return{ok:true,status:'PRIVATE_SESSION_CLOSED',businessEffectAuthority:'NONE'};let command;try{command=JSON.parse(line);}catch{stdout.write(`${JSON.stringify({ok:false,status:'PRIVATE_COMMAND_REFUSED',reasonCodes:['valid-json-command-required']})}\n`);continue;}const action=String(command?.action||'').trim().toLowerCase();const realityAction=action==='start_reality_cycle'||action==='close_reality_cycle';const result=realityAction?runPrivateRealityCommand({command:{...command,action:action.toUpperCase()},authorization,privateKey,filePath:privateFilePath}):runPrivateCommand({command,authorization,privateKey,filePath:privateFilePath});stdout.write(`${JSON.stringify(publicView(result,action),null,2)}\n`);}
  } finally { rl.close(); }
}

const isEntryPoint=Boolean(process.argv[1])&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isEntryPoint){const result=await runFounderInteractiveSession();if(!result.ok){console.error(JSON.stringify(result));process.exitCode=1;}}
