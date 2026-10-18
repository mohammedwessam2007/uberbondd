import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SECRET_KEY_PATTERN, redactSecrets } from './secret-patterns.mjs';

const FIXTURE_MARKER = ['secret-scanner', 'fixtures', 'intentional'].join('-');
const REDACTED_MARKER = 'secret-scanner-fixture-marker-redacted';
const SENSITIVE_KEY = /^(?:set-cookie|cookie|session(?:id)?|authorization)$/i;
const MAX_LEAF_CHARS = 8 * 1024 * 1024;

// Never materialize the entire atlas as one V8 string. Sanitize complete
// string leaves before JSON escaping to avoid cross-chunk credential leaks.
export function* redactedAtlasJsonTokens(value) {
  const active = new Set();
  function* visit(current, key = null, arraySlot = false) {
    if (typeof current === 'string') {
      if (current.length > MAX_LEAF_CHARS) throw new RangeError('Atlas persistence leaf exceeds bounded size');
      const safe = SECRET_KEY_PATTERN.test(key || '') || SENSITIVE_KEY.test(key || '')
        ? '[REDACTED]'
        : redactSecrets(current).replaceAll(FIXTURE_MARKER, REDACTED_MARKER);
      yield JSON.stringify(safe);
      return;
    }
    if (current === null || typeof current !== 'object') {
      const token = JSON.stringify(current);
      if (token === undefined) {
        if (arraySlot) { yield 'null'; return; }
        throw new TypeError('Atlas persistence root must be JSON serializable');
      }
      yield token;
      return;
    }
    if (active.has(current)) throw new TypeError('Cyclic atlas persistence value');
    if (typeof current.toJSON === 'function') throw new TypeError('Custom toJSON hooks refused in atlas persistence');
    active.add(current);
    try {
      if (Array.isArray(current)) {
        yield '[';
        for (let i = 0; i < current.length; i++) {
          if (i) yield ',';
          yield* visit(current[i], null, true);
        }
        yield ']';
      } else {
        yield '{';
        let first = true;
        for (const property of Object.keys(current)) {
          const child = current[property];
          if (child === undefined || typeof child === 'function' || typeof child === 'symbol') continue;
          if (!first) yield ',';
          first = false;
          yield JSON.stringify(property);
          yield ':';
          yield* visit(child, property);
        }
        yield '}';
      }
    } finally {
      active.delete(current);
    }
  }
  yield* visit(value);
}

export function* boundedRedactedAtlasJsonChunks(value, maxChunkChars = 65536) {
  if (!Number.isSafeInteger(maxChunkChars) || maxChunkChars < 1024) throw new RangeError('Invalid chunk size');
  let buffer = '';
  for (const token of redactedAtlasJsonTokens(value)) {
    if (buffer.length + token.length > maxChunkChars && buffer) {
      yield buffer;
      buffer = '';
    }
    if (token.length > maxChunkChars) {
      for (let i = 0; i < token.length;) {
        let end = Math.min(i + maxChunkChars, token.length);
        // A split UTF-16 surrogate pair would corrupt UTF-8 stream output.
        if (end < token.length && /[\uD800-\uDBFF]/.test(token[end - 1]) && /[\uDC00-\uDFFF]/.test(token[end])) end -= 1;
        yield token.slice(i, end);
        i = end;
      }
    } else {
      buffer += token;
    }
  }
  if (buffer) yield buffer;
  yield '\n';
}

export async function persistRedactedAtlasJson({ value, output }) {
  if (!output || typeof output !== 'string') throw new TypeError('Atlas output path required');
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    await pipeline(Readable.from(boundedRedactedAtlasJsonChunks(value)), createWriteStream(temporary, { flags: 'wx' }));
    await rename(temporary, output);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
