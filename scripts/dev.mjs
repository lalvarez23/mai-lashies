import 'dotenv/config';
import { spawn } from 'node:child_process';
import { startDatabase } from './database.mjs';
import { createBackup } from './backup.mjs';
import { existsSync, mkdirSync } from 'node:fs';
const cluster = await startDatabase();
const children = [];
let stopping = false;
let backingUp = false;
async function dailyBackup() {
  if (backingUp || stopping) return;
  const day = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const output = `backups/mai-lashies-auto-${day}.json`;
  if (existsSync(output)) return;
  backingUp = true;
  try {
    mkdirSync('backups', { recursive: true });
    await createBackup(process.env.DATABASE_URL, output);
    console.log(`Respaldo diario listo: ${output}`);
  } catch (error) {
    console.error('No se pudo crear el respaldo diario:', error.message);
  } finally {
    backingUp = false;
  }
}
await dailyBackup();
const backupTimer = setInterval(() => void dailyBackup(), 60 * 60 * 1000);
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(backupTimer);
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((resolve) => {
            child.once('exit', resolve);
            setTimeout(resolve, 3000);
          }),
    ),
  );
  if (cluster) await cluster.stop();
  process.exit(code);
}
for (const args of [
  ['--import', 'tsx', 'server/index.ts'],
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'],
]) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('exit', (code) => {
    if (!stopping) void stop(code ?? 1);
  });
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
