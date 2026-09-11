export const SEMANTIC_RECOVERY_SURFACE_VERSION = 'uberbond.semantic-recovery-surface.v1.3';

const CONCRETE_STATEFUL_PATTERNS = Object.freeze([
  /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|rename|renameSync|mkdir|mkdirSync|rm|rmSync|unlink|unlinkSync)\s*\(/,
  /\b(?:createWriteStream|openSync)\s*\(/,
  /\b(?:createServer|setInterval)\s*\(/,
  /\.listen\s*\(/,
  /\b(?:spawn|child_process\.fork)\s*\(/,
  /\bnew\s+Worker\s*\(/,
  /\b(?:postgres|postgresql|pg\.Pool|pg\.Client|new\s+Pool|new\s+Client)\b/i,
  /\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_][\w.]*\s+SET|DELETE\s+FROM)\b/i,
  /\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i
]);

function hasImportedChildProcessFork(body = '') {
  const importsChildProcessFork = /(?:import\s*\{[^}]*\bfork\b[^}]*\}\s*from\s*['"](?:node:)?child_process['"]|(?:const|let|var)\s*\{[^}]*\bfork\b[^}]*\}\s*=\s*require\s*\(\s*['"](?:node:)?child_process['"]\s*\))/i.test(body);
  return importsChildProcessFork && /\bfork\s*\(/.test(body);
}

export function detectConcreteRecoverySurfaces(sourceText = '') {
  const body = String(sourceText || '');
  const found = CONCRETE_STATEFUL_PATTERNS
    .map((pattern, index) => pattern.test(body) ? `surface-${index + 1}` : null)
    .filter(Boolean);
  if (hasImportedChildProcessFork(body) && !found.includes('surface-5')) found.push('surface-5');
  return found.sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
}

export function hasConcreteRecoverySurface(sourceText = '') {
  return detectConcreteRecoverySurfaces(sourceText).length > 0;
}
