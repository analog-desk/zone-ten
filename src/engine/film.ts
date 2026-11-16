import { exactISO, fmtISO, fmtStops, fmtTime, isoScale, nearest, type StopIncrement } from './scale';
import type { CameraProfile, FilmCatalog, FilmCategory, FilmFormat, FilmStock, ProductStatus, ReciprocityData } from './types';
import { FORMAT_LABEL, CATEGORY_LABEL } from './types';

// ---------------------------------------------------------------------------------------------------
// Reciprocity
// ---------------------------------------------------------------------------------------------------

export type ReciprocityBasis = 'noCorrectionNeeded' | 'published' | 'extrapolated' | 'unpublished';

export interface ReciprocityResult {
  metered: number;
  corrected: number;
  basis: ReciprocityBasis;
  addedStops: number;
  source?: string | null;
}

const result = (metered: number, corrected: number, basis: ReciprocityBasis, source?: string | null): ReciprocityResult => ({
  metered,
  corrected,
  basis,
  addedStops: Math.log2(corrected / metered),
  source,
});

/** Corrected exposure time for a metered time. Never invents data: unpublished → uncorrected + flagged. */
export function correctReciprocity(tm: number, data: ReciprocityData): ReciprocityResult {
  if (!(tm > 0) || !Number.isFinite(tm)) return result(tm, tm, 'unpublished', data.source);
  if (data.kind === 'unpublished') return result(tm, tm, 'unpublished', data.source);
  if (data.kind === 'powerLaw') {
    const p = data.exponent ?? 1;
    const threshold = Math.max(data.appliesAboveSeconds ?? 1, 1e-6);
    if (tm <= threshold) return result(tm, tm, 'noCorrectionNeeded', data.source);
    const tc = Math.max(tm, tm ** p);
    const beyond = data.publishedUpToSeconds != null && tm > data.publishedUpToSeconds;
    return result(tm, tc, beyond ? 'extrapolated' : 'published', data.source);
  }
  const pts = [...(data.points ?? [])].sort((a, b) => a.metered - b.metered);
  const first = pts[0];
  const last = pts.at(-1);
  if (!first || !last) return result(tm, tm, 'unpublished', data.source);
  if (tm <= first.metered) {
    const ratio = first.corrected / first.metered;
    return result(tm, tm, ratio <= 1.0001 ? 'noCorrectionNeeded' : 'unpublished', data.source);
  }
  if (tm >= last.metered) {
    const limit = data.publishedUpToSeconds ?? last.metered;
    const basis: ReciprocityBasis = tm > limit * 1.0001 ? 'extrapolated' : 'published';
    if (pts.length >= 2) {
      const a = pts[pts.length - 2]!;
      const slope = (Math.log(last.corrected) - Math.log(a.corrected)) / (Math.log(last.metered) - Math.log(a.metered));
      const tc = Math.exp(Math.log(last.corrected) + slope * (Math.log(tm) - Math.log(last.metered)));
      return result(tm, Math.max(tm, tc), basis, data.source);
    }
    return result(tm, tm * (last.corrected / last.metered), basis, data.source);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (tm >= a.metered && tm <= b.metered) {
      const f = (Math.log(tm) - Math.log(a.metered)) / (Math.log(b.metered) - Math.log(a.metered));
      const tc = Math.exp(Math.log(a.corrected) + f * (Math.log(b.corrected) - Math.log(a.corrected)));
      return result(tm, Math.max(tm, tc), Math.abs(tc - tm) / tm < 0.01 ? 'noCorrectionNeeded' : 'published', data.source);
    }
  }
  return result(tm, tm, 'unpublished', data.source);
}

export const reciprocitySignificant = (r: ReciprocityResult) => r.addedStops >= 1 / 6;

export function reciprocityText(r: ReciprocityResult): string {
  const m = fmtTime(r.metered);
  const c = fmtTime(r.corrected);
  switch (r.basis) {
    case 'noCorrectionNeeded':
      return `No reciprocity correction needed at ${m}.`;
    case 'published':
      return `Reciprocity: metered ${m} → expose ${c} (${fmtStops(r.addedStops)} stop).`;
    case 'extrapolated':
      return `Reciprocity: metered ${m} → about ${c}, extrapolated beyond published data — bracket longer.`;
    case 'unpublished':
      return `No published reciprocity data for this film in the catalog. Metered ${m} is shown uncorrected; add a custom curve or bracket longer.`;
  }
}

export function reciprocitySummary(d: ReciprocityData): string {
  if (d.kind === 'powerLaw') return `Tc = Tm^${(d.exponent ?? 1).toFixed(2)} above ${fmtTime(d.appliesAboveSeconds ?? 1)}`;
  if (d.kind === 'table') return `Published table (${d.points?.length ?? 0} points${d.publishedUpToSeconds ? `, to ${fmtTime(d.publishedUpToSeconds)}` : ''})`;
  return 'No published data in catalog';
}

export function validateReciprocity(d: ReciprocityData): string[] {
  const issues: string[] = [];
  if (d.kind === 'powerLaw') {
    const p = d.exponent;
    if (p == null) issues.push('Power-law exponent missing.');
    else if (p < 1 || p > 2) issues.push(`Exponent ${p} outside the plausible range 1.0–2.0.`);
  } else if (d.kind === 'table') {
    const pts = d.points ?? [];
    if (pts.length < 1) issues.push('Table needs at least one point.');
    for (let i = 1; i < pts.length; i++) {
      if (!(pts[i]!.metered > pts[i - 1]!.metered && pts[i]!.corrected >= pts[i - 1]!.corrected)) {
        issues.push('Table points must increase.');
        break;
      }
    }
    if (pts.some((p) => p.corrected < p.metered || p.metered <= 0)) issues.push('Corrected times must be ≥ metered times.');
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------------
// Film stock helpers
// ---------------------------------------------------------------------------------------------------

export const displayName = (s: FilmStock) => `${s.manufacturer} ${s.name}`;
/** Speed against which push/pull and Rate My Film differences are expressed. */
export const referenceSpeed = (s: FilmStock) => s.boxSpeed ?? s.defaultEI;
export const boxSpeedLabel = (s: FilmStock) => (s.boxSpeed != null ? `ISO ${fmtISO(s.boxSpeed)}` : s.speedDesignation);

/** Exposure latitude guidance when the camera cannot hit the metered exposure exactly. */
export function latitudeAdvice(c: FilmCategory): string {
  if (c === 'colorNegative' || c === 'bwNegative')
    return 'Negative film tolerates overexposure far better than underexposure — when in doubt choose the option that gives more exposure.';
  if (c === 'colorReversal') return 'Slide film has narrow latitude and loses highlights quickly — prefer the option closest to, or slightly under, the metered exposure.';
  return "This film's latitude varies — bracket when the camera cannot match the metered exposure.";
}
/** Positive: prefer slightly more exposure on near-ties. */
export function latitudeBias(c: FilmCategory): number {
  if (c === 'colorNegative' || c === 'bwNegative') return 0.05;
  if (c === 'colorReversal') return -0.05;
  return 0;
}

export function matchesSearch(s: FilmStock, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [s.manufacturer, s.name, s.speedDesignation, CATEGORY_LABEL[s.category], s.process ?? '', s.formats.map((f) => FORMAT_LABEL[f]).join(' ')]
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((t) => hay.includes(t));
}

export interface SearchFilter {
  manufacturer?: string;
  category?: FilmCategory;
  format?: FilmFormat;
  includeDiscontinued?: boolean;
}

export function searchFilms(stocks: FilmStock[], query: string, f: SearchFilter = {}): FilmStock[] {
  return stocks
    .filter(
      (s) =>
        (!f.manufacturer || s.manufacturer === f.manufacturer) &&
        (!f.category || s.category === f.category) &&
        (!f.format || s.formats.includes(f.format)) &&
        (f.includeDiscontinued !== false || s.status !== 'discontinued') &&
        matchesSearch(s, query),
    )
    .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || referenceSpeed(a) - referenceSpeed(b) || a.name.localeCompare(b.name));
}

export function validateStock(s: FilmStock): string[] {
  const issues: string[] = [];
  if (!s.id) issues.push('Missing id.');
  if (!s.name || !s.manufacturer) issues.push(`${s.id}: missing name or manufacturer.`);
  if (!s.formats?.length) issues.push(`${s.id}: no formats listed.`);
  if (s.boxSpeed != null && !(s.boxSpeed > 0)) issues.push(`${s.id}: box speed must be positive.`);
  if (!(s.defaultEI > 0)) issues.push(`${s.id}: default EI must be positive.`);
  issues.push(...validateReciprocity(s.reciprocity).map((i) => `${s.id}: ${i}`));
  if (s.lastVerified && !/^\d{4}-\d{2}-\d{2}$/.test(s.lastVerified)) issues.push(`${s.id}: lastVerified is not an ISO date.`);
  return issues;
}

// ---------------------------------------------------------------------------------------------------
// Catalog validation and updates
// ---------------------------------------------------------------------------------------------------

export const SUPPORTED_SCHEMA = 1;

export function validateCatalog(c: FilmCatalog): string[] {
  const issues: string[] = [];
  if (!c || !Array.isArray(c.stocks) || !Array.isArray(c.manufacturers)) return ['Not a film catalog file.'];
  if (c.schemaVersion > SUPPORTED_SCHEMA) issues.push(`Catalog schema ${c.schemaVersion} is newer than this app supports (${SUPPORTED_SCHEMA}).`);
  const seen = new Set<string>();
  for (const s of c.stocks) {
    if (seen.has(s.id)) issues.push(`Duplicate stock id ${s.id}.`);
    seen.add(s.id);
    issues.push(...validateStock(s));
    if (!c.manufacturers.some((m) => m.name === s.manufacturer)) issues.push(`${s.id}: manufacturer ${s.manufacturer} not declared.`);
  }
  return issues;
}

export interface CatalogDiff {
  added: string[];
  announced: string[];
  updated: string[];
  statusChanges: { id: string; name: string; from: ProductStatus; to: ProductStatus }[];
  newManufacturers: string[];
}

/** Merges a newer catalog. Nothing is ever removed, so historical rolls and readings keep resolving. */
export function mergeCatalog(base: FilmCatalog, update: FilmCatalog): { catalog: FilmCatalog; diff: CatalogDiff } {
  const issues = validateCatalog(update);
  if (issues.length) throw new Error(`The catalog update failed validation:\n${issues.slice(0, 8).join('\n')}`);
  if (!(update.catalogVersion > base.catalogVersion))
    throw new Error(`Catalog version ${update.catalogVersion} is not newer than the installed version ${base.catalogVersion}.`);
  const out: FilmCatalog = { ...base, manufacturers: [...base.manufacturers], stocks: [...base.stocks] };
  const diff: CatalogDiff = { added: [], announced: [], updated: [], statusChanges: [], newManufacturers: [] };
  for (const m of update.manufacturers) {
    if (!out.manufacturers.some((x) => x.id === m.id)) {
      out.manufacturers.push(m);
      diff.newManufacturers.push(m.name);
    }
  }
  for (const s of update.stocks) {
    const i = out.stocks.findIndex((x) => x.id === s.id);
    if (i >= 0) {
      const old = out.stocks[i]!;
      if (JSON.stringify(old) === JSON.stringify(s)) continue;
      if (old.status !== s.status) diff.statusChanges.push({ id: s.id, name: displayName(s), from: old.status, to: s.status });
      diff.updated.push(displayName(s));
      out.stocks[i] = s;
    } else {
      out.stocks.push(s);
      (s.status === 'announced' ? diff.announced : diff.added).push(displayName(s));
    }
  }
  out.catalogVersion = update.catalogVersion;
  out.publishedAt = update.publishedAt;
  return { catalog: out, diff };
}

export function diffSummary(d: CatalogDiff): string[] {
  const lines: string[] = [];
  if (d.added.length) lines.push(`New: ${d.added.join(', ')}`);
  if (d.announced.length) lines.push(`Announced (not yet available): ${d.announced.join(', ')}`);
  const disc = d.statusChanges.filter((c) => c.to === 'discontinued').map((c) => c.name);
  if (disc.length) lines.push(`Now discontinued (kept for history): ${disc.join(', ')}`);
  const rel = d.statusChanges.filter((c) => c.from === 'announced' && c.to === 'available').map((c) => c.name);
  if (rel.length) lines.push(`Now available: ${rel.join(', ')}`);
  if (d.updated.length) lines.push(`Updated records: ${d.updated.length}`);
  if (d.newManufacturers.length) lines.push(`New manufacturers: ${d.newManufacturers.join(', ')}`);
  return lines.length ? lines : ['No changes.'];
}

// ---------------------------------------------------------------------------------------------------
// Rate My Film
// ---------------------------------------------------------------------------------------------------

export const STANDARD_EIS = [25, 50, 100, 125, 160, 200, 400, 800, 1600, 3200];

export interface EIOption {
  ei: number;
  /** Exposure given relative to box speed. Positive = more exposure (rated slower). */
  stopsVsBox: number;
  isBox: boolean;
}

export const eiDifference = (ei: number, reference: number) => Math.log2(exactISO(reference) / exactISO(ei));

export function eiOption(ei: number, film: FilmStock): EIOption {
  const d = eiDifference(ei, referenceSpeed(film));
  return { ei, stopsVsBox: d, isBox: Math.abs(d) < 0.01 };
}

export function eiOptionLabel(o: EIOption): string {
  if (o.isBox) return 'Box speed';
  return `${fmtStops(o.stopsVsBox)} ${Math.abs(o.stopsVsBox) <= 1.02 ? 'stop' : 'stops'} exposure`;
}

/** EI choices appropriate for the film (pull 3 … push 3 around box speed) and the camera's ISO range. */
export function eiOptions(film: FilmStock, camera?: CameraProfile, inc: StopIncrement = 3, includeStandard = true): EIOption[] {
  const ref = referenceSpeed(film);
  const lo = ref / 8;
  const hi = ref * 8;
  const set = new Set<number>();
  if (includeStandard) STANDARD_EIS.forEach((v) => set.add(v));
  for (let k = -3; k <= 3; k++) {
    const v = nearest(isoScale(inc), ref * 2 ** k, (x) => x);
    if (v) set.add(v);
  }
  set.add(ref);
  set.add(film.defaultEI);
  return [...set]
    .filter((v) => v >= lo * 0.97 && v <= hi * 1.03)
    .filter((v) => !camera || (v >= camera.isoMin && v <= camera.isoMax) || v === ref)
    .sort((a, b) => a - b)
    .map((v) => eiOption(v, film));
}

export function validateCustomEI(ei: number, camera?: CameraProfile): string | null {
  if (!Number.isFinite(ei) || ei <= 0) return 'Enter a positive exposure index.';
  if (camera && (ei < camera.isoMin || ei > camera.isoMax)) return `${camera.name} is configured for ISO ${fmtISO(camera.isoMin)}–${fmtISO(camera.isoMax)}.`;
  return null;
}

/** Intended development: positive = push. */
export function processingLabel(stops: number): string {
  if (Math.abs(stops) < 0.05) return 'Normal development';
  const n = fmtStops(Math.abs(stops)).replace('+', '');
  return stops > 0 ? `Push ${n}` : `Pull ${n}`;
}

