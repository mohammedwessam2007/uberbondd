// sourceType and evidenceClass were two independent strings a caller set, so a
// search-engine snippet could be filed as DIRECT_FIRST_PARTY -- the class
// reserved for the subject telling us directly. That let it into the set of
// direct evidence, where it could outrank a company's own team page and
// manufacture a conflict against it.
//
// A class is a claim about where something came from, and the source already
// says where it came from. Declaring a weaker class than the source allows is
// fine -- trusting something less is always permitted. Declaring a stronger one
// is laundering.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampEvidenceClassToSource,
  normalizeEnrichmentObservation,
  normalizePersonCandidate,
  reconcileFieldObservations
} from '../src/prospect-evidence-reconciliation.mjs';

const NOW = new Date('2026-08-23T00:00:00Z');

test('a weak source cannot declare a strong evidence class', () => {
  const laundered = normalizeEnrichmentObservation({
    field: 'work_email',
    value: 'ceo@acme.example',
    sourceType: 'search_engine',
    evidenceClass: 'DIRECT_FIRST_PARTY'
  }, { now: NOW });

  assert.equal(laundered.evidenceClass, 'ATTRIBUTED');
  assert.equal(laundered.declaredEvidenceClass, 'DIRECT_FIRST_PARTY');
  assert.equal(laundered.evidenceClassClamped, true, 'the clamp was silent');
});

test('a laundered snippet no longer outranks the company own page', () => {
  const laundered = normalizeEnrichmentObservation({
    field: 'work_email', value: 'wrong@acme.example',
    sourceType: 'search_engine', evidenceClass: 'DIRECT_FIRST_PARTY'
  }, { now: NOW });
  const firstHand = normalizeEnrichmentObservation({
    field: 'work_email', value: 'right@acme.example',
    sourceType: 'public_website', evidenceClass: 'DIRECT_PUBLIC'
  }, { now: NOW });

  const reconciled = reconcileFieldObservations([laundered, firstHand], { now: NOW });
  assert.equal(reconciled.status, 'DIRECT_EVIDENCE');
  assert.equal(reconciled.preferred.value, 'right@acme.example');
});

test('declaring a weaker class than the source allows is permitted', () => {
  const cautious = normalizeEnrichmentObservation({
    field: 'work_email', value: 'ceo@acme.example',
    sourceType: 'first_party', evidenceClass: 'ATTRIBUTED'
  }, { now: NOW });
  assert.equal(cautious.evidenceClass, 'ATTRIBUTED');
  assert.equal(cautious.evidenceClassClamped, false);
});

test('every source has a ceiling, and model inference has the lowest', () => {
  assert.equal(clampEvidenceClassToSource('model_inference', 'DIRECT_FIRST_PARTY').evidenceClass, 'MODEL_INFERENCE');
  assert.equal(clampEvidenceClassToSource('search_engine', 'LICENSED_PROVIDER').evidenceClass, 'ATTRIBUTED');
  assert.equal(clampEvidenceClassToSource('licensed_provider', 'DIRECT_PUBLIC').evidenceClass, 'LICENSED_PROVIDER');
  assert.equal(clampEvidenceClassToSource('public_website', 'DIRECT_FIRST_PARTY').evidenceClass, 'DIRECT_PUBLIC');
  assert.equal(clampEvidenceClassToSource('first_party', 'DIRECT_FIRST_PARTY').evidenceClass, 'DIRECT_FIRST_PARTY');
  // An unknown source gets the floor, not the benefit of the doubt.
  assert.equal(clampEvidenceClassToSource('something_invented', 'DIRECT_FIRST_PARTY').evidenceClass, 'MODEL_INFERENCE');
});

test('a person candidate cannot launder its own provenance either', () => {
  const candidate = normalizePersonCandidate({
    name: 'A Buyer', companyId: 'company_1',
    sourceType: 'search_engine', evidenceClass: 'DIRECT_FIRST_PARTY'
  }, { now: NOW });
  assert.equal(candidate.evidenceClass, 'ATTRIBUTED');
  assert.equal(candidate.evidenceClassClamped, true);
});

test('a model-inferred observation stays model-inferred whatever it claims', () => {
  const inferred = normalizeEnrichmentObservation({
    field: 'work_email', value: 'guess@acme.example',
    sourceType: 'model_inference', evidenceClass: 'DIRECT_FIRST_PARTY'
  }, { now: NOW });
  assert.equal(inferred.evidenceClass, 'MODEL_INFERENCE');
  assert.equal(inferred.inferred, true);
});
