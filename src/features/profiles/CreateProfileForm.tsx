import { useState } from 'react';
import { Sparkles, Wallet, FilePlus2 } from 'lucide-react';
import type { Currency } from '@/core/schema';
import { CURRENCY_CODES, CURRENCY_NAMES, parseMoney } from '@/core/money';
import { COUNTRIES } from '@/data/labels';
import { appStore, type CreateProfileInput } from '@/store/appStore';
import { toast } from '@/store/toast';
import { Button, cx, Field, FormError, Input, MoneyInput, Select } from '@/ui/primitives';

const MODES: { value: CreateProfileInput['mode']; title: string; body: string; icon: typeof Sparkles }[] = [
  { value: 'demo', title: 'Perfil de demostración', body: 'Cuentas, tarjetas, inversiones, ahorro y un piso alquilado listos para explorar.', icon: Sparkles },
  { value: 'quick', title: 'Empezar con una cuenta', body: 'Una cuenta corriente con el saldo inicial que elijas.', icon: Wallet },
  { value: 'empty', title: 'Desde cero', body: 'Perfil vacío: abre tus propias cuentas y productos.', icon: FilePlus2 },
];

export function CreateProfileForm({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const [name, setName] = useState('Mi patrimonio');
  const [owner, setOwner] = useState('');
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [country, setCountry] = useState('ES');
  const [mode, setMode] = useState<CreateProfileInput['mode']>('demo');
  const [initial, setInitial] = useState('1.000');
  const [seed, setSeed] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Indica un nombre para el perfil.');
    if (!owner.trim()) return setError('Indica el nombre del titular (ficticio).');
    let initialBalance: number | undefined;
    if (mode === 'quick') {
      const c = parseMoney(initial);
      if (c === null || c < 0) return setError('Saldo inicial no válido.');
      initialBalance = c;
    }
    let seedNum: number | undefined;
    if (seed.trim()) {
      const n = Number(seed);
      if (!Number.isInteger(n) || n < 0 || n > 4294967295) return setError('La semilla debe ser un entero positivo.');
      seedNum = n;
    }
    setPending(true);
    try {
      await appStore.createProfile({ name: name.trim(), ownerName: owner.trim(), baseCurrency: currency, country, mode, initialBalance, seed: seedNum });
      toast.success('Perfil creado', mode === 'demo' ? 'Explora el perfil de demostración.' : undefined);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el perfil.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className={cx('grid gap-4', !compact && 'sm:grid-cols-2')}>
        <Field label="Nombre del perfil">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</Field>
        <Field label="Titular (ficticio)">{(id) => <Input id={id} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="p. ej. Alex García" maxLength={80} />}</Field>
        <Field label="Divisa base">
          {(id) => (
            <Select id={id} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c} · {CURRENCY_NAMES[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="País">
          {(id) => (
            <Select id={id} value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-muted">¿Cómo quieres empezar?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <label
              key={m.value}
              className={cx(
                'flex cursor-pointer flex-col gap-1.5 rounded-2xl border p-3.5 transition-colors',
                mode === m.value ? 'border-accent bg-accent/8' : 'border-line bg-surface-2 hover:border-line-strong',
              )}
            >
              <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="sr-only" />
              <m.icon className={cx('size-5', mode === m.value ? 'text-accent' : 'text-muted')} />
              <span className="text-sm font-semibold text-fg">{m.title}</span>
              <span className="text-[12px] leading-snug text-muted">{m.body}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {mode === 'quick' && <Field label="Saldo inicial">{(id) => <MoneyInput id={id} value={initial} onChange={setInitial} currency={currency} />}</Field>}
      <details className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-sm">
        <summary className="cursor-pointer text-muted">Opciones avanzadas</summary>
        <div className="mt-3">
          <Field label="Semilla del mercado (opcional)" hint="Con la misma semilla, el mercado evoluciona exactamente igual.">
            {(id) => <Input id={id} value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Aleatoria" />}
          </Field>
        </div>
      </details>
      <FormError message={error} />
      <Button type="submit" size="lg" block loading={pending}>
        Crear perfil
      </Button>
    </form>
  );
}
