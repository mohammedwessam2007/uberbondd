import crypto from 'node:crypto';

export const UBEROS_PACKAGE_PROVENANCE_VERSION = 'uberos.package-provenance.v1';
const SPDX_LIKE = /^[A-Za-z0-9.+-]+(?:\s+(?:AND|OR)\s+[A-Za-z0-9.+-]+)*$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/i;

const clean = (value, max = 1200) => {
  const text = String(value ?? '').trim();
  return text && text.length <= max ? text : null;
};
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(v => clean(v, 240)).filter(Boolean))].sort();
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

export function normalizePackageProvenance(raw = {}) {
  const name = clean(raw.name, 160);
  const version = clean(raw.version, 160);
  const source = clean(raw.source, 1200);
  const sourceDigest = clean(raw.sourceDigest, 80)?.toLowerCase();
  const license = clean(raw.license, 240);
  const buildRecipeDigest = clean(raw.buildRecipeDigest, 80)?.toLowerCase();
  const reasonCodes = [];
  if (!name || !version) reasonCodes.push('package-name-and-version-required');
  if (!source) reasonCodes.push('source-reference-required');
  if (!sourceDigest || !SHA256.test(sourceDigest)) reasonCodes.push('source-sha256-required');
  if (!license || !SPDX_LIKE.test(license) || ['UNKNOWN', 'UNLICENSED', 'PROPRIETARY-UNKNOWN'].includes(license.toUpperCase())) reasonCodes.push('spdx-like-license-required');
  if (!buildRecipeDigest || !SHA256.test(buildRecipeDigest)) reasonCodes.push('build-recipe-sha256-required');

  const permissions = uniq(raw.permissions);
  const networkDestinations = uniq(raw.networkDestinations);
  const capabilities = uniq(raw.capabilities);
  const buildInputs = uniq(raw.buildInputs);

  if (reasonCodes.length) {
    return { ok: false, status: 'PACKAGE_PROVENANCE_REJECTED', reasonCodes, consequenceAuthority: 'NONE' };
  }

  const record = { name, version, source, sourceDigest, license, buildRecipeDigest, buildInputs, capabilities, permissions, networkDestinations, runtimeMutable: raw.runtimeMutable === true, privileged: raw.privileged === true };
  return { ok: true, status: 'PACKAGE_PROVENANCE_ADMISSIBLE', package: { ...record, provenanceDigest: digest(record) }, consequenceAuthority: 'NONE' };
}

export function comparePackageProvenance(previousRecord, nextRecord) {
  const prev = previousRecord?.package || previousRecord;
  const next = nextRecord?.package || nextRecord;
  if (!prev?.provenanceDigest || !next?.provenanceDigest) {
    return { ok: false, status: 'PACKAGE_COMPARISON_INVALID', reasonCodes: ['normalized-provenance-records-required'], consequenceAuthority: 'NONE' };
  }
  const prevPerms = new Set(prev.permissions || []);
  const prevNet = new Set(prev.networkDestinations || []);
  const widenedPermissions = (next.permissions || []).filter(v => !prevPerms.has(v));
  const widenedNetwork = (next.networkDestinations || []).filter(v => !prevNet.has(v));
  return {
    ok: true,
    status: 'PACKAGE_PROVENANCE_COMPARED',
    sourceChanged: prev.sourceDigest !== next.sourceDigest,
    recipeChanged: prev.buildRecipeDigest !== next.buildRecipeDigest,
    widenedPermissions,
    widenedNetwork,
    requiresFreshReview: prev.sourceDigest !== next.sourceDigest || prev.buildRecipeDigest !== next.buildRecipeDigest || widenedPermissions.length > 0 || widenedNetwork.length > 0 || prev.license !== next.license,
    consequenceAuthority: 'NONE'
  };
}
