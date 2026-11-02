import { Star } from 'lucide-react';
import type { Asset, ProfileState } from '@/core/schema';
import { formatNumber } from '@/core/money';
import { REGIMES } from '@/engine/market';
import { dispatch } from '@/store/hooks';
import { Link, usePath } from '@/app/router';
import { Badge, cx } from '@/ui/primitives';

const TABS = [
  { to: '/invest', label: 'Mercado' },
  { to: '/invest/portfolio', label: 'Cartera' },
  { to: '/invest/derivatives', label: 'Derivados' },
  { to: '/invest/history', label: 'Historial' },
];

export function InvestTabs() {
  const path = usePath().split('?')[0];
  return (
    <nav className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Secciones de inversión">
      {TABS.map((t) => {
        const active = path === t.to;
        return (
          <Link key={t.to} to={t.to} aria-current={active ? 'page' : undefined} className={cx('-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap', active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function RegimeBadge({ p }: { p: ProfileState }) {
  const r = p.market.regime;
  const tone = r === 'bull' || r === 'recovery' ? 'pos' : r === 'bear' || r === 'crisis' ? 'neg' : 'neutral';
  return (
    <Link to="/market-control" title="Cambiar en Control de mercado">
      <Badge tone={tone}>
        Mercado {REGIMES[r].label.toLowerCase()}
        {p.market.activeScenario ? ` · ${p.market.activeScenario.name}` : ''}
      </Badge>
    </Link>
  );
}

export function WatchStar({ p, asset }: { p: ProfileState; asset: Asset }) {
  const on = p.portfolio.watchlist.includes(asset.id);
  return (
    <button
      type="button"
      aria-label={on ? `Quitar ${asset.symbol} de favoritos` : `Añadir ${asset.symbol} a favoritos`}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dispatch('invest/watch', { assetId: asset.id });
      }}
      className="text-subtle hover:text-warn"
    >
      <Star className={cx('size-4', on && 'fill-warn text-warn')} />
    </button>
  );
}

export function compactNumber(n: number): string {
  if (n >= 1e12) return `${formatNumber(n / 1e12, 1)} B`;
  if (n >= 1e9) return `${formatNumber(n / 1e9, 1)} mil M`;
  if (n >= 1e6) return `${formatNumber(n / 1e6, 1)} M`;
  if (n >= 1e3) return `${formatNumber(n / 1e3, 1)} mil`;
  return formatNumber(n, 0);
}

export function AssetLogo({ asset, size = 'md' }: { asset: Pick<Asset, 'symbol' | 'type'>; size?: 'sm' | 'md' | 'lg' }) {
  const hue = [...asset.symbol].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const s = size === 'lg' ? 'size-12 text-[13px] rounded-2xl' : size === 'sm' ? 'size-8 text-[10px] rounded-lg' : 'size-10 text-[11px] rounded-xl';
  return (
    <span className={cx('flex shrink-0 items-center justify-center font-bold text-white', s)} style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 48%), hsl(${(hue + 40) % 360} 55% 32%))` }} aria-hidden>
      {asset.symbol.slice(0, 4)}
    </span>
  );
}
