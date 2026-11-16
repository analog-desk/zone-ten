import type { Aperture, ShutterSpeed } from './scale';

export type FilmFormat = '35mm' | '120' | '220' | '127' | '110' | '4x5' | '5x7' | '8x10' | 'Digital' | 'Other';
export const FORMAT_LABEL: Record<FilmFormat, string> = {
  '35mm': '35mm',
  '120': '120',
  '220': '220',
  '127': '127',
  '110': '110',
  '4x5': '4×5 sheet',
  '5x7': '5×7 sheet',
  '8x10': '8×10 sheet',
  Digital: 'Digital',
  Other: 'Other',
};
export const isSheet = (f: FilmFormat) => f === '4x5' || f === '5x7' || f === '8x10';

export type CameraExposureMode = 'program' | 'aperturePriority' | 'shutterPriority' | 'manual';
export const CAMERA_MODE_LABEL: Record<CameraExposureMode, string> = {
  program: 'Program',
  aperturePriority: 'Aperture Priority',
  shutterPriority: 'Shutter Priority',
  manual: 'Manual',
};

export interface LensConfig {
  name: string;
  /** mm; editable assumption unless focalConfirmed. */
  focalLength?: number;
  focalConfirmed: boolean;
  fixed: boolean;
  apertures: Aperture[];
}

export interface CameraProfile {
  id: string;
  templateId?: string;
  name: string;
  format: FilmFormat;
  negativeSize: string;
  /** Image-area diagonal (mm) for crop factor and star-trail rules. */
  diagonalMM: number;
  mount: string;
  modes: CameraExposureMode[];
  lens: LensConfig;
  /** Marked (timed) speeds. */
  speeds: ShutterSpeed[];
  mechanicalNotes: string[];
  bulb: boolean;
  flashSync?: number;
  isoMin: number;
  isoMax: number;
  builtInMeter: boolean;
  /** Digital bodies: ISO can change per shot (enables auto-ISO). */
  isoPerShot: boolean;
  notes: string[];
  /** User's photo of the camera (data URL), optional. */
  photo?: string;
}

export type FilmCategory = 'colorNegative' | 'colorReversal' | 'bwNegative' | 'infrared' | 'specialty' | 'experimental';
export const CATEGORY_LABEL: Record<FilmCategory, string> = {
  colorNegative: 'Color Negative',
  colorReversal: 'Color Reversal / Slide',
  bwNegative: 'Black & White Negative',
  infrared: 'Infrared',
  specialty: 'Specialty',
  experimental: 'Experimental',
};

export type ProductStatus = 'available' | 'announced' | 'discontinued' | 'unverified';
export const STATUS_LABEL: Record<ProductStatus, string> = {
  available: 'Available',
  announced: 'Announced — not yet available',
  discontinued: 'Discontinued',
  unverified: 'Unverified listing',
};

export interface ReciprocityPoint {
  metered: number;
  corrected: number;
}
export interface ReciprocityData {
  kind: 'powerLaw' | 'table' | 'unpublished';
  exponent?: number | null;
  appliesAboveSeconds?: number | null;
  points?: ReciprocityPoint[] | null;
  publishedUpToSeconds?: number | null;
  source?: string | null;
  note?: string | null;
}

export interface FilmStock {
  id: string;
  manufacturer: string;
  name: string;
  category: FilmCategory;
  process: string | null;
  /** Manufacturer ISO speed when published as a number. Never modified by the app. */
  boxSpeed: number | null;
  /** As printed: "ISO 400", "P3200". */
  speedDesignation: string;
  defaultEI: number;
  formats: FilmFormat[];
  reciprocity: ReciprocityData;
  status: ProductStatus;
  manufacturerReference: string | null;
  lastVerified: string | null;
  verificationNotes: string | null;
  notes: string | null;
  isCustom: boolean;
}

export interface Manufacturer {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
}

export interface FilmCatalog {
  schemaVersion: number;
  catalogVersion: number;
  publishedAt: string;
  manufacturers: Manufacturer[];
  stocks: FilmStock[];
}
