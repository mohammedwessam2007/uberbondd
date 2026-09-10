import net from 'node:net';
import { constantTimeTokenEqual } from './sovereign-founder-console.mjs';

export const SOVEREIGN_FOUNDER_PRIVATE_GATEWAY_VERSION='uberbond.sovereign-founder-private-gateway.v1';
const LOOPBACKS=new Set(['127.0.0.1','::1','localhost']);
const fail=reason=>({ok:false,status:'FOUNDER_PRIVATE_GATEWAY_BINDING_REFUSED',reasonCodes:[reason],publicExposureAuthorized:false,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'});
const cleanHost=value=>String(value??'').trim().replace(/^\[|\]$/g,'').toLowerCase();

export function classifyFounderPrivateHost(value){
  const host=cleanHost(value);
  if(LOOPBACKS.has(host))return'LOOPBACK';
  const family=net.isIP(host);
  if(family===4){
    const [a,b]=host.split('.').map(Number);
    if(a===10)return'RFC1918';
    if(a===172&&b>=16&&b<=31)return'RFC1918';
    if(a===192&&b===168)return'RFC1918';
    if(a===100&&b>=64&&b<=127)return'CGNAT_PRIVATE_TUNNEL';
    return'PUBLIC_OR_UNSUPPORTED';
  }
  if(family===6){
    if(host.startsWith('fc')||host.startsWith('fd'))return'IPV6_ULA';
    return'PUBLIC_OR_UNSUPPORTED';
  }
  return'PUBLIC_OR_UNSUPPORTED';
}

export function compileFounderPrivateGatewayBinding({host='',port=8788,token=''}={}){
  const normalizedHost=cleanHost(host);
  const hostClass=classifyFounderPrivateHost(normalizedHost);
  if(hostClass==='PUBLIC_OR_UNSUPPORTED')return fail('private-or-loopback-founder-gateway-host-required');
  const p=Number(port);
  if(!Number.isSafeInteger(p)||p<1||p>65535)return fail('valid-founder-private-gateway-port-required');
  const secret=String(token||'');
  if(Buffer.byteLength(secret,'utf8')<32)return fail('founder-private-gateway-256-bit-token-required');
  return{ok:true,status:hostClass==='LOOPBACK'?'FOUNDER_PRIVATE_GATEWAY_LOOPBACK_TEST_BINDING':'FOUNDER_PRIVATE_GATEWAY_PRIVATE_NETWORK_AUTH_REQUIRED',host:normalizedHost,hostClass,port:p,tokenRequired:true,publicExposureAuthorized:false,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'Private founder gateway only. It grants no merge, signing, deployment, customer, payment, DNS, credential, production, or Personal Civilization vault authority.'};
}

export function founderGatewayTokenFromAuthorization(header=''){
  const raw=String(header||'').trim();
  const bearer=raw.match(/^Bearer\s+(.+)$/i);
  if(bearer)return bearer[1];
  const basic=raw.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if(!basic)return'';
  try{
    const decoded=Buffer.from(basic[1],'base64').toString('utf8');
    const split=decoded.indexOf(':');
    if(split<0||decoded.slice(0,split)!=='founder')return'';
    return decoded.slice(split+1);
  }catch{return'';}
}

export function founderGatewayAuthorized(expectedToken,authorizationHeader){
  return constantTimeTokenEqual(expectedToken,founderGatewayTokenFromAuthorization(authorizationHeader));
}
