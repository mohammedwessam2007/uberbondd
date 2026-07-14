export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'InputError';
    this.status = status;
  }
}

export function parseStrictBoolean(value, name = 'value', fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  throw new InputError(`${name} must be true or false`);
}

export function parseDryRunBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  // Disabling preview mode has side effects, so only a real JSON boolean false can do it.
  if (value === false) return false;
  return true;
}
