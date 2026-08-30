import crypto from 'node:crypto';
import { Pool } from 'pg';
import { compileSystemHealthMatrix } from '../../src/system-health-matrix.mjs';
import { readSystemHealthInputs } from '../../src/system-health-repository.mjs';
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
let pool;
function getPool(env){if(!pool)pool=new Pool({connectionString:env.DATABASE_URL,max:2,idleTimeoutMillis:10000});return pool;}
function send(res,status,payload){if(typeof res.status==='function'&&typeof res.json==='function')return res.status(status).json(payload);res.writeHead(status,JSON_HEADERS);res.end(JSON.stringify(payload));}
// A header is a string, or it is nothing.
//
// This used to coerce with String(header||''), which accepts anything that can
// describe itself -- an object with a toString returned the right bearer and was
// admitted. Not reachable over HTTP, where headers are only strings or arrays of
// strings, so this was never a live bypass. It is fixed because the coercion was
// doing work nobody asked it to do, and because src/agent-mesh-cron-boundary.mjs
// already had the right shape one file over: normalize to a string or empty, and
// refuse a non-string outright rather than by accident.
//
// A single-element array is accepted the way that boundary accepts it: Node can
// present a repeated header as an array, and one value is unambiguous. Several
// values are not, and are refused.
function bearerHeader(value){
 if(Array.isArray(value)) return value.length===1&&typeof value[0]==='string'?value[0]:'';
 return typeof value==='string'?value:'';
}
function equalBearer(header,secret){const expected=`Bearer ${secret}`;const a=Buffer.from(bearerHeader(header)),b=Buffer.from(expected);return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);}
export function createHandler(deps={}){const env=deps.env||process.env, poolFactory=deps.getPool||getPool, read=deps.readSystemHealthInputs||readSystemHealthInputs;return async function handler(req,res){if(String(req?.method||'').toUpperCase()!=='GET')return send(res,405,{ok:false,status:'REFUSED'});if(!env.ADMIN_HEALTH_SECRET||!env.DATABASE_URL)return send(res,503,{ok:false,status:'REFUSED',reasonCodes:['admin-health-runtime-not-configured']});if(!equalBearer(req?.headers?.authorization,env.ADMIN_HEALTH_SECRET))return send(res,401,{ok:false,status:'REFUSED',reasonCodes:['unauthorized']});try{const inputs=await read(poolFactory(env));const out=compileSystemHealthMatrix({...inputs,now:new Date()});return send(res,out.ok?200:503,out);}catch{return send(res,503,{ok:false,status:'REFUSED',reasonCodes:['health-matrix-query-failed']});}}}
export default createHandler();
