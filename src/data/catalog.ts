import raw from './film_catalog.json';
import type { FilmCatalog } from '../engine/types';

/** The catalog bundled with the app. Verified updates are merged on top at runtime (see state/store). */
export const BUNDLED_CATALOG = raw as unknown as FilmCatalog;
