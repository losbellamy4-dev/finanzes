import { useMemo, useState } from 'react';
import { BedDouble, Bath, Building2, Maximize, RefreshCw, Search } from 'lucide-react';
import type { PropertyType } from '@/core/schema';
import { formatPct, parseMoney } from '@/core/money';
import { CITIES, CONDITION_LABELS, PROPERTY_TYPE_LABELS } from '@/data/realestate';
import { propertyStats } from '@/engine/realestate';
import { useMoney, useOperation, useProfile } from '@/store/hooks';
import { Link } from '@/app/router';
import { PropertyArt } from '@/ui/PropertyArt';
import { Badge, Button, Card, Delta, EmptyState, Input, PageHeader, Segmented, Select, Stat } from '@/ui/primitives';

type Tab = 'market' | 'mine';
type Sort = 'price-asc' | 'price-desc' | 'area' | 'yield';

export default function RealEstatePage() {
  const p = useProfile();
  const fmt = useMoney();
  const [tab, setTab] = useState<Tab>(p.properties.some((x) => x.owned) ? 'mine' : 'market');
  const [type, setType] = useState<'all' | PropertyType>('all');
  const [city, setCity] = useState('all');
  const [maxPrice, setMaxPrice] = useState('');
  const [rooms, setRooms] = useState('0');
  const [condition, setCondition] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('price-asc');
  const { run, pending } = useOperation();

  const owned = p.properties.filter((x) => x.owned);
  const listings = useMemo(() => {
    const max = maxPrice.trim() ? parseMoney(maxPrice) : null;
    const qq = q.trim().toLowerCase();
    const arr = p.properties.filter(
      (x) =>
        x.listed &&
        !x.owned &&
        (type === 'all' || x.type === type) &&
        (city === 'all' || x.city === city) &&
        (!max || x.value <= max) &&
        x.rooms >= Number(rooms) &&
        (condition === 'all' || x.condition === condition) &&
        (!qq || x.title.toLowerCase().includes(qq) || x.city.toLowerCase().includes(qq)),
    );
    arr.sort((a, b) => (sort === 'price-asc' ? a.value - b.value : sort === 'price-desc' ? b.value - a.value : sort === 'area' ? b.area - a.area : b.marketRent / b.value - a.marketRent / a.value));
    return arr;
  }, [p.properties, type, city, maxPrice, rooms, condition, q, sort]);

  const portfolio = useMemo(() => {
    let value = 0;
    let invested = 0;
    let rent = 0;
    let equity = 0;
    for (const x of owned) {
      const st = propertyStats(p, x);
      value += x.value;
      invested += st.invested;
      rent += st.annualRent;
      equity += st.equity;
    }
    return { value, invested, rent, equity };
  }, [owned, p]);

  return (
    <div>
      <PageHeader title="Inmobiliario" subtitle="Mercado inmobiliario ficticio: compra, alquila, reforma y vende" actions={<Segmented value={tab} onChange={setTab} options={[{ value: 'market', label: `Mercado (${p.properties.filter((x) => x.listed && !x.owned).length})` }, { value: 'mine', label: `Mis inmuebles (${owned.length})` }]} />} />
      {tab === 'mine' ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="nx-card p-3.5"><Stat label="Valor de mercado" value={fmt(portfolio.value)} /></div>
            <div className="nx-card p-3.5"><Stat label="Capital invertido" value={fmt(portfolio.invested)} /></div>
            <div className="nx-card p-3.5"><Stat label="Patrimonio neto inmobiliario" value={fmt(portfolio.equity)} hint="Valor menos hipotecas" /></div>
            <div className="nx-card p-3.5"><Stat label="Rentas anuales contratadas" value={fmt(portfolio.rent)} tone={portfolio.rent ? 'pos' : undefined} /></div>
          </div>
          {owned.length === 0 ? (
            <EmptyState icon={<Building2 className="size-5" />} title="Aún no tienes inmuebles" body="Explora el mercado y compra al contado o con hipoteca." action={<Button onClick={() => setTab('market')}>Ver mercado</Button>} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {owned.map((x) => {
                const st = propertyStats(p, x);
                const rented = p.rentals.some((r) => r.propertyId === x.id && r.status === 'active');
                return (
                  <Link key={x.id} to={`/realestate/${x.id}`} className="nx-card anim-fade-up group block overflow-hidden">
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <PropertyArt type={x.type} seed={x.imageSeed} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
                      <div className="absolute top-3 left-3 flex gap-1.5">
                        <Badge tone={rented ? 'pos' : 'neutral'} className="bg-black/50 text-white backdrop-blur">{rented ? 'Alquilado' : 'Disponible'}</Badge>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="truncate font-semibold text-fg">{x.title}</div>
                      <div className="text-[12px] text-muted">{x.city}, {x.country}</div>
                      <div className="mt-3 flex items-end justify-between">
                        <div>
                          <div className="tabular text-lg font-semibold text-fg">{fmt(x.value)}</div>
                          <div className="text-[12px]"><Delta value={x.purchasePrice ? x.value / x.purchasePrice - 1 : 0} /> desde la compra</div>
                        </div>
                        <div className="text-right text-[12px] text-muted">
                          <div>Rent. bruta {formatPct(st.grossYield, 1, false)}</div>
                          <div>Retorno total {formatPct(st.totalReturn, 1)}</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <Card className="mb-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="relative lg:col-span-2">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="pl-10" aria-label="Buscar inmuebles" />
              </div>
              <Select aria-label="Tipo" value={type} onChange={(e) => setType(e.target.value as 'all' | PropertyType)}>
                <option value="all">Todos los tipos</option>
                {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((t) => (
                  <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>
                ))}
              </Select>
              <Select aria-label="Ciudad" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="all">Todas las ciudades</option>
                {CITIES.map((c) => (
                  <option key={c.city} value={c.city}>{c.city}</option>
                ))}
              </Select>
              <Input aria-label="Precio máximo" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Precio máx." inputMode="decimal" />
              <Select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="price-asc">Precio ↑</option>
                <option value="price-desc">Precio ↓</option>
                <option value="area">Superficie</option>
                <option value="yield">Rentabilidad</option>
              </Select>
              <Select aria-label="Habitaciones mínimas" value={rooms} onChange={(e) => setRooms(e.target.value)}>
                {[0, 1, 2, 3, 4, 5].map((r) => (
                  <option key={r} value={r}>{r === 0 ? 'Habitaciones: todas' : `${r}+ habitaciones`}</option>
                ))}
              </Select>
              <Select aria-label="Estado" value={condition} onChange={(e) => setCondition(e.target.value)}>
                <option value="all">Cualquier estado</option>
                {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
              <div className="flex items-center justify-end lg:col-span-4">
                <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={pending} onClick={() => run('property/generate', { count: 6 }, { success: 'Nuevos inmuebles publicados' })}>
                  Publicar más inmuebles
                </Button>
              </div>
            </div>
          </Card>
          {listings.length === 0 ? (
            <EmptyState title="Ningún inmueble coincide" body="Ajusta los filtros o publica nuevos inmuebles." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {listings.map((x) => {
                const first = x.valueHistory[0]?.v ?? x.value;
                return (
                  <Link key={x.id} to={`/realestate/${x.id}`} className="nx-card anim-fade-up group block overflow-hidden">
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <PropertyArt type={x.type} seed={x.imageSeed} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
                      <div className="absolute top-3 left-3 flex gap-1.5">
                        <Badge className="bg-black/50 text-white backdrop-blur">{PROPERTY_TYPE_LABELS[x.type]}</Badge>
                        <Badge className="bg-black/50 text-white backdrop-blur">{CONDITION_LABELS[x.condition]}</Badge>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-fg">{x.title}</div>
                          <div className="text-[12px] text-muted">{x.city}, {x.country}</div>
                        </div>
                        <Delta value={first ? x.value / first - 1 : 0} className="shrink-0 text-[12px]" />
                      </div>
                      <div className="tabular mt-3 text-lg font-semibold text-fg">{fmt(x.value)}</div>
                      <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-muted">
                        <span className="flex items-center gap-1"><Maximize className="size-3.5" /> {x.area} m²</span>
                        {x.rooms > 0 && <span className="flex items-center gap-1"><BedDouble className="size-3.5" /> {x.rooms}</span>}
                        <span className="flex items-center gap-1"><Bath className="size-3.5" /> {x.baths}</span>
                        <span className="ml-auto">Renta est. {fmt(x.marketRent)}/mes</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
