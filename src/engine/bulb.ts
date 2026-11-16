import { sortedApertures } from './cameras';
import { correctReciprocity, type ReciprocityResult } from './film';
import { exactISO, nearest, type Aperture } from './scale';
import { maxStarPointSeconds } from './tools';
import type { CameraProfile, FilmStock } from './types';

// Bulb planner: for scenes where the light meter can't give a time. The photographer says what they want
// (traffic trails, star trails, Milky Way…); Zone Ten picks the aperture and the time to hold the shutter open.

/** Typical scene brightness for night/low-light subjects (EV at ISO 100). Starting points from standard
 *  exposure-value tables — real scenes vary, so results are always bracketed. */
export interface ScenePreset {
  id: string;
  name: string;
  ev100: number;
}
export const SCENES: ScenePreset[] = [
  { id: 'brightStreet', name: 'Brightly lit city street, shop windows', ev100: 7 },
  { id: 'fairground', name: 'Fairground, amusement park', ev100: 7 },
  { id: 'blueHour', name: 'Deep blue hour, city lights on', ev100: 4 },
  { id: 'streetLights', name: 'Street lights, suburban road', ev100: 4 },
  { id: 'floodlit', name: 'Floodlit building or monument', ev100: 4 },
  { id: 'skyline', name: 'Distant city skyline at night', ev100: 2 },
  { id: 'darkRoad', name: 'Dark road, very little lighting', ev100: 0 },
  { id: 'moonlit', name: 'Landscape under a full moon', ev100: -3 },
  { id: 'starsPolluted', name: 'Starry sky with some light pollution', ev100: -5 },
  { id: 'starsDark', name: 'Dark sky, starlight only', ev100: -7 },
];
export const scene = (id: string) => SCENES.find((s) => s.id === id) ?? SCENES[0]!;

export type BulbMode = 'ambient' | 'fireworks' | 'painting' | 'starPoints' | 'starTrails';
export type BulbGroup = 'trails' | 'astro' | 'night';

export interface BulbShot {
  id: string;
  group: BulbGroup;
  name: string;
  desc: string;
  mode: BulbMode;
  /** Exposure time that gives the look (seconds). For star trails / painting it's the default duration. */
  range: [number, number];
  scene: string;
  apertures: [number, number];
  tips: string[];
}

export const BULB_SHOTS: BulbShot[] = [
  {
    id: 'street',
    group: 'trails',
    name: 'City street traffic',
    desc: 'Red and white streaks along a busy street',
    mode: 'ambient',
    range: [10, 30],
    scene: 'brightStreet',
    apertures: [8, 16],
    tips: ['Open the shutter just before a group of cars enters the frame.', 'Longer = more cars = fuller streaks; the street exposure stays right.'],
  },
  {
    id: 'highway',
    group: 'trails',
    name: 'Highway, long unbroken streams',
    desc: 'Continuous ribbons of light from a bridge or hill',
    mode: 'ambient',
    range: [20, 60],
    scene: 'streetLights',
    apertures: [8, 16],
    tips: ['Shoot from a bridge or embankment with the road curving away.', 'Wait for a gap-free stream of traffic before opening.'],
  },
  {
    id: 'single',
    group: 'trails',
    name: 'One car or bike passing',
    desc: 'A single clean streak through the frame',
    mode: 'ambient',
    range: [5, 15],
    scene: 'streetLights',
    apertures: [5.6, 11],
    tips: ['Open when the vehicle enters the frame, close when it leaves.', 'A cap or dark card over the lens can block unwanted cars mid-exposure.'],
  },
  {
    id: 'rides',
    group: 'trails',
    name: 'Fairground rides, carousels',
    desc: 'Spinning wheels of light',
    mode: 'ambient',
    range: [2, 8],
    scene: 'fairground',
    apertures: [8, 16],
    tips: ['One full rotation of the ride usually makes the best circle.', 'Rides are bright — slow film helps reach a few seconds.'],
  },
  {
    id: 'fireworks',
    group: 'trails',
    name: 'Fireworks',
    desc: 'Bursts and trails in the sky',
    mode: 'fireworks',
    range: [2, 8],
    scene: 'skyline',
    apertures: [8, 16],
    tips: ['Open at the launch thump, close after one to three bursts.', 'Aperture sets the brightness of the bursts; time sets how many you catch.', 'Focus at infinity and pre-frame the sky above the launch site.'],
  },
  {
    id: 'painting',
    group: 'trails',
    name: 'Light painting',
    desc: 'Draw with a torch, sparkler or LED',
    mode: 'painting',
    range: [30, 30],
    scene: 'darkRoad',
    apertures: [8, 11],
    tips: ['Wear dark clothes and keep moving so you don’t record yourself.', 'Keep the light pointed at the camera for lines, at the subject to paint it.'],
  },
  {
    id: 'milkyWay',
    group: 'astro',
    name: 'Milky Way / stars as points',
    desc: 'Pin-sharp stars, no trailing',
    mode: 'starPoints',
    range: [0, 0],
    scene: 'starsDark',
    apertures: [1, 4],
    tips: [
      'Widest aperture, focus on a bright star or the infinity mark.',
      'Time is capped by the star-point rule so stars don’t smear — film will be underexposed in the sky; that’s normal, bracket longer.',
      'Fast film (400–3200) gives the most stars.',
    ],
  },
  {
    id: 'starTrails',
    group: 'astro',
    name: 'Star trails',
    desc: 'Stars drawing arcs across the sky',
    mode: 'starTrails',
    range: [3600, 3600],
    scene: 'starsDark',
    apertures: [4, 8],
    tips: [
      'Point at the pole star (north) for circles around it; east or west for long diagonal arcs.',
      'Stars move 15° an hour. 1 hour gives clear arcs; 2–4 hours gives long ones.',
      'Hours-long exposures need a locking cable release; put a fresh battery in if your camera needs one to hold B.',
    ],
  },
  {
    id: 'moonlit',
    group: 'astro',
    name: 'Moonlit landscape',
    desc: 'Night landscape lit by a bright moon',
    mode: 'ambient',
    range: [30, 600],
    scene: 'moonlit',
    apertures: [4, 8],
    tips: ['Long exposures under the moon look like daylight with stars — compose for that.', 'Stars will trail slightly at these times.'],
  },
  {
    id: 'skyline',
    group: 'night',
    name: 'City skyline at night',
    desc: 'Lit buildings across the water or from a viewpoint',
    mode: 'ambient',
    range: [4, 30],
    scene: 'skyline',
    apertures: [8, 16],
    tips: ['Water turns smooth and reflective at these times.', 'Shoot in blue hour for a deep-blue sky instead of black.'],
  },
  {
    id: 'floodlit',
    group: 'night',
    name: 'Floodlit building',
    desc: 'Monuments, churches, bridges lit at night',
    mode: 'ambient',
    range: [2, 15],
    scene: 'floodlit',
    apertures: [8, 16],
    tips: ['Spot meter the lit facade with your meter if it can; the planner uses that reading.'],
  },
  {
    id: 'blueHour',
    group: 'night',
    name: 'Blue hour cityscape',
    desc: 'Lights on, sky still deep blue',
    mode: 'ambient',
    range: [2, 15],
    scene: 'blueHour',
    apertures: [8, 16],
    tips: ['The light changes fast — re-meter or re-plan every few minutes.'],
  },
];

export interface BulbStep {
  aperture: Aperture;
  /** Time the light calls for (before reciprocity). */
  calculated: number;
  reciprocity: ReciprocityResult | null;
  /** Time to actually hold the shutter open. */
  expose: number;
  /** For fixed-duration shots: exposure of the ambient scene relative to correct (stops, + = over). */
  ambientError?: number;
}

export interface BulbPlan {
  shot: BulbShot;
  main: BulbStep;
  /** Every camera aperture with its time (ambient modes). */
  alternatives: BulbStep[];
  bracket: { label: string; expose: number }[];
  ndStops: number;
  notes: string[];
  starArcDegrees?: number;
  starLimit?: number;
}

const settingsEV = (ev100: number, ei: number) => ev100 + Math.log2(exactISO(ei) / 100);
const timeFor = (N: number, sEV: number) => (N * N) / 2 ** sEV;

function step(aperture: Aperture, calculated: number, film: FilmStock | null): BulbStep {
  const r = film && calculated >= 1 ? correctReciprocity(calculated, film.reciprocity) : null;
  return { aperture, calculated, reciprocity: r, expose: r ? r.corrected : calculated };
}

/** Metered time Tm whose reciprocity-corrected time equals `target` (bisection; no data → Tm = target). */
export function meteredFor(target: number, film: FilmStock | null): number {
  if (!film || film.reciprocity.kind === 'unpublished') return target;
  let lo = Math.log(Math.min(1, target)) - 1;
  let hi = Math.log(target);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (correctReciprocity(Math.exp(mid), film.reciprocity).corrected > target) hi = mid;
    else lo = mid;
  }
  return Math.exp((lo + hi) / 2);
}

export interface BulbInputs {
  shot: BulbShot;
  camera: CameraProfile;
  film: FilmStock | null;
  ei: number;
  ev100: number;
  /** Chosen duration (star trails, light painting, fireworks). */
  duration?: number;
  /** Force an aperture (user tapped one). */
  aperture?: Aperture;
  astroRule?: number;
}

export function planBulb(i: BulbInputs): BulbPlan {
  const { shot, camera, film, ei } = i;
  const aps = sortedApertures(camera);
  const sEV = settingsEV(i.ev100, ei);
  const notes: string[] = [];
  let ndStops = 0;
  const inPref = aps.filter((a) => a.nominal >= shot.apertures[0] - 0.01 && a.nominal <= shot.apertures[1] + 0.01);
  const pool = inPref.length ? inPref : aps;
  const alternatives = aps.map((a) => step(a, timeFor(a.exact, sEV), film));
  let main: BulbStep;
  let starArc: number | undefined;
  let starLimit: number | undefined;

  if (shot.mode === 'ambient') {
    const [lo, hi] = shot.range;
    const mid = Math.sqrt(lo * hi);
    const within = (x: BulbStep) => x.expose >= lo * 0.9 && x.expose <= hi * 1.1;
    const dist = (x: BulbStep) => Math.abs(Math.log(x.expose / mid));
    const best = (xs: BulbStep[]) => xs.reduce((b, x) => (dist(x) < dist(b) ? x : b));
    // Prefer the shot's usual apertures; otherwise any aperture on the lens that gives the look.
    let fits = alternatives.filter((x) => pool.includes(x.aperture) && within(x));
    if (!fits.length) fits = alternatives.filter(within);
    const smallest = alternatives.at(-1)!;
    const widest = alternatives[0]!;
    if (i.aperture) main = alternatives.find((x) => x.aperture.exact === i.aperture!.exact) ?? widest;
    else if (fits.length) main = best(fits);
    else if (smallest.expose < lo) {
      // Too bright for the look even at the smallest aperture: an ND filter lengthens the time.
      // Choose the ND strength whose reciprocity-corrected time lands closest to the look's target time.
      let bestNd = 1;
      for (let n = 1; n <= 16; n++) {
        const e = step(smallest.aperture, smallest.calculated * 2 ** n, film).expose;
        const eb = step(smallest.aperture, smallest.calculated * 2 ** bestNd, film).expose;
        if (Math.abs(Math.log(e / mid)) < Math.abs(Math.log(eb / mid))) bestNd = n;
      }
      ndStops = bestNd;
      main = step(smallest.aperture, smallest.calculated * 2 ** ndStops, film);
      notes.push(`Too bright for ${Math.round(lo)}s+ even at f/${smallest.aperture.nominal}: add a ${ndStops}-stop ND filter (the time below includes it), or load slower film.`);
    } else if (widest.expose > hi) {
      main = widest;
      notes.push(`It's darker than this shot usually needs: even wide open the exposure runs past ${Math.round(hi)}s. Expect longer trails, or load faster film.`);
    } else main = best(alternatives);
    if (i.aperture && (main.expose < lo * 0.9 || main.expose > hi * 1.1))
      notes.push(`At ${'f/' + main.aperture.nominal} the time is outside the usual ${Math.round(lo)}–${Math.round(hi)}s for this look.`);
  } else if (shot.mode === 'fireworks') {
    // Classic fireworks guide: f/8 at ISO 100; one stop smaller per doubling of speed. Bursts are points of light,
    // so the time only decides how many bursts you catch.
    const N = 8 * Math.sqrt(exactISO(ei) / 100);
    const a = i.aperture ?? nearest(aps, N, (x) => x.exact) ?? aps.at(-1)!;
    const dur = i.duration ?? 4;
    main = { aperture: a, calculated: dur, reciprocity: null, expose: dur, ambientError: Math.log2(dur / timeFor(a.exact, sEV)) };
    const err = 2 * Math.log2(a.exact / N);
    if (Math.abs(err) > 0.4) notes.push(`f/${a.nominal} is ${Math.abs(err).toFixed(1)} stop${Math.abs(err) > 1.05 ? 's' : ''} ${err > 0 ? 'darker' : 'brighter'} than the fireworks guide for EI ${ei} (f/${N.toFixed(1)}).`);
    notes.push('Reciprocity hardly affects bright bursts; time only sets how many you record.');
  } else if (shot.mode === 'painting') {
    const dur = i.duration ?? 30;
    const a = i.aperture ?? nearest(pool, 8, (x) => x.exact) ?? aps[0]!;
    main = { aperture: a, calculated: dur, reciprocity: null, expose: dur, ambientError: Math.log2(dur / alternatives.find((s) => s.aperture === a)!.expose) };
  } else if (shot.mode === 'starPoints') {
    starLimit = maxStarPointSeconds(camera.lens.focalLength, camera.diagonalMM, i.astroRule ?? 500) ?? 20;
    const a = i.aperture ?? aps[0]!;
    // The star-point limit is the time to hold open; reciprocity is reported as sky underexposure, not added time.
    const need = alternatives.find((s) => s.aperture === a)!;
    main = { aperture: a, calculated: starLimit, reciprocity: null, expose: starLimit, ambientError: Math.log2(starLimit / need.expose) };
    if (main.ambientError! < -1)
      notes.push(`The sky will be about ${Math.abs(main.ambientError!).toFixed(1)} stops under the scene average — normal for star points on film; stars still record. Faster film helps.`);
  } else {
    // Star trails: duration chosen for trail length; aperture chosen so the foreground is correctly exposed.
    const dur = i.duration ?? shot.range[0];
    starArc = (dur / 3600) * 15;
    const tm = meteredFor(dur, film);
    const ideal = Math.sqrt(tm * 2 ** sEV);
    const a = i.aperture ?? nearest(pool.length ? aps : aps, ideal, (x) => x.exact) ?? aps[0]!;
    const atA = step(a, timeFor(a.exact, sEV), film);
    main = { aperture: a, calculated: tm, reciprocity: film ? correctReciprocity(tm, film.reciprocity) : null, expose: dur, ambientError: Math.log2(dur / atA.expose) };
    if (Math.abs(main.ambientError!) > 0.7)
      notes.push(
        main.ambientError! < 0
          ? `Even at f/${a.nominal} the foreground will be about ${Math.abs(main.ambientError!).toFixed(1)} stops dark — fine for silhouettes; for detail use faster film or a moonlit night.`
          : `The foreground will be about ${main.ambientError!.toFixed(1)} stops bright at f/${a.nominal} — stop down further or shorten the trails.`,
      );
  }

  if (main.reciprocity?.basis === 'unpublished') notes.push('No published reciprocity data for this film: times are uncorrected — bracket longer.');
  if (main.reciprocity?.basis === 'extrapolated') notes.push('This is beyond the film’s published reciprocity data: the time is extrapolated — bracket longer.');

  const bracket =
    shot.mode === 'ambient'
      ? [
          { label: 'Planned', expose: main.expose },
          { label: '+1 stop', expose: step(main.aperture, main.calculated * 2, film).expose },
          { label: '−1 stop', expose: step(main.aperture, main.calculated / 2, film).expose },
        ]
      : shot.mode === 'starPoints'
        ? [
            { label: 'Planned', expose: main.expose },
            { label: 'Half (sharper stars)', expose: main.expose / 2 },
          ]
        : [];

  return { shot, main, alternatives, bracket, ndStops, notes, starArcDegrees: starArc, starLimit };
}
