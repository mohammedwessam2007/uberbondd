import { normalizeDomain, uniq } from './utils.mjs';

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

const WEBSITE_KEYS = ['contact:website', 'website', 'url', 'contact:url'];
const NAME_KEYS = ['name', 'brand', 'operator'];

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

function normalizeWebsite(raw) {
  const candidate = String(raw || '').split(/[;,\s]+/).find(Boolean) || '';
  if (!candidate) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate) && !/^https?:\/\//i.test(candidate)) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!url.hostname.includes('.')) return '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
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

export function parseOverpassElements(elements, options = {}) {
  const requested = normalizeCategories(options.categories || ['clinic']);
  const seen = new Set();
  const prospects = [];
  for (const element of Array.isArray(elements) ? elements : []) {
    const tags = element?.tags || {};
    const company = String(firstTag(tags, NAME_KEYS) || '').trim();
    const website = normalizeWebsite(firstTag(tags, WEBSITE_KEYS));
    const domain = normalizeDomain(website);
    if (!company || !website || !domain || seen.has(domain)) continue;
    seen.add(domain);
    const category = categoryFor(tags, requested);
    const lat = element.lat ?? element.center?.lat ?? null;
    const lon = element.lon ?? element.center?.lon ?? null;
    prospects.push({
      company: company.slice(0, 180),
      website,
      niche: category.replaceAll('_', ' '),
      country: String(options.country || tags['addr:country'] || '').slice(0, 80),
      city: String(options.city || tags['addr:city'] || tags['addr:town'] || '').slice(0, 80),
      source: 'openstreetmap',
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      sourceRecordId: `${element.type}/${element.id}`,
      sourceLicense: '© OpenStreetMap contributors',
      sourceMetadata: {
        osmType: element.type,
        osmId: element.id,
        lat,
        lon,
        category,
        websiteTag: WEBSITE_KEYS.find(key => tags[key]) || ''
      },
      notes: `Public business record discovered through OpenStreetMap (${element.type}/${element.id}). Website was present in the public OSM record.`
    });
  }
  return prospects;
}

export async function discoverBusinesses(config, options = {}, fetcher = fetch) {
  const categories = normalizeCategories(options.categories || config.categories);
  const bbox = parseBbox(options.bbox || config.bbox, config.maxBboxSpan);
  const limit = Math.max(1, Math.min(Number(options.limit || config.dailyCap || 50), Number(config.dailyCap || 50)));
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
    const prospects = parseOverpassElements(payload.elements, {
      categories,
      country: options.country || config.country,
      city: options.city || config.city
    });
    return {
      provider: 'openstreetmap-overpass',
      attribution: '© OpenStreetMap contributors',
      query,
      bbox,
      categories,
      rawCount: Array.isArray(payload.elements) ? payload.elements.length : 0,
      prospects: prospects.slice(0, limit)
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`OpenStreetMap discovery timed out after ${config.timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
