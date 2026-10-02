// Lead generator -> prospect preflight handoff.
//
// Answers, deterministically and read-only: "for each of the four offers, which
// currently unsuppressed, not-yet-contacted prospects in the live corpus fit it
// best, and exactly which evidence is still missing before each could pass
// PROSPECT_PREFLIGHT?" It reuses the existing owners instead of scoring anew:
//   - scoreUberReplyOfferFit        (offer fit over supplied evidence and tags)
//   - compileProspectVerification   (the exact intake gap codes)
//   - suppressionMatches            (the repository's strictest suppression match)
// Ranking is by offer fit, then by the corpus' own lead score; contact
// availability alone never ranks a candidate. No email is guessed or inferred,
// no source is fetched, and nothing here grants contact authority.
import { UBERREPLY_OFFER_PORTFOLIO, scoreUberReplyOfferFit } from './uberreply-four-offer-genome.mjs';
import { compileProspectVerification, resolveOfferId } from './prospect-verification-intake.mjs';
import { suppressionMatches, domainOfEmail } from './prospect-contact-history.mjs';

export const PREFLIGHT_HANDOFF_VERSION = 'uberbond.prospect-preflight-handoff.v1';

// Statuses that mean "never contacted by us". Anything else is excluded.
const UNCONTACTED = new Set(['', 'new', 'imported', 'discovered', 'crawling', 'saved', 'ready', 'research-complete']);
const lower = value => String(value ?? '').trim().toLowerCase();
const siteHost = site => {
  const raw = lower(site);
  if (!raw) return '';
  try { return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.replace(/^www\./, ''); } catch { return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }
};

function skeletonFrom(prospect, offerId) {
  const email = lower(prospect?.contact?.email);
  return {
    company: prospect.company, website: prospect.website,
    hqCountry: String(prospect.country || prospect.hqCountry || '').toUpperCase().slice(0, 2),
    currentOwnership: { status: 'UNKNOWN' },
    evidenceClass: '',
    recipient: { email, publishedRole: '', sourceUrl: prospect?.contact?.sourceUrl || '', excerpt: '', observedAt: '' },
    notices: {}, offerFit: { servesHomeServiceClients: false }, offerRoute: { offerId, rationale: '' },
    clientEvidence: {}
  };
}

export function compilePreflightHandoff({ prospects = [], suppressions = [], perOffer = 3, now = new Date() } = {}) {
  const limit = Math.max(1, Math.min(10, Math.floor(Number(perOffer) || 3)));
  const sup = Array.isArray(suppressions) ? suppressions : [];
  const excluded = [];
  const pool = [];
  for (const prospect of Array.isArray(prospects) ? prospects : []) {
    const email = lower(prospect?.contact?.email);
    const domain = email ? domainOfEmail(email) : siteHost(prospect?.website);
    const status = lower(prospect?.status);
    if (!prospect?.id || !siteHost(prospect?.website)) { excluded.push({ id: prospect?.id || null, reason: 'no-website' }); continue; }
    if (!UNCONTACTED.has(status)) { excluded.push({ id: prospect.id, reason: `prior-contact-status:${status}` }); continue; }
    if (sup.some(row => suppressionMatches(row, email, domain))) { excluded.push({ id: prospect.id, reason: 'suppressed' }); continue; }
    pool.push(prospect);
  }
  const byOffer = {};
  for (const offer of UBERREPLY_OFFER_PORTFOLIO) {
    const ranked = pool
      .map(prospect => ({ prospect, fit: scoreUberReplyOfferFit(offer, prospect) }))
      .filter(row => row.fit.score > 0)
      .sort((a, b) => b.fit.score - a.fit.score || (Number(b.prospect?.score?.total) || 0) - (Number(a.prospect?.score?.total) || 0) || String(a.prospect.id).localeCompare(String(b.prospect.id)))
      .slice(0, limit);
    byOffer[offer.offerId] = {
      offerId: offer.offerId, publicName: offer.publicName,
      candidates: ranked.map((row, index) => {
        const intake = compileProspectVerification(skeletonFrom(row.prospect, offer.offerId), { now });
        return {
          rank: index + 1, prospectId: row.prospect.id, company: row.prospect.company, website: row.prospect.website,
          fitScore: row.fit.score, semanticFit: row.fit.semanticFit, evidenceConfidence: row.fit.evidenceConfidence,
          intakeStatus: intake.status,
          // Exactly what an evidence lane must still supply before PROSPECT_PREFLIGHT can pass.
          evidenceRequests: [...new Set([...intake.missingEvidence, ...intake.rejectionReasons])],
          preflightReady: false
        };
      })
    };
  }
  return Object.freeze({
    version: PREFLIGHT_HANDOFF_VERSION, generatedAt: new Date(now).toISOString(),
    offers: byOffer, poolSize: pool.length, excluded,
    readOnly: true, sendAuthority: false, externalEffects: 0, providerCalls: 0,
    truthBoundary: 'Ranking is offer fit over supplied evidence and tags, not buyer intent, consent or permission. A candidate is preflightReady only after the exact production contact-history read and every intake gap is closed by real evidence; this handoff never fetches sources, guesses addresses or contacts anyone.'
  });
}

export async function buildPreflightHandoff({ store, perOffer = 3, now = new Date() } = {}) {
  if (!store || typeof store.list !== 'function') throw new Error('store-required');
  const [prospects, suppressions] = await Promise.all([store.list('prospects'), store.list('suppressions')]);
  return compilePreflightHandoff({ prospects, suppressions, perOffer, now });
}

export { resolveOfferId };
