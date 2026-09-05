/*
 * QUARANTINED HISTORICAL DONOR — DO NOT EXECUTE.
 *
 * The pre-hardening privileged admin client is preserved recoverably in Git
 * as blob 34767655330726fe9886524f3dce16956bcb1a50 and in the parent history of
 * PR #393. Its mechanisms remain available for provenance/audit, but the
 * vulnerable implementation is intentionally not shipped as executable public
 * JavaScript because it persisted the privileged bearer in localStorage and
 * serialized that bearer into protected download/OAuth query strings.
 *
 * Current admin functionality lives in ./admin.js and must use RAM-only bearer
 * state plus Authorization: Bearer request headers.
 */
