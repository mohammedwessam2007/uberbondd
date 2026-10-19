/** Exact public capability routes for the shared Node server and Vercel Node preset.
 * The delegated handlers retain HMAC/token verification and transactional writes.
 * No generic API/admin route is made public and no outgoing mail is dispatched.
 */
import webhookHandler from '../api/webhooks/winnr.mjs';
import unsubscribeHandler from '../api/unsubscribe.mjs';

export function createUberWarmNodePublicRouter({webhook=webhookHandler,unsubscribe=unsubscribeHandler}={}) {
  if(typeof webhook!=='function'||typeof unsubscribe!=='function')throw Error('capability-handlers-required');
  return async function route(req,res) {
    let path;
    try{path=new URL(req.url,'http://uberbond.local').pathname;}catch{return false;}
    if(path==='/api/webhooks/winnr'){await webhook(req,res);return true;}
    if(path==='/api/unsubscribe'){await unsubscribe(req,res);return true;}
    return false;
  };
}
export const routeUberWarmNodePublicCapability=createUberWarmNodePublicRouter();
