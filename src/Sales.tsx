import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Printer,
  Truck,
  CheckCircle2,
  ShoppingBag,
  Eye,
  Ban,
} from 'lucide-react';
import { Decimal } from 'decimal.js';
import { BrandLogo, BRAND_SLOGAN } from './BrandLogo';
import { api, money, dateTime, methods, deliveryLabels } from './api';
import { useQuery } from './useQuery';
import type { Product, Sale, User } from './types';
import type { Changed } from './App';
import { Modal, Field, Save, Empty, ErrorBox, Loading, Badge } from './components';

function SaleComposer({
  close,
  changed,
  onCreated,
  revision,
}: {
  close: () => void;
  changed: Changed;
  onCreated: (sale: Sale) => void;
  revision: number;
}) {
  const products = useQuery<Product[]>('/products', revision);
  const [cart, setCart] = useState<{ productId: string; quantity: number }[]>([]),
    [search, setSearch] = useState(''),
    [delivery, setDelivery] = useState(false),
    [discount, setDiscount] = useState('0'),
    [fee, setFee] = useState('0'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useRef<{ body: string; key: string } | null>(null);
  const available = (products.data ?? []).filter((p) => p.active && p.stock > 0);
  const total = useMemo(() => {
    try {
      return cart
        .reduce(
          (sum, line) =>
            sum.add(
              new Decimal(products.data?.find((p) => p.id === line.productId)?.price ?? 0).mul(
                line.quantity,
              ),
            ),
          new Decimal(0),
        )
        .sub(discount || 0)
        .add(delivery ? fee || 0 : 0);
    } catch {
      return new Decimal(0);
    }
  }, [cart, products.data, discount, fee, delivery]);
  function add(product: Product) {
    setCart((lines) => {
      const existing = lines.find((line) => line.productId === product.id);
      return existing
        ? lines.map((line) =>
            line.productId === product.id
              ? { ...line, quantity: Math.min(product.stock, line.quantity + 1) }
              : line,
          )
        : [...lines, { productId: product.id, quantity: 1 }];
    });
    setSearch('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cart.length === 0) {
      setError('Agrega al menos un producto.');
      return;
    }
    setBusy(true);
    setError('');
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const body = {
      items: cart,
      discount: discount || '0',
      payments: [{ method: form.method, amount: total.toFixed(2) }],
      customer: form.customer,
      phone: form.phone ?? '',
      address: form.address ?? '',
      notes: form.notes,
      delivery,
      shippingFee: delivery ? fee || '0' : '0',
      shippingCost: delivery ? form.shippingCost || '0' : '0',
    };
    const serialized = JSON.stringify(body);
    if (request.current?.body !== serialized)
      request.current = { body: serialized, key: crypto.randomUUID() };
    try {
      const sale = await api<Sale>('/sales', 'POST', { ...body, requestId: request.current!.key });
      changed(`Venta ML-${String(sale.number).padStart(4, '0')} registrada.`);
      close();
      onCreated(sale);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Registrar una venta" onClose={close} wide>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="sale-type">
            <button
              type="button"
              className={!delivery ? 'selected' : ''}
              onClick={() => setDelivery(false)}
            >
              <ShoppingBag size={17} /> Presencial
            </button>
            <button
              type="button"
              className={delivery ? 'selected' : ''}
              onClick={() => setDelivery(true)}
            >
              <Truck size={17} /> Domicilio · Pago anticipado
            </button>
          </div>
          <div className="form-section-label">1. AGREGA LOS PRODUCTOS</div>
          <div className="search-field composer-search">
            <Search size={18} />
            <input
              aria-label="Buscar producto para vender"
              placeholder="Buscar producto o código…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ErrorBox error={products.error} />
          {products.loading ? (
            <Loading />
          ) : (
            search && (
              <div className="search-results">
                {available
                  .filter((p) =>
                    `${p.name} ${p.sku} ${p.variant}`.toLowerCase().includes(search.toLowerCase()),
                  )
                  .slice(0, 8)
                  .map((product) => (
                    <button type="button" key={product.id} onClick={() => add(product)}>
                      <div>
                        <strong>{product.name}</strong>
                        <small>
                          {product.sku} · {product.variant || product.category} · {product.stock}{' '}
                          disponibles
                        </small>
                      </div>
                      <span>{money(product.price)}</span>
                      <Plus size={17} />
                    </button>
                  ))}
                {!available.some((p) =>
                  `${p.name} ${p.sku} ${p.variant}`.toLowerCase().includes(search.toLowerCase()),
                ) && <p className="muted">No hay productos disponibles con esa búsqueda.</p>}
              </div>
            )
          )}
          {!available.length && !products.loading && (
            <div className="info-note">
              Primero registra productos con existencias en Productos e inventario.
            </div>
          )}
          {cart.length ? (
            <div className="cart-list">
              {cart.map((line) => {
                const product = products.data!.find((p) => p.id === line.productId)!;
                return (
                  <div className="cart-row" key={line.productId}>
                    <div>
                      <strong>{product.name}</strong>
                      <small>
                        {product.variant || product.sku} · {money(product.price)} / unidad
                      </small>
                    </div>
                    <input
                      aria-label={`Cantidad de ${product.name}`}
                      type="number"
                      min="1"
                      max={product.stock}
                      step="1"
                      value={line.quantity}
                      onChange={(e) =>
                        setCart((lines) =>
                          lines.map((item) =>
                            item.productId === line.productId
                              ? { ...item, quantity: Number(e.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                    <strong>
                      {money(new Decimal(product.price).mul(line.quantity).toFixed(2))}
                    </strong>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Quitar ${product.name}`}
                      onClick={() =>
                        setCart((lines) =>
                          lines.filter((item) => item.productId !== line.productId),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted small-text">Busca y selecciona los productos que vas a vender.</p>
          )}
          <div className="form-section-label">2. DATOS DE LA VENTA</div>
          <div className="form-grid">
            <Field label={delivery ? 'Destinatario *' : 'Cliente (opcional)'}>
              <input name="customer" required={delivery} maxLength={180} placeholder="Nombre" />
            </Field>
            <Field label="Descuento total COP">
              <input
                aria-label="Descuento total COP"
                type="number"
                min="0"
                step="0.01"
                max="999999999999"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </Field>
            {delivery && (
              <>
                <Field label="Teléfono *">
                  <input name="phone" type="tel" required maxLength={40} />
                </Field>
                <Field label="Dirección, barrio y ciudad *">
                  <input name="address" required maxLength={500} />
                </Field>
                <Field label="Domicilio cobrado al cliente COP">
                  <input
                    aria-label="Domicilio cobrado al cliente COP"
                    type="number"
                    min="0"
                    step="0.01"
                    max="999999999999"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                  />
                </Field>
                <Field
                  label="Costo pagado al transportador COP"
                  hint="Se registra como salida de dinero de esta venta."
                >
                  <input
                    name="shippingCost"
                    type="number"
                    min="0"
                    step="0.01"
                    max="999999999999"
                    defaultValue="0"
                  />
                </Field>
              </>
            )}
          </div>
          <Field label="Notas / indicaciones">
            <textarea name="notes" rows={2} maxLength={1000} placeholder="Opcional" />
          </Field>
          <div className="payment-box">
            <div>
              <span>TOTAL A COBRAR</span>
              <strong>{money(total.toFixed(2))}</strong>
            </div>
            <Field label="Medio de pago">
              <select name="method">
                {methods.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
          </div>
          <label className="checkbox">
            <input type="checkbox" required /> Confirmo que recibí el pago completo
            {delivery ? ' antes del envío' : ''}.
          </label>
          <ErrorBox error={error} />
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close} disabled={busy}>
              Cancelar
            </button>
            <Save busy={busy} label="Confirmar venta pagada" />
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

function CancelSale({ sale, close, changed }: { sale: Sale; close: () => void; changed: Changed }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api(`/sales/${sale.id}/cancel`, 'POST', {
        reason: form.get('reason'),
        restock: form.get('restock') === 'on',
      });
      changed('Venta anulada y reembolso total registrado.');
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Anular venta ML-${String(sale.number).padStart(4, '0')}`} onClose={close}>
      <p>
        Esta acción registra un <strong>reembolso total de {money(sale.total)}</strong>. El costo de
        transporte ya pagado se conserva como gasto de entrega.
      </p>
      <form onSubmit={submit}>
        <Field label="Motivo de anulación *">
          <textarea name="reason" required rows={3} maxLength={500} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" name="restock" defaultChecked /> Reincorporar todos los productos
          al inventario.
        </label>
        <p className="small-text muted">
          Desmarca si la mercancía no se recupera o está dañada. La operación permanecerá en el
          historial.
        </p>
        <label className="checkbox">
          <input type="checkbox" required /> Confirmo que realicé el reembolso completo al cliente.
        </label>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close} disabled={busy}>
            Volver
          </button>
          <Save busy={busy} label="Registrar anulación" />
        </div>
      </form>
    </Modal>
  );
}
function Receipt({ sale, close }: { sale: Sale; close: () => void }) {
  return (
    <Modal title={`Venta ML-${String(sale.number).padStart(4, '0')}`} onClose={close} wide>
      <div className="receipt">
        <div className="receipt-brand">
          <BrandLogo />
          <h2>Mai Lashies</h2>
          <span className="receipt-slogan">{BRAND_SLOGAN}</span>
          <p>COMPROBANTE INTERNO · NO ES FACTURA ELECTRÓNICA</p>
        </div>
        <div className="receipt-meta">
          <div>
            <strong>ML-{String(sale.number).padStart(4, '0')}</strong>
            <small>{dateTime(sale.createdAt)}</small>
            <small>Registró: {sale.user.name}</small>
          </div>
          <Badge kind={sale.status === 'PAID' ? 'success' : 'danger'}>
            {sale.status === 'PAID' ? 'Pagada' : 'Anulada'}
          </Badge>
        </div>
        {sale.customer && (
          <p>
            <strong>{sale.customer}</strong>
            {sale.phone && <> · {sale.phone}</>}
            {sale.address && (
              <>
                <br />
                {sale.address}
              </>
            )}
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Precio</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.name}
                    <small>{item.sku}</small>
                  </td>
                  <td>{item.quantity}</td>
                  <td>{money(item.unitPrice)}</td>
                  <td>{money(new Decimal(item.unitPrice).mul(item.quantity).toFixed(2))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="receipt-totals">
          <div>
            <span>Subtotal productos</span>
            <span>{money(sale.subtotal)}</span>
          </div>
          <div>
            <span>Descuento</span>
            <span>−{money(sale.discount)}</span>
          </div>
          {sale.delivery && (
            <div>
              <span>Domicilio</span>
              <span>{money(sale.shippingFee)}</span>
            </div>
          )}
          <div className="grand-total">
            <strong>Total</strong>
            <strong>{money(sale.total)}</strong>
          </div>
          {sale.payments.map((payment, index) => (
            <div key={index}>
              <span>{payment.method}</span>
              <span>{money(payment.amount)}</span>
            </div>
          ))}
        </div>
        {sale.notes && <p className="small-text">Notas: {sale.notes}</p>}
        {sale.status === 'CANCELLED' && (
          <div className="error">
            Anulada: {sale.cancelReason}
            {sale.cancelledAt && ` · ${dateTime(sale.cancelledAt)}`}
          </div>
        )}
        <p className="receipt-thanks">Gracias por ser parte de Mai Lashies ✧</p>
      </div>
      <div className="modal-actions no-print">
        <button className="button secondary" onClick={close}>
          Cerrar
        </button>
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={16} /> Imprimir comprobante
        </button>
      </div>
    </Modal>
  );
}

export function Sales({
  revision,
  changed,
  user,
  deliveryOnly,
  composer,
  closeComposer,
}: {
  revision: number;
  changed: Changed;
  user: User;
  deliveryOnly: boolean;
  composer: boolean;
  closeComposer: () => void;
}) {
  const { data, error, loading } = useQuery<Sale[]>('/sales', revision);
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [receipt, setReceipt] = useState<Sale | null>(null),
    [cancel, setCancel] = useState<Sale | null>(null),
    [updating, setUpdating] = useState(''),
    [actionError, setActionError] = useState('');
  const sales = (data ?? []).filter(
    (sale) =>
      (!deliveryOnly || sale.delivery) &&
      (filter === 'all' ||
        (deliveryOnly
          ? sale.status === 'PAID' && sale.deliveryStatus === filter
          : sale.status === filter)) &&
      `${sale.number} ${sale.customer} ${sale.phone} ${sale.items.map((item) => item.name).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function updateDelivery(sale: Sale, status: string) {
    setUpdating(sale.id);
    setActionError('');
    try {
      await api(`/sales/${sale.id}/delivery`, 'PATCH', { status });
      changed('Estado del domicilio actualizado.');
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setUpdating('');
    }
  }
  return (
    <>
      <div className="section-toolbar">
        <span className="section-caption">
          Últimas 300 ventas registradas{deliveryOnly ? ' · Filtradas por domicilio' : ''}
        </span>
        <Badge kind="success">
          <CheckCircle2 size={13} /> Solo ventas de contado
        </Badge>
      </div>
      <section className="panel">
        <div className="filter-bar">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Buscar ventas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número, cliente o producto…"
            />
          </div>
          <select
            aria-label="Estado de ventas"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            {deliveryOnly ? (
              Object.entries(deliveryLabels).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))
            ) : (
              <>
                <option value="PAID">Pagadas</option>
                <option value="CANCELLED">Anuladas</option>
              </>
            )}
          </select>
        </div>
        <ErrorBox error={error || actionError} />
        {loading ? (
          <Loading />
        ) : sales.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Venta / fecha</th>
                  <th>Cliente / entrega</th>
                  <th>Total COP</th>
                  <th>{deliveryOnly ? 'Estado de entrega' : 'Estado'}</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <strong>ML-{String(sale.number).padStart(4, '0')}</strong>
                      <small>{dateTime(sale.createdAt)}</small>
                      <small>{sale.user.name}</small>
                    </td>
                    <td>
                      <strong>{sale.customer || 'Venta presencial'}</strong>
                      <small>
                        {sale.delivery
                          ? sale.address
                          : `${sale.items.reduce((sum, item) => sum + item.quantity, 0)} artículos · Presencial`}
                      </small>
                      {sale.delivery && (
                        <small>
                          {sale.phone} ·{' '}
                          {sale.status === 'PAID'
                            ? deliveryLabels[sale.deliveryStatus]
                            : 'Cancelado'}
                        </small>
                      )}
                    </td>
                    <td className="tabular strong">{money(sale.total)}</td>
                    <td>
                      {deliveryOnly && sale.status === 'PAID' ? (
                        <select
                          aria-label={`Estado domicilio ML-${sale.number}`}
                          value={sale.deliveryStatus}
                          disabled={updating === sale.id}
                          onChange={(e) => void updateDelivery(sale, e.target.value)}
                        >
                          {Object.entries(deliveryLabels).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge kind={sale.status === 'PAID' ? 'success' : 'danger'}>
                          {sale.status === 'PAID' ? 'Pagada' : 'Anulada'}
                        </Badge>
                      )}
                    </td>
                    <td>
                      <div className="button-row">
                        <button
                          className="icon-button"
                          title="Ver comprobante"
                          aria-label={`Ver venta ML-${sale.number}`}
                          onClick={() => setReceipt(sale)}
                        >
                          <Eye size={18} />
                        </button>
                        {user.role === 'SUPERADMIN' && sale.status === 'PAID' && (
                          <button
                            className="icon-button"
                            title="Anular y reembolsar"
                            aria-label={`Anular venta ML-${sale.number}`}
                            onClick={() => setCancel(sale)}
                          >
                            <Ban size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              deliveryOnly ? 'Tus próximos domicilios, aquí' : 'Todo listo para tu primera venta'
            }
          >
            {deliveryOnly
              ? 'Los domicilios con pago anticipado aparecerán aquí para gestionar su entrega.'
              : 'Usa Registrar venta para seleccionar productos y confirmar el pago recibido.'}
          </Empty>
        )}
      </section>
      {composer && (
        <SaleComposer
          close={closeComposer}
          changed={changed}
          onCreated={setReceipt}
          revision={revision}
        />
      )}
      {receipt && <Receipt sale={receipt} close={() => setReceipt(null)} />}
      {cancel && <CancelSale sale={cancel} close={() => setCancel(null)} changed={changed} />}
    </>
  );
}
