// Standard photographic exposure mathematics (ISO 2720 / APEX conventions).
//   EV (settings) = log2(N² / t)
//   EV100 = scene exposure value referenced to ISO 100
//   settings EV needed at speed S = EV100 + log2(S / 100)

/** Reflected-light meter calibration constant K (cd/m²). */
export const K_REFLECTED = 12.5;
/** Incident-light calibration constant C for a flat receptor (lux). */
export const C_INCIDENT_FLAT = 250;

export const ev = (aperture: number, seconds: number) => Math.log2((aperture * aperture) / seconds);
export const settingsEV = (ev100: number, iso: number) => ev100 + Math.log2(iso / 100);
export const ev100FromSettings = (settingsEv: number, iso: number) => settingsEv - Math.log2(iso / 100);
export const ev100Of = (aperture: number, seconds: number, iso: number) => ev100FromSettings(ev(aperture, seconds), iso);
export const secondsFor = (settingsEv: number, aperture: number) => (aperture * aperture) / 2 ** settingsEv;
export const apertureFor = (settingsEv: number, seconds: number) => Math.sqrt(seconds * 2 ** settingsEv);
export const isoFor = (ev100: number, aperture: number, seconds: number) => 100 * 2 ** (ev(aperture, seconds) - ev100);
export const luminance = (ev100: number) => (K_REFLECTED * 2 ** ev100) / 100;
export const ev100FromLuminance = (cdm2: number) => Math.log2((cdm2 * 100) / K_REFLECTED);
export const illuminance = (ev100: number) => (C_INCIDENT_FLAT * 2 ** ev100) / 100;
export const stopsFromFilterFactor = (factor: number) => Math.log2(factor);
export const stopsFromDensity = (d: number) => d / Math.log10(2);
