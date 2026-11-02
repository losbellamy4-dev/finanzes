import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { formatMoney, formatPct, formatPrice, formatQty, parseMoney } from '@/core/money';
import { formatDateTime, tickToDate } from '@/core/time';
import { ASSET_TYPE_SINGULAR } from '@/data/assets';
import { dailyChange, effectiveParams, realizedVolatility, trendLabel } from '@/engine/market';
import { positionValue } from '@/engine/portfolio';
import { useMoney, useOperation, useProfile } from '@/store/hooks';
import { confirm } from '@/store/toast';
import { Link } from '@/app/router';
import { TimeSeriesChart } from '@/ui/charts';
import { AccountSelect, openAccounts } from '@/ui/domain';
import { Badge, Button, Card, Delta, EmptyState, Field, FormError, Input, KeyValue, MoneyInput, PageHeader, Segmented } from '@/ui/primitives';
import { AssetLogo, compactNumber, WatchStar } from './shared';

type Range = '1D' | '1S' | '1M' | '3M' | '1A' | 'ALL';

export default function AssetDetail({ params }: { params: Record<string, string> }) {
  const p = useProfile();
  const fmt = useMoney();
  const cur = p.profile.baseCurrency;
  const asset = p.market.assets.find((a) => a.id === params.id);
  const [range, setRange] = useState<Range>('1M');

  const series = useMemo(() => {
    if (!asset) return [];
    const start = Date.parse(p.clock.startAt);
    const nowMs = start + p.clock.tick * 3_600_000;
    if (range === '1D' || range === '1S') {
      const n = range === '1D' ? 24 : 168;
      return asset.intraday.slice(-n).map((x) => ({ t: start + x.t * 3_600_000, v: x.p }));
    }
    const days = range === '1M' ? 30 : range === '3M' ? 91 : range === '1A' ? 365 : 100_000;
    const pts = asset.daily.slice(-days).map((c) => ({ t: start + (c.d + 1) * 86_400_000, v: c.c }));
    pts.push({ t: nowMs, v: asset.price });
    return pts;
  }, [asset, range, p.clock.startAt, p.clock.tick]);

  if (!asset) return <EmptyState title="Activo no encontrado" action={<Link to="/invest" className="text-accent">Volver al mercado</Link>} />;
  const pos = p.portfolio.positions.find((x) => x.assetId === asset.id);
  const eff = effectiveParams(p.market, asset);
  const trades = p.portfolio.trades.filter((t) => t.assetId === asset.id).slice().reverse();
  const first = series[0]?.v ?? asset.price;
  const rangeChange = first > 0 ? asset.price / first - 1 : 0;

  return (
    <div>
      <PageHeader
        back={
          <Link to="/invest" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Mercado
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <AssetLogo asset={asset} size="lg" />
            <span className="min-w-0">
              <span className="block truncate">{asset.name}</span>
              <span className="block text-sm font-normal text-muted">
                {asset.symbol} · {ASSET_TYPE_SINGULAR[asset.type]} · {asset.sector}
              </span>
            </span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {asset.custom && <Badge tone="accent">Personalizado</Badge>}
            <span className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm text-muted">
              <WatchStar p={p} asset={asset} /> Favorito
            </span>
          </div>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="tabular text-[34px] font-semibold tracking-tight text-fg" data-testid="asset-price">
                  {formatPrice(asset.price, cur)}
                </div>
                <div className="mt-1 flex items-center gap-3 text-[13px]">
                  <span>
                    Hoy <Delta value={dailyChange(asset)} />
                  </span>
                  <span className="text-muted">
                    Periodo <Delta value={rangeChange} />
                  </span>
                </div>
              </div>
              <Segmented value={range} onChange={setRange} size="sm" ariaLabel="Periodo del gráfico" options={(['1D', '1S', '1M', '3M', '1A', 'ALL'] as Range[]).map((r) => ({ value: r, label: r === 'ALL' ? 'Todo' : r }))} />
            </div>
            <div className="mt-4">
              <TimeSeriesChart data={series} height={280} format={(v) => formatPrice(v, cur)} label={`Precio de ${asset.symbol}`} />
            </div>
          </Card>
          <Card title="Estadísticas">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <KeyValue
                items={[
                  { label: 'Apertura', value: formatPrice(asset.dayOpen, cur) },
                  { label: 'Máximo del día', value: formatPrice(asset.dayHigh, cur) },
                  { label: 'Mínimo del día', value: formatPrice(asset.dayLow, cur) },
                  { label: 'Cierre anterior', value: formatPrice(asset.prevClose, cur) },
                  { label: 'Volumen (hoy)', value: asset.baseVolume ? compactNumber(asset.dayVolume) : '—' },
                ]}
              />
              <KeyValue
                items={[
                  { label: 'Tendencia (30 d)', value: trendLabel(asset) },
                  { label: 'Volatilidad realizada (30 d)', value: formatPct(realizedVolatility(asset), 1, false) },
                  { label: 'Deriva efectiva anual', value: formatPct(eff.mu, 1) },
                  { label: 'Volatilidad efectiva', value: formatPct(eff.sigma, 1, false) },
                  { label: asset.type === 'bond' ? 'Cupón anual' : 'Rentabilidad por dividendo', value: asset.yield ? formatPct(asset.yield, 2, false) : '—' },
                ]}
              />
            </div>
          </Card>
          <Card title="Sobre el activo">
            <p className="text-sm leading-relaxed text-muted">{asset.description}</p>
            {asset.company && (
              <KeyValue
                className="mt-3"
                items={[
                  { label: 'Sector', value: asset.company.sector },
                  { label: 'País', value: asset.company.country },
                  { label: 'Empleados', value: compactNumber(asset.company.employees) },
                  { label: 'Fundación', value: String(asset.company.founded) },
                  { label: 'Consejero delegado', value: asset.company.ceo },
                ]}
              />
            )}
            <p className="mt-3 text-[12px] text-subtle">Empresa y cotización ficticias generadas por el simulador.</p>
          </Card>
        </div>
        <div className="space-y-5">
          <TradePanel assetId={asset.id} />
          {pos && (
            <Card title="Tu posición">
              <KeyValue
                items={[
                  { label: 'Participaciones', value: formatQty(pos.quantity) },
                  { label: 'Precio medio', value: formatPrice(pos.costBasis / 100 / pos.quantity, cur) },
                  { label: 'Invertido', value: fmt(pos.costBasis) },
                  { label: 'Valor actual', value: fmt(positionValue(p, pos)) },
                  { label: 'Beneficio no realizado', value: fmt(positionValue(p, pos) - pos.costBasis, { sign: true }), tone: positionValue(p, pos) >= pos.costBasis ? 'pos' : 'neg' },
                ]}
              />
            </Card>
          )}
          <Card title="Operaciones en este activo">
            {trades.length === 0 ? (
              <p className="text-sm text-muted">Aún no has operado con {asset.symbol}.</p>
            ) : (
              <ul className="divide-y divide-line">
                {trades.slice(0, 15).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div>
                      <Badge tone={t.side === 'buy' ? 'accent' : 'warn'}>{t.side === 'buy' ? 'Compra' : 'Venta'}</Badge>
                      <div className="mt-1 text-[12px] text-muted">{formatDateTime(t.at)}</div>
                    </div>
                    <div className="text-right">
                      <div className="tabular font-medium text-fg">{fmt(t.amount)}</div>
                      <div className="tabular text-[12px] text-muted">
                        {formatQty(t.quantity)} × {formatPrice(t.price, cur)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function TradePanel({ assetId }: { assetId: string }) {
  const p = useProfile();
  const cur = p.profile.baseCurrency;
  const asset = p.market.assets.find((a) => a.id === assetId)!;
  const accounts = openAccounts(p);
  const pos = p.portfolio.positions.find((x) => x.assetId === assetId);
  const defaultAcc = accounts.find((a) => a.type === 'investment') ?? accounts[0];
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [mode, setMode] = useState<'amount' | 'quantity'>('amount');
  const [accountId, setAccountId] = useState(pos?.settlementAccountId && accounts.some((a) => a.id === pos.settlementAccountId) ? pos.settlementAccountId : (defaultAcc?.id ?? ''));
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();

  const amountCents = mode === 'amount' ? parseMoney(value) : null;
  const qty = mode === 'quantity' ? Number(value.replace(',', '.')) : amountCents ? amountCents / 100 / asset.price : 0;
  const gross = mode === 'amount' ? (amountCents ?? 0) : Math.round((Number.isFinite(qty) ? qty : 0) * asset.price * 100);
  const fee = Math.round(gross * p.market.feeRate);

  const submit = async (all = false) => {
    setError(null);
    if (!accountId) return setError('Selecciona una cuenta.');
    if (!all && (!gross || gross <= 0 || !Number.isFinite(qty) || qty <= 0)) return setError('Introduce un importe o cantidad válidos.');
    if (side === 'sell' && all) {
      if (!(await confirm({ title: `Vender toda la posición de ${asset.symbol}`, details: [{ label: 'Participaciones', value: formatQty(pos?.quantity ?? 0) }, { label: 'Valor estimado', value: formatMoney(positionValue(p, pos!), cur) }], confirmLabel: 'Vender todo' }))) return;
    }
    const payload = mode === 'amount' ? { amount: amountCents ?? undefined } : { quantity: qty };
    const r =
      side === 'buy'
        ? run('invest/buy', { assetId, accountId, ...payload }, { success: `Compra de ${asset.symbol} ejecutada` })
        : run('invest/sell', { assetId, accountId, ...(all ? { all: true } : payload) }, { success: `Venta de ${asset.symbol} ejecutada` });
    if (r.ok) setValue('');
    else setError(r.message);
  };

  return (
    <Card title="Operar">
      <Segmented value={side} onChange={(s) => { setSide(s); setError(null); }} className="w-full" options={[{ value: 'buy', label: 'Comprar' }, { value: 'sell', label: 'Vender' }]} ariaLabel="Compra o venta" />
      <div className="mt-4 space-y-4">
        <Field label={side === 'buy' ? 'Pagar desde' : 'Abonar en'}>
          {(id) => (accounts.length ? <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={p.settings.hideBalances} /> : <p className="text-sm text-neg">Abre una cuenta para invertir.</p>)}
        </Field>
        <Segmented value={mode} onChange={(m) => { setMode(m); setValue(''); }} size="sm" options={[{ value: 'amount', label: 'Por importe' }, { value: 'quantity', label: 'Por cantidad' }]} ariaLabel="Modo de orden" />
        <Field label={mode === 'amount' ? 'Importe' : 'Participaciones'}>
          {(id) => (mode === 'amount' ? <MoneyInput id={id} value={value} onChange={setValue} currency={cur} /> : <Input id={id} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="0" className="tabular h-12 text-lg font-semibold" />)}
        </Field>
        <KeyValue
          items={[
            { label: 'Precio de mercado', value: formatPrice(asset.price, cur) },
            { label: 'Cantidad estimada', value: Number.isFinite(qty) && qty > 0 ? formatQty(qty) : '—' },
            { label: `Comisión (${formatPct(p.market.feeRate, 2, false)})`, value: formatMoney(fee, cur) },
            { label: side === 'buy' ? 'Total a pagar' : 'Total a recibir', value: formatMoney(side === 'buy' ? gross + fee : Math.max(0, gross - fee), cur) },
          ]}
        />
        {side === 'sell' && pos && <p className="text-[12px] text-muted">Tienes {formatQty(pos.quantity)} {asset.symbol} ({formatMoney(positionValue(p, pos), cur)}).</p>}
        <FormError message={error} />
        <Button block size="lg" variant={side === 'buy' ? 'primary' : 'success'} onClick={() => submit(false)} loading={pending} disabled={side === 'sell' && !pos}>
          {side === 'buy' ? `Comprar ${asset.symbol}` : `Vender ${asset.symbol}`}
        </Button>
        {side === 'sell' && pos && (
          <Button block variant="outline" onClick={() => submit(true)} disabled={pending}>
            Vender toda la posición
          </Button>
        )}
        <p className="text-[11.5px] text-subtle">Órdenes a mercado ejecutadas al precio simulado actual ({formatDateTime(tickToDate(p.clock.startAt, p.clock.tick))}).</p>
      </div>
    </Card>
  );
}
