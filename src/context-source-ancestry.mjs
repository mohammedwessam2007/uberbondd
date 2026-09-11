import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CONTEXT_SOURCE_ANCESTRY_POLICY_VERSION='context-source-ancestry-1.0.0';
export const CONTEXT_SOURCE_ANCESTRY_SCHEMA='uberbond.context-source-ancestry.v1';
const SHA40=/^[a-f0-9]{40}$/;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
