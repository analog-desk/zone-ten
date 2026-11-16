import exifr from 'exifr';
import { gridFromRGBA, type CaptureExposure, type LuminanceGrid } from '../engine';

/** A measured photo: the phone's exposure metadata plus a linear luminance grid of the image. */
export interface PhotoFrame {
  capture: CaptureExposure;
  grid: LuminanceGrid;
  /** Display copy (data URL, ≤ 900 px) — also stored as the reading's reference image. */
  imageURL: string;
  aspect: number;
  device: string;
  takenAt: string | null;
}

export class PhotoMeterError extends Error {}

const GRID_W = 64;

function num(v: unknown): number | undefined {
  if (Array.isArray(v)) return num(v[0]);
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new PhotoMeterError("This browser can't decode the photo. Try JPEG (on iPhone: Settings → Camera → Formats → Most Compatible)."));
    img.src = url;
  });
}

/**
 * Reads exposure metadata (shutter, aperture, ISO) and pixels from a photo taken with the phone's camera.
 * Without that metadata the photo cannot be measured — no value is guessed.
 */
export async function measurePhoto(file: Blob): Promise<PhotoFrame> {
  let tags: Record<string, unknown> | undefined;
  try {
    tags = await exifr.parse(file, {
      pick: ['ExposureTime', 'FNumber', 'ISO', 'ISOSpeedRatings', 'PhotographicSensitivity', 'Make', 'Model', 'DateTimeOriginal'],
    });
  } catch {
    tags = undefined;
  }
  const seconds = num(tags?.ExposureTime);
  const fNumber = num(tags?.FNumber);
  const iso = num(tags?.ISO) ?? num(tags?.ISOSpeedRatings) ?? num(tags?.PhotographicSensitivity);
  if (!seconds || !fNumber || !iso) {
    throw new PhotoMeterError(
      'This photo has no exposure data (shutter, aperture and ISO), so it cannot be measured. Take the photo with the Measure button, or pick an original camera photo — screenshots and edited or messaged images usually lose it.',
    );
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    // Analysis copy.
    const aw = 320;
    const ah = Math.max(1, Math.round((aw * h) / w));
    const c = document.createElement('canvas');
    c.width = aw;
    c.height = ah;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new PhotoMeterError('Canvas unavailable.');
    ctx.drawImage(img, 0, 0, aw, ah);
    const data = ctx.getImageData(0, 0, aw, ah).data;
    const gh = Math.max(1, Math.round((GRID_W * ah) / aw));
    const grid = gridFromRGBA(data, aw, ah, GRID_W, gh);

    // Reference image.
    const dw = Math.min(900, w);
    const dh = Math.round((dw * h) / w);
    const d = document.createElement('canvas');
    d.width = dw;
    d.height = dh;
    d.getContext('2d')!.drawImage(img, 0, 0, dw, dh);
    const imageURL = d.toDataURL('image/jpeg', 0.78);

    const date = tags?.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal.toISOString() : null;
    return {
      capture: { fNumber, seconds, iso },
      grid,
      imageURL,
      aspect: w / h,
      device: [tags?.Make, tags?.Model].filter((x) => typeof x === 'string').join(' ').trim() || 'Phone camera',
      takenAt: date,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function dataURLToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
