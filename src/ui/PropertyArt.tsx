/**
 * Ilustraciones procedurales originales de inmuebles (SVG). Cada propiedad
 * tiene una semilla que determina colores y detalles; hay tres "fotografías"
 * por inmueble: fachada de día, fachada al atardecer e interior.
 */
import { memo } from 'react';
import type { PropertyType } from '@/core/schema';
import { createRng } from '@/core/random';

const PALETTES = [
  { wall: '#E9DCC9', accent: '#B5835A', roof: '#8C4A3B' },
  { wall: '#D8E2EA', accent: '#5B7A99', roof: '#3E4C5E' },
  { wall: '#F1E6D2', accent: '#C9A227', roof: '#6B4E16' },
  { wall: '#E4E7DF', accent: '#4E8A6B', roof: '#2F4F3E' },
  { wall: '#F3DDD7', accent: '#C2665A', roof: '#7A3B33' },
  { wall: '#E6E1F0', accent: '#7C6BB3', roof: '#3D3360' },
];

function Windows({ x, y, cols, rows, w, h, gap, lit, rng }: { x: number; y: number; cols: number; rows: number; w: number; h: number; gap: number; lit: boolean; rng: ReturnType<typeof createRng> }) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const on = lit && rng.bool(0.55);
      out.push(<rect key={`${r}-${c}`} x={x + c * (w + gap)} y={y + r * (h + gap)} width={w} height={h} rx={1.5} fill={on ? '#FFD98A' : lit ? '#2A3448' : '#9FC3E3'} opacity={on ? 0.95 : 0.85} />);
    }
  }
  return <g>{out}</g>;
}

function Exterior({ type, seed, dusk }: { type: PropertyType; seed: number; dusk: boolean }) {
  const rng = createRng(seed);
  const pal = PALETTES[seed % PALETTES.length];
  const sky = dusk ? ['#1E2A4A', '#F08A5D'] : ['#7FB6EA', '#DCEEFB'];
  const ground = dusk ? '#2E3A2F' : '#7DB37A';
  const wall = dusk ? shade(pal.wall, -0.35) : pal.wall;
  const accent = dusk ? shade(pal.accent, -0.3) : pal.accent;
  const roof = dusk ? shade(pal.roof, -0.3) : pal.roof;
  const lit = dusk;
  return (
    <>
      <defs>
        <linearGradient id={`sky${seed}${dusk}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="250" fill={`url(#sky${seed}${dusk})`} />
      {dusk ? <circle cx="320" cy="168" r="26" fill="#FFB36B" opacity="0.8" /> : <circle cx="330" cy="50" r="20" fill="#FFF4C2" opacity="0.9" />}
      {!dusk && (
        <g fill="white" opacity="0.8">
          <ellipse cx={60 + rng.int(0, 60)} cy="48" rx="34" ry="10" />
          <ellipse cx={200 + rng.int(0, 60)} cy="34" rx="26" ry="8" />
        </g>
      )}
      {/* skyline lejano */}
      <g fill={dusk ? '#2B3656' : '#B9CFE3'} opacity="0.7">
        {Array.from({ length: 9 }).map((_, i) => (
          <rect key={i} x={i * 46} y={150 - rng.int(10, 60)} width={36} height={120} />
        ))}
      </g>
      <rect y="200" width="400" height="50" fill={ground} />
      <rect y="214" width="400" height="10" fill={dusk ? '#3A3F48' : '#A9AFB8'} />
      {type === 'apartment' && (
        <g>
          <rect x="120" y="58" width="160" height="150" fill={wall} />
          <rect x="120" y="50" width="160" height="10" fill={roof} />
          <Windows x={134} y={70} cols={5} rows={5} w={18} h={18} gap={10} lit={lit} rng={rng} />
          <rect x="185" y="178" width="30" height="30" fill={accent} />
          {Array.from({ length: 4 }).map((_, i) => (
            <rect key={i} x="128" y={92 + i * 28} width="144" height="3" fill={accent} opacity="0.6" />
          ))}
        </g>
      )}
      {type === 'house' && (
        <g>
          <rect x="120" y="120" width="160" height="88" fill={wall} />
          <polygon points="108,124 200,62 292,124" fill={roof} />
          <rect x="185" y="160" width="30" height="48" rx="2" fill={accent} />
          <Windows x={136} y={140} cols={1} rows={1} w={30} h={26} gap={0} lit={lit} rng={rng} />
          <Windows x={234} y={140} cols={1} rows={1} w={30} h={26} gap={0} lit={lit} rng={rng} />
          <rect x="246" y="76" width="14" height="30" fill={shade(roof, -0.2)} />
          <ellipse cx="96" cy="196" rx="22" ry="18" fill={dusk ? '#24402E' : '#4F9A55'} />
          <ellipse cx="310" cy="196" rx="18" ry="16" fill={dusk ? '#24402E' : '#4F9A55'} />
        </g>
      )}
      {type === 'villa' && (
        <g>
          <rect x="70" y="118" width="190" height="90" fill={wall} />
          <rect x="200" y="86" width="130" height="122" fill={shade(wall, -0.06)} />
          <rect x="62" y="110" width="206" height="10" fill={roof} />
          <rect x="194" y="78" width="142" height="10" fill={roof} />
          <rect x="86" y="140" width="96" height="56" fill={lit ? '#FFD98A' : '#9FC3E3'} opacity="0.85" />
          <Windows x={216} y={102} cols={3} rows={2} w={26} h={30} gap={10} lit={lit} rng={rng} />
          <rect x="40" y="212" width="160" height="14" rx="3" fill={dusk ? '#2E6F8F' : '#5ED0F0'} />
          <ellipse cx="352" cy="190" rx="16" ry="28" fill={dusk ? '#24402E' : '#3E8A4A'} />
        </g>
      )}
      {type === 'commercial' && (
        <g>
          <rect x="90" y="96" width="220" height="112" fill={wall} />
          <rect x="90" y="88" width="220" height="10" fill={roof} />
          <rect x="104" y="146" width="192" height="62" fill={lit ? '#FFD98A' : '#9FC3E3'} opacity="0.8" />
          <path d="M96 128 h208 l-10 18 h-188 z" fill={accent} />
          {Array.from({ length: 8 }).map((_, i) => (
            <rect key={i} x={106 + i * 24} y="128" width="12" height="18" fill="white" opacity="0.25" />
          ))}
          <rect x="140" y="104" width="120" height="16" rx="3" fill={shade(accent, -0.25)} />
          <Windows x={110} y={104} cols={1} rows={1} w={20} h={16} gap={0} lit={lit} rng={rng} />
        </g>
      )}
      {type === 'office' && (
        <g>
          <rect x="140" y="30" width="120" height="178" fill={dusk ? '#33415E' : '#7FA6C9'} />
          {Array.from({ length: 14 }).map((_, i) => (
            <rect key={i} x="140" y={36 + i * 12.4} width="120" height="1.2" fill="white" opacity="0.35" />
          ))}
          <Windows x={148} y={40} cols={6} rows={13} w={14} h={8} gap={4.4} lit={lit} rng={rng} />
          <rect x="260" y="96" width="70" height="112" fill={wall} />
          <Windows x={268} y={106} cols={3} rows={5} w={14} h={12} gap={8} lit={lit} rng={rng} />
        </g>
      )}
      {type === 'building' && (
        <g>
          <rect x="60" y="70" width="110" height="138" fill={wall} />
          <rect x="170" y="44" width="100" height="164" fill={shade(wall, -0.08)} />
          <rect x="270" y="90" width="80" height="118" fill={shade(wall, 0.04)} />
          <Windows x={70} y={82} cols={4} rows={6} w={16} h={14} gap={9} lit={lit} rng={rng} />
          <Windows x={180} y={56} cols={4} rows={7} w={14} h={14} gap={10} lit={lit} rng={rng} />
          <Windows x={280} y={102} cols={3} rows={5} w={14} h={14} gap={9} lit={lit} rng={rng} />
          <rect x="60" y="64" width="110" height="7" fill={roof} />
          <rect x="170" y="38" width="100" height="7" fill={roof} />
        </g>
      )}
    </>
  );
}

function Interior({ seed }: { seed: number }) {
  const rng = createRng(seed + 7);
  const pal = PALETTES[seed % PALETTES.length];
  const sofa = rng.pick(['#5B7A99', '#B5835A', '#4E8A6B', '#7C6BB3', '#C2665A']);
  return (
    <>
      <rect width="400" height="250" fill={shade(pal.wall, 0.06)} />
      <rect y="178" width="400" height="72" fill="#C8A57A" />
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x={i * 52} y="178" width="2" height="72" fill="#A88559" opacity="0.6" />
      ))}
      <rect x="40" y="40" width="130" height="110" rx="4" fill="#9FC3E3" stroke="white" strokeWidth="6" />
      <line x1="105" y1="40" x2="105" y2="150" stroke="white" strokeWidth="4" />
      <ellipse cx="80" cy="120" rx="30" ry="14" fill="white" opacity="0.6" />
      <rect x="210" y="132" width="150" height="40" rx="10" fill={sofa} />
      <rect x="202" y="118" width="166" height="26" rx="10" fill={shade(sofa, -0.1)} />
      <rect x="214" y="170" width="8" height="12" fill="#6B4E16" />
      <rect x="348" y="170" width="8" height="12" fill="#6B4E16" />
      <rect x="250" y="56" width="70" height="46" rx="3" fill={pal.accent} opacity="0.85" />
      <circle cx="285" cy="79" r="12" fill="white" opacity="0.4" />
      <rect x="170" y="186" width="80" height="8" rx="4" fill="#5A4632" />
      <ellipse cx="60" cy="196" rx="18" ry="6" fill="#5A4632" opacity="0.4" />
      <rect x="52" y="160" width="16" height="34" fill="#8C6A43" />
      <ellipse cx="60" cy="152" rx="22" ry="20" fill="#4F9A55" />
    </>
  );
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export const PropertyArt = memo(function PropertyArt({ type, seed, variant = 0, className }: { type: PropertyType; seed: number; variant?: number; className?: string }) {
  return (
    <svg viewBox="0 0 400 250" className={className} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ilustración del inmueble (generada)">
      {variant === 2 ? <Interior seed={seed} /> : <Exterior type={type} seed={seed} dusk={variant === 1} />}
    </svg>
  );
});
