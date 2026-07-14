import { id, now, normalizeDomain } from './utils.mjs';
import { ConflictError } from './store.mjs';

export function validateProspect(raw, campaignId = '') {
  const company = String(raw.company || raw.company_name || '').trim();
  const website = String(raw.website || raw.website_url || raw.url || '').trim();
  if (!company || !website) return null;
  return {
    company: company.slice(0, 180), website,
    niche: String(raw.niche || raw.industry || '').slice(0, 120),
    country: String(raw.country || '').slice(0, 80), city: String(raw.city || '').slice(0, 80),
    contactName: String(raw.contactName || raw.contact_name || '').slice(0, 120),
    campaignId: String(raw.campaignId || raw.campaign_id || campaignId || ''),
    abilityToPay: Number(raw.abilityToPay || raw.ability_to_pay || 8),
    serviceFit: Number(raw.serviceFit || raw.service_fit || 0),
    marketAdvantage: Number(raw.marketAdvantage || raw.market_advantage || 0),
    notes: String(raw.notes || '').slice(0, 1000), source: String(raw.source || 'outbound').slice(0, 80),
    sourceUrl: String(raw.sourceUrl || '').slice(0, 500),
    sourceRecordId: String(raw.sourceRecordId || '').slice(0, 120),
    sourceLicense: String(raw.sourceLicense || '').slice(0, 160),
    sourceMetadata: raw.sourceMetadata && typeof raw.sourceMetadata === 'object' ? raw.sourceMetadata : {}
  };
}

export async function importProspects(store, config, items, campaignId = '') {
  const added = [];
  const skipped = [];
  for (const raw of items.slice(0, Math.max(100, config.maxBatch * 10))) {
    const clean = validateProspect(raw, campaignId);
    if (!clean) { skipped.push({ reason: 'company and website required', row: raw.__row }); continue; }
    const domain = normalizeDomain(clean.website);
    if (!domain) { skipped.push({ reason: 'invalid domain', row: raw.__row }); continue; }
    const prospect = { id: id('pros'), ...clean, domain, status: 'queued', source: clean.source || 'outbound', createdAt: now() };
    try {
      await store.add('prospects', prospect);
      added.push(prospect);
    } catch (error) {
      if (error instanceof ConflictError) { skipped.push({ reason: 'duplicate', company: clean.company, domain }); continue; }
      throw error;
    }
  }
  return { added, skipped };
}
