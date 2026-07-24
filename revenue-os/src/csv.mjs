// CSV parsing plus a formula-injection guard -- deliberately not reusing ../../src/csv.mjs, which
// has no such guard at all (confirmed in docs/REUSE_VS_REPLACE_DECISION.md). Same technique used
// across this session's other missions: prefix any formula-leading cell with an apostrophe.
export function parseCsv(text = '') {
  const rows = []; let row = []; let field = ''; let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (quoted) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter(r => r.some(x => String(x).trim()));
  if (!clean.length) return [];
  const headers = clean[0].map(h => String(h).trim());
  return clean.slice(1).map((r, idx) => ({ ...Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()])), __row: idx + 2 }));
}

export function csvEscape(value) {
  const raw = String(value ?? '');
  const s = /^(?:[\t\r]|\s*[=+@-])/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** JSONL parsing with per-line error isolation -- one malformed line quarantines itself (with the
 * line number and the parse error) rather than failing the whole import. */
export function parseJsonl(text = '') {
  const lines = String(text).split('\n');
  const rows = []; const problems = [];
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try { rows.push({ value: JSON.parse(trimmed), lineNumber: idx + 1 }); }
    catch (error) { problems.push({ lineNumber: idx + 1, code: 'jsonl-parse-error', detail: error.message }); }
  });
  return { rows, problems };
}
