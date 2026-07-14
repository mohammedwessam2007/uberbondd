import { PostgresStore } from '../src/store.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const store = new PostgresStore({ databaseUrl, ssl: String(process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false' });
try {
  await store.init();
  console.log('PostgreSQL migrations applied successfully.');
} finally {
  await store.close();
}
