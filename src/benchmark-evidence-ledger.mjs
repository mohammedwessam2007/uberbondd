import { auditC21EvidenceBundle } from './c21-evidence-factory.mjs';

export const BENCHMARK_EVIDENCE_LEDGER_VERSION='uberbond.benchmark-evidence-ledger.v1';

export function summarizeBenchmarkEvidence({campaign,receipts=[]}={}){
  const audit=auditC21EvidenceBundle({campaign,receipts});
  const evidenced=new Set((Array.isArray(receipts)?receipts:[]).filter(r=>r?.observed===true&&r?.synthetic!==true).map(r=>r.dimension));
  return {
    ok:audit.ok,
    version:BENCHMARK_EVIDENCE_LEDGER_VERSION,
    status:audit.status,
    evidenceStage:audit.evidenceStage,
    asiStatus:audit.asiStatus,
    counts:{required:20,observedNonsynthetic:evidenced.size,missing:audit.missingDimensions?.length??20,missingCritical:audit.missingCriticalDimensions?.length??7},
    evidencedDimensions:[...evidenced].sort(),
    missingDimensions:audit.missingDimensions||[],
    missingCriticalDimensions:audit.missingCriticalDimensions||[],
    reasonCodes:audit.reasonCodes||[],
    truthBoundary:'COUNTS_ONLY_AUTHENTICATED_OBSERVED_RECEIPTS__SOURCE_CODE_TESTS_PLANS_AND_SYNTHETIC_FIXTURES_DO_NOT_COUNT_AS_SYSTEM_LEVEL_EVIDENCE',
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE'
  };
}
