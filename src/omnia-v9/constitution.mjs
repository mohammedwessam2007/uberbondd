import { createHash } from 'node:crypto';

const ROLE_RE = /^[A-Z][A-Z0-9_]*$/;

export class ConstitutionBindingError extends Error {
  constructor(message, code = 'CANONICAL_CONFLICT', detail = {}) {
    super(message);
    this.name = 'ConstitutionBindingError';
    this.code = code;
    this.detail = detail;
  }
}

function sha256Bytes(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

function canonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite canonical number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError(`unsupported canonical type ${typeof value}`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError('only plain objects are canonical');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function sha256Object(value) {
  return sha256Bytes(canonical(value));
}

function extractMetadata(text) {
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
  const version = text.match(/Version\s+([0-9]+\.[0-9]+\.[0-9]+)/i)?.[1] || '';
  const effectiveDate = text.match(/Effective date:\s*(\d{4}-\d{2}-\d{2})/i)?.[1] || '';
  return { title, version, effectiveDate };
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new ConstitutionBindingError('manifest must be an object', 'INVALID_MANIFEST');
  if (manifest.schemaVersion !== 'omnia.v9.constitution-sources.p2') throw new ConstitutionBindingError('unsupported manifest schemaVersion', 'INVALID_MANIFEST');
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) throw new ConstitutionBindingError('manifest sources required', 'INVALID_MANIFEST');
  if (!Array.isArray(manifest.precedenceRules)) throw new ConstitutionBindingError('precedenceRules must be an array', 'INVALID_MANIFEST');

  const roles = new Set();
  const paths = new Set();
  for (const source of manifest.sources) {
    if (!source || typeof source !== 'object' || !ROLE_RE.test(String(source.role || ''))) throw new ConstitutionBindingError('invalid source role', 'INVALID_MANIFEST', { source });
    if (roles.has(source.role)) throw new ConstitutionBindingError(`duplicate source role ${source.role}`, 'CANONICAL_CONFLICT');
    if (paths.has(source.path)) throw new ConstitutionBindingError(`duplicate source path ${source.path}`, 'CANONICAL_CONFLICT');
    roles.add(source.role);
    paths.add(source.path);
    if (!source.path || !source.title || !source.version || !source.effectiveDate || !Array.isArray(source.anchors) || source.anchors.length === 0) {
      throw new ConstitutionBindingError(`incomplete source contract ${source.role}`, 'INVALID_MANIFEST');
    }
    if (!Array.isArray(source.requiresRoles)) throw new ConstitutionBindingError(`requiresRoles missing for ${source.role}`, 'INVALID_MANIFEST');
  }

  for (const source of manifest.sources) {
    for (const requiredRole of source.requiresRoles) {
      if (!roles.has(requiredRole)) throw new ConstitutionBindingError(`${source.role} requires missing role ${requiredRole}`, 'INCOMPLETE');
      if (requiredRole === source.role) throw new ConstitutionBindingError(`${source.role} cannot depend on itself`, 'CANONICAL_CONFLICT');
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(role) {
    if (visited.has(role)) return;
    if (visiting.has(role)) throw new ConstitutionBindingError(`normative dependency cycle at ${role}`, 'CANONICAL_CONFLICT');
    visiting.add(role);
    const source = manifest.sources.find(item => item.role === role);
    for (const dep of source.requiresRoles) visit(dep);
    visiting.delete(role);
    visited.add(role);
  }
  for (const role of roles) visit(role);

  const ruleIds = new Set();
  for (const rule of manifest.precedenceRules) {
    if (!rule?.id || !rule?.higher || !rule?.lower || !rule?.scope || !rule?.anchorRole || !rule?.anchor) {
      throw new ConstitutionBindingError('precedence rule incomplete', 'INVALID_MANIFEST', { rule });
    }
    if (ruleIds.has(rule.id)) throw new ConstitutionBindingError(`duplicate precedence rule ${rule.id}`, 'CANONICAL_CONFLICT');
    if (!roles.has(rule.anchorRole)) throw new ConstitutionBindingError(`precedence rule ${rule.id} references missing anchor role`, 'INCOMPLETE');
    ruleIds.add(rule.id);
  }
  return roles;
}

export function bindConstitution({ manifest, sourceBytesByRole }) {
  const roles = validateManifest(manifest);
  if (!(sourceBytesByRole instanceof Map)) throw new ConstitutionBindingError('sourceBytesByRole must be a Map', 'INVALID_INPUT');

  const boundSources = [];
  const textByRole = new Map();
  for (const source of manifest.sources) {
    const raw = sourceBytesByRole.get(source.role);
    if (raw == null) throw new ConstitutionBindingError(`missing required source ${source.role}`, 'INCOMPLETE', { role: source.role, path: source.path });
    const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8');
    const text = bytes.toString('utf8');
    textByRole.set(source.role, text);
    const metadata = extractMetadata(text);
    if (metadata.title !== source.title) throw new ConstitutionBindingError(`${source.role} title mismatch`, 'CANONICAL_CONFLICT', { expected: source.title, actual: metadata.title });
    if (metadata.version !== source.version) throw new ConstitutionBindingError(`${source.role} version mismatch`, 'CANONICAL_CONFLICT', { expected: source.version, actual: metadata.version });
    if (metadata.effectiveDate !== source.effectiveDate) throw new ConstitutionBindingError(`${source.role} effective date mismatch`, 'CANONICAL_CONFLICT', { expected: source.effectiveDate, actual: metadata.effectiveDate });
    for (const anchor of source.anchors) {
      if (!text.includes(anchor)) throw new ConstitutionBindingError(`${source.role} missing normative anchor`, 'CANONICAL_CONFLICT', { role: source.role, anchor });
    }
    boundSources.push({
      role: source.role,
      path: source.path,
      title: metadata.title,
      version: metadata.version,
      effectiveDate: metadata.effectiveDate,
      sha256: sha256Bytes(bytes),
      byteLength: bytes.length,
      requiresRoles: [...source.requiresRoles].sort()
    });
  }

  if (sourceBytesByRole.size !== roles.size) {
    for (const suppliedRole of sourceBytesByRole.keys()) {
      if (!roles.has(suppliedRole)) throw new ConstitutionBindingError(`unexpected source role ${suppliedRole}`, 'CANONICAL_CONFLICT');
    }
  }

  const boundPrecedence = manifest.precedenceRules.map(rule => {
    const anchorText = textByRole.get(rule.anchorRole);
    if (!anchorText.includes(rule.anchor)) {
      throw new ConstitutionBindingError(`precedence rule ${rule.id} is not anchored in source`, 'CANONICAL_CONFLICT', { id: rule.id, anchorRole: rule.anchorRole });
    }
    return {
      id: rule.id,
      higher: rule.higher,
      lower: rule.lower,
      scope: rule.scope,
      anchorRole: rule.anchorRole,
      anchorSha256: sha256Bytes(rule.anchor)
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const sources = boundSources.sort((a, b) => a.role.localeCompare(b.role));
  const sourceSet = {
    schemaVersion: 'omnia.v9.constitution-source-set.p2',
    sourceSetVersion: manifest.sourceSetVersion,
    sources,
    precedenceRules: boundPrecedence,
    conflictPolicy: 'FAIL_CLOSED_NO_LLM_RECONCILIATION'
  };
  const sourceSetDigest = sha256Object(sourceSet);
  const constitutionCore = {
    schemaVersion: 'omnia.v9.constitution-bundle.p2',
    compilerVersion: 'p2.0.0',
    sourceSetDigest,
    sourceRoles: sources.map(source => source.role),
    precedenceRuleIds: boundPrecedence.map(rule => rule.id),
    semantics: 'EXACT_SOURCE_BINDING_NOT_EXECUTABLE_POLICY'
  };
  return {
    ...constitutionCore,
    constitutionDigest: sha256Object(constitutionCore),
    sourceSet
  };
}
