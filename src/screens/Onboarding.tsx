import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  CAMERA_MODE_LABEL,
  FORMAT_LABEL,
  PRIMARY_TEMPLATES,
  generic35,
  genericDigital,
  apLabel,
  boxSpeedLabel,
  displayName,
  fmtISO,
  fmtTime,
  processingLabel,
  referenceSpeed,
  sortedApertures,
  sortedSpeeds,
  speedLabel,
  type CameraProfile,
  type FilmFormat,
  type FilmStock,
} from '../engine';
import { CameraArt } from '../components/art';
import { CameraEditor } from '../components/CameraEditor';
import { EIPicker, FilmPicker, FormatPicker } from '../components/pickers';
import { Button, Card, Label, Row, Sheet } from '../components/ui';
import { cameraFromTemplate, loadRoll, saveCamera } from '../state/actions';
import { allStocks, catalogOf, update, useDoc } from '../state/store';

export function CameraSpecs({ c }: { c: CameraProfile }) {
  const aps = sortedApertures(c);
  const sps = sortedSpeeds(c);
  return (
    <div>
      <Row label="Format" value={`${FORMAT_LABEL[c.format]} · ${c.negativeSize}`} />
      <Row label="Mount" value={c.mount || '—'} />
      <Row label="Modes" value={c.modes.map((m) => CAMERA_MODE_LABEL[m]).join(', ') || '—'} />
      <Row label="Lens" value={`${c.lens.name}${c.lens.focalLength ? ` · ${c.lens.focalLength}mm${c.lens.focalConfirmed ? '' : ' (unconfirmed)'}` : ''}`} />
      <div className="py-1.5">
        <div className="text-sm text-muted">Apertures</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {aps.map((a) => (
            <span key={a.exact} className="rounded-md bg-raise px-1.5 py-0.5 text-xs font-semibold tnum">
              {apLabel(a)}
            </span>
          ))}
        </div>
      </div>
      <div className="py-1.5">
        <div className="text-sm text-muted">Shutter speeds</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {sps.map((s) => (
            <span key={s.exact} className="rounded-md bg-raise px-1.5 py-0.5 text-xs font-semibold tnum">
              {speedLabel(s)}
            </span>
          ))}
          {c.bulb && <span className="rounded-md bg-raise px-1.5 py-0.5 text-xs font-semibold">B</span>}
        </div>
      </div>
      <Row label="ISO range" value={`${fmtISO(c.isoMin)}–${fmtISO(c.isoMax)}`} />
      {c.flashSync && <Row label="Flash sync" value={fmtTime(c.flashSync)} />}
      <Row label="Built-in meter" value={c.builtInMeter ? 'Yes' : 'No'} />
      {[...c.mechanicalNotes, ...c.notes].map((n) => (
        <p key={n} className="mt-1 text-xs text-dim">
          {n}
        </p>
      ))}
    </div>
  );
}

type Step = 1 | 2 | 3 | 4 | 5 | 6;

export function Onboarding() {
  const doc = useDoc((d) => d);
  const [step, setStep] = useState<Step>(2);
  const [camera, setCamera] = useState<CameraProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [film, setFilm] = useState<FilmStock | null>(null);
  const [format, setFormat] = useState<FilmFormat>('35mm');
  const [ei, setEI] = useState(400);
  const [pushPull, setPushPull] = useState(0);
  const catalog = catalogOf(doc);
  const stocks = allStocks(doc);
  const makers = useMemo(() => [...new Set([...catalog.manufacturers.map((m) => m.name), ...doc.customStocks.map((s) => s.manufacturer)])], [catalog, doc.customStocks]);

  const pickCamera = (t: CameraProfile) => {
    const saved = doc.cameras.find((c) => c.templateId === t.templateId);
    setCamera(saved ?? cameraFromTemplate(t));
    setStep(3);
  };
  const pickFilm = (s: FilmStock) => {
    setFilm(s);
    const f = camera && s.formats.includes(camera.format) ? camera.format : (s.formats[0] ?? '35mm');
    setFormat(f);
    setEI(referenceSpeed(s));
    setPushPull(0);
  };
  const finish = () => {
    if (!camera || !film) return;
    saveCamera(camera);
    loadRoll({ camera, stock: film, format, workingEI: ei, processing: 'Lab', pushPull, notes: '' });
    update((d) => {
      d.onboardingComplete = true;
    });
  };

  const titles: Record<Step, string> = {
    1: '',
    2: 'Which camera are you using?',
    3: 'Are these your camera settings?',
    4: 'What film are you using?',
    5: 'Box speed and working EI',
    6: 'Your setup',
  };

  return (
    <div className="safe-top mx-auto flex min-h-full max-w-xl flex-col px-4 pb-28">
      <header className="flex items-center gap-2 py-4">
        {step > 2 && (
          <button type="button" onClick={() => setStep((s) => (s - 1) as Step)} className="flex size-10 items-center justify-center rounded-full bg-raise" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="mr-auto">
          <div className="font-display text-sm font-semibold tracking-wide text-accent">VAARO LIGHT METER</div>
          <div className="text-xs text-dim">Setup {step - 1} of 5</div>
        </div>
        {doc.cameras.length > 0 && (
          <button
            type="button"
            className="text-sm text-muted underline"
            onClick={() =>
              update((d) => {
                d.onboardingComplete = true;
              })
            }
          >
            Skip to meter
          </button>
        )}
      </header>
      <h1 className="mb-4 font-display text-[28px] font-semibold leading-tight">{titles[step]}</h1>

      {step === 2 && (
        <div className="space-y-3">
          {PRIMARY_TEMPLATES.map((t) => {
            const c = t();
            const saved = doc.cameras.find((x) => x.templateId === c.templateId);
            return (
              <button key={c.id} type="button" onClick={() => pickCamera(c)} className="flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-line bg-surface text-left">
                <div className="h-24 w-36 shrink-0">
                  <CameraArt templateId={c.templateId} photo={saved?.photo} />
                </div>
                <div className="py-2 pr-3">
                  <div className="font-display text-lg font-semibold">{c.name}</div>
                  <div className="text-sm text-muted">
                    {FORMAT_LABEL[c.format]} · {c.mount}
                  </div>
                  <div className="text-xs text-dim">{saved ? 'Saved configuration' : c.builtInMeter ? 'Built-in meter' : 'No built-in meter'}</div>
                </div>
              </button>
            );
          })}
          <div className="pt-2 text-sm text-muted">Another camera</div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => pickCamera(generic35())}>
              Other 35mm
            </Button>
            <Button className="flex-1" onClick={() => pickCamera(genericDigital())}>
              Digital
            </Button>
          </div>
        </div>
      )}

      {step === 3 && camera && (
        <>
          <Card className="overflow-hidden p-0">
            <div className="h-40">
              <CameraArt templateId={camera.templateId} photo={camera.photo} />
            </div>
            <div className="p-4">
              <div className="font-display text-xl font-semibold">{camera.name}</div>
              <CameraSpecs c={camera} />
            </div>
          </Card>
          <div className="mt-4 grid gap-2">
            <Button kind="primary" onClick={() => setStep(4)}>
              Confirm camera
            </Button>
            <Button onClick={() => setEditing(true)}>Edit settings</Button>
            <Button
              kind="ghost"
              onClick={() => {
                saveCamera(camera, false);
                setStep(2);
              }}
            >
              Save and add another camera
            </Button>
          </div>
          <Sheet open={editing} onClose={() => setEditing(false)} title={`Edit ${camera.name}`} full>
            <CameraEditor
              initial={camera}
              onCancel={() => setEditing(false)}
              onSave={(c) => {
                setCamera(c);
                setEditing(false);
              }}
            />
          </Sheet>
        </>
      )}

      {step === 4 && (
        <>
          <FilmPicker stocks={stocks} manufacturers={makers} camera={camera} value={film} onPick={pickFilm} />
          {film && (
            <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur safe-bottom">
              <div className="mx-auto max-w-xl space-y-3">
                <FormatPicker stock={film} camera={camera} value={format} onPick={setFormat} />
                <Button kind="primary" className="w-full" onClick={() => setStep(5)}>
                  Use {displayName(film)}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {step === 5 && film && (
        <>
          <Card>
            <div className="mb-3 text-sm text-muted">
              {displayName(film)} · {FORMAT_LABEL[format]}
            </div>
            <EIPicker
              stock={film}
              camera={camera}
              ei={ei}
              pushPull={pushPull}
              onChange={(e, p) => {
                setEI(e);
                setPushPull(p);
              }}
            />
          </Card>
          <Button kind="primary" className="mt-4 w-full" onClick={() => setStep(6)}>
            Confirm EI {fmtISO(ei)}
          </Button>
        </>
      )}

      {step === 6 && camera && film && (
        <>
          <Card>
            <Label>Shooting configuration</Label>
            <div className="mt-2">
              <Row label="Camera" value={camera.name} />
              <Row label="Lens" value={camera.lens.name} />
              <Row label="Film" value={displayName(film)} />
              <Row label="Format" value={FORMAT_LABEL[format]} />
              <Row label="Box speed" value={boxSpeedLabel(film)} />
              <Row label="Working EI" value={`EI ${fmtISO(ei)}`} tone={Math.abs(ei - referenceSpeed(film)) > 0.5 ? 'warn' : undefined} />
              <Row label="Processing" value={processingLabel(pushPull)} />
            </div>
          </Card>
          <Button kind="primary" className="mt-4 w-full" onClick={finish}>
            Done
          </Button>
        </>
      )}
    </div>
  );
}
