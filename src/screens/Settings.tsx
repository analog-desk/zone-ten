import { useState } from 'react';
import { ChevronRight, Download, Upload } from 'lucide-react';
import { diffSummary, mergeCatalog, type CatalogDiff, type FilmCatalog, type StopIncrement } from '../engine';
import { Button, Card, Field, Label, Notice, Row, Segmented, Sheet, Toggle, inputClass } from '../components/ui';
import { imgGet, imgKeys, imgSet } from '../state/db';
import { catalogOf, getDoc, replaceDoc, update, useDoc, type DBDoc } from '../state/store';

export function Settings({ onClose }: { onClose: () => void }) {
  const doc = useDoc((d) => d);
  const p = doc.prefs;
  const [panel, setPanel] = useState<null | 'catalog'>(null);
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
        <Label>Astro</Label>
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

      <p className="text-center text-xs text-dim">Vaaro Light Meter · works offline · data stays on this device</p>

      <Sheet open={panel === 'catalog'} onClose={() => setPanel(null)} title="Film catalog updates" full>
        <CatalogPanel />
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
            a.download = `vaaro-light-meter-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
                if (data.app !== 'zone-ten' || !data.doc || data.doc.version !== 1) throw new Error('Not a Vaaro Light Meter backup.');
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

