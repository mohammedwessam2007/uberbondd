import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContextSchemaCompatibility } from '../src/context-schema-compatibility.mjs';
import { verifyContextSchemaCompatibility } from '../src/context-schema-compatibility-verify.mjs';

const schemas={brainstate:'uberbond.brainstate-capsule.v1',journalEntry:'uberbond.cognitive-journal-entry.v1',journalSegment:'uberbond.cognitive-journal-segment.v1',journalManifest:'uberbond.cognitive-journal-manifest.v1',contextProjection:'uberbond.context-projection.v1',replicationBundle:'uberbond.context-replication-bundle.v1'};

test('exact registered Context schemas compile a content-addressed compatibility receipt',()=>{const out=compileContextSchemaCompatibility({contextAbiVersion:'uberbond.context-abi.v1',schemas});assert.equal(out.ok,true);assert.match(out.receipt.receiptId,/^[a-f0-9]{64}$/);assert.equal(verifyContextSchemaCompatibility(out.receipt).ok,true);});

test('unknown future ABI or schema never receives guessed compatibility',()=>{assert.equal(compileContextSchemaCompatibility({contextAbiVersion:'uberbond.context-abi.v2',schemas}).ok,false);const future={...schemas,contextProjection:'uberbond.context-projection.v2'};const out=compileContextSchemaCompatibility({contextAbiVersion:'uberbond.context-abi.v1',schemas:future});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('unsupported-context-schema:contextProjection'));});

test('unknown surfaces fail closed instead of being ignored',()=>{const out=compileContextSchemaCompatibility({contextAbiVersion:'uberbond.context-abi.v1',schemas:{...schemas,magicMemory:'uberbond.magic.v1'}});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('unknown-context-schema-surface:magicMemory'));});

test('compatibility receipt tampering or authority widening is refused',()=>{const out=compileContextSchemaCompatibility({contextAbiVersion:'uberbond.context-abi.v1',schemas});const tampered=structuredClone(out.receipt);tampered.observedSchemas.brainstate='uberbond.brainstate-capsule.v9';assert.equal(verifyContextSchemaCompatibility(tampered).ok,false);const widened=structuredClone(out.receipt);widened.externalEffectAuthority='ALLOW';assert.equal(verifyContextSchemaCompatibility(widened).ok,false);});
