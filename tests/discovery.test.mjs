import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_DISCOVERY_COUNTRIES,
  buildDiscoveryBatches,
  buildOverpassQuery,
  discoverBusinesses,
  normalizeCategories,
  parseBbox,
  parseOverpassElements,
  qualifyBusinessWebsite
} from '../src/discovery.mjs';

const point = (id, tags, latitude = 51.5, longitude = -0.1) => ({ type: 'node', id, lat: latitude, lon: longitude, tags });

test('discovery validates city-sized bounding boxes', () => {
  assert.deepEqual(parseBbox('51.28,-0.51,51.69,0.33', 5), [51.28, -0.51, 51.69, 0.33]);
  assert.throws(() => parseBbox('0,0,40,40', 5), /too large/i);
  assert.throws(() => parseBbox('north,0,1,2', 5), /must be a number/i);
});

test('discovery accepts only supported medical, agency, and B2B category names', () => {
  assert.deepEqual(normalizeCategories('clinic,dentist,clinic'), ['clinic', 'dentist']);
  assert.deepEqual(
    normalizeCategories(['dermatology', 'cosmetic_clinic', 'fertility_clinic', 'healthcare_agency', 'professional_services_agency', 'b2b_company']),
    ['dermatology', 'cosmetic_clinic', 'fertility_clinic', 'healthcare_agency', 'professional_services_agency', 'b2b_company']
  );
  assert.throws(() => normalizeCategories('clinic"];out;'), /unsupported/i);
});

test('Overpass query is generated only from whitelisted selectors', () => {
  const query = buildOverpassQuery({
    bbox: '51.28,-0.51,51.69,0.33',
    categories: ['clinic', 'dermatology', 'professional_services_agency'],
    timeoutSeconds: 20,
    maxSpan: 5
  });
  assert.match(query, /\[out:json\]\[timeout:20\]/);
  assert.match(query, /amenity/);
  assert.match(query, /healthcare:speciality/);
  assert.match(query, /office/);
  assert.match(query, /out center tags/);
});

test('Overpass records preserve evidence provenance, location, timestamp, and normalized-domain deduplication', () => {
  const records = parseOverpassElements([
    point(1, { name: 'North Clinic', amenity: 'clinic', website: 'north.example.com/path' }),
    { type: 'way', id: 2, center: { lat: 51.51, lon: -0.11 }, tags: { name: 'North Duplicate', healthcare: 'clinic', 'contact:website': 'https://www.north.example.com/other' } },
    point(3, { name: 'No Website', amenity: 'clinic' }),
    point(4, { name: 'South Dental', amenity: 'dentist', 'contact:website': 'https://dental.example.com' })
  ], {
    categories: ['clinic', 'dentist'],
    country: 'GB',
    city: 'London',
    discoveredAt: '2026-07-18T01:02:03.000Z'
  });
  assert.equal(records.length, 2);
  assert.equal(records[0].company, 'North Clinic');
  assert.equal(records[0].domain, 'north.example.com');
  assert.equal(records[0].sourceProvider, 'openstreetmap-overpass');
  assert.equal(records[0].sourceRecordId, 'node/1');
  assert.match(records[0].sourceLicense, /ODbL/);
  assert.equal(records[0].sourceAttribution, '© OpenStreetMap contributors');
  assert.equal(records[0].discoveredAt, '2026-07-18T01:02:03.000Z');
  assert.deepEqual(records[0].location, { country: 'GB', city: 'London', latitude: 51.5, longitude: -0.1 });
  assert.equal(records[1].niche, 'dentist');
});

test('business website gate rejects unsafe, internal, own, directory, parked, reserved, and malformed targets', () => {
  const rejected = [
    ['ftp://files.example.com', 'invalid_website'],
    ['http://127.0.0.1', 'private_or_internal_website'],
    ['http://169.254.169.254/latest/meta-data', 'private_or_internal_website'],
    ['http://metadata.google.internal', 'private_or_internal_website'],
    ['https://uberbondd-lite-private.vercel.app', 'own_domain'],
    ['https://www.linkedin.com/company/example', 'directory_or_social_profile'],
    ['https://afternic.com/domain/example', 'obvious_parked_domain'],
    ['https://clinic.test', 'reserved_or_nonpublic_domain'],
    ['https://-broken.example.com', 'malformed_domain']
  ];
  for (const [website, reason] of rejected) assert.equal(qualifyBusinessWebsite(website).reason, reason, website);
  const eligible = qualifyBusinessWebsite('clinic.example.com/care');
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.domain, 'clinic.example.com');
});

test('campaign geography batches align the initial six supported countries with resumable indexes', () => {
  const boxes = [
    [25.05, 54.9, 25.35, 55.55], [24.4, 46.3, 25, 47], [25.15, 51.35, 25.45, 51.65],
    [29.15, 47.75, 29.5, 48.15], [51.28, -0.51, 51.69, 0.33], [-34.1, 150.8, -33.6, 151.4]
  ];
  const batches = buildDiscoveryBatches({
    countries: SUPPORTED_DISCOVERY_COUNTRIES,
    cities: ['Dubai', 'Riyadh', 'Doha', 'Kuwait City', 'London', 'Sydney'],
    boundingBoxes: boxes
  });
  assert.equal(batches.length, 6);
  assert.deepEqual(batches.map(batch => batch.country), SUPPORTED_DISCOVERY_COUNTRIES);
  assert.deepEqual(batches.map(batch => batch.index), [0, 1, 2, 3, 4, 5]);
  assert.equal(batches[5].city, 'Sydney');
});

test('discovery reports safe rejection categories and obeys the result limit', async () => {
  let request;
  const fetcher = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ elements: [
        point(1, { name: 'A Clinic', amenity: 'clinic', website: 'https://a.example.com' }, 1.1, 1.1),
        point(2, { name: 'B Clinic', amenity: 'clinic', website: 'https://b.example.com' }, 1.2, 1.2),
        point(3, { name: 'Social Only', amenity: 'clinic', website: 'https://instagram.com/social' }, 1.3, 1.3),
        point(4, { name: 'No Site', amenity: 'clinic' }, 1.4, 1.4)
      ] })
    };
  };
  const result = await discoverBusinesses({
    endpoint: 'https://overpass.example.com/api/interpreter',
    categories: ['clinic'],
    bbox: '1,1,1.5,1.5',
    country: '',
    city: '',
    dailyCap: 10,
    timeoutMs: 1000,
    maxBboxSpan: 5,
    userAgent: 'UberBondTest/1.0',
    excludedDomains: []
  }, { limit: 1 }, fetcher);
  assert.equal(request.url, 'https://overpass.example.com/api/interpreter');
  assert.equal(request.options.method, 'POST');
  assert.match(request.options.body, /data=/);
  assert.equal(result.rawCount, 4);
  assert.equal(result.rejectedCount, 2);
  assert.deepEqual(result.rejectionSummary, { directory_or_social_profile: 1, missing_website: 1 });
  assert.equal(result.prospects.length, 1);
});
