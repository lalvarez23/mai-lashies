import { spawnSync } from 'node:child_process';

process.env.VITE_APP_HOSTED = 'true';

if (!process.env.DATABASE_URL)
  throw new Error('Configura DATABASE_URL en el entorno de Vercel antes de compilar.');
const database = new URL(process.env.DATABASE_URL);
if (process.env.VERCEL && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(database.hostname)) {
  throw new Error('Vercel necesita una base PostgreSQL accesible en la nube.');
}
const run = (args) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) throw new Error('No se pudo completar la compilación.');
};
run(['node_modules/prisma/build/index.js', 'generate']);
run(['node_modules/typescript/bin/tsc', '--noEmit']);
run(['node_modules/typescript/bin/tsc', '--project', 'tsconfig.server.json']);
run(['node_modules/vite/bin/vite.js', 'build']);
// Las migraciones se aplican de forma explícita antes de promover una nueva versión.
