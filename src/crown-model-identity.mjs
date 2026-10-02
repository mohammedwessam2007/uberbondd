export const OPUS_CANONICAL_REVISION='anthropic/claude-opus-5.5-20260921';
// Exact alias/revision/provider binding observed in generation gen-1790818164-26mCkGn04RIvzS7rK3hE.
// A later revision or another provider requires fresh evidence; prefix matching is forbidden.
export const SOL_CANONICAL_REVISION='openai/gpt-6.1-sol-pro-20260929';
// Observed via strict Azure routing in gen-1790892555-BOCiTbz8qFX9HAnXIRR3.
export function verifyCrownProviderModel({requestedModel,observedModel,provider}={}){
 if(requestedModel==='anthropic/claude-opus-5.5')return observedModel===OPUS_CANONICAL_REVISION && provider==='Amazon Bedrock';
 if(requestedModel==='openai/gpt-6.1-sol-pro')return observedModel===SOL_CANONICAL_REVISION && provider==='Azure';
 return requestedModel===observedModel;
}
