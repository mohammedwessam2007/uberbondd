import crypto from 'node:crypto';

export const UBER_SOCKET_DURABLE_STATE_VERSION='uberbond.uber-socket-durable-state.v1';
export const UBER_SOCKET_STATE_KEY='uberSocketWholeBrainStateV1';
const MAX_PEERS=5000;
const MAX_DOCS=50000;
const MAX_BYTES=32*1024*1024;

function canonical(value){
  if(Array.isArray(value)) return value.map(canonical);
  if(!value||typeof value!=='object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
}
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export function snapshotUberSocketState(runtime,{savedAt=new Date()}={}){
  if(!runtime?.mesh?.snapshot||!runtime?.fabric?.listPeerDocs) throw new TypeError('uber-socket-runtime-required');
  const snap=runtime.mesh.snapshot();
  if(snap.peers.length>MAX_PEERS) throw new Error('uber-socket-peer-persistence-limit');
  const documents=[];
  for(const peer of snap.peers){
    for(const doc of runtime.fabric.listPeerDocs(peer.peerId)){
      documents.push(doc);
      if(documents.length>MAX_DOCS) throw new Error('uber-socket-document-persistence-limit');
    }
  }
  const core={
    schema:UBER_SOCKET_DURABLE_STATE_VERSION,
    savedAt:new Date(savedAt).toISOString(),
    peers:snap.peers.map(p=>({peerId:p.peerId,conversationId:p.conversationId,metadata:{...p.metadata}})),
    documents:documents.map(d=>({...d,metadata:{...(d.metadata||{})}})),
    externalEffectsAuthorized:false,
  };
  const bytes=Buffer.byteLength(JSON.stringify(core),'utf8');
  if(bytes>MAX_BYTES) throw new Error('uber-socket-durable-state-size-limit');
  return Object.freeze({...core,bytes,digest:digest(core)});
}

function validateState(state){
  if(!state||state.schema!==UBER_SOCKET_DURABLE_STATE_VERSION||!Array.isArray(state.peers)||!Array.isArray(state.documents)) throw new Error('uber-socket-durable-state-invalid');
  if(state.peers.length>MAX_PEERS||state.documents.length>MAX_DOCS) throw new Error('uber-socket-durable-state-limit-invalid');
  const core={schema:state.schema,savedAt:state.savedAt,peers:state.peers,documents:state.documents,externalEffectsAuthorized:false};
  if(state.digest!==digest(core)) throw new Error('uber-socket-durable-state-digest-mismatch');
  if(Buffer.byteLength(JSON.stringify(core),'utf8')>MAX_BYTES) throw new Error('uber-socket-durable-state-size-limit');
  return core;
}

export async function persistUberSocketState({runtime,store}={}){
  if(!store?.setSetting||!store?.getSettings) throw new TypeError('settings-store-required');
  const state=snapshotUberSocketState(runtime);
  await store.setSetting(UBER_SOCKET_STATE_KEY,state);
  return Object.freeze({ok:true,status:'UBER_SOCKET_STATE_PERSISTED',peerCount:state.peers.length,documentCount:state.documents.length,bytes:state.bytes,digest:state.digest,savedAt:state.savedAt,externalEffectsAuthorized:false});
}

export async function restoreUberSocketState({runtime,store}={}){
  if(!runtime?.mesh?.registerChat||!runtime?.fabric?.ingest) throw new TypeError('uber-socket-runtime-required');
  if(!store?.setSetting||!store?.getSettings) throw new TypeError('settings-store-required');
  const settings=await store.getSettings();
  const raw=settings?.[UBER_SOCKET_STATE_KEY];
  if(!raw) return Object.freeze({ok:true,status:'UBER_SOCKET_STATE_EMPTY',peerCount:0,documentCount:0,externalEffectsAuthorized:false});
  const state=validateState(raw);
  let peersRestored=0,documentsRestored=0;
  for(const peer of state.peers){
    const existing=runtime.mesh.getPeer(peer.peerId);
    if(!existing){
      runtime.mesh.registerChat({
        peerId:peer.peerId,
        conversationId:peer.conversationId,
        projectId:peer.metadata?.projectId||'uberbond',
        title:peer.metadata?.title||'',
        tags:Array.isArray(peer.metadata?.tags)?peer.metadata.tags:[],
        metadata:{...peer.metadata},
      });
      peersRestored++;
    }
  }
  for(const doc of state.documents){
    const exists=runtime.fabric.listPeerDocs(doc.peerId).some(x=>x.docId===doc.docId);
    if(exists) continue;
    runtime.fabric.ingest({...doc,metadata:{...(doc.metadata||{})}});
    documentsRestored++;
  }
  return Object.freeze({ok:true,status:'UBER_SOCKET_STATE_RESTORED',peerCount:state.peers.length,documentCount:state.documents.length,peersRestored,documentsRestored,digest:raw.digest,savedAt:state.savedAt,externalEffectsAuthorized:false});
}
