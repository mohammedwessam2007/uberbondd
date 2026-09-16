export const UBEROS_KERNEL_ADAPTER_VERSION = 'uberos.kernel-adapter.v1';

export const KERNEL_CLASSES = Object.freeze(['LINUX', 'MICROVM_HOST', 'EXPERIMENTAL_KERNEL']);
const clean = (value, max = 600) => { const text = String(value ?? '').trim(); return text && text.length <= max ? text : null; };

export function normalizeKernelAdapter(raw = {}) {
  const id = clean(raw.id, 120);
  const kernelClass = clean(raw.kernelClass, 80)?.toUpperCase();
  const sourceRef = clean(raw.sourceRef, 1200);
  const revision = clean(raw.revision, 240);
  const license = clean(raw.license, 240);
  const abi = clean(raw.abi, 160);
  const capabilities = [...new Set((Array.isArray(raw.capabilities) ? raw.capabilities : []).map(v => clean(v, 160)).filter(Boolean))].sort();
  const reasonCodes = [];
  if (!id || !kernelClass || !KERNEL_CLASSES.includes(kernelClass)) reasonCodes.push('known-kernel-class-and-id-required');
  if (!sourceRef || !revision || !license) reasonCodes.push('kernel-provenance-required');
  if (!abi) reasonCodes.push('kernel-abi-required');
  if (!capabilities.length) reasonCodes.push('kernel-capabilities-required');
  if (reasonCodes.length) return { ok: false, status: 'KERNEL_ADAPTER_REJECTED', reasonCodes, consequenceAuthority: 'NONE' };
  return { ok: true, status: 'KERNEL_ADAPTER_ADMISSIBLE', adapter: { id, kernelClass, sourceRef, revision, license, abi, capabilities }, consequenceAuthority: 'NONE' };
}

export function selectKernelAdapter({ adapters = [], requiredCapabilities = [], preferredClass = 'LINUX' } = {}) {
  const normalized = adapters.map(normalizeKernelAdapter).filter(row => row.ok).map(row => row.adapter);
  const required = [...new Set(requiredCapabilities)].sort();
  const candidates = normalized.filter(adapter => { const set = new Set(adapter.capabilities); return required.every(cap => set.has(cap)); });
  candidates.sort((a, b) => { const ap = a.kernelClass === preferredClass ? 0 : 1; const bp = b.kernelClass === preferredClass ? 0 : 1; return ap - bp || a.id.localeCompare(b.id); });
  if (!candidates.length) return { ok: false, status: 'NO_KERNEL_ADAPTER_SATISFIES_REQUIREMENTS', reasonCodes: ['missing-required-kernel-capability'], missingAgainst: required, consequenceAuthority: 'NONE' };
  return { ok: true, status: 'KERNEL_ADAPTER_SELECTED', adapter: candidates[0], alternatives: candidates.slice(1).map(row => row.id), law: 'LINUX_IS_A_REPLACEABLE_BOOTSTRAP_SUPPLIER_NOT_THE_TERMINAL_IDENTITY', consequenceAuthority: 'NONE' };
}
