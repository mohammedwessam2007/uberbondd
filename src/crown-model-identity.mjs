export const OPUS_CANONICAL_REVISION='anthropic/claude-opus-5.5-20260921';
// Exact alias/revision/provider binding observed in generation gen-1790818164-26mCkGn04RIvzS7rK3hE.
// A later revision or another provider requires fresh evidence; prefix matching is forbidden.
export function verifyCrownProviderModel({requestedModel,observedModel,provider}={}){
 if(requestedModel==='anthropic/claude-opus-5.5')return observedModel===OPUS_CANONICAL_REVISION && provider==='Amazon Bedrock';
 return requestedModel===observedModel;
}
