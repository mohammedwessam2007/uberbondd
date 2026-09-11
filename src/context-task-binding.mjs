import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { verifyContextProjection } from './context-projection.mjs';

export const CONTEXT_TASK_BINDING_POLICY_VERSION = 'context-task-binding-1.0.0';
export const CONTEXT_TASK_BINDING_SCHEMA_VERSION = 'uberbond.context-task-binding.v1';
