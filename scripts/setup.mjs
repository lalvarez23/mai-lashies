import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
mkdirSync('.local', { recursive: true });
if (!existsSync('.env')) {
  const dbPassword = randomBytes(24).toString('hex');
  const adminPassword = randomBytes(12).toString('base64url');
  writeFileSync(
    '.env',
    `DATABASE_URL=postgresql://mai:${dbPassword}@127.0.0.1:54329/mai_lashies\nPG_USER=mai\nPG_PASSWORD=${dbPassword}\nPG_PORT=54329\nPORT=3001\nAPP_ORIGIN=http://127.0.0.1:5173\nADMIN_EMAIL=admin@mailashies.local\nADMIN_PASSWORD=${adminPassword}\nNODE_ENV=development\n`,
  );
}
dotenv.config({ quiet: true });
writeFileSync(
  '.local/ACCESO.txt',
  `Mai Lashies — acceso inicial local\nCorreo: ${process.env.ADMIN_EMAIL}\nContraseña inicial: ${process.env.ADMIN_PASSWORD}\n\nCambia la contraseña en Configuración después de entrar. Este archivo y .env contienen secretos; no compartirlos ni subirlos a Git.\n`,
);
const { startDatabase } = await import('./database.mjs');
const cluster = await startDatabase();
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) throw new Error(`Falló ${args.join(' ')}`);
}
try {
  run(['node_modules/prisma/build/index.js', 'generate']);
  run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  run(['node_modules/tsx/dist/cli.mjs', 'server/seed.ts']);
  console.log('\nInstalación lista. Acceso inicial en .local/ACCESO.txt. Ejecuta npm run dev.');
} finally {
  if (cluster) await cluster.stop();
}
