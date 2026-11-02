import { useState, type ReactNode } from 'react';
import { Briefcase, Building, Gem, Gift, HandHeart, Home, Landmark, Laptop, LineChart, Lock, PiggyBank, Plane, ScrollText, ShieldCheck, Sparkles, Target, Vault, Wallet, HeartPulse } from 'lucide-react';
import type { InsuranceType } from '@/core/schema';
import { formatMoney, formatPct, parseMoney } from '@/core/money';
import { loanSummary, OPENING_FEE } from '@/engine/products/loans';
import { suggestedDepositRate } from '@/engine/products/deposits';
import { INSURANCE_PRODUCTS, quoteInsurance } from '@/engine/products/insurance';
import { useProfile } from '@/store/hooks';
import { navigate } from '@/app/router';
import { Modal } from '@/ui/overlays';
import { Badge, Button, Field, Input, KeyValue, MoneyInput, PageHeader, Segmented } from '@/ui/primitives';
import { CreditLineDialog, DepositDialog, DonateDialog, GoalDialog, InsuranceDialog, LoanDialog, SavingsAccountDialog } from './dialogs';

type Category = 'savings' | 'financing' | 'insurance' | 'wealth';
type Action =
  | { type: 'savingsAccount' }
  | { type: 'deposit'; kind: 'fixed' | 'structured' }
  | { type: 'goal'; kind: 'goal' | 'pot' }
  | { type: 'loan'; kind: 'personal' | 'mortgage' | 'business' }
  | { type: 'creditLine' }
  | { type: 'insurance'; kind: InsuranceType }
  | { type: 'donate' }
  | { type: 'navigate'; to: string; label: string };

interface Product {
  id: string;
  category: Category;
  name: string;
  tagline: string;
  icon: typeof Wallet;
  conditions: string[];
  costs: string;
  interest: string;
  duration: string;
  action: Action;
  sim: 'savings' | 'deposit' | 'structured' | 'goal' | 'loan' | 'creditLine' | 'insurance' | 'none';
  simParams?: Record<string, number | string>;
}

const PRODUCTS: Product[] = [
  { id: 'remunerada', category: 'savings', name: 'Cuenta remunerada', tagline: 'Liquidez total con intereses mensuales', icon: Wallet, conditions: ['Sin permanencia', 'Disponibilidad inmediata', 'Intereses abonados el día 1 de cada mes'], costs: 'Sin comisiones', interest: '2,50 % TIN', duration: 'Indefinida', action: { type: 'savingsAccount' }, sim: 'savings', simParams: { rate: 0.025 } },
  { id: 'plazo', category: 'savings', name: 'Depósito a plazo fijo', tagline: 'Rentabilidad garantizada a vencimiento', icon: Lock, conditions: ['Capital e intereses garantizados', 'Intereses al vencimiento', 'Cancelación anticipada: penalización del 50 % de los intereses'], costs: 'Sin comisiones de apertura', interest: '1,80 % – 3,20 % TIN según plazo', duration: '3 a 60 meses', action: { type: 'deposit', kind: 'fixed' }, sim: 'deposit' },
  { id: 'hucha', category: 'savings', name: 'Huchas digitales', tagline: 'Aparta dinero para lo que quieras', icon: PiggyBank, conditions: ['Aportaciones manuales o automáticas', 'Retira cuando quieras', 'Remuneración mensual'], costs: 'Gratuito', interest: '1,50 % TIN', duration: 'Indefinida', action: { type: 'goal', kind: 'pot' }, sim: 'goal' },
  { id: 'objetivo', category: 'savings', name: 'Objetivos de ahorro', tagline: 'Metas con fecha y seguimiento', icon: Target, conditions: ['Cantidad y fecha objetivo', 'Aportaciones periódicas', 'Avisos al 25, 50, 75 y 100 %'], costs: 'Gratuito', interest: '1,50 % TIN', duration: 'Hasta la fecha objetivo', action: { type: 'goal', kind: 'goal' }, sim: 'goal' },
  { id: 'estructurado', category: 'savings', name: 'Depósito estructurado', tagline: 'Capital garantizado + potencial de bolsa', icon: Sparkles, conditions: ['100 % del capital garantizado', 'Rentabilidad ligada a un índice simulado', 'Participación y tope configurables'], costs: 'Sin comisiones', interest: 'Variable (0 % mínimo)', duration: '6 a 60 meses', action: { type: 'deposit', kind: 'structured' }, sim: 'structured' },
  { id: 'personal', category: 'financing', name: 'Préstamo personal', tagline: 'Financia tus proyectos', icon: Landmark, conditions: ['Cuota fija (sistema francés)', 'Amortización anticipada sin coste', 'Tipo según tu credit score simulado'], costs: `Apertura ${formatPct(OPENING_FEE.personal, 1, false)}`, interest: 'Desde 5,90 % TIN', duration: '6 meses a 10 años', action: { type: 'loan', kind: 'personal' }, sim: 'loan', simParams: { principal: 1_000_000, rate: 0.069, years: 5, kind: 'personal' } },
  { id: 'hipoteca', category: 'financing', name: 'Hipoteca', tagline: 'Compra vivienda en el mercado inmobiliario', icon: Home, conditions: ['Hasta el 90 % del valor', 'Plazo hasta 40 años', 'También disponible al comprar un inmueble'], costs: `Apertura ${formatPct(OPENING_FEE.mortgage, 1, false)}`, interest: 'Desde 2,50 % TIN', duration: 'Hasta 40 años', action: { type: 'loan', kind: 'mortgage' }, sim: 'loan', simParams: { principal: 15_000_000, rate: 0.029, years: 25, kind: 'mortgage' } },
  { id: 'linea', category: 'financing', name: 'Línea de crédito', tagline: 'Dinero disponible cuando lo necesites', icon: Briefcase, conditions: ['Dispón y devuelve libremente', 'Intereses solo por lo dispuesto', 'Liquidación mensual de intereses'], costs: 'Sin comisión de apertura', interest: '9,50 % TIN', duration: 'Indefinida', action: { type: 'creditLine' }, sim: 'creditLine' },
  { id: 'empresa', category: 'financing', name: 'Financiación empresarial', tagline: 'Capital para tu negocio simulado', icon: Building, conditions: ['Para cuentas empresariales', 'Cuota mensual o trimestral', 'Plazos flexibles'], costs: `Apertura ${formatPct(OPENING_FEE.business, 1, false)}`, interest: 'Desde 4,50 % TIN', duration: '1 a 15 años', action: { type: 'loan', kind: 'business' }, sim: 'loan', simParams: { principal: 5_000_000, rate: 0.055, years: 7, kind: 'business' } },
  ...(['home', 'life', 'travel', 'device', 'valuables'] as InsuranceType[]).map((t) => ({
    id: `seg-${t}`,
    category: 'insurance' as const,
    name: INSURANCE_PRODUCTS[t].name,
    tagline: INSURANCE_PRODUCTS[t].description,
    icon: { home: Home, life: HeartPulse, travel: Plane, device: Laptop, valuables: Gem }[t],
    conditions: INSURANCE_PRODUCTS[t].coverages,
    costs: `Prima mensual desde ${formatMoney(INSURANCE_PRODUCTS[t].minMonthly, 'EUR')}`,
    interest: '—',
    duration: 'Renovación mensual, cancelable',
    action: { type: 'insurance' as const, kind: t },
    sim: 'insurance' as const,
    simParams: { kind: t },
  })),
  { id: 'asesor', category: 'wealth', name: 'Asesor patrimonial simulado', tagline: 'Recomendaciones basadas en tu situación', icon: LineChart, conditions: ['Analiza liquidez, deuda, ahorro y diversificación', 'Recomendaciones en tiempo real', 'Basado en reglas transparentes'], costs: 'Gratuito', interest: '—', duration: '—', action: { type: 'navigate', to: '/products/wealth', label: 'Abrir asesor' }, sim: 'none' },
  { id: 'caja', category: 'wealth', name: 'Caja fuerte digital', tagline: 'Registra joyas, arte y otros bienes', icon: Vault, conditions: ['Inventario de bienes de valor', 'Suman a tu patrimonio neto', 'Notas y valoración editable'], costs: 'Gratuito', interest: '—', duration: '—', action: { type: 'navigate', to: '/products/wealth', label: 'Abrir caja fuerte' }, sim: 'none' },
  { id: 'planificacion', category: 'wealth', name: 'Planificación patrimonial', tagline: 'Proyecciones y beneficiarios', icon: ScrollText, conditions: ['Proyección con interés compuesto e inflación', 'Designación de beneficiarios', 'Escenarios a largo plazo'], costs: 'Gratuito', interest: '—', duration: '—', action: { type: 'navigate', to: '/products/wealth', label: 'Planificar' }, sim: 'none' },
  { id: 'donaciones', category: 'wealth', name: 'Donaciones', tagline: 'Apoya causas (ficticias)', icon: HandHeart, conditions: ['Seis entidades benéficas simuladas', 'Historial de donaciones', 'Resumen anual'], costs: 'Sin comisiones', interest: '—', duration: '—', action: { type: 'donate' }, sim: 'none' },
];

const CATS: { value: Category; label: string; icon: typeof Wallet }[] = [
  { value: 'savings', label: 'Ahorro', icon: PiggyBank },
  { value: 'financing', label: 'Financiación', icon: Landmark },
  { value: 'insurance', label: 'Seguros', icon: ShieldCheck },
  { value: 'wealth', label: 'Patrimonio', icon: Gift },
];

function Simulator({ product }: { product: Product }) {
  const p = useProfile();
  const cur = p.profile.baseCurrency;
  const sp = product.simParams ?? {};
  const [amount, setAmount] = useState(product.sim === 'loan' ? String(Number(sp.principal) / 100) : product.sim === 'insurance' ? String(INSURANCE_PRODUCTS[sp.kind as InsuranceType].defaultCoverage / 100) : '10000');
  const [months, setMonths] = useState(product.sim === 'loan' ? String(Number(sp.years) * 12) : '12');
  const [rate, setRate] = useState(String(((Number(sp.rate) || suggestedDepositRate(12)) * 100).toFixed(2)).replace('.', ','));
  const [scenario, setScenario] = useState<'up' | 'flat' | 'down'>('up');
  const c = parseMoney(amount) ?? 0;
  const m = Math.max(1, Number(months) || 1);
  const r = Number(rate.replace(',', '.')) / 100 || 0;
  const f = (v: number) => formatMoney(v, cur);
  let result: { label: string; value: string; tone?: 'pos' | 'neg' }[] = [];
  if (product.sim === 'savings') {
    const final = Math.round(c * Math.pow(1 + r / 12, m));
    result = [{ label: 'Intereses generados', value: f(final - c), tone: 'pos' }, { label: 'Saldo final', value: f(final) }];
  } else if (product.sim === 'deposit') {
    const i = Math.round((c * r * m) / 12);
    result = [{ label: 'Intereses al vencimiento', value: f(i), tone: 'pos' }, { label: 'Total a cobrar', value: f(c + i) }, { label: 'Penalización si cancelas a mitad', value: f(Math.round(i * 0.25)), tone: 'neg' }];
  } else if (product.sim === 'structured') {
    const perf = scenario === 'up' ? 0.2 : scenario === 'flat' ? 0 : -0.2;
    const ret = Math.min(0.25, Math.max(0, perf * 0.7));
    result = [{ label: 'Índice al vencimiento', value: formatPct(perf, 0) }, { label: 'Rentabilidad (70 % part., tope 25 %)', value: formatPct(ret, 1), tone: ret > 0 ? 'pos' : undefined }, { label: 'Total a cobrar', value: f(Math.round(c * (1 + ret))) }];
  } else if (product.sim === 'goal') {
    const monthly = c / m;
    result = [{ label: 'Aportación mensual necesaria', value: f(Math.ceil(monthly)) }, { label: 'Intereses aproximados (1,5 %)', value: f(Math.round(c * 0.015 * (m / 24))), tone: 'pos' }];
  } else if (product.sim === 'loan') {
    const s = c > 0 ? loanSummary(c, r, m, 'monthly') : null;
    result = s ? [{ label: 'Cuota mensual', value: f(s.installment) }, { label: 'Intereses totales', value: f(s.totalInterest), tone: 'neg' }, { label: 'Total a devolver', value: f(s.totalPaid) }] : [];
  } else if (product.sim === 'creditLine') {
    const i = Math.round(c * (0.095 / 12) * m);
    result = [{ label: 'Intereses por mantener dispuesto', value: f(i), tone: 'neg' }, { label: 'Coste mensual aproximado', value: f(Math.round(c * 0.095 / 12)) }];
  } else if (product.sim === 'insurance') {
    const q = c > 0 ? quoteInsurance(sp.kind as InsuranceType, c) : null;
    result = q ? [{ label: 'Prima mensual', value: f(q.monthlyPremium) }, { label: 'Prima anual', value: f(q.monthlyPremium * 12) }, { label: 'Franquicia', value: f(q.deductible) }] : [];
  }
  if (product.sim === 'none') return null;
  const amountLabel = product.sim === 'loan' ? 'Capital' : product.sim === 'insurance' ? 'Capital asegurado' : product.sim === 'goal' ? 'Objetivo' : product.sim === 'creditLine' ? 'Importe dispuesto' : 'Importe';
  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
      <div className="mb-3 text-sm font-semibold text-fg">Simulación de resultados</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={amountLabel}>{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} />}</Field>
        {product.sim !== 'insurance' && <Field label="Meses">{(id) => <Input id={id} value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />}</Field>}
        {['savings', 'deposit', 'loan'].includes(product.sim) && <Field label="Interés (%)">{(id) => <Input id={id} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />}</Field>}
        {product.sim === 'structured' && <Field label="Escenario">{() => <Segmented value={scenario} onChange={setScenario} size="sm" options={[{ value: 'up', label: '+20 %' }, { value: 'flat', label: '0 %' }, { value: 'down', label: '−20 %' }]} />}</Field>}
      </div>
      <KeyValue className="mt-2" items={result} />
    </div>
  );
}

export default function ProductsPage() {
  const [cat, setCat] = useState<Category>('savings');
  const [sheet, setSheet] = useState<Product | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const list = PRODUCTS.filter((p) => p.category === cat);
  const contract = (a: Action) => {
    setSheet(null);
    if (a.type === 'navigate') navigate(a.to);
    else setAction(a);
  };
  const actionLabel = (a: Action) => (a.type === 'navigate' ? a.label : a.type === 'donate' ? 'Donar' : 'Contratar');

  let dialog: ReactNode = null;
  if (action) {
    const close = () => setAction(null);
    if (action.type === 'savingsAccount') dialog = <SavingsAccountDialog onClose={close} />;
    if (action.type === 'deposit') dialog = <DepositDialog kind={action.kind} onClose={close} />;
    if (action.type === 'goal') dialog = <GoalDialog kind={action.kind} onClose={close} />;
    if (action.type === 'loan') dialog = <LoanDialog kind={action.kind} onClose={close} />;
    if (action.type === 'creditLine') dialog = <CreditLineDialog onClose={close} />;
    if (action.type === 'insurance') dialog = <InsuranceDialog type={action.kind} onClose={close} />;
    if (action.type === 'donate') dialog = <DonateDialog onClose={close} />;
  }

  return (
    <div>
      <PageHeader
        title="Productos financieros"
        subtitle="Catálogo completo. Todo desbloqueado y gratuito dentro del simulador."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate('/products/savings')}>Mi ahorro</Button>
            <Button variant="secondary" onClick={() => navigate('/products/loans')}>Mis préstamos</Button>
            <Button variant="secondary" onClick={() => navigate('/products/insurance')}>Mis seguros</Button>
            <Button variant="secondary" onClick={() => navigate('/products/wealth')}>Patrimonio</Button>
          </div>
        }
      />
      <Segmented value={cat} onChange={setCat} className="mb-5" options={CATS.map((c) => ({ value: c.value, label: <span className="flex items-center gap-1.5"><c.icon className="size-4" />{c.label}</span> }))} ariaLabel="Categoría de productos" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((pr) => (
          <div key={pr.id} className="nx-card anim-fade-up flex flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                <pr.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-fg">{pr.name}</h3>
                <p className="mt-0.5 text-[13px] text-muted">{pr.tagline}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {pr.interest !== '—' && <Badge tone="pos">{pr.interest}</Badge>}
              <Badge>{pr.costs}</Badge>
            </div>
            <div className="mt-auto flex gap-2 pt-5">
              <Button variant="secondary" className="flex-1" onClick={() => setSheet(pr)}>
                Ficha y simulación
              </Button>
              <Button className="flex-1" onClick={() => contract(pr.action)}>
                {actionLabel(pr.action)}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {sheet && (
        <Modal open onClose={() => setSheet(null)} title={sheet.name} subtitle={sheet.tagline} size="lg" footer={<><Button variant="secondary" onClick={() => setSheet(null)}>Cerrar</Button><Button onClick={() => contract(sheet.action)}>{actionLabel(sheet.action)}</Button></>}>
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold text-fg">Condiciones</div>
                <ul className="space-y-1.5 text-sm text-muted">
                  {sheet.conditions.map((c) => (
                    <li key={c} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <KeyValue items={[{ label: 'Costes', value: sheet.costs }, { label: 'Intereses', value: sheet.interest }, { label: 'Duración', value: sheet.duration }, { label: 'Disponibilidad', value: 'Inmediata · sin requisitos' }]} />
            </div>
            <Simulator product={sheet} />
            <p className="text-[11.5px] text-subtle">Ficha informativa de un producto ficticio. No constituye una oferta real ni asesoramiento financiero.</p>
          </div>
        </Modal>
      )}
      {dialog}
    </div>
  );
}
