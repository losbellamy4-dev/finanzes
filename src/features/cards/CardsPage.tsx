import { useState } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { convert } from '@/core/money';
import { CARD_TYPE_LABELS, cardAvailable } from '@/engine/cards';
import { useMoney, useProfile } from '@/store/hooks';
import { Link } from '@/app/router';
import { BankCardVisual } from '@/ui/BankCard';
import { Badge, Button, EmptyState, PageHeader, Progress, Stat } from '@/ui/primitives';
import { NewCardDialog } from './CardDialogs';

export default function CardsPage() {
  const p = useProfile();
  const fmt = useMoney();
  const [creating, setCreating] = useState(false);
  const cards = p.cards.filter((c) => c.status !== 'cancelled');
  const cancelled = p.cards.filter((c) => c.status === 'cancelled');
  const curOf = (accId: string) => p.accounts.find((a) => a.id === accId)?.currency ?? p.profile.baseCurrency;
  const toBase = (c: number, accId: string) => convert(c, curOf(accId), p.profile.baseCurrency);
  const debt = cards.filter((c) => c.type === 'credit').reduce((a, c) => a + toBase(c.balance, c.accountId), 0);
  const limit = cards.filter((c) => c.type === 'credit').reduce((a, c) => a + toBase(c.creditLimit, c.accountId), 0);
  const prepaid = cards.filter((c) => c.type === 'prepaid').reduce((a, c) => a + toBase(c.balance, c.accountId), 0);

  return (
    <div>
      <PageHeader title="Tarjetas" subtitle="Débito, crédito y prepago virtuales con numeración ficticia" actions={<Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)} disabled={!p.accounts.some((a) => a.status === 'open')}>Nueva tarjeta</Button>} />
      {cards.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="nx-card p-3.5"><Stat label="Tarjetas activas" value={cards.length} /></div>
          <div className="nx-card p-3.5"><Stat label="Deuda en crédito" value={fmt(debt)} tone={debt > 0 ? 'neg' : undefined} /></div>
          <div className="nx-card p-3.5"><Stat label="Crédito disponible" value={fmt(Math.max(0, limit - debt))} /></div>
          <div className="nx-card p-3.5"><Stat label="Saldo prepago" value={fmt(prepaid)} /></div>
        </div>
      )}
      {cards.length === 0 ? (
        <EmptyState icon={<CreditCard className="size-5" />} title="Sin tarjetas" body="Crea tarjetas virtuales vinculadas a tus cuentas simuladas." action={<Button onClick={() => setCreating(true)} disabled={!p.accounts.some((a) => a.status === 'open')}>Crear tarjeta</Button>} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => {
            const cur = curOf(c.accountId);
            return (
              <Link key={c.id} to={`/cards/${c.id}`} className="group anim-fade-up block">
                <BankCardVisual card={c} className="transition-transform duration-300 group-hover:-translate-y-1" />
                <div className="mt-3 flex items-center justify-between px-1">
                  <div>
                    <div className="text-sm font-medium text-fg">{c.name}</div>
                    <div className="text-[12px] text-muted">
                      {CARD_TYPE_LABELS[c.type]} · {p.accounts.find((a) => a.id === c.accountId)?.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-sm font-semibold text-fg">{fmt(c.type === 'credit' ? c.balance : cardAvailable(p, c), { currency: cur })}</div>
                    <div className="text-[11px] text-muted">{c.type === 'credit' ? 'Deuda' : 'Disponible'}</div>
                  </div>
                </div>
                {c.type === 'credit' && <Progress className="mt-2" value={c.creditLimit ? c.balance / c.creditLimit : 0} color={c.balance / Math.max(1, c.creditLimit) > 0.7 ? 'var(--nx-neg)' : 'var(--nx-accent)'} label="Uso del crédito" />}
                {c.status === 'frozen' && <Badge tone="accent" className="mt-2">Congelada</Badge>}
              </Link>
            );
          })}
        </div>
      )}
      {cancelled.length > 0 && <p className="mt-6 text-[13px] text-subtle">{cancelled.length} tarjeta(s) cancelada(s) conservadas en el historial.</p>}
      {creating && <NewCardDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
