import { Snowflake, Wifi } from 'lucide-react';
import type { Card } from '@/core/schema';
import { CARD_THEMES, CARD_TYPE_LABELS, formatCardNumber } from '@/engine/cards';
import { cx } from './primitives';

function Pattern({ id, accent }: { id: string; accent: string }) {
  const stroke = { stroke: accent, strokeOpacity: 0.16, fill: 'none' } as const;
  switch (id) {
    case 'waves':
      return (
        <g {...stroke} strokeWidth={1.2}>
          {Array.from({ length: 9 }).map((_, i) => (
            <path key={i} d={`M-20 ${70 + i * 16} C 80 ${30 + i * 16}, 180 ${120 + i * 16}, 360 ${50 + i * 16}`} />
          ))}
        </g>
      );
    case 'grid':
      return (
        <g {...stroke} strokeWidth={0.8}>
          {Array.from({ length: 18 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 20} y1={0} x2={i * 20} y2={220} />
          ))}
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 20} x2={340} y2={i * 20} />
          ))}
        </g>
      );
    case 'circles':
      return (
        <g {...stroke} strokeWidth={1.2}>
          {Array.from({ length: 7 }).map((_, i) => (
            <circle key={i} cx={290} cy={30} r={30 + i * 26} />
          ))}
        </g>
      );
    case 'lines':
      return (
        <g {...stroke} strokeWidth={1}>
          {Array.from({ length: 26 }).map((_, i) => (
            <line key={i} x1={i * 18 - 100} y1={220} x2={i * 18 + 60} y2={0} />
          ))}
        </g>
      );
    default:
      return null;
  }
}

function Chip() {
  return (
    <svg viewBox="0 0 48 36" className="h-8 w-11" aria-hidden>
      <defs>
        <linearGradient id="chipg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F4E3A1" />
          <stop offset="0.5" stopColor="#C9A646" />
          <stop offset="1" stopColor="#F1D98A" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="34" rx="7" fill="url(#chipg)" stroke="rgba(0,0,0,0.25)" />
      <path d="M1 12h14M1 24h14M33 12h14M33 24h14M15 1v34M33 1v34M15 18h18" stroke="rgba(80,60,10,0.45)" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

export function BankCardVisual({
  card,
  reveal = false,
  className,
  compact = false,
}: {
  card: Pick<Card, 'type' | 'name' | 'holder' | 'number' | 'expMonth' | 'expYear' | 'status' | 'design' | 'cvv'>;
  reveal?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const theme = CARD_THEMES.find((t) => t.id === card.design.theme) ?? CARD_THEMES[0];
  const num = reveal ? formatCardNumber(card.number) : `•••• •••• •••• ${card.number.slice(-4)}`;
  return (
    <div
      className={cx(
        'relative aspect-[1.586] w-full overflow-hidden rounded-[18px] text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.65)] ring-1 ring-white/10 select-none',
        card.status === 'cancelled' && 'grayscale opacity-60',
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)` }}
      role="img"
      aria-label={`Tarjeta ${CARD_TYPE_LABELS[card.type]} ${card.name} terminada en ${card.number.slice(-4)} (simulada)`}
    >
      <svg viewBox="0 0 340 214" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <Pattern id={card.design.pattern} accent={theme.accent} />
        <ellipse cx="60" cy="-30" rx="220" ry="90" fill="white" opacity="0.07" />
      </svg>
      <div className={cx('relative flex h-full flex-col justify-between', compact ? 'p-3.5' : 'p-5')}>
        <div className="flex items-start justify-between">
          <div>
            <div className={cx('font-semibold tracking-[0.18em]', compact ? 'text-[11px]' : 'text-[13px]')}>NEXUS</div>
            <div className="text-[10px] tracking-wider text-white/70 uppercase">{CARD_TYPE_LABELS[card.type]}</div>
          </div>
          <div className="text-right">
            <div className="rounded-md bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-white/85 uppercase">Simulada</div>
            {!compact && <div className="mt-1 max-w-[140px] truncate text-[11px] text-white/80">{card.name}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Chip />
          <Wifi className="size-5 rotate-90 text-white/80" aria-hidden />
        </div>
        <div>
          <div className={cx('tabular font-medium tracking-[0.14em] [text-shadow:0_1px_1px_rgba(0,0,0,0.35)]', compact ? 'text-[13px]' : 'text-[17px] sm:text-[19px]')}>{num}</div>
          <div className="mt-2 flex items-end justify-between gap-3 text-[10px] uppercase">
            <div className="min-w-0">
              <div className="text-white/55">Titular</div>
              <div className="truncate text-[11px] font-medium tracking-wide">{card.holder}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-white/55">Válida</div>
              <div className="tabular text-[11px] font-medium">
                {String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}
              </div>
            </div>
            {reveal && (
              <div className="shrink-0 text-right">
                <div className="text-white/55">CVV</div>
                <div className="tabular text-[11px] font-medium">{card.cvv}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      {card.status === 'frozen' && (
        <div className="absolute inset-0 flex items-center justify-center bg-sky-200/20 backdrop-blur-[3px]">
          <div className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium">
            <Snowflake className="size-4" /> Congelada
          </div>
        </div>
      )}
    </div>
  );
}
