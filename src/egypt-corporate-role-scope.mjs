// Narrow material scope; neither a territorial exemption nor send authority.
import { sha256 } from './omnia-v9/canonical.mjs';
import { createPolicyEvidenceRegistry } from './global-policy-evidence.mjs';
import { classifyRecipientInbox } from './recipient-address-classifier.mjs';
import { classifyInvitedContact } from './invited-contact-classifier.mjs';
import { httpsHostOf, sameDomainFamily } from './host-family.mjs';
import { compileContactSourceBinding } from './contact-source-verifier.mjs';
export const EGYPT_SCOPE_RULE = 'sender:EG:corporate-role-no-personal-data';
export const EGYPT_SCOPE_GUIDANCE = 'sender:EG:natural-person-scope-guidance';
const NEGATIVES = ['naturalPersonIdentified', 'namedPersonTargeting', 'personalDataEnrichment', 'personLinkedMailbox', 'employeeLinkedInFacts', 'individualBehavioralData', 'personalPhoneNumber', 'egyptianCitizenDataSubject', 'egyptResidentDataSubject'];
const fresh = (at, now) => Number.isFinite(Date.parse(at)) && Date.parse(at) <= +now + 300000 && +now - Date.parse(at) <= 30 * 86400000;
export function evaluateEgyptCorporateRoleScope({ senderSide = {}, proof, now = new Date(), message = null } = {}) {
  const fail = reason => ({ ok: false, materialScope: 'UNRESOLVED', edmLicenseGate: 'UNRESOLVED', reason, sendAuthority: false });
  if (!['operatorLocation', 'senderEntityJurisdiction', 'controllerJurisdiction'].every(k => senderSide[k] === 'EG')) return fail('scope-not-reviewed-for-these-sender-facts');
  const review = proof?.corporateRoleScope;
  if (review?.schemaVersion !== 'uberbond.egypt-corporate-role-scope.v1') return fail('company-level-scope-review-missing');
  if (review.companyLevelEvidenceOnly !== true || !NEGATIVES.every(k => review[k] === false)) return fail('personal-data-or-ambiguous-scope');
  if (!fresh(review.reviewedAt, now) || !review.reviewRef) return fail('scope-review-missing-or-stale');
  const entity = review.recipientEntity;
  if (entity?.type !== 'CORPORATION' || !/^[A-Z]{2}$/.test(entity.jurisdiction || '') || entity.jurisdiction === 'EG' || entity.jurisdiction !== proof.recipientJurisdiction) return fail('foreign-corporation-not-established');
  if (!sameDomainFamily(httpsHostOf(entity.sourceUrl), httpsHostOf(proof.companyWebsite)) || !fresh(entity.capturedAt, now) || !entity.legalName || !entity.excerpt?.includes(entity.legalName) || !/\b(?:Inc\.?|Incorporated|Corporation|Limited|Ltd\.?|LLP|PLC)\b/i.test(entity.legalName)) return fail('corporate-identity-source-not-bound');
  const inbox = classifyRecipientInbox({ email: proof.contact?.address, company: { siteHost: httpsHostOf(proof.companyWebsite) }, source: proof.source, namedPersonEvidence: proof.namedPersonEvidence });
  if (inbox.addressClass !== 'GENERIC_CORPORATE_ROLE_INBOX' || inbox.privacyClass !== 'COMPANY_LEVEL') return fail('recipient-is-not-a-company-only-role-inbox');
  const siteHost = httpsHostOf(proof.companyWebsite);
  const invitation = classifyInvitedContact({ evidence: proof.invitationEvidence, message: proof.message, siteHost, strictScope: true, now });
  if (invitation.classification !== 'INVITED_STRONG' || proof.notices?.noSolicitationChecked !== true || proof.notices?.noSolicitationFound !== false) return fail('scoped-first-party-invitation-required');
  if (!compileContactSourceBinding({ contact: proof.contact, source: proof.source, notices: proof.notices, invitation, siteHost, now }).bound) return fail('contact-source-not-bound');
  const rows = [...(proof.scopePolicyEvidence || []), proof.providerPolicyEvidence].filter(Boolean);
  const registry = createPolicyEvidenceRegistry({ rows, now });
  const law = registry.resolveRule(EGYPT_SCOPE_RULE, now), guidance = registry.resolveRule(EGYPT_SCOPE_GUIDANCE, now), provider = registry.resolveRule('provider:smtp-relay:winnr:cold-b2b-lawful-use', now);
  if (![law, guidance, provider].every(r => r?.state === 'FRESH')) return fail('scope-or-provider-policy-evidence-not-fresh');
  if (!sameDomainFamily(httpsHostOf(provider.evidence.sourceUrl), 'winnr.app') && !/^(?:winnr\/EVIDENCE_LEDGER\.md|docs\/WINNR_SUPPORT_RECONCILIATION_)/.test(provider.evidence.sourceRef || '')) return fail('provider-policy-source-not-authoritative');
  if (law.evidence.ruleParameters?.materialScope !== 'NATURAL_PERSON_PERSONAL_DATA' || guidance.evidence.ruleParameters?.dataSubject !== 'NATURAL_PERSON' || provider.evidence.ruleParameters?.coldB2BRule !== 'ALLOWED') return fail('scope-policy-parameters-not-supported');
  const proposal = review.reviewedProposal;
  if (!review.offerId || review.offerId !== proof.message?.offerId) return fail('reviewed-offer-does-not-match-contact-purpose');
  if (!proposal?.subject || !proposal.body || !/^[a-f0-9]{64}$/.test(proposal.preworkDigest || '') || !review.preworkRef) return fail('reviewed-company-only-proposal-or-prework-missing');
  if (message && (message.subject !== proposal.subject || message.body !== proposal.body)) return fail('proposal-changed-after-company-only-review');
  return { ok: true, materialScope: 'OUTSIDE_SCOPE', edmLicenseGate: 'NOT_APPLICABLE_BY_MATERIAL_SCOPE', rule: 'EGYPT_PDPL_OUTSIDE_SCOPE_CORPORATE_ROLE_NO_PERSONAL_DATA', evidenceDigest: sha256({ review, policy: [law.evidence, guidance.evidence], inbox: inbox.addressClass, recipient: proof.contact.address }), territorialScope: 'EGYPTIAN_ACTOR_NEXUS_PRESERVED_MATERIAL_ELEMENTS_ABSENT', sendAuthority: false };
}
