import { app } from './app.js';
import { db } from './db.js';
const port = Number(process.env.PORT ?? 3001);
await db.$connect();
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`API Mai Lashies: http://127.0.0.1:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    }),
  );
