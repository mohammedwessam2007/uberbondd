import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OMEGA_OPERATOR_CRYSTALLIZER_VERSION = 'uberbond.omega-operator-crystallizer.v1';
const envelope = extra => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });
const fail = reasons => envelope({ ok: false, status: 'OMEGA_OPERATOR_CRYSTALLIZATION_REFUSED', version: OMEGA_OPERATOR_CRYSTALLIZER_VERSION, reasonCodes: [...new Set(reasons)] });
const primitive = value => value === null || ['string', 'number', 'boolean'].includes(typeof value);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function normalizeTrace(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 128) return null;
  const out = [];
  for (const step of raw) {
    const op = String(step?.op || '').trim();
    if (!op || op.length > 120 || !step?.args || typeof step.args !== 'object' || Array.isArray(step.args)) return null;
    const args = {};
    for (const key of Object.keys(step.args).sort()) {
      const value = step.args[key];
      if (!primitive(value)) return null;
      args[key] = value;
    }
    out.push({ op, args });
  }
  return out;
}

export function crystallizeParametricOperator({ traces = [], name = 'operator' } = {}) {
  if (!Array.isArray(traces) || traces.length < 2 || traces.length > 256) return fail(['at-least-two-traces-required']);
  const normalized = traces.map(normalizeTrace);
  if (normalized.some(trace => !trace)) return fail(['invalid-trace']);
  const length = normalized[0].length;
  if (normalized.some(trace => trace.length !== length)) return fail(['trace-shape-mismatch']);
  const template = [];
  const slots = [];
  for (let index = 0; index < length; index += 1) {
    const ops = new Set(normalized.map(trace => trace[index].op));
    if (ops.size !== 1) return fail(['operation-sequence-mismatch']);
    const argKeys = Object.keys(normalized[0][index].args);
    if (normalized.some(trace => JSON.stringify(Object.keys(trace[index].args)) !== JSON.stringify(argKeys))) return fail(['argument-shape-mismatch']);
    const args = {};
    for (const key of argKeys) {
      const values = normalized.map(trace => trace[index].args[key]);
      const types = new Set(values.map(value => value === null ? 'null' : typeof value));
      if (types.size !== 1) return fail(['slot-type-mismatch']);
      const same = values.every(value => Object.is(value, values[0]));
      if (same) args[key] = { kind: 'CONST', value: values[0] };
      else {
        const slotId = `s${index}_${key}`;
        args[key] = { kind: 'SLOT', slotId, valueType: [...types][0] };
        slots.push({ slotId, stepIndex: index, key, valueType: [...types][0] });
      }
    }
    template.push({ op: normalized[0][index].op, args });
  }
  const core = { name: String(name || 'operator').slice(0, 160), template, slots };
  return envelope({
    ok: true,
    status: 'OMEGA_PARAMETRIC_OPERATOR_CRYSTALLIZED',
    version: OMEGA_OPERATOR_CRYSTALLIZER_VERSION,
    crystal: {
      ...core,
      crystalHash: digest(core),
      trainingTraceCount: normalized.length,
      promotionAuthority: 'NONE',
      requiresHeldOutVerification: true
    },
    truthBoundary: 'Anti-unification identifies a reusable syntactic macro only. It does not prove semantic equivalence, applicability guards, causal necessity, or held-out advantage.'
  });
}

export function instantiateParametricOperator({ crystal, bindings = {} } = {}) {
  if (!crystal?.crystalHash || !Array.isArray(crystal.template) || !Array.isArray(crystal.slots)) return fail(['crystal-required']);
  const required = new Set(crystal.slots.map(slot => slot.slotId));
  const actual = Object.keys(bindings);
  if (actual.length !== required.size || actual.some(key => !required.has(key))) return fail(['exact-slot-bindings-required']);
  for (const slot of crystal.slots) {
    const value = bindings[slot.slotId];
    const type = value === null ? 'null' : typeof value;
    if (!primitive(value) || type !== slot.valueType) return fail(['binding-type-mismatch']);
  }
  const trace = crystal.template.map(step => ({
    op: step.op,
    args: Object.fromEntries(Object.entries(step.args).map(([key, descriptor]) => [key, descriptor.kind === 'CONST' ? descriptor.value : bindings[descriptor.slotId]]))
  }));
  return envelope({
    ok: true,
    status: 'OMEGA_PARAMETRIC_OPERATOR_INSTANTIATED',
    version: OMEGA_OPERATOR_CRYSTALLIZER_VERSION,
    trace,
    crystalHash: crystal.crystalHash,
    verificationRequired: true,
    executionAuthority: 'NONE'
  });
}
