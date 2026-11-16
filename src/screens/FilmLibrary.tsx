import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  CATEGORY_LABEL,
  FORMAT_LABEL,
  STATUS_LABEL,
  boxSpeedLabel,
  displayName,
  fmtTime,
  reciprocitySummary,
  searchFilms,
  validateStock,
  type FilmCategory,
  type FilmFormat,
  type FilmStock,
  type ReciprocityData,
} from '../engine';
import { FilmArt } from '../components/art';
import { NewRollForm } from '../components/RollSheet';
import { Button, Chip, Field, Label, Notice, Row, Segmented, Sheet, cx, inputClass } from '../components/ui';
import { deleteCustomStock, saveCustomStock } from '../state/actions';
import { activeCamera, allStocks, catalogOf, uid, useDoc } from '../state/store';

export function FilmLibrary() {
  const doc = useDoc((d) => d);
  const catalog = catalogOf(doc);
  const stocks = allStocks(doc);
  const camera = activeCamera(doc);
  const [q, setQ] = useState('');
  const [maker, setMaker] = useState<string | undefined>();
  const [cat, setCat] = useState<FilmCategory | undefined>();
  const [fmt, setFmt] = useState<FilmFormat | undefined>();
  const [open, setOpen] = useState<FilmStock | null>(null);
  const [loadInto, setLoadInto] = useState<FilmStock | null>(null);
  const [editing, setEditing] = useState<FilmStock | null>(null);
  const makers = useMemo(() => [...new Set([...catalog.manufacturers.map((m) => m.name), ...doc.customStocks.map((s) => s.manufacturer)])], [catalog, doc.customStocks]);
  const results = useMemo(() => searchFilms(stocks, q, { manufacturer: maker, category: cat, format: fmt }), [stocks, q, maker, cat, fmt]);
  const makerInfo = catalog.manufacturers.find((m) => m.name === maker);

  return (
    <div className="space-y-3 px-3 pb-6 pt-2">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Film library</h1>
        <Button onClick={() => setEditing(blankStock())}>
          <Plus size={16} /> Custom
        </Button>
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3.5 text-dim" aria-hidden />
        <input className={cx(inputClass, 'pl-9')} placeholder="Search film, speed, process…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search films" />
      </div>
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
        <Chip on={!maker} onClick={() => setMaker(undefined)}>
          All
        </Chip>
        {makers.map((m) => (
          <Chip key={m} on={maker === m} onClick={() => setMaker(maker === m ? undefined : m)}>
            {m}
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
        {(Object.keys(CATEGORY_LABEL) as FilmCategory[]).map((c) => (
          <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? undefined : c)}>
            {CATEGORY_LABEL[c]}
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
        {(['35mm', '120', '4x5', '8x10'] as FilmFormat[]).map((f) => (
          <Chip key={f} on={fmt === f} onClick={() => setFmt(fmt === f ? undefined : f)}>
            {FORMAT_LABEL[f]}
          </Chip>
        ))}
      </div>
      {makerInfo?.notes && !results.length && <Notice>{maker}: {makerInfo.notes} Only verified records are added; use a custom stock meanwhile.</Notice>}
      <div className="text-xs text-dim">
        {results.length} stocks · catalog v{catalog.catalogVersion} ({catalog.publishedAt})
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {results.map((s) => (
          <button key={s.id} type="button" onClick={() => setOpen(s)} className="overflow-hidden rounded-2xl border border-line bg-surface text-left">
            <div className="aspect-[4/3]">
              <FilmArt stock={s} format={fmt && s.formats.includes(fmt) ? fmt : undefined} />
            </div>
            <div className="px-3 py-2">
              <div className="text-xs text-dim">{s.manufacturer}</div>
              <div className="font-semibold leading-tight">{s.name}</div>
              <div className="mt-0.5 text-xs text-muted">
                {boxSpeedLabel(s)} · {s.process ?? '—'}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {s.formats.map((f) => (
                  <span key={f} className={cx('rounded px-1 text-[10px] font-semibold', camera?.format === f ? 'bg-accent text-accent-ink' : 'bg-raise text-muted')}>
                    {f}
                  </span>
                ))}
              </div>
              {s.isCustom && <div className="text-[10px] text-info">Custom</div>}
              {s.status !== 'available' && <div className="text-[10px] text-caution">{STATUS_LABEL[s.status]}</div>}
            </div>
          </button>
        ))}
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? displayName(open) : ''}>
        {open && (
          <div className="space-y-3">
            <div className="mx-auto h-40 w-40 overflow-hidden rounded-2xl">
              <FilmArt stock={open} />
            </div>
            <div>
              <Row label="Category" value={CATEGORY_LABEL[open.category]} />
              <Row label="Box speed" value={boxSpeedLabel(open)} />
              <Row label="Process" value={open.process ?? '—'} />
              <Row label="Formats" value={open.formats.map((f) => FORMAT_LABEL[f]).join(', ')} />
              <Row label="Status" value={STATUS_LABEL[open.status]} tone={open.status === 'available' ? undefined : 'warn'} />
              <Row label="Reciprocity" value={reciprocitySummary(open.reciprocity)} />
              {open.reciprocity.points && open.reciprocity.kind === 'table' && (
                <Row label="Published points" value={open.reciprocity.points.map((p) => `${fmtTime(p.metered)}→${fmtTime(p.corrected)}`).join(', ')} />
              )}
              <Row label="Reference" value={open.manufacturerReference ?? open.reciprocity.source ?? '—'} />
              <Row label="Last verified" value={open.lastVerified ?? 'Not yet verified'} tone={open.lastVerified ? undefined : 'warn'} />
            </div>
            {open.notes && <p className="text-sm text-muted">{open.notes}</p>}
            {open.reciprocity.note && <p className="text-sm text-muted">{open.reciprocity.note}</p>}
            {open.verificationNotes && <p className="text-xs text-dim">{open.verificationNotes}</p>}
            {camera && (
              <Button
                kind="primary"
                className="w-full"
                onClick={() => {
                  setLoadInto(open);
                  setOpen(null);
                }}
              >
                Load in {camera.name}
              </Button>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  setEditing({ ...structuredClone(open), id: open.isCustom ? open.id : `custom-${uid().slice(0, 8)}`, isCustom: true, name: open.isCustom ? open.name : `${open.name} (custom)` });
                  setOpen(null);
                }}
              >
                {open.isCustom ? 'Edit' : 'Copy as custom'}
              </Button>
              {open.isCustom && (
                <Button
                  kind="danger"
                  onClick={() => {
                    deleteCustomStock(open.id);
                    setOpen(null);
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}
      </Sheet>
      <Sheet open={!!loadInto} onClose={() => setLoadInto(null)} title={camera ? `Load in the ${camera.name}` : ''} full>
        {loadInto && camera && <NewRollForm camera={camera} preset={loadInto} onDone={() => setLoadInto(null)} />}
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Custom film stock" full>
        {editing && (
          <CustomStockEditor
            initial={editing}
            makers={makers}
            onSave={(s) => {
              saveCustomStock(s);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function blankStock(): FilmStock {
  return {
    id: `custom-${uid().slice(0, 8)}`,
    manufacturer: 'Other',
    name: '',
    category: 'bwNegative',
    process: 'B&W',
    boxSpeed: 400,
    speedDesignation: 'ISO 400',
    defaultEI: 400,
    formats: ['35mm'],
    reciprocity: { kind: 'unpublished' },
    status: 'available',
    manufacturerReference: null,
    lastVerified: null,
    verificationNotes: 'Custom stock entered by the user.',
    notes: null,
    isCustom: true,
  };
}

function CustomStockEditor({ initial, makers, onSave }: { initial: FilmStock; makers: string[]; onSave: (s: FilmStock) => void }) {
  const [s, setS] = useState<FilmStock>(initial);
  const set = (p: Partial<FilmStock>) => setS((x) => ({ ...x, ...p }));
  const setR = (p: Partial<ReciprocityData>) => setS((x) => ({ ...x, reciprocity: { ...x.reciprocity, ...p } }));
  const [pointsText, setPointsText] = useState((initial.reciprocity.points ?? []).map((p) => `${p.metered}=${p.corrected}`).join(', '));
  const issues = validateStock(s).concat(s.name.trim() ? [] : ['Name is required.']);
  return (
    <div className="space-y-2">
      <Field label="Manufacturer">
        <input className={inputClass} list="makers" value={s.manufacturer} onChange={(e) => set({ manufacturer: e.target.value })} />
        <datalist id="makers">
          {makers.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
      <Field label="Film stock">
        <input className={inputClass} value={s.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Box speed (ISO)">
          <input
            className={inputClass}
            inputMode="numeric"
            value={s.boxSpeed ?? ''}
            onChange={(e) => {
              const v = Number(e.target.value) || null;
              set({ boxSpeed: v, speedDesignation: v ? `ISO ${v}` : s.speedDesignation, defaultEI: v ?? s.defaultEI });
            }}
          />
        </Field>
        <Field label="Process">
          <input className={inputClass} value={s.process ?? ''} onChange={(e) => set({ process: e.target.value || null })} />
        </Field>
      </div>
      <Field label="Category">
        <select className={inputClass} value={s.category} onChange={(e) => set({ category: e.target.value as FilmCategory })}>
          {(Object.keys(CATEGORY_LABEL) as FilmCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      <Label>Formats made</Label>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(FORMAT_LABEL) as FilmFormat[])
          .filter((f) => f !== 'Digital')
          .map((f) => (
            <Chip key={f} on={s.formats.includes(f)} onClick={() => set({ formats: s.formats.includes(f) ? s.formats.filter((x) => x !== f) : [...s.formats, f] })}>
              {FORMAT_LABEL[f]}
            </Chip>
          ))}
      </div>
      <div className="pt-2">
        <Label>Reciprocity curve</Label>
        <div className="mt-2">
          <Segmented
            small
            label="Reciprocity model"
            value={s.reciprocity.kind}
            onChange={(k) => setR({ kind: k })}
            options={[
              { value: 'unpublished', label: 'None known' },
              { value: 'powerLaw', label: 'Tc = Tm^p' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </div>
        {s.reciprocity.kind === 'powerLaw' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Exponent p">
              <input className={inputClass} inputMode="decimal" value={s.reciprocity.exponent ?? ''} onChange={(e) => setR({ exponent: Number(e.target.value) || null })} />
            </Field>
            <Field label="Applies above (s)">
              <input className={inputClass} inputMode="decimal" value={s.reciprocity.appliesAboveSeconds ?? 1} onChange={(e) => setR({ appliesAboveSeconds: Number(e.target.value) || 1 })} />
            </Field>
          </div>
        )}
        {s.reciprocity.kind === 'table' && (
          <Field label="Points metered=corrected (seconds)" hint="e.g. 1=1, 10=15, 100=200 — interpolated on a log scale">
            <input
              className={inputClass}
              value={pointsText}
              onChange={(e) => {
                setPointsText(e.target.value);
                const pts = e.target.value
                  .split(',')
                  .map((x) => x.split('=').map((n) => Number(n.trim())))
                  .filter((x) => x.length === 2 && x[0]! > 0 && x[1]! > 0)
                  .map(([m, c]) => ({ metered: m!, corrected: c! }));
                setR({ points: pts, publishedUpToSeconds: pts.at(-1)?.metered ?? null });
              }}
            />
          </Field>
        )}
        <Field label="Source / note">
          <input className={inputClass} value={s.reciprocity.source ?? ''} onChange={(e) => setR({ source: e.target.value || null })} placeholder="Datasheet, your own tests…" />
        </Field>
      </div>
      <Field label="Notes">
        <input className={inputClass} value={s.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />
      </Field>
      {issues.length > 0 && <Notice tone="bad">{issues.join(' ')}</Notice>}
      <Button kind="primary" className="w-full" disabled={issues.length > 0} onClick={() => onSave({ ...s, isCustom: true })}>
        Save custom stock
      </Button>
    </div>
  );
}
