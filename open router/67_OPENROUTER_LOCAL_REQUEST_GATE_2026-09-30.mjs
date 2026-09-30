export function validateOpenRouterLocalRequest(payload,{requireZdr=true}={}){
  if(!payload||typeof payload.model!=='string'||!Array.isArray(payload.messages)||payload.messages.length<1) throw new Error('bounded-chat-payload-required');
  if(!Number.isSafeInteger(payload.maxTokens)||payload.maxTokens<1||payload.maxTokens>4096) throw new Error('bounded-max-tokens-required');
  if(requireZdr&&(payload.providerPolicy?.zdr===false||payload.providerPolicy?.data_collection==='allow')) throw new Error('privacy-policy-cannot-loosen-zdr-or-data-collection-deny');
  if(payload.providerPolicy?.require_parameters===false) throw new Error('provider-policy-cannot-disable-required-parameter-support');
  return true;
}
