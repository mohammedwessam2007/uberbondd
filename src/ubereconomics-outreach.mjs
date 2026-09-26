export const UBERECONOMICS_OUTREACH_VERSION='uberbond.ubereconomics-outreach.v1';
const asArray=v=>Array.isArray(v)?v:[];
const cents=v=>Number.isFinite(Number(v))?Math.max(0,Math.round(Number(v))):0;
const lower=v=>String(v??'').trim().toLowerCase();
const STAGES=Object.freeze(['discovery','enrichment','verification','personalization','send','reply','qualified_conversation','payment','delivery']);
function divide(n,d){return d?Number((n/d).toFixed(2)):null;}
export function compileOutreachEconomics({
  prospects=[],messages=[],replies=[],orders=[],costReceipts=[],ownerMinutes=0
}={}){
  const costs=Object.fromEntries(STAGES.map(s=>[s,0]));
  const providers={};
  let unknownCostCount=0;
  for(const row of asArray(costReceipts)){
    const stage=lower(row?.stage);
    const known=Number.isFinite(Number(row?.costCents));
    if(!known){unknownCostCount++;continue;}
    const amount=cents(row.costCents);
    if(STAGES.includes(stage))costs[stage]+=amount;
    const provider=lower(row?.provider||'internal')||'internal';
    providers[provider]=(providers[provider]||0)+amount;
  }
  const verifiedContacts=asArray(prospects).filter(p=>['valid','verified','deliverable'].includes(lower(p?.contact?.verified||p?.contact?.verificationStatus))).length;
  const drafted=asArray(prospects).filter(p=>String(p?.draft||'').trim()).length;
  const sent=asArray(messages).length;
  const positiveIds=new Set(asArray(replies).filter(r=>lower(r?.classification?.label||r?.label)==='positive').map(r=>r?.prospectId).filter(Boolean));
  for(const p of asArray(prospects))if(lower(p?.replyLabel)==='positive')positiveIds.add(p.id);
  const qualifiedIds=new Set(asArray(prospects).filter(p=>['opportunity','meeting','offer','invoice','paid','delivery','accepted','recurring'].includes(lower(p?.opportunityStage))).map(p=>p.id).filter(Boolean));
  const cleared=asArray(orders).filter(o=>['paid','settled','cleared','completed'].includes(lower(o?.status))||/paid|settled|cleared|completed/.test(lower(o?.eventName)));
  const clearedRevenueCents=cleared.reduce((s,o)=>s+cents(o?.amountCents),0);
  const totalCostCents=Object.values(costs).reduce((a,b)=>a+b,0);
  const suppliedCostReceipts=asArray(costReceipts).length;
  const costCoverageStatus=suppliedCostReceipts===0?'NO_COST_RECEIPTS':unknownCostCount>0?'PARTIAL_COST_COVERAGE':'COST_RECEIPTS_COMPLETE_FOR_SUPPLIED_EVENTS';
  const contributionCents=clearedRevenueCents-totalCostCents;
  const minutes=Number.isFinite(Number(ownerMinutes))?Math.max(0,Number(ownerMinutes)):0;
  return Object.freeze({
    version:UBERECONOMICS_OUTREACH_VERSION,
    counts:{prospects:asArray(prospects).length,verifiedContacts,drafted,sent,positiveReplies:positiveIds.size,qualifiedConversations:qualifiedIds.size,clearedPayments:cleared.length},
    costs:{byStage:costs,byProvider:providers,totalCostCents,unknownCostCount,suppliedCostReceipts,costCoverageStatus},
    unitEconomics:{
      costPerVerifiedContactCents:divide(totalCostCents,verifiedContacts),
      costPerDraftCents:divide(totalCostCents,drafted),
      costPerSendCents:divide(totalCostCents,sent),
      costPerPositiveReplyCents:divide(totalCostCents,positiveIds.size),
      costPerQualifiedConversationCents:divide(totalCostCents,qualifiedIds.size),
      costPerClearedPaymentCents:divide(totalCostCents,cleared.length)
    },
    revenue:{clearedRevenueCents,contributionCents,contributionProfitPerOwnerMinuteCents:minutes?divide(contributionCents,minutes):null},
    truthBoundary:'A zero total is not evidence of zero real-world cost when costCoverageStatus=NO_COST_RECEIPTS or PARTIAL_COST_COVERAGE. Only supplied cost receipts count as cost and only cleared/settled/paid/completed order evidence counts as revenue. Sends, replies and opportunities never become revenue by inference.'
  });
}
