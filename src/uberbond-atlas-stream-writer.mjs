import { open, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { redactSecrets, SECRET_KEY_PATTERN } from './secret-patterns.mjs';

// Output is a research artifact, not executable instructions or a credential store.
// Unlike JSON.stringify(theWholeAtlas), this writer holds only individual values and
// a small output buffer in memory, even when the atlas has millions of records.
// All string leaves are scrubbed before their JSON representation is written.
const MAX_TEXT_LEAF = 16 * 1024 * 1024;
const MAX_DEPTH = 256;
const BUFFER_CHARS = 64 * 1024;
const FIXTURE_MARKER = ['secret-scanner', 'fixtures', 'intentional'].join('-');
const FIXTURE_REDACTED = 'secret-scanner-fixture-marker-redacted';
const OMIT = Symbol('omit');
const SENSITIVE_HEADER_KEY = /^(?:set-cookie|cookie|session(?:id)?|authorization)$/i;

function safeLeaf(value, sensitive) {
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT_LEAF) throw new RangeError('Atlas string leaf exceeds the bounded serialization policy');
    return JSON.stringify(sensitive ? '[REDACTED]' : redactSecrets(value).replaceAll(FIXTURE_MARKER, FIXTURE_REDACTED));
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'boolean' || value === null) return JSON.stringify(value);
  if (typeof value === 'bigint') throw new TypeError('Atlas contains a non-JSON bigint');
  if (value === undefined || typeof value === 'symbol' || typeof value === 'function') return OMIT;
  return null;
}

function* tokens(value, depth, active, sensitive = false, inArray = false) {
  if (depth > MAX_DEPTH) throw new RangeError('Atlas JSON nesting exceeds the bounded serialization policy');
  const leaf = safeLeaf(value, sensitive);
  if (leaf === OMIT) { if (inArray) yield 'null'; return; }
  if (leaf !== null) { yield leaf; return; }
  if (typeof value !== 'object') throw new TypeError('Atlas has an unsupported JSON type');
  if (active.has(value)) throw new TypeError('Atlas cyclic JSON structures are refused');
  const hook = Object.getOwnPropertyDescriptor(value, 'toJSON');
  if (hook && (!('value' in hook) || typeof hook.value === 'function')) {
    throw new TypeError('Atlas custom toJSON callbacks are refused');
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError('Atlas non-plain JSON objects are refused');
  }
  active.add(value);
  const tab = '  '.repeat(depth);
  const inner = '  '.repeat(depth + 1);
  if (Array.isArray(value)) {
    yield '[';
    for (let i = 0; i < value.length; i++) {
      if (i) yield ',';
      yield '\n' + inner;
      const slot = Object.getOwnPropertyDescriptor(value, String(i));
      if (slot && !('value' in slot)) throw new TypeError('Atlas array getter properties are refused');
      // Sparse slots are null in JSON. Never read through the prototype chain:
      // numeric inherited accessors can have arbitrary side effects.
      yield* tokens(slot?.value, depth + 1, active, sensitive, true);
    }
    if (value.length) yield '\n' + tab;
    yield ']';
  } else {
    const keys = Object.keys(value).filter(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) throw new TypeError('Atlas getter properties are refused');
      return !['undefined', 'symbol', 'function'].includes(typeof descriptor.value);
    });
    yield '{';
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (i) yield ',';
      yield '\n' + inner + JSON.stringify(key) + ': ';
      yield* tokens(Object.getOwnPropertyDescriptor(value, key).value, depth + 1, active,
        sensitive || SECRET_KEY_PATTERN.test(key) || SENSITIVE_HEADER_KEY.test(key), false);
    }
    if (keys.length) yield '\n' + tab;
    yield '}';
  }
  active.delete(value);
}

/** Atomically persist the complete JSON artifact. Any failure removes the temporary file.
 * This never silently truncates a successful atlas and never executes toJSON callbacks.
 */
export async function writeRedactedAtlasJSON(value, destination) {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = destination + '.incomplete-' + process.pid + '-' + randomBytes(6).toString('hex');
  let fd;
  try {
    fd = await open(temporary, 'wx', 0o600);
    let buffer = '';
    for (const part of tokens(value, 0, new WeakSet())) {
      if (buffer.length + part.length > BUFFER_CHARS && buffer) {
        await fd.writeFile(buffer, 'utf8');
        buffer = '';
      }
      if (part.length > BUFFER_CHARS) {
        // The largest individual string is independently bounded by MAX_TEXT_LEAF.
        await fd.writeFile(part, 'utf8');
      } else buffer += part;
    }
    await fd.writeFile(buffer + '\n', 'utf8');
    await fd.sync();
    await fd.close();
    fd = undefined;
    await rename(temporary, destination);
  } catch (error) {
    if (fd) await fd.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
