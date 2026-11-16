import { useState } from 'react';
import { Camera, Plus } from 'lucide-react';
import {
  CAMERA_MODE_LABEL,
  FORMAT_LABEL,
  ap,
  apLabel,
  apertureScale,
  fmtTime,
  shutterScale,
  sp,
  speedLabel,
  validateCamera,
  type CameraExposureMode,
  type CameraProfile,
  type FilmFormat,
} from '../engine';
import { Button, Chip, Field, Label, Toggle, cx, inputClass } from './ui';

const ALL_APERTURES = (() => {
  const seen = new Map<number, ReturnType<typeof ap>>();
  for (const a of [...apertureScale(3, 1, 45), ...apertureScale(2, 1, 45)]) if (![...seen.values()].some((x) => Math.abs(x.exact - a.exact) < 1e-6)) seen.set(a.exact, a);
  return [...seen.values()].sort((a, b) => a.exact - b.exact);
})();
const ALL_SPEEDS = (() => {
  const list = [...shutterScale(3, 1 / 8000, 30), ...shutterScale(2, 1 / 8000, 30)];
  const out: ReturnType<typeof sp>[] = [];
  for (const s of list) if (!out.some((x) => Math.abs(x.exact - s.exact) < 1e-9)) out.push(s);
  return out.sort((a, b) => a.exact - b.exact);
})();

async function resizeToDataURL(file: File, max = 640): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Edit every setting the exposure engine relies on. Only values selected here are ever recommended. */
export function CameraEditor({ initial, onSave, onCancel }: { initial: CameraProfile; onSave: (c: CameraProfile) => void; onCancel: () => void }) {
  const [c, setC] = useState<CameraProfile>(() => structuredClone(initial));
  const [customAp, setCustomAp] = useState('');
  const [customSp, setCustomSp] = useState('');
  const issues = validateCamera(c);
  const set = (patch: Partial<CameraProfile>) => setC((x) => ({ ...x, ...patch }));
  const setLens = (patch: Partial<CameraProfile['lens']>) => setC((x) => ({ ...x, lens: { ...x.lens, ...patch } }));

  const hasAp = (e: number) => c.lens.apertures.some((a) => Math.abs(a.exact - e) < 1e-6);
  const toggleAp = (a: ReturnType<typeof ap>) =>
    setLens({ apertures: hasAp(a.exact) ? c.lens.apertures.filter((x) => Math.abs(x.exact - a.exact) > 1e-6) : [...c.lens.apertures, a].sort((x, y) => x.exact - y.exact) });
  const hasSp = (e: number) => c.speeds.some((s) => Math.abs(s.exact - e) < 1e-9);
  const toggleSp = (s: ReturnType<typeof sp>) =>
    set({ speeds: hasSp(s.exact) ? c.speeds.filter((x) => Math.abs(x.exact - s.exact) > 1e-9) : [...c.speeds, s].sort((x, y) => x.exact - y.exact) });

  // Custom values the standard lists don't contain (e.g. f/1.7 already there; 1/300 leaf shutter).
  const extraAps = c.lens.apertures.filter((a) => !ALL_APERTURES.some((x) => Math.abs(x.exact - a.exact) < 1e-6));
  const extraSps = c.speeds.filter((s) => !ALL_SPEEDS.some((x) => Math.abs(x.exact - s.exact) < 1e-9));

  const parseSpeed = (t: string): number | null => {
    const m = t.trim().match(/^1\/(\d+(?:\.\d+)?)$/);
    if (m) return 1 / Number(m[1]);
    const n = Number(t.replace(/s$/, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  return (
    <div className="space-y-5">
      <section>
        <Field label="Camera name">
          <input className={inputClass} value={c.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Format">
            <select className={inputClass} value={c.format} onChange={(e) => set({ format: e.target.value as FilmFormat })}>
              {(Object.keys(FORMAT_LABEL) as FilmFormat[]).map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Image area">
            <input className={inputClass} value={c.negativeSize} onChange={(e) => set({ negativeSize: e.target.value })} />
          </Field>
          <Field label="Image diagonal (mm)" hint="35mm = 43.3 · 6×6 = 79.2 · 6×4.5 = 70 · 6×7 = 89">
            <input className={inputClass} inputMode="decimal" value={c.diagonalMM} onChange={(e) => set({ diagonalMM: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Mount">
            <input className={inputClass} value={c.mount} onChange={(e) => set({ mount: e.target.value })} />
          </Field>
        </div>
        <label className="mt-2 flex items-center gap-3 text-sm text-muted">
          <span className="flex size-14 items-center justify-center overflow-hidden rounded-xl border border-line bg-raise">
            {c.photo ? <img src={c.photo} alt="" className="h-full w-full object-cover" /> : <Camera size={20} />}
          </span>
          <span className="mr-auto">Photo of your camera (optional)</span>
          <input
            type="file"
            accept="image/*"
            className="max-w-40 text-xs"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) set({ photo: await resizeToDataURL(f) });
            }}
          />
          {c.photo && (
            <button type="button" className="text-critical" onClick={() => set({ photo: undefined })}>
              Remove
            </button>
          )}
        </label>
      </section>

      <section>
        <Label>Exposure modes</Label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(CAMERA_MODE_LABEL) as CameraExposureMode[]).map((m) => (
            <Chip key={m} on={c.modes.includes(m)} onClick={() => set({ modes: c.modes.includes(m) ? c.modes.filter((x) => x !== m) : [...c.modes, m] })}>
              {CAMERA_MODE_LABEL[m]}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <Label>Lens</Label>
        <Field label="Lens name">
          <input className={inputClass} value={c.lens.name} onChange={(e) => setLens({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Focal length (mm)">
            <input className={inputClass} inputMode="decimal" value={c.lens.focalLength ?? ''} onChange={(e) => setLens({ focalLength: Number(e.target.value) || undefined })} />
          </Field>
          <div className="pt-6">
            <Toggle checked={c.lens.focalConfirmed} onChange={(v) => setLens({ focalConfirmed: v })} label="Confirmed" />
          </div>
        </div>
        <Toggle checked={c.lens.fixed} onChange={(v) => setLens({ fixed: v })} label="Fixed lens" />
        <div className="mt-2 text-sm text-muted">Apertures you can select on this lens ({c.lens.apertures.length})</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...ALL_APERTURES, ...extraAps]
            .sort((a, b) => a.exact - b.exact)
            .map((a) => (
              <button
                key={a.exact}
                type="button"
                onClick={() => toggleAp(a)}
                className={cx('min-h-8 rounded-lg border px-2 text-xs font-semibold tnum', hasAp(a.exact) ? 'border-accent bg-accent text-accent-ink' : 'border-line text-dim')}
              >
                {apLabel(a).slice(2)}
              </button>
            ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input className={inputClass} inputMode="decimal" placeholder="Other f-number, e.g. 4.5" value={customAp} onChange={(e) => setCustomAp(e.target.value)} />
          <Button
            onClick={() => {
              const n = Number(customAp);
              if (n > 0.5 && n < 128 && !hasAp(ap(n).exact)) toggleAp(ap(n));
              setCustomAp('');
            }}
          >
            <Plus size={16} />
          </Button>
        </div>
      </section>

      <section>
        <Label>Shutter</Label>
        <div className="mt-2 text-sm text-muted">Marked speeds you can select ({c.speeds.length})</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...ALL_SPEEDS, ...extraSps]
            .sort((a, b) => a.exact - b.exact)
            .map((s) => (
              <button
                key={s.exact}
                type="button"
                onClick={() => toggleSp(s)}
                className={cx('min-h-8 rounded-lg border px-2 text-xs font-semibold tnum', hasSp(s.exact) ? 'border-accent bg-accent text-accent-ink' : 'border-line text-dim')}
              >
                {speedLabel(s)}
              </button>
            ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input className={inputClass} placeholder="Other speed, e.g. 1/300 or 2" value={customSp} onChange={(e) => setCustomSp(e.target.value)} />
          <Button
            onClick={() => {
              const v = parseSpeed(customSp);
              if (v && !hasSp(sp(v).exact)) toggleSp(sp(v));
              setCustomSp('');
            }}
          >
            <Plus size={16} />
          </Button>
        </div>
        <Toggle checked={c.bulb} onChange={(v) => set({ bulb: v })} label="Bulb (B)" />
        <Field label="Flash sync (seconds, optional)" hint={c.flashSync ? fmtTime(c.flashSync) : undefined}>
          <input className={inputClass} placeholder="1/60" defaultValue={c.flashSync ? fmtTime(c.flashSync) : ''} onBlur={(e) => set({ flashSync: parseSpeed(e.target.value) ?? undefined })} />
        </Field>
      </section>

      <section>
        <Label>ISO / film speed range</Label>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Minimum">
            <input className={inputClass} inputMode="numeric" value={c.isoMin} onChange={(e) => set({ isoMin: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Maximum">
            <input className={inputClass} inputMode="numeric" value={c.isoMax} onChange={(e) => set({ isoMax: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <Toggle checked={c.builtInMeter} onChange={(v) => set({ builtInMeter: v })} label="Camera has a built-in meter" />
        <Toggle checked={c.isoPerShot} onChange={(v) => set({ isoPerShot: v })} label="ISO can change every shot" hint="Digital cameras. Lets the meter choose ISO." />
      </section>

      {issues.length > 0 && <div className="rounded-xl border border-critical/40 bg-critical/10 p-3 text-sm text-critical">{issues.join(' ')}</div>}
      <div className="flex gap-2">
        <Button kind="ghost" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button kind="primary" disabled={issues.length > 0} onClick={() => onSave(c)} className="flex-1">
          Save camera
        </Button>
      </div>
    </div>
  );
}
