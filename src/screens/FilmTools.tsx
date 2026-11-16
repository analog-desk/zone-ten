import { useMemo, useState, type PointerEvent } from 'react';
import { ArrowLeft, ChevronRight, Clock, Film, Hourglass, Layers, Moon, Ruler, Sigma, Timer } from 'lucide-react';
import {
  ND_FILTERS,
  ZONE_DESCRIPTIONS,
  ZONE_NUMERALS,
  analyseContrast,
  apLabel,
  bellowsStops,
  correctReciprocity,
  displayName,
  equivalents,
  exposureForPlacement,
  fmtStops,
  fmtTime,
  locksFor,
  magnificationFromExtension,
  maxStarPointSeconds,
  optionLabel,
  planLongExposure,
  reciprocityText,
  searchFilms,
  shutterScale,
  solve,
  spotStats,
  zoneHistogram,
  zoneOf,
  zoneNumeral,
  type FilmStock,
  type NPoint,
} from '../engine';
import { BulbTimer } from '../components/BulbTimer';
import { RollManager } from '../components/RollSheet';
import { Button, Card, Field, Label, Notice, Row, Segmented, Stepper, cx, inputClass } from '../components/ui';
import { useShooting } from '../state/hooks';
import { areaEV, useCurrentFrame } from '../state/measurement';

type Tool = 'rate' | 'reciprocity' | 'long' | 'timer' | 'zone' | 'astro' | 'bellows' | 'equiv';

const TOOLS: { id: Tool; name: string; desc: string; icon: typeof Film }[] = [
  { id: 'rate', name: 'Rate My Film', desc: 'Working EI vs box speed, push/pull intent', icon: Film },
  { id: 'reciprocity', name: 'Reciprocity', desc: 'Film-specific long-exposure correction', icon: Hourglass },
  { id: 'long', name: 'Long exposure & ND', desc: 'Calculated vs adjusted time, Bulb', icon: Clock },
  { id: 'timer', name: 'Bulb timer', desc: 'Countdown with tones', icon: Timer },
  { id: 'zone', name: 'Zone System', desc: 'Place tones, check contrast, histogram', icon: Layers },
  { id: 'astro', name: 'Star points', desc: '500-rule limit for your lens and format', icon: Moon },
  { id: 'bellows', name: 'Close-up light loss', desc: 'Extension and bellows factor', icon: Ruler },
  { id: 'equiv', name: 'Equivalent exposures', desc: 'Every setting your camera can make for an EV', icon: Sigma },
];

export function FilmTools() {
  const [tool, setTool] = useState<Tool | null>(null);
  const t = TOOLS.find((x) => x.id === tool);
  return (
    <div className="space-y-3 px-3 pb-6 pt-2">
      {t ? (
        <>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTool(null)} className="flex size-10 items-center justify-center rounded-full bg-raise" aria-label="Back to tools">
              <ArrowLeft size={18} />
            </button>
            <h1 className="font-display text-2xl font-semibold">{t.name}</h1>
          </div>
          {tool === 'rate' && <RateTool />}
          {tool === 'reciprocity' && <ReciprocityTool />}
          {tool === 'long' && <LongExposureTool />}
          {tool === 'timer' && (
            <Card>
              <BulbTimer initialSeconds={30} />
            </Card>
          )}
          {tool === 'zone' && <ZoneTool />}
          {tool === 'astro' && <AstroTool />}
          {tool === 'bellows' && <BellowsTool />}
          {tool === 'equiv' && <EquivTool />}
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold">Film tools</h1>
          {TOOLS.map((x) => (
            <button key={x.id} type="button" onClick={() => setTool(x.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left">
              <x.icon size={22} className="text-accent" />
              <span className="mr-auto">
                <span className="block font-semibold">{x.name}</span>
                <span className="block text-sm text-muted">{x.desc}</span>
              </span>
              <ChevronRight size={18} className="text-dim" />
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function RateTool() {
  const { camera } = useShooting();
  if (!camera) return <Notice>Add a camera first.</Notice>;
  return <RollManager camera={camera} onClose={() => undefined} />;
}

function FilmSelect({ value, onChange }: { value: FilmStock | null; onChange: (s: FilmStock | null) => void }) {
  const { stocks } = useShooting();
  const sorted = useMemo(() => searchFilms(stocks, ''), [stocks]);
  return (
    <Field label="Film">
      <select className={inputClass} value={value?.id ?? ''} onChange={(e) => onChange(stocks.find((s) => s.id === e.target.value) ?? null)}>
        <option value="">No film (no reciprocity)</option>
        {sorted.map((s) => (
          <option key={s.id} value={s.id}>
            {displayName(s)}
          </option>
        ))}
      </select>
    </Field>
  );
}

const BULB_TIMES = [1, 2, 4, 8, 15, 30, 45, 60, 90, 120, 180, 240, 300, 480, 600, 900, 1200, 1800, 3600];

function TimeSelect({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const { camera } = useShooting();
  // The active camera's marked speeds, then Bulb times beyond its slowest speed.
  const marked = camera ? [...camera.speeds].sort((a, b) => a.exact - b.exact) : shutterScale(1, 1 / 1000, 1);
  const slowest = marked.at(-1)?.exact ?? 0;
  const choices = [
    ...marked.map((s) => ({ v: s.exact, label: fmtTime(s.nominal) })),
    ...(!camera || camera.bulb ? BULB_TIMES.filter((t) => t > slowest * 1.05).map((t) => ({ v: t, label: `B ${fmtTime(t)}` })) : []),
  ];
  const current = choices.reduce((best, c) => (Math.abs(Math.log2(c.v / value)) < Math.abs(Math.log2(best.v / value)) ? c : best), choices[0]!);
  return (
    <Field label={label}>
      <select className={inputClass} value={current.v} onChange={(e) => onChange(Number(e.target.value))}>
        {choices.map((c) => (
          <option key={c.v} value={c.v}>
            {c.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ReciprocityTool() {
  const { film: loaded } = useShooting();
  const [film, setFilm] = useState<FilmStock | null>(loaded);
  const [t, setT] = useState(16);
  const r = film ? correctReciprocity(t, film.reciprocity) : null;
  const table = [1, 2, 4, 8, 15, 30, 60, 120, 240];
  return (
    <div className="space-y-3">
      <FilmSelect value={film} onChange={setFilm} />
      <TimeSelect label="Metered time" value={t} onChange={setT} />
      {r && (
        <Card>
          <Row label="Calculated (metered)" value={fmtTime(r.metered)} />
          <Row label="Reciprocity-adjusted" value={fmtTime(r.corrected)} tone={r.basis === 'published' || r.basis === 'noCorrectionNeeded' ? 'ok' : 'warn'} />
          <Row label="Added exposure" value={`${fmtStops(r.addedStops)} stops`} />
          <p className="mt-2 text-sm text-muted">{reciprocityText(r)}</p>
          {r.source && <p className="mt-1 text-xs text-dim">Source: {r.source}</p>}
        </Card>
      )}
      {film && (
        <Card>
          <Label>{film.name} at a glance</Label>
          {table.map((m) => {
            const x = correctReciprocity(m, film.reciprocity);
            return <Row key={m} label={fmtTime(m)} value={x.basis === 'unpublished' ? 'no data' : `${fmtTime(x.corrected)}${x.basis === 'extrapolated' ? ' (extrap.)' : ''}`} />;
          })}
          <p className="mt-2 text-xs text-dim">Edit a custom copy of this film in the library to enter your own curve.</p>
        </Card>
      )}
    </div>
  );
}

function LongExposureTool() {
  const { film: loaded, camera } = useShooting();
  const [film, setFilm] = useState<FilmStock | null>(loaded);
  const [base, setBase] = useState(1 / 8);
  const [nd, setNd] = useState(ND_FILTERS[8]!.stops);
  const [timer, setTimer] = useState(false);
  const plan = planLongExposure(base, nd, film, camera);
  return (
    <div className="space-y-3">
      <TimeSelect label="Metered time without filter" value={base} onChange={setBase} />
      <Field label="ND filter">
        <select className={inputClass} value={nd} onChange={(e) => setNd(Number(e.target.value))}>
          <option value={0}>None</option>
          {ND_FILTERS.map((f) => (
            <option key={f.name} value={f.stops}>
              {f.name} — {f.stops.toFixed(f.stops % 1 ? 1 : 0)} stops
            </option>
          ))}
        </select>
      </Field>
      <FilmSelect value={film} onChange={setFilm} />
      <Card>
        <Row label="Calculated time" value={fmtTime(plan.calculated)} />
        <Row label="Reciprocity-adjusted" value={fmtTime(plan.adjusted)} tone={plan.reciprocity?.basis === 'unpublished' || plan.reciprocity?.basis === 'extrapolated' ? 'warn' : 'ok'} />
        {plan.reciprocity && <p className="mt-1 text-sm text-muted">{reciprocityText(plan.reciprocity)}</p>}
        <div className="mt-2 rounded-xl bg-raise p-2 text-sm">
          {plan.requiresBulb ? (
            <>Set the {camera?.name ?? 'camera'} to B and expose for {fmtTime(plan.adjusted)}.</>
          ) : plan.marked ? (
            <>
              Use the marked {fmtTime(plan.marked.nominal)} ({plan.markedError !== undefined && Math.abs(plan.markedError) >= 0.05 ? `${fmtStops(plan.markedError)} stop` : 'exact'}).
            </>
          ) : (
            <>No marked speed fits; use B.</>
          )}
        </div>
        {plan.adjusted >= 1 && (
          <Button kind="primary" className="mt-3 w-full" onClick={() => setTimer(true)}>
            <Timer size={16} /> Time {fmtTime(plan.adjusted)}
          </Button>
        )}
      </Card>
      {timer && (
        <Card>
          <BulbTimer key={plan.adjusted} initialSeconds={plan.adjusted} />
        </Card>
      )}
    </div>
  );
}

interface Area {
  p: NPoint;
  ev: number;
  label: string;
}

function ZoneTool() {
  const frame = useCurrentFrame();
  const { camera, film, workingEI } = useShooting();
  const [areas, setAreas] = useState<Area[]>([]);
  const [placed, setPlaced] = useState(0);
  const [zone, setZone] = useState(3);
  const [manual, setManual] = useState('');
  if (!frame)
    return (
      <div className="space-y-3">
        <Notice>Spot meter the important areas with your light meter app (shadows, mid-tones, highlights), enter each reading here as EV₁₀₀, then place one on a zone.</Notice>
        <Card>
          <Field label="Spot reading (EV₁₀₀)" hint="EV₁₀₀ = log₂(f²/t) − log₂(ISO/100); the Shoot tab shows it for any reading">
            <div className="flex gap-2">
              <input className={inputClass} inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} />
              <Button
                onClick={() => {
                  const v = parseFloat(manual);
                  if (Number.isFinite(v)) setAreas((a) => [...a, { p: { x: 0, y: 0 }, ev: v, label: `Entry ${a.length + 1}` }]);
                  setManual('');
                }}
              >
                Add
              </Button>
            </div>
          </Field>
        </Card>
        {areas.length > 0 && <Placement areas={areas} placed={placed} setPlaced={setPlaced} zone={zone} setZone={setZone} />}
      </div>
    );
  const exposureEV = areas[placed] ? exposureForPlacement(areas[placed]!.ev, zone) : frame.frameEV;
  const hist = zoneHistogram(frame.grid, frame.frameEV, exposureEV);
  const onTap = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    const ev = areaEV(frame.frameEV, spotStats(frame.grid, p, 0.05).mean);
    setAreas((a) => [...a.slice(-7), { p, ev, label: `Area ${a.length + 1}` }]);
  };
  const sol =
    camera && areas[placed]
      ? solve(
          { camera, film },
          { ev100: exposureEV, compensation: 0, filterStops: 0, bellowsStops: 0, workingEI },
          locksFor('isoPriority'),
          { iso: workingEI, aperture: camera.lens.apertures[0]!, shutter: { kind: 'bulb', seconds: 1 } },
        )
      : null;
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-line" style={{ aspectRatio: String(frame.aspect) }} onPointerUp={onTap} role="button" aria-label="Tap to add a metered area">
        {frame.imageURL && <img src={frame.imageURL} alt="Metered scene" className="absolute inset-0 h-full w-full object-fill" />}
        {areas.map((a, i) => (
          <div
            key={i}
            className={cx('absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-1.5 text-xs font-bold', i === placed ? 'border-accent bg-accent text-accent-ink' : 'border-white bg-black/70')}
            style={{ left: `${a.p.x * 100}%`, top: `${a.p.y * 100}%` }}
          >
            {zoneNumeral(zoneOf(a.ev, exposureEV))}
          </div>
        ))}
      </div>
      <p className="text-xs text-dim">Tap areas of the photo to spot meter them (up to 8). Zones update as you place one.</p>
      {areas.length > 0 && <Placement areas={areas} placed={placed} setPlaced={setPlaced} zone={zone} setZone={setZone} />}
      <Card>
        <Label>Tonal distribution</Label>
        <div className="mt-2 flex h-24 items-end gap-1">
          {hist.map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t" style={{ height: `${Math.max(2, h * 100)}%`, background: `hsl(0 0% ${10 + i * 8.5}%)`, outline: '1px solid var(--color-line)' }} />
              <span className="text-[10px] text-dim">{ZONE_NUMERALS[i]}</span>
            </div>
          ))}
        </div>
      </Card>
      {sol && (
        <Card>
          <Label>Exposure for this placement</Label>
          <div className="mt-1 font-display text-2xl font-semibold tnum">{optionLabel(sol.camera)}</div>
          <p className="text-sm text-muted">
            EV₁₀₀ {exposureEV.toFixed(1)} at EI {workingEI} on the {camera!.name} · {sol.explanation[0]}
          </p>
        </Card>
      )}
    </div>
  );
}

function Placement({ areas, placed, setPlaced, zone, setZone }: { areas: Area[]; placed: number; setPlaced: (i: number) => void; zone: number; setZone: (z: number) => void }) {
  const exposureEV = exposureForPlacement(areas[placed]!.ev, zone);
  const evs = areas.map((a) => a.ev);
  const analysis = areas.length >= 2 ? analyseContrast(Math.min(...evs), Math.max(...evs)) : null;
  return (
    <Card>
      <Label>Place an area on a zone</Label>
      <div className="mt-2 space-y-1">
        {areas.map((a, i) => (
          <button key={i} type="button" onClick={() => setPlaced(i)} className={cx('flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm', i === placed ? 'bg-accent/15' : '')}>
            <span>{a.label}</span>
            <span className="tnum">
              EV {a.ev.toFixed(1)} → Zone {zoneNumeral(zoneOf(a.ev, exposureEV))}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-muted">Place {areas[placed]!.label} on</span>
        <Stepper value={zone} onChange={setZone} step={1} min={0} max={10} format={(z) => `Zone ${ZONE_NUMERALS[z]}`} />
      </div>
      <p className="mt-1 text-xs text-dim">{ZONE_DESCRIPTIONS[zone]}</p>
      <Row label="Exposure adjustment vs metering that area" value={`${fmtStops(zone - 5)} stops`} />
      {analysis && (
        <>
          <Row label="Subject brightness range" value={`${analysis.range.toFixed(1)} stops`} />
          <Row label="Development (shadow on III)" value={analysis.development} />
          <p className="text-xs text-dim">{analysis.advice}</p>
        </>
      )}
    </Card>
  );
}

function AstroTool() {
  const { camera, doc } = useShooting();
  const [rule, setRule] = useState(doc.prefs.astroRule);
  const [focal, setFocal] = useState(camera?.lens.focalLength ?? 50);
  const limit = camera ? maxStarPointSeconds(focal, camera.diagonalMM, rule) : undefined;
  return (
    <div className="space-y-3">
      <Segmented label="Rule" value={rule} onChange={setRule} options={[500, 400, 300].map((v) => ({ value: v, label: `${v} rule` }))} />
      <Field label="Focal length (mm)">
        <input className={inputClass} inputMode="decimal" value={focal} onChange={(e) => setFocal(Number(e.target.value) || 0)} />
      </Field>
      {camera && limit && (
        <Card>
          <Row label="Format" value={`${camera.negativeSize} (crop ×${(43.27 / camera.diagonalMM).toFixed(2)})`} />
          <Row label="Longest exposure for star points" value={fmtTime(limit)} tone="ok" />
          <p className="mt-2 text-sm text-muted">
            Lower rules (400, 300) are stricter, for big enlargements. For star trails go far beyond this on Bulb — the reciprocity tool gives the adjusted time for your film.
          </p>
        </Card>
      )}
    </div>
  );
}

function BellowsTool() {
  const { camera } = useShooting();
  const [ext, setExt] = useState(25);
  const [focal, setFocal] = useState(camera?.lens.focalLength ?? 50);
  const [pupil, setPupil] = useState(1);
  const m = magnificationFromExtension(ext, focal);
  const stops = bellowsStops(m, pupil);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Added extension (mm)">
          <input className={inputClass} inputMode="decimal" value={ext} onChange={(e) => setExt(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Focal length (mm)">
          <input className={inputClass} inputMode="decimal" value={focal} onChange={(e) => setFocal(Number(e.target.value) || 0)} />
        </Field>
      </div>
      <Field label="Pupil magnification" hint="1 for symmetric lenses; leave at 1 if unknown">
        <input className={inputClass} inputMode="decimal" value={pupil} onChange={(e) => setPupil(Number(e.target.value) || 1)} />
      </Field>
      <Card>
        <Row label="Magnification" value={`${m.toFixed(2)}×`} />
        <Row label="Exposure factor" value={`×${(2 ** stops).toFixed(2)}`} />
        <Row label="Extra exposure" value={`${fmtStops(stops)} stops`} tone="warn" />
        <p className="mt-2 text-xs text-dim">Enter this on the meter under Filters & close-up. Through-the-lens camera meters already include it.</p>
      </Card>
    </div>
  );
}

function EquivTool() {
  const { camera, workingEI } = useShooting();
  const [ev, setEV] = useState(12);
  if (!camera) return <Notice>Add a camera first.</Notice>;
  const list = equivalents(camera, { ev100: ev, compensation: 0, filterStops: 0, bellowsStops: 0, workingEI }, workingEI);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted">EV₁₀₀</span>
        <Stepper value={ev} onChange={setEV} step={1 / 3} min={-6} max={20} format={(v) => v.toFixed(1)} />
      </div>
      <Card>
        <Label>
          {camera.name} at EI {workingEI}
        </Label>
        {list.map((o) => (
          <Row key={o.aperture.exact} label={apLabel(o.aperture)} value={`${o.shutter.kind === 'bulb' ? `B ${fmtTime(o.shutter.seconds)}` : fmtTime(o.shutter.speed.nominal)}${Math.abs(o.error) >= 0.17 ? ` (${fmtStops(o.error)})` : ''}`} />
        ))}
        {!list.length && <p className="text-sm text-muted">No combination on this camera within ⅓ stop.</p>}
      </Card>
    </div>
  );
}
