import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Bell,
  Building2,
  ChevronRight,
  CreditCard,
  Landmark,
  LineChart,
  PiggyBank,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Star,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { tickToDate } from '@/core/time';
import { CATEGORY_LABELS } from '@/data/labels';
import { flowHistory, monthlyFlows, portfolioView } from '@/engine/selectors';
import { computeCreditScore } from '@/engine/creditScore';
import { useMoney, useOverview, useProfile } from '@/store/hooks';
import { Link, navigate } from '@/app/router';
import { openMoneyDialog } from '@/features/banking/MoneyDialog';
import { useThemeColors } from '@/app/theme';
import { DonutChart, IncomeExpenseBars, Legend, Sparkline, TimeSeriesChart } from '@/ui/charts';
import { Badge, Card, cx, Delta, EmptyState, Segmented, Stat } from '@/ui/primitives';
import { TxRow } from '@/ui/domain';

type Range = '1M' | '3M' | '1A' | 'ALL';
const RANGE_DAYS: Record<Range, number> = { '1M': 31, '3M': 92, '1A': 366, ALL: 100_000 };

export default function Dashboard() {
  const p = useProfile();
  const ov = useOverview();
  const fmt = useMoney();
  const colors = useThemeColors();
  const [range, setRange] = useState<Range>('3M');
  const now = tickToDate(p.clock.startAt, p.clock.tick);

  const series = useMemo(() => {
    const cutoff = now.getTime() - RANGE_DAYS[range] * 86_400_000;
    const pts = p.netWorthHistory.filter((x) => Date.parse(x.at) >= cutoff).map((x) => ({ t: Date.parse(x.at), v: x.v }));
    pts.push({ t: now.getTime(), v: ov.netWorth });
    return pts;
  }, [p.netWorthHistory, range, now, ov.netWorth]);
  const base = series[0]?.v ?? 0;
  const change = ov.netWorth - base;
  const changePct = base !== 0 ? change / Math.abs(base) : 0;

  const flows = useMemo(() => flowHistory(p, 6), [p]);
  const categories = useMemo(() => {
    const f = monthlyFlows(p, now.getUTCFullYear(), now.getUTCMonth());
    const arr = [...f.byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const top = arr.slice(0, 5);
    const rest = arr.slice(5).reduce((a, [, v]) => a + v, 0);
    const out = top.map(([k, v], i) => ({ name: CATEGORY_LABELS[k], value: v, color: colors.series[i] }));
    if (rest > 0) out.push({ name: 'Otras', value: rest, color: colors.series[5] });
    return out;
  }, [p, now, colors]);

  const pv = useMemo(() => portfolioView(p), [p]);
  const score = useMemo(() => computeCreditScore(p), [p]);
  const favorites = p.accounts.filter((a) => a.status === 'open' && a.favorite);
  const recent = useMemo(() => [...p.transactions].reverse().slice(0, 7), [p.transactions]);
  const unread = p.notifications.filter((n) => !n.read).slice(0, 4);
  const hide = p.settings.hideBalances;

  const quick = [
    { label: 'Ingresar', icon: Banknote, onClick: () => openMoneyDialog('deposit') },
    { label: 'Traspasar', icon: ArrowLeftRight, onClick: () => openMoneyDialog('transfer') },
    { label: 'Enviar', icon: ArrowUpRight, onClick: () => openMoneyDialog('send') },
    { label: 'Pagar', icon: ShoppingBag, onClick: () => openMoneyDialog('pay') },
    { label: 'Recibir', icon: ArrowDownLeft, onClick: () => openMoneyDialog('receive') },
    { label: 'Invertir', icon: LineChart, onClick: () => navigate('/invest') },
    { label: 'Tarjetas', icon: CreditCard, onClick: () => navigate('/cards') },
    { label: 'Nueva cuenta', icon: Plus, onClick: () => navigate('/accounts?new=1') },
  ];

  const products = [
    { label: 'Ahorro', value: fmt(ov.goals), hint: `${p.goals.filter((g) => g.status === 'active').length} objetivos/huchas`, icon: PiggyBank, to: '/products/savings' },
    { label: 'Depósitos', value: fmt(ov.deposits), hint: `${p.deposits.filter((d) => d.status === 'active').length} activos`, icon: Landmark, to: '/products/savings' },
    { label: 'Préstamos', value: fmt(ov.debts.loans), hint: `${p.loans.filter((l) => l.status === 'active').length} activos`, icon: Landmark, to: '/products/loans' },
    { label: 'Seguros', value: `${p.insurance.filter((i) => i.status === 'active').length}`, hint: 'pólizas activas', icon: ShieldCheck, to: '/products/insurance' },
    { label: 'Alquileres', value: `${p.rentals.filter((r) => r.status === 'active').length}`, hint: 'contratos activos', icon: Building2, to: '/realestate' },
    { label: 'Credit Score', value: `${score.score}`, hint: score.band.label, icon: TrendingUp, to: '/credit' },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-muted">Patrimonio neto · {p.profile.name}</p>
              <p className="tabular mt-1 text-[34px] leading-none font-semibold tracking-tight text-fg sm:text-[42px]" data-testid="net-worth">
                {fmt(ov.netWorth)}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[13px]">
                <span className={cx('tabular font-medium', change >= 0 ? 'text-pos' : 'text-neg')}>{fmt(change, { sign: true })}</span>
                {base !== 0 && <Delta value={changePct} />}
                <span className="text-muted">en el periodo</span>
              </div>
            </div>
            <Segmented value={range} onChange={setRange} size="sm" ariaLabel="Periodo" options={[{ value: '1M', label: '1M' }, { value: '3M', label: '3M' }, { value: '1A', label: '1A' }, { value: 'ALL', label: 'Todo' }]} />
          </div>
          <div className="mt-4">
            <TimeSeriesChart data={series} height={230} format={(v) => fmt(v)} label="Patrimonio neto" tone={series.length > 1 ? 'auto' : 'accent'} />
          </div>
        </Card>
        <Card title="Accesos rápidos">
          <div className="grid grid-cols-4 gap-2">
            {quick.map((q) => (
              <button key={q.label} type="button" onClick={q.onClick} className="group flex flex-col items-center gap-1.5 rounded-2xl p-2 text-center transition-colors hover:bg-surface-2">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-accent/12 text-accent transition-transform group-hover:scale-105">
                  <q.icon className="size-5" />
                </span>
                <span className="text-[11.5px] font-medium text-muted group-hover:text-fg">{q.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <Stat label="Ingresos del mes" value={fmt(ov.monthlyIncome)} tone="pos" />
            <Stat label="Gastos del mes" value={fmt(ov.monthlyExpenses)} tone={ov.monthlyExpenses > 0 ? 'neg' : undefined} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {[
          { label: 'Saldo en cuentas', value: fmt(ov.accountsTotal), icon: Wallet },
          { label: 'Dinero disponible', value: fmt(ov.available), icon: Banknote },
          { label: 'Invertido', value: fmt(ov.invested), icon: LineChart, hint: <Delta value={pv.cost > 0 ? ov.unrealized / Math.max(1, ov.costBasis) : 0} /> },
          { label: 'Inmuebles', value: fmt(ov.properties), icon: Building2 },
          { label: 'Ahorro y depósitos', value: fmt(ov.savings), icon: PiggyBank },
          { label: 'Deudas pendientes', value: fmt(ov.debts.total), icon: Landmark, tone: ov.debts.total > 0 ? ('neg' as const) : undefined },
          { label: 'Beneficio/pérdida inversión', value: fmt(ov.pnl, { sign: true }), icon: TrendingUp, tone: ov.pnl > 0 ? ('pos' as const) : ov.pnl < 0 ? ('neg' as const) : undefined },
          { label: 'Balance del mes', value: fmt(ov.monthNet, { sign: true }), icon: ArrowLeftRight, tone: ov.monthNet > 0 ? ('pos' as const) : ov.monthNet < 0 ? ('neg' as const) : undefined },
        ].map((k) => (
          <div key={k.label} className="nx-card anim-fade-up p-3.5 sm:p-4">
            <Stat label={k.label} value={k.value} icon={<k.icon className="size-3.5" />} tone={k.tone} hint={k.hint} />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Card
          title="Cuentas favoritas"
          action={
            <Link to="/accounts" className="text-[13px] font-medium text-accent">
              Ver todas
            </Link>
          }
        >
          {favorites.length === 0 ? (
            <EmptyState icon={<Star className="size-5" />} title="Sin cuentas favoritas" body="Marca cuentas como favoritas para verlas aquí." action={<Link to="/accounts?new=1" className="text-sm font-medium text-accent">Abrir una cuenta</Link>} />
          ) : (
            <ul className="space-y-1">
              {favorites.map((a) => (
                <li key={a.id}>
                  <Link to={`/accounts/${a.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
                    <span className="flex size-9 items-center justify-center rounded-xl text-white" style={{ background: a.color }}>
                      <Wallet className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{a.name}</span>
                      <span className="block truncate text-[12px] text-muted">•••• {a.iban.slice(-4)} · {a.currency}</span>
                    </span>
                    <span className={cx('tabular text-sm font-semibold', a.balance < 0 ? 'text-neg' : 'text-fg')}>{fmt(a.balance, { currency: a.currency })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Posiciones de inversión"
          subtitle={pv.positions.length ? `${fmt(pv.total)} · hoy ${fmt(pv.dayPnl, { sign: true })}` : undefined}
          action={
            <Link to="/invest/portfolio" className="text-[13px] font-medium text-accent">
              Cartera
            </Link>
          }
        >
          {pv.positions.length === 0 ? (
            <EmptyState icon={<LineChart className="size-5" />} title="Aún no has invertido" body="Compra acciones, ETF, bonos o cripto simuladas." action={<Link to="/invest" className="text-sm font-medium text-accent">Ir al mercado</Link>} />
          ) : (
            <ul className="space-y-1">
              {pv.positions.slice(0, 5).map((pos) => {
                const a = p.market.assets.find((x) => x.id === pos.assetId)!;
                return (
                  <li key={pos.assetId}>
                    <Link to={`/invest/asset/${pos.assetId}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-surface-2 text-[11px] font-bold text-fg">{pos.symbol.slice(0, 4)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{pos.name}</span>
                        <Delta value={pos.pnlPct} className="text-[12px]" />
                      </span>
                      <Sparkline values={a.daily.slice(-30).map((d) => d.c).concat(a.price)} />
                      <span className="tabular w-24 text-right text-sm font-semibold text-fg">{fmt(pos.value)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Notificaciones"
          action={
            <Link to="/notifications" className="text-[13px] font-medium text-accent">
              Ver todas
            </Link>
          }
        >
          {unread.length === 0 ? (
            <EmptyState icon={<Bell className="size-5" />} title="Todo al día" body="No tienes notificaciones sin leer." />
          ) : (
            <ul className="space-y-2.5">
              {unread.map((n) => (
                <li key={n.id} className="rounded-xl border border-line bg-surface-2/60 p-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={n.level === 'success' ? 'pos' : n.level === 'danger' ? 'neg' : n.level === 'warning' ? 'warn' : 'accent'}>
                      {n.level === 'success' ? 'Éxito' : n.level === 'danger' ? 'Alerta' : n.level === 'warning' ? 'Aviso' : 'Info'}
                    </Badge>
                    <span className="truncate text-sm font-medium text-fg">{n.title}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Card title="Ingresos y gastos" subtitle="Últimos 6 meses simulados" className="lg:col-span-2">
          <IncomeExpenseBars data={flows} format={(v) => fmt(v)} />
          <div className="mt-2 flex gap-4 text-[12px] text-muted">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-pos" /> Ingresos</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-neg" /> Gastos</span>
          </div>
        </Card>
        <Card title="Gastos por categoría" subtitle="Mes en curso">
          {categories.length === 0 ? (
            <EmptyState title="Sin gastos este mes" body="Los pagos y compras aparecerán aquí." />
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col">
              <DonutChart data={categories} size={150} format={(v) => fmt(v)} center={<span className="tabular text-[13px] font-semibold text-fg">{fmt(ov.monthlyExpenses, { compact: true })}</span>} />
              <Legend items={categories} format={(v) => fmt(v, { compact: true })} />
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Card
          title="Actividad reciente"
          className="lg:col-span-2"
          action={
            <Link to="/activity" className="text-[13px] font-medium text-accent">
              Historial completo
            </Link>
          }
        >
          {recent.length === 0 ? (
            <EmptyState icon={<ArrowLeftRight className="size-5" />} title="Sin movimientos" body="Ingresa dinero o abre una cuenta para empezar." />
          ) : (
            <div className="divide-y divide-line">
              {recent.map((tx) => (
                <TxRow key={tx.id} tx={tx} hide={hide} />
              ))}
            </div>
          )}
        </Card>
        <Card title="Productos contratados">
          <ul className="space-y-1">
            {products.map((it) => (
              <li key={it.label}>
                <Link to={it.to} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-surface-2 text-muted">
                    <it.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-fg">{it.label}</span>
                    <span className="block truncate text-[12px] text-muted">{it.hint}</span>
                  </span>
                  <span className="tabular text-sm font-semibold text-fg">{it.value}</span>
                  <ChevronRight className="size-4 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
