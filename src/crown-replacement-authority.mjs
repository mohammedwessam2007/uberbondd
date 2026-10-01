export const REPLACEMENT_KEY='infinite_opus_crown_replacement_20261001_r1';
export function validReplacementAuthority(a,now=Date.now()){
 return a?.operation==='replacement-sealed-general-crown-evaluation' &&
 a?.attemptKey===REPLACEMENT_KEY && a?.maxIncrementalMicrousd===450000 &&
 a?.monthlyCapMicrousd===20000000 &&
 a?.evidenceRef==='owner-finish-it-all-20261001T215158Z' &&
 a?.historicalBillingEvidenceRef==='docs/receipts/UBERMIND_CROWN_BILLING_RECOVERY_2026-10-01.json' &&
 Number.isFinite(Date.parse(a.authorizedAt))&&Date.parse(a.authorizedAt)<=now &&
 Number.isFinite(Date.parse(a.expiresAt))&&Date.parse(a.expiresAt)>now;
}
