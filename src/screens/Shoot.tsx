import { useMemo, useState } from 'react';
import { ArrowLeft, Camera, Check, ChevronDown, Film, Save, Target, Timer } from 'lucide-react';
import {
  GOALS,
  apLabel,
  boxSpeedLabel,
  correctReciprocity,
  creative,
  describeStops,
  displayName,
  equivalents,
  ev100Of,
  exactISO,
  fmtISO,
  fmtStops,
  fmtTime,
  goalName,
  handheldLimit,
  isoScale,
  lensSummary,
  locksFor,
  nearest,
  optionLabel,
  reciprocityText,
  shutterLabel,
  sortedApertures,
  sortedSpeeds,
  shutterSeconds,
  solve,
  timed,
  type Aperture,
  type CameraProfile,
  type ExposureInputs,
  type ShutterSpeed,
  type ExposureOption,
  type Goal,
} from '../engine';
import { BulbPlanner } from '../components/BulbPlanner';
import { BulbTimer } from '../components/BulbTimer';
import { GoalGrid } from '../components/pickers';
import { RollManager } from '../components/RollSheet';
import { Button, Card, ErrorBadge, Label, Notice, Row, Sheet, Stepper, cx, vibrate } from '../components/ui';
import { saveReading, setActiveCamera, setGoal } from '../state/actions';
import { useShooting } from '../state/hooks';
import { update } from '../state/store';

/** Shutter wheel value meaning B: the meter can't time it, the Bulb planner does. */
const BULB = -1;

/** Only what this camera can set: its lens apertures, its marked speeds (+ Bulb times if it has B), its ISO range. */
function cameraScales(camera: CameraProfile | null, ei: number) {
  if (!camera) return { aps: [] as Aperture[], speeds: [] as { s: ShutterSpeed; bulb: boolean }[], isos: [] as number[] };
  const aps = sortedApertures(camera);
  const speeds = sortedSpeeds(camera).map((x) => ({ s: x, bulb: false }));
  // ISO: what the camera accepts, and within 3 stops of the loaded film's EI (the meter app should be set to it).
  // Film: within 3 stops of the loaded film's EI. Digital: the camera's whole standard ISO range.
  const isos = camera.isoPerShot ? isoScale(3, camera.isoMin, camera.isoMax) : isoScale(3, Math.max(camera.isoMin, ei / 8), Math.min(camera.isoMax, ei * 8));
  return { aps, speeds, isos: isos.length ? isos : isoScale(3, camera.isoMin, camera.isoMax) };
}

type Stage = 'goal' | 'reading' | 'result' | 'bulb';

export function Shoot({ goTo }: { goTo: (tab: 'profiles' | 'sessions') => void }) {
  const { doc, camera, roll, film, workingEI } = useShooting();
  const prefs = doc.prefs;
  const [stage, setStage] = useState<Stage>('goal');
  const [sheet, setSheet] = useState<null | 'camera' | 'roll' | 'bulb' | 'tips'>(null);
  const [picked, setPicked] = useState<ExposureOption | null>(null);
  const [tune, setTune] = useState(false);
  const [saved, setSaved] = useState(false);
  const r = prefs.lastMeter ?? { iso: workingEI, seconds: 1 / 125, aperture: 8 };
  const [iso, setIso] = useState(r.iso);
  const [seconds, setSeconds] = useState(r.seconds);
  const [aperture, setAperture] = useState(r.aperture);
  const [comp, setComp] = useState(0);

  const goal: Goal | null = doc.goal;
  const goalLabel = goal === 'other' && doc.customGoal ? doc.customGoal : goalName(goal);

  const scales = useMemo(() => cameraScales(camera, workingEI), [camera, workingEI]);
  // Snap remembered values to this camera's settings.
  const apSel = scales.aps.find((a) => a.nominal === aperture) ?? nearest(scales.aps, aperture, (a) => a.nominal);
  const isBulb = seconds === BULB && !!camera?.bulb;
  const spSel = isBulb ? undefined : (scales.speeds.find((x) => x.s.nominal === seconds) ?? nearest(scales.speeds, Math.max(seconds, 1e-4), (x) => x.s.nominal));
  const isoSel = scales.isos.includes(iso) ? iso : (nearest(scales.isos, iso, (v) => v) ?? iso);

  const result = useMemo(() => {
    if (!camera || !apSel || !spSel) return null;
    const ap = apSel;
    const t = spSel.s.exact;
    const iso = isoSel;
    const ev100 = ev100Of(ap.exact, t, exactISO(iso));
    const inputs: ExposureInputs = { ev100, compensation: comp, filterStops: 0, bellowsStops: 0, workingEI: camera.isoPerShot ? iso : workingEI };
    const cre = creative(goal, camera, camera.isoPerShot ? null : film, inputs, prefs.increment, prefs.astroRule);
    // "Straight from your meter": the meter's aperture (nearest your lens has), shutter worked out for your film's EI
    // (digital: at the meter's ISO).
    const camAp = nearest(camera.lens.apertures, ap.exact, (a) => a.exact) ?? camera.lens.apertures[0]!;
    const firstSpeed = camera.speeds[0];
    const straight = solve({ camera, increment: prefs.increment, film }, inputs, locksFor('aperturePriority'), {
      iso: camera.isoPerShot ? iso : workingEI,
      aperture: camAp,
      shutter: firstSpeed ? timed(firstSpeed) : { kind: 'bulb', seconds: 1 },
    });
    const eq = equivalents(camera, inputs, camera.isoPerShot ? cre.option.iso : workingEI, 0.5);
    return { ev100, inputs, cre, straight, eq };
  }, [camera, film, workingEI, isoSel, apSel, spSel, comp, goal, prefs.increment, prefs.astroRule]);

  if (!camera) return <Notice>Add a camera in Profiles first.</Notice>;

  const chosen = picked ?? result?.cre.option ?? null;
  const chosenT = chosen ? shutterSeconds(chosen.shutter) : 0;
  const recip = chosen && film && !camera.isoPerShot && chosenT >= 1 ? correctReciprocity(chosenT, film.reciprocity) : null;
  const handheld = handheldLimit(camera);

  const chips = (
    <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
      <button type="button" onClick={() => setSheet('camera')} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
        <Camera size={15} className="text-accent" /> {camera.name} <ChevronDown size={14} className="text-dim" />
      </button>
      {camera.isoPerShot ? (
        <span className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
          <Film size={15} className="text-accent" /> Digital · ISO {fmtISO(camera.isoMin)}–{fmtISO(camera.isoMax)}
        </span>
      ) : (
        <button type="button" onClick={() => setSheet('roll')} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
          <Film size={15} className="text-accent" /> {roll ? `${roll.stock.name} · EI ${fmtISO(roll.workingEI)}` : 'Load film'}
        </button>
      )}
      {stage !== 'goal' && (
        <button type="button" onClick={() => setStage('goal')} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
          <Target size={15} className="text-accent" /> {goalLabel}
        </button>
      )}
    </div>
  );

  const sheets = (
    <>
      <Sheet open={sheet === 'camera'} onClose={() => setSheet(null)} title="Camera">
        <div className="space-y-2">
          {doc.cameras.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActiveCamera(c.id);
                setPicked(null);
                setSheet(null);
              }}
              className={cx('flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left', c.id === camera.id ? 'border-accent' : 'border-line')}
            >
              <span>
                <span className="block font-semibold">{c.name}</span>
                <span className="text-xs text-dim">{lensSummary(c)}</span>
              </span>
              {c.id === camera.id && <Check size={18} className="text-accent" />}
            </button>
          ))}
          <Button
            className="w-full"
            onClick={() => {
              setSheet(null);
              goTo('profiles');
            }}
          >
            Manage cameras
          </Button>
        </div>
      </Sheet>
      <Sheet open={sheet === 'roll'} onClose={() => setSheet(null)} title={`Film in the ${camera.name}`} full>
        <RollManager camera={camera} onClose={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === 'bulb'} onClose={() => setSheet(null)} title="Bulb timer">
        <BulbTimer initialSeconds={recip?.corrected ?? chosenT} />
      </Sheet>
      <Sheet open={sheet === 'tips'} onClose={() => setSheet(null)} title={GOALS.find((g) => g.id === goal)?.name ?? 'Tips'}>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          {result?.cre.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {result?.cre.starLimit && <Row label="Star-point limit" value={fmtTime(result.cre.starLimit)} />}
      </Sheet>
    </>
  );

  // --- Step 1: goal -------------------------------------------------------------------------------------
  if (stage === 'goal') {
    return (
      <div className="space-y-3 px-3 pb-28 pt-2">
        {chips}
        <h1 className="font-display text-[26px] font-semibold leading-tight">What are you shooting today?</h1>
        <GoalGrid value={goal} customGoal={doc.customGoal} onPick={(g) => setGoal(g, doc.customGoal)} onCustom={(s) => setGoal('other', s)} />
        <div className="fixed inset-x-0 bottom-14 z-20 border-t border-line bg-bg/95 px-3 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                setGoal(null);
                setStage('reading');
              }}
            >
              No goal
            </Button>
            <Button kind="primary" className="flex-1" disabled={!goal} onClick={() => setStage('reading')}>
              Next
            </Button>
          </div>
        </div>
        {sheets}
      </div>
    );
  }

  // --- Bulb planner: the meter can't give a time ------------------------------------------------------------
  if (stage === 'bulb') {
    return (
      <div className="space-y-3 px-3 pb-6 pt-2">
        {chips}
        <BulbPlanner camera={camera} film={camera.isoPerShot ? null : film} roll={camera.isoPerShot ? null : roll} ei={workingEI} goal={goal} goalLabel={goalLabel} astroRule={prefs.astroRule} onBack={() => setStage('reading')} />
        {sheets}
      </div>
    );
  }

  // --- Step 2: the external meter's reading ---------------------------------------------------------------
  if (stage === 'reading') {
    return (
      <div className="space-y-4 px-3 pb-6 pt-2">
        {chips}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setStage('goal')} className="flex size-10 items-center justify-center rounded-full bg-raise" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-display text-[26px] font-semibold leading-tight">What did your light meter give you?</h1>
        </div>
        <p className="text-sm text-muted">
          Only the {camera.name}'s settings are listed. Set your meter app to the same ISO as your film and pick the matching shutter speed and f-stop; if
          your meter shows a value in between, pick the nearest one here.{camera.bulb ? ' For long exposures your meter can’t time, choose B and the app works out how long to hold it open.' : ''}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <BigSelect label="ISO" value={isoSel} onChange={setIso} options={scales.isos.map((v) => ({ value: v, label: fmtISO(v) }))} />
          <BigSelect
            label="Shutter"
            value={isBulb ? BULB : (spSel?.s.nominal ?? seconds)}
            onChange={setSeconds}
            options={[...scales.speeds.map((x) => ({ value: x.s.nominal, label: fmtTime(x.s.nominal) })), ...(camera.bulb ? [{ value: BULB, label: 'B' }] : [])]}
          />
          <BigSelect label="f-stop" value={apSel?.nominal ?? aperture} onChange={setAperture} options={scales.aps.map((a) => ({ value: a.nominal, label: apLabel(a) }))} />
        </div>
        {!camera.isoPerShot && isoSel !== workingEI && scales.isos.includes(workingEI) && (
          <button type="button" className="text-sm text-accent underline" onClick={() => setIso(workingEI)}>
            Set meter ISO to my film's EI {fmtISO(workingEI)}
          </button>
        )}
        {result && !isBulb && (
          <Card className="py-3">
            <Row label="Light level" value={`EV₁₀₀ ${result.ev100.toFixed(1)}`} />
          </Card>
        )}
        <Button
          kind="primary"
          className="w-full"
          onClick={() => {
            update((d) => {
              d.prefs.lastMeter = { iso: isoSel, seconds: isBulb ? BULB : (spSel?.s.nominal ?? seconds), aperture: apSel?.nominal ?? aperture };
            });
            setPicked(null);
            setSaved(false);
            setStage(isBulb ? 'bulb' : 'result');
          }}
        >
          {isBulb ? 'Work out my Bulb time' : `Fine-tune for ${goal ? goalLabel.toLowerCase() : 'my camera'}`}
        </Button>
        {sheets}
      </div>
    );
  }

  // --- Step 3: result ---------------------------------------------------------------------------------------
  if (!result || !chosen) return null;
  const { cre, straight, eq } = result;
  const isCreative = !picked;
  return (
    <div className="space-y-3 px-3 pb-6 pt-2">
      {chips}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setStage('reading')} className="flex size-10 items-center justify-center rounded-full bg-raise" aria-label="Back to meter reading">
          <ArrowLeft size={18} />
        </button>
        <div className="text-sm text-muted">
          Your meter: <span className="text-fg tnum">{apSel ? apLabel(apSel) : ''} · {fmtTime(spSel?.s.nominal ?? seconds)} · ISO {fmtISO(isoSel)}</span>
        </div>
      </div>

      <Card className="border-accent/60">
        <Label>{isCreative ? `Best for ${goalLabel.toLowerCase()}` : 'Your choice'} · {camera.name}</Label>
        <div className="mt-2 flex items-end gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-dim">Aperture</div>
            <div className="font-display text-5xl font-semibold leading-none tnum">{apLabel(chosen.aperture)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-dim">Shutter</div>
            <div className="font-display text-5xl font-semibold leading-none tnum">{chosen.shutter.kind === 'bulb' ? `B ${fmtTime(chosen.shutter.seconds)}` : shutterLabel(chosen.shutter)}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          {camera.isoPerShot ? <span className="font-semibold text-fg">ISO {fmtISO(chosen.iso)}</span> : <span>EI {fmtISO(workingEI)}</span>}
          {film && !camera.isoPerShot && <span>· {displayName(film)}</span>}
          <ErrorBadge stops={chosen.error} />
        </div>
        {isCreative && <p className="mt-2 text-sm">{cre.headline}.</p>}
        <p className="mt-1 text-xs text-dim">
          Same light as your meter reading{comp ? ' with your compensation' : ''} — {describeStops(chosen.error)}.
        </p>
        {recip && recip.basis !== 'noCorrectionNeeded' && <p className={cx('mt-2 text-sm', recip.basis === 'published' ? 'text-caution' : 'text-critical')}>{reciprocityText(recip)}</p>}
        {chosenT > handheld * 1.05 && <p className="mt-1 text-sm text-caution">Use a tripod — {fmtTime(chosenT)} is too slow to hand-hold.</p>}
        {(chosen.shutter.kind === 'bulb' || chosenT >= 1) && (
          <Button className="mt-3 w-full" onClick={() => setSheet('bulb')}>
            <Timer size={16} /> Bulb timer · {fmtTime(recip?.corrected ?? chosenT)}
          </Button>
        )}
        <div className="mt-3 flex gap-2">
          {!isCreative && (
            <Button kind="ghost" className="flex-1" onClick={() => setPicked(null)}>
              Back to best
            </Button>
          )}
          <Button
            className="flex-1"
            disabled={saved}
            onClick={async () => {
              await saveReading(
                {
                  date: new Date().toISOString(),
                  goal: goalLabel,
                  cameraName: camera.name,
                  lens: lensSummary(camera),
                  filmName: film ? displayName(film) : '—',
                  filmFormat: roll?.format ?? '—',
                  boxSpeed: film ? boxSpeedLabel(film) : '—',
                  workingEI,
                  ev100: result.ev100,
                  metered: `Meter: ${apSel ? apLabel(apSel) : ''} · ${fmtTime(spSel?.s.nominal ?? seconds)} · ISO ${fmtISO(isoSel)}`,
                  aperture: apLabel(chosen.aperture),
                  shutter: shutterLabel(chosen.shutter),
                  compensation: comp,
                  filterStops: 0,
                  meteringMode: 'External meter',
                  path: 'External light meter reading',
                  calibrationName: '—',
                  calibrationOffset: 0,
                  reciprocity: recip ? reciprocityText(recip) : null,
                  source: 'Entered from light meter app',
                  notes: '',
                },
                null,
              );
              vibrate(20);
              setSaved(true);
            }}
          >
            <Save size={16} /> {saved ? 'Saved' : 'Save to session'}
          </Button>
        </div>
      </Card>

      {cre.tips.length > 0 && (
        <Button kind="ghost" className="w-full" onClick={() => setSheet('tips')}>
          {cre.tips.length} tips for {goalLabel.toLowerCase()}
        </Button>
      )}

      <Card>
        <Label>Other ways to get the same exposure</Label>
        <div className="mt-2 space-y-1">
          <OptionRow label="Straight from your meter" o={straight.camera} on={!!picked && same(picked, straight.camera)} onPick={setPicked} />
          {cre.alternate && cre.alternateLabel && <OptionRow label={cre.alternateLabel} o={cre.alternate} on={!!picked && same(picked, cre.alternate)} onPick={setPicked} />}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {eq.map((o) => (
            <button
              key={o.aperture.exact}
              type="button"
              onClick={() => setPicked(o)}
              className={cx('rounded-lg border px-2 py-1.5 text-sm tnum', picked && same(picked, o) ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-raise')}
            >
              {optionLabel(o)}
              {Math.abs(o.error) >= 0.17 ? ` (${fmtStops(o.error)})` : ''}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-dim">Only settings the {camera.name} can actually make. Tap one to use it.</p>
      </Card>

      {cre.bracket.length > 1 && (
        <Card>
          <Label>Bracket</Label>
          {cre.bracket.map((b, i) => (
            <Row key={i} label={fmtStops(b.error) === '0' ? 'Metered' : fmtStops(b.error)} value={optionLabel(b)} />
          ))}
        </Card>
      )}

      <Card className="py-2">
        <button type="button" onClick={() => setTune((v) => !v)} className="flex w-full items-center justify-between py-1 text-left">
          <span className="font-semibold">Fine-tune</span>
          <span className="text-sm text-muted">
            {comp ? `comp ${fmtStops(comp)}` : ''}
          </span>
          <ChevronDown size={16} className={cx('transition-transform', tune && 'rotate-180')} />
        </button>
        {tune && (
          <div className="space-y-3 pb-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Exposure compensation</span>
              <Stepper value={comp} onChange={(v) => { setComp(v); setPicked(null); }} step={1 / prefs.increment} min={-4} max={4} format={(v) => fmtStops(v)} />
            </div>
            <p className="text-xs text-dim">+ gives more exposure (e.g. snow, backlit faces, light skin); − gives less (dark subjects, night scenes, saturated slides).</p>
          </div>
        )}
      </Card>

      <Button
        kind="primary"
        className="w-full"
        onClick={() => {
          setSaved(false);
          setPicked(null);
          setStage('reading');
        }}
      >
        New reading
      </Button>
      {sheets}
    </div>
  );
}

const same = (a: ExposureOption, b: ExposureOption) => a.aperture.exact === b.aperture.exact && shutterSeconds(a.shutter) === shutterSeconds(b.shutter);

function OptionRow({ label, o, on, onPick }: { label: string; o: ExposureOption; on: boolean; onPick: (o: ExposureOption) => void }) {
  return (
    <button type="button" onClick={() => onPick(o)} className={cx('flex w-full items-center justify-between rounded-lg px-2 py-2 text-left', on ? 'bg-accent/15' : 'bg-raise')}>
      <span className="text-sm text-muted">{label}</span>
      <span className="flex items-center gap-2 font-semibold tnum">
        {optionLabel(o)} <ErrorBadge stops={o.error} />
      </span>
    </button>
  );
}

function BigSelect({ label, value, onChange, options }: { label: string; value: number; onChange: (v: number) => void; options: { value: number; label: string }[] }) {
  const has = options.some((o) => o.value === value);
  return (
    <label className="block rounded-2xl border border-line bg-surface px-2 pb-2 pt-1.5 text-center">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">{label}</span>
      <select
        value={has ? value : options[0]!.value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full appearance-none bg-transparent text-center font-display text-[28px] font-semibold text-fg outline-none tnum"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="text-[10px] text-dim">tap to change</span>
    </label>
  );
}
