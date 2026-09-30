const E0_E4 = new Set(['E0','E1','E2','E3','E4']);
const saneInt = x => Number.isSafeInteger(x) && x >= 0;

export function noRetestAuthority({ equivalenceClass, proofVerified, dependenciesCurrent, compositionVerified = true } = {}) {
  const ok = E0_E4.has(equivalenceClass) && proofVerified === true && dependenciesCurrent === true && compositionVerified === true;
  return {
    ok,
    qualityRetestRequired: !ok,
    authority: ok ? 'BY_CONSTRUCTION_EQUIVALENCE' : 'NONE',
    reason: ok ? 'E0_E4_PROOF_CURRENT__MODEL_VS_MODEL_RETEST_NOT_REQUIRED' : 'EMPIRICAL_OR_CURRENT_CROWN_EVIDENCE_REQUIRED'
  };
}

export function estimateModelTariffMicrousd({ profile, freshInputTokens = 0, cachedInputTokens = 0, billedOutputTokens, maxOutputTokens = null, processingMultiplier = 1 } = {}) {
  if (!profile?.referenceTariff || !saneInt(freshInputTokens) || !saneInt(cachedInputTokens) || !Number.isFinite(processingMultiplier) || processingMultiplier <= 0) throw new Error('valid-model-tariff-contract-required');
  const output = saneInt(billedOutputTokens) ? billedOutputTokens : (saneInt(maxOutputTokens) ? maxOutputTokens : null);
  if (output === null) return { ok:false, status:'OUTPUT_TOKEN_USAGE_OR_CEILING_REQUIRED', reason:'Reasoning and completion work are billed by observed provider usage; architecture alone cannot know exact output token consumption.' };
  const t = profile.referenceTariff;
  let inputMultiplier = 1, outputMultiplier = 1;
  const totalInput = freshInputTokens + cachedInputTokens;
  if (profile.longContextRule && totalInput > profile.longContextRule.thresholdInputTokens) {
    inputMultiplier = profile.longContextRule.inputAndCacheMultiplier;
    outputMultiplier = profile.longContextRule.outputMultiplier;
  }
  const usd = (
    freshInputTokens * t.inputUsdPerMillion * inputMultiplier +
    cachedInputTokens * (t.cacheReadUsdPerMillion ?? t.inputUsdPerMillion) * inputMultiplier +
    output * t.outputUsdPerMillion * outputMultiplier
  ) / 1_000_000 * processingMultiplier;
  return { ok:true, status:saneInt(billedOutputTokens)?'OBSERVED_TOKEN_TARIFF_COST':'MAX_OUTPUT_TOKEN_TARIFF_CEILING',
    microusd:Math.ceil(usd * 1_000_000), inputMultiplier, outputMultiplier,
    exactActualBill:false, reason:'Tariff arithmetic only; provider billing receipt remains settlement authority.' };
}

export function compileModelUnderstanding(config, { now = Date.now() } = {}) {
  const observed = Date.parse(config?.observedAt), expires = Date.parse(config?.expiresAt);
  if (!config || config.schemaVersion !== 'uberbond.infinite-opus.model-understanding.v1' || !Number.isFinite(observed) || !Number.isFinite(expires) || observed > now || expires <= observed || !Array.isArray(config.profiles) || !config.profiles.length) throw new Error('valid-model-understanding-registry-required');
  const seen = new Set();
  const profiles = config.profiles.map(p => {
    if (!p?.model || seen.has(p.model) || p.authorityFromUnderstandingAlone !== 'NONE' || !Array.isArray(p.sources) || !p.sources.length) throw new Error('non-authoritative-unique-model-profile-required');
    seen.add(p.model);
    return structuredClone(p);
  });
  return { schemaVersion:config.schemaVersion, observedAt:config.observedAt, expiresAt:config.expiresAt,
    economicsFresh: expires > now, profiles, semanticAuthority:'NONE', crownPromotionAllowed:false, empiricalEquivalenceClaimAllowed:false };
}

export function modelPriorForTask({ registry, model, task = {} } = {}) {
  const p = registry?.profiles?.find(x => x.model === model);
  if (!p) return { ok:false, status:'MODEL_PROFILE_REQUIRED', semanticAuthority:'NONE' };
  const reasons=[], exclusions=[];
  const requested = new Set(task.requiredMechanics ?? []);
  for (const r of requested) if (!(p.behavioralMechanics ?? []).includes(r)) exclusions.push('MISSING_REQUIRED_MECHANIC:'+r);
  if (task.unattendedToolLoop === true && p.model === 'xiaomi/mimo-v2.6-flash' && task.boundedToolCallCap !== true) exclusions.push('MIMO_UNATTENDED_TOOL_LOOP_REQUIRES_BOUND');
  if (task.taskClass === 'ROUTINE_CODING' && p.model === 'openai/gpt-6.1-sol-pro') reasons.push('STANDARD_SOL_PRIOR_PREFERRED_BECAUSE_PRO_IS_SAME_UNDERLYING_MODEL_WITH_HIGHER_REASONING_WORK');
  if (task.qualityClass === 'Q_FRONTIER') reasons.push('PUBLIC_MODEL_UNDERSTANDING_IS_PRIOR_ONLY__CROWN_ADMISSION_STILL_REQUIRED');
  if (E0_E4.has(task.equivalenceClass) && task.proofVerified === true && task.dependenciesCurrent === true) reasons.push('MODEL_NOT_REQUIRED_FOR_QUALITY_IF_BY_CONSTRUCTION_PATH_EXECUTES');
  return {
    ok: exclusions.length === 0,
    status: exclusions.length ? 'MODEL_PRIOR_EXCLUDED' : 'MODEL_PRIOR_AVAILABLE',
    model:p.model,
    priorRoles:structuredClone(p.priorRoles ?? []),
    reasons, exclusions,
    architectureKnowledge:p.architectureKnowledge,
    semanticAuthority:'NONE',
    crownPromotionAllowed:false
  };
}

export function chooseAnalyticLane({ registry, task = {}, candidateModels = [] } = {}) {
  const noRetest = noRetestAuthority(task);
  if (noRetest.ok) return { lane:'E0_E4_BY_CONSTRUCTION', model:null, semanticAuthority:noRetest.authority, empiricalModelTestRequired:false };
  if (task.exact === true) return { lane:'DETERMINISTIC_CODE_OR_SOLVER', model:null, semanticAuthority:'EXACT_ONLY', empiricalModelTestRequired:false };
  const rows = candidateModels.map(model => modelPriorForTask({ registry, model, task })).filter(x => x.ok);
  if (task.qualityClass === 'Q_FRONTIER') return { lane:'CROWN_PAGE_FAULT', candidates:rows.map(x=>x.model), semanticAuthority:'NONE', empiricalModelTestRequired:true };
  return { lane:'NON_AUTHORITATIVE_MODEL_PREPARATION', candidates:rows.map(x=>x.model), semanticAuthority:'NONE', empiricalModelTestRequired:false,
    boundary:'Cheap/strong models may prepare evidence, candidates or drafts. Final material semantics still require exact closure, certified bounded authority or Crown admission.' };
}
