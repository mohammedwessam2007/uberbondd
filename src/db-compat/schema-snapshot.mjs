import { compareText, digestOf, sha256Hex } from './canonical.mjs';

export const SCHEMA_SNAPSHOT_VERSION = 'uberbond-schema-snapshot-1';

export class SchemaSnapshotError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SchemaSnapshotError';
    this.code = code;
  }
}

const RELATION_KIND = { r: 'table', p: 'partitioned_table', v: 'view', m: 'materialized_view' };
const SEQUENCE_PARAMETERS = ['dataType', 'start', 'min', 'max', 'increment', 'cycle', 'cache'];

const SQL = {
  relations: `
    SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind,
           pg_get_userbyid(c.relowner) AS owner,
           CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid, true) END AS view_definition
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p','v','m')
    ORDER BY 1, 2`,
  columns: `
    SELECT n.nspname AS schema, c.relname AS table_name, a.attname AS name,
           ROW_NUMBER() OVER (PARTITION BY c.oid ORDER BY a.attnum) AS position,
           format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
           pg_get_expr(d.adbin, d.adrelid) AS default_expr,
           a.attidentity::text AS identity, a.attgenerated::text AS generated
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p','v','m') AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY 1, 2, 4`,
  indexes: `
    SELECT n.nspname AS schema, t.relname AS table_name, i.relname AS name, pg_get_indexdef(i.oid) AS definition
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = ANY($1::text[])
    ORDER BY 1, 2, 3`,
  constraints: `
    SELECT n.nspname AS schema, c.relname AS table_name, con.conname AS name,
           con.contype::text AS type, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1::text[])
    ORDER BY 1, 2, 3`,
  triggers: `
    SELECT n.nspname AS schema, c.relname AS table_name, t.tgname AS name, pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1::text[]) AND NOT t.tgisinternal
    ORDER BY 1, 2, 3`,
  sequences: `
    SELECT schemaname AS schema, sequencename AS name, data_type::text AS data_type,
           start_value::text AS start, min_value::text AS min, max_value::text AS max,
           increment_by::text AS increment, cycle, cache_size::text AS cache, last_value::text AS last_value
    FROM pg_sequences
    WHERE schemaname = ANY($1::text[])
    ORDER BY 1, 2`,
  extensions: `
    SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    ORDER BY 1`,
  relationPrivileges: `
    SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind,
           CASE WHEN p.grantee = 0 THEN 'PUBLIC' WHEN p.grantee = c.relowner THEN 'OWNER' ELSE pg_get_userbyid(p.grantee) END AS grantee,
           p.privilege_type AS privilege, p.is_grantable AS grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) AS p
    WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p','v','m','S')
    ORDER BY 1, 2, 4, 5`,
  schemaPrivileges: `
    SELECT n.nspname AS schema,
           CASE WHEN p.grantee = 0 THEN 'PUBLIC' WHEN p.grantee = n.nspowner THEN 'OWNER' ELSE pg_get_userbyid(p.grantee) END AS grantee,
           p.privilege_type AS privilege, p.is_grantable AS grantable
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n'::"char", n.nspowner))) AS p
    WHERE n.nspname = ANY($1::text[])
    ORDER BY 1, 2, 3`,
  functions: `
    SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments,
           pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = ANY($1::text[]) AND p.prokind IN ('f','p')
    ORDER BY 1, 2, 3`
};

/**
 * Read a structural snapshot from the pg catalogs on one connection.
 * No row data is read. The caller should run this inside a READ ONLY transaction
 * so every catalog query sees the same state.
 * Owner names are recorded for diffing but excluded from schemaDigest, and
 * owner ACL entries are recorded as "OWNER", so a restore into a differently
 * named owner does not change the digest.
 */
export async function readSchemaSnapshot(client, { schemas = ['public'] } = {}) {
  if (!Array.isArray(schemas) || schemas.length === 0 || schemas.some(name => typeof name !== 'string' || name === '')) {
    throw new SchemaSnapshotError('SCHEMA_LIST_INVALID');
  }
  const params = [schemas];
  const run = async sql => (await client.query(sql, params)).rows;

  const relationRows = await run(SQL.relations);
  const columnRows = await run(SQL.columns);
  const relationByKey = new Map();
  const relations = relationRows.map(row => {
    const relation = {
      schema: row.schema,
      name: row.name,
      kind: RELATION_KIND[row.kind] || row.kind,
      owner: row.owner,
      viewDefinitionDigest: row.view_definition === null || row.view_definition === undefined ? null : sha256Hex(row.view_definition),
      columns: []
    };
    relationByKey.set(`${row.schema}.${row.name}`, relation);
    return relation;
  });
  for (const row of columnRows) {
    const relation = relationByKey.get(`${row.schema}.${row.table_name}`);
    if (!relation) continue;
    relation.columns.push({
      name: row.name,
      position: Number(row.position),
      type: row.type,
      notNull: Boolean(row.not_null),
      default: row.default_expr ?? null,
      identity: row.identity || '',
      generated: row.generated || ''
    });
  }

  const indexes = (await run(SQL.indexes)).map(row => ({ schema: row.schema, table: row.table_name, name: row.name, definition: row.definition }));
  const constraints = (await run(SQL.constraints)).map(row => ({ schema: row.schema, table: row.table_name, name: row.name, type: row.type, definition: row.definition }));
  const triggers = (await run(SQL.triggers)).map(row => ({ schema: row.schema, table: row.table_name, name: row.name, definition: row.definition }));
  const sequences = (await run(SQL.sequences)).map(row => ({
    schema: row.schema,
    name: row.name,
    dataType: row.data_type,
    start: row.start,
    min: row.min,
    max: row.max,
    increment: row.increment,
    cycle: Boolean(row.cycle),
    cache: row.cache,
    lastValue: row.last_value ?? null
  }));
  const extensions = (await client.query(SQL.extensions)).rows.map(row => ({ name: row.name, version: row.version, schema: row.schema }));
  const functions = (await run(SQL.functions)).map(row => ({
    schema: row.schema,
    name: row.name,
    arguments: row.arguments,
    definitionDigest: sha256Hex(row.definition)
  }));
  const privileges = [
    ...(await run(SQL.relationPrivileges)).map(row => ({ kind: 'relation', schema: row.schema, object: row.name, grantee: row.grantee, privilege: row.privilege, grantable: Boolean(row.grantable) })),
    ...(await run(SQL.schemaPrivileges)).map(row => ({ kind: 'schema', schema: row.schema, object: row.schema, grantee: row.grantee, privilege: row.privilege, grantable: Boolean(row.grantable) }))
  ];

  return {
    schema: SCHEMA_SNAPSHOT_VERSION,
    schemas: [...schemas].sort(),
    relations,
    indexes,
    constraints,
    triggers,
    sequences,
    extensions,
    functions,
    privileges: privileges.sort(privilegeSort)
  };
}

function privilegeSort(a, b) {
  return compareText(privilegeKey(a), privilegeKey(b));
}

function privilegeKey(p) {
  return [p.kind, p.schema, p.object, p.grantee, p.privilege, p.grantable ? 1 : 0].join('|');
}

/** Counts only: the shape of the snapshot without any definitions. */
export function summarizeSchemaSnapshot(snapshot) {
  const columns = snapshot.relations.reduce((total, relation) => total + relation.columns.length, 0);
  return {
    relations: snapshot.relations.length,
    tables: snapshot.relations.filter(r => r.kind === 'table' || r.kind === 'partitioned_table').length,
    views: snapshot.relations.filter(r => r.kind === 'view' || r.kind === 'materialized_view').length,
    columns,
    indexes: snapshot.indexes.length,
    constraints: snapshot.constraints.length,
    triggers: snapshot.triggers.length,
    sequences: snapshot.sequences.length,
    extensions: snapshot.extensions.length,
    functions: (snapshot.functions || []).length,
    privileges: snapshot.privileges.length
  };
}

// The structural view used for schemaDigest: no owner names, no sequence position.
function structuralView(snapshot) {
  return {
    schemas: snapshot.schemas,
    relations: snapshot.relations.map(r => ({ schema: r.schema, name: r.name, kind: r.kind, viewDefinitionDigest: r.viewDefinitionDigest, columns: r.columns })),
    indexes: snapshot.indexes,
    constraints: snapshot.constraints,
    triggers: snapshot.triggers,
    sequences: snapshot.sequences.map(({ lastValue, ...rest }) => rest),
    extensions: snapshot.extensions,
    functions: snapshot.functions,
    privileges: snapshot.privileges
  };
}

/** Digest of structure only. Unchanged by row writes and by sequence advances. */
export function schemaDigest(snapshot) {
  return digestOf(structuralView(snapshot));
}

/** Digest of everything in the snapshot, including owners and sequence positions. */
export function fullSnapshotDigest(snapshot) {
  return digestOf(snapshot);
}

const key = (...parts) => parts.join('.');

function diffKeyed(findings, expectedList, actualList, keyOf, codes, compare) {
  const expected = new Map(expectedList.map(item => [keyOf(item), item]));
  const actual = new Map(actualList.map(item => [keyOf(item), item]));
  for (const [id, item] of expected) {
    if (!actual.has(id)) findings.push({ code: codes.missing, object: id });
    else if (compare) compare(findings, id, item, actual.get(id));
  }
  for (const id of actual.keys()) {
    if (!expected.has(id)) findings.push({ code: codes.unexpected, object: id });
  }
}

/**
 * Every difference between two snapshots, sorted by code then object.
 * Pure: no database access. `expected` is the reference (for example the source
 * before a dump) and `actual` is the copy being checked.
 */
export function diffSchemaSnapshots(expected, actual) {
  const findings = [];
  const changed = (code, object, a, b) => {
    if (a !== b) findings.push({ code, object, expected: a ?? null, actual: b ?? null });
  };

  diffKeyed(findings, expected.relations, actual.relations, r => key(r.schema, r.name), { missing: 'RELATION_MISSING', unexpected: 'RELATION_UNEXPECTED' }, (out, id, a, b) => {
    if (a.kind !== b.kind) out.push({ code: 'RELATION_KIND_CHANGED', object: id, expected: a.kind, actual: b.kind });
    if (a.owner !== b.owner) out.push({ code: 'TABLE_OWNER_CHANGED', object: id, expected: a.owner, actual: b.owner });
    if (a.viewDefinitionDigest !== b.viewDefinitionDigest) out.push({ code: 'VIEW_DEFINITION_CHANGED', object: id });
    diffKeyed(out, a.columns, b.columns, c => `${id}.${c.name}`, { missing: 'COLUMN_MISSING', unexpected: 'COLUMN_UNEXPECTED' }, (inner, object, ca, cb) => {
      changed('COLUMN_TYPE_CHANGED', object, ca.type, cb.type);
      changed('COLUMN_NULLABILITY_CHANGED', object, ca.notNull, cb.notNull);
      changed('COLUMN_DEFAULT_CHANGED', object, ca.default, cb.default);
      if (ca.identity !== cb.identity || ca.generated !== cb.generated) inner.push({ code: 'COLUMN_IDENTITY_CHANGED', object });
      changed('COLUMN_POSITION_CHANGED', object, ca.position, cb.position);
    });
  });

  diffKeyed(findings, expected.indexes, actual.indexes, i => key(i.schema, i.name), { missing: 'INDEX_MISSING', unexpected: 'INDEX_UNEXPECTED' }, (out, id, a, b) => {
    if (a.definition !== b.definition) out.push({ code: 'INDEX_DEFINITION_CHANGED', object: id });
  });
  diffKeyed(findings, expected.constraints, actual.constraints, c => key(c.schema, c.table, c.name), { missing: 'CONSTRAINT_MISSING', unexpected: 'CONSTRAINT_UNEXPECTED' }, (out, id, a, b) => {
    if (a.definition !== b.definition || a.type !== b.type) out.push({ code: 'CONSTRAINT_DEFINITION_CHANGED', object: id });
  });
  diffKeyed(findings, expected.triggers, actual.triggers, t => key(t.schema, t.table, t.name), { missing: 'TRIGGER_MISSING', unexpected: 'TRIGGER_UNEXPECTED' }, (out, id, a, b) => {
    if (a.definition !== b.definition) out.push({ code: 'TRIGGER_DEFINITION_CHANGED', object: id });
  });
  diffKeyed(findings, expected.sequences, actual.sequences, s => key(s.schema, s.name), { missing: 'SEQUENCE_MISSING', unexpected: 'SEQUENCE_UNEXPECTED' }, (out, id, a, b) => {
    if (SEQUENCE_PARAMETERS.some(field => a[field] !== b[field])) out.push({ code: 'SEQUENCE_PARAMETERS_CHANGED', object: id });
    if (a.lastValue !== b.lastValue) out.push({ code: 'SEQUENCE_POSITION_CHANGED', object: id, expected: a.lastValue, actual: b.lastValue });
  });
  diffKeyed(findings, expected.extensions, actual.extensions, e => e.name, { missing: 'EXTENSION_MISSING', unexpected: 'EXTENSION_UNEXPECTED' }, (out, id, a, b) => {
    if (a.version !== b.version) out.push({ code: 'EXTENSION_VERSION_CHANGED', object: id, expected: a.version, actual: b.version });
    if (a.schema !== b.schema) out.push({ code: 'EXTENSION_SCHEMA_CHANGED', object: id, expected: a.schema, actual: b.schema });
  });
  diffKeyed(findings, expected.functions || [], actual.functions || [], f => key(f.schema, f.name, f.arguments), { missing: 'FUNCTION_MISSING', unexpected: 'FUNCTION_UNEXPECTED' }, (out, id, a, b) => {
    if (a.definitionDigest !== b.definitionDigest) out.push({ code: 'FUNCTION_DEFINITION_CHANGED', object: id });
  });
  diffKeyed(findings, expected.privileges, actual.privileges, privilegeKey, { missing: 'PRIVILEGE_MISSING', unexpected: 'PRIVILEGE_UNEXPECTED' }, null);

  return findings.sort((a, b) => (a.code === b.code ? compareText(a.object, b.object) : compareText(a.code, b.code)));
}
