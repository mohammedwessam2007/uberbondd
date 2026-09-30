import crypto from 'node:crypto';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function sourceDigest(source) {
  if (typeof source !== 'string') throw new Error('string-source-required');
  return sha256(Buffer.from(source, 'utf8'));
}

export function buildExactAnchors(source, ranges = []) {
  if (typeof source !== 'string' || !Array.isArray(ranges) || ranges.length > 4096) throw new Error('bounded-source-ranges-required');
  const bytes = Buffer.from(source, 'utf8');
  return ranges.map((range, index) => {
    if (!plain(range) || !Number.isSafeInteger(range.startByte) || !Number.isSafeInteger(range.endByte) ||
        range.startByte < 0 || range.endByte <= range.startByte || range.endByte > bytes.length) throw new Error('valid-byte-range-required');
    const excerpt = bytes.subarray(range.startByte, range.endByte).toString('utf8');
    if (Buffer.byteLength(excerpt, 'utf8') !== range.endByte - range.startByte) throw new Error('range-splits-utf8-codepoint');
    return { id: range.id ?? 'anchor-' + index, startByte: range.startByte, endByte: range.endByte, excerpt, excerptHash: sha256(Buffer.from(excerpt, 'utf8')) };
  });
}

export function residualPacketHash(packet) {
  const normalized = {
    schemaVersion: packet.schemaVersion,
    sourceHash: packet.sourceHash,
    qualityContractHash: packet.qualityContractHash,
    obligationHash: packet.obligationHash,
    evidence: packet.evidence,
    candidate: packet.candidate
  };
  return sha256(Buffer.from(JSON.stringify(normalized), 'utf8'));
}

// This verifier deliberately proves only exact source binding and independently
// certified coverage. It does NOT infer that a compressor preserved semantics.
export function verifyCertifiedFrontierResidual({ source, packet, coverageAuthority, currentCoverageContext = null, now = Date.now() } = {}) {
  const reasons = [];
  if (typeof source !== 'string' || !plain(packet) || packet.schemaVersion !== 'uberbond.certified-frontier-residual.v1') reasons.push('residual-packet-required');
  if (!digest(packet?.sourceHash) || packet?.sourceHash !== sourceDigest(source)) reasons.push('source-hash-mismatch');
  if (!digest(packet?.qualityContractHash) || !digest(packet?.obligationHash)) reasons.push('quality-and-obligation-hashes-required');
  if (!Array.isArray(packet?.evidence) || !packet.evidence.length || packet.evidence.length > 4096) reasons.push('bounded-evidence-required');
  if (typeof packet?.candidate !== 'string' || !packet.candidate.length) reasons.push('candidate-required');

  const bytes = Buffer.from(source ?? '', 'utf8');
  const ids = new Set();
  for (const row of packet?.evidence ?? []) {
    if (!plain(row) || typeof row.id !== 'string' || ids.has(row.id)) { reasons.push('unique-anchor-id-required'); continue; }
    ids.add(row.id);
    if (!Number.isSafeInteger(row.startByte) || !Number.isSafeInteger(row.endByte) || row.startByte < 0 || row.endByte <= row.startByte || row.endByte > bytes.length) {
      reasons.push('anchor-range-invalid'); continue;
    }
    const exact = bytes.subarray(row.startByte, row.endByte).toString('utf8');
    if (Buffer.byteLength(exact, 'utf8') !== row.endByte - row.startByte) reasons.push('anchor-splits-utf8-codepoint');
    if (exact !== row.excerpt || sha256(Buffer.from(exact, 'utf8')) !== row.excerptHash) reasons.push('anchor-not-exactly-source-bound');
  }

  const packetHash = reasons.length ? null : residualPacketHash(packet);
  if (!plain(coverageAuthority) || coverageAuthority.kind !== 'CERTIFIED_COVERAGE' || coverageAuthority.status !== 'ACTIVE') reasons.push('active-independent-coverage-authority-required');
  if (coverageAuthority?.sourceHash !== packet?.sourceHash || coverageAuthority?.qualityContractHash !== packet?.qualityContractHash ||
      coverageAuthority?.obligationHash !== packet?.obligationHash || coverageAuthority?.packetHash !== packetHash) reasons.push('coverage-authority-binding-mismatch');
  if (typeof coverageAuthority?.evidenceRef !== 'string' || !coverageAuthority.evidenceRef.length) reasons.push('coverage-evidence-reference-required');
  const expiry = Date.parse(coverageAuthority?.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) reasons.push('coverage-authority-expired');

  // Certificates minted from E0-E4 closure are valid only under the same
  // dependency, invalidator and Crown-revision state that was proven.
  if (coverageAuthority?.proofClass && ['E0','E1','E2','E3','E4'].includes(coverageAuthority.proofClass)) {
    if (!plain(currentCoverageContext)) reasons.push('current-coverage-context-required');
    else {
      if (coverageAuthority.crownRevision !== currentCoverageContext.crownRevision) reasons.push('coverage-crown-revision-drift');
      const deps = coverageAuthority.sourceDependencies ?? {};
      const currentDeps = currentCoverageContext.sourceHashes ?? {};
      if (JSON.stringify(deps) !== JSON.stringify(currentDeps)) reasons.push('coverage-dependency-drift');
      const invalidators = coverageAuthority.invalidators ?? {};
      const currentInvalidators = currentCoverageContext.invalidators ?? {};
      if (JSON.stringify(invalidators) !== JSON.stringify(currentInvalidators) || Object.values(currentInvalidators).some(v => v !== false)) reasons.push('coverage-invalidator-fired-or-drifted');
    }
  }

  return reasons.length ? {
    ok: false, status: 'FULL_CONTEXT_CROWN_REQUIRED', reasons: [...new Set(reasons)],
    mayOmitOriginalSourceFromCrown: false, semanticAuthority: 'NONE'
  } : {
    ok: true, status: 'CERTIFIED_FRONTIER_RESIDUAL',
    packetHash, mayOmitOriginalSourceFromCrown: true,
    semanticAuthority: 'INDEPENDENT_COVERAGE_AUTHORITY_PLUS_EXACT_SOURCE_BINDING',
    qualityLaw: 'Omit original source only while the exact packet and independent coverage authority remain current.'
  };
}

export function crownResidualMessages({ packet, verification } = {}) {
  if (!verification?.ok || verification.packetHash !== residualPacketHash(packet)) throw new Error('verified-current-residual-required');
  return [
    { role: 'system', content: 'You are the admitted Frontier Crown. Review only the certified residual packet. Exact source anchors and complete obligation coverage were independently verified. Return ACCEPT, minimal PATCH, or REWRITE. Do not assume facts outside the packet.' },
    { role: 'user', content: JSON.stringify({ obligationHash: packet.obligationHash, qualityContractHash: packet.qualityContractHash, evidence: packet.evidence, candidate: packet.candidate }) }
  ];
}
