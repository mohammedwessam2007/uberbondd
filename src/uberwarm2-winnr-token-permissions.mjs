/** Read-only Winnr token scope introspection via GET /v1/account.
 * This never grants send permission or pretends to be a signed health receipt.
 */
const UNKNOWN = Object.freeze({
  status: 'PROVIDER_TOKEN_SCOPE_UNKNOWN', scope: 'UNKNOWN',
  providerWritePermissionReported: false, scopeEvidenceDigest: null,
  independentlySignedTransportProof: false, authorizedToSend: false
});
export function inspectWinnrTokenPermissions(account) {
  try {
    if (account?.ok !== true) return UNKNOWN;
    const digest = account?.receipt?.responseDigest;
    if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest)) return UNKNOWN;
    const permissions = account?.data?.api_token?.permissions;
    if (!Array.isArray(permissions) || permissions.length === 0 || permissions.length > 3 ||
      permissions.some(p => typeof p !== 'string' || !['read','write','purchase'].includes(p)) ||
      new Set(permissions).size !== permissions.length) return UNKNOWN;
    const write = permissions.includes('write');
    return Object.freeze({
      status: 'PROVIDER_TOKEN_SCOPE_REPORTED',
      scope: write ? 'WRITE_REPORTED' : permissions.includes('read') ? 'READ_ONLY_REPORTED' : 'UNKNOWN',
      providerWritePermissionReported: write, scopeEvidenceDigest: digest,
      independentlySignedTransportProof: false, authorizedToSend: false
    });
  } catch { return UNKNOWN; }
}
