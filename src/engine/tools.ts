import type { Aperture } from './scale';
import type { LuminanceGrid } from './measure';

// --- Zone System -------------------------------------------------------------------------------------

export const ZONE_NUMERALS = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const ZONE_DESCRIPTIONS = [
  'Pure black, no texture',
  'Near black, slight tonality',
  'First hint of texture in deep shadow',
  'Dark shadow with full texture and detail',
  'Average dark foliage, open shadow',
  "Middle grey (18%), the meter's reference",
  'Average light skin, shadows on snow',
  'Light textured surfaces',
  'Lightest tone with texture',
  'Bright white without texture',
  'Pure white, specular highlights',
];
export const zoneNumeral = (z: number) => ZONE_NUMERALS[Math.max(0, Math.min(10, Math.round(z)))]!;

/** EV100 to expose for so an area metered at areaEV renders on `zone`. */
export const exposureForPlacement = (areaEV: number, zone: number) => areaEV - (zone - 5);
export const compensationForZone = (zone: number) => zone - 5;
export const zoneOf = (areaEV: number, exposureEV: number) => 5 + (areaEV - exposureEV);

export interface ContrastAnalysis {
  range: number;
  highlightZone: number;
  development: string;
  advice: string;
}

/** Place the important shadow on Zone III; see where the highlight lands. */
export function analyseContrast(shadowEV: number, highlightEV: number, shadowZone = 3, highlightTarget = 8): ContrastAnalysis {
  const range = highlightEV - shadowEV;
  const hz = shadowZone + range;
  const delta = Math.round(hz - highlightTarget);
  const development = delta === 0 ? 'N' : delta > 0 ? `N−${delta}` : `N+${-delta}`;
  const where = `Highlights fall on Zone ${zoneNumeral(Math.max(0, hz))}`;
  const advice =
    delta === 0
      ? `${where} — normal development.`
      : delta > 0
        ? `${where} — contract development (${development}) for a negative, or accept lost highlight detail.`
        : `${where} — expand development (${development}) for more contrast.`;
  return { range, highlightZone: hz, development, advice: `${advice} Development changes are indicative; test with your developer.` };
}

/** Fraction of the frame on each zone, relative to an exposure. `frameEV` is the scene EV of linear mid-grey in the frame. */
export function zoneHistogram(grid: LuminanceGrid, frameEV: number, exposureEV: number, midGrey = 0.18): number[] {
  const bins = new Array<number>(11).fill(0);
  for (const v of grid.values) {
    const areaEV = frameEV + Math.log2(Math.max(v, 1e-6) / midGrey);
    const z = Math.round(zoneOf(areaEV, exposureEV));
    bins[Math.max(0, Math.min(10, z))]! += 1;
  }
  const n = grid.values.length || 1;
  return bins.map((b) => b / n);
}

// --- Long exposure ---------------------------------------------------------------------------------

export const equivalentSeconds = (seconds: number, from: Aperture, to: Aperture) => seconds * (to.exact / from.exact) ** 2;

// --- Astro and close-up -----------------------------------------------------------------------------

/** "500 rule" star-point limit: rule / (focal length × crop factor). */
export function maxStarPointSeconds(focal: number | undefined, diagonalMM: number, rule = 500): number | undefined {
  if (!focal || focal <= 0 || diagonalMM <= 0) return undefined;
  return rule / (focal * (43.27 / diagonalMM));
}

/** Light loss for magnification m: (1 + m/p)² with pupil magnification p. */
export const bellowsStops = (m: number, p = 1) => (m > 0 && p > 0 ? 2 * Math.log2(1 + m / p) : 0);
export const magnificationFromExtension = (extensionMM: number, focalMM: number) => (focalMM > 0 ? Math.max(0, extensionMM / focalMM) : 0);
