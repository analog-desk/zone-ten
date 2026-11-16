import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Camera, Check, ChevronDown, Film, Image as ImageIcon, Info, Pause, Play, Save, Snowflake, Target, Timer, Video, X } from 'lucide-react';
import {
  CENTER,
  EVSmoother,
  GOALS,
  METERING_LABEL,
  METERING_SHORT,
  MODE_LABEL,
  MODE_SHORT,
  ND_FILTERS,
  PATH_LABEL,
  RELIABILITY_TEXT,
  SELECTABLE_MODES,
  adopt,
  apLabel,
  bellowsStops,
  boxSpeedLabel,
  captureEV100,
  creative,
  describeStops,
  dialLabel,
  displayName,
  equivalents,
  fmtISO,
  fmtStops,
  fmtTime,
  follow,
  goalName,
  illuminance,
  inputsOf,
  isUsable,
  isValidated,
  lensSummary,
  locksFor,
  modeOf,
  luminance,
  optionLabel,
  reciprocityText,
  regionStats,
  reliability,
  sceneEV100,
  shutterLabel,
  shutterSeconds,
  solve,
  spotStats,
  stepDial,
  warningText,
  type ExposureOption,
  type MeasurementPath,
  type MeteringMode,
  type NPoint,
  type Param,
  type Reliability,
} from '../engine';
import { BulbTimer } from '../components/BulbTimer';
import { Dial } from '../components/Dial';
import { GoalGrid } from '../components/pickers';
import { RollManager } from '../components/RollSheet';
import { Button, Card, ErrorBadge, Label, Notice, Row, Segmented, Sheet, Stepper, cx, inputClass, vibrate } from '../components/ui';
import { LiveMeter, type LiveCapability, type LiveFrame } from '../lib/liveMeter';
import { isIOS, measurePhoto, PhotoMeterError, type PhotoFrame } from '../lib/photoMeter';
import { confirmGoal, saveReading, setActiveCamera, setGoal, setMeterState, setWorkingEI } from '../state/actions';
import { useShooting } from '../state/hooks';
import { publishFrame, publishRaw } from '../state/measurement';
import { activeCalibration, goalNeedsConfirmation, update } from '../state/store';

interface Reading {
  ev: number;
  raw: number;
  reliability: Reliability;
  label: string;
  stable?: boolean;
  pointEVs?: number[];
}

interface Frozen extends Reading {
  imageURL: string | null;
  manual?: boolean;
}

export function Meter({ goTo }: { goTo: (tab: 'profiles' | 'sessions') => void }) {
  const { doc, camera, roll, film, workingEI, meter } = useShooting();
  const prefs = doc.prefs;
  const [source, setSource] = useState<'photo' | 'live'>('photo');
  const [photo, setPhoto] = useState<PhotoFrame | null>(null);
  const [live, setLive] = useState<{ frame: LiveFrame; raw: number | null; stable: boolean } | null>(null);
  const [liveCap, setLiveCap] = useState<LiveCapability | null>(null);
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  const [incident, setIncident] = useState(false);
  const [spot, setSpot] = useState<NPoint>(CENTER);
  const [points, setPoints] = useState<NPoint[]>([]);
  const [message, setMessage] = useState<{ tone: 'info' | 'warn' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | 'camera' | 'roll' | 'goal' | 'bulb' | 'manual' | 'tips'>(null);
  const [zoom, setZoom] = useState(1);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [manualEV, setManualEV] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const liveRef = useRef<LiveMeter | null>(null);
  const smoother = useRef(new EVSmoother());
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const mode: MeteringMode = incident ? 'average' : prefs.meteringMode;
  const path: MeasurementPath = incident ? 'incidentDiffuser' : source === 'photo' ? 'photoReflected' : 'liveReflected';
  const calib = activeCalibration(doc, path);
  const offset = (calib?.offsetTenths ?? 0) / 10;
  const incidentReady = !!prefs.incidentAccessory && !!activeCalibration(doc, 'incidentDiffuser') && isValidated(activeCalibration(doc, 'incidentDiffuser')!);

  // Live region follows the UI.
  useEffect(() => {
    if (liveRef.current) liveRef.current.region = { mode, spot, diameter: prefs.spotDiameter, points };
  }, [mode, spot, prefs.spotDiameter, points]);

  // Start / stop live camera.
  useEffect(() => {
    if (source !== 'live') return;
    const m = new LiveMeter((frame) => {
      const f = liveRef.current;
      if (!f) return;
      let raw: number | null = null;
      const fn = getFNumber();
      if (frame.exposure && fn) {
        const r = regionStats(frame.grid, f.region.mode, f.region.spot, f.region.diameter, f.region.points);
        raw = smoother.current.add(sceneEV100({ fNumber: fn, ...frame.exposure }, r.mean, 0));
      }
      setLive({ frame, raw, stable: smoother.current.stable });
    });
    liveRef.current = m;
    m.region = { mode, spot, diameter: prefs.spotDiameter, points };
    smoother.current.reset();
    if (videoRef.current) {
      m.start(videoRef.current, incident ? 'user' : 'environment')
        .then((cap) => {
          setLiveCap(cap);
          if (cap === 'framingOnly')
            setMessage({ tone: 'info', text: "This browser doesn't give live camera exposure data (Safari on iPhone). Use Measure to take a metering photo — the live view is for framing." });
        })
        .catch((e: Error) => {
          setMessage({ tone: 'bad', text: e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access for this site in your browser settings.' : `Camera unavailable: ${e.message}` });
          setSource('photo');
        });
    }
    return () => {
      m.stop();
      liveRef.current = null;
      setLive(null);
      setLiveCap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, incident]);

  const fNumberRef = useRef(prefs.phoneFNumber);
  fNumberRef.current = prefs.phoneFNumber;
  function getFNumber() {
    return fNumberRef.current;
  }

  // The current reading.
  const reading: Reading | null = useMemo(() => {
    if (frozen) return frozen;
    if (source === 'photo' && photo) {
      const st = regionStats(photo.grid, mode, spot, prefs.spotDiameter, points);
      const raw = sceneEV100(photo.capture, st.mean, 0);
      return {
        ev: raw + offset,
        raw,
        reliability: reliability(st.mean, st.clipped, false, false),
        label: `${photo.device} · ${fmtTime(photo.capture.seconds)} f/${photo.capture.fNumber} ISO ${fmtISO(photo.capture.iso)}`,
        pointEVs: mode === 'multiPoint' ? points.map((p) => sceneEV100(photo.capture, spotStats(photo.grid, p, prefs.spotDiameter).mean, offset)) : undefined,
      };
    }
    if (source === 'live' && live?.raw != null && live.frame.exposure) {
      const st = regionStats(live.frame.grid, mode, spot, prefs.spotDiameter, points);
      return {
        ev: live.raw + offset,
        raw: live.raw,
        reliability: reliability(st.mean, st.clipped, live.frame.atMax, live.frame.atMin),
        label: `Live · ${fmtTime(live.frame.exposure.seconds)} ISO ${fmtISO(live.frame.exposure.iso)}`,
        stable: live.stable,
      };
    }
    return null;
  }, [frozen, source, photo, live, mode, spot, points, prefs.spotDiameter, offset]);

  // Latest raw reading for calibration comparisons (never a manual entry).
  useEffect(() => {
    if (reading && !(frozen && frozen.manual)) publishRaw({ raw: reading.raw, path, label: reading.label, at: Date.now() });
  }, [reading, frozen, path]);

  // Share the frame with the Zone System tool.
  useEffect(() => {
    if (source === 'photo' && photo) publishFrame({ grid: photo.grid, frameEV: captureEV100(photo.capture) + offset, imageURL: photo.imageURL, aspect: photo.aspect, label: photo.device });
  }, [source, photo, offset]);

  if (!camera || !meter) {
    return (
      <div className="p-6">
        <Notice>Add a camera in Profiles to start metering.</Notice>
      </div>
    );
  }

  const inc = prefs.increment;
  const ev = reading?.ev ?? null;
  const inputs = ev != null ? inputsOf(meter, ev, workingEI) : null;
  const sol = inputs ? solve({ camera, increment: inc, film }, inputs, meter.locks, meter.selection) : null;
  const shown = sol ? follow(meter, sol) : meter;
  const curMode = modeOf(shown.locks);
  const cre = inputs ? creative(doc.goal, camera, film, inputs, inc, prefs.astroRule) : null;
  const bulbSeconds = shown.selection.shutter.kind === 'bulb' ? shown.selection.shutter.seconds : sol ? Math.max(1, sol.metered.seconds) : 30;

  const step = (p: Param, d: number) => {
    const next = stepDial(shown, p, d, camera, film, inc, bulbSeconds);
    if (p === 'iso' && !camera.isoPerShot && roll) setWorkingEI(roll.id, next.selection.iso);
    setMeterState(camera.id, next);
  };
  const toggleLock = (p: Param) => setMeterState(camera.id, { ...shown, locks: { ...shown.locks, [p]: !shown.locks[p] } });
  const setMode = (m: (typeof SELECTABLE_MODES)[number]) => setMeterState(camera.id, { ...shown, locks: locksFor(m) });

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const p = await measurePhoto(file);
      setPhoto(p);
      setFrozen(null);
      setSource('photo');
      if (!prefs.phoneFNumber)
        update((d) => {
          d.prefs.phoneFNumber = p.capture.fNumber;
        });
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof PhotoMeterError ? e.message : `Could not read the photo: ${(e as Error).message}` });
    } finally {
      setBusy(false);
      if (cameraInput.current) cameraInput.current.value = '';
      if (libraryInput.current) libraryInput.current.value = '';
    }
  }

  function freeze() {
    if (!reading) return;
    const img = source === 'live' && videoRef.current ? (liveRef.current?.snapshot(videoRef.current) ?? null) : (photo?.imageURL ?? null);
    setFrozen({ ...reading, imageURL: img, label: `${reading.label} · held` });
    vibrate(15);
  }

  async function save() {
    if (!reading || !sol || !camera) return;
    const img = frozen?.imageURL ?? (source === 'photo' ? (photo?.imageURL ?? null) : videoRef.current ? (liveRef.current?.snapshot(videoRef.current) ?? null) : null);
    await saveReading(
      {
        date: new Date().toISOString(),
        goal: doc.goal === 'other' && doc.customGoal ? doc.customGoal : goalName(doc.goal),
        cameraName: camera.name,
        lens: lensSummary(camera),
        filmName: film ? displayName(film) : '—',
        filmFormat: roll?.format ?? '—',
        boxSpeed: film ? boxSpeedLabel(film) : '—',
        workingEI,
        ev100: reading.ev,
        metered: `${apLabel({ nominal: sol.metered.aperture, exact: sol.metered.aperture })} · ${fmtTime(sol.metered.seconds)} @ ${fmtISO(sol.metered.iso)}`,
        aperture: apLabel(shown.selection.aperture),
        shutter: shutterLabel(shown.selection.shutter),
        compensation: meter!.compensation,
        filterStops: meter!.filterStops + meter!.bellowsStops,
        meteringMode: incident ? 'Incident' : METERING_LABEL[mode],
        path: frozen?.manual ? 'Manual EV entry (not measured)' : PATH_LABEL[path],
        calibrationName: calib?.name ?? 'Uncalibrated',
        calibrationOffset: offset,
        reciprocity: sol.reciprocity ? reciprocityText(sol.reciprocity) : null,
        source: reading.label,
        notes: '',
      },
      img,
    );
    vibrate(20);
    setMessage({ tone: 'info', text: 'Reading saved to today’s session.' });
  }

  function tap(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const p = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    if (incident) return;
    if (mode === 'multiPoint') setPoints((ps) => [...ps.slice(-5), p]);
    else {
      setSpot(p);
      if (mode !== 'spot')
        update((d) => {
          d.prefs.meteringMode = 'spot';
        });
    }
    setFrozen(null);
  }

  const viewerImage = frozen?.imageURL ?? (source === 'photo' ? photo?.imageURL : null);
  const aspect = source === 'photo' && photo ? photo.aspect : 3 / 4;
  const goalLabel = doc.goal === 'other' && doc.customGoal ? doc.customGoal : goalName(doc.goal);
  const unit = incident ? `${Math.round(illuminance(reading?.ev ?? 0))} lux` : `${luminance(reading?.ev ?? 0) < 10 ? luminance(reading?.ev ?? 0).toFixed(2) : Math.round(luminance(reading?.ev ?? 0))} cd/m²`;

  return (
    <div className="space-y-3 px-3 pb-6 pt-2">
      {/* Configuration chips */}
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
        <button type="button" onClick={() => setSheet('camera')} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
          <Camera size={15} className="text-accent" /> {camera.name} <ChevronDown size={14} className="text-dim" />
        </button>
        <button type="button" onClick={() => setSheet('roll')} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
          <Film size={15} className="text-accent" /> {roll ? `${roll.stock.name} · EI ${fmtISO(roll.workingEI)}` : 'Load film'}
        </button>
        <button type="button" onClick={() => setSheet('goal')} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
          <Target size={15} className="text-accent" /> {goalLabel}
        </button>
      </div>

      {goalNeedsConfirmation(doc) && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <span className="mr-auto">Still shooting {goalLabel.toLowerCase()} today?</span>
          <Button kind="ghost" onClick={() => setSheet('goal')}>
            Change
          </Button>
          <Button onClick={confirmGoal}>Keep</Button>
        </div>
      )}

      {/* Viewer */}
      <div className="relative mx-auto w-full overflow-hidden rounded-2xl border border-line bg-black" style={{ aspectRatio: String(aspect) }}>
        {source === 'live' && !frozen && <video ref={videoRef} className="absolute inset-0 h-full w-full object-fill" playsInline muted />}
        {viewerImage && <img src={viewerImage} alt="Metered scene" className="absolute inset-0 h-full w-full object-fill" />}
        {!viewerImage && source === 'photo' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Camera size={40} className="text-accent" />
            <p className="text-sm text-muted">
              {isIOS()
                ? 'On iPhone: take the photo with the Camera app, then Photos → Share → Save to Files, and tap “From Files / library” below → Browse. Safari strips the camera data from photos taken or picked inside the browser.'
                : 'Tap Measure to take a metering photo. Zone Ten reads its exposure data and pixels, then you can tap the picture to spot meter any area.'}
            </p>
          </div>
        )}
        <div className="absolute inset-0" onPointerUp={tap} role="button" aria-label="Tap to meter this area">
          <MeterOverlay mode={mode} spot={spot} points={points} diameter={prefs.spotDiameter} pointEVs={reading?.pointEVs} incident={incident} />
        </div>
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
          {frozen && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">{frozen.manual ? 'MANUAL EV' : 'HELD'}</span>}
          {incident && <span className="rounded-full bg-info px-2 py-0.5 text-xs font-bold text-black">INCIDENT</span>}
          {source === 'live' && liveCap === 'framingOnly' && <span className="rounded-full bg-black/70 px-2 py-0.5 text-xs">framing only</span>}
        </div>
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm">Measuring…</div>}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-4 gap-1.5">
        <Button kind="primary" className="col-span-2" onClick={() => cameraInput.current?.click()}>
          <Camera size={18} /> Measure
        </Button>
        {source === 'live' ? (
          frozen ? (
            <Button onClick={() => setFrozen(null)}>
              <Play size={18} /> Resume
            </Button>
          ) : (
            <Button onClick={freeze} disabled={!reading}>
              <Snowflake size={18} /> Hold
            </Button>
          )
        ) : (
          <Button
            onClick={() => {
              setFrozen(null);
              setSource('live');
            }}
          >
            <Video size={18} /> Live
          </Button>
        )}
        <Button onClick={save} disabled={!reading || !sol}>
          <Save size={18} /> Save
        </Button>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
        <input ref={libraryInput} type="file" accept="image/*,.heic,.heif,.jpg,.jpeg" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <button type="button" className="flex items-center gap-1 underline" onClick={() => libraryInput.current?.click()}>
          <ImageIcon size={13} /> From Files / library
        </button>
        {source === 'live' && (
          <button type="button" className="flex items-center gap-1 underline" onClick={() => setSource('photo')}>
            <Pause size={13} /> Stop live
          </button>
        )}
        <button type="button" className="underline" onClick={() => setSheet('manual')}>
          Enter EV manually
        </button>
      </div>
      {message && (
        <Notice tone={message.tone}>
          <div className="flex gap-2">
            <span className="mr-auto">{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        </Notice>
      )}
      {source === 'live' && liveCap === 'absolute' && !prefs.phoneFNumber && (
        <Notice tone="warn">Take one metering photo first so Zone Ten can learn your phone lens's aperture — live readings need it.</Notice>
      )}

      {/* Readout */}
      <Card className="py-3">
        <div className="flex items-end gap-3">
          <div>
            <Label>{incident ? 'Incident EV₁₀₀' : 'EV₁₀₀'}</Label>
            <div className="font-display text-[54px] font-semibold leading-none tnum" aria-live="polite">
              {reading ? reading.ev.toFixed(1) : '—'}
            </div>
          </div>
          <div className="mb-1 ml-auto text-right text-xs text-muted">
            {reading && <div className="tnum">{unit}</div>}
            {reading?.stable !== undefined && <div className={reading.stable ? 'text-ok' : 'text-dim'}>{reading.stable ? '● stable' : '○ settling'}</div>}
            <div>{calib ? `${calib.name} ${fmtStops(offset)}` : 'Uncalibrated'}</div>
          </div>
        </div>
        {reading && <div className="mt-1 truncate text-xs text-dim">{reading.label}</div>}
        {reading && RELIABILITY_TEXT[reading.reliability] && (
          <div className={cx('mt-2 text-sm', isUsable(reading.reliability) ? 'text-caution' : 'text-critical')}>{RELIABILITY_TEXT[reading.reliability]}</div>
        )}
      </Card>

      {/* Metering pattern */}
      <Segmented<MeteringMode>
        label="Metering mode"
        value={mode}
        onChange={(m) => {
          update((d) => {
            d.prefs.meteringMode = m;
          });
          setFrozen(null);
        }}
        options={(['average', 'centerWeighted', 'spot', 'multiPoint'] as MeteringMode[]).map((m) => ({ value: m, label: METERING_SHORT[m], disabled: incident }))}
      />
      {(mode === 'spot' || mode === 'multiPoint') && (
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>Spot</span>
          <input
            type="range"
            min={0.02}
            max={0.2}
            step={0.01}
            value={prefs.spotDiameter}
            onChange={(e) =>
              update((d) => {
                d.prefs.spotDiameter = Number(e.target.value);
              })
            }
            className="flex-1"
            aria-label="Spot size"
          />
          <span className="w-10 tnum">{Math.round(prefs.spotDiameter * 100)}%</span>
          {mode === 'multiPoint' && points.length > 0 && (
            <button type="button" className="underline" onClick={() => setPoints([])}>
              Clear {points.length}
            </button>
          )}
        </div>
      )}
      {source === 'live' && liveRef.current?.zoomRange && (
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>Zoom</span>
          <input
            type="range"
            min={liveRef.current.zoomRange.min}
            max={liveRef.current.zoomRange.max}
            step={0.1}
            value={zoom}
            onChange={(e) => {
              setZoom(Number(e.target.value));
              liveRef.current?.setZoom(Number(e.target.value));
            }}
            className="flex-1"
            aria-label="Zoom"
          />
          <span className="w-10 tnum">{zoom.toFixed(1)}×</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <Segmented
          small
          label="Reflected or incident"
          value={incident ? 'inc' : 'refl'}
          onChange={(v) => {
            if (v === 'inc' && !incidentReady) {
              setMessage({ tone: 'info', text: 'Incident metering needs a diffuser accessory registered and calibrated against a reference incident meter (Settings → Incident accessory). A phone camera alone is not an incident meter.' });
              return;
            }
            setIncident(v === 'inc');
            setFrozen(null);
          }}
          options={[
            { value: 'refl', label: 'Reflected' },
            { value: 'inc', label: incidentReady ? 'Incident' : 'Incident 🔒' },
          ]}
        />
        <Segmented
          small
          label="Meter mode"
          value={SELECTABLE_MODES.includes(curMode) ? curMode : 'isoPriority'}
          onChange={setMode}
          options={SELECTABLE_MODES.map((m) => ({ value: m, label: MODE_SHORT[m] }))}
        />
      </div>

      {/* Dials */}
      <div className="flex gap-1.5">
        <Dial
          label={camera.isoPerShot ? 'ISO' : 'EI'}
          value={dialLabel({ p: 'iso', v: sol?.mode === 'solveISO' ? sol.recommended.iso : shown.selection.iso })}
          locked={shown.locks.iso}
          solved={!!sol?.solved.includes('iso')}
          sub={sol?.mode === 'solveISO' ? `needs ${fmtISO(sol.metered.iso)}` : film ? (film.boxSpeed ? `box ${fmtISO(film.boxSpeed)}` : film.speedDesignation) : undefined}
          onLock={() => toggleLock('iso')}
          onStep={(d) => step('iso', d)}
        />
        <Dial
          label="Aperture"
          value={dialLabel({ p: 'aperture', v: shown.selection.aperture })}
          locked={shown.locks.aperture}
          solved={!!sol?.solved.includes('aperture')}
          sub={sol && sol.solved.includes('aperture') && !sol.solved.includes('shutter') ? `ideal ${sol.metered.aperture.toFixed(1)}` : undefined}
          error={sol && sol.solved.includes('aperture') ? sol.camera.error : undefined}
          onLock={() => toggleLock('aperture')}
          onStep={(d) => step('aperture', d)}
        />
        <Dial
          label="Shutter"
          value={shown.selection.shutter.kind === 'bulb' ? `B ${fmtTime(shown.selection.shutter.seconds)}` : dialLabel({ p: 'shutter', v: shown.selection.shutter })}
          locked={shown.locks.shutter}
          solved={!!sol?.solved.includes('shutter')}
          sub={sol && sol.solved.includes('shutter') ? `ideal ${fmtTime(sol.metered.seconds)}` : undefined}
          error={sol && sol.solved.includes('shutter') ? sol.camera.error : undefined}
          onLock={() => toggleLock('shutter')}
          onStep={(d) => step('shutter', d)}
        />
      </div>
      {sol && sol.mode === 'manual' && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-muted">Your settings are</span>
          <ErrorBadge stops={sol.user.error} />
          <span className="text-muted">{Math.abs(sol.user.error) < 0.05 ? 'on the metered exposure' : sol.user.error > 0 ? 'over' : 'under'}</span>
        </div>
      )}

      {/* Compensation and adjustments */}
      <Card className="py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Compensation</span>
          <Stepper value={meter.compensation} onChange={(v) => setMeterState(camera.id, { ...shown, compensation: v })} step={1 / inc} min={-5} max={5} format={(v) => fmtStops(v)} />
        </div>
        <button type="button" onClick={() => setShowAdjust((v) => !v)} className="mt-1 flex w-full items-center justify-between py-1 text-sm text-muted">
          <span>
            Filters & close-up {meter.filterStops + meter.bellowsStops > 0.05 ? `· ${fmtStops(meter.filterStops + meter.bellowsStops)} stops` : ''}
          </span>
          <ChevronDown size={16} className={cx('transition-transform', showAdjust && 'rotate-180')} />
        </button>
        {showAdjust && (
          <div className="space-y-2 pb-2">
            <label className="block text-sm">
              <span className="text-muted">Filter / ND (light loss)</span>
              <select
                className={cx(inputClass, 'mt-1')}
                value={ND_FILTERS.find((f) => Math.abs(f.stops - meter.filterStops) < 0.01)?.name ?? (meter.filterStops ? 'custom' : 'none')}
                onChange={(e) => {
                  const f = ND_FILTERS.find((x) => x.name === e.target.value);
                  setMeterState(camera.id, { ...shown, filterStops: f ? f.stops : 0 });
                }}
              >
                <option value="none">None</option>
                {ND_FILTERS.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name} ({f.stops.toFixed(f.stops % 1 ? 1 : 0)} stops)
                  </option>
                ))}
                {meter.filterStops && !ND_FILTERS.some((f) => Math.abs(f.stops - meter.filterStops) < 0.01) ? <option value="custom">Custom {fmtStops(meter.filterStops)}</option> : null}
              </select>
            </label>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Other filter factor (stops)</span>
              <Stepper value={meter.filterStops} onChange={(v) => setMeterState(camera.id, { ...shown, filterStops: v })} step={1 / 3} min={0} max={20} format={(v) => fmtStops(v)} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Macro magnification</span>
              <Stepper
                value={meter.bellowsStops > 0 ? Math.round((2 ** (meter.bellowsStops / 2) - 1) * 10) / 10 : 0}
                onChange={(m) => setMeterState(camera.id, { ...shown, bellowsStops: bellowsStops(m) })}
                step={0.1}
                min={0}
                max={4}
                format={(m) => `${m.toFixed(1)}×`}
              />
            </div>
            <p className="text-xs text-dim">Bellows/extension loss uses (1+m)². Skip it if your camera meters through the lens.</p>
          </div>
        )}
      </Card>

      {/* Breakdown */}
      {sol && (
        <Card>
          <button type="button" onClick={() => setShowDetail((v) => !v)} className="flex w-full items-center gap-2 text-left">
            <Info size={16} className="text-accent" />
            <span className="mr-auto font-semibold">
              {MODE_LABEL[sol.mode]} · {optionLabel(sol.camera)}
            </span>
            <ErrorBadge stops={sol.camera.error} />
            <ChevronDown size={16} className={cx('transition-transform', showDetail && 'rotate-180')} />
          </button>
          <p className="mt-2 text-sm text-muted">{sol.explanation[0]}</p>
          {sol.warnings
            .filter((w) => w.kind !== 'tripod' || !showDetail)
            .map((w, i) => (
              <p key={i} className={cx('mt-1 text-sm', w.kind === 'tooBright' || w.kind === 'tooDark' ? 'text-critical' : 'text-caution')}>
                {warningText(w)}
              </p>
            ))}
          {(sol.camera.shutter.kind === 'bulb' || (sol.reciprocity && sol.reciprocity.corrected >= 1)) && (
            <Button className="mt-2 w-full" onClick={() => setSheet('bulb')}>
              <Timer size={16} /> Bulb timer · {fmtTime(sol.reciprocity?.corrected ?? shutterSeconds(sol.camera.shutter))}
            </Button>
          )}
          {showDetail && (
            <div className="mt-3 border-t border-line pt-2">
              <Row label="Metered (measured)" value={`EV ${sol.ev100.toFixed(1)} → ${apLabel({ nominal: sol.metered.aperture, exact: sol.metered.aperture })} · ${fmtTime(sol.metered.seconds)} · ${fmtISO(sol.metered.iso)}`} />
              <Row label={`Recommended (${inc === 3 ? '⅓' : inc === 2 ? '½' : 'full'} stops)`} value={<>{apLabel(sol.recommended.aperture)} · {sol.recommended.label} <ErrorBadge stops={sol.recommended.error} /></>} />
              <Row label="Your dials" value={<>{optionLabel(sol.user)} <ErrorBadge stops={sol.user.error} /></>} />
              <Row label={`${camera.name} can set`} value={<>{optionLabel(sol.camera)} <ErrorBadge stops={sol.camera.error} /></>} />
              {sol.alternative && <Row label="Next closest" value={<>{optionLabel(sol.alternative)} <ErrorBadge stops={sol.alternative.error} /></>} />}
              {sol.explanation.slice(1).map((l) => (
                <p key={l} className="mt-1 text-sm text-muted">
                  {l}
                </p>
              ))}
              {sol.reciprocity && (
                <div className="mt-2 rounded-xl bg-raise p-2 text-sm">
                  <Row label="Calculated time" value={fmtTime(sol.reciprocity.metered)} />
                  <Row label="Reciprocity-adjusted" value={fmtTime(sol.reciprocity.corrected)} tone={sol.reciprocity.basis === 'published' ? 'ok' : 'warn'} />
                  <p className="text-xs text-dim">{reciprocityText(sol.reciprocity)}</p>
                </div>
              )}
              <Label>Equivalent exposures</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {equivalents(camera, inputs!, sol.camera.iso).map((o) => (
                  <button key={o.aperture.exact} type="button" onClick={() => setMeterState(camera.id, adopt(shown, o))} className="rounded-lg bg-raise px-2 py-1 text-xs tnum">
                    {optionLabel(o)}
                    {Math.abs(o.error) >= 0.17 ? ` (${fmtStops(o.error)})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Creative goal recommendation (separate from the metered exposure) */}
      {cre && (
        <Card>
          <Label>{goalLabel} · creative suggestion</Label>
          <div className="mt-1 flex items-center gap-2">
            <div className="mr-auto">
              <div className="font-display text-xl font-semibold tnum">{optionLabel(cre.option)}</div>
              <div className="text-sm text-muted">{cre.headline}</div>
            </div>
            <Button onClick={() => setMeterState(camera.id, adopt(shown, cre.option))}>
              <Check size={16} /> Use
            </Button>
          </div>
          <p className="mt-1 text-xs text-dim">Same light as the metered reading — {describeStops(cre.option.error)}. Using it switches the meter to manual.</p>
          {cre.nd && (
            <p className="mt-2 text-sm text-caution">
              With a {Math.round(cre.nd.stops)}-stop ND: {optionLabel(cre.nd.option)}
            </p>
          )}
          {cre.alternate && cre.alternateLabel && (
            <Row label={cre.alternateLabel} value={<OptionButton o={cre.alternate} onUse={(o) => setMeterState(camera.id, adopt(shown, o))} />} />
          )}
          {cre.bracket.length > 1 && <Row label="Bracket" value={cre.bracket.map((b) => `${shutterLabel(b.shutter)} (${fmtStops(b.error)})`).join(' · ')} />}
          {cre.reciprocity && cre.reciprocity.basis !== 'noCorrectionNeeded' && <p className="mt-1 text-sm text-caution">{reciprocityText(cre.reciprocity)}</p>}
          {cre.tips.length > 0 && (
            <Button kind="ghost" className="mt-1 w-full" onClick={() => setSheet('tips')}>
              {cre.tips.length} tips for {goalLabel.toLowerCase()}
            </Button>
          )}
        </Card>
      )}

      {/* Sheets */}
      <Sheet open={sheet === 'camera'} onClose={() => setSheet(null)} title="Camera">
        <div className="space-y-2">
          {doc.cameras.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActiveCamera(c.id);
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
      <Sheet open={sheet === 'goal'} onClose={() => setSheet(null)} title="What are you shooting today?" full>
        <GoalGrid
          value={doc.goal}
          customGoal={doc.customGoal}
          onPick={(g) => {
            setGoal(g, doc.customGoal);
            if (g !== 'other') setSheet(null);
          }}
          onCustom={(s) => setGoal('other', s)}
        />
        <Button
          className="mt-3 w-full"
          onClick={() => {
            setGoal(null);
            setSheet(null);
          }}
        >
          No goal · standard metering
        </Button>
      </Sheet>
      <Sheet open={sheet === 'bulb'} onClose={() => setSheet(null)} title="Bulb timer">
        {sol && <BulbTimer initialSeconds={sol.reciprocity?.corrected ?? shutterSeconds(sol.camera.shutter)} />}
      </Sheet>
      <Sheet open={sheet === 'tips'} onClose={() => setSheet(null)} title={GOALS.find((g) => g.id === doc.goal)?.name ?? 'Tips'}>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          {cre?.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {cre?.starLimit && <Row label="Star-point limit" value={fmtTime(cre.starLimit)} />}
      </Sheet>
      <Sheet open={sheet === 'manual'} onClose={() => setSheet(null)} title="Enter EV manually">
        <p className="mb-3 text-sm text-muted">
          For readings from another meter or a published table. The value is labelled as a manual entry everywhere and is never presented as measured.
        </p>
        <input className={inputClass} inputMode="decimal" placeholder="EV at ISO 100, e.g. 12.3" value={manualEV} onChange={(e) => setManualEV(e.target.value)} />
        <Button
          kind="primary"
          className="mt-3 w-full"
          disabled={!Number.isFinite(parseFloat(manualEV))}
          onClick={() => {
            const v = parseFloat(manualEV);
            setFrozen({ ev: v, raw: v, reliability: 'reliable', label: 'Manual EV entry (not measured)', imageURL: null, manual: true });
            setSheet(null);
          }}
        >
          Use EV {manualEV || '—'}
        </Button>
      </Sheet>
    </div>
  );
}

function OptionButton({ o, onUse }: { o: ExposureOption; onUse: (o: ExposureOption) => void }) {
  return (
    <button type="button" onClick={() => onUse(o)} className="rounded-lg bg-raise px-2 py-1 text-sm tnum">
      {optionLabel(o)}
    </button>
  );
}

function MeterOverlay({ mode, spot, points, diameter, pointEVs, incident }: { mode: MeteringMode; spot: NPoint; points: NPoint[]; diameter: number; pointEVs?: number[]; incident: boolean }) {
  if (incident || mode === 'average') return <div className="pointer-events-none absolute inset-[3%] rounded-lg border border-dashed border-white/50" />;
  if (mode === 'centerWeighted')
    return <div className="pointer-events-none absolute left-1/2 top-1/2 h-[40%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-white/70" />;
  const marks = mode === 'spot' ? [spot] : points;
  return (
    <>
      {marks.map((p, i) => (
        <div
          key={i}
          className="pointer-events-none absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${Math.max(diameter * 100, 4)}%` }}
        >
          {mode === 'multiPoint' && (
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1 text-[11px] font-semibold tnum">
              {pointEVs?.[i] !== undefined ? pointEVs[i]!.toFixed(1) : i + 1}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
