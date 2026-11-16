import { describe, expect, it } from 'vitest';
import * as E from '../index';
import { BUNDLED_CATALOG } from '../../data/catalog';

const film = (id: string) => BUNDLED_CATALOG.stocks.find((s) => s.id === id)!;
const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);

function sel(cam: E.CameraProfile, iso: number, aperture: number, shutter: number): E.Selection {
  return {
    iso,
    aperture: cam.lens.apertures.find((a) => Math.abs(a.nominal - aperture) < 0.01)!,
    shutter: E.timed(cam.speeds.find((s) => Math.abs(s.nominal - shutter) < 1e-9)!),
  };
}
const inputs = (ev100: number, workingEI: number, extra: Partial<E.ExposureInputs> = {}): E.ExposureInputs => ({
  ev100,
  workingEI,
  compensation: 0,
  filterStops: 0,
  bellowsStops: 0,
  ...extra,
});

describe('exposure math', () => {
  it('EV definitions', () => {
    close(E.ev(1, 1), 0);
    close(E.ev(16, 1 / 128), 15);
  });
  it('sunny 16', () => close(E.secondsFor(E.settingsEV(15, 100), 16), 1 / 128));
  it('ISO conversions', () => {
    close(E.settingsEV(10, 200), 11);
    close(E.ev100FromSettings(11, 200), 10);
    close(E.isoFor(12, 8, 1 / 128), 200, 1e-6);
  });
  it('luminance', () => {
    close(E.luminance(0), 0.125);
    close(E.ev100FromLuminance(E.luminance(7.3)), 7.3);
  });
  it('filters', () => {
    close(E.stopsFromFilterFactor(8), 3);
    close(E.stopsFromDensity(3), Math.log2(1000), 1e-6);
  });
});

describe('standard scales', () => {
  it('exact apertures', () => {
    close(E.exactAperture(5.6), 2 ** 2.5);
    close(E.exactAperture(22), 2 ** 4.5);
    close(E.exactAperture(1.7), 2 ** 0.75);
    close(E.exactAperture(3.5), 2 ** (11 / 6));
    close(E.exactAperture(1.8), 2 ** (5 / 6));
    expect(E.exactAperture(3.7)).toBe(3.7);
  });
  it('exact shutters', () => {
    close(E.exactShutter(1 / 125), 1 / 128);
    close(E.exactShutter(1 / 60), 1 / 64);
    close(E.exactShutter(15), 16);
    expect(E.exactShutter(1 / 300)).toBe(1 / 300);
  });
  it('exact ISO', () => {
    close(E.exactISO(125), 100 * 2 ** (1 / 3));
    close(E.exactISO(12), 12.5);
  });
  it('scale counts', () => {
    expect(E.shutterScale(1).length).toBe(19);
    expect(E.shutterScale(3).length).toBe(55);
    expect(E.shutterScale(2).length).toBe(37);
    expect(E.apertureScale(1).length).toBe(13);
    expect(E.isoScale(1, 25, 3200)).toEqual([25, 50, 100, 200, 400, 800, 1600, 3200]);
  });
  it('scales are geometric', () => {
    for (const inc of [1, 2, 3] as E.StopIncrement[]) {
      const s = E.shutterScale(inc);
      for (let i = 1; i < s.length; i++) close(Math.log2(s[i]!.exact / s[i - 1]!.exact), 1 / inc);
      const a = E.apertureScale(inc);
      for (let i = 1; i < a.length; i++) {
        close(2 * Math.log2(a[i]!.exact / a[i - 1]!.exact), 1 / inc);
        expect(Math.abs(a[i]!.nominal - a[i]!.exact) / a[i]!.exact).toBeLessThan(0.06);
      }
    }
  });
  it('labels', () => {
    expect(E.fmtTime(1 / 125)).toBe('1/125');
    expect(E.fmtTime(0.5)).toBe('1/2');
    expect(E.fmtTime(0.3)).toBe('0.3s');
    expect(E.fmtTime(2)).toBe('2s');
    expect(E.fmtTime(150)).toBe('2m 30s');
    expect(E.fmtTime(1 / 173.4)).toBe('1/173');
    expect(E.fmtTime(3900)).toBe('1h 5m');
    expect(E.apLabel(E.ap(5.6))).toBe('f/5.6');
    expect(E.apLabel(E.ap(8))).toBe('f/8');
    expect(E.fmtStops(1 / 3)).toBe('+⅓');
    expect(E.fmtStops(-1)).toBe('−1');
    expect(E.fmtStops(5 / 3)).toBe('+1⅔');
    expect(E.fmtStops(0.27)).toBe('+0.3');
    expect(E.describeStops(-0.5)).toBe('½ stop under');
    expect(E.describeStops(2)).toBe('2 stops over');
  });
});

describe('camera profiles match the specification', () => {
  it('Pentax LX', () => {
    const lx = E.pentaxLX();
    expect(lx.lens.apertures.map((a) => a.nominal)).toEqual([1.7, 2, 2.8, 4, 5.6, 8, 11, 16, 22]);
    expect(E.sortedSpeeds(lx).map(E.speedLabel)).toEqual(['1/2000', '1/1000', '1/500', '1/250', '1/125', '1/60', '1/30', '1/15', '1/8', '1/4', '1/2', '1s', '2s', '4s']);
    expect([lx.isoMin, lx.isoMax, lx.bulb, lx.mount]).toEqual([25, 3200, true, 'Pentax K']);
    expect(lx.modes).toEqual(['aperturePriority', 'manual']);
  });
  it('Canon AE-1 Program', () => {
    const c = E.canonAE1Program();
    expect(c.lens.apertures.map((a) => a.nominal)).toEqual([1.8, 2, 2.8, 3.5, 4, 5.6, 8, 11, 16, 22]);
    expect(c.speeds.length).toBe(12);
    expect([c.isoMin, c.isoMax]).toEqual([12, 3200]);
    expect(c.modes).not.toContain('aperturePriority');
  });
  it('Yashica A', () => {
    const y = E.yashicaA();
    expect(y.lens.apertures.map((a) => a.nominal)).toEqual([3.5, 4, 5.6, 8, 11, 16, 22]);
    expect(E.sortedSpeeds(y).map(E.speedLabel)).toEqual(['1/300', '1/100', '1/50', '1/25']);
    expect(y.builtInMeter).toBe(false);
    expect(y.format).toBe('120');
  });
  it('validation and handheld limit', () => {
    for (const t of E.ALL_TEMPLATES) expect(E.validateCamera(t())).toEqual([]);
    close(E.handheldLimit(E.pentaxLX()), 1 / 50);
    close(E.handheldLimit(E.yashicaA()), 1 / (80 * (43.27 / 79.2)));
  });
});

describe('solver', () => {
  const lx = E.pentaxLX();
  const ae1 = E.canonAE1Program();
  const y = E.yashicaA();

  it('lock → mode mapping', () => {
    for (const m of ['aperturePriority', 'shutterPriority', 'isoPriority', 'manual', 'solveISO', 'program'] as E.MeterMode[]) expect(E.modeOf(E.locksFor(m))).toBe(m);
  });

  it('aperture priority exact match', () => {
    const s = E.solve({ camera: lx, film: film('kodak-portra-400') }, inputs(15, 100), E.locksFor('aperturePriority'), sel(lx, 100, 16, 1 / 60));
    close(s.metered.seconds, 1 / 128);
    expect(E.shutterLabel(s.camera.shutter)).toBe('1/125');
    close(s.camera.error, 0);
    expect(s.recommended.label).toBe('1/125');
    expect(s.solved).toEqual(['shutter']);
  });

  it('between speeds uses film latitude', () => {
    const neg = E.solve({ camera: lx, film: film('kodak-portra-400') }, inputs(15.5, 100), E.locksFor('aperturePriority'), sel(lx, 100, 16, 1 / 60));
    expect(E.shutterLabel(neg.camera.shutter)).toBe('1/125');
    close(neg.camera.error, 0.5);
    expect(E.shutterLabel(neg.alternative!.shutter)).toBe('1/250');
    const slide = E.solve({ camera: lx, film: film('kodak-ektachrome-e100') }, inputs(15.5, 100), E.locksFor('aperturePriority'), sel(lx, 100, 16, 1 / 60));
    expect(E.shutterLabel(slide.camera.shutter)).toBe('1/250');
    expect(slide.explanation.some((l) => l.includes('Slide film'))).toBe(true);
  });

  it('compensation, filters and EI change exposure, not EV', () => {
    const base = E.solve({ camera: lx }, inputs(10, 400), E.locksFor('aperturePriority'), sel(lx, 400, 8, 1 / 60));
    const plus = E.solve({ camera: lx }, inputs(10, 400, { compensation: 1 }), E.locksFor('aperturePriority'), sel(lx, 400, 8, 1 / 60));
    const nd = E.solve({ camera: lx }, inputs(10, 400, { filterStops: 3 }), E.locksFor('aperturePriority'), sel(lx, 400, 8, 1 / 60));
    const ei200 = E.solve({ camera: lx }, inputs(10, 200), E.locksFor('aperturePriority'), sel(lx, 200, 8, 1 / 60));
    close(plus.metered.seconds / base.metered.seconds, 2);
    close(nd.metered.seconds / base.metered.seconds, 8);
    close(ei200.metered.seconds / base.metered.seconds, 2);
    expect(ei200.ev100).toBe(base.ev100);
  });

  it('shutter priority solves aperture', () => {
    const s = E.solve({ camera: ae1 }, inputs(12, 400), E.locksFor('shutterPriority'), sel(ae1, 400, 2, 1 / 125));
    close(s.metered.aperture, 2 ** 3.5);
    expect(E.apLabel(s.camera.aperture)).toBe('f/11');
  });

  it('manual reports deviation; find-EI solves ISO', () => {
    const m = E.solve({ camera: lx }, inputs(12, 400), E.locksFor('manual'), sel(lx, 400, 8, 1 / 125));
    close(m.user.error, 1);
    const f = E.solve({ camera: lx }, inputs(12, 400), E.locksFor('solveISO'), sel(lx, 400, 8, 1 / 125));
    close(f.metered.iso, 200, 1e-6);
    expect(f.recommended.iso).toBe(200);
  });

  it('Yashica A never gets impossible settings', () => {
    const aps = new Set(y.lens.apertures.map((a) => a.exact));
    const sps = new Set(y.speeds.map((s) => s.exact));
    for (let ev = -4; ev <= 20; ev += 0.25)
      for (const ei of [25, 100, 400, 3200])
        for (const mode of ['isoPriority', 'aperturePriority', 'shutterPriority'] as E.MeterMode[]) {
          const s = E.solve({ camera: y, film: film('ilford-hp5-plus') }, inputs(ev, ei), E.locksFor(mode), sel(y, ei, 8, 1 / 100));
          expect(aps.has(s.camera.aperture.exact)).toBe(true);
          if (s.camera.shutter.kind === 'timed') expect(sps.has(s.camera.shutter.speed.exact)).toBe(true);
          else expect(s.camera.shutter.seconds).toBeGreaterThanOrEqual(0.5);
        }
  });

  it('too bright warning', () => {
    const s = E.solve({ camera: ae1 }, inputs(18, 3200), E.locksFor('isoPriority'), sel(ae1, 3200, 8, 1 / 125));
    expect(E.apLabel(s.camera.aperture)).toBe('f/22');
    expect(E.shutterLabel(s.camera.shutter)).toBe('1/1000');
    expect(s.warnings.some((w) => w.kind === 'tooBright')).toBe(true);
  });

  it('bulb beyond marked speeds with reciprocity', () => {
    const s = E.solve({ camera: lx, film: film('ilford-hp5-plus') }, inputs(2, 100), E.locksFor('aperturePriority'), sel(lx, 100, 8, 1 / 60));
    close(s.metered.seconds, 16);
    expect(s.camera.shutter).toEqual(E.bulb(16));
    close(s.reciprocity!.corrected, 16 ** 1.31, 1e-6);
    expect(s.reciprocity!.basis).toBe('published');
  });

  it('program keeps hand-holdable speeds', () => {
    const s = E.solve({ camera: ae1 }, inputs(10, 400), E.locksFor('isoPriority'), sel(ae1, 400, 8, 1 / 125));
    expect(E.shutterSeconds(s.camera.shutter)).toBeLessThanOrEqual(1 / 50);
    expect(Math.abs(s.camera.error)).toBeLessThan(0.2);
  });

  it('digital auto-ISO', () => {
    const d = E.genericDigital();
    const s = E.solve({ camera: d }, inputs(5, 100), { iso: false, aperture: true, shutter: false }, { iso: 100, aperture: E.ap(2.8), shutter: E.timed(E.sp(1 / 125)) });
    expect(s.camera.iso).toBeGreaterThan(100);
  });

  it('equivalents table', () => {
    const eq = E.equivalents(lx, inputs(15, 100), 100);
    expect(eq.some((o) => E.apLabel(o.aperture) === 'f/16' && E.shutterLabel(o.shutter) === '1/125')).toBe(true);
    expect(eq.some((o) => E.apLabel(o.aperture) === 'f/8' && E.shutterLabel(o.shutter) === '1/500')).toBe(true);
  });
});

describe('creative recommendations', () => {
  const lx = E.pentaxLX();
  it('never changes the metered exposure', () => {
    for (const g of E.GOALS) {
      const r = E.creative(g.id, lx, film('kodak-portra-400'), inputs(12, 400));
      expect(Math.abs(r.option.error)).toBeLessThan(0.55);
    }
  });
  it('portrait wide open', () => {
    const r = E.creative('portraits', lx, film('kodak-portra-400'), inputs(12, 400));
    expect(r.option.aperture.exact).toBeLessThanOrEqual(2.9);
    expect(E.shutterSeconds(r.option.shutter)).toBeLessThanOrEqual(1 / 125);
  });
  it('landscape brackets', () => {
    const r = E.creative('landscape', E.canonAE1Program(), film('kodak-ektar-100'), inputs(14, 100));
    expect(r.option.aperture.nominal).toBeGreaterThanOrEqual(8);
    expect(r.bracket.map((b) => Math.round(b.error))).toEqual([-1, 0, 1]);
  });
  it('light trails → bulb with reciprocity', () => {
    const r = E.creative('lightTrails', lx, film('ilford-hp5-plus'), inputs(3, 400));
    expect(r.option.shutter.kind).toBe('bulb');
    expect(r.reciprocity!.corrected).toBeGreaterThan(E.shutterSeconds(r.option.shutter));
  });
  it('waterfall ND suggestion', () => {
    const r = E.creative('waterfalls', E.canonAE1Program(), film('ilford-fp4-plus'), inputs(14, 125));
    expect(r.nd!.stops).toBeGreaterThanOrEqual(4);
  });
  it('astro on Yashica', () => {
    const r = E.creative('astrophotography', E.yashicaA(), film('ilford-delta-3200'), inputs(-4, 3200));
    close(r.starLimit!, 500 / (80 * (43.27 / 79.2)));
    expect(E.apLabel(r.option.aperture)).toBe('f/3.5');
  });
});

describe('film catalog', () => {
  it('valid, 38 stocks, nothing claims verification it lacks', () => {
    expect(E.validateCatalog(BUNDLED_CATALOG)).toEqual([]);
    expect(BUNDLED_CATALOG.stocks.length).toBe(38);
    for (const s of BUNDLED_CATALOG.stocks) {
      expect(s.lastVerified).toBeNull();
      expect(s.verificationNotes).toBeTruthy();
    }
  });
  it('specified box speeds', () => {
    const expected: Record<string, number> = {
      'kodak-portra-160': 160, 'kodak-portra-400': 400, 'kodak-portra-800': 800, 'kodak-gold-200': 200, 'kodak-colorplus-200': 200,
      'kodak-ultramax-400': 400, 'kodak-ektar-100': 100, 'kodak-ektachrome-e100': 100, 'kodak-tri-x-400': 400, 'kodak-t-max-100': 100,
      'kodak-t-max-400': 400, 'fujifilm-fujicolor-200': 200, 'fujifilm-400': 400, 'fujifilm-provia-100f': 100, 'fujifilm-velvia-50': 50,
      'fujifilm-velvia-100': 100, 'ilford-hp5-plus': 400, 'ilford-fp4-plus': 125, 'ilford-pan-f-plus': 50, 'ilford-delta-100': 100,
      'ilford-delta-400': 400, 'ilford-ortho-plus': 80, 'ilford-sfx-200': 200, 'ilford-xp2-super': 400, 'cinestill-50d': 50,
      'cinestill-400d': 400, 'cinestill-800t': 800, 'lomography-cn-100': 100, 'lomography-cn-400': 400, 'lomography-cn-800': 800,
      'kentmere-pan-100': 100, 'kentmere-pan-400': 400, 'kentmere-pan-800': 800, 'foma-fomapan-100': 100, 'foma-fomapan-200': 200,
      'foma-fomapan-400': 400,
    };
    for (const [id, v] of Object.entries(expected)) expect(film(id).boxSpeed).toBe(v);
    expect(film('kodak-t-max-p3200').boxSpeed).toBeNull();
    expect(film('kodak-t-max-p3200').speedDesignation).toBe('P3200');
    expect(film('ilford-delta-3200').boxSpeed).toBeNull();
  });
  it('expandable manufacturers without invented stocks', () => {
    for (const m of ['Rollei', 'Adox', 'ORWO', 'Harman']) {
      expect(BUNDLED_CATALOG.manufacturers.some((x) => x.name === m)).toBe(true);
      expect(BUNDLED_CATALOG.stocks.some((s) => s.manufacturer === m)).toBe(false);
    }
  });
  it('search and filters', () => {
    expect(E.searchFilms(BUNDLED_CATALOG.stocks, 'portra 400').map((s) => s.id)).toEqual(['kodak-portra-400']);
    expect(E.searchFilms(BUNDLED_CATALOG.stocks, '', { format: '4x5' }).every((s) => s.formats.includes('4x5'))).toBe(true);
    expect(new Set(E.searchFilms(BUNDLED_CATALOG.stocks, '', { category: 'colorReversal' }).map((s) => s.manufacturer))).toEqual(new Set(['Kodak', 'Fujifilm']));
  });
  it('merge keeps history and distinguishes announced', () => {
    const gold = { ...film('kodak-gold-200'), status: 'discontinued' as const };
    const fresh: E.FilmStock = { ...film('kodak-gold-200'), id: 'test-new', name: 'New 100', manufacturer: 'Other', status: 'announced' };
    const { catalog, diff } = E.mergeCatalog(BUNDLED_CATALOG, { ...BUNDLED_CATALOG, catalogVersion: 2, stocks: [gold, fresh] });
    expect(catalog.stocks.length).toBe(BUNDLED_CATALOG.stocks.length + 1);
    expect(diff.announced).toEqual(['Other New 100']);
    expect(diff.statusChanges[0]!.to).toBe('discontinued');
    expect(() => E.mergeCatalog(catalog, { ...BUNDLED_CATALOG, catalogVersion: 2, stocks: [] })).toThrow();
  });
  it('rejects invalid updates', () => {
    const bad = { ...film('kodak-gold-200'), id: 'bad', boxSpeed: -1, formats: [] };
    expect(() => E.mergeCatalog(BUNDLED_CATALOG, { ...BUNDLED_CATALOG, catalogVersion: 9, stocks: [bad] })).toThrow();
  });
});

describe('reciprocity', () => {
  it('Ilford power law', () => {
    const hp5 = film('ilford-hp5-plus').reciprocity;
    close(E.correctReciprocity(10, hp5).corrected, 10 ** 1.31, 1e-9);
    expect(E.correctReciprocity(0.5, hp5).basis).toBe('noCorrectionNeeded');
    expect(E.correctReciprocity(10, film('ilford-delta-400').reciprocity).corrected).not.toBe(E.correctReciprocity(10, hp5).corrected);
  });
  it('Kodak table interpolation', () => {
    const t = film('kodak-tri-x-400').reciprocity;
    close(E.correctReciprocity(1, t).corrected, 2);
    close(E.correctReciprocity(10, t).corrected, 50);
    close(E.correctReciprocity(100, t).corrected, 1200, 1e-6);
    close(E.correctReciprocity(Math.sqrt(10), t).corrected, 10, 1e-9);
    expect(E.correctReciprocity(200, t).basis).toBe('extrapolated');
  });
  it('threshold table (Provia)', () => {
    const p = film('fujifilm-provia-100f').reciprocity;
    expect(E.correctReciprocity(60, p).basis).toBe('noCorrectionNeeded');
    close(E.correctReciprocity(240, p).addedStops, 1 / 3, 0.01);
  });
  it('unpublished is never invented', () => {
    const r = E.correctReciprocity(30, film('fujifilm-velvia-50').reciprocity);
    expect(r.corrected).toBe(30);
    expect(r.basis).toBe('unpublished');
  });
  it('custom curve validation', () => {
    expect(E.validateReciprocity({ kind: 'powerLaw', exponent: 0.8 }).length).toBeGreaterThan(0);
    expect(E.validateReciprocity({ kind: 'table', points: [{ metered: 10, corrected: 5 }] }).length).toBeGreaterThan(0);
    expect(E.validateReciprocity({ kind: 'powerLaw', exponent: 1.3 })).toEqual([]);
  });
});

describe('Rate My Film', () => {
  it('Portra 400 example from the specification', () => {
    const portra = film('kodak-portra-400');
    const opts = E.eiOptions(portra, E.pentaxLX());
    const st = (ei: number) => opts.find((o) => o.ei === ei)!.stopsVsBox;
    close(st(100), 2);
    close(st(200), 1);
    close(st(400), 0);
    close(st(800), -1);
    expect(E.eiOptionLabel(opts.find((o) => o.ei === 200)!)).toBe('+1 stop exposure');
    expect(portra.boxSpeed).toBe(400);
  });
  it('third stops and camera range', () => {
    close(E.eiOption(125, film('kodak-portra-400')).stopsVsBox, 5 / 3);
    expect(E.eiOptions(film('ilford-fp4-plus'), E.pentaxLX()).every((o) => o.ei >= 25 && o.ei <= 3200)).toBe(true);
    expect(E.validateCustomEI(6400, E.pentaxLX())).not.toBeNull();
    expect(E.validateCustomEI(640, E.pentaxLX())).toBeNull();
    expect(E.processingLabel(1)).toBe('Push 1');
    expect(E.processingLabel(-2)).toBe('Pull 2');
  });
});

describe('measurement', () => {
  const split = (): E.LuminanceGrid => {
    const w = 40,
      h = 30;
    const v = new Array(w * h).fill(0).map((_, i) => (i % w < w / 2 ? 0.02 : 0.5));
    return { width: w, height: h, values: v };
  };
  it('uniform grid: all modes agree', () => {
    const g = E.uniformGrid(0.18);
    for (const m of ['average', 'centerWeighted', 'spot', 'multiPoint'] as E.MeteringMode[])
      close(E.regionStats(g, m, E.CENTER, 0.05, [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.7 }]).mean, 0.18, 1e-6);
  });
  it('spot isolates; multi-point averages in stops', () => {
    const g = split();
    close(E.spotStats(g, { x: 0.85, y: 0.5 }, 0.1).mean, 0.5, 1e-6);
    close(E.spotStats(g, { x: 0.15, y: 0.5 }, 0.1).mean, 0.02, 1e-6);
    close(E.frameStats(g, false).mean, 0.26, 1e-6);
    close(E.regionStats(g, 'multiPoint', E.CENTER, 0.08, [{ x: 0.15, y: 0.5 }, { x: 0.85, y: 0.5 }]).mean, Math.sqrt(0.01), 1e-6);
  });
  it('centre weighting', () => {
    const w = 40,
      h = 30;
    const v = new Array(w * h).fill(0.02);
    for (let y = 10; y < 20; y++) for (let x = 15; x < 25; x++) v[y * w + x] = 0.5;
    const g = { width: w, height: h, values: v };
    expect(E.frameStats(g, true).mean).toBeGreaterThan(E.frameStats(g, false).mean * 1.5);
  });
  it('scene EV model', () => {
    const c = { fNumber: 1.8, seconds: 1 / 100, iso: 100 };
    close(E.sceneEV100(c, 0.18, 0), Math.log2(1.8 * 1.8 * 100));
    close(E.sceneEV100(c, 0.36, 0), Math.log2(1.8 * 1.8 * 100) + 1);
    close(E.captureEV100({ ...c, iso: 400 }), E.captureEV100(c) - 2);
  });
  it('reliability', () => {
    expect(E.reliability(0.18, 0, false, false)).toBe('reliable');
    expect(E.reliability(0.005, 0, true, false)).toBe('tooDark');
    expect(E.reliability(0.95, 0.9, false, true)).toBe('tooBright');
    expect(E.reliability(0.4, 0.5, false, false)).toBe('clipped');
    expect(E.reliability(0.02, 0, false, false)).toBe('farFromTarget');
  });
  it('grid from RGBA linearises sRGB', () => {
    const px = new Uint8ClampedArray(4 * 4 * 4).fill(118);
    const g = E.gridFromRGBA(px, 4, 4, 2, 2);
    close(g.values[0]!, 0.181, 0.002);
  });
  it('live controller converges for any scene', () => {
    const p = E.makePolicy({ minSeconds: 1 / 20000, maxSeconds: 1 / 3, minISO: 32, maxISO: 3000 });
    for (const sceneEV of [-1, 4, 9, 13, 16]) {
      let cap = { fNumber: 1.78, seconds: 1 / 60, iso: 100 };
      const pixel = (c: typeof cap) => Math.min(1, 0.18 * 2 ** (sceneEV - E.captureEV100(c)));
      for (let i = 0; i < 40; i++) {
        const step = E.nextExposure(p, cap, pixel(cap));
        if (step) cap = { ...cap, seconds: step.seconds, iso: step.iso };
      }
      close(E.sceneEV100(cap, pixel(cap), 0), sceneEV, 0.01);
    }
  });
  it('smoother', () => {
    const s = new E.EVSmoother();
    for (let i = 0; i < 10; i++) s.add(10);
    expect(s.stable).toBe(true);
    close(s.add(10.2), 10.07, 0.01);
    expect(s.add(14)).toBe(14);
  });
});

describe('calibration', () => {
  const cmp = (d: number): E.Comparison => ({ id: `${d}`, date: '', phoneEV: 10, referenceEV: 10 + d, referenceMeter: 'Ref', note: '' });
  it('suggests mean offset in tenths', () => {
    const s = E.suggestOffset([0.3, 0.35, 0.25].map(cmp));
    close(s.mean, 0.3);
    expect(s.tenths).toBe(3);
    expect(s.consistent).toBe(true);
    close(E.applyCalibration(10, 3), 10.3);
  });
  it('flags inconsistency; clamps', () => {
    expect(E.suggestOffset([-0.5, 0.6, 0.1].map(cmp)).consistent).toBe(false);
    expect(E.clampTenths(99)).toBe(30);
    close(E.referenceEV(100, E.ap(16), 1 / 128), 15);
  });
});

describe('film tools', () => {
  it('zone placement and development', () => {
    expect(E.exposureForPlacement(10, 3)).toBe(12);
    expect(E.zoneOf(14, 12)).toBe(7);
    expect(E.zoneNumeral(8)).toBe('VIII');
    expect(E.analyseContrast(8, 13).development).toBe('N');
    expect(E.analyseContrast(8, 14).development).toBe('N−1');
    expect(E.analyseContrast(8, 12).development).toBe('N+1');
    close(E.zoneHistogram(E.uniformGrid(0.18), 10, 8)[7]!, 1);
  });
  it('long exposure plan separates calculated and adjusted', () => {
    const p = E.planLongExposure(1 / 8, 10, film('ilford-hp5-plus'), E.pentaxLX());
    close(p.calculated, 128);
    close(p.adjusted, 128 ** 1.31, 1e-6);
    expect(p.requiresBulb).toBe(true);
    const q = E.planLongExposure(1 / 128, 3, film('ilford-hp5-plus'), E.pentaxLX());
    expect(q.requiresBulb).toBe(false);
    expect(E.speedLabel(q.marked!)).toBe('1/15');
  });
  it('astro, bellows, equivalent time', () => {
    close(E.maxStarPointSeconds(50, 43.27)!, 10);
    close(E.bellowsStops(1), 2);
    close(E.magnificationFromExtension(25, 50), 0.5);
    close(E.equivalentSeconds(1, E.ap(8), E.ap(16)), 4);
  });
});

describe('meter state', () => {
  it('initial state per camera', () => {
    const s = E.initialState(E.yashicaA(), 400);
    expect(E.apLabel(s.selection.aperture)).toBe('f/8');
    expect(E.shutterLabel(s.selection.shutter)).toBe('1/100');
    expect(E.modeOf(E.initialState(E.canonAE1Program(), 400).locks)).toBe('shutterPriority');
  });
  it('snaps to a camera with fewer settings', () => {
    const s = { ...E.initialState(E.pentaxLX(), 400) };
    s.selection = { ...s.selection, aperture: E.ap(1.7), shutter: E.timed(E.sp(1 / 2000)) };
    const y = E.snapToCamera(s, E.yashicaA(), 100);
    expect(E.apLabel(y.selection.aperture)).toBe('f/3.5');
    expect(E.shutterLabel(y.selection.shutter)).toBe('1/300');
    expect(y.selection.iso).toBe(100);
  });
  it('stepping locks and clamps', () => {
    const cam = E.yashicaA();
    const s = { ...E.initialState(cam, 400), locks: E.locksFor('isoPriority') };
    const n = E.stepDial(s, 'shutter', 1, cam, film('ilford-hp5-plus'), 3, 2);
    expect(n.locks.shutter).toBe(true);
    expect(E.shutterLabel(n.selection.shutter)).toBe('1/50');
    expect(E.stepDial(s, 'shutter', 10, cam, null, 3, 2).selection.shutter.kind).toBe('bulb');
    expect(E.apLabel(E.stepDial(s, 'aperture', -10, cam, null, 3, 2).selection.aperture)).toBe('f/3.5');
  });
  it('ISO dial offers film-appropriate EIs', () => {
    const v = E.dialValues('iso', E.pentaxLX(), film('kodak-portra-400'), 3, 1).map((d) => d.v as number);
    expect(v).toContain(200);
    expect(v).toContain(800);
    expect(v).not.toContain(25);
  });
  it('adopting creative keeps the measured EV', () => {
    const cam = E.pentaxLX();
    const s = E.initialState(cam, 400);
    const rec = E.creative('portraits', cam, null, E.inputsOf(s, 12, 400));
    const a = E.adopt(s, rec.option);
    const sol = E.solve({ camera: cam }, E.inputsOf(a, 12, 400), a.locks, a.selection);
    expect(sol.mode).toBe('manual');
    expect(sol.ev100).toBe(12);
    close(sol.user.error, rec.option.error);
  });
});
