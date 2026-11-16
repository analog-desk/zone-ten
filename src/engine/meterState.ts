import { sortedApertures, sortedSpeeds } from './cameras';
import { eiOptions, referenceSpeed } from './film';
import { apLabel, bulb, fmtISO, isoScale, nearest, sameAperture, sameShutter, shutterSeconds, speedLabel, timed, type StopIncrement } from './scale';
import { locksFor, modeOf, roundBulb, type ExposureInputs, type ExposureOption, type Locks, type Param, type Selection, type Solution } from './solver';
import type { CameraProfile, FilmStock } from './types';

/** Everything dialled on the meter. Pure data: persisted, tested and independent of the UI. */
export interface MeterState {
  locks: Locks;
  selection: Selection;
  compensation: number;
  filterStops: number;
  bellowsStops: number;
}

export type DialValue = { p: 'iso'; v: number } | { p: 'aperture'; v: Selection['aperture'] } | { p: 'shutter'; v: Selection['shutter'] };

export function dialLabel(d: DialValue): string {
  if (d.p === 'iso') return fmtISO(d.v);
  if (d.p === 'aperture') return apLabel(d.v).slice(2);
  return d.v.kind === 'bulb' ? 'B' : speedLabel(d.v.speed);
}

export function initialState(camera: CameraProfile, workingEI: number): MeterState {
  const a = nearest(camera.lens.apertures, 8, (x) => x.exact) ?? { nominal: 8, exact: 8 };
  const s = nearest(camera.speeds, 1 / 125, (x) => x.exact);
  const mode = camera.modes.includes('aperturePriority') || !camera.modes.includes('shutterPriority') ? 'aperturePriority' : 'shutterPriority';
  return { locks: locksFor(mode), selection: { iso: workingEI, aperture: a, shutter: s ? timed(s) : bulb(1) }, compensation: 0, filterStops: 0, bellowsStops: 0 };
}

export const inputsOf = (s: MeterState, ev100: number, workingEI: number): ExposureInputs => ({
  ev100,
  compensation: s.compensation,
  filterStops: s.filterStops,
  bellowsStops: s.bellowsStops,
  workingEI,
});

/** Snap dialled values to what a (new) camera can physically select; ISO follows the roll's EI on film. */
export function snapToCamera(s: MeterState, camera: CameraProfile, workingEI: number): MeterState {
  const sel = { ...s.selection };
  if (!camera.lens.apertures.some((a) => sameAperture(a, sel.aperture))) sel.aperture = nearest(camera.lens.apertures, sel.aperture.exact, (a) => a.exact) ?? sel.aperture;
  if (sel.shutter.kind === 'timed') {
    const t = sel.shutter.speed;
    if (!camera.speeds.some((x) => Math.abs(x.exact - t.exact) < 1e-12)) {
      const n = nearest(camera.speeds, t.exact, (x) => x.exact);
      if (n) sel.shutter = timed(n);
      else if (camera.bulb) sel.shutter = bulb(Math.max(1, roundBulb(t.exact)));
    }
  } else if (!camera.bulb) {
    const n = nearest(camera.speeds, sel.shutter.seconds, (x) => x.exact);
    if (n) sel.shutter = timed(n);
  }
  if (!camera.isoPerShot) sel.iso = workingEI;
  return { ...s, selection: sel };
}

export function dialValues(p: Param, camera: CameraProfile, film: FilmStock | null, inc: StopIncrement, bulbSeconds: number): DialValue[] {
  if (p === 'aperture') return sortedApertures(camera).map((v) => ({ p, v }));
  if (p === 'shutter') {
    const v: DialValue[] = sortedSpeeds(camera).map((s) => ({ p, v: timed(s) }));
    if (camera.bulb) v.push({ p, v: bulb(Math.max(0.5, bulbSeconds)) });
    return v;
  }
  let isos: number[];
  if (film && !camera.isoPerShot) {
    const ref = referenceSpeed(film);
    const set = new Set(eiOptions(film, camera, inc, false).map((o) => o.ei));
    isoScale(inc, camera.isoMin, camera.isoMax)
      .filter((v) => v >= (ref / 8) * 0.97 && v <= ref * 8 * 1.03)
      .forEach((v) => set.add(v));
    isos = [...set].sort((a, b) => a - b);
  } else isos = isoScale(inc, camera.isoMin, camera.isoMax);
  return isos.map((v) => ({ p: 'iso' as const, v }));
}

const keyOf = (d: DialValue) => (d.p === 'iso' ? d.v : d.p === 'aperture' ? d.v.exact : shutterSeconds(d.v));

function sameDial(a: DialValue, b: DialValue): boolean {
  if (a.p === 'iso' && b.p === 'iso') return a.v === b.v;
  if (a.p === 'aperture' && b.p === 'aperture') return sameAperture(a.v, b.v);
  if (a.p === 'shutter' && b.p === 'shutter') return a.v.kind === 'bulb' && b.v.kind === 'bulb' ? true : sameShutter(a.v, b.v);
  return false;
}

export function currentDial(s: MeterState, p: Param): DialValue {
  if (p === 'iso') return { p, v: s.selection.iso };
  if (p === 'aperture') return { p, v: s.selection.aperture };
  return { p, v: s.selection.shutter };
}

/** Move a dial by `steps` and lock it (turning a dial means "I chose this"). */
export function stepDial(s: MeterState, p: Param, steps: number, camera: CameraProfile, film: FilmStock | null, inc: StopIncrement, bulbSeconds: number): MeterState {
  const values = dialValues(p, camera, film, inc, bulbSeconds);
  if (!values.length) return s;
  const cur = currentDial(s, p);
  let i = values.findIndex((v) => sameDial(v, cur));
  if (i < 0) {
    const k = keyOf(cur);
    i = values.reduce((best, v, j) => (Math.abs(Math.log2(keyOf(v) / k)) < Math.abs(Math.log2(keyOf(values[best]!) / k)) ? j : best), 0);
  }
  return setDial(s, values[Math.max(0, Math.min(values.length - 1, i + steps))]!);
}

export function setDial(s: MeterState, d: DialValue): MeterState {
  const sel = { ...s.selection };
  const locks = { ...s.locks };
  if (d.p === 'iso') {
    sel.iso = d.v;
    locks.iso = true;
  } else if (d.p === 'aperture') {
    sel.aperture = d.v;
    locks.aperture = true;
  } else {
    sel.shutter = d.v;
    locks.shutter = true;
  }
  return { ...s, selection: sel, locks };
}

/** Adopt an option (e.g. the creative suggestion) as dialled settings in manual mode. */
export function adopt(s: MeterState, o: ExposureOption): MeterState {
  return { ...s, selection: { iso: o.iso, aperture: o.aperture, shutter: o.shutter }, locks: locksFor('manual') };
}

/** Unlocked dials follow the solver's camera-supported answer. */
export function follow(s: MeterState, sol: Solution): MeterState {
  const sel = { ...s.selection };
  if (!s.locks.aperture) sel.aperture = sol.camera.aperture;
  if (!s.locks.shutter) sel.shutter = sol.camera.shutter;
  if (!s.locks.iso && sol.solved.includes('iso')) sel.iso = sol.camera.iso;
  return { ...s, selection: sel };
}

export { modeOf };
