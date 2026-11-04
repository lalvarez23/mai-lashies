import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

export function cloudEnvironment() {
  const values = existsSync('.env.production.local')
    ? dotenv.parse(readFileSync('.env.production.local'))
    : {};
  const env = { ...process.env, ...values };
  if (!env.DATABASE_URL) throw new Error('Configura DATABASE_URL en .env.production.local.');
  for (const value of [env.DATABASE_URL, env.DIRECT_URL].filter(Boolean)) {
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
    ) {
      throw new Error(
        'Los comandos de nube requieren una base PostgreSQL remota. La base local no se modificará.',
      );
    }
  }
  return env;
}

export function prepareCloudDatabase(env = cloudEnvironment()) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      env,
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) throw new Error('No se pudieron aplicar las migraciones de producción.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  prepareCloudDatabase();
