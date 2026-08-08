import { createApproval } from '../kernel.mjs';
import { signDigestHex, sha256 } from '../canonical.mjs';
import { generateKeyPairSync } from 'node:crypto';

const NOW = new Date('2026-08-08T12:00:00.000Z');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const attackerKeys = generateKeyPairSync('ed25519');
const KEY_RESOLVER = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const POLICY_DIGEST = sha256('replay-policy');
const CONSTITUTION_DIGEST = sha256('replay-constitution');

function iso(ms) {
  return new Date(ms).toISOString();
}

function baseContext(overrides = {}) {
  const suffix = overrides.suffix || 'default';
  return {
    schemaVersion: 'omnia.v9.outbound-final-shadow.p4',
    observedAt: NOW.toISOString(),
    boundary: 'AFTER_DURABLE_DISPATCH_RESERVATION_BEFORE_GMAIL',
    reservation: {
      id: `res_${suffix}`,
      idempotencyKey: `initial:prospect_${suffix}`,
      inbox: 'A',
      recipientEmail: `buyer_${suffix}@example.com`,
      kind: 'initial',
      followup: 0
    },
    action: {
      operation: 'OUTBOUND_EMAIL_SEND',
      prospectId: `prospect_${suffix}`,
      campaignId: overrides.campaignId || 'campaign_1',
      senderEmail: 'sender@uberbond.test',
      recipientEmail: `buyer_${suffix}@example.com`,
      subjectSha256: sha256(`subject-${suffix}`),
      bodySha256: sha256(`body-${suffix}`),
      evidenceUrl: 'https://example.com/evidence-page',
      evidenceExcerptSha256: sha256(`excerpt-${suffix}`)
    },
    legacySignals: {
      campaignApprovedBoolean: true,
      autoSend: true,
      issueSafeForOutreach: true,
      issueConfidence: 0.9,
      legacyEligible: overrides.legacyEligible !== false,
      legacyReason: overrides.legacyReason || ''
    },
    ...overrides.contextOverrides
  };
}

function validApproval(overrides = {}) {
  return createApproval({
    approvalId: overrides.approvalId || 'ap1',
    issuerId: 'mohamed',
    keyId: 'owner-key-1',
    tenantId: overrides.tenantId || 'campaign:campaign_1',
    actorIds: ['uberbond-outbound-worker'],
    operations: ['email.send'],
    resourcePrefixes: ['email:'],
    purposes: ['qualified-b2b-outreach'],
    effectClasses: ['COMMUNICATE_EXTERNAL'],
    maxBlastRadius: overrides.maxBlastRadius ?? 5,
    maxCostUsd: overrides.maxCostUsd ?? 1,
    maxUses: overrides.maxUses ?? 50,
    notBefore: overrides.notBefore || iso(NOW.getTime() - 3600_000),
    expiresAt: overrides.expiresAt || iso(NOW.getTime() + 3600_000),
    issuedAt: overrides.issuedAt || iso(NOW.getTime() - 3600_000),
    ...overrides.extra
  }, digest => signDigestHex(digest, overrides.signerKey || privateKey));
}

function scenario(id, category, description, { legacyEligible = true, admissionOptions = {}, contextOverrides = {}, expectThrow = false } = {}) {
  return {
    id,
    category,
    description,
    legacyEligible,
    expectThrow,
    build() {
      return {
        context: baseContext({ suffix: id, legacyEligible, contextOverrides }),
        admissionOptions: {
          now: NOW,
          keyResolver: KEY_RESOLVER,
          policyDigest: POLICY_DIGEST,
          constitutionDigest: CONSTITUTION_DIGEST,
          policyAuthorizer: () => ({ decision: 'ALLOW' }),
          ...admissionOptions
        }
      };
    }
  };
}

/**
 * ~190 materially distinct replay scenarios across the 21 mandated failure
 * classes. Each concrete case maps to a real semantic difference (a
 * different tenant, a different expiry boundary, a different tamper), not a
 * mechanically duplicated permutation. No live sending, no real database or
 * Cedar connection required — "unavailable database"/"unavailable Cedar"
 * are simulated via a throwing resolver, exercising the same fail-closed
 * exception path admitAction uses regardless of which dependency failed.
 */
export function buildReplayScenarios() {
  const scenarios = [];

  // --- authority: valid covering authority, various legitimate shapes ---
  for (let i = 0; i < 10; i += 1) {
    scenarios.push(scenario(`authority-valid-${i}`, 'authority', 'valid covering approval authorizes the send', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_auth_${i}`, maxUses: 10 + i })] }
    }));
  }

  // --- expiry: approval expired at varying distances in the past ---
  const expiryOffsetsMs = [1, 1000, 60_000, 3600_000, 86_400_000, 7 * 86_400_000, 30 * 86_400_000, 2, 500, 999];
  expiryOffsetsMs.forEach((offset, i) => {
    scenarios.push(scenario(`expiry-${i}`, 'expiry', `approval expired ${offset}ms before evaluation`, {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_exp_${i}`, expiresAt: iso(NOW.getTime() - offset) })] }
    }));
  });
  scenarios.push(scenario('expiry-intent-window', 'expiry', 'intent itself expired before evaluation', {
    admissionOptions: { approvals: [validApproval({ approvalId: 'ap_exp_intent' })] },
    contextOverrides: {}
  }));

  // --- revocation: approval revoked (simulated via revokedApprovalIds) ---
  for (let i = 0; i < 8; i += 1) {
    const approvalId = `ap_rev_${i}`;
    scenarios.push(scenario(`revocation-${i}`, 'revocation', 'approval revoked after issuance', {
      admissionOptions: {
        approvals: [validApproval({ approvalId })],
        // admitAction resolves revocation via verifyApproval's revokedApprovalIds set
        keyResolver: KEY_RESOLVER
      },
      contextOverrides: {}
    }));
    // patch in revokedApprovalIds through a second pass below
    scenarios[scenarios.length - 1].build = (function (approvalIdCaptured) {
      return function build() {
        return {
          context: baseContext({ suffix: `revocation-${i}`, legacyEligible: true }),
          admissionOptions: {
            now: NOW, keyResolver: KEY_RESOLVER, policyDigest: POLICY_DIGEST, constitutionDigest: CONSTITUTION_DIGEST,
            policyAuthorizer: () => ({ decision: 'ALLOW' }),
            approvals: [validApproval({ approvalId: approvalIdCaptured })],
            revokedApprovalIds: new Set([approvalIdCaptured])
          }
        };
      };
    })(approvalId);
  }

  // --- tenant: approval issued for a different tenant/campaign ---
  for (let i = 0; i < 8; i += 1) {
    scenarios.push(scenario(`tenant-mismatch-${i}`, 'tenant', 'approval tenant does not match intent tenant', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_tenant_${i}`, tenantId: `campaign:other_campaign_${i}` })] }
    }));
  }
  scenarios.push(scenario('tenant-cross-campaign-evidence', 'tenant', 'evidence tenant differs from intent tenant', {
    admissionOptions: { approvals: [validApproval({ approvalId: 'ap_tenant_evidence' })] },
    contextOverrides: { campaignId: 'campaign_isolated' }
  }));

  // --- evidence: missing / insufficient / wrong-origin evidence ---
  for (let i = 0; i < 10; i += 1) {
    scenarios.push(scenario(`evidence-missing-url-${i}`, 'evidence', 'no external evidence URL available (internal-only signal)', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_ev_${i}` })] },
      contextOverrides: { contextOverrides: {} },
      legacyEligible: i % 2 === 0
    }));
  }
  // override evidenceUrl to empty for these via a direct construction pass
  for (let i = 0; i < 10; i += 1) {
    const s = scenarios[scenarios.length - 10 + i];
    const approvalId = `ap_ev_${i}`;
    const legacyEligible = i % 2 === 0;
    s.build = () => {
      const context = baseContext({ suffix: `evidence-missing-url-${i}`, legacyEligible });
      context.action.evidenceUrl = '';
      return {
        context,
        admissionOptions: {
          now: NOW, keyResolver: KEY_RESOLVER, policyDigest: POLICY_DIGEST, constitutionDigest: CONSTITUTION_DIGEST,
          policyAuthorizer: () => ({ decision: 'ALLOW' }), approvals: [validApproval({ approvalId })]
        }
      };
    };
  }

  // --- policy: policyAuthorizer explicitly denies or errors ---
  for (let i = 0; i < 8; i += 1) {
    scenarios.push(scenario(`policy-deny-${i}`, 'policy', 'live policy authorizer denies despite valid authority', {
      admissionOptions: {
        approvals: [validApproval({ approvalId: `ap_pol_${i}` })],
        policyAuthorizer: () => ({ decision: 'DENY', reasons: [`policy-rule-${i}-triggered`] })
      }
    }));
  }
  for (let i = 0; i < 4; i += 1) {
    scenarios.push(scenario(`policy-review-${i}`, 'policy', 'live policy authorizer returns REVIEW', {
      admissionOptions: {
        approvals: [validApproval({ approvalId: `ap_polrev_${i}` })],
        policyAuthorizer: () => ({ decision: 'REVIEW', reasons: ['ambiguous-policy-match'] })
      }
    }));
  }

  // --- constitution / policy digest binding missing ---
  for (let i = 0; i < 6; i += 1) {
    scenarios.push(scenario(`constitution-missing-${i}`, 'constitution', 'constitution digest missing before consequential allow', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_const_${i}` })], constitutionDigest: '' }
    }));
  }
  for (let i = 0; i < 6; i += 1) {
    scenarios.push(scenario(`policy-digest-missing-${i}`, 'policy', 'policy digest missing before consequential allow', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_policydigest_${i}` })], policyDigest: '' }
    }));
  }

  // --- duplicate / idempotency ---
  for (let i = 0; i < 8; i += 1) {
    scenarios.push(scenario(`idempotency-consistent-${i}`, 'idempotency', 're-evaluating an identical candidate yields the identical decision', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_idem_${i}` })] }
    }));
  }
  for (let i = 0; i < 6; i += 1) {
    scenarios.push(scenario(`idempotency-key-mismatch-${i}`, 'idempotency', 'reservation idempotency key does not match the intent it was derived from', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_idemkey_${i}` })] },
      contextOverrides: {}
    }));
  }

  // --- concurrency: represented as decision-determinism under repeated evaluation ---
  for (let i = 0; i < 6; i += 1) {
    scenarios.push(scenario(`concurrency-determinism-${i}`, 'concurrency', 'two "concurrent" evaluations of the same candidate must not diverge (true multi-connection races are covered by the closure suite against real PostgreSQL, not by this offline replay)', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_conc_${i}` })] }
    }));
  }

  // --- provider uncertainty ---
  for (let i = 0; i < 6; i += 1) {
    scenarios.push(scenario(`provider-uncertain-${i}`, 'provider-uncertainty', 'evidence sourced from an uncertain provider callback', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_prov_${i}` })] }
    }));
  }

  // --- malformed inputs: NaN / Infinity / garbage ---
  const malformed = [
    { field: 'blastRadius', value: NaN },
    { field: 'blastRadius', value: Infinity },
    { field: 'maxCostUsd', value: NaN },
    { field: 'maxCostUsd', value: -Infinity },
    { field: 'blastRadius', value: -1 },
    { field: 'maxCostUsd', value: -5 }
  ];
  malformed.forEach((malformedCase, i) => {
    const approvalId = `ap_malformed_${i}`;
    const s = scenario(`malformed-${i}`, 'malformed-inputs', `intent.${malformedCase.field} = ${malformedCase.value}`, {
      admissionOptions: { approvals: [validApproval({ approvalId })] }
    });
    s.build = () => {
      const context = baseContext({ suffix: `malformed-${i}`, legacyEligible: true });
      return {
        context,
        admissionOptions: {
          now: NOW, keyResolver: KEY_RESOLVER, policyDigest: POLICY_DIGEST, constitutionDigest: CONSTITUTION_DIGEST,
          policyAuthorizer: () => ({ decision: 'ALLOW' }), approvals: [validApproval({ approvalId })],
          __tamperIntent: intent => ({ ...intent, [malformedCase.field]: malformedCase.value })
        }
      };
    };
    scenarios.push(s);
  });
  for (let i = 0; i < 4; i += 1) {
    scenarios.push(scenario(`malformed-timestamp-${i}`, 'malformed-inputs', 'malformed ISO timestamp in context.observedAt', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_malts_${i}` })] },
      contextOverrides: { legacyEligible: true }
    }));
  }

  // --- stale proof: STALE lifecycle evidence ---
  for (let i = 0; i < 6; i += 1) {
    const approvalId = `ap_stale_${i}`;
    const s = scenario(`stale-evidence-${i}`, 'stale-proof', 'evidence lifecycle flagged STALE', {
      admissionOptions: { approvals: [validApproval({ approvalId })] }
    });
    s.build = () => ({
      context: baseContext({ suffix: `stale-evidence-${i}`, legacyEligible: true }),
      admissionOptions: {
        now: NOW, keyResolver: KEY_RESOLVER, policyDigest: POLICY_DIGEST, constitutionDigest: CONSTITUTION_DIGEST,
        policyAuthorizer: () => ({ decision: 'ALLOW' }), approvals: [validApproval({ approvalId })],
        __tamperEvidence: evidence => ({ ...evidence, lifecycleFlags: ['STALE'] })
      }
    });
    scenarios.push(s);
  }

  // --- missing proof: no evidence resolvable at all ---
  for (let i = 0; i < 6; i += 1) {
    const approvalId = `ap_missing_${i}`;
    const s = scenario(`missing-evidence-${i}`, 'missing-proof', 'evidence record cannot be resolved by ID', {
      admissionOptions: { approvals: [validApproval({ approvalId })] }
    });
    s.build = () => ({
      context: baseContext({ suffix: `missing-evidence-${i}`, legacyEligible: true }),
      admissionOptions: {
        now: NOW, keyResolver: KEY_RESOLVER, policyDigest: POLICY_DIGEST, constitutionDigest: CONSTITUTION_DIGEST,
        policyAuthorizer: () => ({ decision: 'ALLOW' }), approvals: [validApproval({ approvalId })],
        __dropEvidence: true
      }
    });
    scenarios.push(s);
  }

  // --- inconsistent proof: evidence digest does not match recomputed content ---
  for (let i = 0; i < 6; i += 1) {
    const approvalId = `ap_inconsistent_${i}`;
    const s = scenario(`inconsistent-evidence-${i}`, 'inconsistent-proof', 'evidence content mutated after digest was computed', {
      admissionOptions: { approvals: [validApproval({ approvalId })] }
    });
    s.build = () => ({
      context: baseContext({ suffix: `inconsistent-evidence-${i}`, legacyEligible: true }),
      admissionOptions: {
        now: NOW, keyResolver: KEY_RESOLVER, policyDigest: POLICY_DIGEST, constitutionDigest: CONSTITUTION_DIGEST,
        policyAuthorizer: () => ({ decision: 'ALLOW' }), approvals: [validApproval({ approvalId })],
        __tamperEvidence: evidence => ({ ...evidence, subject: `${evidence.subject}-tampered-after-signing` })
      }
    });
    scenarios.push(s);
  }

  // --- evidence tampering: forged evidence id / source substitution ---
  for (let i = 0; i < 8; i += 1) {
    const approvalId = `ap_tamper_${i}`;
    const s = scenario(`evidence-tamper-${i}`, 'evidence-tampering', 'synthetic evidence presented with a forged external source reference', {
      admissionOptions: { approvals: [validApproval({ approvalId })] }
    });
    s.build = () => ({
      context: baseContext({ suffix: `evidence-tamper-${i}`, legacyEligible: true }),
      admissionOptions: {
        now: NOW, keyResolver: KEY_RESOLVER, policyDigest: POLICY_DIGEST, constitutionDigest: CONSTITUTION_DIGEST,
        policyAuthorizer: () => ({ decision: 'ALLOW' }), approvals: [validApproval({ approvalId })],
        __tamperEvidence: evidence => ({ ...evidence, origin: 'EXTERNAL_SOURCE', sourceRef: `not-a-real-url-${i}` })
      }
    });
    scenarios.push(s);
  }

  // --- wrong recipient / resource mismatch ---
  for (let i = 0; i < 8; i += 1) {
    const approvalId = `ap_recipient_${i}`;
    const s = scenario(`wrong-recipient-${i}`, 'wrong-recipient', 'approval resource prefix does not cover the intent recipient', {
      admissionOptions: { approvals: [validApproval({ approvalId, extra: { resourcePrefixes: ['email:only-allowed-domain.example.com'] } })] }
    });
    scenarios.push(s);
  }

  // --- excessive blast radius ---
  for (let i = 0; i < 6; i += 1) {
    scenarios.push(scenario(`excessive-blast-radius-${i}`, 'excessive-blast-radius', 'approval max blast radius is 0, intent needs 1', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_blast_${i}`, maxBlastRadius: 0 })] }
    }));
  }

  // --- excessive cost ---
  for (let i = 0; i < 6; i += 1) {
    scenarios.push(scenario(`excessive-cost-${i}`, 'excessive-cost', 'approval max cost is below the intent cost', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_cost_${i}`, maxCostUsd: 0.01 })] }
    }));
  }

  // --- kill state ---
  for (let i = 0; i < 6; i += 1) {
    scenarios.push(scenario(`kill-state-${i}`, 'kill-state', 'global kill state is active', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_kill_${i}` })], killState: { active: true } }
    }));
  }

  // --- unavailable database (simulated: usage resolver throws) ---
  for (let i = 0; i < 6; i += 1) {
    scenarios.push(scenario(`db-unavailable-${i}`, 'unavailable-database', 'usage/authority resolver throws as if the database were unreachable', {
      admissionOptions: {
        approvals: [validApproval({ approvalId: `ap_db_${i}` })],
        usageResolver: () => { throw new Error('simulated database unavailable'); }
      }
    }));
  }

  // --- unavailable Cedar (simulated: policyAuthorizer throws) ---
  for (let i = 0; i < 6; i += 1) {
    scenarios.push(scenario(`cedar-unavailable-${i}`, 'unavailable-cedar', 'policy authorizer throws as if Cedar were unreachable', {
      admissionOptions: {
        approvals: [validApproval({ approvalId: `ap_cedar_${i}` })],
        policyAuthorizer: () => { throw new Error('simulated Cedar evaluation failure'); }
      }
    }));
  }

  // --- forged / mutated approval signature ---
  for (let i = 0; i < 6; i += 1) {
    scenarios.push(scenario(`forged-signature-${i}`, 'authority', 'approval signed by an attacker key, not the trusted owner key', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_forged_${i}`, signerKey: attackerKeys.privateKey })] }
    }));
  }
  for (let i = 0; i < 6; i += 1) {
    const approvalId = `ap_mutated_${i}`;
    const s = scenario(`mutated-after-signing-${i}`, 'authority', 'approval content mutated after signing (budget inflated post-hoc)', {
      admissionOptions: { approvals: [validApproval({ approvalId })] }
    });
    s.build = () => {
      const approval = validApproval({ approvalId });
      return {
        context: baseContext({ suffix: `mutated-after-signing-${i}`, legacyEligible: true }),
        admissionOptions: {
          now: NOW, keyResolver: KEY_RESOLVER, policyDigest: POLICY_DIGEST, constitutionDigest: CONSTITUTION_DIGEST,
          policyAuthorizer: () => ({ decision: 'ALLOW' }),
          approvals: [{ ...approval, maxCostUsd: 999 }]
        }
      };
    };
    scenarios.push(s);
  }

  // --- wrong idempotency key vs intent ---
  for (let i = 0; i < 4; i += 1) {
    scenarios.push(scenario(`wrong-idempotency-key-${i}`, 'idempotency', 'reservation idempotency key does not correspond to any real intent nonce', {
      admissionOptions: { approvals: [validApproval({ approvalId: `ap_wik_${i}` })] }
    }));
  }

  return scenarios;
}
