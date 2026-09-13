import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { FINAL_NEURAL_CAPABILITY_TARGET, mergeNeuralCapabilityRecords } from './neural-exocortex-genome.mjs';

export const NEURAL_EXOCORTEX_STORE_VERSION = 'uberbond.neural-exocortex-store.v1';
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value, max = 4000) => String(value ?? '').trim().slice(0, max);
function fail(reasonCodes, extra = {}) { return { ok: false, status: 'NEURAL_EXOCORTEX_STORE_REFUSED', reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], ...extra }; }
function safeRoot(rootDir) { const raw = clean(rootDir); if (!raw) return null; const resolved = path.resolve(raw); return resolved === path.parse(resolved).root ? null : resolved; }
async function atomicWrite(filePath, content) { await fsp.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 }); const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`; await fsp.writeFile(tmp, content, { encoding: 'utf8', mode: 0o600 }); await fsp.rename(tmp, filePath); }

export async function writeNeuralHarvestBatch({ rootDir, repositories = [], capabilities = [], manifest = {} } = {}) {
  const root = safeRoot(rootDir);
  if (!root) return fail(['safe-root-directory-required']);
  if (!Array.isArray(repositories) || !Array.isArray(capabilities)) return fail(['repositories-and-capabilities-arrays-required']);
  const core = { schemaVersion: 'uberbond.neural-exocortex-harvest-batch.v1', storeVersion: NEURAL_EXOCORTEX_STORE_VERSION, observedAt: new Date().toISOString(), repositoryObservations: repositories.length, capabilityObservations: capabilities.length, ...manifest };
  const batchId = clean(manifest.batchId, 120) || `neuralbatch_${digest([core, capabilities.map(item => item.id)]).slice(0, 24)}`;
  const finalDir = path.join(root, 'batches', batchId), tempDir = `${finalDir}.tmp-${process.pid}-${Date.now()}`;
  await fsp.mkdir(tempDir, { recursive: true, mode: 0o700 });
  const finalManifest = { ...core, batchId, repositoryDigest: digest(repositories.map(item => [item.repositoryFullName, item.family, item.partitionId])), capabilityDigest: digest(capabilities.map(item => [item.id, item.recordDigest])) };
  await fsp.writeFile(path.join(tempDir, 'manifest.json'), `${JSON.stringify(finalManifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fsp.writeFile(path.join(tempDir, 'repositories.jsonl'), repositories.map(item => JSON.stringify(item)).join('\n') + (repositories.length ? '\n' : ''), { encoding: 'utf8', mode: 0o600 });
  await fsp.writeFile(path.join(tempDir, 'capabilities.jsonl'), capabilities.map(item => JSON.stringify(item)).join('\n') + (capabilities.length ? '\n' : ''), { encoding: 'utf8', mode: 0o600 });
  await fsp.mkdir(path.dirname(finalDir), { recursive: true, mode: 0o700 });
  try { await fsp.access(finalDir); await fsp.rm(finalDir, { recursive: true, force: true }); } catch {}
  await fsp.rename(tempDir, finalDir);
  return { ok: true, status: 'NEURAL_EXOCORTEX_BATCH_PERSISTED', batchId, batchDir: finalDir, manifest: finalManifest };
}

async function listCapabilityFiles(root) { const batchesRoot = path.join(root, 'batches'); let entries = []; try { entries = await fsp.readdir(batchesRoot, { withFileTypes: true }); } catch { return []; } return entries.filter(entry => entry.isDirectory() && !entry.name.includes('.tmp-')).map(entry => path.join(batchesRoot, entry.name, 'capabilities.jsonl')).sort(); }
async function forEachJsonLine(filePath, fn) { const input = fs.createReadStream(filePath, { encoding: 'utf8' }); const rl = readline.createInterface({ input, crlfDelay: Infinity }); for await (const line of rl) { const trimmed = line.trim(); if (!trimmed) continue; let parsed; try { parsed = JSON.parse(trimmed); } catch { continue; } await fn(parsed); } }
function less(a, b) { if (a.score !== b.score) return a.score < b.score; return a.id > b.id; }
function heapSwap(heap, a, b) { const t = heap[a]; heap[a] = heap[b]; heap[b] = t; }
function heapUp(heap, index) { while (index > 0) { const parent = Math.floor((index - 1) / 2); if (!less(heap[index], heap[parent])) break; heapSwap(heap, index, parent); index = parent; } }
function heapDown(heap, index) { for (;;) { const left = index * 2 + 1, right = left + 1; let smallest = index; if (left < heap.length && less(heap[left], heap[smallest])) smallest = left; if (right < heap.length && less(heap[right], heap[smallest])) smallest = right; if (smallest === index) break; heapSwap(heap, index, smallest); index = smallest; } }
function offerTop(heap, item, limit) { if (limit <= 0) return; if (heap.length < limit) { heap.push(item); heapUp(heap, heap.length - 1); return; } if (less(item, heap[0])) return; heap[0] = item; heapDown(heap, 0); }

export async function compactNeuralExocortexCorpus({ rootDir, target = FINAL_NEURAL_CAPABILITY_TARGET, shardCount = 256 } = {}) {
  const root = safeRoot(rootDir);
  if (!root) return fail(['safe-root-directory-required']);
  const finalTarget = Math.max(1, Math.min(FINAL_NEURAL_CAPABILITY_TARGET, Number(target) || FINAL_NEURAL_CAPABILITY_TARGET));
  const shardTotal = Math.max(16, Math.min(1024, Number(shardCount) || 256));
  const files = await listCapabilityFiles(root), finalRoot = path.join(root, 'final'), workRoot = path.join(root, `.compact-${process.pid}-${Date.now()}`), shardRoot = path.join(workRoot, 'shards'), dedupRoot = path.join(workRoot, 'dedup');
  await fsp.mkdir(shardRoot, { recursive: true, mode: 0o700 }); await fsp.mkdir(dedupRoot, { recursive: true, mode: 0o700 });
  const shardStreams = new Map();
  const streamFor = index => { if (!shardStreams.has(index)) shardStreams.set(index, fs.createWriteStream(path.join(shardRoot, `${String(index).padStart(4, '0')}.jsonl`), { flags: 'a', mode: 0o600 })); return shardStreams.get(index); };
  let observedRows = 0;
  for (const file of files) await forEachJsonLine(file, record => { if (!record?.id) return; observedRows += 1; const shard = parseInt(crypto.createHash('sha256').update(record.id).digest('hex').slice(0, 8), 16) % shardTotal; streamFor(shard).write(`${JSON.stringify(record)}\n`); });
  await Promise.all([...shardStreams.values()].map(stream => new Promise((resolve, reject) => { stream.on('error', reject); stream.end(resolve); })));

  let distinctRows = 0; const familyCounts = {};
  for (let shard = 0; shard < shardTotal; shard += 1) {
    const inputPath = path.join(shardRoot, `${String(shard).padStart(4, '0')}.jsonl`); try { await fsp.access(inputPath); } catch { continue; }
    const byId = new Map();
    await forEachJsonLine(inputPath, record => { if (!record?.id) return; const previous = byId.get(record.id); byId.set(record.id, previous ? (mergeNeuralCapabilityRecords(previous, record) || previous) : record); });
    const deduped = [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const outputPath = path.join(dedupRoot, `${String(shard).padStart(4, '0')}.jsonl`);
    await fsp.writeFile(outputPath, deduped.map(record => JSON.stringify(record)).join('\n') + (deduped.length ? '\n' : ''), { encoding: 'utf8', mode: 0o600 });
    distinctRows += deduped.length;
    for (const record of deduped) familyCounts[record.family] = (familyCounts[record.family] || 0) + 1;
  }

  const familyNames = Object.keys(familyCounts).sort();
  const familyDiversityBudget = distinctRows > finalTarget ? Math.floor(finalTarget * 0.35) : 0;
  const protectedPerFamily = familyDiversityBudget > 0 && finalTarget >= familyNames.length ? Math.max(1, Math.floor(familyDiversityBudget / Math.max(1, familyNames.length))) : 0;
  const globalHeap = [], familyHeaps = new Map();
  for (const family of familyNames) familyHeaps.set(family, []);
  for (let shard = 0; shard < shardTotal; shard += 1) {
    const dedupPath = path.join(dedupRoot, `${String(shard).padStart(4, '0')}.jsonl`); try { await fsp.access(dedupPath); } catch { continue; }
    await forEachJsonLine(dedupPath, record => {
      const item = { id: record.id, score: Number(record.neuralPrior?.score || 0), shard, family: record.family || 'unknown' };
      offerTop(globalHeap, item, finalTarget);
      if (!familyHeaps.has(item.family)) familyHeaps.set(item.family, []);
      offerTop(familyHeaps.get(item.family), item, protectedPerFamily);
    });
  }

  const protectedItems = [...familyHeaps.values()].flat().sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const globalItems = globalHeap.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const selectedMeta = [], selectedIds = new Set();
  for (const item of protectedItems) { if (selectedMeta.length >= finalTarget || selectedIds.has(item.id)) continue; selectedMeta.push(item); selectedIds.add(item.id); }
  for (const item of globalItems) { if (selectedMeta.length >= finalTarget || selectedIds.has(item.id)) continue; selectedMeta.push(item); selectedIds.add(item.id); }
  selectedMeta.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const selectedByShard = new Map();
  for (const item of selectedMeta) { if (!selectedByShard.has(item.shard)) selectedByShard.set(item.shard, new Set()); selectedByShard.get(item.shard).add(item.id); }
  const tempFinal = `${finalRoot}.tmp-${process.pid}-${Date.now()}`; await fsp.mkdir(tempFinal, { recursive: true, mode: 0o700 });
  const output = fs.createWriteStream(path.join(tempFinal, 'capabilities.jsonl'), { flags: 'w', mode: 0o600 });
  let retained = 0; const retainedFamilyCounts = {};
  for (const [shard, ids] of [...selectedByShard.entries()].sort((a, b) => a[0] - b[0])) {
    const dedupPath = path.join(dedupRoot, `${String(shard).padStart(4, '0')}.jsonl`);
    await forEachJsonLine(dedupPath, record => { if (!ids.has(record.id)) return; output.write(`${JSON.stringify(record)}\n`); retained += 1; retainedFamilyCounts[record.family] = (retainedFamilyCounts[record.family] || 0) + 1; });
  }
  await new Promise((resolve, reject) => { output.on('error', reject); output.end(resolve); });
  const manifestCore = { schemaVersion: 'uberbond.neural-exocortex-final-manifest.v1', storeVersion: NEURAL_EXOCORTEX_STORE_VERSION, compactedAt: new Date().toISOString(), sourceBatchFiles: files.length, observedCapabilityRows: observedRows, distinctCapabilityRecords: distinctRows, requestedFinalTarget: finalTarget, immutableProgramTarget: FINAL_NEURAL_CAPABILITY_TARGET, retainedCapabilityRecords: retained, targetSatisfied: retained >= finalTarget, discoveredFamilyCounts: familyCounts, retainedFamilyCounts, familyDiversityBudget, protectedPerFamily, selectionLaw: 'DIVERSITY_PROTECTED_NEURAL_PRIOR_TOP_K_AFTER_CANONICAL_IDENTITY_DEDUPE__PROTECT_ELITE_REPRESENTATIVES_ACROSS_NEURAL_FAMILIES_THEN_FILL_REMAINING_CAPACITY_BY_GLOBAL_EVIDENCE_WEIGHTED_PRIOR__ACTIVE_CORTEX_REMAINS_SEPARATELY_APPROVED_AND_MISSION_SCOPED', truthBoundary: 'FINAL_LIBRARY_COMPLETION_MEANS_ONE_MILLION_DEDUPED_RETAINED_REFERENCE_CAPABILITY_RECORDS__NOT_ONE_MILLION_INSTALLED_OR_EXECUTABLE_CAPABILITIES__NOT_ASI_PROOF' };
  const manifest = { ...manifestCore, finalDigest: digest(selectedMeta.map(item => [item.id, item.score, item.family])) };
  await fsp.writeFile(path.join(tempFinal, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try { await fsp.rm(finalRoot, { recursive: true, force: true }); } catch {}
  await fsp.rename(tempFinal, finalRoot); await fsp.rm(workRoot, { recursive: true, force: true });
  return { ok: true, status: manifest.targetSatisfied ? 'NEURAL_EXOCORTEX_ONE_MILLION_FINAL_LIBRARY_COMPACTED' : 'NEURAL_EXOCORTEX_FINAL_LIBRARY_STILL_ACCUMULATING', manifest, finalRoot };
}

export async function readNeuralFinalManifest(rootDir) { const root = safeRoot(rootDir); if (!root) return null; try { return JSON.parse(await fsp.readFile(path.join(root, 'final', 'manifest.json'), 'utf8')); } catch { return null; } }
export async function writeNeuralHarvestState(rootDir, state) { const root = safeRoot(rootDir); if (!root) return fail(['safe-root-directory-required']); await atomicWrite(path.join(root, 'state.json'), `${JSON.stringify(state, null, 2)}\n`); return { ok: true, status: 'NEURAL_HARVEST_STATE_WRITTEN', statePath: path.join(root, 'state.json') }; }
export async function readNeuralHarvestState(rootDir, fallback = {}) { const root = safeRoot(rootDir); if (!root) return structuredClone(fallback); try { return { ...structuredClone(fallback), ...JSON.parse(await fsp.readFile(path.join(root, 'state.json'), 'utf8')) }; } catch { return structuredClone(fallback); } }
