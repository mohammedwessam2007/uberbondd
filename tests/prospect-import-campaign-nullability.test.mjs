import test from 'node:test';
import assert from 'node:assert/strict';
import { importProspects, validateProspect } from '../src/prospect-import.mjs';

test('campaign-unbound prospect validation omits campaignId instead of materializing an empty FK', () => {
  const prospect = validateProspect({ company: 'No Campaign Co', website: 'https://nocampaign.example' });
  assert.equal(Object.hasOwn(prospect, 'campaignId'), false);
});

test('real campaign binding is preserved exactly', () => {
  const prospect = validateProspect({ company: 'Campaign Co', website: 'https://campaign.example' }, 'camp_real_1');
  assert.equal(prospect.campaignId, 'camp_real_1');
});

test('canonical importer writes no campaignId property when no real campaign exists', async () => {
  let added = null;
  const store = {
    async add(key, row) {
      assert.equal(key, 'prospects');
      added = row;
      return row;
    }
  };
  const result = await importProspects(store, { maxBatch: 10 }, [{
    company: 'Campaignless Import', website: 'https://campaignless.example', source: 'public_website'
  }]);
  assert.equal(result.added.length, 1);
  assert.ok(added);
  assert.equal(Object.hasOwn(added, 'campaignId'), false);
});
