import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { tables } from './backup.mjs';
import { startDatabase } from './database.mjs';
export async function restoreBackup(connectionString, input, databaseName) {
  if (!/^mai_lashies_(restore|test)_[a-z0-9_]+$/.test(databaseName))
    throw new Error('El destino debe ser una base nueva con prefijo mai_lashies_restore_.');
  const source = JSON.parse(await readFile(input, 'utf8'));
  if (
    source.format !== 'mai-lashies-v1' ||
    !source.tables ||
    tables.some(
      (table) =>
        !Array.isArray(source.tables[table]) ||
        source.tables[table].some((row) => typeof row !== 'string'),
    )
  )
    throw new Error('El respaldo no tiene un formato compatible.');
  const root = new pg.Client({ connectionString });
  await root.connect();
  try {
    await root.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await root.end();
  }
  const url = new URL(connectionString);
  url.pathname = '/' + databaseName;
  const migration = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env: { ...process.env, DATABASE_URL: url.toString() }, encoding: 'utf8' },
  );
  if (migration.status !== 0)
    throw new Error(`No se pudo preparar la base nueva: ${migration.stderr}`);
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const table of tables)
      for (const row of source.tables[table])
        await client.query(
          `INSERT INTO "${table}" SELECT * FROM json_populate_record(NULL::"${table}", $1::json)`,
          [row],
        );
    await client.query(
      `SELECT setval(pg_get_serial_sequence('"Sale"', 'number'), COALESCE((SELECT MAX(number) FROM "Sale"), 1), EXISTS(SELECT 1 FROM "Sale"))`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
  return url.toString();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, databaseName] = process.argv.slice(2);
  if (!input || !databaseName)
    throw new Error('Uso: npm run restore -- ruta/al/respaldo.json mai_lashies_restore_20261104');
  const cluster = await startDatabase();
  try {
    await restoreBackup(process.env.DATABASE_URL, input, databaseName);
    console.log(
      `Restauración completa en ${databaseName}. La base original no se modificó. Para usarla, cambia solo el nombre de base en DATABASE_URL del .env y reinicia.`,
    );
  } finally {
    if (cluster) await cluster.stop();
  }
}
