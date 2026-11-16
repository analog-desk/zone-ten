import { useState } from 'react';
import { Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { ALL_TEMPLATES, FORMAT_LABEL, boxSpeedLabel, displayName, fmtISO, lensSummary, sortedApertures, sortedSpeeds, speedLabel, type CameraProfile } from '../engine';
import { CameraArt } from '../components/art';
import { CameraEditor } from '../components/CameraEditor';
import { RollManager } from '../components/RollSheet';
import { Button, Card, Sheet, cx } from '../components/ui';
import { cameraFromTemplate, deleteCamera, saveCamera, setActiveCamera } from '../state/actions';
import { activeRoll, uid, useDoc } from '../state/store';
import { CameraSpecs } from './Onboarding';

export function Profiles() {
  const doc = useDoc((d) => d);
  const [editing, setEditing] = useState<CameraProfile | null>(null);
  const [adding, setAdding] = useState(false);
  const [rollFor, setRollFor] = useState<CameraProfile | null>(null);
  const [details, setDetails] = useState<CameraProfile | null>(null);

  return (
    <div className="space-y-3 px-3 pb-6 pt-2">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Cameras</h1>
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} /> Add camera
        </Button>
      </div>
      {doc.cameras.map((c) => {
        const roll = activeRoll(doc, c.id);
        const active = c.id === doc.activeCameraId;
        const aps = sortedApertures(c);
        const sps = sortedSpeeds(c);
        return (
          <Card key={c.id} className={cx('overflow-hidden p-0', active && 'border-accent')}>
            <button type="button" className="block h-36 w-full" onClick={() => setDetails(c)} aria-label={`${c.name} details`}>
              <CameraArt templateId={c.templateId} photo={c.photo} />
            </button>
            <div className="p-4">
              <div className="flex items-start gap-2">
                <div className="mr-auto">
                  <div className="font-display text-xl font-semibold">{c.name}</div>
                  <div className="text-sm text-muted">
                    {FORMAT_LABEL[c.format]} · {c.mount || 'no mount set'}
                  </div>
                </div>
                {active ? (
                  <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-xs font-bold text-accent-ink">
                    <Check size={13} /> In use
                  </span>
                ) : (
                  <Button onClick={() => setActiveCamera(c.id)}>Use</Button>
                )}
              </div>
              <div className="mt-2 text-sm text-muted">{lensSummary(c)}</div>
              <div className="text-sm text-muted tnum">
                {sps[0] ? speedLabel(sps[0]) : '—'} – {sps.at(-1) ? speedLabel(sps.at(-1)!) : '—'}
                {c.bulb ? ' + B' : ''} · {aps.length} apertures · ISO {fmtISO(c.isoMin)}–{fmtISO(c.isoMax)}
              </div>
              {c.isoPerShot ? (
                <div className="mt-3 rounded-xl border border-line bg-raise px-3 py-2 text-sm text-muted">Digital — ISO is chosen for each shot, no film to load.</div>
              ) : (
              <button type="button" onClick={() => setRollFor(c)} className="mt-3 w-full rounded-xl border border-line bg-raise px-3 py-2 text-left text-sm">
                {roll ? (
                  <>
                    <span className="text-dim">Roll #{roll.rollNumber}: </span>
                    {displayName(roll.stock)} · {boxSpeedLabel(roll.stock)} · <span className="text-accent">EI {fmtISO(roll.workingEI)}</span>
                  </>
                ) : (
                  <span className="text-accent">Load film…</span>
                )}
              </button>
              )}
              <div className="mt-2 flex gap-2">
                <Button kind="ghost" onClick={() => setEditing(c)}>
                  <Pencil size={15} /> Edit
                </Button>
                <Button kind="ghost" onClick={() => saveCamera({ ...structuredClone(c), id: uid(), name: `${c.name} (copy)` }, false)}>
                  <Copy size={15} /> Duplicate
                </Button>
                <Button
                  kind="ghost"
                  className="ml-auto text-critical"
                  onClick={() => {
                    if (confirm(`Remove ${c.name}? Rolls and saved readings are kept.`)) deleteCamera(c.id);
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          </Card>
        );
      })}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a camera">
        <div className="space-y-2">
          {ALL_TEMPLATES.map((t) => {
            const c = t();
            return (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center gap-3 overflow-hidden rounded-xl border border-line text-left"
                onClick={() => {
                  setAdding(false);
                  setEditing(cameraFromTemplate(c));
                }}
              >
                <div className="h-16 w-24 shrink-0">
                  <CameraArt templateId={c.templateId} />
                </div>
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-dim">
                    {FORMAT_LABEL[c.format]} {c.mount ? `· ${c.mount}` : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.name}` : ''} full>
        {editing && (
          <CameraEditor
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(c) => {
              saveCamera(c, !doc.activeCameraId || doc.activeCameraId === c.id);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
      <Sheet open={!!rollFor} onClose={() => setRollFor(null)} title={rollFor ? `Film in the ${rollFor.name}` : ''} full>
        {rollFor && <RollManager camera={rollFor} onClose={() => setRollFor(null)} />}
      </Sheet>
      <Sheet open={!!details} onClose={() => setDetails(null)} title={details?.name ?? ''}>
        {details && <CameraSpecs c={details} />}
      </Sheet>
    </div>
  );
}
