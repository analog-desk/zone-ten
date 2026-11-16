# Data model

Everything is stored locally in IndexedDB (`zone-ten`):

* store `kv`, key `db` — one versioned JSON document (`DBDoc`, `src/state/store.ts`); the previous save is kept at `db:prev`.
* store `images`, key `r:<readingId>` — JPEG reference photos.

`DBDoc` (version 1):

| Field | Contents |
| --- | --- |
| `onboardingComplete`, `goal`, `customGoal`, `goalConfirmedOn` | Photography goal (re-confirmed each new day) |
| `cameras: CameraProfile[]`, `activeCameraId` | Saved bodies: format, mount, modes, lens (apertures, focal length, confirmed flag), marked speeds, Bulb, flash sync, ISO range, photo |
| `rolls: Roll[]` | camera, **stock snapshot** (box speed never edited), format, working EI, roll number, loaded/finished dates, processing preference, push/pull, notes |
| `lastFilmByCamera` | Last film per camera, restored when switching cameras |
| `customStocks`, `catalog` | User stocks; merged catalog update (null = bundled) |
| `sessions`, `readings` | Sessions; readings are denormalised snapshots (goal, camera, lens, film, box speed, EI, EV, metered exposure, settings, compensation, filters, metering mode, path, calibration, reciprocity, notes) so history survives catalog/profile changes |
| `calibrations`, `activeCalibration` | Calibration profiles per measurement path with comparison readings |
| `meterByCamera` | Dial state (locks, selection, compensation, filters) per camera |
| `prefs` | Increments, metering mode, spot size, display, astro rule, catalog URL, incident accessory, phone f-number |

Backup (Settings → Back up) exports the document plus images as JSON; Restore validates and replaces.
