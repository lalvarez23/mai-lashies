export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const origins = new Set<string>();
  for (const value of (env.APP_ORIGIN ?? '').split(',')) {
    if (!value.trim()) continue;
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error('APP_ORIGIN debe ser HTTP o HTTPS.');
    if (env.NODE_ENV === 'production' && url.protocol !== 'https:')
      throw new Error('APP_ORIGIN debe usar HTTPS en producción.');
    origins.add(url.origin);
  }
  // Solo dominios suministrados por Vercel, nunca valores del encabezado Host.
  for (const key of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const host = env[key];
    if (host && /^[a-z0-9.-]+\.vercel\.app$/i.test(host)) origins.add(`https://${host}`);
  }
  if (!origins.size && env.NODE_ENV !== 'production') origins.add('http://127.0.0.1:5173');
  if (!origins.size) throw new Error('Configura APP_ORIGIN con la URL HTTPS de producción.');
  return origins;
}
