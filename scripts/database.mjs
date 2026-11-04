import 'dotenv/config';
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export async function startDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('Falta .env. Ejecuta npm run setup.');
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1')
    throw new Error('El arranque automático solo administra PostgreSQL en 127.0.0.1.');
  const probe = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 1200,
  });
  try {
    await probe.connect();
    await probe.end();
    return null;
  } catch {
    await probe.end().catch(() => {});
  }
  const databaseDir = resolve('.local/postgres');
  const cluster = new EmbeddedPostgres({
    databaseDir,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    port: Number(process.env.PG_PORT),
    persistent: true,
    authMethod: 'scram-sha-256',
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1'],
    onLog: () => {},
    onError: (message) => {
      if (/FATAL|ERROR/.test(String(message))) console.error(String(message));
    },
  });
  if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) await cluster.initialise();
  await cluster.start();
  const client = cluster.getPgClient();
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', ['mai_lashies']);
    if (!found.rowCount) await client.query('CREATE DATABASE mai_lashies');
  } finally {
    await client.end();
  }
  console.log('PostgreSQL local listo en 127.0.0.1:' + process.env.PG_PORT);
  return cluster;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cluster = await startDatabase();
  if (!cluster) {
    console.log('PostgreSQL ya está funcionando.');
    process.exit(0);
  }
  const stop = async () => {
    await cluster.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => {}, 60_000);
}
