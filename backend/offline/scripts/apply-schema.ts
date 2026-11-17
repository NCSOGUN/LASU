import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Supply the admin URL for this explicit command only, not the running service.
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL to an administrator connection for db:apply');
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const sql = await readFile(new URL('../../database_structure.sql', import.meta.url), 'utf8');
  await client.query(sql);
  console.info('Shared HealthAccess schema applied. Use a restricted telecom login at runtime.');
} finally {
  await client.end();
}
