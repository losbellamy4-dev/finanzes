import { useMemo, useState } from 'react';
import { Search, TrendingDown, TrendingUp } from 'lucide-react';
import type { AssetType } from '@/core/schema';
import { formatPrice } from '@/core/money';
import { ASSET_TYPE_LABELS } from '@/data/assets';
import { changeOverDays, dailyChange } from '@/engine/market';
import { useProfile } from '@/store/hooks';
import { navigate } from '@/app/router';
import { Sparkline } from '@/ui/charts';
import { Card, Delta, EmptyState, Input, PageHeader, Segmented } from '@/ui/primitives';
import { AssetLogo, compactNumber, InvestTabs, RegimeBadge, WatchStar } from './shared';

type Filter = 'all' | 'watch' | AssetType;

export default function MarketPage() {
  const p = useProfile();
  const cur = p.profile.baseCurrency;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const assets = p.market.assets;

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return assets.filter(
      (a) =>
        (filter === 'all' || (filter === 'watch' ? p.portfolio.watchlist.includes(a.id) : a.type === filter)) &&
        (!qq || a.symbol.toLowerCase().includes(qq) || a.name.toLowerCase().includes(qq) || a.sector.toLowerCase().includes(qq)),
    );
  }, [assets, q, filter, p.portfolio.watchlist]);

  const movers = useMemo(() => {
    const sorted = [...assets].sort((a, b) => dailyChange(b) - dailyChange(a));
    return { up: sorted.slice(0, 3), down: sorted.slice(-3).reverse() };
  }, [assets]);

  return (
    <div>
      <PageHeader title="Mercados" subtitle="Mercado financiero simulado con activos ficticios" actions={<RegimeBadge p={p} />} />
      <InvestTabs />
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        {(['up', 'down'] as const).map((k) => (
          <Card key={k} title={k === 'up' ? 'Mayores subidas del día' : 'Mayores caídas del día'} action={k === 'up' ? <TrendingUp className="size-4 text-pos" /> : <TrendingDown className="size-4 text-neg" />}>
            <div className="grid grid-cols-3 gap-2">
              {movers[k].map((a) => (
                <button key={a.id} type="button" onClick={() => navigate(`/invest/asset/${a.id}`)} className="rounded-xl border border-line bg-surface-2/60 p-2.5 text-left hover:border-line-strong">
                  <div className="text-[12px] font-semibold text-fg">{a.symbol}</div>
                  <div className="tabular truncate text-[12px] text-muted">{formatPrice(a.price, cur)}</div>
                  <Delta value={dailyChange(a)} className="text-[12px]" />
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <Card padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, símbolo o sector…" className="pl-10" aria-label="Buscar activos" />
          </div>
          <Segmented
            value={filter}
            onChange={setFilter}
            size="sm"
            ariaLabel="Filtrar por tipo"
            options={[{ value: 'all', label: 'Todos' }, { value: 'watch', label: '★ Favoritos' }, ...(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((t) => ({ value: t, label: ASSET_TYPE_LABELS[t] }))]}
          />
        </div>
        {list.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Sin resultados" body="Prueba con otro término o filtro." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line text-left text-[12px] text-muted">
                  <th className="w-8 py-2.5 pl-4 sm:pl-5" />
                  <th className="py-2.5 font-medium">Activo</th>
                  <th className="hidden py-2.5 font-medium md:table-cell">30 días</th>
                  <th className="py-2.5 text-right font-medium">Precio</th>
                  <th className="py-2.5 text-right font-medium">Hoy</th>
                  <th className="hidden py-2.5 text-right font-medium sm:table-cell">1 mes</th>
                  <th className="hidden py-2.5 pr-5 text-right font-medium lg:table-cell">Volumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((a) => (
                  <tr key={a.id} onClick={() => navigate(`/invest/asset/${a.id}`)} className="cursor-pointer hover:bg-surface-2/60">
                    <td className="py-3 pl-4 sm:pl-5">
                      <WatchStar p={p} asset={a} />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <AssetLogo asset={a} size="sm" />
                        <div className="min-w-0">
                          <div className="font-semibold text-fg">{a.symbol}</div>
                          <div className="max-w-[140px] truncate text-[12px] text-muted sm:max-w-[220px]">{a.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden py-3 md:table-cell">
                      <Sparkline values={a.daily.slice(-30).map((d) => d.c).concat(a.price)} width={96} />
                    </td>
                    <td className="tabular py-3 text-right font-medium text-fg">{formatPrice(a.price, cur)}</td>
                    <td className="py-3 text-right">
                      <Delta value={dailyChange(a)} icon={false} />
                    </td>
                    <td className="hidden py-3 text-right sm:table-cell">
                      <Delta value={changeOverDays(a, 30)} icon={false} />
                    </td>
                    <td className="tabular hidden py-3 pr-5 text-right text-muted lg:table-cell">{a.baseVolume ? compactNumber(a.dayVolume || a.daily.at(-1)?.v || 0) : '—'}</td>
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
