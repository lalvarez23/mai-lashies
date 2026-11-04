import 'dotenv/config';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';
import { createBackup } from '../scripts/backup.mjs';
import { restoreBackup } from '../scripts/restore.mjs';
import { importSnapshot } from '../scripts/import-snapshot.mjs';

const originalUrl = process.env.DATABASE_URL!;
const testName = `mai_lashies_test_${randomUUID().replaceAll('-', '')}`;
const restoredName = testName + '_restored';
const root = new pg.Client({ connectionString: originalUrl });
await root.connect();
await root.query(`CREATE DATABASE "${testName}"`);
const testUrl = new URL(originalUrl);
testUrl.pathname = '/' + testName;
process.env.DATABASE_URL = testUrl.toString();
const migration = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  { env: process.env, encoding: 'utf8' },
);
assert.equal(migration.status, 0, migration.stderr);
const { db } = await import('../server/db');
const { app } = await import('../server/app');
const { hashPassword } = await import('../server/security');
const { LoginStore } = await import('../server/login-store');
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}/api`;
const password = 'Test-only-password-2026';
const administrator = await db.user.create({
  data: {
    name: 'Prueba administradora',
    email: 'admin@example.test',
    role: 'SUPERADMIN',
    passwordHash: hashPassword(password),
  },
});
await db.user.create({
  data: {
    name: 'Prueba básico',
    email: 'basic@example.test',
    role: 'BASIC',
    passwordHash: hashPassword(password),
  },
});
type Auth = { cookie: string; csrf: string };
async function login(email: string): Promise<Auth> {
  const response = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  const data = (await response.json()) as { csrf: string };
  return { cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: data.csrf };
}
const adminAuth = await login('admin@example.test'),
  basicAuth = await login('basic@example.test');
async function call(path: string, method = 'GET', body?: unknown, auth = adminAuth) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: (await response.json()) as any };
}
async function product(overrides: Record<string, unknown> = {}) {
  const response = await call('/products', 'POST', {
    name: 'Labial prueba',
    category: 'Maquillaje',
    price: '15000',
    cost: '6000',
    initialStock: 10,
    minStock: 3,
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data;
}
const saleBody = (productId: string, overrides: Record<string, unknown> = {}) => ({
  requestId: randomUUID(),
  items: [{ productId, quantity: 1 }],
  payments: [{ method: 'Nequi', amount: '15000' }],
  delivery: false,
  ...overrides,
});
const range = '/reports?from=2000-01-01&to=2000-01-02';
const currentDay = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const currentRange = `/reports?from=${currentDay}&to=${currentDay}`;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
  for (const name of [testName, restoredName]) {
    assert.match(name, /^mai_lashies_test_[a-z0-9_]+$/);
    await root.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
  await root.end();
});

test('Autenticación, CSRF y permisos: el básico ve costos y ganancias, pero no administra usuarios', async () => {
  assert.equal((await fetch(base + '/products')).status, 401);
  const forbidden = await fetch(base + '/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: basicAuth.cookie },
    body: '{}',
  });
  assert.equal(forbidden.status, 403);
  const foreign = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://otro.example' },
    body: JSON.stringify({ email: 'admin@example.test', password }),
  });
  assert.equal(foreign.status, 403);
  assert.equal((await call('/users', 'GET', undefined, basicAuth)).status, 403);
  const p = await product();
  const catalog = await call('/products', 'GET', undefined, basicAuth);
  assert.equal(catalog.status, 200);
  assert.equal(catalog.data.find((row: any) => row.id === p.id).cost, '6000');
  assert.equal((await call(currentRange, 'GET', undefined, basicAuth)).status, 200);
  const changed = await call(
    `/products/${p.id}/stock`,
    'POST',
    {
      quantity: 1,
      kind: 'PURCHASE',
      unitCost: '6000',
      method: 'Efectivo',
      reason: 'Compra de prueba',
    },
    basicAuth,
  );
  assert.equal(changed.status, 200);
});

test('Stock atómico: dos ventas de la última unidad producen una sola venta confirmada', async () => {
  const p = await product({ initialStock: 1 });
  const responses = await Promise.all([
    call('/sales', 'POST', saleBody(p.id)),
    call('/sales', 'POST', saleBody(p.id), basicAuth),
  ]);
  assert.deepEqual(responses.map((result) => result.status).sort(), [201, 409]);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock, 0);
  assert.equal(await db.saleItem.count({ where: { productId: p.id } }), 1);
});

test('Reintentos simultáneos idempotentes no duplican venta, cobro ni descuento de existencias', async () => {
  const p = await product({ initialStock: 1 });
  const body = saleBody(p.id);
  const results = await Promise.all([call('/sales', 'POST', body), call('/sales', 'POST', body)]);
  assert.ok(
    results.every((result) => [200, 201].includes(result.status)),
    JSON.stringify(results),
  );
  assert.equal(results[0].data.id, results[1].data.id);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock, 0);
  assert.equal(await db.payment.count({ where: { saleId: results[0].data.id } }), 1);
  assert.equal(
    (await call('/sales', 'POST', { ...body, notes: 'Cambio incompatible' })).status,
    409,
  );
});

test('Venta inválida revierte todas las líneas y exige pago completo y datos del domicilio', async () => {
  const p = await product({ initialStock: 5 });
  const invalid = await call(
    '/sales',
    'POST',
    saleBody(p.id, { payments: [{ method: 'Efectivo', amount: '1' }] }),
  );
  assert.equal(invalid.status, 400);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock, 5);
  assert.equal((await call('/sales', 'POST', saleBody(p.id, { delivery: true }))).status, 400);
  assert.equal(
    (
      await call(
        '/sales',
        'POST',
        saleBody(p.id, {
          items: [
            { productId: p.id, quantity: 1 },
            { productId: p.id, quantity: 1 },
          ],
        }),
      )
    ).status,
    400,
  );
  const unavailable = await product({ initialStock: 0 });
  assert.equal(
    (
      await call(
        '/sales',
        'POST',
        saleBody(p.id, {
          items: [
            { productId: p.id, quantity: 2 },
            { productId: unavailable.id, quantity: 1 },
          ],
          payments: [{ method: 'Efectivo', amount: '45000' }],
        }),
      )
    ).status,
    409,
  );
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock, 5);
});

test('Compras calculan promedio ponderado y conservan costo y precio históricos', async () => {
  const p = await product({ initialStock: 2, cost: '100', price: '300' });
  const sale = await call(
    '/sales',
    'POST',
    saleBody(p.id, { payments: [{ method: 'Efectivo', amount: '300' }] }),
  );
  assert.equal(sale.status, 201);
  const purchase = await call(`/products/${p.id}/stock`, 'POST', {
    kind: 'PURCHASE',
    quantity: 3,
    unitCost: '200',
    method: 'Transferencia',
    reason: 'Reposición prueba',
  });
  assert.equal(purchase.status, 200);
  assert.equal(purchase.data.cost, '175');
  assert.equal(
    (
      await call(
        `/products/${p.id}`,
        'PATCH',
        {
          name: p.name,
          sku: p.sku,
          category: p.category,
          price: '500',
          costCorrection: '190',
          minStock: 3,
          active: true,
          reason: 'Corrección de costo y cambio de precio',
        },
        basicAuth,
      )
    ).status,
    200,
  );
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: p.id } })).cost.toString(),
    '190',
  );
  assert.equal(
    await db.stockMovement.count({
      where: { productId: p.id, kind: 'COST_CORRECTION', quantity: 0 },
    }),
    1,
  );
  const old = await db.sale.findUniqueOrThrow({
    where: { id: sale.data.id },
    include: { items: true },
  });
  assert.equal(old.items[0].unitPrice.toString(), '300');
  assert.equal(old.items[0].unitCost.toString(), '100');
  assert.equal(
    (
      await call(`/products/${p.id}/stock`, 'POST', {
        kind: 'ADJUSTMENT',
        quantity: -99,
        reason: 'Inválido',
      })
    ).status,
    409,
  );
});

test('Domicilios anticipados: entrega no vuelve a cobrar; anulación es única y solo de superadministrador', async () => {
  const p = await product({ initialStock: 3 });
  const result = await call(
    '/sales',
    'POST',
    saleBody(p.id, {
      delivery: true,
      customer: 'Cliente de prueba',
      phone: '3000000000',
      address: 'Dirección ficticia de pruebas',
      shippingFee: '5000',
      shippingCost: '4000',
      payments: [{ method: 'Nequi', amount: '20000' }],
    }),
  );
  assert.equal(result.status, 201);
  assert.equal(
    (await call(`/sales/${result.data.id}/delivery`, 'PATCH', { status: 'DELIVERED' }, basicAuth))
      .status,
    200,
  );
  assert.equal(await db.payment.count({ where: { saleId: result.data.id } }), 1);
  assert.equal(
    (
      await call(
        `/sales/${result.data.id}/cancel`,
        'POST',
        { reason: 'Prueba', restock: true },
        basicAuth,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`/sales/${result.data.id}/cancel`, 'POST', {
        reason: 'Cliente canceló y se reembolsó',
        restock: true,
      })
    ).status,
    200,
  );
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock, 3);
  assert.equal(
    (await call(`/sales/${result.data.id}/cancel`, 'POST', { reason: 'Reintento', restock: true }))
      .status,
    409,
  );
  assert.equal(
    (await call(`/sales/${result.data.id}/delivery`, 'PATCH', { status: 'ON_ROUTE' })).status,
    400,
  );
});

test('Reportes concilian compras, venta, descuento, entrega, gasto y pérdida por devolución no recuperable', async () => {
  const before = (await call(currentRange)).data;
  const p = await product({ initialStock: 0, cost: '100', price: '300' });
  await call(`/products/${p.id}/stock`, 'POST', {
    kind: 'PURCHASE',
    quantity: 2,
    unitCost: '100',
    method: 'Efectivo',
    reason: 'Compra de conciliación',
  });
  const sale = await call(
    '/sales',
    'POST',
    saleBody(p.id, {
      items: [{ productId: p.id, quantity: 2 }],
      discount: '50',
      delivery: true,
      customer: 'Prueba',
      phone: '3000000000',
      address: 'Pruebas',
      shippingFee: '50',
      shippingCost: '40',
      payments: [{ method: 'Efectivo', amount: '600' }],
    }),
  );
  assert.equal(sale.status, 201);
  const expense = await call('/expenses', 'POST', {
    description: 'Gasto conciliación',
    category: 'Empaques',
    amount: '30',
    method: 'Efectivo',
    date: currentDay,
  });
  assert.equal(expense.status, 201);
  const after = (await call(currentRange)).data;
  assert.equal(Number(after.netSales) - Number(before.netSales), 550);
  assert.equal(Number(after.grossProfit) - Number(before.grossProfit), 350);
  assert.equal(Number(after.operatingProfit) - Number(before.operatingProfit), 330);
  assert.equal(Number(after.cashFlow) - Number(before.cashFlow), 330);
  await call(`/sales/${sale.data.id}/cancel`, 'POST', {
    reason: 'Reembolso sin mercancía recuperable',
    restock: false,
  });
  const refunded = (await call(currentRange)).data;
  assert.equal(Number(refunded.operatingProfit) - Number(before.operatingProfit), -270); // costo 200 + envío 40 + gasto 30
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock, 0);
  await call(`/expenses/${expense.data.id}/void`, 'POST', { reason: 'Gasto registrado por error' });
  const voided = (await call(currentRange)).data;
  assert.equal(Number(voided.expenses) - Number(before.expenses), 0);
  const csv = await fetch(base + `/reports/export?from=${currentDay}&to=${currentDay}`, {
    headers: { Cookie: adminAuth.cookie },
  });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /Resultado operativo estimado/);
});

test('Fechas de Colombia y reversas respetan el período de registro', async () => {
  const p = await product();
  const sale = await call('/sales', 'POST', saleBody(p.id));
  assert.equal(sale.status, 201);
  await db.sale.update({
    where: { id: sale.data.id },
    data: {
      createdAt: new Date('2000-01-02T04:59:59Z'),
      status: 'CANCELLED',
      cancelledAt: new Date('2000-01-02T05:00:00Z'),
    },
  });
  const first = (await call('/reports?from=2000-01-01&to=2000-01-01')).data;
  assert.equal(first.netSales, '15000.00');
  const second = (await call('/reports?from=2000-01-02&to=2000-01-02')).data;
  assert.equal(second.netSales, '-15000.00');
  assert.equal(second.refunds, '15000.00');
  assert.equal((await call('/reports?from=2000-01-02&to=2000-01-01')).status, 400);
  assert.equal((await call('/reports?from=2000-01-01&to=2003-01-01')).status, 400);
});

test('Desactivar cuenta revoca sus sesiones y no se permite perder al superadministrador actual', async () => {
  const basic = await db.user.findUniqueOrThrow({ where: { email: 'basic@example.test' } });
  assert.equal(
    (await call(`/users/${basic.id}`, 'PATCH', { active: false, role: 'BASIC' })).status,
    200,
  );
  assert.equal((await call('/products', 'GET', undefined, basicAuth)).status, 401);
  assert.equal(
    (await call(`/users/${administrator.id}`, 'PATCH', { active: false, role: 'BASIC' })).status,
    400,
  );
});

test('Respaldo y restauración preservan existencias, valores y auditoría en otra base; excluyen sesiones', async () => {
  await mkdir('.local/test-backups', { recursive: true });
  const output = `.local/test-backups/${testName}.json`;
  const counts = await createBackup(testUrl.toString(), output);
  assert.ok(counts.Sale > 0);
  assert.ok(counts.Audit > 0);
  const restoredUrl = await restoreBackup(originalUrl, output, restoredName);
  const restored = new pg.Client({ connectionString: restoredUrl });
  await restored.connect();
  try {
    for (const [table, total] of Object.entries(counts)) {
      const count = await restored.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
      assert.equal(count.rows[0].count, total);
    }
    assert.equal(
      (await restored.query('SELECT COUNT(*)::int AS count FROM "Session"')).rows[0].count,
      0,
    );
    const inventory = await restored.query(
      'SELECT SUM(stock)::text AS units, SUM(stock * cost)::text AS value FROM "Product"',
    );
    const source = await db.$queryRaw<
      { units: string; value: string }[]
    >`SELECT SUM(stock)::text AS units, SUM(stock * cost)::text AS value FROM "Product"`;
    assert.deepEqual(inventory.rows, source);
  } finally {
    await restored.end();
  }
});

test('El límite de ingreso se comparte entre instancias y cuenta incrementos simultáneos', async () => {
  const first = new LoginStore(),
    second = new LoginStore();
  const key = 'deployment-test-' + randomUUID();
  const hits = await Promise.all(
    Array.from({ length: 31 }, (_, i) => (i % 2 ? first : second).increment(key)),
  );
  assert.deepEqual(
    hits.map((hit) => hit.totalHits).sort((a, b) => a - b),
    Array.from({ length: 31 }, (_, i) => i + 1),
  );
  assert.ok(hits.every((hit) => hit.resetTime instanceof Date));
  await first.resetKey(key);
  assert.equal((await second.increment(key)).totalHits, 1);
});

test('La entrada de Vercel reutiliza Express sin abrir otro servidor', async () => {
  const entry = await import('../api/index');
  assert.equal(entry.default, app);
});

test('La migración de nube conserva cada registro y rechaza importar sobre datos existentes', async () => {
  const destination = testName + '_import';
  const url = new URL(originalUrl);
  url.pathname = '/' + destination;
  await root.query(`CREATE DATABASE "${destination}"`);
  try {
    const migration = spawnSync(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { env: { ...process.env, DATABASE_URL: url.toString() }, encoding: 'utf8' },
    );
    assert.equal(migration.status, 0, migration.stderr);
    const output = `.local/test-backups/${testName}-migration.json`;
    const counts = await createBackup(testUrl.toString(), output);
    assert.deepEqual(await importSnapshot(url.toString(), output), counts);
    await assert.rejects(() => importSnapshot(url.toString(), output), /ya contiene registros/);
    const target = new pg.Client({ connectionString: url.toString() });
    await target.connect();
    try {
      assert.equal(
        (await target.query('SELECT count(*)::int AS count FROM "Sale"')).rows[0].count,
        counts.Sale,
      );
    } finally {
      await target.end();
    }
  } finally {
    assert.match(destination, /^mai_lashies_test_[a-z0-9_]+$/);
    await root.query(`DROP DATABASE "${destination}" WITH (FORCE)`);
  }
});
