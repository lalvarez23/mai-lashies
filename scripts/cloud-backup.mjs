import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cloudEnvironment } from './cloud-database.mjs';
import { createBackup } from './backup.mjs';
const env = cloudEnvironment();
await mkdir('backups', { recursive: true });
const output = resolve(
  'backups',
  `produccion-${new Date().toISOString().replaceAll(':', '-')}.json`,
);
const counts = await createBackup(env.DIRECT_URL || env.DATABASE_URL, output);
console.log(`Respaldo privado de producción creado: ${output}`);
console.log(
  `Registros conservados: ${Object.values(counts).reduce((sum, count) => sum + count, 0)}`,
);
