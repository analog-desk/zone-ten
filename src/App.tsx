import { useEffect, useState } from 'react';
import { Aperture, Camera, Film, NotebookPen, Settings as Gear, Wrench } from 'lucide-react';
import { Sheet, cx } from './components/ui';
import { FilmLibrary } from './screens/FilmLibrary';
import { FilmTools } from './screens/FilmTools';
import { Shoot } from './screens/Shoot';
import { Onboarding } from './screens/Onboarding';
import { Profiles } from './screens/Profiles';
import { Sessions } from './screens/Sessions';
import { Settings } from './screens/Settings';
import { persistStorage } from './state/db';
import { loadDoc, useDoc, useLoaded } from './state/store';

type Tab = 'meter' | 'profiles' | 'films' | 'tools' | 'sessions';
const TABS: { id: Tab; label: string; icon: typeof Camera }[] = [
  { id: 'meter', label: 'Shoot', icon: Aperture },
  { id: 'profiles', label: 'Profiles', icon: Camera },
  { id: 'films', label: 'Film Library', icon: Film },
  { id: 'tools', label: 'Film Tools', icon: Wrench },
  { id: 'sessions', label: 'Sessions', icon: NotebookPen },
];

export function App() {
  const loaded = useLoaded();
  const doc = useDoc((d) => d);
  const [tab, setTab] = useState<Tab>('meter');
  const [settings, setSettings] = useState(false);
  /** Bumped by the logo: remounts the Shoot flow at its first step. */
  const [restart, setRestart] = useState(0);

  useEffect(() => {
    loadDoc();
    persistStorage();
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  const themeClass = cx(doc.prefs.highContrast && 'hc', doc.prefs.nightMode && 'night');
  if (!loaded) return <div className="min-h-full bg-bg" />;
  if (!doc.onboardingComplete || !doc.cameras.length)
    return (
      <div className={cx('min-h-full', themeClass)}>
        <Onboarding />
      </div>
    );

  return (
    <div className={cx('mx-auto flex min-h-full max-w-xl flex-col', themeClass)}>
      <header className="safe-top sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex h-12 items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => {
              setTab('meter');
              setRestart((n) => n + 1);
            }}
            className="mr-auto font-display text-lg font-bold tracking-wide"
            aria-label="Vaaro Light Meter — start again from What are you shooting today?"
          >
            Vaaro <span className="text-accent">Light Meter</span>
          </button>
          <button type="button" onClick={() => setSettings(true)} className="flex size-10 items-center justify-center rounded-full border border-line bg-surface" aria-label="Settings">
            <Gear size={18} />
          </button>
        </div>
      </header>
      <main className="flex-1 pb-24">
        {tab === 'meter' && <Shoot key={restart} goTo={setTab} />}
        {tab === 'profiles' && <Profiles />}
        {tab === 'films' && <FilmLibrary />}
        {tab === 'tools' && <FilmTools />}
        {tab === 'sessions' && <Sessions />}
      </main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur" aria-label="Sections">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold', tab === t.id ? 'text-accent' : 'text-dim')}
            >
              <t.icon size={20} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <Sheet open={settings} onClose={() => setSettings(false)} title="Settings" full>
        <Settings onClose={() => setSettings(false)} />
      </Sheet>
    </div>
  );
}
