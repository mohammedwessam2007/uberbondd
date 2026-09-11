import fs from 'node:fs';
import { evaluateCompoundIntelligence } from '../src/compound-intelligence-evaluation.mjs';

const packet=JSON.parse(fs.readFileSync(new URL('../artifacts/c13-invariant-cognition-canonical-packet-v1.json',import.meta.url),'utf8'));
const result=evaluateCompoundIntelligence(packet);
const receipt={
  schemaVersion:'uberbond.c13.invariant-cognition.canonical-replay.v1',
  ok:result.ok===true,
  status:result.status,
  evidenceStage:result.evidenceStage||null,
  robustImprovedFamilies:result.receipt?.robustImprovedFamilies??null,
  requiredRobustImprovedFamilies:result.receipt?.requiredRobustImprovedFamilies??null,
  transferStatus:result.transfer?.status||null,
  retentionStatus:result.retention?.status||null,
  compositionDigest:result.compositionDigest||null,
  receiptHash:result.receiptHash||null,
  reasonCodes:result.reasonCodes||[],
  asiStatus:result.asiStatus||'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
  promotionAuthority:result.promotionAuthority||'NONE',
  truthBoundary:result.promotionBoundary||'CANONICAL_C13_REPLAY_ONLY__NO_AUTOMATIC_PROMOTION_OR_ASI_CLAIM'
};
console.log(JSON.stringify(receipt,null,2));
if(result.ok!==true||result.status!=='COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE')process.exit(1);
if(result.asiStatus!=='SYSTEM_LEVEL_ASI_NOT_ESTABLISHED')process.exit(2);
