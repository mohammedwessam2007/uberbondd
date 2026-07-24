// End-to-end demonstration (workstream 18 + the mission's own acceptance checklist): import a
// pack -> quarantine invalid records -> deduplicate and rank -> approval packet -> explicit
// approval -> send handoff export -> reply import + follow-up stop -> proposal + payment request
// -> reject a mismatched payment -> accept verified fake/replay payment -> three-site diagnostic
// -> grounded report -> QA -> delivery ZIP -> implementation + monitoring offers -> owner
// dashboard. Every step composes already-tested modules; nothing here is a separate simulation
// path. All domains are .invalid -- never represented as market proof.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { importCsvPack, importBatch } from '../src/importer.mjs';
import { scoreOpportunity, qualify, rankOpportunities, recommendOffer } from '../src/scoring.mjs';
import { buildMessageDraft, buildApprovalPacket, decideApproval } from '../src/approval.mjs';
import { createFakeReplayOutboundProvider, createSendHandoff } from '../src/outbound.mjs';
import { importRepliesFromCsv, shouldStopFollowUp } from '../src/reply.mjs';
import { buildProposal, buildSow, buildScopeAcceptance, buildInvoiceCopy, buildPaymentRequestMessage, renderMarkdown, renderJson } from '../src/proposal.mjs';
import { requestPayment, markRequestedExternally, recordCustomerReported, verifyPayment, createFakeReplayPaymentProvider } from '../src/payments.mjs';
import { assertValidTransition, deliveryGate } from '../src/diagnostic-workflow.mjs';
import { createFakeCrawlerProvider } from '../src/providers/crawler.mjs';
import { runChecksForPage } from '../src/checks.mjs';
import { buildDefectCards, persistDefectCards } from '../src/defects.mjs';
import { buildReportData, renderReportHtml, renderReportMarkdown, renderReportJson, signReportManifest } from '../src/report.mjs';
import { runQaChecklist } from '../src/qa.mjs';
import { buildDeliveryFiles, buildDeliveryManifest, exportDelivery } from '../src/export.mjs';
import { buildRepairTask, implementationGate, authorizeRepairTask } from '../src/implementation.mjs';
import { buildMonitoringProposal, activateMonitoring } from '../src/monitoring.mjs';
import { compileOwnerActionQueue, computeVerdict } from '../src/owner-actions.mjs';
import { computeFunnelCounts } from '../src/funnel.mjs';
import { renderOwnerCommandCenter } from '../src/portal/owner-command-center.mjs';
import { getService } from '../src/config.mjs';
import { agencyPackCsv, invalidPackCsv, fakePaymentEvidence } from '../fixtures/synthetic-packs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', 'demo-output');
const REPORT_SECRET = 'demo-only-report-signing-key-not-real';
const MANIFEST_SECRET = 'demo-only-manifest-signing-key-not-real';
const FIXED_CLOCK = () => new Date('2026-07-24T12:00:00.000Z');

async function main() {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });
  const storeDir = path.join(OUT_DIR, '.store');
  const store = new Store(storeDir);
  await store.init();

  // 1-2. import + quarantine
  const goodPrepared = importCsvPack(agencyPackCsv(), { packType: 'qualified_agency', packVersion: 1, sourceFile: 'agency-pack.csv' });
  const badPrepared = importCsvPack(invalidPackCsv(), { packType: 'qualified_agency', packVersion: 1, sourceFile: 'invalid-pack.csv' });
  const importResult = await importBatch(store, goodPrepared);
  console.log(`imported ${importResult.imported}, quarantined ${goodPrepared.quarantined.length + badPrepared.quarantined.length}`);

  // 3. rank
  const opportunities = await store.list('opportunities');
  const pairs = opportunities.map(o => ({ opportunity: o, input: { channel: o.channel, capturedAt: o.data.lineage.importedAt, confidence: o.data.confidence, evidenceCompleteness: 0.8, portfolioEvidenceCount: 1, buyerRoleClarity: 0.6, budgetLikelihood: 0.6, proofReadiness: 0.7, paymentReadiness: 0.6 } }));
  const ranking = rankOpportunities(pairs);
  const top = ranking.tiers.top5[0].opportunity;
  const recommendation = recommendOffer(ranking.tiers.top5[0]);
  console.log(`top opportunity: ${top.organizationDomain}, recommended offer: ${recommendation.offerKey}`);

  // 4-5. approval packet + explicit approval
  const draft = await store.add('messageDrafts', buildMessageDraft({ opportunityId: top.id, channel: top.channel, subject: 'Quick lead-path observation', body: 'Hi -- noticed a possible lead-path gap on your site. Happy to share a free sample diagnostic report.' }));
  const offer = getService(recommendation.offerKey);
  const evidenceForTop = (await store.list('evidenceItems')).filter(e => e.opportunityId === top.id);
  const packet = await store.add('approvals', buildApprovalPacket({ opportunity: top, evidenceItems: evidenceForTop, draft, offer: { offerKey: offer.key, priceCents: offer.priceCents }, proofAssets: ['sample_diagnostic_report'], risks: ['low volume, single agency'] }));
  const approved = await decideApproval(store, packet.id, 'approved', { actor: 'owner-demo' });
  console.log(`approval decided: ${approved.status}`);

  // 6. send handoff export (fake-replay -- never a real send)
  const outboundProvider = createFakeReplayOutboundProvider();
  const handoff = await createSendHandoff(store, { approval: approved, draft, opportunity: top, mode: 'fake-replay', provider: outboundProvider, config: { dailyCap: 25, rollingCap: 100, rollingWindowDays: 7 } });
  console.log(`send handoff: ${handoff.status}`);

  // 7. reply import + follow-up stop
  const repliesCsv = `opportunityId,organizationDomain,from,subject,body\n${top.id},${top.organizationDomain},buyer@northgate-agency.invalid,Re: quick observation,How much does this cost?\n`;
  await importRepliesFromCsv(store, repliesCsv);
  const stopCheck = await shouldStopFollowUp(store, top.organizationDomain);
  console.log(`follow-up stop after reply: ${stopCheck.stop} (${stopCheck.reasons.join(',')})`);

  // 8. proposal + payment request
  const proposal = buildProposal({ opportunity: top, offer: { offerKey: offer.key, priceCents: offer.priceCents } });
  const sow = buildSow(proposal);
  const scopeAcceptance = { ...buildScopeAcceptance(sow), accepted: true, acceptedAt: FIXED_CLOCK().toISOString(), acceptedBy: 'client-demo' };
  const invoiceCopy = buildInvoiceCopy(proposal);
  const paymentRequestMessage = buildPaymentRequestMessage(proposal);
  console.log(`proposal total: $${(proposal.totalCents / 100).toFixed(2)}`);

  // 9. reject a mismatched payment, then accept a verified one
  const invoiceHandoff = await store.add('invoiceHandoffs', { amountCents: proposal.totalCents, status: 'draft', data: { organizationDomain: top.organizationDomain } });
  const payment = await requestPayment(store, invoiceHandoff);
  await markRequestedExternally(store, payment.id);
  await recordCustomerReported(store, payment.id, { note: 'customer reports payment sent' });
  const paymentProvider = createFakeReplayPaymentProvider();
  const mismatchedResult = await verifyPayment(store, payment.id, paymentProvider, fakePaymentEvidence({ amountCents: 100 })); // wrong amount
  console.log(`mismatched payment result: ${mismatchedResult.status}`);
  // verifyPayment's own transition table allows MISMATCH -> PENDING_VERIFICATION, so calling it
  // again with corrected evidence is the real retry path -- no manual status patch needed.
  const verified = await verifyPayment(store, payment.id, paymentProvider, fakePaymentEvidence({ amountCents: proposal.totalCents }));
  console.log(`verified payment result: ${verified.status}`);

  // 10. three-site diagnostic project
  const websites = [
    { id: 'site1', domain: 'northgate-agency.invalid' }, { id: 'site2', domain: 'northgate-client-two.invalid' }, { id: 'site3', domain: 'northgate-client-three.invalid' }
  ];
  const project = await store.add('diagnosticProjects', { organizationDomain: top.organizationDomain, status: 'DRAFT', data: { websites, paidAt: FIXED_CLOCK().toISOString(), payment: verified, scopeAcceptance, deliveryHoursMax: 24 } });
  let current = project;
  for (const nextStatus of ['DEMO_PROPOSED', 'PAYMENT_REQUESTED', 'PAID', 'ONBOARDING', 'WAITING_FOR_INPUTS', 'SCOPE_ACCEPTED', 'CHECKS_RUNNING']) {
    assertValidTransition(current.status, nextStatus);
    current = await store.patch('diagnosticProjects', current.id, { status: nextStatus });
  }
  console.log(`project reached: ${current.status}`);

  // 11. run checks against the 3 sites, build defect cards
  const crawler = createFakeCrawlerProvider({ 'northgate-agency.invalid': { html: '<html><head><title>Northgate</title></head><body>no lead paths here</body></html>' } });
  const allDefects = [];
  const evidenceItems = [];
  for (const site of websites) {
    const page = await crawler.fetchPage(`https://${site.domain}/`);
    const results = await runChecksForPage(page, { crawler });
    const evidence = await store.add('evidenceItems', { websiteId: site.id, sourceUrl: `https://${site.domain}/`, sourceType: 'page_fetch', rawHash: 'demo-hash', capturedAt: FIXED_CLOCK().toISOString(), data: { websiteId: site.id, diagnosticProjectId: project.id, lineage: { fetchedBy: 'fake', method: 'fake' } } });
    evidenceItems.push(evidence);
    const { cards } = buildDefectCards(results, { websiteId: site.id, evidenceItems: [evidence] });
    const persisted = await persistDefectCards(store, project.id, 'run-' + site.id, cards);
    allDefects.push(...persisted);
  }
  current = await store.patch('diagnosticProjects', current.id, { status: 'EVIDENCE_REVIEW' });
  console.log(`defects found: ${allDefects.length}`);

  // 12. grounded report + QA
  const brand = { agencyDisplayName: 'Northgate Digital', primaryColor: '#0f766e', contactEmail: 'diagnostics@northgate-agency.invalid' };
  const reportData = buildReportData({ project: { id: project.id, organizationDomain: top.organizationDomain }, websites, defectCards: allDefects, evidenceItems, period: '2026-07', generatedAt: FIXED_CLOCK() });
  const reportManifest = signReportManifest(reportData, REPORT_SECRET);
  const reportHtml = renderReportHtml(reportData, { mode: 'agency_branded', commissioned: true, brand });
  const reportMarkdown = renderReportMarkdown(reportData);
  const reportJson = renderReportJson(reportData);
  current = await store.patch('diagnosticProjects', current.id, { status: 'REPORT_DRAFTED' });

  const qaResult = runQaChecklist({ project, websitesChecked: websites.map(w => w.id), websites, defectCards: allDefects, report: reportData, manifest: reportManifest, brand });
  current = await store.patch('diagnosticProjects', current.id, { status: 'QA' });
  console.log(`QA passed: ${qaResult.passed}`);

  // 13. delivery gate + ZIP
  const gate = deliveryGate({ project, payment: verified, scopeAcceptance, evidenceItems, defectCards: allDefects, report: reportData, qaResult, brand });
  console.log(`delivery gate blocked: ${gate.blocked}`);
  current = await store.patch('diagnosticProjects', current.id, { status: 'READY_TO_DELIVER' });
  if (!gate.blocked) current = await store.patch('diagnosticProjects', current.id, { status: 'DELIVERED' });

  const deliveryFiles = buildDeliveryFiles({ reportHtml, reportMarkdown, reportJson, proposalJson: renderJson(proposal), onboardingJson: JSON.stringify({ steps: ['Confirm site URLs', 'Confirm branding', 'Confirm delivery contact'] }, null, 2), qaResultJson: JSON.stringify(qaResult, null, 2) });
  const deliveryManifest = buildDeliveryManifest(project.id, deliveryFiles, MANIFEST_SECRET, { generatedAt: reportData.generatedAt });
  const exported = await exportDelivery({ outDir: path.join(OUT_DIR, 'sample-delivery'), zipPath: path.join(OUT_DIR, 'sample-delivery.zip'), files: deliveryFiles, manifest: deliveryManifest });
  console.log(`delivery zip sha256: ${exported.zipSha256}`);

  current = await store.patch('diagnosticProjects', current.id, { status: 'ACCEPTED' });

  // 14. implementation offer
  const worstDefect = allDefects.sort((a, b) => ({ critical: 0, high: 1, medium: 2, low: 3 }[a.severity] - ({ critical: 0, high: 1, medium: 2, low: 3 }[b.severity])))[0];
  let implementationOffered = { status: 'none' };
  if (worstDefect) {
    const repairTask = await store.add('repairTasks', buildRepairTask(worstDefect, { hourlyRateCents: 15000, contractorCostCentsPerHour: 5000 }));
    const implGateInput = { payment: verified, scopeAcceptance, authorization: { authorized: true, authorizedBy: 'owner-demo' }, backup: { taken: true }, staging: { path: '/staging' }, qaResult, rollbackPlan: { plan: 'git revert' }, evidenceItems, repairTask, siteCount: 1, revisionCount: 0 };
    const implGate = implementationGate(implGateInput);
    if (!implGate.blocked) implementationOffered = await authorizeRepairTask(store, repairTask.id, implGateInput);
    console.log(`implementation gate blocked: ${implGate.blocked}, status: ${implementationOffered.status}`);
  }
  current = await store.patch('diagnosticProjects', current.id, { status: 'IMPLEMENTATION_OFFERED' });

  // 15. monitoring offer
  const monitoringProposal = buildMonitoringProposal({ diagnosticProjectId: project.id, priceCents: 29900, sites: websites.map(w => w.domain) });
  const monitoringOffer = await store.add('monitoringOffers', { diagnosticProjectId: project.id, kind: 'monitoring', status: 'offered', priceCents: monitoringProposal.priceCents, active: false, data: {} });
  const monitoringConsent = { sites: websites.map(w => w.domain), schedule: 'daily', usageLimits: { maxChecksPerDay: 10 }, cancellationTerms: 'cancel anytime, no penalty', falsePositiveThreshold: 0.05, ownerTimeThreshold: 60, marginFloorRate: 0.3 };
  const activatedMonitoring = await activateMonitoring(store, monitoringOffer.id, monitoringConsent);
  console.log(`monitoring active: ${activatedMonitoring.active}`);
  current = await store.patch('diagnosticProjects', current.id, { status: 'MONITORING_OFFERED' });

  // 16. owner dashboard + scoreboard
  const ownerActions = await compileOwnerActionQueue(store);
  const blockers = await store.list('blockers');
  const funnelCounts = await computeFunnelCounts(store);
  const verdict = computeVerdict({ pendingApprovals: (await store.list('approvals', { filters: { status: 'pending' } })).length, openBlockers: blockers.filter(b => b.status === 'open').length, pendingPayments: (await store.list('payments', { filters: { status: 'PENDING_VERIFICATION' } })).length, activeMonitoring: (await store.list('monitoringOffers', { filters: { active: true } })).length });
  const dashboardHtml = renderOwnerCommandCenter({
    verdict, ownerActions, blockers, scoreboard: funnelCounts, importStatus: { packsImported: 1, quarantined: goodPrepared.quarantined.length + badPrepared.quarantined.length },
    opportunityRanking: ranking.ranked, approvalQueue: await store.list('approvals'), sendHandoffs: await store.list('sendRecords'),
    replies: await store.list('replies'), proposals: [proposal], payments: await store.list('payments'), projects: await store.list('diagnosticProjects'),
    monitoringOffers: await store.list('monitoringOffers'), experiments: [], providerHealth: [{ name: 'fake-crawler', healthy: true }, { name: 'fake-ai', healthy: true }],
    schedulerHealth: { counts: {}, total: 0 }, auditLog: await store.list('auditLog')
  });

  // write outputs
  await fs.writeFile(path.join(OUT_DIR, 'sample-report.html'), reportHtml);
  await fs.writeFile(path.join(OUT_DIR, 'sample-report.md'), reportMarkdown);
  await fs.writeFile(path.join(OUT_DIR, 'sample-report.json'), JSON.stringify({ reportData, manifest: reportManifest }, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'sample-proposal.json'), renderJson(proposal));
  await fs.writeFile(path.join(OUT_DIR, 'sample-onboarding.json'), deliveryFiles['onboarding.json']);
  await fs.writeFile(path.join(OUT_DIR, 'sample-qa-result.json'), JSON.stringify(qaResult, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'sample-implementation-offer.json'), JSON.stringify(implementationOffered, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'sample-monitoring-offer.json'), JSON.stringify(activatedMonitoring, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'owner-dashboard.html'), dashboardHtml);
  await fs.rm(storeDir, { recursive: true, force: true });

  await fs.writeFile(path.join(OUT_DIR, 'README.md'), `# Revenue OS demo output\n\nGenerated end to end by scripts/generate-demo.mjs from fixtures/synthetic-packs.mjs.\nAll domains are .invalid -- nothing here is a real agency, client, buyer, or payment.\nFinal project status: ${current.status}. Delivery gate blocked: ${gate.blocked}. QA passed: ${qaResult.passed}.\n`);

  console.log(`\nfinal project status: ${current.status}`);
  console.log(`wrote demo output to ${OUT_DIR}`);
}

main().catch(error => { console.error(error); process.exit(1); });
