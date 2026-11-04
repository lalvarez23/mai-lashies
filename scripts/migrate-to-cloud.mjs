import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { createBackup } from './backup.mjs';
import { cloudEnvironment, prepareCloudDatabase } from './cloud-database.mjs';
import { assertEmptyDatabase, importSnapshot } from './import-snapshot.mjs';

const local = dotenv.parse(readFileSync('.env'));
if (
  !local.DATABASE_URL ||
  !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(local.DATABASE_URL).hostname)
)
  throw new Error('El origen debe ser la base local de .env.');
const env = cloudEnvironment();
const destination = env.DIRECT_URL || env.DATABASE_URL;
const check = new pg.Client({ connectionString: destination, connectionTimeoutMillis: 15000 });
await check.connect();
try {
  await assertEmptyDatabase(check, { allowMissingTables: true });
} finally {
  await check.end();
}

await mkdir('backups', { recursive: true });
const output = resolve(
  'backups',
  `antes-de-vercel-${new Date().toISOString().replaceAll(':', '-')}.json`,
);
await createBackup(local.DATABASE_URL, output);
console.log(`Respaldo privado previo a migración: ${output}`);
prepareCloudDatabase(env);
const counts = await importSnapshot(destination, output);
console.log('Migración verificada por cantidad y huella de todos los registros:');
for (const [table, count] of Object.entries(counts)) console.log(`${table}: ${count}`);
console.log(
  'Usuarios y contraseñas conservados. Inicia sesión nuevamente en la versión publicada.',
);
