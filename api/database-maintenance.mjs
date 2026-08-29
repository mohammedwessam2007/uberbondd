import { Pool } from 'pg';
import { authorizeVercelCronRequest } from '../src/agent-mesh-cron-boundary.mjs';
import { runSafeDatabaseHygiene } from '../src/database-hygiene-repository.mjs';

export const DATABASE_MAINTENANCE_SCHEDULE='37 2 * * 0';
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
let pool;
function getPool(env){if(!pool)pool=new Pool({connectionString:env.DATABASE_URL,max:1,idleTimeoutMillis:10000});return pool;}
function send(res,status,payload){if(typeof res.status==='function'&&typeof res.json==='function')return res.status(status).json(payload);res.writeHead(status,JSON_HEADERS);res.end(JSON.stringify(payload));}
function header(req,name){return req?.headers?.[name]??req?.headers?.[name.toLowerCase()]??'';}
export function createHandler(deps={}){const env=deps.env||process.env,poolFactory=deps.getPool||getPool,run=deps.runSafeDatabaseHygiene||runSafeDatabaseHygiene;return async function handler(req,res){
 const auth=authorizeVercelCronRequest({method:req?.method,authorizationHeader:header(req,'authorization'),cronSecret:env.CRON_SECRET,scheduleHeader:header(req,'x-vercel-cron-schedule'),expectedSchedule:DATABASE_MAINTENANCE_SCHEDULE});
 if(!auth.ok)return send(res,auth.httpStatus||401,{ok:false,status:'REFUSED',reasonCodes:auth.reasonCodes||['unauthorized-maintenance-cron'],businessEffectAuthority:'NONE'});
 if(String(env.MAINTENANCE_ENABLED||'').toLowerCase()!=='true')return send(res,200,{ok:true,status:'MAINTENANCE_DISABLED',deleted:{},businessEffectAuthority:'NONE',externalEffectLedger:{productionMutations:0}});
 if(!env.DATABASE_URL)return send(res,503,{ok:false,status:'REFUSED',reasonCodes:['database-url-required'],businessEffectAuthority:'NONE'});
 try{const result=await run(poolFactory(env),{now:new Date(),cacheRetentionDays:7,stagedRetentionDays:14,batchSize:500});return send(res,200,{...result,businessEffectAuthority:'INTERNAL_MAINTENANCE_ONLY',externalEffectLedger:{productionMutations:(result.deleted?.publicEvidenceCache||0)+(result.deleted?.stagedContent||0)}});}catch{return send(res,503,{ok:false,status:'REFUSED',reasonCodes:['database-hygiene-failed'],businessEffectAuthority:'NONE'});}
};}
export default createHandler();
