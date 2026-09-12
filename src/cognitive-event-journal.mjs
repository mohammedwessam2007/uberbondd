import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import {
  compileCognitiveEvent,
  UBERBOND_COGNITIVE_EVENT_SCHEMA
} from './uberbond-cognitive-bus.mjs';

export const COGNITIVE_EVENT_JOURNAL_POLICY_VERSION = 'cognitive-event-journal-1.0.0';
export const COGNITIVE_JOURNAL_ENTRY_SCHEMA = 'uberbond.cognitive-journal-entry.v1';
const EVENT_ID = /^brain_evt_[a-f0-9]{24}$/;
const SHA64 = /^[a-f0-9]{64}$/;
const MAX_JOURNAL_BYTES = 128 * 1024 * 1024;
const MAX_ENTRIES = 1_000_000;

function zeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function fail(reasonCodes, status = 'COGNITIVE_JOURNAL_REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: COGNITIVE_EVENT_JOURNAL_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function journalEntryPayload(entry) {
  return {
    schemaVersion: entry.schemaVersion,
    sequence: entry.sequence,
    previousEntryDigest: entry.previousEntryDigest,
    eventId: entry.eventId,
    event: entry.event
  };
}

function validateCanonicalCompiledEvent(compiledEvent) {
  if (!compiledEvent?.ok || compiledEvent.status !== 'COGNITIVE_EVENT_READY') {
    return fail(['compiled-cognitive-event-required'], 'COGNITIVE_EVENT_INVALID');
  }
  const event = compiledEvent.event;
  if (!event || typeof event !== 'object' || Array.isArray(event)) return fail(['cognitive-event-object-required'], 'COGNITIVE_EVENT_INVALID');
  if (event.schemaVersion !== UBERBOND_COGNITIVE_EVENT_SCHEMA) return fail(['canonical-cognitive-event-schema-required'], 'COGNITIVE_EVENT_INVALID');
  if (!EVENT_ID.test(String(compiledEvent.eventId || ''))) return fail(['canonical-cognitive-event-id-required'], 'COGNITIVE_EVENT_INVALID');
  if (event.consequenceAuthority !== 'NONE' || event.businessEffectAuthority !== 'NONE') {
    return fail(['zero-consequence-authority-required'], 'COGNITIVE_EVENT_INVALID');
  }
  const recompiled = compileCognitiveEvent({
    kind: event.kind,
    sourceNodeId: event.sourceNodeId,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    summary: event.summary,
    evidenceRefs: event.evidenceRefs,
    payloadRef: event.payloadRef,
    truthClass: event.truthClass,
    observedAt: event.observedAt,
    parentEventIds: event.parentEventIds
  });
  if (!recompiled.ok || recompiled.eventId !== compiledEvent.eventId || digest(recompiled.event) !== digest(event)) {
    return fail(['canonical-cognitive-event-recompile-mismatch'], 'COGNITIVE_EVENT_INVALID');
  }
  return { ok: true, compiledEvent: recompiled };
}

export function compileCognitiveJournalEntry({ compiledEvent, sequence, previousEntryDigest = null } = {}) {
  const verified = validateCanonicalCompiledEvent(compiledEvent);
  if (!verified.ok) return verified;
  if (!Number.isSafeInteger(sequence) || sequence < 1) return fail(['positive-journal-sequence-required']);
  if (previousEntryDigest != null && !SHA64.test(String(previousEntryDigest))) return fail(['previous-entry-digest-invalid']);
  if (sequence === 1 && previousEntryDigest !== null) return fail(['genesis-entry-must-not-have-previous-digest']);
  if (sequence > 1 && previousEntryDigest === null) return fail(['non-genesis-entry-requires-previous-digest']);

  const entry = {
    schemaVersion: COGNITIVE_JOURNAL_ENTRY_SCHEMA,
    sequence,
    previousEntryDigest,
    eventId: verified.compiledEvent.eventId,
    event: verified.compiledEvent.event
  };
  entry.entryDigest = digest(journalEntryPayload(entry));
  return {
    ok: true,
    policyVersion: COGNITIVE_EVENT_JOURNAL_POLICY_VERSION,
    status: 'COGNITIVE_JOURNAL_ENTRY_COMPILED',
    entry,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function verifyCognitiveJournalEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) return fail(['bounded-journal-entry-list-required'], 'COGNITIVE_JOURNAL_INVALID');
  const seenEvents = new Set();
  let previous = null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const expectedSequence = index + 1;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fail(['journal-entry-object-required'], 'COGNITIVE_JOURNAL_INVALID', { index });
    if (entry.schemaVersion !== COGNITIVE_JOURNAL_ENTRY_SCHEMA) return fail(['journal-entry-schema-mismatch'], 'COGNITIVE_JOURNAL_INVALID', { index });
    if (entry.sequence !== expectedSequence) return fail(['journal-sequence-gap'], 'COGNITIVE_JOURNAL_INVALID', { index, expectedSequence, observedSequence: entry.sequence });
    if ((index === 0 && entry.previousEntryDigest !== null) || (index > 0 && entry.previousEntryDigest !== previous)) {
      return fail(['journal-chain-broken'], 'COGNITIVE_JOURNAL_INVALID', { index });
    }
    if (!SHA64.test(String(entry.entryDigest || '')) || entry.entryDigest !== digest(journalEntryPayload(entry))) {
      return fail(['journal-entry-digest-mismatch'], 'COGNITIVE_JOURNAL_INVALID', { index });
    }
    if (seenEvents.has(entry.eventId)) return fail(['duplicate-cognitive-event'], 'COGNITIVE_JOURNAL_INVALID', { index, eventId: entry.eventId });
    const verified = validateCanonicalCompiledEvent({ ok: true, status: 'COGNITIVE_EVENT_READY', eventId: entry.eventId, event: entry.event });
    if (!verified.ok) return fail(['journal-event-invalid', ...(verified.reasonCodes || [])], 'COGNITIVE_JOURNAL_INVALID', { index });
    seenEvents.add(entry.eventId);
    previous = entry.entryDigest;
  }
  return {
    ok: true,
    policyVersion: COGNITIVE_EVENT_JOURNAL_POLICY_VERSION,
    status: 'COGNITIVE_JOURNAL_VERIFIED',
    entryCount: entries.length,
    tipDigest: previous,
    eventIds: entries.map(entry => entry.eventId),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function readCognitiveJournal(journalPath) {
  const absolute = path.resolve(String(journalPath || ''));
  if (!journalPath) return fail(['journal-path-required'], 'COGNITIVE_JOURNAL_READ_REFUSED');
  if (!fs.existsSync(absolute)) return {
    ok: true,
    policyVersion: COGNITIVE_EVENT_JOURNAL_POLICY_VERSION,
    status: 'COGNITIVE_JOURNAL_EMPTY',
    path: absolute,
    entries: [],
    entryCount: 0,
    tipDigest: null,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) return fail(['regular-nonsymlink-journal-required'], 'COGNITIVE_JOURNAL_READ_REFUSED');
  if (stat.size > MAX_JOURNAL_BYTES) return fail(['journal-size-limit-exceeded'], 'COGNITIVE_JOURNAL_READ_REFUSED');
  const raw = fs.readFileSync(absolute, 'utf8');
  const lines = raw.split('\n').filter(line => line.length > 0);
  if (lines.length > MAX_ENTRIES) return fail(['journal-entry-limit-exceeded'], 'COGNITIVE_JOURNAL_READ_REFUSED');
  const entries = [];
  try {
    for (const line of lines) entries.push(JSON.parse(line));
  } catch {
    return fail(['journal-jsonl-parse-failed'], 'COGNITIVE_JOURNAL_INVALID');
  }
  const verified = verifyCognitiveJournalEntries(entries);
  if (!verified.ok) return verified;
  return { ...verified, status: 'COGNITIVE_JOURNAL_READ', path: absolute, entries };
}

function syncDirectory(directory) {
  let handle;
  try {
    handle = fs.openSync(directory, 'r');
    fs.fsyncSync(handle);
  } finally {
    if (handle != null) fs.closeSync(handle);
  }
}

export function appendCognitiveJournalEvent({ journalPath, compiledEvent } = {}) {
  const verifiedEvent = validateCanonicalCompiledEvent(compiledEvent);
  if (!verifiedEvent.ok) return verifiedEvent;
  if (!journalPath) return fail(['journal-path-required']);
  const absolute = path.resolve(String(journalPath));
  const directory = path.dirname(absolute);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lockPath = `${absolute}.lock`;
  let lockHandle;
  try {
    try {
      lockHandle = fs.openSync(lockPath, 'wx', 0o600);
    } catch (error) {
      if (error?.code === 'EEXIST') return fail(['journal-writer-lock-held'], 'COGNITIVE_JOURNAL_BUSY');
      throw error;
    }
    const current = readCognitiveJournal(absolute);
    if (!current.ok) return current;
    if (current.entries.some(entry => entry.eventId === verifiedEvent.compiledEvent.eventId)) {
      return fail(['duplicate-cognitive-event'], 'COGNITIVE_JOURNAL_DUPLICATE', { eventId: verifiedEvent.compiledEvent.eventId });
    }
    const compiledEntry = compileCognitiveJournalEntry({
      compiledEvent: verifiedEvent.compiledEvent,
      sequence: current.entries.length + 1,
      previousEntryDigest: current.tipDigest
    });
    if (!compiledEntry.ok) return compiledEntry;
    if (fs.existsSync(absolute)) {
      const stat = fs.lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) return fail(['regular-nonsymlink-journal-required']);
    }
    const handle = fs.openSync(absolute, 'a', 0o600);
    try {
      fs.writeSync(handle, `${JSON.stringify(compiledEntry.entry)}\n`, null, 'utf8');
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.chmodSync(absolute, 0o600);
    syncDirectory(directory);
    return {
      ok: true,
      policyVersion: COGNITIVE_EVENT_JOURNAL_POLICY_VERSION,
      status: 'COGNITIVE_EVENT_JOURNALED',
      path: absolute,
      sequence: compiledEntry.entry.sequence,
      eventId: compiledEntry.entry.eventId,
      entryDigest: compiledEntry.entry.entryDigest,
      previousEntryDigest: compiledEntry.entry.previousEntryDigest,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  } finally {
    if (lockHandle != null) {
      try { fs.closeSync(lockHandle); } catch {}
      try { fs.unlinkSync(lockPath); } catch {}
    }
  }
}
