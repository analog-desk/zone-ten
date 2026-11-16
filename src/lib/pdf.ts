import { jsPDF } from 'jspdf';
import { fmtISO, fmtStops } from '../engine';
import { imgGet } from '../state/db';
import type { Reading, Session } from '../state/store';

const blobToDataURL = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(b);
  });

async function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => res({ w: 4, h: 3 });
    i.src = url;
  });
}

export function readingLines(r: Reading): string[] {
  const lines = [
    `${r.aperture} · ${r.shutter} · EI ${fmtISO(r.workingEI)}   (EV100 ${r.ev100.toFixed(1)}, ${r.meteringMode})`,
    `Metered: ${r.metered}`,
    `${r.cameraName} — ${r.lens}`,
    `${r.filmName} · ${r.filmFormat} · box ${r.boxSpeed}`,
  ];
  const adj: string[] = [];
  if (Math.abs(r.compensation) > 0.01) adj.push(`compensation ${fmtStops(r.compensation)}`);
  if (Math.abs(r.filterStops) > 0.01) adj.push(`filter/close-up ${fmtStops(r.filterStops)} stops`);
  if (adj.length) lines.push(adj.join(' · '));
  if (r.reciprocity) lines.push(r.reciprocity);
  lines.push(`${r.path} · ${r.calibrationName} (${fmtStops(r.calibrationOffset)}) · goal: ${r.goal}`);
  lines.push(`Source: ${r.source}`);
  if (r.notes) lines.push(`Notes: ${r.notes}`);
  return lines;
}

export function shareText(r: Reading): string {
  return [new Date(r.date).toLocaleString(), ...readingLines(r)].join('\n');
}

/** A printable session report with reference photos. */
export async function sessionPDF(session: Session, readings: Reading[]): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 14;
  let y = M;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(session.name, M, y + 4);
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`${new Date(session.createdAt).toLocaleString()} · ${readings.length} reading${readings.length === 1 ? '' : 's'} · Vaaro Light Meter`, M, y);
  y += 5;
  if (session.notes) {
    const n = doc.splitTextToSize(session.notes, W - 2 * M);
    doc.text(n, M, y + 3);
    y += n.length * 4.5 + 2;
  }
  doc.setDrawColor(200);
  doc.line(M, y, W - M, y);
  y += 6;

  for (const [i, r] of readings.entries()) {
    const imgW = 48;
    let imgH = 0;
    let dataURL: string | null = null;
    if (r.hasImage) {
      const b = await imgGet(`r:${r.id}`);
      if (b) {
        dataURL = await blobToDataURL(b);
        const s = await imageSize(dataURL);
        imgH = Math.min(64, (imgW * s.h) / s.w);
      }
    }
    doc.setFontSize(9.5);
    const text = doc.splitTextToSize(readingLines(r).join('\n'), W - 2 * M - imgW - 6) as string[];
    const blockH = Math.max(imgH, 6 + text.length * 4.3) + 6;
    if (y + blockH > 297 - M) {
      doc.addPage();
      y = M;
    }
    if (dataURL) doc.addImage(dataURL, 'JPEG', M, y, imgW, imgH);
    const tx = M + (dataURL ? imgW + 6 : 0);
    doc.setTextColor(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${i + 1}. ${new Date(r.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, tx, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(50);
    doc.text(text, tx, y + 10);
    y += blockH;
    doc.setDrawColor(230);
    doc.line(M, y - 3, W - M, y - 3);
  }
  return doc.output('blob');
}

export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch {
      /* cancelled → fall through to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function shareTextOrCopy(text: string): Promise<'shared' | 'copied'> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch {
      /* fall through */
    }
  }
  await navigator.clipboard?.writeText(text);
  return 'copied';
}
