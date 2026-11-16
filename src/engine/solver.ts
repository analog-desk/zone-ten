import * as M from './math';
import {
  apLabel,
  apertureScale,
  describeStops,
  exactISO,
  fmtISO,
  fmtTime,
  isoScale,
  nearest,
  sameAperture,
  sameShutter,
  shutterLabel,
  shutterScale,
  shutterSeconds,
  timed,
  bulb,
  type Aperture,
  type ShutterSetting,
  type StopIncrement,
} from './scale';
import { handheldLimit, sortedApertures, sortedSpeeds } from './cameras';
import { correctReciprocity, latitudeAdvice, latitudeBias, reciprocitySignificant, reciprocityText, type ReciprocityResult } from './film';
import type { CameraProfile, FilmStock } from './types';

export type Param = 'iso' | 'aperture' | 'shutter';

export interface Locks {
  iso: boolean;
  aperture: boolean;
  shutter: boolean;
}

export type MeterMode = 'aperturePriority' | 'shutterPriority' | 'isoPriority' | 'manual' | 'solveISO' | 'program';

export const MODE_SHORT: Record<MeterMode, string> = { aperturePriority: 'A', shutterPriority: 'S', isoPriority: 'ISO', manual: 'M', solveISO: 'EI?', program: 'P' };
export const MODE_LABEL: Record<MeterMode, string> = {
  aperturePriority: 'Aperture Priority',
  shutterPriority: 'Shutter Priority',
  isoPriority: 'ISO Priority',
  manual: 'Manual',
  solveISO: 'Find EI',
  program: 'Program',
};
export const SELECTABLE_MODES: MeterMode[] = ['aperturePriority', 'shutterPriority', 'isoPriority', 'manual'];

export function modeOf(l: Locks): MeterMode {
  if (l.aperture && l.shutter) return l.iso ? 'manual' : 'solveISO';
  if (l.aperture) return 'aperturePriority';
  if (l.shutter) return 'shutterPriority';
  return l.iso ? 'isoPriority' : 'program';
}

export function locksFor(m: MeterMode): Locks {
  switch (m) {
    case 'aperturePriority':
      return { iso: true, aperture: true, shutter: false };
    case 'shutterPriority':
      return { iso: true, aperture: false, shutter: true };
    case 'isoPriority':
      return { iso: true, aperture: false, shutter: false };
    case 'manual':
      return { iso: true, aperture: true, shutter: true };
    case 'solveISO':
      return { iso: false, aperture: true, shutter: true };
    case 'program':
      return { iso: false, aperture: false, shutter: false };
  }
}

/** The measured scene and the photographer's exposure modifiers. */
export interface ExposureInputs {
  /** Calibrated scene EV at ISO 100. */
  ev100: number;
  /** Stops; positive = more exposure. */
  compensation: number;
  /** Light lost to filters (ND, colour), stops. */
  filterStops: number;
  /** Light lost to extension / bellows, stops. */
  bellowsStops: number;
  workingEI: number;
}

export const totalAdjustment = (i: ExposureInputs) => i.compensation + i.filterStops + i.bellowsStops;
/** Settings EV (log2 N²/t) that correctly exposes at a nominal ISO. */
export const targetEV = (i: ExposureInputs, iso: number) => M.settingsEV(i.ev100, exactISO(iso)) - totalAdjustment(i);

export interface Selection {
  iso: number;
  aperture: Aperture;
  shutter: ShutterSetting;
}

/** Preferences that choose between *equivalent* exposures. They never change the total exposure. */
export interface ProgramPrefs {
  apertures?: [number, number];
  aperturePref?: 'widest' | 'narrowest';
  /** Exposure time must be this short or shorter (seconds). */
  minShutter?: number;
  shutterRange?: [number, number];
  tripod?: boolean;
  preferBulb?: boolean;
}

export const standardProgram = (handheld: number): ProgramPrefs => ({ apertures: [5.6, 11], minShutter: handheld });

export interface ExposureOption {
  aperture: Aperture;
  shutter: ShutterSetting;
  iso: number;
  /** Relative to the metered exposure: positive = overexposed. */
  error: number;
}
export const optionLabel = (o: ExposureOption) => `${apLabel(o.aperture)} · ${shutterLabel(o.shutter)}`;

export type Warning =
  | { kind: 'tooBright'; over: number; nd: number }
  | { kind: 'tooDark'; under: number }
  | { kind: 'tripod'; seconds: number }
  | { kind: 'bulb'; seconds: number }
  | { kind: 'reciprocity'; result: ReciprocityResult };

export function warningText(w: Warning): string {
  switch (w.kind) {
    case 'tooBright':
      return `Too bright for this camera: the closest setting is ${describeStops(w.over)}. Stop down, use a ${w.nd}-stop ND filter or load slower film.`;
    case 'tooDark':
      return `Too dark for the camera's settings: the closest is ${describeStops(-w.under)}. Use Bulb, open up, or load faster film.`;
    case 'tripod':
      return `${fmtTime(w.seconds)} is slower than the hand-holding guideline — use a tripod or brace the camera.`;
    case 'bulb':
      return `Set the shutter to B and hold for ${fmtTime(w.seconds)} (cable release and timer recommended).`;
    case 'reciprocity':
      return reciprocityText(w.result);
  }
}

export interface Solution {
  mode: MeterMode;
  ev100: number;
  target: number;
  /** Metered exposure: exact continuous answer for the solved parameter. */
  metered: { aperture: number; seconds: number; iso: number };
  /** Metered value rounded to the user's stop increment on the standard scale. */
  recommended: { aperture: Aperture; seconds: number; label: string; iso: number; error: number };
  /** What the photographer has dialled. */
  user: ExposureOption;
  /** Closest exposure the selected camera can physically make. */
  camera: ExposureOption;
  /** Next closest camera setting on the other side of the metered value. */
  alternative?: ExposureOption;
  explanation: string[];
  warnings: Warning[];
  reciprocity?: ReciprocityResult;
  solved: Param[];
}

export const roundBulb = (s: number) => (s < 10 ? Math.max(0.5, Math.round(s * 2) / 2) : Math.round(s));

export interface SolverConfig {
  camera: CameraProfile;
  increment?: StopIncrement;
  program?: ProgramPrefs;
  film?: FilmStock | null;
}

const err = (target: number, n: number, t: number) => target - M.ev(n, t);

function stopsOutside(v: number, r: [number, number], scale: number): number {
  if (v < r[0]) return scale * Math.log2(r[0] / v);
  if (v > r[1]) return scale * Math.log2(v / r[1]);
  return 0;
}

export function isoFree(camera: CameraProfile, locks: Locks) {
  return !locks.iso && (camera.isoPerShot || (locks.aperture && locks.shutter));
}

export function candidates(cfg: SolverConfig, inputs: ExposureInputs, locks: Locks, sel: Selection): ExposureOption[] {
  const cam = cfg.camera;
  const isos = isoFree(cam, locks) ? isoScale(3, cam.isoMin, cam.isoMax) : [locks.iso ? sel.iso : inputs.workingEI];
  const aps = locks.aperture ? [sel.aperture] : sortedApertures(cam).length ? sortedApertures(cam) : [sel.aperture];
  const speeds = sortedSpeeds(cam);
  const slowest = speeds.at(-1)?.exact ?? 0;
  const out: ExposureOption[] = [];
  for (const iso of isos.length ? isos : [sel.iso]) {
    const T = targetEV(inputs, iso);
    for (const a of aps) {
      if (locks.shutter) {
        out.push({ aperture: a, shutter: sel.shutter, iso, error: err(T, a.exact, shutterSeconds(sel.shutter)) });
        continue;
      }
      for (const s of speeds) out.push({ aperture: a, shutter: timed(s), iso, error: err(T, a.exact, s.exact) });
      if (cam.bulb) {
        const ideal = M.secondsFor(T, a.exact);
        if (ideal >= 1 || (ideal > slowest * 1.05 && ideal >= 0.5)) {
          const b = roundBulb(ideal);
          out.push({ aperture: a, shutter: bulb(b), iso, error: err(T, a.exact, b) });
        }
      }
    }
  }
  return out;
}

export function programScore(o: ExposureOption, p: ProgramPrefs, cam: CameraProfile): number {
  // Errors below 1/20 stop (e.g. rounding a Bulb time) are immaterial on film.
  const e = Math.abs(o.error);
  let s = Math.max(0, e - 0.05) * 6 + (e > 0.5 ? 20 : 0);
  const n = o.aperture.exact;
  const t = shutterSeconds(o.shutter);
  if (p.apertures) s += stopsOutside(n, p.apertures, 2);
  const aps = sortedApertures(cam);
  const lo = aps[0]?.exact;
  const hi = aps.at(-1)?.exact;
  if (lo && hi && hi > lo) {
    if (p.aperturePref === 'widest') s += 0.3 * 2 * Math.log2(n / lo);
    if (p.aperturePref === 'narrowest') s += 0.3 * 2 * Math.log2(hi / n);
  }
  if (p.minShutter && t > p.minShutter * 1.02) s += Math.log2(t / p.minShutter) * (p.tripod ? 0.15 : 1.5);
  if (p.shutterRange) s += stopsOutside(t, p.shutterRange, 1) * 1.2;
  if (o.shutter.kind === 'bulb') s += p.preferBulb ? 0.05 : 0.6;
  if (cam.isoPerShot) s += 0.25 * Math.max(0, Math.log2(o.iso / cam.isoMin));
  return s;
}

export function solve(cfg: SolverConfig, inputs: ExposureInputs, locks: Locks, sel: Selection): Solution {
  const cam = cfg.camera;
  const inc = cfg.increment ?? 3;
  const handheld = handheldLimit(cam);
  const prefs = cfg.program ?? standardProgram(handheld);
  const film = cfg.film ?? null;
  const mode = modeOf(locks);
  const solved: Param[] = [];
  if (isoFree(cam, locks)) solved.push('iso');
  if (!locks.aperture) solved.push('aperture');
  if (!locks.shutter) solved.push('shutter');
  const multi = solved.length >= 2;

  const bias = film ? latitudeBias(film.category) : 0;
  const nearestScore = (o: ExposureOption) => Math.abs(o.error) + (o.shutter.kind === 'bulb' ? 0.2 : 0) - (o.error * bias > 0 ? 0.01 : 0);
  const score = (o: ExposureOption) => (multi ? programScore(o, prefs, cam) : nearestScore(o));
  const ranked = candidates(cfg, inputs, locks, sel)
    .map((o) => ({ o, s: score(o) }))
    .sort((a, b) => a.s - b.s)
    .map((x) => x.o);

  const user: ExposureOption = {
    aperture: sel.aperture,
    shutter: sel.shutter,
    iso: sel.iso,
    error: err(targetEV(inputs, sel.iso), sel.aperture.exact, shutterSeconds(sel.shutter)),
  };
  const primary = ranked[0] ?? user;
  const same = (a: ExposureOption, b: ExposureOption) => sameAperture(a.aperture, b.aperture) && sameShutter(a.shutter, b.shutter) && a.iso === b.iso;
  const alternative = ranked.find(
    (o) =>
      !same(o, primary) &&
      (Math.abs(primary.error) < 0.05 || o.error * primary.error < 0) &&
      Math.abs(o.error) <= 1.5 &&
      (!multi || sameAperture(o.aperture, primary.aperture) || sameShutter(o.shutter, primary.shutter)),
  );

  const T = targetEV(inputs, primary.iso);
  let metered: Solution['metered'];
  if (mode === 'solveISO') {
    const s = M.ev(sel.aperture.exact, shutterSeconds(sel.shutter));
    metered = { aperture: sel.aperture.exact, seconds: shutterSeconds(sel.shutter), iso: 100 * 2 ** (s - inputs.ev100 + totalAdjustment(inputs)) };
  } else if (locks.shutter && !locks.aperture) {
    const t = shutterSeconds(primary.shutter);
    metered = { aperture: M.apertureFor(T, t), seconds: t, iso: primary.iso };
  } else {
    const n = locks.aperture ? sel.aperture.exact : primary.aperture.exact;
    const iso = locks.aperture && locks.shutter ? sel.iso : primary.iso;
    metered = { aperture: n, seconds: M.secondsFor(targetEV(inputs, iso), n), iso };
  }

  const recommended = recommend(metered, mode, locks, inc);

  const warnings: Warning[] = [];
  if (Math.abs(primary.error) > 0.5) {
    warnings.push(primary.error > 0 ? { kind: 'tooBright', over: primary.error, nd: Math.ceil(primary.error) } : { kind: 'tooDark', under: -primary.error });
  }
  if (primary.shutter.kind === 'bulb') warnings.push({ kind: 'bulb', seconds: primary.shutter.seconds });
  const pt = shutterSeconds(primary.shutter);
  if (pt > handheld * 1.05 && !prefs.tripod) warnings.push({ kind: 'tripod', seconds: pt });

  let reciprocity: ReciprocityResult | undefined;
  if (film && pt >= 1) {
    reciprocity = correctReciprocity(pt, film.reciprocity);
    if (reciprocitySignificant(reciprocity) || reciprocity.basis === 'unpublished' || reciprocity.basis === 'extrapolated')
      warnings.push({ kind: 'reciprocity', result: reciprocity });
  }

  const explanation: string[] = [];
  const ideal =
    mode === 'solveISO' ? `EI ${fmtISO(metered.iso)}` : mode === 'shutterPriority' ? apLabel({ nominal: metered.aperture, exact: metered.aperture }) : fmtTime(metered.seconds);
  if (Math.abs(primary.error) < 0.05) explanation.push(`${optionLabel(primary)} matches the metered exposure.`);
  else explanation.push(`Metered value is ${ideal}. The closest camera setting, ${optionLabel(primary)}, is ${describeStops(primary.error)}.`);
  if (alternative) {
    explanation.push(
      Math.abs(primary.error) < 0.05
        ? `Equivalent: ${optionLabel(alternative)} (${describeStops(alternative.error)}).`
        : `Alternative: ${optionLabel(alternative)} is ${describeStops(alternative.error)}.`,
    );
  }
  if (mode === 'solveISO') explanation.push('ISO cannot change mid-roll on a film camera — this is the EI the scene needs at your dialled settings.');
  if (Math.abs(primary.error) >= 0.15 && film) explanation.push(latitudeAdvice(film.category));

  return { mode, ev100: inputs.ev100, target: T, metered, recommended, user, camera: primary, alternative, explanation, warnings, reciprocity, solved };
}

function recommend(m: Solution['metered'], mode: MeterMode, locks: Locks, inc: StopIncrement): Solution['recommended'] {
  const meteredAp: Aperture = { nominal: m.aperture, exact: m.aperture };
  if (mode === 'solveISO') {
    const iso = nearest(isoScale(inc), m.iso, (v) => exactISO(v)) ?? m.iso;
    return { aperture: meteredAp, seconds: m.seconds, label: fmtTime(m.seconds), iso, error: Math.log2(exactISO(iso) / m.iso) };
  }
  if (locks.shutter && !locks.aperture) {
    const a = nearest(apertureScale(inc), m.aperture, (x) => x.exact) ?? meteredAp;
    return { aperture: a, seconds: m.seconds, label: fmtTime(m.seconds), iso: m.iso, error: 2 * Math.log2(m.aperture / a.exact) };
  }
  const speeds = shutterScale(inc);
  const a = nearest(apertureScale(3), m.aperture, (x) => x.exact) ?? meteredAp;
  if (m.seconds > (speeds.at(-1)?.exact ?? 30) * 1.05) {
    const b = roundBulb(m.seconds);
    return { aperture: a, seconds: b, label: `B · ${fmtTime(b)}`, iso: m.iso, error: Math.log2(b / m.seconds) };
  }
  const s = nearest(speeds, m.seconds, (x) => x.exact)!;
  return { aperture: a, seconds: s.exact, label: fmtTime(s.nominal), iso: m.iso, error: Math.log2(s.exact / m.seconds) };
}

/** All physically settable equivalent exposures for a scene. */
export function equivalents(camera: CameraProfile, inputs: ExposureInputs, iso: number, maxError = 0.34): ExposureOption[] {
  const T = targetEV(inputs, iso);
  const speeds = sortedSpeeds(camera);
  const out: ExposureOption[] = [];
  for (const a of sortedApertures(camera)) {
    const ideal = M.secondsFor(T, a.exact);
    let best: ExposureOption | undefined;
    for (const s of speeds) {
      const o: ExposureOption = { aperture: a, shutter: timed(s), iso, error: err(T, a.exact, s.exact) };
      if (!best || Math.abs(o.error) < Math.abs(best.error)) best = o;
    }
    if (best && Math.abs(best.error) <= maxError) out.push(best);
    else if (camera.bulb && ideal >= 0.5 && ideal > (speeds.at(-1)?.exact ?? 0)) {
      const b = roundBulb(ideal);
      out.push({ aperture: a, shutter: bulb(b), iso, error: err(T, a.exact, b) });
    }
  }
  return out;
}

