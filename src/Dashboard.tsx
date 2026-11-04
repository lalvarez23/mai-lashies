import { useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ShoppingBag,
  Wallet,
  TrendingUp,
  Package,
  Download,
} from 'lucide-react';
import { useQuery } from './useQuery';
import { money, today } from './api';
import type { Report } from './types';
import { Empty, ErrorBox, Loading, Badge } from './components';
import { BrandLogo, BRAND_SLOGAN } from './BrandLogo';

export function usePeriod() {
  const now = today();
  const [preset, setPreset] = useState('month'),
    [from, setFrom] = useState(now.slice(0, 7) + '-01'),
    [to, setTo] = useState(now);
  function select(value: string) {
    setPreset(value);
    if (value === 'custom') return;
    const current = today();
    setTo(current);
    if (value === 'today') setFrom(current);
    if (value === 'month') setFrom(current.slice(0, 7) + '-01');
    if (value === 'week') {
      const date = new Date(`${current}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      setFrom(date.toISOString().slice(0, 10));
    }
  }
  return { preset, from, to, setFrom, setTo, select };
}
export function PeriodPicker({ period }: { period: ReturnType<typeof usePeriod> }) {
  return (
    <div className="period-picker">
      <select
        aria-label="Período del reporte"
        value={period.preset}
        onChange={(e) => period.select(e.target.value)}
      >
        <option value="today">Hoy</option>
        <option value="week">Esta semana</option>
        <option value="month">Este mes</option>
        <option value="custom">Personalizado</option>
      </select>
      <label>
        <span>Desde</span>
        <input
          aria-label="Fecha inicial"
          type="date"
          value={period.from}
          onChange={(e) => {
            period.select('custom');
            period.setFrom(e.target.value);
          }}
        />
      </label>
      <label>
        <span>Hasta</span>
        <input
          aria-label="Fecha final"
          type="date"
          value={period.to}
          onChange={(e) => {
            period.select('custom');
            period.setTo(e.target.value);
          }}
        />
      </label>
    </div>
  );
}
export function Stats({ data }: { data: Report }) {
  const values = [
    {
      label: 'Ventas netas',
      value: money(data.netSales),
      text: `${data.count} ventas registradas en el período`,
      icon: ShoppingBag,
      color: 'rose',
    },
    {
      label: 'Resultado operativo',
      value: money(data.operatingProfit),
      text: 'Estimado después de costos y gastos',
      icon: TrendingUp,
      color: 'sage',
    },
    {
      label: 'Gastos operativos',
      value: money(data.expenses),
      text: 'Sin compras de mercancía ni envíos',
      icon: Wallet,
      color: 'sand',
    },
    {
      label: 'Inventario actual',
      value: money(data.inventoryValue),
      text: `${data.unitsInStock} unidades valoradas al costo`,
      icon: Package,
      color: 'lilac',
    },
  ];
  return (
    <div className="stats-grid">
      {values.map((item) => (
        <article className="stat-card" key={item.label}>
          <div className="stat-top">
            <span>{item.label}</span>
            <span className={`stat-icon ${item.color}`}>
              <item.icon size={20} />
            </span>
          </div>
          <strong>{item.value}</strong>
          <small>{item.text}</small>
        </article>
      ))}
    </div>
  );
}
export function SalesChart({ data }: { data: Report }) {
  const values = data.daily.map((item) => Number(item.amount)),
    maximum = Math.max(...values.map(Math.abs), 1);
  const hasActivity = values.some((value) => value !== 0);
  const width = 700,
    height = 170;
  const y = (value: number) => 90 - (value / maximum) * 70;
  const points = values
    .map(
      (value, index) =>
        `${15 + (index / Math.max(values.length - 1, 1)) * (width - 30)},${y(value)}`,
    )
    .join(' ');
  return (
    <div className="chart-wrap">
      <div className="chart-summary">
        <strong>{money(data.netSales)}</strong>
        <span>
          <i /> Ventas netas de productos
        </span>
      </div>
      <div
        className="chart"
        role="img"
        aria-label={`Ventas netas del período: ${money(data.netSales)}. ${hasActivity ? 'Consulta los valores diarios en el reporte CSV.' : 'Todavía no hay ventas en este período.'}`}
      >
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ad6982" stopOpacity=".18" />
              <stop offset="100%" stopColor="#ad6982" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[20, 55, 90, 125, 160].map((line) => (
            <line
              key={line}
              x1="0"
              x2={width}
              y1={line}
              y2={line}
              stroke="#ede8e6"
              strokeDasharray="4 5"
            />
          ))}
          {hasActivity ? (
            <>
              <polygon points={`15,90 ${points} ${width - 15},90`} fill="url(#chart-fill)" />
              <polyline
                points={points}
                fill="none"
                stroke="#a15c76"
                strokeWidth="2.8"
                vectorEffect="non-scaling-stroke"
              />
              {values.length === 1 && <circle cx="15" cy={y(values[0])} r="4" fill="#a15c76" />}
            </>
          ) : (
            <line x1="15" x2={width - 15} y1="90" y2="90" stroke="#c6a0af" strokeWidth="2" />
          )}
        </svg>
        {!hasActivity && (
          <span className="chart-empty">Tu próxima venta empieza esta historia</span>
        )}
      </div>
      <div className="chart-dates">
        <span>{data.from}</span>
        <span>{data.to}</span>
      </div>
    </div>
  );
}
export function Dashboard({
  revision,
  onNavigate,
}: {
  revision: number;
  onNavigate: (page: 'products' | 'sales' | 'reports' | 'expenses') => void;
}) {
  const period = usePeriod();
  const { data, error, loading } = useQuery<Report>(
    `/reports?from=${period.from}&to=${period.to}`,
    revision,
  );
  return (
    <>
      <section className="dashboard-brand" aria-label="Bienvenida a Mai Lashies">
        <BrandLogo />
        <div className="dashboard-brand-copy">
          <span className="eyebrow">BELLEZA, ACCESORIOS Y MUCHO AMOR</span>
          <h2>{BRAND_SLOGAN}</h2>
          <p>Un espacio para cuidar cada detalle y ver crecer tu negocio.</p>
          <span className="brand-signature">
            Tu esencia. Tu estilo. Tu Mai. <span aria-hidden="true">♡</span>
          </span>
        </div>
        <span className="dashboard-sparkle sparkle-one" aria-hidden="true">
          ✧
        </span>
        <span className="dashboard-sparkle sparkle-two" aria-hidden="true">
          ✦
        </span>
      </section>
      <div className="section-toolbar">
        <div className="section-caption">
          <span className="tiny-dot" /> Así va Mai Lashies
        </div>
        <PeriodPicker period={period} />
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <Stats data={data} />
            <div className="dashboard-middle">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>El ritmo de tus ventas</h2>
                    <p>Una mirada a lo que has vendido en el período.</p>
                  </div>
                  <button className="text-button" onClick={() => onNavigate('reports')}>
                    Ver reporte <ArrowUpRight size={15} />
                  </button>
                </div>
                <SalesChart data={data} />
              </section>
              <section className="panel quick-panel">
                <span className="eyebrow">UN PASO A LA VEZ</span>
                <h2>¿Qué hacemos hoy?</h2>
                <p>
                  Las acciones de siempre,
                  <br />a un clic de distancia.
                </p>
                {[
                  {
                    title: 'Revisar inventario',
                    sub: 'Productos y existencias',
                    page: 'products',
                    icon: Package,
                  },
                  {
                    title: 'Consultar ventas',
                    sub: 'Cada detalle de tus ventas',
                    page: 'sales',
                    icon: ShoppingBag,
                  },
                  {
                    title: 'Registrar un gasto',
                    sub: 'Mantén tus cuentas claras',
                    page: 'expenses',
                    icon: Wallet,
                  },
                ].map((item) => (
                  <button
                    className="quick-action"
                    key={item.page}
                    onClick={() => onNavigate(item.page as 'products' | 'sales' | 'expenses')}
                  >
                    <span>
                      <item.icon size={18} />
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.sub}</small>
                    </div>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </section>
            </div>
            <div className="dashboard-bottom">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Un poquito de atención</h2>
                    <p>Productos que necesitan reposición.</p>
                  </div>
                  <Badge kind="warning">{data.lowStock.length} productos</Badge>
                </div>
                {data.lowStock.length ? (
                  <div className="mini-list">
                    {data.lowStock.slice(0, 5).map((product) => (
                      <button
                        className="mini-row"
                        key={product.id}
                        onClick={() => onNavigate('products')}
                      >
                        <span className="product-avatar">{product.name.slice(0, 1)}</span>
                        <div>
                          <strong>{product.name}</strong>
                          <small>
                            {product.sku}
                            {product.variant ? ` · ${product.variant}` : ''}
                          </small>
                        </div>
                        <Badge kind={product.stock === 0 ? 'danger' : 'warning'}>
                          {product.stock} disponibles
                        </Badge>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty title="Todo en orden">
                    Las alertas aparecerán cuando un producto llegue a su mínimo de existencias.
                  </Empty>
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Los favoritos del período</h2>
                    <p>Productos con más unidades vendidas, netas de devoluciones.</p>
                  </div>
                  <ShoppingBag size={20} />
                </div>
                {data.top.length ? (
                  <div className="mini-list">
                    {data.top.map((product, index) => (
                      <div className="mini-row" key={product.name + index}>
                        <span className="rank">0{index + 1}</span>
                        <div>
                          <strong>{product.name}</strong>
                          <small>{product.quantity} unidades netas</small>
                        </div>
                        <span className="tabular">{money(product.total)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty title="Aquí estarán tus favoritos">
                    Registra ventas para descubrir qué productos eligen más.
                  </Empty>
                )}
              </section>
            </div>
          </>
        )
      )}
    </>
  );
}
