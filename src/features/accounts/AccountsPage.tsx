import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Banknote, Plus, Star, Wallet } from 'lucide-react';
import { convert } from '@/core/money';
import { formatDate } from '@/core/time';
import { ACCOUNT_TYPE_LABELS, formatIban } from '@/engine/banking';
import { useMoney, useProfile } from '@/store/hooks';
import { dispatch } from '@/store/hooks';
import { Link, navigate, usePath } from '@/app/router';
import { openMoneyDialog } from '@/features/banking/MoneyDialog';
import { Badge, Button, Card, cx, EmptyState, PageHeader, Stat } from '@/ui/primitives';
import { NewAccountDialog } from './AccountDialogs';

export default function AccountsPage() {
  const p = useProfile();
  const fmt = useMoney();
  const path = usePath();
  const [creating, setCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  useEffect(() => {
    if (path.includes('new=1')) {
      setCreating(true);
      navigate('/accounts');
    }
  }, [path]);

  const open = p.accounts.filter((a) => a.status === 'open');
  const closed = p.accounts.filter((a) => a.status === 'closed');
  const total = useMemo(() => open.reduce((acc, a) => acc + convert(a.balance, a.currency, p.profile.baseCurrency), 0), [open, p.profile.baseCurrency]);
  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of open) m.set(a.type, (m.get(a.type) ?? 0) + convert(a.balance, a.currency, p.profile.baseCurrency));
    return m;
  }, [open, p.profile.baseCurrency]);

  return (
    <div>
      <PageHeader
        title="Cuentas"
        subtitle={`${open.length} cuentas abiertas · saldo total ${fmt(total)}`}
        actions={
          <>
            <Button variant="secondary" icon={<Banknote className="size-4" />} onClick={() => openMoneyDialog('deposit')} disabled={!open.length}>
              Ingresar
            </Button>
            <Button variant="secondary" icon={<ArrowLeftRight className="size-4" />} onClick={() => openMoneyDialog('transfer')} disabled={open.length < 2}>
              Traspasar
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nueva cuenta
            </Button>
          </>
        }
      />
      {open.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(['checking', 'savings', 'investment', 'business'] as const).map((t) => (
            <div key={t} className="nx-card p-3.5">
              <Stat label={ACCOUNT_TYPE_LABELS[t]} value={fmt(byType.get(t) ?? 0)} />
            </div>
          ))}
        </div>
      )}
      {open.length === 0 ? (
        <EmptyState icon={<Wallet className="size-5" />} title="Aún no tienes cuentas" body="Abre una cuenta corriente, de ahorro, de inversión o empresarial. Puedes abrir tantas como quieras." action={<Button onClick={() => setCreating(true)}>Abrir mi primera cuenta</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {open.map((a) => (
            <div key={a.id} className="nx-card anim-fade-up group relative overflow-hidden p-5">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: a.color }} />
              <div className="flex items-start justify-between gap-2">
                <Link to={`/accounts/${a.id}`} className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-fg group-hover:text-accent">{a.name}</div>
                  <div className="mt-0.5 text-[12px] text-muted">{ACCOUNT_TYPE_LABELS[a.type]} · {a.currency}</div>
                </Link>
                <button
                  type="button"
                  aria-label={a.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
                  aria-pressed={a.favorite}
                  onClick={() => dispatch('account/update', { accountId: a.id, favorite: !a.favorite })}
                  className="text-subtle hover:text-warn"
                >
                  <Star className={cx('size-5', a.favorite && 'fill-warn text-warn')} />
                </button>
              </div>
              <Link to={`/accounts/${a.id}`} className="mt-5 block">
                <div className={cx('tabular text-[26px] font-semibold tracking-tight', a.balance < 0 ? 'text-neg' : 'text-fg')}>{fmt(a.balance, { currency: a.currency })}</div>
                <div className="tabular mt-1 truncate text-[12px] text-muted">{formatIban(a.iban)}</div>
              </Link>
              <div className="mt-4 flex items-center justify-between text-[12px] text-subtle">
                <span>Abierta el {formatDate(a.openedAt)}</span>
                {a.interestRate > 0 && <Badge tone="pos">{(a.interestRate * 100).toFixed(2)} % TIN</Badge>}
                {a.overdraftLimit > 0 && <Badge tone="warn">Descubierto {fmt(a.overdraftLimit, { currency: a.currency })}</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}
      {closed.length > 0 && (
        <Card className="mt-5" title={`Cuentas cerradas (${closed.length})`} action={<Button size="sm" variant="ghost" onClick={() => setShowClosed((v) => !v)}>{showClosed ? 'Ocultar' : 'Mostrar'}</Button>}>
          {showClosed && (
            <ul className="divide-y divide-line">
              {closed.map((a) => (
                <li key={a.id}>
                  <Link to={`/accounts/${a.id}`} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-muted">{a.name}</span>
                    <span className="text-subtle">Cerrada el {a.closedAt ? formatDate(a.closedAt) : '—'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {creating && <NewAccountDialog open onClose={() => setCreating(false)} />}
    </div>
  );
}
