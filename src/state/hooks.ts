import { useMemo } from 'react';
import { referenceSpeed, type CameraProfile, type FilmStock, type MeterState } from '../engine';
import { activeCamera, activeRoll, allStocks, meterStateFor, useDoc, type DBDoc, type Roll } from './store';

export interface Shooting {
  doc: DBDoc;
  camera: CameraProfile | null;
  roll: Roll | null;
  /** Stock snapshot of the loaded roll (or the camera's last film when no roll is loaded). */
  film: FilmStock | null;
  workingEI: number;
  meter: MeterState | null;
  stocks: FilmStock[];
}

export function useShooting(): Shooting {
  const doc = useDoc((d) => d);
  return useMemo(() => {
    const camera = activeCamera(doc);
    const roll = activeRoll(doc, camera?.id);
    const stocks = allStocks(doc);
    const lastId = camera ? doc.lastFilmByCamera[camera.id] : undefined;
    const film = roll?.stock ?? stocks.find((s) => s.id === lastId) ?? null;
    const workingEI = roll?.workingEI ?? (film ? referenceSpeed(film) : 400);
    const meter = camera ? meterStateFor(doc, camera, workingEI) : null;
    return { doc, camera, roll, film, workingEI, meter, stocks };
  }, [doc]);
}
