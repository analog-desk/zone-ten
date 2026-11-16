// Standard photographic scales, exact values and formatting.
//
// Engraved values (f/5.6, 1/125, ISO 125) are *nominal*. All arithmetic uses the *exact* geometric value of the
// scale the nominal belongs to (f/5.6 → 2^(5/2) = 5.657, 1/125 → 2^-7 = 1/128, ISO 125 → 100·2^(1/3)).
// Values that are not on a standard scale (the Yashica A's 1/300) are used literally.

export type StopIncrement = 1 | 2 | 3; // full, half, third

export const INCREMENT_LABEL: Record<StopIncrement, string> = { 1: 'Full stops', 2: '½ stops', 3: '⅓ stops' };

export function quantize(stops: number, inc: StopIncrement): number {
  return Math.round(stops * inc) / inc;
}

export interface Aperture {
  nominal: number;
  exact: number;
}
export interface ShutterSpeed {
  /** Engraved value in seconds (1/125 → 0.008). */
  nominal: number;
  exact: number;
}
export type ShutterSetting = { kind: 'timed'; speed: ShutterSpeed } | { kind: 'bulb'; seconds: number };

// --- tables -----------------------------------------------------------------------------------------

/** Third-stop f-numbers, index k → 2^(k/6). */
const AP_THIRDS = [1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32, 36, 40, 45, 51, 57, 64];
/** Half-stop f-numbers, index h → 2^(h/4). */
const AP_HALVES = [1, 1.2, 1.4, 1.7, 2, 2.4, 2.8, 3.3, 4, 4.8, 5.6, 6.7, 8, 9.5, 11, 13, 16, 19, 22, 27, 32, 38, 45, 54, 64];

/** Third-stop shutter speeds, k = -39 (1/8000) … 15 (30 s), exact 2^(k/3). */
const SH_THIRDS: number[] = [
  ...[8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 100, 80, 60, 50, 40, 30, 25, 20, 15, 13, 10, 8, 6, 5, 4].map((d) => 1 / d),
  0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.3, 1.6, 2, 2.5, 3.2, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30,
];
const SH_THIRDS_FIRST = -39;
/** Half-stop shutter speeds, h = -26 (1/8000) … 10 (30 s), exact 2^(h/2). */
const SH_HALVES: number[] = [
  ...[8000, 6000, 4000, 3000, 2000, 1500, 1000, 750, 500, 350, 250, 180, 125, 90, 60, 45, 30, 20, 15, 10, 8, 6, 4].map((d) => 1 / d),
  1 / 3, 0.5, 0.7, 1, 1.5, 2, 3, 4, 6, 8, 12, 15, 20, 30,
];
const SH_HALVES_FIRST = -26;

/** Third-stop ISO, k = -12 (6) … 24 (25600), exact 100·2^(k/3). */
const ISO_THIRDS = [6, 8, 10, 12, 16, 20, 25, 32, 40, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 16000, 20000, 25600];
const ISO_THIRDS_FIRST = -12;
const ISO_HALVES = [6, 9, 12, 18, 25, 35, 50, 70, 100, 140, 200, 280, 400, 560, 800, 1100, 1600, 2200, 3200, 4500, 6400, 9000, 12800, 18000, 25600];
const ISO_HALVES_FIRST = -8;

const near = (a: number, b: number) => Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b));

export function exactAperture(nominal: number): number {
  let k = AP_THIRDS.findIndex((v) => near(v, nominal));
  if (k >= 0) return 2 ** (k / 6);
  k = AP_HALVES.findIndex((v) => near(v, nominal));
  if (k >= 0) return 2 ** (k / 4);
  return nominal;
}
export function exactShutter(nominal: number): number {
  let i = SH_THIRDS.findIndex((v) => near(v, nominal));
  if (i >= 0) return 2 ** ((i + SH_THIRDS_FIRST) / 3);
  i = SH_HALVES.findIndex((v) => near(v, nominal));
  if (i >= 0) return 2 ** ((i + SH_HALVES_FIRST) / 2);
  return nominal;
}
export function exactISO(nominal: number): number {
  const i = ISO_THIRDS.findIndex((v) => near(v, nominal));
  return i >= 0 ? 100 * 2 ** ((i + ISO_THIRDS_FIRST) / 3) : nominal;
}

export const ap = (nominal: number, exact?: number): Aperture => ({ nominal, exact: exact ?? exactAperture(nominal) });
export const sp = (nominal: number, exact?: number): ShutterSpeed => ({ nominal, exact: exact ?? exactShutter(nominal) });
export const timed = (speed: ShutterSpeed): ShutterSetting => ({ kind: 'timed', speed });
export const bulb = (seconds: number): ShutterSetting => ({ kind: 'bulb', seconds });

export const shutterSeconds = (s: ShutterSetting) => (s.kind === 'timed' ? s.speed.exact : s.seconds);
export const sameAperture = (a: Aperture, b: Aperture) => Math.abs(a.exact - b.exact) < 1e-9;
export const sameSpeed = (a: ShutterSpeed, b: ShutterSpeed) => Math.abs(a.exact - b.exact) < 1e-12;
export function sameShutter(a: ShutterSetting, b: ShutterSetting): boolean {
  if (a.kind === 'timed' && b.kind === 'timed') return sameSpeed(a.speed, b.speed);
  if (a.kind === 'bulb' && b.kind === 'bulb') return Math.abs(a.seconds - b.seconds) < 1e-9;
  return false;
}

// --- generation -------------------------------------------------------------------------------------

export function apertureScale(inc: StopIncrement, minN = 1, maxN = 64): Aperture[] {
  let all: Aperture[];
  if (inc === 2) all = AP_HALVES.map((n, h) => ap(n, 2 ** (h / 4)));
  else all = AP_THIRDS.map((n, k) => ({ k, a: ap(n, 2 ** (k / 6)) })).filter(({ k }) => inc === 3 || k % 3 === 0).map(({ a }) => a);
  return all.filter((a) => a.nominal >= minN * 0.99 && a.nominal <= maxN * 1.01);
}

export function shutterScale(inc: StopIncrement, fastest = 1 / 8000, slowest = 30): ShutterSpeed[] {
  let all: ShutterSpeed[];
  if (inc === 2) all = SH_HALVES.map((n, i) => sp(n, 2 ** ((i + SH_HALVES_FIRST) / 2)));
  else
    all = SH_THIRDS.map((n, i) => ({ k: i + SH_THIRDS_FIRST, s: sp(n, 2 ** ((i + SH_THIRDS_FIRST) / 3)) }))
      .filter(({ k }) => inc === 3 || k % 3 === 0)
      .map(({ s }) => s);
  return all.filter((s) => s.nominal >= fastest * 0.99 && s.nominal <= slowest * 1.01);
}

export function isoScale(inc: StopIncrement, min = 6, max = 25600): number[] {
  let all: number[];
  if (inc === 2) all = ISO_HALVES.filter((_, i) => i + ISO_HALVES_FIRST >= -100);
  else all = ISO_THIRDS.filter((_, i) => inc === 3 || (i + ISO_THIRDS_FIRST) % 3 === 0);
  return all.filter((v) => v >= min - 0.01 && v <= max + 0.01);
}

/** Nearest value by distance in stops. */
export function nearest<T>(values: T[], target: number, key: (t: T) => number): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const v of values) {
    const d = Math.abs(Math.log2(key(v) / target));
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

// --- formatting -------------------------------------------------------------------------------------

export function fmtAperture(n: number): string {
  if (n >= 10) return `${Math.round(n)}`;
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? `${r}` : r.toFixed(1);
}
export const apLabel = (a: Aperture) => `f/${fmtAperture(a.nominal)}`;

/** 1/125, 0.3s, 2s, 4m 30s, 1h 5m. */
export function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '—';
  if (s < 1) {
    const d = 1 / s;
    const r = Math.round(d);
    if (Math.abs(d - r) <= 0.03 * d || d >= 10) return `1/${r}`;
    return `${s.toFixed(1)}s`;
  }
  if (s < 60) {
    const r = Math.round(s * 10) / 10;
    return Number.isInteger(r) ? `${r}s` : `${r.toFixed(1)}s`;
  }
  const total = Math.round(s);
  if (s < 3600) {
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
export const speedLabel = (s: ShutterSpeed) => fmtTime(s.nominal);
export function shutterLabel(s: ShutterSetting): string {
  return s.kind === 'timed' ? speedLabel(s.speed) : `B · ${fmtTime(s.seconds)}`;
}

export function fmtISO(v: number): string {
  if (v >= 10) return `${Math.round(v)}`;
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? `${r}` : r.toFixed(1);
}

/** "+⅓", "−1", "+1⅔", "+0.3", "0". */
export function fmtStops(stops: number): string {
  if (Math.abs(stops) < 0.05) return '0';
  const sign = stops > 0 ? '+' : '−';
  const a = Math.abs(stops);
  const whole = Math.floor(a);
  const frac = a - whole;
  let glyph: string | undefined;
  if (Math.abs(frac - 1 / 3) < 0.02) glyph = '⅓';
  else if (Math.abs(frac - 2 / 3) < 0.02) glyph = '⅔';
  else if (Math.abs(frac - 0.5) < 0.02) glyph = '½';
  else if (frac < 0.02) glyph = '';
  else if (frac > 0.98) return `${sign}${whole + 1}`;
  if (glyph !== undefined) return sign + (whole === 0 && glyph ? '' : `${whole}`) + glyph;
  return sign + a.toFixed(1);
}

export function describeStops(stops: number): string {
  if (Math.abs(stops) < 0.05) return 'matches the metered exposure';
  const amount = fmtStops(Math.abs(stops)).replace('+', '');
  const unit = Math.abs(stops) <= 1.02 ? 'stop' : 'stops';
  return `${amount} ${unit} ${stops > 0 ? 'over' : 'under'}`;
}
