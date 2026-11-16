import { useSyncExternalStore } from 'react';
import type { LuminanceGrid } from '../engine';

/** The frame currently on the meter, shared with the Zone System tool. In-memory only. */
export interface CurrentFrame {
  grid: LuminanceGrid;
  /** Calibrated scene EV100 represented by linear mid-grey (0.18) in this frame. */
  frameEV: number;
  imageURL: string | null;
  aspect: number;
  label: string;
}

let current: CurrentFrame | null = null;
const listeners = new Set<() => void>();

export function publishFrame(f: CurrentFrame | null) {
  current = f;
  listeners.forEach((l) => l());
}

export function useCurrentFrame(): CurrentFrame | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
  );
}

/** Area EV from a frame: frameEV + log2(Y / 0.18). */
export const areaEV = (frameEV: number, linear: number) => frameEV + Math.log2(Math.max(linear, 1e-6) / 0.18);

/** Latest uncalibrated meter reading, for adding calibration comparisons. */
export interface RawReading {
  raw: number;
  path: import('../engine').MeasurementPath;
  label: string;
  at: number;
}
let lastRaw: RawReading | null = null;
const rawListeners = new Set<() => void>();
export function publishRaw(r: RawReading | null) {
  lastRaw = r;
  rawListeners.forEach((l) => l());
}
export function useLastRaw(): RawReading | null {
  return useSyncExternalStore(
    (l) => {
      rawListeners.add(l);
      return () => {
        rawListeners.delete(l);
      };
    },
    () => lastRaw,
  );
}
