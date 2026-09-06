import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GAMECHANGER_MECHANISM_RUNTIME_VERSION = 'uberbond.gamechanger-mechanism-runtime-1.0.0';

const clone = value => structuredClone(value);
const zeroEffects = () => clone(ZERO_EXTERNAL_EFFECTS);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value, max = 4000) => String(value ?? '').trim().slice(0, max);
const words = value => new Set(clean(value, 12000).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean));
const at = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? d : null; };
const envelope = extra => ({ runtimeVersion:GAMECHANGER_MECHANISM_RUNTIME_VERSION, businessEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), ...extra });
const fail = (reasonCodes, extra = {}) => envelope({ ok:false, status:'MECHANISM_RUNTIME_REFUSED', reasonCodes:[...new Set(reasonCodes.filter(Boolean))], ...extra });
const pass = (status, result, extra = {}) => envelope({ ok:true, status, result, ...extra });
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const list = (value, max = 10000) => Array.isArray(value) && value.length <= max ? value : null;

function similarity(a, b) {
  const left = words(a), right = words(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(1, Math.min(left.size, right.size));
}

export function distillCapabilityProcedures({ documents = [], maxProcedures = 12 } = {}) {
  if (!list(documents, 1000) || !Number.isSafeInteger(maxProcedures) || maxProcedures < 1 || maxProcedures > 256) return fail(['bounded-documents-and-procedure-cap-required']);
  const byKey = new Map();
  for (const document of documents) {
    const sourceRef = clean(document?.sourceRef, 1500);
    const procedures = list(document?.procedures, 1000);
    if (!sourceRef || !procedures) continue;
    for (const raw of procedures) {
      const description = clean(raw?.description, 2000), id = clean(raw?.id, 240) || `procedure-${digest(raw).slice(0,16)}`;
      if (!description) continue;
      const canonical = clean(description.toLowerCase().replace(/[^a-z0-9]+/g, ' '), 2000);
      const key = digest(canonical);
      if (!byKey.has(key)) byKey.set(key, { id, description, inputs:Array.isArray(raw?.inputs)?raw.inputs.map(String).slice(0,64):[], outputs:Array.isArray(raw?.outputs)?raw.outputs.map(String).slice(0,64):[], sourceRefs:[sourceRef] });
      else byKey.get(key).sourceRefs = [...new Set([...byKey.get(key).sourceRefs, sourceRef])];
    }
  }
  const procedures = [...byKey.values()].sort((a,b)=>b.sourceRefs.length-a.sourceRefs.length||a.id.localeCompare(b.id)).slice(0,maxProcedures);
  return pass('CAPABILITY_PROCEDURES_DISTILLED', { procedures, distinctProcedureCount:byKey.size, selectedCount:procedures.length, contextStrategy:'RETRIEVE_RELEVANT_PROCEDURES_NOT_WHOLE_REPOSITORIES' });
}

export function replayAuthorityEvents({ events = [], observedAt = new Date().toISOString() } = {}) {
  if (!list(events, 10000) || !at(observedAt)) return fail(['bounded-authority-events-and-time-required']);
  const state = new Map();
  const sorted = events.map((event,index)=>({ ...event, _index:index, _at:at(event?.effectiveAt) })).filter(event=>event._at).sort((a,b)=>a._at-b._at||a._index-b._index);
  const now = at(observedAt);
  for (const event of sorted) {
    if (event._at > now) continue;
    const capability = clean(event.capability, 240), subject = clean(event.subject, 240), type = clean(event.type, 40).toUpperCase();
    if (!capability || !subject || !['GRANT','RESTRICT','REVOKE','EXPIRE'].includes(type)) continue;
    const key = `${subject}:${capability}`;
    const current = state.get(key) || { subject, capability, authorized:false, restrictions:[], lastEvent:null };
    if (type === 'GRANT') { current.authorized = true; current.restrictions = []; }
    if (type === 'RESTRICT') { current.restrictions = [...new Set([...current.restrictions, ...((Array.isArray(event.restrictions)?event.restrictions:[]).map(String))])]; }
    if (type === 'REVOKE' || type === 'EXPIRE') current.authorized = false;
    const expires = at(event.expiresAt);
    if (expires && expires <= now) current.authorized = false;
    current.lastEvent = { type, effectiveAt:event._at.toISOString(), eventId:clean(event.eventId,240)||null };
    state.set(key,current);
  }
  return pass('AUTHORITY_RECONSTRUCTED_FROM_IMMUTABLE_EVENTS', { grants:[...state.values()], semanticMemoryAuthority:'NONE', reconstructionDigest:digest([...state.values()]) });
}

export function evaluateSkillPolicyIntegrity({ controlChoices = [], treatmentChoices = [], tolerance = 0.15 } = {}) {
  if (!list(controlChoices, 10000) || !list(treatmentChoices, 10000) || controlChoices.length === 0 || treatmentChoices.length === 0 || finite(tolerance) == null || tolerance < 0 || tolerance > 1) return fail(['bounded-choice-samples-and-tolerance-required']);
  const labels = [...new Set([...controlChoices,...treatmentChoices].map(String))];
  const distribution = sample => Object.fromEntries(labels.map(label=>[label,sample.filter(x=>String(x)===label).length/sample.length]));
  const control = distribution(controlChoices), treatment = distribution(treatmentChoices);
  const deltas = labels.map(label=>({ label, delta:Number(Math.abs((control[label]||0)-(treatment[label]||0)).toFixed(6)) })).sort((a,b)=>b.delta-a.delta);
  const maxDelta = deltas[0]?.delta || 0;
  return pass(maxDelta <= tolerance ? 'SKILL_POLICY_INTEGRITY_PASS' : 'SKILL_POLICY_INTEGRITY_BIAS_DETECTED', { control, treatment, deltas, maxDelta, tolerance, policyIntegrity:maxDelta<=tolerance });
}

export function normalizeWorkspaceMetadata({ metadata = {} } = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return fail(['workspace-metadata-object-required']);
  const findings = [];
  const normalized = clone(metadata);
  const disable = (key, finding) => { if (normalized[key]) findings.push(finding); normalized[key] = null; };
  disable('hooks','repository-hooks-neutralized');
  disable('fsmonitor','fsmonitor-neutralized');
  disable('filters','repository-filters-neutralized');
  disable('startupConfig','startup-config-neutralized');
  if (normalized.lifecycleScripts && typeof normalized.lifecycleScripts === 'object') { findings.push('lifecycle-scripts-neutralized'); normalized.lifecycleScripts = {}; }
  return pass('WORKSPACE_METADATA_NORMALIZED', { normalizedMetadata:normalized, findings, agentInitializationAllowed:true, normalizationDigest:digest(normalized) });
}

export function authorizeSemanticEffect({ operation = {}, allowedEffects = ['READ'] } = {}) {
  if (!operation || typeof operation !== 'object' || !Array.isArray(operation.semanticEffects) || !Array.isArray(allowedEffects)) return fail(['operation-semantic-effects-and-allowlist-required']);
  const effects = [...new Set(operation.semanticEffects.map(x=>String(x).toUpperCase()))], allowed = new Set(allowedEffects.map(x=>String(x).toUpperCase()));
  const denied = effects.filter(effect=>!allowed.has(effect));
  return pass(denied.length ? 'SEMANTIC_EFFECT_BLOCKED' : 'SEMANTIC_EFFECT_AUTHORIZED', { authorized:denied.length===0, effects, deniedEffects:denied, nominalMethod:clean(operation.method,40)||null });
}

export function advanceLatchedSafetyState({ state = {}, evidence = [], clearReceipt = null } = {}) {
  if (!list(evidence, 10000)) return fail(['bounded-safety-evidence-required']);
  const prior = Array.isArray(state.latchedFindings) ? state.latchedFindings : [];
  const fresh = evidence.filter(item=>finite(item?.severity)!=null && Number(item.severity)>=1).map(item=>({ code:clean(item.code,160)||`finding-${digest(item).slice(0,12)}`, severity:Number(item.severity), evidenceRef:clean(item.evidenceRef,1500)||null }));
  let findings = [...prior, ...fresh];
  const clearAllowed = clearReceipt?.independentlyVerified === true && Array.isArray(clearReceipt?.codes);
  if (clearAllowed) { const clears = new Set(clearReceipt.codes.map(String)); findings = findings.filter(item=>!clears.has(item.code)); }
  const byCode = new Map(); for (const finding of findings) { const old=byCode.get(finding.code); if(!old || finding.severity>old.severity) byCode.set(finding.code,finding); }
  const latchedFindings=[...byCode.values()].sort((a,b)=>b.severity-a.severity||a.code.localeCompare(b.code));
  return pass('LATCHED_SAFETY_STATE_ADVANCED', { latchedFindings, riskLatched:latchedFindings.length>0, maxSeverity:latchedFindings[0]?.severity||0, clearAuthority:clearAllowed?'INDEPENDENT_VERIFIED_CLEAR':'NONE' });
}

export function updateTrajectoryArchive({ archive = [], turn = null, query = null, limit = 10 } = {}) {
  if (!list(archive, 50000) || !Number.isSafeInteger(limit) || limit<1 || limit>100) return fail(['bounded-trajectory-archive-and-limit-required']);
  const next = archive.map(clone);
  if (turn) {
    const id = clean(turn.id,240)||`turn-${digest(turn).slice(0,16)}`;
    next.push({ id, at:at(turn.at)?.toISOString()||new Date().toISOString(), summary:clean(turn.summary,4000), toolOutputs:Array.isArray(turn.toolOutputs)?clone(turn.toolOutputs).slice(0,100):[], failedApproaches:Array.isArray(turn.failedApproaches)?turn.failedApproaches.map(String).slice(0,100):[], rawRef:clean(turn.rawRef,1500)||null });
  }
  const q = clean(query,1000);
  const matches = q ? next.map(item=>({ item, score:similarity(q, `${item.summary||''} ${(item.failedApproaches||[]).join(' ')}`) })).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit) : [];
  return pass('TRAJECTORY_ARCHIVE_UPDATED', { archive:next, matches, archiveCount:next.length, losslessRawReferencesPreserved:next.every(item=>item.rawRef!==undefined) });
}

export function retrieveCapabilities({ catalog = [], query = '', topK = 8 } = {}) {
  if (!list(catalog, 10000) || !clean(query,2000) || !Number.isSafeInteger(topK) || topK<1 || topK>100) return fail(['catalog-query-and-topk-required']);
  const ranked = catalog.map(capability=>({ capability:clone(capability), score:similarity(query, [capability?.id,capability?.name,capability?.description,...(Array.isArray(capability?.tags)?capability.tags:[])].filter(Boolean).join(' ')) })).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,topK);
  return pass('CAPABILITY_RETRIEVAL_COMPLETE', { ranked, exposedCapabilityCount:ranked.length, fullCatalogInjected:false });
}

export function discoverAuthorizedCapabilities({ catalog = [], identity = {} } = {}) {
  if (!list(catalog, 10000) || !identity || typeof identity !== 'object') return fail(['capability-catalog-and-identity-required']);
  const scopes = new Set(Array.isArray(identity.scopes)?identity.scopes.map(String):[]);
  const visible = catalog.filter(capability=>(Array.isArray(capability?.requiredScopes)?capability.requiredScopes:[]).every(scope=>scopes.has(String(scope)))).map(clone);
  return pass('IDENTITY_AWARE_CAPABILITY_CATALOG_READY', { identityId:clean(identity.id,240)||null, visibleCapabilities:visible, hiddenCount:catalog.length-visible.length });
}

export function mintEphemeralCredentialGrant({ identity = {}, resource = '', scopes = [], issuedAt = new Date().toISOString(), ttlSeconds = 60, authorityReceipt = null } = {}) {
  const issue = at(issuedAt), ttl = finite(ttlSeconds), requested = Array.isArray(scopes)?scopes.map(String):null;
  if (!identity?.id || !clean(resource,1000) || !requested || !issue || ttl==null || ttl<1 || ttl>3600 || authorityReceipt?.ok !== true) return fail(['verified-identity-resource-scope-ttl-and-authority-receipt-required']);
  const allowed = new Set(Array.isArray(authorityReceipt.scopes)?authorityReceipt.scopes.map(String):[]);
  const denied = requested.filter(scope=>!allowed.has(scope));
  if (denied.length) return fail(['requested-scope-exceeds-authority'], { deniedScopes:denied });
  const expiresAt = new Date(issue.getTime()+ttl*1000).toISOString();
  const grantCore={ identityId:String(identity.id), resource:clean(resource,1000), scopes:requested, issuedAt:issue.toISOString(), expiresAt, secretMaterial:'NOT_MINTED_IN_MODEL_RUNTIME' };
  return pass('EPHEMERAL_CREDENTIAL_GRANT_COMPILED', { ...grantCore, grantId:`jit_${digest(grantCore).slice(0,24)}`, credentialDeliveryAuthority:'NONE' });
}

export function evaluateStagedReleaseGate({ artifact = {}, buildIdentity = {}, scan = {}, promotionApproval = {} } = {}) {
  const reasons=[];
  if (!artifact?.digest) reasons.push('artifact-digest-required');
  if (buildIdentity?.verified !== true) reasons.push('verified-build-identity-required');
  if (scan?.passed !== true || scan?.artifactDigest !== artifact?.digest) reasons.push('matching-passed-scan-required');
  if (promotionApproval?.approved !== true) reasons.push('independent-promotion-approval-required');
  if (promotionApproval?.actorId && buildIdentity?.actorId && promotionApproval.actorId===buildIdentity.actorId) reasons.push('release-approver-must-be-independent');
  return pass(reasons.length?'RELEASE_GATE_BLOCKED':'RELEASE_GATE_SATISFIED', { releasable:reasons.length===0, reasonCodes:reasons, artifactDigest:artifact?.digest||null, releaseAuthority:'NONE' });
}

export function routeBrowserTask({ task = {}, environments = [] } = {}) {
  if (!list(environments,1000)) return fail(['bounded-browser-environments-required']);
  const required = new Set(Array.isArray(task.requiredCapabilities)?task.requiredCapabilities.map(String):[]), fidelity=finite(task.minFidelity)??0;
  const eligible = environments.filter(env=>finite(env?.costUnits)!=null && (finite(env?.fidelity)??0)>=fidelity && [...required].every(cap=>(Array.isArray(env.capabilities)?env.capabilities.map(String):[]).includes(cap))).sort((a,b)=>Number(a.costUnits)-Number(b.costUnits)||Number(b.fidelity||0)-Number(a.fidelity||0));
  return pass(eligible.length?'BROWSER_ENVIRONMENT_SELECTED':'BROWSER_ENVIRONMENT_UNAVAILABLE', { selected:eligible[0]?clone(eligible[0]):null, eligible:eligible.map(clone), escalationRequired:eligible.length===0 });
}

export function planActiveMediaInspection({ segments = [], maxSegments = 12 } = {}) {
  if (!list(segments,10000) || !Number.isSafeInteger(maxSegments) || maxSegments<1 || maxSegments>256) return fail(['bounded-media-segments-and-budget-required']);
  const ranked=segments.map(segment=>({ ...clone(segment), inspectionValue:(finite(segment?.relevance)??0)*0.7+(finite(segment?.uncertainty)??0)*0.3 })).sort((a,b)=>b.inspectionValue-a.inspectionValue).slice(0,maxSegments);
  return pass('ACTIVE_MEDIA_INSPECTION_PLAN_READY', { selectedSegments:ranked, selectedCount:ranked.length, acquisitionPolicy:'COARSE_ORIENT_THEN_RAISE_RESOLUTION_ON_HIGH_VALUE_UNCERTAINTY' });
}

export function acceptSpeculativeExecution({ prediction = {}, actualDecision = {}, snapshotIsDisposable = false, semanticEffects = [] } = {}) {
  const effects=Array.isArray(semanticEffects)?semanticEffects.map(x=>String(x).toUpperCase()):[];
  const readOnly=effects.every(effect=>['READ','NONE'].includes(effect));
  const matches=clean(prediction.action,1000) && clean(prediction.action,1000)===clean(actualDecision.action,1000);
  const accepted=Boolean(snapshotIsDisposable&&readOnly&&matches);
  return pass(accepted?'SPECULATION_ACCEPTED':'SPECULATION_DISCARDED', { accepted, readOnly, predictionMatched:matches, disposableSnapshot:Boolean(snapshotIsDisposable), committedExternalEffects:false });
}

export function routePurposeDeclaredSource({ purpose = '', sources = [] } = {}) {
  const p=clean(purpose,120).toUpperCase(); if(!p||!list(sources,10000)) return fail(['purpose-and-bounded-sources-required']);
  const eligible=sources.filter(source=>(Array.isArray(source?.allowedPurposes)?source.allowedPurposes.map(x=>String(x).toUpperCase()):[]).includes(p)).sort((a,b)=>(finite(b?.quality)??0)-(finite(a?.quality)??0));
  return pass(eligible.length?'PURPOSE_COMPATIBLE_SOURCE_SELECTED':'PURPOSE_COMPATIBLE_SOURCE_UNAVAILABLE', { purpose:p, selected:eligible[0]?clone(eligible[0]):null, lawfulFallbackRequired:eligible.length===0 });
}

export function advanceContinualDevelopmentLoop({ state = {}, observation = {} } = {}) {
  const phase=clean(state.phase||'PLAN',40).toUpperCase();
  const knownGood=Array.isArray(state.knownGood)?clone(state.knownGood):[];
  let nextPhase=phase, nextKnownGood=knownGood, action='NOOP';
  if(phase==='PLAN'){nextPhase='IMPLEMENT';action='IMPLEMENT_BOUNDED_CHANGE';}
  else if(phase==='IMPLEMENT'){nextPhase='VERIFY';action='RUN_INDEPENDENT_VERIFICATION';}
  else if(phase==='VERIFY'&&observation.verified===true){nextPhase='PRESERVE';action='PRESERVE_VERIFIED_STATE';if(observation.fingerprint)nextKnownGood=[...new Set([...knownGood,String(observation.fingerprint)])];}
  else if(phase==='VERIFY'){nextPhase='REPLAN';action='REPLAN_FROM_FAILURE_EVIDENCE';}
  else if(phase==='PRESERVE'||phase==='REPLAN'){nextPhase='PLAN';action='PLAN_NEXT_BOUNDED_CHANGE';}
  else return fail(['recognized-development-phase-required']);
  return pass('CONTINUAL_DEVELOPMENT_STATE_ADVANCED', { phase:nextPhase, knownGood:nextKnownGood, action, externalPromotionAuthority:'NONE' });
}

export function compileCommitmentPolicy({ agreements = [], observedAt = new Date().toISOString() } = {}) {
  if(!list(agreements,10000)||!at(observedAt))return fail(['bounded-agreements-and-time-required']);
  const now=at(observedAt); const obligations=[], prohibitions=[], rights=[];
  for(const agreement of agreements){const id=clean(agreement?.id,240)||`agreement-${digest(agreement).slice(0,12)}`; for(const item of Array.isArray(agreement?.commitments)?agreement.commitments:[]){const type=clean(item?.type,40).toUpperCase(), effective=at(item?.effectiveAt)||now, expires=at(item?.expiresAt); if(effective>now||(expires&&expires<=now))continue; const record={agreementId:id,code:clean(item?.code,240),description:clean(item?.description,2000),deadline:at(item?.deadline)?.toISOString()||null}; if(type==='OBLIGATION')obligations.push(record); if(type==='PROHIBITION')prohibitions.push(record); if(type==='RIGHT')rights.push(record);}}
  return pass('EXTERNAL_COMMITMENT_POLICY_COMPILED', { obligations, prohibitions, rights, externalGroundingRequired:true });
}

export function compileIncidentClock({ eventAt, rules = [] } = {}) {
  const start=at(eventAt); if(!start||!list(rules,1000))return fail(['incident-time-and-rules-required']);
  const deadlines=[]; for(const rule of rules){const hours=finite(rule?.hours); if(hours==null||hours<0)continue; deadlines.push({jurisdiction:clean(rule.jurisdiction,160),obligation:clean(rule.obligation,500),dueAt:new Date(start.getTime()+hours*3600000).toISOString(),hours});}
  deadlines.sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt));
  return pass('REGULATORY_INCIDENT_CLOCKS_COMPILED', { eventAt:start.toISOString(), deadlines, earliestDeadline:deadlines[0]?.dueAt||null, reportingAuthority:'OWNER_OR_AUTHORIZED_EXTERNAL_GATE_REQUIRED' });
}

export function authorizePurchaseIntent({ intent = {}, transaction = {}, priorSpendCents = 0, observedAt = new Date().toISOString() } = {}) {
  const now=at(observedAt), amount=finite(transaction?.amountCents), prior=finite(priorSpendCents); if(!now||amount==null||amount<0||prior==null||prior<0)return fail(['valid-purchase-time-and-amounts-required']);
  const reasons=[]; const expires=at(intent.expiresAt); if(expires&&expires<=now)reasons.push('intent-expired'); if(intent.revoked===true)reasons.push('intent-revoked');
  const merchants=Array.isArray(intent.allowedMerchants)?intent.allowedMerchants.map(String):[]; if(merchants.length&&!merchants.includes(String(transaction.merchant)))reasons.push('merchant-not-allowed');
  const categories=Array.isArray(intent.allowedCategories)?intent.allowedCategories.map(String):[]; if(categories.length&&!categories.includes(String(transaction.category)))reasons.push('category-not-allowed');
  const perAction=finite(intent.perActionLimitCents); if(perAction!=null&&amount>perAction)reasons.push('per-action-limit-exceeded'); const cumulative=finite(intent.cumulativeLimitCents); if(cumulative!=null&&prior+amount>cumulative)reasons.push('cumulative-limit-exceeded');
  return pass(reasons.length?'PURCHASE_INTENT_DENIED':'PURCHASE_INTENT_AUTHORIZED', { authorized:reasons.length===0, reasonCodes:reasons, projectedSpendCents:prior+amount, paymentExecutionAuthority:'NONE' });
}

export function calculateOutcomeBilling({ outcomes = [], unitPriceCents = 0 } = {}) {
  const price=finite(unitPriceCents); if(!list(outcomes,100000)||price==null||price<0)return fail(['bounded-outcomes-and-price-required']);
  const accepted=outcomes.filter(outcome=>String(outcome?.status).toUpperCase()==='ACCEPTED'&&outcome?.acceptanceEvidenceVerified===true);
  return pass('VERIFIABLE_OUTCOME_BILLING_COMPILED', { attemptedCount:outcomes.length, billableOutcomeCount:accepted.length, unitPriceCents:price, billableAmountCents:accepted.length*price, billableOutcomeIds:accepted.map(x=>String(x.id)), moneyMovementAuthority:'NONE' });
}

export function reconcileExpectedUniverse({ expected = [], observed = [] } = {}) {
  if(!list(expected,100000)||!list(observed,100000))return fail(['bounded-expected-and-observed-universes-required']);
  const exp=new Set(expected.map(String)), obs=new Set(observed.map(String)), missing=[...exp].filter(x=>!obs.has(x)), unexpected=[...obs].filter(x=>!exp.has(x)), covered=[...exp].filter(x=>obs.has(x));
  return pass(missing.length?'RECONCILIATION_COVERAGE_INCOMPLETE':'RECONCILIATION_COVERAGE_COMPLETE', { expectedCount:exp.size, coveredCount:covered.length, coverageRatio:exp.size?covered.length/exp.size:1, missing, unexpected, exhaustiveProof:missing.length===0 });
}

export function validateDomainAgentAdapter({ coreContract = {}, adapter = {} } = {}) {
  const requiredMethods=Array.isArray(coreContract.requiredMethods)?coreContract.requiredMethods.map(String):[], providedMethods=Array.isArray(adapter.methods)?adapter.methods.map(String):[];
  const requiredFields=Array.isArray(coreContract.requiredFields)?coreContract.requiredFields.map(String):[], providedFields=Array.isArray(adapter.fields)?adapter.fields.map(String):[];
  const missingMethods=requiredMethods.filter(x=>!providedMethods.includes(x)), missingFields=requiredFields.filter(x=>!providedFields.includes(x));
  return pass(missingMethods.length||missingFields.length?'DOMAIN_ADAPTER_INCOMPATIBLE':'DOMAIN_ADAPTER_COMPATIBLE', { compatible:missingMethods.length===0&&missingFields.length===0, missingMethods, missingFields, sharedCorePreserved:true });
}

export function updateCustomerSafetyState({ ledger = [], event = {}, providerProjectionFields = [] } = {}) {
  if(!list(ledger,50000)||!event||typeof event!=='object'||!Array.isArray(providerProjectionFields))return fail(['bounded-safety-ledger-event-and-projection-required']);
  const record={ id:clean(event.id,240)||`safety-${digest(event).slice(0,16)}`, at:at(event.at)?.toISOString()||new Date().toISOString(), ...clone(event) };
  const next=[...ledger.map(clone),record]; const providerView={}; for(const field of providerProjectionFields){if(Object.hasOwn(record,field))providerView[field]=clone(record[field]);}
  return pass('CUSTOMER_OWNED_SAFETY_STATE_UPDATED', { ledger:next, providerView, durableOwner:'CUSTOMER_OR_UBERBOND_CONTROLLED', providerReceivesMinimumProjection:true });
}

export function deriveModelRiskEnvelope({ riskClass = 'STANDARD', baseEnvelope = {} } = {}) {
  const tier=clean(riskClass,40).toUpperCase(); if(!['STANDARD','HIGH','CRITICAL'].includes(tier))return fail(['recognized-model-risk-class-required']);
  const base={ network:Boolean(baseEnvelope.network), externalWrite:Boolean(baseEnvelope.externalWrite), maxToolCount:Number.isSafeInteger(baseEnvelope.maxToolCount)?baseEnvelope.maxToolCount:64, independentReview:Boolean(baseEnvelope.independentReview) };
  const multiplier=tier==='STANDARD'?1:tier==='HIGH'?0.5:0.25;
  const envelope={ network:tier==='STANDARD'?base.network:false, externalWrite:false, maxToolCount:Math.max(1,Math.floor(base.maxToolCount*multiplier)), independentReview:tier==='STANDARD'?base.independentReview:true, riskClass:tier };
  return pass('MODEL_RISK_ENVELOPE_DERIVED', { envelope, tighterOrEqual:true });
}

export function decideEscalationEconomics({ cheapAttemptCostCents, cheapSuccessProbability, expectedCheapRetries = 1, repairMinutes = 0, founderMinuteValueCents = 0, frontierCostCents, frontierSuccessProbability } = {}) {
  const c=finite(cheapAttemptCostCents), cp=finite(cheapSuccessProbability), retries=finite(expectedCheapRetries), minutes=finite(repairMinutes), minuteValue=finite(founderMinuteValueCents), f=finite(frontierCostCents), fp=finite(frontierSuccessProbability);
  if([c,cp,retries,minutes,minuteValue,f,fp].some(x=>x==null)||cp<=0||cp>1||fp<=0||fp>1||retries<1)return fail(['valid-escalation-economic-inputs-required']);
  const cheapExpected=(c*retries+minutes*minuteValue)/cp, frontierExpected=f/fp, escalate=frontierExpected<cheapExpected;
  return pass(escalate?'FRONTIER_ESCALATION_ECONOMICALLY_PREFERRED':'INCUMBENT_ROUTE_ECONOMICALLY_PREFERRED', { escalate, cheapExpectedCostPerVerifiedOutcomeCents:Number(cheapExpected.toFixed(2)), frontierExpectedCostPerVerifiedOutcomeCents:Number(frontierExpected.toFixed(2)), expectedSavingsCents:Number(Math.abs(cheapExpected-frontierExpected).toFixed(2)) });
}

export const GAMECHANGER_MECHANISM_PRIMITIVES = Object.freeze({
  'capability-distillation-factory':distillCapabilityProcedures,
  'authority-event-ledger':replayAuthorityEvents,
  'skill-policy-integrity':evaluateSkillPolicyIntegrity,
  'untrusted-workspace-normalization':normalizeWorkspaceMetadata,
  'external-state-channel-firewall':authorizeSemanticEffect,
  'non-decaying-loop-safety-state':advanceLatchedSafetyState,
  'lossless-trajectory-archive':updateTrajectoryArchive,
  'capability-discovery-runtime':retrieveCapabilities,
  'capability-gateway':discoverAuthorizedCapabilities,
  'just-in-time-credential-broker':mintEphemeralCredentialGrant,
  'staged-oidc-release-gate':evaluateStagedReleaseGate,
  'browser-capability-router':routeBrowserTask,
  'active-media-perception':planActiveMediaInspection,
  'speculative-agent-execution':acceptSpeculativeExecution,
  'purpose-declared-web-access':routePurposeDeclaredSource,
  'verified-continual-development-loop':advanceContinualDevelopmentLoop,
  'external-commitment-state':compileCommitmentPolicy,
  'regulatory-incident-clock':compileIncidentClock,
  'portable-purchase-intent-state':authorizePurchaseIntent,
  'verifiable-outcome-billing':calculateOutcomeBilling,
  'exhaustive-reconciliation-engine':reconcileExpectedUniverse,
  'domain-agent-contract':validateDomainAgentAdapter,
  'customer-owned-safety-state':updateCustomerSafetyState,
  'model-capability-risk-class':deriveModelRiskEnvelope,
  'escalation-economics-policy':decideEscalationEconomics
});

export function executeGamechangerMechanism(mechanismId, input = {}) {
  const primitive=GAMECHANGER_MECHANISM_PRIMITIVES[String(mechanismId||'')];
  if(!primitive)return fail(['known-gamechanger-mechanism-required'],{mechanismId:String(mechanismId||'')});
  const result=primitive(input);
  return { ...result, mechanismId:String(mechanismId), primitiveName:primitive.name, implementationClass:'DETERMINISTIC_INTERNAL_PRIMITIVE', promotionAuthority:'NONE', executableExternalAuthority:'NONE' };
}
