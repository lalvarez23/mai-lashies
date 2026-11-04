import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { tables } from './backup.mjs';

export async function assertEmptyDatabase(client, { allowMissingTables = false } = {}) {
  const knownTables = new Set([...tables, '_prisma_migrations', 'Session', 'LoginThrottle']);
  const existing = (
    await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")
  ).rows.map((row) => row.tablename);
  if (existing.some((table) => !knownTables.has(table)))
    throw new Error('La base de destino contiene tablas ajenas al proyecto. Usa una base nueva.');
  for (const table of [...tables, 'Session', 'LoginThrottle']) {
    if (!existing.includes(table)) {
      if (allowMissingTables) continue;
      throw new Error(`Falta la tabla ${table}. Aplica las migraciones primero.`);
    }
    const rows = await client.query(`SELECT EXISTS (SELECT 1 FROM "${table}") AS populated`);
    if (rows.rows[0].populated)
      throw new Error(
        'La base de destino ya contiene registros. La importación no sobrescribe ni duplica datos.',
      );
  }
}

const checksum = (rows) =>
  createHash('sha256')
    .update([...rows].sort().join('\n'))
    .digest('hex');

export async function importSnapshot(connectionString, input) {
  const source = JSON.parse(await readFile(input, 'utf8'));
  if (
    source.format !== 'mai-lashies-v1' ||
    !source.tables ||
    tables.some(
      (table) =>
        !Array.isArray(source.tables[table]) ||
        source.tables[table].some((row) => typeof row !== 'string'),
    )
  ) {
    throw new Error('Formato de respaldo incompatible.');
  }
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query(
      `LOCK TABLE ${[...tables, 'Session', 'LoginThrottle'].map((table) => `"${table}"`).join(', ')} IN ACCESS EXCLUSIVE MODE`,
    );
    await assertEmptyDatabase(client);
    const counts = {};
    for (const table of tables) {
      for (const row of source.tables[table]) {
        await client.query(
          `INSERT INTO "${table}" SELECT * FROM json_populate_record(NULL::"${table}", $1::json)`,
          [row],
        );
      }
      const restored = await client.query(`SELECT row_to_json(t)::text AS row FROM "${table}" t`);
      const rows = restored.rows.map((item) => item.row);
      if (
        rows.length !== source.tables[table].length ||
        checksum(rows) !== checksum(source.tables[table])
      )
        throw new Error(
          `No coincidió la verificación de ${table}. Se revierte toda la importación.`,
        );
      counts[table] = rows.length;
    }
    await client.query(
      `SELECT setval(pg_get_serial_sequence('"Sale"', 'number'), COALESCE((SELECT MAX(number) FROM "Sale"), 1), EXISTS(SELECT 1 FROM "Sale"))`,
    );
    await client.query('COMMIT');
    return counts;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
