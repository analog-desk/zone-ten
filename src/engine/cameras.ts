import { ap, apertureScale, nearest, shutterScale, sp, type ShutterSpeed } from './scale';
import type { CameraProfile } from './types';

// Built-in camera templates. Aperture lists, ISO ranges and shutter speeds are the user-confirmed values from
// the specification. Lens apertures describe the configured lens, not every lens for the mount, and are editable.

export const PENTAX_LX = 'pentax-lx';
export const CANON_AE1P = 'canon-ae1-program';
export const YASHICA_A = 'yashica-a';
export const GENERIC_35 = 'generic-35mm';
export const GENERIC_DIGITAL = 'generic-digital';

const aps = (v: number[]) => v.map((n) => ap(n));
const sps = (v: number[]) => v.map((n) => sp(n)).sort((a, b) => a.exact - b.exact);

export function pentaxLX(): CameraProfile {
  return {
    id: PENTAX_LX,
    templateId: PENTAX_LX,
    name: 'Pentax LX',
    format: '35mm',
    negativeSize: '24×36 mm',
    diagonalMM: 43.27,
    mount: 'Pentax K',
    modes: ['aperturePriority', 'manual'],
    lens: { name: 'Pentax K-mount lens', focalLength: 50, focalConfirmed: false, fixed: false, apertures: aps([1.7, 2, 2.8, 4, 5.6, 8, 11, 16, 22]) },
    speeds: sps([1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4]),
    mechanicalNotes: [
      'X (1/75 s flash sync) and B are mechanical settings and work without batteries.',
      "Check your camera's manual for which marked speeds are mechanically timed when the battery is exhausted.",
    ],
    bulb: true,
    flashSync: 1 / 75,
    isoMin: 25,
    isoMax: 3200,
    builtInMeter: true,
    isoPerShot: false,
    notes: ['Marked electronic speeds 1/2000 – 4 s. Longer exposures use Bulb.', 'Focal length is an editable assumption until you confirm your lens.'],
  };
}

export function canonAE1Program(): CameraProfile {
  return {
    id: CANON_AE1P,
    templateId: CANON_AE1P,
    name: 'Canon AE-1 Program',
    format: '35mm',
    negativeSize: '24×36 mm',
    diagonalMM: 43.27,
    mount: 'Canon FD',
    modes: ['program', 'shutterPriority', 'manual'],
    lens: { name: 'Canon FD lens', focalLength: 50, focalConfirmed: false, fixed: false, apertures: aps([1.8, 2, 2.8, 3.5, 4, 5.6, 8, 11, 16, 22]) },
    speeds: sps([1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2]),
    mechanicalNotes: [],
    bulb: true,
    flashSync: 1 / 60,
    isoMin: 12,
    isoMax: 3200,
    builtInMeter: true,
    isoPerShot: false,
    notes: ['Marked speeds 2 s – 1/1000. Longer exposures use Bulb.', 'Focal length is an editable assumption until you confirm your lens.'],
  };
}

export function yashicaA(): CameraProfile {
  return {
    id: YASHICA_A,
    templateId: YASHICA_A,
    name: 'Yashica A',
    format: '120',
    negativeSize: '6×6 (56×56 mm)',
    diagonalMM: 79.2,
    mount: 'Fixed lens',
    modes: ['manual'],
    lens: { name: 'Yashimar 80mm f/3.5', focalLength: 80, focalConfirmed: true, fixed: true, apertures: aps([3.5, 4, 5.6, 8, 11, 16, 22]) },
    speeds: sps([1 / 300, 1 / 100, 1 / 50, 1 / 25]),
    mechanicalNotes: ['Fully mechanical leaf shutter: 1/25, 1/50, 1/100, 1/300 and B.'],
    bulb: true,
    isoMin: 6,
    isoMax: 25600,
    builtInMeter: false,
    isoPerShot: false,
    notes: ['No built-in exposure meter — all readings come from Zone Ten.', 'Select film stock and working EI; the camera has no ISO setting.'],
  };
}

export function generic35(): CameraProfile {
  return {
    id: GENERIC_35,
    templateId: GENERIC_35,
    name: 'Other 35mm camera',
    format: '35mm',
    negativeSize: '24×36 mm',
    diagonalMM: 43.27,
    mount: '',
    modes: ['manual'],
    lens: { name: 'Lens', focalLength: 50, focalConfirmed: false, fixed: false, apertures: apertureScale(1, 2, 16) },
    speeds: shutterScale(1, 1 / 1000, 1),
    mechanicalNotes: [],
    bulb: true,
    isoMin: 25,
    isoMax: 3200,
    builtInMeter: false,
    isoPerShot: false,
    notes: ['Edit apertures and shutter speeds to match your camera.'],
  };
}

export function genericDigital(): CameraProfile {
  return {
    id: GENERIC_DIGITAL,
    templateId: GENERIC_DIGITAL,
    name: 'Digital camera',
    format: 'Digital',
    negativeSize: 'Full frame',
    diagonalMM: 43.27,
    mount: '',
    modes: ['program', 'aperturePriority', 'shutterPriority', 'manual'],
    lens: { name: 'Lens', focalLength: 50, focalConfirmed: false, fixed: false, apertures: apertureScale(3, 1.8, 22) },
    speeds: shutterScale(3, 1 / 4000, 30),
    mechanicalNotes: [],
    bulb: true,
    isoMin: 100,
    isoMax: 12800,
    builtInMeter: true,
    isoPerShot: true,
    notes: ['Edit sensor format, ISO range and scales to match your camera.'],
  };
}

export const PRIMARY_TEMPLATES = [pentaxLX, canonAE1Program, yashicaA];
export const ALL_TEMPLATES = [pentaxLX, canonAE1Program, yashicaA, generic35, genericDigital];

export const cropFactor = (c: CameraProfile) => 43.27 / c.diagonalMM;

/** Classic hand-holding guideline 1/(equivalent focal length), never slower than 1/30. */
export function handheldLimit(c: CameraProfile): number {
  const f = c.lens.focalLength;
  if (!f || f <= 0) return 1 / 60;
  return Math.min(1 / 30, 1 / (f * cropFactor(c)));
}

export const sortedApertures = (c: CameraProfile) => [...c.lens.apertures].sort((a, b) => a.exact - b.exact);
export const sortedSpeeds = (c: CameraProfile): ShutterSpeed[] => [...c.speeds].sort((a, b) => a.exact - b.exact);
export const slowestTimed = (c: CameraProfile) => sortedSpeeds(c).at(-1);
export const nearestAperture = (c: CameraProfile, n: number) => nearest(c.lens.apertures, n, (a) => a.exact);

export function validateCamera(c: CameraProfile): string[] {
  const issues: string[] = [];
  if (!c.name.trim()) issues.push('Camera name is empty.');
  if (c.lens.apertures.length === 0) issues.push('Add at least one aperture.');
  if (c.speeds.length === 0 && !c.bulb) issues.push('Add at least one shutter speed or enable Bulb.');
  if (!(c.isoMin > 0 && c.isoMax > 0)) issues.push('ISO range must be positive.');
  if (c.isoMin > c.isoMax) issues.push('Minimum ISO is above maximum ISO.');
  return issues;
}

export function lensSummary(c: CameraProfile): string {
  const a = sortedApertures(c);
  const parts = [c.lens.name];
  if (c.lens.focalLength) parts.push(`${c.lens.focalLength}mm${c.lens.focalConfirmed ? '' : ' (unconfirmed)'}`);
  if (a.length) parts.push(`f/${a[0]!.nominal}–f/${a.at(-1)!.nominal}`);
  return parts.join(' · ');
}
