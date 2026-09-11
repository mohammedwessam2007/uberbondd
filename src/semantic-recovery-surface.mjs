export const SEMANTIC_RECOVERY_SURFACE_VERSION = 'uberbond.semantic-recovery-surface.v1.2';

const CONCRETE_STATEFUL_PATTERNS = Object.freeze([
  /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|rename|renameSync|mkdir|mkdirSync|rm|rmSync|unlink|unlinkSync)\s*\(/,
  /\b(?:createWriteStream|openSync)\s*\(/,
  /\b(?:createServer|setInterval)\s*\(/,
  /\.listen\s*\(/,
  /\bchild_process\.(?:spawn|fork)\s*\(/,
  /\bnew\s+Worker\s*\(/,
  /\b(?:postgres|postgresql|pg\.Pool|pg\.Client|new\s+Pool|new\s+Client)\b/i,
  /\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_][\w.]*\s+SET|DELETE\s+FROM)\b/i,
  /\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i
]);

function hasImportedChildProcessCall(body = '') {
  const importsChildProcess = /(?:from\s+['"](?:node:)?child_process['"]|require\s*\(\s*['"](?:node:)?child_process['"]\s*\))/i.test(body);
  return importsChildProcess && /\b(?:spawn|fork)\s*\(/.test(body);
}

export function detectConcreteRecoverySurfaces(sourceText = '') {
  const body = String(sourceText || '');
  const found = CONCRETE_STATEFUL_PATTERNS
    .map((pattern, index) => pattern.test(body) ? `surface-${index + 1}` : null)
    .filter(Boolean);
  if (hasImportedChildProcessCall(body) && !found.includes('surface-5')) found.push('surface-5');
  return found.sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
}

export function hasConcreteRecoverySurface(sourceText = '') {
  return detectConcreteRecoverySurfaces(sourceText).length > 0;
}
