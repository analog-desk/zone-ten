import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { fmtStops } from '../engine';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Sheet({ open, onClose, title, children, full }: { open: boolean; onClose: () => void; title: string; children: ReactNode; full?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose} role="presentation">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cx('safe-bottom flex w-full max-w-xl flex-col rounded-t-2xl border border-line bg-surface outline-none', full ? 'h-[94vh]' : 'max-h-[88vh]')}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="mr-auto font-display text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="flex size-9 items-center justify-center rounded-full bg-raise" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  small,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
  small?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-[10px] font-semibold transition-colors disabled:opacity-35',
            small ? 'min-h-8 px-2 text-xs' : 'min-h-10 px-2 text-sm',
            o.value === value ? 'bg-accent text-accent-ink' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, children, onClick, title }: { on?: boolean; children: ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cx('min-h-9 shrink-0 rounded-full border px-3 text-sm font-medium', on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-raise text-fg')}
    >
      {children}
    </button>
  );
}

export function Button({
  children,
  onClick,
  kind = 'secondary',
  disabled,
  className,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold disabled:opacity-40',
        kind === 'primary' && 'bg-accent text-accent-ink',
        kind === 'secondary' && 'border border-line bg-raise text-fg',
        kind === 'danger' && 'border border-critical/40 bg-critical/10 text-critical',
        kind === 'ghost' && 'text-muted',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-line bg-surface p-4', className)}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">{children}</div>;
}

export function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <span className={cx('text-right font-medium tnum', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-caution', tone === 'bad' && 'text-critical')}>{value}</span>
    </div>
  );
}

export function ErrorBadge({ stops }: { stops: number }) {
  const sig = Math.abs(stops) >= 0.17;
  const big = Math.abs(stops) > 0.5;
  return (
    <span
      className={cx(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tnum',
        !sig && 'bg-raise text-muted',
        sig && !big && 'bg-accent text-accent-ink',
        big && 'bg-critical text-black',
      )}
    >
      {Math.abs(stops) < 0.05 ? 'exact' : fmtStops(stops)}
    </span>
  );
}

export function Stepper({ value, onChange, step, min, max, format }: { value: number; onChange: (v: number) => void; step: number; min: number; max: number; format: (v: number) => string }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step));
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="size-10 rounded-xl border border-line bg-raise text-lg" onClick={() => onChange(clamp(value - step))} aria-label="Decrease">
        −
      </button>
      <span className="min-w-16 text-center font-display text-lg font-semibold tnum">{format(value)}</span>
      <button type="button" className="size-10 rounded-xl border border-line bg-raise text-lg" onClick={() => onChange(clamp(value + step))} aria-label="Increase">
        +
      </button>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block py-1.5">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-dim">{hint}</span>}
    </label>
  );
}

export const inputClass = 'min-h-11 w-full rounded-xl border border-line bg-raise px-3 text-fg placeholder:text-dim';

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-center gap-3 py-2">
      <span className="mr-auto">
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-dim">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
    </label>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad'; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-xl border px-3 py-2 text-sm',
        tone === 'info' && 'border-line bg-raise text-muted',
        tone === 'warn' && 'border-caution/40 bg-caution/10 text-caution',
        tone === 'bad' && 'border-critical/40 bg-critical/10 text-critical',
      )}
    >
      {children}
    </div>
  );
}

export function vibrate(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
