import { useMemo, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import {
  BULB_SHOTS,
  SCENES,
  apLabel,
  boxSpeedLabel,
  displayName,
  ev100Of,
  exactISO,
  fmtISO,
  fmtTime,
  isoScale,
  lensSummary,
  planBulb,
  reciprocityText,
  sortedApertures,
  sortedSpeeds,
  type Aperture,
  type BulbGroup,
  type CameraProfile,
  type FilmStock,
  type Goal,
} from '../engine';
import { BulbTimer } from './BulbTimer';
import { Button, Card, Chip, Label, Notice, Row, Segmented, cx, vibrate } from './ui';
import { saveReading } from '../state/actions';
import type { Roll } from '../state/store';

const GROUP_FOR_GOAL: Partial<Record<Goal, BulbGroup>> = { lightTrails: 'trails', astrophotography: 'astro', night: 'night', longExposure: 'night' };
const GROUP_LABEL: Record<BulbGroup, string> = { trails: 'Light trails', astro: 'Astro', night: 'Night' };
const DURATIONS: Record<string, number[]> = {
  starTrails: [900, 1800, 3600, 7200, 10800, 14400],
  painting: [15, 30, 60, 120, 240],
  fireworks: [2, 4, 6, 8, 15],
};

export function BulbPlanner({
  camera,
  film,
  roll,
  ei,
  goal,
  goalLabel,
  astroRule,
  onBack,
}: {
  camera: CameraProfile;
  film: FilmStock | null;
  roll: Roll | null;
  ei: number;
  goal: Goal | null;
  goalLabel: string;
  astroRule: number;
  onBack: () => void;
}) {
  const startGroup = (goal && GROUP_FOR_GOAL[goal]) ?? 'trails';
  const [shotId, setShotId] = useState(BULB_SHOTS.find((s) => s.group === startGroup)!.id);
  const shot = BULB_SHOTS.find((s) => s.id === shotId)!;
  const [stage, setStage] = useState<'shot' | 'plan'>('shot');
  const [source, setSource] = useState<'scene' | 'meter'>('scene');
  const [sceneId, setSceneId] = useState(shot.scene);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [aperture, setAperture] = useState<Aperture | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  // Optional meter reading (whatever the meter can manage, e.g. wide open at ISO 3200).
  const aps = sortedApertures(camera);
  // The meter's reading uses the camera's marked speeds only.
  const speeds = useMemo(() => sortedSpeeds(camera).map((s) => ({ v: s.exact, label: fmtTime(s.nominal) })), [camera]);
  const isos = isoScale(3, Math.max(6, ei / 16), Math.min(25600, ei * 16));
  const [mIso, setMIso] = useState(ei);
  const [mT, setMT] = useState(speeds.find((x) => x.v >= 1)?.v ?? speeds.at(-1)!.v);
  const [mN, setMN] = useState(aps[0]!.exact);

  const ev100 = source === 'meter' ? ev100Of(mN, mT, exactISO(mIso)) : SCENES.find((s) => s.id === sceneId)!.ev100;
  const plan = planBulb({ shot, camera, film, ei, ev100, duration, aperture, astroRule });
  const m = plan.main;

  const pickShot = (id: string) => {
    const s = BULB_SHOTS.find((x) => x.id === id)!;
    setShotId(id);
    setSceneId(s.scene);
    setSource('scene');
    setDuration(undefined);
    setAperture(undefined);
    setSaved(false);
    setStage('plan');
  };

  if (stage === 'shot') {
    const groups: BulbGroup[] = [startGroup, ...(['trails', 'astro', 'night'] as BulbGroup[]).filter((g) => g !== startGroup)];
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="flex size-10 items-center justify-center rounded-full bg-raise" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-display text-[26px] font-semibold leading-tight">What kind of Bulb shot?</h1>
        </div>
        {groups.map((g) => (
          <div key={g}>
            <Label>{GROUP_LABEL[g]}</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {BULB_SHOTS.filter((s) => s.group === g).map((s) => (
                <button key={s.id} type="button" onClick={() => pickShot(s.id)} className="rounded-2xl border border-line bg-surface p-3 text-left">
                  <div className="font-semibold leading-tight">{s.name}</div>
                  <div className="mt-1 text-xs text-dim">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const durations = DURATIONS[shot.mode];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setStage('shot')} className="flex size-10 items-center justify-center rounded-full bg-raise" aria-label="Back to shot types">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="font-display text-xl font-semibold leading-tight">{shot.name}</div>
          <div className="text-xs text-dim">{shot.desc}</div>
        </div>
      </div>

      {durations && (
        <Card className="py-3">
          <Label>{shot.mode === 'starTrails' ? 'How long should the trails be?' : shot.mode === 'fireworks' ? 'How many bursts per frame?' : 'How long will you paint?'}</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {durations.map((d) => (
              <Chip key={d} on={(duration ?? m.expose) === d} onClick={() => setDuration(d)}>
                {shot.mode === 'starTrails' ? `${fmtTime(d)} · ${Math.round((d / 3600) * 15)}°` : shot.mode === 'fireworks' ? `${fmtTime(d)}${d <= 2 ? ' · 1 burst' : d <= 6 ? ' · 1–2' : ' · several'}` : fmtTime(d)}
              </Chip>
            ))}
          </div>
        </Card>
      )}

      {shot.mode !== 'fireworks' && (
        <Card className="py-3">
          <Label>How bright is the scene?</Label>
          <div className="mt-2">
            <Segmented
              small
              label="Brightness source"
              value={source}
              onChange={setSource}
              options={[
                { value: 'scene', label: 'Pick the scene' },
                { value: 'meter', label: 'My meter got a reading' },
              ]}
            />
          </div>
          {source === 'scene' ? (
            <div className="mt-2 space-y-1">
              {SCENES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSceneId(s.id)}
                  className={cx('flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm', s.id === sceneId ? 'bg-accent/15 text-fg' : 'text-muted')}
                >
                  <span>{s.name}</span>
                  {s.id === sceneId && <span className="text-xs text-accent">selected</span>}
                </button>
              ))}
              <p className="text-xs text-dim">Typical brightness for each scene. Real light varies, so bracket.</p>
            </div>
          ) : (
            <div className="mt-2">
              <p className="mb-2 text-xs text-dim">Open your meter wide and raise its ISO until it gives any reading, then enter it. Vaaro Light Meter scales it to your film and aperture.</p>
              <div className="grid grid-cols-3 gap-2">
                <MiniSelect label="ISO" value={mIso} onChange={setMIso} options={isos.map((v) => ({ v, label: fmtISO(v) }))} />
                <MiniSelect label="Shutter" value={mT} onChange={setMT} options={speeds} />
                <MiniSelect label="f-stop" value={mN} onChange={setMN} options={aps.map((a) => ({ v: a.exact, label: apLabel(a) }))} />
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="border-accent/60">
        <Label>
          Set the {camera.name} to B · EI {fmtISO(ei)}
        </Label>
        <div className="mt-2 flex items-end gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-dim">Aperture</div>
            <div className="font-display text-5xl font-semibold leading-none tnum">{apLabel(m.aperture)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-dim">Hold open</div>
            <div className="font-display text-5xl font-semibold leading-none tnum">{fmtTime(m.expose)}</div>
          </div>
        </div>
        {plan.ndStops > 0 && <p className="mt-2 text-sm text-caution">With a {plan.ndStops}-stop ND filter on the lens.</p>}
        {m.reciprocity && m.reciprocity.basis !== 'noCorrectionNeeded' && (
          <>
            <Row label="Light calls for" value={fmtTime(m.calculated)} />
            <Row label={`With ${film?.name ?? 'film'} reciprocity`} value={fmtTime(m.expose)} tone={m.reciprocity.basis === 'published' ? 'ok' : 'warn'} />
            {m.reciprocity.basis !== 'published' && <p className="text-xs text-caution">{reciprocityText(m.reciprocity)}</p>}
          </>
        )}
        {plan.starArcDegrees !== undefined && <Row label="Star trail length" value={`${plan.starArcDegrees.toFixed(0)}° of arc`} />}
        {plan.starLimit !== undefined && <Row label="Star-point limit" value={`${fmtTime(plan.starLimit)} (${astroRule} rule, ${camera.lens.focalLength ?? '?'}mm)`} />}
        {plan.notes.map((n) => (
          <p key={n} className="mt-1 text-sm text-caution">
            {n}
          </p>
        ))}
        <div className="mt-3">
          <BulbTimer key={`${m.aperture.exact}-${Math.round(m.expose)}`} initialSeconds={m.expose} />
        </div>
      </Card>

      {plan.bracket.length > 0 && (
        <Card>
          <Label>Bracket (same aperture)</Label>
          {plan.bracket.map((b) => (
            <Row key={b.label} label={b.label} value={fmtTime(b.expose)} />
          ))}
        </Card>
      )}

      {(shot.mode === 'ambient' || shot.mode === 'starTrails' || shot.mode === 'starPoints') && (
        <Card>
          <Label>Use a different aperture</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {plan.alternatives.map((a) => (
              <button
                key={a.aperture.exact}
                type="button"
                onClick={() => setAperture(a.aperture)}
                className={cx('rounded-lg border px-2 py-1.5 text-sm tnum', a.aperture.exact === m.aperture.exact ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-raise')}
              >
                {apLabel(a.aperture)}
                {shot.mode === 'ambient' ? ` · ${fmtTime(a.expose)}` : ''}
              </button>
            ))}
          </div>
          {aperture && (
            <button type="button" className="mt-2 text-sm text-accent underline" onClick={() => setAperture(undefined)}>
              Back to the suggested aperture
            </button>
          )}
        </Card>
      )}

      <Card>
        <Label>Tips</Label>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
          {shot.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
          <li>Use a tripod and a locking cable release; cover the viewfinder eyepiece.</li>
        </ul>
      </Card>

      {!film && <Notice tone="warn">Load your film (chip at the top) so reciprocity is included.</Notice>}

      <Button
        className="w-full"
        disabled={saved}
        onClick={async () => {
          await saveReading(
            {
              date: new Date().toISOString(),
              goal: `${goalLabel} · ${shot.name}`,
              cameraName: camera.name,
              lens: lensSummary(camera),
              filmName: film ? displayName(film) : '—',
              filmFormat: roll?.format ?? '—',
              boxSpeed: film ? boxSpeedLabel(film) : '—',
              workingEI: ei,
              ev100,
              metered: source === 'meter' ? `Meter: f/${aps.find((a) => a.exact === mN)?.nominal} · ${fmtTime(mT)} · ISO ${fmtISO(mIso)}` : `Scene: ${SCENES.find((s) => s.id === sceneId)!.name}`,
              aperture: apLabel(m.aperture),
              shutter: `B · ${fmtTime(m.expose)}`,
              compensation: 0,
              filterStops: plan.ndStops,
              meteringMode: 'Bulb planner',
              path: source === 'meter' ? 'External light meter reading' : 'Typical scene brightness',
              calibrationName: '—',
              calibrationOffset: 0,
              reciprocity: m.reciprocity ? reciprocityText(m.reciprocity) : null,
              source: 'Bulb planner',
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
  );
}

function MiniSelect({ label, value, onChange, options }: { label: string; value: number; onChange: (v: number) => void; options: { v: number; label: string }[] }) {
  return (
    <label className="block rounded-xl border border-line bg-raise px-1 py-1 text-center">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full appearance-none bg-transparent text-center font-display text-xl font-semibold text-fg outline-none tnum" aria-label={`Meter ${label}`}>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
