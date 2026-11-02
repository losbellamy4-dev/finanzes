import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Gift, Info, Pencil, Plus, Trash2, UserPlus, Vault, XCircle } from 'lucide-react';
import { formatMoney, parseMoney } from '@/core/money';
import { formatDate } from '@/core/time';
import { adviseWealth, projectWealth, VAULT_CATEGORIES } from '@/engine/products/wealth';
import { portfolioView } from '@/engine/selectors';
import { computeCreditScore } from '@/engine/creditScore';
import { dispatch, useMoney, useOverview, useProfile } from '@/store/hooks';
import { confirm, toast } from '@/store/toast';
import { useThemeColors } from '@/app/theme';
import { Button, Card, EmptyState, Field, IconButton, Input, KeyValue, MoneyInput, PageHeader } from '@/ui/primitives';
import { BeneficiaryDialog, DonateDialog, VaultDialog } from './dialogs';
import type { VaultItem } from '@/core/schema';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function WealthPage() {
  const p = useProfile();
  const ov = useOverview();
  const fmt = useMoney();
  const [vault, setVault] = useState<{ item?: VaultItem } | null>(null);
  const [benef, setBenef] = useState(false);
  const [donate, setDonate] = useState(false);

  const advice = useMemo(() => {
    const pv = portfolioView(p);
    const crypto = pv.byType.get('crypto') ?? 0;
    const score = computeCreditScore(p);
    const util = score.factors.find((f) => f.key === 'utilization');
    return adviseWealth({
      netWorth: ov.netWorth,
      cash: ov.available,
      invested: ov.invested,
      properties: ov.properties,
      debts: ov.debts.total,
      monthlyIncome: ov.monthlyIncome,
      monthlyExpenses: ov.monthlyExpenses,
      cryptoShare: pv.total ? crypto / pv.total : 0,
      largestPositionShare: pv.positions[0]?.weight ?? 0,
      creditUtilization: util && util.value.includes('%') ? Number(util.value.split(' ')[0]) / 100 : 0,
      hasLifeInsurance: p.insurance.some((x) => x.type === 'life' && x.status === 'active'),
      hasHomeInsurance: p.insurance.some((x) => x.type === 'home' && x.status === 'active'),
      ownsProperty: p.properties.some((x) => x.owned),
      currency: p.profile.baseCurrency,
    });
  }, [p, ov]);

  const donatedYear = p.donations.filter((d) => new Date(d.at).getUTCFullYear() === new Date(Date.parse(p.clock.startAt) + p.clock.tick * 3_600_000).getUTCFullYear()).reduce((a, d) => a + d.amount, 0);
  const icons = { good: <CheckCircle2 className="size-5 text-pos" />, warning: <AlertTriangle className="size-5 text-warn" />, danger: <XCircle className="size-5 text-neg" />, info: <Info className="size-5 text-accent" /> };

  return (
    <div>
      <PageHeader title="Patrimonio" subtitle="Asesor simulado, caja fuerte digital, planificación y donaciones" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Asesor patrimonial simulado" subtitle="Recomendaciones automáticas basadas en reglas, no constituyen asesoramiento real" className="lg:col-span-2">
          <ul className="space-y-2.5">
            {advice.map((a, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-line bg-surface-2/50 p-3">
                <span className="mt-0.5 shrink-0">{icons[a.level]}</span>
                <div>
                  <div className="text-sm font-semibold text-fg">{a.title}</div>
                  <p className="mt-0.5 text-[13px] text-muted">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Composición del patrimonio">
          <KeyValue
            items={[
              { label: 'Liquidez', value: fmt(ov.accountsTotal + ov.prepaid) },
              { label: 'Inversiones', value: fmt(ov.invested) },
              { label: 'Ahorro y depósitos', value: fmt(ov.savings) },
              { label: 'Inmuebles', value: fmt(ov.properties) },
              { label: 'Caja fuerte', value: fmt(ov.vault) },
              { label: 'Deudas', value: fmt(-ov.debts.total), tone: ov.debts.total ? 'neg' : undefined },
              { label: 'Patrimonio neto', value: fmt(ov.netWorth) },
            ]}
          />
        </Card>
      </div>

      <PlanningCard start={ov.netWorth} />

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Caja fuerte digital" subtitle={`${p.vault.length} elementos · ${fmt(ov.vault)}`} action={<Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setVault({})}>Añadir</Button>}>
          {p.vault.length === 0 ? (
            <EmptyState icon={<Vault className="size-5" />} title="Caja fuerte vacía" body="Registra joyas, arte, coleccionables o documentos con su valor estimado." />
          ) : (
            <ul className="divide-y divide-line">
              {p.vault.map((v) => (
                <li key={v.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg">{v.name}</div>
                    <div className="truncate text-[12px] text-muted">{VAULT_CATEGORIES[v.category]} · {formatDate(v.addedAt)}{v.notes ? ` · ${v.notes}` : ''}</div>
                  </div>
                  <span className="tabular text-sm font-semibold text-fg">{fmt(v.value)}</span>
                  <IconButton label="Editar" onClick={() => setVault({ item: v })}><Pencil className="size-4" /></IconButton>
                  <IconButton label="Eliminar" onClick={async () => { if (await confirm({ title: `Eliminar «${v.name}»`, tone: 'danger', confirmLabel: 'Eliminar' })) dispatch('vault/remove', { itemId: v.id }); }}><Trash2 className="size-4" /></IconButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-5">
          <Card title="Beneficiarios" subtitle={`Reparto asignado: ${p.beneficiaries.reduce((a, b) => a + b.share, 0)} %`} action={<Button size="sm" variant="secondary" icon={<UserPlus className="size-4" />} onClick={() => setBenef(true)}>Añadir</Button>}>
            {p.beneficiaries.length === 0 ? (
              <p className="text-sm text-muted">Designa quién heredaría tu patrimonio simulado.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.beneficiaries.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-fg">{b.name} <span className="text-muted">· {b.relation}</span></span>
                    <span className="tabular font-semibold text-fg">{b.share} %</span>
                    <span className="tabular w-24 text-right text-muted">{fmt(Math.round((ov.netWorth * b.share) / 100))}</span>
                    <IconButton label="Eliminar beneficiario" onClick={() => dispatch('beneficiary/remove', { beneficiaryId: b.id })}><Trash2 className="size-4" /></IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Donaciones" subtitle={`Este año: ${fmt(donatedYear)}`} action={<Button size="sm" icon={<Gift className="size-4" />} onClick={() => setDonate(true)}>Donar</Button>}>
            {p.donations.length === 0 ? (
              <p className="text-sm text-muted">Apoya causas ficticias; las donaciones cuentan como gasto en tus estadísticas.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.donations.slice(0, 8).map((d) => (
                  <li key={d.id} className="flex justify-between py-2 text-sm">
                    <span className="text-muted">{d.charityName} · {formatDate(d.at)}</span>
                    <span className="tabular font-medium text-fg">{formatMoney(d.amount, p.accounts.find((a) => a.id === d.accountId)?.currency ?? p.profile.baseCurrency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {vault && <VaultDialog item={vault.item} onClose={() => setVault(null)} />}
      {benef && <BeneficiaryDialog onClose={() => setBenef(false)} />}
      {donate && <DonateDialog onClose={() => { setDonate(false); toast.info('Gracias por participar'); }} />}
    </div>
  );
}

function PlanningCard({ start }: { start: number }) {
  const p = useProfile();
  const fmt = useMoney();
  const c = useThemeColors();
  const [monthly, setMonthly] = useState('300');
  const [ret, setRet] = useState('5');
  const [infl, setInfl] = useState('2');
  const [years, setYears] = useState('25');
  const data = useMemo(
    () =>
      projectWealth({
        start: Math.max(0, start),
        monthly: parseMoney(monthly) ?? 0,
        annualReturn: Number(ret.replace(',', '.')) / 100 || 0,
        inflation: Number(infl.replace(',', '.')) / 100 || 0,
        years: Number(years) || 1,
      }),
    [start, monthly, ret, infl, years],
  );
  const last = data[data.length - 1];
  return (
    <Card className="mt-5" title="Planificación patrimonial" subtitle="Proyección con aportaciones mensuales, interés compuesto e inflación">
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <Field label="Aportación mensual">{(id) => <MoneyInput id={id} value={monthly} onChange={setMonthly} currency={p.profile.baseCurrency} />}</Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Rent. %">{(id) => <Input id={id} value={ret} onChange={(e) => setRet(e.target.value)} inputMode="decimal" />}</Field>
            <Field label="Inflac. %">{(id) => <Input id={id} value={infl} onChange={(e) => setInfl(e.target.value)} inputMode="decimal" />}</Field>
            <Field label="Años">{(id) => <Input id={id} value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />}</Field>
          </div>
          <KeyValue
            items={[
              { label: 'Patrimonio inicial', value: fmt(Math.max(0, start)) },
              { label: `Valor nominal en ${last.year} años`, value: fmt(last.nominal), tone: 'pos' },
              { label: 'Valor real (hoy)', value: fmt(last.real) },
              { label: 'Total aportado', value: fmt(last.contributed) },
            ]}
          />
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={c.line} />
              <XAxis dataKey="year" tick={{ fill: c.subtle, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v} a`} />
              <YAxis orientation="right" tick={{ fill: c.subtle, fontSize: 11 }} axisLine={false} tickLine={false} width={78} tickFormatter={(v: number) => fmt(v, { compact: true })} />
              <Tooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-xl">
                      <div className="text-muted">Año {label}</div>
                      <div className="tabular font-semibold text-fg">Nominal {fmt(Number(payload[0].payload.nominal))}</div>
                      <div className="tabular text-muted">Real {fmt(Number(payload[0].payload.real))}</div>
                      <div className="tabular text-muted">Aportado {fmt(Number(payload[0].payload.contributed))}</div>
                    </div>
                  ) : null
                }
              />
              <Area type="monotone" dataKey="nominal" stroke={c.series[0]} fill={c.series[0]} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
              <Line type="monotone" dataKey="real" stroke={c.series[2]} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="contributed" stroke={c.muted} strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-1 flex flex-wrap gap-4 text-[12px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: c.series[0] }} /> Nominal</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: c.series[2] }} /> Real (descontada inflación)</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed" style={{ borderColor: c.muted }} /> Aportado</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
