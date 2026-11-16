# Testing

## Automated
`npm test` — 64 engine tests (exposure maths, exact scales, the three camera profiles, solver constraints incl. an exhaustive Yashica A sweep, film latitude tie-breaks, Bulb + reciprocity, creative suggestions, catalog validation/merge, Rate My Film, metering patterns, scene-EV model, live controller convergence, calibration, Zone System, long exposure).

## End-to-end (done in development)
Headless Chromium, iPhone 13 viewport, synthetic JPEGs with known EXIF:
* uniform 18 % grey, 1/125 f/2 ISO 100 → expected 8.98, shown **9.0**
* split frame (1/60 f/1.78 ISO 50) spot right/left → expected 10.25 / 4.78, shown **10.3 / 4.8**
* photo without EXIF → refused · onboarding → meter · save reading → session → PDF · reload keeps data · no console errors.

## Field validation (to do with real equipment)
Log in Settings → Calibration (each row is a comparison):
| Scene | Reference meter EV | Zone Ten raw EV | Difference |
| --- | --- | --- | --- |
| Open shade, grey card | | | |
| Full sun, grey card | | | |
| Indoor window light | | | |
| Tungsten interior | | | |
| Dusk / street at night | | | |
Accept a calibration when ≥ 3 comparisons agree within ±0.3 stop. Re-test after OS updates, for each phone, and for live mode separately.
