import { id, now, normalizeDomain, uniq } from './utils.mjs';
import { ConflictError } from './store.mjs';
import { qualifyBusinessWebsite } from './discovery.mjs';

function sourceKey(record) {
  const provider = String(record.sourceProvider || record.source || '').trim().toLowerCase();
  const sourceRecordId = String(record.sourceRecordId || '').trim().toLowerCase();
  return provider && sourceRecordId ? `${record.campaignId}:${provider}:${sourceRecordId}` : '';
}

function excludedDomains(config = {}, options = {}) {
  const values = [
    ...(Array.isArray(config.discovery?.excludedDomains) ? config.discovery.excludedDomains : []),
    ...(Array.isArray(options.excludedDomains) ? options.excludedDomains : [])
  ];
  const applicationDomain = normalizeDomain(config.baseUrl || '');
  if (applicationDomain && applicationDomain !== 'localhost') values.push(applicationDomain);
  return uniq(values.map(normalizeDomain).filter(Boolean));
}

export function validateProspect(raw, campaignId = '', options = {}) {
  const company = String(raw.company || raw.company_name || '').replace(/\s+/g, ' ').trim();
  const website = String(raw.website || raw.website_url || raw.url || '').trim();
  if (!company || !website) return null;
  const qualification = qualifyBusinessWebsite(website, {
    excludedDomains: options.excludedDomains,
    allowReservedDomains: options.allowReservedDomains === true
  });
  if (!qualification.eligible) return { invalid: true, reason: qualification.reason };
  const discoveredAt = String(raw.discoveredAt || raw.discoveryTimestamp || now());
  const location = raw.location && typeof raw.location === 'object' && !Array.isArray(raw.location)
    ? {
        country: String(raw.location.country || raw.country || '').slice(0, 80),
        city: String(raw.location.city || raw.city || '').slice(0, 80),
        latitude: raw.location.latitude !== null && raw.location.latitude !== undefined && Number.isFinite(Number(raw.location.latitude)) ? Number(raw.location.latitude) : null,
        longitude: raw.location.longitude !== null && raw.location.longitude !== undefined && Number.isFinite(Number(raw.location.longitude)) ? Number(raw.location.longitude) : null
      }
    : {
        country: String(raw.country || '').slice(0, 80),
        city: String(raw.city || '').slice(0, 80),
        latitude: null,
        longitude: null
      };
  return {
    company: company.slice(0, 180),
    website: qualification.website,
    domain: qualification.domain,
    niche: String(raw.niche || raw.industry || '').slice(0, 120),
    country: location.country,
    city: location.city,
    location,
    contactName: String(raw.contactName || raw.contact_name || '').slice(0, 120),
    campaignId: String(raw.campaignId || raw.campaign_id || campaignId || ''),
    abilityToPay: Number(raw.abilityToPay || raw.ability_to_pay || 8),
    serviceFit: Number(raw.serviceFit || raw.service_fit || 0),
    marketAdvantage: Number(raw.marketAdvantage || raw.market_advantage || 0),
    notes: String(raw.notes || '').slice(0, 1000),
    source: String(raw.source || 'outbound').slice(0, 80),
    sourceProvider: String(raw.sourceProvider || raw.source || 'outbound').slice(0, 120),
    sourceUrl: String(raw.sourceUrl || '').slice(0, 500),
    sourceRecordId: String(raw.sourceRecordId || '').slice(0, 160),
    sourceLicense: String(raw.sourceLicense || '').slice(0, 240),
    sourceLicenseUrl: String(raw.sourceLicenseUrl || '').slice(0, 500),
    sourceAttribution: String(raw.sourceAttribution || raw.sourceLicense || '').slice(0, 240),
    sourceMetadata: raw.sourceMetadata && typeof raw.sourceMetadata === 'object' && !Array.isArray(raw.sourceMetadata) ? raw.sourceMetadata : {},
    websiteQualification: raw.websiteQualification && typeof raw.websiteQualification === 'object'
      ? raw.websiteQualification
      : { status: 'eligible', method: 'static-public-business-domain-v1', reason: qualification.reason, checkedAt: discoveredAt },
    discoveredAt
  };
}

export async function importProspects(store, config, items, campaignId = '', options = {}) {
  const added = [];
  const skipped = [];
  const existingProspects = [];
  const existing = await store.list('prospects');
  const globalByDomain = new Map(existing.map(prospect => [normalizeDomain(prospect.domain || prospect.website), prospect]));
  const campaignByDomain = new Map(existing.map(prospect => [`${prospect.campaignId || ''}:${normalizeDomain(prospect.domain || prospect.website)}`, prospect]));
  const campaignBySource = new Map(existing.map(prospect => [sourceKey(prospect), prospect]).filter(([key]) => key));
  const maxItems = Math.max(1, Math.min(100, Number(options.limit || 100)));
  const validationOptions = {
    excludedDomains: excludedDomains(config, options),
    allowReservedDomains: options.allowReservedDomains === true
  };

  for (const raw of (Array.isArray(items) ? items : []).slice(0, maxItems)) {
    const clean = validateProspect(raw, campaignId, validationOptions);
    if (!clean) { skipped.push({ reason: 'company_and_website_required', row: raw?.__row }); continue; }
    if (clean.invalid) { skipped.push({ reason: clean.reason, row: raw?.__row }); continue; }
    if (!clean.campaignId) { skipped.push({ reason: 'campaign_required', row: raw?.__row }); continue; }
    const campaignDomainKey = `${clean.campaignId}:${clean.domain}`;
    const duplicateCampaign = campaignByDomain.get(campaignDomainKey);
    if (duplicateCampaign) {
      skipped.push({ reason: 'duplicate_campaign_domain', company: clean.company, domain: clean.domain, prospectId: duplicateCampaign.id });
      existingProspects.push(duplicateCampaign);
      continue;
    }
    const candidateSourceKey = sourceKey(clean);
    const duplicateSource = candidateSourceKey ? campaignBySource.get(candidateSourceKey) : null;
    if (duplicateSource) {
      skipped.push({ reason: 'duplicate_source_record', company: clean.company, domain: clean.domain, prospectId: duplicateSource.id });
      existingProspects.push(duplicateSource);
      continue;
    }
    const duplicateDomain = globalByDomain.get(clean.domain);
    if (duplicateDomain) {
      skipped.push({ reason: 'duplicate_domain', company: clean.company, domain: clean.domain, prospectId: duplicateDomain.id });
      continue;
    }

    const timestamp = now();
    const prospect = {
      id: id('pros'),
      ...clean,
      status: 'queued',
      crawlQueueStatus: 'queued',
      campaignDomainKey,
      sourceKey: candidateSourceKey,
      queuedAt: timestamp,
      createdAt: timestamp
    };
    try {
      await store.add('prospects', prospect);
      added.push(prospect);
      globalByDomain.set(clean.domain, prospect);
      campaignByDomain.set(campaignDomainKey, prospect);
      if (candidateSourceKey) campaignBySource.set(candidateSourceKey, prospect);
    } catch (error) {
      if (error instanceof ConflictError) {
        const raced = await store.findOne('prospects', { domain: clean.domain });
        skipped.push({ reason: 'duplicate_domain', company: clean.company, domain: clean.domain, prospectId: raced?.id || '' });
        if (raced?.campaignId === clean.campaignId) existingProspects.push(raced);
        continue;
      }
      throw error;
    }
  }
  return { added, skipped, existing: uniq(existingProspects.map(prospect => prospect.id)).map(prospectId => existingProspects.find(prospect => prospect.id === prospectId)) };
}
