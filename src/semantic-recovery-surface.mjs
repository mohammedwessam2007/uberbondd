export const SEMANTIC_RECOVERY_SURFACE_VERSION = 'uberbond.semantic-recovery-surface.v1';

const CONCRETE_STATEFUL_PATTERNS = Object.freeze([
  /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|rename|renameSync|mkdir|mkdirSync|rm|rmSync|unlink|unlinkSync)\s*\(/,
  /\b(?:createWriteStream|openSync)\s*\(/,
  /\b(?:createServer|setInterval)\s*\(/,
  /\.listen\s*\(/,
  /\b(?:spawn|fork)\s*\(/,
  /\bnew\s+Worker\s*\(/,
  /\b(?:postgres|postgresql|pg\.Pool|pg\.Client|new\s+Pool|new\s+Client)\b/i,
  /\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_][\w.]*\s+SET|DELETE\s+FROM|BEGIN\s*;|COMMIT\s*;|ROLLBACK\s*;)\b/i
]);

export function detectConcreteRecoverySurfaces(sourceText = '') {
  const body = String(sourceText || '');
  return CONCRETE_STATEFUL_PATTERNS
    .map((pattern, index) => pattern.test(body) ? `surface-${index + 1}` : null)
    .filter(Boolean);
}

export function hasConcreteRecoverySurface(sourceText = '') {
  return detectConcreteRecoverySurfaces(sourceText).length > 0;
}
