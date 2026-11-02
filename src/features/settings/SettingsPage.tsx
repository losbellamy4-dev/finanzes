import { useEffect, useState } from 'react';
import { Archive, Download, Moon, RotateCcw, Save, ShieldCheck, Sun, Trash2, Upload, Monitor } from 'lucide-react';
import { formatDateTime, tickToDate } from '@/core/time';
import { COUNTRIES } from '@/data/labels';
import { SCHEMA_VERSION } from '@/core/schema';
import { appStore } from '@/store/appStore';
import { dispatch, useApp, useOperation, useProfile } from '@/store/hooks';
import { confirm, toast } from '@/store/toast';
import { setThemePref, useThemePref } from '@/app/theme';
import type { BackupMeta } from '@/persistence/repository';
import { Badge, Button, Card, Field, FormError, Input, KeyValue, PageHeader, Segmented, Select, Switch } from '@/ui/primitives';
import { downloadText, useImportProfile } from '@/features/profiles/ProfilesPage';

export default function SettingsPage() {
  const p = useProfile();
  const theme = useThemePref();
  const lastSaved = useApp((s) => s.lastSavedAt);
  const saveStatus = useApp((s) => s.saveStatus);
  const [name, setName] = useState(p.profile.name);
  const [owner, setOwner] = useState(p.profile.ownerName);
  const [country, setCountry] = useState(p.profile.country);
  const [buyCost, setBuyCost] = useState(String(p.settings.propertyPurchaseCostRate * 100));
  const [sellCost, setSellCost] = useState(String(p.settings.propertySaleCostRate * 100));
  const [error, setError] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>({});
  const { run, pending } = useOperation();
  const imp = useImportProfile();

  const refreshBackups = () => void appStore.listBackups().then(setBackups);
  useEffect(() => {
    refreshBackups();
    navigator.storage?.estimate?.().then((e) => setStorage({ usage: e.usage, quota: e.quota })).catch(() => undefined);
  }, [p.profile.id]);

  const saveProfile = () => {
    setError(null);
    const r = run('profile/update', { name, ownerName: owner, country }, { success: 'Perfil actualizado' });
    if (!r.ok) return setError(r.message);
    const r2 = run('settings/update', { propertyPurchaseCostRate: Number(buyCost.replace(',', '.')) / 100, propertySaleCostRate: Number(sellCost.replace(',', '.')) / 100 });
    if (!r2.ok) setError(r2.message);
  };

  return (
    <div>
      <PageHeader title="Ajustes" subtitle="Apariencia, perfil, datos, copias de seguridad y privacidad" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Apariencia">
          <Segmented
            value={theme}
            onChange={setThemePref}
            options={[
              { value: 'dark', label: <span className="flex items-center gap-1.5"><Moon className="size-4" />Oscuro</span> },
              { value: 'light', label: <span className="flex items-center gap-1.5"><Sun className="size-4" />Claro</span> },
              { value: 'system', label: <span className="flex items-center gap-1.5"><Monitor className="size-4" />Sistema</span> },
            ]}
            ariaLabel="Tema"
          />
          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-fg">Ocultar saldos</div>
              <div className="text-[12px] text-muted">Muestra •••• en lugar de los importes.</div>
            </div>
            <Switch checked={p.settings.hideBalances} onChange={(v) => dispatch('settings/update', { hideBalances: v })} label="Ocultar saldos" />
          </div>
        </Card>
        <Card title="Perfil activo">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre del perfil">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</Field>
              <Field label="Titular">{(id) => <Input id={id} value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={80} />}</Field>
              <Field label="País">
                {(id) => (
                  <Select id={id} value={country} onChange={(e) => setCountry(e.target.value)}>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Divisa base">{(id) => <Input id={id} value={p.profile.baseCurrency} disabled />}</Field>
              <Field label="Gastos de compra de inmuebles (%)">{(id) => <Input id={id} value={buyCost} onChange={(e) => setBuyCost(e.target.value)} inputMode="decimal" />}</Field>
              <Field label="Gastos de venta de inmuebles (%)">{(id) => <Input id={id} value={sellCost} onChange={(e) => setSellCost(e.target.value)} inputMode="decimal" />}</Field>
            </div>
            <FormError message={error} />
            <Button icon={<Save className="size-4" />} onClick={saveProfile} loading={pending}>Guardar</Button>
          </div>
        </Card>
        <Card title="Datos y portabilidad" subtitle="Todo se guarda localmente en este dispositivo (IndexedDB)">
          <KeyValue
            items={[
              { label: 'Guardado automático', value: saveStatus === 'saving' ? 'Guardando…' : lastSaved ? `Último: ${new Date(lastSaved).toLocaleTimeString('es-ES')}` : 'Activo' },
              { label: 'Versión del esquema', value: `v${SCHEMA_VERSION}` },
              { label: 'Movimientos registrados', value: String(p.transactions.length) },
              { label: 'Fecha simulada', value: formatDateTime(tickToDate(p.clock.startAt, p.clock.tick)) },
              ...(storage.usage ? [{ label: 'Espacio usado', value: `${(storage.usage / 1024 / 1024).toFixed(1)} MB${storage.quota ? ` de ${(storage.quota / 1024 / 1024 / 1024).toFixed(1)} GB` : ''}` }] : []),
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Download className="size-4" />}
              onClick={async () => {
                const { fileName, text } = await appStore.exportProfile();
                downloadText(fileName, text);
                toast.success('Perfil exportado', fileName);
              }}
            >
              Exportar perfil
            </Button>
            <Button variant="secondary" icon={<Upload className="size-4" />} onClick={imp.open} loading={imp.busy}>Importar perfil</Button>
            {imp.element}
          </div>
          <p className="mt-3 text-[12px] text-subtle">Los ficheros importados se validan campo a campo y con suma de verificación antes de aceptarse. Si el identificador ya existe, se importan como perfil nuevo.</p>
        </Card>
        <Card
          title="Copias de seguridad"
          subtitle="Se crea una copia automática al día; se conservan las 10 más recientes"
          action={
            <Button
              size="sm"
              icon={<Archive className="size-4" />}
              onClick={async () => {
                await appStore.createBackup();
                toast.success('Copia de seguridad creada');
                refreshBackups();
              }}
            >
              Crear copia
            </Button>
          }
        >
          {backups.length === 0 ? (
            <p className="text-sm text-muted">Aún no hay copias de este perfil.</p>
          ) : (
            <ul className="divide-y divide-line">
              {backups.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-fg">{formatDateTime(b.createdAt)}</div>
                    <div className="text-[12px] text-muted">
                      <Badge>{{ manual: 'Manual', auto: 'Automática', 'pre-import': 'Antes de importar', 'pre-restore': 'Antes de restaurar' }[b.reason]}</Badge> · {(b.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RotateCcw className="size-4" />}
                    onClick={async () => {
                      if (!(await confirm({ title: 'Restaurar copia', body: 'El estado actual se guardará como copia antes de restaurar.', confirmLabel: 'Restaurar' }))) return;
                      try {
                        await appStore.restoreBackup(b.id);
                        toast.success('Copia restaurada');
                        refreshBackups();
                      } catch (e) {
                        toast.error('No se pudo restaurar', e instanceof Error ? e.message : undefined);
                      }
                    }}
                  >
                    Restaurar
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Eliminar copia" onClick={async () => { await appStore.deleteBackup(b.id); refreshBackups(); }}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Seguridad y transparencia" className="lg:col-span-2">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-pos" />
            <ul className="space-y-1.5 text-sm text-muted">
              <li>NEXUS FINANCE es exclusivamente un simulador: no se conecta con bancos reales ni ejecuta operaciones financieras reales.</li>
              <li>Nunca solicita credenciales bancarias. Los IBAN usan dígitos de control «00» (inválidos por norma) y las tarjetas empiezan por 0 con dígito Luhn inválido.</li>
              <li>Empresas, índices, criptomonedas, inmuebles, inquilinos y entidades benéficas son ficticios. No se usan marcas ni logotipos de entidades reales.</li>
              <li>Los datos se guardan únicamente en este navegador. La aplicación funciona sin conexión una vez cargada.</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
