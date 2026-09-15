import { config } from './config.mjs';
import { createStore } from './store.mjs';
import { createOutreach100kRuntime } from './outreach-100k-runtime.mjs';

const ROUTES=new Set([
  '/api/outbound/100k-certificate',
  '/api/outbound/100k-status',
  '/api/outbound/start-100k',
  '/api/outbound/resume-100k'
]);

function sendJson(res,status,payload){
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer'
  });
  res.end(JSON.stringify(payload));
}

function captureResponse(){
  let statusCode=200;const headers={};const chunks=[];
  return {
    res:{
      writeHead(status,nextHeaders={}){statusCode=status;for(const [k,v] of Object.entries(nextHeaders||{}))headers[String(k).toLowerCase()]=v;return this;},
      setHeader(key,value){headers[String(key).toLowerCase()]=value;},
      end(chunk){if(chunk!==undefined&&chunk!==null)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk)));}
    },
    snapshot(){return{statusCode,headers:{...headers},body:Buffer.concat(chunks).toString('utf8')};}
  };
}

async function adminAuthorized(coreHandler,req){
  const capture=captureResponse();
  const proxy={method:'GET',url:'/api/summary',headers:req.headers||{},socket:req.socket};
  try{await coreHandler(proxy,capture.res);}catch{return false;}
  return capture.snapshot().statusCode===200;
}

export function createOutreach100kAdminRouter({coreHandler,env=process.env,runtimeFactory=createOutreach100kRuntime}={}){
  if(typeof coreHandler!=='function')throw new Error('core-handler-required');
  let runtime=null;
  const getRuntime=()=>runtime||(runtime=runtimeFactory({config,createStore,env}));

  if(config.storeBackend==='postgres'&&env.UBERBOND_OUTREACH_100K_ENABLED==='1'&&env.UBERBOND_OUTREACH_100K_AUTORESUME!=='0'){
    queueMicrotask(()=>{void getRuntime().bootResume().catch(()=>{});});
  }

  return {
    async handle(req,res,url){
      if(!ROUTES.has(url.pathname))return false;
      if(!(await adminAuthorized(coreHandler,req))){sendJson(res,401,{error:'Unauthorized'});return true;}
      const rt=getRuntime();
      try{
        if(req.method==='GET'&&url.pathname==='/api/outbound/100k-certificate'){
          const result=await rt.certify();
          sendJson(res,result?.certificate?.state==='CERTIFIED_100K_READY'?200:409,result);
          return true;
        }
        if(req.method==='GET'&&url.pathname==='/api/outbound/100k-status'){
          sendJson(res,200,await rt.status());
          return true;
        }
        if(req.method==='POST'&&url.pathname==='/api/outbound/start-100k'){
          const result=await rt.start({authorizedBy:'FOUNDER_ADMIN_PRESS'});
          sendJson(res,result?.ok===true?202:409,result);
          return true;
        }
        if(req.method==='POST'&&url.pathname==='/api/outbound/resume-100k'){
          const result=await rt.resume();
          sendJson(res,result?.ok===true?202:409,result);
          return true;
        }
        sendJson(res,405,{error:'Method not allowed'});
        return true;
      }catch(error){
        sendJson(res,500,{error:'Certified 100K control failed',detail:String(error?.message||error).slice(0,500)});
        return true;
      }
    }
  };
}
