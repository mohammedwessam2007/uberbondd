import crypto from 'node:crypto';
import { Pool } from 'pg';
import { compileSystemHealthMatrix } from '../../src/system-health-matrix.mjs';
import { readSystemHealthInputs } from '../../src/system-health-repository.mjs';
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
let pool;
function getPool(env){if(!pool)pool=new Pool({connectionString:env.DATABASE_URL,max:2,idleTimeoutMillis:10000});return pool;}
function send(res,status,payload){if(typeof res.status==='function'&&typeof res.json==='function')return res.status(status).json(payload);res.writeHead(status,JSON_HEADERS);res.end(JSON.stringify(payload));}
function equalBearer(header,secret){const expected=`Bearer ${secret}`;const a=Buffer.from(String(header||'')),b=Buffer.from(expected);return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);}
export function createHandler(deps={}){const env=deps.env||process.env, poolFactory=deps.getPool||getPool, read=deps.readSystemHealthInputs||readSystemHealthInputs;return async function handler(req,res){if(String(req?.method||'').toUpperCase()!=='GET')return send(res,405,{ok:false,status:'REFUSED'});if(!env.ADMIN_HEALTH_SECRET||!env.DATABASE_URL)return send(res,503,{ok:false,status:'REFUSED',reasonCodes:['admin-health-runtime-not-configured']});if(!equalBearer(req?.headers?.authorization,env.ADMIN_HEALTH_SECRET))return send(res,401,{ok:false,status:'REFUSED',reasonCodes:['unauthorized']});try{const inputs=await read(poolFactory(env));const out=compileSystemHealthMatrix({...inputs,now:new Date()});return send(res,out.ok?200:503,out);}catch{return send(res,503,{ok:false,status:'REFUSED',reasonCodes:['health-matrix-query-failed']});}}}
export default createHandler();
