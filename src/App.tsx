import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Truck,
  Wallet,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
  Flower2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { api, setCsrf } from './api';
import type { User } from './types';
import { ErrorBox, Field, Loading, Save } from './components';
import { Dashboard } from './Dashboard';
import { BrandLogo, BRAND_SLOGAN } from './BrandLogo';
const Products = lazy(() => import('./Products').then((module) => ({ default: module.Products })));
const Sales = lazy(() => import('./Sales').then((module) => ({ default: module.Sales })));
const Finance = lazy(() => import('./Finance').then((module) => ({ default: module.Finance })));
const SettingsPage = lazy(() =>
  import('./Settings').then((module) => ({ default: module.SettingsPage })),
);
export type Changed = (message: string) => void;
const hosted = import.meta.env.VITE_APP_HOSTED === 'true';
type Page = 'home' | 'products' | 'sales' | 'deliveries' | 'expenses' | 'reports' | 'settings';
const pages = [
  {
    id: 'home',
    label: 'Mi negocio',
    icon: LayoutDashboard,
    title: 'Un vistazo a tu negocio',
    subtitle: 'Cada pequeño avance cuenta. Aquí puedes ver el tuyo.',
  },
  {
    id: 'products',
    label: 'Productos e inventario',
    icon: Package,
    title: 'Todo en su lugar',
    subtitle: 'Tus productos, sus costos y cada movimiento de inventario.',
  },
  {
    id: 'sales',
    label: 'Ventas',
    icon: ShoppingBag,
    title: 'Cada venta, bien registrada',
    subtitle: 'Registra lo que vendes y mantén tus cuentas al día.',
  },
  {
    id: 'deliveries',
    label: 'Domicilios',
    icon: Truck,
    title: 'Belleza en camino',
    subtitle: 'Acompaña tus pedidos desde la preparación hasta la entrega.',
  },
  {
    id: 'expenses',
    label: 'Gastos',
    icon: Wallet,
    title: 'Tus gastos, con claridad',
    subtitle: 'Conoce en qué se invierte el dinero de tu negocio.',
  },
  {
    id: 'reports',
    label: 'Reportes',
    icon: ChartNoAxesCombined,
    title: 'Los números de Mai',
    subtitle: 'Ventas, costos y resultados para tomar decisiones con calma.',
  },
  {
    id: 'settings',
    label: 'Configuración',
    icon: Settings,
    title: 'Tu espacio de trabajo',
    subtitle: 'Administra tu cuenta y las personas que te acompañan.',
  },
] as const;

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: User; csrf: string }>(
        '/auth/login',
        'POST',
        Object.fromEntries(data),
      );
      setCsrf(result.csrf);
      onLogin(result.user);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="login-brand-heading">
          <Sparkles size={18} aria-hidden="true" />
          <span>EL UNIVERSO DE MAI LASHIES</span>
          <span className="brand-heart" aria-hidden="true">
            ♡
          </span>
        </div>
        <div className="login-brand-feature">
          <div className="login-artwork">
            <BrandLogo />
          </div>
          <h1>
            {BRAND_SLOGAN}
            <span aria-hidden="true"> ✧</span>
          </h1>
          <p>Tu esencia, tu negocio y todo lo que sueñas construir.</p>
        </div>
        <span className="story-foot">
          <Sparkles size={16} aria-hidden="true" /> Un poquito de brillo en cada día
        </span>
      </section>
      <section className="login-form">
        <div className="login-card">
          <span className="eyebrow">BIENVENIDA A TU ESPACIO</span>
          <h2>Qué bueno verte.</h2>
          <p>Ingresa a la administración de Mai Lashies.</p>
          <form onSubmit={submit}>
            <Field label="Correo electrónico">
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="tu@correo.com"
                required
                maxLength={180}
              />
            </Field>
            <Field label="Contraseña">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Tu contraseña"
                required
                maxLength={256}
              />
            </Field>
            <ErrorBox error={error} />
            <Save busy={busy} label="Ingresar a mi negocio" />
          </form>
          <div className="login-help">
            {hosted ? (
              <>
                Si necesitas una cuenta o restablecer tu contraseña, comunícate con la persona que
                administra Mai Lashies.
              </>
            ) : (
              <>
                ¿Primer ingreso? Encuentra tu cuenta inicial en el archivo{' '}
                <strong>.local/ACCESO.txt</strong> del proyecto. Si olvidaste tu clave, solicita un
                restablecimiento al superadministrador.
              </>
            )}
          </div>
        </div>
        <small className="local-note">
          <span />{' '}
          {hosted
            ? 'Acceso privado · Solo para el equipo'
            : 'Entorno local · Acceso solo para el equipo'}
        </small>
      </section>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [booting, setBooting] = useState(true),
    [page, setPage] = useState<Page>('home'),
    [mobile, setMobile] = useState(false),
    [revision, setRevision] = useState(0),
    [toast, setToast] = useState(''),
    [composer, setComposer] = useState(false);
  useEffect(() => {
    api<{ user: User; csrf: string }>('/auth/me')
      .then((result) => {
        setCsrf(result.csrf);
        setUser(result.user);
      })
      .finally(() => setBooting(false))
      .catch(() => {});
    const expired = () => {
      setUser(null);
      setCsrf('');
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const changed: Changed = (message) => {
    setRevision((value) => value + 1);
    setToast(message);
  };
  const navigate = (next: Page) => {
    setPage(next);
    setMobile(false);
  };
  async function logout() {
    try {
      await api('/auth/logout', 'POST');
      setUser(null);
      setCsrf('');
    } catch (error) {
      setToast((error as Error).message);
    }
  }
  if (booting) return <Loading />;
  if (!user)
    return (
      <Login
        onLogin={(value) => {
          setUser(value);
          setPage('home');
          setComposer(false);
          setRevision((value) => value + 1);
        }}
      />
    );
  const current = pages.find((item) => item.id === page)!;
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <a
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate('home');
          }}
          className="brand"
        >
          <BrandLogo decorative />
          <div>
            <strong>Mai Lashies</strong>
            <small>{BRAND_SLOGAN}</small>
          </div>
        </a>
        <div className="workspace-label">ADMINISTRACIÓN</div>
        <nav aria-label="Navegación principal">
          {pages.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <item.icon size={19} />
              {item.label}
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <Flower2 size={23} />
            <p>
              {BRAND_SLOGAN}
              <br />
              <strong>Hecho con amor, hecho por Mai.</strong>
            </p>
          </div>
          <div className="user-block">
            <span className="avatar">
              {user.name
                .split(' ')
                .slice(0, 2)
                .map((v) => v[0])
                .join('')}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role === 'SUPERADMIN' ? 'Superadministrador' : 'Rol básico'}</small>
            </div>
            <button className="icon-button" aria-label="Cerrar sesión" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-toggle"
              aria-label="Abrir menú"
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
            <span>
              Mi espacio <span className="slash">/</span> <strong>{current.label}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="local-pill">
              <i /> {hosted ? 'En línea' : 'Local'}
            </span>
            <span className="currency-label">COP · Colombia</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                MAI LASHIES · {page === 'home' ? 'BIENVENIDA' : current.label.toUpperCase()}
              </span>
              <h1>{current.title}</h1>
              <p>{current.subtitle}</p>
            </div>
            {page !== 'settings' && (
              <button
                className="button primary"
                onClick={() => {
                  setComposer(true);
                  navigate('sales');
                }}
              >
                <ShoppingBag size={17} /> Registrar venta <ArrowUpRight size={16} />
              </button>
            )}
          </div>
          <Suspense fallback={<Loading />}>
            {page === 'home' && <Dashboard revision={revision} onNavigate={navigate} />}
            {page === 'products' && <Products revision={revision} changed={changed} />}
            {(page === 'sales' || page === 'deliveries') && (
              <Sales
                revision={revision}
                changed={changed}
                user={user}
                deliveryOnly={page === 'deliveries'}
                composer={composer}
                closeComposer={() => setComposer(false)}
              />
            )}
            {(page === 'expenses' || page === 'reports') && (
              <Finance
                revision={revision}
                changed={changed}
                user={user}
                reports={page === 'reports'}
              />
            )}
            {page === 'settings' && (
              <SettingsPage
                user={user}
                revision={revision}
                changed={changed}
                onPasswordChanged={() => {
                  setUser(null);
                  setCsrf('');
                }}
              />
            )}
          </Suspense>
          <footer className="page-footer">
            <span>
              Mai Lashies <span>✧</span> {BRAND_SLOGAN}
            </span>
            <span>Control interno · Hora de Colombia</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button className="icon-button" aria-label="Cerrar aviso" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
