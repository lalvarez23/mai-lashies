import { useState, type FormEvent } from 'react';
import { Plus, Download, Ban } from 'lucide-react';
import { api, dateTime, methods, money, today } from './api';
import { useQuery } from './useQuery';
import { Empty, ErrorBox, Field, Loading, Modal, Save, Badge } from './components';
import { PeriodPicker, SalesChart, Stats, usePeriod } from './Dashboard';
import type { Expense, Report, User } from './types';
import type { Changed } from './App';

function ExpenseForm({ close, changed }: { close: () => void; changed: Changed }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/expenses', 'POST', data);
      changed('Gasto registrado.');
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Registrar un gasto" onClose={close}>
      <div className="info-note">
        Las compras de mercancía se registran desde{' '}
        <strong>Productos e inventario → Mover inventario</strong> para actualizar existencias y
        costos.
      </div>
      <form onSubmit={submit}>
        <Field label="Descripción *">
          <input
            name="description"
            required
            maxLength={500}
            placeholder="Ej. Empaques para pedidos"
          />
        </Field>
        <div className="form-grid">
          <Field label="Categoría *">
            <input
              name="category"
              list="expense-categories"
              required
              maxLength={80}
              placeholder="Selecciona o escribe"
            />
            <datalist id="expense-categories">
              <option>Empaques</option>
              <option>Publicidad</option>
              <option>Servicios</option>
              <option>Arriendo</option>
              <option>Transporte general</option>
              <option>Otros</option>
            </datalist>
          </Field>
          <Field label="Valor COP *">
            <input name="amount" type="number" min="0.01" max="999999999999" step="0.01" required />
          </Field>
          <Field label="Fecha *">
            <input name="date" type="date" defaultValue={today()} max={today()} required />
          </Field>
          <Field label="Medio de pago">
            <select name="method">
              {methods.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <Save busy={busy} label="Registrar gasto" />
        </div>
      </form>
    </Modal>
  );
}
function VoidExpense({
  expense,
  close,
  changed,
}: {
  expense: Expense;
  close: () => void;
  changed: Changed;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(
        `/expenses/${expense.id}/void`,
        'POST',
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      changed('Gasto anulado con registro en el historial.');
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Anular gasto" onClose={close}>
      <p>
        {expense.description} · <strong>{money(expense.amount)}</strong>
      </p>
      <p className="muted">
        Se registrará la reversa en la fecha actual. Úsala para corregir un gasto incorrecto; un
        pago real que no fue recuperado debe permanecer registrado.
      </p>
      <form onSubmit={submit}>
        <Field label="Motivo *">
          <textarea name="reason" required maxLength={500} rows={3} />
        </Field>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close} disabled={busy}>
            Volver
          </button>
          <Save busy={busy} label="Anular gasto" />
        </div>
      </form>
    </Modal>
  );
}
function Reports({ revision }: { revision: number }) {
  const period = usePeriod();
  const { data, error, loading } = useQuery<Report>(
    `/reports?from=${period.from}&to=${period.to}`,
    revision,
  );
  return (
    <>
      <div className="section-toolbar">
        <PeriodPicker period={period} />
        <a
          className="button secondary"
          href={`/api/reports/export?from=${period.from}&to=${period.to}`}
        >
          <Download size={16} /> Exportar CSV
        </a>
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <Stats data={data} />
            <div className="dashboard-middle reports-columns">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Resultados del período</h2>
                    <p>Valores en COP · Semana de lunes a domingo</p>
                  </div>
                </div>
                <div className="financial-list">
                  {[
                    { label: 'Ventas netas de productos', value: data.netSales },
                    { label: '− Costo de unidades vendidas', value: data.costs },
                    { label: 'Utilidad bruta', value: data.grossProfit, emphasis: true },
                    { label: '+ Domicilios cobrados', value: data.shippingIncome },
                    { label: '− Costo de domicilios pagado', value: data.shippingCosts },
                    { label: '− Gastos operativos', value: data.expenses },
                    {
                      label: 'Resultado operativo estimado',
                      value: data.operatingProfit,
                      emphasis: true,
                    },
                  ].map((row) => (
                    <div key={row.label} className={row.emphasis ? 'emphasis' : ''}>
                      <span>{row.label}</span>
                      <strong>{money(row.value)}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Movimiento de dinero</h2>
                    <p>Entradas y salidas registradas en el período.</p>
                  </div>
                </div>
                <div className="financial-list">
                  {[
                    { label: 'Cobros recibidos', value: data.collections },
                    { label: '− Reembolsos a clientes', value: data.refunds },
                    { label: '− Compras de mercancía', value: data.purchasePayments },
                    { label: '− Costos de domicilios', value: data.shippingCosts },
                    { label: '− Gastos operativos', value: data.expenses },
                    { label: 'Flujo neto registrado', value: data.cashFlow, emphasis: true },
                  ].map((row) => (
                    <div key={row.label} className={row.emphasis ? 'emphasis' : ''}>
                      <span>{row.label}</span>
                      <strong>{money(row.value)}</strong>
                    </div>
                  ))}
                </div>
                <p className="panel-note">
                  Este flujo no es el saldo de caja: no incluye saldos iniciales, aportes o retiros
                  de las propietarias.
                </p>
              </section>
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Ventas día a día</h2>
                  <p>Los reembolsos se descuentan en la fecha en que se registran.</p>
                </div>
              </div>
              <SalesChart data={data} />
            </section>
            <div className="info-note report-notes">
              <strong>Cómo leer tus cifras</strong>
              <p>
                Las ventas usan su fecha de registro; los gastos, la fecha indicada; las compras, su
                fecha de entrada. Se agrupan en horario de Colombia. El inventario muestra su valor
                actual, aunque consultes otro período.
              </p>
              <p>
                Las compras de mercancía afectan el flujo de dinero. Su costo afecta la utilidad
                cuando los productos se venden. Los costos de domicilio se consideran pagados al
                registrar la venta; evita registrarlos otra vez como gasto.
              </p>
              <p>
                Control administrativo interno: el resultado es estimado y depende de que todos los
                costos y gastos estén registrados.
              </p>
            </div>
          </>
        )
      )}
    </>
  );
}
export function Finance({
  reports,
  revision,
  changed,
  user,
}: {
  reports: boolean;
  revision: number;
  changed: Changed;
  user: User;
}) {
  const expenses = useQuery<Expense[]>('/expenses', revision);
  const [form, setForm] = useState(false),
    [voidExpense, setVoidExpense] = useState<Expense | null>(null);
  if (reports) return <Reports revision={revision} />;
  return (
    <>
      <div className="section-toolbar">
        <span className="section-caption">Últimos 300 gastos registrados</span>
        <button className="button primary" onClick={() => setForm(true)}>
          <Plus size={17} /> Registrar gasto
        </button>
      </div>
      <section className="panel">
        <ErrorBox error={expenses.error} />
        {expenses.loading ? (
          <Loading />
        ) : expenses.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Gasto / categoría</th>
                  <th>Fecha</th>
                  <th>Valor COP</th>
                  <th>Pago</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {expenses.data.map((expense) => (
                  <tr key={expense.id}>
                    <td>
                      <strong>{expense.description}</strong>
                      <small>{expense.category}</small>
                    </td>
                    <td>
                      {dateTime(expense.occurredAt)}
                      <small>{expense.user.name}</small>
                    </td>
                    <td className="tabular strong">{money(expense.amount)}</td>
                    <td>{expense.method}</td>
                    <td>
                      <Badge kind={expense.voidedAt ? 'danger' : 'success'}>
                        {expense.voidedAt ? 'Anulado' : 'Registrado'}
                      </Badge>
                    </td>
                    <td>
                      {user.role === 'SUPERADMIN' && !expense.voidedAt && (
                        <button
                          className="icon-button"
                          aria-label={`Anular gasto ${expense.description}`}
                          onClick={() => setVoidExpense(expense)}
                        >
                          <Ban size={17} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Cada gasto tiene su lugar">
            Registra los gastos operativos para conocer mejor el resultado de tu negocio.
          </Empty>
        )}
      </section>
      {form && <ExpenseForm close={() => setForm(false)} changed={changed} />}
      {voidExpense && (
        <VoidExpense expense={voidExpense} close={() => setVoidExpense(null)} changed={changed} />
      )}
    </>
  );
}
