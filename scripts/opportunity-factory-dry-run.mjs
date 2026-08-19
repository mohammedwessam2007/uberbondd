import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileCanaryProspectDraft,
  compileOpportunityPacket,
  evaluateOpportunity
} from '../src/opportunity-factory.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_INPUT = path.join(REPOSITORY_ROOT, 'data', 'opportunity-factory', 'seed-register.json');
const DEFAULT_OUTPUT = path.join(REPOSITORY_ROOT, 'artifacts', 'opportunity-factory');
const TOP_LEVEL_FIELDS = new Set(['schemaVersion', 'asOf', 'profile', 'assets', 'tombstones', 'opportunities']);

function parseArgs(argv) {
  const result = { input: DEFAULT_INPUT, output: process.env.OPPORTUNITY_FACTORY_OUTPUT_DIR || DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input') result.input = path.resolve(argv[++index] || '');
    else if (value === '--output') result.output = path.resolve(argv[++index] || '');
    else throw new Error(`Unknown argument: ${value}`);
  }
  return result;
}

function validateRegister(register) {
  if (!register || typeof register !== 'object' || Array.isArray(register)) throw new Error('Seed register must be an object');
  const unknown = Object.keys(register).find(key => !TOP_LEVEL_FIELDS.has(key));
  if (unknown) throw new Error(`Seed register contains unknown field: ${unknown}`);
  if (register.schemaVersion !== 'uberbond.opportunity-seed-register.v1') throw new Error('Seed register version is invalid');
  const asOf = new Date(register.asOf);
  if (!Number.isFinite(asOf.getTime())) throw new Error('Seed register asOf is invalid');
  if (!Array.isArray(register.opportunities) || !register.opportunities.length) throw new Error('Seed register needs at least one opportunity');
  return asOf;
}

function markdownEscape(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function csvCell(value) {
  const string = String(value ?? '');
  return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

function buildMarkdown({ register, evaluations, packets, canaryDrafts }) {
  const counts = Object.fromEntries([...new Set(evaluations.map(item => item.decision))]
    .sort()
    .map(decision => [decision, evaluations.filter(item => item.decision === decision).length]));
  const decisionPriority = {
    READY_FOR_OWNER_REVIEW: 0,
    HOLD_EXTERNAL_REQUIREMENT: 1,
    HOLD_MATERIALS: 2,
    HOLD_PROVIDER_ROUTE: 3,
    HOLD_LOW_PRIORITY: 4,
    BLOCKED_SOURCE_RECHECK: 5,
    BLOCKED_PRIOR_CONTACT: 6,
    HOLD_NO_SUBMISSION_ROUTE: 7,
    REJECT_REQUIREMENT_MISMATCH: 8,
    REJECT_CLAIM_RISK: 9,
    REJECT_INVALID: 10
  };
  const ranked = [...evaluations].sort((left, right) =>
    Number(decisionPriority[left.decision] ?? 99) - Number(decisionPriority[right.decision] ?? 99)
    || Number(right.score?.total || 0) - Number(left.score?.total || 0)
    || left.opportunityId.localeCompare(right.opportunityId));
  const lines = [
    '# UberBond Solicited Opportunity Factory — Dry-Run Report',
    '',
    `As of: ${register.asOf}`,
    '',
    'Status: `RESEARCH_AND_PREPARATION_ONLY`',
    '',
    'No email, form, platform application, payment, deployment, or provider call occurred. Every evaluation sets `externalActionAuthorized=false`. Manual forms and platforms remain owner-only actions; email candidates still require a separate exact V9 approval.',
    '',
    '## Decision counts',
    '',
    '| Decision | Count |',
    '|---|---:|',
    ...Object.entries(counts).map(([decision, count]) => `| ${decision} | ${count} |`),
    '',
    '## Ranked register',
    '',
    '| Rank | Opportunity | Organization | Score | Decision | Next action |',
    '|---:|---|---|---:|---|---|',
    ...ranked.map((item, index) => `| ${index + 1} | ${markdownEscape(item.opportunityId)} | ${markdownEscape(item.organization)} | ${Number(item.score?.total || 0)} | ${item.decision} | ${markdownEscape(item.nextAction)} |`),
    '',
    '## Materialization boundary',
    '',
    `- Owner-review packets compiled: ${packets.length}`,
    `- Gmail canary drafts compiled: ${canaryDrafts.length}`,
    '- V9 one-use approvals created: 0',
    '- Queue records created: 0',
    '- External effects: 0',
    '',
    '## Frozen commercial ladder',
    '',
    '`USD 250 QA diagnostic → USD 500 paid proof pilot → USD 447 / USD 1,190 monthly agency wholesale`',
    '',
    'This factory accelerates the first step only. It does not authorize broader outreach, a standalone SaaS build, or automatic volume increases.'
  ];
  return `${lines.join('\n')}\n`;
}

function buildSourceLedger(register, evaluationById) {
  const header = [
    'opportunity_id', 'organization', 'source_url', 'source_observed_at',
    'source_expires_at', 'submission_mechanism', 'decision', 'external_action_authorized'
  ];
  const rows = register.opportunities
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(opportunity => {
      const evaluation = evaluationById.get(opportunity.id);
      return [
        opportunity.id,
        opportunity.organization,
        opportunity.sourceUrl,
        opportunity.sourceObservedAt,
        opportunity.sourceExpiresAt,
        opportunity.submissionMechanism,
        evaluation?.decision || 'REJECT_INVALID',
        'false'
      ];
    });
  return `${[header, ...rows].map(row => row.map(csvCell).join(',')).join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const register = JSON.parse(await fs.readFile(options.input, 'utf8'));
  const asOf = validateRegister(register);
  const opportunities = register.opportunities.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const evaluations = opportunities.map(opportunity => evaluateOpportunity({
    opportunity,
    profile: register.profile,
    assets: register.assets,
    tombstones: register.tombstones,
    now: asOf
  }));
  const evaluationById = new Map(evaluations.map(item => [item.opportunityId, item]));
  const packets = [];
  const canaryDrafts = [];
  for (const opportunity of opportunities) {
    const evaluation = evaluationById.get(opportunity.id);
    if (evaluation?.decision !== 'READY_FOR_OWNER_REVIEW') continue;
    const packet = compileOpportunityPacket({
      opportunity,
      evaluation,
      profile: register.profile,
      assets: register.assets,
      tombstones: register.tombstones
    });
    packets.push(packet);
    if (opportunity.submissionMechanism === 'EMAIL') {
      canaryDrafts.push(compileCanaryProspectDraft({
        opportunity,
        evaluation,
        profile: register.profile,
        assets: register.assets,
        tombstones: register.tombstones,
        campaignId: 'opportunity-factory-owner-review',
        inbox: 'A',
        unsubscribeUrl: '',
        now: asOf
      }));
    }
  }
  const report = {
    schemaVersion: 'uberbond.opportunity-factory-dry-run.v1',
    asOf: register.asOf,
    input: path.relative(REPOSITORY_ROOT, options.input),
    totalOpportunities: opportunities.length,
    evaluations,
    packets,
    canaryDrafts,
    externalActionLedger: {
      emailsSent: 0,
      formsSubmitted: 0,
      platformApplicationsSubmitted: 0,
      providerCalls: 0,
      paymentCalls: 0,
      v9ApprovalsCreated: 0,
      externalActionAuthorized: false
    }
  };
  await fs.mkdir(options.output, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(options.output, 'DRY_RUN_REPORT.json'), `${JSON.stringify(report, null, 2)}\n`),
    fs.writeFile(path.join(options.output, 'DRY_RUN_REPORT.md'), buildMarkdown({ register, evaluations, packets, canaryDrafts })),
    fs.writeFile(path.join(options.output, 'SOURCE_LEDGER.csv'), buildSourceLedger(register, evaluationById)),
    fs.writeFile(path.join(options.output, 'OWNER_REVIEW_PACKETS.json'), `${JSON.stringify(packets, null, 2)}\n`),
    fs.writeFile(path.join(options.output, 'CANARY_DRAFTS.json'), `${JSON.stringify(canaryDrafts, null, 2)}\n`)
  ]);
  process.stdout.write(`${JSON.stringify({
    status: 'DRY_RUN_COMPLETE',
    input: options.input,
    output: options.output,
    totalOpportunities: opportunities.length,
    decisions: Object.fromEntries([...new Set(evaluations.map(item => item.decision))].sort().map(decision => [decision, evaluations.filter(item => item.decision === decision).length])),
    ownerReviewPackets: packets.length,
    canaryDrafts: canaryDrafts.length,
    externalEffects: 0
  }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
