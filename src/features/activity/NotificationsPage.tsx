import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Info, Trash2, XCircle } from 'lucide-react';
import { formatDateTime } from '@/core/time';
import { dispatch, useProfile } from '@/store/hooks';
import { confirm } from '@/store/toast';
import { navigate } from '@/app/router';
import { Button, Card, cx, EmptyState, PageHeader } from '@/ui/primitives';

export default function NotificationsPage() {
  const p = useProfile();
  const unread = p.notifications.filter((n) => !n.read).length;
  const icons = {
    success: <CheckCircle2 className="size-5 text-pos" />,
    info: <Info className="size-5 text-accent" />,
    warning: <AlertTriangle className="size-5 text-warn" />,
    danger: <XCircle className="size-5 text-neg" />,
  };
  return (
    <div>
      <PageHeader
        title="Notificaciones"
        subtitle={`${unread} sin leer de ${p.notifications.length}`}
        actions={
          <>
            <Button variant="secondary" icon={<CheckCheck className="size-4" />} onClick={() => dispatch('notifications/read', { all: true })} disabled={!unread}>
              Marcar todo como leído
            </Button>
            <Button variant="ghost" icon={<Trash2 className="size-4" />} disabled={!p.notifications.length} onClick={async () => { if (await confirm({ title: 'Borrar todas las notificaciones', tone: 'danger', confirmLabel: 'Borrar' })) dispatch('notifications/clear', undefined); }}>
              Borrar
            </Button>
          </>
        }
      />
      <Card>
        {p.notifications.length === 0 ? (
          <EmptyState icon={<Bell className="size-5" />} title="Sin notificaciones" body="Aquí verás cobros de rentas, extractos, cuotas, hitos de ahorro y eventos de mercado." />
        ) : (
          <ul className="divide-y divide-line">
            {p.notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    dispatch('notifications/read', { ids: [n.id] });
                    if (n.link) navigate(n.link);
                  }}
                  className={cx('-mx-2 flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left hover:bg-surface-2', !n.read && 'bg-accent/5')}
                >
                  <span className="mt-0.5 shrink-0">{icons[n.level]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{n.title}</span>
                      {!n.read && <span className="size-2 rounded-full bg-accent" aria-label="Sin leer" />}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted">{n.body}</span>
                    <span className="mt-1 block text-[11.5px] text-subtle">{formatDateTime(n.at)} (fecha simulada)</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
