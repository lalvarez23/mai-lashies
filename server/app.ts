import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { db } from './db';
import { Prisma } from './generated/prisma/client';
import { session, admin, digest, safeUser, hashPassword, verifyPassword } from './security';
import { allowedOrigins } from './origins';
import { LoginStore } from './login-store';

const app = express();
app.disable('x-powered-by');
// Vercel termina TLS y normaliza el proxy que entrega la solicitud a la función.
if (process.env.VERCEL) app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '256kb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  const allowed = allowedOrigins();
  if (origin && !allowed.has(origin))
    return res.status(403).json({ error: 'Origen no autorizado.' });
  next();
});

class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new Problem(status, message);
}
const D = (value: Decimal.Value | { toString(): string }) => new Decimal(value.toString());
const fixed = (value: Decimal) => value.toFixed(2, Decimal.ROUND_HALF_UP);
const text = (max = 180) => z.string().trim().min(1, 'Este campo es obligatorio.').max(max);
const optionalText = (max = 180) => z.string().trim().max(max).default('');
const money = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (v) => /^\d{1,12}(\.\d{1,2})?$/.test(v),
    'Usa un valor positivo con máximo dos decimales.',
  );
const methods = ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta'] as const;
const method = z.enum(methods);
const id = z.string().uuid();
async function atomic<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034' && i < 4) continue;
      throw error;
    }
  }
}
async function audit(
  tx: Prisma.TransactionClient,
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  detail: string,
) {
  await tx.audit.create({ data: { userId, action, entity, entityId, detail } });
}
const loginLimit = rateLimit({
  store: new LoginStore(),
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' },
});
const dummyHash = hashPassword(randomBytes(32).toString('hex'));
app.get('/api/health', async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});
app.post('/api/auth/login', loginLimit, async (req, res) => {
  const data = z
    .object({
      email: z
        .email()
        .max(180)
        .transform((v) => v.toLowerCase().trim()),
      password: z.string().min(1).max(256),
    })
    .parse(req.body);
  const user = await db.user.findUnique({ where: { email: data.email } });
  const valid = verifyPassword(data.password, user?.passwordHash ?? dummyHash);
  if (!user || !valid || !user.active)
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  const token = randomBytes(32).toString('hex');
  const csrf = randomBytes(24).toString('hex');
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.session.create({
    data: {
      id: digest(token),
      userId: user.id,
      csrf,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    },
  });
  res.cookie('mai_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
  res.json({ user: safeUser(user), csrf });
});
app.use('/api', session);
app.get('/api/auth/me', (_req, res) =>
  res.json({ user: safeUser(res.locals.user), csrf: res.locals.session.csrf }),
);
app.post('/api/auth/logout', async (_req, res) => {
  await db.session.delete({ where: { id: res.locals.session.id } });
  res.clearCookie('mai_session', { path: '/' });
  res.json({ ok: true });
});
app.post('/api/auth/password', async (req, res) => {
  const data = z
    .object({ currentPassword: z.string().max(256), password: z.string().min(12).max(128) })
    .parse(req.body);
  if (!verifyPassword(data.currentPassword, res.locals.user.passwordHash))
    fail(400, 'La contraseña actual no coincide.');
  await atomic(async (tx) => {
    await tx.user.update({
      where: { id: res.locals.user.id },
      data: { passwordHash: hashPassword(data.password) },
    });
    await tx.session.deleteMany({ where: { userId: res.locals.user.id } });
    await audit(
      tx,
      res.locals.user.id,
      'PASSWORD_CHANGED',
      'User',
      res.locals.user.id,
      'Cambio de contraseña',
    );
  });
  res.clearCookie('mai_session', { path: '/' });
  res.json({ ok: true });
});

const productInput = z.object({
  name: text(),
  sku: optionalText(60),
  category: text(60),
  brand: optionalText(100),
  description: optionalText(1000),
  variant: optionalText(150),
  supplier: optionalText(150),
  cost: money,
  price: money,
  minStock: z.number().int().min(0).max(1000000),
  initialStock: z.number().int().min(0).max(1000000).default(0),
});
app.get('/api/products', async (_req, res) =>
  res.json(await db.product.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] })),
);
app.post('/api/products', async (req, res) => {
  const input = productInput.parse(req.body);
  const { initialStock, ...data } = input;
  const product = await atomic(async (tx) => {
    const created = await tx.product.create({
      data: {
        ...data,
        sku: data.sku || `ML-${randomBytes(4).toString('hex').toUpperCase()}`,
        stock: initialStock,
      },
    });
    if (initialStock)
      await tx.stockMovement.create({
        data: {
          productId: created.id,
          userId: res.locals.user.id,
          quantity: initialStock,
          kind: 'INITIAL',
          reason: 'Carga de inventario inicial',
          unitCost: data.cost,
        },
      });
    await audit(
      tx,
      res.locals.user.id,
      'CREATED',
      'Product',
      created.id,
      `${created.name}; stock inicial ${initialStock}`,
    );
    return created;
  });
  res.status(201).json(product);
});
app.patch('/api/products/:id', async (req, res) => {
  const productId = id.parse(req.params.id);
  const data = productInput
    .omit({ initialStock: true, cost: true })
    .extend({
      sku: text(60),
      active: z.boolean(),
      reason: text(500),
      costCorrection: money.optional(),
    })
    .parse(req.body);
  const { reason, costCorrection, ...values } = data;
  const product = await atomic(async (tx) => {
    const before = await tx.product.findUniqueOrThrow({ where: { id: productId } });
    const after = await tx.product.update({
      where: { id: productId },
      data: { ...values, ...(costCorrection === undefined ? {} : { cost: costCorrection }) },
    });
    if (costCorrection !== undefined)
      await tx.stockMovement.create({
        data: {
          productId,
          userId: res.locals.user.id,
          quantity: 0,
          kind: 'COST_CORRECTION',
          reason,
          unitCost: costCorrection,
        },
      });
    await audit(
      tx,
      res.locals.user.id,
      'UPDATED',
      'Product',
      productId,
      `${reason}. Nombre: ${before.name} → ${after.name}. Precio COP: ${before.price} → ${after.price}. Costo COP: ${before.cost} → ${after.cost}. Activo: ${before.active ? 'sí' : 'no'} → ${after.active ? 'sí' : 'no'}. Categoría: ${after.category}; referencia: ${after.sku}; variante: ${after.variant || 'sin variante'}.`,
    );
    return after;
  });
  res.json(product);
});
app.get('/api/movements', async (req, res) => {
  const productId = req.query.productId ? id.parse(req.query.productId) : undefined;
  res.json(
    await db.stockMovement.findMany({
      where: { productId },
      include: { product: { select: { name: true, sku: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 250,
    }),
  );
});
app.post('/api/products/:id/stock', async (req, res) => {
  const productId = id.parse(req.params.id);
  const input = z
    .object({
      quantity: z
        .number()
        .int()
        .min(-1000000)
        .max(1000000)
        .refine((v) => v !== 0, 'La cantidad debe ser distinta de cero.'),
      kind: z.enum(['PURCHASE', 'ADJUSTMENT']),
      reason: text(500),
      unitCost: money.optional(),
      method: method.optional(),
    })
    .parse(req.body);
  if (input.kind === 'PURCHASE' && (input.quantity < 1 || !input.unitCost || !input.method))
    fail(400, 'Una compra requiere cantidad positiva, costo unitario y medio de pago.');
  const result = await atomic(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
    if (!product.active) fail(400, 'Activa el producto antes de modificar sus existencias.');
    const stock = product.stock + input.quantity;
    if (stock < 0) fail(409, 'El movimiento dejaría existencias negativas.');
    const purchaseCost = input.kind === 'PURCHASE' ? D(input.unitCost!) : D(product.cost);
    const cost =
      input.quantity > 0
        ? D(product.cost)
            .mul(product.stock)
            .add(purchaseCost.mul(input.quantity))
            .div(stock)
            .toFixed(4)
        : product.cost.toString();
    const after = await tx.product.update({ where: { id: productId }, data: { stock, cost } });
    await tx.stockMovement.create({
      data: {
        productId,
        userId: res.locals.user.id,
        quantity: input.quantity,
        kind: input.kind,
        reason: input.reason,
        unitCost: purchaseCost.toFixed(4),
        paymentMethod: input.method,
        cashAmount: input.kind === 'PURCHASE' ? fixed(purchaseCost.mul(input.quantity)) : '0',
      },
    });
    await audit(
      tx,
      res.locals.user.id,
      'STOCK',
      'Product',
      productId,
      `${input.kind}: ${input.quantity}; ${input.reason}`,
    );
    return after;
  });
  res.json(result);
});

const saleInput = z.object({
  requestId: id,
  items: z
    .array(z.object({ productId: id, quantity: z.number().int().min(1).max(100000) }))
    .min(1)
    .max(100),
  discount: money.default('0'),
  payments: z
    .array(z.object({ method, amount: money }))
    .min(1)
    .max(5),
  customer: optionalText(),
  phone: optionalText(40),
  address: optionalText(500),
  notes: optionalText(1000),
  delivery: z.boolean(),
  shippingFee: money.default('0'),
  shippingCost: money.default('0'),
});
const saleInclude = { items: true, payments: true, user: { select: { name: true } } } as const;
app.get('/api/sales', async (_req, res) =>
  res.json(
    await db.sale.findMany({ include: saleInclude, orderBy: { createdAt: 'desc' }, take: 300 }),
  ),
);
app.get('/api/sales/:id', async (req, res) =>
  res.json(
    await db.sale.findUniqueOrThrow({
      where: { id: id.parse(req.params.id) },
      include: saleInclude,
    }),
  ),
);
app.post('/api/sales', async (req, res) => {
  const input = saleInput.parse(req.body);
  if (new Set(input.items.map((item) => item.productId)).size !== input.items.length)
    fail(400, 'Agrupa las cantidades del mismo producto en una sola línea.');
  if (input.delivery && (!input.customer || !input.phone || !input.address))
    fail(400, 'Completa destinatario, teléfono y dirección del domicilio.');
  if (!input.delivery && (!D(input.shippingFee).isZero() || !D(input.shippingCost).isZero()))
    fail(400, 'Una venta presencial no incluye domicilio.');
  const requestHash = digest(JSON.stringify({ ...input, userId: res.locals.user.id }));
  async function existing() {
    const prior = await db.sale.findUnique({
      where: { requestId: input.requestId },
      include: saleInclude,
    });
    if (prior && prior.requestHash !== requestHash)
      fail(409, 'Este identificador ya corresponde a otra venta.');
    return prior;
  }
  const prior = await existing();
  if (prior) return res.json(prior);
  let sale;
  try {
    sale = await atomic(async (tx) => {
      const repeated = await tx.sale.findUnique({
        where: { requestId: input.requestId },
        include: saleInclude,
      });
      if (repeated) {
        if (repeated.requestHash !== requestHash)
          fail(409, 'Este identificador ya corresponde a otra venta.');
        return repeated;
      }
      const products = await tx.product.findMany({
        where: { id: { in: input.items.map((item) => item.productId) } },
      });
      let subtotal = D(0),
        costTotal = D(0);
      const lines = [];
      for (const item of [...input.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const product = products.find((p) => p.id === item.productId);
        if (!product || !product.active) fail(400, 'Uno de los productos ya no está disponible.');
        const changed = await tx.product.updateMany({
          where: { id: item.productId, active: true, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (changed.count !== 1)
          fail(409, `Stock insuficiente para ${product.name}. Actualiza el inventario.`);
        subtotal = subtotal.add(D(product.price).mul(item.quantity));
        costTotal = costTotal.add(D(product.cost).mul(item.quantity));
        lines.push({
          productId: product.id,
          quantity: item.quantity,
          name: product.name,
          sku: product.sku,
          unitPrice: product.price,
          unitCost: product.cost,
        });
      }
      if (D(input.discount).gt(subtotal))
        fail(400, 'El descuento supera el valor de los productos.');
      const total = subtotal.sub(input.discount).add(input.shippingFee);
      if (total.gt('9999999999999999.99') || costTotal.gt('99999999999999.9999'))
        fail(400, 'El importe de esta venta supera el límite permitido.');
      const paid = input.payments.reduce((sum, payment) => sum.add(payment.amount), D(0));
      if (!paid.eq(total))
        fail(400, 'El pago debe coincidir exactamente con el total de la venta.');
      const created = await tx.sale.create({
        data: {
          requestId: input.requestId,
          requestHash,
          userId: res.locals.user.id,
          customer: input.customer,
          phone: input.phone,
          address: input.address,
          notes: input.notes,
          delivery: input.delivery,
          deliveryStatus: input.delivery ? 'PENDING' : 'DELIVERED',
          shippingFee: input.shippingFee,
          shippingCost: input.shippingCost,
          subtotal: fixed(subtotal),
          discount: input.discount,
          total: fixed(total),
          costTotal: costTotal.toFixed(4),
          items: { create: lines },
          payments: { create: input.payments },
        },
        include: saleInclude,
      });
      await tx.stockMovement.createMany({
        data: lines.map((line) => ({
          productId: line.productId,
          userId: res.locals.user.id,
          quantity: -line.quantity,
          kind: 'SALE',
          reason: `Venta ML-${created.number}`,
          saleId: created.id,
          unitCost: line.unitCost,
        })),
      });
      await audit(
        tx,
        res.locals.user.id,
        'PAID',
        'Sale',
        created.id,
        `ML-${created.number}: COP ${created.total}`,
      );
      return created;
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      const repeated = await existing();
      if (repeated) return res.json(repeated);
    }
    throw error;
  }
  res.status(201).json(sale);
});
app.patch('/api/sales/:id/delivery', async (req, res) => {
  const saleId = id.parse(req.params.id);
  const { status } = z
    .object({ status: z.enum(['PENDING', 'PREPARING', 'ON_ROUTE', 'DELIVERED']) })
    .parse(req.body);
  const result = await atomic(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
    if (!sale.delivery || sale.status !== 'PAID')
      fail(400, 'Este domicilio no se puede actualizar.');
    const after = await tx.sale.update({ where: { id: saleId }, data: { deliveryStatus: status } });
    await audit(
      tx,
      res.locals.user.id,
      'DELIVERY',
      'Sale',
      saleId,
      `${sale.deliveryStatus} → ${status}`,
    );
    return after;
  });
  res.json(result);
});
app.post('/api/sales/:id/cancel', admin, async (req, res) => {
  const saleId = id.parse(req.params.id);
  const { reason } = z.object({ reason: text(500), restock: z.boolean() }).parse(req.body);
  const { restock } = req.body;
  const result = await atomic(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: { items: true },
    });
    if (sale.status === 'CANCELLED') fail(409, 'Esta venta ya fue anulada.');
    if (restock)
      for (const line of [...sale.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
        const stock = product.stock + line.quantity;
        const cost = D(product.cost)
          .mul(product.stock)
          .add(D(line.unitCost).mul(line.quantity))
          .div(stock)
          .toFixed(4);
        await tx.product.update({ where: { id: line.productId }, data: { stock, cost } });
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            userId: res.locals.user.id,
            quantity: line.quantity,
            kind: 'RETURN',
            reason,
            saleId,
            unitCost: line.unitCost,
          },
        });
      }
    const after = await tx.sale.update({
      where: { id: saleId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason,
        restocked: restock,
      },
    });
    await audit(
      tx,
      res.locals.user.id,
      'REFUND',
      'Sale',
      saleId,
      `Reembolso total COP ${sale.total}; reincorporación ${restock ? 'sí' : 'no (mercancía no recuperable)'}; ${reason}`,
    );
    return after;
  });
  res.json(result);
});

app.get('/api/expenses', async (_req, res) =>
  res.json(
    await db.expense.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 300,
    }),
  ),
);
app.post('/api/expenses', async (req, res) => {
  const input = z
    .object({
      description: text(500),
      category: text(80),
      amount: money.refine((v) => D(v).gt(0), 'Ingresa un valor mayor a cero.'),
      method,
      date: z.iso.date(),
    })
    .parse(req.body);
  const date = new Date(`${input.date}T12:00:00-05:00`);
  if (date > new Date(Date.now() + 24 * 60 * 60 * 1000))
    fail(400, 'El gasto no puede estar en una fecha futura.');
  const result = await atomic(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        description: input.description,
        category: input.category,
        amount: input.amount,
        method: input.method,
        occurredAt: date,
        userId: res.locals.user.id,
      },
    });
    await audit(
      tx,
      res.locals.user.id,
      'CREATED',
      'Expense',
      expense.id,
      `${input.category}: COP ${input.amount}; ${input.description}`,
    );
    return expense;
  });
  res.status(201).json(result);
});
app.post('/api/expenses/:id/void', admin, async (req, res) => {
  const expenseId = id.parse(req.params.id);
  const { reason } = z.object({ reason: text(500) }).parse(req.body);
  res.json(
    await atomic(async (tx) => {
      const before = await tx.expense.findUniqueOrThrow({ where: { id: expenseId } });
      if (before.voidedAt) fail(409, 'Este gasto ya fue anulado.');
      const after = await tx.expense.update({
        where: { id: expenseId },
        data: { voidedAt: new Date(), voidReason: reason },
      });
      await audit(tx, res.locals.user.id, 'VOIDED', 'Expense', expenseId, reason);
      return after;
    }),
  );
});

function period(query: unknown) {
  const { from, to } = z.object({ from: z.iso.date(), to: z.iso.date() }).parse(query);
  if (from > to) fail(400, 'La fecha inicial debe ser anterior a la final.');
  const start = new Date(`${from}T00:00:00-05:00`),
    end = new Date(new Date(`${to}T00:00:00-05:00`).getTime() + 86400000);
  if (end.getTime() - start.getTime() > 366 * 86400000)
    fail(400, 'Consulta un máximo de 366 días a la vez.');
  return { from, to, start, end };
}
async function report(query: unknown) {
  const { from, to, start, end } = period(query);
  const inRange = (date: Date) => date >= start && date < end;
  return db.$transaction(
    async (tx) => {
      const sales = await tx.sale.findMany({
        where: {
          OR: [{ createdAt: { gte: start, lt: end } }, { cancelledAt: { gte: start, lt: end } }],
        },
        include: { items: true, payments: true },
      });
      const expenses = await tx.expense.findMany({
        where: {
          OR: [{ occurredAt: { gte: start, lt: end } }, { voidedAt: { gte: start, lt: end } }],
        },
      });
      const purchases = await tx.stockMovement.findMany({
        where: { kind: 'PURCHASE', createdAt: { gte: start, lt: end } },
      });
      const products = await tx.product.findMany();
      let netSales = D(0),
        refunds = D(0),
        costs = D(0),
        shippingIncome = D(0),
        shippingCosts = D(0),
        operatingExpenses = D(0),
        collections = D(0),
        count = 0;
      const daily = new Map<string, Decimal>();
      for (let date = start; date < end; date = new Date(date.getTime() + 86400000))
        daily.set(date.toISOString().slice(0, 10), D(0));
      const dayKey = (date: Date) =>
        new Date(date.getTime() - 5 * 3600000).toISOString().slice(0, 10);
      const payments: Record<string, Decimal> = {};
      const top = new Map<string, { name: string; quantity: number; total: Decimal }>();
      for (const sale of sales) {
        const net = D(sale.subtotal).sub(sale.discount);
        if (inRange(sale.createdAt)) {
          count++;
          netSales = netSales.add(net);
          costs = costs.add(sale.costTotal);
          shippingIncome = shippingIncome.add(sale.shippingFee);
          shippingCosts = shippingCosts.add(sale.shippingCost);
          collections = collections.add(sale.total);
          const key = dayKey(sale.createdAt);
          daily.set(key, (daily.get(key) ?? D(0)).add(net));
          for (const payment of sale.payments)
            payments[payment.method] = (payments[payment.method] ?? D(0)).add(payment.amount);
          for (const item of sale.items) {
            const row = top.get(item.productId) ?? { name: item.name, quantity: 0, total: D(0) };
            row.quantity += item.quantity;
            row.total = row.total.add(D(item.unitPrice).mul(item.quantity));
            top.set(item.productId, row);
          }
        }
        if (sale.cancelledAt && inRange(sale.cancelledAt)) {
          refunds = refunds.add(sale.total);
          netSales = netSales.sub(net);
          if (sale.restocked) costs = costs.sub(sale.costTotal);
          shippingIncome = shippingIncome.sub(sale.shippingFee);
          // El costo de transporte ya pagado no se recupera automáticamente al reembolsar.
          const key = dayKey(sale.cancelledAt);
          daily.set(key, (daily.get(key) ?? D(0)).sub(net));
          for (const item of sale.items) {
            const row = top.get(item.productId) ?? { name: item.name, quantity: 0, total: D(0) };
            row.quantity -= item.quantity;
            row.total = row.total.sub(D(item.unitPrice).mul(item.quantity));
            top.set(item.productId, row);
          }
        }
      }
      for (const expense of expenses) {
        if (inRange(expense.occurredAt)) operatingExpenses = operatingExpenses.add(expense.amount);
        if (expense.voidedAt && inRange(expense.voidedAt))
          operatingExpenses = operatingExpenses.sub(expense.amount);
      }
      const purchasePayments = purchases.reduce((sum, item) => sum.add(item.cashAmount), D(0));
      const inventoryValue = products.reduce(
        (sum, product) => sum.add(D(product.cost).mul(product.stock)),
        D(0),
      );
      const grossProfit = netSales.sub(costs);
      return {
        from,
        to,
        netSales: fixed(netSales),
        collections: fixed(collections),
        refunds: fixed(refunds),
        costs: fixed(costs),
        grossProfit: fixed(grossProfit),
        shippingIncome: fixed(shippingIncome),
        shippingCosts: fixed(shippingCosts),
        expenses: fixed(operatingExpenses),
        purchasePayments: fixed(purchasePayments),
        operatingProfit: fixed(
          grossProfit.add(shippingIncome).sub(shippingCosts).sub(operatingExpenses),
        ),
        cashFlow: fixed(
          collections.sub(refunds).sub(purchasePayments).sub(shippingCosts).sub(operatingExpenses),
        ),
        inventoryValue: fixed(inventoryValue),
        count,
        unitsInStock: products.reduce((sum, product) => sum + product.stock, 0),
        lowStock: products.filter((product) => product.active && product.stock <= product.minStock),
        daily: [...daily].map(([date, amount]) => ({ date, amount: fixed(amount) })),
        payments: Object.entries(payments).map(([method, amount]) => ({
          method,
          amount: fixed(amount),
        })),
        top: [...top.values()]
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5)
          .map((row) => ({ ...row, total: fixed(row.total) })),
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
app.get('/api/reports', async (req, res) => res.json(await report(req.query)));
app.get('/api/reports/export', async (req, res) => {
  const result = await report(req.query);
  const rows = [
    ['Indicador', 'Valor COP'],
    ['Desde', result.from],
    ['Hasta', result.to],
    ['Ventas netas de productos', result.netSales],
    ['Cobros recibidos', result.collections],
    ['Reembolsos', result.refunds],
    ['Costo de ventas', result.costs],
    ['Utilidad bruta', result.grossProfit],
    ['Ingresos por domicilio', result.shippingIncome],
    ['Costos de domicilio', result.shippingCosts],
    ['Gastos operativos', result.expenses],
    ['Compras pagadas', result.purchasePayments],
    ['Resultado operativo estimado', result.operatingProfit],
    ['Flujo neto registrado', result.cashFlow],
    ['Inventario actual al costo', result.inventoryValue],
    [],
    ['Fecha', 'Ventas netas COP'],
    ...result.daily.map((row) => [row.date, row.amount]),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="mai-lashies-${result.from}-${result.to}.csv"`,
  );
  res.send(
    '\uFEFF' +
      rows
        .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(';'))
        .join('\r\n'),
  );
});

app.get('/api/users', admin, async (_req, res) =>
  res.json((await db.user.findMany({ orderBy: { createdAt: 'asc' } })).map(safeUser)),
);
app.post('/api/users', admin, async (req, res) => {
  const input = z
    .object({
      name: text(100),
      email: z
        .email()
        .max(180)
        .transform((v) => v.toLowerCase()),
      password: z.string().min(12).max(128),
      role: z.enum(['SUPERADMIN', 'BASIC']),
    })
    .parse(req.body);
  const { password, ...data } = input;
  res.status(201).json(
    await atomic(async (tx) => {
      const user = await tx.user.create({
        data: { ...data, passwordHash: hashPassword(password) },
      });
      await audit(
        tx,
        res.locals.user.id,
        'CREATED',
        'User',
        user.id,
        `${user.email}; ${user.role}`,
      );
      return safeUser(user);
    }),
  );
});
app.patch('/api/users/:id', admin, async (req, res) => {
  const userId = id.parse(req.params.id);
  const input = z
    .object({
      role: z.enum(['SUPERADMIN', 'BASIC']),
      active: z.boolean(),
      password: z.string().min(12).max(128).optional(),
    })
    .parse(req.body);
  if (userId === res.locals.user.id && (!input.active || input.role !== 'SUPERADMIN'))
    fail(400, 'No puedes quitarte tu propio acceso de superadministrador.');
  res.json(
    await atomic(async (tx) => {
      const old = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (
        old.role === 'SUPERADMIN' &&
        old.active &&
        (!input.active || input.role !== 'SUPERADMIN')
      ) {
        const total = await tx.user.count({ where: { role: 'SUPERADMIN', active: true } });
        if (total <= 1) fail(400, 'Debe quedar al menos un superadministrador activo.');
      }
      const { password, ...data } = input;
      const after = await tx.user.update({
        where: { id: userId },
        data: { ...data, ...(password ? { passwordHash: hashPassword(password) } : {}) },
      });
      await tx.session.deleteMany({ where: { userId } });
      await audit(
        tx,
        res.locals.user.id,
        'UPDATED',
        'User',
        userId,
        `${input.role}; activo ${input.active}; restablecer clave ${Boolean(password)}`,
      );
      return safeUser(after);
    }),
  );
});
app.get('/api/audit', admin, async (_req, res) =>
  res.json(
    await db.audit.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ),
);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · '),
      });
    if (error instanceof Problem) return res.status(error.status).json({ error: error.message });
    const code = (error as { code?: string }).code;
    if (code === 'P2002')
      return res.status(409).json({ error: 'Ya existe un registro con ese código o correo.' });
    if (code === 'P2025') return res.status(404).json({ error: 'El registro no existe.' });
    if (code === 'P2034')
      return res
        .status(409)
        .json({ error: 'Otra persona actualizó estos datos. Inténtalo de nuevo.' });
    if (error instanceof SyntaxError)
      return res.status(400).json({ error: 'El formato de la solicitud no es válido.' });
    console.error('Error del servidor:', error instanceof Error ? error.message : 'desconocido');
    res.status(500).json({
      error: 'No se pudo completar la operación. Revisa el servidor e inténtalo de nuevo.',
    });
  },
);
export { app };
