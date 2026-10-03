// Proof Factory + adversarial message critics.
//
// Proof Factory = a thin, content-addressed LINEAGE wrapper over the existing
// prospect-specific pre-work artifact (compileUberReplyPreworkArtifact). It adds
// per-claim identity so a sentence in an outbound message can be traced to the
// exact evidence that supports it, or be refused.
//
// Critics = independent adversarial reviewers layered ON TOP of the existing
// render validator and banned-language list. They can only narrow: a critic
// verdict can turn PASS into REVISE/REFUSE, never the reverse, and no critic
// has authority to send anything.
import { createHash } from 'node:crypto';
import { compileUberReplyPreworkArtifact } from './uberreply-prework-artifact.mjs';
import { validateUberReplyRenderedMessage } from './uberreply-four-offer-genome.mjs';
import { BANNED_LANGUAGE } from './prospect-message-tournament.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PROOF_FACTORY_VERSION = 'uberbond.proof-factory.v1';
const sha = v => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

export function compileProofLineage({ offerId, prospect = {}, issue = null, audit = [], observedAt = null, now = Date.now() } = {}) {
  const artifact = compileUberReplyPreworkArtifact({ offerId, prospect, issue, audit });
  if (!artifact.ok) return { ok: false, state: 'PROOF_INSUFFICIENT', reasonCodes: artifact.reasonCodes || ['proof-unavailable'], outboundAuthority: 'NONE' };
  const stamped = Date.parse(observedAt);
  const freshness = Number.isFinite(stamped) ? (stamped > now + 60000 ? 'FUTURE_DATED' : now - stamped > 30 * 86400000 ? 'STALE' : 'FRESH') : 'UNDATED';
  const claims = artifact.findings.map(f => ({
    claimId: `cl_${sha([f.code, f.evidenceUrl, f.evidenceExcerpt]).slice(0, 16)}`,
    code: f.code,
    // the only language a message may use for this finding: the observed title
    // and excerpt, never an inferred consequence
    permittedText: [f.title, f.evidenceExcerpt].filter(Boolean),
    evidenceRefs: [f.evidenceUrl, ...f.screenshotRefs],
    confidence: f.confidence
  }));
  const lineage = { artifactId: artifact.artifactId, offerId: artifact.offerId, claims, freshness };
  return {
    ok: freshness !== 'FUTURE_DATED', state: freshness === 'FUTURE_DATED' ? 'PROOF_FUTURE_DATED' : 'PROOF_READY',
    version: PROOF_FACTORY_VERSION, proofRef: artifact.artifactId, proofDigest: `sha256:${sha(lineage)}`,
    freshness, claims, evidenceRefs: artifact.evidenceRefs, artifact,
    outboundAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

const SLOP = [/\bin today'?s (fast[- ]paced|digital)/i, /\bleverage\b/i, /\bsynerg/i, /\bgame[- ]chang/i, /\bcutting[- ]edge\b/i, /\bunlock\b/i, /\bseamless/i, /\brevolution/i, /\bdelve\b/i, /\bI hope this (email|message) finds you/i, /\bI came across your (company|website|profile)/i, /\bwould love to (connect|chat)\b/i];
const CREEP = [/\b(your (wife|husband|kids?|children|family|home address|personal (phone|number|cell)))\b/i, /\b(saw|noticed) you (on|at) (vacation|holiday|the gym|your (house|home))\b/i, /\blinkedin (profile|activity)\b.*\b(last night|yesterday)\b/i, /\bI('| ha)ve been (watching|tracking|following) you/i];
const URGENCY = [/\b(act now|last chance|only \d+ (spots|slots) left|expires (today|tonight)|limited time)\b/i];
const NUMERIC_CLAIM = /(\$\s?\d[\d,.]*|\b\d+(\.\d+)?\s?%|\b\d{2,}\s+(leads|customers|clients|bookings|calls)\b)/i;
const CAUSAL_CLAIM = /\b(you('| a)re (losing|missing)|costing you|caused|because of (this|your)|this is why)\b/i;

/**
 * Independent critics. `claimsUsed` are the claimIds the author says each
 * factual sentence relies on; the critic checks them against the lineage.
 */
export function reviewMessageAdversarially({ subject = '', body = '', policy = {}, lineage = null, claimsUsed = [], buyer = {}, evidenceRefs = [], artifactPrepared = false } = {}) {
  const text = `${subject}\n${body}`;
  const findings = [];
  const add = (critic, code, severity) => findings.push({ critic, code, severity });

  const base = validateUberReplyRenderedMessage({ policy, subject, body, evidenceRefs, primaryAskCount: (body.match(/\?/g) || []).length || 1, artifactPrepared });
  for (const r of base.reasonCodes) add('render', r, 'REVISE');

  if (BANNED_LANGUAGE.some(re => re.test(text))) add('anti-slop', 'banned-language', 'REVISE');
  for (const re of SLOP) if (re.test(text)) add('anti-slop', 'generic-ai-phrasing', 'REVISE');
  for (const re of CREEP) if (re.test(text)) add('creep', 'private-or-surveillance-language', 'REFUSE');
  for (const re of URGENCY) if (re.test(text)) add('integrity', 'false-urgency-or-scarcity', 'REFUSE');
  if (/^(re|fwd?):/i.test(subject.trim())) add('integrity', 'deceptive-thread-prefix', 'REFUSE');

  // proof critic: any numeric or causal claim must be backed by lineage text
  const lineageText = (lineage?.claims || []).flatMap(c => c.permittedText).join(' ').toLowerCase();
  const known = new Set((lineage?.claims || []).map(c => c.claimId));
  const used = new Set(claimsUsed);
  if (!lineage || lineage.ok === false) add('proof', 'no-proof-lineage', 'REFUSE');
  else {
    if (lineage.freshness !== 'FRESH') add('proof', `proof-${String(lineage.freshness).toLowerCase()}`, 'REFUSE');
    if (used.size === 0) add('proof', 'no-claim-referenced', 'REFUSE');
    for (const id of used) if (!known.has(id)) add('proof', 'unknown-claim-reference', 'REFUSE');
    for (const m of text.match(new RegExp(NUMERIC_CLAIM.source, 'gi')) || []) if (!lineageText.includes(m.toLowerCase())) add('proof', 'numeric-claim-not-in-evidence', 'REFUSE');
  }
  if (CAUSAL_CLAIM.test(text)) add('proof', 'unsupported-causal-or-loss-claim', 'REFUSE');

  // buyer-fit critic: the message must be addressed to a resolved buyer role and
  // must not reference a service line the offer does not sell
  if (!buyer?.role) add('buyer-fit', 'buyer-role-unresolved', 'REVISE');
  if (buyer?.vertical && body && lineage && !new RegExp(String(buyer.vertical).split(/\W+/).filter(w => w.length > 3).join('|') || '$^', 'i').test(text + lineageText)) add('buyer-fit', 'vertical-not-reflected', 'REVISE');

  const verdict = findings.some(f => f.severity === 'REFUSE') ? 'REFUSE' : findings.length ? 'REVISE' : 'PASS';
  return {
    ok: verdict === 'PASS', verdict, findings,
    critics: [...new Set(['render', 'anti-slop', 'creep', 'integrity', 'proof', 'buyer-fit'])],
    narrowOnly: true, outboundAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
