import { useSyncExternalStore } from 'react';
import { BUNDLED_CATALOG } from '../data/catalog';
import {
  initialState,
  snapToCamera,
  type CalibrationProfile,
  type CameraProfile,
  type FilmCatalog,
  type FilmFormat,
  type FilmStock,
  type Goal,
  type MeasurementPath,
  type MeterState,
  type MeteringMode,
  type StopIncrement,
} from '../engine';
import { kvGet, kvSet } from './db';

export interface Roll {
  id: string;
  cameraId: string;
  cameraName: string;
  /** Snapshot of the stock at load time — unaffected by later catalog changes. */
  stock: FilmStock;
  format: FilmFormat;
  workingEI: number;
  rollNumber: number;
  loadedAt: string;
  processing: string;
  pushPull: number;
  notes: string;
  finishedAt: string | null;
}

export interface Session {
  id: string;
  name: string;
  createdAt: string;
  goal: Goal | null;
  customGoal: string;
  notes: string;
}

export interface Reading {
  id: string;
  sessionId: string;
  date: string;
  hasImage: boolean;
  goal: string;
  cameraName: string;
  lens: string;
  filmName: string;
  filmFormat: string;
  boxSpeed: string;
  workingEI: number;
  ev100: number;
  metered: string;
  aperture: string;
  shutter: string;
  compensation: number;
  filterStops: number;
  meteringMode: string;
  path: string;
  calibrationName: string;
  calibrationOffset: number;
  reciprocity: string | null;
  source: string;
  notes: string;
}

export interface Prefs {
  increment: StopIncrement;
  meteringMode: MeteringMode;
  spotDiameter: number;
  highContrast: boolean;
  nightMode: boolean;
  astroRule: number;
  catalogURL: string;
  /** Registered diffuser accessory for incident metering ('' = none). */
  incidentAccessory: string;
  /** Phone lens f-number for live metering (learned from photo EXIF, editable). */
  phoneFNumber: number | null;
  activeSessionId: string | null;
}

export interface DBDoc {
  version: 1;
  onboardingComplete: boolean;
  goal: Goal | null;
  customGoal: string;
  goalConfirmedOn: string | null;
  cameras: CameraProfile[];
  activeCameraId: string | null;
  rolls: Roll[];
  lastFilmByCamera: Record<string, string>;
  customStocks: FilmStock[];
  catalog: FilmCatalog | null;
  sessions: Session[];
  readings: Reading[];
  calibrations: CalibrationProfile[];
  activeCalibration: Partial<Record<MeasurementPath, string>>;
  meterByCamera: Record<string, MeterState>;
  prefs: Prefs;
}

export const emptyDoc = (): DBDoc => ({
  version: 1,
  onboardingComplete: false,
  goal: null,
  customGoal: '',
  goalConfirmedOn: null,
  cameras: [],
  activeCameraId: null,
  rolls: [],
  lastFilmByCamera: {},
  customStocks: [],
  catalog: null,
  sessions: [],
  readings: [],
  calibrations: [],
  activeCalibration: {},
  meterByCamera: {},
  prefs: {
    increment: 3,
    meteringMode: 'centerWeighted',
    spotDiameter: 0.06,
    highContrast: false,
    nightMode: false,
    astroRule: 500,
    catalogURL: '',
    incidentAccessory: '',
    phoneFNumber: null,
    activeSessionId: null,
  },
});

// --- tiny external store -------------------------------------------------------------------------------

let doc: DBDoc = emptyDoc();
let loaded = false;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emit() {
  listeners.forEach((l) => l());
}

export async function loadDoc() {
  try {
    const saved = await kvGet<DBDoc>('db');
    if (saved && saved.version === 1) doc = { ...emptyDoc(), ...saved, prefs: { ...emptyDoc().prefs, ...saved.prefs } };
  } catch {
    /* first run or storage unavailable */
  }
  loaded = true;
  emit();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const prev = await kvGet<DBDoc>('db');
      if (prev) await kvSet('db:prev', prev);
      await kvSet('db', doc);
    } catch {
      /* storage full or unavailable */
    }
  }, 250);
}

export function update(fn: (d: DBDoc) => DBDoc | void) {
  const draft = structuredClone(doc);
  const next = fn(draft) ?? draft;
  doc = next;
  scheduleSave();
  emit();
}

export function replaceDoc(d: DBDoc) {
  doc = { ...emptyDoc(), ...d, prefs: { ...emptyDoc().prefs, ...d.prefs } };
  scheduleSave();
  emit();
}

export const getDoc = () => doc;
export const isLoaded = () => loaded;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Re-renders on any change; derive with the selector (cheap at this app's size). */
export function useDoc<T>(selector: (d: DBDoc) => T): T {
  const d = useSyncExternalStore(subscribe, () => doc);
  return selector(d);
}
export const useLoaded = () => useSyncExternalStore(subscribe, () => loaded);

// --- derived ---------------------------------------------------------------------------------------------

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export function catalogOf(d: DBDoc): FilmCatalog {
  const base = d.catalog && d.catalog.catalogVersion >= BUNDLED_CATALOG.catalogVersion ? d.catalog : BUNDLED_CATALOG;
  // Never lose stocks introduced by a newer app build.
  const stocks = [...base.stocks];
  for (const s of BUNDLED_CATALOG.stocks) if (!stocks.some((x) => x.id === s.id)) stocks.push(s);
  return { ...base, stocks };
}

export function allStocks(d: DBDoc): FilmStock[] {
  return [...catalogOf(d).stocks, ...d.customStocks];
}

export const activeCamera = (d: DBDoc) => d.cameras.find((c) => c.id === d.activeCameraId) ?? d.cameras[0] ?? null;
export const activeRoll = (d: DBDoc, cameraId: string | null | undefined) =>
  cameraId ? ([...d.rolls].reverse().find((r) => r.cameraId === cameraId && !r.finishedAt) ?? null) : null;

export function meterStateFor(d: DBDoc, camera: CameraProfile, workingEI: number): MeterState {
  const saved = d.meterByCamera[camera.id];
  return snapToCamera(saved ?? initialState(camera, workingEI), camera, workingEI);
}

export function activeCalibration(d: DBDoc, path: MeasurementPath): CalibrationProfile | null {
  const id = d.activeCalibration[path];
  return d.calibrations.find((c) => c.id === id) ?? null;
}

export function goalNeedsConfirmation(d: DBDoc): boolean {
  if (!d.onboardingComplete) return false;
  if (!d.goalConfirmedOn) return true;
  return new Date(d.goalConfirmedOn).toDateString() !== new Date().toDateString();
}

/** Today's session, created on demand. */
export function ensureSession(d: DBDoc): string {
  const existing = d.sessions.find((s) => s.id === d.prefs.activeSessionId);
  if (existing && new Date(existing.createdAt).toDateString() === new Date().toDateString()) return existing.id;
  const date = new Date();
  const goalName = d.goal ? d.goal : 'standard';
  const s: Session = {
    id: uid(),
    name: `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.goal === 'other' && d.customGoal ? d.customGoal : labelForGoal(goalName)}`,
    createdAt: date.toISOString(),
    goal: d.goal,
    customGoal: d.customGoal,
    notes: '',
  };
  d.sessions.push(s);
  d.prefs.activeSessionId = s.id;
  return s.id;
}

function labelForGoal(g: string): string {
  return g === 'standard' ? 'Standard' : g.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
