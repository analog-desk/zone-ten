import { useMemo, useState } from 'react';
import { FORMAT_LABEL, boxSpeedLabel, displayName, fmtISO, processingLabel, referenceSpeed, type CameraProfile, type FilmFormat, type FilmStock } from '../engine';
import { finishRoll, loadRoll, setWorkingEI, updateRoll } from '../state/actions';
import { activeRoll, allStocks, catalogOf, useDoc } from '../state/store';
import { FilmArt } from './art';
import { EIPicker, FilmPicker, FormatPicker } from './pickers';
import { Button, Card, Field, Label, Notice, Row, inputClass } from './ui';

const PROCESSING = ['Lab', 'Home development', 'Undecided'];

/** Load a new roll in a camera: film → format → EI → details. */
export function NewRollForm({ camera, preset, onDone }: { camera: CameraProfile; preset?: FilmStock | null; onDone: () => void }) {
  const doc = useDoc((d) => d);
  const stocks = allStocks(doc);
  const makers = useMemo(() => [...new Set([...catalogOf(doc).manufacturers.map((m) => m.name), ...doc.customStocks.map((s) => s.manufacturer)])], [doc]);
  const current = activeRoll(doc, camera.id);
  const [film, setFilm] = useState<FilmStock | null>(preset ?? null);
  const [format, setFormat] = useState<FilmFormat>(() => (preset && preset.formats.includes(camera.format) ? camera.format : (preset?.formats[0] ?? camera.format)));
  const [ei, setEI] = useState(preset ? referenceSpeed(preset) : 400);
  const [pushPull, setPushPull] = useState(0);
  const [processing, setProcessing] = useState('Lab');
  const [notes, setNotes] = useState('');

  if (!film) {
    return (
      <FilmPicker
        stocks={stocks}
        manufacturers={makers}
        camera={camera}
        value={null}
        onPick={(s) => {
          setFilm(s);
          setFormat(s.formats.includes(camera.format) ? camera.format : (s.formats[0] ?? camera.format));
          setEI(referenceSpeed(s));
        }}
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-16 overflow-hidden rounded-xl">
          <FilmArt stock={film} format={format} />
        </div>
        <div className="mr-auto">
          <div className="font-semibold">{displayName(film)}</div>
          <div className="text-sm text-muted">{boxSpeedLabel(film)}</div>
        </div>
        <Button kind="ghost" onClick={() => setFilm(null)}>
          Change
        </Button>
      </div>
      <FormatPicker stock={film} camera={camera} value={format} onPick={setFormat} />
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
      <Field label="Processing preference">
        <select className={inputClass} value={processing} onChange={(e) => setProcessing(e.target.value)}>
          {PROCESSING.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Field>
      <Field label="Notes">
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Expiry, batch, lab instructions…" />
      </Field>
      {current && (
        <Notice tone="warn">
          This finishes roll #{current.rollNumber} ({displayName(current.stock)}) in the {camera.name}. Have you loaded a new roll?
        </Notice>
      )}
      <Button
        kind="primary"
        className="w-full"
        onClick={() => {
          loadRoll({ camera, stock: film, format, workingEI: ei, processing, pushPull, notes });
          onDone();
        }}
      >
        {current ? 'Yes — load new roll' : 'Load roll'}
      </Button>
    </div>
  );
}

/** Active roll for a camera: Rate My Film inline, details, finish, load new. */
export function RollManager({ camera, onClose }: { camera: CameraProfile; onClose: () => void }) {
  const doc = useDoc((d) => d);
  const roll = activeRoll(doc, camera.id);
  const [loading, setLoading] = useState(!roll);
  const history = doc.rolls.filter((r) => r.cameraId === camera.id).reverse();

  if (loading || !roll) return <NewRollForm camera={camera} onDone={() => setLoading(false)} />;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3">
          <div className="size-16 overflow-hidden rounded-xl">
            <FilmArt stock={roll.stock} format={roll.format} />
          </div>
          <div>
            <div className="text-xs text-dim">
              Roll #{roll.rollNumber} · loaded {new Date(roll.loadedAt).toLocaleDateString()}
            </div>
            <div className="font-semibold">{displayName(roll.stock)}</div>
            <div className="text-sm text-muted">
              {FORMAT_LABEL[roll.format]} · {boxSpeedLabel(roll.stock)} · EI {fmtISO(roll.workingEI)}
            </div>
          </div>
        </div>
      </Card>
      <div>
        <Label>Rate my film</Label>
        <div className="mt-2">
          <EIPicker stock={roll.stock} camera={camera} ei={roll.workingEI} pushPull={roll.pushPull} onChange={(e, p) => setWorkingEI(roll.id, e, p)} />
        </div>
      </div>
      <Field label="Processing preference">
        <select className={inputClass} value={roll.processing} onChange={(e) => updateRoll(roll.id, { processing: e.target.value })}>
          {PROCESSING.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Field>
      <Field label="Notes">
        <input className={inputClass} value={roll.notes} onChange={(e) => updateRoll(roll.id, { notes: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setLoading(true)}>
          Load new roll
        </Button>
        <Button
          kind="danger"
          className="flex-1"
          onClick={() => {
            finishRoll(roll.id);
            onClose();
          }}
        >
          Finish roll
        </Button>
      </div>
      {history.length > 1 && (
        <div>
          <Label>Roll history</Label>
          {history.map((r) => (
            <Row
              key={r.id}
              label={`#${r.rollNumber} · ${new Date(r.loadedAt).toLocaleDateString()}`}
              value={`${displayName(r.stock)} @ EI ${fmtISO(r.workingEI)} · ${processingLabel(r.pushPull)}${r.finishedAt ? '' : ' · loaded'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
