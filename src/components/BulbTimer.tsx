import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { fmtTime } from '../engine';
import { Button, Stepper, vibrate } from './ui';

function beep(freq = 880, ms = 180) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000);
    o.onended = () => ctx.close();
  } catch {
    /* audio unavailable */
  }
}

/** Countdown for Bulb exposures: beeps each of the last 3 s and at the end, keeps the screen awake. */
export function BulbTimer({ initialSeconds }: { initialSeconds: number }) {
  const [total, setTotal] = useState(Math.max(1, Math.round(initialSeconds)));
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!running) setLeft(total);
  }, [total, running]);

  useEffect(() => {
    if (!running) return;
    let lastWhole = Math.ceil(left);
    const id = window.setInterval(() => {
      const remaining = Math.max(0, (endAt.current - performance.now()) / 1000);
      setLeft(remaining);
      const whole = Math.ceil(remaining);
      if (whole !== lastWhole && whole <= 3 && whole > 0) beep(660, 90);
      lastWhole = whole;
      if (remaining <= 0) {
        beep(990, 450);
        vibrate(400);
        setRunning(false);
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    if (running) {
      (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock
        ?.request('screen')
        .then((w) => (wake.current = w))
        .catch(() => undefined);
    } else {
      wake.current?.release().catch(() => undefined);
      wake.current = null;
    }
  }, [running]);

  const pct = total > 0 ? 1 - left / total : 0;
  return (
    <div className="space-y-4 text-center">
      <div className="relative mx-auto size-56">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx={50} cy={50} r={45} fill="none" stroke="var(--color-line)" strokeWidth={4} />
          <circle cx={50} cy={50} r={45} fill="none" stroke="var(--color-accent)" strokeWidth={4} strokeDasharray={`${pct * 282.7} 282.7`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-display text-5xl font-semibold tnum">{left >= 60 ? fmtTime(Math.ceil(left)) : Math.ceil(left)}</div>
          <div className="text-sm text-dim">{running ? 'exposing' : `of ${fmtTime(total)}`}</div>
        </div>
      </div>
      {!running && (
        <div className="flex justify-center">
          <Stepper value={total} onChange={setTotal} step={total >= 120 ? 10 : 1} min={1} max={7200} format={(v) => fmtTime(v)} />
        </div>
      )}
      <div className="flex gap-2">
        <Button
          kind="primary"
          className="flex-1"
          onClick={() => {
            if (running) setRunning(false);
            else {
              endAt.current = performance.now() + left * 1000;
              beep(880, 120);
              setRunning(true);
            }
          }}
        >
          {running ? <Pause size={18} /> : <Play size={18} />}
          {running ? 'Pause' : left < total ? 'Resume' : 'Start'}
        </Button>
        <Button
          onClick={() => {
            setRunning(false);
            setLeft(total);
          }}
        >
          <RotateCcw size={18} />
        </Button>
      </div>
      <p className="text-xs text-dim">Open the shutter on B as you press Start; close it at the final tone.</p>
    </div>
  );
}
