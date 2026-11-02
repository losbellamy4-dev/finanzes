import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '@/store/hooks';
import { appStore } from '@/store/appStore';
import { Layout, Logo } from '@/app/Layout';
import { matchRoute, usePath } from '@/app/router';
import { ConfirmHost, Toaster } from '@/ui/overlays';
import { Button, SimBadge, Spinner } from '@/ui/primitives';
import { MoneyDialogHost } from '@/features/banking/MoneyDialog';
import { CreateProfileForm } from '@/features/profiles/CreateProfileForm';
import Dashboard from '@/features/dashboard/Dashboard';

const AccountsPage = lazy(() => import('@/features/accounts/AccountsPage'));
const AccountDetail = lazy(() => import('@/features/accounts/AccountDetail'));
const OperationsPage = lazy(() => import('@/features/banking/OperationsPage'));
const CardsPage = lazy(() => import('@/features/cards/CardsPage'));
const CardDetail = lazy(() => import('@/features/cards/CardDetail'));
const MarketPage = lazy(() => import('@/features/invest/MarketPage'));
const AssetDetail = lazy(() => import('@/features/invest/AssetDetail'));
const PortfolioPage = lazy(() => import('@/features/invest/PortfolioPage'));
const DerivativesPage = lazy(() => import('@/features/invest/DerivativesPage'));
const TradeHistoryPage = lazy(() => import('@/features/invest/TradeHistoryPage'));
const MarketControlPage = lazy(() => import('@/features/marketControl/MarketControlPage'));
const ProductsPage = lazy(() => import('@/features/products/ProductsPage'));
const SavingsPage = lazy(() => import('@/features/products/SavingsPage'));
const LoansPage = lazy(() => import('@/features/products/LoansPage'));
const LoanDetail = lazy(() => import('@/features/products/LoanDetail'));
const InsurancePage = lazy(() => import('@/features/products/InsurancePage'));
const WealthPage = lazy(() => import('@/features/products/WealthPage'));
const RealEstatePage = lazy(() => import('@/features/realestate/RealEstatePage'));
const PropertyDetail = lazy(() => import('@/features/realestate/PropertyDetail'));
const CreditPage = lazy(() => import('@/features/credit/CreditPage'));
const ActivityPage = lazy(() => import('@/features/activity/ActivityPage'));
const NotificationsPage = lazy(() => import('@/features/activity/NotificationsPage'));
const ProfilesPage = lazy(() => import('@/features/profiles/ProfilesPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

const ROUTES: [string, ComponentType<{ params: Record<string, string> }>][] = [
  ['/', Dashboard],
  ['/accounts', AccountsPage],
  ['/accounts/:id', AccountDetail],
  ['/operations', OperationsPage],
  ['/cards', CardsPage],
  ['/cards/:id', CardDetail],
  ['/invest', MarketPage],
  ['/invest/asset/:id', AssetDetail],
  ['/invest/portfolio', PortfolioPage],
  ['/invest/derivatives', DerivativesPage],
  ['/invest/history', TradeHistoryPage],
  ['/market-control', MarketControlPage],
  ['/products', ProductsPage],
  ['/products/savings', SavingsPage],
  ['/products/loans', LoansPage],
  ['/products/loans/:id', LoanDetail],
  ['/products/insurance', InsurancePage],
  ['/products/wealth', WealthPage],
  ['/realestate', RealEstatePage],
  ['/realestate/:id', PropertyDetail],
  ['/credit', CreditPage],
  ['/activity', ActivityPage],
  ['/notifications', NotificationsPage],
  ['/profiles', ProfilesPage],
  ['/settings', SettingsPage],
];

function Router() {
  const path = usePath();
  const pathname = path.split('?')[0];
  for (const [pattern, Comp] of ROUTES) {
    const params = matchRoute(pattern, pathname);
    if (params) return <Comp key={pathname} params={params} />;
  }
  return (
    <div className="py-20 text-center">
      <p className="text-lg font-semibold text-fg">Página no encontrada</p>
      <a href="#/" className="mt-3 inline-block text-accent">
        Volver al inicio
      </a>
    </div>
  );
}

function Splash({ label = 'Cargando datos locales…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5">
      <Logo />
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="size-4" /> {label}
      </div>
    </div>
  );
}

function Onboarding() {
  return (
    <div className="nx-glow min-h-dvh px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <Logo />
          <SimBadge />
        </div>
        <h1 className="mt-10 text-[30px] leading-tight font-semibold tracking-tight text-fg sm:text-[38px]">Construye y gestiona un patrimonio virtual desde cero.</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
          Cuentas, tarjetas, bolsa, criptomonedas simuladas, inmuebles, préstamos y mucho más. Todas las funciones están disponibles y todo el dinero es ficticio.
        </p>
        <div className="nx-card mt-8 p-5 sm:p-7">
          <h2 className="mb-5 text-lg font-semibold text-fg">Crea tu primer perfil financiero</h2>
          <CreateProfileForm />
        </div>
        <p className="mt-6 flex items-start gap-2 text-[12.5px] leading-relaxed text-subtle">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          NEXUS FINANCE es un simulador educativo. No se conecta a bancos, no solicita credenciales ni genera tarjetas utilizables. Los datos se guardan solo en este dispositivo.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const phase = useApp((s) => s.phase);
  const error = useApp((s) => s.error);
  const busy = useApp((s) => s.busy);
  useEffect(() => {
    void appStore.boot();
    return () => appStore.stopTicker();
  }, []);

  return (
    <>
      {phase === 'booting' && <Splash />}
      {phase === 'error' && (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
          <Logo />
          <p className="max-w-md text-sm text-muted">{error}</p>
          <Button onClick={() => window.location.reload()}>Reintentar</Button>
        </div>
      )}
      {phase === 'onboarding' && (busy ? <Splash label={busy} /> : <Onboarding />)}
      {phase === 'ready' && (
        <Layout>
          <Suspense
            fallback={
              <div className="flex justify-center py-20">
                <Spinner />
              </div>
            }
          >
            <Router />
          </Suspense>
          <MoneyDialogHost />
        </Layout>
      )}
      {phase === 'ready' && busy && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-bg/70 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-fg shadow-xl">
            <Spinner className="size-4" /> {busy}
          </div>
        </div>
      )}
      <Toaster />
      <ConfirmHost />
    </>
  );
}
