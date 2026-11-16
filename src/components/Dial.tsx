import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Lock, LockOpen } from 'lucide-react';
import { ErrorBadge, cx, vibrate } from './ui';

/** One exposure dial: big value, lock, step buttons, horizontal swipe. Turning a dial locks it. */
export function Dial({
  label,
  value,
  locked,
  solved,
  sub,
  error,
  onLock,
  onStep,
  disabledLock,
}: {
  label: string;
  value: string;
  locked: boolean;
  solved: boolean;
  sub?: string;
  error?: number;
  onLock: () => void;
  onStep: (d: number) => void;
  disabledLock?: boolean;
}) {
  const start = useRef<{ x: number; acc: number } | null>(null);
  return (
    <div
      className={cx('flex min-w-0 flex-1 flex-col items-center rounded-2xl border px-1 pb-2 pt-1.5 touch-pan-y select-none', locked ? 'border-line-strong bg-raise' : 'border-line bg-surface')}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, acc: 0 };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        const steps = Math.trunc(dx / 28);
        if (steps !== start.current.acc) {
          onStep(steps - start.current.acc);
          start.current.acc = steps;
          vibrate(5);
        }
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
    >
      <div className="flex w-full items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">{label}</span>
        <button
          type="button"
          onClick={onLock}
          disabled={disabledLock}
          className={cx('flex size-7 items-center justify-center rounded-full disabled:opacity-30', locked ? 'text-accent' : 'text-dim')}
          aria-label={`${label} ${locked ? 'locked — tap to let the meter choose' : 'chosen by the meter — tap to lock'}`}
          aria-pressed={locked}
        >
          {locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
      </div>
      <div className={cx('font-display text-[30px] font-semibold leading-none tnum', solved ? 'text-accent' : 'text-fg')} aria-live="polite">
        {value}
      </div>
      <div className="mt-1 flex h-5 items-center gap-1 text-[11px] text-dim">
        {sub && <span className="truncate tnum">{sub}</span>}
        {error !== undefined && <ErrorBadge stops={error} />}
      </div>
      <div className="mt-1 flex w-full justify-between">
        <button type="button" onClick={() => onStep(-1)} className="flex size-9 items-center justify-center rounded-full bg-bg/60" aria-label={`${label} down`}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" onClick={() => onStep(1)} className="flex size-9 items-center justify-center rounded-full bg-bg/60" aria-label={`${label} up`}>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
