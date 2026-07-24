// Archive-safety checks for ZIP research-pack imports, following the same entry-metadata-only
// approach used across this session's other missions (no ZIP-parsing dependency in this repo, so
// this operates on caller-supplied entry name/size metadata, which every real ZIP reader exposes
// from the central directory without inflating anything).
const DEFAULT_MAX_ENTRIES = 5000;
const DEFAULT_MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const DEFAULT_MAX_COMPRESSION_RATIO = 200;

export function validateArchiveSafety(entries = [], options = {}) {
  const maxEntries = Number(options.maxEntries || DEFAULT_MAX_ENTRIES);
  const maxEntryBytes = Number(options.maxEntryBytes || DEFAULT_MAX_ENTRY_BYTES);
  const maxTotalBytes = Number(options.maxTotalBytes || DEFAULT_MAX_TOTAL_BYTES);
  const maxRatio = Number(options.maxCompressionRatio || DEFAULT_MAX_COMPRESSION_RATIO);
  const problems = [];

  if (entries.length > maxEntries) problems.push({ code: 'archive-too-many-entries', detail: `${entries.length} entries exceeds the ${maxEntries} limit` });

  let totalBytes = 0;
  for (const entry of entries) {
    const nameValue = String(entry.name || '');
    if (!nameValue) { problems.push({ code: 'archive-entry-name-missing', detail: '' }); continue; }
    if (nameValue.startsWith('/') || nameValue.startsWith('\\')) problems.push({ code: 'archive-path-traversal', detail: `${nameValue}: absolute path` });
    if (nameValue.split(/[\\/]/).some(part => part === '..')) problems.push({ code: 'archive-path-traversal', detail: `${nameValue}: contains ..` });
    if (/^[a-zA-Z]:/.test(nameValue)) problems.push({ code: 'archive-path-traversal', detail: `${nameValue}: drive-letter absolute path` });
    if (nameValue.includes('\0')) problems.push({ code: 'archive-path-traversal', detail: `${nameValue}: embedded null byte` });
    // Symlink traversal: a real ZIP central-directory entry can carry a unix mode in its external
    // attributes; a symlink entry (mode & 0o170000 === 0o120000, i.e. external attrs high 16 bits'
    // top 4 bits are 0xA) pointing outside the extraction root is a distinct traversal vector from
    // a plain path -- flagged here from the same caller-supplied metadata, never followed.
    if (entry.isSymlink || (Number(entry.externalAttributes || 0) >>> 16 & 0xf000) === 0xa000) {
      problems.push({ code: 'archive-symlink-entry', detail: `${nameValue}: symlink entries are refused outright` });
    }

    const uncompressedSize = Number(entry.uncompressedSize || 0);
    const compressedSize = Number(entry.compressedSize || 0);
    if (uncompressedSize > maxEntryBytes) problems.push({ code: 'archive-entry-too-large', detail: `${nameValue}: ${uncompressedSize} bytes` });
    if (compressedSize > 0 && uncompressedSize / compressedSize > maxRatio) {
      problems.push({ code: 'archive-suspicious-compression-ratio', detail: `${nameValue}: ratio ${(uncompressedSize / compressedSize).toFixed(1)}` });
    }
    totalBytes += uncompressedSize;
  }
  if (totalBytes > maxTotalBytes) problems.push({ code: 'archive-total-size-exceeded', detail: `${totalBytes} bytes` });

  return { safe: problems.length === 0, problems };
}
