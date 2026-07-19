import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  CAMPAIGN_CONFIG_SCHEMA,
  CampaignConfigError,
  createCampaignRecord,
  validateCampaignConfig
} from '../src/campaign-config.mjs';

const demo = JSON.parse(await fs.readFile(
  new URL('../config/campaigns/demo-healthcare-dry-run.json', import.meta.url),
  'utf8'
));

const changed = (patch = {}) => ({ ...structuredClone(demo), ...patch });

test('campaign schema is strict and the disabled demonstration campaign validates', () => {
  assert.equal(CAMPAIGN_CONFIG_SCHEMA.additionalProperties, false);
  assert(CAMPAIGN_CONFIG_SCHEMA.required.includes('campaignId'));
  assert(CAMPAIGN_CONFIG_SCHEMA.required.includes('autoSend'));
  const clean = validateCampaignConfig(demo);
  assert.deepEqual(clean.countries, ['AE', 'SA', 'QA', 'KW', 'GB', 'AU']);
  assert.equal(clean.enabled, false);
  assert.equal(clean.dryRun, true);
  assert.equal(clean.autoSend, false);
  assert.equal(clean.maximumPagesPerSite, 5);

  const record = createCampaignRecord(demo, { createdAt: '2026-07-18T00:00:00.000Z' });
  assert.equal(record.id, demo.campaignId);
  assert.equal(record.approved, false);
  assert.equal(record.liveSendApproved, false);
  assert.deepEqual(record.dailyCaps, { A: 0, B: 0 });
  assert.equal(record.configurationVersion, 1);
});

test('campaign validator rejects missing, unknown, credential, and non-JSON fields', () => {
  const missing = changed();
  delete missing.offer;
  assert.throws(() => validateCampaignConfig(missing), /offer: is required/);
  assert.throws(() => validateCampaignConfig({ ...changed(), surprise: true }), /surprise: unknown field/);
  assert.throws(() => validateCampaignConfig({ ...changed(), apiKey: 'secret' }), /credential fields are prohibited/);
  assert.throws(() => validateCampaignConfig(changed({ offer: 'postgresql:\/\/user:password@example.com/db' })), /secret material/);
  assert.throws(() => validateCampaignConfig(changed({ dryRun: 'true' })), /must be a JSON boolean/);
  assert.throws(() => validateCampaignConfig(Object.assign(Object.create(null), changed())), /plain JSON object/);
});

test('campaign validator rejects invalid geography and discovery selectors', () => {
  assert.throws(() => validateCampaignConfig(changed({ countries: ['ZZ'] })), /invalid country/);
  assert.throws(() => validateCampaignConfig(changed({ countries: ['AE', 'United Arab Emirates'] })), /duplicates/);
  assert.throws(() => validateCampaignConfig(changed({ boundingBoxes: [[-91, 0, 1, 1]] })), /outside valid latitude/);
  assert.throws(() => validateCampaignConfig(changed({ boundingBoxes: [[0, 0, 20, 20]] })), /too large/);
  assert.throws(() => validateCampaignConfig(changed({ discoveryCategories: ['linkedin'] })), /Unsupported discovery categories/);
});

test('campaign validator rejects unsafe caps, time windows, and auto-send combinations', () => {
  assert.throws(() => validateCampaignConfig(changed({ dailyDiscoveryCap: 101 })), /between 0 and 100/);
  assert.throws(() => validateCampaignConfig(changed({ dailyAuditCap: 1.5 })), /must be an integer/);
  assert.throws(() => validateCampaignConfig(changed({ maximumPagesPerSite: 13 })), /between 1 and 12/);
  assert.throws(() => validateCampaignConfig(changed({ dailySendCap: 2, hourlySendCap: 3, allowedInboxes: ['A'] })), /cannot exceed dailySendCap/);
  assert.throws(() => validateCampaignConfig(changed({ dailySendCap: 2, hourlySendCap: 1, allowedInboxes: [] })), /at least one inbox/);
  assert.throws(() => validateCampaignConfig(changed({ businessHourStart: 17, businessHourEnd: 9 })), /later than businessHourStart/);
  assert.throws(() => validateCampaignConfig(changed({ autoSend: true })), /cannot be true while dryRun is true/);
});

test('live configuration requires independent system and campaign approvals', () => {
  const live = changed({
    enabled: true,
    dryRun: false,
    autoSend: true,
    dailySendCap: 10,
    hourlySendCap: 2,
    allowedInboxes: ['A']
  });
  assert.throws(() => validateCampaignConfig(live), /system live-send approval/);
  assert.throws(
    () => validateCampaignConfig(live, { systemLiveSendApproved: true }),
    /campaign live-send approval/
  );
  const clean = validateCampaignConfig(live, {
    systemLiveSendApproved: true,
    campaignLiveSendApproved: true
  });
  assert.equal(clean.autoSend, true);
  const record = createCampaignRecord(live, {
    systemLiveSendApproved: true,
    campaignLiveSendApproved: true
  });
  assert.equal(record.liveSendApproved, true);
  assert.deepEqual(record.dailyCaps, { A: 10, B: 0 });
});

test('campaign auto-send cannot be armed while the campaign is disabled', () => {
  const disabledLive = changed({
    enabled: false,
    dryRun: false,
    autoSend: true,
    dailySendCap: 10,
    hourlySendCap: 2,
    allowedInboxes: ['A']
  });
  assert.throws(
    () => validateCampaignConfig(disabledLive, { systemLiveSendApproved: true, campaignLiveSendApproved: true }),
    error => error instanceof CampaignConfigError && /enabled is false/.test(error.message)
  );
});
