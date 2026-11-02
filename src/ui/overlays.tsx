import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { closeConfirm, dismissToast, useConfirmRequest, useToasts } from '@/store/toast';
import { Button, cx } from './primitives';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button:not([data-close])');
      el?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div className="anim-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cx(
          'anim-sheet sm:anim-pop relative flex max-h-[92dvh] w-full flex-col rounded-t-[22px] border border-line bg-surface shadow-2xl sm:rounded-[22px]',
          widths[size],
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-3 sm:hidden" />
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-tight text-fg">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="nx-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {footer && <footer className="pb-safe flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmHost() {
  const req = useConfirmRequest();
  return (
    <Modal
      open={!!req}
      onClose={() => closeConfirm(false)}
      title={req?.title ?? ''}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => closeConfirm(false)}>
            Cancelar
          </Button>
          <Button variant={req?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => closeConfirm(true)} autoFocus>
            {req?.confirmLabel ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      {req?.body && <p className="text-sm text-muted">{req.body}</p>}
      {req?.details && (
        <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface-2 px-3.5">
          {req.details.map((d) => (
            <div key={d.label} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="text-muted">{d.label}</dt>
              <dd className="tabular text-right font-medium text-fg">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-[11.5px] text-subtle">Operación simulada: no se mueve dinero real.</p>
    </Modal>
  );
}

export function Toaster() {
  const toasts = useToasts();
  const icons = {
    success: <CheckCircle2 className="size-5 text-pos" />,
    error: <XCircle className="size-5 text-neg" />,
    info: <Info className="size-5 text-accent" />,
    warning: <AlertTriangle className="size-5 text-warn" />,
  };
  return createPortal(
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 p-3 sm:top-auto sm:right-4 sm:bottom-4 sm:left-auto sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="anim-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface/95 p-3.5 shadow-2xl backdrop-blur"
        >
          <div className="mt-0.5 shrink-0">{icons[t.level]}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[13px] text-muted">{t.body}</p>}
          </div>
          <button type="button" aria-label="Descartar" onClick={() => dismissToast(t.id)} className="shrink-0 text-subtle hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
