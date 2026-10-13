import crypto from 'node:crypto';
import { Client } from 'pg';

// Test fixture helper: creates and drops throwaway databases on a server the
// caller already controls. Names are confined to one prefix, and drop refuses
// any other name, so it cannot be pointed at a real database.
export const DISPOSABLE_DATABASE_PREFIX = 'uberbond_dbc_';
const LABEL = /^[a-z0-9]{1,16}$/;

function withDatabase(adminUrl, name) {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

const quoteIdent = name => `"${String(name).replace(/"/g, '""')}"`;

export function disposableDatabaseName(label) {
  if (!LABEL.test(String(label || ''))) throw new Error('DISPOSABLE_LABEL_INVALID');
  return `${DISPOSABLE_DATABASE_PREFIX}${label}_${crypto.randomBytes(4).toString('hex')}`;
}

export async function createDisposableDatabase(adminUrl, label) {
  const name = disposableDatabaseName(label);
  const admin = new Client({ connectionString: withDatabase(adminUrl, 'postgres'), ssl: false });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quoteIdent(name)}`);
  } finally {
    await admin.end();
  }
  return { name, url: withDatabase(adminUrl, name) };
}

export async function dropDisposableDatabase(adminUrl, name) {
  if (typeof name !== 'string' || !name.startsWith(DISPOSABLE_DATABASE_PREFIX)) throw new Error('DISPOSABLE_NAME_REFUSED');
  const admin = new Client({ connectionString: withDatabase(adminUrl, 'postgres'), ssl: false });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}
