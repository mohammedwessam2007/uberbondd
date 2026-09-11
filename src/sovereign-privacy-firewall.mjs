import crypto from 'node:crypto';

export const SOVEREIGN_PRIVACY_FIREWALL_VERSION = 'uberbond.sovereign-privacy-firewall.v1';

const normalize = value => String(value ?? '').trim();
const normalizeRecipient = value => normalize(value).toLowerCase().replace(/\s+/g, '');
const artifactText = message => [message?.from, message?.to, message?.subject, message?.body].map(normalize).join('\n');
export const externalArtifactSha256 = message => crypto.createHash('sha256').update(artifactText(message)).digest('hex');

const CLASSIFIERS = [
  ['UBERBOND_PRIVATE_IDENTITY', /\buber\s*bond\b/i],
  ['REPOSITORY_LOCATION', /github\.com\/mohammedwessam2007\/uberbondd|mohammedwessam2007\/uberbondd/i],
  ['INTERNAL_ARCHITECTURE', /\b(?:personal civilization|living mohamed model|world brain|capability genome|temporal foundry|timeline topology|wormhole engine|sandwich method|connectome autopoiesis|max council|avengers arsenal|air node|ubermesh|founder console|sovereign worker|self-maintainer)\b/i],
  ['SOURCE_INTERNALS', /(?:^|[\s`'"(])(?:src|scripts|tests|artifacts|\.github)\/[A-Za-z0-9_.\/-]+/im],
  ['PRIVATE_PAYMENT_DESTINATION', /paypal\.me\/sarawessam\b/i]
];

export function classifySovereignDisclosure(message = {}) {
  const haystack = artifactText(message);
  return CLASSIFIERS.filter(([, pattern]) => pattern.test(haystack)).map(([classification]) => classification);
}

function validDeclassificationReceipt(message, receipt, findings) {
  if (!receipt || receipt.status !== 'APPROVED' || receipt.scope !== 'EXTERNAL_DISCLOSURE') return false;
  if (normalizeRecipient(receipt.recipient) !== normalizeRecipient(message?.to)) return false;
  if (normalize(receipt.artifactSha256).toLowerCase() !== externalArtifactSha256(message)) return false;
  const allowed = new Set(Array.isArray(receipt.allowedClasses) ? receipt.allowedClasses.map(String) : []);
  return findings.every(item => allowed.has(item));
}

export function evaluateSovereignPrivacyFirewall({ message = {}, declassificationReceipt = null } = {}) {
  const findings = classifySovereignDisclosure(message);
  if (!findings.length) return {
    ok: true,
    policyVersion: SOVEREIGN_PRIVACY_FIREWALL_VERSION,
    decision: 'ALLOW_NO_PRIVATE_DISCLOSURE',
    findings: [],
    artifactSha256: externalArtifactSha256(message)
  };
  if (validDeclassificationReceipt(message, declassificationReceipt, findings)) return {
    ok: true,
    policyVersion: SOVEREIGN_PRIVACY_FIREWALL_VERSION,
    decision: 'ALLOW_EXACT_DECLASSIFIED_ARTIFACT',
    findings,
    artifactSha256: externalArtifactSha256(message)
  };
  return {
    ok: false,
    policyVersion: SOVEREIGN_PRIVACY_FIREWALL_VERSION,
    decision: 'DENY_PRIVATE_SOVEREIGN_DISCLOSURE',
    reason: 'sovereign-private-material-requires-exact-recipient-bound-artifact-bound-declassification',
    findings,
    artifactSha256: externalArtifactSha256(message)
  };
}

export function assertSovereignPrivacyForExternalMessage(message = {}) {
  const result = evaluateSovereignPrivacyFirewall({ message, declassificationReceipt: message?.declassificationReceipt || null });
  if (result.ok) return result;
  const error = new Error(`Sovereign privacy firewall denied external message: ${result.findings.join(',')}`);
  error.code = 'SOVEREIGN_PRIVACY_FIREWALL_DENY';
  error.privacyDecision = result;
  throw error;
}
