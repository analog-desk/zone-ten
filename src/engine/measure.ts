import * as M from './math';

// Reflected-light measurement model.
//
// The phone camera's exposure for a frame (aperture N, time t, ISO S) is known from metadata (photo EXIF, or the
// camera track's settings in live mode). The frame is decoded, linearised (sRGB EOTF) and reduced to a luminance
// grid. For the metered region with linear mean Y:
//
//     EV100 = log2(N²/t) − log2(S/100) + log2(Y / 0.18) + calibration
//
// The camera's auto-exposure only decides *where* the frame sits; the reading comes from the pixels and the
// exposure metadata. Residual differences (the phone's ISO definition vs film ISO, the JPEG tone curve) are
// absorbed by the device calibration against a reference meter, kept separately for each measurement path.

export interface NPoint {
  x: number;
  y: number;
}
export const CENTER: NPoint = { x: 0.5, y: 0.5 };

/** Downsampled linear luminance (0 = black, 1 = encoding white), row-major. */
export interface LuminanceGrid {
  width: number;
  height: number;
  values: Float32Array | number[];
  /** Fraction of clipped source pixels per cell. */
  clipped?: Float32Array | number[];
}

export type MeteringMode = 'average' | 'centerWeighted' | 'spot' | 'multiPoint';
export const METERING_LABEL: Record<MeteringMode, string> = { average: 'Average', centerWeighted: 'Center-weighted', spot: 'Spot', multiPoint: 'Multi-point' };
export const METERING_SHORT: Record<MeteringMode, string> = { average: 'AVG', centerWeighted: 'CW', spot: 'SPOT', multiPoint: 'MULTI' };

export interface RegionStats {
  mean: number;
  clipped: number;
}

export function uniformGrid(v: number, width = 32, height = 24): LuminanceGrid {
  return { width, height, values: new Array(width * height).fill(v) };
}

export function frameStats(g: LuminanceGrid, centerWeighted: boolean): RegionStats {
  let sum = 0,
    wsum = 0,
    csum = 0;
  const sigma = 0.22;
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      let w = 1;
      if (centerWeighted) {
        const nx = (x + 0.5) / g.width - 0.5;
        const ny = ((y + 0.5) / g.height - 0.5) * (g.height / g.width);
        w = Math.exp(-(nx * nx + ny * ny) / (2 * sigma * sigma));
      }
      const i = y * g.width + x;
      sum += w * g.values[i]!;
      csum += w * (g.clipped?.[i] ?? 0);
      wsum += w;
    }
  }
  return { mean: wsum ? sum / wsum : 0, clipped: wsum ? csum / wsum : 0 };
}

/** Circular spot; `diameter` is a fraction of the frame width. */
export function spotStats(g: LuminanceGrid, p: NPoint, diameter: number): RegionStats {
  const r = Math.max(diameter, 1 / g.width) / 2;
  const aspect = g.height / g.width;
  const edge = 0.5 / g.width;
  let sum = 0,
    wsum = 0,
    csum = 0;
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const dx = (x + 0.5) / g.width - p.x;
      const dy = ((y + 0.5) / g.height - p.y) * aspect;
      const d = Math.hypot(dx, dy);
      const w = d <= r ? 1 : Math.max(0, 1 - (d - r) / edge);
      if (w <= 0) continue;
      const i = y * g.width + x;
      sum += w * g.values[i]!;
      csum += w * (g.clipped?.[i] ?? 0);
      wsum += w;
    }
  }
  if (!wsum) {
    const x = Math.min(g.width - 1, Math.floor(p.x * g.width));
    const y = Math.min(g.height - 1, Math.floor(p.y * g.height));
    const i = y * g.width + x;
    return { mean: g.values[i]!, clipped: g.clipped?.[i] ?? 0 };
  }
  return { mean: sum / wsum, clipped: csum / wsum };
}

export function regionStats(g: LuminanceGrid, mode: MeteringMode, spot: NPoint, diameter: number, points: NPoint[]): RegionStats {
  switch (mode) {
    case 'average':
      return frameStats(g, false);
    case 'centerWeighted':
      return frameStats(g, true);
    case 'spot':
      return spotStats(g, spot, diameter);
    case 'multiPoint': {
      // Multi-spot meters average in stops (log domain).
      const s = (points.length ? points : [spot]).map((p) => spotStats(g, p, diameter));
      const logMean = s.reduce((a, b) => a + Math.log2(Math.max(b.mean, 1e-6)), 0) / s.length;
      return { mean: 2 ** logMean, clipped: Math.max(...s.map((x) => x.clipped)) };
    }
  }
}

/** The exposure the phone camera actually used. */
export interface CaptureExposure {
  fNumber: number;
  seconds: number;
  iso: number;
}
export const captureEV100 = (c: CaptureExposure) => M.ev100Of(c.fNumber, c.seconds, c.iso);

export const MODEL = { target: 0.18, noiseFloor: 0.012, clip: 0.85 };

export function sceneEV100(c: CaptureExposure, regionLinear: number, calibration: number): number {
  return captureEV100(c) + Math.log2(Math.max(regionLinear, 1e-6) / MODEL.target) + calibration;
}

export type Reliability = 'reliable' | 'nearLowerLimit' | 'nearUpperLimit' | 'tooDark' | 'tooBright' | 'clipped' | 'farFromTarget';

export const RELIABILITY_TEXT: Record<Reliability, string | null> = {
  reliable: null,
  nearLowerLimit: "Low light: near the lower limit of this phone's reliable range.",
  nearUpperLimit: "Very bright: near the upper limit of this phone's reliable range.",
  tooDark: 'Too dark to measure reliably with this phone camera.',
  tooBright: 'Too bright to measure reliably — the sensor is saturating.',
  clipped: 'Metered area is clipping; the reading may be low. Use a smaller spot or meter a different area.',
  farFromTarget: 'Metered area is far from the exposure the phone chose; tone-curve error grows here. Re-measure with this area as the main subject for best accuracy.',
};
export const isUsable = (r: Reliability) => r === 'reliable' || r === 'nearLowerLimit' || r === 'nearUpperLimit' || r === 'farFromTarget';

/** Reliability of a region. `atMax`/`atMin`: the camera exposure is pinned at its limit. */
export function reliability(y: number, clipped: number, atMax: boolean, atMin: boolean): Reliability {
  if (y < MODEL.noiseFloor && atMax) return 'tooDark';
  if (y > MODEL.clip && atMin) return 'tooBright';
  if (clipped > 0.25 || y > 0.95) return 'clipped';
  if (y < MODEL.noiseFloor) return 'tooDark';
  if (atMax && y < MODEL.target / 2) return 'nearLowerLimit';
  if (atMin && y > MODEL.target * 2) return 'nearUpperLimit';
  if (Math.abs(Math.log2(y / MODEL.target)) > 2.5) return 'farFromTarget';
  return 'reliable';
}

// --- sRGB -------------------------------------------------------------------------------------------

export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const SRGB_LUT: Float32Array = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) t[i] = srgbToLinear(i / 255);
  return t;
})();

/** Builds a luminance grid from RGBA pixels (canvas ImageData layout). */
export function gridFromRGBA(data: Uint8ClampedArray | Uint8Array, width: number, height: number, gw: number, gh: number): LuminanceGrid {
  const values = new Float32Array(gw * gh);
  const clipped = new Float32Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    const y0 = Math.floor((cy * height) / gh);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / gh));
    for (let cx = 0; cx < gw; cx++) {
      const x0 = Math.floor((cx * width) / gw);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / gw));
      let sum = 0,
        clip = 0,
        n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const r = data[i]!,
            g = data[i + 1]!,
            b = data[i + 2]!;
          sum += 0.2126 * SRGB_LUT[r]! + 0.7152 * SRGB_LUT[g]! + 0.0722 * SRGB_LUT[b]!;
          if (r >= 250 || g >= 250 || b >= 250) clip++;
          n++;
        }
      }
      values[cy * gw + cx] = n ? sum / n : 0;
      clipped[cy * gw + cx] = n ? clip / n : 0;
    }
  }
  return { width: gw, height: gh, values, clipped };
}

// --- Live exposure controller -------------------------------------------------------------------------

/** Drives a manually-controllable camera so the metered region approaches the target ("null metering"). */
export interface ControllerPolicy {
  target: number;
  minSeconds: number;
  maxSeconds: number;
  maxPreviewSeconds: number;
  minISO: number;
  maxISO: number;
  damping: number;
  deadband: number;
}

export function makePolicy(p: Partial<ControllerPolicy> & Pick<ControllerPolicy, 'minSeconds' | 'maxSeconds' | 'minISO' | 'maxISO'>): ControllerPolicy {
  const maxPreview = Math.min(p.maxPreviewSeconds ?? 1 / 15, p.maxSeconds);
  return { target: 0.18, damping: 0.75, deadband: 0.12, ...p, maxPreviewSeconds: maxPreview };
}

export interface ControllerStep {
  seconds: number;
  iso: number;
  atMin: boolean;
  atMax: boolean;
}

export function placeProduct(p: ControllerPolicy, product: number): ControllerStep {
  let t = Math.min(Math.max(product / p.minISO, p.minSeconds), p.maxPreviewSeconds);
  let iso = Math.min(Math.max(product / t, p.minISO), p.maxISO);
  if (iso >= p.maxISO * 0.999) {
    t = Math.min(Math.max(product / p.maxISO, p.minSeconds), p.maxSeconds);
    iso = p.maxISO;
  }
  return { seconds: t, iso, atMin: t <= p.minSeconds * 1.001 && iso <= p.minISO * 1.001, atMax: t >= p.maxSeconds * 0.999 && iso >= p.maxISO * 0.999 };
}

export function neededStops(p: ControllerPolicy, y: number, clipped: number): number {
  if (clipped > 0.5 || y >= 0.98) return -3;
  if (y <= 1e-4) return 4;
  return Math.min(4, Math.max(-4, Math.log2(p.target / y)));
}

export function nextExposure(p: ControllerPolicy, current: CaptureExposure, y: number, clipped = 0): ControllerStep | null {
  const d = neededStops(p, y, clipped);
  if (Math.abs(d) < p.deadband) return null;
  return placeProduct(p, current.seconds * current.iso * 2 ** (d * p.damping));
}

/** Log-domain exponential smoothing with jump reset and a stability flag. */
export class EVSmoother {
  value: number | null = null;
  private recent: number[] = [];
  constructor(
    private alpha = 0.35,
    private resetThreshold = 1.5,
  ) {}
  add(ev: number): number {
    if (this.value !== null && Math.abs(ev - this.value) < this.resetThreshold) this.value += this.alpha * (ev - this.value);
    else {
      this.value = ev;
      this.recent = [];
    }
    this.recent.push(ev);
    if (this.recent.length > 12) this.recent.shift();
    return this.value;
  }
  get stable(): boolean {
    if (this.recent.length < 6) return false;
    const m = this.recent.reduce((a, b) => a + b, 0) / this.recent.length;
    const sd = Math.sqrt(this.recent.reduce((a, b) => a + (b - m) ** 2, 0) / this.recent.length);
    return sd < 0.1;
  }
  reset() {
    this.value = null;
    this.recent = [];
  }
}
