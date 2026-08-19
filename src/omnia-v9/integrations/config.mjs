const ALLOWED_MODES = new Set(['off', 'shadow', 'compare', 'canary_null']);
const DEFAULT_MODE = 'off';

/**
 * Resolves the OMNIA_V9_MODE integration switch. Unknown, empty, or malformed
 * values resolve to 'off', never to an enforcing or ambiguous state. This is
 * the only place V9 integration mode is decided; no runtime code (including
 * V9's own learning/policy layers) may set or promote this value — it is
 * read once from process.env by whatever process wires the outbound hook.
 *
 * 'canary_null' is the one mode in which V9 is authoritative over an
 * execution -- but the execution target is always the null consequence sink
 * (src/omnia-v9/integrations/null-consequence-adapter.mjs), never Gmail or
 * any real provider. There is still no 'enforce', 'production', or
 * 'autonomous' value anywhere in this set.
 */
export function resolveOmniaV9Mode(env = process.env) {
  const raw = String(env?.OMNIA_V9_MODE ?? '').trim().toLowerCase();
  if (!raw) return DEFAULT_MODE;
  if (!ALLOWED_MODES.has(raw)) return DEFAULT_MODE;
  return raw;
}

export function isOmniaV9Active(mode) {
  return mode === 'shadow' || mode === 'compare';
}

export function isOmniaV9CompareMode(mode) {
  return mode === 'compare';
}

export function isOmniaV9CanaryNullMode(mode) {
  return mode === 'canary_null';
}

export const OMNIA_V9_ALLOWED_MODES = Object.freeze([...ALLOWED_MODES]);
export const OMNIA_V9_DEFAULT_MODE = DEFAULT_MODE;
