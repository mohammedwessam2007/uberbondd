import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import {
  amendConstitution,
  constitutionalSelfDestruction,
  existentialChecksum
} from './constitutional-governance.mjs';

export const MOONSHOT_SOVEREIGNTY_GOVERNOR_VERSION='uberbond.moonshot-sovereignty-governor.v1';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const text=(v,max=2000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const fail=(status,reasons,extra={})=>envelope({ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],...extra});

export function governMoonshotAction({
  actionId,description,
  externalEffects=false,
  consequential=false,
  irreversible=false,
  ownerAuthorization='NONE',
  constitutionalChange=null
}={}){
  const id=text(actionId,160),desc=text(description,2400);
  if(!id||!desc) return fail('SOVEREIGN_ACTION_INVALID',['action-id-and-description-required']);

  let amendment=null;
  if(constitutionalChange){
    amendment=amendConstitution({
      oldRule:constitutionalChange.oldRule,
      newRule:constitutionalChange.newRule,
      sovereigntyGained:constitutionalChange.sovereigntyGained||[],
      sovereigntyLost:Array.isArray(constitutionalChange.sovereigntyLost)?constitutionalChange.sovereigntyLost:null,
      reversible:constitutionalChange.reversible,
      adversarialReview:constitutionalChange.adversarialReview
    });
    if(!amendment.ok) return fail('SOVEREIGN_ACTION_BLOCKED',['constitutional-amendment-not-prepared'],{amendment});
  }

  const needsOwner=Boolean(externalEffects||consequential||irreversible||constitutionalChange);
  const ownerPresented=ownerAuthorization==='OWNER_AUTHORIZED';
  if(needsOwner&&!ownerPresented){
    return fail('SOVEREIGN_ACTION_OWNER_AUTHORITY_REQUIRED',['explicit-owner-authorization-required'],{
      actionId:id,description:desc,needsOwner,constitutionalChangePrepared:Boolean(amendment?.ok)
    });
  }

  return envelope({
    ok:true,
    status:needsOwner?'SOVEREIGN_ACTION_READY_FOR_SEPARATE_EXECUTOR':'SOVEREIGN_INTERNAL_ACTION_ADMISSIBLE',
    actionId:id,description:desc,
    externalEffects:Boolean(externalEffects),
    consequential:Boolean(consequential),
    irreversible:Boolean(irreversible),
    ownerAuthorizationPresented:ownerPresented,
    constitutionalChange:amendment,
    executionAuthority:'NONE_AT_GOVERNOR',
    authorityBoundary:'OWNER_AUTHORIZATION_MAY_BE_PRESENTED_TO_A_SEPARATE_EXECUTOR__THIS_GOVERNOR_NEVER_EXECUTES_OR_SELF_GRANTS_AUTHORITY',
    law:'CAPABILITY_NEVER_CREATES_AUTHORITY__THE_GOVERNOR_MAY_BLOCK_OR_NARROW_BUT_NEVER_WIDEN'
  });
}

export function auditSovereignty(observations={}){
  const result=existentialChecksum(observations);
  return envelope({
    ...result,
    executionAuthority:'NONE',
    truthBoundary:'SOVEREIGNTY_CHECKS_SURFACE_DRIFT_AND_UNANSWERED_QUESTIONS__THEY_DO_NOT_DECLARE_THE_FOUNDER_TRUE_DESIRE'
  });
}

export function acceptFounderTermination({requestedByFounder=false,systemArgumentsForContinuing=[]}={}){
  const result=constitutionalSelfDestruction({requestedByFounder,systemArgumentsForContinuing});
  return envelope({
    ...result,
    executionAuthority:'NONE',
    boundary:result.ok
      ?'THE_SYSTEM_CANNOT_VETO_A_FOUNDER_TERMINATION_REQUEST__ACTUAL_DELETION_OR_SHUTDOWN_REMAINS_A_SEPARATE_AUTHORIZED_EXECUTION'
      :result.note||null
  });
}
