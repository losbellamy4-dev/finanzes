import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, MinusCircle } from 'lucide-react';
import { formatMoney, parseMoney } from '@/core/money';
import { formatDate, tickToDate } from '@/core/time';
import { computeCreditScore, scoreBand, scoreInputs, simulateScore, type WhatIf } from '@/engine/creditScore';
import { useMoney, useOverview, useProfile } from '@/store/hooks';
import { useThemeColors } from '@/app/theme';
import { TimeSeriesChart } from '@/ui/charts';
import { Badge, Card, cx, Field, Input, KeyValue, MoneyInput, PageHeader, Progress } from '@/ui/primitives';

function Gauge({ score }: { score: number }) {
  const c = useThemeColors();
  const band = scoreBand(score);
  const t = (score - 300) / 550;
  const angle = Math.PI * (1 - t);
  const r = 90;
  const cx0 = 110;
  const cy0 = 110;
  const x = cx0 + r * Math.cos(angle);
  const y = cy0 - r * Math.sin(angle);
  const arc = (a0: number, a1: number) => {
    const p0 = { x: cx0 + r * Math.cos(Math.PI * (1 - a0)), y: cy0 - r * Math.sin(Math.PI * (1 - a0)) };
    const p1 = { x: cx0 + r * Math.cos(Math.PI * (1 - a1)), y: cy0 - r * Math.sin(Math.PI * (1 - a1)) };
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`;
  };
  const segs = [
    { a: 0, b: (580 - 300) / 550, col: '#F05B65' },
    { a: (580 - 300) / 550, b: (670 - 300) / 550, col: '#F5A524' },
    { a: (670 - 300) / 550, b: (740 - 300) / 550, col: '#5488F5' },
    { a: (740 - 300) / 550, b: (800 - 300) / 550, col: '#4ADE80' },
    { a: (800 - 300) / 550, b: 1, col: '#24C78A' },
  ];
  return (
    <svg viewBox="0 0 220 130" className="mx-auto w-full max-w-[280px]" role="img" aria-label={`Puntuación ${score}: ${band.label}`}>
      {segs.map((s, i) => (
        <path key={i} d={arc(s.a + 0.004, s.b - 0.004)} stroke={s.col} strokeWidth={14} fill="none" strokeLinecap="butt" opacity={0.9} />
      ))}
      <circle cx={x} cy={y} r={9} fill={c.surface} stroke={band.color} strokeWidth={4} />
      <text x="110" y="98" textAnchor="middle" className="tabular" fontSize="34" fontWeight="700" fill={c.fg}>
        {score}
      </text>
      <text x="110" y="120" textAnchor="middle" fontSize="12" fill={c.muted}>
        de 850 · {band.label}
      </text>
    </svg>
  );
}

export default function CreditPage() {
  const p = useProfile();
  const ov = useOverview();
  const fmt = useMoney();
  const result = useMemo(() => computeCreditScore(p), [p]);
  const inputs = useMemo(() => scoreInputs(p), [p]);
  const history = useMemo(() => {
    const pts = p.creditHistory.map((h) => ({ t: Date.parse(h.at), v: h.score }));
    pts.push({ t: tickToDate(p.clock.startAt, p.clock.tick).getTime(), v: result.score });
    return pts;
  }, [p.creditHistory, p.clock, result.score]);

  const [payRevolving, setPayRevolving] = useState('');
  const [newLoan, setNewLoan] = useState('');
  const [newCard, setNewCard] = useState('');
  const [late, setLate] = useState('0');
  const [missed, setMissed] = useState('0');
  const [onTime, setOnTime] = useState('0');
  const w: WhatIf = {
    payRevolving: parseMoney(payRevolving) ?? 0,
    newLoan: parseMoney(newLoan) ?? 0,
    newCardLimit: parseMoney(newCard) ?? 0,
    latePayments: Number(late) || 0,
    missedPayments: Number(missed) || 0,
    onTimePayments: Number(onTime) || 0,
  };
  const sim = useMemo(() => simulateScore(p, w), [p, w.payRevolving, w.newLoan, w.newCardLimit, w.latePayments, w.missedPayments, w.onTimePayments]); // eslint-disable-line react-hooks/exhaustive-deps
  const delta = sim.score - result.score;
  const icons = { positive: <CheckCircle2 className="size-4 text-pos" />, negative: <AlertTriangle className="size-4 text-neg" />, neutral: <MinusCircle className="size-4 text-muted" /> };
  const cur = p.profile.baseCurrency;

  return (
    <div>
      <PageHeader title="Credit Score" subtitle="Puntuación crediticia simulada «Nexus Score» (300–850)" />
      <div className="mb-5 flex items-start gap-2 rounded-2xl border border-line bg-surface-2/60 px-4 py-3 text-[13px] text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" />
        Modelo educativo del simulador. No es una puntuación oficial ni una evaluación crediticia real, y no se comparte con ninguna entidad.
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Tu puntuación">
          <Gauge score={result.score} />
          <div className="mt-2 text-center">
            <Badge tone={result.score >= 740 ? 'pos' : result.score >= 670 ? 'accent' : result.score >= 580 ? 'warn' : 'neg'}>{result.band.label}</Badge>
          </div>
          <KeyValue
            className="mt-4"
            items={[
              { label: 'Deudas totales', value: fmt(ov.debts.total) },
              { label: 'Crédito rotativo usado', value: `${formatMoney(inputs.revolvingBalance, cur)} / ${formatMoney(inputs.revolvingLimit, cur)}` },
              { label: 'Pagos en plazo', value: String(inputs.onTime), tone: inputs.onTime ? 'pos' : undefined },
              { label: 'Pagos tardíos / impagos', value: `${inputs.late} / ${inputs.missed}`, tone: inputs.late + inputs.missed ? 'neg' : undefined },
              { label: 'Solicitudes (6 meses)', value: String(inputs.inquiries180) },
            ]}
          />
        </Card>
        <Card title="Evolución" className="lg:col-span-2">
          <TimeSeriesChart data={history} height={250} format={(v) => String(Math.round(v))} label="Credit score" tone="accent" />
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Factores que influyen">
          <ul className="space-y-3">
            {result.factors.map((f) => (
              <li key={f.key} className="rounded-xl border border-line bg-surface-2/50 p-3">
                <div className="flex items-center gap-2">
                  {icons[f.impact]}
                  <span className="text-sm font-semibold text-fg">{f.label}</span>
                  {f.weight > 0 && <span className="text-[11px] text-subtle">peso {Math.round(f.weight * 100)} %</span>}
                  <span className="ml-auto text-[12px] text-muted">{f.value}</span>
                </div>
                {f.weight > 0 && <Progress className="mt-2" value={f.component} color={f.impact === 'positive' ? 'var(--nx-pos)' : f.impact === 'negative' ? 'var(--nx-neg)' : 'var(--nx-accent)'} label={f.label} />}
                <p className="mt-1.5 text-[12px] text-muted">{f.description}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Simula tus decisiones" subtitle="¿Cómo cambiaría tu puntuación?">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pagar deuda de tarjetas/líneas">{(id) => <MoneyInput id={id} value={payRevolving} onChange={setPayRevolving} currency={cur} />}</Field>
            <Field label="Pedir un préstamo de">{(id) => <MoneyInput id={id} value={newLoan} onChange={setNewLoan} currency={cur} />}</Field>
            <Field label="Nueva tarjeta con límite">{(id) => <MoneyInput id={id} value={newCard} onChange={setNewCard} currency={cur} />}</Field>
            <Field label="Pagos puntuales futuros">{(id) => <Input id={id} value={onTime} onChange={(e) => setOnTime(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />}</Field>
            <Field label="Pagos con retraso">{(id) => <Input id={id} value={late} onChange={(e) => setLate(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />}</Field>
            <Field label="Cuotas impagadas">{(id) => <Input id={id} value={missed} onChange={(e) => setMissed(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />}</Field>
          </div>
          <div className="mt-5 flex items-center justify-between rounded-2xl border border-line bg-surface-2/60 p-4">
            <div>
              <div className="text-[13px] text-muted">Puntuación simulada</div>
              <div className="tabular text-3xl font-semibold text-fg">{sim.score}</div>
              <div className="text-[12px] text-muted">{sim.band.label}</div>
            </div>
            <div className={cx('tabular text-2xl font-semibold', delta > 0 ? 'text-pos' : delta < 0 ? 'text-neg' : 'text-muted')}>{delta > 0 ? `+${delta}` : delta}</div>
          </div>
        </Card>
      </div>
      <Card className="mt-5" title="Historial crediticio">
        {p.creditEvents.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay eventos crediticios. Pagar cuotas y tarjetas en plazo construye tu historial.</p>
        ) : (
          <ul className="divide-y divide-line">
            {p.creditEvents.slice().reverse().slice(0, 25).map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate text-fg">{e.description}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={e.type === 'on_time_payment' || e.type === 'debt_paid_off' ? 'pos' : e.type === 'hard_inquiry' ? 'neutral' : 'neg'}>
                    {{ on_time_payment: 'En plazo', late_payment: 'Retraso', missed_payment: 'Impago', hard_inquiry: 'Solicitud', debt_paid_off: 'Deuda saldada', default: 'Incumplimiento' }[e.type]}
                  </Badge>
                  <span className="text-[12px] text-subtle">{formatDate(e.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
