import crypto from 'node:crypto';

export const UBERBUY_VERSION='uberbond.uberbuy-outreach-bom.v1';
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

const INTERNAL=Object.freeze([
 ['sequencer','UberBond Outreach Workbench / automation'],
 ['crm','UberBond prospect/opportunity/order state'],
 ['personalization','UberTruth + existing evidence-backed copy'],
 ['reply_classification','UberReply'],
 ['mail_api','UberMail'],
 ['smtp_client','UberSMTP'],
 ['mailbox_control','UberFleet + UberInboxes'],
 ['provider_adapter','UberRelay + UberMaildoso/provider adapters'],
 ['dns_dashboard','UberDNS'],
 ['warmup_dashboard','UberWarm + UberQuality'],
 ['analytics','UberEconomics + workbench analytics'],
 ['forms','Lead Intelligence first-party intake'],
 ['workflow_automation','UberBond scheduler/queue'],
 ['lead_search','Native Lead OS + public discovery'],
 ['enrichment_orchestration','Budgeted enrichment waterfall'],
 ['lookalikes','UberLookalike'],
 ['contact_hygiene_control','UberVerify evidence gate']
]);
function row(id,classification,status,detail,extra={}){
 return {id,classification,status,detail,...extra};
}
export function compileOutreachBuyList({
  domainsOwned=0,
  controlPlaneOwned=false,
  outboundSubstrate={},
  paymentRail={},
  regulatory={},
  publicContactSupply={},
  optionalModelProvider=false
}={}){
  const internal=INTERNAL.map(([id,detail])=>row(id,'INTERNAL','SATISFIED',detail,{monthlyPurchaseRequired:false}));
  const external=[];
  external.push(row('domains','OWNED_ASSET',Number(domainsOwned)>0?'SATISFIED':'BUY_REQUIRED',
    Number(domainsOwned)>0?`${Math.floor(Number(domainsOwned))} domain(s) already owned`:'At least one controlled sending domain is required',
    {monthlyPurchaseRequired:false,knownQuantity:Math.max(0,Math.floor(Number(domainsOwned)||0))}));
  external.push(row('control_plane','OWNED_OR_HOSTED',controlPlaneOwned?'SATISFIED':'BUY_OR_ACTIVATE_REQUIRED',
    controlPlaneOwned?'Existing control-plane compute is available':'A durable runtime/control plane is required',
    {monthlyPurchaseRequired:!controlPlaneOwned}));
  const substrateReady=outboundSubstrate?.acquired===true&&outboundSubstrate?.authorized===true&&outboundSubstrate?.configured===true;
  const substrateCashRequired=outboundSubstrate?.cashRequired===true;
  external.push(row('authorized_outbound_substrate','EXTERNAL_SUBSTRATE',substrateReady?'SATISFIED':substrateCashRequired?'BUY_REQUIRED':'ACQUIRE_OR_ACTIVATE_REQUIRED',
    substrateReady?'Authorized reputation-bearing sender substrate is connected':'Acquire or activate one provider-authorized reputation-bearing sending substrate',
    {monthlyPurchaseRequired:!substrateReady&&substrateCashRequired,cashRequirementKnown:typeof outboundSubstrate?.cashRequired==='boolean',candidate:clean(outboundSubstrate?.candidate,160)||null,observedPriceUsd:Number.isFinite(Number(outboundSubstrate?.observedPriceUsd))?Number(outboundSubstrate.observedPriceUsd):null}));
  const paymentReady=paymentRail?.live===true;
  external.push(row('payment_rail','EXTERNAL_FINANCIAL',paymentReady?'SATISFIED':'ACTIVATE_BEFORE_COLLECTION',
    paymentReady?'Live payment rail observed':'A real payment account/rail is required only before collecting buyer funds',
    {monthlyPurchaseRequired:false,transactionFeesExternal:true}));
  const regStatus=clean(regulatory?.status,80).toUpperCase()||'UNKNOWN';
  external.push(row('regulatory_clearance','EXTERNAL_REGULATORY',
    regStatus==='PASSED'?'SATISFIED':regStatus==='NOT_APPLICABLE'?'NOT_APPLICABLE':'OWNER_OR_REGULATORY_ACTION_REQUIRED',
    clean(regulatory?.detail,800)||'Campaign-specific legal/regulatory eligibility must be evidenced before cold outreach',
    {monthlyPurchaseRequired:false,knownFeeUsd:Number.isFinite(Number(regulatory?.knownFeeUsd))?Number(regulatory.knownFeeUsd):null}));
  const supplyStatus=clean(publicContactSupply?.status,80).toUpperCase();
  external.push(row('paid_lead_data','OPTIONAL_SUPPLIER',
    supplyStatus==='OBSERVED_MONTH_COVERED'?'NOT_REQUIRED':
      supplyStatus==='OBSERVED_ONE_DAY_COVERED'?'DEFER_BUY_MEASURE_FIRST':'OPTIONAL_UNTIL_EMPIRICAL_SHORTFALL_PROVEN',
    'Apollo/Hunter/Clay-style paid data is not mandatory while lawful public/owner contact supply can feed the experiment',
    {monthlyPurchaseRequired:false}));
  external.push(row('model_provider','OPTIONAL_SUPPLIER',optionalModelProvider?'OPTIONAL_CONNECTED':'OPTIONAL_NOT_REQUIRED',
    'External model API is replaceable compute, not a mandatory outreach SaaS purchase',{monthlyPurchaseRequired:false}));

  const actualBuy=external.filter(x=>x.status==='BUY_REQUIRED');
  const acquire=external.filter(x=>x.status==='ACQUIRE_OR_ACTIVATE_REQUIRED');
  const activation=external.filter(x=>['ACTIVATE_BEFORE_COLLECTION','OWNER_OR_REGULATORY_ACTION_REQUIRED'].includes(x.status));
  const summary={
    mandatoryNewPurchaseCount:actualBuy.length,
    mandatoryNewPurchaseIds:actualBuy.map(x=>x.id),
    externalAcquisitionCount:acquire.length,
    externalAcquisitionIds:acquire.map(x=>x.id),
    activationOnlyCount:activation.length,
    activationOnlyIds:activation.map(x=>x.id),
    internalReplacementCount:internal.length,
    recurringOutreachSaasRequired:actualBuy.filter(x=>x.id!=='authorized_outbound_substrate').length
  };
  return Object.freeze({
    version:UBERBUY_VERSION,status:actualBuy.length?'EXTERNAL_PURCHASE_REMAINS':acquire.length?'EXTERNAL_ACQUISITION_REMAINS':'NO_NEW_PURCHASE_REQUIRED',
    summary,internal,external,
    bomDigest:`sha256:${sha({summary,external})}`,
    truthBoundary:'UberBuy classifies requirements from supplied evidence. It cannot create domain ownership, provider authorization, regulatory approval, payment accounts, reputation, or live customer outcomes. UNKNOWN remains non-green.'
  });
}
