// One vocabulary for "this looks like a credential".
//
// Six modules had grown their own copy of this regex, and every copy had a
// different hole. The relay and the compute store matched ghp_ only, so a
// GitHub server-to-server (ghs_), OAuth (gho_), user-to-server (ghu_) or
// refresh (ghr_) token walked straight through. The provider worker matched
// every GitHub prefix but had no pattern for a PEM private key at all. The
// change contract caught private keys and AWS access keys but neither sk- nor
// any GitHub token. The sandbox verifier had the widest set and no AWS key.
//
// None of that was deliberate. It is what happens when the same rule is
// written down five times and only some copies get updated. A scanner is only
// as good as its worst copy, so there is one copy now.

/**
 * Value shapes that are credentials wherever they appear.
 *
 * The \b anchors matter: without them an ordinary generated identifier that
 * happens to contain "sk-" as a substring -- a taskId like
 * "e2e-task-1787174626471" contains "sk-1787174626471" -- reads as a secret.
 */
export const SECRET_VALUE_PATTERNS = Object.freeze([
  // PEM private keys of every flavour.
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  // AWS access key id.
  /\bAKIA[0-9A-Z]{16}\b/,
  // Bearer credentials in a header or a log line.
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/,
  // OpenAI-style keys, including the project-scoped form.
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{12,}/,
  // Every GitHub token prefix: personal, oauth, user-to-server,
  // server-to-server, refresh.
  /\bgh[pousr]_[A-Za-z0-9_]{12,}/,
  // Slack tokens.
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  // A connection string with inline credentials.
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i
]);

/** Key names that have no legitimate non-credential meaning. */
export const SECRET_KEY_PATTERN = /token|secret|password|passwd|credential|privatekey|private_key|apikey|api_key|authorization/i;

/** Named environment variables worth redacting on sight when they appear as assignments. */
export const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:DATABASE_URL|OPENAI_API_KEY|ANTHROPIC_API_KEY|VERCEL_TOKEN|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|STRIPE_SECRET_KEY)\s*=\s*\S+/g;

export function containsSecretValue(value) {
  if (typeof value !== 'string' || !value) return false;
  return SECRET_VALUE_PATTERNS.some(pattern => pattern.test(value));
}

/** Replace anything credential-shaped with a marker, for logs and receipts. */
export function redactSecrets(value) {
  let out = String(value ?? '');
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`), '[REDACTED]');
  }
  out = out.replace(SECRET_ASSIGNMENT_PATTERN, '[REDACTED]');
  return out;
}
