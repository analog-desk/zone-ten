import { describe, expect, it } from 'vitest';
import * as E from '../index';
import { BUNDLED_CATALOG } from '../../data/catalog';

const film = (id: string) => BUNDLED_CATALOG.stocks.find((s) => s.id === id)!;
const shot = (id: string) => E.BULB_SHOTS.find((s) => s.id === id)!;
const lx = E.pentaxLX();
const yashica = E.yashicaA();

describe('bulb planner', () => {
  it('street trails pick an aperture that gives a 10–30 s look, with reciprocity', () => {
    const p = E.planBulb({ shot: shot('street'), camera: lx, film: film('ilford-hp5-plus'), ei: 100, ev100: 2 });
    // EV 2 at EI 100: f/8 → 16 s → HP5 16^1.31 ≈ 38 s (too long); f/5.6 → 8 s → 8^1.31 ≈ 15.2 s fits 10–30 s.
    expect(p.main.aperture.nominal).toBe(5.6);
    expect(p.main.expose).toBeCloseTo(8 ** 1.31, 6);
    expect(p.main.expose).toBeGreaterThan(p.main.calculated);
    expect(lx.lens.apertures.some((a) => a.exact === p.main.aperture.exact)).toBe(true);
  });

  it('suggests ND when too bright for the look', () => {
    const p = E.planBulb({ shot: shot('street'), camera: lx, film: film('ilford-hp5-plus'), ei: 400, ev100: 7 });
    expect(p.ndStops).toBeGreaterThanOrEqual(1);
    expect(p.main.expose).toBeGreaterThanOrEqual(9);
    expect(p.main.aperture.nominal).toBe(22);
  });

  it('star points use the 500 rule on the Yashica, wide open', () => {
    const p = E.planBulb({ shot: shot('milkyWay'), camera: yashica, film: film('ilford-hp5-plus'), ei: 400, ev100: -7 });
    expect(p.main.aperture.nominal).toBe(3.5);
    expect(p.main.expose).toBeCloseTo(500 / (80 * (43.27 / 79.2)), 6);
    expect(p.notes.join(' ')).toMatch(/stops under/);
  });

  it('star trails: duration sets the arc, aperture balances the foreground including reciprocity', () => {
    const p = E.planBulb({ shot: shot('starTrails'), camera: lx, film: film('ilford-hp5-plus'), ei: 400, ev100: -3, duration: 3600 });
    expect(p.starArcDegrees).toBeCloseTo(15, 6);
    expect(p.main.expose).toBe(3600);
    // Reciprocity-inverted metered time: Tm^1.31 = 3600 → Tm ≈ 520 s
    expect(p.main.calculated).toBeCloseTo(3600 ** (1 / 1.31), 0);
  });

  it('inverse reciprocity', () => {
    expect(E.meteredFor(50, film('kodak-tri-x-400'))).toBeCloseTo(10, 3);
    expect(E.meteredFor(30, film('fujifilm-velvia-50'))).toBe(30);
  });

  it('fireworks follow the f/8 @ ISO 100 guide scaled by EI', () => {
    const p = E.planBulb({ shot: shot('fireworks'), camera: lx, film: film('ilford-hp5-plus'), ei: 400, ev100: 2, duration: 4 });
    expect(p.main.aperture.nominal).toBe(16);
    expect(p.main.expose).toBe(4);
  });

  it('only ever uses camera apertures', () => {
    for (const s of E.BULB_SHOTS)
      for (const ev of [-7, -3, 0, 4, 7])
        for (const cam of [lx, yashica, E.canonAE1Program()]) {
          const p = E.planBulb({ shot: s, camera: cam, film: film('kodak-portra-400'), ei: 400, ev100: ev });
          expect(cam.lens.apertures.some((a) => a.exact === p.main.aperture.exact)).toBe(true);
          expect(Number.isFinite(p.main.expose) && p.main.expose > 0).toBe(true);
        }
  });
});
