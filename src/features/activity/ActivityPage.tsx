import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import type { Category, Flow, Transaction } from '@/core/schema';
import { CATEGORY_IDS } from '@/core/schema';
import { CATEGORY_LABELS, KIND_LABELS, STATUS_LABELS } from '@/data/labels';
import { useMoney, useOverview, useProfile } from '@/store/hooks';
import { toast } from '@/store/toast';
import { TxRow } from '@/ui/domain';
import { Button, Card, EmptyState, Input, PageHeader, Select, Stat } from '@/ui/primitives';

const FLOW_LABELS: Record<Flow, string> = { income: 'Ingresos', expense: 'Gastos', internal: 'Internos', investment: 'Inversión', financing: 'Financiación' };

function toCsv(rows: Transaction[]): string {
  const esc = (v: string | number | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['id', 'fecha', 'tipo', 'flujo', 'estado', 'importe', 'divisa', 'origen', 'destino', 'concepto', 'categoría'];
  const lines = rows.map((t) => [t.id, t.at, KIND_LABELS[t.kind], FLOW_LABELS[t.flow], STATUS_LABELS[t.status], (t.amount / 100).toFixed(2), t.currency, t.from.label, t.to.label, t.concept, CATEGORY_LABELS[t.category]].map(esc).join(';'));
  return [header.join(';'), ...lines].join('\n');
}

export default function ActivityPage() {
  const p = useProfile();
  const ov = useOverview();
  const fmt = useMoney();
  const [q, setQ] = useState('');
  const [flow, setFlow] = useState<'all' | Flow>('all');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [status, setStatus] = useState<'all' | Transaction['status']>('all');
  const [account, setAccount] = useState('all');
  const [limit, setLimit] = useState(50);
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const out: Transaction[] = [];
    for (let i = p.transactions.length - 1; i >= 0; i--) {
      const t = p.transactions[i];
      if (flow !== 'all' && t.flow !== flow) continue;
      if (category !== 'all' && t.category !== category) continue;
      if (status !== 'all' && t.status !== status) continue;
      if (account !== 'all' && t.from.id !== account && t.to.id !== account) continue;
      if (qq && !`${t.concept} ${t.from.label} ${t.to.label}`.toLowerCase().includes(qq)) continue;
      out.push(t);
    }
    return out;
  }, [p.transactions, q, flow, category, status, account]);

  const exportCsv = () => {
    const blob = new Blob([`﻿${toCsv(filtered)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Movimientos exportados', `${filtered.length} filas en CSV`);
  };

  return (
    <div>
      <PageHeader title="Actividad" subtitle="Historial auditable de todas las operaciones del perfil" actions={<Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!filtered.length}>Exportar CSV</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="nx-card p-3.5"><Stat label="Movimientos totales" value={p.transactions.length} /></div>
        <div className="nx-card p-3.5"><Stat label="Ingresos del mes" value={fmt(ov.monthlyIncome)} tone="pos" /></div>
        <div className="nx-card p-3.5"><Stat label="Gastos del mes" value={fmt(ov.monthlyExpenses)} tone={ov.monthlyExpenses ? 'neg' : undefined} /></div>
        <div className="nx-card p-3.5"><Stat label="Operaciones fallidas" value={p.transactions.filter((t) => t.status === 'failed').length} /></div>
      </div>
      <Card>
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="pl-10" aria-label="Buscar" />
          </div>
          <Select aria-label="Flujo" value={flow} onChange={(e) => setFlow(e.target.value as 'all' | Flow)}>
            <option value="all">Todos los flujos</option>
            {Object.entries(FLOW_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Select aria-label="Categoría" value={category} onChange={(e) => setCategory(e.target.value as 'all' | Category)}>
            <option value="all">Todas las categorías</option>
            {CATEGORY_IDS.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
          <Select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as 'all' | Transaction['status'])}>
            <option value="all">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Select aria-label="Cuenta" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="all">Todas las cuentas</option>
            {p.accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="Sin movimientos" body="No hay operaciones que coincidan con los filtros." />
        ) : (
          <>
            <div className="divide-y divide-line">
              {filtered.slice(0, limit).map((t) => (
                <TxRow key={t.id} tx={t} hide={p.settings.hideBalances} />
              ))}
            </div>
            {filtered.length > limit && (
              <div className="mt-3 text-center">
                <Button variant="ghost" onClick={() => setLimit((l) => l + 100)}>Cargar más ({filtered.length - limit} restantes)</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
