import { gridFromRGBA, makePolicy, nextExposure, regionStats, type ControllerPolicy, type LuminanceGrid, type MeteringMode, type NPoint } from '../engine';

// Live reflected metering through the browser camera.
//
// Absolute live readings need the camera's real exposure time and ISO for every frame, and the ability to set
// them manually ("null metering"). Browsers that implement the Media Capture Image extensions on Android
// (Chrome) expose `exposureMode: 'manual'`, `exposureTime` (units of 100 µs) and `iso`. Safari on iPhone does
// not, so there the live view is for framing only and readings come from the photo meter. Nothing is estimated.

type ExtCapabilities = MediaTrackCapabilities & {
  exposureMode?: string[];
  exposureTime?: { min: number; max: number; step?: number };
  iso?: { min: number; max: number; step?: number };
  zoom?: { min: number; max: number; step?: number };
};
type ExtSettings = MediaTrackSettings & { exposureMode?: string; exposureTime?: number; iso?: number; zoom?: number };

export interface LiveFrame {
  grid: LuminanceGrid;
  /** Present only when the browser reports manual exposure values. */
  exposure?: { seconds: number; iso: number };
  atMin: boolean;
  atMax: boolean;
}

export interface LiveRegion {
  mode: MeteringMode;
  spot: NPoint;
  diameter: number;
  points: NPoint[];
}

export type LiveCapability = 'absolute' | 'framingOnly';

export class LiveMeter {
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private timer: number | null = null;
  private canvas = document.createElement('canvas');
  private policy: ControllerPolicy | null = null;
  private pending = false;
  capability: LiveCapability = 'framingOnly';
  zoomRange: { min: number; max: number } | null = null;
  region: LiveRegion = { mode: 'centerWeighted', spot: { x: 0.5, y: 0.5 }, diameter: 0.06, points: [] };

  constructor(private onFrame: (f: LiveFrame) => void) {}

  async start(video: HTMLVideoElement, facing: 'environment' | 'user' = 'environment'): Promise<LiveCapability> {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera access.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
    });
    this.track = this.stream.getVideoTracks()[0] ?? null;
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => undefined);

    const caps = (this.track?.getCapabilities?.() ?? {}) as ExtCapabilities;
    this.zoomRange = caps.zoom ? { min: caps.zoom.min, max: Math.min(caps.zoom.max, 8) } : null;
    if (caps.exposureMode?.includes('manual') && caps.exposureTime && caps.iso) {
      const minS = caps.exposureTime.min / 10000;
      const maxS = caps.exposureTime.max / 10000;
      this.policy = makePolicy({ minSeconds: Math.max(minS, 1e-5), maxSeconds: Math.min(maxS, 0.5), minISO: caps.iso.min, maxISO: caps.iso.max });
      try {
        await this.track!.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureTime: 1 / 60 * 10000, iso: Math.max(caps.iso.min, 100) } as MediaTrackConstraintSet] });
        this.capability = 'absolute';
      } catch {
        this.capability = 'framingOnly';
      }
    } else {
      this.capability = 'framingOnly';
    }

    const tick = () => {
      this.sample(video);
      this.timer = window.setTimeout(tick, 120);
    };
    tick();
    return this.capability;
  }

  async setZoom(z: number) {
    if (!this.track || !this.zoomRange) return;
    try {
      await this.track.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] });
    } catch {
      /* unsupported */
    }
  }

  private sample(video: HTMLVideoElement) {
    if (!video.videoWidth) return;
    const aw = 160;
    const ah = Math.round((aw * video.videoHeight) / video.videoWidth);
    this.canvas.width = aw;
    this.canvas.height = ah;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, aw, ah);
    const grid = gridFromRGBA(ctx.getImageData(0, 0, aw, ah).data, aw, ah, 48, Math.max(1, Math.round((48 * ah) / aw)));

    if (this.capability !== 'absolute' || !this.track || !this.policy) {
      this.onFrame({ grid, atMin: false, atMax: false });
      return;
    }
    const s = this.track.getSettings() as ExtSettings;
    const seconds = (s.exposureTime ?? 0) / 10000;
    const iso = s.iso ?? 0;
    if (!(seconds > 0 && iso > 0)) {
      this.onFrame({ grid, atMin: false, atMax: false });
      return;
    }
    const r = regionStats(grid, this.region.mode, this.region.spot, this.region.diameter, this.region.points);
    const step = nextExposure(this.policy, { fNumber: 1, seconds, iso }, r.mean, r.clipped);
    const atMin = seconds <= this.policy.minSeconds * 1.01 && iso <= this.policy.minISO * 1.01;
    const atMax = seconds >= this.policy.maxSeconds * 0.99 && iso >= this.policy.maxISO * 0.99;
    this.onFrame({ grid, exposure: { seconds, iso }, atMin, atMax });
    if (step && !this.pending) {
      this.pending = true;
      this.track
        .applyConstraints({ advanced: [{ exposureMode: 'manual', exposureTime: step.seconds * 10000, iso: step.iso } as MediaTrackConstraintSet] })
        .catch(() => undefined)
        .finally(() => {
          this.pending = false;
        });
    }
  }

  /** JPEG of the current video frame (reference image). */
  snapshot(video: HTMLVideoElement): string | null {
    if (!video.videoWidth) return null;
    const w = Math.min(900, video.videoWidth);
    const h = Math.round((w * video.videoHeight) / video.videoWidth);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')?.drawImage(video, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.78);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.track = null;
    this.policy = null;
    this.capability = 'framingOnly';
  }
}
