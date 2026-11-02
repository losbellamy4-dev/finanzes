import { useState, type ReactNode } from 'react';
import { Flame, Play, Plus, RotateCcw, Square, Trash2, Zap } from 'lucide-react';
import type { AssetType, Regime, Scenario } from '@/core/schema';
import { formatPct, formatPrice } from '@/core/money';
import { formatDateTime, tickToDate, formatDate } from '@/core/time';
import { ASSET_TYPE_LABELS } from '@/data/assets';
import { REGIMES, effectiveParams } from '@/engine/market';
import { SPEED_PRESETS } from '@/engine/marketAdmin';
import { dispatch, useOperation, useProfile } from '@/store/hooks';
import { confirm, toast } from '@/store/toast';
import { navigate } from '@/app/router';
import { Badge, Button, Card, cx, Field, FormError, Input, KeyValue, PageHeader, Select, Textarea } from '@/ui/primitives';

const TYPES = Object.keys(ASSET_TYPE_LABELS) as AssetType[];
const pct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)} %`;

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="tabular font-semibold text-fg">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--nx-accent)]" aria-label={label} />
    </label>
  );
}

function ok(r: { ok: boolean; error?: { message: string } }, msg: string) {
  if (r.ok) toast.success(msg);
  else toast.error('No se pudo aplicar', r.error?.message);
}

export default function MarketControlPage() {
  const p = useProfile();
  const m = p.market;
  const [globalTrend, setGlobalTrend] = useState(m.globalTrend);
  const [reTrend, setReTrend] = useState(m.realEstateTrend);
  const [fee, setFee] = useState(m.feeRate);
  const [seed, setSeed] = useState(String(m.seed));
  const [cat, setCat] = useState<Record<string, { drift: number; volMultiplier: number }>>(() => ({ ...m.categoryTrends }));
  const active = m.activeScenario;

  return (
    <div>
      <PageHeader title="Control de mercado" subtitle="Dirige el escenario financiero: tendencias, crisis, precios, nuevos activos y velocidad. Sin restricciones." />
      {active && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3">
          <Flame className="size-5 text-warn" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-semibold text-fg">Escenario activo: {active.name}</span>
            <span className="text-muted"> · termina el {formatDate(tickToDate(p.clock.startAt, active.endsAtTick))}</span>
          </div>
          <Button size="sm" variant="secondary" icon={<Square className="size-3.5" />} onClick={() => ok(dispatch('market/scenario-stop', undefined), 'Escenario detenido')}>
            Detener
          </Button>
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Régimen global" subtitle="Afecta a todos los activos según su beta" className="xl:col-span-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(REGIMES) as Regime[]).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={m.regime === r}
                onClick={() => ok(dispatch('market/regime', { regime: r }), `Mercado ${REGIMES[r].label.toLowerCase()}`)}
                className={cx('rounded-2xl border p-3 text-left transition-colors', m.regime === r ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 hover:border-line-strong')}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-fg">{REGIMES[r].label}</span>
                  <span className={cx('tabular text-[12px]', REGIMES[r].drift > 0 ? 'text-pos' : REGIMES[r].drift < 0 ? 'text-neg' : 'text-muted')}>{pct(REGIMES[r].drift)}</span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-muted">{REGIMES[r].description}</p>
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <Slider label="Tendencia global (anual)" value={globalTrend} min={-1} max={1} step={0.05} onChange={setGlobalTrend} format={pct} />
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => ok(dispatch('market/global-trend', { value: globalTrend }), 'Tendencia global aplicada')}>
                Aplicar tendencia
              </Button>
            </div>
            <div>
              <Slider label="Tendencia inmobiliaria (anual)" value={reTrend} min={-0.3} max={0.3} step={0.01} onChange={setReTrend} format={pct} />
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => ok(dispatch('market/realestate-trend', { value: reTrend }), 'Tendencia inmobiliaria aplicada')}>
                Aplicar al inmobiliario
              </Button>
            </div>
          </div>
        </Card>
        <Card title="Simulación">
          <Field label="Velocidad del reloj">
            {(id) => (
              <Select id={id} value={p.clock.speed} onChange={(e) => dispatch('market/speed', { speed: Number(e.target.value) })}>
                {SPEED_PRESETS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="mt-4">
            <Slider label="Comisión por operación" value={fee} min={0} max={0.02} step={0.0005} onChange={setFee} format={(v) => formatPct(v, 2, false)} />
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => ok(dispatch('market/fee', { rate: fee }), 'Comisión actualizada')}>
              Aplicar comisión
            </Button>
          </div>
          <div className="mt-4">
            <Field label="Semilla de simulación" hint="Misma semilla + mismos parámetros = misma evolución.">
              {(id) => (
                <div className="flex gap-2">
                  <Input id={id} value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
                  <Button variant="secondary" onClick={() => ok(dispatch('market/reseed', { seed: Number(seed) }), 'Semilla aplicada')}>
                    Aplicar
                  </Button>
                </div>
              )}
            </Field>
          </div>
        </Card>
      </div>

      <Card className="mt-5" title="Mercados individuales" subtitle="Tendencia y volatilidad por categoría de activo">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TYPES.map((t) => {
            const v = cat[t] ?? { drift: 0, volMultiplier: 1 };
            return (
              <div key={t} className="rounded-2xl border border-line bg-surface-2/50 p-3.5">
                <div className="mb-2 text-sm font-semibold text-fg">{ASSET_TYPE_LABELS[t]}</div>
                <Slider label="Tendencia extra" value={v.drift} min={-1} max={1} step={0.05} onChange={(d) => setCat({ ...cat, [t]: { ...v, drift: d } })} format={pct} />
                <div className="mt-2">
                  <Slider label="Volatilidad" value={v.volMultiplier} min={0.2} max={4} step={0.1} onChange={(x) => setCat({ ...cat, [t]: { ...v, volMultiplier: x } })} format={(x) => `x${x.toFixed(1)}`} />
                </div>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => ok(dispatch('market/category-trend', { type: t, drift: v.drift, volMultiplier: v.volMultiplier }), `${ASSET_TYPE_LABELS[t]} actualizado`)}>
                  Aplicar
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ScenariosCard />
        <AssetTuningCard />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <CreateAssetCard />
        <Card title="Registro de eventos del mercado">
          {m.events.length === 0 ? (
            <p className="text-sm text-muted">Sin eventos.</p>
          ) : (
            <ul className="nx-scroll max-h-[420px] divide-y divide-line overflow-y-auto">
              {m.events.map((e, i) => (
                <li key={i} className="py-2.5 text-sm">
                  <div className="text-fg">{e.message}</div>
                  <div className="text-[12px] text-subtle">{formatDateTime(e.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function ScenariosCard() {
  const p = useProfile();
  const m = p.market;
  const [creating, setCreating] = useState(false);
  return (
    <Card title="Escenarios de crisis y recuperación" action={<Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setCreating((v) => !v)}>{creating ? 'Cerrar' : 'Nuevo'}</Button>}>
      {creating && <ScenarioForm onDone={() => setCreating(false)} />}
      <ul className="space-y-2">
        {m.scenarios.map((s) => {
          const isActive = m.activeScenario?.scenarioId === s.id;
          return (
            <li key={s.id} className={cx('rounded-2xl border p-3', isActive ? 'border-warn/40 bg-warn/8' : 'border-line bg-surface-2/50')}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-fg">{s.name}</span>
                    <Badge tone={s.kind === 'crisis' ? 'neg' : s.kind === 'recovery' ? 'pos' : 'accent'}>{s.kind === 'crisis' ? 'Crisis' : s.kind === 'recovery' ? 'Recuperación' : 'Personalizado'}</Badge>
                    {isActive && <Badge tone="warn">Activo</Badge>}
                  </div>
                  <p className="mt-1 text-[12px] text-muted">{s.description}</p>
                  <p className="tabular mt-1 text-[12px] text-subtle">
                    {pct(s.drift)} anual · volatilidad x{s.volMultiplier} · {s.durationDays} días · {s.targets.length ? s.targets.map((t) => (t === 'real_estate' ? 'Inmobiliario' : ASSET_TYPE_LABELS[t])).join(', ') : 'Todos los mercados'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant={isActive ? 'secondary' : 'primary'} icon={<Play className="size-3.5" />} onClick={() => ok(dispatch('market/scenario-activate', { scenarioId: s.id }), `Escenario «${s.name}» activado`)}>
                    {isActive ? 'Reiniciar' : 'Activar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Eliminar ${s.name}`}
                    onClick={async () => {
                      if (await confirm({ title: `Eliminar escenario «${s.name}»`, tone: 'danger', confirmLabel: 'Eliminar' })) ok(dispatch('market/scenario-delete', { scenarioId: s.id }), 'Escenario eliminado');
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ScenarioForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Scenario['kind']>('crisis');
  const [drift, setDrift] = useState(-0.6);
  const [vol, setVol] = useState(2);
  const [days, setDays] = useState('30');
  const [targets, setTargets] = useState<Scenario['targets']>([]);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const all: Scenario['targets'] = [...TYPES, 'real_estate'];
  const submit = () => {
    const r = run('market/scenario-create', { name, kind, drift, volMultiplier: vol, durationDays: Number(days), targets, description }, { success: 'Escenario creado' });
    if (r.ok) onDone();
    else setError(r.message);
  };
  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-accent/30 bg-accent/5 p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="p. ej. Guerra comercial" />}</Field>
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => { const k = e.target.value as Scenario['kind']; setKind(k); setDrift(k === 'recovery' ? 0.6 : k === 'crisis' ? -0.6 : 0); }}>
              <option value="crisis">Crisis</option>
              <option value="recovery">Recuperación</option>
              <option value="custom">Personalizado</option>
            </Select>
          )}
        </Field>
      </div>
      <Slider label="Tendencia anual añadida" value={drift} min={-2} max={2} step={0.05} onChange={setDrift} format={pct} />
      <Slider label="Multiplicador de volatilidad" value={vol} min={0.2} max={5} step={0.1} onChange={setVol} format={(x) => `x${x.toFixed(1)}`} />
      <Field label="Duración (días)">{(id) => <Input id={id} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />}</Field>
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-muted">Mercados afectados (vacío = todos)</div>
        <div className="flex flex-wrap gap-1.5">
          {all.map((t) => {
            const on = targets.includes(t);
            return (
              <button key={t} type="button" aria-pressed={on} onClick={() => setTargets(on ? targets.filter((x) => x !== t) : [...targets, t])} className={cx('rounded-full border px-2.5 py-1 text-[12px]', on ? 'border-accent bg-accent/15 text-fg' : 'border-line text-muted')}>
                {t === 'real_estate' ? 'Inmobiliario' : ASSET_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>
      <Field label="Descripción">{(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />}</Field>
      <FormError message={error} />
      <Button onClick={submit} loading={pending}>
        Guardar escenario
      </Button>
    </div>
  );
}

function AssetTuningCard() {
  const p = useProfile();
  const cur = p.profile.baseCurrency;
  const [assetId, setAssetId] = useState(p.market.assets[0]?.id ?? '');
  const a = p.market.assets.find((x) => x.id === assetId) ?? p.market.assets[0];
  const [price, setPrice] = useState('');
  const [drift, setDrift] = useState(a.driftOverride ?? a.drift);
  const [vol, setVol] = useState(a.volOverride ?? a.volatility);
  const eff = effectiveParams(p.market, a);
  const select = (id: string) => {
    setAssetId(id);
    const x = p.market.assets.find((y) => y.id === id)!;
    setDrift(x.driftOverride ?? x.drift);
    setVol(x.volOverride ?? x.volatility);
    setPrice('');
  };
  return (
    <Card title="Ajustar activos" subtitle="Modifica precios y parámetros de cualquier activo ficticio">
      <div className="space-y-4">
        <Field label="Activo">
          {(id) => (
            <Select id={id} value={a.id} onChange={(e) => select(e.target.value)}>
              {p.market.assets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.symbol} · {x.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <KeyValue items={[{ label: 'Precio actual', value: formatPrice(a.price, cur) }, { label: 'Deriva efectiva', value: formatPct(eff.mu, 1) }, { label: 'Volatilidad efectiva', value: formatPct(eff.sigma, 1, false) }]} />
        <Field label="Fijar nuevo precio">
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder={String(Number(a.price.toPrecision(6)))} />
              <Button
                variant="secondary"
                icon={<Zap className="size-4" />}
                onClick={() => {
                  const v = price.includes(',') ? Number(price.replace(/\./g, '').replace(',', '.')) : Number(price);
                  if (!(v > 0)) return toast.error('Precio no válido');
                  ok(dispatch('market/asset-price', { assetId: a.id, price: v }), `${a.symbol} fijado a ${formatPrice(v, cur)}`);
                  setPrice('');
                }}
              >
                Fijar
              </Button>
            </div>
          )}
        </Field>
        <Slider label="Tendencia propia (anual)" value={drift} min={-1.5} max={1.5} step={0.01} onChange={setDrift} format={pct} />
        <Slider label="Volatilidad propia (anual)" value={vol} min={0} max={2.5} step={0.01} onChange={setVol} format={(v) => formatPct(v, 0, false)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => ok(dispatch('market/asset-params', { assetId: a.id, drift, volatility: vol }), 'Parámetros aplicados')}>
            Aplicar parámetros
          </Button>
          <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { ok(dispatch('market/asset-params', { assetId: a.id, drift: null, volatility: null }), 'Parámetros restablecidos'); setDrift(a.drift); setVol(a.volatility); }}>
            Restablecer
          </Button>
          {a.custom && (
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (await confirm({ title: `Excluir ${a.symbol} de cotización`, tone: 'danger', confirmLabel: 'Eliminar activo' })) {
                  const r = dispatch('market/asset-delete', { assetId: a.id });
                  ok(r, 'Activo eliminado');
                  if (r.ok) select(p.market.assets[0].id);
                }
              }}
            >
              Eliminar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function CreateAssetCard() {
  const p = useProfile();
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>('stock');
  const [sector, setSector] = useState('');
  const [price, setPrice] = useState('50');
  const [drift, setDrift] = useState(0.1);
  const [vol, setVol] = useState(0.35);
  const [beta, setBeta] = useState(1);
  const [yld, setYld] = useState(0);
  const [description, setDescription] = useState('');
  const [country, setCountry] = useState('España');
  const [employees, setEmployees] = useState('1200');
  const [founded, setFounded] = useState('2015');
  const [ceo, setCeo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    setError(null);
    const pr = Number(price.replace(',', '.'));
    const r = run(
      'market/asset-create',
      {
        symbol,
        name,
        type,
        sector,
        price: pr,
        drift,
        volatility: vol,
        beta,
        yield: yld,
        description,
        company: type === 'stock' ? { country, employees: Number(employees) || 0, founded: Number(founded) || 2000, ceo: ceo || 'Sin asignar' } : undefined,
      },
      { success: `${symbol.toUpperCase()} ya cotiza en el mercado` },
    );
    if (r.ok) navigate(`/invest/asset/${r.result}`);
    else setError(r.message);
  };
  const field = (label: string, node: (id: string) => ReactNode) => <Field label={label}>{node}</Field>;
  return (
    <Card title="Crear activo o empresa ficticia" subtitle={`Se genera un historial previo de 90 días · ${p.market.assets.filter((a) => a.custom).length} activos personalizados`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {field('Símbolo', (id) => <Input id={id} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 10))} placeholder="ZEN" />)}
          {field('Nombre', (id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Zenith Labs" maxLength={80} />)}
          {field('Tipo', (id) => (
            <Select id={id} value={type} onChange={(e) => setType(e.target.value as AssetType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {ASSET_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          ))}
          {field('Sector', (id) => <Input id={id} value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Tecnología" maxLength={60} />)}
          {field('Precio inicial', (id) => <Input id={id} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />)}
        </div>
        <Slider label="Tendencia anual" value={drift} min={-1} max={1.5} step={0.01} onChange={setDrift} format={pct} />
        <Slider label="Volatilidad anual" value={vol} min={0} max={2} step={0.01} onChange={setVol} format={(v) => formatPct(v, 0, false)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Slider label="Beta (sensibilidad al mercado)" value={beta} min={-1} max={3} step={0.1} onChange={setBeta} format={(v) => v.toFixed(1)} />
          <Slider label="Dividendo / cupón anual" value={yld} min={0} max={0.15} step={0.005} onChange={setYld} format={(v) => formatPct(v, 1, false)} />
        </div>
        {type === 'stock' && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {field('País', (id) => <Input id={id} value={country} onChange={(e) => setCountry(e.target.value)} />)}
            {field('Empleados', (id) => <Input id={id} value={employees} onChange={(e) => setEmployees(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />)}
            {field('Fundación', (id) => <Input id={id} value={founded} onChange={(e) => setFounded(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />)}
            {field('CEO', (id) => <Input id={id} value={ceo} onChange={(e) => setCeo(e.target.value)} />)}
          </div>
        )}
        {field('Descripción', (id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} />)}
        <FormError message={error} />
        <Button onClick={submit} loading={pending} icon={<Plus className="size-4" />}>
          Listar en el mercado
        </Button>
      </div>
    </Card>
  );
}
