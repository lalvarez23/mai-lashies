import type { Store, Options, ClientRateLimitInfo } from 'express-rate-limit';
import { db } from './db';
import { digest } from './security';

/** Límite compartido por todas las instancias; no almacena direcciones IP en claro. */
export class LoginStore implements Store {
  localKeys = false;
  prefix = 'mai-login:';
  private windowMs = 15 * 60 * 1000;
  init(options: Options) {
    this.windowMs = options.windowMs;
  }
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    const rows = await db.$queryRaw<{ totalHits: number; resetTime: Date }[]>`
      INSERT INTO "LoginThrottle" ("key", "count", "resetAt") VALUES (${digest(key)}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "LoginThrottle"."resetAt" <= ${now} THEN 1 ELSE "LoginThrottle"."count" + 1 END,
        "resetAt" = CASE WHEN "LoginThrottle"."resetAt" <= ${now} THEN ${resetAt} ELSE "LoginThrottle"."resetAt" END
      RETURNING "count" AS "totalHits", "resetAt" AS "resetTime"
    `;
    return rows[0];
  }
  async decrement(key: string) {
    await db.$executeRaw`UPDATE "LoginThrottle" SET "count" = GREATEST(0, "count" - 1) WHERE "key" = ${digest(key)}`;
  }
  async resetKey(key: string) {
    await db.loginThrottle.deleteMany({ where: { key: digest(key) } });
  }
}
