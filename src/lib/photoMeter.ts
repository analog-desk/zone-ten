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

/** What a picked/pasted file contained — shown to the user so failures explain themselves. */
export let lastDiagnostic = '';

const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

const GRID_W = 64;

function num(v: unknown): number | undefined {
  if (Array.isArray(v)) return num(v[0]);
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new PhotoMeterError("This browser can't decode the photo (HEIC needs Safari on iOS 17 or later). Try a JPEG: iPhone Settings → Camera → Formats → Most Compatible."));
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
  const found = (k: string, v: unknown) => `${k} ${v === undefined ? '✗' : '✓'}`;
  const fNumber = num(tags?.FNumber);
  const iso = num(tags?.ISO) ?? num(tags?.ISOSpeedRatings) ?? num(tags?.PhotographicSensitivity);
  lastDiagnostic = `${file.type || 'unknown type'}, ${kb(file.size)} · ${found('shutter', seconds)} ${found('aperture', fNumber)} ${found('ISO', iso)}${tags?.Model ? ` · ${String(tags.Make ?? '')} ${String(tags.Model)}` : ''}`;
  if (!seconds || !fNumber || !iso) {
    const missing = [!seconds && 'shutter time', !fNumber && 'aperture', !iso && 'ISO'].filter(Boolean).join(', ');
    const anyTags = !!tags && Object.keys(tags).length > 0;
    throw new PhotoMeterError(
      isIOS()
        ? `iPhone removed the camera data (${missing}) when handing the photo to the browser, so it can't be measured. ` +
          'Use the Zone Ten shortcut (Settings → iPhone setup) and tap Paste, or save the photo to Files and pick it with \"From Files\".'
        : `This photo has no ${missing} in its metadata${anyTags ? '' : ' (no camera data at all)'}, so it can't be measured. Use an original camera photo — screenshots and edited or messaged images lose it.`,
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

/** Decodes a photo file that an iOS Shortcut copied to the clipboard as Base64 text. */
export function blobFromBase64(text: string): Blob {
  const clean = text.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/=]/g, '');
  if (clean.length < 1000) throw new PhotoMeterError('The clipboard has no photo. Run the Zone Ten shortcut first (Settings → iPhone setup), then tap Paste.');
  let bin: string;
  try {
    bin = atob(clean);
  } catch {
    throw new PhotoMeterError('The clipboard text is not a Base64 photo. Run the Zone Ten shortcut again.');
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const isHeif = bin.slice(4, 8) === 'ftyp';
  return new Blob([bytes], { type: isHeif ? 'image/heic' : 'image/jpeg' });
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function dataURLToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
