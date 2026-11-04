import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins } from '../server/origins';

test('Producción reconoce solo orígenes explícitos y dominios exactos de Vercel', () => {
  const origins = allowedOrigins({
    NODE_ENV: 'production',
    APP_ORIGIN: ' https://mai.example.com/ , https://otro.example.com ',
    VERCEL_URL: 'mai-build.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'mai-lashies.vercel.app',
  });
  assert.equal(origins.has('https://mai.example.com'), true);
  assert.equal(origins.has('https://mai-build.vercel.app'), true);
  assert.equal(origins.has('https://mai-lashies.vercel.app'), true);
  assert.equal(origins.has('http://127.0.0.1:5173'), false);
  assert.equal(origins.has('https://ajeno.vercel.app'), false);
});
test('Producción no usa localhost como origen implícito y rechaza HTTP', () => {
  assert.throws(() => allowedOrigins({ NODE_ENV: 'production' }), /APP_ORIGIN/);
  assert.throws(
    () => allowedOrigins({ NODE_ENV: 'production', APP_ORIGIN: 'http://mai.example.com' }),
    /HTTPS/,
  );
  assert.throws(
    () => allowedOrigins({ NODE_ENV: 'production', VERCEL_URL: 'sitio.vercel.app.evil.example' }),
    /APP_ORIGIN/,
  );
  assert.equal(allowedOrigins({}).has('http://127.0.0.1:5173'), true);
});
