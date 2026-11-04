import 'dotenv/config';
import { spawn } from 'node:child_process';
import { startDatabase } from './database.mjs';
const cluster = await startDatabase();
try {
  const child = spawn(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      '--test',
      '--test-concurrency=1',
      'tests/integration.test.ts',
      'tests/deployment.test.ts',
    ],
    { stdio: 'inherit', env: process.env },
  );
  const code = await new Promise((resolve) => child.once('exit', resolve));
  process.exitCode = Number(code ?? 1);
} finally {
  if (cluster) await cluster.stop();
}
