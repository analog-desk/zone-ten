import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, FileDown, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { fmtISO } from '../engine';
import { Button, Card, Field, Label, Notice, Row, Sheet, inputClass } from '../components/ui';
import { sessionPDF, shareOrDownload, shareText, shareTextOrCopy } from '../lib/pdf';
import { deleteReading, deleteSession, duplicateReading, newSession, renameSession, updateReading, updateSessionNotes } from '../state/actions';
import { imgGet } from '../state/db';
import { useDoc, type Reading } from '../state/store';

function useImage(r: Reading | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let alive = true;
    if (r?.hasImage)
      imgGet(`r:${r.id}`).then((b) => {
        if (b && alive) {
          u = URL.createObjectURL(b);
          setUrl(u);
        }
      });
    else setUrl(null);
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [r?.id, r?.hasImage]);
  return url;
}

function Thumb({ r }: { r: Reading }) {
  const url = useImage(r);
  return <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-raise">{url && <img src={url} alt="" className="h-full w-full object-cover" />}</div>;
}

export function Sessions() {
  const doc = useDoc((d) => d);
  const [openId, setOpenId] = useState<string | null>(null);
  const sessions = [...doc.sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = doc.sessions.find((s) => s.id === openId) ?? null;
  if (open) return <SessionDetail id={open.id} onBack={() => setOpenId(null)} />;
  return (
    <div className="space-y-3 px-3 pb-6 pt-2">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Sessions</h1>
        <Button onClick={newSession}>
          <Plus size={16} /> New session
        </Button>
      </div>
      {!sessions.length && <Notice>Saved readings appear here, grouped by day into sessions. Use Save on the meter.</Notice>}
      {sessions.map((s) => {
        const rs = doc.readings.filter((r) => r.sessionId === s.id).sort((a, b) => a.date.localeCompare(b.date));
        return (
          <button key={s.id} type="button" onClick={() => setOpenId(s.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left">
            {rs[0] ? <Thumb r={rs[0]} /> : <div className="size-16 rounded-lg bg-raise" />}
            <div className="min-w-0">
              <div className="truncate font-semibold">{s.name}</div>
              <div className="text-sm text-muted">
                {new Date(s.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div className="text-xs text-dim">
                {rs.length} reading{rs.length === 1 ? '' : 's'}
                {s.id === doc.prefs.activeSessionId ? ' · current' : ''}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SessionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const doc = useDoc((d) => d);
  const s = doc.sessions.find((x) => x.id === id)!;
  const readings = doc.readings.filter((r) => r.sessionId === id).sort((a, b) => a.date.localeCompare(b.date));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(s.name);
  const [reading, setReading] = useState<Reading | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3 px-3 pb-6 pt-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="flex size-10 items-center justify-center rounded-full bg-raise" aria-label="Back to sessions">
          <ArrowLeft size={18} />
        </button>
        <h1 className="mr-auto truncate font-display text-xl font-semibold">{s.name}</h1>
        <button type="button" onClick={() => setRenaming(true)} className="flex size-10 items-center justify-center rounded-full bg-raise" aria-label="Rename session">
          <Pencil size={16} />
        </button>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={busy || !readings.length}
          onClick={async () => {
            setBusy(true);
            try {
              await shareOrDownload(await sessionPDF(s, readings), `${s.name.replace(/[^\w\- ]+/g, '').trim() || 'session'}.pdf`);
            } finally {
              setBusy(false);
            }
          }}
        >
          <FileDown size={16} /> {busy ? 'Building…' : 'PDF report'}
        </Button>
        <Button
          kind="danger"
          onClick={async () => {
            if (confirm(`Delete “${s.name}” and its ${readings.length} readings?`)) {
              await deleteSession(id);
              onBack();
            }
          }}
        >
          <Trash2 size={16} />
        </Button>
      </div>
      <Field label="Session notes">
        <textarea className={`${inputClass} min-h-16 py-2`} value={s.notes} onChange={(e) => updateSessionNotes(id, e.target.value)} />
      </Field>
      {readings.map((r) => (
        <button key={r.id} type="button" onClick={() => setReading(r)} className="flex w-full gap-3 rounded-2xl border border-line bg-surface p-3 text-left">
          <Thumb r={r} />
          <div className="min-w-0">
            <div className="font-display text-lg font-semibold tnum">
              {r.aperture} · {r.shutter}
            </div>
            <div className="text-sm text-muted tnum">
              EV {r.ev100.toFixed(1)} · EI {fmtISO(r.workingEI)} · {r.meteringMode}
            </div>
            <div className="truncate text-xs text-dim">
              {new Date(r.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {r.filmName} · {r.cameraName}
            </div>
            {r.notes && <div className="truncate text-xs text-muted">{r.notes}</div>}
          </div>
        </button>
      ))}
      <Sheet open={renaming} onClose={() => setRenaming(false)} title="Rename session">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          kind="primary"
          className="mt-3 w-full"
          onClick={() => {
            renameSession(id, name.trim() || s.name);
            setRenaming(false);
          }}
        >
          Save
        </Button>
      </Sheet>
      <Sheet open={!!reading} onClose={() => setReading(null)} title="Reading">
        {reading && <ReadingDetail r={doc.readings.find((x) => x.id === reading.id) ?? reading} onClose={() => setReading(null)} />}
      </Sheet>
    </div>
  );
}

function ReadingDetail({ r, onClose }: { r: Reading; onClose: () => void }) {
  const url = useImage(r);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {url && <img src={url} alt="Reference" className="w-full rounded-xl" />}
      <Card>
        <div className="font-display text-2xl font-semibold tnum">
          {r.aperture} · {r.shutter}
        </div>
        <Row label="Date" value={new Date(r.date).toLocaleString()} />
        <Row label="EV₁₀₀" value={r.ev100.toFixed(1)} />
        <Row label="Metered" value={r.metered} />
        <Row label="Metering" value={`${r.meteringMode} · ${r.path}`} />
        <Row label="Compensation" value={r.compensation ? r.compensation.toFixed(2) : '0'} />
        <Row label="Camera" value={r.cameraName} />
        <Row label="Lens" value={r.lens} />
        <Row label="Film" value={`${r.filmName} · ${r.filmFormat}`} />
        <Row label="Box speed / EI" value={`${r.boxSpeed} / EI ${fmtISO(r.workingEI)}`} />
        <Row label="Goal" value={r.goal} />
        <Row label="Calibration" value={`${r.calibrationName} (${r.calibrationOffset.toFixed(1)})`} />
        {r.reciprocity && <p className="mt-1 text-sm text-muted">{r.reciprocity}</p>}
        <p className="mt-1 text-xs text-dim">{r.source}</p>
      </Card>
      <Label>Notes</Label>
      <textarea className={`${inputClass} min-h-20 py-2`} value={r.notes} onChange={(e) => updateReading(r.id, { notes: e.target.value })} placeholder="Frame number, subject, what you intended…" />
      <div className="grid grid-cols-3 gap-2">
        <Button onClick={async () => setMsg((await shareTextOrCopy(shareText(r))) === 'copied' ? 'Copied to clipboard.' : null)}>
          <Share2 size={16} /> Share
        </Button>
        <Button
          onClick={async () => {
            await duplicateReading(r.id);
            setMsg('Duplicated.');
          }}
        >
          <Copy size={16} /> Copy
        </Button>
        <Button
          kind="danger"
          onClick={async () => {
            await deleteReading(r.id);
            onClose();
          }}
        >
          <Trash2 size={16} />
        </Button>
      </div>
      {msg && <Notice>{msg}</Notice>}
    </div>
  );
}
