import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Plus, Trash2, Upload } from 'lucide-react';
import { formatDateTime } from '@/core/time';
import { appStore } from '@/store/appStore';
import { useApp } from '@/store/hooks';
import { confirm, toast } from '@/store/toast';
import { navigate, usePath } from '@/app/router';
import { Modal } from '@/ui/overlays';
import { Badge, Button, Card, PageHeader } from '@/ui/primitives';
import { CreateProfileForm } from './CreateProfileForm';

export function downloadText(fileName: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useImportProfile() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const state = await appStore.importProfile(text);
      toast.success('Perfil importado', `«${state.profile.name}» validado y activado.`);
      navigate('/');
    } catch (e) {
      toast.error('No se pudo importar', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const element = <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Fichero de perfil" />;
  return { open: () => input.current?.click(), element, busy };
}

export default function ProfilesPage() {
  const profiles = useApp((s) => s.profiles);
  const active = useApp((s) => s.profile?.profile.id);
  const path = usePath();
  const [creating, setCreating] = useState(false);
  const imp = useImportProfile();
  useEffect(() => {
    if (path.includes('new=1')) {
      setCreating(true);
      navigate('/profiles');
    }
  }, [path]);

  const exportProfile = async (id: string) => {
    try {
      const { fileName, text } = await appStore.exportProfile(id);
      downloadText(fileName, text);
      toast.success('Perfil exportado', fileName);
    } catch (e) {
      toast.error('No se pudo exportar', e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div>
      <PageHeader
        title="Perfiles financieros"
        subtitle="Cada perfil tiene sus propias cuentas, tarjetas, inversiones, inmuebles, préstamos, mercado y ajustes"
        actions={
          <>
            <Button variant="secondary" icon={<Upload className="size-4" />} onClick={imp.open} loading={imp.busy}>Importar</Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Nuevo perfil</Button>
          </>
        }
      />
      {imp.element}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {profiles.map((pr) => (
          <Card key={pr.id} className={pr.id === active ? 'ring-1 ring-accent/50' : ''}>
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white" style={{ background: pr.color }}>
                {pr.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-fg">{pr.name}</span>
                  {pr.id === active && <Badge tone="accent">Activo</Badge>}
                </div>
                <div className="text-[12px] text-muted">{pr.ownerName} · {pr.baseCurrency}</div>
                <div className="mt-1 text-[11.5px] text-subtle">Creado {formatDateTime(pr.createdAt)}</div>
                <div className="text-[11.5px] text-subtle">Guardado {formatDateTime(pr.updatedAt)}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {pr.id !== active && (
                <Button
                  size="sm"
                  icon={<Check className="size-4" />}
                  onClick={async () => {
                    try {
                      await appStore.switchProfile(pr.id);
                      toast.success(`Perfil activo: ${pr.name}`);
                      navigate('/');
                    } catch (e) {
                      toast.error('No se pudo cambiar', e instanceof Error ? e.message : undefined);
                    }
                  }}
                >
                  Usar
                </Button>
              )}
              <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => exportProfile(pr.id)}>Exportar</Button>
              <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={async () => { await appStore.duplicateProfile(pr.id); toast.success('Perfil duplicado'); }}>Duplicar</Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="size-4" />}
                onClick={async () => {
                  if (!(await confirm({ title: `Eliminar «${pr.name}»`, body: 'Se borrarán de este dispositivo todos sus datos y copias de seguridad. Exporta antes si quieres conservarlo.', tone: 'danger', confirmLabel: 'Eliminar perfil' }))) return;
                  await appStore.deleteProfile(pr.id);
                  toast.success('Perfil eliminado');
                }}
              >
                Eliminar
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo perfil financiero" size="lg">
        <CreateProfileForm
          compact
          onDone={() => {
            setCreating(false);
            navigate('/');
          }}
        />
      </Modal>
    </div>
  );
}
