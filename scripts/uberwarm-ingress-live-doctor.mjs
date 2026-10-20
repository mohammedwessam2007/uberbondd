#!/usr/bin/env node
/** Real, read-only provider+canonical Neon fence. Never prints credentials. */
import { evaluateIngressFence, readIngressHealth, DEFAULT_INGRESS_URL } from '../src/uberwarm-ingress-fence.mjs';
const token=process.env.WINNR_API_TOKEN;
const url='https://api.winnr.app/v1/webhooks/c9a55j1XPPu86ioRR0zv';
let webhook=null;
if (token) {
  try {
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
    const json=response.ok?await response.json():null;
    if (response.status===200) webhook=json?.data||json;
  } catch {} // A provider outage means a HOLD, never an empty event list.
}
const ingressHealth=await readIngressHealth({url:DEFAULT_INGRESS_URL});
const canonicalReconciliation=Number.isSafeInteger(ingressHealth?.canonicalReconciledAdverseEventCount)
  ? {reconciledAdverseEventCount:ingressHealth.canonicalReconciledAdverseEventCount}:null;
const decision=evaluateIngressFence({ingressHealth,webhook,canonicalReconciliation});
console.log(JSON.stringify({state:decision.state,reasons:decision.holdReasonCodes,
 webhook: webhook?{id:webhook.id,status:webhook.status,urlMatches:webhook.url===DEFAULT_INGRESS_URL,
 consecutiveFailures:webhook.consecutive_failures,adverseSubscribed:['email.bounced','email.complained'].every(x=>webhook.events?.includes(x))}:null,
 ingress: ingressHealth?{httpReady:ingressHealth.httpReady,signingConfigured:ingressHealth.signingConfigured,
 databaseReadback:ingressHealth.databaseReadback,adverseEventCount:ingressHealth.adverseEventCount,
 canonicalReconciledAdverseEventCount:ingressHealth.canonicalReconciledAdverseEventCount,
 canonicalSuppressionReconciled:ingressHealth.canonicalSuppressionReconciled}:null,
 sendAuthority:'NONE',customerEmailsSent:0},null,2));
process.exitCode=decision.state==='CLEAR'?0:2;
