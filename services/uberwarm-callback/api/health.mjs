export default async function handler(req,res){
 if(req.method!=='GET'){res.statusCode=405;res.end('Method not allowed');return;}
 res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');
 res.end(JSON.stringify({ok:true,service:'uberwarm-callback',version:'1',sendAuthority:'NONE',webhookSecretConfigured:!!process.env.WINNR_WEBHOOK_SECRET,databaseConfigured:!!process.env.DATABASE_URL}));
}
