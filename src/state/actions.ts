import {
  snapToCamera,
  initialState,
  type CalibrationProfile,
  type CameraProfile,
  type FilmFormat,
  type FilmStock,
  type Goal,
  type MeterState,
} from '../engine';
import { imgDelete, imgGet, imgSet } from './db';
import { activeRoll, ensureSession, getDoc, uid, update, type Reading, type Roll } from './store';

export function setGoal(goal: Goal | null, customGoal = '') {
  update((d) => {
    d.goal = goal;
    d.customGoal = customGoal;
    d.goalConfirmedOn = new Date().toISOString();
  });
}

export function confirmGoal() {
  update((d) => {
    d.goalConfirmedOn = new Date().toISOString();
  });
}

/** Adds (or replaces) a saved camera and makes it active. */
export function saveCamera(c: CameraProfile, makeActive = true) {
  update((d) => {
    const i = d.cameras.findIndex((x) => x.id === c.id);
    if (i >= 0) d.cameras[i] = c;
    else d.cameras.push(c);
    if (makeActive) d.activeCameraId = c.id;
    const roll = activeRoll(d, c.id);
    if (d.meterByCamera[c.id]) d.meterByCamera[c.id] = snapToCamera(d.meterByCamera[c.id]!, c, roll?.workingEI ?? 400);
  });
}

/** New saved camera from a template; unique id so the same model can be saved twice. */
export function cameraFromTemplate(t: CameraProfile): CameraProfile {
  const exists = getDoc().cameras.some((c) => c.id === t.id);
  return { ...structuredClone(t), id: exists ? `${t.templateId ?? 'camera'}-${uid().slice(0, 8)}` : t.id };
}

export function deleteCamera(id: string) {
  update((d) => {
    d.cameras = d.cameras.filter((c) => c.id !== id);
    if (d.activeCameraId === id) d.activeCameraId = d.cameras[0]?.id ?? null;
    delete d.meterByCamera[id];
  });
}

export function setActiveCamera(id: string) {
  update((d) => {
    d.activeCameraId = id;
  });
}

export function loadRoll(opts: { camera: CameraProfile; stock: FilmStock; format: FilmFormat; workingEI: number; processing: string; pushPull: number; notes: string }) {
  update((d) => {
    const now = new Date().toISOString();
    for (const r of d.rolls) if (r.cameraId === opts.camera.id && !r.finishedAt) r.finishedAt = now;
    const n = d.rolls.filter((r) => r.cameraId === opts.camera.id).length + 1;
    const roll: Roll = {
      id: uid(),
      cameraId: opts.camera.id,
      cameraName: opts.camera.name,
      stock: structuredClone(opts.stock),
      format: opts.format,
      workingEI: opts.workingEI,
      rollNumber: n,
      loadedAt: now,
      processing: opts.processing,
      pushPull: opts.pushPull,
      notes: opts.notes,
      finishedAt: null,
    };
    d.rolls.push(roll);
    d.lastFilmByCamera[opts.camera.id] = opts.stock.id;
    const st = d.meterByCamera[opts.camera.id] ?? initialState(opts.camera, opts.workingEI);
    d.meterByCamera[opts.camera.id] = snapToCamera(st, opts.camera, opts.workingEI);
  });
}

export function finishRoll(id: string) {
  update((d) => {
    const r = d.rolls.find((x) => x.id === id);
    if (r) r.finishedAt = new Date().toISOString();
  });
}

/** Rate the loaded film at a different EI. The stock's box speed is never touched. */
export function setWorkingEI(rollId: string, ei: number, pushPull?: number) {
  update((d) => {
    const r = d.rolls.find((x) => x.id === rollId);
    if (!r) return;
    r.workingEI = ei;
    if (pushPull !== undefined) r.pushPull = pushPull;
    const cam = d.cameras.find((c) => c.id === r.cameraId);
    const st = d.meterByCamera[r.cameraId];
    if (cam && st) d.meterByCamera[r.cameraId] = snapToCamera(st, cam, ei);
  });
}

export function updateRoll(id: string, patch: Partial<Roll>) {
  update((d) => {
    const r = d.rolls.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  });
}

export function setMeterState(cameraId: string, s: MeterState) {
  update((d) => {
    d.meterByCamera[cameraId] = s;
  });
}

export function saveCustomStock(s: FilmStock) {
  update((d) => {
    const i = d.customStocks.findIndex((x) => x.id === s.id);
    if (i >= 0) d.customStocks[i] = s;
    else d.customStocks.push(s);
  });
}

export function deleteCustomStock(id: string) {
  update((d) => {
    d.customStocks = d.customStocks.filter((s) => s.id !== id);
  });
}

// --- sessions and readings ------------------------------------------------------------------------------

export async function saveReading(r: Omit<Reading, 'id' | 'sessionId' | 'hasImage'>, imageDataURL: string | null): Promise<string> {
  const id = uid();
  let hasImage = false;
  if (imageDataURL) {
    try {
      await imgSet(`r:${id}`, await (await fetch(imageDataURL)).blob());
      hasImage = true;
    } catch {
      hasImage = false;
    }
  }
  update((d) => {
    const sessionId = ensureSession(d);
    d.readings.push({ ...r, id, sessionId, hasImage });
  });
  return id;
}

export async function duplicateReading(id: string) {
  const src = getDoc().readings.find((r) => r.id === id);
  if (!src) return;
  const nid = uid();
  if (src.hasImage) {
    const b = await imgGet(`r:${id}`);
    if (b) await imgSet(`r:${nid}`, b);
  }
  update((d) => {
    d.readings.push({ ...structuredClone(src), id: nid, notes: src.notes ? `${src.notes} (copy)` : '(copy)' });
  });
}

export async function deleteReading(id: string) {
  await imgDelete(`r:${id}`).catch(() => undefined);
  update((d) => {
    d.readings = d.readings.filter((r) => r.id !== id);
  });
}

export function updateReading(id: string, patch: Partial<Reading>) {
  update((d) => {
    const r = d.readings.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  });
}

export function renameSession(id: string, name: string) {
  update((d) => {
    const s = d.sessions.find((x) => x.id === id);
    if (s) s.name = name;
  });
}

export function updateSessionNotes(id: string, notes: string) {
  update((d) => {
    const s = d.sessions.find((x) => x.id === id);
    if (s) s.notes = notes;
  });
}

export async function deleteSession(id: string) {
  const ids = getDoc()
    .readings.filter((r) => r.sessionId === id)
    .map((r) => r.id);
  await Promise.all(ids.map((r) => imgDelete(`r:${r}`).catch(() => undefined)));
  update((d) => {
    d.readings = d.readings.filter((r) => r.sessionId !== id);
    d.sessions = d.sessions.filter((s) => s.id !== id);
    if (d.prefs.activeSessionId === id) d.prefs.activeSessionId = null;
  });
}

export function newSession() {
  update((d) => {
    d.prefs.activeSessionId = null;
    ensureSession(d);
  });
}

// --- calibration -------------------------------------------------------------------------------------------

export function saveCalibration(p: CalibrationProfile, makeActive = false) {
  update((d) => {
    const i = d.calibrations.findIndex((x) => x.id === p.id);
    if (i >= 0) d.calibrations[i] = p;
    else d.calibrations.push(p);
    if (makeActive || !d.activeCalibration[p.path]) d.activeCalibration[p.path] = p.id;
  });
}

export function deleteCalibration(id: string) {
  update((d) => {
    const p = d.calibrations.find((c) => c.id === id);
    d.calibrations = d.calibrations.filter((c) => c.id !== id);
    if (p && d.activeCalibration[p.path] === id) delete d.activeCalibration[p.path];
  });
}
