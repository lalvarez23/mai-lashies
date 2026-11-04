import { useState, type FormEvent } from 'react';
import { Plus, Search, SlidersHorizontal, Pencil, ArrowDownUp, History } from 'lucide-react';
import { api, money, dateTime, methods } from './api';
import { useQuery } from './useQuery';
import type { Product, Movement } from './types';
import type { Changed } from './App';
import { Modal, Field, Save, Empty, ErrorBox, Loading, Badge } from './components';

function ProductForm({
  product,
  close,
  changed,
}: {
  product: Product | null;
  close: () => void;
  changed: Changed;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(form);
    body.minStock = Number(body.minStock);
    if (product) {
      body.active = body.active === 'on';
      if (body.costCorrection === '') delete body.costCorrection;
    } else body.initialStock = Number(body.initialStock);
    setBusy(true);
    setError('');
    try {
      await api(
        product ? `/products/${product.id}` : '/products',
        product ? 'PATCH' : 'POST',
        body,
      );
      changed(product ? 'Producto actualizado.' : 'Producto registrado en tu inventario.');
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={product ? 'Editar producto' : 'Un nuevo producto'} onClose={close} wide>
      <form onSubmit={submit}>
        <div className="form-section-label">LOS DATOS PRINCIPALES</div>
        <div className="form-grid">
          <Field label="Nombre del producto *">
            <input
              name="name"
              defaultValue={product?.name}
              placeholder="Ej. Brillo labial"
              required
              maxLength={180}
            />
          </Field>
          <Field label="Código / SKU" hint="Si lo dejas vacío, generamos uno.">
            <input
              name="sku"
              defaultValue={product?.sku}
              placeholder="Ej. ML-LAB-001"
              maxLength={60}
              required={Boolean(product)}
            />
          </Field>
          <Field label="Categoría *">
            <input
              name="category"
              list="categories"
              defaultValue={product?.category}
              placeholder="Selecciona o escribe una categoría"
              required
              maxLength={60}
            />
            <datalist id="categories">
              <option>Belleza</option>
              <option>Maquillaje</option>
              <option>Cuidado facial</option>
              <option>Accesorios</option>
              <option>Pestañas</option>
              <option>Cuidado capilar</option>
            </datalist>
          </Field>
          <Field label="Marca">
            <input
              name="brand"
              defaultValue={product?.brand}
              maxLength={100}
              placeholder="Opcional"
            />
          </Field>
          <Field
            label="Variante / presentación"
            hint="Cada variante se registra con su propio código y stock."
          >
            <input
              name="variant"
              defaultValue={product?.variant}
              maxLength={150}
              placeholder="Ej. Rosa · 5 ml"
            />
          </Field>
          <Field label="Proveedor">
            <input
              name="supplier"
              defaultValue={product?.supplier}
              maxLength={150}
              placeholder="Nombre del proveedor"
            />
          </Field>
        </div>
        <Field label="Descripción">
          <textarea
            name="description"
            defaultValue={product?.description}
            maxLength={1000}
            rows={2}
            placeholder="Detalles que te ayuden a identificarlo"
          />
        </Field>
        <div className="form-section-label">PRECIOS E INVENTARIO · COP</div>
        <div className="form-grid">
          {!product ? (
            <>
              <Field label="Costo por unidad *">
                <input
                  name="cost"
                  type="number"
                  min="0"
                  max="999999999999"
                  step="0.01"
                  required
                  placeholder="0"
                />
              </Field>
              <Field label="Existencias iniciales *">
                <input
                  name="initialStock"
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  defaultValue="0"
                  required
                />
              </Field>
            </>
          ) : (
            <div className="info-note full">
              Costo promedio actual: <strong>{money(product.cost)}</strong>. Las compras actualizan
              el promedio; el historial de ventas conserva su costo original.
            </div>
          )}
          <Field label="Precio de venta *">
            <input
              name="price"
              type="number"
              min="0"
              max="999999999999"
              step="0.01"
              defaultValue={product?.price}
              required
              placeholder="0"
            />
          </Field>
          <Field label="Alerta de stock mínimo *">
            <input
              name="minStock"
              type="number"
              min="0"
              max="1000000"
              step="1"
              defaultValue={product?.minStock ?? 3}
              required
            />
          </Field>
        </div>
        {product && (
          <>
            <label className="checkbox">
              <input name="active" type="checkbox" defaultChecked={product.active} /> Producto
              activo para vender
            </label>
            <Field
              label="Corregir costo promedio COP (opcional)"
              hint="Solo para corregir un dato incorrecto. Las compras se registran como movimientos; las ventas anteriores conservan su costo."
            >
              <input
                name="costCorrection"
                type="number"
                min="0"
                max="999999999999"
                step="0.01"
                placeholder="Mantener el costo actual"
              />
            </Field>
            <Field label="Motivo del cambio *">
              <input
                name="reason"
                required
                maxLength={500}
                placeholder="Ej. Actualización de precio"
              />
            </Field>
          </>
        )}
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <Save busy={busy} label={product ? 'Guardar cambios' : 'Registrar producto'} />
        </div>
      </form>
    </Modal>
  );
}
function StockForm({
  product,
  close,
  changed,
}: {
  product: Product;
  close: () => void;
  changed: Changed;
}) {
  const [kind, setKind] = useState('PURCHASE'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/products/${product.id}/stock`, 'POST', {
        ...body,
        quantity: Number(body.quantity),
        kind,
      });
      changed('Movimiento de inventario registrado.');
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Mover inventario" onClose={close}>
      <div className="info-note">
        <strong>{product.name}</strong>
        <br />
        {product.stock} unidades actuales · Costo promedio {money(product.cost)}
      </div>
      <form onSubmit={submit}>
        <Field label="Tipo de movimiento">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="PURCHASE">Compra de mercancía pagada</option>
            <option value="ADJUSTMENT">Ajuste de inventario</option>
          </select>
        </Field>
        <Field
          label={kind === 'PURCHASE' ? 'Unidades compradas *' : 'Cantidad del ajuste *'}
          hint={
            kind === 'ADJUSTMENT'
              ? 'Positivo para sumar; negativo para retirar. No representa entrada o salida de dinero.'
              : 'La compra registra salida de dinero y actualiza el costo promedio.'
          }
        >
          <input
            name="quantity"
            type="number"
            min={kind === 'PURCHASE' ? 1 : -1000000}
            max="1000000"
            step="1"
            required
          />
        </Field>
        {kind === 'PURCHASE' && (
          <div className="form-grid">
            <Field label="Costo unitario COP *">
              <input
                name="unitCost"
                type="number"
                min="0"
                max="999999999999"
                step="0.01"
                defaultValue={Number(product.cost).toFixed(2)}
                required
              />
            </Field>
            <Field label="Medio de pago">
              <select name="method">
                {methods.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="Motivo / referencia *">
          <textarea
            name="reason"
            required
            rows={2}
            maxLength={500}
            placeholder="Ej. Reposición del proveedor o ajuste por daño"
          />
        </Field>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <Save busy={busy} label="Registrar movimiento" />
        </div>
      </form>
    </Modal>
  );
}
export function Products({ revision, changed }: { revision: number; changed: Changed }) {
  const { data, error, loading } = useQuery<Product[]>('/products', revision);
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('active'),
    [category, setCategory] = useState(''),
    [form, setForm] = useState<{ product: Product | null } | null>(null),
    [stock, setStock] = useState<Product | null>(null),
    [history, setHistory] = useState(false);
  const movements = useQuery<Movement[]>(
    history ? '/movements' : '/movements?productId=00000000-0000-4000-8000-000000000000',
    revision,
  );
  const products = (data ?? []).filter(
    (p) =>
      (filter === 'all' || filter === 'inactive' ? filter === 'all' || !p.active : p.active) &&
      (filter !== 'low' || p.stock <= p.minStock) &&
      (!category || p.category === category) &&
      `${p.name} ${p.sku} ${p.brand} ${p.variant}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="section-toolbar">
        <div className="section-caption">
          {data?.filter((p) => p.active).length ?? 0} productos activos
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={() => setHistory(true)}>
            <History size={16} /> Movimientos
          </button>
          <button className="button primary" onClick={() => setForm({ product: null })}>
            <Plus size={17} /> Agregar producto
          </button>
        </div>
      </div>
      <section className="panel">
        <div className="filter-bar">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Buscar productos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, código o marca…"
            />
          </div>
          <select
            aria-label="Categoría"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {[...new Set(data?.map((p) => p.category))].sort().map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="Estado del inventario"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="active">Activos</option>
            <option value="low">Stock bajo</option>
            <option value="inactive">Inactivos</option>
            <option value="all">Todos</option>
          </select>
        </div>
        <ErrorBox error={error} />
        {loading ? (
          <Loading />
        ) : products.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Costo promedio</th>
                  <th>Precio</th>
                  <th>Existencias</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="product-cell">
                        <span className="product-avatar">{product.name[0]}</span>
                        <div>
                          <strong>{product.name}</strong>
                          <small>
                            {product.sku}
                            {product.variant ? ` · ${product.variant}` : ''}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {product.category}
                      {!product.active && (
                        <div>
                          <Badge>Inactivo</Badge>
                        </div>
                      )}
                    </td>
                    <td className="tabular">{money(product.cost)}</td>
                    <td className="tabular strong">{money(product.price)}</td>
                    <td>
                      <Badge
                        kind={
                          product.stock === 0
                            ? 'danger'
                            : product.stock <= product.minStock
                              ? 'warning'
                              : 'success'
                        }
                      >
                        {product.stock} unidades
                      </Badge>
                    </td>
                    <td>
                      <div className="button-row">
                        <button
                          className="icon-button"
                          title="Editar producto"
                          aria-label={`Editar ${product.name}`}
                          onClick={() => setForm({ product })}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          disabled={!product.active}
                          className="icon-button"
                          title="Mover inventario"
                          aria-label={`Mover inventario de ${product.name}`}
                          onClick={() => setStock(product)}
                        >
                          <ArrowDownUp size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={data?.length ? 'No encontramos productos' : 'Tu inventario empieza aquí'}
            action={
              <button className="button primary" onClick={() => setForm({ product: null })}>
                <Plus size={16} /> Agregar producto
              </button>
            }
          >
            {data?.length
              ? 'Prueba otro filtro o una búsqueda diferente.'
              : 'Registra tus productos reales para empezar a organizar Mai Lashies.'}
          </Empty>
        )}
      </section>
      {form && <ProductForm product={form.product} close={() => setForm(null)} changed={changed} />}
      {stock && <StockForm product={stock} close={() => setStock(null)} changed={changed} />}
      {history && (
        <Modal title="Historial de inventario" onClose={() => setHistory(false)} wide>
          <p className="muted">
            Últimos 250 movimientos. Las existencias iniciales y los ajustes no se registran como
            gastos.
          </p>
          <ErrorBox error={movements.error} />
          {movements.loading ? (
            <Loading />
          ) : movements.data?.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fecha / persona</th>
                    <th>Producto / motivo</th>
                    <th>Cantidad</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.data.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {dateTime(item.createdAt)}
                        <small>{item.user.name}</small>
                      </td>
                      <td>
                        <strong>{item.product.name}</strong>
                        <small>{item.reason}</small>
                      </td>
                      <td className={item.quantity > 0 ? 'positive' : 'negative'}>
                        {item.quantity > 0 ? '+' : ''}
                        {item.quantity}
                      </td>
                      <td>
                        {
                          (
                            {
                              INITIAL: 'Inicial',
                              PURCHASE: 'Compra',
                              ADJUSTMENT: 'Ajuste',
                              SALE: 'Venta',
                              RETURN: 'Devolución',
                              COST_CORRECTION: 'Corrección de costo',
                            } as Record<string, string>
                          )[item.kind]
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Sin movimientos todavía">
              Cada entrada y salida aparecerá aquí con su responsable.
            </Empty>
          )}
        </Modal>
      )}
    </>
  );
}
