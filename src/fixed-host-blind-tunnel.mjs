import tls from 'node:tls';
import { Duplex } from 'node:stream';

const clean=(v,n=2000)=>String(v??'').trim().slice(0,n);

class WebSocketDuplex extends Duplex {
  constructor(ws){
    super();
    this.ws=ws;
    ws.binaryType='arraybuffer';
    ws.addEventListener('message',event=>{
      try{
        const value=event.data;
        if(value instanceof ArrayBuffer)this.push(Buffer.from(value));
        else if(ArrayBuffer.isView(value))this.push(Buffer.from(value.buffer,value.byteOffset,value.byteLength));
        else if(typeof value==='string')this.push(Buffer.from(value));
        else if(value?.arrayBuffer)value.arrayBuffer().then(x=>this.push(Buffer.from(x))).catch(error=>this.destroy(error));
      }catch(error){this.destroy(error);}
    });
    ws.addEventListener('close',()=>this.push(null));
    ws.addEventListener('error',()=>this.destroy(new Error('blind-tunnel-websocket-error')));
  }
  _read(){}
  _write(chunk,_encoding,callback){
    try{
      if(this.ws.readyState!==1)return callback(new Error('blind-tunnel-websocket-not-open'));
      this.ws.send(chunk);callback();
    }catch(error){callback(error);}
  }
  _destroy(error,callback){
    try{this.ws.close();}catch{}
    callback(error);
  }
}

function waitForOpen(ws,timeoutMs){
  return new Promise((resolve,reject)=>{
    if(ws.readyState===1)return resolve();
    const timer=setTimeout(()=>reject(new Error('blind-tunnel-open-timeout')),timeoutMs);
    const opened=()=>{cleanup();resolve();};
    const failed=()=>{cleanup();reject(new Error('blind-tunnel-open-failed'));};
    const cleanup=()=>{clearTimeout(timer);ws.removeEventListener('open',opened);ws.removeEventListener('error',failed);ws.removeEventListener('close',failed);};
    ws.addEventListener('open',opened,{once:true});
    ws.addEventListener('error',failed,{once:true});
    ws.addEventListener('close',failed,{once:true});
  });
}

export function inspectBlindTunnelConfig({url='',token='',allowedHost='',targetHost='',targetPort=0}={}){
  const reasons=[];
  const u=clean(url,2000),t=clean(token,1000),allowed=clean(allowedHost,253).toLowerCase(),host=clean(targetHost,253).toLowerCase(),port=Number(targetPort);
  if(!/^wss:\/\//i.test(u))reasons.push('wss-tunnel-url-required');
  if(!t)reasons.push('tunnel-token-required');
  if(!allowed||allowed!==host)reasons.push('target-host-not-authorized');
  if(port!==465)reasons.push('target-port-not-authorized');
  return {ok:reasons.length===0,status:reasons.length?'BLIND_TUNNEL_REFUSED':'BLIND_TUNNEL_READY',reasonCodes:reasons,url:u,allowedHost:allowed,targetHost:host,targetPort:port};
}

export async function connectTlsThroughBlindWebSocketTunnel({
  url='',token='',allowedHost='',targetHost='',targetPort=465,connectTimeoutMs=10000,
  WebSocketCtor=globalThis.WebSocket,tlsConnect=tls.connect
}={}){
  const check=inspectBlindTunnelConfig({url,token,allowedHost,targetHost,targetPort});
  if(!check.ok)throw new Error(check.reasonCodes.join(','));
  if(typeof WebSocketCtor!=='function')throw new Error('websocket-runtime-unavailable');
  const protocol=`ubt.${clean(token,1000)}`;
  const ws=new WebSocketCtor(check.url,[protocol]);
  await waitForOpen(ws,connectTimeoutMs);
  const carrier=new WebSocketDuplex(ws);
  return await new Promise((resolve,reject)=>{
    const socket=tlsConnect({
      socket:carrier,
      servername:check.targetHost,
      rejectUnauthorized:true
    });
    const timer=setTimeout(()=>{socket.destroy();reject(new Error('smtp-tunnel-tls-timeout'));},connectTimeoutMs);
    socket.once('secureConnect',()=>{clearTimeout(timer);resolve(socket);});
    socket.once('error',error=>{clearTimeout(timer);reject(error);});
  });
}

export const BLIND_TUNNEL_TRUTH_BOUNDARY='The tunnel transports only the inner TLS byte stream. SMTP credentials and message plaintext remain inside the originating runtime and the authenticated Winnr TLS session.';
