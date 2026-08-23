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
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i,
  // Cookie and Set-Cookie headers. A session cookie is a live credential --
  // the same kind of thing as the Bearer token two patterns up, which was
  // caught -- and it was not detected on either the value scanner or the
  // worker-result scanner, so a worker pasting a request header into its
  // output wrote it into durable task history.
  //
  // Anchored on the header name rather than on the value, because a session
  // identifier has no distinguishing shape: matching bare `session=...` would
  // flag ordinary prose and query strings.
  /\bset-cookie\s*:/i,
  /\bcookie\s*:\s*\S+=/i,
  // JWTs, wherever they appear. Three base64url segments is a distinctive
  // enough shape to match on its own; the Bearer pattern only catches the ones
  // that arrive with their header attached.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  // GitHub fine-grained personal access tokens. The prefix list above covers
  // every *classic* GitHub prefix and misses this one entirely -- `github_pat_`
  // starts with `gh` but the third character is `i`, so `gh[pousr]_` cannot
  // reach it. Fine-grained is the format GitHub issues by default now, which
  // made the most likely token in circulation the one shape not detected.
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  // Stripe secret and restricted keys. `sk-` with a hyphen is the OpenAI shape;
  // Stripe uses an underscore, so `sk_live_...` matched nothing -- while
  // STRIPE_SECRET_KEY sat in the assignment list below, meaning the project
  // already contemplated Stripe credentials existing.
  /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/,
  // HTTP Basic credentials. The Bearer form two patterns up was caught and this
  // one was not, though both are a live credential in the same header, and
  // base64 of `user:password` is not meaningfully harder to replay.
  /\bBasic\s+[A-Za-z0-9+/]{16,}={0,2}/,
  // A credential-named key assigned a long opaque value. Provider-specific
  // prefixes only catch the providers somebody thought of: this project's own
  // payment provider was not among them. The key name carries the claim that
  // the value is a credential, so it is treated as one. The 20-character floor
  // keeps ordinary fixtures (`apiKey: 'test'`) out of it.
  // Deliberately not anchored with \b on the left: a provider prefixes its own
  // name onto the key, and `_` is a word character, so `\bapi_key` cannot match
  // inside `lemonsqueezy_api_key` -- which is this project's own payment
  // provider, and was the one key in the probe still walking through.
  /(?:api[_-]?key|secret[_-]?key|secret[_-]?access[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|refresh[_-]?token)["']?\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{20,}/i
]);

/** Key names that have no legitimate non-credential meaning. */
export const SECRET_KEY_PATTERN = /token|secret|password|passwd|credential|privatekey|private_key|apikey|api_key|authorization/i;

/** Named environment variables worth redacting on sight when they appear as assignments. */
// Case-insensitive: the names are conventionally uppercase in an environment
// file and conventionally lowercase in a config file or a shell export, and
// only the uppercase spelling was matched.
export const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:DATABASE_URL|OPENAI_API_KEY|ANTHROPIC_API_KEY|VERCEL_TOKEN|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|STRIPE_SECRET_KEY)\s*=\s*\S+/gi;

// A credential that arrives base64-wrapped.
//
// Twenty-five of twenty-six shapes were caught directly; this was the one that
// walked through. Detecting it by shape is impossible -- base64 of a token and
// base64 of an image are the same alphabet -- so the run is decoded and the
// existing value patterns are asked about the result. Nothing new is being
// recognized: the rule is "if it decodes to something we already call a
// credential, it is one".
//
// Precision comes from the two conditions rather than from the alphabet: the
// decoded bytes must be printable ASCII, and must match a value pattern. Base64
// of prose, of JSON, of a UUID, of a sha and of raw image bytes all fail one or
// the other. Only runs of 24+ characters are considered, so ordinary
// identifiers are never decoded at all.
function decodesToSecret(value) {
  for (const match of value.matchAll(/[A-Za-z0-9+/]{24,}={0,2}/g)) {
    let decoded;
    try { decoded = Buffer.from(match[0], 'base64').toString('utf8'); } catch { continue; }
    if (!decoded || !/^[\x20-\x7E\s]+$/.test(decoded)) continue;
    if (SECRET_VALUE_PATTERNS.some(pattern => pattern.test(decoded))) return true;
  }
  return false;
}

export function containsSecretValue(value) {
  if (typeof value !== 'string' || !value) return false;
  if (SECRET_VALUE_PATTERNS.some(pattern => pattern.test(value))) return true;
  if (decodesToSecret(value)) return true;
  // The named-variable assignments too. This function is what *blocks* a change
  // set or a worker result; `redactSecrets` below is what cleans a receipt.
  // They consulted different rule sets, so the redactor caught named assignments
  // the blocker let through -- a credential could be refused entry to a receipt
  // and admitted into durable task history in the same run. A fresh RegExp
  // because the shared one is global, and `.test` on a global regex carries
  // `lastIndex` between calls.
  return new RegExp(SECRET_ASSIGNMENT_PATTERN.source, 'i').test(value);
}

/** Replace anything credential-shaped with a marker, for logs and receipts. */
export function redactSecrets(value) {
  let out = String(value ?? '');
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`), '[REDACTED]');
  }
  out = out.replace(SECRET_ASSIGNMENT_PATTERN, '[REDACTED]');
  // The wrapped form too, so the redactor stays at least as strong as the
  // blocker. The whole run is replaced rather than the decoded fragment,
  // because a partially rewritten base64 string is still most of a credential.
  out = out.replace(/[A-Za-z0-9+/]{24,}={0,2}/g, run => (decodesToSecret(run) ? '[REDACTED]' : run));
  return out;
}
