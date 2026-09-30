export const INFINITE_OPUS_ACTIVATION_DIAGNOSTIC_VERSION='uberbond.infinite-opus.activation-diagnostic.v1';

const text=v=>typeof v==='string'?v.trim():'';
const parseObject=raw=>{
  try{
    const v=JSON.parse(String(raw||''));
    return v&&typeof v==='object'&&!Array.isArray(v)?v:null;
  }catch{return null;}
};
const currentMonth=now=>new Date(now).toISOString().slice(0,7);

export function inspectInfiniteOpusActivationEnvironment(env=process.env,{now=Date.now()}={}){
  const blockers=[];
  const openRouterKeyPresent=text(env.OPENROUTER_API_KEY).length>=16;
  const gatewayTokenPresent=text(env.UBERMIND_TYPINGMIND_GATEWAY_TOKEN).length>=32;
  if(!openRouterKeyPresent)blockers.push('runtime-openrouter-key-absent');
  if(!gatewayTokenPresent)blockers.push('typingmind-gateway-token-absent');

  const paid=parseObject(env.INFINITE_OPUS_PAID_AUTHORIZATION_JSON);
  const paidPresent=Boolean(paid);
  const paidCurrent=Boolean(
    paid &&
    text(paid.evidenceRef) &&
    paid.month===currentMonth(now) &&
    paid.maxMonthlyMicrousd===20_000_000 &&
    Number.isFinite(Date.parse(paid.expiresAt)) &&
    Date.parse(paid.expiresAt)>now &&
    Array.isArray(paid.crownRoutes) &&
    paid.crownRoutes.includes('openrouter:anthropic/claude-opus-5.5')
  );
  if(!paidPresent)blockers.push('paid-authorization-absent');
  else if(!paidCurrent)blockers.push('paid-authorization-not-current-or-not-bounded');

  const crown=parseObject(env.INFINITE_OPUS_CROWN_ADMISSION_JSON);
  const crownPresent=Boolean(crown);
  const crownCurrent=Boolean(
    crown &&
    crown.exactModelId==='anthropic/claude-opus-5.5' &&
    crown.taskClassRole==='GENERAL_CROWN' &&
    crown.routeIdentity==='openrouter:auto-provider-zdr-deny-required-parameters-v1' &&
    Number.isFinite(Date.parse(crown.expiresAt)) &&
    Date.parse(crown.expiresAt)>now
  );
  if(!crownPresent)blockers.push('crown-admission-absent');
  else if(!crownCurrent)blockers.push('crown-admission-not-current-or-route-mismatched');

  return {
    schemaVersion:INFINITE_OPUS_ACTIVATION_DIAGNOSTIC_VERSION,
    status:blockers.length?'INFINITE_OPUS_ACTIVATION_ENV_BLOCKED':'INFINITE_OPUS_ACTIVATION_ENV_PRESENT_AND_CURRENT',
    blockers,
    runtimeOpenRouterKeyPresent:openRouterKeyPresent,
    typingMindGatewayTokenPresent:gatewayTokenPresent,
    paidAuthorization:{present:paidPresent,current:paidCurrent,month:paid?.month??null,maxMonthlyMicrousd:paid?.maxMonthlyMicrousd??null},
    crownAdmission:{present:crownPresent,current:crownCurrent,model:crown?.exactModelId??null,taskClassRole:crown?.taskClassRole??null},
    secretValuesExposed:false,
    providerCallPerformed:false,
    spendAuthorizedByDiagnostic:false
  };
}
