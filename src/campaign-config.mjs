import { normalizeCategories, parseBbox } from './discovery.mjs';
import { normalizeCountry } from './send-safety.mjs';

const CAMPAIGN_FIELDS = Object.freeze([
  'campaignId', 'name', 'niche', 'countries', 'cities', 'boundingBoxes',
  'discoveryCategories', 'minimumProspectScore', 'minimumEvidenceConfidence',
  'dailyDiscoveryCap', 'dailyAuditCap', 'dailyDraftCap', 'dailySendCap',
  'hourlySendCap', 'allowedInboxes', 'businessHourStart', 'businessHourEnd',
  'maximumFollowups', 'followupDelayDays', 'offer', 'callToAction',
  'subjectVariants', 'messageVariants', 'suppressionKeywords',
  'prohibitedClaims', 'dryRun', 'autoSend', 'enabled'
]);
const OPTIONAL_CAMPAIGN_FIELDS = Object.freeze(['maximumPagesPerSite']);

const CAMPAIGN_FIELD_SET = new Set([...CAMPAIGN_FIELDS, ...OPTIONAL_CAMPAIGN_FIELDS]);
const PSEUDO_REGION_CODES = new Set(['AA', 'AN', 'BU', 'CS', 'DD', 'EU', 'EZ', 'FX', 'NT', 'QO', 'SU', 'TP', 'UK', 'UN', 'XA', 'XB', 'YD', 'YU', 'ZR', 'ZZ']);
const CREDENTIAL_KEY = /(?:api[_-]?key|client[_-]?secret|password|passphrase|private[_-]?key|refresh[_-]?token|access[_-]?token|oauth|database[_-]?url|authorization)/i;
const CREDENTIAL_VALUE = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{16,}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{16,}\b|\bAIza[A-Za-z0-9_-]{30,}\b|\bpostgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@|\bhttps?:\/\/[^\s:@/]+:[^\s@/]+@)/i;

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export class CampaignConfigError extends Error {
  constructor(message, path = 'campaign') {
    super(`${path}: ${message}`);
    this.name = 'CampaignConfigError';
    this.path = path;
  }
}

export const CAMPAIGN_CONFIG_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'UberBond acquisition campaign',
  type: 'object',
  additionalProperties: false,
  required: [...CAMPAIGN_FIELDS],
  properties: {
    campaignId: { type: 'string', pattern: '^[a-z][a-z0-9_-]{2,63}$' },
    name: { type: 'string', minLength: 3, maxLength: 120 },
    niche: { type: 'string', minLength: 2, maxLength: 180 },
    countries: { type: 'array', minItems: 1, maxItems: 25, uniqueItems: true, items: { type: 'string', pattern: '^[A-Z]{2}$' } },
    cities: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 100 } },
    boundingBoxes: { type: 'array', maxItems: 100, items: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' } } },
    discoveryCategories: { type: 'array', maxItems: 20, uniqueItems: true, items: { type: 'string' } },
    minimumProspectScore: { type: 'integer', minimum: 0, maximum: 100 },
    minimumEvidenceConfidence: { type: 'number', minimum: 0, maximum: 1 },
    dailyDiscoveryCap: { type: 'integer', minimum: 0, maximum: 100 },
    dailyAuditCap: { type: 'integer', minimum: 0, maximum: 100 },
    dailyDraftCap: { type: 'integer', minimum: 0, maximum: 100 },
    dailySendCap: { type: 'integer', minimum: 0, maximum: 50 },
    hourlySendCap: { type: 'integer', minimum: 0, maximum: 10 },
    allowedInboxes: { type: 'array', maxItems: 2, uniqueItems: true, items: { enum: ['A', 'B'] } },
    businessHourStart: { type: 'integer', minimum: 0, maximum: 23 },
    businessHourEnd: { type: 'integer', minimum: 1, maximum: 24 },
    maximumFollowups: { type: 'integer', minimum: 0, maximum: 1 },
    followupDelayDays: { type: 'integer', minimum: 1, maximum: 30 },
    offer: { type: 'string', minLength: 3, maxLength: 600 },
    callToAction: { type: 'string', minLength: 2, maxLength: 240 },
    subjectVariants: { type: 'array', minItems: 1, maxItems: 10, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 160 } },
    messageVariants: { type: 'array', minItems: 1, maxItems: 10, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 4000 } },
    suppressionKeywords: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 100 } },
    prohibitedClaims: { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 200 } },
    maximumPagesPerSite: { type: 'integer', minimum: 1, maximum: 12 },
    dryRun: { type: 'boolean' },
    autoSend: { type: 'boolean' },
    enabled: { type: 'boolean' }
  }
});

function fail(path, message) {
  throw new CampaignConfigError(message, path);
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function requiredString(value, path, { min = 1, max = 500 } = {}) {
  if (typeof value !== 'string') fail(path, 'must be a string');
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < min) fail(path, `must contain at least ${min} character${min === 1 ? '' : 's'}`);
  if (normalized.length > max) fail(path, `must contain at most ${max} characters`);
  if (CREDENTIAL_VALUE.test(normalized)) fail(path, 'must not contain credentials or secret material');
  return normalized;
}

function strictBoolean(value, path) {
  if (typeof value !== 'boolean') fail(path, 'must be a JSON boolean');
  return value;
}

function boundedInteger(value, path, minimum, maximum) {
  if (!Number.isInteger(value)) fail(path, 'must be an integer');
  if (value < minimum || value > maximum) fail(path, `must be between ${minimum} and ${maximum}`);
  return value;
}

function boundedNumber(value, path, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number');
  if (value < minimum || value > maximum) fail(path, `must be between ${minimum} and ${maximum}`);
  return value;
}

function stringArray(value, path, options = {}) {
  const { minItems = 0, maxItems = 100, maxLength = 200, lowercase = false } = options;
  if (!Array.isArray(value)) fail(path, 'must be an array');
  if (value.length < minItems || value.length > maxItems) fail(path, `must contain between ${minItems} and ${maxItems} items`);
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requiredString(item, `${path}[${index}]`, { max: maxLength });
    const output = lowercase ? normalized.toLowerCase() : normalized;
    const key = output.toLowerCase();
    if (seen.has(key)) fail(`${path}[${index}]`, 'duplicates an earlier item');
    seen.add(key);
    return output;
  });
}

function validIsoCountry(code) {
  if (!/^[A-Z]{2}$/.test(code) || PSEUDO_REGION_CODES.has(code)) return false;
  try {
    const name = regionNames.of(code);
    return Boolean(name && name !== code);
  } catch {
    return false;
  }
}

function countryList(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 25) fail('countries', 'must contain between 1 and 25 country values');
  const seen = new Set();
  return value.map((item, index) => {
    if (typeof item !== 'string') fail(`countries[${index}]`, 'must be a country name or ISO alpha-2 code');
    const code = normalizeCountry(item);
    if (!validIsoCountry(code)) fail(`countries[${index}]`, `unsupported or invalid country: ${String(item)}`);
    if (seen.has(code)) fail(`countries[${index}]`, 'duplicates an earlier country');
    seen.add(code);
    return code;
  });
}

function boundingBoxList(value) {
  if (!Array.isArray(value) || value.length > 100) fail('boundingBoxes', 'must be an array with at most 100 boxes');
  return value.map((box, index) => {
    if (!Array.isArray(box)) fail(`boundingBoxes[${index}]`, 'must be [south, west, north, east]');
    try {
      return parseBbox(box, 5);
    } catch (error) {
      fail(`boundingBoxes[${index}]`, error.message);
    }
  });
}

function categoryList(value) {
  if (!Array.isArray(value)) fail('discoveryCategories', 'must be an array');
  if (!value.length) return [];
  try {
    return normalizeCategories(value);
  } catch (error) {
    fail('discoveryCategories', error.message);
  }
}

function inboxList(value) {
  if (!Array.isArray(value) || value.length > 2) fail('allowedInboxes', 'must be an array containing only A and/or B');
  const normalized = value.map((item, index) => {
    if (typeof item !== 'string' || !['A', 'B'].includes(item.toUpperCase())) fail(`allowedInboxes[${index}]`, 'must be A or B');
    return item.toUpperCase();
  });
  if (new Set(normalized).size !== normalized.length) fail('allowedInboxes', 'must not contain duplicates');
  return normalized;
}

function rejectCredentials(input) {
  for (const key of Object.keys(input)) {
    if (CREDENTIAL_KEY.test(key)) fail(key, 'credential fields are prohibited in campaign configuration');
  }
  if (CREDENTIAL_VALUE.test(JSON.stringify(input))) fail('campaign', 'must not contain credentials or secret material');
}

export function validateCampaignConfig(input, approvals = {}) {
  if (!plainObject(input)) fail('campaign', 'must be a plain JSON object');
  rejectCredentials(input);
  const unknown = Object.keys(input).filter(key => !CAMPAIGN_FIELD_SET.has(key));
  if (unknown.length) fail(unknown[0], `unknown field; allowed fields are: ${CAMPAIGN_FIELDS.join(', ')}`);
  const missing = CAMPAIGN_FIELDS.filter(key => !Object.hasOwn(input, key));
  if (missing.length) fail(missing[0], 'is required');

  const campaignId = requiredString(input.campaignId, 'campaignId', { min: 3, max: 64 }).toLowerCase();
  if (!/^[a-z][a-z0-9_-]{2,63}$/.test(campaignId)) fail('campaignId', 'must start with a letter and contain only lowercase letters, digits, underscores, or hyphens');

  const config = {
    campaignId,
    name: requiredString(input.name, 'name', { min: 3, max: 120 }),
    niche: requiredString(input.niche, 'niche', { min: 2, max: 180 }),
    countries: countryList(input.countries),
    cities: stringArray(input.cities, 'cities', { maxItems: 100, maxLength: 100 }),
    boundingBoxes: boundingBoxList(input.boundingBoxes),
    discoveryCategories: categoryList(input.discoveryCategories),
    minimumProspectScore: boundedInteger(input.minimumProspectScore, 'minimumProspectScore', 0, 100),
    minimumEvidenceConfidence: boundedNumber(input.minimumEvidenceConfidence, 'minimumEvidenceConfidence', 0, 1),
    dailyDiscoveryCap: boundedInteger(input.dailyDiscoveryCap, 'dailyDiscoveryCap', 0, 100),
    dailyAuditCap: boundedInteger(input.dailyAuditCap, 'dailyAuditCap', 0, 100),
    dailyDraftCap: boundedInteger(input.dailyDraftCap, 'dailyDraftCap', 0, 100),
    dailySendCap: boundedInteger(input.dailySendCap, 'dailySendCap', 0, 50),
    hourlySendCap: boundedInteger(input.hourlySendCap, 'hourlySendCap', 0, 10),
    allowedInboxes: inboxList(input.allowedInboxes),
    businessHourStart: boundedInteger(input.businessHourStart, 'businessHourStart', 0, 23),
    businessHourEnd: boundedInteger(input.businessHourEnd, 'businessHourEnd', 1, 24),
    maximumFollowups: boundedInteger(input.maximumFollowups, 'maximumFollowups', 0, 1),
    followupDelayDays: boundedInteger(input.followupDelayDays, 'followupDelayDays', 1, 30),
    offer: requiredString(input.offer, 'offer', { min: 3, max: 600 }),
    callToAction: requiredString(input.callToAction, 'callToAction', { min: 2, max: 240 }),
    subjectVariants: stringArray(input.subjectVariants, 'subjectVariants', { minItems: 1, maxItems: 10, maxLength: 160 }),
    messageVariants: stringArray(input.messageVariants, 'messageVariants', { minItems: 1, maxItems: 10, maxLength: 4000 }),
    suppressionKeywords: stringArray(input.suppressionKeywords, 'suppressionKeywords', { maxItems: 100, maxLength: 100, lowercase: true }),
    prohibitedClaims: stringArray(input.prohibitedClaims, 'prohibitedClaims', { minItems: 1, maxItems: 100, maxLength: 200, lowercase: true }),
    maximumPagesPerSite: input.maximumPagesPerSite === undefined
      ? 5
      : boundedInteger(input.maximumPagesPerSite, 'maximumPagesPerSite', 1, 12),
    dryRun: strictBoolean(input.dryRun, 'dryRun'),
    autoSend: strictBoolean(input.autoSend, 'autoSend'),
    enabled: strictBoolean(input.enabled, 'enabled')
  };

  if (config.businessHourStart >= config.businessHourEnd) fail('businessHourEnd', 'must be later than businessHourStart');
  if (config.hourlySendCap > config.dailySendCap) fail('hourlySendCap', 'cannot exceed dailySendCap');
  if (config.dailySendCap > 0 && config.allowedInboxes.length === 0) fail('allowedInboxes', 'must contain at least one inbox when dailySendCap is above zero');
  if (config.dailyDiscoveryCap > 0 && config.discoveryCategories.length === 0) fail('discoveryCategories', 'must not be empty when dailyDiscoveryCap is above zero');
  if (config.autoSend && config.dryRun) fail('autoSend', 'cannot be true while dryRun is true');
  if (config.autoSend && !config.enabled) fail('autoSend', 'cannot be true while enabled is false');
  if (config.autoSend && (config.dailySendCap === 0 || config.hourlySendCap === 0)) fail('autoSend', 'requires positive dailySendCap and hourlySendCap values');

  if (!config.dryRun) {
    if (approvals.systemLiveSendApproved !== true) fail('dryRun', 'cannot be false without explicit system live-send approval');
    if (approvals.campaignLiveSendApproved !== true) fail('dryRun', 'cannot be false without explicit campaign live-send approval');
  }
  return Object.freeze(config);
}

export function createCampaignRecord(input, options = {}) {
  const campaign = validateCampaignConfig(input, options);
  const dailyCaps = Object.fromEntries(['A', 'B'].map(inbox => [
    inbox,
    campaign.allowedInboxes.includes(inbox) ? campaign.dailySendCap : 0
  ]));
  return {
    ...campaign,
    id: campaign.campaignId,
    allowedCountries: [...campaign.countries],
    minScore: campaign.minimumProspectScore,
    minEvidenceConfidence: campaign.minimumEvidenceConfidence,
    dailyCaps,
    maxFollowups: campaign.maximumFollowups,
    approved: campaign.enabled,
    liveSendApproved: options.campaignLiveSendApproved === true && campaign.dryRun === false,
    configurationVersion: 1,
    createdAt: options.createdAt || new Date().toISOString()
  };
}
