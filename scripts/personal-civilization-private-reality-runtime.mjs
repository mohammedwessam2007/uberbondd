import {
  DEFAULT_PRIVATE_STATE_FILE,
  loadPrivateState,
  savePrivateState
} from '../src/personal-civilization-private-operator.mjs';
import {
  compilePrivateRealityCycle,
  closePrivateRealityCycle
} from './personal-civilization-private-reality-cycle.mjs';

export const PERSONAL_CIVILIZATION_PRIVATE_REALITY_RUNTIME_VERSION='uberbond.personal-civilization-private-reality-runtime.v1';
const ZERO=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const fail=(status,reasonCodes,extra={})=>({ok:false,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],version:PERSONAL_CIVILIZATION_PRIVATE_REALITY_RUNTIME_VERSION,businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO},...extra});

function safeReceipt(result,persistedState){return{ok:true,status:result.status,version:PERSONAL_CIVILIZATION_PRIVATE_REALITY_RUNTIME_VERSION,persisted:true,encryption:'AES-256-GCM',recordIds:result.recordIds?structuredClone(result.recordIds):null,recordCount:Array.isArray(persistedState?.records)?persistedState.records.length:null,hypothesisCount:Array.isArray(persistedState?.hypotheses)?persistedState.hypotheses.length:null,edgeCount:Array.isArray(persistedState?.edges)?persistedState.edges.length:null,calibration:result.calibration?{observed:result.calibration.score?.observed||null,observedAt:result.calibration.score?.observedAt||null,assignedProbability:result.calibration.score?.assignedProbability??null,brierScore:result.calibration.score?.brierScore??null,decisionQuality:result.calibration.decisionQuality?.quality||null,separation:result.calibration.separation||null}:null,truthBoundary:result.truthBoundary||null,sovereigntyBoundary:result.sovereigntyBoundary||null,privateDataReturned:false,networkAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};}

export function runPrivateRealityCommand({command={},authorization=null,privateKey=null,filePath=DEFAULT_PRIVATE_STATE_FILE,repoRoot=undefined,now=new Date()}={}){
  const action=String(command?.action||'').trim().toUpperCase();
  if(!['START_REALITY_CYCLE','CLOSE_REALITY_CYCLE'].includes(action))return fail('PCE_PRIVATE_REALITY_RUNTIME_REFUSED',['action-must-be-start-or-close-reality-cycle']);
  const loadArgs={filePath,authorization,privateKey};if(repoRoot!==undefined)loadArgs.repoRoot=repoRoot;
  const loaded=loadPrivateState(loadArgs);if(!loaded.ok)return loaded;
  let result;
  if(action==='START_REALITY_CYCLE'){
    result=compilePrivateRealityCycle({store:loaded.state.records,authorization,privateDestination:loaded.filePath,sourceRecordIds:command.sourceRecordIds,scientificExperiment:command.scientificExperiment,decision:command.decision,founderChoice:command.founderChoice,choiceForecast:command.choiceForecast,observedOutcome:null,now});
  }else{
    result=closePrivateRealityCycle({store:loaded.state.records,authorization,privateDestination:loaded.filePath,forecastRecordId:command.forecastRecordId,observedOutcome:command.observedOutcome});
  }
  if(!result.ok)return result;
  const nextState={...loaded.state,records:result.store};
  const saveArgs={state:nextState,filePath:loaded.filePath,authorization,privateKey,now};if(repoRoot!==undefined)saveArgs.repoRoot=repoRoot;
  const saved=savePrivateState(saveArgs);if(!saved.ok)return saved;
  return safeReceipt(result,saved.state);
}
