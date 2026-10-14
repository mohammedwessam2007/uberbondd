import path from 'node:path';
import { createUberMailAgentApi } from './ubermail-agent-api.mjs';
import { createUberMailAgentHttp } from './ubermail-agent-http.mjs';
import { createFileUberMailRepository } from './ubermail-file-repository.mjs';
import { createUberMailUberDosoTransport } from './ubermail-uberdoso-bridge.mjs';

export const UBERMAIL_RUNTIME_VERSION='uberbond.ubermail-runtime.v1';

export function defaultUberMailStatePath({env=process.env,cwd=process.cwd()}={}){
  const explicit=String(env?.UBERMAIL_STATE_PATH||'').trim();
  if(explicit)return path.resolve(explicit);
  const root=String(env?.UBERLIT_RUNTIME_ROOT||'').trim();
  if(root)return path.resolve(root,'state','ubermail-agent-api.json');
  return path.resolve(cwd,'.data','ubermail-agent-api.json');
}

export function createUberMailRuntime({
  statePath=defaultUberMailStatePath(),
  governedDispatch=null,
  domainVerifier=null,
  webhookDispatcher=null,
  webhookMasterSecret='',
  now=()=>new Date(),
  repository=null,
  outboundRoute=null,
  outboundAuthorizationFn=null,
  outboundConsentVerifier=undefined
}={}){
  const store=repository||createFileUberMailRepository({filePath:statePath});
  // Wiring only: the route, package supplier and consent verifier are forwarded unchanged. No default package source exists here,
  // so a runtime built without an explicit supplier refuses every outbound send at the API gate and again at the bridge.
  const transport=createUberMailUberDosoTransport({governedDispatch,outboundRoute,outboundConsentVerifier});
  const api=createUberMailAgentApi({
    repository:store,
    sendTransport:transport,
    domainVerifier,
    webhookDispatcher,
    webhookMasterSecret,
    now,
    outboundRoute,
    outboundAuthorizationFn,
    outboundConsentVerifier
  });
  const http=createUberMailAgentHttp({api});
  return {
    version:UBERMAIL_RUNTIME_VERSION,
    statePath:store.filePath||statePath,
    api,
    http,
    async bootstrapRootKey(options={}){return api.bootstrapRootKey(options);},
    async status(){
      const [health,capabilities]=await Promise.all([api.health(),api.capabilityMatrix()]);
      return{
        ok:true,
        version:UBERMAIL_RUNTIME_VERSION,
        statePath:store.filePath||statePath,
        health,
        capabilities,
        externalEffectAuthority:'NONE',
        truthBoundary:'Runtime availability proves the private mailbox API and durable state are reachable. It does not prove a live mail host, DNS, provider acceptance, reputation, capacity or send authorization.'
      };
    }
  };
}
