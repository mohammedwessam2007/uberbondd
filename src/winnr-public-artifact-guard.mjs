// Last line of defence before anything is printed to a workflow log or uploaded as an artifact. Repository workflow
// logs and artifacts are readable publicly, so every public value passes through here. A match throws, and the caller
// must then publish only a fixed refusal code, never the value.
//
// This is a tripwire, not the primary control. The primary control is that public outputs are built from explicit,
// allowlisted fields that contain only counts and fixed class names.

export class PublicArtifactLeak extends Error {
  constructor(kind) {
    super('public-artifact-leak-refused');
    this.code = 'PUBLIC_ARTIFACT_LEAK_REFUSED';
    this.kind = kind;
  }
}

const PATTERNS = Object.freeze([
  ['email-address', /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/i],
  ['url', /\b(?:https?|ftp|s3):\/\//i],
  ['presigned-signature', /X-Amz-|Signature=|Credential=|X-Goog-|sig=[A-Za-z0-9%]/i],
  ['provider-token', /\bwnr_[A-Za-z0-9]/],
  ['password-word', /\bpassword\b|\bpasswd\b|\bpw-/i],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['csv-fragment', /^[^,\n]*,[^,\n]*@[^,\n]*,/m],
  ['domain-name', /(?<![A-Za-z0-9@-])(?!(?:api|inbound)\.winnr\.app\b|winnr\.app\b)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|co|net|org|io|app|ai|me|biz|info|site|shop|online|space|website|store|tech|dev|xyz|uk|us|eg|sa|ae)\b/i],
  ['long-opaque-token', /(?=[A-Za-z0-9+/_-]{32,})(?=.*[0-9])(?=.*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}/]
]);

// Checks every string in a value, including object keys. Keys that name identities are refused outright.
const FORBIDDEN_KEY = /email|address|username|user_name|password|token|secret|url|digest|slot|mailbox|cookie|authorization|signature/i;

export function assertPublicSafe(value, path = 'root') {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    for (const [kind, pattern] of PATTERNS) {
      if (pattern.test(value)) throw new PublicArtifactLeak(kind);
    }
    return true;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertPublicSafe(item, `${path}[${i}]`));
    return true;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) throw new PublicArtifactLeak('forbidden-key');
      assertPublicSafe(item, `${path}.${key}`);
    }
    return true;
  }
  throw new PublicArtifactLeak('unsupported-type');
}

// Converts any thrown value to a fixed code. The message, stack and properties are never read beyond the code.
export function sanitizedErrorCode(error) {
  const code = String(error?.code || error?.name || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 60);
  if (!code || code === 'ERROR' || code.length < 2) return 'UNCLASSIFIED_FAILURE';
  return code;
}
