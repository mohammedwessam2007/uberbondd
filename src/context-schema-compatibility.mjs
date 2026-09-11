import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CONTEXT_SCHEMA_COMPATIBILITY_POLICY_VERSION='context-schema-compatibility-1.0.0';
export const CONTEXT_SCHEMA_COMPATIBILITY_RECEIPT_SCHEMA='uberbond.context-schema-compatibility.v1';
export const CONTEXT_SCHEMA_REGISTRY=Object.freeze({
  contextAbi:['uberbond.context-abi.v1'],
  brainstate:['uberbond.brainstate-capsule.v1'],
  cognitiveEvent:['uberbond.cognitive-event.v1'],
  journalEntry:['uberbond.cognitive-journal-entry.v1'],
  journalSegment:['uberbond.cognitive-journal-segment.v1'],
  journalManifest:['uberbond.cognitive-journal-manifest.v1'],
  contextMount:['uberbond.context-mount.v1'],
  contextProjection:['uberbond.context-projection.v1'],
  contextTaskBinding:['uberbond.context-task-binding.v1'],
  replicationBundle:['uberbond.context-replication-bundle.v1']
});
