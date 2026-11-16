import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import {
  CATEGORY_LABEL,
  FORMAT_LABEL,
  GOALS,
  STATUS_LABEL,
  boxSpeedLabel,
  eiOptionLabel,
  eiOptions,
  fmtISO,
  fmtStops,
  processingLabel,
  searchFilms,
  validateCustomEI,
  type CameraProfile,
  type FilmCategory,
  type FilmFormat,
  type FilmStock,
  type Goal,
} from '../engine';
import { FilmArt, GoalArt } from './art';
import { Chip, Field, Label, Stepper, cx, inputClass } from './ui';

/** "What are you shooting today?" */
export function GoalGrid({ value, customGoal, onPick, onCustom }: { value: Goal | null; customGoal: string; onPick: (g: Goal) => void; onCustom: (s: string) => void }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        {GOALS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onPick(g.id)}
            aria-pressed={value === g.id}
            className={cx('overflow-hidden rounded-2xl border text-left', value === g.id ? 'border-accent ring-2 ring-accent' : 'border-line')}
          >
            <div className="relative aspect-[16/10] bg-raise">
              <GoalArt goal={g.id} />
              {value === g.id && (
                <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-accent text-accent-ink">
                  <Check size={15} />
                </span>
              )}
            </div>
            <div className="bg-surface px-2.5 py-2">
              <div className="text-sm font-semibold">{g.name}</div>
              <div className="text-xs leading-snug text-dim">{g.tagline}</div>
            </div>
          </button>
        ))}
      </div>
      {value === 'other' && (
        <Field label="Your goal">
          <input className={inputClass} value={customGoal} onChange={(e) => onCustom(e.target.value)} placeholder="e.g. Kids' football match, overcast" />
        </Field>
      )}
    </div>
  );
}

/** Searchable film picker: manufacturer → stock → format. */
export function FilmPicker({
  stocks,
  manufacturers,
  camera,
  value,
  onPick,
}: {
  stocks: FilmStock[];
  manufacturers: string[];
  camera: CameraProfile | null;
  value: FilmStock | null;
  onPick: (s: FilmStock) => void;
}) {
  const [q, setQ] = useState('');
  const [maker, setMaker] = useState<string | undefined>();
  const [cat, setCat] = useState<FilmCategory | undefined>();
  const [onlyFits, setOnlyFits] = useState(true);
  const fmt: FilmFormat | undefined = camera && camera.format !== 'Digital' && camera.format !== 'Other' ? camera.format : undefined;
  const results = useMemo(
    () => searchFilms(stocks, q, { manufacturer: maker, category: cat, format: onlyFits ? fmt : undefined }),
    [stocks, q, maker, cat, onlyFits, fmt],
  );
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3.5 text-dim" aria-hidden />
        <input className={cx(inputClass, 'pl-9')} placeholder="Search film, speed, process…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search films" />
      </div>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        <Chip on={!maker} onClick={() => setMaker(undefined)}>
          All makers
        </Chip>
        {manufacturers.map((m) => (
          <Chip key={m} on={maker === m} onClick={() => setMaker(maker === m ? undefined : m)}>
            {m}
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {(Object.keys(CATEGORY_LABEL) as FilmCategory[]).map((c) => (
          <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? undefined : c)}>
            {CATEGORY_LABEL[c]}
          </Chip>
        ))}
      </div>
      {fmt && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyFits} onChange={(e) => setOnlyFits(e.target.checked)} className="accent-[var(--color-accent)]" />
          Only films made in {FORMAT_LABEL[fmt]} for the {camera?.name}
        </label>
      )}
      {maker && !results.length && <p className="text-sm text-dim">No verified {maker} stocks in the catalog yet. Add a custom stock or import a catalog update.</p>}
      <div className="grid grid-cols-3 gap-2">
        {results.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            aria-pressed={value?.id === s.id}
            className={cx('overflow-hidden rounded-xl border text-left', value?.id === s.id ? 'border-accent ring-2 ring-accent' : 'border-line')}
          >
            <div className="aspect-square">
              <FilmArt stock={s} format={fmt && s.formats.includes(fmt) ? fmt : undefined} />
            </div>
            <div className="bg-surface px-2 py-1.5">
              <div className="truncate text-xs text-dim">{s.manufacturer}</div>
              <div className="truncate text-sm font-semibold leading-tight">{s.name}</div>
              <div className="text-xs text-muted">{boxSpeedLabel(s)}</div>
              {s.status !== 'available' && <div className="text-[10px] text-caution">{STATUS_LABEL[s.status]}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Format chooser limited to formats the stock is actually made in. */
export function FormatPicker({ stock, camera, value, onPick }: { stock: FilmStock; camera: CameraProfile | null; value: FilmFormat; onPick: (f: FilmFormat) => void }) {
  return (
    <div>
      <Label>Format</Label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {stock.formats.map((f) => (
          <Chip key={f} on={value === f} onClick={() => onPick(f)}>
            {FORMAT_LABEL[f]}
            {camera?.format === f ? ' ✓' : ''}
          </Chip>
        ))}
      </div>
      {camera && camera.format !== 'Digital' && !stock.formats.includes(camera.format) && (
        <p className="mt-2 text-sm text-caution">
          {stock.name} is not listed in {FORMAT_LABEL[camera.format]}, the format of the {camera.name}.
        </p>
      )}
    </div>
  );
}

/** Rate My Film: box speed vs working EI. */
export function EIPicker({
  stock,
  camera,
  ei,
  pushPull,
  onChange,
}: {
  stock: FilmStock;
  camera: CameraProfile | null;
  ei: number;
  pushPull: number;
  onChange: (ei: number, pushPull: number) => void;
}) {
  const options = eiOptions(stock, camera ?? undefined);
  const [custom, setCustom] = useState('');
  const customErr = custom ? validateCustomEI(Number(custom), camera ?? undefined) : null;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-muted">Box speed</span>
        <span className="font-display text-xl font-semibold">{boxSpeedLabel(stock)}</span>
      </div>
      {stock.boxSpeed == null && <p className="text-xs text-dim">{stock.notes}</p>}
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.ei}
            type="button"
            onClick={() => onChange(o.ei, pushPull)}
            aria-pressed={ei === o.ei}
            className={cx('rounded-xl border px-3 py-2 text-left', ei === o.ei ? 'border-accent bg-accent/10' : 'border-line bg-raise')}
          >
            <div className="font-display text-lg font-semibold tnum">EI {fmtISO(o.ei)}</div>
            <div className={cx('text-xs', o.isBox ? 'text-ok' : 'text-muted')}>{eiOptionLabel(o)}</div>
          </button>
        ))}
      </div>
      <Field label="Custom EI" hint={customErr ?? undefined}>
        <div className="flex gap-2">
          <input className={inputClass} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 640" />
          <button type="button" className="rounded-xl border border-line bg-raise px-4 font-semibold disabled:opacity-40" disabled={!custom || !!customErr} onClick={() => onChange(Number(custom), pushPull)}>
            Use
          </button>
        </div>
      </Field>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div>Intended processing</div>
          <div className="text-xs text-dim">{processingLabel(pushPull)} — recorded only; rating the film does not change its sensitivity.</div>
        </div>
        <Stepper value={pushPull} onChange={(v) => onChange(ei, v)} step={1 / 3} min={-3} max={3} format={(v) => (Math.abs(v) < 0.05 ? 'N' : fmtStops(v))} />
      </div>
    </div>
  );
}
