import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FastForward,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  UserPlus,
} from 'lucide-react';
import { formatDate, formatTime, tickToDate } from '@/core/time';
import { SPEED_PRESETS } from '@/engine/marketAdmin';
import { appStore } from '@/store/appStore';
import { useApp, useProfile } from '@/store/hooks';
import { toast } from '@/store/toast';
import { cx, IconButton, SimBadge } from '@/ui/primitives';
import { Modal } from '@/ui/overlays';
import { Link, navigate, usePath } from './router';
import { isActive, MOBILE_TABS, NAV_GROUPS } from './nav';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="nxlogo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5488F5" />
            <stop offset="1" stopColor="#24C78A" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#nxlogo)" />
        <path d="M9 22V10l14 12V10" stroke="white" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <div className="leading-none">
          <div className="text-[15px] font-bold tracking-[0.16em] text-fg">NEXUS</div>
          <div className="mt-0.5 text-[10px] font-medium tracking-[0.32em] text-muted">FINANCE</div>
        </div>
      )}
    </div>
  );
}

function Sidebar() {
  const path = usePath();
  const unread = useProfile().notifications.filter((n) => !n.read).length;
  return (
    <aside className="nx-scroll fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col overflow-y-auto border-r border-line bg-surface/60 px-3 py-5 backdrop-blur lg:flex">
      <div className="px-3">
        <Link to="/" aria-label="Inicio">
          <Logo />
        </Link>
      </div>
      <nav className="mt-6 flex-1 space-y-5" aria-label="Navegación principal">
        {NAV_GROUPS.map((g) => (
          <div key={g.title}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.12em] text-subtle uppercase">{g.title}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = isActive(path, it);
                return (
                  <li key={it.to}>
                    <Link
                      to={it.to}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-accent/12 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                      )}
                    >
                      <it.icon className={cx('size-[18px]', active ? 'text-accent' : 'text-subtle group-hover:text-fg')} />
                      <span className="flex-1">{it.label}</span>
                      {it.to === '/notifications' && unread > 0 && (
                        <span className="tabular rounded-full bg-neg px-1.5 text-[11px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-4 rounded-2xl border border-line bg-surface-2/60 p-3 text-[11.5px] leading-relaxed text-muted">
        <SimBadge className="mb-2" />
        <p>Entorno 100 % ficticio. Sin conexión con bancos reales ni dinero real.</p>
      </div>
    </aside>
  );
}

function SimControls({ compact = false }: { compact?: boolean }) {
  const p = useProfile();
  const now = tickToDate(p.clock.startAt, p.clock.tick);
  const [busy, setBusy] = useState(false);
  const speed = p.clock.speed;
  const running = speed > 0;
  const advance = (hours: number, label: string) => {
    setBusy(true);
    setTimeout(() => {
      const r = appStore.dispatch('clock/advance', { hours });
      setBusy(false);
      if (r.ok) toast.info(`Tiempo avanzado: ${label}`, `Fecha simulada: ${formatDate(tickToDate(p.clock.startAt, p.clock.tick + hours))}`);
    }, 20);
  };
  const setSpeed = (s: number) => appStore.dispatch('market/speed', { speed: s });
  return (
    <div className={cx('flex items-center gap-1.5', compact && 'flex-wrap')}>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-1.5">
        <span className={cx('size-2 rounded-full', running ? 'anim-live bg-pos' : 'bg-subtle')} aria-hidden />
        <div className="leading-tight">
          <div className="tabular text-[12.5px] font-semibold text-fg">{formatDate(now)}</div>
          <div className="tabular text-[11px] text-muted">{formatTime(now)} · {running ? SPEED_PRESETS.find((x) => x.value === speed)?.label ?? `${speed} h/s` : 'En pausa'}</div>
        </div>
      </div>
      <IconButton label={running ? 'Pausar simulación' : 'Reanudar simulación'} onClick={() => setSpeed(running ? 0 : 0.25)} className="border border-line bg-surface-2">
        {running ? <Pause className="size-4" /> : <Play className="size-4" />}
      </IconButton>
      <select
        aria-label="Velocidad de simulación"
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        className="h-9 rounded-xl border border-line bg-surface-2 px-2 text-[12.5px] text-fg outline-none focus:border-accent"
      >
        {SPEED_PRESETS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <div className="flex items-center overflow-hidden rounded-xl border border-line bg-surface-2">
        {[
          { h: 24, l: '+1 d', label: '1 día' },
          { h: 24 * 7, l: '+1 sem', label: '1 semana' },
          { h: 24 * 30, l: '+1 mes', label: '1 mes' },
        ].map((b, i) => (
          <button
            key={b.h}
            type="button"
            disabled={busy}
            onClick={() => advance(b.h, b.label)}
            className={cx('tabular h-9 px-2.5 text-[12.5px] font-medium text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-50', i > 0 && 'border-l border-line')}
            title={`Avanzar ${b.label}`}
          >
            {b.l}
          </button>
        ))}
      </div>
      {busy && <Loader2 className="size-4 animate-spin text-muted" aria-label="Procesando" />}
    </div>
  );
}

function ProfileMenu() {
  const p = useProfile();
  const profiles = useApp((s) => s.profiles);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const initials = p.profile.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Cambiar de perfil"
        className="flex items-center gap-2 rounded-xl py-1 pr-1.5 pl-1 hover:bg-surface-2"
      >
        <span className="flex size-8 items-center justify-center rounded-lg text-[12px] font-bold text-white" style={{ background: p.profile.color }}>
          {initials}
        </span>
        <span className="hidden max-w-[120px] truncate text-sm font-medium text-fg md:block">{p.profile.name}</span>
        <ChevronDown className="hidden size-4 text-muted md:block" />
      </button>
      {open && (
        <div role="menu" className="anim-pop absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-2xl">
          <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-wider text-subtle uppercase">Perfiles financieros</div>
          {profiles.map((pr) => (
            <button
              key={pr.id}
              role="menuitem"
              type="button"
              onClick={async () => {
                setOpen(false);
                try {
                  await appStore.switchProfile(pr.id);
                  toast.success(`Perfil activo: ${pr.name}`);
                } catch (e) {
                  toast.error('No se pudo cambiar de perfil', e instanceof Error ? e.message : undefined);
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-surface-2"
            >
              <span className="size-2.5 rounded-full" style={{ background: pr.color }} />
              <span className="min-w-0 flex-1 truncate text-fg">{pr.name}</span>
              {pr.id === p.profile.id && <Check className="size-4 text-accent" />}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" type="button" onClick={() => { setOpen(false); navigate('/profiles?new=1'); }} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg">
            <UserPlus className="size-4" /> Nuevo perfil
          </button>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); navigate('/profiles'); }} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg">
            <MoreHorizontal className="size-4" /> Gestionar perfiles
          </button>
        </div>
      )}
    </div>
  );
}

function TopBar({ onOpenSim }: { onOpenSim: () => void }) {
  const p = useProfile();
  const unread = p.notifications.filter((n) => !n.read).length;
  const saveStatus = useApp((s) => s.saveStatus);
  const now = tickToDate(p.clock.startAt, p.clock.tick);
  const hide = p.settings.hideBalances;
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 sm:h-16 sm:px-6">
        <div className="lg:hidden">
          <Link to="/" aria-label="Inicio">
            <Logo compact />
          </Link>
        </div>
        <SimBadge className="hidden sm:inline-flex lg:hidden xl:inline-flex" />
        <div className="hidden flex-1 justify-center md:flex lg:justify-start lg:pl-2">
          <SimControls />
        </div>
        <button
          type="button"
          onClick={onOpenSim}
          className="ml-1 flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-line bg-surface-2 px-2.5 py-1.5 text-left md:hidden"
          aria-label="Controles de simulación"
        >
          <span className={cx('size-2 shrink-0 rounded-full', p.clock.speed > 0 ? 'anim-live bg-pos' : 'bg-subtle')} />
          <span className="tabular truncate text-[12.5px] font-semibold text-fg">{formatDate(now)}</span>
          <span className="tabular hidden shrink-0 text-[11px] text-muted min-[380px]:inline">{formatTime(now)}</span>
          <FastForward className="ml-auto size-4 shrink-0 text-muted" />
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <span className="sr-only" aria-live="polite">
            {saveStatus === 'saving' ? 'Guardando' : saveStatus === 'saved' ? 'Guardado' : ''}
          </span>
          <IconButton className="hidden min-[400px]:inline-flex" label={hide ? 'Mostrar saldos' : 'Ocultar saldos'} onClick={() => appStore.dispatch('settings/update', { hideBalances: !hide })}>
            {hide ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </IconButton>
          <Link to="/notifications" className="relative inline-flex size-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Notificaciones (${unread} sin leer)`}>
            <Bell className="size-[18px]" />
            {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-neg ring-2 ring-bg" />}
          </Link>
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const path = usePath();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl lg:hidden" aria-label="Navegación inferior">
      <div className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {MOBILE_TABS.map((t) => {
          const active = isActive(path, t);
          return (
            <Link key={t.to} to={t.to} aria-current={active ? 'page' : undefined} className={cx('flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium', active ? 'text-accent' : 'text-muted')}>
              <t.icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
              {t.label}
            </Link>
          );
        })}
        <button type="button" onClick={onMore} className="flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted">
          <MoreHorizontal className="size-[22px]" />
          Más
        </button>
      </div>
    </nav>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePath();
  return (
    <Modal open={open} onClose={onClose} title="Todas las secciones" size="md">
      <div className="space-y-4 pb-2">
        {NAV_GROUPS.map((g) => (
          <div key={g.title}>
            <div className="pb-2 text-[11px] font-semibold tracking-[0.12em] text-subtle uppercase">{g.title}</div>
            <div className="grid grid-cols-3 gap-2">
              {g.items.map((it) => (
                <Link
                  key={it.to}
                  to={it.to}
                  onClick={onClose}
                  className={cx('flex flex-col items-center gap-1.5 rounded-2xl border border-line px-2 py-3 text-center text-[12px] font-medium', isActive(path, it) ? 'bg-accent/12 text-fg' : 'bg-surface-2 text-muted')}
                >
                  <it.icon className="size-5" />
                  {it.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [more, setMore] = useState(false);
  const [sim, setSim] = useState(false);
  return (
    <div className="nx-glow min-h-dvh">
      <Sidebar />
      <div className="lg:pl-[248px]">
        <TopBar onOpenSim={() => setSim(true)} />
        <main className="mx-auto max-w-[1400px] px-4 pt-5 pb-28 sm:px-6 sm:pt-7 lg:pb-12">{children}</main>
      </div>
      <BottomNav onMore={() => setMore(true)} />
      <MoreSheet open={more} onClose={() => setMore(false)} />
      <Modal open={sim} onClose={() => setSim(false)} title="Reloj de simulación" subtitle="Controla el paso del tiempo simulado">
        <SimControls compact />
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          El tiempo solo avanza con la aplicación abierta. Al avanzar se procesan cuotas, rentas, extractos, intereses, dividendos y la evolución de los mercados.
        </p>
      </Modal>
    </div>
  );
}

export function FloatingAction({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed right-4 bottom-20 z-30 flex size-14 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_10px_30px_-8px_var(--nx-accent)] lg:hidden"
    >
      <Plus className="size-6" />
    </button>
  );
}
