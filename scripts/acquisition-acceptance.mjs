import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCampaignRecord } from '../src/campaign-config.mjs';
import { approvedDraftPatch, evaluateDraftApproval } from '../src/cockpit.mjs';
import { DiscoveryRunner } from '../src/discovery-runner.mjs';
import { createTestGmailAdapter, parseGmailMessage } from '../src/gmail.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { Store } from '../src/store.mjs';

const FIXED_TIME = new Date('2026-07-20T10:00:00.000Z');
const FIXTURE_WEBSITE = 'https://acceptance-clinic.example.com/';
const FIXTURE_EMAIL = 'hana@acceptance-clinic.example.com';
const REPLY_ID = 'acceptance-reply-1';

function acceptanceConfig(dataDir, runtimeSecrets) {
  return {
    nodeEnv: 'test',
    baseUrl: 'https://operator.uberbond.test',
    dataDir,
    screenshotDir: path.join(dataDir, 'screenshots'),
    storeBackend: 'json',
    allowLocalFixtures: false,
    chromiumPath: '',
    encryptionKey: runtimeSecrets.encryptionKey,
    unsubscribeSecret: runtimeSecrets.unsubscribeSecret,
    hunterKey: '',
    maxBatch: 1,
    sender: {
      name: 'Mohamed',
      company: 'UberBond',
      address: 'Owner-configured business address'
    },
    ai: { provider: 'rules' },
    google: {},
    caps: { A: 1, B: 0 },
    artifacts: { retentionDays: 1, maxBytes: 1024 * 1024, deleteLocalAfterUpload: false },
    queue: { lockTimeoutMs: 60_000, retryBaseMs: 1000, retryMaxMs: 10_000 },
    crawl: {
      concurrency: 1,
      maxPages: 2,
      delayMs: 0,
      minDomainGapMs: 0,
      timeoutMs: 1000,
      maxAttempts: 1,
      minimumTextLength: 80,
      minimumQualityScore: 60
    },
    discovery: {
      endpoint: 'https://fixture.invalid/overpass',
      timeoutMs: 1000,
      userAgent: 'UberBond deterministic acceptance fixture',
      dailyCap: 1,
      maxBboxSpan: 5,
      categories: ['clinic'],
      bbox: [51.49, -0.14, 51.53, -0.08],
      country: 'GB',
      city: 'London',
      excludedDomains: [],
      allowReservedDomains: true,
      batchesPerRun: 1,
      maxCampaignsPerRun: 1,
      dryRun: true,
      campaignId: ''
    },
    outbound: {
      provider: 'test',
      enabled: false,
      dryRun: true,
      liveSendApproved: false,
      allowedCountries: ['GB'],
      hourlyCaps: { A: 1, B: 0 },
      processBatchSize: 1,
      minGapSeconds: 0,
      maxGapJitterSeconds: 0,
      businessHourStart: 9,
      businessHourEnd: 17,
      minEvidenceConfidence: 0.8,
      hardBouncePauseThreshold: 2,
      complaintPauseThreshold: 1,
      failurePauseThreshold: 3
    },
    revenue: {
      publicIntake: false,
      publicRateLimitPerHour: 1,
      freeFindings: 1,
      fullAuditPrice: 49,
      strategyAuditPrice: 299,
      monitoringPrice: 99,
      implementationFrom: 1250,
      bookingUrl: '',
      reportDeliveryInbox: 'B',
      autoEmailReports: false,
      paymentProvider: 'lemonsqueezy',
      fullAuditCheckoutUrl: 'https://checkout.example.test/full',
      strategyAuditCheckoutUrl: 'https://checkout.example.test/strategy',
      monitoringCheckoutUrl: 'https://checkout.example.test/monitoring',
      implementationCheckoutUrl: 'https://checkout.example.test/implementation',
      lemonWebhookSecret: runtimeSecrets.webhookSecret,
      allowTestUnlock: false,
      monitoringIntervalDays: 30,
      monitoringBatchSize: 1
    }
  };
}

function fixtureCrawl() {
  const brokenUrl = new URL('/appointments', FIXTURE_WEBSITE).href;
  const bodyText = [
    'Acceptance Clinic provides consultant-led care in London.',
    `Dr Hana Saleh is the Medical Director. Public enquiries: ${FIXTURE_EMAIL}.`,
    'Visitors can request an appointment from the primary action on this page.',
    'The public appointments link was observed returning an error in this deterministic fixture.'
  ].join(' ');
  const cta = {
    text: 'Book an appointment',
    accessibleName: 'Book an appointment',
    href: brokenUrl,
    tag: 'a',
    aboveFold: true,
    visible: true
  };
  return {
    startUrl: FIXTURE_WEBSITE,
    domain: 'acceptance-clinic.example.com',
    robots: { allowed: true, fetched: true, source: 'fixture' },
    quality: { degraded: false },
    renderQuality: { degraded: false, reliable: true },
    errors: [],
    pages: [{
      url: FIXTURE_WEBSITE,
      status: 200,
      title: 'Acceptance Clinic | Consultant-led care',
      description: 'Consultant-led care and public appointment information in London.',
      lang: 'en',
      bodyText,
      h1Count: 1,
      visibleH1: ['Consultant-led care in London'],
      headings: [{ level: 1, text: 'Consultant-led care in London' }],
      ctas: [cta],
      contactSignals: 2,
      emailEvidence: [{
        email: FIXTURE_EMAIL,
        sourceUrl: FIXTURE_WEBSITE,
        sourceType: 'visible_text',
        evidenceExcerpt: `Dr Hana Saleh — Medical Director — ${FIXTURE_EMAIL}`,
        firstName: 'Hana',
        lastName: 'Saleh',
        name: 'Dr Hana Saleh',
        position: 'Medical Director'
      }],
      mailtoLinks: [],
      jsonLd: [],
      images: [],
      forms: [],
      brokenLinks: [{ url: brokenUrl, status: 404 }],
      screenshots: { desktop: 'fixture://acceptance-home-desktop' },
      renderQuality: { degraded: false, reliable: true, primaryActionInspection: 'complete' },
      mobile: {
        horizontalOverflow: false,
        ctas: [cta],
        controls: [{ text: 'Book an appointment', width: 180, height: 48 }],
        renderQuality: { degraded: false, reliable: true }
      }
    }],
    startedAt: FIXED_TIME.toISOString(),
    completedAt: new Date(FIXED_TIME.getTime() + 1000).toISOString()
  };
}

function fixtureOverpassResponse() {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        elements: [{
          type: 'node',
          id: 900001,
          lat: 51.51,
          lon: -0.11,
          tags: {
            name: 'Acceptance Clinic',
            amenity: 'clinic',
            website: FIXTURE_WEBSITE,
            'addr:city': 'London',
            'addr:country': 'GB'
          }
        }]
      };
    }
  };
}

function webhookBody(offer) {
  return JSON.stringify({
    meta: {
      event_name: 'order_created',
      test_mode: true,
      custom_data: {
        offer_id: offer.id,
        prospect_id: offer.prospectId,
        campaign_id: offer.campaignId,
        offer_type: offer.type
      }
    },
    data: {
      id: 'acceptance-order-1',
      type: 'orders',
      attributes: {
        total: offer.amountCents,
        currency: offer.currency,
        status: 'paid',
        test_mode: true,
        created_at: '2026-07-20T10:15:00.000Z'
      }
    }
  });
}

function printAcceptance(result) {
  process.stdout.write('UberBond acquisition acceptance — TEST MODE\n');
  for (const transition of result.transitions) {
    process.stdout.write(`${String(transition.step).padStart(2, '0')}. ${transition.stage}: ${transition.from} -> ${transition.to} (${transition.proof})\n`);
  }
  process.stdout.write(`Safety: dryRun=${result.safety.dryRun}; provider=${result.safety.outboundProvider}; simulatedEmails=${result.safety.simulatedEmails}; realEmails=${result.safety.realEmails}; webhookMode=${result.safety.webhookMode}; externalNetworkCalls=${result.safety.externalNetworkCalls}; customerSitesModified=${result.safety.customerSitesModified}\n`);
  process.stdout.write('ACCEPTANCE PASSED\n');
}

export async function runAcquisitionAcceptance(options = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-acquisition-acceptance-'));
  const store = new Store(path.join(tempDir, 'data'));
  const transitions = [];
  const record = (stage, from, to, proof) => transitions.push({ step: transitions.length + 1, stage, from, to, proof });
  const runtimeSecrets = {
    encryptionKey: crypto.randomBytes(32).toString('hex'),
    unsubscribeSecret: crypto.randomBytes(32).toString('hex'),
    webhookSecret: crypto.randomBytes(32).toString('hex')
  };
  const cfg = acceptanceConfig(path.join(tempDir, 'data'), runtimeSecrets);
  const testMail = createTestGmailAdapter();
  let replyReady = false;

  try {
    await store.init();
    const rawCampaign = JSON.parse(await fs.readFile(new URL('../config/campaigns/e2e-acceptance-dry-run.json', import.meta.url), 'utf8'));
    const campaign = createCampaignRecord(rawCampaign, { createdAt: FIXED_TIME.toISOString() });
    assert.equal(campaign.dryRun, true);
    assert.equal(campaign.autoSend, false);
    assert.equal(campaign.liveSendApproved, false);
    await store.add('campaigns', campaign);

    const discovery = new DiscoveryRunner(store, cfg, {
      clock: () => FIXED_TIME,
      fetcher: async () => fixtureOverpassResponse()
    });
    const discoveryResult = await discovery.run({
      campaignId: campaign.id,
      limit: 1,
      maxBatches: 1,
      dryRun: false
    });
    assert.equal(discoveryResult.discoveredCount, 1);
    assert.equal(discoveryResult.importedCount, 1);
    record('fixture-discovery', 'fixture-source', 'discovered', '1 ODbL-attributed public-business record');
    record('normalize-and-import', 'discovered', 'queued', '1 normalized domain; 0 duplicates');

    let prospect = (await store.list('prospects'))[0];
    assert(prospect);
    assert.equal(prospect.domain, 'acceptance-clinic.example.com');
    assert.equal(prospect.sourceProvider, 'openstreetmap-overpass');

    const getMessage = async (...args) => {
      const messageId = args[3];
      if (messageId === REPLY_ID) return { data: { acceptanceReply: true } };
      return testMail.getMessage(...args);
    };
    const parseMessage = data => data?.acceptanceReply ? {
      id: REPLY_ID,
      threadId: prospect.threadId,
      messageId: '<acceptance-reply-1@example.com>',
      inReplyTo: prospect.rfcMessageId,
      from: `Hana Saleh <${FIXTURE_EMAIL}>`,
      subject: `Re: ${prospect.subject}`,
      body: 'Yes, please send me more information.',
      snippet: 'Yes, please send me more information.',
      autoSubmitted: 'no'
    } : parseGmailMessage(data);
    const pipeline = new Pipeline(store, cfg, {
      clock: () => FIXED_TIME,
      sleep: async () => {},
      crawlSite: async () => structuredClone(fixtureCrawl()),
      sendEmail: testMail.sendEmail,
      getMessage,
      listMessages: async () => ({ data: { messages: replyReady ? [{ id: REPLY_ID }] : [] }, simulated: true }),
      parseGmailMessage: parseMessage
    });

    const execution = await pipeline.runBatch(1, { prospectId: prospect.id });
    assert.equal(execution.status, 'completed');
    prospect = await store.get('prospects', prospect.id);
    assert.equal(prospect.crawlQuality.credible, true);
    assert(prospect.audit.length > 0);
    assert.equal(prospect.issue.code, 'broken-links');
    assert(Number(prospect.score.total) >= campaign.minimumProspectScore);
    assert.equal(prospect.contact.email, FIXTURE_EMAIL);
    assert.equal(prospect.contact.automationEligible, true);
    assert.equal(prospect.outreach.status, 'needs-review');
    assert.equal(prospect.outreach.selected.quality.passed, true);
    record('fixture-crawl', 'queued', 'crawled', `${prospect.crawlQuality.pagesVisited} rendered page; quality ${prospect.crawlQuality.score}`);
    record('deterministic-audit', 'crawled', 'audited', `${prospect.audit.length} evidence-validated finding(s)`);
    record('opportunity-score', 'audited', 'qualified', `score ${prospect.score.total}; threshold ${campaign.minimumProspectScore}`);
    record('public-contact', 'qualified', 'contact-found', `${prospect.contact.role}; same-domain published evidence`);
    record('evidence-locked-draft', 'contact-found', 'needs-review', `quality ${prospect.outreach.selected.quality.score}; ${prospect.outreach.selected.sentences.length} bound sentences`);

    const suppressions = await store.list('suppressions');
    const approval = evaluateDraftApproval({ prospect, campaign, cfg, suppressions });
    assert.equal(approval.ok, true);
    prospect = await store.patch('prospects', prospect.id, approvedDraftPatch(prospect, FIXED_TIME.toISOString()));
    record('owner-approval', 'needs-review', 'approved', `${approval.approvalMode}; live eligibility remains false`);

    prospect = await store.patch('prospects', prospect.id, {
      status: 'scheduled',
      acquisitionStatus: 'scheduled',
      scheduledAt: FIXED_TIME.toISOString(),
      sendAuthorization: { mode: 'owner-approved', includesFollowup: false }
    });
    record('owner-schedule', 'approved', 'scheduled', 'initial message only');

    const sendResult = await pipeline.maybeSend(prospect, campaign, { authorization: 'owner-approved' });
    assert.equal(sendResult.sent, true);
    assert.equal(sendResult.message.simulated, true);
    assert.equal(testMail.inspect().length, 1);
    prospect = await store.get('prospects', prospect.id);
    assert.equal(prospect.status, 'sent');
    record('simulated-gmail-send', 'scheduled', 'sent', 'test adapter; 1 provider call; 0 real emails');

    const followupAt = new Date(FIXED_TIME.getTime() + campaign.followupDelayDays * 86_400_000).toISOString();
    prospect = await store.patch('prospects', prospect.id, {
      nextFollowupAt: followupAt,
      followupCount: 0,
      followupSimulation: { maximum: campaign.maximumFollowups, testOnly: true }
    });
    record('followup-simulation', 'sent', 'followup-scheduled', `maximum ${campaign.maximumFollowups}; no provider call`);

    await store.add('accounts', {
      id: 'acceptance-account-a',
      slot: 'A',
      connected: true,
      email: 'test-a@gmail.invalid',
      tokens: '',
      lastReplyPoll: FIXED_TIME.getTime() - 86_400_000,
      createdAt: FIXED_TIME.toISOString()
    });
    replyReady = true;
    const repliesIngested = await pipeline.pollReplies({ accountLimit: 1, messageLimit: 1 });
    assert.equal(repliesIngested, 1);
    prospect = await store.get('prospects', prospect.id);
    assert.equal(prospect.replyLabel, 'asks-for-information');
    assert.equal(prospect.nextFollowupAt, null);
    assert.equal(testMail.inspect().length, 1);
    record('simulated-reply', 'followup-scheduled', 'asks-for-information', 'deterministic high-confidence rule');
    record('followup-stop', 'scheduled', 'cancelled', 'reply atomically cleared nextFollowupAt');

    const revenue = new RevenueEngine(store, cfg, pipeline);
    let offer = await revenue.createOffer(prospect.id, {
      type: 'implementation-sprint',
      name: 'Acceptance implementation sprint',
      scope: 'Correct only the evidenced appointments-link failure and document the result.',
      exclusions: ['Customer-site access', 'Third-party fees', 'Unapproved scope'],
      amountCents: 125000,
      currency: 'GBP',
      provider: 'lemonsqueezy',
      providerMode: 'test',
      checkoutKey: 'implementation'
    });
    record('offer-created', 'reply-qualified', 'offer-draft', 'evidence-linked implementation scope');
    offer = await revenue.approveOffer(offer.id);
    record('offer-approval', 'offer-draft', 'offer-approved', 'explicit owner approval');
    offer = (await revenue.issueCheckout(offer.id)).offer;
    record('checkout', 'offer-approved', 'checkout-sent', 'test-mode hosted checkout metadata only');

    const rawBody = webhookBody(offer);
    const signature = crypto.createHmac('sha256', runtimeSecrets.webhookSecret).update(rawBody).digest('hex');
    const webhook = await revenue.handleLemonWebhook(rawBody, signature);
    assert.equal(webhook.ok, true);
    assert.equal(webhook.event.testMode, true);
    record('verified-webhook', 'checkout-sent', 'signature-verified', 'raw-body HMAC; test_mode=true');

    const paidOrder = (await store.list('orders')).find(item => item.paymentState === 'paid');
    assert(paidOrder);
    assert.equal(paidOrder.verified, true);
    assert.equal(paidOrder.verificationSource, 'verified-webhook');
    assert.equal((await store.get('offers', offer.id)).paymentState, 'paid');
    record('paid-order', 'signature-verified', 'paid', 'verified order; amount and currency matched');

    const deliveries = await store.list('deliveries');
    assert.equal(deliveries.length, 1);
    const delivery = deliveries[0];
    assert.equal(delivery.status, 'delivery-queued');
    assert.equal(delivery.testMode, true);
    assert.equal(delivery.siteChangeAuthorization.automaticModificationAllowed, false);
    const deliveryTask = await store.get('notifications', `delivery-task:${delivery.id}`);
    assert.equal(deliveryTask.type, 'delivery_task');
    record('delivery-task', 'paid', 'delivery-queued', '1 owner task; automatic site modification disabled');

    const result = {
      ok: true,
      mode: 'test',
      transitions,
      summary: {
        discovered: discoveryResult.discoveredCount,
        imported: discoveryResult.importedCount,
        findings: prospect.audit.length,
        score: prospect.score.total,
        draftQuality: prospect.outreach.selected.quality.score,
        replyClass: prospect.replyLabel,
        paidOrders: 1,
        deliveryTasks: 1
      },
      safety: {
        dryRun: true,
        outboundProvider: 'test',
        simulatedEmails: testMail.inspect().length,
        realEmails: 0,
        webhookMode: 'test',
        externalNetworkCalls: 0,
        customerSitesModified: 0,
        liveSendApproved: false
      }
    };
    if (!options.quiet) printAcceptance(result);
    return result;
  } finally {
    await store.close().catch(() => {});
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  runAcquisitionAcceptance().catch(error => {
    process.stderr.write(`ACCEPTANCE FAILED: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}
