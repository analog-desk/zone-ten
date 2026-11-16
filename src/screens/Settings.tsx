import { useState } from 'react';
import { ChevronRight, Download, Upload } from 'lucide-react';
import {
  PATH_LABEL,
  ap,
  apertureScale,
  diffSummary,
  fmtStops,
  fmtTime,
  isValidated,
  mergeCatalog,
  referenceEV,
  shutterScale,
  suggestOffset,
  type CalibrationProfile,
  type CatalogDiff,
  type FilmCatalog,
  type MeasurementPath,
  type StopIncrement,
} from '../engine';
import { Button, Card, Field, Label, Notice, Row, Segmented, Sheet, Stepper, Toggle, cx, inputClass } from '../components/ui';
import { deleteCalibration, saveCalibration } from '../state/actions';
import { imgGet, imgKeys, imgSet } from '../state/db';
import { useLastRaw } from '../state/measurement';
import { catalogOf, getDoc, replaceDoc, uid, update, useDoc, type DBDoc } from '../state/store';

export function Settings({ onClose }: { onClose: () => void }) {
  const doc = useDoc((d) => d);
  const p = doc.prefs;
  const [panel, setPanel] = useState<null | 'calibration' | 'catalog' | 'guide' | 'accuracy' | 'iphone'>(null);
  const setPref = <K extends keyof DBDoc['prefs']>(k: K, v: DBDoc['prefs'][K]) =>
    update((d) => {
      d.prefs[k] = v;
    });

  return (
    <div className="space-y-4">
      <section>
        <Label>Exposure increments</Label>
        <div className="mt-2">
          <Segmented<StopIncrement>
            label="Stop increments"
            value={p.increment}
            onChange={(v) => setPref('increment', v)}
            options={[
              { value: 1, label: 'Full' },
              { value: 2, label: '½' },
              { value: 3, label: '⅓' },
            ]}
          />
        </div>
        <p className="mt-1 text-xs text-dim">Used for compensation, EI choices and the recommended (standard-scale) exposure. Camera-supported settings always follow your camera profile.</p>
      </section>

      <section>
        <Label>Display</Label>
        <Toggle checked={p.highContrast} onChange={(v) => setPref('highContrast', v)} label="High contrast" hint="Brighter secondary text for bright sunlight" />
        <Toggle checked={p.nightMode} onChange={(v) => setPref('nightMode', v)} label="Night red" hint="Red display that keeps your eyes dark-adapted" />
      </section>

      <section>
        <Label>Measurement</Label>
        <MenuRow title="iPhone setup (shortcut)" detail="needed on iPhone" onClick={() => setPanel('iphone')} />
        <MenuRow title="Calibration" detail={doc.calibrations.length ? `${doc.calibrations.length} profile(s)` : 'Uncalibrated'} onClick={() => setPanel('calibration')} />
        <MenuRow title="Calibration guide" onClick={() => setPanel('guide')} />
        <MenuRow title="How accurate is this?" onClick={() => setPanel('accuracy')} />
        <Field label="Phone lens f-number (for live metering)" hint="Learned automatically from your first metering photo.">
          <input className={inputClass} inputMode="decimal" value={p.phoneFNumber ?? ''} onChange={(e) => setPref('phoneFNumber', Number(e.target.value) || null)} placeholder="e.g. 1.78" />
        </Field>
        <Field label="Incident diffuser accessory" hint="Register a diffuser dome/cap you fit over the phone camera. Incident metering unlocks once a calibration with ≥3 consistent comparisons exists for it.">
          <input className={inputClass} value={p.incidentAccessory} onChange={(e) => setPref('incidentAccessory', e.target.value)} placeholder="Name, e.g. white dome cap" />
        </Field>
        <Field label="Star-point rule">
          <Segmented label="Astro rule" small value={p.astroRule} onChange={(v) => setPref('astroRule', v)} options={[500, 400, 300].map((v) => ({ value: v, label: `${v}` }))} />
        </Field>
      </section>

      <section>
        <Label>Data</Label>
        <MenuRow title="Film catalog updates" detail={`v${catalogOf(doc).catalogVersion}`} onClick={() => setPanel('catalog')} />
        <BackupRow />
        <MenuRow
          title="Run setup again"
          onClick={() => {
            update((d) => {
              d.onboardingComplete = false;
            });
            onClose();
          }}
        />
      </section>

      <p className="text-center text-xs text-dim">Zone Ten · works offline · data stays on this device</p>

      <Sheet open={panel === 'calibration'} onClose={() => setPanel(null)} title="Calibration" full>
        <CalibrationPanel />
      </Sheet>
      <Sheet open={panel === 'catalog'} onClose={() => setPanel(null)} title="Film catalog updates" full>
        <CatalogPanel />
      </Sheet>
      <Sheet open={panel === 'iphone'} onClose={() => setPanel(null)} title="iPhone setup" full>
        <IPhoneSetup />
      </Sheet>
      <Sheet open={panel === 'guide'} onClose={() => setPanel(null)} title="Calibration guide" full>
        <Guide />
      </Sheet>
      <Sheet open={panel === 'accuracy'} onClose={() => setPanel(null)} title="Accuracy" full>
        <Accuracy />
      </Sheet>
    </div>
  );
}

function MenuRow({ title, detail, onClick }: { title: string; detail?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-2 border-b border-line text-left">
      <span className="mr-auto">{title}</span>
      {detail && <span className="text-sm text-dim">{detail}</span>}
      <ChevronRight size={16} className="text-dim" />
    </button>
  );
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  const m = ua.match(/Android [\d.]+; ([^;)]+)/);
  return m?.[1]?.trim() ?? 'This device';
}

function CalibrationPanel() {
  const doc = useDoc((d) => d);
  const [editing, setEditing] = useState<CalibrationProfile | null>(null);
  if (editing) return <CalibrationEditor initial={doc.calibrations.find((c) => c.id === editing.id) ?? editing} onDone={() => setEditing(null)} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Calibrate against a trusted handheld meter. Each measurement path (photo, live, incident accessory) has its own offset because each turns pixels into light differently.
      </p>
      {(['photoReflected', 'liveReflected', 'incidentDiffuser'] as MeasurementPath[]).map((path) => {
        const list = doc.calibrations.filter((c) => c.path === path);
        return (
          <Card key={path}>
            <Label>{PATH_LABEL[path]}</Label>
            {list.map((c) => {
              const active = doc.activeCalibration[path] === c.id;
              return (
                <button key={c.id} type="button" onClick={() => setEditing(c)} className="flex w-full items-center justify-between py-2 text-left">
                  <span>
                    <span className="block font-medium">
                      {c.name} {active && <span className="text-xs text-accent">· active</span>}
                    </span>
                    <span className="text-xs text-dim">
                      {c.device} · {c.comparisons.length} comparison(s) {isValidated(c) ? '· consistent' : ''}
                    </span>
                  </span>
                  <span className="font-display font-semibold tnum">{fmtStops(c.offsetTenths / 10)}</span>
                </button>
              );
            })}
            <Button
              className="mt-2 w-full"
              onClick={() =>
                setEditing({ id: uid(), name: `${deviceName()} ${PATH_LABEL[path].split(' · ')[1] ?? ''}`.trim(), device: deviceName(), path, offsetTenths: 0, comparisons: [], createdAt: new Date().toISOString() })
              }
            >
              New profile
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

const REF_APERTURES = apertureScale(3, 1, 64);
const REF_SPEEDS = shutterScale(3, 1 / 8000, 30);

function CalibrationEditor({ initial, onDone }: { initial: CalibrationProfile; onDone: () => void }) {
  const doc = useDoc((d) => d);
  const raw = useLastRaw();
  const [c, setC] = useState<CalibrationProfile>(initial);
  const [refMode, setRefMode] = useState<'ev' | 'settings'>('settings');
  const [refEV, setRefEV] = useState('');
  const [iso, setISO] = useState(100);
  const [apN, setApN] = useState(8);
  const [t, setT] = useState(1 / 125);
  const [meterName, setMeterName] = useState('Reference meter');
  const [note, setNote] = useState('');
  const s = suggestOffset(c.comparisons);
  const usableRaw = raw && raw.path === c.path && Date.now() - raw.at < 10 * 60 * 1000 ? raw : null;
  const reference = refMode === 'ev' ? parseFloat(refEV) : referenceEV(iso, REF_APERTURES.find((a) => a.nominal === apN) ?? ap(apN), REF_SPEEDS.find((x) => Math.abs(x.nominal - t) < 1e-9)?.exact ?? t);
  const save = (next: CalibrationProfile, active = false) => {
    setC(next);
    saveCalibration(next, active);
  };
  return (
    <div className="space-y-3">
      <Field label="Profile name">
        <input className={inputClass} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} onBlur={() => save(c)} />
      </Field>
      <Row label="Path" value={PATH_LABEL[c.path]} />
      <Row label="Device" value={c.device} />
      <div className="flex items-center justify-between">
        <span>Offset</span>
        <Stepper value={c.offsetTenths / 10} onChange={(v) => save({ ...c, offsetTenths: Math.round(v * 10) })} step={0.1} min={-3} max={3} format={(v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`} />
      </div>
      <Card>
        <Label>Add a comparison</Label>
        <p className="mt-1 text-sm text-muted">Meter the same evenly-lit subject (a grey card fills the spot) with Zone Ten and your reference meter, then record both here.</p>
        <Row label="Zone Ten reading (uncalibrated)" value={usableRaw ? `EV ${usableRaw.raw.toFixed(2)}` : 'measure on the Meter tab'} tone={usableRaw ? undefined : 'warn'} />
        {usableRaw && <p className="text-xs text-dim">{usableRaw.label}</p>}
        <div className="mt-2">
          <Segmented
            small
            label="Reference input"
            value={refMode}
            onChange={setRefMode}
            options={[
              { value: 'settings', label: 'ISO · f · time' },
              { value: 'ev', label: 'EV₁₀₀' },
            ]}
          />
        </div>
        {refMode === 'ev' ? (
          <Field label="Reference EV at ISO 100">
            <input className={inputClass} inputMode="decimal" value={refEV} onChange={(e) => setRefEV(e.target.value)} />
          </Field>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Field label="ISO">
              <input className={inputClass} inputMode="numeric" value={iso} onChange={(e) => setISO(Number(e.target.value) || 100)} />
            </Field>
            <Field label="Aperture">
              <select className={inputClass} value={apN} onChange={(e) => setApN(Number(e.target.value))}>
                {REF_APERTURES.map((a) => (
                  <option key={a.exact} value={a.nominal}>
                    f/{a.nominal}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Time">
              <select className={inputClass} value={t} onChange={(e) => setT(Number(e.target.value))}>
                {REF_SPEEDS.map((x) => (
                  <option key={x.exact} value={x.nominal}>
                    {fmtTime(x.nominal)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Reference meter">
            <input className={inputClass} value={meterName} onChange={(e) => setMeterName(e.target.value)} />
          </Field>
          <Field label="Scene">
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Daylight shade, grey card" />
          </Field>
        </div>
        <Button
          kind="primary"
          className="mt-2 w-full"
          disabled={!usableRaw || !Number.isFinite(reference)}
          onClick={() => {
            save({ ...c, comparisons: [...c.comparisons, { id: uid(), date: new Date().toISOString(), phoneEV: usableRaw!.raw, referenceEV: reference, referenceMeter: meterName, note }] });
            setNote('');
          }}
        >
          Add comparison {Number.isFinite(reference) ? `(ref EV ${reference.toFixed(1)})` : ''}
        </Button>
      </Card>
      {c.comparisons.length > 0 && (
        <Card>
          <Label>Comparisons</Label>
          {c.comparisons.map((x) => (
            <div key={x.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="mr-auto">
                {new Date(x.date).toLocaleDateString()} · {x.note || x.referenceMeter}
              </span>
              <span className="tnum text-muted">
                {x.phoneEV.toFixed(1)} → {x.referenceEV.toFixed(1)}
              </span>
              <span className={cx('w-12 text-right tnum', Math.abs(x.referenceEV - x.phoneEV - c.offsetTenths / 10) > 0.3 ? 'text-caution' : 'text-ok')}>{fmtStops(x.referenceEV - x.phoneEV)}</span>
              <button type="button" className="text-critical" onClick={() => save({ ...c, comparisons: c.comparisons.filter((y) => y.id !== x.id) })} aria-label="Remove comparison">
                ×
              </button>
            </div>
          ))}
          <Row label="Suggested offset" value={`${fmtStops(s.tenths / 10)} (spread ±${s.sd.toFixed(2)})`} tone={s.consistent ? 'ok' : 'warn'} />
          {!s.consistent && <p className="text-xs text-dim">Add at least 3 comparisons in different light; they should agree within ±0.3 stop.</p>}
          <Button className="mt-2 w-full" onClick={() => save({ ...c, offsetTenths: s.tenths })}>
            Apply suggested offset
          </Button>
        </Card>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Button kind="primary" onClick={() => save(c, true)}>
          {doc.activeCalibration[c.path] === c.id ? 'Active ✓' : 'Use'}
        </Button>
        <Button onClick={() => save({ ...c, offsetTenths: 0, comparisons: [] })}>Reset</Button>
        <Button
          kind="danger"
          onClick={() => {
            deleteCalibration(c.id);
            onDone();
          }}
        >
          Delete
        </Button>
      </div>
      <Button kind="ghost" className="w-full" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

function CatalogPanel() {
  const doc = useDoc((d) => d);
  const current = catalogOf(doc);
  const [pending, setPending] = useState<{ catalog: FilmCatalog; diff: CatalogDiff } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = (text: string) => {
    setErr(null);
    try {
      setPending(mergeCatalog(current, JSON.parse(text) as FilmCatalog));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="space-y-3">
      <Row label="Installed catalog" value={`v${current.catalogVersion} · ${current.publishedAt}`} />
      <Row label="Stocks" value={`${current.stocks.length} + ${doc.customStocks.length} custom`} />
      <p className="text-sm text-muted">
        Updates add verified new releases and mark discontinued or announced products. Nothing is ever removed, so old rolls and sessions keep their film. Updates are optional; the meter never needs a connection.
      </p>
      <Field label="Update URL (HTTPS JSON)">
        <input
          className={inputClass}
          value={doc.prefs.catalogURL}
          onChange={(e) =>
            update((d) => {
              d.prefs.catalogURL = e.target.value;
            })
          }
          placeholder="https://…/film_catalog.json"
        />
      </Field>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!doc.prefs.catalogURL.startsWith('https://') || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await fetch(doc.prefs.catalogURL, { cache: 'no-store' });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              preview(await r.text());
            } catch (e) {
              setErr(`Could not fetch the catalog: ${(e as Error).message}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          Check for update
        </Button>
        <label className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-line bg-raise font-semibold">
          Import file
          <input type="file" accept="application/json,.json" hidden onChange={async (e) => e.target.files?.[0] && preview(await e.target.files[0].text())} />
        </label>
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      {pending && (
        <Card>
          <Label>Update to v{pending.catalog.catalogVersion}</Label>
          {diffSummary(pending.diff).map((l) => (
            <p key={l} className="mt-1 text-sm">
              {l}
            </p>
          ))}
          <div className="mt-3 flex gap-2">
            <Button kind="ghost" className="flex-1" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              kind="primary"
              className="flex-1"
              onClick={() => {
                update((d) => {
                  d.catalog = pending.catalog;
                });
                setPending(null);
              }}
            >
              Apply
            </Button>
          </div>
        </Card>
      )}
      {doc.catalog && (
        <Button
          kind="ghost"
          className="w-full"
          onClick={() =>
            update((d) => {
              d.catalog = null;
            })
          }
        >
          Revert to the bundled catalog
        </Button>
      )}
    </div>
  );
}

function BackupRow() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="border-b border-line py-2">
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={async () => {
            const images: Record<string, string> = {};
            for (const k of await imgKeys()) {
              const b = await imgGet(String(k));
              if (b)
                images[String(k)] = await new Promise<string>((res) => {
                  const r = new FileReader();
                  r.onload = () => res(r.result as string);
                  r.readAsDataURL(b);
                });
            }
            const blob = new Blob([JSON.stringify({ app: 'zone-ten', exportedAt: new Date().toISOString(), doc: getDoc(), images })], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `zone-ten-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
          }}
        >
          <Download size={16} /> Back up
        </Button>
        <label className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-raise font-semibold">
          <Upload size={16} /> Restore
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const data = JSON.parse(await f.text()) as { app?: string; doc?: DBDoc; images?: Record<string, string> };
                if (data.app !== 'zone-ten' || !data.doc || data.doc.version !== 1) throw new Error('Not a Zone Ten backup.');
                if (!confirm('Replace all cameras, rolls, sessions and calibrations on this device with the backup?')) return;
                for (const [k, v] of Object.entries(data.images ?? {})) await imgSet(k, await (await fetch(v)).blob());
                replaceDoc(data.doc);
                setMsg('Backup restored.');
              } catch (err) {
                setMsg((err as Error).message);
              }
            }}
          />
        </label>
      </div>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </div>
  );
}

function Guide() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted">
      <p>You need a handheld meter you trust (ideally one recently checked) and an evenly lit, matte, mid-tone target — an 18% grey card is ideal.</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Set the reference meter to reflected (or spot) mode, ISO 100, and meter the card. Note its EV, or its ISO / aperture / time.</li>
        <li>
          On the Meter tab use <b>Spot</b>, place the spot on the card filling it, and take a metering photo (for the photo profile) or hold steady in Live (for the live profile).
        </li>
        <li>Open Settings → Calibration → the matching profile → Add comparison. The latest uncalibrated Zone Ten reading is filled in; enter the reference values.</li>
        <li>Repeat in at least three different light levels: open shade, indoor window light, and a dim interior. Avoid mixed light and glare on the card.</li>
        <li>Apply the suggested offset. If the spread is larger than ±0.3 stop, check for glare, a moving subject, or a scene near the reliability limits and redo those comparisons.</li>
        <li>For incident metering, register your diffuser in Settings, fit it over the camera, point it from the subject toward the light, and compare against the reference meter in incident mode.</li>
      </ol>
      <p>Calibrate again after a phone OS update or if you start using a different phone or camera module.</p>
    </div>
  );
}

function Accuracy() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted">
      <p>
        <b className="text-fg">Photo metering</b> reads the shutter time, aperture and ISO the phone camera actually used (EXIF) and the pixels of the metered area, linearised from sRGB. The phone's auto-exposure only decides where the picture sits; the reading is computed from the pixels and that metadata:
      </p>
      <p className="rounded-xl bg-raise p-3 font-mono text-xs text-fg">EV₁₀₀ = log₂(N²/t) − log₂(ISO/100) + log₂(Y/0.18) + calibration</p>
      <p>
        Phones apply tone curves and local HDR processing to JPEGs, so areas much brighter or darker than what the phone exposed for carry larger errors — Zone Ten flags them. For important readings, make the metered area the main subject of the photo.
      </p>
      <p>
        <b className="text-fg">Live metering</b> needs the browser to report and accept manual exposure time and ISO (Chrome on Android generally does; Safari on iPhone does not). Zone Ten then drives the exposure so the metered area sits near mid-grey, which minimises tone-curve error.
      </p>
      <p>
        <b className="text-fg">Not yet validated.</b> Until you have calibrated against a reference meter, treat readings as uncalibrated estimates. Zone Ten does not claim professional accuracy until your own comparisons show it.
      </p>
      <p>
        <b className="text-fg">Incident</b> metering is only offered with a registered diffuser accessory and a consistent calibration — a phone camera is not an incident meter on its own.
      </p>
    </div>
  );
}

function IPhoneSetup() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted">
      <p>
        Safari removes the shutter time, aperture and ISO from photos taken inside a web page, and the meter needs them. A two-minute
        Shortcut hands Zone Ten the original photo instead. You build it once.
      </p>
      <Card>
        <Label>Build the shortcut</Label>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>Open the <b className="text-fg">Shortcuts</b> app → <b className="text-fg">+</b>. Name it “Zone Ten”.</li>
          <li>
            Add <b className="text-fg">Get Latest Photos</b>: Get <b className="text-fg">1</b> latest photo, Include Screenshots <b className="text-fg">off</b>.
          </li>
          <li>
            Add <b className="text-fg">Convert Image</b>: convert Photos to <b className="text-fg">JPEG</b>, quality about <b className="text-fg">50%</b>, and turn{' '}
            <b className="text-fg">Preserve Metadata on</b> (tap the arrow to see it).
          </li>
          <li>
            Add <b className="text-fg">Base64 Encode</b> on the converted image, Line Breaks <b className="text-fg">None</b>.
          </li>
          <li>
            Add <b className="text-fg">Copy to Clipboard</b>.
          </li>
          <li>Optional: add <b className="text-fg">Show Notification</b> “Ready — tap Paste in Zone Ten”.</li>
        </ol>
      </Card>
      <Card>
        <Label>Each reading</Label>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>Take the metering photo with the normal <b className="text-fg">Camera</b> app.</li>
          <li>Run the <b className="text-fg">Zone Ten</b> shortcut (home-screen icon, widget, or Back Tap: Settings → Accessibility → Touch → Back Tap).</li>
          <li>
            Open Zone Ten → <b className="text-fg">Paste from shortcut</b> → tap <b className="text-fg">Paste</b> when iPhone asks.
          </li>
        </ol>
      </Card>
      <p>
        Every photo shows a “Photo check” line (shutter ✓ aperture ✓ ISO ✓). If one shows ✗, that step removed the data — check that Preserve Metadata is
        on. Saving the photo to Files and using “From Files / library” works too.
      </p>
    </div>
  );
}
