import { useState, type FormEvent } from 'react';
import { Plus, ShieldCheck, UserRound, KeyRound } from 'lucide-react';
import { api, dateTime } from './api';
import { useQuery } from './useQuery';
import type { User, Audit } from './types';
import type { Changed } from './App';
import { Badge, ErrorBox, Field, Loading, Modal, Save, Empty } from './components';
const entityLabels: Record<string, string> = {
  User: 'Cuenta',
  Product: 'Producto',
  Sale: 'Venta',
  Expense: 'Gasto',
};
const actionLabels: Record<string, string> = {
  CREATED: 'Registro',
  UPDATED: 'Actualización',
  PASSWORD_CHANGED: 'Cambio de contraseña',
  STOCK: 'Inventario',
  PAID: 'Pago registrado',
  DELIVERY: 'Entrega',
  REFUND: 'Reembolso',
  VOIDED: 'Anulación',
};
function UserForm({
  user,
  close,
  changed,
}: {
  user: User | null;
  close: () => void;
  changed: Changed;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = user
      ? {
          role: values.role,
          active: values.active === 'on',
          ...(values.password ? { password: values.password } : {}),
        }
      : values;
    try {
      await api(user ? `/users/${user.id}` : '/users', user ? 'PATCH' : 'POST', body);
      changed(
        user
          ? 'Cuenta actualizada. Sus sesiones anteriores fueron cerradas.'
          : 'Cuenta creada. Comparte el acceso directamente con esa persona.',
      );
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={user ? 'Administrar cuenta' : 'Invitar a tu equipo'} onClose={close}>
      <form onSubmit={submit}>
        {user ? (
          <p>
            <strong>{user.name}</strong>
            <br />
            {user.email}
          </p>
        ) : (
          <>
            <Field label="Nombre *">
              <input name="name" required maxLength={100} />
            </Field>
            <Field label="Correo *">
              <input name="email" type="email" required maxLength={180} />
            </Field>
          </>
        )}
        <Field label="Rol">
          <select name="role" defaultValue={user?.role ?? 'BASIC'}>
            <option value="BASIC">Básico · Operación, costos y ganancias</option>
            <option value="SUPERADMIN">Superadministrador · Control completo</option>
          </select>
        </Field>
        <Field
          label={user ? 'Restablecer contraseña (opcional)' : 'Contraseña inicial *'}
          hint="Mínimo 12 caracteres. La persona podrá cambiarla al ingresar."
        >
          <input
            name="password"
            type="password"
            required={!user}
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </Field>
        {user && (
          <label className="checkbox">
            <input type="checkbox" name="active" defaultChecked={user.active} /> Cuenta activa
          </label>
        )}
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <Save busy={busy} label={user ? 'Guardar cambios' : 'Crear cuenta'} />
        </div>
      </form>
    </Modal>
  );
}
function PasswordForm({ onChanged }: { onChanged: () => void }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (data.password !== data.confirm) {
      setError('Las contraseñas nuevas no coinciden.');
      setBusy(false);
      return;
    }
    try {
      await api('/auth/password', 'POST', data);
      onChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-card">
      <div className="panel-heading">
        <div>
          <h2>Tu contraseña</h2>
          <p>Al cambiarla, volverás a iniciar sesión.</p>
        </div>
        <KeyRound size={20} />
      </div>
      <form onSubmit={submit}>
        <Field label="Contraseña actual">
          <input
            name="currentPassword"
            type="password"
            required
            maxLength={256}
            autoComplete="current-password"
          />
        </Field>
        <div className="form-grid">
          <Field label="Nueva contraseña">
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirma la nueva contraseña">
            <input
              name="confirm"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <ErrorBox error={error} />
        <Save busy={busy} label="Actualizar contraseña" />
      </form>
    </section>
  );
}
function Team({ revision, changed }: { revision: number; changed: Changed }) {
  const users = useQuery<User[]>('/users', revision),
    audits = useQuery<Audit[]>('/audit', revision);
  const [form, setForm] = useState<{ user: User | null } | null>(null),
    [history, setHistory] = useState(false);
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Las personas de Mai</h2>
            <p>Cada cuenta tiene su propio acceso e historial.</p>
          </div>
          <button className="button primary" onClick={() => setForm({ user: null })}>
            <Plus size={16} /> Crear cuenta
          </button>
        </div>
        <ErrorBox error={users.error} />
        {users.loading ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.data?.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </td>
                    <td>{user.role === 'SUPERADMIN' ? 'Superadministrador' : 'Básico'}</td>
                    <td>
                      <Badge kind={user.active ? 'success' : ''}>
                        {user.active ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </td>
                    <td>
                      <button className="text-button" onClick={() => setForm({ user })}>
                        Administrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <button className="button secondary" onClick={() => setHistory(true)}>
        Consultar historial de actividad
      </button>
      {form && <UserForm user={form.user} close={() => setForm(null)} changed={changed} />}
      {history && (
        <Modal title="Actividad del negocio" onClose={() => setHistory(false)} wide>
          <p className="muted">Últimas 200 operaciones, con fecha y responsable.</p>
          <ErrorBox error={audits.error} />
          {audits.loading ? (
            <Loading />
          ) : audits.data?.length ? (
            <div className="audit-list">
              {audits.data.map((item) => (
                <article key={item.id}>
                  <div>
                    <Badge>
                      {entityLabels[item.entity] ?? item.entity} ·{' '}
                      {actionLabels[item.action] ?? item.action}
                    </Badge>
                    <small>
                      {dateTime(item.createdAt)} · {item.user.name}
                    </small>
                  </div>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <Empty title="Sin actividad todavía">Las operaciones aparecerán aquí.</Empty>
          )}
        </Modal>
      )}
    </>
  );
}
export function SettingsPage({
  user,
  revision,
  changed,
  onPasswordChanged,
}: {
  user: User;
  revision: number;
  changed: Changed;
  onPasswordChanged: () => void;
}) {
  return (
    <div className="settings-layout">
      <section className="panel profile-card">
        <span className="stat-icon rose">
          <UserRound size={24} />
        </span>
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <Badge kind="success">
            <ShieldCheck size={13} />
            {user.role === 'SUPERADMIN' ? 'Superadministrador' : 'Rol básico'}
          </Badge>
        </div>
        <div className="profile-locale">
          <strong>Colombia · COP</strong>
          <small>America/Bogota</small>
          <small>Domicilios con pago anticipado</small>
        </div>
      </section>
      <PasswordForm onChanged={onPasswordChanged} />
      {user.role === 'SUPERADMIN' && <Team revision={revision} changed={changed} />}
    </div>
  );
}
