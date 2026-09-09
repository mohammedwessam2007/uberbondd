import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const AUTONOMY_COMMAND_CENTER_CONTROL_VERSION = 'uberbond.autonomy-command-center-control.v1';
export const AUTONOMY_COMMAND_CENTER_ISSUE = 604;
export const AUTONOMY_PAUSE_LABEL = 'uberbond-autonomy-paused';

const COMMANDS = Object.freeze({
  '/status': 'REPORT_STATUS',
  '/wake': 'DISPATCH_WAKE',
  '/pause': 'PAUSE_NEW_PULSES',
  '/resume': 'RESUME_AND_DISPATCH_WAKE',
  '/help': 'REPORT_HELP'
});

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function refusal(reasonCodes) {
  return {
    ok: false,
    policyVersion: AUTONOMY_COMMAND_CENTER_CONTROL_VERSION,
    status: 'COMMAND_REFUSED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    command: null,
    action: 'NO_OP',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compileAutonomyCommand({ body, actor, repositoryOwner, authorAssociation, issueNumber } = {}) {
  const reasons = [];
  const owner = text(repositoryOwner, 120);
  const login = text(actor, 120);
  const association = text(authorAssociation, 40).toUpperCase();
  const number = Number(issueNumber);
  const raw = text(body, 128);
  const normalized = raw.toLowerCase();

  if (number !== AUTONOMY_COMMAND_CENTER_ISSUE) reasons.push('command-center-issue-mismatch');
  if (!owner || login !== owner) reasons.push('repository-owner-command-required');
  if (association !== 'OWNER') reasons.push('github-owner-association-required');
  if (!Object.hasOwn(COMMANDS, normalized)) reasons.push('unsupported-or-nonexact-command');
  if (reasons.length) return refusal(reasons);

  return {
    ok: true,
    policyVersion: AUTONOMY_COMMAND_CENTER_CONTROL_VERSION,
    status: 'COMMAND_AUTHORIZED',
    command: normalized,
    action: COMMANDS[normalized],
    issueNumber: number,
    actor: login,
    pauseLabel: AUTONOMY_PAUSE_LABEL,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'FOUNDER COMMANDS MAY WAKE PAUSE RESUME OR INSPECT THE FINITE ENGINEERING LOOP ONLY. THEY DO NOT CREATE MERGE DEPLOY CUSTOMER PAYMENT SPEND CREDENTIAL DNS PRIVATE-LIFE OR ASI AUTHORITY.'
  };
}

export function helpMarkdown() {
  return [
    '### UberBond finite-completion controls',
    '',
    '- `/status` — exact evidence-bound autonomy status',
    '- `/wake` — request one bounded finite-completion pulse',
    '- `/pause` — stop new pulses without deleting continuation/evidence state',
    '- `/resume` — remove the pause fence and request a fresh pulse',
    '- `/help` — show this command set',
    '',
    'These commands do **not** grant deployment, customer messaging, payment, spend, credential, DNS, private-life, production, or ASI authority.'
  ].join('\n');
}

export function statusMarkdown({ status = {}, paused = false, sourceCommit = null } = {}) {
  const bootstrap = status?.bootstrapAutonomy || {};
  const terminal = status?.terminal || {};
  const graph = status?.graph || {};
  const safe = value => text(value, 300) || 'UNAVAILABLE';
  return [
    '### UberBond autonomy status',
    '',
    `- **Loop:** ${safe(status?.status)}`,
    `- **Paused:** ${paused ? 'YES' : 'NO'}`,
    `- **Source:** ${safe(sourceCommit || status?.sourceCommit)}`,
    `- **Self-maintainer:** ${safe(bootstrap.maintainerStatus)}`,
    `- **Continuation:** ${safe(bootstrap.continuationStatus)}`,
    `- **Finite engineering:** ${safe(bootstrap.finiteEngineeringClosure)}`,
    `- **Finite open requirements:** ${Number.isSafeInteger(Number(bootstrap.finiteOpenRequirementCount)) ? Number(bootstrap.finiteOpenRequirementCount) : 'UNKNOWN'}`,
    `- **Execution leaves:** ${Number.isSafeInteger(Number(graph.leafCount)) ? Number(graph.leafCount) : 'UNKNOWN'}`,
    `- **Orphans / floating / cycles:** ${Number(graph.orphanRequirementCount ?? 0)} / ${Number(graph.floatingLeafCount ?? 0)} / ${Number(graph.dependencyCycleCount ?? 0)}`,
    `- **Named runtime:** ${safe(terminal.namedRuntimeStatus)}`,
    `- **Observed autonomy:** ${safe(terminal.observedAutonomyStatus)}`,
    `- **Commercial reality:** ${safe(terminal.externalCommercialStatus)}`,
    `- **ASI evidence:** ${safe(terminal.asiEvidenceStatus)}`,
    '',
    `Self-completion claim: **${safe(bootstrap.selfCompletionClaim)}**`,
    '',
    '_Status is read from current repository evidence. Missing evidence stays missing._'
  ].join('\n');
}
