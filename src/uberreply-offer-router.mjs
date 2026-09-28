import {
  compileUberReplyCampaignDecision,
  compileUberReplyPortfolioDecision
} from './uberreply-four-offer-genome.mjs';

export const UBERREPLY_RUNTIME_OFFER_ROUTER_VERSION='uberbond.uberreply-runtime-offer-router.v1';

export function compileUberReplyRuntimeOfferDecision({
  campaign={},
  prospect={},
  research={},
  sequencePosition=1,
  minimumFit=0.55
}={}){
  if(campaign?.offerId){
    const pinned=compileUberReplyCampaignDecision({
      offerId:campaign.offerId,
      prospect,
      research,
      sequencePosition,
      minimumFit
    });
    return{
      ...pinned,
      version:UBERREPLY_RUNTIME_OFFER_ROUTER_VERSION,
      routingMode:'PINNED',
      offer:pinned.offer||null,
      selectedOfferId:pinned.offer?.offerId||null,
      automaticOfferMutationAuthorized:false,
      externalEffectAuthority:'NONE',
      businessEffectAuthority:'NONE'
    };
  }

  if(campaign?.autoRouteOffer===true){
    const routed=compileUberReplyPortfolioDecision({
      prospect,
      research,
      sequencePosition,
      minimumFit
    });
    const offer=routed?.selection?.offer||null;
    const ok=routed?.state==='UBERREPLY_PORTFOLIO_DECISION_READY'&&Boolean(offer);
    return{
      ...routed,
      ok,
      version:UBERREPLY_RUNTIME_OFFER_ROUTER_VERSION,
      routingMode:'AUTO_EVIDENCE_ROUTED',
      offer,
      selectedOfferId:offer?.offerId||null,
      reasonCodes:ok?[]:(routed?.reasonCodes||['no-strong-offer-fit']),
      automaticOfferMutationAuthorized:false,
      externalEffectAuthority:'NONE',
      businessEffectAuthority:'NONE',
      truthBoundary:'Auto-routing chooses only among the existing four bounded offer families using supplied evidence. It cannot invent a fifth offer, contact anyone, spend, or override downstream legal/sender/authorization gates.'
    };
  }

  return{
    ok:true,
    version:UBERREPLY_RUNTIME_OFFER_ROUTER_VERSION,
    state:'UBERREPLY_OFFER_ROUTING_NOT_REQUESTED',
    routingMode:'NONE',
    offer:null,
    selectedOfferId:null,
    reasonCodes:[],
    automaticOfferMutationAuthorized:false,
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'Legacy campaigns without a pinned or explicitly auto-routed offer retain legacy behavior.'
  };
}
