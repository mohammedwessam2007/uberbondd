import { normalizeDomain, uniq } from './utils.mjs';
import { parsePublicUrl } from './security.mjs';

export const SUPPORTED_DISCOVERY_COUNTRIES = Object.freeze(['AE', 'SA', 'QA', 'KW', 'GB', 'AU']);

export const DISCOVERY_CATEGORIES = Object.freeze({
  clinic: [
    {key: 'amenity', values: ['clinic']},
    {key: 'healthcare', values: ['clinic']}
  ],
  dentist: [
    {key: 'amenity', values: ['dentist']},
    {key: 'healthcare', values: ['dentist']}
  ],
  medical: [
    {key: 'healthcare', values: ['doctor', 'clinic', 'dentist', 'physiotherapist', 'psychotherapist']},
    {key: 'amenity', values: ['doctors', 'clinic', 'dentist']}
  ],
  dermatology: [{key: 'healthcare:speciality', values: ['dermatology']}],
  cosmetic_clinic: [
    {key: 'healthcare:speciality', values: ['plastic_surgery', 'cosmetic_surgery']},
    {key: 'healthcare', values: ['plastic_surgery']}
  ],
  fertility_clinic: [{key: 'healthcare:speciality', values: ['fertility', 'reproductive_medicine']}],
  healthcare_agency: [
    {key: 'office', values: ['healthcare']},
    {key: 'healthcare', values: ['home_care']}
  ],
  professional_services_agency: [{key: 'office', values: ['consulting', 'advertising_agency', 'it']}],
  b2b_company: [{key: 'office', values: ['company']}],
  pharmacy: [{key: 'amenity', values: ['pharmacy']}],
  veterinary: [{key: 'amenity', values: ['veterinary']}],
  hospital: [
    {key: 'amenity', values: ['hospital']},
    {key: 'healthcare', values: ['hospital']}
  ],
  hotel: [{key: 'tourism', values: ['hotel', 'motel', 'guest_house', 'hostel']}],
  restaurant: [{key: 'amenity', values: ['restaurant', 'cafe']}],
  gym: [{key: 'leisure', values: ['fitness_centre', 'sports_centre']}],
  beauty: [{key: 'shop', values: ['beauty', 'hairdresser', 'cosmetics']}],
  lawyer: [{key: 'office', values: ['lawyer']}],
  accountant: [{key: 'office', values: ['accountant', 'tax_advisor']}],
  real_estate: [{key: 'office', values: ['estate_agent']}]
});

export const DEFAULT_DISCOVERY_EXCLUDED_DOMAINS = Object.freeze([
  'uberbondd-lite-private.vercel.app',
  'uberbondd.vercel.app'
]);

const WEBSITE_KEYS = ['contact:website', 'website', 'url', 'contact:url'];
const NAME_KEYS = ['name', 'brand', 'operator'];
const DIRECTORY_DOMAINS = Object.freeze([
  'facebook.com', 'instagram.com', 'linkedin.com', 'x.com', 'twitter.com', 'tiktok.com',
  'youtube.com', 'yelp.com', 'yellowpages.com', 'yell.com', 'tripadvisor.com',
  'google.com', 'googleusercontent.com', 'goo.gl', 'maps.app.goo.gl', 'linktr.ee'
]);
const PARKING_DOMAINS = Object.freeze([
  'sedoparking.com', 'sedo.com', 'afternic.com', 'hugedomains.com', 'dan.com',
  'bodis.com', 'parkingcrew.net', 'domainmarket.com', 'undeveloped.com'
]);
const RESERVED_SUFFIXES = Object.freeze(['.example', '.invalid', '.test', '.localhost', '.local', '.internal', '.home', '.lan', '.corp']);

function number(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number`);
  return parsed;
}

export function parseBbox(input, maxSpan = 5) {
  const values = Array.isArray(input) ? input : String(input || '').split(',');
  if (values.length !== 4) throw new Error('Bounding box must contain south,west,north,east');
  const [south, west, north, east] = values.map((value, index) => number(String(value).trim(), ['south', 'west', 'north', 'east'][index]));
  if (south < -90 || north > 90 || west < -180 || east > 180) throw new Error('Bounding box coordinates are outside valid latitude/longitude limits');
  if (south >= north || west >= east) throw new Error('Bounding box south/west values must be smaller than north/east values');
  if (north - south > maxSpan || east - west > maxSpan) throw new Error(`Bounding box is too large. Maximum span is ${maxSpan} degrees per side`);
  return [south, west, north, east];
}

export function normalizeCategories(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(',');
  const categories = uniq(raw.map(value => String(value).trim().toLowerCase()).filter(Boolean));
  if (!categories.length) throw new Error('Choose at least one discovery category');
  const invalid = categories.filter(category => !DISCOVERY_CATEGORIES[category]);
  if (invalid.length) throw new Error(`Unsupported discovery categories: ${invalid.join(', ')}`);
  return categories;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildOverpassQuery({bbox, categories, timeoutSeconds = 25, maxSpan = 5}) {
  const cleanBbox = parseBbox(bbox, maxSpan);
  const cleanCategories = normalizeCategories(categories);
  const selectors = [];
  for (const category of cleanCategories) {
    for (const selector of DISCOVERY_CATEGORIES[category]) {
      const values = selector.values.map(escapeRegex).join('|');
      selectors.push(`nwr["${selector.key}"~"^(${values})$"](${cleanBbox.join(',')});`);
    }
  }
  return `[out:json][timeout:${Math.max(5, Math.min(60, Number(timeoutSeconds) || 25))}];\n(\n  ${uniq(selectors).join('\n  ')}\n);\nout center tags;`;
}

function matchesDomain(domain, candidates) {
  return candidates.some(candidate => domain === candidate || domain.endsWith(`.${candidate}`));
}

function normalizeDomainList(values = []) {
  return uniq((Array.isArray(values) ? values : String(values || '').split(','))
    .map(normalizeDomain)
    .filter(Boolean));
}

function validDomainLabels(hostname) {
  if (hostname.length > 253) return false;
  if (hostname.includes(':') || /^\d+(?:\.\d+){3}$/.test(hostname)) return true;
  return hostname.split('.').every(label => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

export function qualifyBusinessWebsite(raw, options = {}) {
  const candidate = String(raw || '').split(/[;,\s]+/).find(Boolean) || '';
  if (!candidate) return { eligible: false, reason: 'missing_website', website: '', domain: '' };
  let url;
  try { url = parsePublicUrl(candidate); }
  catch (error) {
    return { eligible: false, reason: /private|local|metadata/i.test(error.message) ? 'private_or_internal_website' : 'invalid_website', website: '', domain: '' };
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const domain = normalizeDomain(hostname);
  if (!domain || !validDomainLabels(hostname)) return { eligible: false, reason: 'malformed_domain', website: '', domain: '' };
  if (!options.allowReservedDomains && RESERVED_SUFFIXES.some(suffix => domain.endsWith(suffix))) {
    return { eligible: false, reason: 'reserved_or_nonpublic_domain', website: '', domain };
  }
  const excluded = uniq([
    ...normalizeDomainList(options.excludedDomains),
    ...DEFAULT_DISCOVERY_EXCLUDED_DOMAINS
  ]);
  if (matchesDomain(domain, excluded)) return { eligible: false, reason: 'own_domain', website: '', domain };
  if (matchesDomain(domain, DIRECTORY_DOMAINS)) return { eligible: false, reason: 'directory_or_social_profile', website: '', domain };
  if (matchesDomain(domain, PARKING_DOMAINS) || /(?:^|\.)(?:parked|parking|domains?forsale)(?:\.|$)/i.test(domain)) {
    return { eligible: false, reason: 'obvious_parked_domain', website: '', domain };
  }
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';
  return { eligible: true, reason: 'public_business_domain', website: url.href, domain };
}

function firstTag(tags, keys) {
  for (const key of keys) if (tags?.[key]) return tags[key];
  return '';
}

function categoryFor(tags, requested) {
  for (const category of requested) {
    const matched = DISCOVERY_CATEGORIES[category].some(selector => selector.values.includes(tags?.[selector.key]));
    if (matched) return category;
  }
  return requested[0] || '';
}

function sourceIdentity(element) {
  const type = String(element?.type || '').toLowerCase();
  const elementId = String(element?.id ?? '');
  if (!['node', 'way', 'relation'].includes(type) || !/^\d+$/.test(elementId)) return null;
  return { type, elementId, sourceRecordId: `${type}/${elementId}` };
}

function locationFor(element, options) {
  const latitude = Number(element?.lat ?? element?.center?.lat);
  const longitude = Number(element?.lon ?? element?.center?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    country: String(options.country || element?.tags?.['addr:country'] || '').slice(0, 80),
    city: String(options.city || element?.tags?.['addr:city'] || element?.tags?.['addr:town'] || '').slice(0, 80),
    latitude,
    longitude
  };
}

function recordRejection(rejections, identity, reason) {
  if (!Array.isArray(rejections)) return;
  rejections.push({ sourceRecordId: identity?.sourceRecordId || 'invalid-record', reason });
}

export function parseOverpassElements(elements, options = {}) {
  const requested = normalizeCategories(options.categories || ['clinic']);
  const discoveredAt = String(options.discoveredAt || new Date().toISOString());
  const seen = new Set();
  const prospects = [];
  for (const element of Array.isArray(elements) ? elements : []) {
    const identity = sourceIdentity(element);
    if (!identity) { recordRejection(options.rejections, null, 'invalid_source_record'); continue; }
    const tags = element?.tags || {};
    const company = String(firstTag(tags, NAME_KEYS) || '').replace(/\s+/g, ' ').trim();
    if (!company) { recordRejection(options.rejections, identity, 'missing_name'); continue; }
    const qualification = qualifyBusinessWebsite(firstTag(tags, WEBSITE_KEYS), {
      excludedDomains: options.excludedDomains,
      allowReservedDomains: options.allowReservedDomains === true
    });
    if (!qualification.eligible) { recordRejection(options.rejections, identity, qualification.reason); continue; }
    if (seen.has(qualification.domain)) { recordRejection(options.rejections, identity, 'duplicate_domain'); continue; }
    const location = locationFor(element, options);
    if (!location) { recordRejection(options.rejections, identity, 'missing_or_invalid_location'); continue; }
    seen.add(qualification.domain);
    const category = categoryFor(tags, requested);
    const websiteTag = WEBSITE_KEYS.find(key => tags[key]) || '';
    prospects.push({
      company: company.slice(0, 180),
      website: qualification.website,
      domain: qualification.domain,
      niche: category.replaceAll('_', ' '),
      country: location.country,
      city: location.city,
      location,
      source: 'openstreetmap',
      sourceProvider: 'openstreetmap-overpass',
      sourceUrl: `https://www.openstreetmap.org/${identity.type}/${identity.elementId}`,
      sourceRecordId: identity.sourceRecordId,
      sourceLicense: 'Open Data Commons Open Database License (ODbL) 1.0',
      sourceLicenseUrl: 'https://www.openstreetmap.org/copyright',
      sourceAttribution: '© OpenStreetMap contributors',
      discoveredAt,
      websiteQualification: {
        status: 'eligible',
        method: 'static-public-business-domain-v1',
        reason: qualification.reason,
        checkedAt: discoveredAt
      },
      sourceMetadata: {
        osmType: identity.type,
        osmId: identity.elementId,
        latitude: location.latitude,
        longitude: location.longitude,
        category,
        websiteTag
      },
      notes: `Public business record discovered through OpenStreetMap (${identity.sourceRecordId}). Website was present in the public OSM record.`
    });
  }
  return prospects;
}

export function buildDiscoveryBatches(campaign = {}, options = {}) {
  const maxSpan = Number(options.maxSpan || 5);
  const boxes = options.bbox
    ? [parseBbox(options.bbox, maxSpan)]
    : (Array.isArray(campaign.boundingBoxes) ? campaign.boundingBoxes.map(box => parseBbox(box, maxSpan)) : []);
  const countries = Array.isArray(campaign.countries) ? campaign.countries : [];
  const cities = Array.isArray(campaign.cities) ? campaign.cities : [];
  return boxes.map((bbox, index) => ({
    index,
    key: `${index}:${bbox.join(',')}`,
    bbox,
    country: String(options.country || (countries.length === 1 ? countries[0] : countries[index] || '')),
    city: String(options.city || (cities.length === 1 ? cities[0] : cities[index] || ''))
  }));
}

function rejectionSummary(rejections) {
  return Object.fromEntries(Object.entries(rejections.reduce((summary, item) => {
    summary[item.reason] = (summary[item.reason] || 0) + 1;
    return summary;
  }, {})).sort(([a], [b]) => a.localeCompare(b)));
}

export async function discoverBusinesses(config, options = {}, fetcher = fetch) {
  const categories = normalizeCategories(options.categories || config.categories);
  const bbox = parseBbox(options.bbox || config.bbox, config.maxBboxSpan);
  const configuredCap = Math.max(1, Math.min(100, Number(config.dailyCap || 50)));
  const limit = Math.max(1, Math.min(100, Number(options.limit || configuredCap), configuredCap));
  const query = buildOverpassQuery({bbox, categories, timeoutSeconds: Math.ceil(config.timeoutMs / 1000), maxSpan: config.maxBboxSpan});
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetcher(config.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'accept': 'application/json',
        'user-agent': config.userAgent
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`OpenStreetMap discovery failed with HTTP ${response.status}`);
    const payload = await response.json();
    const rejections = [];
    const prospects = parseOverpassElements(payload.elements, {
      categories,
      country: options.country || config.country,
      city: options.city || config.city,
      excludedDomains: options.excludedDomains || config.excludedDomains,
      allowReservedDomains: options.allowReservedDomains === true || config.allowReservedDomains === true,
      discoveredAt: options.discoveredAt,
      rejections
    });
    return {
      provider: 'openstreetmap-overpass',
      attribution: '© OpenStreetMap contributors',
      license: 'Open Data Commons Open Database License (ODbL) 1.0',
      licenseUrl: 'https://www.openstreetmap.org/copyright',
      query,
      bbox,
      categories,
      rawCount: Array.isArray(payload.elements) ? payload.elements.length : 0,
      rejectedCount: rejections.length,
      rejectionSummary: rejectionSummary(rejections),
      prospects: prospects.slice(0, limit)
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`OpenStreetMap discovery timed out after ${config.timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
