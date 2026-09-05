import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST = 'artifacts/pr388-readiness-delta.json';

function safePath(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('..') || raw.startsWith('/') || raw.includes('\\')) return null;
  if (!(raw === 'config/reachability-classification.json' || raw.startsWith('docs/') || raw.startsWith('artifacts/'))) return null;
  return raw;
}

export default function handler(req, res) {
  const requested = safePath(req.query?.path || MANIFEST);
  if (!requested) return res.status(400).json({ ok: false, status: 'INVALID_ARTIFACT_PATH' });
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST), 'utf8')); }
  catch { return res.status(503).json({ ok: false, status: 'READINESS_MANIFEST_UNAVAILABLE' }); }
  const allowed = new Set([MANIFEST, 'config/reachability-classification.json', ...(manifest.changedFiles || [])]);
  if (!allowed.has(requested)) return res.status(403).json({ ok: false, status: 'ARTIFACT_NOT_IN_READINESS_DELTA' });
  try {
    const content = fs.readFileSync(path.join(ROOT, requested), 'utf8');
    return res.status(200).json({ ok: true, path: requested, sourceCommit: manifest.sourceCommit, content });
  } catch {
    return res.status(404).json({ ok: false, status: 'ARTIFACT_NOT_FOUND' });
  }
}
