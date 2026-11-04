import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { startDatabase } from './database.mjs';
export const tables = [
  'User',
  'Product',
  'Sale',
  'SaleItem',
  'Payment',
  'StockMovement',
  'Expense',
  'Audit',
];
export async function createBackup(connectionString, output) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const data = {};
    // PostgreSQL produce JSON directamente para conservar la precisión de NUMERIC.
    for (const table of tables) {
      const result = await client.query(`SELECT row_to_json(t)::text AS row FROM "${table}" t`);
      data[table] = result.rows.map((item) => item.row);
    }
    await client.query('COMMIT');
    await writeFile(
      output,
      JSON.stringify(
        { format: 'mai-lashies-v1', createdAt: new Date().toISOString(), tables: data },
        null,
        2,
      ),
      { flag: 'wx' },
    );
    return Object.fromEntries(tables.map((table) => [table, data[table].length]));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cluster = await startDatabase();
  try {
    await mkdir('backups', { recursive: true });
    const output = resolve(
      'backups',
      `mai-lashies-${new Date().toISOString().replaceAll(':', '-')}.json`,
    );
    const counts = await createBackup(process.env.DATABASE_URL, output);
    console.log(
      `Respaldo creado: ${output}\nRegistros: ${Object.values(counts).reduce((sum, value) => sum + value, 0)}. Contiene datos privados; guárdalo en un lugar protegido.`,
    );
  } finally {
    if (cluster) await cluster.stop();
  }
}
