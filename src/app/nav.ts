import {
  Activity,
  ArrowLeftRight,
  Bell,
  Building2,
  CreditCard,
  Gauge,
  Home,
  Landmark,
  LayoutGrid,
  LineChart,
  PieChart,
  Settings,
  SlidersHorizontal,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  match?: string[];
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'General',
    items: [
      { to: '/', label: 'Inicio', icon: Home },
      { to: '/activity', label: 'Actividad', icon: Activity },
      { to: '/notifications', label: 'Notificaciones', icon: Bell },
    ],
  },
  {
    title: 'Banca',
    items: [
      { to: '/accounts', label: 'Cuentas', icon: Wallet },
      { to: '/operations', label: 'Operaciones', icon: ArrowLeftRight },
      { to: '/cards', label: 'Tarjetas', icon: CreditCard },
    ],
  },
  {
    title: 'Inversión',
    items: [
      { to: '/invest', label: 'Mercados', icon: LineChart, match: ['/invest/asset'] },
      { to: '/invest/portfolio', label: 'Cartera', icon: PieChart, match: ['/invest/derivatives', '/invest/history'] },
      { to: '/market-control', label: 'Control de mercado', icon: SlidersHorizontal },
    ],
  },
  {
    title: 'Patrimonio',
    items: [
      { to: '/products', label: 'Productos', icon: LayoutGrid },
      { to: '/products/loans', label: 'Préstamos', icon: Landmark },
      { to: '/realestate', label: 'Inmobiliario', icon: Building2 },
      { to: '/credit', label: 'Credit Score', icon: Gauge },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/profiles', label: 'Perfiles', icon: Users },
      { to: '/settings', label: 'Ajustes', icon: Settings },
    ],
  },
];

export const MOBILE_TABS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/accounts', label: 'Cuentas', icon: Wallet, match: ['/operations', '/cards'] },
  { to: '/invest', label: 'Invertir', icon: LineChart },
  { to: '/realestate', label: 'Inmuebles', icon: Building2 },
];

export function isActive(path: string, item: NavItem): boolean {
  const base = path.split('?')[0];
  if (item.to === '/') return base === '/';
  if (base === item.to) return true;
  if (item.match?.some((m) => base.startsWith(m))) return true;
  // Evita que "/invest" se active en "/invest/portfolio".
  const specific = NAV_GROUPS.flatMap((g) => g.items).some((o) => o.to !== item.to && o.to.startsWith(item.to) && base.startsWith(o.to));
  return !specific && base.startsWith(`${item.to}/`);
}
