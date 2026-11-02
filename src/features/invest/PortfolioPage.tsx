import { useMemo } from 'react';
import { PieChart } from 'lucide-react';
import type { AssetType } from '@/core/schema';
import { formatPrice, formatQty } from '@/core/money';
import { ASSET_TYPE_LABELS } from '@/data/assets';
import { portfolioView } from '@/engine/selectors';
import { useMoney, useOverview, useProfile } from '@/store/hooks';
import { useThemeColors } from '@/app/theme';
import { Link, navigate } from '@/app/router';
import { DonutChart, Legend } from '@/ui/charts';
import { Card, Delta, EmptyState, PageHeader, Stat } from '@/ui/primitives';
import { AssetLogo, InvestTabs, RegimeBadge } from './shared';

export default function PortfolioPage() {
  const p = useProfile();
  const ov = useOverview();
  const fmt = useMoney();
  const colors = useThemeColors();
  const pv = useMemo(() => portfolioView(p), [p]);
  const cur = p.profile.baseCurrency;

  const byAsset = useMemo(() => {
    const top = pv.positions.slice(0, 7).map((x, i) => ({ name: x.symbol, value: x.value, color: colors.series[i] }));
    const rest = pv.positions.slice(7).reduce((a, x) => a + x.value, 0);
    if (rest > 0) top.push({ name: 'Otros', value: rest, color: colors.subtle });
    return top;
  }, [pv, colors]);
  const byType = useMemo(() => {
    const order: AssetType[] = ['stock', 'etf', 'index', 'crypto', 'bond', 'fund'];
    const arr = order.map((t, i) => ({ name: ASSET_TYPE_LABELS[t], value: pv.byType.get(t) ?? 0, color: colors.series[i] })).filter((x) => x.value > 0);
    if (ov.derivatives > 0) arr.push({ name: 'Derivados', value: ov.derivatives, color: colors.series[6] });
    return arr;
  }, [pv, ov.derivatives, colors]);

  return (
    <div>
      <PageHeader title="Cartera" subtitle="Posiciones, rentabilidad y distribución" actions={<RegimeBadge p={p} />} />
      <InvestTabs />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="nx-card p-3.5"><Stat label="Valor total" value={fmt(pv.total + ov.derivatives)} /></div>
        <div className="nx-card p-3.5"><Stat label="Capital invertido" value={fmt(pv.cost)} /></div>
        <div className="nx-card p-3.5"><Stat label="Beneficio no realizado" value={fmt(pv.unrealized, { sign: true })} tone={pv.unrealized > 0 ? 'pos' : pv.unrealized < 0 ? 'neg' : undefined} hint={<Delta value={pv.unrealizedPct} />} /></div>
        <div className="nx-card p-3.5"><Stat label="Beneficio realizado" value={fmt(pv.realized, { sign: true })} tone={pv.realized > 0 ? 'pos' : pv.realized < 0 ? 'neg' : undefined} /></div>
        <div className="nx-card p-3.5"><Stat label="Dividendos y cupones" value={fmt(pv.income)} tone={pv.income > 0 ? 'pos' : undefined} /></div>
        <div className="nx-card p-3.5"><Stat label="Resultado de hoy" value={fmt(pv.dayPnl, { sign: true })} tone={pv.dayPnl > 0 ? 'pos' : pv.dayPnl < 0 ? 'neg' : undefined} /></div>
      </div>
      {pv.positions.length === 0 ? (
        <EmptyState icon={<PieChart className="size-5" />} title="Tu cartera está vacía" body="Compra activos desde el mercado para construir tu cartera." action={<Link to="/invest" className="text-sm font-medium text-accent">Explorar el mercado</Link>} />
      ) : (
        <>
          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <Card title="Distribución por activo">
              <div className="flex flex-col items-center gap-5 sm:flex-row">
                <DonutChart data={byAsset} format={(v) => fmt(v)} center={<><span className="text-[11px] text-muted">Valor</span><span className="tabular text-sm font-semibold text-fg">{fmt(pv.total, { compact: true })}</span></>} />
                <Legend items={byAsset} format={(v) => fmt(v, { compact: true })} />
              </div>
            </Card>
            <Card title="Distribución por categoría">
              <div className="flex flex-col items-center gap-5 sm:flex-row">
                <DonutChart data={byType} format={(v) => fmt(v)} center={<span className="text-[12px] text-muted">{byType.length} categorías</span>} />
                <Legend items={byType} format={(v) => fmt(v, { compact: true })} />
              </div>
            </Card>
          </div>
          <Card title={`Posiciones (${pv.positions.length})`} padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-[12px] text-muted">
                    <th className="py-2.5 pl-4 font-medium sm:pl-5">Activo</th>
                    <th className="hidden py-2.5 text-right font-medium md:table-cell">Cantidad</th>
                    <th className="hidden py-2.5 text-right font-medium lg:table-cell">Precio medio</th>
                    <th className="hidden py-2.5 text-right font-medium sm:table-cell">Precio</th>
                    <th className="py-2.5 text-right font-medium">Valor</th>
                    <th className="py-2.5 text-right font-medium">Resultado</th>
                    <th className="hidden py-2.5 pr-5 text-right font-medium md:table-cell">Peso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pv.positions.map((x) => (
                    <tr key={x.assetId} onClick={() => navigate(`/invest/asset/${x.assetId}`)} className="cursor-pointer hover:bg-surface-2/60">
                      <td className="py-3 pl-4 sm:pl-5">
                        <div className="flex items-center gap-3">
                          <AssetLogo asset={x} size="sm" />
                          <div className="min-w-0">
                            <div className="font-semibold text-fg">{x.symbol}</div>
                            <div className="max-w-[160px] truncate text-[12px] text-muted">{x.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="tabular hidden py-3 text-right text-muted md:table-cell">{formatQty(x.quantity)}</td>
                      <td className="tabular hidden py-3 text-right text-muted lg:table-cell">{formatPrice(x.avgPrice, cur)}</td>
                      <td className="tabular hidden py-3 text-right text-fg sm:table-cell">{formatPrice(x.price, cur)}</td>
                      <td className="tabular py-3 text-right font-semibold text-fg">{fmt(x.value)}</td>
                      <td className="py-3 text-right">
                        <div className={`tabular font-medium ${x.pnl >= 0 ? 'text-pos' : 'text-neg'}`}>{fmt(x.pnl, { sign: true })}</div>
                        <Delta value={x.pnlPct} icon={false} className="text-[12px]" />
                      </td>
                      <td className="tabular hidden py-3 pr-5 text-right text-muted md:table-cell">{(x.weight * 100).toFixed(1)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
