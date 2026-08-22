// One list of what a credential looks like.
//
// There were two: the relay's scanner, which decides whether a payload may be
// persisted, and the sandbox verifier's redactor, which decides what may be
// quoted in a receipt. They had drifted -- the redactor knew about
// `DATABASE_URL=...` and the scanner did not, so a connection string with
// embedded credentials was redacted out of a verification excerpt while being
// written verbatim into durable task history.
//
// Two lists of "what must never be stored" is how one of them ends up shorter.
// This module imports nothing so both can depend on it.

export const SECRET_KEY_PATTERN = /token|secret|password|credential|privatekey|apikey|authorization/i;

/**
 * Value shapes that are credentials wherever they appear.
 *
 * Deliberately shaped rather than exhaustive: a rule that tries to recognise
 * every vendor's format is a rule that silently stops covering new ones. These
 * match structure -- a bearer prefix, a URI with a password in its userinfo,
 * an assignment to a name that only ever holds a secret.
 */
export const SECRET_VALUE_PATTERNS = Object.freeze([
  // Bearer / basic authorization headers.
  /\bBearer\s+\S+/,
  /\bBasic\s+[A-Za-z0-9+/=]{16,}/,
  // Provider key formats common enough to be worth naming.
  /\bsk-[A-Za-z0-9_-]{12,}/,
  /\bgh[pousr]_[A-Za-z0-9_]{12,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}/,
  // Any PEM block.
  /-----BEGIN[\s\S]{0,120}?PRIVATE KEY-----/,
  /-----BEGIN/,
  // A URI carrying a password in its userinfo: postgres://user:pw@host,
  // https://user:pw@host, redis://user:pw@host. Both halves must be present
  // and non-empty, so an ordinary URL is not caught.
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/i,
  // An assignment to a name that has no non-secret meaning.
  /\b(?:DATABASE_URL|DATABASE_URI|OPENAI_API_KEY|ANTHROPIC_API_KEY|VERCEL_TOKEN|GITHUB_TOKEN|GH_TOKEN|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|STRIPE_SECRET_KEY|STRIPE_API_KEY|SESSION_SECRET|JWT_SECRET|SMTP_PASSWORD|GOOGLE_CLIENT_SECRET)\s*[=:]\s*\S+/i
]);

/** True when the string carries something credential-shaped. */
export function looksLikeSecretValue(value) {
  const text = String(value ?? '');
  return SECRET_VALUE_PATTERNS.some(pattern => pattern.test(text));
}

/** True when a property name has no legitimate non-secret meaning. */
export function looksLikeSecretKey(value) {
  return SECRET_KEY_PATTERN.test(String(value ?? ''));
}

/** Replace every credential-shaped run with a marker, for quoting in receipts. */
export function redactSecrets(value) {
  let out = String(value ?? '');
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, `${pattern.flags.includes('i') ? 'gi' : 'g'}`), '[REDACTED]');
  }
  return out;
}
