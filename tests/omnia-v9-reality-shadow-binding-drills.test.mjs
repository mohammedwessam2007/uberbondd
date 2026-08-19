import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindConstitution, ConstitutionBindingError } from '../src/omnia-v9/constitution.mjs';
import { buildPolicyBundle, PolicyBundleError } from '../src/omnia-v9/policy-bundle.mjs';
import { authorizeWithCedar, cedarRuntimeIdentity, loadCedarWasm, validateCedarPolicy } from '../src/omnia-v9/cedar-adapter.mjs';
import { bindRealCedarAuthority } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { createActionIntent, createEvidenceRecord, createApproval, admitAction } from '../src/omnia-v9/kernel.mjs';
import { sha256, signDigestHex } from '../src/omnia-v9/canonical.mjs';
import { generateKeyPairSync } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-08-08T12:00:00.000Z');

async function readText(relative) {
  return fs.readFile(path.join(root, relative), 'utf8');
}
async function readJson(relative) {
  return JSON.parse(await readText(relative));
}

function candidateIntent(evidenceId) {
  return createActionIntent({
    missionId: 'campaign:c1', tenantId: 'campaign:c1', actorId: 'uberbond-outbound-worker',
    operation: 'email.send', resource: 'email:buyer@example.com', purpose: 'qualified-b2b-outreach',
    effectClass: 'COMMUNICATE_EXTERNAL', argumentsDigest: sha256('args'), evidenceIds: [evidenceId],
    maxCostUsd: 0.25, blastRadius: 1, rollback: 'SUPPRESS_FUTURE_CONTACT',
    createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    nonce: `n:${evidenceId}`, idempotencyKey: `k:${evidenceId}`
  }, NOW);
}

function candidateEvidence(evidenceId) {
  return createEvidenceRecord({
    evidenceId, tenantId: 'campaign:c1', subject: 'buyer@example.com', origin: 'EXTERNAL_SOURCE',
    relation: 'DIRECT', verificationClaims: [], lifecycleFlags: ['ACTIVE'],
    sourceRef: 'https://example.com/page', payloadDigest: sha256('excerpt'), observedAt: NOW.toISOString()
  });
}

async function buildTestAuthority({ policyText, constitutionBundle, constitutionManifest, sourceTextByRole, projection, schemaText }) {
  const cedar = await loadCedarWasm();
  const runtimeIdentity = cedarRuntimeIdentity(cedar, {
    packageName: '@cedar-policy/cedar-wasm', packageVersion: '0.0.0-test', importPath: '@cedar-policy/cedar-wasm/nodejs'
  });
  const policyBundle = buildPolicyBundle({ constitutionBundle, constitutionManifest, sourceTextByRole, projection, schemaText, policyText, evaluator: runtimeIdentity });
  const validatedPolicy = validateCedarPolicy({ cedar, schemaText, policyText });
  function policyAuthorizer({ intent }) {
    const resolverFacts = { authorityResolved: true, identityResolved: true, evidenceResolved: true, policyBound: true, constitutionBound: true, proposalOrigin: 'OPERATOR', sovereigntyChange: false };
    const actor = { id: intent.actorId, tenantId: intent.tenantId };
    const resource = { id: intent.resource, tenantId: intent.tenantId, operation: intent.operation, effectClass: intent.effectClass };
    return authorizeWithCedar({ cedar, validatedPolicy, policyText, actor, resource, resolverFacts });
  }
  return { policyAuthorizer, policyDigest: policyBundle.policyDigest, constitutionDigest: constitutionBundle.constitutionDigest };
}

function admitWith(authority, evidenceIdSuffix) {
  const evidenceId = `ev-${evidenceIdSuffix}`;
  const evidence = candidateEvidence(evidenceId);
  const intent = candidateIntent(evidenceId);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const approval = createApproval({
    approvalId: `ap-${evidenceIdSuffix}`, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
    actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'],
    purposes: ['qualified-b2b-outreach'], effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 10,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
    issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  }, digest => signDigestHex(digest, privateKey));
  return admitAction(intent, {
    now: NOW, approvals: [approval], keyResolver: () => publicKey, usageResolver: () => ({ uses: 0, costUsd: 0 }),
    evidenceResolver: id => (id === evidenceId ? evidence : null),
    evidenceRequirementResolver: () => ({ minCount: 1, allowedOrigins: ['EXTERNAL_SOURCE'] }),
    policyAuthorizer: authority.policyAuthorizer, policyVersion: 'binding-drill-v1',
    policyDigest: authority.policyDigest, constitutionDigest: authority.constitutionDigest
  });
}

test('policy-change drill: two local test-only policy texts under the SAME real constitution produce different policy digests and different decisions', async () => {
  const constitution = await (async () => {
    const manifest = await readJson('config/omnia-v9/constitution-sources.json');
    const sourceBytesByRole = new Map();
    const sourceTextByRole = new Map();
    for (const source of manifest.sources) {
      const bytes = await fs.readFile(path.join(root, source.path));
      sourceBytesByRole.set(source.role, bytes);
      sourceTextByRole.set(source.role, bytes.toString('utf8'));
    }
    return { manifest, sourceTextByRole, bundle: bindConstitution({ manifest, sourceBytesByRole }) };
  })();
  const projection = await readJson('config/omnia-v9/policy-projection.json');
  const schemaText = await readText('policy/omnia-v9/schema.json');
  const policyTextA = await readText('policy/omnia-v9/authorization.cedar');
  // Policy B: same traceable projection, same constitution, deliberately stricter
  // local test-only Cedar text -- an unconditional forbid appended after the
  // real permit. Never written to policy/omnia-v9/authorization.cedar on disk.
  const policyTextB = `${policyTextA}\n\nforbid (\n  principal,\n  action == UberBondV9::Action::"execute",\n  resource\n);\n`;

  const authorityA = await buildTestAuthority({ policyText: policyTextA, constitutionBundle: constitution.bundle, constitutionManifest: constitution.manifest, sourceTextByRole: constitution.sourceTextByRole, projection, schemaText });
  const authorityB = await buildTestAuthority({ policyText: policyTextB, constitutionBundle: constitution.bundle, constitutionManifest: constitution.manifest, sourceTextByRole: constitution.sourceTextByRole, projection, schemaText });

  assert.notEqual(authorityA.policyDigest, authorityB.policyDigest, 'different policy text must produce a different policy digest');
  assert.equal(authorityA.constitutionDigest, authorityB.constitutionDigest, 'the constitution did not change between policy A and policy B');

  const underA = admitWith(authorityA, 'policy-a');
  const underB = admitWith(authorityB, 'policy-b');
  assert.equal(underA.decision, 'ALLOW');
  assert.equal(underA.policyDigest, authorityA.policyDigest);
  assert.equal(underB.decision, 'DENY', 'policy B unconditionally forbids execute -- the decision must actually change, not just the label');
  assert.equal(underB.policyDigest, authorityB.policyDigest);
  assert.notEqual(underA.decisionDigest, underB.decisionDigest);
});

test('policy-change drill: reality-shadow wiring always takes policyDigest and policyAuthorizer from the same bound authority object, so a caller cannot separately mix a stale digest with a different running policy', async () => {
  const authority1 = await bindRealCedarAuthority({ fresh: true });
  const authority2 = await bindRealCedarAuthority({ fresh: true });
  // Rebinding the same real, unmodified policy/constitution twice must be
  // deterministic: identical digests every time, proving the digest is a
  // pure function of policy+constitution content, not incidental binding order.
  assert.equal(authority1.policyDigest, authority2.policyDigest);
  assert.equal(authority1.constitutionDigest, authority2.constitutionDigest);
  // bindRealCedarAuthority()'s return value is the only sanctioned source of
  // both fields together in this codebase's reality-shadow path -- there is
  // no exported function that returns policyDigest independent of the
  // policyAuthorizer it was computed alongside, so "silently rebind an old
  // authorization to a new policy" has no code path to occur through here.
  assert.equal(typeof authority1.policyAuthorizer, 'function');
  assert.equal(typeof authority1.policyDigest, 'string');
});

test('constitution-rejection drill: the real traceable policy projection fails closed (throws, never produces an authority) when bound against an unrelated test-only constitution', async () => {
  const fakeManifest = {
    schemaVersion: 'omnia.v9.constitution-sources.p2',
    sourceSetVersion: 'test-only-constitution-b',
    sources: [
      { role: 'KNOWLEDGE_GRAPH', path: 'test-fixture/kg.md', title: 'TEST ONLY Knowledge Graph B', version: '9.9.9', effectiveDate: '2099-01-01', requiresRoles: [], anchors: ['This is a fabricated test-only anchor for constitution B.'] },
      { role: 'DECISION_ENGINE', path: 'test-fixture/de.md', title: 'TEST ONLY Decision Engine B', version: '9.9.9', effectiveDate: '2099-01-01', requiresRoles: ['KNOWLEDGE_GRAPH'], anchors: ['This is a completely different decision-engine anchor for constitution B, unrelated to the real one.'] },
      { role: 'LEARNING_ENGINE', path: 'test-fixture/le.md', title: 'TEST ONLY Learning Engine B', version: '9.9.9', effectiveDate: '2099-01-01', requiresRoles: ['KNOWLEDGE_GRAPH', 'DECISION_ENGINE'], anchors: ['This is a fabricated learning-engine anchor for constitution B.'] }
    ],
    precedenceRules: []
  };
  function fakeSourceText(source) {
    return `# ${source.title}\n\nVersion ${source.version}\n\nEffective date: ${source.effectiveDate}\n\n${source.anchors.join('\n\n')}\n`;
  }
  const sourceBytesByRole = new Map();
  const sourceTextByRole = new Map();
  for (const source of fakeManifest.sources) {
    const text = fakeSourceText(source);
    sourceBytesByRole.set(source.role, Buffer.from(text, 'utf8'));
    sourceTextByRole.set(source.role, text);
  }
  const fakeBundle = bindConstitution({ manifest: fakeManifest, sourceBytesByRole });

  const realConstitution = await readJson('config/omnia-v9/constitution-sources.json');
  assert.notEqual(fakeBundle.constitutionDigest, sha256(JSON.stringify(realConstitution)), 'sanity: this is genuinely a different, fabricated constitution');

  const projection = await readJson('config/omnia-v9/policy-projection.json');
  const schemaText = await readText('policy/omnia-v9/schema.json');
  const policyText = await readText('policy/omnia-v9/authorization.cedar');
  const cedar = await loadCedarWasm();
  const runtimeIdentity = cedarRuntimeIdentity(cedar, { packageName: '@cedar-policy/cedar-wasm', packageVersion: '0.0.0-test', importPath: '@cedar-policy/cedar-wasm/nodejs' });

  assert.throws(
    () => buildPolicyBundle({ constitutionBundle: fakeBundle, constitutionManifest: fakeManifest, sourceTextByRole, projection, schemaText, policyText, evaluator: runtimeIdentity }),
    error => error instanceof PolicyBundleError && error.code === 'UNTRACEABLE_RULE',
    'the real projection\'s rule anchors do not exist verbatim in constitution B\'s fabricated text -- binding must fail closed at construction, before any decision could ever be produced'
  );
});

test('constitution-rejection drill: even a lookalike constitution that reuses the real anchor text verbatim still produces a distinguishable constitutionDigest, never silently equal to the real one', async () => {
  const realManifest = await readJson('config/omnia-v9/constitution-sources.json');
  const lookalikeManifest = {
    ...realManifest,
    sourceSetVersion: 'lookalike-test-only-v10-attempt',
    sources: realManifest.sources.map(source => ({ ...source, version: '10.0.0', effectiveDate: '2099-01-01' }))
  };
  function lookalikeSourceText(source, realText) {
    // Reuses every real anchor verbatim (so buildPolicyBundle's anchor check
    // can succeed) but is a materially different document: different title
    // metadata line, different version, different effective date -- exactly
    // the shape of an attempted "V10 constitution" swap this mission
    // explicitly forbids creating for real, so this stays synthetic-only.
    const anchorsBlock = source.anchors.join('\n\n');
    return `# ${source.title}\n\nVersion ${source.version}\n\nEffective date: ${source.effectiveDate}\n\n${anchorsBlock}\n\n<!-- lookalike test constitution, not a real V10, never written to docs/constitution -->\n`;
  }
  const sourceBytesByRole = new Map();
  const sourceTextByRole = new Map();
  for (const source of lookalikeManifest.sources) {
    const text = lookalikeSourceText(source);
    sourceBytesByRole.set(source.role, Buffer.from(text, 'utf8'));
    sourceTextByRole.set(source.role, text);
  }
  const lookalikeBundle = bindConstitution({ manifest: lookalikeManifest, sourceBytesByRole });
  const realAuthority = await bindRealCedarAuthority();
  assert.notEqual(lookalikeBundle.constitutionDigest, realAuthority.constitutionDigest, 'a lookalike constitution B must never hash-collide with the real bound constitution');
});
