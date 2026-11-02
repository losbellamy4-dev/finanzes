/**
 * Gráficas financieras (Recharts). Siempre se alimentan de datos reales del
 * estado simulado; nunca generan valores al renderizar.
 */
import { memo, useId, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useThemeColors } from '@/app/theme';
import { cx } from './primitives';

export interface SeriesPoint {
  t: number;
  v: number;
}

function TooltipBox({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-xl">{children}</div>;
}

const dateTick = (span: number) => (t: number) => {
  const d = new Date(t);
  if (span <= 2 * 86_400_000) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  if (span <= 120 * 86_400_000) return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

const tooltipDate = (span: number) => (t: number) =>
  new Date(t).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: span > 300 * 86_400_000 ? 'numeric' : undefined,
    hour: span <= 7 * 86_400_000 ? '2-digit' : undefined,
    minute: span <= 7 * 86_400_000 ? '2-digit' : undefined,
    timeZone: 'UTC',
  });

/** Serie temporal con área, cruz de referencia y tooltip. */
export const TimeSeriesChart = memo(function TimeSeriesChart({
  data,
  height = 220,
  format,
  tone = 'auto',
  showYAxis = true,
  label = 'Valor',
}: {
  data: SeriesPoint[];
  height?: number;
  format: (v: number) => string;
  tone?: 'auto' | 'accent' | 'pos' | 'neg';
  showYAxis?: boolean;
  label?: string;
}) {
  const c = useThemeColors();
  const gid = useId().replace(/:/g, '');
  if (data.length < 2 || data[data.length - 1].t - data[0].t <= 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center rounded-xl bg-surface-2/50 text-sm text-muted">
        Aún no hay suficiente historial: avanza el tiempo para ver la evolución.
      </div>
    );
  }
  const first = data[0].v;
  const last = data[data.length - 1].v;
  const color = tone === 'accent' ? c.accent : tone === 'pos' ? c.pos : tone === 'neg' ? c.neg : last >= first ? c.pos : c.neg;
  const span = data[data.length - 1].t - data[0].t;
  const values = data.map((d) => d.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Rango mínimo del 0,3 % para no exagerar variaciones ínfimas.
  const pad = Math.max((max - min) * 0.12, Math.abs(max) * 0.003) || 1;
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`${label}: de ${format(first)} a ${format(last)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: showYAxis ? 4 : 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c.line} strokeDasharray="0" />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={dateTick(span)}
            tick={{ fill: c.subtle, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            hide={!showYAxis}
            orientation="right"
            domain={[min - pad, max + pad]}
            tickFormatter={(v: number) => format(v)}
            tick={{ fill: c.subtle, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={78}
            tickCount={4}
          />
          <Tooltip
            cursor={{ stroke: c.muted, strokeWidth: 1, strokeDasharray: '3 3' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox>
                  <div className="text-muted">{tooltipDate(span)(payload[0].payload.t)}</div>
                  <div className="tabular mt-0.5 font-semibold text-fg">{format(payload[0].payload.v)}</div>
                </TooltipBox>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#g${gid})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4.5, stroke: c.surface, strokeWidth: 2, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

export const Sparkline = memo(function Sparkline({ values, width = 84, height = 30, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  const c = useThemeColors();
  if (values.length < 2) return <div style={{ width, height }} />;
  const color = values[values.length - 1] >= values[0] ? c.pos : c.neg;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ width, height }} className={cx('shrink-0', className)} aria-hidden>
      <LineChart width={width} height={height} data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={false} />
      </LineChart>
    </div>
  );
});

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

export const DonutChart = memo(function DonutChart({
  data,
  size = 180,
  center,
  format,
}: {
  data: DonutSlice[];
  size?: number;
  center?: ReactNode;
  format: (v: number) => string;
}) {
  const c = useThemeColors();
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={data.map((d) => `${d.name}: ${format(d.value)}`).join(', ')}>
      <PieChart width={size} height={size}>
        <Pie
          data={(total > 0 ? data : [{ name: 'Vacío', value: 1, color: c.surface2 }]).map((d) => ({ ...d }) as Record<string, string | number>)}
          dataKey="value"
          nameKey="name"
          innerRadius={size * 0.36}
          outerRadius={size * 0.48}
          paddingAngle={data.length > 1 ? 1.5 : 0}
          stroke={c.surface}
          strokeWidth={2}
          isAnimationActive={false}
        >
          {(total > 0 ? data : [{ color: c.surface2 }]).map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        {total > 0 && (
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox>
                  <div className="text-muted">{payload[0].name}</div>
                  <div className="tabular font-semibold text-fg">
                    {format(Number(payload[0].value))} · {((Number(payload[0].value) / total) * 100).toFixed(1)} %
                  </div>
                </TooltipBox>
              ) : null
            }
          />
        )}
      </PieChart>
      {center && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
});

export function Legend({ items, format, total }: { items: DonutSlice[]; format: (v: number) => string; total?: number }) {
  const sum = total ?? items.reduce((a, d) => a + d.value, 0);
  return (
    <ul className="min-w-0 flex-1 space-y-2">
      {items.map((it) => (
        <li key={it.name} className="flex items-center gap-2.5 text-[13px]">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: it.color }} />
          <span className="min-w-0 flex-1 truncate text-muted">{it.name}</span>
          <span className="tabular font-medium text-fg">{format(it.value)}</span>
          <span className="tabular w-12 text-right text-subtle">{sum > 0 ? `${((it.value / sum) * 100).toFixed(0)} %` : '—'}</span>
        </li>
      ))}
    </ul>
  );
}

export const IncomeExpenseBars = memo(function IncomeExpenseBars({
  data,
  format,
  height = 200,
}: {
  data: { label: string; income: number; expenses: number }[];
  format: (v: number) => string;
  height?: number;
}) {
  const c = useThemeColors();
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={c.line} />
          <XAxis dataKey="label" tick={{ fill: c.subtle, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: c.surface2, opacity: 0.6 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox>
                  <div className="mb-1 text-muted capitalize">{label}</div>
                  {payload.map((p) => (
                    <div key={String(p.dataKey)} className="flex items-center gap-2">
                      <span className="size-2 rounded-sm" style={{ background: String(p.color) }} />
                      <span className="text-muted">{p.dataKey === 'income' ? 'Ingresos' : 'Gastos'}</span>
                      <span className="tabular ml-auto font-semibold text-fg">{format(Number(p.value))}</span>
                    </div>
                  ))}
                </TooltipBox>
              ) : null
            }
          />
          <Bar dataKey="income" fill={c.pos} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={22} />
          <Bar dataKey="expenses" fill={c.neg} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
