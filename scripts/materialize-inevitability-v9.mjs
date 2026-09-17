#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const carrierDir = path.join(ROOT, 'artifacts', 'inevitability-v9-carrier');
const manifest = JSON.parse(fs.readFileSync(path.join(carrierDir, 'MANIFEST.json'), 'utf8'));
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

const chunks = [];
for (const part of manifest.parts) {
  const p = path.join(carrierDir, 'parts', part.file);
  const encoded = fs.readFileSync(p, 'utf8');
  if (sha256(Buffer.from(encoded, 'utf8')) !== part.encodedSha256) {
    throw new Error(`encoded hash mismatch: ${part.file}`);
  }
  const binary = Buffer.from(encoded.trim(), 'base64');
  if (binary.length !== part.compressedBytes) throw new Error(`size mismatch: ${part.file}`);
  if (sha256(binary) !== part.compressedSha256) throw new Error(`compressed hash mismatch: ${part.file}`);
  chunks.push(binary);
}

const compressed = Buffer.concat(chunks);
if (compressed.length !== manifest.compressedBytes) throw new Error('compressed byte count mismatch');
if (sha256(compressed) !== manifest.compressedSha256) throw new Error('compressed stream hash mismatch');

const raw = zlib.brotliDecompressSync(compressed);
if (raw.length !== manifest.canonicalBytes) throw new Error('canonical byte count mismatch');
if (sha256(raw) !== manifest.canonicalSha256) throw new Error('canonical SHA-256 mismatch');

const lines = raw.length === 0 ? 0 : raw.toString('utf8').split('\n').length - (raw.at(-1) === 10 ? 1 : 0);
if (lines !== manifest.canonicalLines) throw new Error(`canonical line count mismatch: ${lines}`);

const out = path.join(ROOT, manifest.materializedPath);
fs.mkdirSync(path.dirname(out), { recursive: true });
if (fs.existsSync(out)) {
  const existing = fs.readFileSync(out);
  if (sha256(existing) !== manifest.canonicalSha256) throw new Error(`refusing to overwrite noncanonical materialized file: ${out}`);
} else {
  fs.writeFileSync(out, raw, { flag: 'wx' });
}

console.log(JSON.stringify({
  status: 'LOSSLESS_VERIFIED',
  path: out,
  bytes: raw.length,
  lines,
  sha256: sha256(raw),
  parts: manifest.partCount
}, null, 2));
