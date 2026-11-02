import { useMemo, useState } from 'react';
import { formatPrice, formatQty } from '@/core/money';
import { formatDateTime } from '@/core/time';
import { useMoney, useProfile } from '@/store/hooks';
import { navigate } from '@/app/router';
import { Badge, Card, EmptyState, PageHeader, Segmented } from '@/ui/primitives';
import { InvestTabs } from './shared';

export default function TradeHistoryPage() {
  const p = useProfile();
  const fmt = useMoney();
  const [side, setSide] = useState<'all' | 'buy' | 'sell'>('all');
  const trades = useMemo(() => p.portfolio.trades.filter((t) => side === 'all' || t.side === side).slice().reverse(), [p.portfolio.trades, side]);
  const totals = useMemo(() => {
    let bought = 0;
    let sold = 0;
    let fees = 0;
    for (const t of p.portfolio.trades) {
      if (t.side === 'buy') bought += t.amount;
      else sold += t.amount;
      fees += t.fee;
    }
    return { bought, sold, fees };
  }, [p.portfolio.trades]);
  return (
    <div>
      <PageHeader title="Historial de operaciones" subtitle={`Comprado ${fmt(totals.bought)} · vendido ${fmt(totals.sold)} · comisiones ${fmt(totals.fees)}`} />
      <InvestTabs />
      <Card title={`${trades.length} operaciones`} action={<Segmented value={side} onChange={setSide} size="sm" options={[{ value: 'all', label: 'Todas' }, { value: 'buy', label: 'Compras' }, { value: 'sell', label: 'Ventas' }]} />} padded={false}>
        {trades.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Sin operaciones" body="Tus compras y ventas aparecerán aquí." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line text-left text-[12px] text-muted">
                  <th className="py-2.5 pl-4 font-medium sm:pl-5">Fecha</th>
                  <th className="py-2.5 font-medium">Activo</th>
                  <th className="py-2.5 font-medium">Tipo</th>
                  <th className="hidden py-2.5 text-right font-medium sm:table-cell">Cantidad</th>
                  <th className="hidden py-2.5 text-right font-medium md:table-cell">Precio</th>
                  <th className="py-2.5 text-right font-medium">Importe</th>
                  <th className="py-2.5 pr-5 text-right font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {trades.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => navigate(`/invest/asset/${t.assetId}`)}>
                    <td className="py-3 pl-4 text-[12px] whitespace-nowrap text-muted sm:pl-5">{formatDateTime(t.at)}</td>
                    <td className="py-3 font-semibold text-fg">{t.symbol}</td>
                    <td className="py-3">
                      <Badge tone={t.side === 'buy' ? 'accent' : 'warn'}>{t.side === 'buy' ? 'Compra' : 'Venta'}</Badge>
                    </td>
                    <td className="tabular hidden py-3 text-right text-muted sm:table-cell">{formatQty(t.quantity)}</td>
                    <td className="tabular hidden py-3 text-right text-muted md:table-cell">{formatPrice(t.price, p.profile.baseCurrency)}</td>
                    <td className="tabular py-3 text-right font-medium text-fg">{fmt(t.amount)}</td>
                    <td className={`tabular py-3 pr-5 text-right ${t.side === 'sell' ? (t.realizedPnL >= 0 ? 'text-pos' : 'text-neg') : 'text-subtle'}`}>{t.side === 'sell' ? fmt(t.realizedPnL, { sign: true }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
