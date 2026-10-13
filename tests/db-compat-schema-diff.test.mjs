import test from 'node:test';
import assert from 'node:assert/strict';
import { diffSchemaSnapshots, schemaDigest, fullSnapshotDigest, summarizeSchemaSnapshot } from '../src/db-compat/schema-snapshot.mjs';

// Hand-built snapshots in the shape readSchemaSnapshot returns. No database.
function baseSnapshot() {
  return {
    schema: 'uberbond-schema-snapshot-1',
    schemas: ['public'],
    relations: [
      {
        schema: 'public', name: 'suppressions', kind: 'table', owner: 'owner_a', viewDefinitionDigest: null,
        columns: [
          { name: 'id', position: 1, type: 'text', notNull: true, default: null, identity: '', generated: '' },
          { name: 'value', position: 2, type: 'text', notNull: false, default: "''::text", identity: '', generated: '' }
        ]
      },
      {
        schema: 'public', name: 'suppressions_view', kind: 'view', owner: 'owner_a', viewDefinitionDigest: 'v1digest',
        columns: [{ name: 'value', position: 1, type: 'text', notNull: false, default: null, identity: '', generated: '' }]
      }
    ],
    indexes: [{ schema: 'public', table: 'suppressions', name: 'suppressions_value_idx', definition: 'CREATE INDEX suppressions_value_idx ON public.suppressions USING btree (value)' }],
    constraints: [{ schema: 'public', table: 'suppressions', name: 'suppressions_pkey', type: 'p', definition: 'PRIMARY KEY (id)' }],
    triggers: [{ schema: 'public', table: 'suppressions', name: 'trg_touch', definition: 'CREATE TRIGGER trg_touch BEFORE INSERT ON public.suppressions FOR EACH ROW EXECUTE FUNCTION touch()' }],
    sequences: [{ schema: 'public', name: 'ledger_seq', dataType: 'bigint', start: '1', min: '1', max: '9223372036854775807', increment: '1', cycle: false, cache: '1', lastValue: '10' }],
    extensions: [{ name: 'plpgsql', version: '1.0', schema: 'pg_catalog' }],
    functions: [{ schema: 'public', name: 'touch', arguments: '', definitionDigest: 'fdigest' }],
    privileges: [
      { kind: 'relation', schema: 'public', object: 'suppressions', grantee: 'OWNER', privilege: 'SELECT', grantable: false },
      { kind: 'schema', schema: 'public', object: 'public', grantee: 'PUBLIC', privilege: 'USAGE', grantable: false }
    ]
  };
}

const clone = value => structuredClone(value);
const codes = findings => findings.map(f => f.code);

test('identical snapshots have no differences and equal digests', () => {
  const a = baseSnapshot();
  const b = clone(a);
  assert.deepEqual(diffSchemaSnapshots(a, b), []);
  assert.equal(schemaDigest(a), schemaDigest(b));
  assert.equal(fullSnapshotDigest(a), fullSnapshotDigest(b));
});

test('digests do not depend on object key order', () => {
  const a = baseSnapshot();
  const reordered = Object.fromEntries(Object.entries(clone(a)).reverse());
  assert.equal(schemaDigest(a), schemaDigest(reordered));
  assert.equal(fullSnapshotDigest(a), fullSnapshotDigest(reordered));
});

test('a sequence advance and an owner rename change only the full digest', () => {
  const a = baseSnapshot();
  const b = clone(a);
  b.sequences[0].lastValue = '11';
  b.relations[0].owner = 'owner_b';
  assert.equal(schemaDigest(a), schemaDigest(b));
  assert.notEqual(fullSnapshotDigest(a), fullSnapshotDigest(b));
  assert.deepEqual(codes(diffSchemaSnapshots(a, b)).sort(), ['SEQUENCE_POSITION_CHANGED', 'TABLE_OWNER_CHANGED']);
});

test('every structural difference is reported under its stable code', () => {
  const expected = baseSnapshot();
  const actual = clone(expected);
  actual.relations.push({ schema: 'public', name: 'extra_table', kind: 'table', owner: 'owner_a', viewDefinitionDigest: null, columns: [] });
  actual.relations[0].columns.push({ name: 'probe', position: 3, type: 'text', notNull: false, default: null, identity: '', generated: '' });
  actual.relations[0].columns[1].type = 'varchar';
  actual.relations[0].columns[0].notNull = false;
  actual.relations[0].columns[1].default = null;
  actual.relations[1].viewDefinitionDigest = 'changed';
  actual.indexes[0].definition = 'CREATE INDEX other';
  actual.indexes.push({ schema: 'public', table: 'suppressions', name: 'probe_idx', definition: 'x' });
  actual.constraints = [];
  actual.triggers[0].definition = 'changed trigger';
  actual.sequences[0].increment = '2';
  actual.extensions[0].version = '1.1';
  actual.functions = [];
  actual.privileges = [
    { kind: 'relation', schema: 'public', object: 'suppressions', grantee: 'PUBLIC', privilege: 'SELECT', grantable: false },
    { kind: 'schema', schema: 'public', object: 'public', grantee: 'PUBLIC', privilege: 'USAGE', grantable: false }
  ];
  const findings = diffSchemaSnapshots(expected, actual);
  const found = new Set(codes(findings));
  for (const code of [
    'RELATION_UNEXPECTED', 'COLUMN_UNEXPECTED', 'COLUMN_TYPE_CHANGED', 'COLUMN_NULLABILITY_CHANGED',
    'COLUMN_DEFAULT_CHANGED', 'VIEW_DEFINITION_CHANGED', 'INDEX_DEFINITION_CHANGED', 'INDEX_UNEXPECTED',
    'CONSTRAINT_MISSING', 'TRIGGER_DEFINITION_CHANGED', 'SEQUENCE_PARAMETERS_CHANGED', 'EXTENSION_VERSION_CHANGED',
    'FUNCTION_MISSING', 'PRIVILEGE_MISSING', 'PRIVILEGE_UNEXPECTED'
  ]) {
    assert.ok(found.has(code), `expected ${code}`);
  }
  assert.ok(findings.every(f => typeof f.code === 'string' && f.code === f.code.toUpperCase()));
  const sorted = [...findings].sort((a, b) => (a.code === b.code ? (a.object < b.object ? -1 : a.object > b.object ? 1 : 0) : (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)));
  assert.deepEqual(findings, sorted, 'findings are sorted by code then object');
});

test('missing and unexpected objects are distinguished, and a dropped relation is reported', () => {
  const expected = baseSnapshot();
  const actual = clone(expected);
  actual.relations = actual.relations.filter(r => r.name !== 'suppressions_view');
  assert.ok(diffSchemaSnapshots(expected, actual).some(f => f.code === 'RELATION_MISSING' && f.object === 'public.suppressions_view'));
  assert.ok(diffSchemaSnapshots(actual, expected).some(f => f.code === 'RELATION_UNEXPECTED' && f.object === 'public.suppressions_view'));
});

test('column position is compared by ordinal, not by attribute number', () => {
  const a = baseSnapshot();
  const b = clone(a);
  b.relations[0].columns[1].position = 5;
  assert.ok(diffSchemaSnapshots(a, b).some(f => f.code === 'COLUMN_POSITION_CHANGED'));
});

test('a snapshot without a functions section compares as having none', () => {
  const a = baseSnapshot();
  const legacy = clone(a);
  delete legacy.functions;
  assert.deepEqual(diffSchemaSnapshots(legacy, legacy), []);
  assert.ok(diffSchemaSnapshots(a, legacy).some(f => f.code === 'FUNCTION_MISSING'));
});

test('summaries count shape and carry no definitions', () => {
  const summary = summarizeSchemaSnapshot(baseSnapshot());
  assert.deepEqual(summary, {
    relations: 2, tables: 1, views: 1, columns: 3, indexes: 1, constraints: 1, triggers: 1,
    sequences: 1, extensions: 1, functions: 1, privileges: 2
  });
  assert.ok(!JSON.stringify(summary).includes('CREATE'));
});
