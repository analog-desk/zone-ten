import { cropFactor, handheldLimit, sortedApertures, sortedSpeeds } from './cameras';
import { correctReciprocity, type ReciprocityResult } from './film';
import { fmtTime, shutterSeconds, timed, bulb, type StopIncrement } from './scale';
import { solve, standardProgram, type ExposureInputs, type ExposureOption, type ProgramPrefs } from './solver';
import { maxStarPointSeconds } from './tools';
import type { CameraProfile, FilmStock } from './types';

// Goals change *which* equivalent exposure is suggested and what advice is given — never the measured exposure.

export type Goal =
  | 'lightTrails'
  | 'portraits'
  | 'landscape'
  | 'street'
  | 'astrophotography'
  | 'longExposure'
  | 'architecture'
  | 'wildlife'
  | 'sports'
  | 'macro'
  | 'stillLife'
  | 'documentary'
  | 'product'
  | 'waterfalls'
  | 'night'
  | 'other';

export const GOALS: { id: Goal; name: string; tagline: string }[] = [
  { id: 'lightTrails', name: 'Light Trails', tagline: 'Slow shutter, tripod, moving lights' },
  { id: 'portraits', name: 'Portraits', tagline: 'Wide aperture, subject separation' },
  { id: 'landscape', name: 'Landscape', tagline: 'Depth of field and tonal range' },
  { id: 'street', name: 'Street', tagline: 'Hand-held, fast to adjust' },
  { id: 'astrophotography', name: 'Astrophotography', tagline: 'Wide open, star points or trails' },
  { id: 'longExposure', name: 'Long Exposure', tagline: 'Bulb, ND filters, reciprocity' },
  { id: 'architecture', name: 'Architecture', tagline: 'Sharp, level, controlled' },
  { id: 'wildlife', name: 'Wildlife', tagline: 'Fast shutter for animals' },
  { id: 'sports', name: 'Sports & Action', tagline: 'Freeze peak action' },
  { id: 'macro', name: 'Macro', tagline: 'Close focus, light loss, DOF' },
  { id: 'stillLife', name: 'Still Life', tagline: 'Deliberate, tripod, stopped down' },
  { id: 'documentary', name: 'Documentary', tagline: 'Reliable, hand-held' },
  { id: 'product', name: 'Product', tagline: 'Maximum sharpness, bracketing' },
  { id: 'waterfalls', name: 'Waterfalls & Water', tagline: 'Silky or frozen water' },
  { id: 'night', name: 'Night', tagline: 'Long exposures in the city' },
  { id: 'other', name: 'Other / Custom', tagline: 'Your own goal, standard metering' },
];
export const goalName = (g: Goal | null | undefined) => (g ? (GOALS.find((x) => x.id === g)?.name ?? g) : 'Standard metering');

export interface Guidance {
  program: ProgramPrefs;
  headline: string;
  tips: string[];
  tripod: boolean;
  bracket: number[];
  alternate?: { label: string; program: ProgramPrefs };
  starLimit?: number;
  wantsAtLeast?: number;
}

export function guidance(goal: Goal | null | undefined, camera: CameraProfile, film: FilmStock | null, astroRule = 500): Guidance {
  const handheld = handheldLimit(camera);
  const widest = sortedApertures(camera)[0]?.exact ?? 2.8;
  const wideTo = (n: number): [number, number] => [widest, Math.max(widest, n)];
  const negative = !film || film.category === 'colorNegative' || film.category === 'bwNegative';
  const reversal = film?.category === 'colorReversal';

  switch (goal ?? null) {
    case null:
    case 'other':
      return { program: standardProgram(handheld), headline: goal ? 'Standard metering for your goal' : 'Standard metering', tips: [], tripod: false, bracket: [] };
    case 'lightTrails':
      return {
        program: { apertures: [8, 16], shutterRange: [8, 30], tripod: true, preferBulb: true },
        headline: 'Long exposure to draw moving lights',
        tips: [
          'Mount the camera on a tripod and use a cable release.',
          'Start the exposure just before traffic enters the frame. Longer exposures record longer, fuller trails.',
          'Moving lights barely change the overall reading — meter the scene, then lengthen time for more trails.',
          'Slower film (or a lower EI) makes longer times possible; with fast film stop down or add an ND filter.',
          "Exposures beyond the camera's marked speeds use Bulb — the timer in Film Tools counts it for you.",
        ],
        tripod: true,
        bracket: [0, 1],
        wantsAtLeast: 8,
      };
    case 'portraits':
      return {
        program: { apertures: wideTo(4), aperturePref: 'widest', minShutter: Math.min(handheld, 1 / 125) },
        headline: 'Wide aperture for subject separation',
        tips: [
          'Meter the face. Light skin usually sits about a stop above middle grey — consider +½ to +1 stop of compensation.',
          '1/125 s or faster freezes natural movement and expression.',
          'Open shade and window light give soft, flattering natural light.',
          'Backlit subject: meter the face, not the bright background.',
          'At wide apertures focus on the nearest eye — depth of field is shallow.',
        ],
        tripod: false,
        bracket: [],
      };
    case 'landscape':
      return {
        program: { apertures: [8, 16], minShutter: handheld, tripod: true },
        headline: 'Depth of field for front-to-back sharpness',
        tips: [
          'f/8–f/16 gives depth of field while avoiding the softening of the smallest apertures.',
          'Use a tripod so slow speeds at small apertures stay sharp.',
          'Focus about a third into the scene or use the lens depth-of-field scale.',
          reversal
            ? 'Slide film: protect highlights — spot meter the brightest area that must hold detail and place it around Zone VII.'
            : negative
              ? 'Negative film: protect shadows — spot meter important shadow detail and place it on Zone III.'
              : 'Spot meter shadows and highlights and check the range in the Zone System tool.',
          'High-contrast light: bracket ±1 stop.',
        ],
        tripod: true,
        bracket: [-1, 0, 1],
      };
    case 'street':
      return {
        program: { apertures: [5.6, 11], minShutter: 1 / 250 },
        headline: 'Hand-held, fast enough to freeze people',
        tips: [
          'Zone focus at f/8 and you can shoot without refocusing.',
          'Meter once for the light you are working in; re-meter when you cross from sun to shade.',
          '1/250 s freezes walking people. For motion blur try 1/15–1/30 s with a steady stance.',
        ],
        tripod: false,
        bracket: [],
        alternate: { label: 'Motion blur', program: { apertures: [8, 16], shutterRange: [1 / 30, 1 / 8] } },
      };
    case 'astrophotography': {
      const limit = maxStarPointSeconds(camera.lens.focalLength, camera.diagonalMM, astroRule);
      const tips = [
        'Use the widest aperture and a tripod; focus on a bright star or at the lens infinity mark.',
        "Night skies are usually below the phone's reliable measuring range — if the reading is flagged, use the star-point limit and test exposures as your guide.",
      ];
      if (limit) tips.push(`Stars stay as points up to about ${fmtTime(limit)} with this lens (${astroRule} rule).`);
      tips.push('For star trails, use Bulb for many minutes; reciprocity correction for your film is applied.');
      return {
        program: { apertures: wideTo(4), aperturePref: 'widest', shutterRange: limit ? [Math.max(1, limit / 2), limit] : undefined, tripod: true, preferBulb: true },
        headline: 'Wide open, as long as the stars allow',
        tips,
        tripod: true,
        bracket: [0, 1, 2],
        alternate: { label: 'Star trails', program: { apertures: [4, 8], shutterRange: [600, 3600], tripod: true, preferBulb: true } },
        starLimit: limit,
      };
    }
    case 'longExposure':
      return {
        program: { apertures: [8, 16], shutterRange: [15, 120], tripod: true, preferBulb: true },
        headline: 'Stretch time — Bulb, ND and reciprocity',
        tips: [
          'Compose and focus before fitting a dark ND filter.',
          'Cover the viewfinder eyepiece during long exposures to stop stray light reaching the film.',
          'Calculated and reciprocity-adjusted times are shown separately — expose for the adjusted time.',
        ],
        tripod: true,
        bracket: [0, 1],
        wantsAtLeast: 15,
      };
    case 'architecture':
      return {
        program: { apertures: [8, 16], minShutter: handheld, tripod: true },
        headline: 'Sharp throughout, carefully levelled',
        tips: [
          'Keep the film plane vertical to avoid converging lines.',
          "Interiors with bright windows exceed the film's range — bracket ±1 stop.",
          'Meter facades in even light; dark stone and white render may need compensation.',
        ],
        tripod: true,
        bracket: [-1, 0, 1],
      };
    case 'wildlife': {
      const f = (camera.lens.focalLength ?? 50) * cropFactor(camera);
      return {
        program: { apertures: wideTo(5.6), aperturePref: 'widest', minShutter: Math.min(1 / 500, 1 / (2 * f)) },
        headline: 'Fast shutter for animal movement',
        tips: ['1/500 s or faster for moving animals; birds in flight need more.', 'Meter the animal, not a bright sky behind it.', 'If the shutter cannot get fast enough, load faster film or push-process.'],
        tripod: false,
        bracket: [],
      };
    }
    case 'sports':
      return {
        program: { apertures: wideTo(5.6), aperturePref: 'widest', minShutter: 1 / 1000 },
        headline: 'Freeze peak action',
        tips: [
          '1/500–1/1000 s freezes most sport; panning at 1/30–1/60 s adds motion blur behind the subject.',
          'Pre-focus where the action will happen.',
          'If speeds are too slow, rate the film higher and push-process.',
        ],
        tripod: false,
        bracket: [],
        alternate: { label: 'Panning', program: { apertures: [8, 16], shutterRange: [1 / 60, 1 / 30] } },
      };
    case 'macro':
      return {
        program: { apertures: [11, 16], tripod: true },
        headline: 'Depth of field and close-focus light loss',
        tips: [
          'Depth of field is very shallow close up — stop down to f/11–f/16.',
          'Extension tubes and bellows lose light: enter the magnification in the Bellows adjustment on the meter. Through-the-lens camera meters already include it.',
          'Use a tripod and cable release; small movements are magnified.',
        ],
        tripod: true,
        bracket: [-1, 0, 1],
      };
    case 'stillLife':
      return {
        program: { apertures: [8, 16], tripod: true },
        headline: 'Deliberate, stopped down, on a tripod',
        tips: ['Meter the key tone with the spot meter and place it with the Zone System.', 'Long times are fine on a tripod — watch reciprocity.'],
        tripod: true,
        bracket: [],
      };
    case 'documentary':
      return {
        program: { apertures: [4, 8], minShutter: Math.min(handheld, 1 / 125) },
        headline: 'Reliable hand-held exposures',
        tips: ['Meter for the light on your subjects and keep the reading as conditions change.', '1/125 s keeps people sharp in most situations.'],
        tripod: false,
        bracket: [],
      };
    case 'product':
      return {
        program: { apertures: [11, 22], tripod: true },
        headline: 'Maximum sharpness and controlled tones',
        tips: ['Use a tripod and cable release.', 'Bracket ±1 stop for critical work.', "Meter a grey card in the product's light for neutral exposures."],
        tripod: true,
        bracket: [-1, 0, 1],
      };
    case 'waterfalls':
      return {
        program: { apertures: [11, 22], shutterRange: [0.5, 2], tripod: true },
        headline: 'Silky water with slow shutter',
        tips: [
          '½–2 s renders falling water as silk; 1/500 s or faster freezes droplets.',
          'If the slowest time at your smallest aperture is too short, add an ND filter (suggested below).',
          'Meter the water and the rocks — white water needs about +1½ stops to stay white.',
        ],
        tripod: true,
        bracket: [0, 1],
        alternate: { label: 'Freeze water', program: { apertures: wideTo(8), minShutter: 1 / 500 } },
        wantsAtLeast: 0.5,
      };
    case 'night':
      return {
        program: { apertures: [5.6, 11], shutterRange: [1, 30], tripod: true, preferBulb: true },
        headline: 'Tripod night scenes',
        tips: [
          'Spot meter a mid-tone lit area; bright street lights will mislead average metering.',
          'Reciprocity grows quickly beyond 1 s — use the adjusted time and bracket longer.',
          'Cover the eyepiece during long exposures.',
        ],
        tripod: true,
        bracket: [0, 1, 2],
      };
  }
}

export interface Creative {
  headline: string;
  option: ExposureOption;
  alternateLabel?: string;
  alternate?: ExposureOption;
  bracket: ExposureOption[];
  nd?: { stops: number; option: ExposureOption };
  reciprocity?: ReciprocityResult;
  tips: string[];
  tripod: boolean;
  starLimit?: number;
}

/** A creative suggestion: an *equivalent* of the metered exposure chosen for the goal. */
export function creative(
  goal: Goal | null | undefined,
  camera: CameraProfile,
  film: FilmStock | null,
  inputs: ExposureInputs,
  increment: StopIncrement = 3,
  astroRule = 500,
): Creative {
  const g = guidance(goal, camera, film, astroRule);
  const isoLock = { iso: true, aperture: false, shutter: false };
  const firstSpeed = sortedSpeeds(camera)[0];
  const seed = {
    iso: inputs.workingEI,
    aperture: sortedApertures(camera)[0] ?? { nominal: 8, exact: 8 },
    shutter: firstSpeed ? timed(firstSpeed) : bulb(1),
  };
  const cfg = { camera, increment, program: g.program, film };
  const main = solve(cfg, inputs, isoLock, seed);

  const alternate = g.alternate ? solve({ ...cfg, program: g.alternate.program }, inputs, isoLock, seed).camera : undefined;

  const bracket: ExposureOption[] = [];
  for (const step of g.bracket) {
    const o = solve(cfg, { ...inputs, compensation: inputs.compensation + step }, { iso: true, aperture: true, shutter: false }, {
      ...seed,
      aperture: main.camera.aperture,
    }).camera;
    const adjusted = { ...o, error: o.error + step };
    if (!bracket.some((b) => shutterSeconds(b.shutter) === shutterSeconds(adjusted.shutter) && b.aperture.exact === adjusted.aperture.exact)) bracket.push(adjusted);
  }

  let nd: Creative['nd'];
  const t = shutterSeconds(main.camera.shutter);
  if (g.wantsAtLeast && t < g.wantsAtLeast * 0.7) {
    const stops = Math.ceil(Math.log2(g.wantsAtLeast / t));
    if (stops >= 1) nd = { stops, option: solve(cfg, { ...inputs, filterStops: inputs.filterStops + stops }, isoLock, seed).camera };
  }

  return {
    headline: g.headline,
    option: main.camera,
    alternateLabel: g.alternate?.label,
    alternate,
    bracket,
    nd,
    reciprocity: film && t >= 1 ? correctReciprocity(t, film.reciprocity) : undefined,
    tips: g.tips,
    tripod: g.tripod,
    starLimit: g.starLimit,
  };
}
