// Quant Data Vault: market data with provenance a third party can re-derive.
//
// The source is Binance's public bulk archive (data.binance.vision). Every
// monthly file is published with a .CHECKSUM, so each dataset UberBond trades
// on paper can be traced to an exact URL, the publisher's SHA-256 and our own
// recomputation of it. A file whose hash does not match is refused, not
// "mostly used". Parsing normalises a real trap in this archive: spot klines
// switched from millisecond to microsecond timestamps in 2025, which silently
// shifts every bar by a factor of 1000 if ignored.
//
// Read-only public GETs. No account, no API key, no order placement.

import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const QUANT_DATA_VAULT_VERSION = 'uberbond.quant-data-vault-1.0.0';
const ARCHIVE_ROOT = 'https://data.binance.vision/data';
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

export function binanceVisionUrl({ market = 'spot', kind = 'klines', symbol, interval = '1h', month }) {
  if (!/^[A-Z0-9]{5,20}$/.test(String(symbol))) throw new Error('symbol must be an uppercase pair such as BTCUSDT');
  if (!/^\d{4}-\d{2}$/.test(String(month))) throw new Error('month must be YYYY-MM');
  const base = market === 'spot' ? `${ARCHIVE_ROOT}/spot/monthly` : market === 'um' ? `${ARCHIVE_ROOT}/futures/um/monthly` : null;
  if (!base) throw new Error('market must be spot or um');
  if (kind === 'klines') return `${base}/klines/${symbol}/${interval}/${symbol}-${interval}-${month}.zip`;
  if (kind === 'fundingRate' && market === 'um') return `${base}/fundingRate/${symbol}/${symbol}-fundingRate-${month}.zip`;
  throw new Error(`unsupported dataset ${market}/${kind}`);
}

/** Extract the single member of a zip archive using only node:zlib. */
export function unzipSingle(buffer) {
  let eocd = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error('zip: end of central directory not found');
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error('zip: central directory signature mismatch');
  const method = buffer.readUInt16LE(centralOffset + 10);
  const compressedSize = buffer.readUInt32LE(centralOffset + 20);
  const nameLength = buffer.readUInt16LE(centralOffset + 28);
  const name = buffer.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString('utf8');
  const localOffset = buffer.readUInt32LE(centralOffset + 42);
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('zip: local header signature mismatch');
  const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
  const body = buffer.subarray(dataStart, dataStart + compressedSize);
  if (method === 0) return { name, data: Buffer.from(body) };
  if (method === 8) return { name, data: zlib.inflateRawSync(body) };
  throw new Error(`zip: unsupported compression method ${method}`);
}

/** Microsecond timestamps (spot, 2025+) become milliseconds; everything else passes through. */
export const toMillis = value => { const n = Number(value); return n > 1e14 ? Math.floor(n / 1000) : n; };

export function parseKlinesCsv(csv) {
  const bars = [];
  for (const line of String(csv).split(/\r?\n/)) {
    const cells = line.split(',');
    if (cells.length < 6 || !/^\d/.test(cells[0])) continue; // futures files carry a header row; spot files do not
    bars.push({ openTime: toMillis(cells[0]), open: Number(cells[1]), high: Number(cells[2]), low: Number(cells[3]), close: Number(cells[4]), volume: Number(cells[5]), closeTime: toMillis(cells[6]), quoteVolume: Number(cells[7]), trades: Number(cells[8]) });
  }
  return bars;
}

export function parseFundingCsv(csv) {
  const events = [];
  for (const line of String(csv).split(/\r?\n/)) {
    const cells = line.split(',');
    if (cells.length < 3 || !/^\d/.test(cells[0])) continue;
    events.push({ time: toMillis(cells[0]), intervalHours: Number(cells[1]), rate: Number(cells[2]) });
  }
  return events;
}

/**
 * Fetch one archive month, verify it against the publisher checksum, and
 * return parsed rows plus a provenance receipt. Verified raw zips are cached.
 */
export async function fetchVerifiedMonth({ market, kind, symbol, interval = '1h', month, cacheDir = null, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  const url = binanceVisionUrl({ market, kind, symbol, interval, month });
  const cachePath = cacheDir ? join(cacheDir, url.replace(`${ARCHIVE_ROOT}/`, '').replaceAll('/', '__')) : null;
  let zip = cachePath && existsSync(cachePath) ? readFileSync(cachePath) : null;
  let publisherSha256 = cachePath && existsSync(`${cachePath}.sha256`) ? readFileSync(`${cachePath}.sha256`, 'utf8').trim() : null;
  let fromCache = Boolean(zip && publisherSha256);
  if (!fromCache) {
    const [archive, checksum] = await Promise.all([url, `${url}.CHECKSUM`].map(target => fetchImpl(target, { signal: AbortSignal.timeout(30_000) })));
    if (archive.status === 404) return { ok: false, status: 'NOT_PUBLISHED', url };
    if (!archive.ok || !checksum.ok) return { ok: false, status: 'FETCH_FAILED', url, httpStatus: [archive.status, checksum.status] };
    zip = Buffer.from(await archive.arrayBuffer());
    publisherSha256 = (await checksum.text()).trim().split(/\s+/)[0].toLowerCase();
  }
  const computedSha256 = sha256(zip);
  if (!/^[a-f0-9]{64}$/.test(publisherSha256 ?? '') || computedSha256 !== publisherSha256) {
    return { ok: false, status: 'CHECKSUM_MISMATCH', url, publisherSha256, computedSha256 };
  }
  if (cachePath && !fromCache) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cachePath, zip); writeFileSync(`${cachePath}.sha256`, `${publisherSha256}\n`); }
  const { name, data } = unzipSingle(zip);
  const csv = data.toString('utf8');
  const rows = kind === 'fundingRate' ? parseFundingCsv(csv) : parseKlinesCsv(csv);
  return { ok: true, url, rows, provenance: { url, member: name, publisherSha256, computedSha256, verified: true, bytes: zip.length, rows: rows.length, fetchedAt: now().toISOString(), fromCache } };
}

export function monthsBetween(from, to) {
  const out = [];
  let [year, month] = from.split('-').map(Number);
  const [endYear, endMonth] = to.split('-').map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1; if (month > 12) { month = 1; year += 1; }
  }
  return out;
}

/** A multi-month dataset with one manifest whose digest pins every input file. */
export async function loadVerifiedSeries({ market, kind, symbol, interval = '1h', from, to, cacheDir = null, fetchImpl = globalThis.fetch }) {
  const months = monthsBetween(from, to);
  const files = [];
  let rows = [];
  for (const month of months) {
    const result = await fetchVerifiedMonth({ market, kind, symbol, interval, month, cacheDir, fetchImpl });
    if (!result.ok) return { ok: false, status: result.status, month, detail: result };
    files.push(result.provenance);
    rows = rows.concat(result.rows);
  }
  const key = kind === 'fundingRate' ? 'time' : 'openTime';
  rows.sort((a, b) => a[key] - b[key]);
  const deduped = rows.filter((row, index) => index === 0 || row[key] !== rows[index - 1][key]);
  const manifest = { version: QUANT_DATA_VAULT_VERSION, market, kind, symbol, interval: kind === 'fundingRate' ? null : interval, from, to, files: files.map(({ url, publisherSha256, rows: count }) => ({ url, publisherSha256, rows: count })) };
  return { ok: true, rows: deduped, manifest: { ...manifest, manifestSha256: sha256(Buffer.from(JSON.stringify(manifest))) } };
}
