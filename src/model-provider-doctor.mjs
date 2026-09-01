import { describeProviderReadiness } from './agent-model-executor-factory.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MODEL_PROVIDER_DOCTOR_VERSION = 'uberbond.model-provider-doctor-1.0.0';

export function inspectModelProviderReadiness({ env = process.env, sandboxIsolationReceipt = null } = {}) {
  const providers = describeProviderReadiness({ env, sandboxIsolationReceipt });
  const ready = providers.filter(row => row.ready);
  const gateway = providers.find(row => row.provider === 'vercel-ai-gateway') || null;
  const apiReady = ready.filter(row => row.provider !== 'claude-code-sandbox');
  const blockers = providers.flatMap(row => row.blockers.map(code => `${row.provider}:${code}`));
  return {
    ok:true,
    policyVersion:MODEL_PROVIDER_DOCTOR_VERSION,
    status:ready.length ? (ready.length > 1 ? 'MULTI_ROUTE_READY' : 'SINGLE_ROUTE_READY') : 'CAPACITY_BLOCKED',
    providers,
    readyProviderCount:ready.length,
    readyApiProviderCount:apiReady.length,
    gatewayReady:gateway?.ready === true,
    failoverAvailable:ready.length > 1,
    terminalWhenExhausted:'ALL_ROUTES_EXHAUSTED',
    blockers,
    ownerActions:blockers.slice(0,3).map(blocker => ({
      action:`Resolve ${blocker}`,
      screen:'Protected runtime/provider configuration',
      minutes:5,
      cost:0,
      evidence:'Provider doctor reports ready:true without exposing any credential value.'
    })),
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}
  };
}
