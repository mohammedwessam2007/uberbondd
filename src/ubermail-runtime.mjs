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
  repository=null
}={}){
  const store=repository||createFileUberMailRepository({filePath:statePath});
  const transport=createUberMailUberDosoTransport({governedDispatch});
  const api=createUberMailAgentApi({
    repository:store,
    sendTransport:transport,
    domainVerifier,
    webhookDispatcher,
    webhookMasterSecret,
    now
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
