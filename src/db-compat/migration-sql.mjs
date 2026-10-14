// PostgreSQL migration text -> top-level statements, plus the transaction and
// ledger facts the runner needs. Comments, quoted literals, quoted identifiers
// and dollar-quoted bodies are masked before any keyword decision, so a
// semicolon or a keyword inside them never splits or classifies a statement.

export class MigrationError extends Error {
  constructor(code, details = {}) {
    // The message is the fixed code only. PostgreSQL error text can echo row
    // values, so it is kept out of messages and out of receipts.
    super(code);
    this.name = 'MigrationError';
    this.code = code;
    if (details.version !== undefined) this.version = details.version;
    if (details.sqlstate !== undefined) this.sqlstate = details.sqlstate;
  }
}

const IDENT_CHAR = /[A-Za-z0-9_$]/;
const DOLLAR_TAG = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y;

function blank(chunk) {
  return chunk.replace(/[^\n]/g, ' ');
}

export function splitSqlStatements(sql) {
  const source = String(sql);
  const n = source.length;
  const statements = [];
  let raw = '';
  let masked = '';
  let i = 0;
  const flush = () => {
    if (masked.trim()) statements.push({ text: raw.trim(), code: masked });
    raw = '';
    masked = '';
  };
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '-' && next === '-') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = n;
      const chunk = source.slice(i, end);
      raw += chunk;
      masked += blank(chunk);
      i = end;
      continue;
    }
    if (ch === '/' && next === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (source[j] === '/' && source[j + 1] === '*') { depth += 1; j += 2; }
        else if (source[j] === '*' && source[j + 1] === '/') { depth -= 1; j += 2; }
        else j += 1;
      }
      const end = Math.min(j, n);
      const chunk = source.slice(i, end);
      raw += chunk;
      masked += blank(chunk);
      i = end;
      continue;
    }
    if (ch === "'" || ch === '"') {
      // E'...' strings honour backslash escapes; standard strings do not.
      const backslashEscapes = ch === "'" && /[eE]/.test(source[i - 1] || '') && !IDENT_CHAR.test(source[i - 2] || '');
      let j = i + 1;
      while (j < n) {
        if (backslashEscapes && source[j] === '\\') { j += 2; continue; }
        if (source[j] === ch) {
          if (source[j + 1] === ch) { j += 2; continue; }
          j += 1;
          break;
        }
        j += 1;
      }
      const end = Math.min(j, n);
      const chunk = source.slice(i, end);
      raw += chunk;
      masked += blank(chunk);
      i = end;
      continue;
    }
    if (ch === '$') {
      DOLLAR_TAG.lastIndex = i;
      const match = DOLLAR_TAG.exec(source);
      if (match && (i === 0 || !IDENT_CHAR.test(source[i - 1]))) {
        const tag = match[0];
        const close = source.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        const chunk = source.slice(i, end);
        raw += chunk;
        masked += blank(chunk);
        i = end;
        continue;
      }
    }
    if (ch === ';') {
      flush();
      i += 1;
      continue;
    }
    raw += ch;
    masked += ch;
    i += 1;
  }
  flush();
  return statements;
}

const TX_BEGIN = /^(BEGIN|START\s+TRANSACTION)\b/;
const TX_END = /^(COMMIT|END)\b/;
const TX_OTHER = /^(ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION|COMMIT\s+PREPARED|ROLLBACK\s+PREPARED|SET\s+TRANSACTION|SET\s+SESSION\s+CHARACTERISTICS)\b/;
const NON_TRANSACTIONAL = [
  /\bCONCURRENTLY\b/,
  /^VACUUM\b/,
  /^CREATE\s+DATABASE\b/,
  /^DROP\s+DATABASE\b/,
  /^ALTER\s+SYSTEM\b/,
  /^CREATE\s+TABLESPACE\b/,
  /^DROP\s+TABLESPACE\b/
];
const LEDGER_INSERT = /\bINSERT\s+INTO\s+schema_migrations\b/;

/**
 * Classify one migration file without executing it.
 * - transactionShape: WRAPPED (leading BEGIN and trailing COMMIT, stripped by the
 *   runner), NONE (no transaction control), or REFUSED.
 * - reasonCodes: fixed refusal codes; empty when the file can run in one transaction.
 * - selfRecorded: the file itself inserts into schema_migrations.
 * - recordedVersions: the version literals of those inserts, sorted and unique.
 */
export function analyzeMigrationSql(sql) {
  const statements = splitSqlStatements(sql).map(statement => ({
    ...statement,
    head: statement.code.trim().replace(/\s+/g, ' ').toUpperCase()
  }));
  const reasonCodes = new Set();
  const last = statements.length - 1;
  let hasBegin = false;
  let hasCommit = false;
  statements.forEach((statement, index) => {
    if (TX_BEGIN.test(statement.head)) {
      if (index === 0) hasBegin = true;
      else reasonCodes.add('EMBEDDED_TRANSACTION_CONTROL_UNSUPPORTED');
    } else if (TX_END.test(statement.head)) {
      if (index === last && last > 0) hasCommit = true;
      else reasonCodes.add('EMBEDDED_TRANSACTION_CONTROL_UNSUPPORTED');
    } else if (TX_OTHER.test(statement.head)) {
      reasonCodes.add('EMBEDDED_TRANSACTION_CONTROL_UNSUPPORTED');
    }
    if (NON_TRANSACTIONAL.some(pattern => pattern.test(statement.head))) {
      reasonCodes.add('NON_TRANSACTIONAL_STATEMENT');
    }
  });
  if (hasBegin !== hasCommit) reasonCodes.add('EMBEDDED_TRANSACTION_CONTROL_UNSUPPORTED');
  const selfRecorded = LEDGER_INSERT.test(statements.map(statement => statement.code).join(';'));
  // Versions this file writes to schema_migrations. Only executable ledger inserts count, and comments are removed first.
  const recordedVersions = [...new Set(statements
    .filter(statement => LEDGER_INSERT.test(statement.code))
    .flatMap(statement => quotedLiterals(statement.text)))].sort();
  const transactionShape = reasonCodes.size > 0 ? 'REFUSED' : (hasBegin && hasCommit ? 'WRAPPED' : 'NONE');
  const bodyStatements = statements
    .filter((_, index) => !(hasBegin && index === 0) && !(hasCommit && index === last))
    .map(statement => statement.text);
  return {
    statementCount: statements.length,
    transactionShape,
    selfRecorded,
    recordedVersions,
    reasonCodes: [...reasonCodes].sort(),
    bodyStatements
  };
}

function quotedLiterals(text) {
  const withoutComments = String(text).replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  return [...withoutComments.matchAll(/'([^']*)'/g)].map(match => match[1]);
}

/** Statements to run inside the runner's own BEGIN/COMMIT, or a MigrationError on refusal. */
export function prepareMigrationStatements(sql) {
  const analysis = analyzeMigrationSql(sql);
  if (analysis.reasonCodes.length > 0) throw new MigrationError(analysis.reasonCodes[0]);
  return analysis;
}
