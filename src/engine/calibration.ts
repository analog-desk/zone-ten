import { ev100Of } from './math';
import { exactISO, type Aperture } from './scale';

/** Each pipeline relates pixels to luminance differently, so each has its own calibration. */
export type MeasurementPath = 'photoReflected' | 'liveReflected' | 'incidentDiffuser';
export const PATH_LABEL: Record<MeasurementPath, string> = {
  photoReflected: 'Reflected · photo',
  liveReflected: 'Reflected · live',
  incidentDiffuser: 'Incident · diffuser accessory',
};

export interface Comparison {
  id: string;
  date: string;
  /** Phone reading before calibration offset. */
  phoneEV: number;
  referenceEV: number;
  referenceMeter: string;
  note: string;
}

export interface CalibrationProfile {
  id: string;
  name: string;
  device: string;
  path: MeasurementPath;
  /** Offset in tenths of a stop. */
  offsetTenths: number;
  comparisons: Comparison[];
  createdAt: string;
}

export const LIMIT_TENTHS = 30;
export const clampTenths = (t: number) => Math.max(-LIMIT_TENTHS, Math.min(LIMIT_TENTHS, Math.round(t)));
export const applyCalibration = (ev: number, tenths: number) => ev + tenths / 10;
/** Positive when the phone reads low. */
export const comparisonDiff = (c: Comparison) => c.referenceEV - c.phoneEV;

export interface Suggestion {
  mean: number;
  sd: number;
  count: number;
  tenths: number;
  maxResidual: number;
  consistent: boolean;
}

export function suggestOffset(cs: Comparison[]): Suggestion {
  if (!cs.length) return { mean: 0, sd: 0, count: 0, tenths: 0, maxResidual: 0, consistent: false };
  const d = cs.map(comparisonDiff);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const sd = d.length > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (d.length - 1)) : 0;
  const tenths = clampTenths(mean * 10);
  const maxResidual = Math.max(...d.map((x) => Math.abs(x - tenths / 10)));
  return { mean, sd, count: d.length, tenths, maxResidual, consistent: d.length >= 3 && sd <= 0.3 };
}

/** A reference meter's suggested settings → EV100. */
export const referenceEV = (iso: number, aperture: Aperture, seconds: number) => ev100Of(aperture.exact, seconds, exactISO(iso));

export const isValidated = (p: CalibrationProfile) => suggestOffset(p.comparisons).consistent;
